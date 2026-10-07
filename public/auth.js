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
  $('account-button-label').textContent = user ? user.name : 'Войти';
  $('account-button').setAttribute('aria-label', user ? 'Аккаунт: ' + user.name : 'Войти или зарегистрироваться');
  $('account-avatar').textContent = user ? user.name.slice(0, 1).toUpperCase() : '↗';
  if (user) {
    $('profile-name').textContent = user.name;
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
$('account-button').onclick = openAuth;
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
  try { await request('logout', {}); $('profile-dialog').close(); update(null); notify('Вы вышли из аккаунта.'); }
  catch (error) { $('profile-error').textContent = error.message; }
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
    if (data.user?.id !== currentUser?.id) update(data.user);
  }).catch(() => {});
});
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
