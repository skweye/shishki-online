import { durakActions, cardName, SUITS, suit } from './durak.js';
import { cardArt } from './card-art.js';
import { t } from './i18n.js';
import { lowPerformance } from './performance.js';

export function createDurakBoard(root, act, sound = () => {}) {
  let game, context, selected = null, revealed = null, previousTurn, previousRevision, roomKey;
  const animations = new Set();
  const media = typeof matchMedia === 'function' ? matchMedia('(prefers-reduced-motion:reduce)') : null;
  const staticMode = () => document.hidden || lowPerformance() || media?.matches;
  function cancel() { for (const animation of animations) animation.cancel(); animations.clear(); }
  function animate(element, frames, duration = 280) {
    if (!element?.animate || staticMode()) return;
    const animation = element.animate(frames, { duration, easing: 'cubic-bezier(.2,.7,.25,1)' });
    animations.add(animation);
    animation.onfinish = animation.oncancel = () => animations.delete(animation);
  }
  function render(next, options) {
    const changed = next.revision !== previousRevision || next.variant !== game?.variant || next.dealId !== game?.dealId || options.roomCode !== roomKey;
    if (!changed && context?.enabled === options.enabled && context?.mode === options.mode && context?.role === options.role && JSON.stringify(context?.skins) === JSON.stringify(options.skins)) return;
    const step = !!game && game.variant === next.variant && game.dealId === next.dealId && next.revision === previousRevision + 1 && options.roomCode === roomKey;
    const oldTable = root.querySelector('.durak-table'), oldMarkup = oldTable?.innerHTML;
    const cleared = step && game.table.length && !next.table.length;
    const taken = game?.taking || next.lastAction?.type === 'durak-take';
    const dealt = !game || next.bout !== game.bout;
    cancel();
    if (changed) selected = null;
    if (next.turn !== previousTurn || options.roomCode !== roomKey || next.variant !== game?.variant || next.dealId !== game?.dealId) revealed = null;
    game = next; context = options; previousTurn = next.turn; previousRevision = next.revision; roomKey = options.roomCode;
    paint();
    if (changed && step) {
      if (cleared && oldMarkup && !staticMode()) {
        const ghost = document.createElement('div'); ghost.className = 'durak-clear'; ghost.setAttribute('aria-hidden', 'true'); ghost.inert = true; ghost.innerHTML = oldMarkup;
        root.querySelector('.durak-arena').append(ghost);
        animate(ghost, [{ opacity: 1, transform: 'translateY(0) scale(1)' }, { opacity: 0, transform: `translateY(${taken ? 80 : -70}px) scale(.7)` }]);
        const animation = [...animations].at(-1);
        if (animation) { const clean = animation.onfinish; animation.onfinish = animation.oncancel = () => { clean(); ghost.remove(); }; } else ghost.remove();
      } else if (next.lastAction?.card !== null) {
        animate(root.querySelector(`[data-table-card="${next.lastAction?.card}"]`), [{ opacity: 0, transform: 'translateY(45px) rotate(-8deg) scale(.88)' }, { opacity: 1, transform: 'none' }]);
      }
      if (dealt) root.querySelectorAll('.durak-hand .durak-card').forEach((el, index) => animate(el, [{ opacity: 0, transform: 'translateY(20px)' }, { opacity: 1, transform: 'none' }], 180 + Math.min(index, 8) * 22));
    }
  }
  function paint() {
    const { mode, role, enabled, skins = {} } = context, viewer = mode === 'local' ? game.turn : role;
    const skin = skins[viewer] || 'classic', enemy = viewer === 'white' ? 'black' : 'white';
    const hidden = mode === 'local' && revealed !== viewer;
    const actions = enabled && !hidden ? durakActions(game, viewer) : [], hand = hidden ? [] : game.hands[viewer] || [];
    const count = game.stockCount ?? game.stock?.length ?? 0;
    const card = (id, extra = '', back = false, owner = viewer) => `<span class="durak-card" ${extra}>${cardArt(back ? null : id, skins[owner] || skin)}</span>`;
    root.innerHTML = `<div class="durak-info"><span>${t('Козырь')} <b data-no-translate>${SUITS[suit(game.trump)]}</b></span><span>${t('Колода')}: <b data-no-translate>${count}</b></span><span>${t('Бито')}: <b data-no-translate>${game.discard.length}</b></span></div>
      <div class="durak-opponent" aria-label="${t('Карты соперника')}">${Array.from({ length: Math.min(10, game.handCounts?.[enemy] ?? game.hands[enemy]?.length ?? 0) }, () => card(null, '', true, enemy)).join('')}<b data-no-translate>${game.handCounts?.[enemy] ?? game.hands[enemy]?.length ?? 0}</b></div>
      <div class="durak-arena"><div class="durak-stock">${count ? card(game.trump, `role="img" aria-label="${cardName(game.trump)}"`) : `<span class="durak-trump" data-no-translate>${SUITS[suit(game.trump)]}</span>`}${count > 1 ? card(null, '', true) : ''}</div><div class="durak-table" role="group" aria-label="${t('Карты на столе')}">${game.table.map((pair, index) => `<button class="durak-pair ${actions.some(a => a.card === selected && a.target === index) ? 'can-cover' : ''}" data-target="${index}" aria-label="${t('Отбить карту')}: ${cardName(pair.attack)}" ${!actions.some(a => a.card === selected && a.target === index) ? 'disabled' : ''}>${card(pair.attack, `data-table-card="${pair.attack}"`, false, pair.attackSide || game.attacker)}${pair.defend !== null ? card(pair.defend, `data-table-card="${pair.defend}"`, false, pair.defendSide || game.defender) : ''}</button>`).join('') || `<p class="durak-empty">${t('Выберите карту для атаки.')}</p>`}</div></div>
      <p class="durak-instruction">${t(game.taking ? viewer===game.defender?'Вы берёте. Дождитесь завершения подкидывания.':'Соперник берёт. Можно подкинуть или завершить заход.' : game.turn === game.defender ? 'Выберите карту и нажмите на карту, которую хотите отбить.' : 'Атакуйте или завершите отбитый заход.')}</p>
      <div class="durak-hand-panel">${hidden ? `<div class="durak-handoff"><strong>${t('Передайте устройство следующему игроку.')}</strong><p>${t(viewer === 'white' ? 'Белые' : 'Чёрные')}</p><button class="primary-button" data-control="reveal">${t('Показать мои карты')}</button></div>` : `<div class="durak-hand" aria-label="${t('Ваши карты')}">${hand.map(id => `<button class="durak-card ${selected === id ? 'selected' : ''}" data-card="${id}" aria-label="${cardName(id)}" aria-pressed="${selected === id}" ${!actions.some(a => a.card === id) ? 'disabled' : ''}>${cardArt(id, skin)}</button>`).join('')}</div><div class="durak-actions">${[['durak-attack', 'Атаковать'], ['durak-transfer', 'Перевести'], ['durak-take', 'Беру'], ['durak-finish', game.taking ? 'Завершить подкидывание' : 'Бито']].map(([type, label]) => {
        const action = actions.find(a => a.type === type && (a.card === undefined || a.card === selected));
        return `<button class="secondary-button" data-action="${type}" ${!action ? 'disabled' : ''}>${t(label)}</button>`;
      }).join('')}${mode === 'local' ? `<button class="ghost-button" data-control="hide">${t('Скрыть карты')}</button>` : ''}</div>`}</div>`;
  }
  root.addEventListener('click', event => {
    const button = event.target.closest('button'); if (!button || button.disabled || !game) return;
    if (button.dataset.control) { cancel(); revealed = button.dataset.control === 'reveal' ? game.turn : null; selected = null; sound(button.dataset.control === 'reveal' ? 'card-reveal' : 'select'); paint(); if(revealed)root.querySelectorAll('.durak-hand .durak-card').forEach(el=>animate(el,[{transform:'perspective(500px) rotateY(80deg)',opacity:0},{transform:'none',opacity:1}],220)); return; }
    if (!context.enabled) return;
    if (button.hasAttribute('data-card')) { cancel(); selected = Number(button.dataset.card); sound('select'); paint(); root.querySelector('.can-cover')?.focus?.(); return; }
    const action = durakActions(game, context.mode === 'local' ? game.turn : context.role).find(a => button.hasAttribute('data-target') ? a.type === 'durak-defend' && a.card === selected && a.target === Number(button.dataset.target) : a.type === button.dataset.action && (a.card === undefined || a.card === selected));
    if (action) act(action);
  });
  function hide() { cancel(); root.querySelectorAll('.durak-clear').forEach(el => el.remove()); revealed = null; selected = null; if (game) paint(); }
  document.addEventListener('visibilitychange', () => { if (document.hidden) hide(); });
  document.addEventListener('performancechange', cancel); media?.addEventListener?.('change', cancel);
  document.addEventListener('languagechange', () => { cancel(); if (game) paint(); });
  return { render, hide, cancel };
}
