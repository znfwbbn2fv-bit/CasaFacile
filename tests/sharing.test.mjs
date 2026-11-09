import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';

const app=readFileSync('app.js','utf8');
const css=readFileSync('styles.css','utf8');
const html=readFileSync('index.html','utf8');
const sw=readFileSync('sw.js','utf8');

const start=app.indexOf('function sharingSnapshot(){');
const end=app.indexOf('  function renderDashboard(){',start);
assert.ok(start>=0&&end>start,'sharing rendering functions located');
const members=[
  {id:'owner',name:'Io',isOwner:true,color:'#eee6fc'},
  {id:'guest',name:'Giulia',isOwner:false,color:'#e5f4ed'}
];
const context={
  db:{members},ico:()=>'<svg></svg>',
  esc:v=>String(v).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'),
  header:(title,subtitle)=>'<h2>'+title+'</h2><p>'+subtitle+'</p>'
};
vm.runInNewContext(app.slice(start,end)+'\nglobalThis.sharingTest={sharingSnapshot,renderSharingDashboardCard,renderSharing};',context);
const {sharingSnapshot,renderSharingDashboardCard,renderSharing}=context.sharingTest;

test('il riquadro non presenta i membri locali come accessi connessi',()=>{
  const counts=sharingSnapshot();
  assert.equal(counts.connected,0);
  assert.equal(counts.configured,2);
  assert.equal(counts.additional,1);
});
test('riquadro dashboard cliccabile e con conteggi distinti',()=>{
  const out=renderSharingDashboardCard();
  assert.match(out,/data-action="nav" data-page="sharing"/);
  assert.match(out,/0.*Accessi condivisi/s);
  assert.match(out,/2.*Persone configurate localmente/s);
  assert.match(out,/condivisione tra dispositivi non è ancora attiva/);
});
test('pagina dettaglio elenca i profili ma non li dichiara collegati',()=>{
  const out=renderSharing();
  assert.match(out,/Giulia/);
  assert.match(out,/Io/);
  assert.match(out,/Solo locale/);
  assert.match(out,/nessuno ha un accesso condiviso/);
  assert.match(out,/non hanno accesso autonomo/);
  assert.match(out,/data-page="people"/);
});
test('protezione output per nomi da campo libero',()=>{
  context.db.members.push({id:'strange',name:'<img src=x>',isOwner:false});
  assert.match(renderSharing(),/&lt;img src=x&gt;/);
  assert.doesNotMatch(renderSharing(),/<img src=x>/);
});
test('famiglia visibile nella navigazione mobile e schermata condivisione raggiungibile',()=>{
  assert.match(app,/const MOBILE_NAV = \['dashboard','tasks','calendar','rooms','people','sharing','settings'\]/);
  assert.match(app,/\['sharing','Condivisioni','users'\]/);
  assert.match(html,/id="top-sharing"/);
  assert.match(html,/data-action="nav" data-page="sharing"/);
  assert.match(html,/id="top-sharing-count"/);
  assert.ok(app.includes("el('top-sharing-count').textContent=shared===null?'–':String(shared)"));
  assert.match(app,/key==='sharing'\?'Condivisi':label/);

  assert.match(app,/case'sharing':html=renderSharing\(\)/);
  assert.match(css,/\.sharing-dashboard-card\{/);
  assert.match(css,/\.mobile-nav a\{min-width:0;flex:1 1 0/);
  assert.match(app,/const VERSION = '1\.4\.0-beta'/);
  assert.match(app,/const STORAGE_KEY = 'casafacile\.v1\.database'/);
  assert.match(app,/schemaVersion:1/);
  assert.match(html,/app\.js\?v=1\.4\.0-beta/);
  assert.match(html,/styles\.css\?v=1\.4\.0-beta/);
  assert.match(sw,/casafacile-static-1\.4\.0-beta/);
});
