import {itemById,saleValue} from './shop-catalog.js';
import {actionSound} from './sounds.js';
import {t} from './i18n.js';
export function createInventorySale({request,getState,update,setBusy,notice}) {
  const $=id=>document.getElementById(id),dialog=$('sell-dialog');
  let pending=null,busy=false,recovered=null;
  const key=()=>`shishki-sale-pending-${getState()?.user.id}`;
  const remember=value=>{try{if(value)localStorage.setItem(key(),JSON.stringify(value));else localStorage.removeItem(key());}catch{}};
  function stored(){try{const old=JSON.parse(localStorage.getItem(key()));return old&&itemById(old.item)&&typeof old.requestId==='string'?old:null;}catch{return null;}}
  function show(item,restore) {
    pending=restore||{item:item.id,expectedValue:saleValue(item),requestId:crypto.randomUUID()};
    $('sell-title').textContent=t('Продать предмет?');$('sell-item').textContent=t(item.name);
    $('sell-value').textContent='+'+pending.expectedValue+' ◈';
    $('sell-error').textContent=restore?t('Есть незавершённая продажа. Повторный запрос не начислит монеты дважды.'):'';
    $('sell-confirm').textContent=t(restore?'Повторить запрос':'Продать');$('sell-confirm').hidden=false;$('sell-confirm').disabled=false;
    dialog.showModal();
  }
  function open(item){if(busy)return;const old=stored();if(old){show(itemById(old.item),old);return;}if(!getState()?.sellable?.includes(item.id))return;actionSound('sell-open');show(item);}
  function restore(){const state=getState();if(!state||recovered===state.user.id)return;recovered=state.user.id;const old=stored();if(old)show(itemById(old.item),old);}
  $('sell-close').onclick=$('sell-cancel').onclick=()=>{if(!busy)dialog.close();};
  dialog.addEventListener('cancel',event=>{if(busy)event.preventDefault();});
  $('sell-confirm').onclick=async()=>{
    if(busy||!pending)return;busy=true;remember(pending);setBusy(true);
    $('sell-confirm').disabled=$('sell-close').disabled=$('sell-cancel').disabled=true;$('sell-error').textContent='';
    try{
      const next=await request('/sell',pending);remember(null);pending=null;update(next);dialog.close();actionSound('sell');
      notice(t('Предмет продан.')+' +'+next.sale.credit+' ◈');
    }catch(error){
      actionSound('error');$('sell-error').textContent=error.message;
      if(error.status&&error.status<500){remember(null);pending=null;$('sell-confirm').hidden=true;try{update(await request());}catch{}}
      else {$('sell-confirm').textContent=t('Повторить запрос');$('sell-error').textContent+=' '+t('Повторный запрос безопасен.');}
    }finally{busy=false;setBusy(false);$('sell-confirm').disabled=$('sell-close').disabled=$('sell-cancel').disabled=false;}
  };
  return {open,restore};
}
