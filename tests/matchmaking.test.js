import {test} from 'node:test';
import assert from 'node:assert/strict';
import {register} from 'node:module';
import {VARIANTS} from '../public/game.js';
register('./helpers/cloudflare-loader.js',import.meta.url);
globalThis.WebSocketRequestResponsePair=class{};
const {Matchmaker,SEARCH_LEASE,handleMatchmaking}=await import('../src/matchmaking.js');
const {GameRoom}=await import('../src/worker.js');
function context(){
  const data=new Map();let queue=Promise.resolve();
  return {data,blockConcurrencyWhile(fn){const result=queue.then(fn);queue=result.catch(()=>{});return result;},
    getWebSockets:()=>[],setWebSocketAutoResponse(){},storage:{
      async get(key){return structuredClone(data.get(key));},
      async put(key,value){for(const [k,v] of typeof key==='string'?[[key,value]]:Object.entries(key))data.set(k,structuredClone(v));},
      async list({prefix}){return new Map([...data].filter(([key])=>key.startsWith(prefix)).map(([k,v])=>[k,structuredClone(v)]));},
      async delete(keys){for(const key of Array.isArray(keys)?keys:[keys])data.delete(key);},
      async setAlarm(){},async deleteAlarm(){},async deleteAll(){data.clear();}
    }};
}
function fixture(){
  const ctx=context(),rooms=new Map(),bindings=[];
  const env={AUTH_DB:{prepare:()=>({bind:(...args)=>({run:async()=>bindings.push(args)})})}};
  env.ROOMS={getByName(code){if(!rooms.has(code)){const rc=context();rooms.set(code,new GameRoom(rc,env));}return rooms.get(code);}};
  const coordinator=new Matchmaker(ctx,env);
  async function call(actor,action,ticket,variant='russian',user=null,target=coordinator){
    const response=await target.fetch(new Request('https://internal/',{method:'POST',headers:{'X-Match-Actor':actor,...(user?{'X-Auth-User':encodeURIComponent(JSON.stringify(user))}:{})},body:JSON.stringify({action,ticket,variant})}));
    return {status:response.status,...await response.json()};
  }
  return {ctx,env,rooms,call,coordinator,bindings};
}
test('every mode pairs distinct players with private seats and idempotent durable room creation',async()=>{
  for(const variant of Object.keys(VARIANTS)){
    const f=fixture(),a=crypto.randomUUID(),b=crypto.randomUUID();
    assert.equal((await f.call('a','join',a,variant)).status,'waiting');
    const second=await f.call('b','join',b,variant),first=await f.call('a','status',a);
    assert.equal(first.status,'matched');assert.equal(second.code,first.code);assert.notEqual(second.token,first.token);
    assert.equal('pair' in first,false);assert.equal('players' in first,false);
    const room=f.rooms.get(first.code);assert.equal(room.room.game.variant,variant);
    assert.ok(room.role(first.token));assert.notEqual(room.role(first.token),room.role(second.token));
    room.room.game.revision=17;await room.save();
    await f.call('a','ack',a);assert.equal(room.room.game.revision,17);
    const restarted=new Matchmaker(f.ctx,f.env);
    assert.equal((await f.call('a','status',a,variant,null,restarted)).token,first.token);
  }
});
test('FIFO, mode isolation, same account deduplication and cancellation-before-join',async()=>{
  const f=fixture(),a=crypto.randomUUID(),b=crypto.randomUUID(),c=crypto.randomUUID(),d=crypto.randomUUID();
  await f.call('account:a','join',a,'russian',{id:'a',name:'Alice',cueSkin:'classic'});
  assert.equal((await f.call('account:a','join',b,'chess')).ticket,a);
  assert.equal((await f.call('b','join',b,'chess')).status,'waiting');
  assert.equal((await f.call('c','join',c)).status,'matched');
  assert.equal((await f.call('b','status',b)).status,'waiting');
  assert.equal((await f.call('d','cancel',d)).status,'cancelled');
  assert.equal((await f.call('d','join',d)).status,'cancelled');
  const pair=await f.call('account:a','status',a),room=f.rooms.get(pair.code),side=room.role(pair.token);
  assert.equal(room.room.accounts[side],'a');assert.equal(room.room.names[side],'Alice');assert.ok(f.bindings.some(row=>row[0]==='a'));
  assert.equal((await f.call('outsider','status',a)).status,403);
  assert.equal((await f.call('outsider','cancel',a)).status,403);
  assert.equal((await f.call('outsider','ack',a)).status,403);
});
test('concurrent joins reserve each player once; matched cancellation cannot strand the peer',async()=>{
  const f=fixture(),tickets=Array.from({length:5},()=>crypto.randomUUID());
  const responses=await Promise.all(tickets.map((id,i)=>f.call('p'+i,'join',id)));
  assert.equal(f.rooms.size,2);
  const states=await Promise.all(tickets.map((id,i)=>f.call('p'+i,'status',id)));
  assert.equal(states.filter(s=>s.status==='waiting').length,1);
  for(const code of f.rooms.keys())assert.equal(states.filter(s=>s.code===code).length,2);
  const index=states.findIndex(s=>s.status==='matched');
  assert.equal((await f.call('p'+index,'cancel',tickets[index])).code,states[index].code);
  assert.equal(responses.length,5);
});
test('heartbeat extends lease; abandoned entries expire and cannot match later players',async t=>{
  t.mock.timers.enable({apis:['Date'],now:1800000000000});
  const f=fixture(),a=crypto.randomUUID();await f.call('a','join',a);
  t.mock.timers.tick(SEARCH_LEASE-1);assert.equal((await f.call('a','status',a)).status,'waiting');
  t.mock.timers.tick(SEARCH_LEASE+1);await f.coordinator.alarm();
  assert.equal((await f.call('a','status',a)).status,'expired');
  assert.equal((await f.call('b','join',crypto.randomUUID())).status,'waiting');assert.equal(f.rooms.size,0);
});
test('failed cross-object creation keeps reservations and safely retries the same pair',async()=>{
  const f=fixture(),a=crypto.randomUUID(),b=crypto.randomUUID();await f.call('a','join',a);
  const original=f.env.ROOMS.getByName;let fail=true;
  f.env.ROOMS.getByName=code=>({async fetch(request){const response=await original(code).fetch(request);if(fail){fail=false;return new Response('',{status:503});}return response;}});
  assert.equal((await f.call('b','join',b)).status,503);
  const first=await f.call('a','status',a),second=await f.call('b','status',b);
  assert.equal(first.code,second.code);assert.equal(f.rooms.size,1);
});
test('server derives actor from account or secure guest cookie instead of supplied headers',async()=>{
  const f=fixture();f.env.MATCHMAKER={getByName:()=>f.coordinator};const ticket=crypto.randomUUID();
  const post=(cookie,identity,action='join')=>handleMatchmaking(new Request('https://game.test/api/matchmaking',{method:'POST',headers:{'X-Match-Actor':'spoof',...(cookie?{Cookie:cookie}:{})},body:JSON.stringify({action,ticket,variant:'chess'})}),f.env,identity);
  const first=await post();assert.match(first.headers.get('set-cookie'),/HttpOnly.*SameSite=Lax.*Secure/);
  const cookie=first.headers.get('set-cookie').split(';')[0];assert.equal((await (await post(cookie,null,'status')).json()).status,'waiting');
  assert.equal((await post(null,null,'cancel')).status,403);
  assert.equal((await post(cookie,{id:'another'},'status')).status,403);
});
