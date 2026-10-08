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
  $('logout-button').hidden = !user;
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
  if (currentUser) location.assign('/profile');
  else { setTab('login'); $('auth-dialog').showModal(); }
}
$('menu-profile').onclick = () => {
  closeAccountMenu(); location.assign('/profile');
};
$('menu-shop').onclick = () => { closeAccountMenu(); location.assign('/shop'); };
$('menu-login').onclick = () => { closeAccountMenu(); openAuth(); };
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
      const destination = new URL(location.href).searchParams.get('returnTo');
      if (['profile', 'shop'].includes(destination)) { location.assign('/' + destination); return; }
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
  const destination = new URL(location.href).searchParams.get('returnTo');
  const returnTo = ['profile', 'shop'].includes(destination) ? '/' + destination : /^[A-F0-9]{12}$/.test(room || '') ? '/?room=' + room : '/';
  location.assign('/api/auth/google?returnTo=' + encodeURIComponent(returnTo));
}
$('google-signin').onclick = google;
$('logout-button').onclick = async () => {
  $('logout-button').disabled = true;
  try { await request('logout', {}); closeAccountMenu(); update(null); notify('Вы вышли из аккаунта.'); }
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

function showAvatar(element, source, name = '') {
  element.replaceChildren();
  if (source) { const image = document.createElement('img'); image.src = source; image.alt = ''; element.append(image); }
  else element.textContent = name.slice(0, 1).toUpperCase() || '◉';
}
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
if (url.searchParams.get('login') === '1' && !authError) authReady.then(() => {
  if (currentUser && ['profile', 'shop'].includes(url.searchParams.get('returnTo'))) location.assign('/' + url.searchParams.get('returnTo'));
  else openAuth();
});
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
