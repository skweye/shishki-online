const fail = (message, status = 400) => { throw Object.assign(new Error(message), { status }); };
const fields = 'id, name, email, created_at, email_verified, shop_access, is_admin';

export async function adminOverview(env, actorId, query = '', offset = 0) {
  if (!await env.AUTH_DB.prepare('SELECT 1 FROM users WHERE id = ? AND is_admin = 1').bind(actorId).first()) fail('Доступ только для администратора.', 403);
  if (typeof query !== 'string' || query.length > 254 || !Number.isInteger(offset) || offset < 0 || offset > 100000) fail('Некорректный поиск.');
  const term = '%' + query.trim().replace(/[\\%_]/g, '\\$&') + '%';
  const [users, count, summary, audit] = await env.AUTH_DB.batch([
    env.AUTH_DB.prepare(`SELECT ${fields} FROM users WHERE email LIKE ? ESCAPE '\\' OR name LIKE ? ESCAPE '\\' ORDER BY created_at DESC, id LIMIT 20 OFFSET ?`).bind(term, term, offset),
    env.AUTH_DB.prepare(`SELECT COUNT(*) AS count FROM users WHERE email LIKE ? ESCAPE '\\' OR name LIKE ? ESCAPE '\\'`).bind(term, term),
    env.AUTH_DB.prepare('SELECT COUNT(*) AS users, COALESCE(SUM(shop_access),0) AS full_access FROM users').bind(),
    env.AUTH_DB.prepare(`SELECT a.action, a.created_at, actor.name AS actor, target.email AS target FROM admin_audit a LEFT JOIN users actor ON actor.id = a.actor_id LEFT JOIN users target ON target.id = a.target_id ORDER BY a.created_at DESC, a.id DESC LIMIT 20`).bind()
  ]);
  return { users: users.results, total: count.results[0].count, summary: summary.results[0], audit: audit.results, offset };
}

export async function changeShopAccess(env, actorId, data) {
  if (typeof data.userId !== 'string' || data.userId.length > 100 || typeof data.enabled !== 'boolean' || typeof data.expected !== 'boolean' || data.enabled === data.expected) fail('Некорректное изменение доступа.');
  // Check both permissions and the displayed previous state inside the atomic UPDATE.
  const result = await env.AUTH_DB.batch([
    env.AUTH_DB.prepare(`UPDATE users SET shop_access = ?,
      cue_skin = CASE WHEN ? = 1 OR cue_skin = 'classic' OR EXISTS(SELECT 1 FROM account_items WHERE user_id = users.id AND item_id = 'cue-' || users.cue_skin) THEN cue_skin ELSE 'classic' END,
      piece_skin = CASE WHEN ? = 1 OR piece_skin = 'classic' OR EXISTS(SELECT 1 FROM account_items WHERE user_id = users.id AND item_id = 'skin-' || users.piece_skin) THEN piece_skin ELSE 'classic' END,
      finish_effect = CASE WHEN ? = 1 OR finish_effect = 'none' OR EXISTS(SELECT 1 FROM account_items WHERE user_id = users.id AND item_id = 'effect-' || users.finish_effect) THEN finish_effect ELSE 'none' END,
      victory_effect = CASE WHEN ? = 1 OR victory_effect = 'none' OR EXISTS(SELECT 1 FROM account_items WHERE user_id = users.id AND item_id = 'effect-' || users.victory_effect) THEN victory_effect ELSE 'none' END
      WHERE id = ? AND is_admin = 0 AND shop_access = ? AND EXISTS(SELECT 1 FROM users actor WHERE actor.id = ? AND actor.is_admin = 1)`)
      .bind(Number(data.enabled), Number(data.enabled), Number(data.enabled), Number(data.enabled), Number(data.enabled), data.userId, Number(data.expected), actorId),
    env.AUTH_DB.prepare('INSERT INTO admin_audit(id, actor_id, target_id, action, created_at) SELECT ?, ?, ?, ?, ? WHERE changes() > 0')
      .bind(crypto.randomUUID(), actorId, data.userId, data.enabled ? 'grant_shop' : 'revoke_shop', Math.floor(Date.now() / 1000))
  ]);
  if (!result[0].meta.changes) fail('Доступ уже изменён, игрок удалён или это аккаунт администратора. Обновите список.', 409);
  return { updated: true };
}

export async function grantAdmin(env, actorId, data) {
  if (typeof data.userId !== 'string' || !data.userId || data.userId.length > 100) fail('Выберите зарегистрированного игрока.');
  // Every administrator has the same authority, including appointing other admins.
  const result = await env.AUTH_DB.batch([
    env.AUTH_DB.prepare(`UPDATE users SET is_admin = 1, shop_access = 1
      WHERE id = ? AND is_admin = 0 AND EXISTS(SELECT 1 FROM users actor WHERE actor.id = ? AND actor.is_admin = 1)`)
      .bind(data.userId, actorId),
    env.AUTH_DB.prepare("INSERT INTO admin_audit(id, actor_id, target_id, action, created_at) SELECT ?, ?, ?, 'grant_admin', ? WHERE changes() > 0")
      .bind(crypto.randomUUID(), actorId, data.userId, Math.floor(Date.now() / 1000))
  ]);
  if (!result[0].meta.changes) fail('Игрок уже администратор, аккаунт удалён или ваши права изменились. Обновите список.', 409);
  return { updated: true };
}
