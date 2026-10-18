import { test } from 'node:test';
import assert from 'node:assert/strict';
import { newGame, applyMove } from '../public/game.js';
import { transitionSounds } from '../public/sounds.js';
test('confirmed moves and captures use different sounds', () => {
  const game=newGame(), moved=applyMove(game,42,35);
  assert.deepEqual(transitionSounds(game,moved),['move']);
  const capture=newGame(); capture.board.fill(0); capture.board[42]=1; capture.board[35]=-1; capture.board[7]=-1;
  assert.deepEqual(transitionSounds(capture,applyMove(capture,42,28)),['capture']);
});
test('promotion, results and rematches have their own sounds', () => {
  const game=newGame(); game.board.fill(0); game.board[17]=1; game.board[10]=-1;
  const won=applyMove(game,17,3);
  assert.deepEqual(transitionSounds(game,won,'white'),['capture','promotion','victory']);
  assert.deepEqual(transitionSounds(game,won,'black'),['capture','promotion','defeat']);
  const draw={...game,winner:'draw',reason:'agreement',revision:1};
  assert.deepEqual(transitionSounds(game,draw),['draw']);
  const rematch=newGame(); rematch.revision=2;
  assert.deepEqual(transitionSounds(draw,rematch),['start']);
});
test('repeated snapshots and restored history do not replay sounds', () => {
  const game=newGame(), next=applyMove(game,42,35);
  assert.deepEqual(transitionSounds(next,next),[]);
  next.revision=5; assert.deepEqual(transitionSounds(game,next),[]);
});


test('action sounds share preferences, use distinct cues and stop when the page is hidden',async()=>{
  const {parseHTML}=await import('linkedom');
  const {mountAccountShell}=await import('../public/account-shell.js');
  const {createSounds,actionSound,ACTION_NOTES}=await import('../public/sounds.js');
  const {document,window}=parseHTML('<html><body><header class="site-header"></header></body></html>');mountAccountShell(document);
  const voices=[],frequencies=[];let contexts=0;
  const param=()=>({value:0,setValueAtTime(value){frequencies.push(value);},exponentialRampToValueAtTime(){},linearRampToValueAtTime(){},setTargetAtTime(){}});
  const node=()=>({connect(){},disconnect(){},gain:param(),frequency:param(),Q:{value:0}});
  class Audio {
    constructor(){contexts++;this.state='running';this.currentTime=10;this.sampleRate=100;this.destination={};}
    createGain(){return node();}createBiquadFilter(){return node();}
    createBuffer(){return {getChannelData:()=>new Float32Array(14)};}
    createBufferSource(){return this.createOscillator();}
    createOscillator(){const voice={...node(),start(){},stop(){this.stops=(this.stops||0)+1;},stops:0};voices.push(voice);return voice;}
  }
  window.AudioContext=Audio;
  Object.assign(globalThis,{document,window,CustomEvent:window.CustomEvent,localStorage:{getItem:()=>null,setItem(){}}});
  const $=id=>document.getElementById(id);Object.defineProperty($('sound-pack'),'value',{writable:true,value:'wood'});
  const sounds=createSounds();actionSound('case-open');sounds.play('card-deal',.5);assert.equal(contexts,0);
  document.dispatchEvent(new window.Event('pointerdown'));assert.equal(contexts,1);
  for(const kind of Object.keys(ACTION_NOTES))actionSound(kind);
  assert.ok(voices.length > Object.keys(ACTION_NOTES).length);
  for(const kind of ['rocket','comet','lightning']){const before=voices.length;actionSound(kind);assert.ok(voices.length>before,kind);}
  assert.notDeepEqual(ACTION_NOTES['case-common'],ACTION_NOTES['case-legendary']);
  const beforeCards=voices.length;
  const cards=newGame('durak-simple');
  const next={...cards,revision:1,lastAction:{type:'durak-attack',revision:1}};
  sounds.transition(cards,next,null,false,true);
  assert.equal(voices.length,beforeCards,'card motion owns its audio; generic transitions must not double it');
  const stop=sounds.play('card-deal',.6),scheduled=voices.slice(beforeCards);
  assert.equal(scheduled.length,ACTION_NOTES['card-deal'].length);
  stop();assert.ok(scheduled.every(voice=>voice.stops===2),'cancel also stops delayed card sounds');
  let count=voices.length;actionSound('select');actionSound('select');assert.equal(voices.length,count);
  document.hidden=true;document.dispatchEvent(new window.Event('visibilitychange'));assert.ok(voices.every(voice=>voice.stops>=1));
  actionSound('case-epic');assert.equal(voices.length,count);
  document.hidden=false;$('sound-volume').value='0';$('sound-volume').oninput();actionSound('case-rare');assert.equal(voices.length,count);
  $('sound-volume').value='50';$('sound-volume').oninput();actionSound('equip');assert.equal(voices.length,count+2);
  $('sound-enabled').checked=false;await $('sound-enabled').onchange();count=voices.length;actionSound('case-legendary');assert.equal(voices.length,count);
  assert.equal(contexts,1);
});
