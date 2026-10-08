import { test } from 'node:test';
import assert from 'node:assert/strict';
import { newGame, legalMoves, applyMove } from '../public/game.js';
import { newChess, chessIndex as at } from '../public/chess-game.js';
import { transitionSounds } from '../public/sounds.js';
const move = (g, from, to, promotion) => applyMove(g, at(from), at(to), promotion);

test('chess starts with 32 pieces, 20 moves, and rejects illegal moves', () => {
  const g = newGame('chess');
  assert.equal(g.board.filter(Boolean).length, 32); assert.equal(legalMoves(g).length, 20);
  assert.throws(() => move(g, 'e2', 'e5')); assert.throws(() => move(g, 'a7', 'a6'));
  const next = move(g, 'e2', 'e4'); assert.equal(next.history[0].notation, 'e4'); assert.equal(next.turn, 'black');
  assert.equal(g.board[at('e2')], 1); assert.deepEqual(transitionSounds(g, next), ['move']);
});
test('checkmate ends the game; a king may not remain in check', () => {
  let g = newGame('chess');
  for (const [a,b] of [['f2','f3'],['e7','e5'],['g2','g4'],['d8','h4']]) g = move(g,a,b);
  assert.equal(g.winner,'black'); assert.equal(g.reason,'checkmate'); assert.equal(g.check,true);
  assert.deepEqual(legalMoves(g),[]); assert.throws(() => move(g,'a2','a3'));
  const checked = newChess('4k3/8/8/8/8/8/4r3/R3K3 w Q - 0 1');
  assert.throws(() => move(checked,'a1','a2'));
});
test('castling moves both pieces and disallows castling through check', () => {
  const g = newChess('r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1');
  const next = move(g,'e1','g1'); assert.equal(next.board[at('f1')],4); assert.equal(next.board[at('h1')],0);
  assert.equal(next.history[0].notation,'O-O');
  assert.throws(() => move(newChess('4kr2/8/8/8/8/8/8/4K2R w K - 0 1'),'e1','g1'));
});
test('en passant expires after one move and removes the captured pawn', () => {
  const g = newChess('4k3/3p4/8/4P3/8/8/8/4K3 b - - 0 1');
  const ready = move(g,'d7','d5'), taken = move(ready,'e5','d6');
  assert.equal(taken.board[at('d5')],0); assert.equal(taken.history[1].captured,1);
  assert.deepEqual(transitionSounds(ready,taken),['capture']);
  const expired = move(move(ready,'e1','f1'),'e8','f8'); assert.throws(() => move(expired,'e5','d6'));
});
test('a quiet chess move does not sound like another available capture', () => {
  const g = newChess('4k3/8/8/8/p7/8/8/R3K3 w - - 0 1');
  assert.deepEqual(transitionSounds(g,move(g,'a1','b1')),['move']);
});
test('promotion requires a choice and supports underpromotion', () => {
  const g = newChess('4k3/P7/8/8/8/8/8/4K3 w - - 0 1');
  assert.throws(() => move(g,'a7','a8')); assert.throws(() => move(g,'a7','a8','k'));
  for (const [promotion,value] of [['q',5],['r',4],['b',3],['n',2]]) {
    const next=move(g,'a7','a8',promotion); assert.equal(next.board[0],value); assert.ok(transitionSounds(g,next).includes('promotion'));
  }
});
test('stalemate, insufficient material, fifty moves and repetition are draws', () => {
  assert.equal(move(newChess('7k/5K2/8/6Q1/8/8/8/8 w - - 0 1'),'g5','g6').reason,'stalemate');
  assert.equal(move(newChess('4k3/8/8/8/8/8/4b3/4K3 w - - 0 1'),'e1','e2').reason,'material');
  assert.equal(move(newChess('4k3/8/8/8/8/8/8/R3K3 w - - 99 70'),'a1','a2').reason,'fifty-moves');
  let g=newGame('chess');
  for(let i=0;i<2;i++) for(const [a,b] of [['g1','f3'],['g8','f6'],['f3','g1'],['f6','g8']]) g=move(JSON.parse(JSON.stringify(g)),a,b);
  assert.equal(g.reason,'repetition'); assert.equal(g.winner,'draw');
});
