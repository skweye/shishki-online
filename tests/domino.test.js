import {test} from 'node:test';
import assert from 'node:assert/strict';
import {parseHTML} from 'linkedom';
import {readFileSync} from 'node:fs';
import {DOMINOES,newDomino,dominoMoves,actDomino,nextDominoRound,readyDominoRound,dominoView,dominoPips} from '../public/domino.js';
import {dominoLayout,dominoPlacements,dominoBounds,dominoDropTarget} from '../public/domino-layout.js';
import {createDominoBoard,dominoTile} from '../public/domino-board.js';
import {newGame,legalMoves} from '../public/game.js';
import {timeControl} from '../public/time-control.js';
import {t} from '../public/i18n.js';

const deck=DOMINOES.map((_,id)=>id),id=(a,b)=>DOMINOES.findIndex(pair=>pair[0]===Math.min(a,b)&&pair[1]===Math.max(a,b));
function position(white,black,stock=[]){return {...newDomino(deck),turn:'white',hands:{white:white.map(p=>id(...p)),black:black.map(p=>id(...p))},stock:stock.map(p=>id(...p)),chain:[{id:id(2,3),a:2,b:3,side:'black'}]};}
const play=(state,tile,end='right')=>actDomino(state,{type:'domino-play',id:id(...tile),end});

test('all hand faces keep complete circular pips within their half of a shared scalable viewBox',()=>{
  for(const [a,b] of DOMINOES){
    const {document}=parseHTML(`<div>${dominoTile(a,b)}</div>`),face=document.querySelector('svg');
    assert.equal(face.getAttribute('viewBox'),'0 0 30 60');
    assert.equal(face.getAttribute('preserveAspectRatio'),'xMidYMid meet');
    const dots=[...face.querySelectorAll('circle')];assert.equal(dots.length,a+b);
    assert.equal(dots.filter(dot=>Number(dot.getAttribute('cy'))<30).length,a);
    for(const dot of dots){
      const x=Number(dot.getAttribute('cx')),y=Number(dot.getAttribute('cy')),r=Number(dot.getAttribute('r')),top=y<30?0:30;
      assert.ok(x-r>0&&x+r<30&&y-r>top&&y+r<top+30);
    }
    assert.equal(document.querySelector('.domino-half'),null);
  }
});

test('double-six deal, highest-double opening, no clocks and no board moves',()=>{
  const s=newDomino(deck);assert.equal(DOMINOES.length,28);assert.equal(new Set(DOMINOES.map(p=>p.join(':'))).size,28);
  assert.equal(s.hands.white.length,7);assert.equal(s.hands.black.length,7);assert.equal(s.stock.length,14);
  assert.equal(s.opening,id(2,2));assert.equal(s.turn,'black');assert.deepEqual(dominoMoves(s),[{id:id(2,2),end:'right'}]);
  assert.throws(()=>actDomino(s,{type:'domino-play',id:id(1,2),end:'right'}));
  const nonDoubles=deck.filter(i=>DOMINOES[i][0]!==DOMINOES[i][1]),arr=[...nonDoubles.slice(-14),...deck.filter(i=>!nonDoubles.slice(-14).includes(i))];
  assert.equal(newDomino(arr).opening,id(5,6));assert.throws(()=>newDomino(Array(28).fill(0)));
  assert.equal(newGame('domino').variant,'domino');assert.equal(timeControl('domino'),null);assert.deepEqual(legalMoves(s),[]);
});

test('tiles orient correctly on both ends; illegal or foreign tiles never mutate the hand',()=>{
  const s=position([[1,2],[3,5],[6,6]],[[0,0]]),copy=structuredClone(s);
  const left=play(s,[1,2],'left');assert.equal(left.chain[0].a,1);assert.equal(left.chain[0].b,2);assert.equal(left.turn,'black');
  const right=play(s,[3,5]);assert.equal(right.chain.at(-1).a,3);assert.equal(right.chain.at(-1).b,5);
  const reversed=play(position([[1,3],[6,6]],[[0,0]]),[1,3]);assert.equal(reversed.chain.at(-1).a,3);assert.equal(reversed.chain.at(-1).b,1);
  for(const action of [{type:'domino-play',id:id(6,6),end:'right'},{type:'domino-play',id:id(0,0),end:'left'},{type:'domino-play',id:id(1,2),end:'middle'},{type:'domino-play',id:'1',end:'right'}])assert.throws(()=>actDomino(s,action));
  assert.deepEqual(s,copy);
});

test('draw until a move appears; pass only with empty stock; drawing does not reveal the tile in history',()=>{
  const s=position([[6,6]],[[2,4]],[[1,3],[5,5]]);
  assert.throws(()=>actDomino(s,{type:'domino-pass'}));
  const a=actDomino(s,{type:'domino-draw'});assert.equal(a.turn,'white');assert.equal(a.hands.white.at(-1),id(5,5));assert.equal(a.history.at(-1).notation,'＋1');
  const b=actDomino(a,{type:'domino-draw'});assert.equal(b.turn,'white');assert.equal(b.stock.length,0);assert.equal(dominoMoves(b).length,1);
  assert.throws(()=>actDomino(b,{type:'domino-draw'}));assert.throws(()=>actDomino(b,{type:'domino-pass'}));
  const passed=actDomino(position([[6,6]],[[2,4]]),{type:'domino-pass'});assert.equal(passed.turn,'black');assert.equal(passed.roundResult,null);
  assert.throws(()=>actDomino(position([[2,4]],[[6,6]],[[5,5]]),{type:'domino-draw'}));
});

test('emptying the hand scores opponent pips; 100 ends the match and rejects further rounds',()=>{
  const s=position([[3,5]],[[6,6],[4,5]]);s.score.white=80;
  const next=play(s,[3,5]);assert.equal(next.roundResult.points,21);assert.equal(next.score.white,101);assert.equal(next.winner,'white');assert.equal(next.reason,'domino-score');
  assert.throws(()=>nextDominoRound(next));assert.throws(()=>readyDominoRound(next,'black'));assert.throws(()=>actDomino(next,{type:'domino-pass'}));
});

test('blocked rounds award the difference, and equal totals award no points',()=>{
  const next=actDomino(position([[1,1]],[[6,6]]),{type:'domino-pass'});
  assert.equal(next.roundResult.blocked,true);assert.equal(next.roundResult.winner,'white');assert.equal(next.score.white,10);assert.equal(next.winner,null);
  const tied=actDomino(position([[1,1]],[[0,2]]),{type:'domino-pass'});
  // Use blocked ends which neither hand matches for an equal-pip tie.
  const tieState=position([[1,1]],[[0,2]]);tieState.chain=[{id:id(4,5),a:4,b:5,side:'black'}];
  const tie=actDomino(tieState,{type:'domino-pass'});assert.equal(tie.roundResult.winner,'draw');assert.equal(tie.roundResult.points,0);assert.deepEqual(tie.score,{white:0,black:0});assert.equal(tied.roundResult,null);
});

test('next round needs two online confirmations, retains points and history, and resets hands',()=>{
  const ended=play(position([[3,5]],[[6,6]]),[3,5]);
  assert.throws(()=>nextDominoRound(newDomino(deck)));assert.throws(()=>readyDominoRound(ended,'spectator'));
  const a=readyDominoRound(ended,'white');assert.equal(a.round,1);assert.equal(a.revision,ended.revision+1);assert.throws(()=>readyDominoRound(a,'white'));
  const b=readyDominoRound(a,'black');assert.equal(b.round,2);assert.equal(b.roundResult,null);assert.equal(b.score.white,12);assert.deepEqual(b.history,ended.history);assert.deepEqual(b.readyNext,[]);
  assert.equal(b.hands.white.length,7);assert.equal(b.stock.length,14);assert.deepEqual(newGame('domino').score,{white:0,black:0});
});

test('projections conceal opponents and stock, including anonymous views; reveal hands only after a round',()=>{
  const s=newDomino(deck),original=structuredClone(s);
  for(const role of ['white','black',null]){const v=dominoView(s,role);assert.equal('stock' in v,false);assert.equal(v.stockCount,14);for(const side of ['white','black'])assert.deepEqual(v.hands[side],side===role?s.hands[side]:[]);assert.deepEqual(v.handCounts,{white:7,black:7});}
  const end=play(position([[3,5]],[[6,6]]),[3,5]);assert.deepEqual(dominoView(end,'white').hands,end.hands);assert.equal('stock' in dominoView(end,'black'),false);assert.deepEqual(s,original);
});

test('complete deterministic matches preserve all 28 tiles, matching chain ends and scores across rounds',()=>{
  for(let seed=1;seed<=8;seed++){
    let rng=seed;const shuffled=()=>{const result=[...deck];for(let i=27;i>0;i--){rng=(Math.imul(rng,1664525)+1013904223)>>>0;const j=rng%(i+1);[result[i],result[j]]=[result[j],result[i]];}return result;};
    let s=newDomino(shuffled()),actions=0;
    while(!s.winner&&actions++<3000){
      if(s.roundResult)s=nextDominoRound(s,shuffled());else{const move=dominoMoves(s)[0];s=actDomino(s,move?{type:'domino-play',...move}:{type:s.stock.length?'domino-draw':'domino-pass'});}
      const ids=[...s.hands.white,...s.hands.black,...s.stock,...s.chain.map(tile=>tile.id)];assert.equal(ids.length,28);assert.equal(new Set(ids).size,28);
      for(let i=1;i<s.chain.length;i++)assert.equal(s.chain[i-1].b,s.chain[i].a);
      assert.ok(Number.isFinite(s.score.white)&&Number.isFinite(s.score.black));assert.ok(dominoPips(s.hands.white)>=0);
    }
    assert.ok(s.winner);assert.ok(s.score[s.winner]>=100);
  }
});

test('local handoff hides hands and keyboard placement uses on-table targets',()=>{
  const {document}=parseHTML('<html><body><div id="root"></div></body></html>'),old=globalThis.document;globalThis.document=document;
  try{
    const root=document.querySelector('#root'),actions=[],board=createDominoBoard(root,a=>actions.push(a)),context={mode:'local',enabled:true};let s=newDomino(deck);
    board.render(s,context);assert.equal(root.querySelectorAll('[data-tile]').length,0);root.querySelector('#domino-reveal').click();assert.equal(root.querySelectorAll('[data-tile]').length,7);
    root.querySelector(`[data-tile="${s.opening}"]`).click();assert.equal(root.querySelector('[data-end]'),null);const target=root.querySelector('[data-drop]');assert.ok(target);target.dispatchEvent(new document.defaultView.Event('click',{bubbles:true}));assert.deepEqual(actions,[{type:'domino-play',id:s.opening,end:'right',direction:'right'}]);
    s=actDomino(s,actions[0]);board.render(s,context);assert.equal(root.querySelectorAll('[data-tile]').length,0);assert.ok(root.querySelector('#domino-reveal'));
    board.render(dominoView(s,s.turn),{mode:'online',role:s.turn,enabled:true});assert.equal(root.querySelectorAll('[data-tile]').length,s.hands[s.turn].length);assert.equal(root.querySelector('#domino-reveal'),null);
  }finally{if(old===undefined)delete globalThis.document;else globalThis.document=old;}
});

test('domino dynamic controls, engine messages and match reason have English and Ukrainian translations',()=>{
  for(const file of ['domino-board.js','domino.js','domino-layout.js']){const source=readFileSync(new URL('../public/'+file,import.meta.url),'utf8');for(const [,value] of source.matchAll(/'([^'\n]*[А-Яа-яЁё][^'\n]*)'/g))for(const language of ['en','uk'])assert.ok(t(value,language)!==value||language==='uk'&&['Раунд','Базар'].includes(value),'Missing '+language+': '+value);}
});

test('drop previews have no extra pips and disappear before the move is acknowledged',()=>{
  const {document,Event}=parseHTML('<html><body><div id="root"></div></body></html>'),old=globalThis.document;globalThis.document=document;
  try{
    const root=document.querySelector('#root'),actions=[],board=createDominoBoard(root,a=>actions.push(a));
    let s=newDomino(deck);
    for(let turn=0;turn<8&&!s.roundResult;turn++){
      const move=dominoMoves(s)[0];
      if(!move){s=actDomino(s,{type:s.stock.length?'domino-draw':'domino-pass'});continue;}
      board.render(dominoView(s,s.turn),{mode:'online',role:s.turn,enabled:true});
      const expectedPips=s.chain.reduce((sum,tile)=>sum+tile.a+tile.b,0);
      assert.equal(root.querySelectorAll('.domino-surface circle').length,expectedPips);
      root.querySelector(`[data-tile="${move.id}"]`).click();
      assert.ok(root.querySelectorAll('[data-drop]').length);
      assert.equal(root.querySelectorAll('[data-drop] circle').length,0);
      assert.equal(root.querySelectorAll('.domino-surface circle').length,expectedPips);
      root.querySelector('[data-drop]').dispatchEvent(new Event('click',{bubbles:true}));
      assert.equal(root.querySelectorAll('[data-drop]').length,0);
      assert.equal(root.querySelectorAll('.domino-surface circle').length,expectedPips);
      s=actDomino(s,actions.at(-1));
    }
    assert.ok(actions.length>1);
  }finally{if(old===undefined)delete globalThis.document;else globalThis.document=old;}
});

test('horizontal and vertical bends persist, match pips at either end and reject forged directions',()=>{
  let s=position([[1,2],[3,5],[6,6]],[[1,4],[4,5],[0,0]]);
  s=actDomino(s,{type:'domino-play',id:id(1,2),end:'left',direction:'up'});
  assert.deepEqual(s.chain[0].placement,{x:0,y:-2,dx:0,dy:1});
  s=actDomino(s,{type:'domino-play',id:id(1,4),end:'left',direction:'left'});
  assert.equal(s.chain[0].a,4);assert.equal(s.chain[0].b,1);assert.deepEqual(s.chain[0].placement,{x:-2,y:-2,dx:1,dy:0});
  const before=structuredClone(s);
  for(const direction of ['diagonal',null,1,{},'left'])assert.throws(()=>actDomino(s,{type:'domino-play',id:id(3,5),end:'right',direction}));
  s=actDomino(s,{type:'domino-play',id:id(3,5),end:'right',direction:'down',placement:{x:999,y:999}});
  assert.deepEqual(s.chain.at(-1).placement,{x:1,y:1,dx:0,dy:1});
  assert.deepEqual(dominoLayout(JSON.parse(JSON.stringify(s)).chain),s.chain);assert.equal(before.chain.length,3);
});

test('saved chains migrate and long bent chains never overlap or eliminate legal endpoints',()=>{
  let chain=[];
  for(let i=0;i<28;i++){
    const state={...newDomino(deck),hands:{white:[id(0,0),id(0,1)],black:[id(0,2)]},turn:'white',chain,opening:id(0,0)};
    const end=i%3?'right':'left',options=dominoPlacements(chain,end),choice=options[(i*7)%options.length];
    chain=actDomino(state,{type:'domino-play',id:id(0,0),end:chain.length?end:'right',direction:choice.direction}).chain;
    const cells=chain.flatMap(({placement:p})=>[[p.x,p.y],[p.x+p.dx,p.y+p.dy]]);
    assert.equal(new Set(cells.map(c=>c.join(':'))).size,2*chain.length);
    for(let j=1;j<chain.length;j++){const a=cells[j*2-1],b=cells[j*2];assert.equal(Math.abs(a[0]-b[0])+Math.abs(a[1]-b[1]),1);}
    assert.ok(dominoPlacements(chain,'left').length);assert.ok(dominoPlacements(chain,'right').length);
  }
  const legacy=chain.map(({placement,...tile})=>tile),copy=structuredClone(legacy),layout=dominoLayout(legacy);
  assert.equal(layout.length,28);assert.deepEqual(legacy,copy);assert.ok(layout.some(tile=>tile.placement.dy));
  const overlaps=layout.map(tile=>({...tile,placement:{x:0,y:0,dx:1,dy:0}}));assert.deepEqual(dominoLayout(overlaps),layout);
});

test('drop hit testing respects letterboxing, viewport edges and vertical/horizontal target selection',()=>{
  const choices=dominoPlacements([],'right'),bounds=dominoBounds([],choices),rect={left:20,top:30,width:450,height:350};
  const screen=p=>{const scale=Math.min(rect.width/bounds.width,rect.height/bounds.height);return [rect.left+(rect.width-bounds.width*scale)/2+(p.x+.5+p.dx/2-bounds.x)*scale,rect.top+(rect.height-bounds.height*scale)/2+(p.y+.5+p.dy/2-bounds.y)*scale];};
  for(const choice of choices)assert.equal(dominoDropTarget(choices,bounds,rect,...screen(choice.placement)),choice);
  assert.equal(dominoDropTarget(choices,bounds,rect,0,0),null);assert.equal(dominoDropTarget(choices,bounds,rect,21,31),null);
});

test('mouse and touch drag place once; invalid drops, cancellation, stale snapshots and other pointers do not move',()=>{
  const {document,Event}=parseHTML('<html><body><div id="root"></div></body></html>'),old=globalThis.document;globalThis.document=document;
  try{
    const root=document.querySelector('#root'),actions=[],board=createDominoBoard(root,a=>actions.push(a)),s=newDomino(deck),context={mode:'online',role:s.turn,enabled:true};
    let captured=null;root.setPointerCapture=id=>{captured=id;};root.hasPointerCapture=id=>captured===id;root.releasePointerCapture=()=>{captured=null;};
    const emit=(target,type,props={})=>{const event=new Event(type,{bubbles:true,cancelable:true});Object.assign(event,{pointerId:1,button:0,isPrimary:true,pointerType:'mouse',clientX:120,clientY:500},props);target.dispatchEvent(event);};
    const start=()=>{board.render(s,context);emit(root.querySelector(`[data-tile="${s.opening}"]`),'pointerdown');const svg=root.querySelector('svg');svg.getBoundingClientRect=()=>({left:0,top:0,width:450,height:350});};
    // Opening vertical target centre (0.5, 1) in viewBox -4,-3,9,7.
    start();emit(root,'pointermove',{clientX:225,clientY:200});assert.ok(document.querySelector('.domino-drag-ghost'));assert.equal(root.querySelectorAll('.drop-hover').length,1);
    emit(root,'pointerup',{clientX:225,clientY:200});assert.equal(actions.length,1);assert.equal(actions[0].direction,'down');assert.equal(document.querySelector('.domino-drag-ghost'),null);assert.equal(captured,null);
    emit(root,'pointerup',{clientX:225,clientY:200});assert.equal(actions.length,1);
    start();emit(root,'pointerup',{clientX:-20,clientY:200});assert.equal(actions.length,1);
    start();emit(root,'pointermove',{pointerType:'touch',clientX:250,clientY:175});emit(root,'pointercancel');emit(root,'pointerup',{clientX:250,clientY:175});assert.equal(actions.length,1);assert.equal(document.querySelector('.domino-drag-ghost'),null);
    start();emit(root,'pointerup',{pointerId:2,clientX:250,clientY:175});assert.equal(actions.length,1);emit(root,'pointermove',{clientX:250,clientY:175});board.render({...s,revision:1},context);emit(root,'pointerup',{clientX:250,clientY:175});assert.equal(actions.length,1);
    start();emit(root,'pointermove',{pointerType:'touch',clientX:250,clientY:175});emit(root,'pointerup',{pointerType:'touch',clientX:250,clientY:175});assert.equal(actions.length,2);assert.equal(actions[1].direction,'right');
    start();board.hide();emit(root,'pointerup',{clientX:250,clientY:175});assert.equal(actions.length,2);
  }finally{if(old===undefined)delete globalThis.document;else globalThis.document=old;}
});
