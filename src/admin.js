const fail = (message, status = 400) => { throw Object.assign(new Error(message), { status }); };
const fields = 'id, name, email, created_at, email_verified, shop_access, is_admin, admin_level';
const hierarchy='EXISTS(SELECT 1 FROM users actor WHERE actor.id = ? AND actor.admin_level >= 2 AND (actor.admin_level > users.admin_level OR (actor.admin_level = 3 AND actor.id = users.id)))';

export async function adminOverview(env, actorId, query = '', offset = 0) {
  const actor=await env.AUTH_DB.prepare('SELECT id,admin_level FROM users WHERE id=? AND admin_level>0').bind(actorId).first();
  if(!actor)fail('Доступ только для администратора.',403);
  if (typeof query !== 'string' || query.length > 254 || !Number.isInteger(offset) || offset < 0 || offset > 100000) fail('Некорректный поиск.');
  const term = '%' + query.trim().replace(/[\\%_]/g, '\\$&') + '%';
  const [users, count, summary, audit] = await env.AUTH_DB.batch([
    env.AUTH_DB.prepare(`SELECT ${fields},COALESCE((SELECT balance FROM account_wallets WHERE user_id=users.id),100) AS balance FROM users WHERE email LIKE ? ESCAPE '\\' OR name LIKE ? ESCAPE '\\' ORDER BY created_at DESC, id LIMIT 20 OFFSET ?`).bind(term, term, offset),
    env.AUTH_DB.prepare(`SELECT COUNT(*) AS count FROM users WHERE email LIKE ? ESCAPE '\\' OR name LIKE ? ESCAPE '\\'`).bind(term, term),
    env.AUTH_DB.prepare('SELECT COUNT(*) AS users, COALESCE(SUM(shop_access),0) AS full_access FROM users').bind(),
    env.AUTH_DB.prepare(`SELECT a.action, a.created_at, a.from_level, a.to_level, a.amount, actor.name AS actor, target.email AS target FROM admin_audit a LEFT JOIN users actor ON actor.id = a.actor_id LEFT JOIN users target ON target.id = a.target_id ORDER BY a.created_at DESC, a.id DESC LIMIT 20`).bind()
  ]);
  return { actor, users: users.results, total: count.results[0].count, summary: summary.results[0], audit: audit.results, offset };
}

export async function changeShopAccess(env, actorId, data) {
  if (typeof data.userId !== 'string' || data.userId.length > 100 || typeof data.enabled !== 'boolean' || typeof data.expected !== 'boolean' || data.enabled === data.expected) fail('Некорректное изменение доступа.');
  // Check both permissions and the displayed previous state inside the atomic UPDATE.
  const result = await env.AUTH_DB.batch([
    env.AUTH_DB.prepare(`UPDATE users SET shop_access = ?,
      card_skin = CASE WHEN ? = 1 OR card_skin = 'classic' OR EXISTS(SELECT 1 FROM account_items WHERE user_id = users.id AND item_id = 'card-' || users.card_skin) THEN card_skin ELSE 'classic' END,
      ship_skin = CASE WHEN ? = 1 OR ship_skin = 'classic' OR EXISTS(SELECT 1 FROM account_items WHERE user_id = users.id AND item_id = 'ship-' || users.ship_skin) THEN ship_skin ELSE 'classic' END,
      cue_skin = CASE WHEN ? = 1 OR cue_skin = 'classic' OR EXISTS(SELECT 1 FROM account_items WHERE user_id = users.id AND item_id = 'cue-' || users.cue_skin) THEN cue_skin ELSE 'classic' END,
      piece_skin = CASE WHEN ? = 1 OR piece_skin = 'classic' OR EXISTS(SELECT 1 FROM account_items WHERE user_id = users.id AND item_id = 'skin-' || users.piece_skin) THEN piece_skin ELSE 'classic' END,
      finish_effect = CASE WHEN ? = 1 OR finish_effect = 'none' OR EXISTS(SELECT 1 FROM account_items WHERE user_id = users.id AND item_id = 'effect-' || users.finish_effect) THEN finish_effect ELSE 'none' END,
      victory_effect = CASE WHEN ? = 1 OR victory_effect = 'none' OR EXISTS(SELECT 1 FROM account_items WHERE user_id = users.id AND item_id = 'effect-' || users.victory_effect) THEN victory_effect ELSE 'none' END
      WHERE id = ? AND shop_access = ? AND ${hierarchy}`)
      .bind(Number(data.enabled), Number(data.enabled), Number(data.enabled), Number(data.enabled), Number(data.enabled), Number(data.enabled), Number(data.enabled), data.userId, Number(data.expected), actorId),
    env.AUTH_DB.prepare('INSERT INTO admin_audit(id, actor_id, target_id, action, created_at) SELECT ?, ?, ?, ?, ? WHERE changes() > 0')
      .bind(crypto.randomUUID(), actorId, data.userId, data.enabled ? 'grant_shop' : 'revoke_shop', Math.floor(Date.now() / 1000))
  ]);
  if (!result[0].meta.changes) fail('Недостаточно прав, аккаунт удалён или данные изменились. Обновите список.', 409);
  return { updated: true };
}

export async function grantAdmin(env,actorId,data){
  return setAdminLevel(env,actorId,{...data,level:2,expected:0});
}
export async function setAdminLevel(env,actorId,data){
  if(typeof data.userId!=='string'||!data.userId||data.userId.length>100||!Number.isInteger(data.level)||data.level<0||data.level>3||!Number.isInteger(data.expected)||data.expected<0||data.expected>3||data.level===data.expected)fail('Некорректный уровень администратора.');
  const result=await env.AUTH_DB.batch([
    env.AUTH_DB.prepare(`UPDATE users SET admin_level=?,is_admin=(?>0),shop_access=CASE WHEN ?>0 THEN 1 ELSE 0 END,
      card_skin=CASE WHEN ?>0 OR card_skin='classic' OR EXISTS(SELECT 1 FROM account_items WHERE user_id=users.id AND item_id='card-'||users.card_skin) THEN card_skin ELSE 'classic' END,
      ship_skin=CASE WHEN ?>0 OR ship_skin='classic' OR EXISTS(SELECT 1 FROM account_items WHERE user_id=users.id AND item_id='ship-'||users.ship_skin) THEN ship_skin ELSE 'classic' END,
      cue_skin=CASE WHEN ?>0 OR cue_skin='classic' OR EXISTS(SELECT 1 FROM account_items WHERE user_id=users.id AND item_id='cue-'||users.cue_skin) THEN cue_skin ELSE 'classic' END,
      piece_skin=CASE WHEN ?>0 OR piece_skin='classic' OR EXISTS(SELECT 1 FROM account_items WHERE user_id=users.id AND item_id='skin-'||users.piece_skin) THEN piece_skin ELSE 'classic' END,
      finish_effect=CASE WHEN ?>0 OR finish_effect='none' OR EXISTS(SELECT 1 FROM account_items WHERE user_id=users.id AND item_id='effect-'||users.finish_effect) THEN finish_effect ELSE 'none' END,
      victory_effect=CASE WHEN ?>0 OR victory_effect='none' OR EXISTS(SELECT 1 FROM account_items WHERE user_id=users.id AND item_id='effect-'||users.victory_effect) THEN victory_effect ELSE 'none' END
      WHERE id=? AND admin_level=? AND EXISTS(SELECT 1 FROM users actor WHERE actor.id=? AND actor.admin_level=3 AND (users.admin_level<3 OR users.id=actor.id))`)
      .bind(...Array(9).fill(data.level),data.userId,data.expected,actorId),
    env.AUTH_DB.prepare("INSERT INTO admin_audit(id,actor_id,target_id,action,created_at,from_level,to_level) SELECT ?,?,?,'set_level',?,?,? WHERE changes()>0")
      .bind(crypto.randomUUID(),actorId,data.userId,Math.floor(Date.now()/1000),data.expected,data.level)
  ]);
  if(!result[0].meta.changes)fail('Недостаточно прав, аккаунт удалён или данные изменились. Обновите список.',409);
  return {updated:true};
}
export async function grantCoins(env,actorId,data){
  if(typeof data.userId!=='string'||!data.userId||data.userId.length>100||!Number.isInteger(data.amount)||data.amount<1||data.amount>1000000||typeof data.requestId!=='string'||!/^[a-zA-Z0-9-]{16,80}$/.test(data.requestId))fail('Укажите от 1 до 1000000 целых монет.');
  const read=()=>env.AUTH_DB.prepare('SELECT target_id,amount,action FROM admin_audit WHERE actor_id=? AND request_id=?').bind(actorId,data.requestId).first();
  const verify=row=>{if(row.target_id!==data.userId||row.amount!==data.amount||row.action!=='grant_coins')fail('Этот запрос уже использован.',409);return {updated:true,amount:row.amount};};
  const existing=await read();if(existing)return verify(existing);
  try{
    await env.AUTH_DB.prepare(`INSERT INTO admin_audit(id,actor_id,target_id,action,created_at,amount,request_id)
      SELECT ?,?,?,'grant_coins',?,?,? WHERE NOT EXISTS(SELECT 1 FROM admin_audit WHERE actor_id=? AND request_id=?)`)
      .bind(crypto.randomUUID(),actorId,data.userId,Math.floor(Date.now()/1000),data.amount,data.requestId,actorId,data.requestId).run();
  }catch(error){
    if(String(error.message).includes('admin_hierarchy'))fail('Нельзя управлять этим аккаунтом с вашим уровнем.',403);
    if(String(error.message).includes('coin_balance_limit'))fail('Достигнут предел баланса аккаунта.',409);
    throw error;
  }
  return verify(await read());
}
