import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync, readdirSync } from 'node:fs';
import { shopState, buyItem, equipItem, openCase } from '../src/shop.js';
import { CATALOG, itemById } from '../public/shop-catalog.js';
import { TEXTURES,pieceArt } from '../public/skin-art.js';
import { CUE_SHAPES,animatedCue,validCueSkin } from '../public/pool-cue.js';
import { translations } from '../public/locales.js';
import { CASES,caseContents,selectCaseItem,rarityOf,progression,milestoneCase,matchXP,levelThreshold } from '../public/cases.js';

test('case chances cover every collectible, sum to 100 and select the published rarity boundaries',()=>{
  for(const box of CASES){
    const contents=caseContents(box);assert.ok(Math.abs(contents.reduce((sum,row)=>sum+row.chance,0)-100)<1e-9);
    let boundary=0;
    for(const [rarity,chance] of Object.entries(box.odds)){
      if(chance){assert.equal(rarityOf(selectCaseItem(box,(boundary+.00001)/100,0)),rarity);assert.equal(rarityOf(selectCaseItem(box,(boundary+chance-.00001)/100,.999999)),rarity);}
      boundary+=chance;
    }
    assert.throws(()=>selectCaseItem(box,1,0));assert.throws(()=>selectCaseItem(box,NaN,0));
  }
  assert.deepEqual(new Set(caseContents(CASES[0]).map(row=>row.item.id)),new Set(CATALOG.filter(item=>item.price).map(item=>item.id)));
});

test('case debit and item award are atomic, retries are idempotent and concurrent requests cannot overdraw',async()=>{
  const {db,env}=database();try{
    await assert.rejects(buyItem(env,'other','skin-jade'),{status:410});
    const command={caseId:'standard',source:'coins',requestId:crypto.randomUUID(),itemId:'cue-aurora',cost:0};
    const results=await Promise.all([1,2,3].map(()=>openCase(env,'other',command)));
    assert.deepEqual(results[0],results[1]);assert.deepEqual(results[0],results[2]);
    assert.equal((await shopState(env,'other')).balance,0);assert.equal(results[0].duplicate,false);assert.equal(results[0].cost,100);
    assert.equal(db.prepare('SELECT COUNT(*) n FROM case_openings').get().n,1);
    await equipItem(env,'other',results[0].itemId);
    await assert.rejects(openCase(env,'other',{...command,requestId:crypto.randomUUID()}),{status:409});
    await assert.rejects(openCase(env,'other',{...command,caseId:'royal'}),{status:409});
    await assert.rejects(openCase(env,'other',{...command,source:'access',requestId:crypto.randomUUID()}),{status:403});
    await assert.rejects(openCase(env,'other',{...command,source:'reward',requestId:crypto.randomUUID()}),{status:409});
    db.prepare('UPDATE account_wallets SET balance=100 WHERE user_id=?').run('other');
    // A second fresh account ensures there can be no duplicate compensation in this race.
    db.prepare('DELETE FROM account_items WHERE user_id=?').run('other');
    const race=await Promise.allSettled([1,2].map(()=>openCase(env,'other',{...command,requestId:crypto.randomUUID()})));
    assert.equal(race.filter(r=>r.status==='fulfilled').length,1);assert.equal((await shopState(env,'other')).balance,0);
    // All items owned forces a duplicate without weakening production randomness.
    for(const item of CATALOG.filter(item=>item.price))db.prepare('INSERT OR IGNORE INTO account_items VALUES(?,?,0,0)').run('other',item.id);
    db.prepare('UPDATE account_wallets SET balance=500 WHERE user_id=?').run('other');
    const duplicate=await openCase(env,'other',{caseId:'royal',source:'coins',requestId:crypto.randomUUID()});
    assert.equal(duplicate.duplicate,true);assert.ok([40,90,180].includes(duplicate.compensation));assert.equal((await shopState(env,'other')).balance,duplicate.compensation);
  }finally{db.close();}
});

test('XP, all ten-level milestones and free-case consumption agree in SQL and JS and survive retries',async()=>{
  const {db,env}=database();try{
    const write=db.prepare('INSERT OR IGNORE INTO account_results VALUES(?,?,?,?,?,?,?)');
    for(const result of ['win','draw','loss']){
      write.run('other',result,'chess',result,4,1,0);write.run('other',result,'chess',result,4,1,0);
      write.run('other',result+'short','chess',result,3,1,0);
    }
    assert.equal((await shopState(env,'other')).progression.xp,200);assert.equal(matchXP('win',3),0);
    for(let level=1;level<=300;level++){
      const xp=levelThreshold(level);db.prepare('UPDATE account_progress SET xp=? WHERE user_id=?').run(xp,'other');
      const p=progression(xp),sql=db.prepare('SELECT * FROM earned_cases WHERE user_id=?').get('other');delete sql.user_id;
      assert.deepEqual({...sql},p.earned);assert.equal(Object.values(p.earned).reduce((a,b)=>a+b,0),Math.floor(level/10));
      if(level%10===0){const before=progression(xp-1);assert.equal(p.earned[milestoneCase(level)]-before.earned[milestoneCase(level)],1);}
    }
    db.prepare('UPDATE account_progress SET xp=? WHERE user_id=?').run(levelThreshold(10),'other');
    assert.deepEqual((await shopState(env,'other')).cases,{standard:1,premium:0,royal:0});
    const request={caseId:'standard',source:'reward',requestId:crypto.randomUUID()};
    const first=await openCase(env,'other',request);assert.equal(first.cost,0);assert.deepEqual(await openCase(env,'other',request),first);
    assert.equal((await shopState(env,'other')).balance,100);assert.equal((await shopState(env,'other')).cases.standard,0);
    await assert.rejects(openCase(env,'other',{...request,requestId:crypto.randomUUID()}),{status:409});
    const demo=await openCase(env,'owner',{...request,source:'access',requestId:crypto.randomUUID()});assert.equal(demo.cost,0);assert.equal(demo.compensation,0);
    db.prepare('DELETE FROM users WHERE id=?').run('other');assert.equal(db.prepare("SELECT COUNT(*) n FROM case_openings WHERE user_id='other'").get().n,0);
    assert.equal(db.prepare("SELECT COUNT(*) n FROM account_progress WHERE user_id='other'").get().n,0);
  }finally{db.close();}
});

test('migration credits past results without changing balances or existing ownership',()=>{
  const db=new DatabaseSync(':memory:');try{
    for(const file of readdirSync(new URL('../migrations/',import.meta.url)).filter(f=>f.endsWith('.sql')&&f<'0011').sort())db.exec(readFileSync(new URL('../migrations/'+file,import.meta.url),'utf8'));
    db.exec("INSERT INTO users(id,name,email,created_at) VALUES('u','User','u@example.invalid',1); INSERT INTO account_results VALUES('u','one','chess','win',4,1,30); INSERT INTO account_results VALUES('u','two','pool8','loss',3,2,0); INSERT INTO account_items VALUES('u','skin-jade',60,1)");
    const balance=db.prepare('SELECT balance FROM account_wallets').get().balance;
    db.exec(readFileSync(new URL('../migrations/0011_cases_levels.sql',import.meta.url),'utf8'));
    assert.equal(db.prepare('SELECT xp FROM account_progress').get().xp,100);assert.equal(db.prepare('SELECT balance FROM account_wallets').get().balance,balance);
    assert.equal(db.prepare('SELECT item_id FROM account_items').get().item_id,'skin-jade');
    db.exec("INSERT OR IGNORE INTO account_results VALUES('u','one','chess','win',4,1,30)");assert.equal(db.prepare('SELECT xp FROM account_progress').get().xp,100);
  }finally{db.close();}
});

test('progressive XP preserves existing levels and consumed rewards, with increasing thresholds',async()=>{
  const db=new DatabaseSync(':memory:');try{
    for(const file of readdirSync(new URL('../migrations/',import.meta.url)).filter(f=>f.endsWith('.sql')&&f<'0013').sort())db.exec(readFileSync(new URL('../migrations/'+file,import.meta.url),'utf8'));
    for(const [index,xp] of [0,199,200,1800,1999,3800,9800,19899,1000000].entries()){
      db.prepare('INSERT INTO users(id,name,email,created_at) VALUES(?,?,?,1)').run(String(index),'Test',index+'@example.invalid');
      db.prepare('INSERT INTO account_progress VALUES(?,?)').run(String(index),xp);
    }
    db.exec("INSERT INTO account_wallets VALUES('3',100); INSERT INTO case_openings(user_id,request_id,case_id,source,item_id,rarity,cost,compensation,opened_at) VALUES('3','legacy-reward','standard','reward','skin-jade','common',0,20,1)");
    const before=db.prepare('SELECT * FROM account_progress').all();
    db.exec(readFileSync(new URL('../migrations/0013_progressive_levels.sql',import.meta.url),'utf8'));
    for(const old of before){
      const p=progression(db.prepare('SELECT xp FROM account_progress WHERE user_id=?').get(old.user_id).xp);
      assert.equal(p.level,1+Math.floor(old.xp/200));
      assert.ok(Math.abs(p.current/p.required-(old.xp%200)/200)<1/p.required+.00001);
      assert.equal(db.prepare('SELECT level FROM account_levels WHERE user_id=?').get(old.user_id).level,p.level);
    }
    assert.equal(db.prepare("SELECT COUNT(*) n FROM case_openings WHERE user_id='3'").get().n,1);
    assert.equal(db.prepare("SELECT standard FROM earned_cases WHERE user_id='3'").get().standard,1);
    assert.equal(db.prepare("SELECT balance FROM account_wallets WHERE user_id='3'").get().balance,100);
    assert.equal(db.prepare("SELECT item_id FROM account_items WHERE user_id='3'").get().item_id,'skin-jade');
    for(let level=1;level<=1000;level++){
      const start=levelThreshold(level),end=levelThreshold(level+1);
      assert.equal(end-start,200+50*(level-1));assert.equal(progression(start).level,level);
      assert.equal(progression(end-1).level,level);assert.equal(progression(end).level,level+1);
    }
  }finally{db.close();}
});

test('legacy material and cue purchases remain translated and retain their equipment slots',async()=>{
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
      await legacyPurchase(db,env,item.id);await legacyPurchase(db,env,item.id);await equipItem(env,'other',item.id);
      balance-=item.price;assert.equal((await shopState(env,'other')).balance,balance);
      const after=db.prepare('SELECT cue_skin,piece_skin FROM users WHERE id=?').get('other');
      const changed=item.type==='skin'?'piece_skin':'cue_skin',same=item.type==='skin'?'cue_skin':'piece_skin';
      assert.equal(after[changed],item.value);assert.equal(after[same],before[same]);
    }
  }finally{db.close();}
});

async function legacyPurchase(db,env,id){await shopState(env,'other');const item=itemById(id);db.prepare('INSERT OR IGNORE INTO account_items VALUES(?,?,?,?)').run('other',id,item.price,1);}
function database(verified = true) {
  const db = new DatabaseSync(':memory:'); db.exec('PRAGMA foreign_keys=ON');
  for (const file of readdirSync(new URL('../migrations/', import.meta.url)).filter(f => f.endsWith('.sql') && f < '0006')) db.exec(readFileSync(new URL('../migrations/' + file, import.meta.url), 'utf8'));
  db.prepare('INSERT INTO users(id,name,email,created_at,email_verified,google_sub) VALUES(?,?,?,?,?,?)').run('owner', 'Owner', 'kkoallqq@gmail.com', 1, verified ? 1 : 0, verified ? 'verified-google-id' : null);
  db.prepare('INSERT INTO users(id,name,email,created_at) VALUES(?,?,?,?)').run('other', 'Other', 'other@example.invalid', 1);
  db.exec(readFileSync(new URL('../migrations/0006_shop_access.sql', import.meta.url), 'utf8'));
  db.exec(readFileSync(new URL('../migrations/0009_cue_skin.sql', import.meta.url), 'utf8'));
  db.exec(readFileSync(new URL('../migrations/0010_ship_skin.sql', import.meta.url), 'utf8'));
  db.exec(readFileSync(new URL('../migrations/0011_cases_levels.sql',import.meta.url),'utf8'));
  db.exec(readFileSync(new URL('../migrations/0013_progressive_levels.sql',import.meta.url),'utf8'));
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
      await assert.rejects(buyItem(env, 'owner', item.id),{status:410});
      await equipItem(env, 'owner', item.id, 'victory'); await equipItem(env, 'owner', item.id, 'resign');
    }
    assert.equal((await shopState(env, 'owner')).balance, initial.balance);
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM account_items WHERE user_id=?').get('owner').n, 0);
    assert.equal((await shopState(env, 'other')).fullAccess, false);
    await assert.rejects(equipItem(env, 'other', 'effect-portal', 'victory'), { status: 403 });
    await legacyPurchase(db,env,'skin-jade'); assert.equal((await shopState(env, 'other')).balance, 40);
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
test('legacy cue skins retain ownership and independent equipment',async()=>{
  const {db,env}=database();try{
    await assert.rejects(equipItem(env,'other','cue-carbon'),{status:403});
    await legacyPurchase(db,env,'cue-carbon');await legacyPurchase(db,env,'cue-carbon');
    await equipItem(env,'other','cue-carbon');
    assert.equal((await shopState(env,'other')).balance,20);
    const user=db.prepare('SELECT cue_skin,piece_skin,finish_effect,victory_effect FROM users WHERE id=?').get('other');
    assert.equal(user.cue_skin,'carbon');assert.equal(user.piece_skin,'classic');assert.equal(user.finish_effect,'none');assert.equal(user.victory_effect,'none');
    await equipItem(env,'other','cue-classic');
    assert.equal(db.prepare('SELECT cue_skin FROM users WHERE id=?').get('other').cue_skin,'classic');
  }finally{db.close();}
});

test('legacy ship models retain ownership and independent equipment',async()=>{
  const {db,env}=database();try{
    await assert.rejects(equipItem(env,'other','ship-submarine'),{status:403});
    await assert.rejects(equipItem(env,'other','ship-invented'),{status:400});
    await legacyPurchase(db,env,'ship-submarine');await legacyPurchase(db,env,'ship-submarine');await equipItem(env,'other','ship-submarine');
    assert.equal((await shopState(env,'other')).balance,20);
    const user=db.prepare('SELECT ship_skin,cue_skin,piece_skin,finish_effect,victory_effect FROM users WHERE id=?').get('other');
    assert.deepEqual({...user},{ship_skin:'submarine',cue_skin:'classic',piece_skin:'classic',finish_effect:'none',victory_effect:'none'});
    await equipItem(env,'other','ship-classic');assert.equal(db.prepare('SELECT ship_skin FROM users WHERE id=?').get('other').ship_skin,'classic');
  }finally{db.close();}
});
