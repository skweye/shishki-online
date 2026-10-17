import { cardArt } from './card-art.js';

const count = (game, side) => game.handCounts?.[side] ?? game.hands[side]?.length ?? 0;
const tableCards = game => game.table.flatMap(pair => [pair.attack, ...(pair.defend === null ? [] : [pair.defend])]);

// Uses public counts for the opponent: animation must never need their hand.
export function durakDraws(previous, next) {
  if (next.bout === previous.bout) return [];
  const taken = previous.taking || next.lastAction?.type === 'durak-take';
  const collected = taken ? tableCards(previous) : [];
  return [previous.attacker, previous.defender].flatMap(side => {
    const gained = count(next, side) - count(previous, side) - (side === previous.defender ? collected.length : 0);
    const known = (next.hands[side] || []).filter(card => !(previous.hands[side] || []).includes(card) && !collected.includes(card));
    return Array.from({ length: Math.max(0, gained) }, (_, index) => ({ side, card: known[index] ?? null }));
  });
}

export function createDurakMotion(root, { staticMode, sound }) {
  const active = new Set(), stops = new Set(), listeners = new Set();
  const hidden = new Map();
  let layer, cancelling = false;
  function settled() {
    if (active.size) return;
    layer?.remove(); layer = null;
    for (const callback of [...listeners]) { listeners.delete(callback); callback(!cancelling); }
  }
  function cancel() {
    cancelling = true;
    for (const stop of stops) stop(); stops.clear();
    for (const entry of [...active]) { entry.animation.cancel(); entry.clean(); }
    settled();
    cancelling = false;
  }
  function audio(kind, delay = 0) {
    if (document.hidden) return;
    const stop = sound(kind, delay / 1000);
    if (typeof stop === 'function') stops.add(stop);
  }
  function animate(element, frames, duration = 360, delay = 0, cleanup = () => {}) {
    if (!element?.animate || staticMode()) { cleanup(); return; }
    const animation = element.animate(frames, { duration, delay, fill: 'both', easing: 'cubic-bezier(.2,.7,.25,1)' });
    const entry = { animation, clean() {
      if (!active.delete(entry)) return;
      cleanup(); animation.onfinish = animation.oncancel = null;
      // Remove fill effects as well as temporary elements.
      animation.cancel(); settled();
    } };
    active.add(entry); animation.onfinish = animation.oncancel = entry.clean;
    return animation;
  }
  const rect = element => {
    const r = element?.getBoundingClientRect?.();
    return r && r.width > 0 && r.height > 0 ? { left: r.left, top: r.top, width: r.width, height: r.height } : null;
  };
  function snapshot() {
    const cards = new Map();
    root.querySelectorAll('[data-table-card],.durak-hand [data-card]').forEach(el => {
      cards.set(el.hasAttribute('data-table-card') ? `table:${el.dataset.tableCard}` : `hand:${el.closest('[data-hand-owner]')?.dataset.handOwner}:${el.dataset.card}`, rect(el));
    });
    const hands = {};
    root.querySelectorAll('[data-hand-owner]').forEach(el => { hands[el.dataset.handOwner] = rect(el.querySelector('.durak-card')) || rect(el); });
    return { cards, hands, stock: rect(root.querySelector('[data-deck-card]')) || rect(root.querySelector('[data-trump-card]')), discard: rect(root.querySelector('.durak-discard-mark')) };
  }
  function landing(side, card, slot) {
    const hand = root.querySelector(`[data-hand-owner="${side}"]`);
    const face = card === null ? null : hand?.querySelector(`[data-card="${card}"]`);
    const backs = hand?.querySelectorAll('.durak-card');
    const element = face || backs?.[Math.min(slot ?? backs.length - 1, backs.length - 1)];
    const bounds = rect(element) || rect(hand);
    if (!bounds) return {};
    return { element, rect: element ? bounds : { left: bounds.left + bounds.width / 2 - 27, top: bounds.top + 10, width: 54, height: 75.6 }, face: !!face };
  }
  function flight(card, skin, from, to, { delay = 0, duration = 380, target, kind = 'draw', turn = false } = {}) {
    if (!from || !to || staticMode() || !root.animate) return;
    if (!layer) {
      layer = document.createElement('div'); layer.className = 'durak-motion-layer';
      layer.setAttribute('aria-hidden', 'true'); layer.inert = true; root.append(layer);
    }
    const origin = rect(root); if (!origin) return;
    const el = document.createElement('span'); el.className = `durak-card durak-flight durak-flight-${kind}`;
    el.innerHTML = cardArt(card, skin); el.dataset.flight = kind;
    Object.assign(el.style, { left: `${from.left - origin.left}px`, top: `${from.top - origin.top}px`, width: `${from.width}px`, height: `${from.height}px` });
    layer.append(el);
    if (target) { hidden.set(target, (hidden.get(target) || 0) + 1); target.classList.add('durak-motion-hidden'); }
    const x = to.left - from.left, y = to.top - from.top, sx = to.width / from.width, sy = to.height / from.height;
    animate(el, [
      { transform: 'translate(0,0) rotate(0) scale(1)', opacity: 0 },
      { opacity: 1, offset: .08 },
      { transform: `translate(${x * .5}px,${y * .5 - 28}px) rotate(${turn ? -12 : 6}deg) scale(${(1 + sx) / 2},${(1 + sy) / 2})`, opacity: 1, offset: .5 },
      { transform: `translate(${x}px,${y}px) rotate(0) scale(${sx},${sy})`, opacity: target ? 1 : 0 },
    ], duration, delay, () => {
      if (target) {
        const remaining = hidden.get(target) - 1;
        if (remaining) hidden.set(target, remaining);
        else { hidden.delete(target); target.classList.remove('durak-motion-hidden'); }
      }
      el.remove();
    });
  }
  function play(previous, next, before, { skins = {}, dropped } = {}) {
    const draws = durakDraws(previous, next), cards = tableCards(previous);
    const clearDelay = 420 + Math.max(0, cards.length - 1) * 45;
    const actionSound = { 'durak-attack': 'card-play', 'durak-defend': 'card-cover', 'durak-transfer': 'card-transfer', 'durak-take': 'card-take', 'durak-finish': previous.taking ? 'card-take' : 'card-clear' }[next.lastAction?.type];
    if (actionSound && next.lastAction.revision === next.revision) audio(actionSound);
    if (draws.length) audio('card-deal', staticMode() ? 0 : clearDelay);
    if (staticMode()) return;
    const after = snapshot(), played = next.lastAction?.revision === next.revision ? next.lastAction.card : null;
    // FLIP keeps the other cards in the hand and on the table from jumping.
    for (const [key, end] of after.cards) {
      const start = before.cards.get(key); if (!start || !end || key === `table:${played}`) continue;
      const [zone, owner, id] = key.split(':');
      const el = zone === 'table' ? root.querySelector(`[data-table-card="${owner}"]`) : root.querySelector(`[data-hand-owner="${owner}"] [data-card="${id}"]`);
      const x = start.left - end.left, y = start.top - end.top;
      if (Math.abs(x) + Math.abs(y) > 1) animate(el, [{ transform: `translate(${x}px,${y}px)` }, { transform: 'none' }], 260);
    }
    if (Number.isInteger(played)) {
      const el = root.querySelector(`[data-table-card="${played}"]`), end = rect(el);
      const from = dropped || before.cards.get(`hand:${next.lastAction.side}:${played}`) || before.hands[next.lastAction.side];
      if (from && end) animate(el, [
        { transform: `translate(${from.left - end.left}px,${from.top - end.top}px) rotate(-8deg) scale(${from.width / end.width},${from.height / end.height})`, opacity: .85 },
        { transform: 'translate(0,-7px) rotate(2deg) scale(1.03)', opacity: 1, offset: .8 },
        { transform: 'none', opacity: 1 },
      ], 360);
    }
    if (previous.table.length && !next.table.length) {
      const taken = previous.taking || next.lastAction?.type === 'durak-take';
      const target = taken ? landing(previous.defender, null).rect : after.discard;
      cards.forEach((card, index) => {
        const owner = previous.table.find(pair => pair.attack === card || pair.defend === card);
        const side = owner.attack === card ? owner.attackSide || previous.attacker : owner.defendSide || previous.defender;
        const arrival = taken ? landing(previous.defender, card).element : null;
        flight(card, skins[side], before.cards.get(`table:${card}`), arrival ? rect(arrival) : target,
          { kind: taken ? 'take' : 'discard', delay: index * 45, duration: 400, target: arrival, turn: true });
      });
      const received = { white: 0, black: 0 };
      draws.forEach(({ side, card }, index) => {
        const to = landing(side, card, count(next, side) - draws.filter(draw => draw.side === side).length + received[side]++);
        flight(to.face ? card : null, skins[side], before.stock, to.rect, { kind: 'draw', delay: clearDelay + index * 75, target: to.element });
      });
    }
  }
  function deal(game, skins = {}) {
    if (staticMode()) return;
    const stock = snapshot().stock; if (!stock) return;
    audio('card-deal');
    const sides = [game.attacker, game.defender];
    for (let i = 0; i < 6; i++) for (let s = 0; s < sides.length; s++) {
      const side = sides[s], card = game.hands[side]?.[i] ?? null, to = landing(side, card, i);
      flight(to.face ? card : null, skins[side], stock, to.rect, { kind: 'deal', delay: (i * 2 + s) * 65, target: to.element });
    }
  }
  function reveal() {
    root.querySelectorAll('.durak-hand .durak-card').forEach((el, i) => animate(el, [
      { transform: 'perspective(600px) rotateY(88deg) translateY(12px)', opacity: 0 },
      { transform: 'none', opacity: 1 },
    ], 260, i * 35));
  }
  function lift(card) {
    animate(root.querySelector(`.durak-hand [data-card="${card}"]`), [{ transform: 'translateY(0)' }, { transform: 'translateY(-10px)' }], 140);
  }
  return { snapshot, play, deal, reveal, lift, cancel, whenSettled(callback) { if (active.size) listeners.add(callback); else callback(true); } };
}
