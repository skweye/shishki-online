import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {parseHTML} from 'linkedom';
import {newBattleship,randomFleet,validateFleet,shipCells,canPlaceShip,actBattleship,battleshipView} from '../public/battleship.js';
import {newGame,legalMoves,applyMove} from '../public/game.js';
import {createClock} from '../public/time-control.js';
import {createBattleshipBoard} from '../public/battleship-board.js';
import {shipArt,fleetPreview} from '../public/battleship-art.js';
import {CATALOG,validShipSkin} from '../public/shop-catalog.js';
import {translations} from '../public/locales.js';
const setup=()=>{let game=newBattleship();for(const side of ['white','black'])game=actBattleship(game,side,{type:'fleet-ready',fleet:randomFleet()});return game;};

test('fleets have twenty cells, valid straight ships and no touching; either side can deploy first',()=>{
  for(let i=0;i<60;i++){const fleet=randomFleet();assert.equal(fleet.flat().length,20);assert.deepEqual(validateFleet(fleet),fleet);}
  assert.deepEqual(shipCells(9,2),[]);assert.deepEqual(shipCells(90,2,true),[]);
  for(const ship of [[0,11],[0,2],[0,0],[9,10],[-1],[100],[.5]])assert.equal(canPlaceShip([],ship),false);
  assert.equal(canPlaceShip([[0,1]],[12]),false);
  const game=newGame('battleship'),copy=structuredClone(game);assert.equal(createClock('battleship'),null);assert.deepEqual(legalMoves(game),[]);assert.throws(()=>applyMove(game,0,1));
  const blackFirst=actBattleship(game,'black',{type:'fleet-ready',fleet:randomFleet()});assert.equal(blackFirst.ready.black,true);assert.equal(blackFirst.ready.white,false);
  assert.throws(()=>actBattleship(blackFirst,'black',{type:'fleet-ready',fleet:randomFleet()}));
  assert.equal(actBattleship(blackFirst,'white',{type:'fleet-ready',fleet:randomFleet()}).turn,'white');
  assert.throws(()=>actBattleship(game,'white',{type:'fleet-ready',fleet:randomFleet().slice(1)}));
  assert.throws(()=>actBattleship(game,'white',{type:'sea-fire',cell:0}));
  const next=actBattleship(game,'white',{type:'fleet-ready',fleet:randomFleet()});assert.equal(next.turn,'black');assert.equal(next.phase,'setup');assert.deepEqual(game,copy);
});
test('misses pass the turn, hits keep it, duplicates are rejected, twenty hits win without trusting payloads',()=>{
  let game=setup();const miss=Array.from({length:100},(_,i)=>i).find(cell=>!game.fleets.black.flat().includes(cell));
  game=actBattleship(game,'white',{type:'sea-fire',cell:miss,winner:'white'});assert.equal(game.turn,'black');assert.equal(game.winner,null);
  const blackMiss=Array.from({length:100},(_,i)=>i).find(cell=>!game.fleets.white.flat().includes(cell));game=actBattleship(game,'black',{type:'sea-fire',cell:blackMiss});
  assert.throws(()=>actBattleship(game,'white',{type:'sea-fire',cell:miss}));
  for(const cell of [NaN,100,-1,1.2,'5'])assert.throws(()=>actBattleship(game,'white',{type:'sea-fire',cell}));
  for(const cell of game.fleets.black.flat()){game=actBattleship(game,'white',{type:'sea-fire',cell});assert.equal(game.turn,'white');}
  assert.equal(game.winner,'white');assert.equal(game.reason,'fleet-sunk');assert.equal(game.shots.white.filter(s=>s.result==='sunk').length,10);
  assert.throws(()=>actBattleship(game,'white',{type:'sea-fire',cell:99}));
});
test('private views hide all unhit ships and reveal only sunk ships until the game ends',()=>{
  let game=setup();const before=structuredClone(game);
  for(const side of ['white','black']){const opponent=side==='white'?'black':'white',view=battleshipView(game,side);assert.deepEqual(view.fleets[opponent],[]);assert.deepEqual(view.fleets[side],game.fleets[side]);}
  assert.deepEqual(battleshipView(game,null).fleets,{white:[],black:[]});assert.deepEqual(game,before);
  for(const cell of game.fleets.black[0])game=actBattleship(game,'white',{type:'sea-fire',cell});
  assert.deepEqual(battleshipView(game,'white').fleets.black,[game.fleets.black[0]]);
  assert.deepEqual(battleshipView({...game,winner:'white'},'white').fleets,game.fleets);
});
test('local handoff hides both grids and online targeting never draws hidden ships',()=>{
  const {document,window}=parseHTML('<html><body><div id="battleship-board"></div></body></html>');Object.assign(globalThis,{document,window});
  let game=setup(),commands=[];const board=createBattleshipBoard(command=>commands.push(command)),root=document.getElementById('battleship-board');
  board.render(game,{mode:'local',enabled:true});assert.equal(root.querySelectorAll('.sea-cell').length,0);
  root.querySelector('[data-sea-action="reveal"]').click();assert.equal(root.querySelectorAll('.sea-cell').length,200);assert.equal(root.querySelectorAll('[data-sea-own="false"].sea-ship').length,0);
  const target=root.querySelector('[data-sea-own="false"]');target.click();assert.deepEqual(commands.at(-1),{type:'sea-fire',cell:Number(target.dataset.seaCell)});
  game={...game,turn:'black',revision:game.revision+1};board.render(game,{mode:'local',enabled:true});assert.equal(root.querySelectorAll('.sea-cell').length,0);
  board.render(battleshipView(game,'white'),{mode:'online',role:'white',enabled:false});assert.equal(root.querySelectorAll('[data-sea-own="false"]:not([disabled])').length,0);
  const html=parseHTML(readFileSync(new URL('../public/index.html',import.meta.url),'utf8')).document;
  assert.equal(html.querySelectorAll('[name="variant"][value="battleship"]').length,1);assert.ok(html.querySelector('[value="battleship"]').closest('.lobby-arcade'));assert.ok(html.querySelector('[data-scene="battleship"]'));
});

test('drag deployment rotates around the grabbed segment, rejects invalid drops and survives opponent readiness',async()=>{
  const {document,window}=parseHTML('<html><body><div id="battleship-board"></div></body></html>');Object.assign(globalThis,{document,window});
  const root=document.getElementById('battleship-board'),commands=[],board=createBattleshipBoard(command=>commands.push(command));
  let game=newBattleship();const opts={mode:'online',role:'black',roomCode:'drag-room',enabled:true};board.render(game,opts);
  const send=(target,type,props={})=>{const event=new window.Event(type,{bubbles:true,cancelable:true});Object.assign(event,{button:0,pointerId:1,...props});target.dispatchEvent(event);return event;};
  const position=cell=>({clientX:cell%10*100+50,clientY:Math.floor(cell/10)*100+50});
  const measure=()=>{root.querySelector('.sea-vessels').getBoundingClientRect=()=>({left:0,top:0,width:1000,height:1000});};
  const occupied=()=>[...root.querySelectorAll('.sea-ship')].map(el=>Number(el.dataset.seaCell));
  const start=(target,props)=>{measure();send(target,'pointerdown',props);};
  const end=async cell=>{send(root,'pointerup',position(cell));await new Promise(resolve=>setTimeout(resolve,1));};
  start(root.querySelector('[data-sea-ship="0"]'),{clientX:-100,clientY:-100});send(root,'pointermove',position(22));
  assert.equal(root.querySelectorAll('.sea-preview-valid').length,4);
  assert.equal(send(root,'wheel',{deltaY:100}).defaultPrevented,true);await end(22);
  assert.deepEqual(occupied(),[22,32,42,52]);assert.equal(root.querySelectorAll('.sea-dock-ship.is-placed').length,1);
  game=actBattleship(game,'white',{type:'fleet-ready',fleet:randomFleet()});board.render(battleshipView(game,'black'),opts);
  assert.deepEqual(occupied(),[22,32,42,52]);assert.equal(root.querySelectorAll('.sea-cell:not([disabled])').length,100);
  start(root.querySelector('[data-sea-cell="32"]'),position(32));send(root,'pointermove',position(66));send(root,'wheel',{deltaY:-100});await end(66);
  assert.deepEqual(occupied(),[65,66,67,68]);
  start(root.querySelector('[data-sea-cell="65"]'),position(65));send(root,'pointermove',position(99));await end(99);
  assert.deepEqual(occupied(),[65,66,67,68]);assert.ok(root.querySelector('.sea-error').textContent);
  start(root.querySelector('[data-sea-ship="1"]'),{clientX:-100,clientY:-100});send(root,'pointermove',position(0));send(root,'keydown',{key:'Escape'});
  assert.deepEqual(occupied(),[65,66,67,68]);assert.equal(root.classList.contains('is-dragging'),false);
  root.querySelector('[data-sea-ship="1"]').click();root.querySelector('[data-sea-cell="0"]').click();assert.deepEqual(occupied(),[0,1,2,65,66,67,68]);
  // Overlap/adjacency must not discard either of the placed ships.
  start(root.querySelector('[data-sea-cell="0"]'),position(0));send(root,'pointermove',position(55));assert.equal(root.querySelectorAll('.sea-preview-invalid').length,3);await end(55);
  assert.deepEqual(occupied(),[0,1,2,65,66,67,68]);
  root.querySelector('[data-sea-action="random"]').click();root.querySelector('[data-sea-action="ready"]').click();assert.equal(validateFleet(commands.at(-1).fleet).length,10);
  board.render({...newBattleship(),revision:50},{...opts,roomCode:'another-room'});assert.equal(occupied().length,0);
  board.hide();
});

test('live shots create effects without revealing enemy hulls; snapshots do not replay old shots',()=>{
  const {document,window}=parseHTML('<html><body><div id="battleship-board"></div></body></html>');Object.assign(globalThis,{document,window});
  const root=document.getElementById('battleship-board'),board=createBattleshipBoard(()=>{}),opts={mode:'online',role:'white',enabled:true};
  let game=setup();board.render(battleshipView(game,'white'),opts);assert.equal(root.querySelectorAll('.sea-shot-effect').length,0);
  const ship=game.fleets.black[0];
  game=actBattleship(game,'white',{type:'sea-fire',cell:ship[0]});board.render(battleshipView(game,'white'),opts);
  assert.ok(root.querySelector('.sea-effect-hit'));assert.equal(root.querySelectorAll('[data-sea-map="enemy"] .sea-vessel').length,0);
  for(const cell of ship.slice(1)){game=actBattleship(game,'white',{type:'sea-fire',cell});board.render(battleshipView(game,'white'),opts);}
  assert.ok(root.querySelector('.sea-effect-sunk'));assert.equal(root.querySelectorAll('[data-sea-map="enemy"] .sea-vessel.is-sunk').length,1);
  const blast=root.querySelector('[data-sea-map="enemy"] .sea-effect-sunk');
  assert.deepEqual([...blast.querySelectorAll('.sea-burning-cell')].map(node=>node.getAttribute('transform')),ship.map(cell=>`translate(${cell%10*100+50} ${Math.floor(cell/10)*100+50})`));
  assert.equal(root.querySelectorAll('[data-sea-map="own"] .sea-effect-sunk').length,0);
  board.hide();board.render(battleshipView(game,'white'),opts);assert.equal(root.querySelectorAll('.sea-shot-effect').length,0);
});

test('fleet models have distinct geometry at every length and cannot reveal an enemy fleet',()=>{
  const models=CATALOG.filter(item=>item.type==='ship');
  for(const length of [1,2,3,4]){
    const geometries=models.map(item=>{
      const art=shipArt(length,item.value);assert.doesNotMatch(art,/NaN|undefined|Infinity/);
      return [...parseHTML('<svg>'+art+'</svg>').document.querySelectorAll('path')].map(path=>path.getAttribute('d')).join(';');
    });assert.equal(new Set(geometries).size,models.length);
  }
  for(const item of models){assert.ok(fleetPreview(item.value).includes('viewBox="0 0 440 235"'));for(const language of ['en','uk'])for(const value of [item.name,item.description])assert.ok(translations[value]?.[language]);}
  assert.equal(validShipSkin('<script>'),'classic');assert.equal(shipArt(3,'invalid'),shipArt(3,'classic'));
  const {document,window}=parseHTML('<html><body><div id="battleship-board"></div></body></html>');Object.assign(globalThis,{document,window});
  const board=createBattleshipBoard(()=>{}),root=document.getElementById('battleship-board'),opts={mode:'online',role:'white',enabled:true,skins:{white:'viking',black:'carrier'}};
  let game=setup();board.render(battleshipView(game,'white'),opts);
  assert.equal(root.querySelectorAll('[data-sea-map="own"] .sea-model-viking').length,10);assert.equal(root.querySelectorAll('[data-sea-map="enemy"] .sea-model').length,0);
  for(const cell of game.fleets.black[0])game=actBattleship(game,'white',{type:'sea-fire',cell});board.render(battleshipView(game,'white'),opts);
  assert.equal(root.querySelectorAll('[data-sea-map="enemy"] .sea-model-carrier').length,1);board.hide();
});
