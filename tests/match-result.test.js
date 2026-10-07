import { test } from 'node:test';
import assert from 'node:assert/strict';
import { matchResult } from '../public/match-result.js';

test('the same resignation is a victory for the winner and a defeat for the resigning player', () => {
  for (const winner of ['white', 'black']) {
    const game = { winner, reason: 'resign' };
    const loser = winner === 'white' ? 'black' : 'white';
    assert.equal(matchResult(game, winner).kind, 'victory');
    assert.match(matchResult(game, winner).text, /Соперник сдался/);
    assert.equal(matchResult(game, loser).kind, 'defeat');
    assert.match(matchResult(game, loser).text, /Вы сдались/);
    assert.equal(matchResult(game).title, `${winner === 'white' ? 'Белые' : 'Чёрные'} побеждают!`);
    assert.match(matchResult(game).text, new RegExp(`${loser === 'white' ? 'Белые' : 'Чёрные'} сдались`));
  }
});

test('draws never show a defeat, and unfinished games have no result', () => {
  for (const reason of ['agreement', 'repetition']) {
    for (const role of [null, 'white', 'black']) assert.equal(matchResult({ winner: 'draw', reason }, role).kind, 'draw');
  }
  assert.equal(matchResult({ winner: null }), null);
  assert.match(matchResult({ winner: 'black', reason: 'no-moves' }, 'white').text, /У вас не осталось/);
});
