import './account-shell.js';
import { language, setLanguage } from './i18n.js';
const $ = id => document.getElementById(id);
const menu = $('account-menu'), trigger = $('account-button');
const sections = ['appearance', 'language'];
function hideSubmenus() {
  for (const name of sections) { $(name + '-menu').hidden = true; $(name + '-trigger').setAttribute('aria-expanded', 'false'); }
}
export function closeAccountMenu(focus = false) {
  menu.hidden = true; trigger.setAttribute('aria-expanded', 'false'); hideSubmenus();
  if (focus) trigger.focus();
}
function open() { menu.hidden = false; trigger.setAttribute('aria-expanded', 'true'); }
trigger.onclick = () => { if (menu.hidden) open(); else closeAccountMenu(); };
trigger.addEventListener('keydown', event => {
  if (event.key === 'Escape') { event.preventDefault(); closeAccountMenu(true); }
  if (['ArrowDown', 'ArrowUp'].includes(event.key)) { event.preventDefault(); open(); $('menu-profile').focus(); }
});
function submenu(name, focus = false) {
  hideSubmenus(); $(name + '-menu').hidden = false; $(name + '-trigger').setAttribute('aria-expanded', 'true');
  if (focus) $(name + '-menu').querySelector('button:not(.submenu-back)')?.focus();
}
for (const name of sections) {
  $(name + '-trigger').onclick = () => submenu(name, true);
  $(name + '-trigger').parentElement.addEventListener('pointerenter', event => { if (event.pointerType === 'mouse' && !matchMedia('(max-width:560px)').matches) submenu(name); });
  $(name + '-menu').querySelector('.submenu-back').onclick = () => { hideSubmenus(); $(name + '-trigger').focus(); };
}
menu.addEventListener('keydown', event => {
  if (event.key === 'Escape') { event.preventDefault(); closeAccountMenu(true); return; }
  const container = event.target.closest('[role="menu"]');
  if (event.key === 'ArrowLeft' && container !== menu) { event.preventDefault(); const name = container.id.replace('-menu', ''); hideSubmenus(); $(name + '-trigger').focus(); return; }
  if (event.key === 'ArrowRight' && event.target.getAttribute('aria-haspopup') === 'menu') { event.preventDefault(); submenu(event.target.id.replace('-trigger', ''), true); return; }
  if (!['ArrowUp', 'ArrowDown', 'Home', 'End'].includes(event.key)) return;
  const buttons = [...container.querySelectorAll('button')].filter(button => button.closest('[role="menu"]') === container && !button.hidden && button.getClientRects().length);
  let i = buttons.indexOf(document.activeElement);
  i = event.key === 'Home' ? 0 : event.key === 'End' ? buttons.length - 1 : (i + (event.key === 'ArrowDown' ? 1 : -1) + buttons.length) % buttons.length;
  event.preventDefault(); buttons[i]?.focus();
});
document.addEventListener('pointerdown', event => { if (!event.target.closest('.account-anchor')) closeAccountMenu(); });
document.addEventListener('focusin', event => { if (!event.target.closest('.account-anchor')) closeAccountMenu(); });
document.querySelectorAll('[data-language]').forEach(button => { button.onclick = () => { setLanguage(button.dataset.language); closeAccountMenu(true); }; });
function updateLanguage() { document.querySelectorAll('[data-language]').forEach(button => button.setAttribute('aria-checked', String(button.dataset.language === language()))); }
document.addEventListener('languagechange', updateLanguage); updateLanguage();
