import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';

const js=readFileSync('app.js','utf8');
const html=readFileSync('index.html','utf8');
const sw=readFileSync('sw.js','utf8');
const start=js.indexOf('  /* CasaFacile 1.2 — metriche');
const end=js.indexOf('  /* CasaFacile 1.2 — fine calcoli, inizio componenti',start);
assert.ok(start>=0&&end>start,'Blocco metriche trovato');

function plusDays(s,n){const d=new Date(s+'T00:00:00Z');d.setUTCDate(d.getUTCDate()+n);return d.toISOString().slice(0,10);}
function prettyDate(s){return s;}
function dateKey(s){return new Date(s).toISOString().slice(0,10);}
const chores=[
  {id:'old',dueDate:'2026-11-08',done:false,priority:'low'},
  {id:'now',dueDate:'2026-11-09',done:false,priority:'high'},
  {id:'soon1',dueDate:'2026-11-10',done:false},
  {id:'soon2',dueDate:'2026-11-12',done:false},
  {id:'later',dueDate:'2026-11-13',done:false},
  {id:'completed',dueDate:'2026-11-05',done:true}
];
const db={history:[
  {completedAt:'2026-11-02T12:00:00Z',minutes:100,roomId:'k',roomName:'Cucina'},
  {completedAt:'2026-11-03T12:00:00Z',minutes:15,roomId:'k',roomName:'Cucina'},
  {completedAt:'2026-11-09T09:00:00Z',minutes:20,roomId:'b',roomName:'Bagno'},
  {completedAt:'2026-11-09T10:00:00Z',minutes:30,roomId:'k',roomName:'Cucina'},
  {completedAt:'2026-11-10T10:00:00Z',minutes:50,roomId:'b',roomName:'Bagno'}
],chores};
const ctx={db,plusDays,prettyDate,dateKey,TODAY:()=> '2026-11-09',sortedTasks:a=>a.slice().sort((x,y)=>x.dueDate.localeCompare(y.dueDate))};
vm.runInNewContext(js.slice(start,end)+'\n globalThis.TEST_METRICS={completionMetrics,reminderBuckets};',ctx);
const {completionMetrics,reminderBuckets}=ctx.TEST_METRICS;

test('Metriche 7 giorni: intervallo inclusivo, niente eventi futuri',()=>{
  const m=completionMetrics(7);
  assert.equal(m.start,'2026-11-03');assert.equal(m.today,'2026-11-09');
  assert.equal(m.completed,3);assert.equal(m.minutes,65);
  assert.equal(m.activeDays,2);assert.equal(m.bars.length,7);
  assert.equal(m.bars[6].count,2);assert.equal(m.roomCounts[0].count,2);
});
test('Metriche 30 giorni: aggregazione ogni 5 giorni',()=>{
  const m=completionMetrics(30);
  assert.equal(m.start,'2026-10-11');
  assert.equal(m.bars.length,6);
  assert.equal(m.bars.reduce((s,x)=>s+x.count,0),4);
  assert.equal(m.minutes,165);
});
test('Promemoria scadenze: vecchie, oggi, tre giorni senza completate',()=>{
  const m=reminderBuckets();
  assert.equal(m.overdue.map(x=>x.id).join(','),'old');
  assert.equal(m.today.map(x=>x.id).join(','),'now');
  assert.equal(m.soon.map(x=>x.id).join(','),'soon1,soon2');
});
test('Solo interfaccia nuova, nessuna migrazione distruttiva',()=>{
  assert.match(js,/const VERSION = '1\.2\.1'/);
  assert.match(js,/const STORAGE_KEY = 'casafacile\.v1\.database'/);
  assert.match(js,/schemaVersion:1/);
  assert.match(js,/case'reminders':html=renderReminders\(\)/);
  assert.match(js,/statsSelectedBar=Number\(b\.dataset\.bar\)/);
  assert.match(js,/data-page="reminders"/);
  assert.match(html,/id="i-bell"/);
  assert.match(html,/styles\.css\?v=1\.2\.1/);
  assert.match(html,/app\.js\?v=1\.2\.1/);
  assert.match(sw,/casafacile-static-1\.2\.1/);
});
