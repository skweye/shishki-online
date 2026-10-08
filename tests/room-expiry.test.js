import { test } from 'node:test';
import assert from 'node:assert/strict';
import { register } from 'node:module';
import { newGame } from '../public/game.js';

register('./helpers/cloudflare-loader.js', import.meta.url);
globalThis.WebSocketRequestResponsePair = class {};
const { GameRoom } = await import('../src/worker.js');
const HOUR = 3_600_000, START = 1_800_000_000_000;
function fixture(updatedAt = START) {
  return { updatedAt, players: { white: 'white-token', black: 'black-token' }, game: newGame(), rematch: [], drawOffer: null };
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
