import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';

const app=readFileSync('app.js','utf8');
const clientSource=readFileSync('cloud-client.js','utf8');
const sw=readFileSync('sw.js','utf8');
const html=readFileSync('index.html','utf8');
const sql=readFileSync('supabase/migrations/20261109000000_casafacile_sharing.sql','utf8');

test('la condivisione rimane spenta quando il backend non è configurato',()=>{
  const context={window:{CasaFacileCloudConfig:{url:'',publishableKey:''}},
    URL,location:{href:'https://example.com/CasaFacile/#sharing'},
    history:{replaceState(){throw new Error('Nessun invito presente');},state:null},
    console};
  vm.runInNewContext(clientSource,context);
  assert.equal(context.window.CasaFacileCloud.available(),false);
  assert.equal(context.window.CasaFacileCloud.takeInvite(),null);
});
test('l’invito viene acquisito e rimosso immediatamente dalla URL',()=>{
  const token='a'.repeat(64);
  let sanitized='';
  const context={window:{CasaFacileCloudConfig:{url:'',publishableKey:''}},
    URL,location:{href:'https://example.com/CasaFacile/?invite='+token+'#sharing'},
    history:{replaceState:(_,__,value)=>{sanitized=value;},state:null},console};
  vm.runInNewContext(clientSource,context);
  assert.equal(context.window.CasaFacileCloud.hasInvite(),true);
  assert.equal(context.window.CasaFacileCloud.takeInvite(),token);
  assert.equal(context.window.CasaFacileCloud.hasInvite(),false);
  assert.equal(sanitized,'/CasaFacile/#sharing');
});
test('il repository cloud è separato dalla casa personale',()=>{
  assert.match(app,/const STORAGE_KEY = 'casafacile\.v1\.database'/);
  assert.match(app,/const CLOUD_MODE_KEY='casafacile\.v1\.cloud\.mode'/);
  assert.match(app,/const CLOUD_CACHE_PREFIX='casafacile\.v1\.cloud\.snapshot\.'/);
  assert.match(app,/localStorage\.setItem\(sharedKey\(cloudMode\.id\),JSON\.stringify\(data\)\)/);
  assert.match(app,/localStorage\.setItem\(STORAGE_KEY,JSON\.stringify\(data\)\)/);
  assert.match(app,/cloudMode\.dirty=true/);
  assert.match(app,/if\(cloudMode\?\.dirty\)/);
});
test('client senza segreti ed SDK fissato a versione esplicita',()=>{
  assert.match(clientSource,/2\.119\.0/);
  assert.doesNotMatch(clientSource,/service_role|sb_secret_/);
  assert.match(clientSource,/createClient\(base,key,/);
  assert.match(clientSource,/sendOtp/);
  assert.match(clientSource,/verifyOtp/);
  assert.match(clientSource,/cf_accept_invitation/);
  assert.match(clientSource,/cf_update_household/);
});
test('RLS, privilegi, inviti e compare-and-swap previsti in SQL',()=>{
  for(const name of ['cf_households','cf_household_members','cf_invitations']){
    assert.ok(sql.includes('alter table public.'+name+' enable row level security;'));
  }
  assert.match(sql,/revoke all on public\.cf_households, public\.cf_household_members, public\.cf_invitations from public, anon, authenticated/);
  assert.match(sql,/p_expected_revision bigint/);
  assert.match(sql,/h\.revision=p_expected_revision/);
  assert.match(sql,/raise exception 'REVISION_CONFLICT'/);
  assert.match(sql,/v_inv\.invited_email<>v_email/);
  assert.match(sql,/v_inv\.accepted_at is not null/);
  assert.match(sql,/v_inv\.expires_at<=now\(\)/);
  assert.match(sql,/i\.revoked_at is null/);
  assert.match(sql,/v_role='viewer'/);
  assert.match(sql,/grant execute on function public\.cf_create_invitation\(uuid,text,text\) to authenticated/);
});
test('gli asset beta includono il servizio opzionale nell’app shell offline',()=>{
  for(const name of ['cloud-config.js','cloud-client.js']){
    assert.ok(html.includes(name+'?v=1.4.0-beta'));
    assert.ok(sw.includes(name+'?v=1.4.0-beta'));
  }
  assert.match(app,/const VERSION = '1\.4\.0-beta'/);
});

function syncContext(remote,opts={}){
  const begin=app.indexOf('async function cloudSync(){');
  const end=app.indexOf('  function cloudSwitchPersonal(){',begin);
  assert.ok(begin>=0&&end>begin);
  const snapshot={app:'CasaFacile',schemaVersion:1,household:{name:'Casa'},members:[{id:'a'}],rooms:[],chores:[],history:[],settings:{}};
  let serverWrites=0;
  const ctx={
    cloudMode:{id:'house-1',revision:1,role:'editor',dirty:true,conflict:false},
    cloudService:{
      getHousehold:async()=>({...remote,snapshot,role:'editor',members:[]}),
      updateHousehold:async()=>{serverWrites++;return 2;}
    },
    cloudAvailable:()=>true,cloudSyncing:false,cloudUser:{id:'user-1'},
    navigator:{onLine:true},validDB:()=>true,
    cloudTeam:[],cloudError:'',cloudLastSync:null,cloudMutations:0,
    readJson:()=>snapshot,sharedKey:()=> 'cloud-test',
    persistCloudMode:()=>{},cloudScheduleSync:()=>{},
    cloudUiUpdate:()=>{},localStorage:{setItem:()=>{}},
    db:snapshot,memberFilter:'all',memberById:()=>true,
    console
  };
  vm.runInNewContext(app.slice(begin,end)+'\n globalThis.syncTest=cloudSync;',ctx);
  return {ctx,writes:()=>serverWrites};
}
test('conflitto fra iPhone: il server non viene sovrascritto',async()=>{
  const {ctx,writes}=syncContext({revision:2});
  await ctx.syncTest();
  assert.equal(writes(),0);
  assert.equal(ctx.cloudMode.dirty,true);
  assert.equal(ctx.cloudMode.conflict,true);
  assert.match(ctx.cloudError,/Conflitto/);
});
test('CAS coerente: la revisione avanza e la coda si svuota',async()=>{
  const {ctx,writes}=syncContext({revision:1});
  await ctx.syncTest();
  assert.equal(writes(),1);
  assert.equal(ctx.cloudMode.revision,2);
  assert.equal(ctx.cloudMode.dirty,false);
  assert.equal(ctx.cloudMode.conflict,false);
  assert.equal(ctx.cloudError,'');
});
