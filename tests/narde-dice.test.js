import {test} from 'node:test';
import assert from 'node:assert/strict';
import {newNarde,rollNarde,moveNarde,nardeMoves} from '../public/narde.js';
import {diceSlots,isNardeRoll,diePips} from '../public/narde-dice.js';
import {parseHTML} from 'linkedom';
import {createNardeBoard} from '../public/narde-board.js';

test('narde selection can be cancelled without spending dice or issuing a move',()=>{
  const {document,window}=parseHTML('<html><body><div id="narde-board"></div></body></html>');
  Object.assign(globalThis,{document,window,matchMedia:()=>({matches:false,addEventListener(){}})});
  const commands=[],board=createNardeBoard({move:(...args)=>commands.push(args),roll:()=>{}}),root=document.getElementById('narde-board');
  const game=rollNarde({...newNarde(),opening:false},[3,3]),before=structuredClone(game),first=nardeMoves(game)[0];
  board.render(game,false,true,{});
  const select=()=>{root.querySelector(`[data-index="${first.from}"]`).click();assert.ok(root.querySelector('.narde-point.selected'));};
  const cleared=()=>{assert.equal(root.querySelector('.narde-point.selected'),null);assert.equal(root.querySelector('.narde-point.legal'),null);assert.equal(root.querySelector('.narde-off').disabled,true);assert.deepEqual(game,before);assert.equal(commands.length,0);};
  select();root.querySelector(`[data-index="${first.from}"]`).click();cleared();
  select();root.querySelector('.narde-deselect').click();cleared();
  select();root.querySelector('.narde-table').click();cleared();
  select();const escape=new window.Event('keydown',{bubbles:true,cancelable:true});escape.key='Escape';root.dispatchEvent(escape);cleared();
  root.querySelector('.narde-die').click();select();root.querySelector('.narde-deselect').click();assert.ok(root.querySelector('.narde-die[aria-pressed="true"]'));
  select();root.querySelector(`[data-index="${first.to}"]`).click();assert.deepEqual(commands,[[first.from,first.to,first.die]]);
});
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
