import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pieceReaction, FINISH_DURATION } from '../public/finish-interactions.js';
import { CATALOG } from '../public/shop-catalog.js';
import { finishLayout } from '../public/finish-layout.js';
import { createRocketEffect } from '../public/rocket.js';
import { parseHTML } from 'linkedom';

test('finish stage preserves equal axes on wide, tall and square boards and excludes controls',()=>{
  for(const [width,height] of [[1200,660],[350,900],[640,640],[220,180]]){
    const layout=finishLayout(width,height,{left:10,top:30,width:width-20,height:height-80});
    assert.equal(layout.size,Math.min(width-20,height-80));assert.equal(layout.top,30);assert.equal(layout.left,10);
    assert.ok(layout.size<=layout.width&&layout.size<=layout.height);
  }
  assert.deepEqual(finishLayout(300,500,{left:20,top:40,width:1000,height:1000}),{left:20,top:40,width:280,height:460,size:280});
});

test('every finish effect mounts a square stage on a rectangular board and cleans up when hidden',()=>{
  const {document,window}=parseHTML('<html><body><div id="frame"></div></body></html>');
  Object.assign(globalThis,{document,window,matchMedia:()=>({matches:false}),requestAnimationFrame:()=>1,cancelAnimationFrame:()=>{}});
  const frame=document.getElementById('frame');Object.assign(frame,{clientWidth:1000,clientHeight:400,clientLeft:0,clientTop:0,offsetWidth:1000,offsetHeight:400});
  frame.getBoundingClientRect=()=>({left:0,top:0,width:1000,height:400});
  const effect=createRocketEffect(frame,{play(){}});let completed=0;
  for(const item of CATALOG.filter(item=>item.type==='effect'&&item.value!=='none')){
    effect.launch(false,()=>completed++,item.value);
    const stage=frame.querySelector('.finish-stage');assert.ok(stage.children.length);assert.equal(stage.style.width,'400px');assert.equal(stage.style.height,'400px');
    assert.equal(frame.querySelectorAll('.rocket-effect').length,1);effect.cancel();assert.equal(frame.querySelectorAll('.rocket-effect').length,0);
  }
  effect.launch(false,()=>completed++,'portal');Object.defineProperty(document,'hidden',{value:true,configurable:true});document.dispatchEvent(new window.Event('visibilitychange'));
  assert.equal(completed,1);assert.equal(frame.querySelectorAll('.rocket-effect,.finish-pieces').length,0);
});

const options = { winner: 'white', fromTop: false };
test('all effects leave board positions untouched and return finite, bounded presentation values', () => {
  for (const item of CATALOG.filter(item => item.type === 'effect')) for (const side of ['white', 'black']) for (const fromTop of [false, true]) {
    for (const position of [[0,0],[.5,.5],[1,1],[.25,.75]]) {
      const piece = Object.freeze({ x: position[0], y: position[1], side });
      for (let time = 0; time <= FINISH_DURATION; time += 40) {
        const result = pieceReaction(item.value, piece, time, { ...options, fromTop });
        for (const [key, value] of Object.entries(result)) if (key !== 'color') assert.ok(Number.isFinite(value), `${item.value}: ${key}`);
        assert.ok(result.opacity >= 0 && result.opacity <= 1); assert.ok(result.scale > 0 && result.scale < 1.5);
      }
      const final = pieceReaction(item.value, piece, FINISH_DURATION, options);
      assert.equal(final.x, 0); assert.equal(final.y, 0); assert.equal(final.scale, 1); assert.equal(final.opacity, 1); assert.equal(final.rotation, 0);
    }
  }
});
test('rocket wave reaches nearby pieces first and pushes the losing side more strongly', () => {
  const near = { x: .6, y: .24, side: 'black' }, far = { x: .9, y: .9, side: 'black' };
  assert.equal(pieceReaction('rocket', near, 1200, options).x, 0);
  assert.ok(pieceReaction('rocket', near, 1300, options).x > 0);
  assert.equal(pieceReaction('rocket', far, 1300, options).x, 0);
  assert.ok(pieceReaction('rocket', near, 1800, options).x > pieceReaction('rocket', { ...near, side: 'white' }, 1800, options).x);
});
test('comet contacts follow its diagonal and mirror correctly when the board direction reverses', () => {
  const piece = { x: .3, y: .7, side: 'black' };
  const before = pieceReaction('comet', piece, 500, options), hit = pieceReaction('comet', piece, 1200, options);
  assert.equal(before.x, 0); assert.ok(hit.x > 0); assert.ok(hit.y < 0);
  const mirror = pieceReaction('comet', { x: .7, y: .3, side: 'black' }, 1200, { ...options, fromTop: true });
  assert.ok(Math.abs(hit.x + mirror.x) < .00001);
});
test('portal absorbs opponents and reduced motion keeps all pieces stationary and visible', () => {
  const loser = { x: .2, y: .7, side: 'black' };
  const pulled = pieceReaction('portal', loser, 1900, options);
  assert.ok(Math.abs(loser.x + pulled.x - .5) < .001); assert.ok(Math.abs(loser.y + pulled.y - .5) < .001);
  assert.equal(pulled.opacity, 0);
  assert.equal(pieceReaction('portal', { ...loser, side: 'white' }, 1900, options).opacity, 1);
  for (const item of CATALOG.filter(item => item.type === 'effect')) {
    const result = pieceReaction(item.value, loser, 100, { ...options, reduced: true });
    assert.equal(result.x, 0); assert.equal(result.y, 0); assert.equal(result.scale, 1); assert.equal(result.rotation, 0); assert.equal(result.opacity, 1);
  }
});


test('sakura and blizzard cover wide fields without stretching particles and cancel their animations',()=>{
  const {document,window}=parseHTML('<html><body><div id="frame"></div></body></html>');
  let reduced=false,cancelled=0,animations=[];
  Object.assign(globalThis,{document,window,matchMedia:()=>({matches:reduced}),requestAnimationFrame:()=>1,cancelAnimationFrame(){}});
  window.HTMLElement.prototype.animate=function(frames,timing){animations.push({frames,timing});return {cancel(){cancelled++;}};};
  const frame=document.getElementById('frame');Object.assign(frame,{clientWidth:1000,clientHeight:400,clientLeft:0,clientTop:0,offsetWidth:1000,offsetHeight:400});
  frame.getBoundingClientRect=()=>({left:0,top:0,width:1000,height:400});
  const effect=createRocketEffect(frame,{play(){}});
  try{
    for(const [name,count,selector] of [['petals',34,'.weather-petal'],['blizzard',64,'.weather-snow']]){
      animations=[];cancelled=0;effect.launch(false,()=>{},name);
      const field=frame.querySelector('.weather-field');assert.equal(field.style.width,'1000px');assert.equal(field.style.height,'400px');
      assert.equal(field.querySelectorAll(selector).length,count);assert.equal(animations.length,count);
      for(const {frames,timing} of animations){assert.equal(frames[0].opacity,0);assert.equal(frames.at(-1).opacity,0);assert.ok(timing.duration+timing.delay<=FINISH_DURATION);assert.ok(frames.every(frame=>!frame.transform.includes('NaN')));}
      effect.cancel();assert.equal(cancelled,count);assert.equal(frame.querySelector('.weather-field'),null);
    }
    reduced=true;effect.launch(false,()=>{},'petals');assert.equal(frame.querySelectorAll('.weather-petal').length,0);effect.cancel();
  }finally{delete window.HTMLElement.prototype.animate;effect.cancel();}
});
