import { Chess } from './vendor/chess.js';

const values = { p: 1, n: 2, b: 3, r: 4, q: 5, k: 6 };
export const chessIndex = square => (8 - Number(square[1])) * 8 + square.charCodeAt(0) - 97;
const square = index => 'abcdefgh'[index % 8] + (8 - Math.floor(index / 8));
const positionKey = engine => engine.fen().split(' ').slice(0, 4).join(' ');
function position(engine) {
  return { fen: engine.fen(), board: engine.board().flat().map(p => p ? values[p.type] * (p.color === 'w' ? 1 : -1) : 0), turn: engine.turn() === 'w' ? 'white' : 'black', check: engine.isCheck() };
}
export function newChess(fen) {
  const engine = new Chess(fen);
  return { variant: 'chess', ...position(engine), forced: null, captured: [], path: [], history: [], winner: null, reason: null, revision: 0, repetitions: { [positionKey(engine)]: 1 } };
}
export function chessMoves(game) {
  if (game.winner) return [];
  return new Chess(game.fen).moves({ verbose: true }).map(move => ({
    from: chessIndex(move.from), to: chessIndex(move.to), promotion: move.promotion,
    capture: move.isEnPassant() ? chessIndex(move.to) + (move.color === 'w' ? 8 : -8) : move.captured ? chessIndex(move.to) : null
  }));
}
export function moveChess(state, from, to, promotion) {
  if (!Number.isInteger(from) || !Number.isInteger(to) || !chessMoves(state).some(m => m.from === from && m.to === to && m.promotion === promotion)) {
    throw new Error('Этот ход недоступен. Выберите подсвеченную клетку.');
  }
  const engine = new Chess(state.fen);
  const move = engine.move({ from: square(from), to: square(to), ...(promotion ? { promotion } : {}) });
  const game = { ...structuredClone(state), ...position(engine), revision: state.revision + 1 };
  game.history.push({ side: state.turn, notation: move.san, from, to, captured: move.captured ? 1 : 0, ...(promotion ? { promotion } : {}) });
  const key = positionKey(engine);
  game.repetitions[key] = (game.repetitions[key] || 0) + 1;
  if (engine.isCheckmate()) { game.winner = state.turn; game.reason = 'checkmate'; }
  else if (engine.isStalemate()) { game.winner = 'draw'; game.reason = 'stalemate'; }
  else if (engine.isInsufficientMaterial()) { game.winner = 'draw'; game.reason = 'material'; }
  else if (engine.isDrawByFiftyMoves()) { game.winner = 'draw'; game.reason = 'fifty-moves'; }
  else if (game.repetitions[key] >= 3) { game.winner = 'draw'; game.reason = 'repetition'; }
  return game;
}
