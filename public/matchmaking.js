import { t } from './i18n.js';
import { VARIANTS } from './game.js';

export function createMatchmaking({request,onMatch,sound,owner=()=>null}) {
  const $=id=>document.getElementById(id),dialog=$('search-dialog'),key='shishki-search-v1';
  let search=null,busy=false,cancelRequested=false,poll=null,elapsedTimer=null,joining=false;
  function remember(){try{if(search)localStorage.setItem(key,JSON.stringify(search));else localStorage.removeItem(key);}catch{}}
  function stopTimers(){clearTimeout(poll);clearInterval(elapsedTimer);poll=null;elapsedTimer=null;}
  function close(){stopTimers();search=null;remember();dialog.close();cancelRequested=false;joining=false;}
  function time(){const seconds=Math.max(0,Math.floor((Date.now()-(search?.startedAt||Date.now()))/1000));$('search-elapsed').textContent=Math.floor(seconds/60)+':'+String(seconds%60).padStart(2,'0');}
  function show(){
    $('search-variant').textContent=t(VARIANTS[search.variant].name);
    $('search-status').textContent=t('Ищем соперника…');$('search-error').textContent='';
    $('search-retry').hidden=true;$('search-cancel').disabled=false;
    dialog.dataset.state='waiting';if(!dialog.open)dialog.showModal();time();
    clearInterval(elapsedTimer);elapsedTimer=setInterval(time,1000);
    if(search.phase==='expired'){stopTimers();dialog.dataset.state='error';$('search-status').textContent=t('Поиск истёк. Начните снова.');$('search-retry').hidden=false;}
  }
  async function run(action){
    if(!search||busy||joining)return;
    if(action==='cancel'){search.phase='cancel';remember();}
    clearTimeout(poll);busy=true;$('search-retry').hidden=true;
    try{
      const result=await request('/api/matchmaking',{action,ticket:search.ticket,variant:search.variant});
      if(result.status==='matched'){
        search={...search,ticket:result.ticket,phase:'status'};remember();cancelRequested=false;joining=true;stopTimers();
        dialog.dataset.state='matched';$('search-status').textContent=t('Соперник найден. Подключаемся…');$('search-error').textContent='';$('search-cancel').disabled=true;
        // Save the seat before acknowledging so a lost response remains recoverable.
        try{localStorage.setItem('shashki-room-'+result.code,result.token);}catch{}
        await onMatch(result,async()=>request('/api/matchmaking',{action:'ack',ticket:search.ticket}));
        sound('match-found');close();return;
      }
      if(result.status==='cancelled'){sound('search-cancel');close();return;}
      if(result.status==='expired'){
        if(action==='cancel'){close();return;}
        search.phase='expired';remember();stopTimers();dialog.dataset.state='error';
        $('search-status').textContent=t('Поиск истёк. Начните снова.');
        $('search-retry').hidden=false;$('search-cancel').disabled=false;sound('error');return;
      }
      search={...search,ticket:result.ticket,variant:result.variant,startedAt:result.startedAt,phase:'status'};remember();
      $('search-variant').textContent=t(VARIANTS[search.variant].name);$('search-error').textContent='';
      if(!cancelRequested)poll=setTimeout(()=>run('status'),3000);
    }catch(error){
      joining=false;dialog.dataset.state='error';$('search-error').textContent=t(error.message);
      $('search-status').textContent=t('Не удалось обновить поиск');$('search-retry').hidden=false;$('search-cancel').disabled=false;
      sound('error');
      if(error.status===403){search.phase='expired';remember();stopTimers();}
    }finally{
      busy=false;
      if(cancelRequested&&search){cancelRequested=false;await run('cancel');}
    }
  }
  async function start(variant){
    if(search){show();return;}
    search={ticket:crypto.randomUUID(),variant,startedAt:Date.now(),owner:owner(),phase:'join'};remember();show();sound('search-start');await run('join');
  }
  async function cancel(){
    if(!search||joining)return;
    if(search.phase==='expired'){close();return;}
    search.phase='cancel';remember();
    cancelRequested=true;$('search-cancel').disabled=true;$('search-status').textContent=t('Отменяем поиск…');
    clearTimeout(poll);if(!busy){cancelRequested=false;await run('cancel');}
  }
  $('search-cancel').onclick=cancel;
  $('search-retry').onclick=()=>{
    if(search?.phase==='expired'){const variant=search.variant;close();return start(variant);}
    show();return run(search.phase||'status');
  };
  dialog.addEventListener('cancel',event=>{event.preventDefault();cancel();});
  document.addEventListener('visibilitychange',()=>{if(!document.hidden&&search&&search.phase!=='expired'&&!busy&&!joining)run(search.phase||'status');});
  document.addEventListener('languagechange',()=>{if(search&&!busy&&!joining)show();});
  async function resume(){
    try{const old=JSON.parse(localStorage.getItem(key));if(!old||old.owner!==owner()||!VARIANTS[old.variant]||typeof old.ticket!=='string')return;search=old;show();if(search.phase==='expired'){$('search-status').textContent=t('Поиск истёк. Начните снова.');$('search-retry').hidden=false;stopTimers();}else await run(search.phase||'status');}catch{}
  }
  return {start,cancel,resume};
}
