import { test } from 'node:test';
import assert from 'node:assert/strict';
import { newGame, applyMove } from '../public/game.js';
import { createClock, remainingTime, advanceClock, expiredSide, clockDeadline, timeoutGame, formatClock } from '../public/time-control.js';
test('time controls are 5+5, 10+5, 5+5 and no clock for Chapaev', () => {
  for(const variant of ['russian','chess']) assert.deepEqual(createClock(variant),{white:300000,black:300000,increment:5000,startedAt:null});
  assert.equal(createClock('russian12').white,600000);assert.equal(createClock('chapaev'),null);
  const game=newGame();const paused=createClock('russian');
  assert.equal(remainingTime(paused,game.turn,900000).white,300000);assert.equal(clockDeadline(paused,game),Infinity);
});
test('only the active side spends time and a completed move earns five seconds', () => {
  const game=newGame(), clock=createClock('russian',1000), next=applyMove(game,42,35);
  assert.deepEqual(remainingTime(clock,'white',4000),{white:297000,black:300000});
  const moved=advanceClock(clock,game,next,4000);
  assert.deepEqual(moved,{white:302000,black:300000,increment:5000,startedAt:4000});
  assert.equal(remainingTime(moved,'black',7000).black,297000);assert.equal(remainingTime(moved,'black',7000).white,302000);
});
test('a draughts capture chain receives one increment only after the last jump', () => {
  const game=newGame();game.board.fill(0);game.board[42]=1;game.board[35]=-1;game.board[21]=-1;game.board[1]=-1;
  const clock=createClock('russian',1000), first=applyMove(game,42,28), firstClock=advanceClock(clock,game,first,3000);
  assert.equal(first.forced,28);assert.equal(firstClock.white,298000);
  const last=applyMove(first,28,14), lastClock=advanceClock(firstClock,first,last,6000);
  assert.equal(last.forced,null);assert.equal(lastClock.white,300000);assert.equal(lastClock.black,300000);
});
test('deadline is authoritative, stopped games do not tick and no bonus is given on resignation', () => {
  const game=newGame('chess'), clock=createClock('chess',1000);
  assert.equal(expiredSide(clock,game,300999),null);assert.equal(expiredSide(clock,game,301000),'white');
  assert.equal(clockDeadline(clock,game),301000);
  const result=timeoutGame(game,'white'), stopped=advanceClock(clock,game,result,400000);
  assert.equal(result.winner,'black');assert.equal(result.reason,'timeout');assert.equal(result.revision,1);
  assert.equal(stopped.white,0);assert.equal(stopped.startedAt,null);assert.equal(expiredSide(stopped,result,500000),null);
  const resign={...game,winner:'black',reason:'resign',revision:1};
  assert.equal(advanceClock(clock,game,resign,2000).white,299000);
  assert.equal(formatClock(300000),'5:00');assert.equal(formatClock(1),'0:01');assert.equal(formatClock(-1),'0:00');
});
