import {test} from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync,readdirSync} from 'node:fs';
import {sellItem,equipItem,shopState,openCase} from '../src/shop.js';
import {itemById,saleValue} from '../public/shop-catalog.js';
import {handleAuth} from '../src/auth.js';
import {digest,randomToken} from '../src/auth-crypto.js';

function setup(lastMigration=Infinity){
  const db=new DatabaseSync(':memory:');db.exec('PRAGMA foreign_keys=ON');
  for(const file of readdirSync(new URL('../migrations/',import.meta.url)).filter(f=>f.endsWith('.sql')&&Number(f.slice(0,4))<=lastMigration).sort())db.exec(readFileSync(new URL('../migrations/'+file,import.meta.url),'utf8'));
  db.exec("INSERT INTO users(id,name,email,created_at) VALUES('p','Player','p@example.invalid',1),('q','Other','q@example.invalid',1);INSERT INTO account_wallets VALUES('p',100),('q',100)");
  const env={AUTH_DB:{prepare(sql){return {bind(...args){const query=db.prepare(sql);return {first:async()=>query.get(...args),all:async()=>({results:query.all(...args)}),run:async()=>({meta:{changes:Number(query.run(...args).changes)}})};}};},batch:queries=>Promise.all(queries.map(q=>q.all()))}};
  const award=id=>db.prepare('INSERT INTO account_items VALUES(?,?,0,1)').run('p',id);
  return {db,env,award};
}
const command=item=>({item,requestId:crypto.randomUUID(),expectedValue:saleValue(itemById(item))});
test('upgrading an existing database restores the shop without losing accounts, sessions, coins or items',async()=>{
  const {db,env,award}=setup(14);try{
    award('skin-fox');
    db.exec("UPDATE account_wallets SET balance=470 WHERE user_id='p';UPDATE users SET piece_skin='fox' WHERE id='p'");
    const token=randomToken();db.prepare('INSERT INTO sessions VALUES(?,?,?)').run(digest(token),'p',Math.floor(Date.now()/1000)+3600);
    const request=()=>new Request('https://game.test/api/auth/shop',{headers:{Cookie:'__Host-shishki-session='+token}});
    await assert.rejects(shopState(env,'p'),/no such table: non_resalable_items/);
    assert.equal((await handleAuth(request(),env,{},r=>r.json())).status,503);
    for(const file of ['0015_card_skin.sql','0016_item_sales.sql'])db.exec(readFileSync(new URL('../migrations/'+file,import.meta.url),'utf8'));
    const response=await handleAuth(request(),env,{},r=>r.json());assert.equal(response.status,200);
    const state=await response.json();assert.equal(state.user.id,'p');assert.equal(state.user.cardSkin,'classic');assert.equal(state.user.pieceSkin,'fox');
    assert.equal(state.balance,470);assert.ok(state.owned.includes('skin-fox'));assert.ok(state.sellable.includes('skin-fox'));
    const sale=await sellItem(env,'p',command('skin-fox'));assert.equal(sale.credit,50);
    assert.equal((await shopState(env,'p')).balance,520);
    assert.deepEqual(db.prepare('PRAGMA foreign_key_check').all(),[]);
  }finally{db.close();}
});
test('sales pay exactly 50%, clear only the sold equipment slot, and cannot duplicate credit or consume reacquired items on retry',async()=>{
  const {db,env,award}=setup();try{
    award('card-koi');award('skin-fox');await equipItem(env,'p','card-koi');await equipItem(env,'p','skin-fox');
    const action=command('card-koi'),results=await Promise.all([1,2,3].map(()=>sellItem(env,'p',action)));
    assert.deepEqual(results[0],results[1]);assert.equal(results[0].credit,300);
    const state=await shopState(env,'p');assert.equal(state.balance,400);assert.ok(!state.owned.includes('card-koi'));assert.deepEqual(state.sellable,['skin-fox']);
    const user=db.prepare("SELECT card_skin,piece_skin FROM users WHERE id='p'").get();assert.equal(user.card_skin,'classic');assert.equal(user.piece_skin,'fox');
    await assert.rejects(equipItem(env,'p','card-koi'),{status:403});
    award('card-koi');assert.deepEqual(await sellItem(env,'p',action),results[0]);assert.ok((await shopState(env,'p')).owned.includes('card-koi'));assert.equal((await shopState(env,'p')).balance,400);
    await sellItem(env,'p',command('card-koi'));assert.equal((await shopState(env,'p')).balance,700);
    assert.equal(db.prepare('SELECT COUNT(*) n FROM item_sales').get().n,2);
  }finally{db.close();}
});
test('two distinct sales race for one item; forged prices, foreign items, free defaults and reused request IDs are rejected',async()=>{
  const {db,env,award}=setup();try{
    award('card-astral');const action=command('card-astral');
    await assert.rejects(sellItem(env,'p',{...action,expectedValue:99999}),{status:409});
    await assert.rejects(sellItem(env,'q',action),{status:409});
    await assert.rejects(sellItem(env,'p',command('card-classic')),{status:400});
    const results=await Promise.allSettled([sellItem(env,'p',action),sellItem(env,'p',command('card-astral'))]);assert.equal(results.filter(r=>r.status==='fulfilled').length,1);
    assert.equal((await shopState(env,'p')).balance,350);
    await assert.rejects(sellItem(env,'p',{...action,item:'skin-fox'}),{status:409});
  }finally{db.close();}
});
test('case rewards can be sold; free full-access items stay non-resalable after access is revoked',async()=>{
  const {db,env}=setup();try{
    const earned=await openCase(env,'p',{caseId:'standard',source:'coins',requestId:crypto.randomUUID()});
    assert.ok((await shopState(env,'p')).sellable.includes(earned.itemId));
    await sellItem(env,'p',command(earned.itemId));assert.equal((await shopState(env,'p')).balance,saleValue(itemById(earned.itemId)));
    db.exec("UPDATE users SET shop_access=1 WHERE id='p'");
    const free=await openCase(env,'p',{caseId:'royal',source:'access',requestId:crypto.randomUUID()});
    assert.deepEqual((await shopState(env,'p')).sellable,[]);await assert.rejects(sellItem(env,'p',command(free.itemId)),{status:409});
    db.exec("UPDATE users SET shop_access=0 WHERE id='p'");assert.ok(!(await shopState(env,'p')).sellable.includes(free.itemId));await assert.rejects(sellItem(env,'p',command(free.itemId)),{status:409});
  }finally{db.close();}
});
test('selling an equipped animation resets both effects and does not change earned XP or history',async()=>{
  const {db,env,award}=setup();try{
    award('effect-portal');await equipItem(env,'p','effect-portal','victory');await equipItem(env,'p','effect-portal','resign');
    db.exec("INSERT INTO account_results VALUES('p','m','durak-transfer','win',8,1,30)");const before=await shopState(env,'p');await sellItem(env,'p',command('effect-portal'));
    const row=db.prepare("SELECT finish_effect,victory_effect FROM users WHERE id='p'").get();assert.equal(row.finish_effect,'none');assert.equal(row.victory_effect,'none');assert.deepEqual((await shopState(env,'p')).progression,before.progression);
  }finally{db.close();}
});
test('sell endpoint requires a session and same-origin JSON, uses server value and returns updated inventory',async()=>{
  const {db,env,award}=setup();try{
    award('card-imperial');const token=randomToken();db.prepare('INSERT INTO sessions VALUES(?,?,?)').run(digest(token),'p',Math.floor(Date.now()/1000)+3600);
    const send=(headers={})=>handleAuth(new Request('https://game.test/api/auth/shop/sell',{method:'POST',headers:{Origin:'https://game.test','Content-Type':'application/json',...headers},body:JSON.stringify(command('card-imperial'))}),env,{},request=>request.json());
    assert.equal((await send()).status,401);assert.equal((await send({Cookie:'__Host-shishki-session='+token,Origin:'https://evil.invalid'})).status,403);
    const response=await send({Cookie:'__Host-shishki-session='+token});assert.equal(response.status,200);const data=await response.json();assert.equal(data.sale.credit,275);assert.equal(data.balance,375);assert.ok(!data.owned.includes('card-imperial'));
  }finally{db.close();}
});
