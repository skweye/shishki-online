import {actDurak,durakView} from '../public/durak.js';
import {applyOwnerPrank,OWNER_EMAIL} from '../public/pranks.js';
import { handleMatchmaking } from './matchmaking.js';
export { Matchmaker } from './matchmaking.js';
import { DurableObject } from 'cloudflare:workers';
import { validPoolAim } from '../public/pool-aim.js';
import { actBattleship, battleshipView } from '../public/battleship.js';
import { actDomino, readyDominoRound, dominoView } from '../public/domino.js';
import { newGame, applyMove, opposite, validVariant, variantOf } from '../public/game.js';
import { applyShot, nextChapaevRound } from '../public/chapaev.js';
import { handleAuth, authenticatedUser, sessionActive } from './auth.js';
import { writeResults } from './account-stats.js';
import { createClock, expiredSide, advanceClock, timeoutGame, clockDeadline } from '../public/time-control.js';
import { chatMessage } from './chat.js';
import { applyPoolShot, placePoolCue } from '../public/pool.js';
import { rollNarde, randomDice } from '../public/narde.js';
import { validEffect } from '../public/shop-catalog.js';
export { PasswordService } from './password-service.js';

const json = (body, status = 200) => Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } });
const fail = (message, status = 400) => json({ error: message }, status);
const TTL = 60 * 60 * 1000;
async function bodyOf(request, maximum = 2048) {
  // Bound the actual body, not just a user-controlled Content-Length header.
  const reader = request.body?.getReader();
  if (!reader) return {};
  let size = 0, chunks = [];
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.length;
    if (size > maximum) { await reader.cancel(); throw new Error('Слишком большой запрос.'); }
    chunks.push(value);
  }
  const bytes = new Uint8Array(size); let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
  return size ? JSON.parse(new TextDecoder().decode(bytes)) : {};
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (!url.pathname.startsWith('/api/')) return env.ASSETS.fetch(request);
    if (url.pathname.startsWith('/api/auth/')) return handleAuth(request, env, ctx, bodyOf);
    const origin = request.headers.get('Origin');
    if (origin && origin !== url.origin) {
      // Drain small rejected bodies without cancelling the reusable HTTP stream.
      try { await bodyOf(request); } catch {}
      return fail('Запрос с другого сайта запрещён.', 403);
    }
    try {
      const identity = await authenticatedUser(request, env);
      const headers = new Headers(request.headers);
      // Identity is supplied only by this Worker, never by a browser header.
      headers.delete('X-Auth-User'); headers.delete('X-Match-Actor');
      if (identity) headers.set('X-Auth-User', encodeURIComponent(JSON.stringify({ id: identity.id, name: identity.name, sessionHash: identity.sessionHash, pieceSkin: identity.pieceSkin, cueSkin: identity.cueSkin, shipSkin: identity.shipSkin, cardSkin: identity.cardSkin, finishEffect: identity.finishEffect, victoryEffect: identity.victoryEffect })));
      request = new Request(request, { headers });
      if (request.method === 'POST') {
        let data;
        try { data = await bodyOf(request); } catch { return fail('Некорректный запрос.'); }
        request = new Request(request.url, { method: 'POST', headers: request.headers, body: JSON.stringify(data) });
      }
      if (url.pathname === '/api/matchmaking') return await handleMatchmaking(request,env,identity);
      if (url.pathname === '/api/rooms' && request.method === 'POST') {
        const data = await request.json();
        const variant = data?.variant ?? 'russian';
        if (!data || typeof data !== 'object' || Array.isArray(data) || !validVariant(variant)) return fail('Неизвестный режим игры.');
        const code = crypto.randomUUID().replaceAll('-', '').slice(0, 12).toUpperCase();
        return env.ROOMS.getByName(code).fetch(new Request(url.origin + '/create?code=' + code + '&variant=' + variant, { method: 'POST', headers }));
      }
      const match = url.pathname.match(/^\/api\/rooms\/([A-F0-9]{12})\/(join|socket)$/);
      if (!match) return fail('Комната не найдена.', 404);
      return env.ROOMS.getByName(match[1]).fetch(request);
    } catch { return fail('Не удалось выполнить запрос. Попробуйте ещё раз.', 500); }
  }
};

export class GameRoom extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    this.room = null;
    ctx.blockConcurrencyWhile(async () => {
      this.room = await ctx.storage.get('room') || null;
      if (this.room) {
        if (this.expired()) await this.removeRoom();
        else {
          if (this.room.clock === undefined) {
            this.room.clock = createClock(variantOf(this.room.game), this.room.players.black && !this.room.game.winner ? Date.now() : null);
            await ctx.storage.put('room', this.room);
          }
          await this.expireClock(); await this.scheduleAlarm();
        }
      }
    });
    ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair('ping', 'pong'));
  }
  expired() { return this.room && this.room.updatedAt + TTL <= Date.now(); }
  async scheduleAlarm() {
    const deadline = Math.min(this.room.updatedAt + TTL, clockDeadline(this.room.clock, this.room.game), this.room.pendingResults?.length ? Date.now() + 60000 : Infinity);
    await this.ctx.storage.setAlarm(deadline);
  }
  async expireClock(now = Date.now()) {
    if (!this.room) return false;
    const loser = expiredSide(this.room.clock, this.room.game, now);
    if (!loser) return false;
    const previous = this.room.game;
    this.room.game = timeoutGame(previous, loser);
    this.room.clock = advanceClock(this.room.clock, previous, this.room.game, now);
    this.room.drawOffer = null;
    await this.save(false); this.broadcast(); return true;
  }
  async removeRoom() {
    if (this.room?.pendingResults?.length) await this.flushResults();
    if (this.env.AUTH_DB && this.room?.code) await this.env.AUTH_DB.prepare('DELETE FROM account_rooms WHERE code = ?').bind(this.room.code).run();
    for (const ws of this.ctx.getWebSockets()) ws.close(4004, 'Комната удалена после часа бездействия');
    await this.ctx.storage.deleteAlarm();
    await this.ctx.storage.deleteAll(); this.room = null;
  }
  async save(activity = true) {
    if (activity) this.room.updatedAt = Date.now();
    this.room.matchId ||= crypto.randomUUID();
    const game = this.room.game;
    if (['white', 'black'].includes(game.winner) && game.reason !== 'round' && game.finishEffect === undefined) {
      const winnerId = this.room.accounts?.[game.winner];
      game.finishEffect = 'none';
      if (winnerId) {
        // A cosmetic lookup must never prevent a legal win or timeout from completing.
        try {
          const winner = await this.env.AUTH_DB.prepare('SELECT victory_effect FROM users WHERE id = ?').bind(winnerId).first();
          game.finishEffect = validEffect(winner?.victory_effect);
        } catch { game.finishEffect = validEffect(this.room.cosmetics?.[game.winner]?.victory); }
      }
    }
    if (game.winner && !game.unranked && game.reason !== 'round' && !this.room.resultRecorded && this.room.players.black) {
      this.room.pendingResults ||= [];
      for (const side of ['white', 'black']) if (this.room.accounts?.[side]) this.room.pendingResults.push({
        userId: this.room.accounts[side], matchId: this.room.matchId, variant: variantOf(game),
        result: game.winner === 'draw' ? 'draw' : game.winner === side ? 'win' : 'loss',
        moves: game.history.length, finishedAt: Math.floor(Date.now() / 1000)
      });
      this.room.resultRecorded = true;
    }
    await this.ctx.storage.put('room', this.room);
    try { await this.flushResults(); } catch { /* Keep the durable outbox for retry. */ }
    await this.scheduleAlarm();
  }
  async flushResults() {
    if (!this.room?.pendingResults?.length) return;
    await writeResults(this.env, this.room.pendingResults);
    this.room.pendingResults = [];
    await this.ctx.storage.put('room', this.room);
  }
  role(token) {
    if (typeof token !== 'string' || !token) return null;
    return ['white', 'black'].find(side => this.room?.players[side] === token) || null;
  }
  snapshot(role = null) {
    return {
      game: durakView(battleshipView(dominoView(this.room.game, role), role), role), ready: !!this.room.players.black, clock: this.room.clock || null, serverNow: Date.now(), chat: this.room.chat || [],
      poolAim: this.poolAim && Date.now()-this.poolAimAt<3000 && validPoolAim(this.poolAim,this.room.game,this.poolAim.role) ? this.poolAim : null,
      online: Object.fromEntries(['white', 'black'].map(side => [side, this.ctx.getWebSockets(side).some(ws => ws.readyState === 1)])),
      rematch: this.room.rematch, drawOffer: this.room.drawOffer,
      names: this.room.names || {}, cosmetics: this.room.cosmetics || {}, accountBound: { white: !!this.room.accounts?.white, black: !!this.room.accounts?.black }
    };
  }
  broadcast() {
    for (const ws of this.ctx.getWebSockets()) { try { ws.send(JSON.stringify({ type: 'state', ...this.snapshot(ws.deserializeAttachment()?.role) })); } catch { /* closing socket */ } }
  }
  async fetch(request) {
    return this.ctx.blockConcurrencyWhile(async () => {
      const url = new URL(request.url);
      const identity = request.headers.has('X-Auth-User') ? JSON.parse(decodeURIComponent(request.headers.get('X-Auth-User'))) : null;
      if (url.pathname === '/forget-account' && request.method === 'POST') {
        const { userId } = await request.json();
        if (this.room) {
          this.room.names ||= {};
          for (const side of ['white', 'black']) if (this.room.accounts?.[side] === userId) {
            for (const ws of this.ctx.getWebSockets(side)) ws.close(4003, 'Аккаунт удалён');
            this.room.names[side] = 'Удалённый игрок';
            this.room.chat = (this.room.chat || []).filter(message => message.side !== side);
            this.room.accounts[side] = null;
            if (this.room.cosmetics) delete this.room.cosmetics[side];
            this.room.players[side] = crypto.randomUUID();
          }
          this.room.pendingResults = (this.room.pendingResults || []).filter(row => row.userId !== userId);
          await this.save(false); this.broadcast();
        }
        return json({ ok: true });
      }
      // An overdue alarm must not let a late join revive an expired room.
      if (this.expired()) await this.removeRoom();
      await this.expireClock();
      if (url.pathname === '/match-create' && request.method === 'POST') {
        const pair=await request.json();
        if(!validVariant(pair.variant)||!pair.players?.white?.token||!pair.players?.black?.token)return fail('Некорректная пара игроков.');
        if(this.room){
          if(this.room.reservation!==pair.reservation)return fail('Комната уже существует.',409);
          await this.save(false);return json({ok:true});
        }
        const room={code:pair.code,reservation:pair.reservation,players:{},accounts:{},names:{},cosmetics:{},game:newGame(pair.variant),rematch:[],drawOffer:null,chat:[],clock:createClock(pair.variant,Date.now())};
        for(const side of ['white','black']){
          const player=pair.players[side],user=player.identity;
          room.players[side]=player.token;room.accounts[side]=user?.id||null;room.names[side]=user?.name||null;
          room.cosmetics[side]={skin:user?.pieceSkin||'classic',cue:user?.cueSkin||'classic',ship:user?.shipSkin||'classic',card:user?.cardSkin||'classic',effect:user?.finishEffect||'none',victory:user?.victoryEffect||'none'};
          if(user)await this.env.AUTH_DB.prepare('INSERT OR IGNORE INTO account_rooms(user_id, code) VALUES (?, ?)').bind(user.id,room.code).run();
        }
        this.room=room;await this.save();return json({ok:true},201);
      }
      if (url.pathname === '/create' && request.method === 'POST') {
        if (this.room) return fail('Комната уже существует.', 409);
        const variant = url.searchParams.get('variant') || 'russian';
        if (!validVariant(variant)) return fail('Неизвестный режим игры.');
        const token = crypto.randomUUID();
        this.room = { players: { white: token, black: null }, accounts: { white: identity?.id || null, black: null }, names: { white: identity?.name || null, black: null }, game: newGame(variant), rematch: [], drawOffer: null };
        this.room.clock = createClock(variant); this.room.chat = [];
        this.room.code = url.searchParams.get('code');
        this.room.cosmetics = { white: { skin: identity?.pieceSkin || 'classic', cue: identity?.cueSkin || 'classic', ship: identity?.shipSkin || 'classic', card: identity?.cardSkin || 'classic', effect: identity?.finishEffect || 'none', victory: identity?.victoryEffect || 'none' } };
        if (identity) await this.env.AUTH_DB.prepare('INSERT OR IGNORE INTO account_rooms(user_id, code) VALUES (?, ?)').bind(identity.id, this.room.code).run();
        await this.save();
        return json({ code: url.searchParams.get('code'), token, role: 'white', ...this.snapshot('white') }, 201);
      }
      if (!this.room) return fail('Комната не найдена или срок её хранения истёк.', 404);
      if (url.pathname.endsWith('/join') && request.method === 'POST') {
        let data;
        try { data = await bodyOf(request); } catch { return fail('Некорректный запрос.'); }
        if (!data || typeof data !== 'object') return fail('Некорректный запрос.');
        let token = data.token, role = this.role(token);
        this.room.accounts ||= { white: null, black: null };
        this.room.names ||= { white: null, black: null };
        const accountRole = identity && ['white', 'black'].find(side => this.room.accounts[side] === identity.id);
        if (accountRole) { role = accountRole; token = this.room.players[role]; }
        if (role && this.room.accounts[role] && this.room.accounts[role] !== identity?.id) return fail('Войдите в аккаунт, с которым начали эту партию.', 401);
        const newPlayer = !role;
        if (newPlayer) {
          if (this.room.players.black) return fail('Оба места уже заняты. Откройте комнату в том браузере, где вы начали игру.', 409);
          token = crypto.randomUUID(); role = 'black'; this.room.players.black = token;
          if (this.room.clock && !this.room.game.winner) this.room.clock.startedAt = Date.now();
        }
        if (identity) {
          this.room.accounts[role] = identity.id; this.room.names[role] = identity.name;
          this.room.cosmetics ||= {};
          this.room.cosmetics[role] = { skin: identity.pieceSkin || 'classic', cue: identity.cueSkin || 'classic', ship: identity.shipSkin || 'classic', card: identity.cardSkin || 'classic', effect: identity.finishEffect || 'none', victory: identity.victoryEffect || 'none' };
          const code = this.room.code || url.pathname.match(/\/rooms\/([A-F0-9]{12})\//)?.[1];
          if (code) await this.env.AUTH_DB.prepare('INSERT OR IGNORE INTO account_rooms(user_id, code) VALUES (?, ?)').bind(identity.id, code).run();
        }
        await this.save(newPlayer); this.broadcast();
        return json({ token, role, ...this.snapshot(role) });
      }
      if (url.pathname.endsWith('/socket') && request.method === 'GET') {
        if (request.headers.get('Upgrade')?.toLowerCase() !== 'websocket') return fail('Требуется WebSocket.', 426);
        const protocols = request.headers.get('Sec-WebSocket-Protocol')?.split(',').map(s => s.trim()) || [];
        const role = this.role(protocols[1]);
        if (protocols[0] !== 'checkers' || !role) return fail('Не удалось подтвердить место игрока.', 403);
        if (this.room.accounts?.[role] && this.room.accounts[role] !== identity?.id) return fail('Войдите в свой аккаунт.', 401);
        for (const previous of this.ctx.getWebSockets(role)) previous.close(4001, 'Игра открыта в другой вкладке');
        const [client, server] = Object.values(new WebSocketPair());
        this.ctx.acceptWebSocket(server, [role]);
        server.serializeAttachment({ role, lastMessage: 0, sessionHash: identity?.sessionHash || null });
        this.broadcast();
        return new Response(null, { status: 101, webSocket: client, headers: { 'Sec-WebSocket-Protocol': 'checkers' } });
      }
      return fail('Недоступный запрос.', 405);
    });
  }
  async webSocketMessage(ws, message) {
    return this.ctx.blockConcurrencyWhile(async () => {
      let messageType;
      try {
        if (this.expired()) await this.removeRoom();
        if (!this.room) { ws.close(4004, 'Комната удалена после часа бездействия'); return; }
        if (typeof message !== 'string' || message.length > 4096) throw new Error('Некорректное сообщение.');
        const session = ws.deserializeAttachment();
        const accountId = this.room.accounts?.[session.role];
        if ((accountId || session.sessionHash) && !await sessionActive(this.env, session.sessionHash, accountId)) {
          ws.close(4003, 'Войдите в аккаунт снова'); return;
        }
        const data = JSON.parse(message), role = session.role;
        if (!data || typeof data !== 'object') throw new Error('Некорректное сообщение.');
        messageType = data.type;
        const actionNow = Date.now();
        if(data.type==='pool-aim'){
          if(!this.room.players.black||!validPoolAim(data,this.room.game,role)||actionNow-(session.lastAim||0)<60)return;
          session.lastAim=actionNow;ws.serializeAttachment(session);
          this.poolAim={type:'pool-aim',role,revision:data.revision,angle:data.angle,power:data.power,placing:data.placing};this.poolAimAt=actionNow;
          for(const peer of this.ctx.getWebSockets())if(peer.deserializeAttachment()?.role!==role){try{peer.send(JSON.stringify(this.poolAim));}catch{}}
          return; // No persisted state, move revision, rewards or inactivity extension.
        }
        await this.expireClock(actionNow);
        if (data.type === 'chat') {
          const lastSent = this.room.chatLastSent?.[role];
          if (lastSent !== undefined && actionNow - lastSent < 1000) throw new Error('Подождите секунду перед следующим сообщением.');
          const item = chatMessage(data, role, this.room.names?.[role], actionNow);
          this.room.chat = [...(this.room.chat || []), item].slice(-50);
          this.room.chatLastSent = { ...this.room.chatLastSent, [role]: actionNow };
          await this.save(false);
          for (const peer of this.ctx.getWebSockets()) { try { peer.send(JSON.stringify({ type: 'chat', message: item })); } catch {} }
          return;
        }
        if (actionNow - session.lastMessage < 80) throw new Error('Слишком быстро. Повторите действие.');
        session.lastMessage = actionNow; ws.serializeAttachment(session);
        if (data.type === 'sync') { ws.send(JSON.stringify({ type: 'state', ...this.snapshot(ws.deserializeAttachment()?.role) })); return; }
        if (!this.room.players.black) throw new Error('Дождитесь второго игрока.');
        // Independent fleets may be submitted against the same setup snapshot.
        // The setup base prevents delayed commands from an earlier match entering a rematch.
        const game = this.room.game;
        const parallelFleet = data.type === 'fleet-ready' && game.variant === 'battleship' && game.phase === 'setup' && !game.ready[role] && Number.isInteger(data.revision) && data.revision >= game.revision - Number(game.ready.white) - Number(game.ready.black) && data.revision <= game.revision;
        if (data.revision !== game.revision && !parallelFleet) throw new Error('Позиция уже изменилась. Повторите действие.');
        const previous = structuredClone(this.room.game);
        if(data.type==='owner-prank'){
          const owner=accountId&&await this.env.AUTH_DB.prepare('SELECT owner_pranks,email,email_verified FROM users WHERE id=?').bind(accountId).first();
          if(!owner||owner.owner_pranks!==1||owner.email!==OWNER_EMAIL||!owner.email_verified)throw Error('Шалости доступны только владельцу.');
          this.room.game=applyOwnerPrank(game,role);
          if(game.variant==='chess'&&this.room.clock)this.room.clock[role]+=60000;
          this.room.drawOffer=null;
        }else if (['fleet-ready','sea-fire'].includes(data.type)) {
          this.room.game = actBattleship(this.room.game, role, data); this.room.drawOffer = null;
        } else if (['durak-attack','durak-defend','durak-transfer','durak-take','durak-finish'].includes(data.type)) {
          this.room.game = actDurak(game, role, data); this.room.drawOffer = null;
        } else if (data.type === 'domino-ready') {
          this.room.game = readyDominoRound(this.room.game, role); this.room.drawOffer = null;
        } else if (['domino-play','domino-draw','domino-pass'].includes(data.type)) {
          if (this.room.game.turn !== role) throw new Error('Сейчас ход соперника.');
          this.room.game = actDomino(this.room.game, data); this.room.drawOffer = null;
        } else if (data.type === 'roll') {
          if (this.room.game.turn !== role) throw new Error('Сейчас ход соперника.');
          this.room.game = rollNarde(this.room.game, randomDice(this.room.game.opening));
          this.room.drawOffer = null;
        } else if (data.type === 'pool-shot' || data.type === 'pool-place') {
          if (this.room.game.turn !== role) throw new Error('Сейчас ход соперника.');
          this.room.game = data.type === 'pool-shot' ? applyPoolShot(this.room.game, data) : placePoolCue(this.room.game, data.x, data.y);
          this.room.drawOffer = null;
        } else if (data.type === 'move' || data.type === 'shot') {
          if (this.room.game.winner) throw new Error('Партия уже завершена.');
          if (this.room.game.turn !== role) throw new Error('Сейчас ход соперника.');
          this.room.game = data.type === 'shot' ? applyShot(this.room.game, data.id, data.dx, data.dy) : applyMove(this.room.game, data.from, data.to, data.promotion);
          this.room.drawOffer = null;
        } else if (data.type === 'resign' && !this.room.game.winner) {
          const winnerId = this.room.accounts?.[opposite(role)];
          // Resolve the winner's current selection on the server, never from a move payload.
          const winner = winnerId ? await this.env.AUTH_DB.prepare('SELECT finish_effect FROM users WHERE id = ?').bind(winnerId).first() : null;
          this.room.game.winner = opposite(role); this.room.game.reason = 'resign'; this.room.game.revision++;
          this.room.game.finishEffect = winner?.finish_effect || 'none';
          this.room.drawOffer = null;
        } else if (data.type === 'draw' && !this.room.game.winner) {
          if (this.room.drawOffer === opposite(role)) {
            this.room.game.winner = 'draw'; this.room.game.reason = 'agreement'; this.room.game.revision++;
          } else this.room.drawOffer = role;
        } else if (data.type === 'decline-draw' && this.room.drawOffer === opposite(role)) {
          this.room.drawOffer = null;
        } else if (data.type === 'rematch' && this.room.game.winner) {
          if (!this.room.rematch.includes(role)) this.room.rematch.push(role);
          if (this.room.rematch.length === 2) {
            if (this.room.game.reason !== 'round') { this.room.matchId = crypto.randomUUID(); this.room.resultRecorded = false; }
            const revision = this.room.game.revision + 1;
            this.room.game = this.room.game.reason === 'round' ? nextChapaevRound(this.room.game) : newGame(variantOf(this.room.game)); this.room.game.revision = revision;
            this.room.clock = createClock(variantOf(this.room.game), actionNow);
            this.room.rematch = []; this.room.drawOffer = null;
          }
        } else throw new Error('Действие сейчас недоступно.');
        if (data.type!=='owner-prank' && !previous.winner && this.room.game.revision !== previous.revision) this.room.clock = advanceClock(this.room.clock, previous, this.room.game, actionNow);
        await this.save(); this.broadcast();
      } catch (error) {
        ws.send(JSON.stringify({ type: 'error', context: messageType === 'chat' ? 'chat' : 'game', message: error instanceof SyntaxError ? 'Некорректное сообщение.' : error.message }));
        if (this.room && messageType !== 'chat') ws.send(JSON.stringify({ type: 'state', ...this.snapshot(ws.deserializeAttachment()?.role) }));
      }
    });
  }
  webSocketClose(ws) { if(this.poolAim?.role===ws.deserializeAttachment()?.role)this.poolAim=null; if (this.room) this.broadcast(); }
  webSocketError(ws) { ws.close(1011, 'Ошибка соединения'); this.webSocketClose(ws); }
  async alarm() {
    return this.ctx.blockConcurrencyWhile(async () => {
      if (this.room && !this.expired()) {
        await this.expireClock();
        await this.save(false); return;
      }
      await this.removeRoom();
    });
  }
}
