import { CATALOG, itemById, saleValue } from '../public/shop-catalog.js';
import { CASES, caseById, selectCaseItem, rarityOf, RARITIES, progression } from '../public/cases.js';

async function ensureWallet(env, userId) {
  await env.AUTH_DB.prepare('INSERT OR IGNORE INTO account_wallets(user_id, balance) SELECT id, 100 FROM users WHERE id = ?').bind(userId).run();
}
const fail = (message, status = 400) => { throw Object.assign(new Error(message), { status }); };
export async function shopState(env, userId) {
  await ensureWallet(env, userId);
  const [wallet, items, progress, used, history] = await env.AUTH_DB.batch([
    env.AUTH_DB.prepare('SELECT w.balance, u.shop_access FROM account_wallets w JOIN users u ON u.id = w.user_id WHERE w.user_id = ?').bind(userId),
    env.AUTH_DB.prepare('SELECT i.item_id, NOT EXISTS(SELECT 1 FROM non_resalable_items n WHERE n.user_id=i.user_id AND n.item_id=i.item_id) AS sellable FROM account_items i WHERE i.user_id = ?').bind(userId),
    env.AUTH_DB.prepare('SELECT xp FROM account_progress WHERE user_id = ?').bind(userId),
    env.AUTH_DB.prepare("SELECT case_id,COUNT(*) AS used FROM case_openings WHERE user_id=? AND source='reward' GROUP BY case_id").bind(userId),
    env.AUTH_DB.prepare('SELECT * FROM case_openings WHERE user_id=? ORDER BY opened_at DESC,rowid DESC LIMIT 10').bind(userId)
  ]);
  const fullAccess = wallet.results[0]?.shop_access === 1;
  const level=progression(progress.results[0]?.xp||0);
  const cases=Object.fromEntries(CASES.map(box=>[box.id,Math.max(0,level.earned[box.id]-(used.results.find(row=>row.case_id===box.id)?.used||0))]));
  return { balance: wallet.results[0]?.balance ?? 0, fullAccess, sellable: fullAccess ? [] : items.results.filter(row=>row.sellable&&saleValue(itemById(row.item_id))).map(row=>row.item_id), progression:level, cases, openings:history.results.map(openingResult), owned: fullAccess ? CATALOG.map(item => item.id) : [...CATALOG.filter(item => !item.price).map(item => item.id), ...items.results.map(row => row.item_id)] };
}
export async function sellItem(env,userId,data) {
  const item=itemById(data.item);
  if(!item||!saleValue(item)||typeof data.requestId!=='string'||!/^[a-zA-Z0-9-]{16,80}$/.test(data.requestId))fail('Этот предмет нельзя продать.');
  const read=()=>env.AUTH_DB.prepare('SELECT item_id,credit FROM item_sales WHERE user_id=? AND request_id=?').bind(userId,data.requestId).first();
  const result=row=>{if(row.item_id!==item.id)fail('Этот запрос уже использован.',409);return {itemId:row.item_id,credit:row.credit,requestId:data.requestId};};
  const existing=await read();if(existing)return result(existing);
  if(data.expectedValue!==saleValue(item))fail('Цена продажи изменилась. Откройте подтверждение заново.',409);
  await ensureWallet(env,userId);
  try {
    await env.AUTH_DB.prepare(`INSERT INTO item_sales(user_id,request_id,item_id,item_type,item_value,credit,sold_at)
      SELECT ?,?,?,?,?,?,? WHERE NOT EXISTS(SELECT 1 FROM item_sales WHERE user_id=? AND request_id=?)`)
      .bind(userId,data.requestId,item.id,item.type,item.value,saleValue(item),Math.floor(Date.now()/1000),userId,data.requestId).run();
  } catch(error) {
    if(String(error.message).includes('sale_not_owned'))fail('Этот предмет недоступен для продажи. Обновите инвентарь.',409);
    throw error;
  }
  return result(await read());
}
export async function buyItem() {
  fail('Прямая покупка отключена. Предметы выпадают из кейсов.',410);
}
function openingResult(row){return {requestId:row.request_id,caseId:row.case_id,source:row.source,itemId:row.item_id,rarity:row.rarity,duplicate:!!row.duplicate,compensation:row.duplicate&&row.source!=='access'?row.compensation:0,cost:row.cost,openedAt:row.opened_at};}
const randomUnit=()=>crypto.getRandomValues(new Uint32Array(1))[0]/4294967296;
export async function openCase(env,userId,data){
  const box=caseById(data.caseId);
  if(!box||typeof data.requestId!=='string'||!/^[a-zA-Z0-9-]{16,80}$/.test(data.requestId)||!['coins','reward','access'].includes(data.source))fail('Некорректный запрос кейса.');
  const read=()=>env.AUTH_DB.prepare('SELECT * FROM case_openings WHERE user_id=? AND request_id=?').bind(userId,data.requestId).first();
  const existing=await read();
  if(existing){if(existing.case_id!==box.id||existing.source!==data.source)fail('Этот запрос уже использован.',409);return openingResult(existing);}
  await ensureWallet(env,userId);
  const item=selectCaseItem(box,randomUnit(),randomUnit()),rarity=rarityOf(item);
  try{
    await env.AUTH_DB.prepare(`INSERT INTO case_openings(user_id,request_id,case_id,source,item_id,rarity,cost,compensation,opened_at)
      SELECT ?,?,?,?,?,?,?,?,? WHERE NOT EXISTS(SELECT 1 FROM case_openings WHERE user_id=? AND request_id=?)`)
      .bind(userId,data.requestId,box.id,data.source,item.id,rarity,data.source==='coins'?box.price:0,RARITIES[rarity].duplicate,Math.floor(Date.now()/1000),userId,data.requestId).run();
  }catch(error){
    const message=String(error.message);
    if(message.includes('case_balance'))fail('Недостаточно монет для кейса.',409);
    if(message.includes('case_reward'))fail('Нет наградного кейса этого вида.',409);
    if(message.includes('case_access'))fail('Полный доступ недоступен.',403);
    throw error;
  }
  const row=await read();
  if(row.case_id!==box.id||row.source!==data.source)fail('Этот запрос уже использован.',409);
  return openingResult(row);
}
export async function equipItem(env, userId, itemId, slot = 'resign') {
  const item = itemById(itemId);
  if (!item) fail('Такого предмета нет в коллекции.');
  if (!['resign', 'victory'].includes(slot)) fail('Неизвестный вид анимации.');
  // The column is selected from a fixed enum; ownership is checked by the same UPDATE.
  const column = item.type === 'skin' ? 'piece_skin' : item.type === 'cue' ? 'cue_skin' : item.type === 'ship' ? 'ship_skin' : item.type === 'card' ? 'card_skin' : slot === 'victory' ? 'victory_effect' : 'finish_effect';
  const result = await env.AUTH_DB.prepare(`UPDATE users SET ${column} = ? WHERE id = ?
    AND (shop_access = 1 OR ? = 0 OR EXISTS (SELECT 1 FROM account_items WHERE user_id = ? AND item_id = ?))`)
    .bind(item.value, userId, item.price, userId, item.id).run();
  if (!result.meta.changes) fail('Этот предмет ещё не выпал из кейса.', 403);
}
