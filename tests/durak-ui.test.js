import {test} from 'node:test';
import assert from 'node:assert/strict';
import {parseHTML} from 'linkedom';
import {createDurakBoard} from '../public/durak-board.js';
import {newDurak,actDurak,durakActions,durakView} from '../public/durak.js';
import {cardArt,CARD_SKINS} from '../public/card-art.js';
import {CATALOG} from '../public/shop-catalog.js';
import {caseContents,CASES} from '../public/cases.js';
import {t} from '../public/i18n.js';

test('local hands stay private across turns and hiding, selection submits only a legal action',()=>{
  const {document,window}=parseHTML('<html><body><div id="cards"></div></body></html>');Object.assign(globalThis,{document,window,matchMedia:()=>({matches:false,addEventListener(){}})});
  const root=document.getElementById('cards'),commands=[],sounds=[],board=createDurakBoard(root,a=>commands.push(a),s=>sounds.push(s));
  let game=newDurak('durak-transfer'),context={mode:'local',enabled:true};board.render(game,context);
  assert.equal(root.querySelectorAll('[data-card]').length,0);root.querySelector('[data-control="reveal"]').click();assert.equal(root.querySelectorAll('[data-card]').length,6);
  const card=game.hands[game.turn][0];root.querySelector(`[data-card="${card}"]`).click();root.querySelector('[data-action="durak-attack"]').click();
  assert.deepEqual(commands,[{type:'durak-attack',card}]);assert.deepEqual(sounds,['card-reveal','select']);
  game=actDurak(game,game.turn,commands[0]);board.render(game,context);assert.equal(root.querySelectorAll('[data-card]').length,0);
  root.querySelector('[data-control="reveal"]').click();document.hidden=true;document.dispatchEvent(new window.Event('visibilitychange'));assert.equal(root.querySelectorAll('[data-card]').length,0);
  document.hidden=false;const fresh=newDurak('durak-transfer');board.render(fresh,context);root.querySelector('[data-control="reveal"]').click();
  const redeal=newDurak('durak-transfer');board.render(redeal,context);assert.equal(root.querySelectorAll('[data-card]').length,0,'a new deal with the same revision must hide the old hand');
  root.querySelector('[data-control="reveal"]').click();assert.deepEqual([...root.querySelectorAll('[data-card]')].map(el=>Number(el.dataset.card)),redeal.hands[redeal.turn]);
});
test('card animations run once per live revision and cancel on hidden, static mode, or navigation',()=>{
  const {document,window}=parseHTML('<html><body><div id="cards"></div></body></html>');let reduced=false;Object.assign(globalThis,{document,window,matchMedia:()=>({get matches(){return reduced;},addEventListener(){}})});
  const running=new Set(),all=[];window.HTMLElement.prototype.animate=function(frames,options){const a={element:this,frames,options,cancel(){running.delete(a);a.oncancel?.();}};running.add(a);all.push(a);return a;};
  const root=document.getElementById('cards'),board=createDurakBoard(root,()=>{}),context={mode:'online',role:'white',enabled:true,roomCode:'one'};
  let game=newDurak('durak-simple');board.render(durakView(game,'white'),context);assert.equal(all.length,0);
  game=actDurak(game,game.turn,durakActions(game)[0]);board.render(durakView(game,'white'),context);assert.equal(all.length,1);assert.equal(running.size,1);
  board.render(durakView(game,'white'),context);assert.equal(all.length,1);assert.equal(running.size,1);
  document.hidden=true;document.dispatchEvent(new window.Event('visibilitychange'));assert.equal(running.size,0);document.hidden=false;
  const action=durakActions(game).find(a=>a.type==='durak-defend')||{type:'durak-take'};game=actDurak(game,game.turn,action);
  reduced=true;board.render(durakView(game,'white'),context);assert.equal(all.length,1);
  reduced=false;document.documentElement.dataset.lowPerformance='true';if(!game.winner){game=actDurak(game,game.turn,durakActions(game)[0]);board.render(durakView(game,'white'),context);}assert.equal(running.size,0);
  board.hide();assert.equal(root.querySelector('.durak-clear'),null);
});
test('three distinct premium decks have prices 500–600, drop from cases, translate, and render safe fixed SVG art',()=>{
  const skins=CATALOG.filter(i=>i.type==='card'&&i.price);assert.deepEqual(skins.map(i=>i.price),[500,550,600]);
  for(const item of skins){assert.ok(CASES.every(box=>caseContents(box).some(row=>row.item.id===item.id)));assert.notEqual(t(item.name,'en'),item.name);assert.notEqual(t(item.description,'uk'),item.description);}
  assert.equal(new Set(CARD_SKINS.map(skin=>cardArt(null,skin))).size,4);
  for(const skin of CARD_SKINS)for(const id of [null,0,17,26,35]){const {document}=parseHTML(cardArt(id,skin));assert.equal(document.querySelectorAll('svg').length,1);assert.equal(document.querySelectorAll('script,foreignObject,image').length,0);assert.equal(document.querySelector('.playing-card-art').getAttribute('viewBox'),'0 0 100 140');}
});

function dragFixture(game = newDurak('durak-transfer',Array.from({length:36},(_,i)=>i))) {
  const {document,window}=parseHTML('<html><body><div id="cards"></div></body></html>');
  Object.assign(globalThis,{document,window,matchMedia:()=>({matches:false,addEventListener(){}})});
  window.HTMLElement.prototype.getBoundingClientRect=()=>({left:0,top:0,width:72,height:100.8});
  const root=document.getElementById('cards'),commands=[],sounds=[];
  const board=createDurakBoard(root,a=>commands.push(a),s=>sounds.push(s));
  const context={mode:'online',role:game.turn,enabled:true,roomCode:'drag-test'};board.render(durakView(game,context.role),context);
  let hit=null;document.elementFromPoint=()=>hit;
  const emit=(target,type,extra={})=>{const e=new window.Event(type,{bubbles:true,cancelable:true});Object.assign(e,{pointerId:1,isPrimary:true,button:0,clientX:36,clientY:50,...extra});target.dispatchEvent(e);};
  const start=(card,extra={})=>{emit(root.querySelector(`[data-card="${card}"]`),'pointerdown',extra);emit(window,'pointermove',{clientX:70,clientY:20,...extra});};
  const drop=(selector)=>{hit=selector?root.querySelector(selector):null;emit(window,'pointermove',{clientX:100,clientY:20});emit(window,'pointerup',{clientX:100,clientY:20});};
  return {document,window,root,board,context,commands,sounds,emit,start,drop,game};
}
test('dragging attacks once, marks legal destinations, suppresses the trailing click and keeps short taps working',()=>{
  const f=dragFixture();f.start(0);assert.ok(f.document.querySelector('.durak-drag-ghost'));
  assert.ok(f.root.querySelector('.durak-drag-source'));assert.deepEqual(f.sounds,['select']);
  f.drop('.durak-drop-play');assert.deepEqual(f.commands,[{type:'durak-attack',card:0}]);
  assert.equal(f.document.querySelector('.durak-drag-ghost'),null);
  f.emit(f.root.querySelector('[data-action="durak-attack"]'),'click',{detail:1});assert.equal(f.commands.length,1);
  const card=f.root.querySelector('[data-card="1"]');f.emit(card,'pointerdown');f.emit(f.window,'pointerup');f.emit(card,'click',{detail:1});
  assert.equal(f.root.querySelector('[data-card="1"]').getAttribute('aria-pressed'),'true');
  f.root.querySelector('[data-action="durak-attack"]').click();assert.deepEqual(f.commands.at(-1),{type:'durak-attack',card:1});
});
test('dragging defense targets a specific attack; transfer uses open space; wrong targets do not submit',()=>{
  const initial=newDurak('durak-transfer',Array.from({length:36},(_,i)=>i)),game=actDurak(initial,initial.turn,{type:'durak-attack',card:0});
  const f=dragFixture(game);f.start(6);f.drop('[data-target="0"]');assert.deepEqual(f.commands,[{type:'durak-defend',card:6,target:0}]);
  f.start(9,{pointerType:'touch'});f.drop('[data-target="0"]');assert.equal(f.commands.length,1);assert.equal(f.sounds.at(-1),'error');
  f.start(9,{pointerType:'pen'});f.drop('.durak-drop-play');assert.deepEqual(f.commands.at(-1),{type:'durak-transfer',card:9});
  f.start(6);f.drop('.durak-stock');assert.equal(f.commands.length,2);assert.equal(f.sounds.at(-1),'error');
  for(const source of ['Перетащите сюда для атаки','Перетащите сюда для перевода','Перетащите карту на стол или выберите её кликом.'])for(const lang of ['en','uk'])assert.notEqual(t(source,lang),source);
});
test('drag cleanup prevents actions after cancellation, disconnect, a new revision or hiding a private hand',()=>{
  const f=dragFixture();
  for(const cancel of [()=>f.emit(f.window,'pointercancel'),()=>f.emit(f.window,'blur'),()=>f.emit(f.document,'keydown',{key:'Escape'}),()=>f.emit(f.root,'lostpointercapture')]){
    f.start(0);cancel();f.drop('.durak-table');assert.equal(f.document.querySelector('.durak-drag-ghost'),null);assert.equal(f.commands.length,0);
  }
  f.start(0);f.board.render(durakView(f.game,f.context.role),{...f.context,enabled:false});f.drop('.durak-table');assert.equal(f.commands.length,0);
  f.board.render(durakView(f.game,f.context.role),f.context);f.start(0);
  f.game=actDurak(f.game,f.game.turn,{type:'durak-attack',card:1});f.board.render(durakView(f.game,f.context.role),f.context);f.drop('.durak-table');assert.equal(f.commands.length,0);
  f.board.render(f.game,{mode:'local',enabled:true});f.root.querySelector('[data-control="reveal"]').click();f.start(6);
  f.document.hidden=true;f.document.dispatchEvent(new f.window.Event('visibilitychange'));f.drop('.durak-table');
  assert.equal(f.commands.length,0);assert.equal(f.document.querySelector('.durak-drag-ghost'),null);assert.equal(f.root.querySelector('[data-card]'),null);
  f.document.hidden=false;f.document.dispatchEvent(new f.window.Event('visibilitychange'));assert.equal(f.root.querySelector('[data-card]'),null,'local hand stays private after returning');
  f.board.render(durakView(f.game,f.game.turn),{...f.context,role:f.game.turn});
  f.document.hidden=true;f.document.dispatchEvent(new f.window.Event('visibilitychange'));
  f.document.hidden=false;f.document.dispatchEvent(new f.window.Event('visibilitychange'));
  assert.equal(f.root.querySelector('[data-card="6"]').disabled,false,'online controls recover after returning');
});
