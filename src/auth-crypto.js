import { randomBytes, scryptSync, timingSafeEqual, createHash } from 'node:crypto';

// OWASP scrypt configuration: 32 MiB, N=2^15, r=8, p=3.
// Executed in a Durable Object so hashing has its own CPU/memory budget.
const OPTIONS = { N: 32768, r: 8, p: 3, maxmem: 64 * 1024 * 1024 };
export const randomToken = () => randomBytes(32).toString('base64url');
export const digest = value => createHash('sha256').update(value).digest('hex');
export const challengeFor = value => createHash('sha256').update(value).digest('base64url');
export function hashPassword(password) {
  const salt = randomBytes(16).toString('hex');
  return `scrypt:32768:8:3:${salt}:${scryptSync(password, salt, 32, OPTIONS).toString('hex')}`;
}
export function verifyPassword(password, hash) {
  const parts = typeof hash === 'string' ? hash.split(':') : [];
  const valid = parts.length === 6 && parts.slice(0, 4).join(':') === 'scrypt:32768:8:3' && /^[a-f0-9]{32}$/.test(parts[4]) && /^[a-f0-9]{64}$/.test(parts[5]);
  // Do identical KDF work for absent users and Google-only accounts.
  const salt = valid ? parts[4] : '00000000000000000000000000000000';
  const candidate = scryptSync(password, salt, 32, OPTIONS);
  const expected = valid ? Buffer.from(parts[5], 'hex') : Buffer.alloc(32);
  return timingSafeEqual(candidate, expected) && valid;
}
export function normalizeEmail(value) {
  if (typeof value !== 'string') throw new Error('Введите корректную почту.');
  const email = value.trim().toLowerCase();
  if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error('Введите корректную почту.');
  return email;
}
export function validateRegistration(data) {
  const name = typeof data.name === 'string' ? data.name.trim().normalize('NFC') : '';
  if (name.length < 2 || name.length > 40 || /[\p{Cc}\p{Cf}<>]/u.test(name)) throw new Error('Имя должно содержать от 2 до 40 символов без управляющих знаков.');
  const email = normalizeEmail(data.email);
  if (typeof data.password !== 'string' || data.password.length < 12 || data.password.length > 128) throw new Error('Используйте пароль длиной от 12 до 128 символов.');
  if (data.password !== data.confirmPassword) throw new Error('Пароли не совпадают.');
  return { name, email, password: data.password };
}
export function safeReturnTo(value) {
  if (typeof value !== 'string' || !value.startsWith('/?room=')) return '/';
  try { const code = new URL(value, 'https://local.invalid').searchParams.get('room'); return /^[A-F0-9]{12}$/.test(code) ? '/?room=' + code : '/'; } catch { return '/'; }
}
