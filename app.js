/* CasaFacile 1.3.0 — SEGNOTA Studio — personal-first PWA
   Persistenza isolata per household; repository sostituibile con adapter cloud futuro. */
(() => {
  'use strict';
  const VERSION = '1.3.0';
  const STORAGE_KEY = 'casafacile.v1.database';
  const ROLLBACK_KEY = 'casafacile.v1.prima-importazione';
  const NAV = [
    ['dashboard','Panoramica','grid'],['tasks','Attività','list'],
    ['calendar','Calendario','calendar'],['rooms','Ambienti','room'],
    ['stats','Statistiche','chart'],['reminders','Promemoria','bell'],['people','Famiglia','users'],
    ['settings','Impostazioni','settings']
  ];
  const MOBILE_NAV = ['dashboard','tasks','calendar','rooms','settings'];
  const ROOM_COLORS = ['#eee6fc','#e5f4ed','#fcebf0','#fff0df','#e8f0fc','#f4edf9','#f9e8e2'];
  const TODAY = () => dateKey(new Date());
  const el = id => document.getElementById(id);
  const ico = (name, extra='') => `<svg class="icon ${extra}" aria-hidden="true"><use href="#i-${name}"/></svg>`;
  const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const uid = () => (globalThis.crypto?.randomUUID?.() || `cf_${Date.now().toString(36)}_${Math.random().toString(36).slice(2)}`);
  function dateKey(d) {const x=new Date(d);return `${x.getFullYear()}-${String(x.getMonth()+1).padStart(2,'0')}-${String(x.getDate()).padStart(2,'0')}`;}
  function dUTC(s) {const [y,m,d]=s.split('-').map(Number);return new Date(Date.UTC(y,m-1,d));}
  function plusDays(s,n){const d=dUTC(s);d.setUTCDate(d.getUTCDate()+n);return d.toISOString().slice(0,10);}
  function plusMonths(s,n,anchor){const d=dUTC(s);const y=d.getUTCFullYear(),m=d.getUTCMonth();const first=new Date(Date.UTC(y,m+n,1));const max=new Date(Date.UTC(first.getUTCFullYear(),first.getUTCMonth()+1,0)).getUTCDate();first.setUTCDate(Math.min(anchor||d.getUTCDate(),max));return first.toISOString().slice(0,10);}
  function validDate(s){return typeof s==='string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && !isNaN(dUTC(s).getTime()) && dUTC(s).toISOString().slice(0,10)===s;}
  function prettyDate(s,opts={day:'numeric',month:'long'}){if(!validDate(s))return '—';return new Intl.DateTimeFormat('it-IT',opts).format(new Date(`${s}T12:00:00`));}
  function prettyWeek(s){return prettyDate(s,{weekday:'long',day:'numeric',month:'long'});}
  function dateTime(s){return new Intl.DateTimeFormat('it-IT',{day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'}).format(new Date(s));}
  function nowISO(){return new Date().toISOString();}
  function daysBetween(a,b){return Math.round((dUTC(b)-dUTC(a))/86400000);}
  function startWeek(iso){const wd=dUTC(iso).getUTCDay();return plusDays(iso,-(wd===0?6:wd-1));}
  function roomById(id){return db.rooms.find(r=>r.id===id);}
  function memberById(id){return db.members.find(m=>m.id===id);}
  function palette(i){return ROOM_COLORS[i%ROOM_COLORS.length];}
  function makeDB(){const homeId=uid(),meId=uid();return {
    schemaVersion:1,app:'CasaFacile',household:{id:homeId,name:'La mia casa',mode:'personal',createdAt:nowISO()},
    members:[{id:meId,name:'Io',color:'#eee6fc',isOwner:true}],
    rooms:[['cucina','Cucina','🍳'],['bagno','Bagno','🫧'],['camera','Camera da letto','🛏️'],['soggiorno','Soggiorno','🛋️'],['lavanderia','Lavanderia','🧺'],['altro','Altri spazi','🌿']].map((x,i)=>({id:uid(),slug:x[0],name:x[1],emoji:x[2],color:palette(i)})),
    chores:[],history:[],settings:{displayName:'',weekStart:'monday'},meta:{createdAt:nowISO(),updatedAt:nowISO()}
  };}
  function validDB(x){return x && x.app==='CasaFacile' && x.schemaVersion===1 && x.household && typeof x.household.id==='string' && Array.isArray(x.members) && x.members.length>0 && Array.isArray(x.rooms) && Array.isArray(x.chores) && Array.isArray(x.history) && x.settings && typeof x.settings==='object' && x.chores.length<=30000 && x.history.length<=100000 && x.rooms.length<=1000 && x.members.length<=1000 && x.chores.every(t=>t && typeof t.id==='string' && typeof t.title==='string' && validDate(t.dueDate) && ['none','daily','weekly','monthly'].includes(t.repeat?.freq)) && x.history.every(h=>h && typeof h.id==='string' && typeof h.taskId==='string' && typeof h.completedAt==='string');}
  // Il contratto di persistenza è unico: si potrà sostituire con repository cloud senza riscrivere la UI.
  const repository={kind:'local',load(){try{const raw=localStorage.getItem(STORAGE_KEY);if(!raw)return null;const parsed=JSON.parse(raw);return validDB(parsed)?parsed:null;}catch{return null;}},save(data){localStorage.setItem(STORAGE_KEY,JSON.stringify(data));}};
  let db=repository.load();
  if(!db){db=makeDB();try{repository.save(db);}catch(err){console.error('Salvataggio non disponibile',err);}}
  let page='dashboard',taskFilter='all',memberFilter='all',taskSearch='',monthCursor=TODAY().slice(0,7),selectedDay=TODAY();
  let currentRoom=null, completionToken=null, toastTimer=null, pendingImport=null;
  let sectionTrail=[], lastSection=pageFromHash(), suppressTrailTarget=null;
  function save(){db.meta.updatedAt=nowISO();try{repository.save(db);}catch(e){toast('Impossibile salvare: spazio dispositivo esaurito o archivio bloccato. Esporta un backup.','error');console.error(e);}}
  function go(p){location.hash=p; if(page===p)render();}
  function pageFromHash(){const h=location.hash.slice(1);return NAV.some(n=>n[0]===h)?h:'dashboard';}

  function recordSectionNavigation(){
    const target=pageFromHash();
    if(target!==lastSection){
      if(suppressTrailTarget!==target){
        sectionTrail.push(lastSection);
        if(sectionTrail.length>40)sectionTrail.shift();
      }
      suppressTrailTarget=null;
      lastSection=target;
    }
  }
  function goBack(){
    if(pageFromHash()==='rooms'&&currentRoom){
      currentRoom=null;
      render();
      window.scrollTo(0,0);
      return;
    }
    const target=sectionTrail.pop()||'dashboard';
    if(target===pageFromHash()){render();return;}
    suppressTrailTarget=target;
    go(target);
  }
  function openDashboardSummary(filter){
    if(!['today','doneToday','upcoming','overdue'].includes(filter))return;
    taskFilter=filter;
    memberFilter='all';
    taskSearch='';
    go('tasks');
  }
  function backButton(){
    return '<div class="section-back"><button type="button" class="section-back-btn" data-action="go-back" aria-label="Torna alla sezione precedente">'
      +ico('chevron-left')+' <span>Indietro</span></button></div>';
  }

  function navHtml([key,label,icon]){return `<a class="nav-link ${page===key?'active':''}" href="#${key}" ${page===key?'aria-current="page"':''}>${ico(icon)}<span>${esc(label)}</span></a>`;}
  function renderNavigation(){el('side-nav').innerHTML=NAV.map(navHtml).join('');el('mobile-nav').innerHTML=NAV.filter(n=>MOBILE_NAV.includes(n[0])).map(([key,label,icon])=>`<a href="#${key}" class="${page===key?'active':''}" ${page===key?'aria-current="page"':''}>${ico(icon)}<span>${esc(label)}</span></a>`).join('');}
  function header(title,subtitle,action=''){return `<div class="page-heading"><div><h2>${esc(title)}</h2><p>${esc(subtitle)}</p></div><div class="heading-actions">${action}</div></div>`;}
  function btnAdd(text='Nuova attività'){return `<button type="button" class="btn btn-primary" data-action="new-task">${ico('plus')} ${esc(text)}</button>`;}
  function pill(txt,type){return `<span class="pill pill-${type}">${esc(txt)}</span>`;}
  function empty(title,desc,button=''){return `<div class="empty"><div class="empty-icon">${ico('sparkle')}</div><strong>${esc(title)}</strong><p>${esc(desc)}</p>${button}</div>`;}
  function statistics(){const today=TODAY();const open=db.chores.filter(t=>!t.done);const pending=open.filter(t=>t.dueDate<=today);const overdue=open.filter(t=>t.dueDate<today);const doneToday=db.history.filter(h=>dateKey(h.completedAt)===today);const doneWeek=db.history.filter(h=>dateKey(h.completedAt)>=plusDays(today,-6));const total=doneToday.length+pending.length;return{open,pending,overdue,doneToday,doneWeek,rate:total?Math.round(doneToday.length/total*100):0,total};}
  function infoChore(t){const room=roomById(t.roomId),m=memberById(t.memberId);return [room?.name||'Altro',m?.name||'Io',t.minutes?`${t.minutes} min`:null].filter(Boolean);}
  function choreRow(t, opts={}){
    const isDone=!!t.done, overdue=!isDone&&t.dueDate<TODAY(),isToday=!isDone&&t.dueDate===TODAY();
    const badge=isDone?pill('Completata','done'):overdue?pill('In ritardo','overdue'):isToday?pill('Oggi','today'):pill(prettyDate(t.dueDate,{day:'numeric',month:'short'}),'future');
    const label=[...infoChore(t),t.repeat?.freq!=='none'?repeatLabel(t.repeat):null,t.priority==='high'?'Priorità alta':null].filter(Boolean);
    return `<div class="chore-row">
      <button class="check-btn ${isDone?'done':''}" type="button" data-action="${isDone?'reopen':'complete'}" data-id="${esc(t.id)}" aria-label="${isDone?'Riapri':'Completa'}: ${esc(t.title)}" title="${isDone?'Riapri attività':'Segna come completata'}">${isDone?ico('check'):''}</button>
      <div class="task-body"><div class="task-name ${isDone?'done':''}">${esc(t.title)}</div><div class="task-sub">${label.map((v,i)=>`${i?'<span class="sub-dot"></span>':''}<span>${esc(v)}</span>`).join('')}</div></div>
      <div class="task-actions">${!opts.noBadge?badge:''}<button type="button" class="btn-icon" data-action="edit-task" data-id="${esc(t.id)}" aria-label="Modifica ${esc(t.title)}">${ico('pencil')}</button></div>
    </div>`;
  }
  function historyRow(h){const task=db.chores.find(t=>t.id===h.taskId);const latest=[...db.history].reverse().find(x=>x.taskId===h.taskId);const canUndo=task&&latest?.id===h.id;return `<div class="chore-row"><div class="check-btn done" aria-hidden="true">${ico('check')}</div><div class="task-body"><div class="task-name done">${esc(h.title)}</div><div class="task-sub"><span>${esc(h.roomName||'Altro')}</span><span class="sub-dot"></span><span>${esc(h.memberName||'Io')}</span><span class="sub-dot"></span><span>${esc(dateTime(h.completedAt))}</span></div></div>${canUndo?`<button class="btn btn-outline btn-sm" data-action="undo-completion" data-id="${esc(h.id)}" title="Annulla questo completamento">${ico('repeat')} Annulla</button>`:pill('Fatta','done')}</div>`;}
  function repeatLabel(r){if(!r||r.freq==='none')return 'Una volta';const count=Number(r.interval)||1;const forms={daily:['Ogni giorno','Ogni {n} giorni'],weekly:['Ogni settimana','Ogni {n} settimane'],monthly:['Ogni mese','Ogni {n} mesi']};let [one,many]=forms[r.freq]||forms.daily;return count===1?one:many.replace('{n}',count);}
  function sortedTasks(list){return [...list].sort((a,b)=>Number(a.done)-Number(b.done)||a.dueDate.localeCompare(b.dueDate)||({high:0,medium:1,low:2}[a.priority]??1)-({high:0,medium:1,low:2}[b.priority]??1)||a.title.localeCompare(b.title,'it'));}

  /* CasaFacile 1.2 — metriche e promemoria: calcoli locali senza modificare il database. */
  let statsPeriod=7, statsSelectedBar=null;
  function completionMetrics(period=7, today=TODAY()){
    const days=period===30?30:7;
    const start=plusDays(today,1-days);
    const data=new Map();
    for(const h of db.history){
      const day=dateKey(h.completedAt);
      if(day<start||day>today)continue;
      if(!data.has(day))data.set(day,{count:0,minutes:0,items:[]});
      const entry=data.get(day);
      entry.count++;
      const minutes=Number(h.minutes);
      entry.minutes+=Number.isFinite(minutes)&&minutes>0?minutes:0;
      entry.items.push(h);
    }
    const rows=Array.from({length:days},(_,i)=>{
      const day=plusDays(start,i),entry=data.get(day)||{count:0,minutes:0,items:[]};
      return {day,count:entry.count,minutes:entry.minutes,items:entry.items};
    });
    const stride=days===30?5:1,bars=[];
    for(let i=0;i<rows.length;i+=stride){
      const part=rows.slice(i,i+stride),first=part[0].day,last=part[part.length-1].day;
      bars.push({
        first,last,
        label:stride===1?prettyDate(first,{weekday:'short'}):
          prettyDate(first,{day:'numeric',month:'short'}),
        count:part.reduce((n,r)=>n+r.count,0),
        minutes:part.reduce((n,r)=>n+r.minutes,0)
      });
    }
    const history=rows.flatMap(x=>x.items);
    const minutes=rows.reduce((n,x)=>n+x.minutes,0);
    const roomCounts=new Map();
    for(const h of history){
      const key=h.roomId||'unknown';
      const old=roomCounts.get(key)||{id:key,name:h.roomName||'Altro',count:0};
      old.count++;roomCounts.set(key,old);
    }
    return {
      days,start,today,history,bars,minutes,completed:history.length,
      activeDays:rows.filter(r=>r.count>0).length,
      roomCounts:[...roomCounts.values()].sort((a,b)=>b.count-a.count)
    };
  }
  function reminderBuckets(today=TODAY()){
    const tomorrow=plusDays(today,1),horizon=plusDays(today,3);
    const open=db.chores.filter(t=>!t.done);
    return {
      overdue:sortedTasks(open.filter(t=>t.dueDate<today)),
      today:sortedTasks(open.filter(t=>t.dueDate===today)),
      soon:sortedTasks(open.filter(t=>t.dueDate>=tomorrow&&t.dueDate<=horizon))
    };
  }
  /* CasaFacile 1.2 — fine calcoli, inizio componenti di visualizzazione. */


  function metricMinutes(value){
    const n=Math.round(Number(value)||0);
    if(n<60)return n+' min';
    const h=Math.floor(n/60),m=n%60;
    return h+' h'+(m?' '+m+' min':'');
  }
  function operationalMix(today=TODAY()){
    const open=db.chores.filter(t=>!t.done);
    return [
      {label:'Completate oggi',value:db.history.filter(h=>dateKey(h.completedAt)===today).length,color:'#79b59e',filter:null},
      {label:'Da fare oggi',value:open.filter(t=>t.dueDate===today).length,color:'#8d7bd0',filter:'today'},
      {label:'In ritardo',value:open.filter(t=>t.dueDate<today).length,color:'#e5a5b1',filter:'overdue'},
      {label:'Future',value:open.filter(t=>t.dueDate>today).length,color:'#edc98f',filter:'upcoming'}
    ];
  }
  function operationalDonut(){
    const slices=operationalMix(),total=slices.reduce((n,x)=>n+x.value,0);
    let progress=0;
    const colors=total?slices.filter(x=>x.value>0).map(x=>{
      const start=progress;progress+=100*x.value/total;
      return x.color+' '+start.toFixed(2)+'% '+progress.toFixed(2)+'%';
    }).join(', '):'#ececf4 0% 100%';
    const gradient='conic-gradient('+colors+')';
    const label='Oggi: '+slices.map(x=>x.label+' '+x.value).join(', ');
    return '<div class="mix-layout"><div class="mix-donut" role="img" aria-label="'+esc(label)
      +'" style="background:'+gradient+'"><div class="mix-core"><strong>'+total
      +'</strong><small>eventi e attività</small></div></div><div class="mix-legend">'
      +slices.map(x=>'<div class="mix-legend-row"><span class="mix-swatch" style="background:'+x.color+'"></span>'
        +'<span>'+esc(x.label)+'</span><strong>'+x.value+'</strong></div>').join('')
      +'</div></div><p class="footer-note">Fotografia: attività aperte e completamenti registrati oggi. I completamenti ricorrenti possono comparire insieme alle prossime scadenze.</p>';
  }
  function renderDashboardInsights(){
    const m=completionMetrics(7),r=reminderBuckets();
    const urgent=r.overdue.length+r.today.length;
    return '<div class="insights-grid" aria-label="Analisi e promemoria">'
      +'<section class="panel"><div class="panel-head"><h3>Panoramica delle attività</h3>'
      +'<button class="text-button" data-action="nav" data-page="stats">Analizza</button></div>'
      +operationalDonut()+'</section>'
      +'<section class="panel"><div class="panel-head"><h3>Andamento settimanale</h3>'
      +'<button class="text-button" data-action="nav" data-page="stats">Statistiche</button></div>'
      +'<div class="insight-metrics"><div><strong>'+m.completed+'</strong><span>completate · 7 giorni</span></div>'
      +'<div><strong>'+esc(metricMinutes(m.minutes))+'</strong><span>tempo stimato</span></div></div>'
      +'<div class="insight-bars" role="img" aria-label="'+m.completed+' attività completate negli ultimi 7 giorni">'
      +m.bars.map(b=>'<span class="insight-bar" title="'+esc(prettyDate(b.first,{day:'numeric',month:'short'}))
        +': '+b.count+' completamenti"><i style="height:'+(m.completed?Math.max(6,b.count/Math.max(1,...m.bars.map(x=>x.count))*100):0)
        +'%"></i></span>').join('')+'</div>'
      +'<p class="footer-note">Ogni barra rappresenta un giorno. I minuti sono stime, non tempo cronometrato.</p></section>'
      +'<section class="panel reminder-summary"><div class="panel-head"><h3>Promemoria</h3>'
      +'<button class="text-button" data-action="nav" data-page="reminders">Apri centro</button></div>'
      +'<div class="reminder-summary-metrics"><div class="reminder-overdue"><strong>'+r.overdue.length+'</strong><span>In ritardo</span></div>'
      +'<div><strong>'+r.today.length+'</strong><span>Oggi</span></div>'
      +'<div><strong>'+r.soon.length+'</strong><span>Entro 3 giorni</span></div></div>'
      +'<p class="reminder-summary-note">'+(urgent?'Ci sono '+urgent+' attività da controllare.':'Nessuna attività urgente: controlla le prossime scadenze.')
      +'</p><button class="btn btn-soft reminder-open" type="button" data-action="nav" data-page="reminders">Visualizza promemoria '+ico('arrow')+'</button></section>'
      +'</div>';
  }
  function renderReminderGroup(title,note,list,filter){
    const cap=7;
    return '<section class="panel reminder-panel"><div class="panel-head"><div><h3>'+esc(title)
      +'</h3><small>'+esc(note)+'</small></div><span class="reminder-number">'+list.length+'</span></div>'
      +(list.length?'<div class="chore-list">'+list.slice(0,cap).map(t=>choreRow(t)).join('')+'</div>'
       :empty('Nessuna attività','Non risultano faccende in questa categoria.'))
      +(list.length>cap?'<p class="footer-note">Altre '+(list.length-cap)+' attività nell’elenco completo.</p>':'')
      +(list.length?'<button class="text-button" data-action="open-task-filter" data-filter="'+filter+'">Apri le attività '+ico('arrow')+'</button>':'')
      +'</section>';
  }
  function renderReminders(){
    const r=reminderBuckets();
    return header('Centro promemoria','Scadenze organizzate per urgenza, consultabili anche offline.')
      +'<div class="reminder-banner">'+ico('bell')+' <div><strong>Avvisi all’interno dell’app</strong>'
      +'<p>I promemoria vengono aggiornati quando apri o usi CasaFacile. Non sono notifiche push e non compaiono quando l’app è chiusa.</p></div></div>'
      +'<div class="reminder-columns">'
      +renderReminderGroup('In ritardo','Scadute prima di oggi',r.overdue,'overdue')
      +renderReminderGroup('Da fare oggi','Scadono entro questa giornata',r.today,'today')
      +renderReminderGroup('In arrivo','Nei prossimi 3 giorni',r.soon,'upcoming')
      +'</div>';
  }
  function renderStatsBars(m){
    const max=Math.max(1,...m.bars.map(x=>x.count));
    const index=statsSelectedBar!=null&&statsSelectedBar<m.bars.length?statsSelectedBar:null;
    const selected=index===null?null:m.bars[index];
    return '<div class="trend-chart" aria-label="Completamenti per '+(m.days===7?'giorno':'gruppi di cinque giorni')+'">'
      +m.bars.map((b,i)=>{
        const label=prettyDate(b.first,{day:'numeric',month:'short'})+(b.first!==b.last?' – '+prettyDate(b.last,{day:'numeric',month:'short'}):'');
        return '<button type="button" class="trend-col'+(index===i?' active':'')+'" data-action="stats-bar" data-bar="'+i
          +'" aria-label="'+esc(label+': '+b.count+' completamenti, '+metricMinutes(b.minutes))+'">'
          +'<span class="trend-count">'+b.count+'</span><span class="trend-rail"><i style="height:'+(b.count?Math.max(5,b.count/max*100):0)
          +'%"></i></span><span class="trend-label">'+esc(b.label)+'</span></button>';
      }).join('')+'</div>'
      +'<div class="trend-selection" aria-live="polite">'+(selected
        ?'<strong>'+esc(prettyDate(selected.first,{day:'numeric',month:'short'}))+(selected.first!==selected.last?' – '+esc(prettyDate(selected.last,{day:'numeric',month:'short'})):'')
          +'</strong> · '+selected.count+' completament'+(selected.count===1?'o':'i')+' · '+esc(metricMinutes(selected.minutes))+' stimati'
        :'Tocca una barra per visualizzare completamenti e minuti del periodo.')+'</div>';
  }


  /* CasaFacile 1.3.0 — indicatori di responsabilità calcolati dai dati locali. */
  function familyMetrics(today=TODAY()){
    const until=plusDays(today,6),since=plusDays(today,-6);
    const open=db.chores.filter(t=>!t.done);
    const rows=db.members.map(member=>{
      const assigned=sortedTasks(open.filter(t=>t.memberId===member.id));
      const due=assigned.filter(t=>t.dueDate<=today);
      const overdue=assigned.filter(t=>t.dueDate<today);
      const week=assigned.filter(t=>t.dueDate<=until);
      const completed=db.history.filter(h=>h.memberId===member.id&&
        dateKey(h.completedAt)>=since&&dateKey(h.completedAt)<=today);
      const minutes=week.reduce((sum,t)=>{
        const n=Number(t.minutes);
        return sum+(Number.isFinite(n)&&n>0?n:0);
      },0);
      return {member,open:assigned,due,overdue,week,completed,minutes};
    });
    const assignedOpen=rows.reduce((n,r)=>n+r.open.length,0);
    return {
      rows,openCount:open.length,assignedOpen,
      dueCount:rows.reduce((n,r)=>n+r.due.length,0),
      completed7:rows.reduce((n,r)=>n+r.completed.length,0),
      unassigned:open.filter(t=>!db.members.some(m=>m.id===t.memberId))
    };
  }
  /* Fine calcolo famiglia; la UI e il database restano indipendenti. */

  function goFamilyTasks(memberId){
    if(!memberById(memberId))return;
    memberFilter=memberId;taskFilter='all';taskSearch='';go('tasks');
  }
  function reassignFamilyTask(taskId,memberId){
    const task=db.chores.find(t=>t.id===taskId);
    if(!task||task.done||!memberById(memberId)){
      toast('Assegnazione non valida.','error');render();return;
    }
    if(task.memberId===memberId)return;
    const oldMember=task.memberId,oldUpdated=task.updatedAt,oldMeta=db.meta.updatedAt;
    task.memberId=memberId;task.updatedAt=nowISO();db.meta.updatedAt=task.updatedAt;
    try{repository.save(db);}
    catch(error){
      task.memberId=oldMember;task.updatedAt=oldUpdated;db.meta.updatedAt=oldMeta;
      console.error(error);toast('Assegnazione non salvata: verifica lo spazio disponibile.','error');render();return;
    }
    render();
    toast('Responsabilità assegnata a '+memberById(memberId).name+'.');
  }
  function familyTaskLine(task){
    const date=task.dueDate,late=date<TODAY(),today=date===TODAY();
    const dateLabel=late?'In ritardo':today?'Oggi':prettyDate(date,{day:'numeric',month:'short'});
    return '<li class="family-task-line"><div class="family-task-main"><strong>'+esc(task.title)
      +'</strong><span class="family-task-info">'+esc(dateLabel)+' · '+esc(String(task.minutes||0))+' min</span></div>'
      +'<label class="family-assign-field"><span>Assegna a</span><select data-action="family-assign" data-task-id="'+esc(task.id)
      +'" aria-label="Riassegna '+esc(task.title)+'">'
      +db.members.map(m=>'<option value="'+esc(m.id)+'"'+(m.id===task.memberId?' selected':'')+'>'+esc(m.name)+'</option>').join('')
      +'</select></label></li>';
  }
  function renderFamilyDashboardLink(){
    const f=familyMetrics();
    return '<section class="panel family-dashboard-link"><div class="family-dashboard-heading">'
      +'<span class="family-dashboard-icon">'+ico('users')+'</span><div><h3>La tua famiglia</h3>'
      +'<p>'+f.rows.length+' '+(f.rows.length===1?'persona':'persone')+' · '+f.openCount
      +' attività aperte · '+f.dueCount+' da gestire oggi</p></div></div>'
      +'<button type="button" class="btn btn-soft" data-action="nav" data-page="people">Gestisci responsabilità '+ico('arrow')+'</button>'
      +'</section>';
  }

  function renderDashboard(){const s=statistics();const today=s.pending;const upcoming=sortedTasks(s.open.filter(t=>t.dueDate>TODAY())).slice(0,4);const display=esc(db.settings.displayName||'');
    return `<section class="hero"><div class="hero-text"><div class="eyebrow">${esc(prettyWeek(TODAY()).toUpperCase())}</div><h2>${display?`Ciao, ${display}!`:'Una casa più serena, un passo alla volta.'} ✨</h2><p>Organizza le faccende senza stress. Ogni attività completata è un piccolo traguardo.</p><button class="btn btn-primary" data-action="new-task">${ico('plus')} Aggiungi attività</button><small class="hero-credit">by SEGNOTA Studio</small></div><div class="hero-decoration">${ico('house')}</div></section>
    <section class="stat-grid" aria-label="Riepilogo"><button type="button" class="stat-card stat-card-link" data-action="dashboard-summary" data-filter="today" aria-label="Apri da fare oggi"><div class="stat-top"><span class="stat-icon tint-purple">${ico('list')}</span></div><div class="stat-number">${s.pending.length}</div><div class="stat-name">Da fare oggi</div><div class="stat-detail">Incluse le attività in ritardo</div></button><button type="button" class="stat-card stat-card-link" data-action="dashboard-summary" data-filter="doneToday" aria-label="Apri completate oggi"><div class="stat-top"><span class="stat-icon tint-green">${ico('check')}</span></div><div class="stat-number">${s.doneToday.length}</div><div class="stat-name">Completate oggi</div><div class="stat-detail">Ottimo lavoro!</div></button><button type="button" class="stat-card stat-card-link" data-action="dashboard-summary" data-filter="upcoming" aria-label="Apri programmate"><div class="stat-top"><span class="stat-icon tint-amber">${ico('clock')}</span></div><div class="stat-number">${s.open.filter(t=>t.dueDate>TODAY()).length}</div><div class="stat-name">Programmate</div><div class="stat-detail">Nei prossimi giorni</div></button><button type="button" class="stat-card stat-card-link" data-action="dashboard-summary" data-filter="overdue" aria-label="Apri in ritardo"><div class="stat-top"><span class="stat-icon tint-pink">${ico('alert')}</span></div><div class="stat-number">${s.overdue.length}</div><div class="stat-name">In ritardo</div><div class="stat-detail">Recuperabili con calma</div></button></section>
    ${renderDashboardInsights()}${renderFamilyDashboardLink()}<div class="content-grid"><section class="panel"><div class="panel-head"><h3>🗓️ Da fare oggi</h3><button class="text-button" data-action="view-tasks">Tutte le attività ${ico('arrow')}</button></div>${today.length?`<div class="chore-list">${sortedTasks(today).slice(0,7).map(t=>choreRow(t,{noBadge:false})).join('')}</div>${today.length>7?`<div class="tip-line">Altre ${today.length-7} attività nell'elenco completo.</div>`:''}`:empty('Tutto sotto controllo!',db.chores.length?'Nessuna attività in scadenza oggi.':'Inizia aggiungendo la tua prima faccenda domestica.',db.chores.length?'':btnAdd('Crea la prima attività'))}
    ${upcoming.length?`<h4 class="section-title">Prossime attività</h4>${upcoming.map(t=>choreRow(t)).join('')}`:''}${s.doneToday.length?`<h4 class="section-title">Completate oggi</h4>${[...s.doneToday].reverse().slice(0,5).map(historyRow).join('')}`:''}</section>
    <div><section class="panel"><div class="panel-head"><h3>Il tuo progresso</h3><button class="text-button" data-action="nav" data-page="stats">Statistiche</button></div><div class="progress-card"><div class="progress-card-header"><div><div class="progress-big">${s.rate}%</div><div class="progress-caption">Completamento di oggi</div></div><span class="stat-icon tint-purple">${ico('chart')}</span></div><div class="progress-track"><div class="progress-fill" style="width:${s.rate}%"></div></div><div class="footer-note">${s.doneToday.length} fatte · ${s.pending.length} da fare (incluse scadute)</div></div><div class="panel-head"><h3>Ambienti</h3><button class="text-button" data-action="nav" data-page="rooms">Vedi tutti</button></div><div class="room-mini">${db.rooms.slice(0,5).map(r=>{const tasks=s.open.filter(t=>t.roomId===r.id);return `<div class="room-mini-row"><span class="room-dot" style="background:${esc(r.color)}">${esc(r.emoji)}</span><div class="room-info"><div class="room-label">${esc(r.name)}</div><div class="room-line"><span style="width:${Math.min(tasks.length*20,100)}%"></span></div></div><span class="room-meta">${tasks.length}</span></div>`}).join('')}</div></section><div style="height:18px"></div><section class="notice">${ico('shield')}<div><strong>Modalità personale attiva</strong><br>I tuoi dati restano su questo dispositivo. Crea regolarmente un backup dalle Impostazioni.</div></section></div></div>`;
  }
  function filteredTasks(){const now=TODAY();return sortedTasks(db.chores.filter(t=>{
    const match=taskFilter==='all'||(taskFilter==='today'&&!t.done&&t.dueDate<=now)||(taskFilter==='upcoming'&&!t.done&&t.dueDate>now)||(taskFilter==='overdue'&&!t.done&&t.dueDate<now)||(taskFilter==='done'&&t.done);
    const q=taskSearch.toLocaleLowerCase('it').trim();return match&&(memberFilter==='all'||t.memberId===memberFilter)&&(!q||[t.title,t.notes,roomById(t.roomId)?.name,memberById(t.memberId)?.name].some(x=>String(x||'').toLocaleLowerCase('it').includes(q)));
  }));}
  function filteredTodayHistory(){
    const today=TODAY(),q=taskSearch.toLocaleLowerCase('it-IT').trim();
    return [...db.history].filter(h=>dateKey(h.completedAt)===today && (memberFilter==='all'||h.memberId===memberFilter) && (
      !q||[h.title,h.roomName,h.memberName].some(v=>String(v||'').toLocaleLowerCase('it-IT').includes(q))
    )).reverse();
  }
  function renderTaskResults(){
    const node=el('task-results');if(!node)return;
    const isHistory=taskFilter==='doneToday';
    const entries=isHistory?filteredTodayHistory():filteredTasks();
    node.innerHTML=entries.length
      ?'<div class="task-table">'+(isHistory?entries.map(historyRow):entries.map(t=>choreRow(t))).join('')+'</div>'
      :empty(isHistory?'Nessun completamento oggi':'Nessuna attività trovata',
        isHistory?'Completa una faccenda per visualizzarla nello storico di oggi.':'Prova a cambiare filtro oppure aggiungi una nuova faccenda.',
        isHistory?'':btnAdd());
  }
  function renderTasks(){
    const filters=[['all','Tutte'],['today','Da fare oggi'],['upcoming','In programma'],['overdue','In ritardo'],['doneToday','Completate oggi'],['done','Completate']];
    const personSelect='<label class="family-member-filter">Assegnata a <select id="task-member-filter" aria-label="Filtra attività per persona">'
      +'<option value="all"'+(memberFilter==='all'?' selected':'')+'>Tutte le persone</option>'
      +db.members.map(m=>'<option value="'+esc(m.id)+'"'+(memberFilter===m.id?' selected':'')+'>'+esc(m.name)+'</option>').join('')
      +'</select></label>';
    return header('Le tue attività','Tutte le faccende, organizzate in un unico posto.',
      '<button class="btn btn-soft" data-action="open-routines">'+ico('sparkle')+' Routine pronte</button>'+btnAdd())
      +'<section class="panel"><div class="filters">'
      +filters.map(([k,v])=>'<button data-action="filter" data-filter="'+k+'" class="filter-chip '+(taskFilter===k?'active':'')+'">'+v+'</button>').join('')
      +personSelect
      +'<label class="search-wrap">'+ico('search')
      +'<input id="task-search" type="search" placeholder="Cerca attività o ambiente..." value="'+esc(taskSearch)+'" aria-label="Cerca attività"></label>'
      +'</div><div id="task-results"></div></section>';
  }
  function projectedOn(day){const today=TODAY();if(day<today)return[];const result=[];for(const t of db.chores){if(t.done)continue;if(t.dueDate===day||(day===today&&t.dueDate<today)){result.push(t);continue;}if(t.dueDate>day||t.repeat.freq==='none')continue;let probe=t.dueDate,steps=0;while(probe<day&&steps++<1600){probe=nextDate(probe,t.repeat);}if(probe===day)result.push(t);}return result;}
  function completedOn(day){return db.history.filter(h=>dateKey(h.completedAt)===day);}
  function calendarDays(){const start=`${monthCursor}-01`,first=dUTC(start).getUTCDay(),firstOffset=(first+6)%7,gridStart=plusDays(start,-firstOffset),days=[];
    for(let i=0;i<42;i++){const day=plusDays(gridStart,i);const inMonth=day.slice(0,7)===monthCursor;const planned=projectedOn(day),done=completedOn(day);days.push(`<button type="button" class="calendar-day ${!inMonth?'outside':''} ${day===TODAY()?'is-today':''} ${day===selectedDay?'selected':''}" data-action="pick-day" data-day="${day}" aria-label="${esc(prettyWeek(day))}, ${planned.length} previste, ${done.length} completate"><span class="calendar-number">${Number(day.slice(-2))}</span><span class="calendar-dots">${planned.slice(0,3).map(()=>'<i></i>').join('')}${done.slice(0,3).map(()=>'<i class="completed-dot"></i>').join('')}</span>${planned.length+done.length?`<span class="calendar-count">${planned.length+done.length} att.</span>`:''}</button>`);}return days.join('');}
  function dayAgenda(){const planned=sortedTasks(projectedOn(selectedDay)),history=completedOn(selectedDay);return `<div class="date-panel-head">${esc(prettyWeek(selectedDay))}</div>${planned.length?`<div class="calendar-agenda">${planned.map(t=>choreRow(t,{noBadge:true})).join('')}</div>`:empty('Nessuna attività prevista','Seleziona un altro giorno o programma una nuova faccenda.')}${history.length?`<h4 class="section-title">Completate in questa data</h4>${history.map(historyRow).join('')}`:''}`;}
  function renderCalendar(){const monthLabel=new Intl.DateTimeFormat('it-IT',{month:'long',year:'numeric'}).format(new Date(`${monthCursor}-01T12:00:00`));return `${header('Calendario delle faccende','Una visione chiara dei tuoi impegni domestici.',btnAdd())}<div class="calendar-shell"><section class="panel"><div class="calendar-head"><h3>${esc(monthLabel)}</h3><div class="calendar-controls"><button class="btn-icon" data-action="month-prev" aria-label="Mese precedente">${ico('chevron-left')}</button><button class="btn btn-sm btn-outline" data-action="month-today">Oggi</button><button class="btn-icon" data-action="month-next" aria-label="Mese successivo">${ico('chevron-right')}</button></div></div><div class="calendar-weekdays">${['Lun','Mar','Mer','Gio','Ven','Sab','Dom'].map(x=>`<span>${x}</span>`).join('')}</div><div class="calendar-days">${calendarDays()}</div><p class="footer-note">Pallini viola: attività previste · Verdi: completate. Le ricorrenze future sono proiezioni, non attività già registrate.</p></section><section class="panel"><div class="panel-head"><h3>Dettaglio del giorno</h3>${pill(selectedDay===TODAY()?'Oggi':'Selezionato','today')}</div><div id="day-agenda">${dayAgenda()}</div></section></div>`;}
  function renderRooms(){return `${header('Gli ambienti di casa','Organizza le faccende stanza per stanza.',`<button class="btn btn-primary" data-action="new-room">${ico('plus')} Nuovo ambiente</button>`)}<div class="room-grid">${db.rooms.map(r=>{const tasks=db.chores.filter(t=>t.roomId===r.id&&!t.done);return `<button class="room-card" data-action="open-room" data-id="${esc(r.id)}"><span class="room-card-icon" style="background:${esc(r.color)}">${esc(r.emoji)}</span><strong>${esc(r.name)}</strong><small>${tasks.length} ${tasks.length===1?'attività aperta':'attività aperte'}</small><div class="room-card-bar"><span style="width:${Math.min(tasks.length*20,100)}%"></span></div></button>`;}).join('')}</div>${!db.rooms.length?empty('Nessun ambiente','Crea il primo ambiente per organizzare le attività.'):''}`;}
  function renderRoomDetail(){const room=roomById(currentRoom);if(!room){currentRoom=null;return renderRooms();}const tasks=sortedTasks(db.chores.filter(t=>t.roomId===room.id));return `<div class="page-heading"><div><button class="text-button" data-action="rooms-back">${ico('chevron-left')} Tutti gli ambienti</button><h2><span>${esc(room.emoji)}</span> ${esc(room.name)}</h2><p>${tasks.filter(x=>!x.done).length} attività aperte</p></div><div class="heading-actions"><button class="btn btn-outline" data-action="edit-room" data-id="${esc(room.id)}">${ico('pencil')} Modifica</button><button class="btn btn-primary" data-action="new-task" data-room="${esc(room.id)}">${ico('plus')} Attività</button></div></div><section class="panel">${tasks.length?tasks.map(choreRow).join(''):empty('Tutto in ordine','Non ci sono ancora faccende per questo ambiente.',btnAdd())}</section>`;}
  function renderStats(){
    const m=completionMetrics(statsPeriod),r=reminderBuckets();
    const range='<div class="stats-range" role="group" aria-label="Intervallo statistiche">'
      +[7,30].map(n=>'<button type="button" class="stats-range-btn'+(statsPeriod===n?' active':'')
        +'" data-action="stats-range" data-days="'+n+'" aria-pressed="'+(statsPeriod===n?'true':'false')+'">'
        +(n===7?'7 giorni':'30 giorni')+'</button>').join('')+'</div>';
    return header('Le tue statistiche','Completamenti registrati, tempo stimato e andamento nel periodo.',range)
      +'<section class="stats-grid">'
      +'<div class="stat-card"><div class="stat-top"><span class="stat-icon tint-green">'+ico('check')+'</span></div>'
      +'<div class="stat-number">'+m.completed+'</div><div class="stat-name">Completamenti · '+m.days+' giorni</div></div>'
      +'<div class="stat-card"><div class="stat-top"><span class="stat-icon tint-purple">'+ico('clock')+'</span></div>'
      +'<div class="stat-number">'+esc(metricMinutes(m.minutes))+'</div><div class="stat-name">Tempo stimato delle attività fatte</div></div>'
      +'<div class="stat-card"><div class="stat-top"><span class="stat-icon tint-amber">'+ico('calendar')+'</span></div>'
      +'<div class="stat-number">'+m.activeDays+'</div><div class="stat-name">Giorni con almeno un completamento</div></div>'
      +'</section><div class="content-grid">'
      +'<section class="panel"><div class="panel-head"><h3>Andamento dei completamenti</h3><small>'
      +(m.days===7?'Giorno per giorno':'Gruppi di 5 giorni')+'</small></div>'
      +renderStatsBars(m)
      +'<p class="footer-note">I completamenti sono attribuiti alla data effettiva di registrazione, anche per le attività ricorrenti.</p></section>'
      +'<section class="panel"><div class="panel-head"><h3>Attività per ambiente</h3><small>Completate nel periodo</small></div>'
      +(m.roomCounts.length?m.roomCounts.map(x=>{
        const room=roomById(x.id);
        return '<div class="stats-room-row"><div class="stats-room-title"><span>'
          +esc((room?.emoji||'🏠')+' '+(room?.name||x.name))+'</span><span>'+x.count+'</span></div>'
          +'<div class="stats-track"><i style="width:'+Math.round(x.count/Math.max(1,m.completed)*100)+'%"></i></div></div>';
      }).join(''):empty('Nessun completamento','Completa qualche faccenda per vedere il grafico.'))
      +'<p class="footer-note">Le durate sono stimate in base ai minuti associati alle attività; non rappresentano ore misurate.</p></section>'
      +'</div><section class="panel stats-reminders-link"><div><strong>Scadenze da controllare</strong>'
      +'<p>'+r.overdue.length+' in ritardo · '+r.today.length+' oggi · '+r.soon.length+' nei prossimi tre giorni</p></div>'
      +'<button class="btn btn-soft" data-action="nav" data-page="reminders">'+ico('bell')+' Centro promemoria</button></section>';
  }
  function renderPeople(){
    const f=familyMetrics(),total=f.assignedOpen,active=f.rows.filter(r=>r.open.length).length;
    const top=header('La tua famiglia','Organizza e distribuisci le faccende tra le persone di casa.',
      '<button class="btn btn-primary" data-action="new-person">'+ico('plus')+' Aggiungi persona</button>');
    const stats='<div class="family-stat-grid"><div class="family-small-stat"><strong>'+f.rows.length+'</strong><span>Persone</span></div>'
      +'<div class="family-small-stat"><strong>'+f.openCount+'</strong><span>Attività aperte</span></div>'
      +'<div class="family-small-stat"><strong>'+f.dueCount+'</strong><span>Da fare oggi e arretrate</span></div>'
      +'<div class="family-small-stat"><strong>'+f.completed7+'</strong><span>Completate · 7 giorni</span></div></div>';
    const workload='<section class="panel family-workload"><div class="panel-head"><h3>Distribuzione delle attività aperte</h3>'
      +'<small>'+active+' persone con attività assegnate</small></div>'
      +f.rows.map(r=>{
        const percent=total?Math.round(100*r.open.length/total):0;
        return '<div class="family-load-row"><span class="family-load-name">'+esc(r.member.name)+'</span>'
          +'<span class="family-load-track"><i style="width:'+percent+'%;background:'+esc(r.member.color||'#d8d0f1')+'"></i></span>'
          +'<span class="family-load-number">'+r.open.length+'</span></div>';
      }).join('')
      +'<p class="footer-note">Conteggio delle attività attualmente aperte, non misura di equità né proiezione di tutte le ricorrenze future.</p></section>';
    const cards='<section class="family-person-grid">'
      +f.rows.map(r=>{
        const m=r.member;
        return '<article class="panel family-person-card"><div class="family-person-head"><span class="person-bubble" style="background:'
          +esc(m.color||'#eee6fc')+'">'+esc((m.name||'?').slice(0,2).toUpperCase())+'</span>'
          +'<div class="family-person-heading"><h3>'+esc(m.name)+'</h3><small>'+(m.isOwner?'Profilo principale':'Persona di casa')+'</small></div>'
          +'<button type="button" class="btn-icon" data-action="edit-person" data-id="'+esc(m.id)+'" aria-label="Modifica '+esc(m.name)+'">'
          +ico('pencil')+'</button></div>'
          +'<div class="family-person-metrics"><span><strong>'+r.open.length+'</strong> Da fare</span>'
          +'<span><strong>'+r.overdue.length+'</strong> In ritardo</span>'
          +'<span><strong>'+r.completed.length+'</strong> Fatte · 7 gg</span></div>'
          +'<p class="family-person-estimate">Entro 7 giorni (incluse arretrate): '+r.week.length
          +' attività · '+esc(metricMinutes(r.minutes))+' stimati</p>'
          +'<h4 class="family-person-section-title">Prossime attività assegnate</h4>'
          +(r.open.length?'<ul class="family-task-list">'+r.open.slice(0,4).map(familyTaskLine).join('')+'</ul>'
            :'<p class="family-no-tasks">Nessuna attività aperta assegnata.</p>')
          +(r.open.length>4?'<p class="family-more">Altre '+(r.open.length-4)+' attività nell’elenco completo.</p>':'')
          +'<div class="family-person-actions"><button type="button" class="btn btn-outline btn-sm" data-action="family-view-tasks" data-id="'+esc(m.id)+'">Tutte le attività</button>'
          +'<button type="button" class="btn btn-soft btn-sm" data-action="family-new-task" data-id="'+esc(m.id)+'">'+ico('plus')+' Assegna attività</button></div></article>';
      }).join('')+'</section>';
    return top+stats
      +'<div class="notice family-privacy-notice">'+ico('shield')+'<div><strong>Gestione familiare locale</strong><br>'
      +'Tutte le persone e le assegnazioni sono gestite su questo dispositivo. Non sono presenti account, inviti o sincronizzazione tra dispositivi.</div></div>'
      +workload
      +(f.unassigned.length?'<div class="notice family-unassigned">'+ico('alert')+'<div>'
        +f.unassigned.length+' attività hanno una persona assegnata non più presente. Apri le Attività e correggi l’assegnazione.</div></div>':'')
      +cards;
  }
  function renderSettings(){return `${header('Impostazioni','Personalizza CasaFacile e proteggi i tuoi dati.')}<div class="content-grid"><section class="panel"><div class="setting-group"><h3>Il tuo profilo</h3><p>Personalizza il messaggio di benvenuto e il nome della casa.</p><form id="settings-form" class="form-grid"><div class="field"><label for="display-name">Come vuoi essere chiamato?</label><input id="display-name" name="displayName" maxlength="32" value="${esc(db.settings.displayName||'')}" placeholder="Il tuo nome"></div><div class="field"><label for="home-name">Nome della casa</label><input id="home-name" name="homeName" maxlength="48" required value="${esc(db.household.name)}"></div><div class="field full"><button type="submit" class="btn btn-primary" style="align-self:flex-start">${ico('check')} Salva preferenze</button></div></form></div><div class="setting-group"><h3>Organizzazione</h3><div class="setting-row"><div><strong>Ambienti</strong><small>Personalizza gli spazi della casa</small></div><button class="btn btn-outline btn-sm" data-action="nav" data-page="rooms">Gestisci</button></div><div class="setting-row"><div><strong>Routine preimpostate</strong><small>24 faccende pronte, aggiungi solo quelle che vuoi</small></div><button class="btn btn-outline btn-sm" data-action="open-routines">Scegli</button></div><div class="setting-row"><div><strong>Famiglia</strong><small>Responsabilità e assegnazioni locali</small></div><button class="btn btn-outline btn-sm" data-action="nav" data-page="people">Gestisci</button></div><div class="setting-row"><div><strong>Centro promemoria</strong><small>Attività arretrate, di oggi e dei prossimi 3 giorni</small></div><button class="btn btn-outline btn-sm" data-action="nav" data-page="reminders">Visualizza</button></div><div class="setting-row"><div><strong>Statistiche</strong><small>Andamento delle faccende completate</small></div><button class="btn btn-outline btn-sm" data-action="nav" data-page="stats">Visualizza</button></div></div></section><section class="panel"><div class="setting-group"><h3>Backup e ripristino</h3><p>Le informazioni sono salvate soltanto in questo browser. Il backup manuale è necessario per trasferirle o recuperarle.</p><div class="action-row"><button class="btn btn-primary" data-action="export">${ico('download')} Esporta backup</button><button class="btn btn-outline" data-action="import">${ico('upload')} Importa backup</button></div><div class="footer-note">Il file JSON include ambienti, persone, faccende e storico; se disponibile, contiene una verifica di integrità SHA-256.</div>${localStorage.getItem(ROLLBACK_KEY)?`<div class="setting-row"><div><strong>Annulla l'ultima importazione</strong><small>Ripristina i dati precedenti all'ultimo import.</small></div><button class="btn btn-outline btn-sm" data-action="restore-import">Ripristina</button></div>`:''}</div><div class="setting-group"><h3>Dati e versione</h3><div class="setting-row"><div><strong>Versione</strong><small>CasaFacile ${VERSION}</small></div><span class="version">PWA</span></div><div class="setting-row"><div><strong>Archivio</strong><small>${db.chores.length} attività · ${db.history.length} completamenti</small></div><span class="version">Locale</span></div><div class="setting-row"><div><strong>Modalità</strong><small>Predisposta per account e cloud futuri</small></div><span class="version">Personale</span></div></div><div class="notice">${ico('shield')}<div><strong>Privacy by design.</strong><br>Nessuna registrazione, pubblicità, analytics o trasferimento dei dati a un server in questa versione. Non cancellare i dati di Safari senza aver prima esportato un backup.</div></div><div class="footer-note">Ideato e sviluppato da <strong>SEGNOTA Studio</strong>.</div></section></div>`;}
  function render(){page=pageFromHash();if(memberFilter!=='all'&&!memberById(memberFilter))memberFilter='all';renderNavigation();const names={dashboard:'Panoramica',tasks:'Attività',calendar:'Calendario',rooms:'Ambienti',stats:'Statistiche',reminders:'Promemoria',people:'Famiglia',settings:'Impostazioni'};el('page-title').textContent=names[page];el('date-label').textContent=prettyWeek(TODAY());el('avatar').textContent=(db.settings.displayName||'IO').slice(0,2).toUpperCase();el('mobile-fab').classList.toggle('hidden',page==='tasks'||page==='dashboard');let html='';switch(page){case'dashboard':html=renderDashboard();break;case'tasks':html=renderTasks();break;case'calendar':html=renderCalendar();break;case'rooms':html=currentRoom?renderRoomDetail():renderRooms();break;case'stats':html=renderStats();break;case'reminders':html=renderReminders();break;case'people':html=renderPeople();break;case'settings':html=renderSettings();break;}el('content').innerHTML=(page==='dashboard'?'':backButton())+html;if(page==='tasks')renderTaskResults();}
  function nextDate(date,repeat){if(repeat.freq==='none')return null;const n=Math.max(1,Math.min(365,Number(repeat.interval)||1));if(repeat.freq==='daily')return plusDays(date,n);if(repeat.freq==='weekly')return plusDays(date,n*7);return plusMonths(date,n,repeat.anchorDay||Number(date.slice(-2)));}
  function afterCompletion(t){let next=nextDate(t.dueDate,t.repeat),loops=0;while(next&&next<=TODAY()&&loops++<2000)next=nextDate(next,t.repeat);return next;}
  function completeTask(id){const t=db.chores.find(x=>x.id===id);if(!t||t.done)return;const event={id:uid(),taskId:t.id,householdId:db.household.id,title:t.title,roomId:t.roomId,roomName:roomById(t.roomId)?.name||'Altro',memberId:t.memberId,memberName:memberById(t.memberId)?.name||'Io',minutes:t.minutes||0,plannedDate:t.dueDate,completedAt:nowISO()};const next=afterCompletion(t);if(next){t.dueDate=next;}else{t.done=true;t.completedAt=event.completedAt;}t.updatedAt=nowISO();db.history.push(event);completionToken=event.id;save();render();toast(next?`Completata! Prossima scadenza: ${prettyDate(next)}`:'Attività completata.');}
  function reopenTask(id){const t=db.chores.find(x=>x.id===id);if(!t||!t.done)return;const ix=db.history.findLastIndex(h=>h.taskId===id);if(ix>=0)db.history.splice(ix,1);t.done=false;t.completedAt=null;t.updatedAt=nowISO();save();render();toast('Attività riaperta.');}
  function undoLastCompletion(eventId){const event=db.history.find(h=>h.id===eventId);if(!event)return false;const task=db.chores.find(t=>t.id===event.taskId);const latest=[...db.history].reverse().find(h=>h.taskId===event.taskId);if(!task||latest?.id!==event.id)return false;task.done=false;task.completedAt=null;task.dueDate=event.plannedDate;db.history=db.history.filter(h=>h.id!==eventId);save();render();return true;}
  // Adatta la finestra alla porzione realmente visibile dello schermo, anche con tastiera iOS.
  function syncModalViewport(){
    const backdrop=el('modal-root').querySelector('.modal-backdrop');
    if(!backdrop)return;
    const v=window.visualViewport;
    if(v){
      backdrop.style.setProperty('--modal-viewport-height',`${Math.round(v.height)}px`);
      backdrop.style.setProperty('--modal-viewport-top',`${Math.round(v.offsetTop)}px`);
    }
  }
  function modal(content,small=false){
    const root=el('modal-root');
    root.innerHTML=`<div class="modal-backdrop" data-action="close-backdrop"><div class="modal ${small?'modal-sm':''}" role="dialog" aria-modal="true" aria-label="Finestra di CasaFacile">${content}</div></div>`;
    const dialog=root.querySelector('.modal');
    const form=dialog.querySelector('#task-form');
    if(form){
      dialog.classList.add('task-modal');
      const actions=form.querySelector('.modal-bottom');
      if(actions){
        const field=actions.parentElement;
        const submit=actions.querySelector('button[type="submit"]');
        if(submit)submit.setAttribute('form',form.id);
        const footer=document.createElement('div');
        footer.className='modal-sticky-actions';
        footer.appendChild(actions);
        dialog.appendChild(footer);
        if(field && !field.textContent.trim())field.remove();
      }
    }
    document.body.style.overflow='hidden';
    syncModalViewport();
    // Non mettere il focus su un input quando il modulo viene aperto:
    // su iPhone provocherebbe apertura della tastiera e possibile zoom.
    if(window.matchMedia && window.matchMedia('(pointer:fine)').matches){
      dialog.querySelector('.modal-head .btn-icon')?.focus({preventScroll:true});
    }
  }
  function closeModal(){el('modal-root').innerHTML='';document.body.style.overflow='';pendingImport=null;}
  function modalHead(title,description=''){return `<div class="modal-head"><div><h2>${esc(title)}</h2>${description?`<p>${esc(description)}</p>`:''}</div><button type="button" class="btn-icon" data-action="close-modal" aria-label="Chiudi finestra">${ico('x')}</button></div>`;}
  function openTaskModal(id=null,roomId=null,preferredMemberId=null){const task=db.chores.find(t=>t.id===id),repeat=task?.repeat||{freq:'none',interval:1};modal(`${modalHead(task?'Modifica attività':'Nuova attività',task?'Aggiorna i dettagli della faccenda.':'Organizza un compito per la tua casa.')}<form id="task-form" data-id="${task?esc(task.id):''}" class="form-grid">
      <div class="field full"><label for="t-title">Nome dell'attività *</label><input id="t-title" name="title" type="text" maxlength="100" required placeholder="Es. Pulire il bagno" value="${esc(task?.title||'')}"></div>
      <div class="field"><label for="t-room">Ambiente *</label><select id="t-room" name="roomId" required>${db.rooms.map(r=>`<option value="${esc(r.id)}" ${r.id===(task?.roomId||roomId)?'selected':''}>${esc(r.emoji)} ${esc(r.name)}</option>`).join('')}</select></div>
      <div class="field"><label for="t-person">Assegnata a</label><select id="t-person" name="memberId">${db.members.map(m=>`<option value="${esc(m.id)}" ${m.id===(task?.memberId||preferredMemberId||db.members[0]?.id)?'selected':''}>${esc(m.name)}</option>`).join('')}</select></div>
      <div class="field"><label for="t-date">Prima scadenza *</label><input id="t-date" type="date" name="dueDate" required value="${esc(task?.dueDate||TODAY())}"></div>
      <div class="field"><label for="t-minutes">Durata stimata (min)</label><input id="t-minutes" name="minutes" type="number" min="0" max="1440" step="5" value="${esc(task?.minutes??20)}"></div>
      <div class="field"><label for="t-repeat">Ripetizione</label><select id="t-repeat" name="freq"><option value="none" ${repeat.freq==='none'?'selected':''}>Una volta sola</option><option value="daily" ${repeat.freq==='daily'?'selected':''}>Giornaliera</option><option value="weekly" ${repeat.freq==='weekly'?'selected':''}>Settimanale</option><option value="monthly" ${repeat.freq==='monthly'?'selected':''}>Mensile</option></select></div>
      <div class="field ${repeat.freq==='none'?'hidden':''}" id="interval-wrapper"><label for="t-interval">Ogni quante volte?</label><input id="t-interval" name="interval" type="number" min="1" max="365" required value="${esc(repeat.interval||1)}"><span class="field-help">Es. 2 = ogni 2 settimane, se scegli settimanale.</span></div>
      <div class="field full"><label for="t-priority">Priorità</label><select id="t-priority" name="priority"><option value="low" ${task?.priority==='low'?'selected':''}>Bassa</option><option value="medium" ${!task||task.priority==='medium'?'selected':''}>Normale</option><option value="high" ${task?.priority==='high'?'selected':''}>Alta</option></select></div>
      <div class="field full"><label for="t-notes">Note (opzionali)</label><textarea id="t-notes" name="notes" maxlength="1000" placeholder="Detergenti, istruzioni, piccoli dettagli...">${esc(task?.notes||'')}</textarea></div>
      ${task?`<div class="field full"><button type="button" class="btn btn-danger btn-sm" style="align-self:flex-start" data-action="delete-task" data-id="${esc(task.id)}">${ico('trash')} Elimina attività</button></div>`:''}
      <div class="field full"><div class="modal-bottom"><button type="button" class="btn btn-outline" data-action="close-modal">Annulla</button><button class="btn btn-primary" type="submit">${ico('check')} ${task?'Salva modifiche':'Crea attività'}</button></div></div>
    </form>`);
    if(!db.rooms.length){closeModal();toast('Prima crea un ambiente.','error');go('rooms');}
  }
  function saveTask(form){const formData=new FormData(form),id=form.dataset.id;const original=db.chores.find(t=>t.id===id);const title=String(formData.get('title')||'').trim().slice(0,100),dueDate=String(formData.get('dueDate')||''),roomId=String(formData.get('roomId')||''),memberId=String(formData.get('memberId')||'');const freq=String(formData.get('freq')||'none');const interval=Number(formData.get('interval'))||1;const minutes=Number(formData.get('minutes'));
    if(!title||!validDate(dueDate)||!roomById(roomId)||!memberById(memberId)||!['none','daily','weekly','monthly'].includes(freq)||interval<1||interval>365||!Number.isInteger(interval)||!Number.isFinite(minutes)||minutes<0||minutes>1440){toast('Controlla i campi prima di salvare.','error');return;}
    const repeat={freq,interval,anchorDay:Number(dueDate.slice(-2))};const update={title,dueDate,roomId,memberId,minutes,repeat,priority:['low','medium','high'].includes(formData.get('priority'))?formData.get('priority'):'medium',notes:String(formData.get('notes')||'').trim().slice(0,1000),done:original?.done||false,completedAt:original?.completedAt||null,updatedAt:nowISO()};
    if(original)Object.assign(original,update);else db.chores.push({id:uid(),householdId:db.household.id,createdAt:nowISO(),...update});save();closeModal();render();toast(original?'Attività aggiornata.':'Attività aggiunta.');}
  function deleteTask(id){const task=db.chores.find(t=>t.id===id);if(!task)return;if(!confirm(`Eliminare «${task.title}»? Lo storico delle attività già completate verrà conservato.`))return;db.chores=db.chores.filter(t=>t.id!==id);save();closeModal();render();toast('Attività eliminata.');}
  function openRoomModal(id=null){const room=roomById(id);modal(`${modalHead(room?'Modifica ambiente':'Nuovo ambiente')}<form id="room-form" data-id="${room?esc(room.id):''}" class="form-grid"><div class="field full"><label for="r-name">Nome ambiente *</label><input id="r-name" name="name" required maxlength="40" placeholder="Es. Terrazzo" value="${esc(room?.name||'')}"></div><div class="field"><label for="r-emoji">Icona emoji</label><input id="r-emoji" name="emoji" maxlength="8" value="${esc(room?.emoji||'🏡')}"></div><div class="field"><label for="r-color">Colore</label><select id="r-color" name="color">${ROOM_COLORS.map((c,i)=>`<option value="${c}" ${c===room?.color?'selected':''}>${['Lavanda','Menta','Rosa','Pesca','Azzurro','Lilla','Sabbia'][i]}</option>`).join('')}</select></div>${room?`<div class="field full"><button type="button" class="btn btn-danger btn-sm" style="align-self:flex-start" data-action="delete-room" data-id="${esc(room.id)}">${ico('trash')} Elimina ambiente</button></div>`:''}<div class="field full"><div class="modal-bottom"><button type="button" class="btn btn-outline" data-action="close-modal">Annulla</button><button class="btn btn-primary" type="submit">Salva ambiente</button></div></div></form>`,true);}
  function saveRoom(form){const fd=new FormData(form),name=String(fd.get('name')||'').trim().slice(0,40);if(!name){toast('Indica un nome per la stanza.','error');return;}const original=roomById(form.dataset.id);if(db.rooms.some(r=>r.name.toLocaleLowerCase('it')===name.toLocaleLowerCase('it')&&r.id!==original?.id)){toast('Esiste già un ambiente con questo nome.','error');return;}const values={name,emoji:String(fd.get('emoji')||'🏡').slice(0,8),color:ROOM_COLORS.includes(fd.get('color'))?fd.get('color'):palette(db.rooms.length)};if(original)Object.assign(original,values);else db.rooms.push({id:uid(),...values});save();closeModal();render();toast('Ambiente salvato.');}
  function deleteRoom(id){const room=roomById(id);if(!room)return;const associated=db.chores.filter(t=>t.roomId===id).length;if(associated){alert(`L'ambiente contiene ${associated} attività. Spostale o eliminale prima di cancellarlo.`);return;}if(db.rooms.length<=1){toast('Deve esistere almeno un ambiente.','error');return;}if(!confirm(`Eliminare l'ambiente «${room.name}»?`))return;db.rooms=db.rooms.filter(r=>r.id!==id);currentRoom=null;save();closeModal();render();toast('Ambiente eliminato.');}
  function openPersonModal(id=null){const p=memberById(id);modal(`${modalHead(p?'Modifica persona':'Aggiungi persona','Assegnazioni locali, non condivise online.')}<form id="person-form" data-id="${p?esc(p.id):''}" class="form-grid"><div class="field full"><label for="p-name">Nome *</label><input id="p-name" required name="name" maxlength="32" placeholder="Es. Giulia" value="${esc(p?.name||'')}"></div>${p&&!p.isOwner?`<div class="field full"><button type="button" class="btn btn-danger btn-sm" data-action="delete-person" data-id="${esc(p.id)}">${ico('trash')} Elimina persona</button></div>`:''}<div class="field full"><div class="modal-bottom"><button type="button" class="btn btn-outline" data-action="close-modal">Annulla</button><button type="submit" class="btn btn-primary">Salva persona</button></div></div></form>`,true);}
  function savePerson(form){const name=String(new FormData(form).get('name')||'').trim().slice(0,32);if(!name){toast('Inserisci il nome.','error');return;}const p=memberById(form.dataset.id);if(p)p.name=name;else db.members.push({id:uid(),name,color:palette(db.members.length),isOwner:false});save();closeModal();render();toast('Persona salvata.');}
  function deletePerson(id){const p=memberById(id);if(!p||p.isOwner)return;const associated=db.chores.filter(t=>t.memberId===id).length;if(associated){alert(`Questa persona ha ${associated} attività assegnate. Riassegnale prima di eliminarla.`);return;}if(!confirm(`Eliminare «${p.name}» dall'elenco locale?`))return;db.members=db.members.filter(x=>x.id!==id);save();closeModal();render();toast('Persona eliminata.');}
  async function sha256(txt){if(!globalThis.crypto?.subtle)return null;const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(txt));return [...new Uint8Array(digest)].map(x=>x.toString(16).padStart(2,'0')).join('');}
  async function exportDB(){const payload=JSON.parse(JSON.stringify(db));const proof=await sha256(JSON.stringify(payload));const file={format:'CasaFacile-Backup',exportedAt:nowISO(),appVersion:VERSION,hashAlgorithm:proof?'SHA-256':null,hash:proof,payload};const blob=new Blob([JSON.stringify(file,null,2)],{type:'application/json'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=`CasaFacile_backup_${TODAY()}.json`;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),60000);toast('Backup creato: conserva il file in un luogo sicuro.');}
  async function prepareImport(file){if(!file)return;try{if(file.size>25*1024*1024)throw Error('File troppo grande (massimo 25 MB).');const obj=JSON.parse(await file.text());if(obj.format!=='CasaFacile-Backup'||!validDB(obj.payload))throw Error('Il file non è un backup CasaFacile 1.0 valido.');if(obj.hashAlgorithm&&obj.hashAlgorithm!=='SHA-256')throw Error('Algoritmo di verifica sconosciuto.');if(obj.hashAlgorithm==='SHA-256'){const proof=await sha256(JSON.stringify(obj.payload));if(!proof)throw Error('Verifica SHA-256 non disponibile in questo browser.');if(proof!==obj.hash)throw Error('Il file è danneggiato: hash non corrispondente.');}pendingImport=obj.payload;modal(`${modalHead('Ripristinare questo backup?','Controlla le informazioni prima di procedere.')}<div class="notice">${ico('alert')}<div><strong>Attenzione: il ripristino sostituirà tutti i dati attuali.</strong><br>La copia precedente sarà conservata temporaneamente sul dispositivo, finché non effettuerai un'altra importazione.</div></div><div class="setting-row"><strong>Attività nel backup</strong><span>${obj.payload.chores.length}</span></div><div class="setting-row"><strong>Completamenti</strong><span>${obj.payload.history.length}</span></div><div class="setting-row"><strong>Casa</strong><span>${esc(obj.payload.household.name)}</span></div><div class="setting-row"><strong>Creato il</strong><span>${esc(dateTime(obj.exportedAt||nowISO()))}</span></div><div class="modal-bottom"><button class="btn btn-outline" data-action="close-modal">Annulla</button><button class="btn btn-danger" data-action="confirm-import">Sostituisci i dati</button></div>`,true);}catch(e){toast(`Importazione non riuscita: ${e.message}`,'error');}finally{el('import-file').value='';}}
  function confirmImport(){if(!pendingImport)return;try{localStorage.setItem(ROLLBACK_KEY,JSON.stringify(db));const copy=JSON.parse(JSON.stringify(pendingImport));repository.save(copy);db=copy;closeModal();taskFilter='all';memberFilter='all';currentRoom=null;monthCursor=TODAY().slice(0,7);go('dashboard');render();toast('Backup ripristinato correttamente.');}catch(e){toast('Non riesco a salvare il backup importato.','error');console.error(e);}}
  function restoreImport(){const raw=localStorage.getItem(ROLLBACK_KEY);if(!raw)return;try{const old=JSON.parse(raw);if(!validDB(old))throw Error();if(!confirm('Ripristinare la copia precedente all’ultima importazione? I dati attuali verranno sostituiti.'))return;const current=JSON.stringify(db);repository.save(old);localStorage.setItem(ROLLBACK_KEY,current);db=old;memberFilter='all';currentRoom=null;go('dashboard');render();toast('Dati precedenti ripristinati.');}catch{toast('Impossibile ripristinare la copia precedente.','error');}}

  /* CasaFacile 1.1 — catalogo di routine locali, senza migrazione del database. */
  const ROUTINE_GROUPS = [{"id":"daily","title":"Ogni giorno","note":"Piccole attività per mantenere la casa in ordine"},{"id":"weekly","title":"Ogni settimana","note":"Pulizie ricorrenti distribuite durante la settimana"},{"id":"monthly","title":"Ogni mese","note":"Interventi periodici con un giorno indicativo"},{"id":"quarterly","title":"Ogni tre mesi","note":"Pulizie approfondite a cadenza trimestrale"}];
  const ROUTINE_CATALOG = [{"group":"daily","id":"daily-dishes","title":"Lavare i piatti","room":"cucina","freq":"daily","interval":1,"minutes":15,"weekday":null,"monthday":null,"priority":"medium"},{"group":"daily","id":"daily-beds","title":"Rifare i letti","room":"camera","freq":"daily","interval":1,"minutes":10,"weekday":null,"monthday":null,"priority":"medium"},{"group":"daily","id":"daily-worktop","title":"Pulire il piano cucina","room":"cucina","freq":"daily","interval":1,"minutes":10,"weekday":null,"monthday":null,"priority":"medium"},{"group":"daily","id":"daily-air","title":"Arieggiare le camere","room":"camera","freq":"daily","interval":1,"minutes":10,"weekday":null,"monthday":null,"priority":"medium"},{"group":"daily","id":"daily-living-tidy","title":"Riordinare il soggiorno","room":"soggiorno","freq":"daily","interval":1,"minutes":10,"weekday":null,"monthday":null,"priority":"medium"},{"group":"daily","id":"daily-bathroom-tidy","title":"Riordinare il bagno","room":"bagno","freq":"daily","interval":1,"minutes":10,"weekday":null,"monthday":null,"priority":"medium"},{"group":"weekly","id":"weekly-bathroom-clean","title":"Pulire il bagno","room":"bagno","freq":"weekly","interval":1,"minutes":35,"weekday":0,"monthday":null,"priority":"medium"},{"group":"weekly","id":"weekly-vacuum","title":"Passare l'aspirapolvere","room":"soggiorno","freq":"weekly","interval":1,"minutes":30,"weekday":1,"monthday":null,"priority":"medium"},{"group":"weekly","id":"weekly-laundry","title":"Avviare la lavatrice","room":"lavanderia","freq":"weekly","interval":1,"minutes":20,"weekday":2,"monthday":null,"priority":"medium"},{"group":"weekly","id":"weekly-sheets","title":"Cambiare le lenzuola","room":"camera","freq":"weekly","interval":1,"minutes":25,"weekday":5,"monthday":null,"priority":"medium"},{"group":"weekly","id":"weekly-floors","title":"Lavare i pavimenti","room":"soggiorno","freq":"weekly","interval":1,"minutes":40,"weekday":4,"monthday":null,"priority":"medium"},{"group":"weekly","id":"weekly-fridge","title":"Pulire il frigorifero","room":"cucina","freq":"weekly","interval":1,"minutes":25,"weekday":5,"monthday":null,"priority":"medium"},{"group":"weekly","id":"weekly-mirrors","title":"Pulire gli specchi","room":"bagno","freq":"weekly","interval":1,"minutes":15,"weekday":3,"monthday":null,"priority":"medium"},{"group":"weekly","id":"weekly-dust","title":"Spolverare i mobili","room":"soggiorno","freq":"weekly","interval":1,"minutes":20,"weekday":1,"monthday":null,"priority":"medium"},{"group":"monthly","id":"monthly-windows","title":"Pulire i vetri","room":"altro","freq":"monthly","interval":1,"minutes":45,"weekday":null,"monthday":15,"priority":"medium"},{"group":"monthly","id":"monthly-oven","title":"Pulire il forno","room":"cucina","freq":"monthly","interval":1,"minutes":35,"weekday":null,"monthday":10,"priority":"medium"},{"group":"monthly","id":"monthly-bins","title":"Lavare e igienizzare i bidoni","room":"cucina","freq":"monthly","interval":1,"minutes":20,"weekday":null,"monthday":5,"priority":"medium"},{"group":"monthly","id":"monthly-hood","title":"Pulire i filtri della cappa","room":"cucina","freq":"monthly","interval":1,"minutes":20,"weekday":null,"monthday":20,"priority":"medium"},{"group":"monthly","id":"monthly-wardrobe","title":"Riordinare gli armadi","room":"camera","freq":"monthly","interval":1,"minutes":40,"weekday":null,"monthday":25,"priority":"medium"},{"group":"monthly","id":"monthly-tiles","title":"Pulire le fughe del bagno","room":"bagno","freq":"monthly","interval":1,"minutes":35,"weekday":null,"monthday":18,"priority":"medium"},{"group":"quarterly","id":"quarterly-curtains","title":"Lavare le tende","room":"camera","freq":"monthly","interval":3,"minutes":45,"weekday":null,"monthday":8,"priority":"medium"},{"group":"quarterly","id":"quarterly-under-furniture","title":"Pulire sotto i mobili","room":"soggiorno","freq":"monthly","interval":3,"minutes":45,"weekday":null,"monthday":14,"priority":"medium"},{"group":"quarterly","id":"quarterly-balcony","title":"Pulire balconi e terrazzi","room":"altro","freq":"monthly","interval":3,"minutes":40,"weekday":null,"monthday":7,"priority":"medium"},{"group":"quarterly","id":"quarterly-lamps","title":"Pulire lampadari e plafoniere","room":"soggiorno","freq":"monthly","interval":3,"minutes":30,"weekday":null,"monthday":21,"priority":"medium"}];
  let routineSelection = new Set();

  function normalizedRoutineName(s){
    return String(s||'').toLocaleLowerCase('it-IT').trim().replace(/\s+/g,' ');
  }
  function routineRoomFor(p){
    const names={cucina:'cucina',bagno:'bagno',camera:'camera da letto',soggiorno:'soggiorno',lavanderia:'lavanderia',altro:'altri spazi'};
    return db.rooms.find(r=>r.slug===p.room)
      ||db.rooms.find(r=>normalizedRoutineName(r.name)===names[p.room])
      ||db.rooms.find(r=>r.slug==='altro')
      ||db.rooms[0];
  }
  function routineAlreadyExists(p){
    const room=routineRoomFor(p);
    return db.chores.some(t=>t.presetId===p.id || (
      t.roomId===room?.id && normalizedRoutineName(t.title)===normalizedRoutineName(p.title)
    ));
  }
  function routineFirstDue(p,today=TODAY()){
    if(p.freq==='daily')return today;
    if(p.freq==='weekly'){
      const current=(dUTC(today).getUTCDay()+6)%7;
      return plusDays(today,((p.weekday??0)-current+7)%7);
    }
    const first=today.slice(0,7)+'-01';
    const inMonth=plusMonths(first,0,p.monthday||1);
    return inMonth<today ? plusMonths(first,1,p.monthday||1) : inMonth;
  }
  function renderRoutineItem(p){
    const room=routineRoomFor(p),exists=routineAlreadyExists(p);
    const due=routineFirstDue(p);
    const meta=(room?.emoji||'🏠')+' '+(room?.name||'Altro')
      +' · '+p.minutes+' min · Prima: '+prettyDate(due,{day:'numeric',month:'short'});
    return '<label class="routine-option'+(exists?' is-existing':'')+'">'
      +'<input type="checkbox" data-routine-id="'+esc(p.id)+'"'+(exists?' disabled':'')+'>'
      +'<span class="routine-option-body"><strong>'+esc(p.title)+'</strong><small>'+esc(meta)+'</small></span>'
      +(exists?'<span class="routine-existing">Già presente</span>':'')+'</label>';
  }
  function updateRoutineSelectionUI(){
    const count=routineSelection.size;
    const status=el('routine-count');
    const action=el('routine-add-selected');
    const label=el('routine-add-label');
    if(status)status.textContent=count+' selezionat'+(count===1?'a':'e');
    if(label)label.textContent=count===1?'Aggiungi 1 attività':'Aggiungi '+count+' attività';
    if(action)action.disabled=count===0;
  }
  function openRoutineLibrary(){
    if(!db.rooms.length||!db.members.length){
      toast('Crea prima un ambiente e una persona nelle Impostazioni.','error');
      return;
    }
    routineSelection=new Set();
    const count=ROUTINE_CATALOG.filter(p=>!routineAlreadyExists(p)).length;
    const sections=ROUTINE_GROUPS.map(group=>{
      const items=ROUTINE_CATALOG.filter(p=>p.group===group.id);
      return '<section class="routine-section"><div class="routine-group-head"><div><h3>'+esc(group.title)
        +'</h3><p>'+esc(group.note)+'</p></div><span class="routine-group-count">'
        +items.filter(p=>!routineAlreadyExists(p)).length+'/'+items.length
        +'</span></div>'+items.map(renderRoutineItem).join('')+'</section>';
    }).join('');
    const message=count
      ?'Scegli soltanto le faccende che ti servono. Puoi modificarle dopo averle aggiunte.'
      :'Tutte le routine disponibili risultano già presenti. Puoi modificarle dalla sezione Attività.';
    const content=modalHead('Routine preimpostate','Organizza le pulizie in pochi tocchi.')
      +'<p class="routine-intro">'+esc(message)+'</p>'
      +'<div class="routine-toolbar"><span id="routine-count" aria-live="polite">0 selezionate</span>'
      +'<div><button type="button" class="text-button" data-action="routine-all">Seleziona tutte</button>'
      +'<button type="button" class="text-button" data-action="routine-none">Deseleziona</button></div></div>'
      +'<div id="routine-catalog" class="routine-catalog">'+sections+'</div>'
      +'<div class="routine-actionbar"><div class="modal-bottom">'
      +'<button type="button" class="btn btn-outline" data-action="close-modal">Annulla</button>'
      +'<button type="button" id="routine-add-selected" class="btn btn-primary" data-action="routine-import" disabled>'
      +ico('check')+' <span id="routine-add-label">Aggiungi 0 attività</span></button></div></div>';
    modal(content);
    el('modal-root').querySelector('.modal')?.classList.add('routine-modal');
    updateRoutineSelectionUI();
  }
  function selectAllRoutines(checked){
    const boxes=document.querySelectorAll('#routine-catalog input[data-routine-id]');
    for(const input of boxes){
      if(input.disabled)continue;
      input.checked=checked;
      if(checked)routineSelection.add(input.dataset.routineId);
      else routineSelection.delete(input.dataset.routineId);
    }
    updateRoutineSelectionUI();
  }
  function importSelectedRoutines(){
    const selected=ROUTINE_CATALOG.filter(p=>routineSelection.has(p.id)&&!routineAlreadyExists(p));
    if(!selected.length){toast('Non ci sono nuove attività selezionate.','error');return;}
    if(db.chores.length+selected.length>30000){toast('È stato raggiunto il limite delle attività.','error');return;}
    const copy=JSON.parse(JSON.stringify(db));
    const stamp=nowISO();
    for(const p of selected){
      const room=routineRoomFor(p);
      if(!room)continue;
      const dueDate=routineFirstDue(p);
      copy.chores.push({
        id:uid(),householdId:copy.household.id,createdAt:stamp,updatedAt:stamp,
        title:p.title,roomId:room.id,memberId:copy.members[0].id,
        dueDate,minutes:p.minutes,repeat:{freq:p.freq,interval:p.interval,anchorDay:Number(dueDate.slice(-2))},
        priority:p.priority,notes:'',done:false,completedAt:null,presetId:p.id
      });
    }
    const added=copy.chores.length-db.chores.length;
    if(!added){toast('Nessun ambiente disponibile.','error');return;}
    copy.meta.updatedAt=stamp;
    try{repository.save(copy);}
    catch(err){toast('Salvataggio non riuscito. I dati precedenti sono invariati.','error');console.error(err);return;}
    db=copy;
    routineSelection.clear();
    closeModal();
    taskFilter='all';memberFilter='all';
    go('tasks');
    render();
    toast(added===1?'1 routine aggiunta.':added+' routine aggiunte. Puoi modificarle dalle Attività.');
  }

  function demo(){if(db.chores.length&&!confirm('Aggiungere otto attività di esempio alle attività che hai già?'))return;const examples=[['Rifare i letti',2,'daily',1,10],['Lavare i piatti',0,'daily',1,15],['Pulire il piano cucina',0,'daily',1,10],['Pulire il bagno',1,'weekly',1,35],['Passare aspirapolvere',3,'weekly',1,30],['Avviare lavatrice',4,'weekly',1,20],['Cambiare le lenzuola',2,'weekly',2,25],['Pulire i vetri',5,'monthly',1,45]];const start=TODAY();for(const [title,roomIndex,freq,interval,minutes] of examples){db.chores.push({id:uid(),householdId:db.household.id,title,roomId:db.rooms[roomIndex%db.rooms.length]?.id||db.rooms[0].id,memberId:db.members[0].id,dueDate:start,repeat:{freq,interval,anchorDay:Number(start.slice(-2))},priority:'medium',minutes,notes:'',done:false,completedAt:null,createdAt:nowISO(),updatedAt:nowISO()});}save();render();toast('Otto attività di esempio aggiunte.');}
  function toast(msg,type=''){const root=el('toast-root');root.innerHTML=`<div class="toast ${type}">${esc(msg)}</div>`;clearTimeout(toastTimer);toastTimer=setTimeout(()=>root.innerHTML='',4200);}
  document.addEventListener('click',async e=>{const b=e.target.closest('[data-action]');if(!b)return;const a=b.dataset.action,id=b.dataset.id;switch(a){case'close-backdrop':if(e.target===b)closeModal();break;case'close-modal':closeModal();break;case'nav':go(b.dataset.page);break;case'go-back':goBack();break;case'dashboard-summary':openDashboardSummary(b.dataset.filter);break;case'view-tasks':taskFilter='all';memberFilter='all';go('tasks');break;case'family-view-tasks':goFamilyTasks(id);break;case'family-new-task':if(memberById(id))openTaskModal(null,null,id);break;case'open-routines':openRoutineLibrary();break;case'routine-all':selectAllRoutines(true);break;case'routine-none':selectAllRoutines(false);break;case'routine-import':importSelectedRoutines();break;case'new-task':openTaskModal(null,b.dataset.room||null);break;case'edit-task':openTaskModal(id);break;case'complete':completeTask(id);break;case'reopen':reopenTask(id);break;case'undo-completion':if(undoLastCompletion(id))toast('Completamento annullato.');else toast('Non è possibile annullare questa registrazione.','error');break;case'delete-task':deleteTask(id);break;case'filter':taskFilter=b.dataset.filter;render();break;case'open-task-filter':taskFilter=b.dataset.filter;memberFilter='all';taskSearch='';go('tasks');break;case'stats-range':statsPeriod=Number(b.dataset.days)===30?30:7;statsSelectedBar=null;render();break;case'stats-bar':statsSelectedBar=Number(b.dataset.bar);render();break;case'month-prev':monthCursor=plusMonths(`${monthCursor}-01`,-1,1).slice(0,7);selectedDay=`${monthCursor}-01`;render();break;case'month-next':monthCursor=plusMonths(`${monthCursor}-01`,1,1).slice(0,7);selectedDay=`${monthCursor}-01`;render();break;case'month-today':monthCursor=TODAY().slice(0,7);selectedDay=TODAY();render();break;case'pick-day':selectedDay=b.dataset.day;monthCursor=selectedDay.slice(0,7);render();break;case'open-room':currentRoom=id;render();break;case'rooms-back':currentRoom=null;render();break;case'new-room':openRoomModal();break;case'edit-room':openRoomModal(id);break;case'delete-room':deleteRoom(id);break;case'new-person':openPersonModal();break;case'edit-person':openPersonModal(id);break;case'delete-person':deletePerson(id);break;case'export':await exportDB();break;case'import':el('import-file').click();break;case'confirm-import':confirmImport();break;case'restore-import':restoreImport();break;case'demo':demo();break;}});
  document.addEventListener('submit',e=>{const form=e.target;if(!['task-form','room-form','person-form','settings-form'].includes(form.id))return;e.preventDefault();if(form.id==='task-form')saveTask(form);if(form.id==='room-form')saveRoom(form);if(form.id==='person-form')savePerson(form);if(form.id==='settings-form'){const fd=new FormData(form),name=String(fd.get('homeName')||'').trim();if(!name){toast('Inserisci il nome della casa.','error');return;}db.household.name=name.slice(0,48);db.settings.displayName=String(fd.get('displayName')||'').trim().slice(0,32);save();render();toast('Preferenze salvate.');}});
  document.addEventListener('input',e=>{if(e.target.id==='task-search'){taskSearch=e.target.value;renderTaskResults();}});
  document.addEventListener('change',e=>{if(e.target.id==='task-member-filter'){memberFilter=e.target.value;renderTaskResults();return;}if(e.target.matches?.('select[data-action="family-assign"]')){reassignFamilyTask(e.target.dataset.taskId,e.target.value);return;}if(e.target.matches?.('#routine-catalog input[data-routine-id]')){if(e.target.checked)routineSelection.add(e.target.dataset.routineId);else routineSelection.delete(e.target.dataset.routineId);updateRoutineSelectionUI();return;}if(e.target.id==='t-repeat')el('interval-wrapper')?.classList.toggle('hidden',e.target.value==='none');if(e.target.id==='import-file')prepareImport(e.target.files?.[0]);});
  document.addEventListener('keydown',e=>{if(e.key==='Escape')closeModal();});
  window.visualViewport?.addEventListener('resize',syncModalViewport);
  window.visualViewport?.addEventListener('scroll',syncModalViewport);
  el('mobile-fab').addEventListener('click',()=>openTaskModal());
  window.addEventListener('hashchange',()=>{recordSectionNavigation();currentRoom=null;render();window.scrollTo(0,0);});
  window.addEventListener('pageshow',()=>{if(page==='dashboard'&&el('date-label')?.textContent!==prettyWeek(TODAY()))render();});
  // Un primo accesso mostra un pulsante per popolare l'app con esempi, ma non crea dati senza consenso.
  const originalDashboard=renderDashboard;
  renderDashboard=function(){const html=originalDashboard();return !db.chores.length?`${html}<div class="panel" style="margin-top:18px"><div class="split-header"><div><strong style="font-size:14px">Vuoi iniziare da una routine pronta?</strong><p class="muted" style="margin-top:5px">Scegli le routine quotidiane, settimanali, mensili e trimestrali più adatte a te.</p></div><button class="btn btn-soft" data-action="open-routines">${ico('sparkle')} Scegli le routine</button></div></div>`:html;};
  if(!location.hash)history.replaceState(null,'','#dashboard');
  render();
  if('serviceWorker'in navigator&&location.protocol.startsWith('http')){window.addEventListener('load',()=>navigator.serviceWorker.register('./sw.js',{scope:'./'}).catch(err=>console.warn('Installazione offline non disponibile:',err)));}
  // Espone esclusivamente metadati non sensibili per diagnosi/versionamento.
  window.CasaFacile={version:VERSION,schemaVersion:1,repository:repository.kind};
})();
