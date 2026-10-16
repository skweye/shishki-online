import { simulatePoolSweep } from './pool-sweep.js';
import { ballGroup } from './pool.js';
import { newChess } from './chess-game.js';
import { rollNarde } from './narde.js';
import { chapaevLineup } from './chapaev.js';
import { DOMINOES } from './domino.js';
import { actBattleship } from './battleship.js';
export const OWNER_EMAIL='kkoallqq@gmail.com';
export const ownerPranks = user => !!user && user.ownerPranks===true && user.email===OWNER_EMAIL && user.emailVerified===true;
export const PRANKS=Object.freeze({
  russian:{name:'Внезапная корона',description:'Одна ваша простая шашка становится дамкой.',symbol:'♛'},
  russian12:{name:'Большая корона',description:'Одна ваша простая шашка становится дамкой.',symbol:'♛'},
  chess:{name:'Королевская минута',description:'Добавляет минуту к вашим часам.',symbol:'♚'},
  narde:{name:'Счастливые шестёрки',description:'Вместо следующего броска выпадает дубль 6–6.',symbol:'⚅'},
  chapaev:{name:'Подкрепление',description:'Возвращает одну вашу выбитую шашку на свободное место в начальном ряду.',symbol:'◉'},
  pool8:{name:'Биток на автопилоте',description:'Биток забивает все шары, оставляя восьмёрку напоследок.',symbol:'⑧'},
  domino:{name:'Карманный базар',description:'Меняет вашу самую тяжёлую кость на самую лёгкую из базара.',symbol:'⚁'},
  battleship:{name:'Точная торпеда',description:'Автоматически поражает одну ещё не подбитую клетку корабля соперника.',symbol:'⚓'}
});
export function applyOwnerPrank(state,side){
  if(!PRANKS[state.variant]||!['white','black'].includes(side)||state.turn!==side||state.winner||state.roundResult)throw Error('Шалость сейчас недоступна.');
  let next=structuredClone(state);const sign=side==='white'?1:-1,enemy=side==='white'?'black':'white';
  if(['russian','russian12'].includes(state.variant)){
    if(state.forced!==null)throw Error('Сначала завершите взятие.');
    const point=next.board.findIndex(piece=>piece===sign);if(point<0)throw Error('Нет простой шашки для короны.');
    next.board[point]=sign*2;next.repetitions={};next.path=[];next.captured=[];
  }else if(state.variant==='chess'){
    // The clock is extended by the authoritative caller; the board stays valid.
    newChess(state.fen);
  }else if(state.variant==='narde'){
    if(state.opening||state.dice.length)throw Error('Дождитесь своего следующего броска.');
    next=rollNarde(state,[6,6]);
  }else if(state.variant==='chapaev'){
    const lineup=chapaevLineup(state.rows||{white:7,black:0});
    const absent=lineup.find(p=>p.side===side&&!state.pieces.some(b=>b.id===p.id));
    const slot=lineup.find(p=>p.side===side&&!state.pieces.some(b=>Math.hypot(b.x-p.x,b.y-p.y)<.7));
    if(!absent||!slot)throw Error('Нет выбитой шашки или свободного места для подкрепления.');
    next.pieces.push({...slot,id:absent.id});next.lastShot=null;
  }else if(state.variant==='pool8'){
    const result=simulatePoolSweep(state);
    next.balls=result.balls;next.breaking=false;next.foul=null;next.ballInHand=null;next.winner=side;next.reason='eight-ball';
    if(!next.groups[side]){next.groups[side]=ballGroup(result.potted.find(b=>ballGroup(b.id))?.id)||'solid';next.groups[enemy]=next.groups[side]==='solid'?'stripe':'solid';}
    next.lastShot={kind:'sweep',revision:state.revision+1,potted:result.potted,foul:null};
  }else if(state.variant==='domino'){
    if(!state.chain.length||!state.stock.length)throw Error('Нужны начатая цепочка и непустой базар.');
    const weight=id=>DOMINOES[id][0]+DOMINOES[id][1],hand=next.hands[side];
    const own=hand.reduce((a,b)=>weight(a)>=weight(b)?a:b),gift=next.stock.reduce((a,b)=>weight(a)<=weight(b)?a:b);
    [hand[hand.indexOf(own)],next.stock[next.stock.indexOf(gift)]]=[gift,own];
  }else if(state.variant==='battleship'){
    if(state.phase!=='battle')throw Error('Сначала оба игрока должны расставить корабли.');
    const cell=state.fleets[enemy].flat().find(cell=>!state.shots[side].some(shot=>shot.cell===cell));
    if(cell===undefined)throw Error('Шалость сейчас недоступна.');
    next=actBattleship(state,side,{type:'sea-fire',cell});
  }
  next.revision=state.revision+1;delete next.prankUsed;next.unranked=true;
  next.lastPrank={variant:state.variant,side,revision:next.revision};
  // Keep one explicit history entry; never expose the exchanged domino or hidden fleet.
  const entry={side,from:0,to:0,capture:null,round:next.round,notation:state.variant==='pool8'?'↗ · '+next.lastShot.potted.map(b=>b.id).join(','):PRANKS[state.variant].symbol};
  next.history=[...state.history,entry];
  return next;
}
