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
test('nearby parallel shots are not pulled into middle pockets at any speed',()=>{
  for(const y of [.27,.4,.6,9.4,9.6,9.73])for(const speed of [.1,.35,1]){
    const s=table();s.balls=[{id:0,x:9.5,y}];
    const r=simulatePool(s,speed,0,true);
    assert.ok(r.potted.every(b=>![1,4].includes(b.pocket)),`y=${y}, speed=${speed}`);
    assert.ok(r.frames.every(frame=>!frame.length||Math.abs(frame[0].y-y)<1e-8));
  }
});
test('direct shots enter the recessed middle openings and glancing shots hit the cushion',()=>{
  for(const bottom of [false,true]){
    const s=table();s.balls=[{id:0,x:10,y:bottom?8:2}];
    assert.deepEqual(simulatePool(s,0,bottom?.2:-.2).potted,[{id:0,pocket:bottom?4:1}]);
    s.balls[0].x=10.55;
    const miss=simulatePool(s,0,bottom?.1:-.1,true);
    assert.deepEqual(miss.potted,[]);assert.ok(miss.events.some(e=>e.kind==='rail'));
  }
});
test('invalid and cross-mode shots cannot mutate a game',()=>{
  const s=newPool();for(const [dx,dy] of [[0,0],[NaN,0],[Infinity,0],[2,0],['1',0]])assert.throws(()=>applyPoolShot(s,{dx,dy}));
  assert.throws(()=>applyPoolShot(newGame(),command));assert.throws(()=>applyPoolShot({...s,winner:'white'},command));
  assert.deepEqual(applyPoolShot(table(),{dx:.85,dy:0}),applyPoolShot(table(),{...command,ball:8,pocket:99}));assert.equal(s.revision,0);
});
test('cue ball placement requires ball in hand, a free legal point and kitchen restriction',()=>{
  let s=newPool();for(const [x,y] of [[10,5],[0,0],[NaN,5],[4,11]])assert.throws(()=>placePoolCue(s,x,y));
  s=placePoolCue(s,3,4);assert.equal(s.revision,1);assert.deepEqual(s.balls.find(b=>b.id===0),{id:0,x:3,y:4});
  s.ballInHand='any';assert.throws(()=>placePoolCue(s,14.5,5));assert.ok(placePoolCue(s,10,5));s.ballInHand=null;assert.throws(()=>placePoolCue(s,10,5));
});
test('first legally potted ball assigns groups without calls; own ball retains turn and opponent ball does not',()=>{
  const s=table(),r=result(s,{potted:[{id:1,pocket:0}],balls:s.balls.filter(b=>b.id!==1)});
  const next=resolvePool(s,r,command);assert.deepEqual(next.groups,{white:'solid',black:'stripe'});assert.equal(next.turn,'white');assert.ok(!poolTargets(next).includes(1));
  const uncalled=resolvePool(s,r,{dx:.5,dy:0});assert.equal(uncalled.turn,'white');assert.equal(uncalled.groups.white,'solid');
  const assigned={...s,groups:{white:'solid',black:'stripe'}};
  assert.equal(resolvePool(assigned,{...r,potted:[{id:9,pocket:3}]},command).turn,'black');
  assert.equal(resolvePool(assigned,{...r,potted:[{id:9,pocket:3},{id:1,pocket:5}]},command).turn,'white');
  assert.equal(resolvePool(s,{...r,potted:[{id:9,pocket:3},{id:1,pocket:5}]},command).groups.white,'stripe');
  const scratch=resolvePool(s,{...r,potted:[...r.potted,{id:0,pocket:1}]},command);assert.equal(scratch.turn,'black');assert.equal(scratch.groups.white,null);assert.equal(scratch.ballInHand,'any');
});
test('wrong ball, no contact and no rail award ball in hand; legal miss changes turn',()=>{
  const s=table();s.groups={white:'solid',black:'stripe'};
  for(const [patch,foul] of [[{firstContact:9},'wrong-ball'],[{firstContact:null},'no-contact'],[{railAfterContact:false},'no-rail']]){
    const next=resolvePool(s,result(s,patch),command);assert.equal(next.foul,foul);assert.equal(next.turn,'black');assert.equal(next.ballInHand,'any');
  }
  const next=resolvePool(s,result(s),command);assert.equal(next.foul,null);assert.equal(next.turn,'black');assert.equal(next.ballInHand,null);
});
test('illegal break keeps final positions for opponent; an eight on break is spotted',()=>{
  const s=newPool(),simulation=simulatePool(s,.4,0),next=applyPoolShot(s,{dx:.4,dy:0});
  assert.equal(simulation.potted.length,0);assert.ok(simulation.railBalls.length<4);
  assert.equal(next.breaking,false);assert.equal(next.foul,'break');assert.equal(next.turn,'black');assert.equal(next.ballInHand,'kitchen');
  assert.deepEqual(next.balls,simulation.balls);assert.notDeepEqual(next.balls,s.balls);
  assert.equal(next.history.length,1);assert.deepEqual(next.groups,{white:null,black:null});
  const eight=resolvePool(s,result(s,{potted:[{id:8,pocket:0}],balls:s.balls.filter(b=>b.id!==8)}),command);
  assert.equal(eight.winner,null);assert.equal(eight.balls.filter(b=>b.id===8).length,1);assert.equal(eight.groups.white,null);
});
test('eight wins in any pocket after clearing group without fouls or declarations',()=>{
  const s=table();s.groups={white:'solid',black:'stripe'};s.balls=s.balls.filter(b=>b.id===0||b.id>=8);
  assert.deepEqual(poolTargets(s),[8]);const r=result(s,{firstContact:8,potted:[{id:8,pocket:2}],balls:s.balls.filter(b=>b.id!==8)}),call={...command,ball:8,pocket:2};
  assert.equal(resolvePool(s,r,call).winner,'white');assert.equal(resolvePool(s,r,{dx:.5,dy:0}).winner,'white');
  for(let pocket=0;pocket<6;pocket++)assert.equal(resolvePool(s,{...r,potted:[{id:8,pocket}]},command).winner,'white');
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
