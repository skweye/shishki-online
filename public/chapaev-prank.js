import { RADIUS, simulateShot } from './chapaev.js';

// Deterministic, bounded search over real physics. Never invent a result or
// send simulated positions from the client: the chosen impulse is replayed.
export function findChapaevPrankShot(state) {
  const own = state.pieces.filter(p => p.side === state.turn);
  const enemies = state.pieces.filter(p => p.side !== state.turn);
  if (state.variant !== 'chapaev' || state.winner || !own.length || !enemies.length) throw Error('Удар сейчас недоступен.');
  const position = { ...state, history: [] }, seen = new Set(), leaders = [];
  let best = null;
  function tryShot(piece, angle, power) {
    power = Math.max(.05, Math.min(1, power));
    const dx = Math.cos(angle) * power, dy = Math.sin(angle) * power;
    const key = `${piece.id}:${dx.toFixed(7)}:${dy.toFixed(7)}`;
    if (seen.has(key)) return;
    seen.add(key);
    const { game } = simulateShot(position, piece.id, dx, dy);
    const { ownLost, otherLost } = game.lastShot;
    const safety = game.pieces.filter(p => p.side === state.turn).reduce((n, p) => n + Math.min(p.x, p.y, 8 - p.x, 8 - p.y), 0);
    // Avoid an outright loss. Otherwise knockouts dominate, followed by
    // preserving our pieces, distance from the edge and a gentler impulse.
    const score = (game.winner && game.winner !== state.turn && game.winner !== 'draw' ? -100000 : 0)
      + otherLost * 1000 - ownLost * 100 + safety - power * .01;
    const candidate = { piece, angle, power, dx, dy, score, perfect: otherLost === enemies.length && ownLost === 0 };
    if (!best || score > best.score) best = candidate;
    leaders.push(candidate); leaders.sort((a, b) => b.score - a.score); leaders.length = Math.min(leaders.length, 6);
  }
  function aimAt(piece, x, y, glancing = false) {
    const dx = x - piece.x, dy = y - piece.y, distance = Math.hypot(dx, dy);
    if (distance < 1e-6) return;
    const angle = Math.atan2(dy, dx), offset = Math.asin(Math.min(.95, RADIUS * 1.5 / distance));
    for (const deviation of glancing ? [0, -offset, offset] : [0]) {
      for (const power of [1, .78, .55]) tryShot(piece, angle + deviation, power);
    }
  }
  for (const piece of own) {
    for (const target of enemies) aimAt(piece, target.x, target.y, true);
    // Gaps between nearby opponents can split the impulse across a cluster.
    for (let i = 0; i < enemies.length; i++) for (let j = i + 1; j < enemies.length; j++) {
      const a = enemies[i], b = enemies[j];
      if (Math.hypot(a.x - b.x, a.y - b.y) <= 2) aimAt(piece, (a.x + b.x) / 2, (a.y + b.y) / 2);
    }
    // Include combinations through our own pieces instead of only direct hits.
    for (const target of own) if (target.id !== piece.id) aimAt(piece, target.x, target.y);
    if (best?.perfect) break;
  }
  // Refine the strongest candidates twice, both in angle and power. With at
  // most eight pieces per side this stays below 1,800 physics simulations.
  for (const step of [1, .3]) {
    if (best?.perfect) break;
    const seeds = [...leaders];
    for (const seed of seeds) for (const angle of [-.045, -.015, 0, .015, .045]) {
      for (const power of [-.1, -.04, 0, .04, .1]) tryShot(seed.piece, seed.angle + angle * step, seed.power + power * step);
    }
  }
  if (!best) throw Error('Удар сейчас недоступен.');
  return { id: best.piece.id, dx: best.dx, dy: best.dy };
}
