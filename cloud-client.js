/* CasaFacile 1.4 — Cloud service (optional, not configured in production).
   Supabase publishable key ONLY. Never put a service_role/secret key here. */
(()=>{
'use strict';
const cfg=window.CasaFacileCloudConfig||{};
const valid=/^https:\/\/[a-z0-9-]+\.supabase\.co\/?$/i.test(String(cfg.url||''))
 && /^sb_publishable_[A-Za-z0-9_-]+$/.test(String(cfg.publishableKey||''));
const base=valid?String(cfg.url).replace(/\/+$/,''):null;
const key=valid?String(cfg.publishableKey):null;
let clientPromise=null;
let pendingInvite=null;
try{
  const url=new URL(location.href);
  const token=url.searchParams.get('invite');
  if(token&&/^[0-9a-f]{64}$/.test(token))pendingInvite=token;
  if(url.searchParams.has('invite')){
    url.searchParams.delete('invite');
    history.replaceState(history.state,'',url.pathname+url.search+url.hash);
  }
}catch(e){console.warn('Non è stato possibile pulire il link di invito',e);}
const sdkUrl='https://esm.sh/@supabase/supabase-js@2.119.0';
const first=(r)=>{
  if(r.error)throw new Error(r.error.message||'Richiesta cloud non riuscita');
  return r.data;
};
function available(){return !!valid;}
async function client(){
  if(!valid)throw new Error('Servizio condivisione non configurato.');
  if(!clientPromise)clientPromise=import(sdkUrl)
    .then(({createClient})=>createClient(base,key,{
      auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:false,storageKey:'casafacile.cloud.auth'}
    })).catch(e=>{clientPromise=null;throw e;});
  return clientPromise;
}
async function user(){
  const c=await client();
  const session=first(await c.auth.getSession()).session;
  if(!session)return null;
  return first(await c.auth.getUser()).user||null;
}
async function sendOtp(email){
  const c=await client();
  const value=String(email||'').trim().toLowerCase();
  if(!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(value)||value.length>254)throw new Error('Inserisci un’email valida.');
  first(await c.auth.signInWithOtp({email:value,options:{shouldCreateUser:true}}));
}
async function verifyOtp(email,token){
  const c=await client();
  const code=String(token||'').trim();
  if(!/^[0-9]{6,8}$/.test(code))throw new Error('Inserisci il codice ricevuto via email.');
  return first(await c.auth.verifyOtp({email:String(email).trim().toLowerCase(),token:code,type:'email'}));
}
async function logout(){const c=await client();first(await c.auth.signOut());}
async function households(){
  const c=await client();
  const groups=first(await c.from('cf_households')
    .select('id,name,revision,updated_at,owner_id').order('updated_at',{ascending:false}));
  if(!groups.length)return [];
  const mine=first(await c.from('cf_household_members')
    .select('household_id,user_id,role,email').in('household_id',groups.map(g=>g.id)));
  return groups.map(g=>({...g,role:mine.find(m=>m.household_id===g.id)?.role||'viewer'}));
}
async function getHousehold(id){
  const c=await client();
  const row=first(await c.from('cf_households')
    .select('id,name,revision,snapshot,updated_at,owner_id').eq('id',id).single());
  const members=first(await c.from('cf_household_members')
    .select('user_id,email,role,joined_at').eq('household_id',id)
    .order('joined_at',{ascending:true}));
  const me=(await user())?.id;
  return {...row,members,role:members.find(m=>m.user_id===me)?.role||null};
}
async function rpc(name,args){
  const c=await client();
  return first(await c.rpc(name,args));
}
async function createHousehold(snapshot){
  const rows=await rpc('cf_create_household',{p_snapshot:snapshot});
  return rows?.[0]||null;
}
async function updateHousehold(id,revision,snapshot){
  return rpc('cf_update_household',{p_household:id,p_expected_revision:revision,p_snapshot:snapshot});
}
async function createInvitation(id,email,role){
  const rows=await rpc('cf_create_invitation',{p_household:id,p_email:email,p_role:role});
  return rows?.[0]||null;
}
async function acceptInvitation(token){
  return rpc('cf_accept_invitation',{p_token:token});
}
async function removeMember(id,userId){
  return rpc('cf_remove_member',{p_household:id,p_user:userId});
}
async function leaveHousehold(id){
  return rpc('cf_leave_household',{p_household:id});
}
async function listInvitations(id){
  return rpc('cf_list_invitations',{p_household:id});
}
async function revokeInvitation(id){
  return rpc('cf_revoke_invitation',{p_invitation:id});
}
function takeInvite(){const token=pendingInvite;pendingInvite=null;return token;}
function hasInvite(){return Boolean(pendingInvite);}
window.CasaFacileCloud={
  available,client,user,sendOtp,verifyOtp,logout,
  households,getHousehold,createHousehold,updateHousehold,
  createInvitation,acceptInvitation,removeMember,leaveHousehold,
  listInvitations,revokeInvitation,takeInvite,hasInvite,
  configuration:{ready:valid}
};
})();