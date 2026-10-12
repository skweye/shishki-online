import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {parseHTML} from 'linkedom';
import {newBattleship,randomFleet,validateFleet,shipCells,canPlaceShip,actBattleship,battleshipView} from '../public/battleship.js';
import {newGame,legalMoves,applyMove} from '../public/game.js';
import {createClock} from '../public/time-control.js';
import {createBattleshipBoard} from '../public/battleship-board.js';
const setup=()=>{let game=newBattleship();for(const side of ['white','black'])game=actBattleship(game,side,{type:'fleet-ready',fleet:randomFleet()});return game;};

test('fleets have twenty cells, valid straight ships and no touching; setup is turn-bound and immutable',()=>{
  for(let i=0;i<60;i++){const fleet=randomFleet();assert.equal(fleet.flat().length,20);assert.deepEqual(validateFleet(fleet),fleet);}
  assert.deepEqual(shipCells(9,2),[]);assert.deepEqual(shipCells(90,2,true),[]);
  for(const ship of [[0,11],[0,2],[0,0],[9,10],[-1],[100],[.5]])assert.equal(canPlaceShip([],ship),false);
  assert.equal(canPlaceShip([[0,1]],[12]),false);
  const game=newGame('battleship'),copy=structuredClone(game);assert.equal(createClock('battleship'),null);assert.deepEqual(legalMoves(game),[]);assert.throws(()=>applyMove(game,0,1));
  assert.throws(()=>actBattleship(game,'black',{type:'fleet-ready',fleet:randomFleet()}));
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
  assert.equal(html.querySelectorAll('[name="variant"][value="battleship"]').length,1);assert.equal(html.querySelector('[value="battleship"]').closest('.arcade-options'),null);assert.ok(html.querySelector('[data-scene="battleship"]'));
});
