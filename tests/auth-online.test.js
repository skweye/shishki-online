import { test } from 'node:test';
import assert from 'node:assert/strict';
import WebSocket from 'ws';
import { once } from 'node:events';
import { legalMoves } from '../public/game.js';

const base = process.env.TEST_BASE_URL || 'http://127.0.0.1:8787';
const post = async (path, data, cookie = '', origin = base) => {
  const response = await fetch(base + path, { method: 'POST', headers: { Origin: origin, 'Content-Type': 'application/json', Cookie: cookie }, body: JSON.stringify(data) });
  return { response, data: await response.json(), cookie: response.headers.get('Set-Cookie')?.split(';')[0] || '' };
};
const session = async cookie => (await fetch(base + '/api/auth/session', { headers: { Cookie: cookie } })).json();

test('registration, session, sign-out, credential login, duplicate and CSRF protection', { timeout: 30000 }, async () => {
  const email = `test-${crypto.randomUUID()}@example.invalid`, password = 'Test-only-phrase-2026!!';
  assert.equal((await session('')).user, null);
  const invalid = await post('/api/auth/register', { name: 'Tester', email, password, confirmPassword: 'wrong' });
  assert.equal(invalid.response.status, 400);
  const csrf = await post('/api/auth/register', { name: 'Tester', email, password, confirmPassword: password }, '', 'https://evil.example');
  assert.equal(csrf.response.status, 403);
  const registered = await post('/api/auth/register', { name: 'Тестовый игрок', email, password, confirmPassword: password, isAdmin: true, is_admin: 1, shop_access: 1 });
  assert.equal(registered.response.status, 201, registered.data.error);
  assert.equal(registered.data.user.name, 'Тестовый игрок');
  assert.equal(registered.data.user.emailVerified, false);
  assert.equal(registered.data.user.isAdmin, false);
  assert.equal((await fetch(base + '/api/auth/admin', { headers: { Cookie: registered.cookie } })).status, 403);
  assert.equal('password_hash' in registered.data.user, false);
  assert.ok(registered.response.headers.get('Set-Cookie').includes('HttpOnly'));
  assert.ok(registered.response.headers.get('Set-Cookie').includes('SameSite=Lax'));
  assert.equal((await session(registered.cookie)).user.id, registered.data.user.id);
  const duplicate = await post('/api/auth/register', { name: 'Tester', email: email.toUpperCase(), password, confirmPassword: password });
  assert.equal(duplicate.response.status, 409);
  const wrong = await post('/api/auth/login', { email, password: 'wrong-password' });
  const unknown = await post('/api/auth/login', { email: 'absent-' + email, password: 'wrong-password' });
  assert.equal(wrong.response.status, 401); assert.equal(wrong.data.error, unknown.data.error);
  const avatar='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9Zl1sAAAAASUVORK5CYII=';
  assert.equal((await post('/api/auth/profile',{name:'New',avatar})).response.status,401);
  assert.equal((await post('/api/auth/profile',{name:'New',avatar},registered.cookie,'https://evil.example')).response.status,403);
  assert.equal((await post('/api/auth/profile',{name:'<script>',avatar},registered.cookie)).response.status,400);
  assert.equal((await post('/api/auth/profile',{name:'New',avatar:'data:image/svg+xml;base64,PHN2Zz4='},registered.cookie)).response.status,400);
  assert.equal((await post('/api/auth/profile',{name:'New',avatar:'x'.repeat(106000)},registered.cookie)).response.status,400);
  const edited=await post('/api/auth/profile',{name:'Новое имя',avatar,id:'someone-else',email:'fake@example.invalid',isAdmin:true,is_admin:1,shop_access:1},registered.cookie);
  assert.equal(edited.response.status,200,edited.data.error); assert.equal(edited.data.user.id,registered.data.user.id);
  assert.equal(edited.data.user.email,email); assert.equal(edited.data.user.name,'Новое имя');
  assert.equal(edited.data.user.isAdmin,false);
  const denied=await post('/api/auth/admin/shop-access',{userId:registered.data.user.id,enabled:true,expected:false},registered.cookie);
  assert.equal(denied.response.status,403);
  assert.equal((await (await fetch(base + '/api/auth/shop', { headers: { Cookie: registered.cookie } })).json()).fullAccess,false);
  assert.equal((await session(registered.cookie)).user.avatar,avatar);
  await post('/api/auth/profile',{name:'Тестовый игрок',avatar:null},registered.cookie);
  assert.equal((await session(registered.cookie)).user.avatar,null);
  const room = await post('/api/rooms', {}, registered.cookie);
  assert.equal(room.response.status, 201);
  assert.equal(room.data.names.white, 'Тестовый игрок');
  assert.equal(room.data.accountBound.white, true);
  const loggedIn = await post('/api/auth/login', { email, password });
  const restored = await post(`/api/rooms/${room.data.code}/join`, {}, loggedIn.cookie);
  assert.equal(restored.data.role, 'white');
  const stolen = await post(`/api/rooms/${room.data.code}/join`, { token: room.data.token });
  assert.equal(stolen.response.status, 401);
  const socketURL = base.replace(/^http/, 'ws') + `/api/rooms/${room.data.code}/socket`;
  const stolenSocket = new WebSocket(socketURL, ['checkers', room.data.token]);
  const [rejected] = await once(stolenSocket, 'error');
  assert.match(rejected.message, /401/);
  const socket = new WebSocket(socketURL, ['checkers', room.data.token], { headers: { Cookie: registered.cookie, Origin: base } });
  const state = once(socket, 'message');
  await once(socket, 'open');
  assert.equal(JSON.parse((await state)[0]).type, 'state');
  const sync = once(socket, 'message'); socket.send(JSON.stringify({ type: 'sync' }));
  assert.equal(JSON.parse((await sync)[0]).type, 'state');
  await post('/api/auth/logout', {}, registered.cookie);
  const closed = once(socket, 'close'); socket.send(JSON.stringify({ type: 'sync' }));
  assert.equal((await closed)[0], 4003);
  assert.equal((await session(registered.cookie)).user, null);
  assert.ok((await session(loggedIn.cookie)).user);
  await post('/api/auth/logout', {}, loggedIn.cookie);
  assert.equal((await session(loggedIn.cookie)).user, null);
});
test('OAuth callback rejects forged/missing state and only redirects to a safe local URL', async () => {
  const response = await fetch(base + '/api/auth/google/callback?state=forged&code=made-up', { redirect: 'manual' });
  assert.equal(response.status, 303);
  assert.equal(response.headers.get('Location'), '/?auth_error=google_state');
  assert.ok(response.headers.get('Set-Cookie').includes('Max-Age=0'));
});

test('shop charges once, rejects forged purchases, synchronizes skins and awards coins once', { timeout: 60000 }, async t => {
  const password = 'Shop-test-only-password-2026!!';
  const register = async name => {
    const email = `shop-${crypto.randomUUID()}@example.invalid`;
    const result = await post('/api/auth/register', { name, email, password, confirmPassword: password });
    assert.equal(result.response.status, 201, result.data.error); return { ...result, email };
  };
  const a = await register('Нефритовый игрок'), b = await register('Ракетный игрок');
  const shop = async cookie => (await fetch(base + '/api/auth/shop', { headers: { Cookie: cookie } })).json();
  assert.equal((await fetch(base + '/api/auth/shop')).status, 401);
  assert.equal((await shop(a.cookie)).balance, 100);
  assert.equal((await shop(a.cookie)).balance, 100);
  assert.equal((await post('/api/auth/shop/buy', { item: 'skin-jade' })).response.status, 401);
  assert.equal((await post('/api/auth/shop/buy', { item: 'skin-jade' }, a.cookie, 'https://evil.example')).response.status, 403);
  assert.equal((await post('/api/auth/shop/equip', { item: 'skin-neon' }, a.cookie)).response.status, 403);
  assert.equal((await post('/api/auth/shop/buy', { item: 'invented', price: -1000 }, a.cookie)).response.status, 400);
  const purchases = await Promise.all([1, 2, 3].map(() => post('/api/auth/shop/buy', { item: 'skin-jade', price: 0, balance: 99999 }, a.cookie)));
  for (const purchase of purchases) assert.equal(purchase.response.status, 200, purchase.data.error);
  assert.equal((await shop(a.cookie)).balance, 40);
  assert.equal((await shop(a.cookie)).owned.filter(id => id === 'skin-jade').length, 1);
  assert.equal((await post('/api/auth/shop/buy', { item: 'skin-ice' }, a.cookie)).response.status, 409);
  assert.equal((await post('/api/auth/shop/equip', { item: 'skin-jade' }, a.cookie)).data.user.pieceSkin, 'jade');
  assert.equal((await post('/api/auth/shop/buy', { item: 'effect-rocket' }, b.cookie)).data.balance, 0);
  assert.equal((await post('/api/auth/shop/equip', { item: 'effect-rocket' }, b.cookie)).data.user.finishEffect, 'rocket');
  const victory = await post('/api/auth/shop/equip', { item: 'effect-rocket', slot: 'victory' }, b.cookie);
  assert.equal(victory.data.user.victoryEffect, 'rocket'); assert.equal(victory.data.user.finishEffect, 'rocket');
  assert.equal(victory.data.balance, 0);
  assert.equal((await post('/api/auth/shop/equip', { item: 'effect-portal', slot: 'victory' }, b.cookie)).response.status, 403);
  assert.equal((await post('/api/auth/shop/equip', { item: 'effect-rocket', slot: 'invalid' }, b.cookie)).response.status, 400);
  const room = await post('/api/rooms', {}, a.cookie);
  const joined = await post(`/api/rooms/${room.data.code}/join`, {}, b.cookie);
  assert.equal(joined.data.cosmetics.white.skin, 'jade');
  assert.equal(joined.data.cosmetics.black.effect, 'rocket');
  const connect = async (token, cookie) => {
    const ws = new WebSocket(base.replace(/^http/, 'ws') + `/api/rooms/${room.data.code}/socket`, ['checkers', token], { headers: { Cookie: cookie, Origin: base } });
    t.after(() => ws.terminate()); const initial = once(ws, 'message'); await once(ws, 'open'); await initial; return ws;
  };
  const sockets = { white: await connect(room.data.token, a.cookie), black: await connect(joined.data.token, b.cookie) };
  let game = joined.data.game;
  for (let i = 0; i < 4; i++) {
    const move = legalMoves(game)[0];
    await new Promise(resolve => setTimeout(resolve, 100));
    const reply = once(sockets[game.turn], 'message');
    sockets[game.turn].send(JSON.stringify({ type: 'move', from: move.from, to: move.to, revision: game.revision }));
    const state = JSON.parse((await reply)[0]); assert.equal(state.type, 'state', state.message); game = state.game;
  }
  await new Promise(resolve => setTimeout(resolve, 100));
  const resultA = once(sockets.white, 'message'), resultB = once(sockets.black, 'message');
  sockets.white.send(JSON.stringify({ type: 'resign', revision: game.revision, winner: 'white', finishEffect: 'none' }));
  for (const reply of await Promise.all([resultA, resultB])) {
    const final = JSON.parse(reply[0]); assert.equal(final.game.winner, 'black'); assert.equal(final.game.finishEffect, 'rocket');
  }
  assert.equal((await shop(a.cookie)).balance, 50);
  assert.equal((await shop(b.cookie)).balance, 30);
  await post(`/api/rooms/${room.data.code}/join`, {}, a.cookie);
  assert.equal((await shop(b.cookie)).balance, 30);
  const accountB = await (await fetch(base + '/api/auth/account', { headers: { Cookie: b.cookie } })).json();
  assert.equal(accountB.recent[0].coins, 30);
  // A real checkmate shows the victory selection to both clients, independently of resignation.
  await post('/api/auth/shop/equip', { item: 'effect-none', slot: 'resign' }, b.cookie);
  const chess = await post('/api/rooms', { variant: 'chess' }, a.cookie);
  const chessJoin = await post(`/api/rooms/${chess.data.code}/join`, {}, b.cookie);
  const chessSockets = [];
  for (const [token, cookie] of [[chess.data.token, a.cookie], [chessJoin.data.token, b.cookie]]) {
    const ws = new WebSocket(base.replace(/^http/, 'ws') + `/api/rooms/${chess.data.code}/socket`, ['checkers', token], { headers: { Cookie: cookie, Origin: base } });
    t.after(() => ws.terminate()); const ready = once(ws, 'message'); await once(ws, 'open'); await ready; chessSockets.push(ws);
  }
  for (const [revision, [from, to]] of [[53,45],[12,28],[54,38],[3,39]].entries()) {
    await new Promise(resolve => setTimeout(resolve, 100));
    const replies = chessSockets.map(ws => once(ws, 'message'));
    chessSockets[revision % 2].send(JSON.stringify({ type: 'move', from, to, revision, finishEffect: 'portal' }));
    for (const response of await Promise.all(replies)) {
      const result = JSON.parse(response[0]); assert.equal(result.type, 'state');
      if (revision === 3) { assert.equal(result.game.reason, 'checkmate'); assert.equal(result.game.finishEffect, 'rocket'); }
    }
  }
  // Two simultaneous different purchases must not overdraw the wallet.
  const c = await register('Коллекционер');
  const raced = await Promise.all(['skin-jade', 'effect-confetti'].map(item => post('/api/auth/shop/buy', { item }, c.cookie)));
  assert.deepEqual(raced.map(r => r.response.status).sort(), [200, 409]);
  assert.equal((await shop(c.cookie)).balance, 40);
  for (const user of [a, b, c]) assert.equal((await post('/api/auth/delete-account', { email: user.email, password, confirmation: 'DELETE' }, user.cookie)).response.status, 200);
  const recreated = await post('/api/auth/register', { name: 'Заново', email: c.email, password, confirmPassword: password });
  assert.equal(recreated.response.status, 201, recreated.data.error);
  const fresh = await shop(recreated.cookie); assert.equal(fresh.balance, 100); assert.equal(fresh.owned.length, 2);
  await post('/api/auth/delete-account', { email: c.email, password, confirmation: 'DELETE' }, recreated.cookie);
});

test('account results survive rematches and deletion revokes every session and room seat', { timeout: 60000 }, async t => {
  const password = 'Disposable-profile-test-2026!!';
  const create = async name => {
    const email = `account-${crypto.randomUUID()}@example.invalid`;
    const result = await post('/api/auth/register', { name, email, password, confirmPassword: password });
    assert.equal(result.response.status, 201, result.data.error);
    return { ...result, email };
  };
  const a = await create('Первый игрок'), b = await create('Второй игрок');
  const getAccount = async cookie => {
    const response = await fetch(base + '/api/auth/account', { headers: { Cookie: cookie } });
    assert.equal(response.status, 200); return response.json();
  };
  assert.equal((await fetch(base + '/api/auth/account')).status, 401);
  assert.deepEqual((await getAccount(a.cookie)).recent, []);
  const secondSession = await post('/api/auth/login', { email: a.email, password });
  let lastRoom, lastSocket;
  for (const variant of ['russian', 'russian12', 'chess', 'chapaev']) {
    const room = await post('/api/rooms', { variant }, a.cookie);
    assert.equal(room.response.status, 201, room.data.error);
    const joined = await post(`/api/rooms/${room.data.code}/join`, {}, b.cookie);
    assert.equal(joined.response.status, 200, joined.data.error);
    const socket = new WebSocket(base.replace(/^http/, 'ws') + `/api/rooms/${room.data.code}/socket`, ['checkers', room.data.token], { headers: { Cookie: a.cookie, Origin: base } });
    t.after(() => socket.terminate());
    const initial = once(socket, 'message'); await once(socket, 'open'); await initial;
    const result = once(socket, 'message'); socket.send(JSON.stringify({ type: 'resign', revision: 0 }));
    assert.equal(JSON.parse((await result)[0]).game.winner, 'black');
    const stats = await getAccount(a.cookie);
    assert.equal(stats.modes.find(row => row.variant === variant).losses, 1);
    assert.equal(stats.recent[0].moves, 0);
    // Rejoining the same finished game must not duplicate its result.
    await post(`/api/rooms/${room.data.code}/join`, {}, a.cookie);
    assert.equal((await getAccount(a.cookie)).modes.find(row => row.variant === variant).played, 1);
    lastRoom = room; lastSocket = socket;
  }
  const socketB = new WebSocket(base.replace(/^http/, 'ws') + `/api/rooms/${lastRoom.data.code}/socket`, ['checkers', (await post(`/api/rooms/${lastRoom.data.code}/join`, {}, b.cookie)).data.token], { headers: { Cookie: b.cookie, Origin: base } });
  t.after(() => socketB.terminate());
  const initialB = once(socketB, 'message'); await once(socketB, 'open'); await initialB;
  const command = async (socket, data) => {
    await new Promise(resolve => setTimeout(resolve, 100));
    const response = once(socket, 'message'); socket.send(JSON.stringify(data));
    const state = JSON.parse((await response)[0]); assert.equal(state.type, 'state', state.message); return state;
  };
  await command(lastSocket, { type: 'rematch', revision: 1 });
  const rematch = await command(socketB, { type: 'rematch', revision: 1 });
  assert.equal(rematch.game.winner, null);
  await command(lastSocket, { type: 'draw', revision: 2 });
  assert.equal((await command(socketB, { type: 'draw', revision: 2 })).game.winner, 'draw');
  const beforeDelete = await getAccount(a.cookie);
  assert.equal(beforeDelete.recent.length, 5);
  assert.equal(beforeDelete.modes.find(row => row.variant === 'chapaev').draws, 1);
  const confirmation = { email: a.email, password, confirmation: 'DELETE' };
  assert.equal((await post('/api/auth/delete-account', confirmation)).response.status, 401);
  assert.equal((await post('/api/auth/delete-account', confirmation, a.cookie, 'https://evil.example')).response.status, 403);
  assert.equal((await post('/api/auth/delete-account', { ...confirmation, email: b.email }, a.cookie)).response.status, 400);
  assert.equal((await post('/api/auth/delete-account', { ...confirmation, confirmation: '' }, a.cookie)).response.status, 400);
  assert.equal((await post('/api/auth/delete-account', { ...confirmation, password: 'wrong-password' }, a.cookie)).response.status, 401);
  assert.ok((await session(a.cookie)).user);
  const closed = once(lastSocket, 'close');
  const deleted = await post('/api/auth/delete-account', confirmation, a.cookie);
  assert.equal(deleted.response.status, 200, deleted.data.error);
  assert.ok(deleted.response.headers.get('Set-Cookie').includes('Max-Age=0'));
  assert.equal((await closed)[0], 4003);
  assert.equal((await session(a.cookie)).user, null);
  assert.equal((await session(secondSession.cookie)).user, null);
  assert.equal((await post('/api/auth/login', { email: a.email, password })).response.status, 401);
  assert.equal((await getAccount(b.cookie)).recent.length, 5);
  const roomAfter = await post(`/api/rooms/${lastRoom.data.code}/join`, {}, b.cookie);
  assert.equal(roomAfter.data.names.white, 'Удалённый игрок');
  assert.equal((await post(`/api/rooms/${lastRoom.data.code}/join`, { token: lastRoom.data.token })).response.status, 409);
  const recreated = await post('/api/auth/register', { name: 'Новый профиль', email: a.email, password, confirmPassword: password });
  assert.equal(recreated.response.status, 201);
  assert.notEqual(recreated.data.user.id, a.data.user.id);
  assert.deepEqual((await getAccount(recreated.cookie)).recent, []);
  // Only disposable local integration accounts are removed.
  assert.equal((await post('/api/auth/delete-account', confirmation, recreated.cookie)).response.status, 200);
  assert.equal((await post('/api/auth/delete-account', { ...confirmation, email: b.email }, b.cookie)).response.status, 200);
});
