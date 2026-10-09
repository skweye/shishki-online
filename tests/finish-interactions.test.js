import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pieceReaction, FINISH_DURATION } from '../public/finish-interactions.js';
import { CATALOG } from '../public/shop-catalog.js';

const options = { winner: 'white', fromTop: false };
test('all effects leave board positions untouched and return finite, bounded presentation values', () => {
  for (const item of CATALOG.filter(item => item.type === 'effect')) for (const side of ['white', 'black']) for (const fromTop of [false, true]) {
    for (const position of [[0,0],[.5,.5],[1,1],[.25,.75]]) {
      const piece = Object.freeze({ x: position[0], y: position[1], side });
      for (let time = 0; time <= FINISH_DURATION; time += 40) {
        const result = pieceReaction(item.value, piece, time, { ...options, fromTop });
        for (const [key, value] of Object.entries(result)) if (key !== 'color') assert.ok(Number.isFinite(value), `${item.value}: ${key}`);
        assert.ok(result.opacity >= 0 && result.opacity <= 1); assert.ok(result.scale > 0 && result.scale < 1.5);
      }
      const final = pieceReaction(item.value, piece, FINISH_DURATION, options);
      assert.equal(final.x, 0); assert.equal(final.y, 0); assert.equal(final.scale, 1); assert.equal(final.opacity, 1); assert.equal(final.rotation, 0);
    }
  }
});
test('rocket wave reaches nearby pieces first and pushes the losing side more strongly', () => {
  const near = { x: .6, y: .24, side: 'black' }, far = { x: .9, y: .9, side: 'black' };
  assert.equal(pieceReaction('rocket', near, 1200, options).x, 0);
  assert.ok(pieceReaction('rocket', near, 1300, options).x > 0);
  assert.equal(pieceReaction('rocket', far, 1300, options).x, 0);
  assert.ok(pieceReaction('rocket', near, 1800, options).x > pieceReaction('rocket', { ...near, side: 'white' }, 1800, options).x);
});
test('comet contacts follow its diagonal and mirror correctly when the board direction reverses', () => {
  const piece = { x: .3, y: .7, side: 'black' };
  const before = pieceReaction('comet', piece, 500, options), hit = pieceReaction('comet', piece, 1200, options);
  assert.equal(before.x, 0); assert.ok(hit.x > 0); assert.ok(hit.y < 0);
  const mirror = pieceReaction('comet', { x: .7, y: .3, side: 'black' }, 1200, { ...options, fromTop: true });
  assert.ok(Math.abs(hit.x + mirror.x) < .00001);
});
test('portal absorbs opponents and reduced motion keeps all pieces stationary and visible', () => {
  const loser = { x: .2, y: .7, side: 'black' };
  const pulled = pieceReaction('portal', loser, 1900, options);
  assert.ok(Math.abs(loser.x + pulled.x - .5) < .001); assert.ok(Math.abs(loser.y + pulled.y - .5) < .001);
  assert.equal(pulled.opacity, 0);
  assert.equal(pieceReaction('portal', { ...loser, side: 'white' }, 1900, options).opacity, 1);
  for (const item of CATALOG.filter(item => item.type === 'effect')) {
    const result = pieceReaction(item.value, loser, 100, { ...options, reduced: true });
    assert.equal(result.x, 0); assert.equal(result.y, 0); assert.equal(result.scale, 1); assert.equal(result.rotation, 0); assert.equal(result.opacity, 1);
  }
});
