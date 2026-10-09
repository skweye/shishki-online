import {test} from 'node:test';
import assert from 'node:assert/strict';
import {poolAim,poolRack,rollOrientation,rotateVector,shotVector,interpolatePoolFrame} from '../public/pool-visuals.js';
import {newPool,simulatePool,TABLE,applyPoolShot} from '../public/pool.js';
import {transitionSounds} from '../public/sounds.js';
test('aim stops at the nearest ball at cue-ball radius, or the cushion',()=>{
  const balls=[{id:0,x:2,y:5},{id:2,x:10,y:5},{id:1,x:6,y:5},{id:3,x:3,y:7}],before=structuredClone(balls);
  const hit=poolAim(balls,0);assert.equal(hit.hit.id,1);assert.ok(Math.abs(hit.end.x-(6-TABLE.radius*2))<1e-9);assert.equal(hit.end.y,5);
  const rail=poolAim(balls,-90);assert.equal(rail.hit,null);assert.ok(Math.abs(rail.end.y-TABLE.radius)<1e-9);
  assert.deepEqual(balls,before);assert.equal(poolAim([],0),null);
});
test('power is clamped and minimum five-percent shots work at every angle',()=>{
  const game=newPool();
  for(let angle=-180;angle<=180;angle+=5){const shot=shotVector(angle,.05);assert.ok(Math.abs(Math.hypot(shot.dx,shot.dy)-.05)<1e-12);assert.doesNotThrow(()=>simulatePool(game,shot.dx,shot.dy));}
  assert.equal(shotVector(0,2).dx,1);assert.equal(shotVector(0,-1).dx,.05);
});
test('rolling uses distance and direction, stays normalized and interpolates without changing physics',()=>{
  const q=rollOrientation([0,0,0,1],TABLE.radius*Math.PI/2,0),normal=rotateVector(q,[0,0,1]);assert.ok(Math.abs(normal[0]-1)<1e-9);assert.ok(Math.abs(normal[2])<1e-9);
  let full=[0,0,0,1];for(let i=0;i<100;i++)full=rollOrientation(full,TABLE.radius*Math.PI*2/100,0);
  assert.ok(Math.abs(Math.hypot(...full)-1)<1e-9);assert.ok(Math.abs(rotateVector(full,[0,0,1])[2]-1)<1e-9);
  const frames=[[{id:0,x:1,y:2}],[{id:0,x:2,y:4}]],copy=structuredClone(frames);
  assert.deepEqual(interpolatePoolFrame(frames,1/120),[{id:0,x:1.5,y:3}]);assert.deepEqual(frames,copy);
});
test('racks track assigned groups and contact sounds have physics timestamps, with no generic checker taps',()=>{
  const game=newPool();assert.deepEqual(poolRack(game,'white'),[]);game.groups={white:'solid',black:'stripe'};game.balls=game.balls.filter(b=>b.id!==3);
  const rack=poolRack(game,'white');assert.equal(rack.length,7);assert.deepEqual(rack.filter(b=>b.potted),[{id:3,potted:true}]);assert.ok(poolRack(game,'black').every(b=>b.id>=9&&!b.potted));
  const initial=newPool(),sim=simulatePool(initial,.85,0,true);
  assert.ok(sim.events.some(e=>e.kind==='ball'));assert.ok(sim.events.some(e=>e.kind==='rail'));
  assert.ok(sim.events.every((e,i)=>e.time>=0&&e.strength>=0&&e.strength<=1&&(!i||e.time>=sim.events[i-1].time)));
  assert.deepEqual(transitionSounds(initial,applyPoolShot(initial,{dx:.85,dy:0})),[]);
});
