import {test} from 'node:test';
import assert from 'node:assert/strict';
import {parseHTML} from 'linkedom';
import {readFileSync} from 'node:fs';
import {createMatchmaking} from '../public/matchmaking.js';
const storage=new Map(),key='shishki-search-v1';
function setup(t,request,onMatch=async(_result,ack)=>ack()){
  t.mock.timers.enable({apis:['setTimeout','setInterval']});
  const {document,window}=parseHTML(readFileSync(new URL('../public/index.html',import.meta.url),'utf8'));
  const $=id=>document.getElementById(id),dialog=$('search-dialog'),sounds=[];
  Object.assign(globalThis,{document,window,localStorage:{getItem:k=>storage.get(k)||null,setItem:(k,v)=>storage.set(k,v),removeItem:k=>storage.delete(k)}});
  dialog.showModal=()=>{dialog.open=true;};dialog.close=()=>{dialog.open=false;};
  return {$,sounds,ui:createMatchmaking({request,onMatch,sound:kind=>sounds.push(kind)})};
}
const waiting=data=>({status:'waiting',ticket:data.ticket,variant:data.variant,startedAt:Date.now()});
test('cancel during an in-flight join waits for identity cookie then removes queue and stops polling',async t=>{
  storage.clear();let resolve;const calls=[];
  const f=setup(t,async(_path,data)=>{calls.push(data);if(data.action==='join')return new Promise(r=>resolve=()=>r(waiting(data)));return {status:'cancelled'};});
  const start=f.ui.start('pool8');await f.ui.cancel();assert.deepEqual(calls.map(c=>c.action),['join']);resolve();await start;
  assert.deepEqual(calls.map(c=>c.action),['join','cancel']);assert.equal(calls[0].ticket,calls[1].ticket);
  assert.equal(f.$('search-dialog').open,false);assert.equal(storage.has(key),false);assert.deepEqual(f.sounds,['search-start','search-cancel']);
  t.mock.timers.tick(60000);assert.equal(calls.length,2);
});
test('match wins cancellation race, saves seat before acknowledgement and enters once',async t=>{
  storage.clear();let resolve,entries=0;const calls=[];
  const f=setup(t,async(_path,data)=>{calls.push(data);if(data.action==='join')return new Promise(r=>resolve=()=>r({status:'matched',ticket:data.ticket,code:'ABC',token:'seat'}));return {status:'matched'};},async(result,ack)=>{
    assert.equal(storage.get('shashki-room-ABC'),'seat');await ack();entries++;
  });
  const start=f.ui.start('chess');await f.ui.cancel();resolve();await start;
  assert.equal(entries,1);assert.deepEqual(calls.map(c=>c.action),['join','ack']);assert.deepEqual(f.sounds,['search-start','match-found']);assert.equal(f.$('search-dialog').open,false);
  t.mock.timers.tick(10000);assert.equal(entries,1);
});
test('retry preserves join ticket and cancellation intent across network failures',async t=>{
  storage.clear();let failures=2;const calls=[];
  const f=setup(t,async(_path,data)=>{calls.push(data);if(failures-->0)throw Error('Network');return data.action==='cancel'?{status:'cancelled'}:waiting(data);});
  await f.ui.start('russian');assert.equal(f.$('search-retry').hidden,false);
  await f.$('search-retry').onclick();assert.equal(calls[1].action,'join');assert.equal(calls[1].ticket,calls[0].ticket);
  await f.$('search-retry').onclick();failures=1;await f.ui.cancel();assert.equal(f.$('search-dialog').open,true);
  await f.$('search-retry').onclick();assert.deepEqual(calls.slice(-2).map(c=>c.action),['cancel','cancel']);assert.equal(f.$('search-dialog').open,false);
});
test('resume restores queue, explains expiry, and restarts only on explicit retry',async t=>{
  storage.clear();const ticket=crypto.randomUUID();storage.set(key,JSON.stringify({ticket,variant:'battleship',owner:null,phase:'status',startedAt:Date.now()}));
  const calls=[];const f=setup(t,async(_path,data)=>{calls.push(data);return data.action==='status'?{status:'expired'}:data.action==='cancel'?{status:'cancelled'}:waiting(data);});
  await f.ui.resume();assert.equal(calls[0].ticket,ticket);assert.match(f.$('search-status').textContent,/истёк/);assert.equal(f.$('search-dialog').open,true);
  await f.$('search-retry').onclick();assert.notEqual(calls[1].ticket,ticket);assert.equal(calls[1].action,'join');await f.ui.cancel();
});
