export const botActionText = preview => ({
  'pool-shot': 'Бот прицеливается…', shot: 'Бот готовит удар…', 'pool-place': 'Бот ставит биток…',
  move: 'Бот выбирает ход…', roll: 'Бот бросает кости…', 'sea-fire': 'Бот выбирает цель…',
  'fleet-ready': 'Бот расставляет корабли…', 'domino-play': 'Бот выкладывает кость…',
  'domino-draw': 'Бот берёт с базара…', 'domino-pass': 'Бот пропускает ход…', 'domino-ready': 'Бот готов к раунду…',
  'durak-attack': 'Бот выбирает карту…', 'durak-defend': 'Бот отбивает карту…', 'durak-transfer': 'Бот переводит…',
  'durak-take': 'Бот берёт карты…', 'durak-finish': 'Бот завершает заход…'
})[preview?.kind] || 'Бот обдумывает ход…';

export function createBotPresentation({ pool, chapaev, sound, doc = document }) {
  let painted = null, heard = null, stopSound;
  function clear() {
    doc.querySelectorAll('.bot-source,.bot-target').forEach(el => el.classList.remove('bot-source', 'bot-target'));
    if (painted) { pool.receiveAim(null); pool.receivePlacement(null); chapaev.receiveAim(null); }
    painted = null; stopSound?.(); stopSound = null;
  }
  function update({ game, room, active, audible = null, now = Date.now() }) {
    const p = room?.botPreview;
    if (!active || !room?.bot || doc.hidden || game.winner || !p || p.revision !== game.revision || p.executeAt + 1000 < now) { clear(); return; }
    const key = `${room.code}:${p.revision}:${p.executeAt}`;
    if (painted !== key) {
      clear(); painted = key;
      const duration = Math.max(60, Math.min(420, p.executeAt - now));
      if (p.kind === 'pool-shot') pool.receiveAim({ ...p, windup: duration });
      if (p.kind === 'pool-place') pool.receivePlacement(p);
      if (p.kind === 'shot') chapaev.receiveAim(p);
    }
    if (heard !== key && audible !== null) {
      heard = key;
      if (audible) stopSound = sound(['pool-shot', 'shot', 'sea-fire'].includes(p.kind) ? 'bot-aim' : 'bot-select');
    }
    const mark = (selector, target = false) => doc.querySelector(selector)?.classList.add(target ? 'bot-target' : 'bot-source');
    if (p.kind === 'move') {
      const root = game.variant === 'narde' ? '#narde-board' : '#board';
      if (Number.isInteger(p.from)) mark(`${root} [data-index="${p.from}"]`);
      if (Number.isInteger(p.to)) mark(`${root} [data-index="${p.to}"]`, true);
    }
    if (p.kind === 'roll') mark('#narde-board .narde-center');
    if (p.kind === 'fleet-ready') mark('#top-player .player-avatar');
    if (p.kind === 'sea-fire' && Number.isInteger(p.cell)) mark(`[data-sea-own="true"][data-sea-cell="${p.cell}"]`, true);
    if (p.kind?.startsWith('durak-')) {
      // Lift a card back; the identity of the planned card is never exposed.
      mark('#durak-board .durak-opponent .durak-card');
      if (p.kind === 'durak-defend' && Number.isInteger(p.target)) mark(`#durak-board [data-target="${p.target}"]`, true);
      else mark('#durak-board .durak-table', true);
    }
    if (p.kind === 'domino-play') {
      const edges = doc.querySelectorAll('#domino-board .domino-laid.edge');
      const edge = p.end === 'left' ? edges[0] : edges[edges.length - 1];
      if (edge) edge.classList.add('bot-target'); else mark('#domino-board .domino-table', true);
    } else if (p.kind?.startsWith('domino-')) mark('#top-player .player-avatar');
  }
  doc.addEventListener('visibilitychange', () => { if (doc.hidden) clear(); });
  return { update, clear };
}
