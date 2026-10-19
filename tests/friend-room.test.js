import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createLobby,friendAction} from '../src/friend-room.js';
import {newGame,VARIANTS} from '../public/game.js';

const room=()=>({lobby:createLobby('russian'),game:newGame(),players:{white:'a',black:null},clock:null,chat:[{text:'hello'}],pendingResults:[{userId:'saved-result'}]});
const act=(r,role,type,data={})=>friendAction(r,role,{type,lobbyRevision:r.lobby.revision,...data},12345);
test('selection clears readiness and rejects stale, invalid and unseated commands',()=>{
  const r=room();act(r,'white','room-ready',{ready:true});assert.deepEqual(r.lobby.ready,['white']);assert.equal(r.clock,null);
  assert.throws(()=>act(r,'black','room-select',{variant:'chess'}));
  act(r,'white','room-select',{variant:'chess'});assert.deepEqual(r.lobby.ready,[]);
  assert.throws(()=>act(r,'white','room-ready',{ready:true,lobbyRevision:0}),/изменился/);
  assert.throws(()=>act(r,'white','room-select',{variant:'__proto__'}),/Неизвестный/);
  assert.throws(()=>act(r,'white','room-ready',{ready:'yes'}),/Некорректный/);
  assert.equal(r.lobby.phase,'lobby');assert.equal(r.game.revision,0);
});
test('both players can choose every game, preserving seats, chat, outbox and monotonic revisions',()=>{
  const r=room();r.players.black='b';let revision=0;const matchIds=new Set();
  for(const variant of Object.keys(VARIANTS)){
    act(r,'black','room-select',{variant});const selection=r.lobby.revision;
    act(r,'white','room-ready',{ready:true});act(r,'white','room-ready',{ready:true});assert.equal(r.lobby.phase,'lobby');
    act(r,'black','room-ready',{ready:true});assert.equal(r.game.variant,variant);assert.equal(r.lobby.phase,'playing');
    assert.equal(r.game.revision,++revision);matchIds.add(r.matchId);
    assert.throws(()=>act(r,'white','room-ready',{lobbyRevision:selection,ready:true}));
    assert.throws(()=>act(r,'white','room-select',{variant:'chess'}));
    if(r.clock)assert.equal(r.clock.startedAt,12345);
    act(r,'white','room-lobby');assert.equal(r.lobby.phase,'playing');
    act(r,'white','room-lobby');assert.equal(r.lobby.phase,'playing','one seat cannot accept its own proposal');
    act(r,'black','room-stay');assert.equal(r.lobby.returnOffer,null);
    act(r,'black','room-lobby');act(r,'white','room-lobby');assert.equal(r.lobby.phase,'lobby');
    assert.equal(r.game.revision,++revision);assert.equal(r.clock,null);assert.deepEqual(r.players,{white:'a',black:'b'});
    assert.deepEqual(r.chat,[{text:'hello'}]);assert.deepEqual(r.pendingResults,[{userId:'saved-result'}]);
  }
  assert.equal(matchIds.size,Object.keys(VARIANTS).length);
});
test('completed matches return directly; next match clears result flags without overwriting pending results',()=>{
  const r=room();r.players.black='b';act(r,'white','room-ready',{ready:true});act(r,'black','room-ready',{ready:true});
  r.game.winner='black';r.game.reason='resign';r.resultRecorded=true;
  act(r,'black','room-lobby');assert.equal(r.lobby.phase,'lobby');assert.equal(r.resultRecorded,true);
  act(r,'white','room-select',{variant:'durak-transfer'});act(r,'white','room-ready',{ready:true});
  act(r,'white','room-ready',{ready:false});assert.deepEqual(r.lobby.ready,[]);
  act(r,'black','room-ready',{ready:true});assert.equal(r.lobby.phase,'lobby');act(r,'white','room-ready',{ready:true});
  assert.equal(r.resultRecorded,false);assert.equal(r.game.winner,null);assert.equal(r.pendingResults.length,1);
});
test('winning a Chapaev round still requires both players to abandon the unfinished match',()=>{
  const r=room();r.players.black='b';act(r,'white','room-select',{variant:'chapaev'});
  act(r,'white','room-ready',{ready:true});act(r,'black','room-ready',{ready:true});
  r.game.winner='white';r.game.reason='round';act(r,'white','room-lobby');
  assert.equal(r.lobby.phase,'playing');assert.equal(r.lobby.returnOffer,'white');
  act(r,'black','room-lobby');assert.equal(r.lobby.phase,'lobby');
});
