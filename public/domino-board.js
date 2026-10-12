import {DOMINOES,dominoMoves} from './domino.js';
import {t} from './i18n.js';
import {dominoLayout,dominoPlacements,dominoBounds,dominoDropTarget} from './domino-layout.js';
const pips=[[],[4],[0,8],[0,4,8],[0,2,6,8],[0,2,4,6,8],[0,2,3,5,6,8]];
export function dominoTile(a,b){
  // One coordinate system for the whole face keeps dots circular and inside
  // the tile at hand, card and drag-preview sizes, independent of CSS grid sizing.
  const dots=[a,b].map((n,half)=>pips[n].map(i=>`<circle cx="${7+i%3*8}" cy="${7+Math.floor(i/3)*8+half*30}" r="2.4"/>`).join('')).join('');
  return `<svg class="domino-face" viewBox="0 0 30 60" preserveAspectRatio="xMidYMid meet" aria-hidden="true" focusable="false"><path d="M4 30H26"/>${dots}</svg>`;
}
const sideName=side=>t(side==='white'?'Белые':'Чёрные');
const directionName=direction=>({right:'Горизонтально вправо',left:'Горизонтально влево',down:'Вертикально вниз',up:'Вертикально вверх'})[direction];
function svgTile(a,b,p,className,attrs=''){
  const angle=Math.atan2(p.dy,p.dx)*180/Math.PI;
  const dots=(n,offset)=>pips[n].map(i=>`<circle cx="${offset+(i%3-1)*.19}" cy="${(Math.floor(i/3)-1)*.19}" r=".06"/>`).join('');
  // Drop targets are outlines, not extra translucent tiles with floating pips.
  const face=className==='domino-drop'?'':`<path d="M.5 -.34V.34"/><g class="domino-dots" aria-hidden="true">${dots(a,0)}${dots(b,1)}</g>`;
  return `<g class="${className}" transform="translate(${p.x+.5} ${p.y+.5}) rotate(${angle})" ${attrs||`role="img" aria-label="${a} · ${b}"`}><rect x="-.46" y="-.46" width="1.92" height=".92" rx=".12"/>${face}</g>`;
}
export function createDominoBoard(root,act){
  let game,context,selected=null,revealed=null,round=null,lastTurn=null,drag=null,ghost=null,choices=[],bounds,hover=null;
  function cancelDrag(){
    const pointer=drag?.pointerId;drag=null;hover=null;ghost?.remove();ghost=null;
    if(pointer!==undefined&&root.hasPointerCapture?.(pointer))root.releasePointerCapture(pointer);
    root.querySelectorAll('.drop-hover').forEach(el=>el.classList.remove('drop-hover'));
    root.classList.remove('domino-dragging');
  }
  function render(next,nextContext){
    cancelDrag();
    if(game?.revision!==next.revision||game?.variant!==next.variant||round!==next.round||lastTurn!==next.turn)selected=null;
    if(round!==next.round||lastTurn!==next.turn)revealed=null;
    game=next;context=nextContext;round=game.round;lastTurn=game.turn;paint();
  }
  function commit(choice){
    if(!choice||!context.enabled||selected===null)return;
    const action={type:'domino-play',id:selected,end:choice.end,direction:choice.direction};
    cancelDrag();selected=null;paint();act(action);
  }
  function paint(){
    const {mode,role,enabled}=context;
    const viewer=mode==='local'?game.turn:role,hand=game.hands[viewer]||[],moves=enabled?dominoMoves(game,viewer):[],stock=game.stockCount??game.stock?.length??0;
    const privateHand=mode==='local'&&revealed!==viewer&&!game.roundResult&&!game.winner;
    const layout=dominoLayout(game.chain),allChoices=game.chain.length?['left','right'].flatMap(end=>dominoPlacements(game.chain,end)):dominoPlacements([], 'right');
    bounds=dominoBounds(layout,allChoices);
    choices=privateHand?[]:allChoices.filter(choice=>moves.some(move=>move.id===selected&&move.end===choice.end));
    const tileButton=id=>{const [a,b]=DOMINOES[id],legal=moves.some(m=>m.id===id);return `<button class="domino-tile ${selected===id?'selected':''}" data-tile="${id}" aria-label="${a} · ${b}" aria-pressed="${selected===id}" ${!legal?'disabled':''}>${dominoTile(a,b)}</button>`;};
    root.innerHTML=`<div class="domino-score"><strong>${sideName('white')} <span data-no-translate>${game.score.white}</span></strong><span>${t('До 100 очков')} · ${t('Раунд')} <span data-no-translate>${game.round}</span></span><strong>${sideName('black')} <span data-no-translate>${game.score.black}</span></strong></div>
      <div class="domino-table" role="group" aria-label="${t('Цепочка домино')}"><svg class="domino-surface" viewBox="${bounds.x} ${bounds.y} ${bounds.width} ${bounds.height}" aria-label="${t('Игровое поле домино')}">${layout.map((tile,i)=>svgTile(tile.a,tile.b,tile.placement,`domino-laid ${i===0||i===layout.length-1?'edge':''}`)).join('')}${choices.map((choice,i)=>{
        let [a,b]=DOMINOES[selected];if(game.chain.length&&(choice.end==='left'?b!==game.chain[0].a:a!==game.chain.at(-1).b))[a,b]=[b,a];
        return svgTile(a,b,choice.placement,'domino-drop',`data-drop="${i}" role="button" tabindex="0" aria-label="${t('Поставить кость')} · ${t(directionName(choice.direction))} · ${a} · ${b}`);
      }).join('')}</svg>${!game.chain.length&&selected===null?`<div class="domino-empty"><span aria-hidden="true">◈</span><p>${t('Перетяните первую кость на поле.')}</p><p>${t('Первый ход — старший дубль. Если дублей нет — старшая кость.')}</p></div>`:''}</div>
      <p class="domino-drag-help">${t('Перетяните кость к свободному концу цепочки. Подсветка покажет горизонтальное или вертикальное положение.')}</p>
      <div class="domino-hand-panel">${game.roundResult?roundSummary():privateHand?`<div class="domino-handoff"><strong>${t('Передайте устройство следующему игроку.')}</strong><p>${sideName(viewer)}</p><button class="primary-button" id="domino-reveal">${t('Показать мои кости')}</button></div>`:`<div class="domino-hand-title"><strong>${t('Ваши кости')} · ${sideName(viewer)}</strong><span>${t('Базар')}: <span data-no-translate>${stock}</span></span></div><div class="domino-hand">${hand.map(tileButton).join('')}</div><div class="domino-hand-actions"><button class="secondary-button" data-action="domino-draw" ${!enabled||moves.length||!stock||game.winner?'disabled':''}>${t('Взять с базара')}</button><button class="secondary-button" data-action="domino-pass" ${!enabled||moves.length||stock||game.winner?'disabled':''}>${t('Пропустить ход')}</button>${mode==='local'?`<button class="text-button" id="domino-hide">${t('Скрыть кости')}</button>`:''}</div>`}</div>`;
  }
  function roundSummary(){const {mode,role,enabled}=context;const r=game.roundResult;return `<div class="domino-round"><h3>${t(r.blocked?'Рыба — ходов больше нет.':'Раунд завершён.')}</h3><p>${r.winner==='draw'?t('Равные остатки — очки не начисляются.'):`${sideName(r.winner)} +${r.points}`}</p><p data-no-translate>${game.score.white} : ${game.score.black}</p><div class="domino-revealed">${['white','black'].map(side=>`<div><strong>${sideName(side)} · ${r.totals[side]}</strong><div class="domino-hand">${game.hands[side].map(id=>`<span class="domino-tile" role="img" aria-label="${DOMINOES[id].join(' · ')}">${dominoTile(...DOMINOES[id])}</span>`).join('')}</div></div>`).join('')}</div>${!game.winner?`<button class="primary-button" data-action="domino-ready" ${!enabled||mode==='online'&&game.readyNext.includes(role)?'disabled':''}>${t(mode==='online'&&game.readyNext.includes(role)?'Ждём согласия соперника…':'Следующий раунд →')}</button>`:''}</div>`;}
  root.addEventListener('click',event=>{
    if(drag)return;
    const target=event.target.closest('button,[data-drop]');if(!target||target.disabled)return;
    if(target.id==='domino-reveal'){revealed=context.mode==='local'?game.turn:context.role;paint();}
    else if(target.id==='domino-hide'){revealed=null;selected=null;paint();}
    else if(target.hasAttribute('data-tile')){selected=Number(target.dataset.tile);paint();root.querySelector('[data-drop]')?.focus?.();}
    else if(target.hasAttribute('data-drop'))commit(choices[Number(target.dataset.drop)]);
    else if(target.dataset.action)act({type:target.dataset.action});
  });
  root.addEventListener('pointerdown',event=>{
    const button=event.target.closest('[data-tile]');
    if(!button||button.disabled||!context.enabled||drag||event.button!==0||event.isPrimary===false)return;
    event.preventDefault();selected=Number(button.dataset.tile);
    drag={pointerId:event.pointerId,startX:event.clientX,startY:event.clientY,revision:game.revision,moved:false};
    root.setPointerCapture?.(event.pointerId);paint();root.classList.add('domino-dragging');
  });
  function updateDrag(event){
    if(!drag||drag.pointerId!==event.pointerId)return;
    if(!context.enabled||drag.revision!==game.revision){cancelDrag();return;}
    if(Math.hypot(event.clientX-drag.startX,event.clientY-drag.startY)>5)drag.moved=true;
    if(!drag.moved)return;
    event.preventDefault();
    if(!ghost){ghost=document.createElement('div');ghost.className='domino-tile domino-drag-ghost';ghost.setAttribute('aria-hidden','true');ghost.innerHTML=dominoTile(...DOMINOES[selected]);document.body.append(ghost);}
    ghost.style.left=event.clientX+'px';ghost.style.top=event.clientY+'px';
    const svg=root.querySelector('.domino-surface');hover=dominoDropTarget(choices,bounds,svg.getBoundingClientRect(),event.clientX,event.clientY);
    ghost.classList.toggle('over-target',!!hover);ghost.classList.toggle('horizontal',!!hover?.placement.dx);
    root.querySelectorAll('[data-drop]').forEach(el=>el.classList.toggle('drop-hover',choices[Number(el.dataset.drop)]===hover));
  }
  root.addEventListener('pointermove',updateDrag);
  root.addEventListener('pointerup',event=>{
    if(!drag||drag.pointerId!==event.pointerId)return;
    updateDrag(event);if(!drag)return;
    const choice=drag.moved?hover:null;cancelDrag();
    if(choice)commit(choice);else{selected=null;paint();}
  });
  for(const type of ['pointercancel','lostpointercapture'])root.addEventListener(type,()=>{if(drag){cancelDrag();selected=null;paint();}});
  root.addEventListener('keydown',event=>{
    if(event.key==='Escape'){cancelDrag();selected=null;paint();return;}
    const drop=event.target.closest('[data-drop]');if(drop&&['Enter',' '].includes(event.key)){event.preventDefault();commit(choices[Number(drop.dataset.drop)]);}
  });
  document.addEventListener('visibilitychange',()=>{if(document.hidden){cancelDrag();selected=null;revealed=null;if(game)paint();}});
  document.addEventListener('languagechange',()=>{if(game)render(game,context);});
  return {render,hide(){cancelDrag();revealed=null;selected=null;}};
}
