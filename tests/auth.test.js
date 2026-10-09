import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPair, SignJWT, createLocalJWKSet, exportJWK } from 'jose';
import { hashPassword, verifyPassword, validateRegistration, safeReturnTo } from '../src/auth-crypto.js';
import { verifyGoogleIdentity } from '../src/auth.js';

test('scrypt uses independent salts and rejects incorrect and absent passwords', () => {
  const password = 'Тестовая длинная фраза 🌲';
  const first = hashPassword(password), second = hashPassword(password);
  assert.notEqual(first, second);
  assert.ok(!first.includes(password));
  assert.equal(verifyPassword(password, first), true);
  assert.equal(verifyPassword(password + 'x', first), false);
  assert.equal(verifyPassword(password, null), false);
});
test('registration validates all fields, normalizes email and preserves password', () => {
  const input = { name: '  Игрок  ', email: ' Player@EXAMPLE.com ', password: 'a long phrase for tests', confirmPassword: 'a long phrase for tests' };
  assert.deepEqual(validateRegistration(input), { name: 'Игрок', email: 'player@example.com', password: input.password });
  for (const change of [{ name: '<script>' }, { name: 'a' }, { email: 'bad' }, { password: 'short' }, { confirmPassword: 'different' }, { name: '\u202EPlayer' }]) {
    assert.throws(() => validateRegistration({ ...input, ...change }));
  }
});
test('OAuth return URL cannot redirect off site or to arbitrary paths', () => {
  assert.equal(safeReturnTo('/?room=AABBCCDDEEFF'), '/?room=AABBCCDDEEFF');
  assert.equal(safeReturnTo('/profile'), '/profile');
  assert.equal(safeReturnTo('/profile?next=https://evil.example'), '/');
  assert.equal(safeReturnTo('/admin'), '/admin');
  assert.equal(safeReturnTo('/privacy'), '/privacy');
  assert.equal(safeReturnTo('/terms'), '/terms');
  assert.equal(safeReturnTo('/terms?next=https://evil.example'), '/');
  for (const url of ['https://evil.example', '//evil.example', '/admin?next=https://evil.example', '/?room=bad', '/?room=AABBCCDDEEFF&next=https://evil.example']) {
    assert.ok(['/', '/?room=AABBCCDDEEFF'].includes(safeReturnTo(url)));
  }
});
test('Google identities require a valid signature, audience, issuer, nonce, expiry and verified email', async () => {
  const { privateKey, publicKey } = await generateKeyPair('RS256');
  const keys = createLocalJWKSet({ keys: [{ ...await exportJWK(publicKey), kid: 'test', alg: 'RS256' }] });
  const claims = { sub: 'google-user', email: 'test@example.com', email_verified: true, nonce: 'nonce', aud: 'client-id', iss: 'https://accounts.google.com' };
  const sign = (extra = {}, key = privateKey) => new SignJWT({ ...claims, ...extra }).setProtectedHeader({ alg: 'RS256', kid: 'test' }).setIssuedAt().setExpirationTime(extra.exp || '5m').sign(key);
  const valid = await sign();
  assert.equal((await verifyGoogleIdentity(valid, 'client-id', 'nonce', keys)).sub, 'google-user');
  await assert.rejects(() => verifyGoogleIdentity(valid, 'other-client', 'nonce', keys));
  await assert.rejects(() => verifyGoogleIdentity(valid, 'client-id', 'other-nonce', keys));
  for (const change of [{ iss: 'https://evil.example' }, { email_verified: false }, { azp: 'other-client' }, { exp: 1 }]) {
    const token = await sign(change);
    await assert.rejects(() => verifyGoogleIdentity(token, 'client-id', 'nonce', keys));
  }
  const other = await generateKeyPair('RS256');
  const forged = await sign({}, other.privateKey);
  await assert.rejects(() => verifyGoogleIdentity(forged, 'client-id', 'nonce', keys));
});
