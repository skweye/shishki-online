import {test} from 'node:test';
import assert from 'node:assert/strict';
import WebSocket from 'ws';
import {setTimeout as delay} from 'node:timers/promises';
import {randomFleet} from '../public/battleship.js';
const base=process.env.TEST_BASE_URL||'http://127.0.0.1:8787';
async function post(path,data){const r=await fetch(base+path,{method:'POST',headers:{Origin:base,'Content-Type':'application/json'},body:JSON.stringify(data)});assert.ok(r.ok);return r.json();}
function client(code,token){
  const ws=new WebSocket(base.replace(/^http/,'ws')+`/api/rooms/${code}/socket`,['checkers',token]),queue=[];
  ws.on('message',raw=>{if(raw.toString()!=='pong')queue.push(JSON.parse(raw));});
  return {ws,async send(data){await delay(115);ws.send(JSON.stringify(data));},async wait(predicate){const end=Date.now()+8000;while(Date.now()<end){const i=queue.findIndex(predicate);if(i>=0)return queue.splice(i,1)[0];await delay(20);}throw Error('Battleship response timed out');}};
}
test('battleship validates fleets and shots, preserves secrecy on every response, reconnects and rematches',{timeout:45000},async()=>{
  const room=await post('/api/rooms',{variant:'battleship'}),joined=await post(`/api/rooms/${room.code}/join`,{});
  assert.equal(room.clock,null);assert.deepEqual(room.game.fleets,{white:[],black:[]});
  let a=client(room.code,room.token);const b=client(room.code,joined.token),fleets={white:randomFleet(),black:randomFleet()};let revision=0;
  async function receive(){const x=(await a.wait(m=>m.type==='state'&&m.game.revision===revision)).game,y=(await b.wait(m=>m.type==='state'&&m.game.revision===revision)).game;
    if(!x.winner){assert.deepEqual(x.fleets.black,x.shots.white.filter(s=>s.result==='sunk').map(s=>s.sunkCells));assert.deepEqual(y.fleets.white,y.shots.black.filter(s=>s.result==='sunk').map(s=>s.sunkCells));}
    assert.deepEqual(x.shots,y.shots);return x;
  }
  try{
    await a.wait(m=>m.type==='state'&&m.ready);await b.wait(m=>m.type==='state'&&m.ready);
    await b.send({type:'fleet-ready',fleet:fleets.black,revision});await b.wait(m=>m.type==='error');
    await a.send({type:'fleet-ready',fleet:[[0]],revision});await a.wait(m=>m.type==='error');
    await a.send({type:'fleet-ready',fleet:fleets.white,revision});revision++;await receive();
    const resume=await post(`/api/rooms/${room.code}/join`,{token:joined.token});assert.deepEqual(resume.game.fleets.white,[]);
    await b.send({type:'fleet-ready',fleet:fleets.black,revision:0});await b.wait(m=>m.type==='error');
    await b.send({type:'fleet-ready',fleet:fleets.black,revision});revision++;let state=await receive();assert.equal(state.phase,'battle');
    await b.send({type:'sea-fire',cell:0,revision});await b.wait(m=>m.type==='error');
    const cell=fleets.black[0][0];await a.send({type:'sea-fire',cell,revision,winner:'white',fleets:{white:[],black:[]}});revision++;state=await receive();assert.equal(state.winner,null);
    await a.send({type:'sea-fire',cell,revision});await a.wait(m=>m.type==='error');
    await a.send({type:'sync'});const synced=await a.wait(m=>m.type==='state'&&m.game.revision===revision);assert.deepEqual(synced.game.fleets.black,[]);
    const restored=await post(`/api/rooms/${room.code}/join`,{token:room.token});assert.deepEqual(restored.game.shots,state.shots);assert.deepEqual(restored.game.fleets.black,[]);
    const reconnect=client(room.code,room.token);const rejoined=await reconnect.wait(m=>m.type==='state'&&m.game.revision===revision);assert.deepEqual(rejoined.game.fleets.black,[]);a=reconnect;
    for(const next of fleets.black.flat().filter(c=>c!==cell)){await a.send({type:'sea-fire',cell:next,revision});revision++;state=await receive();}
    assert.equal(state.winner,'white');assert.equal(state.reason,'fleet-sunk');
    await a.send({type:'rematch',revision});await b.wait(m=>m.type==='state'&&m.rematch.length===1);
    await b.send({type:'rematch',revision});revision++;state=await receive();assert.equal(state.phase,'setup');assert.deepEqual(state.ready,{white:false,black:false});assert.equal(state.winner,null);
    await b.send({type:'resign',revision});revision++;state=await receive();assert.equal(state.winner,'white');
  }finally{a.ws.close();b.ws.close();}
});
