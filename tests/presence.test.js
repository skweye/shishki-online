import {test} from 'node:test';
import assert from 'node:assert/strict';
import {parseHTML} from 'linkedom';
import {startPresence} from '../public/presence.js';
test('presence heartbeats pause when hidden, stop on pagehide and resume after bfcache restore',async()=>{
  const {document,window}=parseHTML('<body></body>');Object.assign(globalThis,{document,window,CustomEvent:window.CustomEvent});
  let beat,cleared=0,requests=0;const oldInterval=globalThis.setInterval,oldClear=globalThis.clearInterval;
  globalThis.setInterval=fn=>{beat=fn;return 42;};globalThis.clearInterval=()=>cleared++;
  globalThis.fetch=async()=>{requests++;return {ok:true,json:async()=>({online:4,searching:1})};};
  const updates=[];document.addEventListener('presencechange',event=>updates.push(event.detail));
  const settle=()=>new Promise(resolve=>setImmediate(resolve));
  try{
    startPresence();startPresence();await settle();assert.equal(requests,1);assert.equal(updates[0].online,4);
    document.hidden=true;document.dispatchEvent(new window.Event('visibilitychange'));await beat();assert.equal(requests,1);
    document.hidden=false;document.dispatchEvent(new window.Event('visibilitychange'));await settle();assert.equal(requests,2);
    window.dispatchEvent(new window.Event('pagehide'));await beat();assert.equal(requests,2);assert.ok(cleared);
    window.dispatchEvent(new window.Event('pageshow'));await settle();assert.equal(requests,3);
  }finally{globalThis.setInterval=oldInterval;globalThis.clearInterval=oldClear;}
});
