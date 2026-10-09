import {DOMINOES,dominoMoves} from './domino.js';
import {t} from './i18n.js';
const pips=[[],[4],[0,8],[0,4,8],[0,2,6,8],[0,2,4,6,8],[0,2,3,5,6,8]];
export function dominoTile(a,b){return [a,b].map(n=>`<span class="domino-half" aria-hidden="true">${Array.from({length:9},(_,i)=>`<i${pips[n].includes(i)?' class="pip"':''}></i>`).join('')}</span>`).join('');}
const sideName=side=>t(side==='white'?'Белые':'Чёрные');
export function createDominoBoard(root,act){
  let game,mode,role,enabled,selected=null,revealed=null,round=null,lastTurn=null;
  function render(next,context){
    const changed=game?.revision!==next.revision;game=next;({mode,role,enabled}=context);
    if(round!==game.round||lastTurn!==game.turn){revealed=null;selected=null;}round=game.round;lastTurn=game.turn;
    if(changed)selected=null;
    const viewer=mode==='local'?game.turn:role,hand=game.hands[viewer]||[],moves=enabled?dominoMoves(game,viewer):[],stock=game.stockCount??game.stock?.length??0;
    const privateHand=mode==='local'&&revealed!==viewer&&!game.roundResult&&!game.winner;
    const tileButton=id=>{const [a,b]=DOMINOES[id],legal=moves.some(m=>m.id===id);return `<button class="domino-tile ${selected===id?'selected':''}" data-tile="${id}" aria-label="${a} · ${b}" aria-pressed="${selected===id}" ${!legal?'disabled':''}>${dominoTile(a,b)}</button>`;};
    root.innerHTML=`<div class="domino-score"><strong>${sideName('white')} <span data-no-translate>${game.score.white}</span></strong><span>${t('До 100 очков')} · ${t('Раунд')} <span data-no-translate>${game.round}</span></span><strong>${sideName('black')} <span data-no-translate>${game.score.black}</span></strong></div>
      <div class="domino-table" role="group" aria-label="${t('Цепочка домино')}">${game.chain.length?`<div class="domino-chain">${game.chain.map((tile,i)=>`<span class="domino-tile laid ${i===0||i===game.chain.length-1?'edge':''}" role="img" aria-label="${tile.a} · ${tile.b}">${dominoTile(tile.a,tile.b)}</span>`).join('<span class="domino-link" aria-hidden="true">·</span>')}</div>`:`<div class="domino-empty"><span aria-hidden="true">◈</span><p>${t('Первый ход — старший дубль. Если дублей нет — старшая кость.')}</p></div>`}</div>
      <div class="domino-ends"><button class="secondary-button" data-end="left" ${!enabled||!moves.some(m=>m.id===selected&&m.end==='left')?'disabled':''}>← ${t('Левый конец')} <span data-no-translate>${game.chain[0]?.a??'—'}</span></button><button class="secondary-button" data-end="right" ${!enabled||!moves.some(m=>m.id===selected&&m.end==='right')?'disabled':''}>${game.chain.length?t('Правый конец'):t('Начать цепочку')} <span data-no-translate>${game.chain.at(-1)?.b??'—'}</span> →</button></div>
      <div class="domino-hand-panel">${game.roundResult?roundSummary():privateHand?`<div class="domino-handoff"><strong>${t('Передайте устройство следующему игроку.')}</strong><p>${sideName(viewer)}</p><button class="primary-button" id="domino-reveal">${t('Показать мои кости')}</button></div>`:`<div class="domino-hand-title"><strong>${t('Ваши кости')} · ${sideName(viewer)}</strong><span>${t('Базар')}: <span data-no-translate>${stock}</span></span></div><div class="domino-hand">${hand.map(tileButton).join('')}</div><div class="domino-hand-actions"><button class="secondary-button" data-action="domino-draw" ${!enabled||moves.length||!stock||game.winner?'disabled':''}>${t('Взять с базара')}</button><button class="secondary-button" data-action="domino-pass" ${!enabled||moves.length||stock||game.winner?'disabled':''}>${t('Пропустить ход')}</button>${mode==='local'?`<button class="text-button" id="domino-hide">${t('Скрыть кости')}</button>`:''}</div>`}</div>`;
    root.querySelector('#domino-reveal')?.addEventListener('click',()=>{revealed=viewer;render(game,context);});
    root.querySelector('#domino-hide')?.addEventListener('click',()=>{revealed=null;render(game,context);});
    root.querySelectorAll('[data-tile]').forEach(b=>b.onclick=()=>{selected=Number(b.dataset.tile);render(game,context);});
    root.querySelectorAll('[data-end]').forEach(b=>b.onclick=()=>act({type:'domino-play',id:selected,end:b.dataset.end}));
    root.querySelectorAll('[data-action]').forEach(b=>b.onclick=()=>act({type:b.dataset.action}));
  }
  function roundSummary(){const r=game.roundResult;return `<div class="domino-round"><h3>${t(r.blocked?'Рыба — ходов больше нет.':'Раунд завершён.')}</h3><p>${r.winner==='draw'?t('Равные остатки — очки не начисляются.'):`${sideName(r.winner)} +${r.points}`}</p><p data-no-translate>${game.score.white} : ${game.score.black}</p><div class="domino-revealed">${['white','black'].map(side=>`<div><strong>${sideName(side)} · ${r.totals[side]}</strong><div class="domino-hand">${game.hands[side].map(id=>`<span class="domino-tile" role="img" aria-label="${DOMINOES[id].join(' · ')}">${dominoTile(...DOMINOES[id])}</span>`).join('')}</div></div>`).join('')}</div>${!game.winner?`<button class="primary-button" data-action="domino-ready" ${!enabled||mode==='online'&&game.readyNext.includes(role)?'disabled':''}>${t(mode==='online'&&game.readyNext.includes(role)?'Ждём согласия соперника…':'Следующий раунд →')}</button>`:''}</div>`;}
  document.addEventListener('languagechange',()=>{if(game)render(game,{mode,role,enabled});});
  return {render,hide(){revealed=null;selected=null;}};
}
