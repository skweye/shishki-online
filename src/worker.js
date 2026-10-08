import { DurableObject } from 'cloudflare:workers';
import { newGame, applyMove, opposite, validVariant, variantOf } from '../public/game.js';
import { applyShot, nextChapaevRound } from '../public/chapaev.js';
import { handleAuth, authenticatedUser, sessionActive } from './auth.js';
import { writeResults } from './account-stats.js';
import { canLaunchRocket } from './privileges.js';
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
    if (origin && origin !== url.origin) { await request.body?.cancel(); return fail('Запрос с другого сайта запрещён.', 403); }
    try {
      const identity = await authenticatedUser(request, env);
      const headers = new Headers(request.headers);
      // Identity is supplied only by this Worker, never by a browser header.
      headers.delete('X-Auth-User');
      if (identity) headers.set('X-Auth-User', encodeURIComponent(JSON.stringify({ id: identity.id, name: identity.name, sessionHash: identity.sessionHash })));
      request = new Request(request, { headers });
      if (request.method === 'POST') {
        let data;
        try { data = await bodyOf(request); } catch { return fail('Некорректный запрос.'); }
        request = new Request(request.url, { method: 'POST', headers: request.headers, body: JSON.stringify(data) });
      }
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
        else await ctx.storage.setAlarm(this.room.pendingResults?.length ? Math.min(Date.now() + 60000, this.room.updatedAt + TTL) : this.room.updatedAt + TTL);
      }
    });
    ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair('ping', 'pong'));
  }
  expired() { return this.room && this.room.updatedAt + TTL <= Date.now(); }
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
    if (game.winner && game.reason !== 'round' && !this.room.resultRecorded && this.room.players.black) {
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
    await this.ctx.storage.setAlarm(this.room.pendingResults?.length ? Math.min(Date.now() + 60000, this.room.updatedAt + TTL) : this.room.updatedAt + TTL);
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
  snapshot() {
    return {
      game: this.room.game, ready: !!this.room.players.black,
      online: Object.fromEntries(['white', 'black'].map(side => [side, this.ctx.getWebSockets(side).some(ws => ws.readyState === 1)])),
      rematch: this.room.rematch, drawOffer: this.room.drawOffer,
      names: this.room.names || {}, accountBound: { white: !!this.room.accounts?.white, black: !!this.room.accounts?.black }
    };
  }
  broadcast() {
    const data = JSON.stringify({ type: 'state', ...this.snapshot() });
    for (const ws of this.ctx.getWebSockets()) { try { ws.send(data); } catch { /* closing socket */ } }
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
            this.room.accounts[side] = null;
            this.room.players[side] = crypto.randomUUID();
          }
          this.room.pendingResults = (this.room.pendingResults || []).filter(row => row.userId !== userId);
          await this.save(false); this.broadcast();
        }
        return json({ ok: true });
      }
      // An overdue alarm must not let a late join revive an expired room.
      if (this.expired()) await this.removeRoom();
      if (url.pathname === '/create' && request.method === 'POST') {
        if (this.room) return fail('Комната уже существует.', 409);
        const variant = url.searchParams.get('variant') || 'russian';
        if (!validVariant(variant)) return fail('Неизвестный режим игры.');
        const token = crypto.randomUUID();
        this.room = { players: { white: token, black: null }, accounts: { white: identity?.id || null, black: null }, names: { white: identity?.name || null, black: null }, game: newGame(variant), rematch: [], drawOffer: null };
        this.room.code = url.searchParams.get('code');
        if (identity) await this.env.AUTH_DB.prepare('INSERT OR IGNORE INTO account_rooms(user_id, code) VALUES (?, ?)').bind(identity.id, this.room.code).run();
        await this.save();
        return json({ code: url.searchParams.get('code'), token, role: 'white', ...this.snapshot() }, 201);
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
        }
        if (identity) {
          this.room.accounts[role] = identity.id; this.room.names[role] = identity.name;
          const code = this.room.code || url.pathname.match(/\/rooms\/([A-F0-9]{12})\//)?.[1];
          if (code) await this.env.AUTH_DB.prepare('INSERT OR IGNORE INTO account_rooms(user_id, code) VALUES (?, ?)').bind(identity.id, code).run();
        }
        await this.save(newPlayer); this.broadcast();
        return json({ token, role, ...this.snapshot() });
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
      try {
        if (this.expired()) await this.removeRoom();
        if (!this.room) { ws.close(4004, 'Комната удалена после часа бездействия'); return; }
        if (typeof message !== 'string' || message.length > 1024) throw new Error('Некорректное сообщение.');
        const session = ws.deserializeAttachment();
        const accountId = this.room.accounts?.[session.role];
        if ((accountId || session.sessionHash) && !await sessionActive(this.env, session.sessionHash, accountId)) {
          ws.close(4003, 'Войдите в аккаунт снова'); return;
        }
        if (Date.now() - session.lastMessage < 80) throw new Error('Слишком быстро. Повторите действие.');
        session.lastMessage = Date.now(); ws.serializeAttachment(session);
        const data = JSON.parse(message), role = session.role;
        if (!data || typeof data !== 'object') throw new Error('Некорректное сообщение.');
        if (data.type === 'sync') { ws.send(JSON.stringify({ type: 'state', ...this.snapshot() })); return; }
        if (!this.room.players.black) throw new Error('Дождитесь второго игрока.');
        if (data.revision !== this.room.game.revision) throw new Error('Позиция уже изменилась. Повторите действие.');
        if (data.type === 'move' || data.type === 'shot') {
          if (this.room.game.winner) throw new Error('Партия уже завершена.');
          if (this.room.game.turn !== role) throw new Error('Сейчас ход соперника.');
          this.room.game = data.type === 'shot' ? applyShot(this.room.game, data.id, data.dx, data.dy) : applyMove(this.room.game, data.from, data.to, data.promotion);
          this.room.drawOffer = null;
        } else if (data.type === 'rocket') {
          if (!canLaunchRocket({ id: accountId }, this.env)) throw new Error('Запуск ракеты недоступен этому аккаунту.');
          if (this.room.game.winner) throw new Error('Партия уже завершена.');
          this.room.game.winner = role; this.room.game.reason = 'rocket'; this.room.game.revision++;
          this.room.drawOffer = null; this.room.rematch = [];
        } else if (data.type === 'resign' && !this.room.game.winner) {
          this.room.game.winner = opposite(role); this.room.game.reason = 'resign'; this.room.game.revision++;
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
            this.room.rematch = []; this.room.drawOffer = null;
          }
        } else throw new Error('Действие сейчас недоступно.');
        await this.save(); this.broadcast();
      } catch (error) {
        ws.send(JSON.stringify({ type: 'error', message: error instanceof SyntaxError ? 'Некорректное сообщение.' : error.message }));
        if (this.room) ws.send(JSON.stringify({ type: 'state', ...this.snapshot() }));
      }
    });
  }
  webSocketClose(ws) { if (this.room) this.broadcast(); }
  webSocketError(ws) { ws.close(1011, 'Ошибка соединения'); if (this.room) this.broadcast(); }
  async alarm() {
    return this.ctx.blockConcurrencyWhile(async () => {
      if (this.room && !this.expired()) {
        await this.save(false); return;
      }
      await this.removeRoom();
    });
  }
}
