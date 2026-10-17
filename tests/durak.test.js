import {test} from 'node:test';
import assert from 'node:assert/strict';
import {newDurak,actDurak,durakActions,durakView,beats,validateDurakSave,DURAK_VARIANTS} from '../public/durak.js';
import {newGame,legalMoves} from '../public/game.js';
import {timeControl} from '../public/time-control.js';
import {transitionSounds,ACTION_NOTES} from '../public/sounds.js';
const deck=Array.from({length:36},(_,i)=>i);
function position(white,black,{stock=[],variant='durak-throw',trump=35}={}) {
  const s=newDurak(variant,deck);Object.assign(s,{hands:{white,black},stock,trump,attacker:'white',defender:'black',turn:'white',limit:Math.min(variant==='durak-simple'?1:6,black.length)});
  s.discard=deck.filter(id=>![...white,...black,...stock].includes(id));return s;
}
const play=(s,type,card,target)=>actDurak(s,s.turn,{type, ...(card===undefined?{}:{card}),...(target===undefined?{}:{target})});
test('36 unique cards, lowest trump starts, trump stays at bottom, all subtypes have no clock',()=>{
  for(const variant of DURAK_VARIANTS){const s=newGame(variant);validateDurakSave(s);assert.equal(s.stock.length,24);assert.equal(s.stock.at(-1),s.trump);assert.equal(s.hands.white.length,6);assert.equal(s.hands.black.length,6);assert.equal(timeControl(variant),null);assert.deepEqual(legalMoves(s),[]);}
  assert.equal(newDurak('durak-throw',[...deck.slice(9),...deck.slice(0,9)]).attacker,'white');
  assert.throws(()=>newDurak('durak-throw',Array(36).fill(1)));
  assert.equal(beats(1,0,35),true);assert.equal(beats(9,0,35),false);assert.equal(beats(27,8,35),true);assert.equal(beats(8,27,35),false);assert.equal(beats(28,27,35),true);
});
test('simple restricts bouts to one attack, take skips defense and draw order is attacker first',()=>{
  let s=position([0,9,3],[1,10,4],{variant:'durak-simple',stock:[20,21,22,23,24,25,35]});
  const initial=structuredClone(s);s=play(s,'durak-attack',0);assert.deepEqual(initial.table,[]);
  assert.throws(()=>actDurak(s,'white',{type:'durak-attack',card:9}));
  s=play(s,'durak-defend',1,0);assert.equal(durakActions(s).filter(a=>a.type==='durak-attack').length,0);
  s=play(s,'durak-finish');assert.deepEqual(s.hands.white,[9,3,20,21,22,23]);assert.deepEqual(s.hands.black,[10,4,24,25,35]);assert.equal(s.turn,'black');validateDurakSave(s);
  s=play(s,'durak-attack',10);s=play(s,'durak-take');assert.equal(s.turn,'black');assert.equal(s.table.length,0);assert.ok(s.hands.white.includes(10));validateDurakSave(s);
});
test('throw-in matches ranks on both faces, obeys original defender capacity and can follow taking',()=>{
  let s=position([0,9,10,2],[1,11]);s=play(s,'durak-attack',0);s=play(s,'durak-defend',1,0);
  assert.ok(durakActions(s).some(a=>a.card===9));assert.ok(durakActions(s).some(a=>a.card===10));assert.ok(!durakActions(s).some(a=>a.card===2));
  assert.throws(()=>play(s,'durak-attack',2));s=play(s,'durak-attack',9);s=play(s,'durak-take');
  assert.ok(!durakActions(s).some(a=>a.type==='durak-attack'));s=play(s,'durak-finish');assert.equal(s.turn,'white');assert.deepEqual(new Set(s.hands.black),new Set([11,0,1,9]));validateDurakSave(s);
  s=position([0,9,18,5],[1,2,3]);s=play(s,'durak-attack',0);s=play(s,'durak-take');s=play(s,'durak-attack',9);s=play(s,'durak-attack',18);assert.equal(s.table.length,3);assert.equal(s.turn,'white');
  s=play(s,'durak-finish');assert.equal(s.hands.black.length,6);validateDurakSave(s);
});
test('transfers require matching rank, untouched defense, and enough cards in the new defender hand',()=>{
  let s=position([0,18,4],[9,1,5],{variant:'durak-transfer'});s=play(s,'durak-attack',0);s=play(s,'durak-transfer',9);assert.equal(s.defender,'white');assert.equal(s.turn,'white');assert.equal(s.limit,2);assert.deepEqual(s.table.map(p=>p.attackSide),['white','black']);
  // A counter-transfer is blocked: the next defender has only two cards for three attacks.
  assert.ok(!durakActions(s).some(a=>a.type==='durak-transfer'));
  s=play(s,'durak-defend',4,0);assert.ok(!durakActions(s).some(a=>a.type==='durak-transfer'));
  assert.throws(()=>play(s,'durak-transfer',18));
  let small=position([0,4],[9,1,5],{variant:'durak-transfer'});small=play(small,'durak-attack',0);assert.ok(!durakActions(small).some(a=>a.type==='durak-transfer'));
  let chain=position([0,18,4,6],[9,27,5,7],{variant:'durak-transfer'});chain=play(chain,'durak-attack',0);chain=play(chain,'durak-transfer',9);chain=play(chain,'durak-transfer',18);assert.equal(chain.table.length,3);assert.equal(chain.turn,'black');validateDurakSave(chain);
});
test('last cards resolve only at bout end, ties and take losses are consistent',()=>{
  let s=position([0],[1]);s=play(s,'durak-attack',0);assert.equal(s.winner,null);s=play(s,'durak-defend',1,0);assert.equal(s.winner,null);s=play(s,'durak-finish');assert.equal(s.winner,'draw');
  let take=position([0],[9]);take=play(take,'durak-attack',0);take=play(take,'durak-take');take=play(take,'durak-finish');assert.equal(take.winner,'white');assert.equal(take.reason,'durak-empty');assert.deepEqual(durakActions(take),[]);
  assert.throws(()=>play(take,'durak-finish'));
});
test('views never reveal private hands or the draw pile, even at game over',()=>{
  const s=newDurak();for(const role of ['white','black',null]){const view=durakView(s,role);assert.equal(view.stock,undefined);assert.equal(view.stockCount,24);assert.deepEqual(view.hands[role==='white'?'black':'white'],[]);assert.deepEqual(view.handCounts,{white:6,black:6});if(role)assert.deepEqual(view.hands[role],s.hands[role]);}
  s.winner='white';assert.deepEqual(durakView(s,'white').hands.black,[]);
});
test('random legal games conserve all cards, projected legal actions agree and no position deadlocks',()=>{
  let random=87654;const pick=n=>{random=(random*1664525+1013904223)>>>0;return random%n;};
  for(const variant of DURAK_VARIANTS)for(let round=0;round<15;round++){
    let s=newDurak(variant);for(let i=0;i<1800&&!s.winner;i++){
      validateDurakSave(s);const moves=durakActions(s);assert.ok(moves.length,variant+' deadlock');assert.deepEqual(durakActions(durakView(s,s.turn)),moves);
      const move=moves[pick(moves.length)],old=s;s=actDurak(s,s.turn,move);assert.equal(s.revision,old.revision+1);assert.ok(s.table.length<=6);
    }validateDurakSave(s);assert.ok(s.winner,'game should finish within bound');
  }
});
test('card actions have distinct sound feedback, restores and skipped revisions remain silent',()=>{
  let s=position([0,9,4],[1,10,5],{stock:[20,21,35]});
  for(const action of [{type:'durak-attack',card:0},{type:'durak-defend',card:1,target:0},{type:'durak-attack',card:9},{type:'durak-take'},{type:'durak-finish'}]){
    const n=actDurak(s,s.turn,action),sounds=transitionSounds(s,n);assert.ok(sounds.some(x=>x.startsWith('card-')));for(const sound of sounds.filter(x=>x.startsWith('card-')))assert.ok(ACTION_NOTES[sound]);assert.deepEqual(transitionSounds(n,n),[]);s=n;
  }
  const sounds=['card-play','card-cover','card-transfer','card-take','card-clear','card-deal','card-reveal'];assert.equal(new Set(sounds.map(k=>JSON.stringify(ACTION_NOTES[k]))).size,sounds.length);
});
