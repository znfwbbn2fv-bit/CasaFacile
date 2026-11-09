import {verifyAccess} from './access.mjs';
import {MAX_SNAPSHOT_BYTES,MAX_INVITES,MAX_MEMBERS,MAX_HOMES_PER_USER,MAX_BACKUPS_PER_HOME,
  validEmail,validId,checkSnapshot,householdTitle,revisionNumber,roleAllowsWrite,freshInviteToken} from './validation.mjs';

const okHeaders={'content-type':'application/json; charset=utf-8','cache-control':'no-store',
  'x-content-type-options':'nosniff','referrer-policy':'no-referrer'};
class HttpError extends Error {
  constructor(status,message){super(message);this.status=status;}
}
const failure=(status,message)=>new HttpError(status,message);
const json=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:okHeaders});
const now=()=>new Date().toISOString();
const uuid=()=>crypto.randomUUID();
async function sha256(text){
  const bytes=typeof text==='string'?new TextEncoder().encode(text):text;
  const hash=await crypto.subtle.digest('SHA-256',bytes);
  return [...new Uint8Array(hash)].map(x=>x.toString(16).padStart(2,'0')).join('');
}
async function body(request){
  const type=request.headers.get('content-type')||'';
  if(!type.toLowerCase().startsWith('application/json'))throw failure(415,'Richiesta JSON richiesta');
  const len=Number(request.headers.get('content-length')||0);
  if(len>MAX_SNAPSHOT_BYTES+102400)throw failure(413,'Richiesta troppo grande');
  const raw=await request.text();
  if(new TextEncoder().encode(raw).byteLength>MAX_SNAPSHOT_BYTES+102400)
    throw failure(413,'Richiesta troppo grande');
  try{return JSON.parse(raw);}catch{throw failure(400,'JSON non valido');}
}
const count=(r)=>Number(r?.count||0);
const affected=(r)=>Number(r?.meta?.changes||0);
const safeSnapshot=(value)=>{
  try{return checkSnapshot(value);}catch(e){throw failure(400,e.message||'Archivio non valido');}
};
const homeId=(id)=>{if(!validId(id))throw failure(400,'Identificativo famiglia non valido');return id;};
async function member(db,house,email){
  const row=await db.prepare('SELECT role FROM household_members WHERE household_id=? AND email=?')
    .bind(house,email).first();
  if(!row)throw failure(404,'Famiglia non disponibile per questo account');
  return row.role;
}
async function owner(db,house,email){
  const role=await member(db,house,email);
  if(role!=='owner')throw failure(403,'Solo il proprietario può effettuare questa operazione');
}
async function listHomes(env,email){
  const rows=await env.DB.prepare(
    'SELECT h.id,h.name,h.revision,h.updated_at,h.owner_email AS owner_id,m.role FROM households h '
    +'JOIN household_members m ON h.id=m.household_id WHERE m.email=? ORDER BY h.updated_at DESC LIMIT 30')
    .bind(email).all();
  return json({households:rows.results||[]});
}
async function getHome(env,id,email){
  const role=await member(env.DB,id,email);
  const row=await env.DB.prepare(
    'SELECT id,name,revision,updated_at,owner_email AS owner_id,snapshot_json FROM households WHERE id=?')
    .bind(id).first();
  if(!row)throw failure(404,'Famiglia non trovata');
  const team=await env.DB.prepare(
    'SELECT email AS user_id,email,role,joined_at FROM household_members WHERE household_id=? ORDER BY joined_at,email')
    .bind(id).all();
  return json({id:row.id,name:row.name,revision:row.revision,updated_at:row.updated_at,
    owner_id:row.owner_id,snapshot:JSON.parse(row.snapshot_json),members:team.results||[],role});
}
const backupKey=(id,revision)=>'home/'+id+'/rev-'+revision+'/'+uuid()+'.json';
async function stageBackup(env,id,revision,snapshot,actor){
  const serialized=checkSnapshot(snapshot),digest=await sha256(serialized),key=backupKey(id,revision);
  try{
    await env.BACKUPS.put(key,serialized,{httpMetadata:{contentType:'application/json'},
      customMetadata:{revision:String(revision),digest,createdBy:actor}});
  }catch(e){console.error('R2 backup could not be stored',e);
    throw failure(503,'Backup cloud non disponibile: modifica non effettuata');}
  return {key,digest,bytes:new TextEncoder().encode(serialized).byteLength,serialized};
}
async function discardBackup(env,key){try{await env.BACKUPS.delete(key);}catch(e){console.warn('R2 orphan cleanup failed',e);}}
async function pruneBackups(env,id){
  try{
    const old=await env.DB.prepare(
      'SELECT id,r2_key FROM backups WHERE household_id=? ORDER BY revision DESC LIMIT 1000 OFFSET ?')
      .bind(id,MAX_BACKUPS_PER_HOME).all();
    for(const backup of old.results||[]){
      await env.BACKUPS.delete(backup.r2_key);
      await env.DB.prepare('DELETE FROM backups WHERE id=? AND household_id=?')
        .bind(backup.id,id).run();
    }
  }catch(e){console.warn('Backup retention cleanup deferred',e);}
}
async function createHome(env,email,input){
  const snapshot=input?.snapshot,serialized=safeSnapshot(snapshot);
  const total=await env.DB.prepare('SELECT count(*) AS count FROM households WHERE owner_email=?')
    .bind(email).first();
  if(count(total)>=MAX_HOMES_PER_USER)throw failure(409,'Limite famiglie create raggiunto');
  const id=uuid(),backup=await stageBackup(env,id,1,snapshot,email),stamp=now(),op=uuid();
  try{
    await env.DB.batch([
      env.DB.prepare('INSERT INTO households (id,name,snapshot_json,revision,owner_email,created_at,updated_at,backup_revision,last_operation_id) VALUES (?,?,?,?,?,?,?,?,?)')
        .bind(id,householdTitle(snapshot),serialized,1,email,stamp,stamp,1,op),
      env.DB.prepare("INSERT INTO household_members (household_id,email,role,joined_at) VALUES (?,?,'owner',?)")
        .bind(id,email,stamp),
      env.DB.prepare('INSERT INTO backups (id,household_id,revision,r2_key,created_at,created_by,bytes,sha256) VALUES (?,?,?,?,?,?,?,?)')
        .bind(uuid(),id,1,backup.key,stamp,email,backup.bytes,backup.digest),
      env.DB.prepare("INSERT INTO audit_events (id,household_id,actor_email,event,created_at) VALUES (?,?,?,'create',?)")
        .bind(uuid(),id,email,stamp)
    ]);
  }catch(e){await discardBackup(env,backup.key);throw e;}
  return json({household_id:id,revision:1},201);
}
async function writeRevision(env,id,email,expected,snapshot,event='update'){
  if(!revisionNumber(expected))throw failure(400,'Numero di revisione non valido');
  const serialized=safeSnapshot(snapshot),newRev=expected+1,op=uuid(),stamp=now();
  const backup=await stageBackup(env,id,newRev,snapshot,email);
  let result;
  try{
    result=await env.DB.batch([
      env.DB.prepare(
        'UPDATE households SET snapshot_json=?,name=?,revision=revision+1,updated_at=?,'
        +'backup_revision=?,last_operation_id=? WHERE id=? AND revision=?')
        .bind(serialized,householdTitle(snapshot),stamp,newRev,op,id,expected),
      env.DB.prepare(
        'INSERT INTO backups (id,household_id,revision,r2_key,created_at,created_by,bytes,sha256) '
        +'SELECT ?,id,revision,?,?,?,?,? FROM households WHERE id=? AND last_operation_id=?')
        .bind(uuid(),backup.key,stamp,email,backup.bytes,backup.digest,id,op),
      env.DB.prepare(
        'INSERT INTO audit_events (id,household_id,actor_email,event,created_at) '
        +'SELECT ?,id,?,?,? FROM households WHERE id=? AND last_operation_id=?')
        .bind(uuid(),email,event,stamp,id,op)
    ]);
  }catch(e){await discardBackup(env,backup.key);throw e;}
  if(affected(result[0])!==1){
    await discardBackup(env,backup.key);
    throw failure(409,'REVISION_CONFLICT: dati aggiornati da un altro dispositivo. Nessuna modifica sovrascritta.');
  }
  // Retention is best-effort; committed data and its new backup remain intact.
  await pruneBackups(env,id);
  return json({revision:newRev});
}
async function createInvite(env,id,email,payload){
  await owner(env.DB,id,email);
  const invitee=validEmail(payload?.email),role=payload?.role;
  if(!invitee)throw failure(400,'Indirizzo email non valido');
  if(!['editor','viewer'].includes(role))throw failure(400,'Ruolo non valido');
  if(invitee===email)throw failure(409,'Non puoi invitare te stesso');
  const existing=await env.DB.prepare(
    'SELECT email FROM household_members WHERE household_id=? AND email=?').bind(id,invitee).first();
  if(existing)throw failure(409,'Questa persona è già membro della famiglia');
  const pending=await env.DB.prepare(
    'SELECT count(*) AS count FROM invitations WHERE household_id=? AND revoked_at IS NULL AND accepted_at IS NULL AND expires_at>?')
    .bind(id,now()).first();
  if(count(pending)>=MAX_INVITES)throw failure(409,'Limite inviti attivi raggiunto');
  const random=new Uint8Array(32);crypto.getRandomValues(random);
  const token=freshInviteToken(random),digest=await sha256(token),expires=new Date(Date.now()+7*86400000).toISOString(),stamp=now();
  await env.DB.batch([
    env.DB.prepare('UPDATE invitations SET revoked_at=? WHERE household_id=? AND invited_email=? AND revoked_at IS NULL AND accepted_at IS NULL')
      .bind(stamp,id,invitee),
    env.DB.prepare(
      'INSERT INTO invitations (id,household_id,invited_email,role,token_hash,created_by,created_at,expires_at) VALUES (?,?,?,?,?,?,?,?)')
      .bind(uuid(),id,invitee,role,digest,email,stamp,expires),
    env.DB.prepare("INSERT INTO audit_events (id,household_id,actor_email,event,created_at,details) VALUES (?,?,?,'invite',?,?)")
      .bind(uuid(),id,email,stamp,invitee)
  ]);
  return json({invitation_token:token,expires_at:expires},201);
}
async function acceptInvite(env,email,payload){
  const token=payload?.token;
  if(typeof token!=='string'||!/^[a-f0-9]{64}$/.test(token))
    throw failure(400,'Invito non valido');
  const digest=await sha256(token);
  const invitation=await env.DB.prepare(
    'SELECT id,household_id,invited_email,role FROM invitations WHERE token_hash=? AND accepted_at IS NULL AND revoked_at IS NULL AND expires_at>?')
    .bind(digest,now()).first();
  if(!invitation||invitation.invited_email.toLowerCase()!==email)
    throw failure(403,'Invito scaduto, già utilizzato o destinato a un’altra email');
  const total=await env.DB.prepare('SELECT count(*) AS count FROM household_members WHERE household_id=?')
    .bind(invitation.household_id).first();
  if(count(total)>=MAX_MEMBERS)throw failure(409,'Limite persone autorizzate raggiunto');
  const stamp=now(),op=uuid();
  const results=await env.DB.batch([
    env.DB.prepare(
      'UPDATE invitations SET accepted_at=?,accepted_operation_id=? '
      +'WHERE id=? AND invited_email=? AND accepted_at IS NULL AND revoked_at IS NULL AND expires_at>?')
      .bind(stamp,op,invitation.id,email,stamp),
    env.DB.prepare(
      'INSERT OR IGNORE INTO household_members (household_id,email,role,joined_at) '
      +'SELECT household_id,invited_email,role,? FROM invitations WHERE id=? AND accepted_operation_id=?')
      .bind(stamp,invitation.id,op),
    env.DB.prepare(
      'INSERT INTO audit_events (id,household_id,actor_email,event,created_at) '
      +'SELECT ?,household_id,?,\'join\',? FROM invitations WHERE id=? AND accepted_operation_id=?')
      .bind(uuid(),email,stamp,invitation.id,op)
  ]);
  if(affected(results[0])!==1)throw failure(409,'Invito già utilizzato o revocato');
  return json({household_id:invitation.household_id});
}
async function listInvites(env,id,email){
  await owner(env.DB,id,email);
  const rows=await env.DB.prepare(
    'SELECT id,invited_email,role,expires_at FROM invitations '
    +'WHERE household_id=? AND accepted_at IS NULL AND revoked_at IS NULL AND expires_at>? '
    +'ORDER BY created_at DESC LIMIT 25').bind(id,now()).all();
  return json({invitations:rows.results||[]});
}
async function revokeInvite(env,id,email,inviteId){
  await owner(env.DB,id,email);
  if(!validId(inviteId))throw failure(400,'Invito non valido');
  const res=await env.DB.prepare(
    'UPDATE invitations SET revoked_at=? WHERE id=? AND household_id=? AND accepted_at IS NULL AND revoked_at IS NULL')
    .bind(now(),inviteId,id).run();
  if(affected(res)!==1)throw failure(404,'Invito non trovato');
  return json({revoked:true});
}
async function removeMember(env,id,email,other){
  await owner(env.DB,id,email);
  const target=validEmail(other);
  if(!target||target===email)throw failure(400,'Impossibile revocare questo profilo');
  const res=await env.DB.prepare(
    "DELETE FROM household_members WHERE household_id=? AND email=? AND role<>'owner'")
    .bind(id,target).run();
  if(affected(res)!==1)throw failure(404,'Membro non trovato');
  await env.DB.prepare(
    "INSERT INTO audit_events (id,household_id,actor_email,event,created_at,details) VALUES (?,?,?,'revoke',?,?)")
    .bind(uuid(),id,email,now(),target).run();
  return json({removed:true});
}
async function leaveHome(env,id,email){
  const role=await member(env.DB,id,email);
  if(role==='owner')throw failure(403,'Il proprietario non può abbandonare la propria famiglia');
  const res=await env.DB.prepare("DELETE FROM household_members WHERE household_id=? AND email=? AND role<>'owner'")
    .bind(id,email).run();
  return json({removed:affected(res)===1});
}
async function listBackups(env,id,email){
  await member(env.DB,id,email);
  const rows=await env.DB.prepare(
    'SELECT id,revision,created_at,created_by,bytes,sha256 FROM backups WHERE household_id=? '
    +'ORDER BY revision DESC LIMIT ?').bind(id,MAX_BACKUPS_PER_HOME).all();
  return json({backups:rows.results||[]});
}
async function readBackup(env,id,email,backupId){
  await member(env.DB,id,email);
  if(!validId(backupId))throw failure(400,'Backup non valido');
  const row=await env.DB.prepare('SELECT * FROM backups WHERE id=? AND household_id=?')
    .bind(backupId,id).first();
  if(!row)throw failure(404,'Backup non trovato');
  const object=await env.BACKUPS.get(row.r2_key);
  if(!object)throw failure(503,'Copia R2 non disponibile');
  const contents=await object.text();
  if(new TextEncoder().encode(contents).byteLength>MAX_SNAPSHOT_BYTES
    ||await sha256(contents)!==row.sha256)throw failure(503,'Integrità del backup non verificata');
  const snapshot=JSON.parse(contents);
  safeSnapshot(snapshot);
  return {row,snapshot,contents};
}
async function downloadBackup(env,id,email,backupId){
  const {row,contents}=await readBackup(env,id,email,backupId);
  const filename='CasaFacile_backup_revisione_'+row.revision+'.json';
  return new Response(contents,{headers:{
    ...okHeaders,'content-disposition':'attachment; filename="'+filename+'"',
    'x-backup-sha256':row.sha256
  }});
}
async function restoreBackup(env,id,email,payload){
  await owner(env.DB,id,email);
  const expected=payload?.expectedRevision;
  if(!revisionNumber(expected))throw failure(400,'Revisione non valida');
  const {snapshot}=await readBackup(env,id,email,payload?.backupId);
  return writeRevision(env,id,email,expected,snapshot,'restore');
}
async function api(request,env){
  if(!env.DB||!env.BACKUPS)throw failure(503,'Backend Cloudflare non configurato');
  const method=request.method,url=new URL(request.url),parts=url.pathname.split('/').filter(Boolean);
  const user=await verifyAccess(request,env),email=user.email;
  if(!['GET','POST','PATCH','DELETE'].includes(method))throw failure(405,'Metodo non consentito');
  if(method!=='GET'){
    // Reject cross-origin and originless mutations, even with a valid Access cookie.
    if(request.headers.get('origin')!==url.origin)throw failure(403,'Origine non consentita');
  }
  if(parts[1]==='session'&&method==='GET')return json({user:{id:email,email}});
  if(parts[1]==='homes'&&parts.length===2){
    if(method==='GET')return listHomes(env,email);
    if(method==='POST')return createHome(env,email,await body(request));
  }
  if(parts[1]==='invitations'&&parts[2]==='accept'&&method==='POST')
    return acceptInvite(env,email,await body(request));
  if(parts[1]!=='homes'||!parts[2])throw failure(404,'Endpoint inesistente');
  const id=homeId(parts[2]);
  if(parts.length===3){
    if(method==='GET')return getHome(env,id,email);
    if(method==='PATCH'){
      const role=await member(env.DB,id,email);
      if(!roleAllowsWrite(role))throw failure(403,'Non hai permessi di modifica');
      const p=await body(request);
      return writeRevision(env,id,email,p.expectedRevision,p.snapshot);
    }
  }
  if(parts[3]==='invitations'&&parts.length===4){
    if(method==='GET')return listInvites(env,id,email);
    if(method==='POST')return createInvite(env,id,email,await body(request));
  }
  if(parts[3]==='invitations'&&parts[4]&&parts.length===5&&method==='DELETE')
    return revokeInvite(env,id,email,parts[4]);
  if(parts[3]==='members'&&parts[4]&&parts.length===5&&method==='DELETE')
    return removeMember(env,id,email,decodeURIComponent(parts[4]));
  if(parts[3]==='leave'&&parts.length===4&&method==='POST')
    return leaveHome(env,id,email);
  if(parts[3]==='backups'){
    if(parts.length===4&&method==='GET')return listBackups(env,id,email);
    if(parts.length===5&&method==='GET')return downloadBackup(env,id,email,parts[4]);
    if(parts.length===5&&parts[4]==='restore'&&method==='POST')
      return restoreBackup(env,id,email,await body(request));
  }
  throw failure(404,'Endpoint inesistente');
}
export default {
  async fetch(request,env){
    const url=new URL(request.url);
    if(!url.pathname.startsWith('/api/')){
      if(!env.ASSETS)return new Response('Frontend beta non configurato',{status:503});
      return env.ASSETS.fetch(request);
    }
    try{return await api(request,env);}
    catch(e){
      if(e instanceof HttpError)return json({error:e.message},e.status);
      if(/invalid_token|missing_access_token|wrong_issuer|wrong_audience|expired|invalid_signature|not_yet_valid|unknown_signing_key|unsupported_token|Access team domain|Access audience|Email Access/.test(String(e?.message||'')))
        return json({error:'Autenticazione Cloudflare Access richiesta o non valida'},401);
      console.error('CasaFacile Worker API error',e);
      return json({error:'Errore del server. Nessun dato locale è stato cancellato.'},500);
    }
  }
};
