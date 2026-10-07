// Shared, deterministic Russian draughts rules. Positive pieces are white;
// negative are black. Absolute value 2 denotes a flying king.
export const sideOf = piece => piece > 0 ? 'white' : piece < 0 ? 'black' : null;
export const opposite = side => side === 'white' ? 'black' : 'white';
const directions = [[-1, -1], [-1, 1], [1, -1], [1, 1]];
const inside = (r, c) => r >= 0 && r < 8 && c >= 0 && c < 8;
const crown = (piece, row) => (piece === 1 && row === 0) || (piece === -1 && row === 7) ? piece * 2 : piece;
export const squareName = index => 'abcdefgh'[index % 8] + (8 - Math.floor(index / 8));
const positionKey = game => game.board.join(',') + ':' + game.turn;

export function newGame() {
  const board = Array.from({ length: 64 }, (_, i) => {
    const row = Math.floor(i / 8), col = i % 8;
    return (row + col) % 2 === 0 ? 0 : row < 3 ? -1 : row > 4 ? 1 : 0;
  });
  const game = { board, turn: 'white', forced: null, captured: [], path: [], history: [], winner: null, reason: null, revision: 0, repetitions: {} };
  game.repetitions[positionKey(game)] = 1;
  return game;
}

function capturesFrom(board, from, captured) {
  const piece = board[from], r = Math.floor(from / 8), c = from % 8, moves = [];
  for (const [dr, dc] of directions) {
    let row = r + dr, col = c + dc;
    if (Math.abs(piece) === 1) {
      const targetR = r + dr * 2, targetC = c + dc * 2;
      const over = row * 8 + col;
      if (inside(targetR, targetC) && board[over] && sideOf(board[over]) !== sideOf(piece) && !captured.includes(over) && !board[targetR * 8 + targetC]) {
        moves.push({ from, to: targetR * 8 + targetC, capture: over });
      }
    } else {
      let over = null;
      while (inside(row, col)) {
        const index = row * 8 + col;
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
  if (game.winner) return [];
  if (game.forced !== null) return capturesFrom(game.board, game.forced, game.captured);
  const pieces = game.board.map((p, i) => sideOf(p) === game.turn ? i : -1).filter(i => i >= 0);
  const captures = pieces.flatMap(from => capturesFrom(game.board, from, []));
  if (captures.length) return captures;
  const moves = [];
  for (const from of pieces) {
    const piece = game.board[from], r = Math.floor(from / 8), c = from % 8;
    for (const [dr, dc] of directions) {
      if (Math.abs(piece) === 1 && dr !== (piece > 0 ? -1 : 1)) continue;
      let row = r + dr, col = c + dc;
      while (inside(row, col) && !game.board[row * 8 + col]) {
        moves.push({ from, to: row * 8 + col, capture: null });
        if (Math.abs(piece) === 1) break;
        row += dr; col += dc;
      }
    }
  }
  return moves;
}

export function applyMove(state, from, to) {
  const move = legalMoves(state).find(m => m.from === from && m.to === to);
  if (!move) throw new Error('Этот ход недоступен. Выберите подсвеченную клетку.');
  const game = structuredClone(state);
  const piece = game.board[from];
  game.board[from] = 0;
  game.board[to] = crown(piece, Math.floor(to / 8));
  game.revision++;
  if (!game.path.length) game.path.push(from);
  game.path.push(to);
  if (move.capture !== null) {
    game.captured.push(move.capture);
    game.forced = to;
    if (capturesFrom(game.board, to, game.captured).length) return game;
  }
  const notation = game.path.map(squareName).join(game.captured.length ? ':' : '–');
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
