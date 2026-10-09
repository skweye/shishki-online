import { nardeMoves, nardeProgress } from './narde.js';
import { attachBoardDrag } from './board-drag.js';
import { pieceArt } from './skin-art.js';
import { t } from './i18n.js';

export function createNardeBoard({move,roll}) {
  const root=document.getElementById('narde-board');
  root.innerHTML='<div class="narde-points" role="group"></div><div class="narde-controls"><div class="narde-dice" role="group"></div><button class="primary-button narde-roll" type="button"></button><button class="secondary-button narde-off" data-index="24" type="button"></button></div><p class="narde-hint"></p>';
  const points=root.querySelector('.narde-points'), dice=root.querySelector('.narde-dice'), rollButton=root.querySelector('.narde-roll'), off=root.querySelector('.narde-off'),hint=root.querySelector('.narde-hint');
  let game,flipped=false,playable=false,skins={},selected=null,chosenDie=null,revision=-1;
  const options=()=>playable?nardeMoves(game).filter(m=>chosenDie===null||m.die===chosenDie):[];
  const play=(from,to)=>{const choice=options().find(m=>m.from===from&&m.to===to);if(choice)move(from,to,chosenDie??choice.die);};
  const drag=attachBoardDrag(root,{moves:options,select:from=>{selected=from;draw();},move:play});
  function draw() {
    if(!game)return;
    const moves=options(),focus=document.activeElement?.dataset?.index;
    points.setAttribute('aria-label',t('Доска длинных нард'));
    const order=[...Array.from({length:12},(_,i)=>i),...Array.from({length:12},(_,i)=>23-i)].map(p=>flipped?(p+12)%24:p);
    points.replaceChildren(...order.map((p,visual)=>{
      const value=game.board[p],side=value>0?'white':'black',count=Math.abs(value),destination=moves.some(m=>m.from===selected&&m.to===p);
      const button=document.createElement('button');button.type='button';button.dataset.index=p;
      button.className='narde-point '+(visual<12?'top':'bottom')+(visual%2?' odd':'')+(selected===p?' selected':'')+(destination?' legal':'')+(moves.some(m=>m.from===p)?' available':'');
      button.style.gridColumn=String(visual%12+1+(visual%12>=6?1:0));button.style.gridRow=visual<12?'1':'2';
      button.setAttribute('aria-label',t('Пункт')+' '+(p+1)+': '+(count?t(side==='white'?'Белые':'Чёрные')+', '+count:t('Пусто'))+(destination?', '+t('Доступный ход'):''));
      button.setAttribute('aria-pressed',String(selected===p));
      const number=document.createElement('span');number.className='narde-number';number.textContent=p+1;
      const stack=document.createElement('span');stack.className='narde-stack';
      for(let i=0;i<Math.min(count,5);i++){const piece=document.createElement('span');piece.className=`piece ${side} skin-${skins[side]||'classic'}`;piece.innerHTML=pieceArt(skins[side]);stack.append(piece);}
      if(count>5){const total=document.createElement('span');total.className='narde-total';total.textContent=count;stack.append(total);}
      button.append(number,stack);return button;
    }));
    dice.setAttribute('aria-label',t('Кости'));
    const remaining=[...game.dice];
    const faces=game.rolled.length?(game.rolled[0]===game.rolled[1]?[...game.rolled,...game.rolled]:game.rolled):[0,0];
    dice.replaceChildren(...faces.map(value=>{
      const index=remaining.indexOf(value),available=index>=0;if(available)remaining.splice(index,1);
      const button=document.createElement('button');button.type='button';button.className='narde-die'+(!available?' used':'');
      button.textContent=value?['','⚀','⚁','⚂','⚃','⚄','⚅'][value]:'·';button.disabled=!playable||!available;
      button.setAttribute('aria-label',t('Кость')+' '+value+(available?'':' · '+t('Использована')));button.setAttribute('aria-pressed',String(chosenDie===value));
      button.onclick=()=>{chosenDie=chosenDie===value?null:value;selected=null;draw();};return button;
    }));
    rollButton.textContent=t(game.opening?'Разыграть первый ход':'Бросить кости');rollButton.disabled=!playable||!!game.dice.length;
    off.textContent=t('Вывести фишку')+` · ${game.off.white} / ${game.off.black}`;off.disabled=!moves.some(m=>m.from===selected&&m.to===24);off.classList.toggle('legal',!off.disabled);
    const home=game.board.every((v,p)=>Math.sign(v)!==(game.turn==='white'?1:-1)||nardeProgress(p,game.turn)>=18);
    hint.textContent=t(game.opening?'Первый ход определят кости: большее число начинает.':game.winner?'Партия завершена.':!game.dice.length?'Бросьте кости. Если ходов нет, очередь перейдёт сопернику.':home?'Все фишки дома. Выбирайте фишку и выводите её с доски.':'Выберите фишку и подсвеченный пункт. Можно перетаскивать.');
    if(focus!==undefined)root.querySelector(`[data-index="${focus}"]`)?.focus({preventScroll:true});
  }
  rollButton.onclick=roll;
  document.addEventListener('languagechange',()=>{drag.cancel();draw();});
  root.addEventListener('click',event=>{
    const button=event.target.closest('[data-index]');if(!button||!playable)return;
    const point=Number(button.dataset.index),moves=options();
    if(selected!==null&&moves.some(m=>m.from===selected&&m.to===point)){play(selected,point);return;}
    selected=moves.some(m=>m.from===point)?point:null;draw();
  });
  return {cancel:()=>drag.cancel(),render(next,flip,active,newSkins){drag.cancel();if(revision!==next.revision){selected=null;chosenDie=null;}revision=next.revision;game=next;flipped=flip;playable=active;skins=newSkins;draw();}};
}
