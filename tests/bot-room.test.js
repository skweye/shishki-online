import { test } from 'node:test';
import assert from 'node:assert/strict';
import { register } from 'node:module';
import { newGame, applyMove, legalMoves } from '../public/game.js';
import { applyPoolShot } from '../public/pool.js';
import { botDelay, botPreview, botPreviewDuration } from '../src/bot-room.js';
import { actDurak, durakActions } from '../public/durak.js';
register('./helpers/cloudflare-loader.js', import.meta.url);
globalThis.WebSocketRequestResponsePair = class {};
const { GameRoom } = await import('../src/worker.js');
const START = 1800000000000;
async function setup(saved = null, env = {}) {
  let initialized, alarm;
  const values = new Map(saved ? [['room', structuredClone(saved)]] : []), sockets = [];
  const ctx = {
    storage: { async get(key) { return structuredClone(values.get(key)); }, async put(key, value) { values.set(key, structuredClone(value)); }, async setAlarm(at) { alarm = at; }, async deleteAlarm() { alarm = null; }, async deleteAll() { values.clear(); } },
    getWebSockets: role => sockets.filter(ws => !role || ws.session.role === role),
    setWebSocketAutoResponse() {}, blockConcurrencyWhile(fn) { initialized = fn(); return initialized; }
  };
  const room = new GameRoom(ctx, env); await initialized;
  const ws = { readyState: 1, session: { role: 'white', lastMessage: 0 }, messages: [], deserializeAttachment() { return this.session; }, serializeAttachment(s) { this.session = s; }, send(message) { this.messages.push(JSON.parse(message)); }, close(code) { this.readyState = 3; this.code = code; } };
  sockets.push(ws);
  if (saved) await room.save(false);
  return { room, ws, values, alarm: () => alarm, async send(data) { await room.webSocketMessage(ws, JSON.stringify({ revision: room.room.game.revision, ...data })); } };
}
const fixture = variant => ({ bot: true, code: 'ABCDEF123456', players: { white: 'human', black: 'private-bot-token' }, accounts: {}, names: { black: 'Бот' }, updatedAt: START, game: newGame(variant), clock: null, rematch: [], drawOffer: null });
async function due(t, harness) { const deadline = harness.room.room.botAt; assert.ok(deadline); t.mock.timers.tick(Math.max(1, deadline - Date.now())); await harness.room.alarm(); }

test('bot room is ready immediately, keeps its seat private, and cannot be hijacked', async t => {
  t.mock.timers.enable({ apis: ['Date'], now: START });
  const h = await setup();
  const response = await h.room.fetch(new Request('https://game.test/create?code=ABCDEF123456&kind=bot&variant=chess', { method: 'POST' }));
  const data = await response.json();
  assert.equal(response.status, 201); assert.equal(data.ready, true); assert.equal(data.bot, true); assert.equal(data.role, 'white'); assert.equal(data.names.black, 'Бот');
  assert.equal(data.players, undefined); assert.equal(data.botAt, undefined);
  assert.ok(!JSON.stringify(data).includes(h.room.room.players.black));
  const join = token => h.room.fetch(new Request('https://game.test/join', { method: 'POST', body: JSON.stringify({ token }) }));
  assert.equal((await join()).status, 409); assert.equal((await join(h.room.room.players.black)).status, 403);
  assert.equal((await join(data.token)).status, 200);
  h.ws.session.role = 'black'; await h.send({ type: 'resign' }); assert.equal(h.room.room.game.winner, null);
});

test('one durable bot action per turn, restoration, stale move rejection and offline pause', async t => {
  t.mock.timers.enable({ apis: ['Date'], now: START });
  const h = await setup(fixture('russian'));
  assert.equal(h.room.room.botAt, null);
  const move = legalMoves(h.room.room.game)[0]; await h.send({ type: 'move', ...move });
  const scheduled = h.room.room.botAt; assert.ok(scheduled > Date.now());
  t.mock.timers.tick(100); await h.send({ type: 'move', from: 0, to: 9 });
  assert.equal(h.room.room.game.revision, 1); assert.equal(h.room.room.botAt, scheduled);
  h.ws.readyState = 3; await h.room.webSocketClose(h.ws);
  t.mock.timers.tick(2000); await h.room.alarm(); assert.equal(h.room.room.game.revision, 1, 'no unattended bot moves');
  const restored = await setup(h.values.get('room')); await due(t, restored);
  assert.equal(restored.room.room.game.revision, 1, 'preview does not change the position');
  assert.equal(restored.room.snapshot('white').botPreview.kind, 'move');
  const planned = structuredClone(restored.room.room.botPlan.action);
  await due(t, restored);
  assert.equal(restored.room.room.game.revision, 2); assert.equal(restored.room.room.game.turn, 'white');
  assert.equal(restored.room.room.game.history.at(-1).from, planned.from);
  assert.equal(restored.room.room.game.history.at(-1).to, planned.to);
  assert.equal(restored.room.room.updatedAt, START, 'automatic turns do not extend room retention');
  await restored.room.alarm(); assert.equal(restored.room.room.game.revision, 2, 'duplicate alarm is idempotent');
  t.mock.timers.tick(100); await restored.send({ type: 'move', ...move, revision: 0 });
  assert.equal(restored.ws.messages.at(-2).type, 'error'); assert.equal(restored.room.room.game.revision, 2);
});

test('bot accepts draw and rematch, respects resignation, and waits for human between Chapaev rounds', async t => {
  t.mock.timers.enable({ apis: ['Date'], now: START });
  const h = await setup(fixture('chess'));
  await h.send({ type: 'draw' }); await due(t, h); assert.equal(h.room.room.game.winner, 'draw');
  const matchId = h.room.room.matchId; t.mock.timers.tick(100); await h.send({ type: 'rematch' }); await due(t, h);
  assert.equal(h.room.room.game.winner, null); assert.notEqual(h.room.room.matchId, matchId); assert.deepEqual(h.room.room.rematch, []);
  t.mock.timers.tick(100); await h.send({ type: 'resign' }); assert.equal(h.room.room.game.winner, 'black'); assert.equal(h.room.room.botAt, null);
  const saved = fixture('chapaev'); saved.game.winner = 'white'; saved.game.reason = 'round'; saved.matchId = 'same-match';
  const round = await setup(saved); assert.equal(round.room.room.botAt, null);
  await round.send({ type: 'rematch' }); await due(t, round);
  assert.equal(round.room.room.game.round, 2); assert.equal(round.room.room.game.rows.white, 6); assert.equal(round.room.room.matchId, 'same-match');
});

test('pool bot waits until the human shot animation has finished', async t => {
  t.mock.timers.enable({ apis: ['Date'], now: START });
  const saved = fixture('pool8'); saved.game = applyPoolShot(saved.game, { dx: .85, dy: 0 });
  saved.game.turn = 'black';
  const h = await setup(saved), delay = botDelay(saved.game);
  assert.ok(delay > saved.game.lastShot.duration * 1000);
  t.mock.timers.tick(delay - 100); await h.room.alarm(); assert.equal(h.room.room.game.revision, 1);
  await due(t, h); assert.equal(h.room.room.game.revision, 1);
  const preview=h.room.snapshot('white').botPreview;
  assert.equal(preview.kind,'pool-shot');assert.ok(preview.power>=.05&&preview.power<=1);
  assert.ok(preview.executeAt-Date.now()<=420);
  const planned=structuredClone(h.room.room.botPlan.action);
  await due(t, h); assert.equal(h.room.room.game.revision, 2);
  assert.equal(h.room.room.game.lastShot.dx,planned.dx);assert.equal(h.room.room.game.lastShot.dy,planned.dy);
  assert.equal(h.room.snapshot('white').botPreview,null);
});

test('bot previews never disclose private cards, tiles or fleet placement',()=>{
  for(const action of [{type:'durak-attack',card:17},{type:'durak-defend',card:9,target:0},{type:'domino-play',id:23,end:'left'},{type:'fleet-ready',fleet:[[11,12,13]]}]){
    const room=fixture('russian');room.botPlan={revision:0,action,executeAt:START+100};
    const preview=botPreview(room);assert.equal(preview.kind,action.type);
    for(const key of ['card','id','fleet','action'])assert.equal(preview[key],undefined);
    room.game.revision++;assert.equal(botPreview(room),null);
  }
});

test('shorter bot pauses preserve dice, shot and card clearing animations',()=>{
  const g=newGame('russian');assert.ok(botDelay(g)+botPreviewDuration({type:'move'})<400);
  assert.ok(botDelay({...newGame('narde'),lastAction:{kind:'roll'}})>=1190);
  let cards=newGame('durak-simple');
  const played=actDurak(cards,cards.turn,durakActions(cards)[0]);assert.equal(botDelay(played,cards),400);
  const taken=actDurak(played,played.turn,{type:'durak-take'});assert.ok(botDelay(taken,played)>=800);
  const next={...newGame('chapaev'),round:2};assert.ok(botDelay(next)>=850);
});

test('sync repairs a missed alarm and streams preview then move without rejoining',async t=>{
  t.mock.timers.enable({apis:['Date'],now:START});const h=await setup(fixture('russian'));
  await h.send({type:'move',...legalMoves(h.room.room.game)[0]});
  t.mock.timers.tick(2000);await h.send({type:'sync'});
  assert.equal(h.room.room.game.revision,1);assert.equal(h.ws.messages.at(-1).botPreview.kind,'move');
  t.mock.timers.tick(1000);await h.send({type:'sync'});
  assert.equal(h.ws.messages.at(-1).game.revision,2);assert.equal(h.ws.messages.at(-1).botPreview,null);
  const revision=h.room.room.game.revision;t.mock.timers.tick(100);await h.send({type:'sync'});assert.equal(h.room.room.game.revision,revision);
});

test('automatic sync and pool shots do not consume each other\'s rate limit',async t=>{
  t.mock.timers.enable({apis:['Date'],now:START});
  for(const bot of [true,false])for(const syncFirst of [true,false]){
    const saved=fixture('pool8');saved.bot=bot;
    const h=await setup(saved),shot={type:'pool-shot',dx:.85,dy:0};
    if(syncFirst)await h.send({type:'sync'});
    await h.send(shot);
    if(!syncFirst)await h.send({type:'sync'});
    assert.equal(h.room.room.game.revision,1,'the shot is accepted even at the exact sync timestamp');
    assert.equal(h.ws.messages.filter(m=>m.type==='error').length,0,'background sync never raises an action-rate error');
    const count=h.ws.messages.length;
    for(let i=0;i<20;i++)await h.send({type:'sync'});
    assert.equal(h.ws.messages.length,count,'duplicate sync requests have a separate silent throttle');
    await h.send({type:'resign'});
    assert.match(h.ws.messages.at(-2).message,/Слишком быстро/,'actual repeated actions are still limited');
    t.mock.timers.tick(500);await h.send({type:'sync'});
    assert.equal(h.ws.messages.at(-1).type,'state');
  }
});

test('resignation and draw offers cancel a prepared action before execution',async t=>{
  t.mock.timers.enable({apis:['Date'],now:START});
  for(const type of ['resign','draw']){
    const saved=fixture('russian');saved.updatedAt=Date.now();saved.game=applyMove(saved.game,42,35);
    const h=await setup(saved);await due(t,h);assert.ok(h.room.room.botPlan);
    t.mock.timers.tick(100);await h.send({type});assert.equal(h.room.room.botPlan,null);
    if(type==='draw')await due(t,h);
    assert.equal(h.room.room.game.history.length,1);assert.equal(h.room.room.game.winner,type==='draw'?'draw':'black');
  }
});

test('only the human account receives normal completed-match statistics once', async t => {
  t.mock.timers.enable({ apis: ['Date'], now: START });
  const writes = [], env = { AUTH_DB: { prepare: () => ({ bind: (...values) => values }), async batch(rows) { writes.push(...rows); } } };
  const saved = fixture('russian'); saved.accounts.white = 'human-account'; saved.game.winner = 'white'; saved.game.reason = 'no-moves'; saved.game.history = Array(6).fill({});
  const h = await setup(saved, env); await h.room.save(false); assert.equal(writes.length, 1);
  await setup(h.values.get('room'), env); assert.equal(writes.length, 1);
});
