import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateProfile } from '../src/profile.js';
test('profile accepts Unicode nicknames, trims and permits removing an avatar', () => {
  assert.deepEqual(validateProfile({name:'  Матча ♟  ',avatar:null}),{name:'Матча ♟',avatar:null});
});
test('profile rejects markup, control characters, external images and oversized data', () => {
  for(const name of ['', 'x', '<img>', 'abc\u202e', 'x'.repeat(41),null]) assert.throws(()=>validateProfile({name}));
  for(const avatar of ['https://example.com/a.jpg','data:image/svg+xml;base64,PHN2Zz4=', 'data:image/png;base64,YWJj', 'x'.repeat(100001)]) assert.throws(()=>validateProfile({name:'Test',avatar}));
  const avatar='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9Zl1sAAAAASUVORK5CYII=';
  assert.equal(validateProfile({name:'Test',avatar}).avatar,avatar);
});
