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
