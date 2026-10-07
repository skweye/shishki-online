import { DurableObject } from 'cloudflare:workers';
import { hashPassword, verifyPassword } from './auth-crypto.js';

export class PasswordService extends DurableObject {
  async hash(password) {
    if (typeof password !== 'string' || password.length < 12 || password.length > 128) throw new Error('Invalid password length');
    return hashPassword(password);
  }
  async verify(password, hash) {
    if (typeof password !== 'string' || password.length > 128) return false;
    return verifyPassword(password, hash);
  }
}
