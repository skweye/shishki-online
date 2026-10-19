import { test } from 'node:test';
import assert from 'node:assert/strict';
import { setTimeout as delay } from 'node:timers/promises';
import { VARIANTS, legalMoves } from '../public/game.js';
import { durakActions, isDurak } from '../public/durak.js';
import { dominoMoves } from '../public/domino.js';
import { randomFleet } from '../public/battleship.js';
import { chooseBotAction } from '../src/bot.js';
const base = process.env.TEST_BASE_URL || 'http://127.0.0.1:8787';
async function post(path, body = {}) {
  const response = await fetch(base + path, { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(body) });
  return { status:response.status, data:await response.json() };
}
function client(code, token) {
  const ws = new WebSocket(base.replace(/^http/, 'ws') + '/api/rooms/' + code + '/socket', ['checkers',token]), messages = [];
  ws.addEventListener('message', event => { if (event.data !== 'pong') messages.push(JSON.parse(event.data)); });
  return { ws, async wait(predicate) {
    const end = Date.now() + 22000;
    while (Date.now() < end) { const index = messages.findIndex(predicate); if (index >= 0) return messages.splice(index,1)[0]; await delay(25); }
    throw Error('Bot socket timeout: ' + JSON.stringify(messages));
  }, async send(data) { await delay(110); ws.send(JSON.stringify(data)); } };
}
function privateState(g) {
  if (isDurak(g.variant) || g.variant === 'domino') {
    assert.equal(g.stock, undefined); if (!g.roundResult && !g.winner) assert.deepEqual(g.hands.black, []);
  }
  if (g.variant === 'battleship' && !g.winner) assert.deepEqual(g.fleets.black, g.shots.white.filter(s => s.result === 'sunk').map(s => s.sunkCells));
}
function humanAction(g) {
  if (g.variant === 'battleship') return g.phase === 'setup' ? { type:'fleet-ready',fleet:randomFleet() } : { type:'sea-fire', cell:Array.from({length:100},(_,i)=>i).find(c => !g.shots.white.some(s=>s.cell===c)) };
  if (isDurak(g.variant)) return durakActions(g)[0];
  if (g.variant === 'domino') {
    if (g.roundResult) return { type:'domino-ready' };
    const move = dominoMoves(g)[0]; return move ? {type:'domino-play',...move} : {type:g.stockCount?'domino-draw':'domino-pass'};
  }
  if (g.variant === 'narde' && !g.dice.length) return {type:'roll'};
  if (['pool8','chapaev'].includes(g.variant)) return chooseBotAction(g,'white');
  return {type:'move',...legalMoves(g)[0]};
}

test('all 11 bot modes create, play an automatic legal turn and restore a private seat over real sockets', { timeout:180000 }, async t => {
  for (const variant of Object.keys(VARIANTS)) await t.test(variant, async () => {
    const {status,data:r}=await post('/api/rooms',{kind:'bot',variant});
    assert.equal(status,201);assert.equal(r.bot,true);assert.equal(r.ready,true);assert.equal(r.role,'white');privateState(r.game);
    assert.equal((await post(`/api/rooms/${r.code}/join`)).status,409);
    const a=client(r.code,r.token);
    try {
      let state=await a.wait(m=>m.type==='state'), acted=false;
      for(let i=0;i<30&&!acted;i++) {
        const g=state.game;privateState(g);
        const botTurn=g.turn==='black'||variant==='battleship'&&g.phase==='setup'&&g.ready.white;
        if(!botTurn)await a.send({...humanAction(g),revision:g.revision});
        state=await a.wait(m=>m.type==='state'&&m.game.revision>g.revision);
        acted=botTurn || variant==='battleship'&&state.game.ready.black;
      }
      assert.ok(acted,variant+' bot replied');privateState(state.game);a.ws.close();await delay(100);
      const {data:restored,status:joined}=await post(`/api/rooms/${r.code}/join`,{token:r.token});
      assert.equal(joined,200);assert.equal(restored.bot,true);assert.equal(restored.role,'white');assert.equal(restored.game.variant,variant);
      assert.ok(restored.game.revision>=state.game.revision);privateState(restored.game);
      const again=client(r.code,r.token);try { const resumed=await again.wait(m=>m.type==='state');assert.equal(resumed.bot,true);privateState(resumed.game); } finally {again.ws.close();}
    } finally {a.ws.close();}
  });
});

test('bot draw, rematch and surrender work with the actual Worker', {timeout:30000}, async()=>{
  const {data:r}=await post('/api/rooms',{kind:'bot',variant:'chess'}),a=client(r.code,r.token);
  try {
    await a.wait(m=>m.type==='state');await a.send({type:'draw',revision:0});
    let state=await a.wait(m=>m.type==='state'&&m.game.winner==='draw');
    await a.send({type:'rematch',revision:state.game.revision});state=await a.wait(m=>m.type==='state'&&m.game.revision>state.game.revision&&!m.game.winner);
    assert.equal(state.game.variant,'chess');assert.equal(state.game.history.length,0);
    await a.send({type:'resign',revision:state.game.revision});state=await a.wait(m=>m.type==='state'&&m.game.winner==='black');assert.equal(state.game.reason,'resign');
  } finally {a.ws.close();}
});
