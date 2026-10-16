import {PRANKS} from './pranks.js';
import {t} from './i18n.js';
export function createPrankEffect(root,sound){
  let overlay,timer,stopSound;
  function cancel(){clearTimeout(timer);stopSound?.();stopSound=null;overlay?.remove();overlay=null;}
  function play(variant){
    cancel();const prank=PRANKS[variant];if(!prank||document.hidden)return;
    overlay=document.createElement('div');overlay.className='prank-effect prank-'+variant;overlay.setAttribute('role','status');
    const symbol=document.createElement('span');symbol.className='prank-symbol';symbol.textContent=prank.symbol;symbol.setAttribute('aria-hidden','true');
    const title=document.createElement('strong');title.textContent=t(prank.name);
    const note=document.createElement('small');note.textContent=t('Шалость владельца · Без опыта и монет');
    overlay.append(symbol,title,note);root.append(overlay);stopSound=sound('prank-'+variant);timer=setTimeout(cancel,2200);
  }
  document.addEventListener('visibilitychange',()=>{if(document.hidden)cancel();});
  return {play,cancel};
}
