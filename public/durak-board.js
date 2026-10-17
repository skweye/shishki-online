import { durakActions, cardName, SUITS, suit } from './durak.js';
import { cardArt } from './card-art.js';
import { t } from './i18n.js';
import { lowPerformance } from './performance.js';
import { attachDurakDrag } from './durak-drag.js';
import { createDurakMotion } from './durak-motion.js';

export function createDurakBoard(root, act, sound = () => {}) {
  let game, context, selected = null, revealed = null, previousTurn, previousRevision, roomKey;
  let dropped = null, dealtKey = null;
  const media = typeof matchMedia === 'function' ? matchMedia('(prefers-reduced-motion:reduce)') : null;
  const staticMode = () => document.hidden || lowPerformance() || media?.matches;
  const motion = createDurakMotion(root, { staticMode, sound });
  function cancelAnimations() { motion.cancel(); }
  function cancel() { drag.cancel(); cancelAnimations(); }
  function availableActions() {
    if (!game || !context.enabled || document.hidden || (context.mode === 'local' && revealed !== game.turn)) return [];
    return durakActions(game, context.mode === 'local' ? game.turn : context.role);
  }
  const drag = attachDurakDrag(root, {
    actions: availableActions,
    prepare: cancelAnimations,
    select(card) { cancelAnimations(); selected = card; sound('select'); paint(); },
    submit(action, origin) { dropped = { card: action.card, revision: game.revision, origin }; act(action); }, sound,
  });
  function render(next, options) {
    const changed = next.revision !== previousRevision || next.variant !== game?.variant || next.dealId !== game?.dealId || options.roomCode !== roomKey;
    const key = `${options.mode}:${options.roomCode || ''}:${next.dealId}`;
    const deal = key !== dealtKey && (options.deal || (options.live !== false && game?.winner && !next.winner && next.dealId !== game.dealId && next.revision === previousRevision + 1 && options.roomCode === roomKey));
    if (!changed && !deal && context?.enabled === options.enabled && context?.mode === options.mode && context?.role === options.role && JSON.stringify(context?.skins) === JSON.stringify(options.skins)) return;
    const step = options.live !== false && !!game && game.variant === next.variant && game.dealId === next.dealId && next.revision === previousRevision + 1 && options.roomCode === roomKey && options.mode === context?.mode && options.role === context?.role;
    const previous = game;
    const before = motion.snapshot();
    const origin = step && dropped?.revision === previousRevision && dropped.card === next.lastAction?.card ? dropped.origin : null;
    cancel();
    if (changed) selected = null;
    if (next.turn !== previousTurn || options.roomCode !== roomKey || next.variant !== game?.variant || next.dealId !== game?.dealId) revealed = null;
    game = next; context = options; previousTurn = next.turn; previousRevision = next.revision; roomKey = options.roomCode;
    paint();
    if (changed) dropped = null;
    else if (options.enabled) dropped = null; // A rejected online action returns to the same revision.
    if (changed && step) motion.play(previous, next, before, { skins: options.skins, dropped: origin });
    else if (deal) { dealtKey = key; motion.deal(next, options.skins); }
  }
  function paint() {
    const { mode, role, skins = {} } = context, viewer = mode === 'local' ? game.turn : role;
    const skin = skins[viewer] || 'classic', enemy = viewer === 'white' ? 'black' : 'white';
    const hidden = mode === 'local' && revealed !== viewer;
    const actions = availableActions(), hand = hidden ? [] : game.hands[viewer] || [];
    const play = actions.find(a => a.card === selected && (a.type === 'durak-attack' || a.type === 'durak-transfer'));
    const count = game.stockCount ?? game.stock?.length ?? 0;
    const card = (id, extra = '', back = false, owner = viewer) => `<span class="durak-card" ${extra}>${cardArt(back ? null : id, skins[owner] || skin)}</span>`;
    root.innerHTML = `<div class="durak-info"><span>${t('Козырь')} <b data-no-translate>${SUITS[suit(game.trump)]}</b></span><span>${t('Колода')}: <b data-no-translate>${count}</b></span><span class="durak-discard"><i class="durak-discard-mark" aria-hidden="true"></i>${t('Бито')}: <b data-no-translate>${game.discard.length}</b></span></div>
      <div class="durak-opponent" data-hand-owner="${enemy}" aria-label="${t('Карты соперника')}">${Array.from({ length: Math.min(10, game.handCounts?.[enemy] ?? game.hands[enemy]?.length ?? 0) }, () => card(null, '', true, enemy)).join('')}<b data-no-translate>${game.handCounts?.[enemy] ?? game.hands[enemy]?.length ?? 0}</b></div>
      <div class="durak-arena"><div class="durak-stock">${count ? card(game.trump, `data-trump-card role="img" aria-label="${cardName(game.trump)}"`) : `<span class="durak-trump" data-no-translate>${SUITS[suit(game.trump)]}</span>`}${count > 1 ? card(null, 'data-deck-card', true) : ''}<span class="durak-trump-label">${t('Козырь')} <b data-no-translate>${count ? cardName(game.trump) : SUITS[suit(game.trump)]}</b></span></div><div class="durak-table" role="group" aria-label="${t('Карты на столе')}">${game.table.map((pair, index) => `<button class="durak-pair ${actions.some(a => a.card === selected && a.target === index) ? 'can-cover' : ''}" data-target="${index}" aria-label="${t('Отбить карту')}: ${cardName(pair.attack)}" ${!actions.some(a => a.card === selected && a.target === index) ? 'disabled' : ''}>${card(pair.attack, `data-table-card="${pair.attack}"`, false, pair.attackSide || game.attacker)}${pair.defend !== null ? card(pair.defend, `data-table-card="${pair.defend}"`, false, pair.defendSide || game.defender) : ''}</button>`).join('')}${play ? `<button class="durak-drop-play" data-action="${play.type}">${t(play.type === 'durak-transfer' ? 'Перетащите сюда для перевода' : 'Перетащите сюда для атаки')}</button>` : !game.table.length ? `<p class="durak-empty">${t('Перетащите карту на стол или выберите её кликом.')}</p>` : ''}</div></div>
      <p class="durak-instruction">${t(game.taking ? viewer===game.defender?'Вы берёте. Дождитесь завершения подкидывания.':'Соперник берёт. Можно подкинуть или завершить заход.' : game.turn === game.defender ? 'Перетащите свою карту на карту соперника, чтобы отбить. Для перевода — на свободное место стола. Можно играть и кликами.' : 'Перетащите карту на стол или выберите её кликом.')}</p>
      <div class="durak-hand-panel" data-hand-owner="${viewer}">${hidden ? `<div class="durak-handoff"><div class="durak-private-hand" aria-hidden="true">${Array.from({ length: Math.min(10, game.hands[viewer]?.length || 0) }, () => card(null, '', true)).join('')}</div><strong>${t('Передайте устройство следующему игроку.')}</strong><p>${t(viewer === 'white' ? 'Белые' : 'Чёрные')}</p><button class="primary-button" data-control="reveal">${t('Показать мои карты')}</button></div>` : `<div class="durak-hand" aria-label="${t('Ваши карты')}">${hand.map(id => `<button class="durak-card ${selected === id ? 'selected' : ''}" data-card="${id}" aria-label="${cardName(id)}" aria-pressed="${selected === id}" ${!actions.some(a => a.card === id) ? 'disabled' : ''}>${cardArt(id, skin)}</button>`).join('')}</div><div class="durak-actions">${[['durak-attack', 'Атаковать'], ['durak-transfer', 'Перевести'], ['durak-take', 'Беру'], ['durak-finish', game.taking ? 'Завершить подкидывание' : 'Бито']].map(([type, label]) => {
        const action = actions.find(a => a.type === type && (a.card === undefined || a.card === selected));
        return `<button class="secondary-button" data-action="${type}" ${!action ? 'disabled' : ''}>${t(label)}</button>`;
      }).join('')}${mode === 'local' ? `<button class="ghost-button" data-control="hide">${t('Скрыть карты')}</button>` : ''}</div>`}</div>`;
  }
  root.addEventListener('click', event => {
    const button = event.target.closest('button'); if (!button || button.disabled || !game) return;
    if (button.dataset.control) { cancel(); revealed = button.dataset.control === 'reveal' ? game.turn : null; selected = null; sound(button.dataset.control === 'reveal' ? 'card-reveal' : 'select'); paint(); if(revealed)motion.reveal(); return; }
    if (!context.enabled) return;
    if (button.hasAttribute('data-card')) { cancel(); selected = Number(button.dataset.card); sound('select'); paint(); motion.lift(selected); root.querySelector('.can-cover')?.focus?.(); return; }
    const action = durakActions(game, context.mode === 'local' ? game.turn : context.role).find(a => button.hasAttribute('data-target') ? a.type === 'durak-defend' && a.card === selected && a.target === Number(button.dataset.target) : a.type === button.dataset.action && (a.card === undefined || a.card === selected));
    if (action) act(action);
  });
  function hide() { cancel(); dropped = null; revealed = null; selected = null; if (game) paint(); }
  document.addEventListener('visibilitychange', () => { if (document.hidden) hide(); else if (game) paint(); });
  document.addEventListener('performancechange', cancel); media?.addEventListener?.('change', cancel);
  document.addEventListener('languagechange', () => { cancel(); if (game) paint(); });
  window.addEventListener('resize', cancel);
  return { render, hide, cancel, whenSettled: motion.whenSettled };
}
