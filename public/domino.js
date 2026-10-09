export const DOMINOES = Object.freeze(Array.from({length:7},(_,a)=>Array.from({length:7-a},(_,i)=>Object.freeze([a,a+i]))).flat());
const other=side=>side==='white'?'black':'white';
export const dominoPips=hand=>hand.reduce((sum,id)=>sum+DOMINOES[id][0]+DOMINOES[id][1],0);
export function shuffleDominoes(){
  const deck=DOMINOES.map((_,id)=>id),buffer=new Uint32Array(1);
  for(let i=deck.length-1;i>0;i--){const limit=Math.floor(4294967296/(i+1))*(i+1);let value;do{crypto.getRandomValues(buffer);value=buffer[0];}while(value>=limit);const j=value%(i+1);[deck[i],deck[j]]=[deck[j],deck[i]];}
  return deck;
}
function deal(deck){
  if(!Array.isArray(deck)||deck.length!==28||new Set(deck).size!==28||deck.some(id=>!Number.isInteger(id)||id<0||id>27))throw new Error('Некорректный набор домино.');
  const hands={white:deck.slice(0,7),black:deck.slice(7,14)},stock=deck.slice(14);
  const rank=id=>{const [a,b]=DOMINOES[id];return a===b?100+a:a+b+b/10;};
  const opening=[...hands.white,...hands.black].sort((a,b)=>rank(b)-rank(a))[0];
  return {hands,stock,opening,turn:hands.white.includes(opening)?'white':'black',chain:[],roundResult:null,readyNext:[]};
}
export function newDomino(deck=shuffleDominoes()){
  return {variant:'domino',board:Array(28).fill(0),...deal(deck),score:{white:0,black:0},round:1,target:100,forced:null,captured:[],path:[],repetitions:{},history:[],revision:0,winner:null,reason:null};
}
export function dominoMoves(state,side=state.turn){
  if(state.winner||state.roundResult)return [];
  const hand=state.hands[side]||[];
  if(!state.chain.length)return hand.includes(state.opening)?[{id:state.opening,end:'right'}]:[];
  const left=state.chain[0].a,right=state.chain.at(-1).b,moves=[];
  for(const id of hand){const [a,b]=DOMINOES[id];if(a===left||b===left)moves.push({id,end:'left'});if(a===right||b===right)moves.push({id,end:'right'});}
  return moves;
}
function finishRound(state,winner,blocked){
  const totals={white:dominoPips(state.hands.white),black:dominoPips(state.hands.black)};
  const points=winner==='draw'?0:totals[other(winner)]-(blocked?totals[winner]:0);
  if(winner!=='draw')state.score[winner]+=points;
  state.roundResult={winner,points,blocked,totals};
  if(winner!=='draw'&&state.score[winner]>=state.target){state.winner=winner;state.reason='domino-score';}
}
function blockedRound(state){
  if(!state.stock.length&&!dominoMoves(state,'white').length&&!dominoMoves(state,'black').length){
    const a=dominoPips(state.hands.white),b=dominoPips(state.hands.black);finishRound(state,a===b?'draw':a<b?'white':'black',true);
  }
}
export function actDomino(state,action){
  if(state.variant!=='domino'||state.winner||state.roundResult)throw new Error('Действие сейчас недоступно.');
  const moves=dominoMoves(state),side=state.turn,next=structuredClone(state);let notation;
  if(action.type==='domino-play'){
    if(!moves.some(m=>m.id===action.id&&m.end===action.end))throw new Error('Эту кость нельзя поставить на выбранный конец.');
    let [a,b]=DOMINOES[action.id];
    if(next.chain.length){if(action.end==='left'&&b!==next.chain[0].a||action.end==='right'&&a!==next.chain.at(-1).b)[a,b]=[b,a];}
    next.hands[side].splice(next.hands[side].indexOf(action.id),1);
    const tile={id:action.id,a,b,side};if(action.end==='left')next.chain.unshift(tile);else next.chain.push(tile);
    notation=`${action.end==='left'?'←':'→'} ${a}·${b}`;
    next.turn=other(side);
    if(!next.hands[side].length)finishRound(next,side,false);else blockedRound(next);
  }else if(action.type==='domino-draw'){
    if(moves.length||!next.stock.length)throw new Error('Добор доступен, только когда нет хода и базар не пуст.');
    next.hands[side].push(next.stock.pop());notation='＋1';blockedRound(next);
  }else if(action.type==='domino-pass'){
    if(moves.length||next.stock.length)throw new Error('Пропуск доступен, только когда нет хода и базар пуст.');
    next.turn=other(side);notation='—';blockedRound(next);
  }else throw new Error('Действие сейчас недоступно.');
  next.revision++;next.history.push({side,round:next.round,from:0,to:0,capture:null,notation});return next;
}
export function nextDominoRound(state,deck=shuffleDominoes()){
  if(state.variant!=='domino'||!state.roundResult||state.winner)throw new Error('Действие сейчас недоступно.');
  return {...structuredClone(state),...deal(deck),round:state.round+1,revision:state.revision+1};
}
export function readyDominoRound(state,side){
  if(state.variant!=='domino'||!state.roundResult||state.winner||!['white','black'].includes(side)||state.readyNext.includes(side))throw new Error('Действие сейчас недоступно.');
  const next=structuredClone(state);next.readyNext.push(side);
  if(next.readyNext.length===2)return nextDominoRound(next);
  next.revision++;return next;
}
// All room responses, including errors and reconnects, must use this projection.
export function dominoView(state,role){
  if(state.variant!=='domino')return state;
  const view=structuredClone(state);view.handCounts={white:state.hands.white.length,black:state.hands.black.length};view.stockCount=state.stock.length;
  if(!state.roundResult&&!state.winner){view.hands={white:role==='white'?view.hands.white:[],black:role==='black'?view.hands.black:[]};}
  delete view.stock;return view;
}
