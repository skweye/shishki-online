import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync, readdirSync } from 'node:fs';
import { adminOverview, changeShopAccess, grantAdmin, setAdminLevel, grantCoins } from '../src/admin.js';
import { handleAuth } from '../src/auth.js';
import { digest } from '../src/auth-crypto.js';
import {ADMIN_LEVELS,canManage,canSetLevel} from '../public/admin-levels.js';
import {parseHTML} from 'linkedom';
import {runInNewContext} from 'node:vm';

test('admin panel presents rank controls and retries a lost coin response with the same amount and request ID',async()=>{
  const {document,window}=parseHTML(readFileSync(new URL('../public/admin.html',import.meta.url),'utf8'));
  const $=id=>document.getElementById(id),storage=new Map(),calls=[];
  $('access-dialog').showModal=()=>{};$('access-dialog').close=()=>{};
  Object.defineProperty($('admin-level'),'value',{value:'0',writable:true});
  const data={actor:{id:'owner',admin_level:3},summary:{users:1,full_access:0},total:1,users:[{id:'player',name:'Player',email:'player@example.invalid',created_at:1,balance:100,admin_level:0,shop_access:0}],audit:[]};
  const fetch=async(url,options)=>{
    if(options.method==='POST'){calls.push(JSON.parse(options.body));if(calls.length===1)throw Error('offline');return {ok:true,json:async()=>({updated:true})};}
    return {ok:true,json:async()=>data};
  };
  const source=readFileSync(new URL('../public/admin.js',import.meta.url),'utf8').replace(/^import .*;\r?$/gm,'');
  await runInNewContext('(async()=>{'+source+'})()',{document,window,fetch,crypto,AbortSignal,URLSearchParams,ADMIN_LEVELS,canManage,canSetLevel,t:s=>s,syncAccount(){},localStorage:{getItem:k=>storage.get(k)||null,setItem:(k,v)=>storage.set(k,v),removeItem:k=>storage.delete(k)}});
  assert.match($('admin-role').textContent,/3/);
  const buttons=[...$('admin-users').querySelectorAll('button')];assert.ok(buttons.some(b=>b.textContent==='Изменить уровень'));
  buttons.find(b=>b.textContent==='Выдать монеты').click();$('admin-coins').value='500';
  await $('access-confirm').onclick();assert.equal(storage.size,1);assert.equal($('admin-coins').disabled,true);
  await $('access-confirm').onclick();assert.deepEqual(calls[0],calls[1]);assert.equal(calls[1].amount,500);assert.equal(storage.size,0);
});

test('UI hierarchy exposes exactly the same rank and self-management rules',()=>{
  for(let actorLevel=0;actorLevel<=3;actorLevel++)for(let targetLevel=0;targetLevel<=3;targetLevel++){
    const actor={id:'a',admin_level:actorLevel},target={id:'b',admin_level:targetLevel};
    assert.equal(canManage(actor,target),actorLevel>=2&&actorLevel>targetLevel);
    assert.equal(canSetLevel(actor,target),actorLevel===3&&targetLevel<3);
    assert.equal(canManage(actor,actor),actorLevel===3);assert.equal(canSetLevel(actor,actor),actorLevel===3);
  }
});
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

test('highest admin controls lower levels and self, while peers and superiors stay protected',async()=>{
  const {db,env,request}=setup();try{
    assert.equal(db.prepare("SELECT admin_level FROM users WHERE id='owner'").get().admin_level,3);
    const path='/api/auth/admin/level',data={userId:'player',expected:0,level:2};
    assert.equal((await request(null,'POST',path,data)).status,401);
    assert.equal((await request('player','POST',path,data)).status,403);
    assert.equal((await request('owner','POST',path,data,'https://evil.example')).status,403);
    for(const level of [-1,4,'3',1.5])assert.equal((await request('owner','POST',path,{...data,level})).status,400);
    assert.equal((await request('owner','POST',path,data)).status,200);
    assert.equal((await request('owner','POST',path,data)).status,409);
    const session=await (await request('player','GET','/api/auth/session')).json();assert.equal(session.user.adminLevel,2);assert.equal(session.user.isAdmin,true);
    db.exec("INSERT INTO users(id,name,email,created_at) VALUES('third','Third','third@example.invalid',3)");
    await changeShopAccess(env,'player',{userId:'third',enabled:true,expected:false});
    await assert.rejects(grantAdmin(env,'player',{userId:'third'}),{status:409});
    await assert.rejects(setAdminLevel(env,'player',{userId:'player',level:3,expected:2}),{status:409});
    await assert.rejects(changeShopAccess(env,'player',{userId:'owner',enabled:false,expected:true}),{status:409});
    await setAdminLevel(env,'owner',{userId:'third',level:3,expected:0});
    await assert.rejects(setAdminLevel(env,'owner',{userId:'third',level:1,expected:3}),{status:409});
    await assert.rejects(changeShopAccess(env,'owner',{userId:'third',enabled:false,expected:true}),{status:409});
    await setAdminLevel(env,'owner',{userId:'player',level:1,expected:2});
    assert.equal((await request('player')).status,200);
    await assert.rejects(changeShopAccess(env,'player',{userId:'third',enabled:false,expected:true}),{status:409});
    await changeShopAccess(env,'owner',{userId:'owner',enabled:false,expected:true});
    assert.equal(db.prepare("SELECT admin_level FROM users WHERE id='owner'").get().admin_level,3);
    await setAdminLevel(env,'owner',{userId:'owner',level:0,expected:3});
    assert.equal((await request('owner')).status,403);assert.equal((await (await request('owner','GET','/api/auth/session')).json()).user.isAdmin,false);
    await assert.rejects(setAdminLevel(env,'owner',{userId:'owner',level:3,expected:0}),{status:409});
    await setAdminLevel(env,'third',{userId:'owner',level:3,expected:0});
    assert.equal((await request('owner')).status,200);
    const audit=db.prepare("SELECT from_level,to_level FROM admin_audit WHERE action='set_level'").all();assert.equal(audit.length,5);
  }finally{db.close();}
});

test('coin grants enforce hierarchy, validate amounts and award once across retries and concurrent requests',async()=>{
  const {db,env,request}=setup();try{
    const data={userId:'player',amount:500,requestId:crypto.randomUUID()};
    assert.equal((await request(null,'POST','/api/auth/admin/coins',data)).status,401);
    assert.equal((await request('player','POST','/api/auth/admin/coins',data)).status,403);
    assert.equal((await request('owner','POST','/api/auth/admin/coins',data,'https://evil.example')).status,403);
    for(const amount of [0,-1,1.1,1000001,'500',null])await assert.rejects(grantCoins(env,'owner',{...data,amount}),{status:400});
    const results=await Promise.all([1,2,3].map(()=>grantCoins(env,'owner',data)));assert.ok(results.every(r=>r.amount===500));
    assert.equal(db.prepare("SELECT balance FROM account_wallets WHERE user_id='player'").get().balance,600);
    assert.equal(db.prepare("SELECT COUNT(*) n FROM admin_audit WHERE action='grant_coins'").get().n,1);
    await assert.rejects(grantCoins(env,'owner',{...data,amount:501}),{status:409});
    await grantCoins(env,'owner',{...data,userId:'owner',requestId:crypto.randomUUID()});
    assert.equal(db.prepare("SELECT balance FROM account_wallets WHERE user_id='owner'").get().balance,600);
    await setAdminLevel(env,'owner',{userId:'player',expected:0,level:2});
    await assert.rejects(grantCoins(env,'player',{...data,requestId:crypto.randomUUID()}),{status:403});
    await assert.rejects(grantCoins(env,'player',{...data,userId:'owner',requestId:crypto.randomUUID()}),{status:403});
    db.exec("INSERT INTO users(id,name,email,created_at) VALUES('third','Third','third@example.invalid',3)");
    await grantCoins(env,'player',{...data,userId:'third',requestId:crypto.randomUUID()});
    await setAdminLevel(env,'owner',{userId:'player',expected:2,level:1});
    await assert.rejects(grantCoins(env,'player',{...data,userId:'third',requestId:crypto.randomUUID()}),{status:403});
    assert.equal(db.prepare("SELECT balance FROM account_wallets WHERE user_id='third'").get().balance,600);
    db.exec("DELETE FROM users WHERE id='third'");assert.equal(db.prepare("SELECT target_id FROM admin_audit WHERE actor_id='player' AND action='grant_coins'").get().target_id,null);
  }finally{db.close();}
});

test('admin audit migration preserves existing history and account deletion still anonymizes it',()=>{
  const db=new DatabaseSync(':memory:');try {
    db.exec('PRAGMA foreign_keys=ON');
    for(const file of readdirSync(new URL('../migrations/',import.meta.url)).filter(f=>f.endsWith('.sql')&&f<'0008').sort()) db.exec(readFileSync(new URL('../migrations/'+file,import.meta.url),'utf8'));
    db.exec("INSERT INTO users(id,name,email,created_at) VALUES('old','Old','old@example.invalid',1); INSERT INTO admin_audit VALUES('history','old','old','grant_shop',1)");
    db.exec(readFileSync(new URL('../migrations/0008_admin_grants.sql',import.meta.url),'utf8'));
    db.exec("UPDATE users SET is_admin=1 WHERE id='old'");
    for(const file of readdirSync(new URL('../migrations/',import.meta.url)).filter(f=>f.endsWith('.sql')&&f>'0008').sort())db.exec(readFileSync(new URL('../migrations/'+file,import.meta.url),'utf8'));
    assert.equal(db.prepare("SELECT admin_level FROM users WHERE id='old'").get().admin_level,2);
    assert.equal(db.prepare("SELECT action FROM admin_audit WHERE id='history'").get().action,'grant_shop');
    db.exec("DELETE FROM users WHERE id='old'");
    const row=db.prepare("SELECT actor_id,target_id FROM admin_audit WHERE id='history'").get();
    assert.equal(row.actor_id,null);assert.equal(row.target_id,null);
  } finally {db.close();}
});
test('grant/revoke is audited once, protects admins, preserves purchases and rejects stale writes',async()=>{
  const {db,env}=setup();try {
    await assert.rejects(adminOverview(env,'player'),{status:403});
    await assert.rejects(changeShopAccess(env,'player',{userId:'player',enabled:true,expected:false}),{status:409});
    await changeShopAccess(env,'owner',{userId:'player',enabled:true,expected:false});
    await assert.rejects(changeShopAccess(env,'owner',{userId:'player',enabled:true,expected:false}),{status:409});
    db.exec("INSERT INTO account_wallets VALUES('player',100); INSERT INTO account_items VALUES('player','skin-jade',60,1); UPDATE users SET piece_skin='jade',cue_skin='carbon',ship_skin='stealth',finish_effect='portal',victory_effect='comet' WHERE id='player'");
    await changeShopAccess(env,'owner',{userId:'player',enabled:false,expected:true});
    const row=db.prepare('SELECT * FROM users WHERE id=?').get('player');
    assert.equal(row.ship_skin,'classic');assert.equal(row.cue_skin,'classic');assert.equal(row.shop_access,0);assert.equal(row.piece_skin,'jade');assert.equal(row.finish_effect,'none');assert.equal(row.victory_effect,'none');
    assert.equal(db.prepare('SELECT balance FROM account_wallets WHERE user_id=?').get('player').balance,40);
    const view=await adminOverview(env,'owner','player@example.invalid');assert.equal(view.total,1);assert.equal(view.audit.length,2);
    assert.equal((await adminOverview(env,'owner',"%' OR 1=1 --")).total,0);
    db.prepare('DELETE FROM users WHERE id=?').run('player');assert.equal((await adminOverview(env,'owner')).audit[0].target,null);
  } finally{db.close();}
});
