import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {newPool,simulatePool,resolvePool,applyPoolShot,placePoolCue,poolTargets,validCuePosition,TABLE} from '../public/pool.js';
import {newGame,legalMoves,applyMove,VARIANTS} from '../public/game.js';
import {createClock} from '../public/time-control.js';
const command={dx:.85,dy:0,ball:1,pocket:0};
function result(state,patch={}){return {balls:structuredClone(state.balls),firstContact:1,firstContactX:14,railAfterContact:true,railBalls:[1,2,3,4],potted:[],...patch};}
function table(){const s=newPool();s.breaking=false;s.ballInHand=null;return s;}
test('pool has fifteen unique object balls, legal rack, no board moves and no clock',()=>{
  const s=newGame('pool8');assert.equal(s.balls.length,16);assert.equal(new Set(s.balls.map(b=>b.id)).size,16);
  assert.ok(validCuePosition(s,s.balls[0].x,s.balls[0].y));assert.equal(s.balls.find(b=>b.id===8).y,5);
  for(const a of s.balls)for(const b of s.balls)if(a.id!==b.id)assert.ok(Math.hypot(a.x-b.x,a.y-b.y)>=TABLE.radius*2);
  assert.deepEqual(legalMoves(s),[]);assert.throws(()=>applyMove(s,0,1));assert.equal(createClock('pool8'),null);
});
test('deterministic physics produces a legal default break and visible collision frames',()=>{
  const s=newPool(),before=structuredClone(s),a=simulatePool(s,.85,0,true),b=simulatePool(s,.85,0);
  assert.equal(a.firstContact,1);assert.ok(a.railBalls.length>=4);assert.ok(a.frames.length>10);assert.ok(a.collisions.length);
  assert.deepEqual(a.balls,b.balls);assert.deepEqual(a.potted,b.potted);assert.deepEqual(s,before);
  const next=applyPoolShot(s,command);assert.equal(next.foul,null);assert.equal(next.breaking,false);assert.equal(next.revision,1);assert.equal(next.history.length,1);assert.deepEqual(next.groups,{white:null,black:null});
  for(const ball of a.balls){assert.ok(Number.isFinite(ball.x)&&Number.isFinite(ball.y));assert.ok(ball.x>=.269&&ball.x<=19.731&&ball.y>=.269&&ball.y<=9.731);}
});
test('physics transfers momentum and pockets an object ball in a corner',()=>{
  const s=table();s.balls=[{id:0,x:3,y:3},{id:1,x:1.2,y:1.2}];
  const r=simulatePool(s,-.2,-.2);assert.equal(r.firstContact,1);assert.ok(r.potted.some(b=>b.id===1&&b.pocket===0));
});
test('invalid and cross-mode shots cannot mutate a game',()=>{
  const s=newPool();for(const [dx,dy] of [[0,0],[NaN,0],[Infinity,0],[2,0],['1',0]])assert.throws(()=>applyPoolShot(s,{dx,dy}));
  assert.throws(()=>applyPoolShot(newGame(),command));assert.throws(()=>applyPoolShot({...s,winner:'white'},command));assert.throws(()=>applyPoolShot(table(),{...command,ball:8}));
  assert.throws(()=>applyPoolShot(table(),{...command,pocket:6}));assert.equal(s.revision,0);
});
test('cue ball placement requires ball in hand, a free legal point and kitchen restriction',()=>{
  let s=newPool();for(const [x,y] of [[10,5],[0,0],[NaN,5],[4,11]])assert.throws(()=>placePoolCue(s,x,y));
  s=placePoolCue(s,3,4);assert.equal(s.revision,1);assert.deepEqual(s.balls.find(b=>b.id===0),{id:0,x:3,y:4});
  s.ballInHand='any';assert.throws(()=>placePoolCue(s,14.5,5));assert.ok(placePoolCue(s,10,5));s.ballInHand=null;assert.throws(()=>placePoolCue(s,10,5));
});
test('only a successful called ball assigns groups and retains the turn',()=>{
  const s=table(),r=result(s,{potted:[{id:1,pocket:0}],balls:s.balls.filter(b=>b.id!==1)});
  const next=resolvePool(s,r,command);assert.deepEqual(next.groups,{white:'solid',black:'stripe'});assert.equal(next.turn,'white');assert.ok(!poolTargets(next).includes(1));
  const missed=resolvePool(s,r,{...command,pocket:1});assert.equal(missed.turn,'black');assert.equal(missed.groups.white,null);
  const scratch=resolvePool(s,{...r,potted:[...r.potted,{id:0,pocket:1}]},command);assert.equal(scratch.turn,'black');assert.equal(scratch.groups.white,null);assert.equal(scratch.ballInHand,'any');
});
test('wrong ball, no contact and no rail award ball in hand; legal miss changes turn',()=>{
  const s=table();s.groups={white:'solid',black:'stripe'};
  for(const [patch,foul] of [[{firstContact:9},'wrong-ball'],[{firstContact:null},'no-contact'],[{railAfterContact:false},'no-rail']]){
    const next=resolvePool(s,result(s,patch),command);assert.equal(next.foul,foul);assert.equal(next.turn,'black');assert.equal(next.ballInHand,'any');
  }
  const next=resolvePool(s,result(s),command);assert.equal(next.foul,null);assert.equal(next.turn,'black');assert.equal(next.ballInHand,null);
});
test('illegal break resets rack for opponent; an eight on break is spotted',()=>{
  const s=newPool(),next=resolvePool(s,result(s,{railBalls:[1]}),command);
  assert.equal(next.breaking,true);assert.equal(next.foul,'break');assert.equal(next.turn,'black');assert.equal(next.balls.length,16);
  const eight=resolvePool(s,result(s,{potted:[{id:8,pocket:0}],balls:s.balls.filter(b=>b.id!==8)}),command);
  assert.equal(eight.winner,null);assert.equal(eight.balls.filter(b=>b.id===8).length,1);assert.equal(eight.groups.white,null);
});
test('eight wins only after clearing group, called pocket and no foul',()=>{
  const s=table();s.groups={white:'solid',black:'stripe'};s.balls=s.balls.filter(b=>b.id===0||b.id>=8);
  assert.deepEqual(poolTargets(s),[8]);const r=result(s,{firstContact:8,potted:[{id:8,pocket:2}],balls:s.balls.filter(b=>b.id!==8)}),call={...command,ball:8,pocket:2};
  assert.equal(resolvePool(s,r,call).winner,'white');assert.equal(resolvePool(s,r,{...call,pocket:1}).winner,'black');
  assert.equal(resolvePool(s,{...r,potted:[...r.potted,{id:0,pocket:2}]},call).winner,'black');
  s.balls.push({id:1,x:7,y:5});assert.equal(resolvePool(s,r,call).winner,'black');
});
test('every mode has a background and non-board modes live in the lower selector',()=>{
  const html=readFileSync(new URL('../public/index.html',import.meta.url),'utf8');
  for(const [id,mode] of Object.entries(VARIANTS)){
    assert.ok(html.includes(`data-scene="${id}"`),'Missing background for '+id);
    const fieldset=mode.category==='arcade'?html.match(/<fieldset class="arcade-options">[\s\S]*?<\/fieldset>/)[0]:html.match(/<fieldset class="variant-options">[\s\S]*?<\/fieldset>/)[0];
    assert.ok(fieldset.includes(`value="${id}"`));
  }
});
