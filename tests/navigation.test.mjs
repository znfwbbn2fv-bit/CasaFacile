import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import test from 'node:test';
const app=readFileSync('app.js','utf8');
const html=readFileSync('index.html','utf8');
const sw=readFileSync('sw.js','utf8');

test('quattro riquadri sono pulsanti con filtri dedicati',()=>{
  const start=app.indexOf('function renderDashboard(){');
  const end=app.indexOf('function filteredTasks()',start);
  const dashboard=app.slice(start,end);
  for(const [label,filter] of [
    ['Da fare oggi','today'],['Completate oggi','doneToday'],
    ['Programmate','upcoming'],['In ritardo','overdue']
  ]){
    assert.ok(dashboard.includes('<div class="stat-name">'+label+'</div>'),label);
    assert.ok(dashboard.includes('data-action="dashboard-summary" data-filter="'+filter+'"'),filter);
  }
  assert.equal((dashboard.match(/class="stat-card stat-card-link"/g)||[]).length,4);
  assert.equal((dashboard.match(/aria-label="Apri /g)||[]).length,4);
});
test('i completamenti odierni sono letti dallo storico, anche per routine riprogrammate',()=>{
  const start=app.indexOf('function filteredTodayHistory(){');
  const end=app.indexOf('function renderTasks(){',start);
  const s=app.slice(start,end);
  assert.ok(s.includes("dateKey(h.completedAt)===today"));
  assert.ok(s.includes("isHistory?filteredTodayHistory():filteredTasks()"));
  assert.ok(s.includes("entries.map(historyRow)"));
  assert.ok(app.includes("['doneToday','Completate oggi']"));
});
test('indietro in ogni sezione con destinazione predefinita',()=>{
  assert.ok(app.includes("el('content').innerHTML=(page==='dashboard'?'':backButton())+html"));
  assert.ok(app.includes("sectionTrail.pop()||'dashboard'"));
  assert.ok(app.includes("case'go-back':goBack();break"));
  assert.ok(app.includes("case'dashboard-summary':openDashboardSummary(b.dataset.filter);break"));
  assert.ok(app.includes("recordSectionNavigation();currentRoom=null;render()"));
  assert.ok(app.includes("if(pageFromHash()==='rooms'&&currentRoom)"));
});
test('persistenza inalterata e risorse versione 1.2.1',()=>{
  assert.match(app,/const VERSION = '1\.4\.0-beta'/);
  assert.match(app,/const STORAGE_KEY = 'casafacile\.v1\.database'/);
  assert.match(app,/schemaVersion:1/);
  assert.match(html,/app\.js\?v=1\.4\.0-beta/);
  assert.match(html,/styles\.css\?v=1\.4\.0-beta/);
  assert.match(sw,/casafacile-static-1\.4\.0-beta/);
});
