import {test} from 'node:test';
import assert from 'node:assert/strict';
import {newNarde,rollNarde,moveNarde,nardeMoves} from '../public/narde.js';
import {diceSlots,isNardeRoll,diePips} from '../public/narde-dice.js';
test('dice presentation preserves all four double moves and marks consumed values without changing the game',()=>{
  let game=rollNarde({...newNarde(),opening:false},[3,3]);
  for(let remaining=4;remaining>0;remaining--){
    const before=structuredClone(game),slots=diceSlots(game);
    assert.equal(slots.length,2);assert.equal(slots.reduce((n,s)=>n+s.left,0),remaining);
    assert.deepEqual(game,before);
    const move=nardeMoves(game)[0];game=moveNarde(game,move.from,move.to,move.die);
  }
  assert.equal(diceSlots(game).reduce((n,s)=>n+s.left,0),0);
  assert.deepEqual(diceSlots({rolled:[2,5],dice:[5]}).map(s=>s.left),[0,1]);
  for(let value=1;value<=6;value++)assert.equal(new Set(diePips(value)).size,value);
});
test('only a new live server roll animates, never reconnects, repeated snapshots, moves or resets',()=>{
  const initial=newNarde(),rolled=rollNarde(initial,[6,2]);
  assert.equal(isNardeRoll(initial,rolled),true);
  assert.equal(isNardeRoll(initial,rolled,false),false);
  assert.equal(isNardeRoll(rolled,structuredClone(rolled)),false);
  const move=nardeMoves(rolled)[0],next=moveNarde(rolled,move.from,move.to,move.die);
  assert.equal(isNardeRoll(rolled,next),false);
  assert.equal(isNardeRoll(next,newNarde()),false);
  assert.equal(isNardeRoll({...initial,variant:'chess'},rolled),false);
});
