import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';

const app=readFileSync('app.js','utf8');
const html=readFileSync('index.html','utf8');
const sw=readFileSync('sw.js','utf8');
const css=readFileSync('styles.css','utf8');
const start=app.indexOf('function familyMetrics(today=TODAY())');
const end=app.indexOf('  function familyTaskLine(',start);
assert.ok(start>0 && end>start,'Family data model must be present');

const members=[
  {id:'a',name:'Anna',color:'#eee6fc',isOwner:true},
  {id:'b',name:'Luca',color:'#e5f4ed',isOwner:false}
];
const tasks=[
  {id:'old',title:'Vecchia',memberId:'a',dueDate:'2026-11-08',done:false,minutes:15},
  {id:'soon',title:'Prossima',memberId:'a',dueDate:'2026-11-10',done:false,minutes:35},
  {id:'future',title:'Lontana',memberId:'b',dueDate:'2026-11-20',done:false,minutes:20},
  {id:'today',title:'Oggi',memberId:'b',dueDate:'2026-11-09',done:false,minutes:25},
  {id:'done',title:'Finita',memberId:'a',dueDate:'2026-11-01',done:true,minutes:30},
  {id:'orphan',title:'Sconosciuta',memberId:'deleted-id',dueDate:'2026-11-09',done:false,minutes:10}
];
const records=[
  {id:'h1',memberId:'a',completedAt:'2026-11-06T12:00:00Z',minutes:15},
  {id:'h2',memberId:'b',completedAt:'2026-11-09T12:00:00Z',minutes:25},
  {id:'old',memberId:'a',completedAt:'2026-10-30T12:00:00Z',minutes:30}
];
const db={members,chores:tasks,history:records,meta:{updatedAt:'2026-11-01T00:00:00Z'}};
const plusDays=(date,n)=>{
  const d=new Date(date+'T00:00:00Z');
  d.setUTCDate(d.getUTCDate()+n);
  return d.toISOString().slice(0,10);
};
const ctx={db,plusDays,TODAY:()=> '2026-11-09',dateKey:iso=>iso.slice(0,10),
  sortedTasks:list=>[...list].sort((a,b)=>a.dueDate.localeCompare(b.dueDate)),
  memberById:id=>db.members.find(m=>m.id===id),
  repository:{save:()=>{}},
  nowISO:()=> '2026-11-09T10:00:00Z',render:()=>{},toast:()=>{},console};
vm.runInNewContext(app.slice(start,end)+'\n globalThis.family={familyMetrics,reassignFamilyTask};',ctx);
const {familyMetrics,reassignFamilyTask}=ctx.family;

test('la famiglia include responsabilità, scadenze e completamenti per persona',()=>{
  const m=familyMetrics();
  assert.equal(m.rows.length,2);
  assert.equal(m.openCount,5);
  assert.equal(m.assignedOpen,4);
  assert.equal(m.dueCount,2);
  assert.equal(m.completed7,2);
  assert.equal(m.unassigned.length,1);
  assert.equal(m.rows[0].open.length,2);
  assert.equal(m.rows[0].overdue.length,1);
  assert.equal(m.rows[0].week.length,2);
  assert.equal(m.rows[0].minutes,50);
  assert.equal(m.rows[1].week.length,1);
  assert.equal(m.rows[1].minutes,25);
});
test('riassegnazione salva e non riscrive lo storico',()=>{
  const before=JSON.stringify(db.history),oldTask=tasks.find(t=>t.id==='soon');
  reassignFamilyTask('soon','b');
  assert.equal(oldTask.memberId,'b');
  assert.equal(familyMetrics().rows[1].open.length,3);
  assert.equal(JSON.stringify(db.history),before);
  reassignFamilyTask('soon','not-a-person');
  assert.equal(oldTask.memberId,'b');
});
test('errore di persistenza annulla il cambiamento di assegnazione',()=>{
  const task=tasks.find(t=>t.id==='soon'),previous=task.memberId;
  ctx.repository.save=()=>{throw new Error('storage unavailable');};
  reassignFamilyTask('soon','a');
  assert.equal(task.memberId,previous);
});
test('percorso familiare e filtro disponibili senza cambiare la chiave dati',()=>{
  assert.match(app,/const VERSION = '1\.3\.0'/);
  assert.match(app,/const STORAGE_KEY = 'casafacile\.v1\.database'/);
  assert.match(app,/schemaVersion:1/);
  assert.ok(app.includes("memberFilter==='all'||t.memberId===memberFilter"));
  assert.ok(app.includes("memberFilter==='all'||h.memberId===memberFilter"));
  assert.ok(app.includes("case'family-view-tasks':goFamilyTasks(id);break"));
  assert.ok(app.includes("case'family-new-task':if(memberById(id))openTaskModal(null,null,id);break"));
  assert.ok(app.includes("if(e.target.id==='task-member-filter')"));
  assert.ok(app.includes("if(e.target.matches?.('select[data-action=\"family-assign\"]'))"));
  assert.ok(app.includes('function renderFamilyDashboardLink(){'));
  assert.ok(app.includes('function renderPeople(){'));
  assert.ok(app.includes("case'people':html=renderPeople();break"));
  assert.match(css,/\.family-person-grid\{/);
  assert.match(html,/styles\.css\?v=1\.3\.0/);
  assert.match(html,/app\.js\?v=1\.3\.0/);
  assert.match(sw,/casafacile-static-1\.3\.0/);
});
