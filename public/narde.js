// Long narde: signed point counts, white head 0, black head 12;
// both sides travel forward through 24 points. No hits or bar.
const sign = side => side === 'white' ? 1 : -1;
const other = side => side === 'white' ? 'black' : 'white';
export const nardeHead = side => side === 'white' ? 0 : 12;
export const nardeProgress = (point, side) => (point - nardeHead(side) + 24) % 24;
export function newNarde() {
  const board = Array(24).fill(0); board[0] = 15; board[12] = -15;
  return { variant:'narde', board, turn:'white', dice:[], rolled:[], opening:true,
    firstDone:{white:false,black:false}, headTaken:0, headLimit:1, off:{white:0,black:0}, turnMoves:[],
    forced:null, captured:[], path:[], history:[], winner:null, reason:null, revision:0, repetitions:{} };
}
export function randomDice(opening = false) {
  const die = () => { const bytes = new Uint8Array(1); do { crypto.getRandomValues(bytes); } while (bytes[0] >= 252); return bytes[0] % 6 + 1; };
  let pair; do { pair = [die(),die()]; } while (opening && pair[0] === pair[1]);
  return pair;
}
// A six-point prime cannot trap every opposing checker, even temporarily.
export function blocksAll(board, side, off) {
  const enemy = other(side), ours = sign(side);
  if (off[enemy]) return false;
  let furthest = -1;
  for (let p=0;p<24;p++) if (board[p]*ours < 0) furthest = Math.max(furthest,nardeProgress(p,enemy));
  let run=0;
  for (let progress=0;progress<24;progress++) {
    const point=(nardeHead(enemy)+progress)%24;
    run=board[point]*ours>0 ? run+1 : 0;
    if (run>=6 && furthest<=progress) return true;
  }
  return false;
}
function step(state, move) {
  const next = { ...state, board:[...state.board], off:{...state.off}, dice:[...state.dice] }, s=sign(state.turn);
  next.board[move.from]-=s;
  if (move.to===24) next.off[state.turn]++; else next.board[move.to]+=s;
  if (move.from===nardeHead(state.turn)) next.headTaken++;
  next.dice.splice(next.dice.indexOf(move.die),1);
  return next;
}
function candidates(state) {
  const side=state.turn,s=sign(side),points=state.board.map((v,p)=>v*s>0?p:-1).filter(p=>p>=0);
  const home=points.every(p=>nardeProgress(p,side)>=18), moves=[];
  for (const die of new Set(state.dice)) for (const from of points) {
    if (from===nardeHead(side) && state.headTaken>=state.headLimit) continue;
    const progress=nardeProgress(from,side), target=progress+die;
    let to;
    if (target>=24) {
      if (!home || target>24 && points.some(p=>nardeProgress(p,side)<progress)) continue;
      to=24;
    } else {
      to=(from+die)%24;
      if (state.board[to]*s<0) continue;
    }
    const move={from,to,die,capture:null};
    if (!blocksAll(step(state,move).board,side,state.off)) moves.push(move);
  }
  return moves;
}
export function nardeMoves(state) {
  if (state.winner || !state.dice.length) return [];
  const memo=new Map();
  function depth(position) {
    if (!position.dice.length) return 0;
    const key=position.board.join(',')+'|'+position.dice.join(',')+'|'+position.headTaken;
    if (memo.has(key)) return memo.get(key);
    let best=0;
    for (const move of candidates(position)) { best=Math.max(best,1+depth(step(position,move))); if(best===position.dice.length) break; }
    memo.set(key,best); return best;
  }
  const options=candidates(state).map(move=>({move,length:1+depth(step(state,move))}));
  const best=Math.max(0,...options.map(option=>option.length));
  let moves=options.filter(option=>option.length===best).map(option=>option.move);
  if (best===1) { const high=Math.max(...moves.map(move=>move.die)); moves=moves.filter(move=>move.die===high); }
  return moves;
}
function finishTurn(game) {
  const side=game.turn;
  game.history.push({side,from:game.turnMoves[0]?.from,to:game.turnMoves.at(-1)?.to,capture:null,
    dice:[...game.rolled],notation:game.rolled.join('·')+'  '+(game.turnMoves.map(m=>`${m.from+1}–${m.to===24?'↗':m.to+1}`).join(', ')||'—')});
  game.firstDone[side]=true; game.dice=[]; game.turnMoves=[];
  if (game.off[side]===15) {game.winner=side;game.reason=game.off[other(side)]===0?'mars':'bear-off';}
  else game.turn=other(side);
}
export function rollNarde(state, pair) {
  if (state.variant!=='narde' || state.winner || state.dice.length) throw new Error('Сейчас нельзя бросить кости.');
  if (!Array.isArray(pair)||pair.length!==2||pair.some(n=>!Number.isInteger(n)||n<1||n>6)||state.opening&&pair[0]===pair[1]) throw new Error('Некорректный бросок.');
  const game=structuredClone(state);
  if (game.opening) {game.turn=pair[0]>pair[1]?'white':'black';game.opening=false;game.openingRoll=[...pair];}
  game.rolled=[...pair]; game.dice=pair[0]===pair[1]?[...pair,...pair]:[...pair];
  game.headTaken=0; game.headLimit=!game.firstDone[game.turn]&&pair[0]===pair[1]&&[3,4,6].includes(pair[0])?2:1;
  game.turnMoves=[];game.revision++;game.lastAction={kind:'roll',revision:game.revision};
  if (!nardeMoves(game).length) finishTurn(game);
  return game;
}
export function moveNarde(state, from, to, die) {
  const options=nardeMoves(state).filter(m=>m.from===from&&m.to===to);
  const move=die===undefined?options.sort((a,b)=>b.die-a.die)[0]:options.find(m=>m.die===die);
  if (!move) throw new Error('Этот ход недоступен. Выберите подсвеченный пункт.');
  const game=step(structuredClone(state),move);
  game.turnMoves.push(move);game.revision++;game.lastAction={kind:'move',...move,revision:game.revision};
  if (!game.dice.length || !nardeMoves(game).length) finishTurn(game);
  return game;
}
