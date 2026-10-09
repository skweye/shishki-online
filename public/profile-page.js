const $ = id => document.getElementById(id);
const modes = [
  ['russian', 'Русские шашки', 'Классическая доска 8 × 8', '▦'],
  ['russian12', 'Русские шашки 12 × 12', 'Большая доска', '▦'],
  ['chapaev', 'Шашки Чапаева', 'Победа во всём матче', '↗'],
  ['chess', 'Шахматы', 'Доска 8 × 8', '♞'],
  ['narde', 'Длинные нарды', '24 пункта · По 15 фишек', '⚄']
];
let user = null, draftAvatar = null, avatarVersion = 0, deleting = false;
async function request(path, data) {
  const response = await fetch('/api/auth/' + path, {
    method: data === undefined ? 'GET' : 'POST', credentials: 'same-origin',
    ...(data === undefined ? {} : { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) }),
    signal: AbortSignal.timeout(20000)
  });
  const result = await response.json().catch(() => ({ error: 'Сервис временно недоступен. Попробуйте ещё раз.' }));
  if (!response.ok) throw Object.assign(new Error(result.error || 'Не удалось выполнить запрос.'), { status: response.status });
  return result;
}
function element(tag, text, className) {
  const el = document.createElement(tag); el.textContent = text;
  if (className) el.className = className;
  return el;
}
function avatar(target, source, name) {
  target.replaceChildren();
  if (source) { const img = document.createElement('img'); img.src = source; img.alt = ''; target.append(img); }
  else target.textContent = name.slice(0, 1).toUpperCase();
}
function feedback(id, message, error = false) { $(id).textContent = message; $(id).dataset.error = String(error); }
function showUser(value) {
  user = value; draftAvatar = value.avatar;
  $('hero-name').textContent = user.name;
  $('member-since').textContent = 'За доской с ' + new Date(user.createdAt * 1000).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' });
  $('nickname').value = user.name;
  $('account-email').textContent = user.email;
  $('account-method').textContent = user.googleLinked ? user.hasPassword ? 'Вход через Google или по паролю' : 'Вход через Google' : 'Вход по почте и паролю';
  $('account-verification').textContent = user.emailVerified ? 'Почта подтверждена Google.' : 'Почта пока не подтверждена.';
  avatar($('hero-avatar'), user.avatar, user.name); avatar($('edit-avatar'), user.avatar, user.name);
}
function showStats(data) {
  const totals = data.modes.reduce((sum, row) => {
    for (const key of ['played', 'wins', 'losses', 'draws']) sum[key] += Number(row[key]);
    return sum;
  }, { played: 0, wins: 0, losses: 0, draws: 0 });
  for (const key of ['played', 'wins', 'losses', 'draws']) $('stat-' + key).textContent = totals[key].toLocaleString('ru-RU');
  $('stat-rate').textContent = totals.played ? Math.round(totals.wins / totals.played * 100) + '%' : '—';
  $('mode-stats').replaceChildren(...modes.map(([id, name, description, symbol]) => {
    const row = data.modes.find(row => row.variant === id) || { played: 0, wins: 0, losses: 0, draws: 0 };
    const container = element('div', '', 'mode-row'), title = element('span', name, 'mode-name');
    title.append(element('small', description));
    const counts = element('span', `${row.played} / ${row.wins} / ${row.losses} / ${row.draws}`, 'mode-counts');
    counts.setAttribute('aria-label', `${row.played} игр, ${row.wins} побед, ${row.losses} поражений, ${row.draws} ничьих`);
    container.append(element('span', symbol, 'mode-symbol'), title, counts); return container;
  }));
  $('recent-empty').hidden = data.recent.length > 0;
  $('recent-games').replaceChildren(...data.recent.map(game => {
    const item = element('li', '', 'recent-game'), details = document.createElement('div');
    details.append(element('strong', modes.find(([id]) => id === game.variant)?.[1] || game.variant));
    const date = new Date(game.finished_at * 1000).toLocaleString('ru-RU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
    details.append(element('small', `${date} · ${game.variant === 'chapaev' ? 'Ударов' : 'Ходов'}: ${game.moves}${game.coins ? ' · +' + game.coins + ' ◈' : ''}`));
    const badge = element('span', { win: 'Победа', loss: 'Поражение', draw: 'Ничья' }[game.result], 'result-badge');
    badge.dataset.result = game.result; item.append(details, badge); return item;
  }));
}
async function load() {
  $('retry').hidden = true; $('sign-in').hidden = true;
  $('state-title').textContent = 'Загружаем профиль…';
  try {
    const data = await request('account');
    showUser(data.user); showStats(data);
    $('profile-coins').textContent = data.shop.balance.toLocaleString('ru-RU');
    $('connect-google').hidden = user.googleLinked || !data.googleEnabled;
    $('page-state').hidden = true; $('account-content').hidden = false;
  } catch (error) {
    $('account-content').hidden = true; $('page-state').hidden = false;
    $('state-title').textContent = error.status === 401 ? 'Ваша история ждёт вас' : 'Не удалось загрузить профиль';
    $('state-description').textContent = error.status === 401 ? 'Войдите, чтобы настроить профиль и следить за своими результатами.' : error.message;
    $('sign-in').hidden = error.status !== 401; $('retry').hidden = error.status === 401;
  }
}
$('retry').onclick = load;
$('remove-avatar').onclick = () => {
  avatarVersion++; draftAvatar = null; $('avatar-file').value = ''; $('save-profile').disabled = false;
  avatar($('edit-avatar'), null, $('nickname').value);
};
$('avatar-file').onchange = async event => {
  const file = event.target.files[0], version = ++avatarVersion;
  if (!file) return;
  $('save-profile').disabled = true; feedback('edit-status', '');
  try {
    if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type) || file.size > 5 * 1024 * 1024) throw new Error('Выберите PNG, JPEG или WebP до 5 МБ.');
    const bitmap = await createImageBitmap(file);
    try {
      const canvas = document.createElement('canvas'); canvas.width = canvas.height = 256;
      const size = Math.min(bitmap.width, bitmap.height);
      canvas.getContext('2d').drawImage(bitmap, (bitmap.width - size) / 2, (bitmap.height - size) / 2, size, size, 0, 0, 256, 256);
      if (version !== avatarVersion) return;
      const candidate = canvas.toDataURL('image/webp', .82);
      if (candidate.length > 100000) throw new Error('Аватар слишком большой. Выберите другое изображение.');
      draftAvatar = candidate; avatar($('edit-avatar'), draftAvatar, $('nickname').value);
    } finally { bitmap.close(); }
  } catch (error) { if (version === avatarVersion) feedback('edit-status', error.message, true); }
  finally { if (version === avatarVersion) $('save-profile').disabled = false; }
};
$('edit-profile').onsubmit = async event => {
  event.preventDefault();
  if ($('save-profile').disabled || $('edit-fields').disabled) return;
  $('edit-fields').disabled = true; feedback('edit-status', 'Сохраняем…');
  try {
    const data = await request('profile', { name: $('nickname').value.trim(), avatar: draftAvatar });
    showUser(data.user); feedback('edit-status', 'Изменения сохранены.');
  } catch (error) { feedback('edit-status', error.message, true); }
  finally { $('edit-fields').disabled = false; }
};
$('sign-out').onclick = async () => {
  $('sign-out').disabled = true;
  try { await request('logout', {}); location.assign('/'); }
  catch (error) { feedback('logout-error', error.message, true); $('sign-out').disabled = false; }
};
$('open-delete').onclick = () => {
  if (!user) return;
  $('delete-form').reset(); feedback('delete-error', '');
  $('password-confirmation').hidden = !user.hasPassword;
  $('delete-password').required = user.hasPassword;
  $('delete-dialog').showModal(); $('delete-email').focus();
};
function cancelDelete() { if (!deleting) { $('delete-dialog').close(); $('delete-form').reset(); } }
$('cancel-delete').onclick = $('cancel-delete-icon').onclick = cancelDelete;
$('delete-dialog').addEventListener('cancel', event => { if (deleting) event.preventDefault(); });
$('delete-form').onsubmit = async event => {
  event.preventDefault(); if (deleting) return;
  if ($('delete-email').value.trim().toLowerCase() !== user.email.toLowerCase()) { feedback('delete-error', 'Введите почту именно этого аккаунта.', true); return; }
  const data = Object.fromEntries(new FormData(event.currentTarget));
  deleting = true; $('delete-fields').disabled = true; $('cancel-delete-icon').disabled = true;
  feedback('delete-error', 'Удаляем аккаунт…');
  try {
    await request('delete-account', data);
    $('delete-form').reset(); $('delete-dialog').close();
    user = null; draftAvatar = null; $('account-content').hidden = true; $('account-content').replaceChildren();
    $('page-state').hidden = false; $('sign-in').hidden = true; $('retry').hidden = true;
    $('state-title').textContent = 'Аккаунт удалён';
    $('state-description').textContent = 'Профиль и личная статистика удалены, все сеансы завершены. Вы по-прежнему можете играть как гость — перейдите к игре.';
  } catch (error) { feedback('delete-error', error.message, true); }
  finally { deleting = false; $('delete-fields').disabled = false; $('cancel-delete-icon').disabled = false; }
};
// Recheck sessions restored from the browser's back/forward cache.
window.addEventListener('pageshow', event => { if (event.persisted) location.reload(); });
await load();
