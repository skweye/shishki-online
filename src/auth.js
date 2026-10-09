import { createRemoteJWKSet, jwtVerify } from 'jose';
import { validateProfile } from './profile.js';
import { accountStats } from './account-stats.js';
import { shopState, buyItem, equipItem } from './shop.js';
import { adminOverview, changeShopAccess, grantAdmin } from './admin.js';
import { randomToken, digest, challengeFor, normalizeEmail, validateRegistration, safeReturnTo } from './auth-crypto.js';

const SESSION_AGE = 30 * 24 * 3600;
const now = () => Math.floor(Date.now() / 1000);
const googleKeys = createRemoteJWKSet(new URL('https://www.googleapis.com/oauth2/v3/certs'));
const googleEnabled = env => !!(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET);
const publicUser = row => row ? { id: row.id, name: row.name, avatar: row.avatar || null, email: row.email, createdAt: row.created_at, emailVerified: !!row.email_verified, googleLinked: !!row.google_sub, hasPassword: !!row.password_hash, pieceSkin: row.piece_skin || 'classic', cueSkin: row.cue_skin || 'classic', finishEffect: row.finish_effect || 'none', victoryEffect: row.victory_effect || 'none', isAdmin: row.is_admin === 1 } : null;
export async function verifyGoogleIdentity(idToken, clientId, nonce, keys = googleKeys) {
  const { payload } = await jwtVerify(idToken, keys, {
    issuer: ['https://accounts.google.com', 'accounts.google.com'], audience: clientId,
    algorithms: ['RS256'], requiredClaims: ['sub', 'iat', 'exp', 'nonce', 'email', 'email_verified'], maxTokenAge: '10m'
  });
  if (payload.nonce !== nonce || payload.email_verified !== true || (payload.azp && payload.azp !== clientId) || typeof payload.sub !== 'string' || !payload.sub) throw new Error('Invalid Google identity');
  normalizeEmail(payload.email);
  return payload;
}
const json = (data, status = 200, headers = {}) => Response.json(data, { status, headers: { 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer', ...headers } });
const error = (message, status = 400) => json({ error: message }, status);
const local = request => ['localhost', '127.0.0.1', '[::1]'].includes(new URL(request.url).hostname);
const cookieName = (request, kind) => `${local(request) ? '' : '__Host-'}shishki-${kind}`;
function cookie(request, kind, value, age) {
  return `${cookieName(request, kind)}=${value}; HttpOnly; Path=/; SameSite=Lax; Max-Age=${age}${local(request) && new URL(request.url).protocol === 'http:' ? '' : '; Secure'}`;
}
function readCookie(request, kind) {
  const prefix = cookieName(request, kind) + '=';
  return request.headers.get('Cookie')?.split(';').map(v => v.trim()).find(v => v.startsWith(prefix))?.slice(prefix.length) || '';
}
export async function authenticatedUser(request, env) {
  const token = readCookie(request, 'session');
  if (!/^[\w-]{43}$/.test(token)) return null;
  const hash = digest(token);
  const row = await env.AUTH_DB.prepare('SELECT u.* FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token_hash = ? AND s.expires_at > ?').bind(hash, now()).first();
  return row ? { ...publicUser(row), sessionHash: hash } : null;
}
export async function sessionActive(env, hash, userId) {
  if (!hash || !userId) return false;
  return !!await env.AUTH_DB.prepare('SELECT 1 FROM sessions WHERE token_hash = ? AND user_id = ? AND expires_at > ?').bind(hash, userId, now()).first();
}
function cleanUser(user) { if (!user) return null; const { sessionHash, ...result } = user; return result; }
async function startSession(request, env, userId) {
  const token = randomToken(), oldToken = readCookie(request, 'session');
  const statements = [env.AUTH_DB.prepare('INSERT INTO sessions(token_hash, user_id, expires_at) VALUES (?, ?, ?)').bind(digest(token), userId, now() + SESSION_AGE)];
  if (oldToken) statements.push(env.AUTH_DB.prepare('DELETE FROM sessions WHERE token_hash = ?').bind(digest(oldToken)));
  await env.AUTH_DB.batch(statements);
  return cookie(request, 'session', token, SESSION_AGE);
}
async function limit(env, key, maximum, seconds) {
  const stamp = now();
  const row = await env.AUTH_DB.prepare(`INSERT INTO auth_limits(key, count, expires_at) VALUES (?, 1, ?)
    ON CONFLICT(key) DO UPDATE SET count = CASE WHEN expires_at <= ? THEN 1 ELSE count + 1 END,
    expires_at = CASE WHEN expires_at <= ? THEN excluded.expires_at ELSE expires_at END RETURNING count`).bind(digest(key), stamp + seconds, stamp, stamp).first();
  return row.count <= maximum;
}
async function tidy(env) {
  const stamp = now();
  await env.AUTH_DB.batch([
    env.AUTH_DB.prepare('DELETE FROM sessions WHERE expires_at <= ?').bind(stamp),
    env.AUTH_DB.prepare('DELETE FROM oauth_flows WHERE expires_at <= ?').bind(stamp),
    env.AUTH_DB.prepare('DELETE FROM auth_limits WHERE expires_at <= ?').bind(stamp)
  ]);
}
function redirect(request, path, cookies = []) {
  const headers = new Headers({ Location: path, 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer' });
  for (const value of cookies) headers.append('Set-Cookie', value);
  return new Response(null, { status: 303, headers });
}
async function googleStart(request, env) {
  if (!googleEnabled(env)) return redirect(request, '/?auth_error=google_unavailable');
  const url = new URL(request.url);
  if (!local(request) && url.origin !== env.AUTH_ORIGIN) {
    const canonical = new URL('/api/auth/google', env.AUTH_ORIGIN);
    canonical.searchParams.set('returnTo', safeReturnTo(url.searchParams.get('returnTo')));
    return redirect(request, canonical.href);
  }
  const user = await authenticatedUser(request, env);
  const state = randomToken(), verifier = randomToken(), nonce = randomToken();
  await env.AUTH_DB.prepare('INSERT INTO oauth_flows(state_hash, verifier, nonce, return_to, link_user_id, expires_at) VALUES (?, ?, ?, ?, ?, ?)')
    .bind(digest(state), verifier, nonce, safeReturnTo(url.searchParams.get('returnTo')), user?.id || null, now() + 600).run();
  const params = new URLSearchParams({
    client_id: env.GOOGLE_CLIENT_ID, redirect_uri: url.origin + '/api/auth/google/callback',
    response_type: 'code', scope: 'openid email profile', state, nonce,
    code_challenge: challengeFor(verifier), code_challenge_method: 'S256', prompt: 'select_account'
  });
  return redirect(request, 'https://accounts.google.com/o/oauth2/v2/auth?' + params, [cookie(request, 'oauth', state, 600)]);
}
async function googleCallback(request, env) {
  const url = new URL(request.url), state = url.searchParams.get('state');
  const cleared = cookie(request, 'oauth', '', 0);
  const failed = code => redirect(request, '/?auth_error=' + code, [cleared]);
  if (!state || !/^[\w-]{43}$/.test(state) || state !== readCookie(request, 'oauth')) return failed('google_state');
  const flow = await env.AUTH_DB.prepare('DELETE FROM oauth_flows WHERE state_hash = ? AND expires_at > ? RETURNING *').bind(digest(state), now()).first();
  if (!flow || !googleEnabled(env)) return failed('google_state');
  if (url.searchParams.has('error')) return failed('google_cancelled');
  const code = url.searchParams.get('code');
  if (!code || code.length > 4096) return failed('google_failed');
  try {
    const response = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ code, client_id: env.GOOGLE_CLIENT_ID, client_secret: env.GOOGLE_CLIENT_SECRET,
        redirect_uri: url.origin + '/api/auth/google/callback', grant_type: 'authorization_code', code_verifier: flow.verifier }), signal: AbortSignal.timeout(12000)
    });
    if (!response.ok) return failed('google_failed');
    const tokens = await response.json();
    const payload = await verifyGoogleIdentity(tokens.id_token, env.GOOGLE_CLIENT_ID, flow.nonce);
    const email = normalizeEmail(payload.email);
    let user = await env.AUTH_DB.prepare('SELECT * FROM users WHERE google_sub = ?').bind(payload.sub).first();
    if (flow.link_user_id) {
      const signedIn = await authenticatedUser(request, env);
      if (signedIn?.id !== flow.link_user_id || signedIn.email !== email || (user && user.id !== signedIn.id)) return failed('google_link');
      await env.AUTH_DB.prepare('UPDATE users SET google_sub = ?, email_verified = 1 WHERE id = ? AND (google_sub IS NULL OR google_sub = ?)').bind(payload.sub, signedIn.id, payload.sub).run();
      user = await env.AUTH_DB.prepare('SELECT * FROM users WHERE id = ? AND google_sub = ?').bind(signedIn.id, payload.sub).first();
      if (!user) return failed('google_link');
    } else if (!user) {
      // Never silently attach a Google identity to an existing password account.
      if (await env.AUTH_DB.prepare('SELECT id FROM users WHERE email = ?').bind(email).first()) return failed('google_existing');
      const id = crypto.randomUUID();
      const name = String(payload.name || 'Игрок').replace(/[\p{Cc}\p{Cf}<>]/gu, '').trim().slice(0, 40) || 'Игрок';
      await env.AUTH_DB.prepare('INSERT INTO users(id, name, email, google_sub, email_verified, created_at) VALUES (?, ?, ?, ?, 1, ?)').bind(id, name, email, payload.sub, now()).run();
      user = { id };
    }
    return redirect(request, flow.return_to, [cleared, await startSession(request, env, user.id)]);
  } catch { return failed('google_failed'); }
}

export async function handleAuth(request, env, ctx, readBody) {
  const url = new URL(request.url), path = url.pathname;
  try {

    if (path.startsWith('/api/auth/admin')) {
      const user = await authenticatedUser(request, env);
      if (!user) return error('Войдите в аккаунт.', 401);
      if (!user.isAdmin) return error('Доступ только для администратора.', 403);
      if (!await limit(env, 'admin:' + user.id, 120, 600)) return error('Слишком много запросов. Попробуйте позже.', 429);
      try {
        if (request.method === 'GET' && path === '/api/auth/admin') return json(await adminOverview(env, user.id, url.searchParams.get('q') || '', Number(url.searchParams.get('offset') || 0)));
        if (request.method !== 'POST' || !['/api/auth/admin/shop-access', '/api/auth/admin/grant-admin'].includes(path)) return error('Запрос не найден.', 404);
        if (request.headers.get('Origin') !== url.origin || request.headers.get('Sec-Fetch-Site') === 'cross-site') return error('Запрос с другого сайта запрещён.', 403);
        if (!request.headers.get('Content-Type')?.toLowerCase().startsWith('application/json')) return error('Ожидается JSON.', 415);
        let data;
        try { data = await readBody(request, 2048); } catch { return error('Некорректный запрос.'); }
        if (!data || typeof data !== 'object' || Array.isArray(data)) return error('Некорректный запрос.');
        return json(await (path === '/api/auth/admin/grant-admin' ? grantAdmin(env, user.id, data) : changeShopAccess(env, user.id, data)));
      } catch (cause) { if (cause.status) return error(cause.message, cause.status); throw cause; }
    }
    if (request.method === 'GET' && path === '/api/auth/account') {
      const user = await authenticatedUser(request, env);
      if (!user) return error('Войдите в аккаунт.', 401);
      return json({ user: cleanUser(user), ...await accountStats(env, user.id), shop: await shopState(env, user.id), googleEnabled: googleEnabled(env) });
    }
    if (request.method === 'GET' && path === '/api/auth/shop') {
      const user = await authenticatedUser(request, env);
      if (!user) return error('Войдите в аккаунт.', 401);
      return json({ user: cleanUser(user), ...await shopState(env, user.id) });
    }
    if (request.method === 'GET' && path === '/api/auth/session') {
      return json({ user: cleanUser(await authenticatedUser(request, env)), googleEnabled: googleEnabled(env) });
    }
    if (request.method === 'GET' && path === '/api/auth/google/callback') return await googleCallback(request, env);
    if (request.method === 'GET' && path === '/api/auth/google') {
      if (!await limit(env, 'google:' + (request.headers.get('CF-Connecting-IP') || 'local'), 20, 600)) return error('Слишком много попыток. Попробуйте через 10 минут.', 429);
      ctx.waitUntil(tidy(env));
      return await googleStart(request, env);
    }
    if (request.method !== 'POST' || !['/api/auth/register', '/api/auth/login', '/api/auth/logout', '/api/auth/profile', '/api/auth/delete-account', '/api/auth/shop/buy', '/api/auth/shop/equip'].includes(path)) return error('Запрос не найден.', 404);
    if (request.headers.get('Origin') !== url.origin || request.headers.get('Sec-Fetch-Site') === 'cross-site') return error('Запрос с другого сайта запрещён.', 403);
    if (!request.headers.get('Content-Type')?.toLowerCase().startsWith('application/json')) return error('Ожидается JSON.', 415);
    let data;
    try { data = await readBody(request, path === '/api/auth/profile' ? 105000 : 2048); } catch { return error('Некорректный запрос.'); }
    if (!data || typeof data !== 'object' || Array.isArray(data)) return error('Некорректный запрос.');
    if (path.startsWith('/api/auth/shop/')) {
      const user = await authenticatedUser(request, env);
      if (!user) return error('Войдите в аккаунт.', 401);
      if (!await limit(env, 'shop:' + user.id, 60, 600)) return error('Слишком много запросов. Попробуйте позже.', 429);
      try {
        if (path.endsWith('/buy')) await buyItem(env, user.id, data.item);
        else await equipItem(env, user.id, data.item, data.slot);
      } catch (cause) { if (cause.status) return error(cause.message, cause.status); throw cause; }
      return json({ user: cleanUser(await authenticatedUser(request, env)), ...await shopState(env, user.id) });
    }
    if (path === '/api/auth/delete-account') {
      const user = await authenticatedUser(request, env);
      if (!user) return error('Войдите в аккаунт.', 401);
      if (!await limit(env, 'delete:' + user.id, 5, 600)) return error('Слишком много попыток. Попробуйте через 10 минут.', 429);
      if (data.confirmation !== 'DELETE' || typeof data.email !== 'string' || data.email.trim().toLowerCase() !== user.email.toLowerCase()) return error('Введите свою почту и DELETE для подтверждения.');
      if (user.hasPassword) {
        if (typeof data.password !== 'string' || data.password.length > 128) return error('Введите текущий пароль.');
        const row = await env.AUTH_DB.prepare('SELECT password_hash FROM users WHERE id = ?').bind(user.id).first();
        if (!await env.PASSWORDS.getByName(digest(user.email)).verify(data.password, row?.password_hash)) return error('Неверный пароль.', 401);
      }
      const rooms = await env.AUTH_DB.prepare('SELECT code FROM account_rooms WHERE user_id = ?').bind(user.id).all();
      await env.AUTH_DB.prepare('DELETE FROM users WHERE id = ?').bind(user.id).run();
      ctx.waitUntil(Promise.allSettled(rooms.results.map(({ code }) => env.ROOMS.getByName(code).fetch(new Request('https://internal/forget-account', { method: 'POST', body: JSON.stringify({ userId: user.id }) })))));
      return json({ user: null, deleted: true }, 200, { 'Set-Cookie': cookie(request, 'session', '', 0) });
    }
    if (path === '/api/auth/profile') {
      const user = await authenticatedUser(request, env);
      if (!user) return error('Войдите в аккаунт, чтобы изменить профиль.', 401);
      if (!await limit(env, 'profile:' + user.id, 30, 600)) return error('Слишком много попыток. Попробуйте через 10 минут.', 429);
      let fields;
      try { fields = validateProfile(data); } catch (cause) { return error(cause.message); }
      await env.AUTH_DB.prepare('UPDATE users SET name = ?, avatar = ? WHERE id = ?').bind(fields.name, fields.avatar, user.id).run();
      return json({ user: { ...cleanUser(user), ...fields } });
    }
    if (path === '/api/auth/logout') {
      const token = readCookie(request, 'session');
      if (token) await env.AUTH_DB.prepare('DELETE FROM sessions WHERE token_hash = ?').bind(digest(token)).run();
      return json({ user: null }, 200, { 'Set-Cookie': cookie(request, 'session', '', 0) });
    }
    const ip = request.headers.get('CF-Connecting-IP') || 'local';
    if (!await limit(env, 'auth-ip:' + ip, 30, 600)) return error('Слишком много попыток. Попробуйте через 10 минут.', 429);
    ctx.waitUntil(tidy(env));
    let fields;
    try {
      fields = path.endsWith('/register') ? validateRegistration(data) : { email: normalizeEmail(data.email), password: data.password };
      if (typeof fields.password !== 'string' || fields.password.length > 128 || fields.password.length < 1) throw new Error('Введите почту и пароль.');
    } catch (cause) { return error(cause.message); }
    if (!await limit(env, 'auth-email:' + fields.email, 12, 600)) return error('Слишком много попыток для этой почты. Попробуйте через 10 минут.', 429);
    const passwords = env.PASSWORDS.getByName(digest(fields.email));
    if (path.endsWith('/register')) {
      const hash = await passwords.hash(fields.password);
      const id = crypto.randomUUID();
      const result = await env.AUTH_DB.prepare('INSERT INTO users(id, name, email, password_hash, created_at) VALUES (?, ?, ?, ?, ?) ON CONFLICT(email) DO NOTHING')
        .bind(id, fields.name, fields.email, hash, now()).run();
      if (!result.meta.changes) return error('Этот адрес уже зарегистрирован. Попробуйте войти.', 409);
      const row = await env.AUTH_DB.prepare('SELECT * FROM users WHERE id = ?').bind(id).first();
      return json({ user: publicUser(row) }, 201, { 'Set-Cookie': await startSession(request, env, id) });
    }
    const user = await env.AUTH_DB.prepare('SELECT * FROM users WHERE email = ?').bind(fields.email).first();
    if (!await passwords.verify(fields.password, user?.password_hash || null)) return error('Неверная почта или пароль.', 401);
    return json({ user: publicUser(user) }, 200, { 'Set-Cookie': await startSession(request, env, user.id) });
  } catch { if (path.includes('/admin')) return error('Админ-панель временно недоступна.', 503); if (path.includes('/shop')) return error('Магазин временно недоступен. Попробуйте ещё раз.', 503); return error(path.includes('profile') || path.includes('account') ? 'Сервис профиля временно недоступен. Попробуйте ещё раз.' : 'Не удалось выполнить вход. Попробуйте ещё раз.', 503); }
}
