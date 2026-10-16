import { t } from './i18n.js';

// Presentation only: the game and server remain the source of action validity.
export function matchActions({mode,room,game,animating,playable}){
  const active=!game.winner&&(mode==='local'||!!room?.ready);
  return {
    draw:active&&!room?.drawOffer,resign:active,
    flip:!['domino','battleship'].includes(game.variant),
    restart:mode==='local'&&!game.winner&&game.revision>0,
    shot:game.variant==='chapaev'&&active&&playable&&!animating,
    instructions:active,invite:!!room,waiting:!!room&&!room.ready,
    rematch:!!game.winner&&!animating
  };
}
export function createMatchUI(doc=document){
  const $=id=>doc.getElementById(id),trigger=$('match-menu-button'),menu=$('match-menu');
  let context,tab='history',roomCode=null,lastMessage=undefined,unread=0,waiting=null;
  const items=()=>[...menu.querySelectorAll('button')].filter(b=>!b.hidden&&!b.disabled&&!b.closest('[hidden]'));
  function close(restore=false){menu.hidden=true;trigger.setAttribute('aria-expanded','false');if(restore)trigger.focus();}
  function open(){menu.hidden=false;trigger.setAttribute('aria-expanded','true');items()[0]?.focus();}
  trigger.onclick=()=>menu.hidden?open():close(true);
  trigger.addEventListener('keydown',event=>{if(['ArrowDown','ArrowUp'].includes(event.key)){event.preventDefault();open();if(event.key==='ArrowUp')items().at(-1)?.focus();}});
  menu.addEventListener('click',event=>{if(event.target.closest('button'))close(!doc.querySelector('dialog[open]'));});
  doc.addEventListener('pointerdown',event=>{if(!menu.hidden&&!event.target.closest('.match-menu-anchor'))close();});
  doc.addEventListener('keydown',event=>{
    if(menu.hidden)return;
    if(event.key==='Escape'){event.preventDefault();close(true);return;}
    if(!menu.contains(event.target))return;
    if(event.key==='Tab'){close(true);return;}
    const buttons=items(),index=buttons.indexOf(doc.activeElement);
    if(['ArrowDown','ArrowUp','Home','End'].includes(event.key)){
      event.preventDefault();buttons[event.key==='Home'?0:event.key==='End'?buttons.length-1:(index+(event.key==='ArrowUp'?-1:1)+buttons.length)%buttons.length]?.focus();
    }
  });
  // Native focusout can temporarily leave activeElement at body before the
  // clicked button receives focus. Wait for focusin's actual destination;
  // closing on that transient state hides the button before its click fires.
  doc.addEventListener('focusin',event=>{
    if(!menu.hidden&&!menu.contains(event.target)&&event.target!==trigger)close();
  });
  function tabs(){
    const wasHidden=$('chat-panel').hidden;
    const online=!!context?.room;if(!online)tab='history';
    $('chat-tab').hidden=!online;
    for(const name of ['history','chat']){
      $(name+'-tab').setAttribute('aria-selected',String(tab===name));$(name+'-tab').tabIndex=tab===name?0:-1;
      $(name+'-panel').hidden=name!==tab;
    }
    if(tab==='chat'){unread=0;if(wasHidden)$('chat-messages').scrollTop=$('chat-messages').scrollHeight;}
    $('chat-unread').hidden=!unread;$('chat-unread').textContent=String(unread);
  }
  for(const name of ['history','chat']){
    $(name+'-tab').onclick=()=>{tab=name;tabs();};
    $(name+'-tab').addEventListener('keydown',event=>{if(!['ArrowLeft','ArrowRight','Home','End'].includes(event.key)||!context?.room)return;event.preventDefault();tab=event.key==='Home'?'history':event.key==='End'?'chat':tab==='history'?'chat':'history';tabs();$(tab+'-tab').focus();});
  }
  function chat(messages=[]){
    const latest=messages.at(-1)?.id;
    if(lastMessage!==undefined&&latest!==lastMessage&&tab!=='chat'){
      const index=messages.findIndex(message=>message.id===lastMessage);
      unread+=messages.slice(index+1).filter(message=>message.side!==context?.room?.role).length;
    }
    lastMessage=latest??null;tabs();
  }
  function result(){
    if(!context)return;
    const finished=matchActions(context).rematch;
    $('round-actions').hidden=!finished||$('result-dialog').open;
    $('round-action-hint').textContent=finished?t(context.game.reason==='round'?'Раунд завершён.':'Партия завершена.'):'';
  }
  $('result-dialog').addEventListener('close',result);
  return {
    close,chat,
    update(value){
      context=value;const visible=matchActions(value),home=$('game-screen').hidden;
      doc.body.classList.toggle('in-match',!home);
      const rules=$('rules-button'),parent=home?$('home-rules-slot'):$('match-view-actions');
      if(rules.parentElement!==parent){parent.append(rules);rules.className=home?'ghost-button':'menu-action';if(home)rules.removeAttribute('role');else rules.setAttribute('role','menuitem');}
      if(home)close();
      for(const [id,key] of [['draw-button','draw'],['resign-button','resign'],['flip-button','flip'],['new-button','restart'],['shot-controls','shot'],['room-controls','invite']])$(id).hidden=!visible[key];
      const pair=$('clock-white').parentElement.parentElement;
      pair.prepend($(value.flipped?'clock-white':'clock-black').parentElement);
      $('draw-offer-status').hidden=!value.room?.drawOffer||value.room.drawOffer!==value.room.role||!!value.game.winner;
      $('draw-offer-status').textContent=t('Предложение ничьей отправлено');
      $('move-help').parentElement.hidden=!visible.instructions;
      const key=value.room?.code||null;
      if(key!==roomCode){roomCode=key;lastMessage=undefined;unread=0;tab='history';waiting=null;}
      if(waiting!==visible.waiting){$('room-controls').open=visible.waiting;waiting=visible.waiting;}
      $('copy-button').className=visible.waiting?'primary-button':'secondary-button';
      if(!menu.hidden&&doc.activeElement?.closest('[hidden]'))items()[0]?.focus();
      chat(value.room?.chat);result();
    }
  };
}
