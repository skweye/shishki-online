// Run against `npm run dev`, or set TEST_BASE_URL to a deployed Worker.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { setTimeout as delay } from 'node:timers/promises';

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
  await b.send({ type: 'draw', revision: 2 });
  await again.wait(m => m.type === 'state' && m.game.winner === 'draw');
  await again.send({ type: 'rematch', revision: 3 });
  await b.wait(m => m.type === 'state' && m.rematch.length === 1);
  await b.send({ type: 'rematch', revision: 3 });
  const rematch = await again.wait(m => m.type === 'state' && m.game.revision === 4);
  assert.equal(rematch.game.winner, null); assert.equal(rematch.game.history.length, 0);
  await b.send({ type: 'resign', revision: 4 });
  await again.wait(m => m.type === 'state' && m.game.winner === 'white' && m.game.reason === 'resign');
});
