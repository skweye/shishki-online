import { closeAccountMenu } from './account-menu.js';
import { t } from './i18n.js';
const $ = id => document.getElementById(id);
export let currentUser = null;
let googleEnabled = false, loading = false, activeTab = 'login';

function notify(message) {
  $('account-notice').textContent = message;
  $('account-notice').hidden = false;
  setTimeout(() => { $('account-notice').hidden = true; }, 6500);
}
function update(user, broadcast = true) {
  currentUser = user;
  $('account-button-label').textContent = user ? user.name : 'Гость';
  $('account-button').setAttribute('aria-label', user ? 'Аккаунт: ' + user.name : 'Профиль гостя и настройки');
  showAvatar($('account-avatar'), user?.avatar, user?.name || t('Гость'));
  $('account-button-label').textContent = user?.name || t('Гость');
  $('menu-identity').textContent = user?.email || t('Гость');
  $('menu-login').hidden = !!user;
  $('profile-title').textContent = user ? 'Настройки профиля' : 'Играйте в своём стиле.';
  for (const id of ['profile-card', 'profile-note', 'profile-form', 'logout-button']) $(id).hidden = !user;
  for (const id of ['guest-profile-note', 'guest-login']) $(id).hidden = !!user;
  $('link-google').hidden = !user || user.googleLinked || !googleEnabled;
  if (user) {
    $('profile-name').value = user.name;
    $('profile-email').textContent = user.email;
    $('profile-method').textContent = user.googleLinked ? user.hasPassword ? 'Вход: Google или пароль' : 'Вход через Google' : 'Вход по почте и паролю';
    $('profile-verification').textContent = user.emailVerified ? 'Почта подтверждена Google.' : 'Почта пока не подтверждена.';
    $('link-google').hidden = user.googleLinked || !googleEnabled;
  }
  if (broadcast) document.dispatchEvent(new CustomEvent('accountchange', { detail: user }));
}
async function request(path, data) {
  const response = await fetch('/api/auth/' + path, {
    method: data === undefined ? 'GET' : 'POST', credentials: 'same-origin',
    ...(data === undefined ? {} : { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) }),
    signal: AbortSignal.timeout(20000)
  });
  let result;
  try { result = await response.json(); } catch { throw new Error('Сервис входа временно недоступен. Попробуйте ещё раз.'); }
  if (!response.ok) throw new Error(result.error || 'Не удалось выполнить вход.');
  return result;
}
function setTab(tab) {
  if (loading) return;
  activeTab = tab;
  $('auth-login-panel').hidden = tab !== 'login';
  $('auth-register-panel').hidden = tab !== 'register';
  for (const name of ['login', 'register']) {
    $('auth-' + name + '-tab').classList.toggle('active', name === tab);
    $('auth-' + name + '-tab').setAttribute('aria-selected', name === tab);
  }
  $('auth-title').textContent = tab === 'login' ? 'С возвращением.' : 'Ваше место за доской.';
  $('auth-description').textContent = tab === 'login' ? 'Войдите, чтобы продолжить игру под своим именем.' : 'Создайте аккаунт — и играйте под своим именем.';
  $('auth-error').textContent = '';
}
export function openAuth() {
  if (currentUser) $('profile-dialog').showModal();
  else { setTab('login'); $('auth-dialog').showModal(); }
}
$('menu-profile').onclick = () => {
  closeAccountMenu(); draftAvatar = currentUser?.avatar || null; $('profile-avatar-file').value = '';
  $('profile-error').textContent = ''; $('profile-name').value = currentUser?.name || '';
  showAvatar($('profile-avatar-preview'), draftAvatar, currentUser?.name); $('profile-dialog').showModal();
};
$('menu-login').onclick = () => { closeAccountMenu(); openAuth(); };
$('guest-login').onclick = () => { $('profile-dialog').close(); openAuth(); };
$('auth-login-tab').onclick = () => setTab('login');
$('auth-register-tab').onclick = () => setTab('register');

for (const type of ['login', 'register']) {
  $('auth-' + type + '-form').addEventListener('submit', async event => {
    event.preventDefault();
    if (loading) return;
    const data = Object.fromEntries(new FormData(event.currentTarget));
    if (type === 'register' && data.password !== data.confirmPassword) {
      $('auth-error').textContent = 'Пароли не совпадают.'; $('register-confirm').focus(); return;
    }
    loading = true; $('auth-error').textContent = '';
    $('auth-dialog').setAttribute('aria-busy', 'true');
    const button = event.submitter, label = button.textContent;
    button.disabled = true; button.textContent = type === 'register' ? 'Создаём аккаунт…' : 'Входим…';
    document.querySelectorAll('.auth-tabs button, #google-signin').forEach(el => { el.disabled = true; });
    try {
      const result = await request(type, data);
      event.currentTarget?.reset();
      $('auth-login-form').reset(); $('auth-register-form').reset();
      $('auth-dialog').close(); update(result.user);
      notify(type === 'register' ? 'Аккаунт создан. Приятной игры!' : 'Вы вошли в аккаунт.');
    } catch (error) { $('auth-error').textContent = error.message; }
    finally {
      loading = false; button.disabled = false; button.textContent = label;
      document.querySelectorAll('.auth-tabs button').forEach(el => { el.disabled = false; });
      $('google-signin').disabled = !googleEnabled; $('auth-dialog').removeAttribute('aria-busy');
    }
  });
}
function google() {
  if (!googleEnabled) return;
  const room = new URL(location.href).searchParams.get('room');
  const returnTo = /^[A-F0-9]{12}$/.test(room || '') ? '/?room=' + room : '/';
  location.assign('/api/auth/google?returnTo=' + encodeURIComponent(returnTo));
}
$('google-signin').onclick = $('link-google').onclick = google;
$('logout-button').onclick = async () => {
  $('logout-button').disabled = true; $('profile-error').textContent = '';
  try { await request('logout', {}); closeAccountMenu(); $('profile-dialog').close(); update(null); notify('Вы вышли из аккаунта.'); }
  catch (error) { notify(error.message); }
  finally { $('logout-button').disabled = false; }
};
document.querySelectorAll('[data-toggle-password]').forEach(button => {
  button.onclick = () => {
    const field = $(button.dataset.togglePassword), visible = field.type === 'password';
    field.type = visible ? 'text' : 'password';
    button.textContent = visible ? 'Скрыть' : 'Показать';
    button.setAttribute('aria-label', visible ? 'Скрыть пароль' : 'Показать пароль');
  };
});
// Cross-tab sign-outs are detected without exposing the session cookie to JS.
window.addEventListener('focus', () => {
  request('session').then(data => {
    if (JSON.stringify(data.user) !== JSON.stringify(currentUser)) update(data.user);
  }).catch(() => {});
});
let draftAvatar = null, avatarVersion = 0;
function showAvatar(element, source, name = '') {
  element.replaceChildren();
  if (source) { const image = document.createElement('img'); image.src = source; image.alt = ''; element.append(image); }
  else element.textContent = name.slice(0, 1).toUpperCase() || '◉';
}
$('avatar-remove').onclick = () => { avatarVersion++; draftAvatar = null; $('profile-avatar-file').value = ''; $('profile-save').disabled = false; showAvatar($('profile-avatar-preview'), null, $('profile-name').value); };
$('profile-avatar-file').onchange = async event => {
  const file = event.target.files[0], version = ++avatarVersion;
  if (!file) return;
  $('profile-error').textContent = ''; $('profile-save').disabled = true;
  try {
    if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type) || file.size > 5 * 1024 * 1024) throw new Error('Выберите PNG, JPEG или WebP до 5 МБ.');
    const bitmap = await createImageBitmap(file);
    try {
      const canvas = document.createElement('canvas'); canvas.width = canvas.height = 256;
      const context = canvas.getContext('2d'), size = Math.min(bitmap.width, bitmap.height);
      context.drawImage(bitmap, (bitmap.width-size)/2, (bitmap.height-size)/2, size, size, 0, 0, 256, 256);
      if (version !== avatarVersion) return;
      const candidate = canvas.toDataURL('image/webp', .82);
      if (candidate.length > 100000) throw new Error('Аватар слишком большой. Выберите другое изображение.');
      draftAvatar = candidate;
      showAvatar($('profile-avatar-preview'), draftAvatar, $('profile-name').value);
    } finally { bitmap.close(); }
  } catch (error) { if (version === avatarVersion) $('profile-error').textContent = error.message; }
  finally { if (version === avatarVersion) $('profile-save').disabled = false; }
};
$('profile-dialog').addEventListener('close', () => { avatarVersion++; $('profile-save').disabled = false; });
$('profile-form').onsubmit = async event => {
  event.preventDefault(); if ($('profile-save').disabled) return;
  $('profile-save').disabled = true; $('profile-error').textContent = '';
  try {
    const result = await request('profile', { name: $('profile-name').value.trim(), avatar: draftAvatar });
    update(result.user); $('profile-dialog').close(); notify('Профиль сохранён.');
  } catch (error) { $('profile-error').textContent = error.message; }
  finally { $('profile-save').disabled = false; }
};
document.addEventListener('languagechange', () => { if (!currentUser) { $('account-button-label').textContent = t('Гость'); $('menu-identity').textContent = t('Гость'); } });
update(null, false);
export const authReady = request('session').then(data => {
  googleEnabled = data.googleEnabled; update(data.user, false);
  $('google-signin').disabled = !googleEnabled;
  $('google-unavailable').hidden = googleEnabled;
}).catch(() => {
  $('auth-error').textContent = 'Сервис аккаунтов временно недоступен. Вы можете играть как гость.';
});
const url = new URL(location.href), authError = url.searchParams.get('auth_error');
if (authError) {
  const errors = {
    google_unavailable: 'Вход через Google ещё не подключён. Пока используйте почту и пароль.',
    google_state: 'Время ожидания входа истекло. Попробуйте ещё раз.',
    google_cancelled: 'Вход через Google отменён.',
    google_existing: 'Эта почта уже зарегистрирована. Войдите по паролю и подключите Google в своём профиле.',
    google_link: 'Для подключения выберите Google-аккаунт с той же почтой, что в профиле.',
    google_failed: 'Не удалось завершить вход через Google. Попробуйте ещё раз.'
  };
  url.searchParams.delete('auth_error'); history.replaceState(null, '', url);
  authReady.then(() => { setTab('login'); $('auth-dialog').showModal(); $('auth-error').textContent = errors[authError] || errors.google_failed; });
}
