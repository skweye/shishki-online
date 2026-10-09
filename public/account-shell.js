// Shared account controls for every page. Markup contains no user data.
export const accountMarkup = `<div class="account-anchor"><button class="account-button" id="account-button" aria-haspopup="menu" aria-expanded="false" aria-controls="account-menu" aria-label="Войти или зарегистрироваться"><span class="account-avatar" id="account-avatar" aria-hidden="true">↗</span><span id="account-button-label" data-no-translate>Войти</span></button><div class="account-menu" id="account-menu" hidden role="menu" aria-label="Меню аккаунта">
  <div class="menu-identity" id="menu-identity" data-no-translate>Гость</div>
  <button role="menuitem" id="menu-profile">Профиль</button>
  <button role="menuitem" id="menu-admin" hidden>Админ-панель</button>
  <button role="menuitem" id="menu-shop">Магазин и коллекция</button>
  <div class="submenu-row"><button role="menuitem" id="appearance-trigger" aria-haspopup="menu" aria-expanded="false" aria-controls="appearance-menu">Оформление <span aria-hidden="true">›</span></button>
    <div class="account-submenu" id="appearance-menu" hidden role="menu" aria-label="Оформление"><button class="submenu-back" role="menuitem">← Назад</button><div id="theme-options"></div></div></div>
  <div class="submenu-row"><button role="menuitem" id="language-trigger" aria-haspopup="menu" aria-expanded="false" aria-controls="language-menu">Язык <span aria-hidden="true">›</span></button>
    <div class="account-submenu" id="language-menu" hidden role="menu" aria-label="Язык"><button class="submenu-back" role="menuitem">← Назад</button><button role="menuitemradio" data-language="ru" lang="ru" data-no-translate>Русский <span class="menu-check">✓</span></button><button role="menuitemradio" data-language="en" lang="en" data-no-translate>English <span class="menu-check">✓</span></button><button role="menuitemradio" data-language="uk" lang="uk" data-no-translate>Українська <span class="menu-check">✓</span></button></div></div>
  <button role="menuitem" id="settings-button"><span aria-hidden="true">⚙</span> Настройки</button>
  <div class="menu-bottom"><button role="menuitem" id="menu-login">Войти в аккаунт</button><button role="menuitem" id="logout-button" class="menu-logout" hidden>Выйти из аккаунта</button></div>
</div></div>`;
export const accountDialogs = `<dialog id="auth-dialog" class="auth-dialog" aria-labelledby="auth-title" aria-describedby="auth-description">
    <div class="dialog-heading"><div><div class="eyebrow">ВАША ИГРА. ВАШ АККАУНТ.</div><h2 id="auth-title">С возвращением.</h2></div><button class="icon-button" data-close="auth-dialog" aria-label="Закрыть вход">×</button></div>
    <p id="auth-description" class="helper-text">Войдите, чтобы продолжить игру под своим именем.</p>
    <div class="auth-tabs" role="tablist" aria-label="Вход или регистрация"><button id="auth-login-tab" class="active" role="tab" aria-selected="true" aria-controls="auth-login-panel">Вход</button><button id="auth-register-tab" role="tab" aria-selected="false" aria-controls="auth-register-panel">Регистрация</button></div>
    <button id="google-signin" class="google-button" disabled><svg aria-hidden="true" viewBox="0 0 24 24"><path fill="#4285F4" d="M21.6 12.23c0-.71-.06-1.39-.18-2.05H12v3.88h5.38a4.6 4.6 0 0 1-1.99 3.02v2.51h3.22c1.88-1.73 2.99-4.28 2.99-7.36Z"/><path fill="#34A853" d="M12 22c2.7 0 4.96-.9 6.61-2.41l-3.22-2.51c-.9.6-2.04.96-3.39.96-2.6 0-4.8-1.76-5.59-4.13H3.09v2.59A10 10 0 0 0 12 22Z"/><path fill="#FBBC05" d="M6.41 13.91a6 6 0 0 1 0-3.82V7.5H3.09a10 10 0 0 0 0 9l3.32-2.59Z"/><path fill="#EA4335" d="M12 5.96c1.47 0 2.79.51 3.82 1.51l2.86-2.86A9.6 9.6 0 0 0 12 2a10 10 0 0 0-8.91 5.5l3.32 2.59C7.2 7.72 9.4 5.96 12 5.96Z"/></svg>Продолжить с Google</button>
    <p id="google-unavailable" hidden>Вход через Google пока не подключён. Используйте почту и пароль.</p>
    <div class="auth-divider">или по почте</div>
    <section id="auth-login-panel" role="tabpanel" aria-labelledby="auth-login-tab"><form id="auth-login-form">
      <label for="login-email">Почта</label><input id="login-email" name="email" type="email" autocomplete="username" inputmode="email" maxlength="254" placeholder="you@example.com" required>
      <label for="login-password">Пароль</label><div class="password-field"><input id="login-password" name="password" type="password" autocomplete="current-password" maxlength="128" placeholder="Ваш пароль" required><button type="button" data-toggle-password="login-password" aria-label="Показать пароль">Показать</button></div>
      <button class="primary-button" type="submit">Войти в аккаунт ↗</button>
    </form></section>
    <section id="auth-register-panel" role="tabpanel" aria-labelledby="auth-register-tab" hidden><form id="auth-register-form">
      <label for="register-name">Имя</label><input id="register-name" name="name" type="text" autocomplete="nickname" minlength="2" maxlength="40" placeholder="Как вас называть за доской?" required>
      <label for="register-email">Почта</label><input id="register-email" name="email" type="email" autocomplete="username" inputmode="email" maxlength="254" placeholder="you@example.com" required>
      <label for="register-password">Пароль</label><div class="password-field"><input id="register-password" name="password" type="password" autocomplete="new-password" minlength="12" maxlength="128" aria-describedby="password-hint" required><button type="button" data-toggle-password="register-password" aria-label="Показать пароль">Показать</button></div><p id="password-hint" class="auth-password-hint">От 12 символов. Можно использовать длинную фразу.</p>
      <label for="register-confirm">Подтверждение пароля</label><div class="password-field"><input id="register-confirm" name="confirmPassword" type="password" autocomplete="new-password" minlength="12" maxlength="128" required><button type="button" data-toggle-password="register-confirm" aria-label="Показать пароль">Показать</button></div>
      <button class="primary-button" type="submit">Создать аккаунт ↗</button>
    </form></section>
    <p id="auth-error" class="form-error" role="alert"></p>
    <p class="auth-footer">Имя видно сопернику, почта — только вам.<br><a href="/privacy">Конфиденциальность</a> · <a href="/terms">Условия использования</a><br>Играть без аккаунта тоже можно.</p>
  </dialog>
<dialog id="settings-dialog" class="settings-dialog" aria-labelledby="settings-title"><div class="dialog-heading"><div><div class="eyebrow">ВАША ИГРА. ВАШ КОМФОРТ.</div><h2 id="settings-title">Настройки</h2></div><button class="icon-button" data-close="settings-dialog" aria-label="Закрыть настройки">×</button></div>
    <section class="settings-section" aria-labelledby="performance-title"><h3 id="performance-title">Производительность</h3><label class="sound-toggle" for="low-performance"><span>Режим для слабых устройств<small>Статичный фон, без размытия и тяжёлых эффектов. Шары рисуются проще, анимации ударов сохраняются.</small></span><input type="checkbox" id="low-performance" role="switch"></label></section>
    <section class="settings-section" aria-labelledby="sound-title"><h3 id="sound-title">Звуки игры</h3><label class="sound-toggle" for="sound-enabled"><span>Ходы, взятия и результат партии<small>Мягкий стук шашек и короткие мелодии</small></span><input type="checkbox" id="sound-enabled" role="switch" checked></label><div class="volume-heading"><label for="sound-volume">Громкость</label><output id="sound-volume-value" for="sound-volume">35%</output></div><input id="sound-volume" type="range" min="0" max="100" step="1" value="35"><label class="sound-pack-label" for="sound-pack">Звучание</label><select id="sound-pack"><option value="wood">Мягкое дерево</option><option value="felt">Тихий фетр</option><option value="glass">Стеклянные ноты</option><option value="retro">Тёплое ретро</option></select><button id="sound-preview" class="text-button">▷ Послушать звуки</button></section>
<p class="settings-note">Настройки сохраняются в этом браузере.</p><button class="text-button settings-back" id="settings-back">Готово</button>
  </dialog>
<div id="account-notice" class="toast" role="status" hidden></div>`;
export function mountAccountShell(doc = document) {
  if (doc.getElementById('account-button')) return;
  const header = doc.querySelector('.site-header');
  if (!header) return;
  let actions = header.querySelector('.header-actions');
  if (!actions) { actions = doc.createElement('div'); actions.className = 'header-actions'; header.append(actions); }
  actions.insertAdjacentHTML('beforeend', accountMarkup);
  doc.body.insertAdjacentHTML('beforeend', accountDialogs);
}
if (typeof document !== 'undefined') mountAccountShell();
