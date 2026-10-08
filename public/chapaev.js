// Shared fixed-step simulation. Clients send only an impulse; the server owns the result.
export const RADIUS = .34;
const DT = 1 / 120, FRICTION = 4.8, MAX_SPEED = 20;
export function newChapaev() {
  return {
    variant: 'chapaev', board: Array(64).fill(0), turn: 'white', forced: null,
    captured: [], path: [], repetitions: {}, history: [], revision: 0, winner: null, reason: null,
    pieces: ['white', 'black'].flatMap((side, row) => Array.from({ length: 8 }, (_, i) => ({
      id: row * 8 + i, side, x: i + .5, y: row ? .5 : 7.5
    }))), lastShot: null
  };
}
export function simulateShot(state, id, dx, dy, collectFrames = false) {
  if (state.variant !== 'chapaev' || state.winner) throw new Error('Удар сейчас недоступен.');
  const piece = state.pieces.find(p => p.id === id);
  if (!piece || piece.side !== state.turn) throw new Error('Выберите свою шашку.');
  if (![dx, dy].every(v => typeof v === 'number' && Number.isFinite(v)) || Math.abs(dx) > 1 || Math.abs(dy) > 1) throw new Error('Недопустимая сила удара.');
  const power = Math.hypot(dx, dy);
  if (power < .05 || power > 1.000001) throw new Error('Сила удара должна быть от 5 до 100%.');
  const pieces = state.pieces.map(p => ({ ...p, vx: p.id === id ? dx * MAX_SPEED : 0, vy: p.id === id ? dy * MAX_SPEED : 0, out: false }));
  const frames = [], collisions = [];
  const frame = () => pieces.filter(p => !p.out).map(({ id, side, x, y }) => ({ id, side, x, y }));
  if (collectFrames) frames.push(frame());
  let steps = 0;
  for (; steps < 720; steps++) {
    for (const p of pieces) {
      if (p.out) continue;
      p.x += p.vx * DT; p.y += p.vy * DT;
      if (p.x < 0 || p.x > 8 || p.y < 0 || p.y > 8) { p.out = true; p.vx = p.vy = 0; continue; }
      const speed = Math.hypot(p.vx, p.vy), scale = speed ? Math.max(0, speed - FRICTION * DT) / speed : 0;
      p.vx *= scale; p.vy *= scale;
    }
    // Stable order and two contact passes resolve small clusters without adding energy.
    for (let pass = 0; pass < 2; pass++) for (let i = 0; i < pieces.length; i++) for (let j = i + 1; j < pieces.length; j++) {
      const a = pieces[i], b = pieces[j];
      if (a.out || b.out) continue;
      const x = b.x - a.x, y = b.y - a.y, distance = Math.hypot(x, y);
      if (distance >= RADIUS * 2) continue;
      const nx = distance > 1e-9 ? x / distance : 1, ny = distance > 1e-9 ? y / distance : 0;
      const overlap = (RADIUS * 2 - distance + .00001) / 2;
      a.x -= nx * overlap; a.y -= ny * overlap; b.x += nx * overlap; b.y += ny * overlap;
      const approach = (a.vx - b.vx) * nx + (a.vy - b.vy) * ny;
      if (approach > 0) {
        const impulse = approach * .88;
        a.vx -= impulse * nx; a.vy -= impulse * ny; b.vx += impulse * nx; b.vy += impulse * ny;
        if (collectFrames && approach > 1 && (collisions.length === 0 || steps * DT - collisions.at(-1) > .09)) collisions.push(steps * DT);
      }
    }
    for (const p of pieces) if (!p.out && (p.x < 0 || p.x > 8 || p.y < 0 || p.y > 8)) { p.out = true; p.vx = p.vy = 0; }
    if (collectFrames && steps % 2 === 1) frames.push(frame());
    if (pieces.every(p => p.out || Math.hypot(p.vx, p.vy) < .015)) break;
  }
  const next = structuredClone(state);
  next.pieces = frame().map(p => ({ ...p, x: Math.round(p.x * 1e6) / 1e6, y: Math.round(p.y * 1e6) / 1e6 }));
  const ownLost = pieces.filter(p => p.out && p.side === state.turn).length;
  const otherLost = pieces.filter(p => p.out && p.side !== state.turn).length;
  next.revision++;
  next.lastShot = { id, dx, dy, ownLost, otherLost, revision: next.revision, duration: (steps + 1) * DT };
  next.history.push({ side: state.turn, notation: `№${id % 8 + 1} · −${otherLost}${ownLost ? ` / свои −${ownLost}` : ''}`, captured: otherLost });
  next.turn = state.turn === 'white' ? 'black' : 'white';
  const white = next.pieces.some(p => p.side === 'white'), black = next.pieces.some(p => p.side === 'black');
  if (!white || !black) { next.winner = white ? 'white' : black ? 'black' : 'draw'; next.reason = 'knockout'; }
  if (collectFrames) frames.push(next.pieces);
  return { game: next, frames, collisions };
}
export const applyShot = (state, id, dx, dy) => simulateShot(state, id, dx, dy).game;
