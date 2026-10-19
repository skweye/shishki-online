import {test} from 'node:test';
import assert from 'node:assert/strict';
import {parseHTML} from 'linkedom';
import {createBotPresentation,botActionText} from '../public/bot-presentation.js';
import {createRoomSync} from '../public/room-sync.js';
import {t} from '../public/i18n.js';

test('watchdog requests missed state, retries an unresponsive socket and pauses outside a visible bot match',()=>{
  let time=100,requests=[],reconnects=0;
  const c={active:true,bot:true,connected:true,hidden:false,code:'A',waiting:true};
  const sync=createRoomSync({current:()=>c,send:data=>requests.push(data),reconnect:()=>reconnects++,now:()=>time});
  sync.check();time+=1999;sync.check();assert.equal(requests.length,0);
  time++;sync.check();assert.deepEqual(requests,[{type:'sync'}]);
  time+=2000;sync.check();assert.equal(requests.length,1);
  sync.received();time+=2000;sync.check();assert.equal(requests.length,2);
  time+=4500;sync.check();assert.equal(reconnects,1);
  for(const key of ['hidden','bot','active','connected']){
    const old=c[key];c[key]=key==='hidden';time+=20000;const count=requests.length;sync.check(true);assert.equal(requests.length,count,key);c[key]=old;
  }
  sync.check(true);assert.equal(requests.length,3);sync.received();c.waiting=false;
  time+=5000;sync.check();assert.equal(requests.length,3);time+=7000;sync.check();assert.equal(requests.length,4);
});

test('previews show exact pool aim and board targets once, stay silent on restore, and clean up on hidden/finished/stale state',()=>{
  const {document,window}=parseHTML('<html><body><div id="board"><button data-index="17"></button><button data-index="26"></button></div><div id="durak-board"><div class="durak-opponent"><span class="durak-card"></span></div><div class="durak-table"><button data-target="0"></button></div></div><button data-sea-own="true" data-sea-cell="44"></button></body></html>');
  const aims=[],placements=[],shots=[],sounds=[];let stops=0;
  const p=createBotPresentation({doc:document,pool:{receiveAim:a=>aims.push(a),receivePlacement:a=>placements.push(a)},chapaev:{receiveAim:a=>shots.push(a)},sound:s=>{sounds.push(s);return()=>stops++;}});
  const c={game:{variant:'pool8',revision:3,winner:null},room:{bot:true,code:'A',botPreview:{revision:3,role:'black',kind:'pool-shot',angle:135,power:.7,placing:false,executeAt:1420}},active:true,now:1000};
  p.update(c);assert.equal(aims.at(-1).angle,135);assert.equal(aims.at(-1).power,.7);assert.equal(aims.at(-1).windup,420);
  p.update({...c,audible:true});p.update({...c,audible:true});assert.deepEqual(sounds,['bot-aim']);assert.equal(aims.filter(Boolean).length,1);
  c.game.revision++;p.update(c);assert.equal(aims.at(-1),null);assert.equal(stops,1);
  c.game.variant='russian';c.room.botPreview={revision:4,kind:'move',from:17,to:26,executeAt:1300};p.update({...c,audible:false});
  assert.ok(document.querySelector('[data-index="17"]').classList.contains('bot-source'));assert.ok(document.querySelector('[data-index="26"]').classList.contains('bot-target'));
  p.update({...c,audible:true});assert.equal(sounds.length,1,'restored preview stays silent');
  c.room.botPreview={revision:4,kind:'durak-defend',target:0,executeAt:1400};p.update({...c,audible:true});
  assert.ok(document.querySelector('.durak-card').classList.contains('bot-source'));assert.equal(document.querySelector('.durak-card').textContent,'');
  c.room.botPreview={revision:4,kind:'sea-fire',cell:44,executeAt:1500};p.update(c);assert.ok(document.querySelector('[data-sea-cell]').classList.contains('bot-target'));
  document.hidden=true;document.dispatchEvent(new window.Event('visibilitychange'));assert.equal(document.querySelectorAll('.bot-source,.bot-target').length,0);
  const count=sounds.length;p.update({...c,audible:true});assert.equal(sounds.length,count);
  document.hidden=false;c.game.winner='white';p.update(c);assert.equal(document.querySelectorAll('.bot-target').length,0);
  c.game.winner=null;p.update({...c,now:5000});assert.equal(document.querySelectorAll('.bot-target').length,0);
});

test('bot action announcements have English and Ukrainian translations',()=>{
  for(const kind of ['pool-shot','shot','pool-place','move','roll','sea-fire','fleet-ready','domino-play','domino-draw','domino-pass','domino-ready','durak-attack','durak-defend','durak-transfer','durak-take','durak-finish']){
    const label=botActionText({kind});assert.notEqual(t(label,'en'),label,kind);assert.notEqual(t(label,'uk'),label,kind);
  }
});
