import {test} from 'node:test';
import assert from 'node:assert/strict';
import {newPool,simulatePool,TABLE,pocketGeometry,POCKETS} from '../public/pool.js';
import {simulatePoolSweep} from '../public/pool-sweep.js';
import {applyOwnerPrank} from '../public/pranks.js';
import {parseHTML} from 'linkedom';
import {createPoolBoard} from '../public/pool-board.js';

test('sweep rolls through the rack, pockets both groups and the eight last without scratching or teleporting',()=>{
  for(let i=0;i<12;i++){
    const state=newPool();
    if(i)state.balls=simulatePool(state,.5+(i%5)*.1,(i-6)*.012).balls;
    if(!state.balls.some(b=>b.id===0))continue;
    const before=structuredClone(state),result=simulatePoolSweep(state,true),authoritative=simulatePoolSweep(state);
    assert.deepEqual(state,before);assert.deepEqual(authoritative.balls,result.balls);assert.deepEqual(authoritative.potted,result.potted);
    assert.deepEqual(result.frames[0],state.balls);assert.deepEqual(result.frames.at(-1),result.balls);
    assert.deepEqual(result.potted.map(b=>b.id).sort((a,b)=>a-b),state.balls.filter(b=>b.id).map(b=>b.id).sort((a,b)=>a-b));
    assert.equal(result.potted.at(-1).id,8);assert.equal(result.balls.length,1);assert.equal(result.balls[0].id,0);
    let last=new Map(state.balls.map(b=>[b.id,b]));
    for(const frame of result.frames){
      assert.ok(frame.some(b=>b.id===0),'the cue never disappears');
      for(const ball of frame){
        assert.ok(Number.isFinite(ball.x)&&Number.isFinite(ball.y));
        assert.ok(last.has(ball.id),'pocketed balls never reappear');
        assert.ok(Math.hypot(ball.x-last.get(ball.id).x,ball.y-last.get(ball.id).y)<1.5,'continuous rolling position');
      }
      last=new Map(frame.map(b=>[b.id,b]));
    }
    const pockets=result.events.filter(e=>e.kind==='pocket');assert.equal(pockets.length,result.potted.length);
    for(const event of pockets){const end=pocketGeometry(POCKETS[event.pocket]);assert.ok(Math.hypot(event.x-end.x,event.y-end.y)<TABLE.pocket);}
    assert.ok(result.events.some(e=>e.kind==='ball'));assert.ok(result.frames.length<3600,'bounded animation duration');
    const next=applyOwnerPrank(state,'white');assert.equal(next.winner,'white');assert.deepEqual(next.balls,result.balls);assert.equal(next.lastShot.kind,'sweep');
  }
});

test('sweep needs a cue, cannot alter a completed match and finishes correctly with only the eight left',()=>{
  const game=newPool();
  assert.throws(()=>simulatePoolSweep({...game,balls:game.balls.filter(b=>b.id!==0)}),/биток/);
  assert.throws(()=>simulatePoolSweep({...game,winner:'black'}));
  const final={...game,turn:'black',balls:[{id:0,x:4,y:5},{id:8,x:10,y:5}]};
  const next=applyOwnerPrank(final,'black');assert.equal(next.winner,'black');assert.deepEqual(next.lastShot.potted.map(b=>b.id),[8]);
});

test('sweep playback schedules collision sounds, holds results and cleans up on hidden tab and reduced motion',()=>{
  const {document,window}=parseHTML('<html data-low-performance="true"><body><div id="pool-board"></div></body></html>');
  const gradient={addColorStop(){}},context=new Proxy({createImageData:(w,h)=>({data:new Uint8ClampedArray(w*h*4)}),createLinearGradient:()=>gradient,createRadialGradient:()=>gradient},{get:(target,key)=>target[key]||(()=>{})});
  window.HTMLCanvasElement.prototype.getContext=()=>context;
  const frames=new Map();let id=0,reduced=false,finished=0;const sounds=[];
  Object.assign(globalThis,{document,window,MutationObserver:window.MutationObserver,getComputedStyle:()=>({getPropertyValue:()=>''}),matchMedia:query=>({matches:query.includes('reduced-motion')&&reduced,addEventListener(){}}),requestAnimationFrame:fn=>{frames.set(++id,fn);return id;},cancelAnimationFrame:id=>frames.delete(id)});
  const board=createPoolBoard({shoot(){},place(){},sound:kind=>sounds.push(kind)});
  const before={...newPool(),breaking:false,ballInHand:null,balls:[{id:0,x:4,y:5},{id:1,x:8,y:3},{id:8,x:14,y:6},{id:9,x:18,y:4}]},next=applyOwnerPrank(before,'white');
  const complete=()=>{finished++;board.render(next,false,false);};
  const run=time=>{const callbacks=[...frames.values()];frames.clear();callbacks.forEach(fn=>fn(time));};
  board.render(before,false,true);board.animate(before,next,complete);board.render(next,false,false);
  assert.equal(finished,0);assert.equal(board.presentationState(),before);assert.equal(sounds.length,0);
  for(let time=0;time<=6000;time+=16)run(time);
  assert.equal(finished,1);assert.equal(board.presentationState(),null);assert.equal(sounds.filter(k=>k==='pocket').length,3);assert.equal(sounds.filter(k=>k==='ball').length,3);
  board.render(before,false,true);board.animate(before,next,complete);run(0);
  const count=sounds.length;document.hidden=true;document.dispatchEvent(new window.Event('visibilitychange'));
  assert.equal(finished,2);assert.equal(frames.size,0);run(60000);assert.equal(sounds.length,count);assert.equal(board.presentationState(),null);
  document.hidden=false;reduced=true;board.render(before,false,true);board.animate(before,next,complete);
  assert.equal(finished,3);assert.equal(frames.size,0);assert.equal(sounds.length,count);assert.equal(board.presentationState(),null);
  board.cancel();
});
