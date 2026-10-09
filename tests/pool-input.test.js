import { test } from 'node:test';
import assert from 'node:assert/strict';
import { attachPoolInput } from '../public/pool-input.js';

function setup(){
  const canvas=new EventTarget(),captured=new Set(),calls={aim:[],power:[],shots:0,places:0};
  canvas.focus=()=>{};canvas.setPointerCapture=id=>captured.add(id);canvas.hasPointerCapture=id=>captured.has(id);canvas.releasePointerCapture=id=>captured.delete(id);
  const state={active:true,placing:false,cue:{x:4,y:5},revision:1,view:false};
  const input=attachPoolInput(canvas,{point:e=>({x:e.clientX/10,y:e.clientY/10}),current:()=>state,aim:(...args)=>calls.aim.push(args),adjustPower:delta=>calls.power.push(delta),shoot:()=>{calls.shots++;state.active=false;},place:()=>{calls.places++;state.placing=false;}});
  const event=(type,props={})=>{const e=new Event(type,{cancelable:true});Object.assign(e,{pointerId:1,pointerType:'mouse',isPrimary:true,button:0,buttons:0,clientX:100,clientY:50,...props});canvas.dispatchEvent(e);return e;};
  return {state,calls,event,input};
}
test('mouse hover aims, wheel adjusts power only over playable felt and left click shoots once',()=>{
  const {event,calls,state}=setup();
  event('pointermove',{clientX:40,clientY:80});assert.equal(calls.aim.at(-1)[0],90);
  assert.equal(event('wheel',{deltaY:-100}).defaultPrevented,true);assert.equal(event('wheel',{deltaY:100}).defaultPrevented,true);assert.deepEqual(calls.power,[.05,-.05]);
  for(const props of [{clientX:-10,deltaY:100},{ctrlKey:true,deltaY:100},{deltaY:0}])assert.equal(event('wheel',props).defaultPrevented,false);
  event('pointerdown');assert.equal(calls.shots,0);event('pointerup');assert.equal(calls.shots,1);
  event('pointerdown');event('pointerup');assert.equal(calls.shots,1);
  assert.equal(event('wheel',{deltaY:-100}).defaultPrevented,false);assert.equal(state.active,false);
});
test('drag, touch aiming, cancelled gestures and stale game state never fire an accidental shot',()=>{
  for(const mode of ['drag','touch','cancel','lost','stale','flipped','outside','right','reset']){
    const {event,calls,state,input}=setup(),props=mode==='touch'?{pointerType:'touch'}:mode==='right'?{button:2}:{clientX:40};
    event('pointerdown',props);
    if(mode==='drag'){event('pointermove',{clientX:10});assert.equal(calls.aim.at(-1)[1],.6);}
    if(mode==='cancel')event('pointercancel');if(mode==='lost')event('lostpointercapture');
    if(mode==='stale')state.revision++;if(mode==='flipped')state.view=true;if(mode==='reset')input.cancel();
    event('pointerup',mode==='outside'?{clientX:220}:mode==='drag'?{clientX:10}:props);
    assert.equal(calls.shots,0,mode);
  }
});
test('placing the cue ball does not fire a shot on release or consume the wheel',()=>{
  const {state,event,calls}=setup();state.placing=true;
  assert.equal(event('wheel',{deltaY:100}).defaultPrevented,false);
  event('pointerdown');event('pointerup');assert.equal(calls.places,1);assert.equal(calls.shots,0);
});
