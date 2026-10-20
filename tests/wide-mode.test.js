import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseHTML } from 'linkedom';
import { createMatchUI } from '../public/match-ui.js';
import { createWideMode, wideBoardWidth } from '../public/wide-mode.js';
import { ACTION_NOTES } from '../public/sounds.js';
import { t } from '../public/i18n.js';

function setup(online = false) {
  const { document, window } = parseHTML(readFileSync(new URL('../public/index.html', import.meta.url), 'utf8'));
  const $ = id => document.getElementById(id);
  let focused, observed = false, resize, stopped = 0;
  Object.defineProperty(document, 'activeElement', { get: () => focused });
  window.HTMLElement.prototype.focus = function () { focused = this; };
  window.HTMLElement.prototype.getBoundingClientRect = () => ({ width: 1200, height: 750 });
  const viewport = new window.EventTarget();
  Object.assign(viewport, { height: 900, offsetTop: 0, scale: 1 });
  window.visualViewport = viewport;
  window.innerWidth = 1500; window.scrollTo = () => {};
  globalThis.ResizeObserver = class {
    constructor(callback) { resize = callback; }
    observe() { observed = true; }
    disconnect() { observed = false; }
  };
  $('pool-board').innerHTML = '<canvas id="pool-canvas"></canvas><div class="pool-console"><input id="pool-power" value="73"></div>';
  $('game-screen').hidden = false;
  const state = { mode: online ? 'online' : 'local', game: { variant: 'russian', revision: 1 }, animating: false, playable: true,
    room: online ? { code: 'ABC', ready: true, role: 'white', chat: [] } : null };
  const match = createMatchUI(document); match.update(state);
  const sounds = [];
  const wide = createWideMode({ doc: document, view: window, matchUI: match, sound: kind => { sounds.push(kind); return () => stopped++; } });
  wide.update(state);
  const key = (target, name) => { const event = new window.Event('keydown', { bubbles: true, cancelable: true }); event.key = name; target.dispatchEvent(event); };
  return { document, window, $, state, match, wide, sounds, key, resize: () => resize(), get observed() { return observed; }, get stopped() { return stopped; } };
}

test('wide layout preserves live nodes, values and action handlers on repeated entry/exit', () => {
  const env = setup(), { document, $, wide, state, match, sounds } = env;
  const frame = document.querySelector('.board-frame'), parent = frame.parentElement, sibling = frame.nextSibling;
  const shot = $('shot-controls'), room = $('room-controls'), pool = document.querySelector('.pool-console'), canvas = $('pool-canvas');
  const poolParent = pool.parentElement, power = $('pool-power');
  let actions = 0; $('resign-button').onclick = () => actions++;
  assert.deepEqual(sounds, [], 'no automatic sound on mount or update');
  for (const variant of ['russian', 'russian12', 'chess', 'pool8', 'narde', 'chapaev', 'battleship', 'domino', 'durak-simple', 'durak-throw', 'durak-transfer']) {
    state.game.variant = variant; match.update(state); wide.update(state);
    $('wide-toggle').click();
    assert.equal(wide.active, true); assert.equal(env.observed, true);
    assert.equal($('wide-toggle').getAttribute('aria-pressed'), 'true');
    assert.equal(frame.parentElement, $('wide-surface')); assert.equal(canvas, $('pool-canvas'));
    assert.equal($('wide-dock').hidden, true); assert.equal($('match-sidebar').hidden, true); assert.equal($('wide-tools').hidden, true);
    assert.equal($('wide-chat').hidden, true);
    $('wide-panels').click(); $('wide-controls').click();
    assert.equal($('wide-tools').hidden, false); assert.equal(shot.parentElement.id, 'wide-tools-body');
    assert.equal(pool.hidden, variant !== 'pool8');
    assert.equal(shot.hidden, variant !== 'chapaev', 'action validity still comes from match state');
    $('wide-history').click(); assert.equal($('match-sidebar').hidden, false); assert.equal($('wide-tools').hidden, true);
    $('wide-panels').click(); assert.equal($('match-sidebar').hidden, true);
    $('match-menu-button').click(); $('resign-button').click();
    $('wide-toggle').click();
    assert.equal(wide.active, false); assert.equal(env.observed, false);
    assert.equal(frame.parentElement, parent); assert.equal(frame.nextSibling, sibling);
    assert.equal(pool.parentElement, poolParent); assert.equal(pool.contains(power), true);
    assert.equal(power.value, '73'); assert.equal(shot.parentElement, parent); assert.equal(room.parentElement, parent);
    assert.equal(document.querySelectorAll('#chat-form').length, 1);
    assert.equal($('wide-panels').hidden, true); assert.equal($('wide-dock').hidden, true);
    assert.equal($('match-sidebar').hidden, false); assert.equal(frame.style.getPropertyValue('--wide-board-width'), '');
  }
  assert.equal(actions, 11); assert.ok(env.stopped > 0);
  assert.ok(sounds.includes('wide-enter') && sounds.includes('wide-exit') && sounds.includes('panel-open') && sounds.includes('panel-close'));
  wide.destroy();
});

test('hidden chat accumulates unread messages, preserves drafts and does not steal focus', () => {
  const { document, $, state, match, wide, window } = setup(true);
  $('chat-tab').click(); $('chat-input').value = 'Draft';
  $('wide-toggle').click(); $('wide-panels').focus();
  const message = (id, side = 'black') => { state.room.chat.push({ id, side }); match.chat(state.room.chat); };
  message('one'); message('two', 'white'); message('three');
  assert.equal(match.unread, 2); assert.equal($('wide-unread').textContent, '2');
  assert.equal(document.activeElement.id, 'wide-panels'); assert.equal($('wide-dock').hidden, true);
  $('wide-panels').click(); $('wide-chat').click();
  assert.equal(match.unread, 0); assert.equal($('chat-panel').hidden, false); assert.equal($('chat-input').value, 'Draft');
  $('wide-sidebar-close').click(); message('four');
  assert.equal(match.unread, 1, 'selected chat tab is still unread while its parent is hidden');
  match.update(state); wide.update(state); assert.equal(match.unread, 1);
  $('wide-chat').click(); assert.equal(match.unread, 0);
  document.hidden = true; message('five'); assert.equal(match.unread, 1);
  document.hidden = false; document.dispatchEvent(new window.Event('visibilitychange')); assert.equal(match.unread, 0);
  wide.exit(); assert.equal($('chat-input').value, 'Draft');
  $('game-screen').hidden = true;
  $('friend-chat-host').append($('chat-panel')); $('chat-panel').hidden = false;
  match.selectTab('history'); $('chat-panel').hidden = false;
  document.dispatchEvent(new window.Event('visibilitychange'));
  assert.equal($('chat-panel').hidden, false, 'match visibility listener must not hide the shared friend-lobby chat');
  $('match-sidebar').append($('chat-panel')); $('game-screen').hidden = false;
  state.room = { ...state.room, bot: true }; match.update(state); wide.update(state);
  $('wide-toggle').click(); assert.equal($('wide-chat').hidden, true); assert.equal($('chat-tab').hidden, true);
  wide.destroy();
});

test('Escape respects menus and dialogs before closing the panel, dock and wide mode', () => {
  const { document, $, wide, key, state } = setup(true);
  $('wide-toggle').click(); $('wide-panels').click(); $('wide-history').click();
  key($('history-tab'), 'ArrowRight');
  assert.equal($('wide-chat').getAttribute('aria-expanded'), 'true');
  assert.equal($('wide-history').getAttribute('aria-expanded'), 'false');
  $('match-menu-button').click(); key($('resign-button'), 'Escape');
  assert.equal($('match-menu').hidden, true); assert.equal($('match-sidebar').hidden, false); assert.equal(wide.active, true);
  $('confirm-dialog').open = true; key($('confirm-yes'), 'Escape');
  assert.equal($('match-sidebar').hidden, false);
  $('confirm-dialog').open = false; key($('chat-tab'), 'Escape');
  assert.equal($('match-sidebar').hidden, true); assert.equal(document.activeElement.id, 'wide-chat');
  key(document.activeElement, 'Escape'); assert.equal($('wide-dock').hidden, true); assert.equal(document.activeElement.id, 'wide-panels');
  key(document.activeElement, 'Escape'); assert.equal(wide.active, false); assert.equal(document.activeElement.id, 'wide-toggle');
  $('wide-toggle').click(); $('game-screen').hidden = true; wide.update(state);
  assert.equal(wide.active, false); assert.equal(document.body.classList.contains('wide-match'), false);
  assert.equal($('chat-panel').parentElement.id, 'match-sidebar');
  wide.destroy();
});

test('layout fits common screen orientations without stretching squares or canvas, and adapts to a keyboard', () => {
  for (const [w, h] of [[1800, 800], [320, 500], [740, 240], [1024, 600]]) {
    for (const variant of ['russian', 'russian12', 'chess', 'chapaev']) assert.equal(wideBoardWidth(variant, w, h), Math.min(w, h));
    for (const portrait of [false, true]) {
      const width = wideBoardWidth('pool8', w, h, portrait);
      assert.ok(width <= w); assert.ok((width - 10) / (portrait ? 660 / 1200 : 1200 / 660) + 10 <= h + .001);
    }
    assert.ok(wideBoardWidth('narde', w, h) <= w);
  }
  assert.equal(wideBoardWidth('chess', NaN, 100), 0);
  for(const variant of ['durak-simple','durak-throw','durak-transfer','battleship','domino'])
    for(const width of [390,1366,1920,2560,3440])assert.equal(wideBoardWidth(variant,width,800),width,'free-form tables use all available width');
  const env = setup(), { $, window, document, sounds, wide } = env;
  $('wide-toggle').click(); assert.equal($('game-screen').style.getPropertyValue('--wide-viewport-height'), '900px');
  window.visualViewport.height = 450; window.visualViewport.offsetTop = 15;
  window.visualViewport.dispatchEvent(new window.Event('resize'));
  assert.equal($('game-screen').style.getPropertyValue('--wide-viewport-height'), '450px');
  assert.equal($('game-screen').style.getPropertyValue('--wide-viewport-top'), '15px');
  const count = sounds.length, stops = env.stopped;
  document.hidden = true; document.dispatchEvent(new window.Event('visibilitychange'));
  assert.ok(env.stopped > stops); $('wide-panels').click(); assert.equal(sounds.length, count, 'hidden tabs suppress feedback');
  document.hidden = false; wide.destroy(); assert.equal(env.observed, false);
  assert.equal($('wide-toggle'), null);
  for (const kind of ['wide-enter', 'wide-exit', 'panel-open', 'panel-close']) assert.ok(ACTION_NOTES[kind]);
});

test('new controls are translated and panel motion respects reduced-motion and background pause', () => {
  for (const source of ['Широкоэкранный режим', 'Обычный вид', 'Панели партии', 'Показать панели', 'Скрыть панели', 'Скрыть панель', 'Панели', 'Непрочитанные сообщения', 'Управление']) {
    for (const language of ['en', 'uk']) assert.notEqual(t(source, language), source, source + ' ' + language);
  }
  const css = readFileSync(new URL('../public/wide-mode.css', import.meta.url), 'utf8');
  assert.match(css, /prefers-reduced-motion:no-preference/);
  assert.match(css, /\.ambient-paused[^}]+animation-play-state:paused/);
  assert.match(css, /env\(safe-area-inset-bottom\)/);
});
