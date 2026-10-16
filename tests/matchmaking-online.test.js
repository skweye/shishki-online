import {test} from 'node:test';
import assert from 'node:assert/strict';
import WebSocket from 'ws';
import {once} from 'node:events';
import {setTimeout as delay} from 'node:timers/promises';
import {VARIANTS,legalMoves} from '../public/game.js';
const base=process.env.TEST_BASE_URL||'http://127.0.0.1:8787';
function player(cookie=''){
  const cookies=new Map(cookie?cookie.split('; ').map(c=>c.split('=')):[]);
  return {async post(path,body,headers={}){
    const r=await fetch(base+path,{method:'POST',headers:{Origin:base,'Content-Type':'application/json',Cookie:[...cookies].map(([k,v])=>k+'='+v).join('; '),...headers},body:JSON.stringify(body)});
    for(const c of r.headers.getSetCookie()){const [k,...v]=c.split(';')[0].split('=');cookies.set(k,v.join('='));}
    return {status:r.status,data:await r.json()};
  },get cookie(){return [...cookies].map(([k,v])=>k+'='+v).join('; ');}};
}
async function pair(variant,a=player(),b=player()){
  const ta=crypto.randomUUID(),tb=crypto.randomUUID();
  assert.equal((await a.post('/api/matchmaking',{action:'join',ticket:ta,variant})).data.status,'waiting');
  const second=await b.post('/api/matchmaking',{action:'join',ticket:tb,variant});
  assert.equal(second.status,200,JSON.stringify(second.data));assert.equal(second.data.status,'matched');
  const first=await a.post('/api/matchmaking',{action:'status',ticket:ta});assert.equal(first.data.code,second.data.code);
  assert.notEqual(first.data.token,second.data.token);
  const one=await a.post('/api/rooms/'+first.data.code+'/join',{token:first.data.token});
  const two=await b.post('/api/rooms/'+second.data.code+'/join',{token:second.data.token});
  assert.equal(one.status,200,JSON.stringify(one.data));assert.equal(two.status,200,JSON.stringify(two.data));assert.notEqual(one.data.role,two.data.role);
  await a.post('/api/matchmaking',{action:'ack',ticket:ta});await b.post('/api/matchmaking',{action:'ack',ticket:tb});
  return {a,b,one:one.data,two:two.data,code:first.data.code,ta,tb};
}
async function socket(code,token,cookie=''){
  const ws=new WebSocket(base.replace(/^http/,'ws')+'/api/rooms/'+code+'/socket',['checkers',token],{headers:{Cookie:cookie}}),messages=[];
  ws.on('message',data=>{if(data.toString()!=='pong')messages.push(JSON.parse(data));});await once(ws,'open');
  return {ws,async wait(fn){for(let i=0;i<160;i++){const at=messages.findIndex(fn);if(at>=0)return messages.splice(at,1)[0];await delay(25);}throw Error('No socket update: '+JSON.stringify(messages));}};
}
test('matchmaking creates playable rooms in all modes with private views and reconnectable seats',async()=>{
  for(const variant of Object.keys(VARIANTS)){
    const p=await pair(variant);assert.equal(p.one.game.variant,variant);assert.equal(p.one.ready,true);
    const stolen=await player().post('/api/rooms/'+p.code+'/join',{});assert.equal(stolen.status,409);
    const restored=await p.a.post('/api/rooms/'+p.code+'/join',{token:p.one.token});assert.equal(restored.data.role,p.one.role);assert.deepEqual(restored.data.game,p.one.game);
    if(variant==='domino'){assert.equal(p.one.game.hands[p.two.role].length,0);assert.equal('stock' in p.one.game,false);}
    if(variant==='battleship')assert.deepEqual(p.one.game.fleets[p.two.role],[]);
  }
});
test('queue validates requests, isolates guests, respects cancellation and cannot be forged',async()=>{
  const a=player(),b=player(),ticket=crypto.randomUUID();
  assert.equal((await a.post('/api/matchmaking',{action:'join',ticket,variant:'made-up'})).status,400);
  assert.equal((await a.post('/api/matchmaking',{action:'join',ticket,variant:'chess'},{Origin:'https://evil.test'})).status,403);
  assert.equal((await a.post('/api/matchmaking',{action:'join',ticket,variant:'chess'})).data.status,'waiting');
  assert.equal((await b.post('/api/matchmaking',{action:'cancel',ticket},{'X-Match-Actor':'guest:'+a.cookie.split('=')[1]})).status,403);
  assert.equal((await a.post('/api/matchmaking',{action:'cancel',ticket})).data.status,'cancelled');
  assert.equal((await a.post('/api/matchmaking',{action:'join',ticket,variant:'chess'})).data.status,'cancelled');
});
test('matched accounts keep identity, server moves, statistics, reconnect and rematches', {timeout:30000},async()=>{
  const password='Search-test-2026!!',email=`search-${crypto.randomUUID()}@example.invalid`,a=player();
  const account=await a.post('/api/auth/register',{name:'Search Player',email,password,confirmPassword:password});assert.equal(account.status,201,JSON.stringify(account.data));
  let first,second;
  try{
    const ticket=crypto.randomUUID();await a.post('/api/matchmaking',{action:'join',ticket,variant:'chess'});
    const otherTab=player(a.cookie),duplicate=await otherTab.post('/api/matchmaking',{action:'join',ticket:crypto.randomUUID(),variant:'russian'});
    assert.equal(duplicate.data.ticket,ticket);assert.equal(duplicate.data.status,'waiting');
    await a.post('/api/matchmaking',{action:'cancel',ticket});
    const p=await pair('russian',a),side=p.one.role;assert.equal(p.one.names[side],'Search Player');assert.equal(p.one.accountBound[side],true);
    assert.equal((await player().post('/api/rooms/'+p.code+'/join',{token:p.one.token})).status,401);
    first=await socket(p.code,p.one.token,a.cookie);second=await socket(p.code,p.two.token,p.b.cookie);
    const clients={[side]:first,[p.two.role]:second};let game=(await first.wait(m=>m.type==='state'&&m.ready)).game;
    for(let i=0;i<4;i++){await delay(120);const move=legalMoves(game)[0];clients[game.turn].ws.send(JSON.stringify({type:'move',...move,revision:game.revision}));game=(await first.wait(m=>m.type==='state'&&m.game.revision===i+1)).game;}
    await delay(120);second.ws.send(JSON.stringify({type:'resign',revision:game.revision}));game=(await first.wait(m=>m.type==='state'&&m.game.winner===side)).game;
    const restored=await a.post('/api/rooms/'+p.code+'/join',{token:p.one.token});assert.equal(restored.data.game.winner,side);
    await delay(120);first.ws.send(JSON.stringify({type:'rematch',revision:game.revision}));second.ws.send(JSON.stringify({type:'rematch',revision:game.revision}));
    const fresh=await first.wait(m=>m.type==='state'&&m.game.revision===game.revision+1);assert.equal(fresh.game.winner,null);
    const profile=await (await fetch(base+'/api/auth/account',{headers:{Cookie:a.cookie}})).json();
    assert.equal(profile.modes.find(mode=>mode.variant==='russian').wins,1);assert.equal(profile.recent[0].moves,4);
  }finally{first?.ws.terminate();second?.ws.terminate();assert.equal((await a.post('/api/auth/delete-account',{email,password,confirmation:'DELETE'})).status,200);}
});
