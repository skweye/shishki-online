// Run against `npm run dev`, or set TEST_BASE_URL to a deployed Worker.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { setTimeout as delay } from 'node:timers/promises';
import { applyShot } from '../public/chapaev.js';
import { legalMoves } from '../public/game.js';
import { applyPoolShot } from '../public/pool.js';
import { dominoMoves } from '../public/domino.js';

test('domino keeps hands private through HTTP, sockets, rejected moves and reconnects; synchronizes rounds and rematches', {timeout:60000}, async()=>{
  const {data:room,status}=await post('/api/rooms',{variant:'domino'});assert.equal(status,201);assert.equal(room.clock,null);
  const {data:joined}=await post(`/api/rooms/${room.code}/join`);
  const a=client(room.code,room.token),b=client(room.code,joined.token),players={white:a,black:b};
  function privateView(g,role){assert.equal('stock' in g,false);assert.equal(g.hands[role].length,g.handCounts[role]);if(!g.roundResult&&!g.winner)assert.deepEqual(g.hands[role==='white'?'black':'white'],[]);}
  privateView(room.game,'white');privateView(joined.game,'black');
  let views={white:room.game,black:joined.game};
  async function receive(revision){
    views.white=(await a.wait(m=>m.type==='state'&&m.game.revision===revision)).game;
    views.black=(await b.wait(m=>m.type==='state'&&m.game.revision===revision)).game;
    for(const side of ['white','black'])privateView(views[side],side);
    for(const key of ['chain','score','roundResult','turn','stockCount','handCounts','readyNext'])assert.deepEqual(views.white[key],views.black[key]);
  }
  try{
    await a.wait(m=>m.type==='state'&&m.ready);await b.wait(m=>m.type==='state'&&m.ready);
    const active=room.game.turn,other=active==='white'?'black':'white';
    await players[other].send({type:'domino-play',id:room.game.opening,end:'right',revision:0});await players[other].wait(m=>m.type==='error'&&m.message.includes('соперника'));
    privateView((await players[other].wait(m=>m.type==='state'&&m.game.revision===0)).game,other);
    await players[active].send({type:'domino-play',id:views[other].hands[other][0],end:'right',revision:0});await players[active].wait(m=>m.type==='error');
    privateView((await players[active].wait(m=>m.type==='state'&&m.game.revision===0)).game,active);
    await players[active].send({type:'domino-draw',revision:0});await players[active].wait(m=>m.type==='error');
    let steps=0;
    while(!views.white.roundResult&&steps++<100){
      const side=views.white.turn,g=views[side],move=dominoMoves(g)[0];
      await players[side].send({...move,type:move?'domino-play':g.stockCount?'domino-draw':'domino-pass',revision:g.revision,score:{white:999,black:999},hands:{white:[],black:[]}});
      await receive(g.revision+1);
    }
    assert.ok(views.white.roundResult);assert.ok(views.white.score.white<999&&views.white.score.black<999);
    if(!views.white.winner){
      let revision=views.white.revision;await a.send({type:'domino-ready',revision});await receive(revision+1);assert.equal(views.white.round,1);assert.deepEqual(views.white.readyNext,['white']);
      await b.send({type:'domino-ready',revision});await b.wait(m=>m.type==='error'&&m.message.includes('изменилась'));
      revision=views.white.revision;await b.send({type:'domino-ready',revision});await receive(revision+1);assert.equal(views.white.round,2);assert.equal(views.white.handCounts.white,7);assert.equal(views.white.stockCount,14);
    }
    await a.send({type:'sync'});privateView((await a.wait(m=>m.type==='state'&&m.game.revision===views.white.revision)).game,'white');
    const {data:restored}=await post(`/api/rooms/${room.code}/join`,{token:room.token});assert.deepEqual(restored.game,views.white);privateView(restored.game,'white');
    await a.send({type:'chat',text:'Домино!'});assert.equal((await b.wait(m=>m.type==='chat')).message.text,'Домино!');
    if(!views.white.winner){const rev=views.white.revision;await b.send({type:'resign',revision:rev});await receive(rev+1);assert.equal(views.white.winner,'white');}
    const rev=views.white.revision;await a.send({type:'rematch',revision:rev});await b.wait(m=>m.type==='state'&&m.rematch.length===1);
    await b.send({type:'rematch',revision:rev});await receive(rev+1);
    assert.equal(views.white.variant,'domino');assert.equal(views.white.round,1);assert.equal(views.white.winner,null);assert.deepEqual(views.white.score,{white:0,black:0});assert.equal(views.white.stockCount,14);
  }finally{a.ws.close();b.ws.close();}
});

test('pool server validates shots and placement, synchronizes, restores, chats and rematches',async()=>{
  const {data:room,status}=await post('/api/rooms',{variant:'pool8'});assert.equal(status,201);assert.equal(room.clock,null);
  const {data:joined}=await post(`/api/rooms/${room.code}/join`);
  const a=client(room.code,room.token),b=client(room.code,joined.token);
  try{
    await a.wait(m=>m.type==='state'&&m.ready);await b.wait(m=>m.type==='state'&&m.ready);
    await b.send({type:'pool-shot',dx:.85,dy:0,revision:0});await b.wait(m=>m.type==='error'&&m.message.includes('соперника'));
    await a.send({type:'pool-place',x:10,y:5,revision:0});await a.wait(m=>m.type==='error');
    await a.send({type:'pool-place',x:4,y:5,revision:0});
    const placed=await b.wait(m=>m.type==='state'&&m.game.revision===1);
    assert.equal(placed.game.balls.find(ball=>ball.id===0).x,4);
    await a.send({type:'pool-shot',dx:100,dy:0,revision:1});await a.wait(m=>m.type==='error');
    await a.send({type:'pool-shot',dx:.85,dy:0,revision:0});await a.wait(m=>m.type==='error'&&m.message.includes('изменилась'));
    const command={type:'pool-shot',dx:.85,dy:0,revision:1};
    await a.send({...command,balls:[],winner:'white'});
    const hit=await a.wait(m=>m.type==='state'&&m.game.revision===2);
    assert.deepEqual(hit.game,applyPoolShot(placed.game,command));assert.equal(hit.clock,null);
    assert.deepEqual((await b.wait(m=>m.type==='state'&&m.game.revision===2)).game,hit.game);
    const shooter=hit.game.turn==='white'?a:b;
    await shooter.send({type:'pool-shot',dx:.05,dy:0,revision:2});
    const uncalled=await a.wait(m=>m.type==='state'&&m.game.revision===3);
    assert.deepEqual(uncalled.game,applyPoolShot(hit.game,{dx:.05,dy:0}));
    assert.deepEqual((await b.wait(m=>m.type==='state'&&m.game.revision===3)).game,uncalled.game);
    const {data:restore}=await post(`/api/rooms/${room.code}/join`,{token:room.token});assert.deepEqual(restore.game,uncalled.game);
    await a.send({type:'chat',text:'Pool test'});assert.equal((await b.wait(m=>m.type==='chat')).message.text,'Pool test');
    await b.send({type:'resign',revision:3});await a.wait(m=>m.type==='state'&&m.game.winner==='white');
    await a.send({type:'rematch',revision:4});await b.send({type:'rematch',revision:4});
    const fresh=await a.wait(m=>m.type==='state'&&m.game.revision===5);assert.equal(fresh.game.variant,'pool8');assert.equal(fresh.game.balls.length,16);assert.equal(fresh.game.winner,null);assert.equal(fresh.clock,null);
    await a.send({type:'pool-shot',dx:.4,dy:0,revision:5});
    const weak=await a.wait(m=>m.type==='state'&&m.game.revision===6);
    assert.equal(weak.game.breaking,false);assert.equal(weak.game.foul,'break');assert.equal(weak.game.turn,'black');
    assert.deepEqual(weak.game,applyPoolShot(fresh.game,{dx:.4,dy:0}));assert.notDeepEqual(weak.game.balls,fresh.game.balls);
    assert.deepEqual((await b.wait(m=>m.type==='state'&&m.game.revision===6)).game,weak.game);
    const {data:weakRestore}=await post(`/api/rooms/${room.code}/join`,{token:room.token});assert.deepEqual(weakRestore.game.balls,weak.game.balls);
  }finally{a.ws.close();b.ws.close();}
});

const base = process.env.TEST_BASE_URL || 'http://127.0.0.1:8787';
async function post(path, body = {}) {
  const response = await fetch(base + path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  return { status: response.status, data: await response.json() };
}
function client(code, token) {
  const ws = new WebSocket(base.replace(/^http/, 'ws') + `/api/rooms/${code}/socket`, ['checkers', token]);
  const messages = [];
  ws.addEventListener('message', event => { if (event.data !== 'pong') messages.push(JSON.parse(event.data)); });
  async function wait(predicate) {
    const end = Date.now() + 8000;
    while (Date.now() < end) {
      const found = messages.findIndex(predicate);
      if (found >= 0) return messages.splice(found, 1)[0];
      await delay(25);
    }
    throw new Error('Timed out waiting for websocket message: ' + JSON.stringify(messages));
  }
  return { ws, wait, async send(data) { await delay(110); ws.send(JSON.stringify(data)); } };
}

test('long narde synchronizes server dice and partial turns, restores, rejects cheating and rematches', async()=>{
  const {data:room}=await post('/api/rooms',{variant:'narde'});
  assert.equal(room.game.board.length,24);assert.equal(room.clock,null);
  const {data:joined}=await post(`/api/rooms/${room.code}/join`);
  const white=client(room.code,room.token),black=client(room.code,joined.token),players={white,black};
  try {
    await white.wait(m=>m.type==='state'&&m.ready);await black.wait(m=>m.type==='state'&&m.ready);
    await black.send({type:'roll',revision:0});await black.wait(m=>m.type==='error'&&m.message.includes('соперника'));
    await white.send({type:'roll',revision:0,dice:[99,99]});
    let state=await white.wait(m=>m.type==='state'&&m.game.revision===1);
    assert.ok(state.game.dice.every(n=>n>=1&&n<=6));assert.notEqual(state.game.dice[0],state.game.dice[1]);
    assert.deepEqual((await black.wait(m=>m.type==='state'&&m.game.revision===1)).game,state.game);
    const active=players[state.game.turn];
    await active.send({type:'roll',revision:1});await active.wait(m=>m.type==='error');
    await active.send({type:'move',from:0,to:12,revision:1});await active.wait(m=>m.type==='error');
    while(state.game.dice.length){
      const before=state.game,move=legalMoves(before)[0];
      await players[before.turn].send({type:'move',from:move.from,to:move.to,promotion:move.die,revision:before.revision});
      state=await white.wait(m=>m.type==='state'&&m.game.revision===before.revision+1);
      assert.deepEqual((await black.wait(m=>m.type==='state'&&m.game.revision===before.revision+1)).game,state.game);
      const {data:restored}=await post(`/api/rooms/${room.code}/join`,{token:room.token});
      assert.deepEqual(restored.game,state.game);assert.equal(restored.clock,null);
    }
    assert.equal(state.game.history.length,1);
    await white.send({type:'chat',text:'Удачной партии в нарды!'});
    assert.equal((await black.wait(m=>m.type==='chat')).message.text,'Удачной партии в нарды!');
    await white.send({type:'resign',revision:state.game.revision});
    state=await white.wait(m=>m.type==='state'&&m.game.winner==='black');
    await white.send({type:'rematch',revision:state.game.revision});await black.send({type:'rematch',revision:state.game.revision});
    const fresh=await white.wait(m=>m.type==='state'&&!m.game.winner&&m.game.revision>state.game.revision);
    assert.equal(fresh.game.variant,'narde');assert.equal(fresh.game.opening,true);assert.equal(fresh.game.board[0],15);assert.equal(fresh.clock,null);
  } finally {white.ws.close();black.ws.close();}
});

test('chess rooms synchronize legal moves, reject cheating, detect mate and keep variant on rematch', { timeout: 30000 }, async t => {
  const {data: room}=await post('/api/rooms',{variant:'chess'});
  const a=client(room.code,room.token);t.after(()=>a.ws.close());await a.wait(m=>m.type==='state');
  const {data:joined}=await post(`/api/rooms/${room.code}/join`);
  const b=client(room.code,joined.token);t.after(()=>b.ws.close());await b.wait(m=>m.type==='state'&&m.ready);
  await a.send({type:'move',from:52,to:28,revision:0}); await a.wait(m=>m.type==='error');
  await b.send({type:'move',from:12,to:28,revision:0}); await b.wait(m=>m.type==='error');
  let last;
  for (const [i,[from,to]] of [[53,45],[12,28],[54,38],[3,39]].entries()) {
    await (i%2?b:a).send({type:'move',from,to,revision:i});
    last=await (i%2?a:b).wait(m=>m.type==='state'&&m.game.revision===i+1);
  }
  assert.equal(last.game.reason,'checkmate');assert.equal(last.game.winner,'black');
  const {data:restored}=await post(`/api/rooms/${room.code}/join`,{token:room.token});
  assert.deepEqual(restored.game,last.game);
  await a.send({type:'rematch',revision:4});await b.wait(m=>m.type==='state'&&m.rematch.length===1);
  await b.send({type:'rematch',revision:4}); const reset=await a.wait(m=>m.type==='state'&&m.game.revision===5);
  assert.equal(reset.game.variant,'chess');assert.equal(reset.game.board.filter(Boolean).length,32);assert.equal(reset.game.winner,null);
});

test('room clocks start on join, increment only the mover, and chat syncs independently of moves', { timeout: 30000 }, async t => {
  const {data:room}=await post('/api/rooms',{variant:'russian'});
  assert.equal(room.clock.white,300000);assert.equal(room.clock.startedAt,null);
  const a=client(room.code,room.token);t.after(()=>a.ws.close());await a.wait(m=>m.type==='state');
  const {data:joined}=await post(`/api/rooms/${room.code}/join`);
  assert.ok(joined.clock.startedAt);assert.equal(joined.clock.black,300000);
  const b=client(room.code,joined.token);t.after(()=>b.ws.close());await b.wait(m=>m.type==='state'&&m.ready);
  await a.send({type:'chat',text:'Привет! Гарної гри ♟',name:'forged',side:'black'});
  const message=await b.wait(m=>m.type==='chat');assert.equal(message.message.text,'Привет! Гарної гри ♟');assert.equal(message.message.side,'white');assert.equal(message.message.name,null);
  await a.send({type:'move',from:42,to:35,revision:0,clock:{white:999999}});
  const moved=await b.wait(m=>m.type==='state'&&m.game.revision===1);
  assert.ok(moved.clock.white>295000&&moved.clock.white<=305000);assert.equal(moved.clock.black,300000);assert.equal(moved.game.turn,'black');
  assert.equal(moved.chat.length,1);
  await b.send({type:'chat',text:'Спасибо! <b>Без HTML</b>'});const reply=await a.wait(m=>m.type==='chat'&&m.message.side==='black');assert.ok(reply.message.text.includes('<b>'));
  const {data:restored}=await post(`/api/rooms/${room.code}/join`,{token:room.token});assert.equal(restored.chat.length,2);assert.deepEqual(restored.clock,moved.clock);
  const {data:large}=await post('/api/rooms',{variant:'russian12'});assert.equal(large.clock.white,600000);
  const {data:chapaev}=await post('/api/rooms',{variant:'chapaev'});assert.equal(chapaev.clock,null);
});

test('Chapaev rooms validate impulses, sync physics, restore and rematch', { timeout: 30000 }, async t => {
  const { data: room } = await post('/api/rooms', { variant: 'chapaev' });
  const a = client(room.code, room.token); t.after(() => a.ws.close()); await a.wait(m => m.type === 'state');
  const { data: joined } = await post(`/api/rooms/${room.code}/join`);
  const b = client(room.code, joined.token); t.after(() => b.ws.close()); await b.wait(m => m.type === 'state' && m.ready);
  await b.send({ type: 'shot', id: 8, dx: 0, dy: .5, revision: 0 });
  await b.wait(m => m.type === 'error' && /ход соперника/.test(m.message));
  await a.send({ type: 'shot', id: 8, dx: 0, dy: -.5, revision: 0 });
  await a.wait(m => m.type === 'error' && /свою шашку/.test(m.message));
  await a.send({ type: 'shot', id: 3, dx: 1, dy: -1, revision: 0 });
  await a.wait(m => m.type === 'error' && /Сила удара/.test(m.message));
  await a.send({ type: 'shot', id: 3, dx: 0, dy: -.65, revision: 0, pieces: [] });
  const moved = await b.wait(m => m.type === 'state' && m.game.revision === 1);
  assert.deepEqual(moved.game, applyShot(room.game, 3, 0, -.65));
  assert.equal(moved.game.lastShot.otherLost, 1);
  assert.equal(moved.game.turn, 'black');
  await a.send({ type: 'shot', id: 2, dx: 0, dy: -.5, revision: 1 });
  await a.wait(m => m.type === 'error' && /ход соперника/.test(m.message));
  await a.send({ type: 'shot', id: 2, dx: 0, dy: -.5, revision: 0 });
  await a.wait(m => m.type === 'error' && /изменилась/.test(m.message));
  const { data: restored } = await post(`/api/rooms/${room.code}/join`, { token: room.token });
  assert.deepEqual(restored.game, moved.game);
  await b.send({ type: 'resign', revision: 1 }); await a.wait(m => m.type === 'state' && m.game.winner === 'white');
  await a.send({ type: 'rematch', revision: 2 }); await b.wait(m => m.type === 'state' && m.rematch.length === 1);
  await b.send({ type: 'rematch', revision: 2 });
  const reset = await a.wait(m => m.type === 'state' && m.game.revision === 3);
  assert.equal(reset.game.variant, 'chapaev'); assert.equal(reset.game.pieces.length, 16); assert.equal(reset.game.lastShot, null);
});

test('Chapaev round advancement waits for both players and survives reconnecting', { timeout: 30000 }, async t => {
  const { data: room } = await post('/api/rooms', { variant: 'chapaev' });
  const a = client(room.code, room.token); t.after(() => a.ws.close()); await a.wait(m => m.type === 'state');
  const { data: joined } = await post(`/api/rooms/${room.code}/join`);
  const b = client(room.code, joined.token); t.after(() => b.ws.close()); await b.wait(m => m.type === 'state' && m.ready);
  for (let i = 0; i < 8; i++) {
    await a.send({ type: 'shot', id: 0, dx: 0, dy: -.05, revision: i * 2 });
    await b.wait(m => m.type === 'state' && m.game.revision === i * 2 + 1);
    await b.send({ type: 'shot', id: 8 + i, dx: 0, dy: -1, revision: i * 2 + 1 });
    await a.wait(m => m.type === 'state' && m.game.revision === i * 2 + 2);
  }
  const { data: end } = await post(`/api/rooms/${room.code}/join`, { token: room.token });
  assert.equal(end.game.winner, 'white'); assert.equal(end.game.reason, 'round'); assert.equal(end.game.score.white, 1);
  await a.send({ type: 'rematch', revision: 16 });
  const waiting = await b.wait(m => m.type === 'state' && m.rematch.length === 1);
  assert.equal(waiting.game.round, 1);
  await b.send({ type: 'rematch', revision: 16 });
  const next = await a.wait(m => m.type === 'state' && m.game.revision === 17);
  assert.equal(next.game.round, 2); assert.equal(next.game.winner, null);
  assert.deepEqual(next.game.rows, { white: 6, black: 0 }); assert.equal(next.game.pieces.length, 16);
  assert.equal(next.game.turn, 'white'); assert.equal(next.game.score.white, 1);
  assert.ok(next.game.pieces.filter(p => p.side === 'white').every(p => p.y === 6.5));
  const { data: restored } = await post(`/api/rooms/${room.code}/join`, { token: room.token });
  assert.deepEqual(restored.game, next.game);
  await b.send({ type: 'rematch', revision: 17 });
  await b.wait(m => m.type === 'error' && /недоступно/.test(m.message));
});

test('HTTP routes validate origins, room IDs and missing rooms', async () => {
  const response = await fetch(base); assert.equal(response.status, 200);
  assert.match(await response.text(), /Шашки/);
  const forbidden = await fetch(base + '/api/rooms', { method: 'POST', headers: { Origin: 'https://other.example' } });
  assert.equal(forbidden.status, 403);
  assert.equal((await post('/api/rooms/FFFFFFFFFFFF/join')).status, 404);
  assert.equal((await post('/api/rooms/invalid/join')).status, 404);
});

test('two players synchronize, reject cheating, reconnect, draw and rematch', { timeout: 30000 }, async t => {
  const created = await post('/api/rooms');
  assert.equal(created.status, 201);
  const { code, token } = created.data;
  assert.match(code, /^[A-F0-9]{12}$/);
  assert.equal(created.data.role, 'white');
  assert.equal(created.data.ready, false);
  assert.equal(JSON.stringify(created.data).includes('players'), false);
  const a = client(code, token); t.after(() => a.ws.close());
  await a.wait(m => m.type === 'state');
  await a.send({ type: 'move', from: 42, to: 35, revision: 0 });
  await a.wait(m => m.type === 'error' && /Дождитесь/.test(m.message));
  const joined = await post(`/api/rooms/${code}/join`);
  assert.equal(joined.status, 200); assert.equal(joined.data.role, 'black');
  const b = client(code, joined.data.token); t.after(() => b.ws.close());
  await b.wait(m => m.type === 'state' && m.ready);
  assert.equal((await post(`/api/rooms/${code}/join`)).status, 409);
  const invalidSocket = await fetch(base + `/api/rooms/${code}/socket`);
  assert.equal(invalidSocket.status, 426);
  const unauthorized = new WebSocket(base.replace(/^http/, 'ws') + `/api/rooms/${code}/socket`, ['checkers', 'invalid-token']);
  await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('Authentication check timed out')), 8000);
    unauthorized.addEventListener('error', () => { clearTimeout(timeout); resolve(); });
    unauthorized.addEventListener('open', () => { clearTimeout(timeout); unauthorized.close(); reject(new Error('Invalid token was accepted')); });
  });
  await b.send({ type: 'move', from: 17, to: 24, revision: 0 });
  await b.wait(m => m.type === 'error' && /ход соперника/.test(m.message));
  await a.send({ type: 'move', from: 42, to: 35, revision: 0 });
  const whiteMove = await b.wait(m => m.type === 'state' && m.game.revision === 1);
  assert.equal(whiteMove.game.board[35], 1);
  await b.send({ type: 'move', from: 17, to: 24, revision: 0 });
  await b.wait(m => m.type === 'error' && /изменилась/.test(m.message));
  await b.send({ type: 'move', from: 17, to: 24, revision: 1 });
  await a.wait(m => m.type === 'state' && m.game.revision === 2);
  const resume = await post(`/api/rooms/${code}/join`, { token });
  assert.equal(resume.data.role, 'white'); assert.equal(resume.data.game.revision, 2);
  a.ws.close();
  const again = client(code, token); t.after(() => again.ws.close());
  const restored = await again.wait(m => m.type === 'state' && m.game.revision === 2);
  assert.equal(restored.game.history.length, 2);
  await again.send({ type: 'draw', revision: 2 });
  await b.wait(m => m.type === 'state' && m.drawOffer === 'white');
  await b.send({ type: 'decline-draw', revision: 2 });
  const declined = await again.wait(m => m.type === 'state' && !m.drawOffer && m.game.revision === 2);
  assert.equal(declined.game.winner, null);
  await again.send({ type: 'draw', revision: 2 });
  await b.wait(m => m.type === 'state' && m.drawOffer === 'white');
  await b.send({ type: 'draw', revision: 2 });
  await again.wait(m => m.type === 'state' && m.game.winner === 'draw');
  await again.send({ type: 'rematch', revision: 3 });
  const offered = await b.wait(m => m.type === 'state' && m.rematch.length === 1);
  assert.equal(offered.game.winner, 'draw', 'one player cannot start a rematch alone');
  await b.send({ type: 'rematch', revision: 3 });
  const rematch = await again.wait(m => m.type === 'state' && m.game.revision === 4);
  assert.equal(rematch.game.winner, null); assert.equal(rematch.game.history.length, 0);
  assert.equal(rematch.drawOffer, null); assert.deepEqual(rematch.rematch, []);
  await b.send({ type: 'resign', revision: 4 });
  await again.wait(m => m.type === 'state' && m.game.winner === 'white' && m.game.reason === 'resign');
  await again.send({ type: 'move', from: 42, to: 35, revision: 5 });
  await again.wait(m => m.type === 'error' && /завершена/.test(m.message));
  await again.send({ type: 'rematch', revision: 5 });
  await b.wait(m => m.type === 'state' && m.game.revision === 5 && m.rematch.length === 1);
  await b.send({ type: 'rematch', revision: 5 });
  const afterResignation = await again.wait(m => m.type === 'state' && m.game.revision === 6);
  assert.equal(afterResignation.game.winner, null);
  assert.equal(afterResignation.game.board.filter(Boolean).length, 24);
});

test('12x12 online rooms preserve their variant through joins, moves and rematches', { timeout:30000 }, async t => {
  assert.equal((await post('/api/rooms',{variant:'unsupported'})).status,400);
  assert.equal((await post('/api/rooms',{variant:'__proto__'})).status,400);
  const {data:created,status}=await post('/api/rooms',{variant:'russian12'});
  assert.equal(status,201); assert.equal(created.game.variant,'russian12'); assert.equal(created.game.board.length,144);
  const a=client(created.code,created.token); t.after(()=>a.ws.close()); await a.wait(m=>m.type==='state');
  const {data:joined}=await post(`/api/rooms/${created.code}/join`);
  assert.equal(joined.game.variant,'russian12');
  const b=client(created.code,joined.token); t.after(()=>b.ws.close()); await b.wait(m=>m.type==='state' && m.ready);
  await a.send({type:'move',from:86,to:75,revision:0});
  const moved=await b.wait(m=>m.type==='state' && m.game.revision===1);
  assert.equal(moved.game.history[0].notation,'c5–d6'); assert.equal(moved.game.board[75],1);
  await b.send({type:'resign',revision:1}); await a.wait(m=>m.type==='state' && m.game.winner==='white');
  await a.send({type:'rematch',revision:2}); await b.wait(m=>m.type==='state' && m.rematch.length===1);
  await b.send({type:'rematch',revision:2});
  const restarted=await a.wait(m=>m.type==='state' && m.game.revision===3);
  assert.equal(restarted.game.variant,'russian12'); assert.equal(restarted.game.board.length,144);
  assert.equal(restarted.game.board.filter(Boolean).length,60); assert.equal(restarted.game.winner,null);
});
