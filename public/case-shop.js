import { CASES, caseById, caseContents, RARITIES } from './cases.js';
import { itemById } from './shop-catalog.js';
import { renderProgress } from './progression-ui.js';
import { t } from './i18n.js';
import { renderItemArt } from './item-art.js';
import { createCaseReel } from './case-reel.js';
export function createCaseShop({request,getState,update,preview}){
  const $=id=>document.getElementById(id),dialog=$('case-dialog');
  const reel=createCaseReel($('case-reel'));
  let pending=null,busy=false,result=null,recovered=false;
  const key=()=>`shishki-case-pending-${getState()?.user.id}`;
  function remember(value){try{if(value)localStorage.setItem(key(),JSON.stringify(value));else localStorage.removeItem(key());}catch{}}
  const el=(tag,text,cls)=>{const node=document.createElement(tag);node.textContent=text;if(cls)node.className=cls;return node;};
  const number=n=>n.toLocaleString(undefined,{maximumFractionDigits:3});
  function odds(box){const root=el('div','','case-odds');for(const [rarity,chance] of Object.entries(box.odds)){const badge=el('span',`${t(RARITIES[rarity].name)} ${chance}%`);badge.dataset.rarity=rarity;root.append(badge);}return root;}
  function show(box,source,restore){
    reel.reset();$('case-chest').hidden=false;
    pending=restore||{caseId:box.id,source,requestId:crypto.randomUUID()};result=null;
    $('case-title').textContent=t(box.name);$('case-chest').dataset.case=box.id;
    $('case-chest').classList.remove('opening');$('case-result').textContent='';$('case-error').textContent='';
    delete $('case-chest').dataset.rarity;$('case-prize').replaceChildren();$('case-prize').hidden=true;
    $('case-preview').hidden=true;$('case-confirm').hidden=false;$('case-confirm').disabled=false;
    $('case-confirm').textContent=t(restore?'Повторить запрос':'Открыть кейс');
    $('case-cost').textContent=source==='coins'?`${t('Стоимость')}: ${box.price} ◈`:t(source==='reward'?'Награда за уровень — бесплатно':'Полный доступ — бесплатно');
    $('case-odds').replaceChildren(odds(box));
    $('case-contents').replaceChildren(...caseContents(box).map(({item,rarity,chance})=>{
      const row=el('li',`${t(item.name)} · ${t(RARITIES[rarity].name)} · ${number(chance)}%`);row.dataset.rarity=rarity;return row;
    }),el('li',t('Внутри редкости предметы равновероятны. Шансы округлены.')),
    ...Object.values(RARITIES).map(r=>el('li',`${t('Повтор')}: ${t(r.name)} → ${r.duplicate} ◈`)));
    if(restore)$('case-error').textContent=t('Есть незавершённый запрос. Повтор безопасен: второй кейс не спишется.');
    dialog.showModal();
  }
  function render(){
    const state=getState();renderProgress($('level-progress'),state);
    $('case-catalog').replaceChildren(...CASES.map(box=>{
      const card=el('article','','profile-surface case-card');card.dataset.case=box.id;
      const chest=el('div','','case-chest');chest.setAttribute('aria-hidden','true');chest.append(el('span','✦'));
      const free=state?.cases[box.id]||0,source=state?.fullAccess?'access':free?'reward':'coins';
      const button=el('button',t(!state?'Войти':source==='coins'?'Открыть кейс':'Открыть бесплатно'),'primary-button');
      button.disabled=busy||!!state&&source==='coins'&&state.balance<box.price;
      button.onclick=()=>{if(!state){location.assign('/?login=1&returnTo=shop');return;}try{const old=JSON.parse(localStorage.getItem(key()));if(old&&caseById(old.caseId)){show(caseById(old.caseId),old.source,old);return;}}catch{}show(box,source);};
      card.append(chest,el('h3',t(box.name)),el('p',`${box.price} ◈ · ${t('Наградные кейсы')}: ${free}`),odds(box),button);
      const contents=el('details',''),summary=el('summary',t('Все предметы и шансы')),list=el('ul','','case-contents');
      for(const {item,rarity,chance} of caseContents(box)){const li=el('li',`${t(item.name)} · ${number(chance)}%`);li.dataset.rarity=rarity;list.append(li);}
      contents.append(summary,list);card.append(contents);return card;
    }));
    $('case-history').replaceChildren(...(state?.openings||[]).map(row=>{
      const item=itemById(row.itemId);return el('li',`${t(caseById(row.caseId)?.name||'Кейс')} → ${t(item?.name||row.itemId)} · ${t(RARITIES[row.rarity].name)}${row.duplicate?' · '+t('Повтор')+' +'+row.compensation+' ◈':''}`);
    }));
    if(state&&!recovered){recovered=true;try{const old=JSON.parse(localStorage.getItem(key()));if(old&&caseById(old.caseId))show(caseById(old.caseId),old.source,old);}catch{}}
  }
  $('case-close').onclick=()=>{if(!busy)dialog.close();};
  dialog.addEventListener('close',()=>reel.reset());
  dialog.addEventListener('cancel',event=>{if(busy)event.preventDefault();});
  $('case-preview').onclick=()=>{if(result){dialog.close();preview(itemById(result.itemId));}};
  $('case-confirm').onclick=async()=>{
    if(busy||!pending)return;busy=true;$('case-confirm').disabled=true;$('case-close').disabled=true;$('case-error').textContent='';remember(pending);
    try{
      const next=await request('/open',pending);result=next.opening;remember(null);update(next);
      // A visual failure must never turn a successful award into another purchase.
      $('case-chest').hidden=true;
      try{await reel.play(caseById(result.caseId),itemById(result.itemId));}catch{reel.reset();}
      const prize=$('case-prize'),item=itemById(result.itemId);prize.hidden=false;prize.dataset.rarity=result.rarity;
      renderItemArt(prize,item);
      $('case-result').textContent=`${t(itemById(result.itemId).name)} · ${t(RARITIES[result.rarity].name)} · ${result.duplicate?t('Повтор')+' +'+result.compensation+' ◈':t('Добавлено в коллекцию')}`;
      $('case-preview').hidden=false;$('case-confirm').hidden=true;pending=null;
    }catch(error){
      $('case-error').textContent=error.message+' '+t('Повтор безопасен: второй кейс не спишется.');
      $('case-confirm').textContent=t('Повторить запрос');
      if(error.status&&error.status<500){remember(null);pending=null;$('case-confirm').hidden=true;}
    }finally{busy=false;$('case-confirm').disabled=false;$('case-close').disabled=false;render();}
  };
  document.addEventListener('visibilitychange',()=>{if(document.hidden)$('case-chest').classList.remove('opening');});
  document.addEventListener('languagechange',()=>{render();if(pending&&!busy)show(caseById(pending.caseId),pending.source,pending);});
  return {render};
}
