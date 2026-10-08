import { test } from 'node:test';
import assert from 'node:assert/strict';
import { register } from 'node:module';
import { newGame } from '../public/game.js';
import { createClock } from '../public/time-control.js';

import { isFinishTransition } from '../public/rocket.js';
import { matchCoins } from '../public/shop-catalog.js';

register('./helpers/cloudflare-loader.js', import.meta.url);
globalThis.WebSocketRequestResponsePair = class {};
const { GameRoom } = await import('../src/worker.js');
const HOUR = 3_600_000, START = 1_800_000_000_000;
function fixture(updatedAt = START) {
  return { updatedAt, players: { white: 'white-token', black: 'black-token' }, game: newGame(), clock: null, rematch: [], drawOffer: null };
}
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

test('finish animations only run for a new resignation, not restored or duplicate results', () => {
  const before = { revision: 4, winner: null }, after = { revision: 5, winner: 'white', reason: 'resign', finishEffect: 'rocket' };
  assert.equal(isFinishTransition(before, after), true);
  assert.equal(isFinishTransition(before, after, false), false);
  assert.equal(isFinishTransition(after, after), false);
  assert.equal(isFinishTransition(before, { ...after, reason: 'checkmate' }), false);
  assert.equal(isFinishTransition(before, { ...after, finishEffect: 'unknown' }), false);
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
