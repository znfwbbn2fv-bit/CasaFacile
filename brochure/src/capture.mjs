import {chromium} from 'playwright';
import QRCode from 'qrcode';
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';

const root=process.cwd();
const out=path.join(root,'brochure','assets');
fs.mkdirSync(out,{recursive:true});
const today=new Date();
today.setHours(12,0,0,0);
const iso=d=>d.toISOString().slice(0,10);
const relative=n=>{const d=new Date(today);d.setDate(d.getDate()+n);return iso(d);};
const now=new Date().toISOString();
const homeId='f0000000-0000-4000-8000-000000000001';
const members=[
  {id:'f1000000-0000-4000-8000-000000000001',name:'Giulia',color:'#eee6fc',isOwner:true},
  {id:'f1000000-0000-4000-8000-000000000002',name:'Marco',color:'#e5f4ed',isOwner:false},
  {id:'f1000000-0000-4000-8000-000000000003',name:'Sofia',color:'#fcebf0',isOwner:false}
];
const rooms=[
  ['Cucina','🍳','#eee6fc'],['Bagno','🫧','#e5f4ed'],
  ['Camera da letto','🛏️','#fcebf0'],['Soggiorno','🛋️','#fff0df'],
  ['Lavanderia','🧺','#e8f0fc'],['Altri spazi','🌿','#f4edf9']
].map(([name,emoji,color],i)=>({id:'f2000000-0000-4000-8000-'+String(i+1).padStart(12,'0'),name,emoji,color,slug:name.toLowerCase().replaceAll(' ','-')}));
const definitions=[
  ['Pulire la cucina',0,0,0,25,'high','daily'],
  ['Fare la lavatrice',4,0,1,40,'medium','weekly'],
  ['Riordinare il soggiorno',3,0,2,15,'medium','daily'],
  ['Pulire il bagno',1,1,1,30,'high','weekly'],
  ['Cambiare le lenzuola',2,2,0,25,'medium','weekly'],
  ['Passare l’aspirapolvere',3,2,1,30,'medium','weekly'],
  ['Spolverare la camera',2,3,2,20,'low','weekly'],
  ['Organizzare la dispensa',0,4,0,45,'low','monthly'],
  ['Pulire gli specchi',1,5,2,15,'medium','weekly'],
  ['Riordinare la lavanderia',4,6,1,20,'low','weekly']
];
const chores=definitions.map(([title,room,days,person,minutes,priority,freq],i)=>({
  id:'f3000000-0000-4000-8000-'+String(i+1).padStart(12,'0'),
  householdId:homeId,title,roomId:rooms[room].id,memberId:members[person].id,
  dueDate:relative(days),minutes,priority,
  notes:'',done:false,completedAt:null,
  repeat:{freq,interval:1,anchorDay:today.getDate()},createdAt:now,updatedAt:now
}));
const history=Array.from({length:11},(_,i)=>{
  const j=i%chores.length,t=chores[j],d=new Date(today);
  d.setDate(d.getDate()-(i%7));
  d.setHours(10+i%7,20,0,0);
  return {
    id:'f4000000-0000-4000-8000-'+String(i+1).padStart(12,'0'),
    taskId:t.id,householdId:homeId,title:t.title,
    roomId:t.roomId,roomName:rooms.find(r=>r.id===t.roomId).name,
    memberId:t.memberId,memberName:members.find(m=>m.id===t.memberId).name,
    minutes:t.minutes,plannedDate:iso(d),completedAt:d.toISOString()
  };
});
const db={
  schemaVersion:1,app:'CasaFacile',
  household:{id:homeId,name:'Casa Demo',mode:'personal',createdAt:now},
  members,rooms,chores,history,
  settings:{displayName:'Giulia',weekStart:'monday'},
  meta:{createdAt:now,updatedAt:now}
};

const browser=await chromium.launch({headless:true,args:['--no-sandbox']});
const context=await browser.newContext({
  viewport:{width:390,height:844},
  screen:{width:390,height:844},
  deviceScaleFactor:2,isMobile:true,hasTouch:true,
  locale:'it-IT',timezoneId:'Europe/Rome',
  serviceWorkers:'block',colorScheme:'light'
});
await context.addInitScript(seed=>{
  try{localStorage.setItem('casafacile.v1.database',JSON.stringify(seed));}catch(e){}
},db);
const page=await context.newPage();
const expected=[
  ['dashboard','Panoramica'],
  ['tasks','Attività'],
  ['calendar','Calendario'],
  ['rooms','Ambienti'],
  ['people','Famiglia'],
  ['stats','Statistiche'],
  ['sharing','Condivisioni'],
  ['settings','Impostazioni']
];
for(const [section,label] of expected){
  const url='http://127.0.0.1:8765/#'+section;
  await page.goto(url,{waitUntil:'load'});
  await page.waitForFunction((s)=>document.getElementById('page-title')?.textContent?.trim()===s,label);
  await page.waitForTimeout(150);
  if(section==='people')await page.evaluate(()=>window.scrollTo(0,80));
  if(section==='sharing')await page.evaluate(()=>window.scrollTo(0,80));
  const dest=path.join(out,section+'.png');
  await page.screenshot({path:dest,fullPage:false,animations:'disabled'});
  assert.ok(fs.statSync(dest).size>15000,'Empty screenshot: '+section);
  console.log('Captured '+label+' '+fs.statSync(dest).size+' bytes');
}
await QRCode.toFile(path.join(out,'qr-app.png'),'https://znfwbbn2fv-bit.github.io/CasaFacile/',{
  width:450,margin:1,color:{dark:'#482C40',light:'#FFFFFF'}
});
console.log('All images are screenshots of actual CasaFacile 1.3.2 UI with example data.');
await browser.close();
