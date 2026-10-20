import { t } from './i18n.js';

const paths = {
  expand: 'M8 3H3v5m13-5h5v5M3 16v5h5m13-5v5h-5',
  collapse: 'M3 8h5V3m8 0v5h5M8 21v-5H3m13 5v-5h5',
  controls: 'M4 7h16M4 17h16M8 4v6m8 4v6',
  history: 'M9 5h11M9 12h11M9 19h11M4 5h.01M4 12h.01M4 19h.01',
  chat: 'M21 11a8 8 0 0 1-8 8H7l-4 3V7a4 4 0 0 1 4-4h10a4 4 0 0 1 4 4v4ZM7 8h10M7 12h6',
  panels: 'M3 4h18v16H3ZM14 4v16M14 10h7',
  close: 'm6 6 12 12M18 6 6 18'
};
const icon = name => `<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="${paths[name]}"/></svg>`;

// Keep square cells and canvas coordinates intact; only resize their container.
export function wideBoardWidth(variant, width, height, portrait = false) {
  if (!Number.isFinite(width) || !Number.isFinite(height)) return 0;
  width = Math.max(0, width); height = Math.max(0, height);
  if (variant === 'pool8') return Math.min(width, Math.max(0, height - 10) * (portrait ? 660 / 1200 : 1200 / 660) + 10);
  if (variant === 'narde') return Math.min(width, Math.max(0, height - 90) * 1.17 + 40);
  if (['russian', 'russian12', 'chess', 'chapaev'].includes(variant)) return Math.min(width, height);
  return Math.min(width, 1440);
}

export function createWideMode({ matchUI, sound = () => {}, doc = document, view = window }) {
  const $ = id => doc.getElementById(id), screen = $('game-screen');
  const play = screen.querySelector('.play-area'), frame = screen.querySelector('.board-frame');
  const sidebar = screen.querySelector('.match-sidebar'), poolTools = screen.querySelector('.pool-console');
  const button = (id, label, symbol) => {
    const node = doc.createElement('button');
    node.id = id; node.type = 'button'; node.className = 'wide-button';
    node.innerHTML = `<span aria-hidden="true">${icon(symbol)}</span><span class="wide-label"></span>`;
    node.querySelector('.wide-label').textContent = t(label);
    node.setAttribute('aria-label', t(label)); return node;
  };
  const expand = button('wide-toggle', 'Широкоэкранный режим', 'expand');
  expand.classList.add('wide-expand'); expand.setAttribute('aria-pressed', 'false');
  screen.querySelector('.match-menu-anchor').before(expand);
  const surface = doc.createElement('div'); surface.id = 'wide-surface'; surface.hidden = true; play.append(surface);
  const tools = doc.createElement('section'); tools.id = 'wide-tools'; tools.className = 'wide-overlay'; tools.hidden = true;
  tools.setAttribute('aria-labelledby', 'wide-tools-title');
  tools.innerHTML = '<header class="wide-panel-heading"><h2 id="wide-tools-title">Управление игрой</h2></header><div id="wide-tools-body"></div>';
  const closeTools = button('wide-tools-close', 'Скрыть панель', 'close');
  closeTools.classList.add('wide-icon'); tools.firstElementChild.append(closeTools); screen.append(tools);
  sidebar.id = 'match-sidebar';
  const closeSidebar = button('wide-sidebar-close', 'Скрыть панель', 'close');
  closeSidebar.classList.add('wide-icon'); closeSidebar.hidden = true; sidebar.prepend(closeSidebar);
  const dock = doc.createElement('nav'); dock.id = 'wide-dock'; dock.hidden = true; dock.setAttribute('aria-label', t('Панели партии'));
  const tabs = Object.fromEntries([['controls', 'Управление'], ['history', 'Ходы'], ['chat', 'Чат']].map(([key, label]) => {
    const node = button('wide-' + key, label, key);
    node.setAttribute('aria-controls', key === 'controls' ? 'wide-tools' : 'match-sidebar');
    node.setAttribute('aria-expanded', 'false'); dock.append(node); return [key, node];
  }));
  const reveal = button('wide-panels', 'Показать панели', 'panels');
  reveal.hidden = true; reveal.setAttribute('aria-controls', 'wide-dock'); reveal.setAttribute('aria-expanded', 'false');
  const badge = doc.createElement('span'); badge.id = 'wide-unread'; badge.className = 'wide-unread'; badge.hidden = true; badge.setAttribute('data-no-translate', '');
  reveal.append(badge); screen.append(dock, reveal);
  let active = false, panel = null, expanded = false, context = null, stops = [], scrollY = 0;
  const moves = [];
  function feedback(kind) {
    stops.forEach(stop => stop?.()); stops = [];
    if (!doc.hidden) { const stop = sound(kind); if (typeof stop === 'function') stops.push(stop); }
  }
  function move(node, destination) {
    if (!node) return;
    const marker = doc.createComment('wide mode position');
    node.before(marker); moves.push([node, marker]); destination.append(node);
  }
  function labels() {
    const label = active ? 'Обычный вид' : 'Широкоэкранный режим';
    expand.setAttribute('aria-label', t(label)); expand.title = t(label);
    expand.querySelector('.wide-label').textContent = t(label);
    const symbol = active ? 'collapse' : 'expand';
    if (expand.dataset.symbol !== symbol) { expand.dataset.symbol = symbol; expand.querySelector('[aria-hidden]').innerHTML = icon(symbol); }
    const panelsLabel = expanded ? 'Скрыть панели' : 'Показать панели';
    reveal.setAttribute('aria-label', t(panelsLabel)); reveal.querySelector('.wide-label').textContent = t(expanded ? 'Скрыть' : 'Панели');
    dock.setAttribute('aria-label', t('Панели партии'));
  }
  function unread(count = matchUI.unread) {
    badge.hidden = !count; badge.textContent = count > 99 ? '99+' : String(count);
    reveal.classList.toggle('has-unread', !!count);
    // The persistent trigger reports new messages even when every panel is hidden.
    badge.setAttribute('aria-label', t('Непрочитанные сообщения') + ': ' + count);
    if (count) reveal.setAttribute('aria-describedby', 'wide-unread'); else reveal.removeAttribute('aria-describedby');
    tabs.chat.classList.toggle('has-unread', !!count);
  }
  function paintPanels() {
    dock.hidden = !active || !expanded;
    tools.hidden = !active || panel !== 'controls';
    sidebar.hidden = active && !['history', 'chat'].includes(panel);
    closeSidebar.hidden = !active;
    reveal.hidden = !active;
    for (const [key, node] of Object.entries(tabs)) node.setAttribute('aria-expanded', String(active && panel === key));
    reveal.setAttribute('aria-expanded', String(active && expanded));
    matchUI.setSidebarVisible(!active || !sidebar.hidden);
    labels(); unread();
  }
  function selectPanel(next, restore = false) {
    const previous = panel;
    panel = next;
    if (next === 'chat' || next === 'history') matchUI.selectTab(next);
    paintPanels();
    if (previous !== next) feedback(next ? 'panel-open' : 'panel-close');
    if (restore) (expanded && previous ? tabs[previous] : reveal).focus({ preventScroll: true });
    else if (next === 'controls') closeTools.focus({ preventScroll: true });
    else if (next) $(next + '-tab').focus({ preventScroll: true });
  }
  function resize() {
    if (!active || doc.hidden) return;
    // Safari's visual viewport also accounts for the software keyboard.
    const viewport = view.visualViewport;
    if (viewport && viewport.scale === 1) {
      screen.style.setProperty('--wide-viewport-height', Math.round(viewport.height) + 'px');
      screen.style.setProperty('--wide-viewport-top', Math.round(viewport.offsetTop) + 'px');
    } else {
      screen.style.removeProperty('--wide-viewport-height'); screen.style.removeProperty('--wide-viewport-top');
    }
    const { width, height } = surface.getBoundingClientRect();
    const fitted = wideBoardWidth(context?.game.variant, width, height, view.innerWidth <= 600);
    frame.style.setProperty('--wide-board-width', Math.floor(fitted) + 'px');
  }
  const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(resize);
  function exit({ silent = false, restoreFocus = true } = {}) {
    if (!active) return;
    active = false; panel = null; expanded = false; observer?.disconnect();
    for (const [node, marker] of moves.splice(0).reverse()) { marker.replaceWith(node); }
    surface.hidden = true; poolTools?.removeAttribute('hidden');
    frame.style.removeProperty('--wide-board-width');
    screen.style.removeProperty('--wide-viewport-height'); screen.style.removeProperty('--wide-viewport-top');
    doc.body.classList.remove('wide-match'); screen.classList.remove('is-wide');
    expand.setAttribute('aria-pressed', 'false'); paintPanels();
    if (silent) { stops.forEach(stop => stop?.()); stops = []; } else feedback('wide-exit');
    view.scrollTo?.({ top: scrollY, behavior: 'instant' });
    if (restoreFocus) expand.focus({ preventScroll: true });
  }
  function enter() {
    if (screen.hidden || active) return;
    scrollY = view.scrollY || 0; active = true; panel = null; expanded = false;
    matchUI.close(); doc.body.classList.add('wide-match'); screen.classList.add('is-wide');
    surface.hidden = false;
    move(frame, surface);
    for (const node of [$('shot-controls'), poolTools, play.querySelector('.move-instructions'), $('room-controls')]) move(node, $('wide-tools-body'));
    expand.setAttribute('aria-pressed', 'true'); observer?.observe(surface); update(context); paintPanels();
    feedback('wide-enter');
  }
  function update(value) {
    context = value;
    if (screen.hidden) { exit({ silent: true, restoreFocus: false }); return; }
    tabs.chat.hidden = !value?.room || !!value.room.bot;
    if (active) {
      if (poolTools) poolTools.hidden = value?.game.variant !== 'pool8';
      if (panel === 'chat' && tabs.chat.hidden) selectPanel('history');
      paintPanels(); resize();
    }
  }
  expand.onclick = () => active ? exit() : enter();
  reveal.onclick = () => {
    expanded = !expanded;
    if (!expanded) panel = null;
    paintPanels(); feedback(expanded ? 'panel-open' : 'panel-close');
  };
  for (const [name, node] of Object.entries(tabs)) node.onclick = () => selectPanel(panel === name ? null : name, panel === name);
  closeTools.onclick = closeSidebar.onclick = () => selectPanel(null, true);
  // Native tabs stay usable inside the floating sidebar.
  function syncTab() {
    if (active && ['history', 'chat'].includes(panel) && panel !== matchUI.selectedTab) {
      panel = matchUI.selectedTab; paintPanels(); feedback('panel-open');
    }
  }
  for (const name of ['history', 'chat']) for (const event of ['click', 'keydown']) $(name + '-tab').addEventListener(event, syncTab);
  function keydown(event) {
    if (!active || event.key !== 'Escape' || event.defaultPrevented || [...doc.querySelectorAll('dialog')].some(dialog => dialog.open)) return;
    event.preventDefault();
    if (panel) selectPanel(null, true);
    else if (expanded) { expanded = false; paintPanels(); feedback('panel-close'); reveal.focus({ preventScroll: true }); }
    else exit();
  }
  function visibility() { if (doc.hidden) { stops.forEach(stop => stop?.()); stops = []; } else resize(); }
  function onUnread(event) { unread(event.detail); }
  doc.addEventListener('keydown', keydown);
  doc.addEventListener('matchchatunread', onUnread);
  doc.addEventListener('visibilitychange', visibility);
  doc.addEventListener('languagechange', labels);
  view.addEventListener('resize', resize);
  view.visualViewport?.addEventListener('resize', resize);
  labels();
  return { update, exit, get active() { return active; }, destroy() {
    exit({ silent: true, restoreFocus: false });
    doc.removeEventListener('keydown', keydown); doc.removeEventListener('matchchatunread', onUnread);
    doc.removeEventListener('visibilitychange', visibility); doc.removeEventListener('languagechange', labels);
    view.removeEventListener('resize', resize); view.visualViewport?.removeEventListener('resize', resize);
    for (const name of ['history', 'chat']) for (const event of ['click', 'keydown']) $(name + '-tab').removeEventListener(event, syncTab);
    for (const node of [expand, surface, tools, closeSidebar, dock, reveal]) node.remove();
  } };
}
