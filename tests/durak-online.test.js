import {test} from 'node:test';
import assert from 'node:assert/strict';
import WebSocket from 'ws';
import {setTimeout as delay} from 'node:timers/promises';
import {DURAK_VARIANTS,durakActions} from '../public/durak.js';
const base=process.env.TEST_BASE_URL||'http://127.0.0.1:8787';
async function post(path,data){const response=await fetch(base+path,{method:'POST',headers:{Origin:base,'Content-Type':'application/json'},body:JSON.stringify(data)});const result=await response.json();assert.ok(response.ok,JSON.stringify(result));return result;}
function client(code,token){
  const ws=new WebSocket(base.replace(/^http/,'ws')+`/api/rooms/${code}/socket`,['checkers',token]),queue=[];
  ws.on('message',raw=>{if(raw.toString()!=='pong')queue.push(JSON.parse(raw));});
  return {ws,async send(data){await delay(105);ws.send(JSON.stringify(data));},async wait(predicate){const end=Date.now()+7000;while(Date.now()<end){const i=queue.findIndex(predicate);if(i>=0)return queue.splice(i,1)[0];await delay(15);}throw Error('Durak response timed out');}};
}
for(const variant of DURAK_VARIANTS)test(variant+' validates online play, secrecy, chat, resume and rematch',{timeout:45000},async()=>{
  const room=await post('/api/rooms',{variant}),join=await post(`/api/rooms/${room.code}/join`,{});
  assert.equal(room.clock,null);assert.equal(room.game.stock,undefined);assert.deepEqual(room.game.hands.black,[]);assert.deepEqual(join.game.hands.white,[]);
  const clients={white:client(room.code,room.token),black:client(room.code,join.token)};let revision=0;
  async function receive(){const views={};for(const side of ['white','black']){const m=await clients[side].wait(m=>m.type==='state'&&m.game.revision===revision&&m.ready);const g=m.game;assert.equal(g.variant,variant);assert.equal(g.stock,undefined);assert.deepEqual(g.hands[side==='white'?'black':'white'],[]);assert.equal(g.hands[side].length,g.handCounts[side]);views[side]=g;}assert.deepEqual(views.white.table,views.black.table);return views;}
  try{
    let views=await receive(),side=views.white.turn,wrong=side==='white'?'black':'white';
    await clients[wrong].send({type:'durak-attack',card:views[wrong].hands[wrong][0],revision});await clients[wrong].wait(m=>m.type==='error');
    await clients[side].send({type:'durak-attack',card:99,revision});await clients[side].wait(m=>m.type==='error');
    await clients[side].send({type:'durak-attack',card:views[wrong].hands[wrong][0],revision});await clients[side].wait(m=>m.type==='error');
    for(let i=0;i<18;i++){
      side=views.white.turn;const legal=durakActions(views[side]);assert.ok(legal.length);
      const action=legal.find(a=>a.type==='durak-transfer')||legal.find(a=>a.type==='durak-defend')||legal.find(a=>a.type==='durak-finish')||legal[0];
      const old=revision;await clients[side].send({...action,revision,winner:side,stock:[],hands:{white:[],black:[]}});revision++;views=await receive();assert.equal(views.white.winner,null);
      if(i===0){await clients[side].send({...action,revision:old});await clients[side].wait(m=>m.type==='error');}
    }
    await clients.white.send({type:'chat',text:'Карты работают!'});const chat=await clients.black.wait(m=>m.type==='chat');assert.ok(chat.message);
    await clients.black.send({type:'sync'});const sync=await clients.black.wait(m=>m.type==='state'&&m.game.revision===revision);assert.deepEqual(sync.game.hands.white,[]);
    const resumed=await post(`/api/rooms/${room.code}/join`,{token:room.token});assert.deepEqual(resumed.game.hands.white,views.white.hands.white);assert.deepEqual(resumed.game.hands.black,[]);assert.deepEqual(resumed.game.table,views.white.table);
    clients.white.ws.close();clients.white=client(room.code,room.token);await clients.white.wait(m=>m.type==='state'&&m.game.revision===revision);
    await clients.black.send({type:'resign',revision});revision++;views=await receive();assert.equal(views.white.winner,'white');
    await clients.white.send({type:'rematch',revision});await clients.black.wait(m=>m.type==='state'&&m.rematch.length===1);
    await clients.black.send({type:'rematch',revision});revision++;views=await receive();assert.equal(views.white.winner,null);assert.equal(views.white.stockCount,24);assert.equal(views.white.hands.white.length,6);assert.equal(views.black.hands.black.length,6);assert.equal(views.white.history.length,0);
    await clients.white.send({type:'durak-take',revision:0});await clients.white.wait(m=>m.type==='error');
  }finally{clients.white.ws.close();clients.black.ws.close();}
});
