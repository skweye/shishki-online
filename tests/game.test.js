import { test } from 'node:test';
import assert from 'node:assert/strict';
import { newGame, legalMoves, applyMove, squareName, sideOf } from '../public/game.js';

const index = name => (8 - Number(name[1])) * 8 + 'abcdefgh'.indexOf(name[0]);
function position(pieces, turn = 'white') {
  const game = newGame(); game.board.fill(0); game.turn = turn; game.repetitions = {};
  for (const [name, piece] of Object.entries(pieces)) game.board[index(name)] = piece;
  return game;
}
const move = (game, from, to) => applyMove(game, index(from), index(to));

test('initial position has 12 pieces per side and 7 legal white moves', () => {
  const game = newGame();
  assert.equal(game.board.filter(p => p === 1).length, 12);
  assert.equal(game.board.filter(p => p === -1).length, 12);
  assert.equal(legalMoves(game).length, 7);
  assert.equal(squareName(56), 'a1');
  assert.equal(squareName(7), 'h8');
});
test('normal move switches turn and leaves input immutable', () => {
  const game = newGame(), next = move(game, 'c3', 'd4');
  assert.equal(game.board[index('c3')], 1);
  assert.equal(next.board[index('c3')], 0);
  assert.equal(next.turn, 'black');
  assert.equal(next.history[0].notation, 'c3–d4');
  assert.equal(next.revision, 1);
});
test('simple pieces cannot move backward or move opponents', () => {
  const game = position({ d4: 1, h8: -1 });
  assert.throws(() => move(game, 'd4', 'c3'));
  assert.throws(() => move(game, 'h8', 'g7'));
  assert.throws(() => applyMove(game, -1, 400));
});
test('captures are mandatory across the whole board, including backward captures', () => {
  const game = position({ d4: 1, c3: -1, h2: 1, a7: -1 });
  assert.deepEqual(legalMoves(game), [{ from: index('d4'), to: index('b2'), capture: index('c3') }]);
  assert.throws(() => move(game, 'h2', 'g3'));
  assert.equal(move(game, 'd4', 'b2').board[index('c3')], 0);
});
test('multi-capture locks the piece, retains captured blockers, and records one turn', () => {
  const game = position({ b2: 1, c3: -1, e5: -1, h8: -1, h2: 1 });
  const partial = move(game, 'b2', 'd4');
  assert.equal(partial.forced, index('d4'));
  assert.equal(partial.turn, 'white');
  assert.equal(partial.board[index('c3')], -1);
  assert.equal(partial.history.length, 0);
  assert.throws(() => move(partial, 'h2', 'g3'));
  const done = move(partial, 'd4', 'f6');
  assert.equal(done.turn, 'black');
  assert.equal(done.board[index('c3')], 0);
  assert.equal(done.board[index('e5')], 0);
  assert.equal(done.history[0].notation, 'b2:d4:f6');
});
test('flying kings choose any open landing beyond a victim', () => {
  const game = position({ b2: 2, d4: -1 });
  assert.deepEqual(legalMoves(game).map(m => squareName(m.to)), ['e5', 'f6', 'g7', 'h8']);
});
test('captured pieces block a king from reversing through them', () => {
  const game = position({ d4: 2, c3: -1, e5: -1 });
  const next = move(game, 'd4', 'b2');
  assert.equal(next.forced, null);
  assert.equal(next.turn, 'black');
  assert.equal(next.board[index('e5')], -1);
});
test('promotion during a capture immediately enables flying king captures', () => {
  const game = position({ b6: 1, c7: -1, f6: -1, a1: -1 });
  const next = move(game, 'b6', 'd8');
  assert.equal(next.board[index('d8')], 2);
  assert.equal(next.forced, index('d8'));
  assert.deepEqual(legalMoves(next).map(m => squareName(m.to)), ['g5', 'h4']);
  assert.equal(move(next, 'd8', 'h4').board[index('h4')], 2);
});
test('either capture branch is legal without a maximum-capture rule', () => {
  const game = position({ d4: 1, c5: -1, e5: -1, g7: -1 });
  assert.deepEqual(legalMoves(game).map(m => squareName(m.to)), ['b6', 'f6']);
});
test('ordinary promotion and immobilization victory', () => {
  const game = position({ b6: 1, h2: -1 });
  const next = move(game, 'b6', 'a7');
  assert.equal(next.winner, null);
  const blocked = position({ b6: 1, a1: -1 });
  assert.equal(move(blocked, 'b6', 'a7').winner, 'white');
  assert.equal(move(position({ b6: -1, h2: 1 }, 'black'), 'b6', 'a5').turn, 'white');
  assert.equal(move(position({ b6: 1, a7: 1, h2: -1 }), 'a7', 'b8').board[index('b8')], 2);
});
test('taking the final enemy wins and prevents later moves', () => {
  const won = move(position({ b2: 1, c3: -1 }), 'b2', 'd4');
  assert.equal(won.winner, 'white');
  assert.deepEqual(legalMoves(won), []);
  assert.throws(() => move(won, 'd4', 'e5'));
});
test('threefold repetition ends the game in a draw', () => {
  let game = position({ a1: 2, h6: -2 });
  for (let i = 0; i < 3 && !game.winner; i++) {
    for (const [from, to] of [['a1', 'b2'], ['h6', 'g5'], ['b2', 'a1'], ['g5', 'h6']]) {
      if (!game.winner) game = move(game, from, to);
    }
  }
  assert.equal(game.winner, 'draw'); assert.equal(game.reason, 'repetition');
});
test('deterministic simulated games preserve board and turn invariants', () => {
  let seed = 42;
  for (let round = 0; round < 20; round++) {
    let game = newGame();
    for (let step = 0; step < 250 && !game.winner; step++) {
      const moves = legalMoves(game);
      assert.ok(moves.length);
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      const picked = moves[seed % moves.length], before = game.board.filter(Boolean).length;
      assert.equal(sideOf(game.board[picked.from]), game.turn);
      game = applyMove(game, picked.from, picked.to);
      assert.ok(game.board.filter(Boolean).length <= before);
      game.board.forEach((piece, i) => {
        assert.ok([-2, -1, 0, 1, 2].includes(piece));
        if (piece) assert.equal((Math.floor(i / 8) + i % 8) % 2, 1);
      });
    }
  }
});
