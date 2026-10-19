import { legalMoves, applyMove, boardSize, sideOf } from '../public/game.js';
import { Chess } from '../public/vendor/chess.js';
import { chessIndex } from '../public/chess-game.js';
import { nardeMoves, nardeProgress } from '../public/narde.js';
import { isDurak, durakActions, durakView, rank, suit } from '../public/durak.js';
import { DOMINOES, dominoMoves, dominoView } from '../public/domino.js';
import { battleshipView, randomFleet, FLEET } from '../public/battleship.js';
import { simulateShot } from '../public/chapaev.js';
import { TABLE, POCKETS, poolTargets, validCuePosition, simulatePool, resolvePool } from '../public/pool.js';

// Decisions receive exactly the information available to the bot's seat.
// Never inspect an opponent's hand, unrevealed fleet or the draw pile.
export function botView(game, side) {
  return durakView(dominoView(battleshipView(game, side), side), side);
}
const best = (items, score, random) => items.map(item => ({ item, score: score(item), tie: random() }))
  .sort((a, b) => b.score - a.score || b.tie - a.tie)[0]?.item;

export function chooseBotAction(game, side = 'black', random = Math.random) {
  const g = botView(game, side);
  if (g.winner) return null;
  if (g.variant === 'battleship' && g.phase === 'setup') return g.ready[side] ? null : { type: 'fleet-ready', fleet: randomFleet() };
  if (g.variant === 'domino' && g.roundResult) return g.readyNext.includes(side) ? null : { type: 'domino-ready' };
  if (g.turn !== side) return null;
  if (isDurak(g.variant)) return durak(g, side, random);
  if (g.variant === 'domino') return domino(g, side, random);
  if (g.variant === 'battleship') return sea(g, side, random);
  if (g.variant === 'narde') {
    if (!g.dice.length) return { type: 'roll' };
    const move = best(nardeMoves(g), m => (m.to === 24 ? 150 : 0) + m.die * 3 +
      (m.to !== 24 && !g.board[m.to] ? 8 : 0) + (nardeProgress(m.from, side) === 0 ? 7 : 0) -
      (m.to !== 24 ? Math.abs(g.board[m.to]) : 0), random);
    return move ? { type: 'move', from: move.from, to: move.to } : null;
  }
  if (g.variant === 'chess') return chess(g, random);
  if (g.variant === 'chapaev') return chapaev(g, side, random);
  if (g.variant === 'pool8') return pool(g, random);
  return draughts(g, side, random);
}

function draughts(g, side, random) {
  const size = boardSize(g);
  function value(state) {
    if (state.winner) return state.winner === 'draw' ? 0 : state.winner === side ? 100000 : -100000;
    return state.board.reduce((sum, piece, index) => {
      if (!piece || state.captured.includes(index)) return sum;
      const row = Math.floor(index / size), progress = piece > 0 ? size - 1 - row : row;
      return sum + (sideOf(piece) === side ? 1 : -1) * (Math.abs(piece) === 2 ? 360 : 100 + progress * 3);
    }, 0);
  }
  let nodes = 0;
  function search(state, depth, alpha, beta) {
    if (!depth || state.winner || ++nodes > 700) return value(state);
    const maximize = state.turn === side;
    let result = maximize ? -Infinity : Infinity;
    for (const m of legalMoves(state)) {
      const score = search(applyMove(state, m.from, m.to), depth - 1, alpha, beta);
      result = maximize ? Math.max(result, score) : Math.min(result, score);
      if (maximize) alpha = Math.max(alpha, result); else beta = Math.min(beta, result);
      if (beta <= alpha) break;
    }
    return Number.isFinite(result) ? result : value(state);
  }
  const moves = legalMoves(g), depth = moves.length > 20 ? 1 : 2;
  const move = best(moves, m => search(applyMove(g, m.from, m.to), depth, -Infinity, Infinity), random);
  return move ? { type: 'move', from: move.from, to: move.to } : null;
}

const material = { p: 100, n: 320, b: 330, r: 500, q: 900, k: 0 };
function chess(g, random) {
  const engine = new Chess(g.fen), color = engine.turn();
  function evaluate() {
    let score = 0;
    for (const [r, row] of engine.board().entries()) for (const [c, piece] of row.entries()) if (piece) {
      const center = 7 - Math.abs(c - 3.5) - Math.abs(r - 3.5);
      const position = piece.type === 'p' ? (piece.color === 'w' ? 6 - r : r - 1) * 6 : ['n', 'b'].includes(piece.type) ? center * 7 : 0;
      score += (piece.color === color ? 1 : -1) * (material[piece.type] + position);
    }
    return score;
  }
  const order = moves => moves.sort((a, b) => (material[b.captured] || 0) + (b.promotion ? 800 : 0) - (material[a.captured] || 0) - (a.promotion ? 800 : 0));
  const roots = order(engine.moves({ verbose: true }));
  const chosen = best(roots, move => {
    engine.move(move);
    let score;
    if (move.san.endsWith('#')) score = 100000;
    else {
      const replies = order(engine.moves({ verbose: true }));
      score = replies.length ? Infinity : 0;
      for (const reply of replies) {
        engine.move(reply);
        score = Math.min(score, reply.san.endsWith('#') ? -100000 : evaluate());
        engine.undo();
      }
      if (move.isKingsideCastle() || move.isQueensideCastle()) score += 15;
    }
    engine.undo(); return score;
  }, random);
  return chosen ? { type: 'move', from: chessIndex(chosen.from), to: chessIndex(chosen.to), ...(chosen.promotion ? { promotion: chosen.promotion } : {}) } : null;
}

function durak(g, side, random) {
  const cost = card => rank(card) + (suit(card) === suit(g.trump) ? 15 : 0);
  return best(durakActions(g, side), a => {
    if (a.type === 'durak-take') return -100;
    if (a.type === 'durak-finish') return 0;
    if (a.type === 'durak-transfer') return 35 - cost(a.card);
    if (a.type === 'durak-defend') return 40 - cost(a.card);
    // Preserve high trumps when the opponent has already defended the table.
    return 18 - cost(a.card) + (!g.stockCount || g.taking || !g.table.length ? 15 : 0);
  }, random);
}
function domino(g, side, random) {
  const moves = dominoMoves(g, side);
  if (!moves.length) return { type: g.stockCount ? 'domino-draw' : 'domino-pass' };
  const move = best(moves, m => {
    const [a, b] = DOMINOES[m.id];
    const support = g.hands[side].filter(id => id !== m.id && DOMINOES[id].some(p => p === a || p === b)).length;
    return a + b + (a === b ? 4 : 0) + support;
  }, random);
  return { type: 'domino-play', ...move };
}
function sea(g, side, random) {
  const shots = g.shots[side], fired = new Set(shots.map(s => s.cell));
  const sunk = shots.filter(s => s.result === 'sunk').flatMap(s => s.sunkCells);
  const hits = shots.filter(s => s.result === 'hit' && !sunk.includes(s.cell)).map(s => s.cell);
  const adjacent = (a, b) => Math.abs(a % 10 - b % 10) + Math.abs(Math.floor(a / 10) - Math.floor(b / 10)) === 1;
  const remaining = [...FLEET];
  for (const s of shots.filter(s => s.result === 'sunk')) remaining.splice(remaining.indexOf(s.sunkCells.length), 1);
  const cells = Array.from({ length: 100 }, (_, i) => i).filter(cell => !fired.has(cell) && !sunk.some(s => Math.abs(s % 10 - cell % 10) <= 1 && Math.abs(Math.floor(s / 10) - Math.floor(cell / 10)) <= 1));
  const cell = best(cells, c => {
    let score = remaining.some(n => n > 1) && (c % 10 + Math.floor(c / 10)) % 2 === 0 ? 2 : 0;
    for (const h of hits) if (adjacent(c, h)) {
      score += 20;
      if (hits.some(h2 => h2 !== h && adjacent(h, h2) && (h % 10 === h2 % 10 ? c % 10 === h % 10 : Math.floor(c / 10) === Math.floor(h / 10)))) score += 40;
    }
    return score;
  }, random);
  return cell === undefined ? null : { type: 'sea-fire', cell };
}
function chapaev(g, side, random) {
  const candidates = [];
  for (const own of g.pieces.filter(p => p.side === side)) for (const target of g.pieces.filter(p => p.side !== side)) {
    const dx = target.x - own.x, dy = target.y - own.y, distance = Math.hypot(dx, dy);
    candidates.push({ own, dx: dx / distance, dy: dy / distance, distance });
  }
  const shots = candidates.sort((a, b) => a.distance - b.distance).slice(0, 8).flatMap(c => [.65, .9, 1].map(power => ({ type: 'shot', id: c.own.id, dx: c.dx * power, dy: c.dy * power })));
  return best(shots, a => {
    const { game } = simulateShot(g, a.id, a.dx, a.dy);
    if (game.winner) return game.winner === side ? 10000 : game.winner === 'draw' ? 0 : -10000;
    return game.lastShot.otherLost * 100 - game.lastShot.ownLost * 115 + game.pieces.filter(p => p.side === side).reduce((n, p) => n + Math.min(p.x, p.y, 8 - p.x, 8 - p.y), 0);
  }, random);
}

// Aim at a ghost-ball contact point. Reject paths obstructed by another ball.
function clearPath(a, b, balls, ignored) {
  const dx = b.x - a.x, dy = b.y - a.y, length2 = dx * dx + dy * dy;
  return balls.every(ball => {
    if (ignored.includes(ball.id)) return true;
    const t = Math.max(0, Math.min(1, ((ball.x - a.x) * dx + (ball.y - a.y) * dy) / length2));
    return Math.hypot(ball.x - a.x - t * dx, ball.y - a.y - t * dy) > TABLE.radius * 2 + .015;
  });
}
function pool(g, random) {
  const cue = g.balls.find(b => b.id === 0), targets = g.balls.filter(b => poolTargets(g).includes(b.id));
  if (g.ballInHand && (!cue || !validCuePosition(g, cue.x, cue.y))) {
    const positions = [];
    for (let x = 1; x < (g.ballInHand === 'kitchen' ? 5 : 20); x += .6) for (let y = 1; y < 9; y += .6) if (validCuePosition(g, x, y)) positions.push({ x, y });
    const point = best(positions, p => -Math.min(...targets.map(t => Math.hypot(p.x - t.x, p.y - t.y))), random);
    return point ? { type: 'pool-place', ...point } : null;
  }
  const candidates = [];
  const impulse = (point, power) => {
    const dx = point.x - cue.x, dy = point.y - cue.y, distance = Math.hypot(dx, dy);
    return { type: 'pool-shot', dx: dx / distance * power, dy: dy / distance * power };
  };
  for (const target of targets) {
    if (g.ballInHand === 'kitchen' && target.x < 5) continue;
    for (const pocket of POCKETS) {
      const d = Math.hypot(pocket.x - target.x, pocket.y - target.y);
      const ux = (pocket.x - target.x) / d, uy = (pocket.y - target.y) / d;
      const ghost = { x: target.x - ux * 2 * TABLE.radius, y: target.y - uy * 2 * TABLE.radius };
      const travel = Math.hypot(ghost.x - cue.x, ghost.y - cue.y);
      const alignment = ((ghost.x - cue.x) * ux + (ghost.y - cue.y) * uy) / travel;
      if (alignment < .35 || !clearPath(cue, ghost, g.balls, [0, target.id]) || !clearPath(target, pocket, g.balls, [0, target.id])) continue;
      candidates.push({ action: impulse(ghost, Math.min(.8, Math.max(.3, Math.sqrt(2 * 5 * (travel + d / alignment + 2)) / 36))), rank: alignment * 20 - travel - d });
    }
    candidates.push({ action: impulse(target, g.breaking ? .95 : .55), rank: -30 - Math.hypot(target.x - cue.x, target.y - cue.y) });
  }
  // A legal kick shot is still possible when all direct targets are in the kitchen.
  if (!candidates.length) candidates.push({ action: impulse({ x: 19.5, y: 5 }, .75), rank: 0 });
  return best(candidates.sort((a, b) => b.rank - a.rank).slice(0, 8), candidate => {
    const a = candidate.action, next = resolvePool(g, simulatePool(g, a.dx, a.dy), a);
    if (next.winner) return next.winner === g.turn ? 100000 : -100000;
    return (next.foul ? -500 : 0) + next.lastShot.potted.filter(b => targets.some(t => t.id === b.id)).length * 150 + candidate.rank;
  }, random).action;
}
