// Shared, deterministic Russian draughts rules. Positive pieces are white;
// negative are black. Absolute value 2 denotes a flying king.
import { newChapaev } from './chapaev.js';
import { newNarde, nardeMoves, moveNarde } from './narde.js';
import { newChess, chessMoves, moveChess } from './chess-game.js';
export const sideOf = piece => piece > 0 ? 'white' : piece < 0 ? 'black' : null;
export const opposite = side => side === 'white' ? 'black' : 'white';
const directions = [[-1, -1], [-1, 1], [1, -1], [1, 1]];
export const VARIANTS = Object.freeze({
  russian: { name: 'Русские шашки', size: 8, rows: 3 },
  russian12: { name: 'Русские шашки 12×12', size: 12, rows: 5 },
  chapaev: { name: 'Шашки Чапаева', size: 8, rows: 1 },
  chess: { name: 'Шахматы', size: 8, rows: 2 },
  narde: { name: 'Длинные нарды', size: 24, points: 24 }
});
export const validVariant = variant => typeof variant === 'string' && Object.hasOwn(VARIANTS, variant);
export const variantOf = game => game.variant || 'russian';
export const boardSize = game => VARIANTS[variantOf(game)].size;
const inside = (r, c, size) => r >= 0 && r < size && c >= 0 && c < size;
const crown = (piece, row, size) => (piece === 1 && row === 0) || (piece === -1 && row === size - 1) ? piece * 2 : piece;
export const squareName = (index, size = 8) => 'abcdefghijkl'[index % size] + (size - Math.floor(index / size));
const positionKey = game => game.board.join(',') + ':' + game.turn;

export function newGame(variant = 'russian') {
  if (!validVariant(variant)) throw new Error('Неизвестный режим игры.');
  if (variant === 'chapaev') return newChapaev();
  if (variant === 'chess') return newChess();
  if (variant === 'narde') return newNarde();
  const { size, rows } = VARIANTS[variant];
  const board = Array.from({ length: size * size }, (_, i) => {
    const row = Math.floor(i / size), col = i % size;
    return (row + col) % 2 === 0 ? 0 : row < rows ? -1 : row >= size - rows ? 1 : 0;
  });
  const game = { variant, board, turn: 'white', forced: null, captured: [], path: [], history: [], winner: null, reason: null, revision: 0, repetitions: {} };
  game.repetitions[positionKey(game)] = 1;
  return game;
}

function capturesFrom(board, from, captured, size) {
  const piece = board[from], r = Math.floor(from / size), c = from % size, moves = [];
  for (const [dr, dc] of directions) {
    let row = r + dr, col = c + dc;
    if (Math.abs(piece) === 1) {
      const targetR = r + dr * 2, targetC = c + dc * 2;
      const over = row * size + col;
      if (inside(targetR, targetC, size) && board[over] && sideOf(board[over]) !== sideOf(piece) && !captured.includes(over) && !board[targetR * size + targetC]) {
        moves.push({ from, to: targetR * size + targetC, capture: over });
      }
    } else {
      let over = null;
      while (inside(row, col, size)) {
        const index = row * size + col;
        if (board[index]) {
          // Captured pieces remain blockers until the entire turn is complete.
          if (over !== null || sideOf(board[index]) === sideOf(piece) || captured.includes(index)) break;
          over = index;
        } else if (over !== null) moves.push({ from, to: index, capture: over });
        row += dr; col += dc;
      }
    }
  }
  return moves;
}

export function legalMoves(game) {
  if (variantOf(game) === 'narde') return nardeMoves(game);
  if (variantOf(game) === 'chess') return chessMoves(game);
  if (variantOf(game) === 'chapaev') return [];
  if (game.winner) return [];
  const size = boardSize(game);
  if (game.forced !== null) return capturesFrom(game.board, game.forced, game.captured, size);
  const pieces = game.board.map((p, i) => sideOf(p) === game.turn ? i : -1).filter(i => i >= 0);
  const captures = pieces.flatMap(from => capturesFrom(game.board, from, [], size));
  if (captures.length) return captures;
  const moves = [];
  for (const from of pieces) {
    const piece = game.board[from], r = Math.floor(from / size), c = from % size;
    for (const [dr, dc] of directions) {
      if (Math.abs(piece) === 1 && dr !== (piece > 0 ? -1 : 1)) continue;
      let row = r + dr, col = c + dc;
      while (inside(row, col, size) && !game.board[row * size + col]) {
        moves.push({ from, to: row * size + col, capture: null });
        if (Math.abs(piece) === 1) break;
        row += dr; col += dc;
      }
    }
  }
  return moves;
}

export function applyMove(state, from, to, promotion) {
  if (variantOf(state) === 'narde') return moveNarde(state, from, to, promotion);
  if (variantOf(state) === 'chess') return moveChess(state, from, to, promotion);
  const move = legalMoves(state).find(m => m.from === from && m.to === to);
  if (!move) throw new Error('Этот ход недоступен. Выберите подсвеченную клетку.');
  const game = structuredClone(state);
  const size = boardSize(game);
  const piece = game.board[from];
  game.board[from] = 0;
  game.board[to] = crown(piece, Math.floor(to / size), size);
  game.revision++;
  if (!game.path.length) game.path.push(from);
  game.path.push(to);
  if (move.capture !== null) {
    game.captured.push(move.capture);
    game.forced = to;
    if (capturesFrom(game.board, to, game.captured, size).length) return game;
  }
  const notation = game.path.map(index => squareName(index, size)).join(game.captured.length ? ':' : '–');
  game.history.push({ side: game.turn, notation, from: game.path[0], to, captured: game.captured.length });
  for (const index of game.captured) game.board[index] = 0;
  game.forced = null; game.captured = []; game.path = [];
  game.turn = opposite(game.turn);
  if (!legalMoves(game).length) {
    game.winner = opposite(game.turn); game.reason = 'no-moves';
  }
  const key = positionKey(game);
  game.repetitions[key] = (game.repetitions[key] || 0) + 1;
  if (!game.winner && game.repetitions[key] >= 3) { game.winner = 'draw'; game.reason = 'repetition'; }
  return game;
}
