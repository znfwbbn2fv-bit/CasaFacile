import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';
const app=readFileSync('app.js','utf8');
const html=readFileSync('index.html','utf8');
const sw=readFileSync('sw.js','utf8');
const start=app.indexOf('  /* CasaFacile 1.1 — catalogo');
const end=app.indexOf('  function demo(){',start);
assert.ok(start>0 && end>start,'Il catalogo deve essere caricato.');
const sandbox={
  TODAY:()=> '2026-11-09',
  dUTC:(s)=>{const [y,m,d]=s.split('-').map(Number);return new Date(Date.UTC(y,m-1,d));},
  plusDays:(s,n)=>{const d=new Date(s+'T00:00:00Z');d.setUTCDate(d.getUTCDate()+n);return d.toISOString().slice(0,10);},
  plusMonths:(s,n,day)=>{const d=new Date(s+'T00:00:00Z');const f=new Date(Date.UTC(d.getUTCFullYear(),d.getUTCMonth()+n,1));const cap=new Date(Date.UTC(f.getUTCFullYear(),f.getUTCMonth()+1,0)).getUTCDate();f.setUTCDate(Math.min(day,cap));return f.toISOString().slice(0,10);}
};
vm.runInNewContext(app.slice(start,end)+'\n globalThis.routines={groups:ROUTINE_GROUPS,catalog:ROUTINE_CATALOG,due:routineFirstDue};',sandbox);
const {groups,catalog,due}=sandbox.routines;
test('catalogo completo e privo di ID ripetuti',()=>{
 assert.equal(groups.length,4);
 assert.equal(catalog.length,24);
 assert.equal(new Set(catalog.map(x=>x.id)).size,24);
 assert.equal(catalog.filter(x=>x.group==='daily').length,6);
 assert.equal(catalog.filter(x=>x.group==='weekly').length,8);
 assert.equal(catalog.filter(x=>x.group==='monthly').length,6);
 assert.equal(catalog.filter(x=>x.group==='quarterly').length,4);
});
test('ricorrenze e scadenze iniziali coerenti',()=>{
 assert.equal(due(catalog.find(x=>x.id==='daily-dishes')),'2026-11-09');
 assert.equal(due(catalog.find(x=>x.id==='weekly-vacuum')),'2026-11-10');
 assert.equal(due(catalog.find(x=>x.id==='monthly-windows')),'2026-11-15');
 assert.equal(due(catalog.find(x=>x.id==='monthly-bins')),'2026-12-05');
 const quarterly=catalog.find(x=>x.id==='quarterly-curtains');
 assert.equal(quarterly.freq,'monthly');assert.equal(quarterly.interval,3);
});
test('archivio locale invariato e risorse versionate',()=>{
 assert.match(app,/const STORAGE_KEY = 'casafacile\.v1\.database'/);
 assert.match(app,/schemaVersion:1/);
 assert.match(app,/const VERSION = '1\.2\.0'/);
 assert.match(html,/styles\.css\?v=1\.2\.0/);
 assert.match(html,/app\.js\?v=1\.2\.0/);
 assert.match(sw,/casafacile-static-1\.2\.0/);
 assert.match(app,/routineAlreadyExists\(p\)/);
 assert.match(app,/repository\.save\(copy\)/);
});
