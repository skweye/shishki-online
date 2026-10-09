import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync, readdirSync } from 'node:fs';
import { adminOverview, changeShopAccess } from '../src/admin.js';
import { handleAuth } from '../src/auth.js';
import { digest } from '../src/auth-crypto.js';
function setup() {
  const db = new DatabaseSync(':memory:'); db.exec('PRAGMA foreign_keys=ON');
  for (const file of readdirSync(new URL('../migrations/', import.meta.url)).filter(f => f.endsWith('.sql')).sort()) {
    if (file.startsWith('0006')) {
      db.prepare('INSERT INTO users(id,name,email,created_at,email_verified,google_sub) VALUES(?,?,?,?,?,?)').run('owner','Owner','kkoallqq@gmail.com',1,1,'google-owner');
      db.prepare('INSERT INTO users(id,name,email,created_at) VALUES(?,?,?,?)').run('player','<b>Player</b>','player@example.invalid',2);
    }
    db.exec(readFileSync(new URL('../migrations/' + file, import.meta.url),'utf8'));
  }
  const env = { AUTH_DB: {
    prepare(sql) { return { bind(...args) { const stmt = db.prepare(sql); return {
      first: async () => stmt.get(...args), all: async () => ({ results: stmt.all(...args) }),
      run: async () => ({ meta: { changes: Number(stmt.run(...args).changes) } }),
      batch() { return /^\s*(SELECT|WITH)/i.test(sql) ? {results:stmt.all(...args)} : {meta:{changes:Number(stmt.run(...args).changes)}}; }
    }; } }; },
    async batch(queries) { db.exec('BEGIN'); try { const results=queries.map(q=>q.batch());db.exec('COMMIT');return results; } catch(error){db.exec('ROLLBACK');throw error;} }
  }};
  const tokens = {owner:'a'.repeat(43), player:'b'.repeat(43)};
  for(const [id, token] of Object.entries(tokens)) db.prepare('INSERT INTO sessions VALUES(?,?,?)').run(digest(token),id,Math.floor(Date.now()/1000)+10000);
  const request = (role, method='GET', path='/api/auth/admin', data, origin='https://game.test') => handleAuth(new Request('https://game.test'+path,{method,headers:{...(role?{Cookie:'__Host-shishki-session='+tokens[role]}:{}),Origin:origin,'Content-Type':'application/json'},...(method==='POST'?{body:JSON.stringify(data)}:{})}),env,{waitUntil(){}},req=>req.json());
  return {db,env,request};
}
test('admin endpoints deny anonymous and regular players and validate CSRF and target input', async()=>{
  const {db,request}=setup();try {
    assert.equal((await request()).status,401);assert.equal((await request('player')).status,403);
    assert.equal((await request('player','POST','/api/auth/admin/shop-access',{userId:'player',enabled:true,expected:false,isAdmin:true})).status,403);
    assert.equal((await request('owner','POST','/api/auth/admin/shop-access',{userId:'player',enabled:true,expected:false},'https://evil.example')).status,403);
    assert.equal((await request('owner','POST','/api/auth/admin/shop-access',{userId:'player',enabled:'yes',expected:false})).status,400);
    const result=await request('owner');assert.equal(result.status,200);assert.equal((await result.json()).users.length,2);
    assert.equal((await request('owner','POST','/api/auth/admin/shop-access',{userId:'player',enabled:true,expected:false})).status,200);
    assert.equal(db.prepare('SELECT is_admin FROM users WHERE id=?').get('player').is_admin,0);
  } finally {db.close();}
});
test('grant/revoke is audited once, protects admins, preserves purchases and rejects stale writes',async()=>{
  const {db,env}=setup();try {
    await assert.rejects(adminOverview(env,'player'),{status:403});
    await assert.rejects(changeShopAccess(env,'player',{userId:'player',enabled:true,expected:false}),{status:409});
    await changeShopAccess(env,'owner',{userId:'player',enabled:true,expected:false});
    await assert.rejects(changeShopAccess(env,'owner',{userId:'player',enabled:true,expected:false}),{status:409});
    await assert.rejects(changeShopAccess(env,'owner',{userId:'owner',enabled:false,expected:true}),{status:409});
    db.exec("INSERT INTO account_wallets VALUES('player',100); INSERT INTO account_items VALUES('player','skin-jade',60,1); UPDATE users SET piece_skin='jade',finish_effect='portal',victory_effect='comet' WHERE id='player'");
    await changeShopAccess(env,'owner',{userId:'player',enabled:false,expected:true});
    const row=db.prepare('SELECT * FROM users WHERE id=?').get('player');
    assert.equal(row.shop_access,0);assert.equal(row.piece_skin,'jade');assert.equal(row.finish_effect,'none');assert.equal(row.victory_effect,'none');
    assert.equal(db.prepare('SELECT balance FROM account_wallets WHERE user_id=?').get('player').balance,40);
    const view=await adminOverview(env,'owner','player@example.invalid');assert.equal(view.total,1);assert.equal(view.audit.length,2);
    assert.equal((await adminOverview(env,'owner',"%' OR 1=1 --")).total,0);
    db.prepare('DELETE FROM users WHERE id=?').run('player');assert.equal((await adminOverview(env,'owner')).audit[0].target,null);
  } finally{db.close();}
});
