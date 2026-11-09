/* CasaFacile Cloudflare 1.4.0-beta client.
 * All requests stay on the same origin as the Cloudflare Access-protected PWA.
 * Cloudflare Access handles email OTP externally; this client never stores passwords. */
(()=>{
'use strict';
const settings=window.CasaFacileCloudConfig||{};
const ready=settings.provider==='cloudflare'&&settings.enabled===true&&
  location.protocol==='https:'&&!location.hostname.endsWith('.github.io');
let pendingInvite=null;
try{
  const hash=location.hash.slice(1);
  const match=/^sharing\?invite=([a-f0-9]{64})$/i.exec(hash);
  if(match){
    pendingInvite=match[1].toLowerCase();
    history.replaceState(history.state,'',location.pathname+location.search+'#sharing');
  }
}catch(e){console.warn('Invito non disponibile',e);}
async function api(path,{method='GET',payload}={}){
  if(!ready)throw Error('Condivisione Cloudflare non configurata.');
  const options={method,credentials:'same-origin',cache:'no-store',
    headers:{accept:'application/json'}};
  if(payload!==undefined){options.headers['content-type']='application/json';options.body=JSON.stringify(payload);}
  let response;
  try{response=await fetch('/api/'+path.replace(/^\/+/,''),options);}
  catch{throw new Error('Cloud offline o rete non disponibile. I dati locali sono conservati.');}
  let result;
  try{result=await response.json();}
  catch{throw new Error('Sessione Cloudflare Access da verificare. Riapri la pagina e accedi.');}
  if(!response.ok)throw new Error(result?.error||('Errore cloud '+response.status));
  return result;
}
const available=()=>ready;
async function user(){return (await api('session')).user||null;}
async function sendOtp(){throw new Error('L’accesso tramite codice email è gestito da Cloudflare Access alla prima apertura della pagina protetta.');}
async function verifyOtp(){throw new Error('Verifica il codice di Cloudflare Access nella sua schermata dedicata.');}
async function logout(){
  // Actual Access logout is performed by navigating to the Access endpoint.
  location.assign('/cdn-cgi/access/logout');
}
async function households(){return (await api('homes')).households||[];}
async function getHousehold(id){return api('homes/'+encodeURIComponent(id));}
async function createHousehold(snapshot){return api('homes',{method:'POST',payload:{snapshot}});}
async function updateHousehold(id,revision,snapshot){
  const result=await api('homes/'+encodeURIComponent(id),{method:'PATCH',payload:{expectedRevision:revision,snapshot}});
  return result.revision;
}
async function createInvitation(id,email,role){
  return api('homes/'+encodeURIComponent(id)+'/invitations',{method:'POST',payload:{email,role}});
}
async function acceptInvitation(token){
  return (await api('invitations/accept',{method:'POST',payload:{token}})).household_id;
}
async function removeMember(id,email){
  return (await api('homes/'+encodeURIComponent(id)+'/members/'+encodeURIComponent(email),{method:'DELETE'})).removed;
}
async function leaveHousehold(id){
  return (await api('homes/'+encodeURIComponent(id)+'/leave',{method:'POST'})).removed;
}
async function listInvitations(id){
  return (await api('homes/'+encodeURIComponent(id)+'/invitations')).invitations||[];
}
async function revokeInvitation(id){
  // Invitations are uniquely identified across households; client must know current household.
  throw new Error('Usa revokeInvitationForHousehold con l’identificativo della famiglia.');
}
async function revokeInvitationForHousehold(householdId,invitationId){
  return (await api('homes/'+encodeURIComponent(householdId)+'/invitations/'+encodeURIComponent(invitationId),{method:'DELETE'})).revoked;
}
async function listBackups(id){return (await api('homes/'+encodeURIComponent(id)+'/backups')).backups||[];}
async function downloadBackup(id,backupId){
  const response=await fetch('/api/homes/'+encodeURIComponent(id)+'/backups/'+encodeURIComponent(backupId),{
    credentials:'same-origin',cache:'no-store'});
  if(!response.ok||response.redirected||!response.headers.get('content-type')?.includes('application/json'))
    throw new Error('Download del backup non riuscito o sessione Access scaduta');
  const expected=response.headers.get('x-backup-sha256');
  if(!expected||!/^[0-9a-f]{64}$/.test(expected))
    throw new Error('Il server non ha fornito una verifica di integrità del backup');
  const data=await response.blob();
  const bytes=await data.arrayBuffer();
  const digest=await crypto.subtle.digest('SHA-256',bytes);
  const actual=[...new Uint8Array(digest)].map(x=>x.toString(16).padStart(2,'0')).join('');
  if(actual!==expected)throw new Error('Integrità del backup non verificata: download annullato');
  const parsed=JSON.parse(await data.text());
  if(parsed.format!=='CasaFacile-Backup'||parsed.hashAlgorithm!=='SHA-256'||!parsed.payload)
    throw new Error('Formato di backup CasaFacile non valido');
  const url=URL.createObjectURL(data),a=document.createElement('a');
  a.href=url;a.download='CasaFacile_cloud_backup.json';
  document.body.appendChild(a);a.click();a.remove();
  setTimeout(()=>URL.revokeObjectURL(url),30000);
}
async function restoreBackup(id,backupId,expectedRevision){
  const result=await api('homes/'+encodeURIComponent(id)+'/backups/restore',{method:'POST',
    payload:{backupId,expectedRevision}});
  return result.revision;
}
function takeInvite(){const token=pendingInvite;pendingInvite=null;return token;}
function hasInvite(){return pendingInvite!==null;}
window.CasaFacileCloud={available,user,sendOtp,verifyOtp,logout,households,getHousehold,
  createHousehold,updateHousehold,createInvitation,acceptInvitation,removeMember,leaveHousehold,
  listInvitations,revokeInvitation,revokeInvitationForHousehold,
  listBackups,downloadBackup,restoreBackup,takeInvite,hasInvite,
  configuration:{ready,provider:'cloudflare'}};
})();