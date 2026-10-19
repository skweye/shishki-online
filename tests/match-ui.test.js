import {test} from 'node:test';
import assert from 'node:assert/strict';
import {parseHTML} from 'linkedom';
import {readFileSync} from 'node:fs';
import {createMatchUI,matchActions} from '../public/match-ui.js';

const base=()=>({mode:'local',game:{variant:'russian',revision:0,winner:null},playable:true,animating:false,room:null});
function setup(){
  const {document,window}=parseHTML(readFileSync(new URL('../public/index.html',import.meta.url),'utf8'));
  const $=id=>document.getElementById(id);let focused;
  Object.defineProperty(document,'activeElement',{get:()=>focused});
  window.HTMLElement.prototype.focus=function(){focused=this;};
  globalThis.document=document;globalThis.window=window;
  $('result-dialog').open=false;
  return {document,window,$,ui:createMatchUI(document)};
}
test('match action matrix separates waiting, playing, animation, rounds and finished games',()=>{
  const local=base();assert.equal(matchActions(local).restart,false);
  local.game.revision=3;assert.equal(matchActions(local).restart,true);
  for(const variant of ['russian','russian12','chess','narde','pool8','domino','battleship','chapaev']){
    const state={...base(),mode:'online',game:{...base().game,variant},room:{ready:false}};
    assert.equal(matchActions(state).resign,false);assert.equal(matchActions(state).draw,false);assert.equal(matchActions(state).waiting,true);
    state.room.ready=true;assert.equal(matchActions(state).resign,true);assert.equal(matchActions(state).restart,false);
    assert.equal(matchActions(state).flip,!['domino','battleship'].includes(variant));
    assert.equal(matchActions(state).shot,variant==='chapaev');state.playable=false;assert.equal(matchActions(state).shot,false);
    state.room.drawOffer='white';assert.equal(matchActions(state).draw,false);
    state.game.winner='white';assert.equal(matchActions(state).rematch,true);assert.equal(matchActions(state).resign,false);
    state.animating=true;assert.equal(matchActions(state).rematch,false);
  }
});
test('one creation entry, controls stay by the board, and menu preserves actions and keyboard access',()=>{
  const {document,window,$,ui}=setup();
  assert.equal($('create-button'),null);assert.equal($('join-button'),null);
  assert.equal(document.querySelectorAll('#home-hub button[data-play-mode="online"]').length,1);
  assert.equal(document.querySelectorAll('#start-form button[type=submit]').length,1);assert.deepEqual([...document.querySelectorAll('#home-hub [data-play-mode]')].map(button=>button.dataset.playMode),['local','search','online']);
  for(const id of ['draw-button','resign-button','new-button','home-button','flip-button'])assert.ok($('match-menu').contains($(id)),id);
  assert.ok(document.querySelector('.play-area').contains($('status-title')));assert.ok(document.querySelector('.play-area').contains($('clock-panel')));
  $('game-screen').hidden=false;const state=base();state.game.revision=2;ui.update(state);
  assert.ok($('match-menu').contains($('rules-button')));
  $('match-menu-button').click();assert.equal($('match-menu').hidden,false);assert.equal(document.activeElement.id,'draw-button');
  const key=(target,value)=>{const e=new window.Event('keydown',{bubbles:true});e.key=value;target.dispatchEvent(e);};
  key($('draw-button'),'ArrowDown');assert.equal(document.activeElement.id,'resign-button');
  key($('resign-button'),'Escape');assert.equal($('match-menu').hidden,true);assert.equal(document.activeElement.id,'match-menu-button');
  $('match-menu-button').click();$('flip-button').click();assert.equal($('match-menu').hidden,true);
  $('game-screen').hidden=true;ui.update(state);assert.ok($('home-rules-slot').contains($('rules-button')));
});
test('invitation collapses after joining, tabs retain context and unread chat includes the first message',()=>{
  const {$,ui}=setup();const state={...base(),mode:'online',room:{code:'ABC',ready:false,role:'white',chat:[]}};
  $('game-screen').hidden=false;ui.update(state);assert.equal($('room-controls').open,true);assert.equal($('copy-button').className,'primary-button');
  state.room.ready=true;ui.update(state);assert.equal($('room-controls').open,false);assert.equal($('copy-button').className,'secondary-button');
  $('room-controls').open=true;ui.update(state);assert.equal($('room-controls').open,true,'a snapshot must not reset user expansion');
  assert.equal($('chat-panel').hidden,true);
  state.room.chat=[{id:'one',side:'black'}];ui.chat(state.room.chat);assert.equal($('chat-unread').textContent,'1');assert.equal($('chat-unread').hidden,false);
  $('chat-tab').click();assert.equal($('chat-panel').hidden,false);assert.equal($('history-panel').hidden,true);assert.equal($('chat-unread').hidden,true);
  ui.update(state);assert.equal($('chat-panel').hidden,false);
  state.room.drawOffer='white';ui.update(state);assert.equal($('draw-button').hidden,true);assert.equal($('draw-offer-status').hidden,false);
  ui.update(base());assert.equal($('chat-tab').hidden,true);assert.equal($('history-panel').hidden,false);
});
test('rematch appears once the result dialog closes and clocks follow board orientation',()=>{
  const {$,ui,window}=setup(),state=base();$('game-screen').hidden=false;state.game.winner='white';
  $('result-dialog').open=true;ui.update(state);assert.equal($('round-actions').hidden,true);
  $('result-dialog').open=false;$('result-dialog').dispatchEvent(new window.Event('close'));assert.equal($('round-actions').hidden,false);
  assert.equal($('clock-black').parentElement.parentElement.firstElementChild,$('clock-black').parentElement);
  state.flipped=true;ui.update(state);assert.equal($('clock-white').parentElement.parentElement.firstElementChild,$('clock-white').parentElement);
});


test('pointer focus transition cannot dismiss the menu before a menu item receives its click',async()=>{
  const {document,window,$,ui}=setup();$('game-screen').hidden=false;
  const state=base();state.game.revision=2;ui.update(state);
  for(const id of ['resign-button','draw-button','flip-button','new-button','rules-button','home-button']){
    $('match-menu-button').click();let calls=0;const target=$(id);target.onclick=()=>calls++;
    target.dispatchEvent(new window.Event('pointerdown',{bubbles:true}));
    const previous=document.activeElement;
    // During native blur/focusout the active element may temporarily be body.
    document.body.focus();
    const blur=new window.Event('focusout',{bubbles:true});blur.relatedTarget=target;previous.dispatchEvent(blur);
    await Promise.resolve();
    assert.equal($('match-menu').hidden,false,id+' vanished between pointerdown and click');
    target.focus();target.dispatchEvent(new window.Event('focusin',{bubbles:true}));
    target.dispatchEvent(new window.Event('pointerup',{bubbles:true}));target.click();
    assert.equal(calls,1,id);assert.equal($('match-menu').hidden,true,id);
  }
  $('match-menu-button').click();document.body.focus();document.body.dispatchEvent(new window.Event('focusin',{bubbles:true}));
  assert.equal($('match-menu').hidden,true,'focus outside dismisses the menu');
});
