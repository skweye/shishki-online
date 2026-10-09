import { CATALOG, itemById } from '../public/shop-catalog.js';

async function ensureWallet(env, userId) {
  await env.AUTH_DB.prepare('INSERT OR IGNORE INTO account_wallets(user_id, balance) SELECT id, 100 FROM users WHERE id = ?').bind(userId).run();
}
const fail = (message, status = 400) => { throw Object.assign(new Error(message), { status }); };
export async function shopState(env, userId) {
  await ensureWallet(env, userId);
  const [wallet, items] = await env.AUTH_DB.batch([
    env.AUTH_DB.prepare('SELECT w.balance, u.shop_access FROM account_wallets w JOIN users u ON u.id = w.user_id WHERE w.user_id = ?').bind(userId),
    env.AUTH_DB.prepare('SELECT item_id FROM account_items WHERE user_id = ?').bind(userId)
  ]);
  const fullAccess = wallet.results[0]?.shop_access === 1;
  return { balance: wallet.results[0]?.balance ?? 0, fullAccess, owned: fullAccess ? CATALOG.map(item => item.id) : [...CATALOG.filter(item => !item.price).map(item => item.id), ...items.results.map(row => row.item_id)] };
}
export async function buyItem(env, userId, itemId) {
  const item = itemById(itemId);
  if (!item) fail('Такого предмета нет в магазине.');
  if (!item.price) return;
  const user = await env.AUTH_DB.prepare('SELECT shop_access FROM users WHERE id = ?').bind(userId).first();
  if (user?.shop_access === 1) return;
  await ensureWallet(env, userId);
  await env.AUTH_DB.prepare(`INSERT OR IGNORE INTO account_items(user_id, item_id, paid_price, purchased_at)
    SELECT user_id, ?, ?, ? FROM account_wallets WHERE user_id = ? AND balance >= ?`)
    .bind(item.id, item.price, Math.floor(Date.now() / 1000), userId, item.price).run();
  const owned = await env.AUTH_DB.prepare('SELECT 1 FROM account_items WHERE user_id = ? AND item_id = ?').bind(userId, item.id).first();
  if (!owned) fail('Недостаточно монет. Завершайте онлайн-партии, чтобы накопить ещё.', 409);
}
export async function equipItem(env, userId, itemId, slot = 'resign') {
  const item = itemById(itemId);
  if (!item) fail('Такого предмета нет в коллекции.');
  if (!['resign', 'victory'].includes(slot)) fail('Неизвестный вид анимации.');
  // The column is selected from a fixed enum; ownership is checked by the same UPDATE.
  const column = item.type === 'skin' ? 'piece_skin' : slot === 'victory' ? 'victory_effect' : 'finish_effect';
  const result = await env.AUTH_DB.prepare(`UPDATE users SET ${column} = ? WHERE id = ?
    AND (shop_access = 1 OR ? = 0 OR EXISTS (SELECT 1 FROM account_items WHERE user_id = ? AND item_id = ?))`)
    .bind(item.value, userId, item.price, userId, item.id).run();
  if (!result.meta.changes) fail('Сначала приобретите этот предмет.', 403);
}
