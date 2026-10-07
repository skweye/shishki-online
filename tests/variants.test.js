import { test } from 'node:test';
import assert from 'node:assert/strict';
import { newGame, legalMoves, applyMove, squareName, boardSize } from '../public/game.js';
const at = name => (12 - Number(name.slice(1))) * 12 + 'abcdefghijkl'.indexOf(name[0]);
function position(pieces, turn='white') {
  const game = newGame('russian12'); game.board.fill(0); game.turn=turn; game.repetitions={};
  for (const [name,piece] of Object.entries(pieces)) game.board[at(name)]=piece;
  return game;
}

test('12x12 starts with 30 pieces each, 11 moves, and correct edge coordinates', () => {
  const game=newGame('russian12');
  assert.equal(boardSize(game),12); assert.equal(game.board.length,144);
  assert.equal(game.board.filter(p=>p===1).length,30); assert.equal(game.board.filter(p=>p===-1).length,30);
  assert.equal(legalMoves(game).length,11);
  assert.equal(squareName(0,12),'a12'); assert.equal(squareName(143,12),'l1');
  const next=applyMove(game,at('c5'),at('d6'));
  assert.equal(next.history[0].notation,'c5–d6'); assert.equal(next.turn,'black');
  assert.equal(game.board[at('c5')],1);
});
test('12x12 requires backward captures and prevents row wrapping', () => {
  const game=position({d6:1,c5:-1,a1:-1,j2:1});
  assert.deepEqual(legalMoves(game),[{from:at('d6'),to:at('b4'),capture:at('c5')}]);
  assert.throws(()=>applyMove(game,at('j2'),at('k3')));
  const edge=position({l4:1,a11:-1});
  assert.deepEqual(legalMoves(edge).map(m=>squareName(m.to,12)),['k5']);
  assert.throws(()=>applyMove(edge,at('l4'),144));
});
test('12x12 crowns during a capture and continues with a flying king', () => {
  let game=position({c10:1,d11:-1,g10:-1,a2:-1});
  game=applyMove(game,at('c10'),at('e12'));
  assert.equal(game.board[at('e12')],2); assert.equal(game.forced,at('e12'));
  assert.equal(game.board[at('d11')],-1);
  assert.ok(legalMoves(game).some(m=>m.to===at('h9')));
  game=applyMove(game,at('e12'),at('h9'));
  assert.equal(game.forced,null); assert.equal(game.board[at('d11')],0); assert.equal(game.board[at('g10')],0);
  assert.equal(game.history[0].notation,'c10:e12:h9');
  const black=applyMove(position({k2:-1,a10:1},'black'),at('k2'),at('l1'));
  assert.equal(black.board[at('l1')],-2);
});
test('12x12 kings cross the full board, and taking the last piece wins', () => {
  const king=position({b2:2,k11:-1});
  const next=applyMove(king,at('b2'),at('l12'));
  assert.equal(next.winner,'white'); assert.equal(next.board[at('k11')],0);
  assert.equal(next.history[0].notation,'b2:l12');
});
test('old 8x8 saves remain playable and unsupported variants are rejected', () => {
  const legacy=newGame(); delete legacy.variant;
  assert.equal(boardSize(legacy),8); assert.equal(legalMoves(legacy).length,7);
  assert.throws(()=>newGame('canadian')); assert.throws(()=>newGame('__proto__'));
});
test('simulated 12x12 games preserve board geometry and turn invariants', () => {
  for (let seed=1;seed<=8;seed++) {
    let game=newGame('russian12'), random=seed;
    for (let turn=0;turn<200 && !game.winner;turn++) {
      const moves=legalMoves(game); assert.ok(moves.length);
      random=(random*1664525+1013904223)>>>0;
      const move=moves[random%moves.length], next=applyMove(game,move.from,move.to);
      assert.equal(next.board.length,144); assert.equal(next.revision,game.revision+1);
      assert.equal(next.variant,'russian12');
      next.board.forEach((piece,i)=> { if(piece) assert.equal((Math.floor(i/12)+i%12)%2,1); });
      assert.ok(next.board.filter(Boolean).length<=60); game=next;
    }
  }
});
