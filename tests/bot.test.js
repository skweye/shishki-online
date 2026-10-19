import { test } from 'node:test';
import assert from 'node:assert/strict';
import { newGame, VARIANTS, legalMoves } from '../public/game.js';
import { newChess } from '../public/chess-game.js';
import { actBattleship, randomFleet } from '../public/battleship.js';
import { chooseBotAction, botView } from '../src/bot.js';
import { applyBotAction, botDelay } from '../src/bot-room.js';
import { transitionSounds, ACTION_NOTES } from '../public/sounds.js';

const random = seed => () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
test('every game has legal bot decisions, without modifying the input or choosing for an inactive seat', () => {
  for (const variant of Object.keys(VARIANTS)) {
    let g = newGame(variant), played = 0;
    const rng = random(42);
    for (let step = 0; step < 24 && !g.winner; step++) {
      const side = variant === 'battleship' && g.phase === 'setup' ? !g.ready.white ? 'white' : 'black' : variant === 'domino' && g.roundResult ? !g.readyNext.includes('white') ? 'white' : 'black' : g.turn;
      const before = structuredClone(g), action = chooseBotAction(g, side, rng);
      assert.ok(action, variant + ' has an action at step ' + step);
      assert.deepEqual(g, before, variant + ' search is pure');
      g = applyBotAction(g, side, action);
      assert.equal(g.revision, before.revision + 1, variant);
      played++;
    }
    assert.ok(played >= 2, variant);
    assert.equal(chooseBotAction({ ...g, winner: 'white' }), null);
  }
});

test('hidden hands, stock order and unhit ships cannot influence bot decisions', () => {
  for (const variant of ['durak-simple', 'durak-throw', 'durak-transfer', 'domino']) {
    const g = newGame(variant); g.turn = 'black';
    const changed = structuredClone(g);
    const hidden = [...changed.hands.white, ...changed.stock].reverse();
    changed.hands.white = hidden.slice(0, g.hands.white.length); changed.stock = hidden.slice(g.hands.white.length);
    const view = botView(g, 'black');
    assert.deepEqual(view.hands.white, []); assert.equal(view.stock, undefined);
    assert.deepEqual(chooseBotAction(g, 'black', random(5)), chooseBotAction(changed, 'black', random(5)), variant);
  }
  let g = newGame('battleship');
  for (const side of ['white', 'black']) g = actBattleship(g, side, { type: 'fleet-ready', fleet: randomFleet() });
  g.turn = 'black'; const changed = structuredClone(g); changed.fleets.white = randomFleet();
  assert.deepEqual(botView(g, 'black').fleets.white, []);
  assert.deepEqual(chooseBotAction(g, 'black', random(4)), chooseBotAction(changed, 'black', random(4)));
  g.shots.black = [{ cell: 44, result: 'hit' }, { cell: 45, result: 'hit' }];
  assert.ok([43, 46].includes(chooseBotAction(g).cell), 'finish the wounded ship along its known axis');
});

test('draughts bot obeys compulsory captures; chess finds mate and promotes', () => {
  const g = newGame(); g.board.fill(0); g.board[42] = 1; g.board[35] = -1; g.board[21] = -1; g.board[7] = -1;
  const first = chooseBotAction(g, 'white'); assert.deepEqual(first, { type: 'move', from: 42, to: 28 });
  const next = applyBotAction(g, 'white', first);
  assert.equal(next.forced, 28); assert.equal(chooseBotAction(next, 'black'), null);
  assert.ok(legalMoves(next).some(m => m.to === chooseBotAction(next, 'white').to));
  const mate = newChess('7k/5Q2/6K1/8/8/8/8/8 w - - 0 1');
  assert.equal(applyBotAction(mate, 'white', chooseBotAction(mate, 'white')).reason, 'checkmate');
  const promotion = newChess('7k/P7/8/8/8/8/4K3/8 w - - 0 1');
  assert.equal(chooseBotAction(promotion, 'white').promotion, 'q');
});

test('pool bot pots a visible target, replaces a scratched cue and respects animation time', () => {
  const g = { ...newGame('pool8'), breaking: false, ballInHand: null, groups: { white: 'solid', black: 'stripe' }, balls: [{ id: 0, x: 10, y: 3 }, { id: 1, x: 10, y: .8 }, { id: 8, x: 15, y: 6 }, { id: 9, x: 18, y: 6 }] };
  const action = chooseBotAction(g, 'white'), next = applyBotAction(g, 'white', action);
  assert.ok(next.lastShot.potted.some(b => b.id === 1)); assert.equal(next.foul, null);
  assert.ok(Number.isFinite(next.lastShot.duration));
  assert.ok(botDelay(next) > next.lastShot.duration * 1000 + 200);
  const scratched = { ...g, turn: 'black', ballInHand: 'kitchen', balls: g.balls.filter(b => b.id !== 0) };
  const place = chooseBotAction(scratched); assert.equal(place.type, 'pool-place'); assert.ok(place.x < 5);
  const placed = applyBotAction(scratched, 'black', place);
  assert.equal(chooseBotAction(placed).type, 'pool-shot');
});

test('bots can complete fleet battles, card games, narde and a domino round', () => {
  for (const variant of ['battleship', 'durak-simple', 'durak-throw', 'durak-transfer', 'narde', 'domino']) {
    let g = newGame(variant); const rng = random(983);
    for (let i = 0; i < 1200 && !g.winner && !g.roundResult; i++) {
      const side = variant === 'battleship' && g.phase === 'setup' ? !g.ready.white ? 'white' : 'black' : g.turn;
      const action = chooseBotAction(g, side, rng);
      assert.ok(action, variant + ' did not get stuck'); g = applyBotAction(g, side, action);
    }
    assert.ok(g.winner || g.roundResult, variant + ' completes');
  }
});

test('bot start has its own shared sound and bot moves retain normal game feedback', () => {
  assert.ok(ACTION_NOTES['bot-start']); assert.notDeepEqual(ACTION_NOTES['bot-start'], ACTION_NOTES['room-join']);
  const before = newGame(), after = applyBotAction(before, 'white', chooseBotAction(before, 'white'));
  assert.ok(transitionSounds(before, after, 'black').includes('move'));
  assert.deepEqual(transitionSounds(after, after, 'black'), [], 'reconnect does not replay bot audio');
});
