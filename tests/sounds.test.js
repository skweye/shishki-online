import { test } from 'node:test';
import assert from 'node:assert/strict';
import { newGame, applyMove } from '../public/game.js';
import { transitionSounds } from '../public/sounds.js';
test('confirmed moves and captures use different sounds', () => {
  const game=newGame(), moved=applyMove(game,42,35);
  assert.deepEqual(transitionSounds(game,moved),['move']);
  const capture=newGame(); capture.board.fill(0); capture.board[42]=1; capture.board[35]=-1; capture.board[7]=-1;
  assert.deepEqual(transitionSounds(capture,applyMove(capture,42,28)),['capture']);
});
test('promotion, results and rematches have their own sounds', () => {
  const game=newGame(); game.board.fill(0); game.board[17]=1; game.board[10]=-1;
  const won=applyMove(game,17,3);
  assert.deepEqual(transitionSounds(game,won,'white'),['capture','promotion','victory']);
  assert.deepEqual(transitionSounds(game,won,'black'),['capture','promotion','defeat']);
  const draw={...game,winner:'draw',reason:'agreement',revision:1};
  assert.deepEqual(transitionSounds(game,draw),['draw']);
  const rematch=newGame(); rematch.revision=2;
  assert.deepEqual(transitionSounds(draw,rematch),['start']);
});
test('repeated snapshots and restored history do not replay sounds', () => {
  const game=newGame(), next=applyMove(game,42,35);
  assert.deepEqual(transitionSounds(next,next),[]);
  next.revision=5; assert.deepEqual(transitionSounds(game,next),[]);
});
