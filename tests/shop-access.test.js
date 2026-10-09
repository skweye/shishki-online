import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync, readdirSync } from 'node:fs';
import { shopState, buyItem, equipItem } from '../src/shop.js';
import { CATALOG } from '../public/shop-catalog.js';

function database(verified = true) {
  const db = new DatabaseSync(':memory:'); db.exec('PRAGMA foreign_keys=ON');
  for (const file of readdirSync(new URL('../migrations/', import.meta.url)).filter(f => f.endsWith('.sql') && f < '0006')) db.exec(readFileSync(new URL('../migrations/' + file, import.meta.url), 'utf8'));
  db.prepare('INSERT INTO users(id,name,email,created_at,email_verified,google_sub) VALUES(?,?,?,?,?,?)').run('owner', 'Owner', 'kkoallqq@gmail.com', 1, verified ? 1 : 0, verified ? 'verified-google-id' : null);
  db.prepare('INSERT INTO users(id,name,email,created_at) VALUES(?,?,?,?)').run('other', 'Other', 'other@example.invalid', 1);
  db.exec(readFileSync(new URL('../migrations/0006_shop_access.sql', import.meta.url), 'utf8'));
  const env = { AUTH_DB: {
    prepare(sql) { return { bind(...args) { const statement = db.prepare(sql); return {
      first: async () => statement.get(...args),
      run: async () => ({ meta: { changes: Number(statement.run(...args).changes) } }),
      all: async () => ({ results: statement.all(...args) })
    }; } }; },
    batch: queries => Promise.all(queries.map(query => query.all()))
  } };
  return { db, env };
}
test('verified existing owner can choose every catalog item without payment in both slots', async () => {
  const { db, env } = database();
  try {
    const initial = await shopState(env, 'owner');
    assert.equal(initial.fullAccess, true); assert.deepEqual(initial.owned, CATALOG.map(item => item.id));
    for (const item of CATALOG) {
      await buyItem(env, 'owner', item.id);
      await equipItem(env, 'owner', item.id, 'victory'); await equipItem(env, 'owner', item.id, 'resign');
    }
    assert.equal((await shopState(env, 'owner')).balance, initial.balance);
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM account_items WHERE user_id=?').get('owner').n, 0);
    assert.equal((await shopState(env, 'other')).fullAccess, false);
    await assert.rejects(equipItem(env, 'other', 'effect-portal', 'victory'), { status: 403 });
    await buyItem(env, 'other', 'skin-jade'); assert.equal((await shopState(env, 'other')).balance, 40);
  } finally { db.close(); }
});
test('unverified matching email and a newly recreated account never inherit owner access', async () => {
  const { db, env } = database(false);
  try {
    assert.equal((await shopState(env, 'owner')).fullAccess, false);
    await assert.rejects(equipItem(env, 'owner', 'effect-portal'), { status: 403 });
    db.prepare('DELETE FROM users WHERE id=?').run('owner');
    db.prepare('INSERT INTO users(id,name,email,created_at) VALUES(?,?,?,?)').run('new-owner', 'New', 'kkoallqq@gmail.com', 2);
    assert.equal((await shopState(env, 'new-owner')).fullAccess, false);
  } finally { db.close(); }
});
