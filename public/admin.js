const $ = id => document.getElementById(id);
let offset = 0, query = '', pending = null, busy = false, generation = 0;
const date = value => new Date(value * 1000).toLocaleString('ru-RU');
function el(tag, text, className) { const node = document.createElement(tag); node.textContent = text; if (className) node.className = className; return node; }
async function api(path, data) {
  const response = await fetch('/api/auth/admin' + path, { credentials: 'same-origin', method: data ? 'POST' : 'GET', ...(data ? { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) } : {}), signal: AbortSignal.timeout(20000) });
  const result = await response.json().catch(() => ({ error: 'Сервис временно недоступен.' }));
  if (!response.ok) throw Object.assign(new Error(result.error || 'Не удалось выполнить запрос.'), { status: response.status });
  return result;
}
function render(data) {
  $('total-users').textContent = data.summary.users; $('total-access').textContent = data.summary.full_access;
  $('admin-count').textContent = data.total ? `${offset + 1}–${Math.min(offset + 20, data.total)} из ${data.total}` : 'Никого не найдено';
  $('admin-prev').disabled = offset === 0; $('admin-next').disabled = offset + 20 >= data.total;
  $('admin-users').replaceChildren(...data.users.map(user => {
    const row = el('article', '', 'admin-user'), info = el('div', '', 'admin-user-info');
    info.append(el('h3', user.name), el('p', user.email), el('p', 'Регистрация: ' + date(user.created_at)), el('span', user.is_admin ? 'Администратор' : user.shop_access ? 'Полный доступ' : 'Обычный доступ', 'access-badge'));
    const action = el('button', user.shop_access ? 'Отозвать доступ' : 'Выдать полный доступ', 'secondary-button'); action.disabled = !!user.is_admin;
    if (user.is_admin) action.textContent = 'Защищённый аккаунт';
    action.onclick = () => {
      pending = { user, kind: 'shop' }; $('access-title').textContent = user.shop_access ? 'Отозвать полный доступ?' : 'Выдать полный доступ?';
      $('access-target').textContent = user.name + ' · ' + user.email;
      $('access-description').textContent = user.shop_access ? 'Купленные предметы сохранятся. Оформление, доступное только по привилегии, вернётся к стандартному. Монеты не изменятся.' : 'Игрок сможет выбирать любые нынешние и будущие предметы магазина бесплатно. Админские права не выдаются.';
      $('access-error').textContent = ''; $('access-dialog').showModal();
    };
    const actions = el('div', '', 'admin-user-actions'); actions.append(action);
    if (!user.is_admin) {
      const promote = el('button', 'Назначить администратором', 'secondary-button');
      promote.onclick = () => {
        pending = { user, kind: 'admin' };
        $('access-title').textContent = 'Назначить администратором?';
        $('access-target').textContent = user.name + ' · ' + user.email;
        $('access-description').textContent = 'Игрок получит такие же права, как у вас: доступ к списку аккаунтов и журналу, выдачу и отзыв доступа к магазину, назначение других администраторов. Весь магазин также станет доступен бесплатно. Назначайте только того, кому доверяете. Снять админские права через эту панель пока нельзя.';
        $('access-error').textContent = ''; $('access-dialog').showModal();
      };
      actions.append(promote);
    }
    row.append(info, actions); return row;
  }));
  if (!data.users.length) $('admin-users').append(el('p', 'Игрок не найден. Проверьте почту или попросите его зарегистрироваться.', 'subtle'));
  $('admin-audit').replaceChildren(...data.audit.map(entry => {
    const labels = { grant_shop: 'Выдан полный доступ', revoke_shop: 'Доступ отозван', grant_admin: 'Назначен администратор' };
    const row = el('li', `${labels[entry.action] || 'Изменены права'} · ${entry.target || 'Удалённый аккаунт'}`);
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
    render(data); $('admin-content').hidden = false; $('admin-login').hidden = true; $('admin-status').textContent = message;
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
$('access-confirm').onclick = async () => {
  if (!pending || busy) return;
  busy = true; for (const id of ['access-confirm','access-cancel','access-close']) $(id).disabled = true;
  const { user, kind } = pending;
  try {
    await api(kind === 'admin' ? '/grant-admin' : '/shop-access', kind === 'admin' ? { userId: user.id } : { userId: user.id, enabled: !user.shop_access, expected: !!user.shop_access });
    $('access-dialog').close(); pending = null; await load(`${user.email}: ${kind === 'admin' ? 'назначен администратором' : user.shop_access ? 'доступ отозван' : 'полный доступ выдан'}.`);
  } catch (error) { $('access-error').textContent = error.message; if (error.status === 409) await load(); }
  finally { busy = false; for (const id of ['access-confirm','access-cancel','access-close']) $(id).disabled = false; }
};
window.addEventListener('pageshow', event => { if (event.persisted) load(); });
await load();
