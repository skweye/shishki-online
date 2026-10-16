import { ADMIN_LEVELS, canManage, canSetLevel } from './admin-levels.js';
import { t } from './i18n.js';
import { syncAccount } from './auth.js';
const $ = id => document.getElementById(id);
let offset = 0, query = '', pending = null, busy = false, generation = 0, actor = null;
const date = value => new Date(value * 1000).toLocaleString('ru-RU');
function el(tag, text, className) { const node = document.createElement(tag); node.textContent = text; if (className) node.className = className; return node; }
async function api(path, data) {
  const response = await fetch('/api/auth/admin' + path, { credentials: 'same-origin', method: data ? 'POST' : 'GET', ...(data ? { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) } : {}), signal: AbortSignal.timeout(20000) });
  const result = await response.json().catch(() => ({ error: 'Сервис временно недоступен.' }));
  if (!response.ok) throw Object.assign(new Error(result.error || 'Не удалось выполнить запрос.'), { status: response.status });
  return result;
}
function render(data) {
  actor=data.actor;$('admin-role').textContent=t('Ваш уровень')+': '+actor.admin_level+' · '+t(ADMIN_LEVELS[actor.admin_level]);
  $('total-users').textContent = data.summary.users; $('total-access').textContent = data.summary.full_access;
  $('admin-count').textContent = data.total ? `${offset + 1}–${Math.min(offset + 20, data.total)} из ${data.total}` : 'Никого не найдено';
  $('admin-prev').disabled = offset === 0; $('admin-next').disabled = offset + 20 >= data.total;
  $('admin-users').replaceChildren(...data.users.map(user => {
    const row = el('article', '', 'admin-user'), info = el('div', '', 'admin-user-info');
    info.append(el('h3', user.name), el('p', user.email), el('p', t('Регистрация')+': ' + date(user.created_at)),el('p',t('Монеты')+': '+user.balance.toLocaleString()),el('span',user.admin_level+' · '+t(ADMIN_LEVELS[user.admin_level]),'access-badge'));
    const actions=el('div','','admin-user-actions');
    if(canManage(actor,user)){
      const access=el('button',t(user.shop_access?'Отозвать доступ':'Выдать полный доступ'),'secondary-button');access.onclick=()=>begin(user,'shop');
      const coins=el('button',t('Выдать монеты'),'secondary-button');coins.onclick=()=>begin(user,'coins');actions.append(access,coins);
    }
    if(canSetLevel(actor,user)){const level=el('button',t('Изменить уровень'),'secondary-button');level.onclick=()=>begin(user,'level');actions.append(level);}
    if(!actions.children.length)actions.append(el('span',t('Только просмотр'),'subtle'));
    row.append(info, actions); return row;
  }));
  if (!data.users.length) $('admin-users').append(el('p', 'Игрок не найден. Проверьте почту или попросите его зарегистрироваться.', 'subtle'));
  $('admin-audit').replaceChildren(...data.audit.map(entry => {
    const labels = { grant_shop: 'Выдан полный доступ', revoke_shop: 'Доступ отозван', grant_admin: 'Назначен администратор', set_level:'Изменён уровень',grant_coins:'Выданы монеты' };
    const row = el('li', `${t(labels[entry.action] || 'Изменены права')}${entry.action==='set_level'?' '+entry.from_level+' → '+entry.to_level:entry.action==='grant_coins'?' +'+entry.amount+' ◈':''} · ${entry.target || t('Удалённый аккаунт')}`);
    row.append(el('small', `${date(entry.created_at)} · ${entry.actor || 'Удалённый администратор'}`)); return row;
  }));
  if (!data.audit.length) $('admin-audit').append(el('li', 'Изменений пока нет.'));
}
async function load(message = '') {
  const token = ++generation;
  $('admin-status').textContent = 'Загружаем…'; $('admin-retry').hidden = true;
  // Hide stale rows until the new search is complete.
  $('admin-users').replaceChildren(); $('admin-prev').disabled = $('admin-next').disabled = true;
  try {
    const data = await api('?' + new URLSearchParams({ q: query, offset })); if (token !== generation) return;
    render(data); restorePending(); $('admin-content').hidden = false; $('admin-login').hidden = true; $('admin-status').textContent = message;
  } catch (error) {
    if (token !== generation) return;
    $('admin-content').hidden = true; $('admin-status').textContent = error.message;
    $('admin-login').hidden = error.status !== 401; $('admin-retry').hidden = [401,403].includes(error.status);
  }
}
$('admin-search').onsubmit = event => { event.preventDefault(); query = $('admin-query').value.trim(); offset = 0; load(); };
$('admin-prev').onclick = () => { offset = Math.max(0, offset - 20); load(); };
$('admin-next').onclick = () => { offset += 20; load(); };
$('admin-retry').onclick = () => load();
function close() { if (!busy) { $('access-dialog').close(); pending = null; } }
$('access-close').onclick = $('access-cancel').onclick = close;
$('access-dialog').addEventListener('cancel', event => { if (busy) event.preventDefault(); });
const storageKey=()=>`shishki-admin-coins-${actor?.id}`;
function savePending(value){try{if(value)localStorage.setItem(storageKey(),JSON.stringify(value));else localStorage.removeItem(storageKey());}catch{}}
function restorePending(){if(pending||busy)return;try{const saved=JSON.parse(localStorage.getItem(storageKey()));if(saved?.kind==='coins'&&saved.payload)begin(saved.user,'coins',saved);}catch{}}
function begin(user,kind,saved){
  if(!saved){try{const old=JSON.parse(localStorage.getItem(storageKey()));if(old?.payload){begin(old.user,'coins',old);return;}}catch{}}
  pending=saved||{user,kind};$('access-target').textContent=user.name+' · '+user.email;
  $('level-fields').hidden=kind!=='level';$('coin-fields').hidden=kind!=='coins';
  $('admin-level').replaceChildren(...ADMIN_LEVELS.map((name,level)=>{const option=el('option',level+' · '+t(name));option.value=level;return option;}));$('admin-level').value=user.admin_level;
  $('admin-coins').value=saved?.payload?.amount||100;$('admin-coins').disabled=!!saved;
  $('access-title').textContent=t(kind==='coins'?'Выдать монеты':kind==='level'?'Изменить уровень':user.shop_access?'Отозвать полный доступ?':'Выдать полный доступ?');
  $('access-description').textContent=t(kind==='coins'?'Монеты добавятся к текущему балансу. Повтор запроса не начисляет их повторно.':kind==='level'?'Главный администратор управляет младшими уровнями и собой. Понижение своего уровня сразу ограничит ваши права. Уровень 0 снимает админские права и полный доступ; коллекция сохраняется.':user.shop_access?'Предметы коллекции сохранятся. Оформление по привилегии вернётся к стандартному. Монеты не изменятся.':'Игрок сможет выбирать все предметы магазина бесплатно. Админские права не выдаются.');
  $('access-error').textContent=saved?t('Есть незавершённая выдача. Повторите запрос для получения результата без повторного начисления.'):'';
  $('access-dialog').showModal();
}
$('access-confirm').onclick = async () => {
  if(!pending||busy)return;
  const {user,kind}=pending;
  let payload;
  if(kind==='coins'){
    const amount=Number($('admin-coins').value);
    if(!Number.isInteger(amount)||amount<1||amount>1000000){$('access-error').textContent=t('Укажите от 1 до 1000000 целых монет.');return;}
    payload=pending.payload||{userId:user.id,amount,requestId:crypto.randomUUID()};pending.payload=payload;savePending(pending);$('admin-coins').disabled=true;
  }else if(kind==='level'){
    payload={userId:user.id,level:Number($('admin-level').value),expected:user.admin_level};
    if(payload.level===payload.expected){$('access-error').textContent=t('Выберите другой уровень.');return;}
  }else payload={userId:user.id,enabled:!user.shop_access,expected:!!user.shop_access};
  busy=true;for(const id of ['access-confirm','access-cancel','access-close','admin-level'])$(id).disabled=true;
  try{
    const response=await api(kind==='coins'?'/coins':kind==='level'?'/level':'/shop-access',payload);
    if(response.user)syncAccount(response.user);
    if(kind==='coins')savePending(null);
    $('access-dialog').close();pending=null;await load(t('Изменения сохранены.'));
  }catch(error){
    $('access-error').textContent=t(error.message);
    if(error.status&&error.status<500){if(kind==='coins'){savePending(null);delete pending.payload;$('admin-coins').disabled=false;}if(error.status===409)await load();}
  }finally{busy=false;for(const id of ['access-confirm','access-cancel','access-close','admin-level'])$(id).disabled=false;}
};
window.addEventListener('pageshow', event => { if (event.persisted) load(); });
await load();
