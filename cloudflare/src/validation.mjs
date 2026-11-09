export const MAX_SNAPSHOT_BYTES=2*1024*1024;
export const MAX_INVITES=15;
export const MAX_MEMBERS=20;
export const MAX_HOMES_PER_USER=3;
export const MAX_BACKUPS_PER_HOME=100;

export function validEmail(email){
  if(typeof email!=='string')return null;
  const v=email.trim().toLowerCase();
  return v.length>=5 && v.length<=254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)?v:null;
}
export function validId(value){
  return typeof value==='string'&&/^[0-9a-f]{8}-[0-9a-f-]{27,36}$/i.test(value);
}
export function checkSnapshot(value){
  if(!value||typeof value!=='object'||Array.isArray(value))throw new Error('Archivio non valido');
  if(value.app!=='CasaFacile'||value.schemaVersion!==1)throw new Error('Formato CasaFacile non riconosciuto');
  if(!value.household||typeof value.household.id!=='string'||typeof value.household.name!=='string')
    throw new Error('Informazioni casa non valide');
  if(!Array.isArray(value.members)||value.members.length<1||value.members.length>100||
    !Array.isArray(value.rooms)||value.rooms.length>500||
    !Array.isArray(value.chores)||value.chores.length>20000||
    !Array.isArray(value.history)||value.history.length>100000||
    !value.settings||typeof value.settings!=='object')
    throw new Error('Struttura dati non valida');
  for(const t of value.chores){
    if(!t||typeof t.id!=='string'||typeof t.title!=='string'||typeof t.dueDate!=='string'||
      !/^\d{4}-\d{2}-\d{2}$/.test(t.dueDate)||
      !['none','daily','weekly','monthly'].includes(t.repeat?.freq))
      throw new Error('Attività non valida');
  }
  for(const h of value.history){
    if(!h||typeof h.id!=='string'||typeof h.taskId!=='string'||typeof h.completedAt!=='string')
      throw new Error('Storico non valido');
  }
  const string=JSON.stringify(value);
  if(new TextEncoder().encode(string).byteLength>MAX_SNAPSHOT_BYTES)
    throw new Error('Archivio superiore al limite di 2 MB');
  return string;
}
export function householdTitle(snapshot){
  const name=snapshot.household.name.trim();
  return (name||'La mia casa').slice(0,80);
}
export function revisionNumber(v){
  return Number.isSafeInteger(v)&&v>0&&v<=Number.MAX_SAFE_INTEGER-1;
}
export function roleAllowsWrite(role){return role==='owner'||role==='editor';}
export function freshInviteToken(bytes){
  if(!(bytes instanceof Uint8Array)||bytes.length!==32)throw new Error('Token non valido');
  return [...bytes].map(x=>x.toString(16).padStart(2,'0')).join('');
}
