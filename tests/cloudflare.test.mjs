import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {webcrypto} from 'node:crypto';
import vm from 'node:vm';
import {checkSnapshot,MAX_SNAPSHOT_BYTES,roleAllowsWrite,freshInviteToken,validEmail} from '../cloudflare/src/validation.mjs';
import {verifyAccess,checkAccessClaims,normalizeTeamDomain} from '../cloudflare/src/access.mjs';

if(!globalThis.crypto)globalThis.crypto=webcrypto;

const snapshot=()=>{
  const today='2026-11-09';
  return {app:'CasaFacile',schemaVersion:1,
    household:{id:'abcd',name:'Casa test'},
    members:[{id:'owner',name:'Io',isOwner:true}],
    rooms:[],chores:[{id:'x',title:'Pulire',dueDate:today,repeat:{freq:'none'}}],
    history:[],settings:{displayName:'Test'},meta:{updatedAt:new Date().toISOString()}};
};
const app=readFileSync('app.js','utf8');
const sw=readFileSync('sw.js','utf8');
const client=readFileSync('cloud-client.js','utf8');
const worker=readFileSync('cloudflare/src/worker.mjs','utf8');
const sql=readFileSync('cloudflare/migrations/0001_initial.sql','utf8');
const config=readFileSync('cloudflare/wrangler.jsonc','utf8');
const html=readFileSync('index.html','utf8');

test('validazione archivio e limiti backend',()=>{
  const v=snapshot(),txt=checkSnapshot(v);
  assert.equal(JSON.parse(txt).chores.length,1);
  assert.throws(()=>checkSnapshot({...v,app:'Wrong'}));
  assert.throws(()=>checkSnapshot({...v,chores:[{...v.chores[0],repeat:{freq:'strange'}}]}));
  assert.throws(()=>checkSnapshot({...v,rooms:Array.from({length:501},()=>({}))}));
  assert.equal(roleAllowsWrite('owner'),true);
  assert.equal(roleAllowsWrite('editor'),true);
  assert.equal(roleAllowsWrite('viewer'),false);
  assert.equal(validEmail(' TEST@Example.it '),'test@example.it');
  assert.equal(validEmail('not an email'),null);
  assert.equal(freshInviteToken(new Uint8Array(32)).length,64);
  assert.throws(()=>freshInviteToken(new Uint8Array(16)));
  assert.equal(MAX_SNAPSHOT_BYTES,2*1024*1024);
});
test('Access JWT: audience, issuer, expiry, email rigorosi',()=>{
  const env={aud:'a'.repeat(64),iss:'https://family.cloudflareaccess.com'};
  const token={...env,email:'User@Example.it',exp:1999999999};
  assert.equal(checkAccessClaims(token,{...env,now:1700000000}),'user@example.it');
  assert.throws(()=>checkAccessClaims({...token,iss:'https://other.cloudflareaccess.com'},{...env,now:1700000000}));
  assert.throws(()=>checkAccessClaims({...token,aud:'b'.repeat(64)},{...env,now:1700000000}));
  assert.throws(()=>checkAccessClaims({...token,exp:100},{...env,now:1700000000}));
  assert.throws(()=>normalizeTeamDomain('evil.example.com'));
});

test('Access JWT: verifica crittografica reale e rifiuto dei token alterati',async()=>{
  const domain='family.cloudflareaccess.com',aud='a'.repeat(64);
  const kp=await webcrypto.subtle.generateKey({name:'RSASSA-PKCS1-v1_5',modulusLength:2048,
    publicExponent:new Uint8Array([1,0,1]),hash:'SHA-256'},true,['sign','verify']);
  const pub=await webcrypto.subtle.exportKey('jwk',kp.publicKey);
  const jwk={...pub,kid:'test-key',alg:'RS256',use:'sig'};
  const original=globalThis.fetch;
  let certificateRequests=0;
  globalThis.fetch=async(url)=>{certificateRequests++;assert.equal(url,'https://'+domain+'/cdn-cgi/access/certs');
    return {ok:true,json:async()=>({keys:[jwk]})};};
  try{
    const encoded=(x)=>Buffer.from(JSON.stringify(x)).toString('base64url');
    const header=encoded({alg:'RS256',typ:'JWT',kid:jwk.kid});
    const payload=encoded({iss:'https://'+domain,aud,email:'Family@Example.it',
      exp:Math.floor(Date.now()/1000)+3600});
    const data=header+'.'+payload;
    const signature=Buffer.from(await webcrypto.subtle.sign('RSASSA-PKCS1-v1_5',kp.privateKey,
      new TextEncoder().encode(data))).toString('base64url');
    const req=(token)=>new Request('https://example.it/api/session',
      {headers:{'cf-access-jwt-assertion':token}});
    const identity=await verifyAccess(req(data+'.'+signature),
      {ACCESS_TEAM_DOMAIN:domain,ACCESS_AUD:aud});
    assert.equal(identity.email,'family@example.it');
    assert.equal(certificateRequests,1);
    await assert.rejects(verifyAccess(req(header+'.'+encoded({iss:'https://'+domain,aud,
      email:'attacker@example.it',exp:Math.floor(Date.now()/1000)+3600})+'.'+signature),
      {ACCESS_TEAM_DOMAIN:domain,ACCESS_AUD:aud}),/invalid_signature/);
    await assert.rejects(verifyAccess(req(data+'.'+signature),
      {ACCESS_TEAM_DOMAIN:domain,ACCESS_AUD:'b'.repeat(64)}),/wrong_audience/);
  }finally{globalThis.fetch=original;}
});

test('Cloudflare: servizio client access sullo stesso dominio, nessun token in URL di rete',()=>{
  let sanitized='';
  const tok='f'.repeat(64);
  const ctx={
    window:{CasaFacileCloudConfig:{provider:'cloudflare',enabled:true}},
    location:{protocol:'https:',hostname:'beta.example.it',hash:'#sharing?invite='+tok,
      pathname:'/',search:'',origin:'https://beta.example.it'},
    history:{state:null,replaceState:(_a,_b,value)=>{sanitized=value;}},
    console
  };
  vm.runInNewContext(client,ctx);
  assert.equal(ctx.window.CasaFacileCloud.available(),true);
  assert.equal(ctx.window.CasaFacileCloud.takeInvite(),tok);
  assert.equal(sanitized,'/#sharing');
  assert.ok(!client.includes('supabase.co'));
  assert.ok(!client.includes('@supabase'));
  assert.match(client,/credentials:'same-origin'/);
  assert.match(client,/fetch\('\/api\/'/);
});

test('Worker: R2 backup precede aggiornamento D1 condizionale e blocco cross-origin',()=>{
  assert.match(worker,/await env\.BACKUPS\.put\(key,serialized/);
  assert.match(worker,/last_operation_id=\? WHERE id=\? AND revision=\?/);
  assert.match(worker,/if\(affected\(result\[0\]\)!==1\)/);
  assert.match(worker,/await discardBackup\(env,backup\.key\)/);
  assert.match(worker,/throw failure\(409,'REVISION_CONFLICT/);
  assert.match(worker,/request\.headers\.get\('origin'\)!==url\.origin/);
  assert.match(worker,/await verifyAccess\(request,env\)/);
  assert.match(worker,/if\(!roleAllowsWrite\(role\)\)/);
  assert.match(worker,/await owner\(env\.DB,id,email\)/);
  assert.match(worker,/expires_at>\?/);
  assert.match(worker,/sha256\(contents\)!==row\.sha256/);
  assert.match(worker,/getHome\(env,id,email\)/);
  assert.match(worker,/backupKey=\(/);
});
test('D1: membri, revisioni, token hash e backup R2 indicizzati',()=>{
  for(const name of ['households','household_members','invitations','backups','audit_events'])
    assert.match(sql,new RegExp('CREATE TABLE IF NOT EXISTS '+name));
  assert.match(sql,/token_hash TEXT NOT NULL UNIQUE/);
  assert.match(sql,/last_operation_id TEXT/);
  assert.match(sql,/accepted_operation_id TEXT/);
  assert.match(sql,/UNIQUE\(household_id,revision\)/);
  assert.match(config,/"workers_dev": false/);
  assert.match(config,/REPLACE_WITH_PROTECTED_BETA_HOSTNAME/);
  assert.match(config,/"binding": "DB"/);
  assert.match(config,/"binding": "BACKUPS"/);
});
test('PWA non mette le risposte dell’API privata in cache',()=>{
  assert.match(sw,/url\.pathname\.startsWith\('\/api\/'\)/);
  assert.match(sw,/!resp\.redirected/);
  assert.match(sw,/no-store/);
  assert.match(sw,/casafacile-static-1\.4\.0-beta/);
  assert.match(html,/cloud-client\.js\?v=1\.4\.0-beta/);
  assert.match(app,/const VERSION = '1\.4\.0-beta'/);
  assert.match(app,/const STORAGE_KEY = 'casafacile\.v1\.database'/);
});
