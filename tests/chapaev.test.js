import { test } from 'node:test';
import assert from 'node:assert/strict';
import { newGame, applyMove, legalMoves } from '../public/game.js';
import { applyShot, simulateShot, nextChapaevRound, roundAdvance } from '../public/chapaev.js';
import { matchResult } from '../public/match-result.js';
import { transitionSounds } from '../public/sounds.js';

test('Chapaev starts with eight pieces per edge and accepts no draughts moves', () => {
  const game = newGame('chapaev');
  assert.equal(game.pieces.length, 16);
  assert.equal(game.pieces.filter(p => p.side === 'white' && p.y === 7.5).length, 8);
  assert.equal(game.pieces.filter(p => p.side === 'black' && p.y === .5).length, 8);
  assert.deepEqual(legalMoves(game), []);
  assert.throws(() => applyMove(game, 56, 48));
  assert.throws(() => applyShot(newGame(), 0, 0, -.5));
});
test('collisions knock enemies off, preserve the input and pass the turn even after a successful shot', () => {
  const game = newGame('chapaev'), before = structuredClone(game);
  const result = simulateShot(game, 3, 0, -.65, true);
  assert.deepEqual(game, before);
  assert.equal(result.game.pieces.length, 15);
  assert.equal(result.game.lastShot.otherLost, 1); assert.equal(result.game.lastShot.ownLost, 0);
  assert.equal(result.game.turn, 'black'); assert.equal(result.game.revision, 1);
  assert.throws(() => applyShot(result.game, 3, 0, -.65));
  assert.deepEqual(result.frames.at(-1), result.game.pieces);
  assert.ok(result.collisions.length > 0);
  assert.deepEqual(result.game, applyShot(before, 3, 0, -.65));
  assert.deepEqual(transitionSounds(before, result.game), ['capture']);
});
test('misses and self knockouts pass the turn and illegal impulses are rejected', () => {
  const game = newGame('chapaev');
  const miss = applyShot(game, 3, 0, -.1); assert.equal(miss.turn, 'black');
  const own = applyShot(game, 3, 0, 1);
  assert.equal(own.lastShot.ownLost, 1); assert.equal(own.turn, 'black');
  for (const vector of [[NaN, 0], [Infinity, 0], [0, 0], [.8, .8], ['0', -.5], [null, -.5]]) assert.throws(() => applyShot(game, 3, ...vector));
  assert.throws(() => applyShot(game, 8, 0, 1));
  assert.throws(() => applyShot(game, '3', 0, -.5));
  assert.throws(() => applyShot({ ...game, winner: 'white' }, 3, 0, -.5));
});
test('a round finishes when a side has no pieces; simultaneous losses are a draw', () => {
  const game = newGame('chapaev');
  game.pieces = [{ id: 0, side: 'white', x: 2, y: 7.5 }, { id: 8, side: 'black', x: 2, y: .5 }];
  const won = applyShot(game, 0, 0, -.65);
  assert.equal(won.winner, 'white'); assert.equal(won.reason, 'round');
  assert.deepEqual(won.score, { white: 1, black: 0 });
  const next = nextChapaevRound(won);
  assert.deepEqual(next.rows, { white: 6, black: 0 });
  assert.equal(next.round, 2); assert.equal(next.pieces.length, 16); assert.equal(next.turn, 'black');
  assert.equal(next.winner, null); assert.equal(next.revision, won.revision + 1);
  assert.match(matchResult(won).text, /продвигаются/);
  game.pieces = [{ id: 0, side: 'white', x: 6.8, y: .2 }, { id: 8, side: 'black', x: 7.5, y: .2 }];
  assert.equal(applyShot(game, 0, Math.SQRT1_2, -Math.SQRT1_2).winner, 'draw');
});
test('round wins move each side forward, push the opponent when adjacent, and end at the edge', () => {
  for (const winner of ['white', 'black']) {
    const loser = winner === 'white' ? 'black' : 'white';
    const game = { ...newGame('chapaev'), winner, reason: 'round', rows: { white: 4, black: 3 } };
    const moved = nextChapaevRound(game);
    assert.equal(moved.rows[winner], game.rows[winner]);
    assert.equal(moved.rows[loser], game.rows[loser] + (winner === 'white' ? -1 : 1));
    assert.match(matchResult(game).text, /отступают/);
    game.rows = winner === 'white' ? { white: 1, black: 0 } : { white: 7, black: 6 };
    assert.equal(roundAdvance(game).finished, true);
    assert.throws(() => nextChapaevRound(game));
    game.winner = null; game.reason = null; game.turn = winner;
    game.pieces = [{ id: 0, side: winner, x: 2, y: 7.5 }, { id: 8, side: loser, x: 2, y: .5 }];
    const final = applyShot(game, 0, 0, -.65);
    assert.equal(final.winner, winner); assert.equal(final.reason, 'territory');
    assert.match(matchResult(final).text, /край доски/);
  }
  const black = nextChapaevRound({ ...newGame('chapaev'), winner: 'black', reason: 'round' });
  assert.deepEqual(black.rows, { white: 7, black: 1 });
});
test('drawn rounds restore both lines without advancing; old saves gain round state', () => {
  const state = { ...newGame('chapaev'), winner: 'draw', reason: 'round', rows: { white: 4, black: 2 }, turn: 'black' };
  const next = nextChapaevRound(state);
  assert.deepEqual(next.rows, state.rows); assert.equal(next.turn, 'black'); assert.equal(next.pieces.length, 16);
  assert.deepEqual(next.score, { white: 0, black: 0 });
  const old = { ...newGame('chapaev'), winner: 'white', reason: 'round' };
  delete old.rows; delete old.round; delete old.score;
  assert.deepEqual(nextChapaevRound(old).rows, { white: 6, black: 0 });
  assert.throws(() => nextChapaevRound(newGame('chapaev')));
});
test('bounded deterministic simulations keep surviving pieces finite and on the board', () => {
  let seed = 73;
  const random = () => ((seed = Math.imul(seed, 1664525) + 1013904223 >>> 0) / 2 ** 32);
  for (let round = 0; round < 8; round++) {
    let game = newGame('chapaev');
    for (let turn = 0; turn < 70 && !game.winner; turn++) {
      const pieces = game.pieces.filter(p => p.side === game.turn), piece = pieces[Math.floor(random() * pieces.length)];
      const angle = random() * Math.PI * 2, force = .05 + random() * .95;
      const previousTurn = game.turn;
      game = applyShot(game, piece.id, Math.sin(angle) * force, Math.cos(angle) * force);
      assert.equal(game.turn, previousTurn === 'white' ? 'black' : 'white');
      assert.ok(game.lastShot.duration <= 6.01);
      assert.ok(game.pieces.every(p => Number.isFinite(p.x) && Number.isFinite(p.y) && p.x >= 0 && p.x <= 8 && p.y >= 0 && p.y <= 8));
      assert.equal(new Set(game.pieces.map(p => p.id)).size, game.pieces.length);
    }
  }
});
