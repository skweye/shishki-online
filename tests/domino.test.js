import {test} from 'node:test';
import assert from 'node:assert/strict';
import {parseHTML} from 'linkedom';
import {readFileSync} from 'node:fs';
import {DOMINOES,newDomino,dominoMoves,actDomino,nextDominoRound,readyDominoRound,dominoView,dominoPips} from '../public/domino.js';
import {createDominoBoard} from '../public/domino-board.js';
import {newGame,legalMoves} from '../public/game.js';
import {timeControl} from '../public/time-control.js';
import {t} from '../public/i18n.js';

const deck=DOMINOES.map((_,id)=>id),id=(a,b)=>DOMINOES.findIndex(pair=>pair[0]===Math.min(a,b)&&pair[1]===Math.max(a,b));
function position(white,black,stock=[]){return {...newDomino(deck),turn:'white',hands:{white:white.map(p=>id(...p)),black:black.map(p=>id(...p))},stock:stock.map(p=>id(...p)),chain:[{id:id(2,3),a:2,b:3,side:'black'}]};}
const play=(state,tile,end='right')=>actDomino(state,{type:'domino-play',id:id(...tile),end});

test('double-six deal, highest-double opening, no clocks and no board moves',()=>{
  const s=newDomino(deck);assert.equal(DOMINOES.length,28);assert.equal(new Set(DOMINOES.map(p=>p.join(':'))).size,28);
  assert.equal(s.hands.white.length,7);assert.equal(s.hands.black.length,7);assert.equal(s.stock.length,14);
  assert.equal(s.opening,id(2,2));assert.equal(s.turn,'black');assert.deepEqual(dominoMoves(s),[{id:id(2,2),end:'right'}]);
  assert.throws(()=>actDomino(s,{type:'domino-play',id:id(1,2),end:'right'}));
  const nonDoubles=deck.filter(i=>DOMINOES[i][0]!==DOMINOES[i][1]),arr=[...nonDoubles.slice(-14),...deck.filter(i=>!nonDoubles.slice(-14).includes(i))];
  assert.equal(newDomino(arr).opening,id(5,6));assert.throws(()=>newDomino(Array(28).fill(0)));
  assert.equal(newGame('domino').variant,'domino');assert.equal(timeControl('domino'),null);assert.deepEqual(legalMoves(s),[]);
});

test('tiles orient correctly on both ends; illegal or foreign tiles never mutate the hand',()=>{
  const s=position([[1,2],[3,5],[6,6]],[[0,0]]),copy=structuredClone(s);
  const left=play(s,[1,2],'left');assert.equal(left.chain[0].a,1);assert.equal(left.chain[0].b,2);assert.equal(left.turn,'black');
  const right=play(s,[3,5]);assert.equal(right.chain.at(-1).a,3);assert.equal(right.chain.at(-1).b,5);
  const reversed=play(position([[1,3],[6,6]],[[0,0]]),[1,3]);assert.equal(reversed.chain.at(-1).a,3);assert.equal(reversed.chain.at(-1).b,1);
  for(const action of [{type:'domino-play',id:id(6,6),end:'right'},{type:'domino-play',id:id(0,0),end:'left'},{type:'domino-play',id:id(1,2),end:'middle'},{type:'domino-play',id:'1',end:'right'}])assert.throws(()=>actDomino(s,action));
  assert.deepEqual(s,copy);
});

test('draw until a move appears; pass only with empty stock; drawing does not reveal the tile in history',()=>{
  const s=position([[6,6]],[[2,4]],[[1,3],[5,5]]);
  assert.throws(()=>actDomino(s,{type:'domino-pass'}));
  const a=actDomino(s,{type:'domino-draw'});assert.equal(a.turn,'white');assert.equal(a.hands.white.at(-1),id(5,5));assert.equal(a.history.at(-1).notation,'＋1');
  const b=actDomino(a,{type:'domino-draw'});assert.equal(b.turn,'white');assert.equal(b.stock.length,0);assert.equal(dominoMoves(b).length,1);
  assert.throws(()=>actDomino(b,{type:'domino-draw'}));assert.throws(()=>actDomino(b,{type:'domino-pass'}));
  const passed=actDomino(position([[6,6]],[[2,4]]),{type:'domino-pass'});assert.equal(passed.turn,'black');assert.equal(passed.roundResult,null);
  assert.throws(()=>actDomino(position([[2,4]],[[6,6]],[[5,5]]),{type:'domino-draw'}));
});

test('emptying the hand scores opponent pips; 100 ends the match and rejects further rounds',()=>{
  const s=position([[3,5]],[[6,6],[4,5]]);s.score.white=80;
  const next=play(s,[3,5]);assert.equal(next.roundResult.points,21);assert.equal(next.score.white,101);assert.equal(next.winner,'white');assert.equal(next.reason,'domino-score');
  assert.throws(()=>nextDominoRound(next));assert.throws(()=>readyDominoRound(next,'black'));assert.throws(()=>actDomino(next,{type:'domino-pass'}));
});

test('blocked rounds award the difference, and equal totals award no points',()=>{
  const next=actDomino(position([[1,1]],[[6,6]]),{type:'domino-pass'});
  assert.equal(next.roundResult.blocked,true);assert.equal(next.roundResult.winner,'white');assert.equal(next.score.white,10);assert.equal(next.winner,null);
  const tied=actDomino(position([[1,1]],[[0,2]]),{type:'domino-pass'});
  // Use blocked ends which neither hand matches for an equal-pip tie.
  const tieState=position([[1,1]],[[0,2]]);tieState.chain=[{id:id(4,5),a:4,b:5,side:'black'}];
  const tie=actDomino(tieState,{type:'domino-pass'});assert.equal(tie.roundResult.winner,'draw');assert.equal(tie.roundResult.points,0);assert.deepEqual(tie.score,{white:0,black:0});assert.equal(tied.roundResult,null);
});

test('next round needs two online confirmations, retains points and history, and resets hands',()=>{
  const ended=play(position([[3,5]],[[6,6]]),[3,5]);
  assert.throws(()=>nextDominoRound(newDomino(deck)));assert.throws(()=>readyDominoRound(ended,'spectator'));
  const a=readyDominoRound(ended,'white');assert.equal(a.round,1);assert.equal(a.revision,ended.revision+1);assert.throws(()=>readyDominoRound(a,'white'));
  const b=readyDominoRound(a,'black');assert.equal(b.round,2);assert.equal(b.roundResult,null);assert.equal(b.score.white,12);assert.deepEqual(b.history,ended.history);assert.deepEqual(b.readyNext,[]);
  assert.equal(b.hands.white.length,7);assert.equal(b.stock.length,14);assert.deepEqual(newGame('domino').score,{white:0,black:0});
});

test('projections conceal opponents and stock, including anonymous views; reveal hands only after a round',()=>{
  const s=newDomino(deck),original=structuredClone(s);
  for(const role of ['white','black',null]){const v=dominoView(s,role);assert.equal('stock' in v,false);assert.equal(v.stockCount,14);for(const side of ['white','black'])assert.deepEqual(v.hands[side],side===role?s.hands[side]:[]);assert.deepEqual(v.handCounts,{white:7,black:7});}
  const end=play(position([[3,5]],[[6,6]]),[3,5]);assert.deepEqual(dominoView(end,'white').hands,end.hands);assert.equal('stock' in dominoView(end,'black'),false);assert.deepEqual(s,original);
});

test('complete deterministic matches preserve all 28 tiles, matching chain ends and scores across rounds',()=>{
  for(let seed=1;seed<=8;seed++){
    let rng=seed;const shuffled=()=>{const result=[...deck];for(let i=27;i>0;i--){rng=(Math.imul(rng,1664525)+1013904223)>>>0;const j=rng%(i+1);[result[i],result[j]]=[result[j],result[i]];}return result;};
    let s=newDomino(shuffled()),actions=0;
    while(!s.winner&&actions++<3000){
      if(s.roundResult)s=nextDominoRound(s,shuffled());else{const move=dominoMoves(s)[0];s=actDomino(s,move?{type:'domino-play',...move}:{type:s.stock.length?'domino-draw':'domino-pass'});}
      const ids=[...s.hands.white,...s.hands.black,...s.stock,...s.chain.map(tile=>tile.id)];assert.equal(ids.length,28);assert.equal(new Set(ids).size,28);
      for(let i=1;i<s.chain.length;i++)assert.equal(s.chain[i-1].b,s.chain[i].a);
      assert.ok(Number.isFinite(s.score.white)&&Number.isFinite(s.score.black));assert.ok(dominoPips(s.hands.white)>=0);
    }
    assert.ok(s.winner);assert.ok(s.score[s.winner]>=100);
  }
});

test('local handoff hides the next hand and tile/end controls emit legal actions without browser automation',()=>{
  const {document}=parseHTML('<html><body><div id="root"></div></body></html>'),old=globalThis.document;globalThis.document=document;
  try{
    const root=document.querySelector('#root'),actions=[],board=createDominoBoard(root,a=>actions.push(a)),context={mode:'local',enabled:true};let s=newDomino(deck);
    board.render(s,context);assert.equal(root.querySelectorAll('[data-tile]').length,0);root.querySelector('#domino-reveal').click();assert.equal(root.querySelectorAll('[data-tile]').length,7);
    root.querySelector(`[data-tile="${s.opening}"]`).click();assert.equal(root.querySelector('[data-end="right"]').disabled,false);root.querySelector('[data-end="right"]').click();assert.deepEqual(actions,[{type:'domino-play',id:s.opening,end:'right'}]);
    s=actDomino(s,actions[0]);board.render(s,context);assert.equal(root.querySelectorAll('[data-tile]').length,0);assert.ok(root.querySelector('#domino-reveal'));
    board.render(dominoView(s,s.turn),{mode:'online',role:s.turn,enabled:true});assert.equal(root.querySelectorAll('[data-tile]').length,s.hands[s.turn].length);assert.equal(root.querySelector('#domino-reveal'),null);
  }finally{if(old===undefined)delete globalThis.document;else globalThis.document=old;}
});

test('domino dynamic controls, engine messages and match reason have English and Ukrainian translations',()=>{
  for(const file of ['domino-board.js','domino.js']){const source=readFileSync(new URL('../public/'+file,import.meta.url),'utf8');for(const [,value] of source.matchAll(/'([^'\n]*[А-Яа-яЁё][^'\n]*)'/g))for(const language of ['en','uk'])assert.ok(t(value,language)!==value||language==='uk'&&['Раунд','Базар'].includes(value),'Missing '+language+': '+value);}
});
