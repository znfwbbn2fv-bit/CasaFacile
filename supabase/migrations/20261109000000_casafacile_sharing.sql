-- CasaFacile 1.4.0 — schema Supabase PostgreSQL (installazione MANUALE)
-- Prima di eseguire: usare un progetto Supabase dedicato e verificare le politiche in staging.
-- Non eseguire mai nel browser, non distribuire chiavi secret/service_role.
begin;

create table if not exists public.cf_households (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete restrict,
  name text not null check(length(name) between 1 and 80),
  snapshot jsonb not null,
  revision bigint not null default 1 check(revision > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists cf_households_owner_idx on public.cf_households(owner_id);

create table if not exists public.cf_household_members (
  household_id uuid not null references public.cf_households(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  email text not null,
  role text not null check(role in ('owner','editor','viewer')),
  joined_at timestamptz not null default now(),
  primary key(household_id,user_id)
);
create index if not exists cf_members_user_idx on public.cf_household_members(user_id);

create table if not exists public.cf_invitations (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.cf_households(id) on delete cascade,
  invited_email text not null,
  role text not null check(role in ('editor','viewer')),
  token_hash text not null unique,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  accepted_at timestamptz,
  revoked_at timestamptz
);
create index if not exists cf_invites_house_idx on public.cf_invitations(household_id);

alter table public.cf_households enable row level security;
alter table public.cf_household_members enable row level security;
alter table public.cf_invitations enable row level security;

-- Grants espliciti: i browser non possono modificare le tabelle direttamente.
revoke all on public.cf_households, public.cf_household_members, public.cf_invitations from public, anon, authenticated;
grant select on public.cf_households, public.cf_household_members to authenticated;

create schema if not exists private;
revoke all on schema private from public, anon;
grant usage on schema private to authenticated;

create or replace function private.cf_is_member(p_household uuid)
returns boolean language sql stable security definer set search_path = ''
as $$
  select exists(
    select 1 from public.cf_household_members m
    where m.household_id = p_household and m.user_id = (select auth.uid())
  )
$$;
revoke all on function private.cf_is_member(uuid) from public, anon;
grant execute on function private.cf_is_member(uuid) to authenticated;

drop policy if exists cf_read_households on public.cf_households;
create policy cf_read_households on public.cf_households
for select to authenticated using(private.cf_is_member(id));

drop policy if exists cf_read_members on public.cf_household_members;
create policy cf_read_members on public.cf_household_members
for select to authenticated using(private.cf_is_member(household_id));

create or replace function private.cf_validate_snapshot(p_snapshot jsonb)
returns boolean language sql immutable set search_path = ''
as $$
 select p_snapshot is not null
   and jsonb_typeof(p_snapshot) = 'object'
   and p_snapshot->>'app' = 'CasaFacile'
   and p_snapshot->>'schemaVersion' = '1'
   and jsonb_typeof(p_snapshot->'household') = 'object'
   and jsonb_typeof(p_snapshot->'members') = 'array'
   and jsonb_typeof(p_snapshot->'rooms') = 'array'
   and jsonb_typeof(p_snapshot->'chores') = 'array'
   and jsonb_typeof(p_snapshot->'history') = 'array'
   and jsonb_typeof(p_snapshot->'settings') = 'object'
   and pg_column_size(p_snapshot) <= 10*1024*1024
$$;
revoke all on function private.cf_validate_snapshot(jsonb) from public, anon, authenticated;

-- RPC: Crea una nuova famiglia condivisa senza cancellare la casa locale.
create or replace function public.cf_create_household(p_snapshot jsonb)
returns table(household_id uuid, revision bigint)
language plpgsql security definer set search_path = ''
as $$
declare
 v_user uuid := auth.uid();
 v_name text;
 v_email text;
 v_id uuid;
begin
 if v_user is null then raise exception 'Accesso richiesto'; end if;
 if not private.cf_validate_snapshot(p_snapshot) then raise exception 'Archivio CasaFacile non valido'; end if;
 select u.email into v_email from auth.users u where u.id=v_user and u.email_confirmed_at is not null;
 if v_email is null then raise exception 'Email non verificata'; end if;
 v_name := left(coalesce(nullif(btrim(p_snapshot->'household'->>'name'),''),'La mia casa'),80);
 insert into public.cf_households(owner_id,name,snapshot)
 values(v_user,v_name,p_snapshot) returning id into v_id;
 insert into public.cf_household_members(household_id,user_id,email,role)
 values(v_id,v_user,lower(v_email),'owner');
 household_id:=v_id; revision:=1; return next;
end $$;

-- CAS: aggiorna solo se la revisione letta dal client è ancora corrente.
-- Un conflitto non sovrascrive le modifiche effettuate da un altro dispositivo.
create or replace function public.cf_update_household(
 p_household uuid, p_expected_revision bigint, p_snapshot jsonb)
returns bigint language plpgsql security definer set search_path = ''
as $$
declare v_role text; v_revision bigint; v_name text;
begin
 if auth.uid() is null then raise exception 'Accesso richiesto'; end if;
 select m.role into v_role from public.cf_household_members m
 where m.household_id=p_household and m.user_id=auth.uid();
 if v_role is null or v_role='viewer' then raise exception 'Non hai permessi di modifica'; end if;
 if not private.cf_validate_snapshot(p_snapshot) then raise exception 'Archivio CasaFacile non valido'; end if;
 v_name:=left(coalesce(nullif(btrim(p_snapshot->'household'->>'name'),''),'La mia casa'),80);
 update public.cf_households h
 set snapshot=p_snapshot, name=v_name, revision=h.revision+1, updated_at=now()
 where h.id=p_household and h.revision=p_expected_revision
 returning h.revision into v_revision;
 if v_revision is null then
   raise exception 'REVISION_CONFLICT' using errcode='P0001';
 end if;
 return v_revision;
end $$;

-- Inviti a scadenza: un token casuale monouso, conservato solo come hash.
-- L'invito è vincolato all'indirizzo email verificato dell'invitato.
create or replace function public.cf_create_invitation(
 p_household uuid, p_email text, p_role text default 'editor')
returns table(invitation_token text, expires_at timestamptz)
language plpgsql security definer set search_path = ''
as $$
declare v_user uuid := auth.uid(); v_owner uuid; v_email text; v_token text;
begin
 select h.owner_id into v_owner from public.cf_households h where h.id=p_household;
 if v_user is null or v_user is distinct from v_owner then
   raise exception 'Solo il proprietario può invitare'; end if;
 v_email:=lower(btrim(coalesce(p_email,'')));
 if length(v_email)>254 or length(v_email)<5 or v_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
 then raise exception 'Indirizzo email non valido'; end if;
 if p_role not in ('editor','viewer') then raise exception 'Ruolo non valido'; end if;
 if (select count(*) from public.cf_invitations i
      where i.household_id=p_household and i.accepted_at is null
        and i.revoked_at is null and i.expires_at>now())>=25
 then raise exception 'Limite inviti attivi raggiunto'; end if;
 if exists(select 1 from public.cf_household_members m
           where m.household_id=p_household and m.email=v_email)
 then raise exception 'Questa email fa già parte della famiglia'; end if;
 -- Revoca eventuali inviti precedenti allo stesso indirizzo.
 update public.cf_invitations i set revoked_at=now()
 where i.household_id=p_household and i.invited_email=v_email
   and i.accepted_at is null and i.revoked_at is null;
 v_token:=replace(gen_random_uuid()::text,'-','')||replace(gen_random_uuid()::text,'-','');
 invitation_token:=v_token;
 expires_at:=now()+interval '7 days';
 insert into public.cf_invitations
 (household_id,invited_email,role,token_hash,created_by,expires_at)
 values(p_household,v_email,p_role,encode(sha256(convert_to(v_token,'UTF8')),'hex'),v_user,expires_at);
 return next;
end $$;

create or replace function public.cf_accept_invitation(p_token text)
returns uuid language plpgsql security definer set search_path = ''
as $$
declare v_user uuid:=auth.uid(); v_email text; v_inv public.cf_invitations%rowtype;
begin
 if v_user is null then raise exception 'Prima effettua l’accesso'; end if;
 select lower(u.email) into v_email from auth.users u
 where u.id=v_user and u.email_confirmed_at is not null;
 if v_email is null then raise exception 'Email non verificata'; end if;
 if p_token is null or p_token !~ '^[0-9a-f]{64}$' then
   raise exception 'Invito non valido'; end if;
 select * into v_inv from public.cf_invitations i
 where i.token_hash=encode(sha256(convert_to(p_token,'UTF8')),'hex')
 for update;
 if not found or v_inv.accepted_at is not null or v_inv.revoked_at is not null
   or v_inv.expires_at<=now() or v_inv.invited_email<>v_email
 then raise exception 'Invito scaduto, già utilizzato o non destinato a questa email'; end if;
 insert into public.cf_household_members(household_id,user_id,email,role)
 values(v_inv.household_id,v_user,v_email,v_inv.role)
 on conflict (household_id,user_id) do nothing;
 update public.cf_invitations set accepted_at=now() where id=v_inv.id;
 return v_inv.household_id;
end $$;

-- Il proprietario può revocare gli accessi; non può rimuovere se stesso.
create or replace function public.cf_remove_member(p_household uuid,p_user uuid)
returns boolean language plpgsql security definer set search_path = ''
as $$
declare v_owner uuid; v_email text;
begin
 select h.owner_id into v_owner from public.cf_households h where h.id=p_household;
 if v_owner is null or v_owner is distinct from auth.uid() or p_user=v_owner
 then raise exception 'Operazione non consentita'; end if;
 select m.email into v_email from public.cf_household_members m
 where m.household_id=p_household and m.user_id=p_user;
 delete from public.cf_household_members m
 where m.household_id=p_household and m.user_id=p_user and m.role<>'owner';
 if v_email is not null then
   update public.cf_invitations i set revoked_at=now()
   where i.household_id=p_household and i.invited_email=v_email
     and i.accepted_at is null and i.revoked_at is null;
 end if;
 return found;
end $$;

create or replace function public.cf_leave_household(p_household uuid)
returns boolean language plpgsql security definer set search_path = ''
as $$
begin
 delete from public.cf_household_members m
 where m.household_id=p_household and m.user_id=auth.uid() and m.role<>'owner';
 return found;
end $$;

create or replace function public.cf_list_invitations(p_household uuid)
returns table(id uuid,invited_email text,role text,expires_at timestamptz)
language plpgsql security definer set search_path = ''
as $$
begin
 if not exists(select 1 from public.cf_households h
    where h.id=p_household and h.owner_id=auth.uid())
 then raise exception 'Operazione riservata al proprietario'; end if;
 return query
 select i.id,i.invited_email,i.role,i.expires_at from public.cf_invitations i
 where i.household_id=p_household and i.accepted_at is null
   and i.revoked_at is null and i.expires_at>now()
 order by i.created_at desc;
end $$;

create or replace function public.cf_revoke_invitation(p_invitation uuid)
returns boolean language plpgsql security definer set search_path = ''
as $$
begin
 update public.cf_invitations i set revoked_at=now()
 from public.cf_households h
 where i.id=p_invitation and i.household_id=h.id
 and h.owner_id=auth.uid() and i.accepted_at is null
 and i.revoked_at is null;
 return found;
end $$;

-- Esegue solo con sessione autenticata, mai con chiave pubblica senza JWT.
revoke all on function public.cf_create_household(jsonb) from public, anon;
revoke all on function public.cf_update_household(uuid,bigint,jsonb) from public, anon;
revoke all on function public.cf_create_invitation(uuid,text,text) from public, anon;
revoke all on function public.cf_accept_invitation(text) from public, anon;
revoke all on function public.cf_remove_member(uuid,uuid) from public, anon;
revoke all on function public.cf_leave_household(uuid) from public, anon;
revoke all on function public.cf_list_invitations(uuid) from public, anon;
revoke all on function public.cf_revoke_invitation(uuid) from public, anon;
grant execute on function public.cf_create_household(jsonb) to authenticated;
grant execute on function public.cf_update_household(uuid,bigint,jsonb) to authenticated;
grant execute on function public.cf_create_invitation(uuid,text,text) to authenticated;
grant execute on function public.cf_accept_invitation(text) to authenticated;
grant execute on function public.cf_remove_member(uuid,uuid) to authenticated;
grant execute on function public.cf_leave_household(uuid) to authenticated;
grant execute on function public.cf_list_invitations(uuid) to authenticated;
grant execute on function public.cf_revoke_invitation(uuid) to authenticated;

commit;
