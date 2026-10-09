import { nardeMoves, nardeProgress } from './narde.js';
import { attachBoardDrag } from './board-drag.js';
import { pieceArt } from './skin-art.js';
import { t } from './i18n.js';
import { diceSlots, diePips, dieRotation } from './narde-dice.js';

export function createNardeBoard({move,roll}) {
  const root=document.getElementById('narde-board');
  root.innerHTML='<div class="narde-table"><div class="narde-points" role="group"></div><div class="narde-center"><div class="narde-dice" role="group"></div><button class="primary-button narde-roll" type="button"></button><span class="narde-roll-status" role="status"></span></div></div><div class="narde-controls"><button class="secondary-button narde-off" data-index="24" type="button"></button></div><p class="narde-hint"></p>';
  const points=root.querySelector('.narde-points'), dice=root.querySelector('.narde-dice'), rollButton=root.querySelector('.narde-roll'), off=root.querySelector('.narde-off'),hint=root.querySelector('.narde-hint');
  let game,flipped=false,playable=false,skins={},selected=null,chosenDie=null,revision=-1,rolling=false,animations=[],animationId=0,finishRoll=null;
  const options=()=>playable&&!rolling?nardeMoves(game).filter(m=>chosenDie===null||m.die===chosenDie):[];
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
    if(!rolling || !dice.children.length) dice.replaceChildren(...diceSlots(game).map(({value,left,capacity})=>{
      const available=left>0;
      const button=document.createElement('button');button.type='button';button.className='narde-die'+(!available?' used':'');
      button.disabled=!playable||!available||rolling;
      button.setAttribute('aria-label',t('Кость')+' '+value+(available?' · '+t('Осталось ходов')+': '+left:' · '+t('Использована')));button.setAttribute('aria-pressed',String(chosenDie===value));
      const tilt=document.createElement('span');tilt.className='narde-die-tilt';tilt.setAttribute('aria-hidden','true');
      const cube=document.createElement('span');cube.className='narde-cube';const [rx,ry]=dieRotation(value);cube.style.transform=`rotateX(${rx}deg) rotateY(${ry}deg)`;
      for(let face=1;face<=6;face++){
        const side=document.createElement('span');side.className='narde-face face-'+face;
        for(const pip of diePips(face)){const dot=document.createElement('i');dot.style.gridArea=`${Math.floor(pip/3)+1} / ${pip%3+1}`;side.append(dot);}
        cube.append(side);
      }
      tilt.append(cube);button.append(tilt);
      const uses=document.createElement('span');uses.className='narde-die-uses';uses.setAttribute('aria-hidden','true');
      for(let i=0;i<capacity;i++){const use=document.createElement('i');use.className=i<left?'remaining':'';uses.append(use);}button.append(uses);
      button.onclick=()=>{chosenDie=chosenDie===value?null:value;selected=null;draw();};return button;
    }));
    root.classList.toggle('narde-rolling',rolling);
    dice.hidden=!game.rolled.length;
    rollButton.textContent=t(game.opening?'Разыграть первый ход':'Бросить кости');rollButton.disabled=!playable||!!game.dice.length||rolling;
    rollButton.hidden=!!game.dice.length||!!game.winner||rolling;
    root.querySelector('.narde-roll-status').textContent=rolling?t('Кости в движении…'):'';
    off.textContent=t('Вывести фишку')+` · ${game.off.white} / ${game.off.black}`;off.disabled=!moves.some(m=>m.from===selected&&m.to===24);off.classList.toggle('legal',!off.disabled);
    const home=game.board.every((v,p)=>Math.sign(v)!==(game.turn==='white'?1:-1)||nardeProgress(p,game.turn)>=18);
    hint.textContent=t(game.opening?'Первый ход определят кости: большее число начинает.':game.winner?'Партия завершена.':!game.dice.length?'Бросьте кости. Если ходов нет, очередь перейдёт сопернику.':home?'Все фишки дома. Выбирайте фишку и выводите её с доски.':'Выберите фишку и подсвеченный пункт. Можно перетаскивать.');
    if(focus!==undefined)root.querySelector(`[data-index="${focus}"]`)?.focus({preventScroll:true});
  }
  function cancel(){drag.cancel();animationId++;animations.forEach(a=>a.cancel());animations=[];rolling=false;finishRoll=null;root.classList.remove('narde-rolling');}
  function animateRoll(next,done){
    cancel();game=next;selected=null;chosenDie=null;dice.replaceChildren();rolling=true;draw();
    const id=animationId;
    const finish=()=>{if(id!==animationId)return;cancel();draw();done();};finishRoll=finish;
    if(document.hidden||matchMedia('(prefers-reduced-motion: reduce)').matches){finish();return;}
    [...dice.children].forEach((button,index)=>{
      const cube=button.querySelector('.narde-cube'),[rx,ry]=dieRotation(next.rolled[index]),sign=index?1:-1;
      animations.push(cube.animate([
        {transform:`rotateX(${rx+720}deg) rotateY(${ry+sign*540}deg)`},
        {transform:`rotateX(${rx+150}deg) rotateY(${ry+sign*100}deg)`,offset:.62},
        {transform:`rotateX(${rx-16}deg) rotateY(${ry-sign*10}deg)`,offset:.86},
        {transform:`rotateX(${rx}deg) rotateY(${ry}deg)`}
      ],{duration:1050+index*140,easing:'cubic-bezier(.18,.65,.3,1)'}));
      animations.push(button.animate([
        {transform:`translate(${sign*75}px,-65px) scale(.75)`,opacity:0},
        {transform:`translate(${sign*20}px,-32px) scale(1.12)`,opacity:1,offset:.25},
        {transform:'translate(0,3px) scale(1,.94)',offset:.58},
        {transform:`translate(${-sign*5}px,-15px) scale(1)`,offset:.73},
        {transform:'translate(0,0) scale(1)',offset:1}
      ],{duration:1050+index*140,easing:'ease-out'}));
    });
    Promise.all(animations.map(a=>a.finished)).then(finish,()=>{});
  }
  document.addEventListener('visibilitychange',()=>{if(document.hidden)finishRoll?.();});
  matchMedia('(prefers-reduced-motion: reduce)').addEventListener('change',event=>{if(event.matches)finishRoll?.();});
  rollButton.onclick=()=>{if(!rolling&&!rollButton.disabled)roll();};
  document.addEventListener('languagechange',()=>{drag.cancel();draw();});
  root.addEventListener('click',event=>{
    const button=event.target.closest('[data-index]');if(!button||!playable)return;
    const point=Number(button.dataset.index),moves=options();
    if(selected!==null&&moves.some(m=>m.from===selected&&m.to===point)){play(selected,point);return;}
    selected=moves.some(m=>m.from===point)?point:null;draw();
  });
  return {cancel,animateRoll,render(next,flip,active,newSkins){drag.cancel();if(revision!==next.revision){selected=null;chosenDie=null;}revision=next.revision;game=next;flipped=flip;playable=active;skins=newSkins;draw();}};
}
