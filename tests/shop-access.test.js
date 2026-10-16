import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync, readdirSync } from 'node:fs';
import { shopState, buyItem, equipItem } from '../src/shop.js';
import { CATALOG } from '../public/shop-catalog.js';
import { TEXTURES,pieceArt } from '../public/skin-art.js';
import { CUE_SHAPES,animatedCue,validCueSkin } from '../public/pool-cue.js';
import { translations } from '../public/locales.js';

test('material skins and premium cues are translated, purchased once and retain their own equipment slot',async()=>{
  const {db,env}=database();try{
    await shopState(env,'other');db.prepare('UPDATE account_wallets SET balance=10000 WHERE user_id=?').run('other');
    let balance=10000;
    const items=CATALOG.filter(item=>item.type==='skin'&&Object.hasOwn(TEXTURES,item.value)||item.type==='cue'&&Object.hasOwn(CUE_SHAPES,item.value));
    assert.equal(items.length,11);assert.equal(items.filter(item=>item.type==='cue'&&animatedCue(item.value)).length,3);
    for(const item of items){
      for(const text of [item.name,item.description])for(const language of ['en','uk'])assert.ok(translations[text]?.[language],text);
      if(item.type==='skin'){const svg=pieceArt(item.value);assert.match(svg,/piece-texture/);assert.doesNotMatch(svg,/style=|<script/);}
      else assert.equal(validCueSkin(item.value),item.value);
      await assert.rejects(equipItem(env,'other',item.id),{status:403});
      const before=db.prepare('SELECT cue_skin,piece_skin FROM users WHERE id=?').get('other');
      await buyItem(env,'other',item.id);await buyItem(env,'other',item.id);await equipItem(env,'other',item.id);
      balance-=item.price;assert.equal((await shopState(env,'other')).balance,balance);
      const after=db.prepare('SELECT cue_skin,piece_skin FROM users WHERE id=?').get('other');
      const changed=item.type==='skin'?'piece_skin':'cue_skin',same=item.type==='skin'?'cue_skin':'piece_skin';
      assert.equal(after[changed],item.value);assert.equal(after[same],before[same]);
    }
  }finally{db.close();}
});

function database(verified = true) {
  const db = new DatabaseSync(':memory:'); db.exec('PRAGMA foreign_keys=ON');
  for (const file of readdirSync(new URL('../migrations/', import.meta.url)).filter(f => f.endsWith('.sql') && f < '0006')) db.exec(readFileSync(new URL('../migrations/' + file, import.meta.url), 'utf8'));
  db.prepare('INSERT INTO users(id,name,email,created_at,email_verified,google_sub) VALUES(?,?,?,?,?,?)').run('owner', 'Owner', 'kkoallqq@gmail.com', 1, verified ? 1 : 0, verified ? 'verified-google-id' : null);
  db.prepare('INSERT INTO users(id,name,email,created_at) VALUES(?,?,?,?)').run('other', 'Other', 'other@example.invalid', 1);
  db.exec(readFileSync(new URL('../migrations/0006_shop_access.sql', import.meta.url), 'utf8'));
  db.exec(readFileSync(new URL('../migrations/0009_cue_skin.sql', import.meta.url), 'utf8'));
  db.exec(readFileSync(new URL('../migrations/0010_ship_skin.sql', import.meta.url), 'utf8'));
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
test('cue skins require ownership, charge once and keep checker skins and effects independent',async()=>{
  const {db,env}=database();try{
    await assert.rejects(equipItem(env,'other','cue-carbon'),{status:403});
    await buyItem(env,'other','cue-carbon');await buyItem(env,'other','cue-carbon');
    await equipItem(env,'other','cue-carbon');
    assert.equal((await shopState(env,'other')).balance,20);
    const user=db.prepare('SELECT cue_skin,piece_skin,finish_effect,victory_effect FROM users WHERE id=?').get('other');
    assert.equal(user.cue_skin,'carbon');assert.equal(user.piece_skin,'classic');assert.equal(user.finish_effect,'none');assert.equal(user.victory_effect,'none');
    await equipItem(env,'other','cue-classic');
    assert.equal(db.prepare('SELECT cue_skin FROM users WHERE id=?').get('other').cue_skin,'classic');
  }finally{db.close();}
});

test('ship models require ownership, debit once and equip independently of all other slots',async()=>{
  const {db,env}=database();try{
    await assert.rejects(equipItem(env,'other','ship-submarine'),{status:403});
    await assert.rejects(equipItem(env,'other','ship-invented'),{status:400});
    await buyItem(env,'other','ship-submarine');await buyItem(env,'other','ship-submarine');await equipItem(env,'other','ship-submarine');
    assert.equal((await shopState(env,'other')).balance,20);
    const user=db.prepare('SELECT ship_skin,cue_skin,piece_skin,finish_effect,victory_effect FROM users WHERE id=?').get('other');
    assert.deepEqual({...user},{ship_skin:'submarine',cue_skin:'classic',piece_skin:'classic',finish_effect:'none',victory_effect:'none'});
    await equipItem(env,'other','ship-classic');assert.equal(db.prepare('SELECT ship_skin FROM users WHERE id=?').get('other').ship_skin,'classic');
  }finally{db.close();}
});
