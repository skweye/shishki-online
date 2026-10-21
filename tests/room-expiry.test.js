import { test } from 'node:test';
import assert from 'node:assert/strict';
import { register } from 'node:module';
import { newGame } from '../public/game.js';
import { actBattleship, randomFleet } from '../public/battleship.js';
import {actDurak,durakActions,DURAK_VARIANTS} from '../public/durak.js';
import { createClock } from '../public/time-control.js';
import {applyShot} from '../public/chapaev.js';
import {createLobby,friendAction} from '../src/friend-room.js';

import { isFinishTransition } from '../public/rocket.js';
import { matchCoins } from '../public/shop-catalog.js';
import { DOMINOES, newDomino, actDomino, nextDominoRound } from '../public/domino.js';

register('./helpers/cloudflare-loader.js', import.meta.url);
globalThis.WebSocketRequestResponsePair = class {};
const { GameRoom } = await import('../src/worker.js');
const HOUR = 3_600_000, START = 1_800_000_000_000;
test('all Durak subtypes persist hidden hands and record completed-match statistics and rewards once',async t=>{
  t.mock.timers.enable({apis:['Date'],now:START});
  for(const variant of DURAK_VARIANTS){
    const writes=[],env={AUTH_DB:{prepare:()=>({bind:(...values)=>values}),async batch(rows){writes.push(...rows);}}};
    const initial=fixture();initial.accounts={white:'a',black:'b'};initial.game=newGame(variant);
    const {room,values}=await roomWith(initial,env);let random=123;
    for(let i=0;i<1800&&!room.room.game.winner;i++){
      const g=room.room.game,moves=durakActions(g);random=(random*1664525+1013904223)>>>0;
      room.room.game=actDurak(g,g.turn,moves[random%moves.length]);
    }
    assert.ok(room.room.game.winner);assert.deepEqual(room.snapshot('white').game.hands.black,[]);assert.equal(room.snapshot('black').game.stock,undefined);
    await room.save();await room.save(false);assert.equal(writes.length,2);
    assert.equal(writes[0][1],variant);assert.ok(writes[0][3]>=4);assert.equal(writes[0][5],matchCoins(writes[0][2],writes[0][3]));
    const restored=await roomWith(values.get('room'),env);await restored.room.save(false);assert.equal(writes.length,2);assert.deepEqual(restored.room.snapshot('black').game.hands.white,[]);
  }
});
function fixture(updatedAt = START) {
  return { updatedAt, players: { white: 'white-token', black: 'black-token' }, game: newGame(), clock: null, rematch: [], drawOffer: null };
}
test('battleship win records both accounts and coins once, persists fleets privately and restores the result',async t=>{
  t.mock.timers.enable({apis:['Date'],now:START});
  const writes=[],env={AUTH_DB:{prepare:()=>({bind:(...values)=>values}),async batch(rows){writes.push(...rows);}}};
  const initial=fixture();initial.accounts={white:'user-a',black:'user-b'};initial.game=newGame('battleship');
  for(const side of ['white','black'])initial.game=actBattleship(initial.game,side,{type:'fleet-ready',fleet:randomFleet()});
  const {room,values}=await roomWith(initial,env);await room.save();assert.equal(writes.length,0);
  for(const cell of initial.game.fleets.black.flat())room.room.game=actBattleship(room.room.game,'white',{type:'sea-fire',cell});
  await room.save();await room.save(false);assert.equal(writes.length,2);
  assert.equal(writes[0][1],'battleship');assert.equal(writes[0][2],'win');assert.equal(writes[0][5],30);assert.equal(writes[1][2],'loss');assert.equal(writes[1][5],10);
  const restored=await roomWith(values.get('room'),env);assert.equal(restored.room.room.game.reason,'fleet-sunk');await restored.room.save(false);assert.equal(writes.length,2);
});
async function roomWith(saved = fixture(), env = {}) {
  const values = new Map(saved ? [['room', structuredClone(saved)]] : []), sockets = [];
  let alarm = saved ? saved.updatedAt + 7 * 24 * HOUR : null, initialized;
  const ctx = {
    storage: {
      async get(key) { return structuredClone(values.get(key)); },
      async put(key, value) { values.set(key, structuredClone(value)); },
      async setAlarm(time) { alarm = time; },
      async deleteAlarm() { alarm = null; },
      async deleteAll() { values.clear(); }
    },
    getWebSockets: () => sockets,
    setWebSocketAutoResponse() {},
    blockConcurrencyWhile(fn) { initialized = fn(); return initialized; }
  };
  const room = new GameRoom(ctx, env); await initialized;
  const ws = { readyState: 1, session: { role: 'white', lastMessage: 0 }, messages: [],
    deserializeAttachment() { return this.session; }, serializeAttachment(s) { this.session = s; },
    send(data) { this.messages.push(JSON.parse(data)); }, close(code) { this.closeCode = code; } };
  sockets.push(ws);
  return { room, ws, values, alarm: () => alarm };
}
const join = (room, token) => room.fetch(new Request('https://game.test/join', { method: 'POST', body: JSON.stringify({ token }) }));
test('rematch invalidates old room-change consent before the new match starts',async t=>{
  t.mock.timers.enable({apis:['Date'],now:START});
  const initial=fixture();initial.lobby={...createLobby('russian'),phase:'playing',returnOffer:'white'};initial.game.winner='draw';initial.game.reason='agreement';
  const {room,ws}=await roomWith(initial);
  await room.webSocketMessage(ws,JSON.stringify({type:'rematch',revision:0}));
  t.mock.timers.tick(100);ws.session.role='black';await room.webSocketMessage(ws,JSON.stringify({type:'rematch',revision:0}));
  assert.equal(room.room.game.winner,null);assert.equal(room.room.lobby.returnOffer,null);assert.equal(room.room.lobby.revision,1);
  t.mock.timers.tick(100);await room.webSocketMessage(ws,JSON.stringify({type:'room-lobby',lobbyRevision:0}));
  assert.equal(ws.messages.at(-2).type,'error');assert.equal(room.room.lobby.phase,'playing');
});
test('friend rooms retain separate completed-match records across games and restart with persisted selection',async t=>{
  t.mock.timers.enable({apis:['Date'],now:START});
  const writes=[],env={AUTH_DB:{prepare:()=>({bind:(...values)=>values}),async batch(rows){writes.push(...rows);}}};
  const initial=fixture();initial.lobby=createLobby('russian');initial.accounts={white:'a',black:'b'};
  const {room,values}=await roomWith(initial,env);
  const action=(role,type,data={})=>friendAction(room.room,role,{type,lobbyRevision:room.room.lobby.revision,...data},START);
  for(const variant of ['russian','chess']){
    action('black','room-select',{variant});action('white','room-ready',{ready:true});action('black','room-ready',{ready:true});
    room.room.game.winner='white';room.room.game.reason='resign';room.room.game.history=Array(4).fill({});
    await room.save();action('black','room-lobby');await room.save();await room.save(false);
  }
  assert.equal(writes.length,4);assert.notEqual(writes[0][0],writes[2][0]);assert.equal(writes[0][1],'russian');assert.equal(writes[2][1],'chess');
  const restored=await roomWith(values.get('room'),env);assert.equal(restored.room.room.lobby.phase,'lobby');assert.equal(restored.room.room.lobby.variant,'chess');assert.equal(restored.room.room.clock,null);
  await restored.room.save(false);assert.equal(writes.length,4);
});

test('pool aim is authenticated, bounded, ephemeral and independent of move throttling',async t=>{
  t.mock.timers.enable({apis:['Date'],now:START});
  const initial=fixture();initial.game=newGame('pool8');
  const {room,ws,values,alarm}=await roomWith(initial);
  const peer={...ws,session:{role:'black',lastMessage:0},messages:[]};room.ctx.getWebSockets().push(peer);
  const aim={type:'pool-aim',revision:0,angle:32,power:.8,placing:false};
  const saved=structuredClone(values.get('room')),deadline=alarm();
  await room.webSocketMessage(ws,JSON.stringify({...aim,role:'black',winner:'white'}));
  assert.deepEqual(peer.messages,[{...aim,role:'white'}]);assert.equal(ws.messages.length,0);
  assert.deepEqual(values.get('room'),saved);assert.equal(alarm(),deadline);assert.equal(room.room.game.revision,0);
  assert.deepEqual(room.snapshot('black').poolAim,{...aim,role:'white'});
  await room.webSocketMessage(ws,JSON.stringify({...aim,angle:33}));assert.equal(peer.messages.length,1);
  t.mock.timers.tick(100);
  for(const invalid of [{angle:181},{power:2},{power:0},{angle:'20'},{revision:1},{placing:1}])await room.webSocketMessage(ws,JSON.stringify({...aim,...invalid}));
  await room.webSocketMessage(peer,JSON.stringify(aim));assert.equal(peer.messages.length,1);assert.equal(ws.messages.length,0);
  await room.webSocketMessage(ws,JSON.stringify({...aim,angle:-179}));assert.equal(peer.messages.at(-1).angle,-179);
  // An aim packet must not consume the separate action rate limit.
  await room.webSocketMessage(ws,JSON.stringify({type:'pool-shot',dx:.85,dy:0,revision:0}));
  assert.equal(room.room.game.revision,1);assert.equal(room.snapshot('black').poolAim,null);
  t.mock.timers.tick(100);
  const active=room.room.game.turn==='white'?ws:peer,revision=room.room.game.revision;
  await room.webSocketMessage(active,JSON.stringify({...aim,revision}));assert.ok(room.snapshot().poolAim);
  t.mock.timers.tick(3000);assert.equal(room.snapshot().poolAim,null);
  await room.webSocketMessage(active,JSON.stringify({...aim,revision}));room.webSocketClose(active);assert.equal(room.snapshot().poolAim,null);
  room.room.game.winner='white';t.mock.timers.tick(100);await room.webSocketMessage(active,JSON.stringify({...aim,revision}));assert.equal(room.poolAim,null);
});

test('server alarms finish timed games even without sockets, and reconnecting cannot reset a clock', async t => {
  t.mock.timers.enable({ apis: ['Date'], now: START });
  const initial=fixture();initial.clock=createClock('russian',START);
  const {room,ws,alarm}=await roomWith(initial);
  assert.equal(alarm(),START+300000);
  t.mock.timers.tick(120000);await join(room,'white-token');
  assert.equal(room.room.clock.startedAt,START);assert.equal(alarm(),START+300000);
  t.mock.timers.tick(180000);await room.alarm();
  assert.equal(room.room.game.winner,'black');assert.equal(room.room.game.reason,'timeout');
  assert.equal(room.room.clock.white,0);assert.equal(room.room.clock.startedAt,null);
  assert.ok(ws.messages.some(m=>m.type==='state'&&m.game.reason==='timeout'));
  assert.equal(alarm(),START+HOUR);
});
test('late moves cannot beat the deadline and clients cannot supply their own time', async t => {
  t.mock.timers.enable({ apis: ['Date'], now: START });
  const initial=fixture();initial.clock=createClock('russian',START);
  const {room,ws}=await roomWith(initial);
  t.mock.timers.tick(10000);
  await room.webSocketMessage(ws,JSON.stringify({type:'move',from:42,to:35,revision:0,clock:{white:9999999},serverNow:0}));
  assert.equal(room.room.clock.white,295000);assert.equal(room.room.clock.black,300000);
  ws.session.role='black';t.mock.timers.tick(300000);
  const before=structuredClone(room.room.game.board);
  await room.webSocketMessage(ws,JSON.stringify({type:'move',from:17,to:24,revision:1}));
  assert.equal(room.room.game.winner,'white');assert.equal(room.room.game.reason,'timeout');
  assert.deepEqual(room.room.game.board,before);
});
test('the second join starts clocks; rematch resets them and waits for both players', async t => {
  t.mock.timers.enable({ apis: ['Date'], now: START });
  const initial=fixture();initial.players.black=null;initial.clock=createClock('russian12');initial.game=newGame('russian12');
  const {room,ws,alarm}=await roomWith(initial);
  t.mock.timers.tick(20000);await join(room);
  assert.equal(room.room.clock.startedAt,START+20000);assert.equal(alarm(),START+620000);
  t.mock.timers.tick(1000);await room.webSocketMessage(ws,JSON.stringify({type:'resign',revision:0}));
  t.mock.timers.tick(1000);await room.webSocketMessage(ws,JSON.stringify({type:'rematch',revision:1}));
  assert.equal(room.room.clock.startedAt,null);
  ws.session.role='black';t.mock.timers.tick(1000);await room.webSocketMessage(ws,JSON.stringify({type:'rematch',revision:1}));
  assert.equal(room.room.clock.white,600000);assert.equal(room.room.clock.black,600000);assert.equal(room.room.clock.startedAt,Date.now());
});
test('chat uses the sender identity, persists 50 messages, limits spam and never pauses or extends the game', async t => {
  t.mock.timers.enable({ apis: ['Date'], now: START });
  const initial=fixture();initial.clock=createClock('chess',START);initial.game=newGame('chess');initial.names={white:'Настоящее имя'};
  const {room,ws,alarm,values}=await roomWith(initial);
  await room.webSocketMessage(ws,JSON.stringify({type:'chat',text:'<img src=x onerror=alert(1)>',side:'black',name:'Поддельное имя',revision:999}));
  assert.equal(room.room.chat[0].side,'white');assert.equal(room.room.chat[0].name,'Настоящее имя');
  assert.equal(room.room.chat[0].text,'<img src=x onerror=alert(1)>');
  await room.webSocketMessage(ws,JSON.stringify({type:'chat',text:'spam'}));
  assert.equal(room.room.chat.length,1);assert.equal(ws.messages.at(-1).context,'chat');
  t.mock.timers.tick(1000);await room.webSocketMessage(ws,JSON.stringify({type:'chat',text:'x'.repeat(401)}));
  assert.equal(room.room.chat.length,1);
  for(let i=0;i<55;i++) {t.mock.timers.tick(1000);await room.webSocketMessage(ws,JSON.stringify({type:'chat',text:'Сообщение '+i}));}
  assert.equal(room.room.chat.length,50);assert.equal(values.get('room').chat.length,50);
  assert.equal(room.room.game.revision,0);assert.equal(room.room.clock.startedAt,START);assert.equal(room.room.updatedAt,START);assert.equal(alarm(),START+300000);
  const restored=await roomWith(values.get('room'));assert.equal(restored.room.room.chat.length,50);
});

test('resignation uses the winner selection and never accepts a client-supplied effect or rocket command', async t => {
  t.mock.timers.enable({ apis: ['Date'], now: START });
  for (const variant of ['russian', 'russian12', 'chess', 'chapaev']) {
    const initial = fixture(); initial.game = newGame(variant);
    initial.accounts = { black: 'winner-id' };
    const env = { AUTH_DB: {
      prepare: () => ({ bind: () => ({ first: async () => ({ finish_effect: 'comet' }) }) }),
      batch: async () => []
    } };
    const { room, ws } = await roomWith(initial, env);
    await room.webSocketMessage(ws, JSON.stringify({ type: 'rocket', revision: 0, canLaunchRocket: true }));
    assert.equal(room.room.game.winner, null);
    t.mock.timers.tick(100);
    await room.webSocketMessage(ws, JSON.stringify({ type: 'resign', revision: 0, finishEffect: 'rocket', winner: 'white' }));
    assert.equal(room.room.game.winner, 'black');
    assert.equal(room.room.game.reason, 'resign');
    assert.equal(room.room.game.finishEffect, 'comet');
  }
});

test('finish animations cover wins and resignations but exclude draws, rounds and restored results', () => {
  const before = { revision: 4, winner: null }, after = { revision: 5, winner: 'white', reason: 'resign', finishEffect: 'rocket' };
  assert.equal(isFinishTransition(before, after), true);
  assert.equal(isFinishTransition(before, after, false), false);
  assert.equal(isFinishTransition(after, after), false);
  for (const reason of ['checkmate', 'timeout', 'pieces', 'territory', 'blocked']) assert.equal(isFinishTransition(before, { ...after, reason }), true);
  assert.equal(isFinishTransition(before, { ...after, reason: 'round' }), false);
  assert.equal(isFinishTransition(before, { ...after, winner: 'draw' }), false);
  assert.equal(isFinishTransition(before, { ...after, finishEffect: 'unknown' }), false);
});

test('ordinary wins use the winner victory slot once and retain results when cosmetics lookup fails', async t => {
  t.mock.timers.enable({ apis: ['Date'], now: START });
  for (const reason of ['checkmate', 'timeout', 'pieces', 'territory']) {
    const initial = fixture(); initial.accounts = { white: 'winner-id' };
    let reads = 0;
    const env = { AUTH_DB: { prepare: () => ({ bind: () => ({ first: async () => { reads++; return { victory_effect: 'fireworks' }; } }) }), batch: async () => [] } };
    const { room } = await roomWith(initial, env);
    room.room.game.winner = 'white'; room.room.game.reason = reason; room.room.game.revision++;
    await room.save(); assert.equal(room.room.game.finishEffect, 'fireworks');
    await room.save(false); assert.equal(reads, 1);
  }
  const initial = fixture(); initial.accounts = { black: 'winner-id' }; initial.cosmetics = { black: { victory: 'portal' } };
  const { room } = await roomWith(initial, { AUTH_DB: { prepare: () => { throw new Error('offline'); }, batch: async () => [] } });
  room.room.game.winner = 'black'; room.room.game.reason = 'timeout';
  await room.save(); assert.equal(room.room.game.finishEffect, 'portal'); assert.equal(room.room.game.winner, 'black');
});

test('match rewards require four moves and never trust unknown outcomes', () => {
  for (const result of ['win', 'loss', 'draw']) assert.equal(matchCoins(result, 3), 0);
  assert.equal(matchCoins('win', 4), 30); assert.equal(matchCoins('loss', 4), 10); assert.equal(matchCoins('draw', 4), 15);
  assert.equal(matchCoins('hacked', 10), 0); assert.equal(matchCoins('win', -1), 0);
});

test('existing rooms adopt the hour deadline and expire exactly at it', async t => {
  t.mock.timers.enable({ apis: ['Date'], now: START });
  const { room, ws, values, alarm } = await roomWith();
  assert.equal(alarm(), START + HOUR);
  t.mock.timers.tick(HOUR - 1); await room.alarm();
  assert.ok(values.has('room'));
  t.mock.timers.tick(1); await room.alarm();
  assert.equal(values.size, 0); assert.equal(alarm(), null); assert.equal(ws.closeCode, 4004);
  assert.equal((await join(room, 'white-token')).status, 404);
});

test('results outbox retries D1 failures without recording a match twice', async t => {
  t.mock.timers.enable({ apis: ['Date'], now: START });
  let unavailable = true, writes = [];
  const env = { AUTH_DB: {
    prepare: () => ({ bind: (...values) => values }),
    async batch(rows) { if (unavailable) throw new Error('D1 unavailable'); writes.push(...rows); }
  } };
  const initial = fixture(); initial.accounts = { white: 'user-a', black: 'user-b' };
  initial.game.winner = 'white'; initial.game.reason = 'resign';
  const { room, values, alarm } = await roomWith(initial, env);
  await room.save();
  assert.equal(values.get('room').pendingResults.length, 2);
  assert.equal(alarm(), START + 60000);
  const matchId = values.get('room').matchId;
  await room.save(false);
  assert.equal(values.get('room').pendingResults.length, 2);
  unavailable = false; await room.alarm();
  assert.equal(writes.length, 2); assert.equal(writes[0][0], matchId);
  assert.equal(writes[0][2], 'win'); assert.equal(writes[1][2], 'loss');
  assert.equal(values.get('room').pendingResults.length, 0);
  await room.save(false); assert.equal(writes.length, 2);
});

test('Chapaev rounds and matches without a second player do not enter account history', async t => {
  t.mock.timers.enable({ apis: ['Date'], now: START });
  const initial = fixture(); initial.game = newGame('chapaev');
  initial.accounts = { white: 'user-a', black: 'user-b' };
  initial.game.winner = 'white'; initial.game.reason = 'round';
  const { room } = await roomWith(initial);
  await room.save(); assert.equal(room.room.resultRecorded, undefined);
  assert.equal(room.room.pendingResults, undefined);
  room.room.game.reason = 'resign'; room.room.players.black = null;
  await room.save(); assert.equal(room.room.resultRecorded, undefined);
});

test('domino persists round scores without recording a match, then records the 100-point result once', async t=>{
  t.mock.timers.enable({apis:['Date'],now:START});
  const writes=[],env={AUTH_DB:{prepare:()=>({bind:(...values)=>values}),async batch(rows){writes.push(...rows);}}};
  const initial=fixture();initial.accounts={white:'user-a',black:'user-b'};
  const tile=(a,b)=>DOMINOES.findIndex(p=>p[0]===a&&p[1]===b);
  const nearEnd=()=>({...newDomino(),turn:'white',hands:{white:[tile(3,5)],black:[tile(6,6)]},chain:[{id:tile(2,3),a:2,b:3,side:'black'}]});
  initial.game=actDomino(nearEnd(),{type:'domino-play',id:tile(3,5),end:'right'});
  const {room,values}=await roomWith(initial,env);await room.save();assert.equal(writes.length,0);assert.equal(values.get('room').game.score.white,12);
  room.room.game=nextDominoRound(room.room.game);await room.save();assert.equal(writes.length,0);
  const final=nearEnd();final.score.white=90;room.room.game=actDomino(final,{type:'domino-play',id:tile(3,5),end:'right'});
  await room.save();assert.equal(writes.length,2);assert.equal(writes[0][1],'domino');assert.equal(writes[0][2],'win');assert.equal(writes[1][2],'loss');
  await room.save(false);assert.equal(writes.length,2);
  const restored=await roomWith(values.get('room'),env);assert.equal(restored.room.room.game.score.white,102);assert.equal(restored.room.room.game.winner,'white');
});

test('rejoins and sync do not postpone deletion; confirmed moves do', async t => {
  t.mock.timers.enable({ apis: ['Date'], now: START });
  const { room, ws, alarm } = await roomWith();
  t.mock.timers.tick(30 * 60_000);
  assert.equal((await join(room, 'white-token')).status, 200);
  await room.webSocketMessage(ws, JSON.stringify({ type: 'sync' }));
  assert.equal(alarm(), START + HOUR);
  t.mock.timers.tick(100);
  await room.webSocketMessage(ws, JSON.stringify({ type: 'move', from: 42, to: 35, revision: 0 }));
  assert.equal(room.room.game.revision, 1);
  assert.equal(alarm(), Date.now() + HOUR);
  const deadline = alarm();
  t.mock.timers.tick(100);
  await room.webSocketMessage(ws, JSON.stringify({ type: 'move', from: 35, to: 28, revision: 1 }));
  assert.equal(alarm(), deadline); // Wrong player / invalid command is not activity.
  t.mock.timers.tick(30 * 60_000); await room.alarm();
  assert.ok(room.room); assert.equal(alarm(), deadline); // A stale alarm cannot delete a live room.
});

test('joining the second player starts a fresh hour', async t => {
  t.mock.timers.enable({ apis: ['Date'], now: START });
  const initial = fixture(); initial.players.black = null;
  const { room, alarm } = await roomWith(initial);
  t.mock.timers.tick(HOUR - 1);
  assert.equal((await join(room)).status, 200);
  assert.equal(alarm(), Date.now() + HOUR);
});

test('late requests cannot revive a room when its alarm is delayed', async t => {
  t.mock.timers.enable({ apis: ['Date'], now: START });
  const http = await roomWith(), socket = await roomWith();
  t.mock.timers.tick(HOUR);
  assert.equal((await join(http.room, 'white-token')).status, 404);
  await socket.room.webSocketMessage(socket.ws, JSON.stringify({ type: 'move', from: 42, to: 35, revision: 0 }));
  assert.equal(socket.ws.closeCode, 4004); assert.equal(socket.values.size, 0);
  const restored = await roomWith(fixture(START));
  assert.equal(restored.room.room, null); assert.equal(restored.values.size, 0);
});

test('owner pranks validate server identity, reject forged admins, preserve clocks and exclude rewards',async t=>{
  t.mock.timers.enable({apis:['Date'],now:START});
  let allowed=false,revoked=false,resultWrites=0;
  const env={AUTH_DB:{prepare(sql){return {bind(){return {async first(){
    if(sql.startsWith('SELECT 1 FROM sessions'))return revoked?null:{ok:1};
    if(sql.includes('owner_pranks'))return {owner_pranks:allowed?1:0,email:'kkoallqq@gmail.com',email_verified:1,admin_level:3};
    return {};
  },async run(){}};} };},async batch(){resultWrites++;}}};
  const initial=fixture();initial.accounts={white:'owner',black:'peer'};initial.clock=createClock('russian',START);
  const {room,ws,values}=await roomWith(initial,env);ws.session.sessionHash='valid-session';
  const send=()=>room.webSocketMessage(ws,JSON.stringify({type:'owner-prank',revision:room.room.game.revision,ownerPranks:true,email:'kkoallqq@gmail.com',winner:'white'}));
  await send();assert.equal(room.room.game.revision,0);assert.match(ws.messages[0].message,/владельцу/);
  allowed=true;t.mock.timers.tick(100);await send();assert.equal(room.room.game.revision,1);assert.equal(room.room.game.unranked,true);assert.equal(room.room.game.winner,null);assert.equal(room.room.clock.white,300000,'prank must not award a move increment');
  assert.equal(values.get('room').game.unranked,true);
  t.mock.timers.tick(100);await send();assert.equal(room.room.game.revision,2,'repeated uses are accepted');
  room.room.game.winner='white';room.room.game.reason='resign';await room.save();assert.equal(resultWrites,0);assert.equal(room.room.resultRecorded,undefined);
  room.room.game=newGame('chess');room.room.clock=createClock('chess',Date.now());
  t.mock.timers.tick(100);await send();assert.equal(room.room.clock.white,360000);assert.equal(room.room.game.board.filter(p=>p!==0).length,32);
  room.room.game={...newGame('chapaev'),pieces:[{id:0,side:'white',x:4,y:4},{id:8,side:'black',x:4,y:.5}]};room.room.clock=null;
  const beforeShot=structuredClone(room.room.game);
  t.mock.timers.tick(100);await send();
  const afterShot=room.room.game,{id,dx,dy}=afterShot.lastShot;
  assert.deepEqual(afterShot.pieces,applyShot(beforeShot,id,dx,dy).pieces,'server applies the selected physical impulse');
  assert.equal(afterShot.winner,'white');assert.equal(afterShot.score.white,1);assert.equal(afterShot.history.length,1);
  assert.deepEqual(values.get('room').game,afterShot);assert.equal(resultWrites,0,'prank rounds grant no rewards');
  const restored=await roomWith(values.get('room'),env);assert.deepEqual(restored.room.snapshot('black').game.lastShot,afterShot.lastShot);
  t.mock.timers.tick(100);await room.webSocketMessage(ws,JSON.stringify({type:'owner-prank',revision:0}));
  assert.deepEqual(room.room.game,afterShot,'stale commands cannot replay the shot');
  revoked=true;t.mock.timers.tick(100);await send();assert.equal(ws.closeCode,4003);
});
