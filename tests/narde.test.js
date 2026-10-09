import {test} from 'node:test';
import assert from 'node:assert/strict';
import {newGame,legalMoves,applyMove} from '../public/game.js';
import {rollNarde,blocksAll,nardeProgress,randomDice} from '../public/narde.js';
import {createClock} from '../public/time-control.js';
import {CATALOG,validSkin} from '../public/shop-catalog.js';
import {pieceArt} from '../public/skin-art.js';

function position(white,black,dice=[1,2],turn='white') {
  const g=newGame('narde');g.board.fill(0);
  for(const [point,count] of Object.entries(white))g.board[point]=count;
  for(const [point,count] of Object.entries(black))g.board[point]=-count;
  g.off={white:15-Object.values(white).reduce((a,b)=>a+b,0),black:15-Object.values(black).reduce((a,b)=>a+b,0)};
  g.turn=turn;g.opening=false;g.firstDone={white:true,black:true};g.dice=[...dice];g.rolled=dice.slice(0,2);return g;
}
test('long narde starts with opposite heads, an opening draw and no clock',()=>{
  const game=newGame('narde');assert.equal(game.board.length,24);assert.equal(game.board[0],15);assert.equal(game.board[12],-15);
  assert.equal(createClock('narde'),null);assert.deepEqual(legalMoves(game),[]);
  let next=rollNarde(game,[2,5]);assert.equal(next.turn,'black');assert.deepEqual(next.dice,[2,5]);
  assert.throws(()=>rollNarde(next,[6,6]));assert.throws(()=>rollNarde(game,[2,2]));assert.throws(()=>rollNarde(game,[0,7]));assert.throws(()=>rollNarde(newGame(),[1,2]));
  for(let i=0;i<80;i++){const pair=randomDice(true);assert.notEqual(pair[0],pair[1]);assert.ok(pair.every(n=>Number.isInteger(n)&&n>=1&&n<=6));}
});
test('head limit, same direction and no landing on opposing checkers',()=>{
  let g=rollNarde(newGame('narde'),[6,3]);g=applyMove(g,0,6,6);
  assert.equal(g.headTaken,1);assert.ok(legalMoves(g).every(m=>m.from!==0));
  g=applyMove(g,6,9,3);assert.equal(g.turn,'black');assert.equal(g.history.length,1);assert.deepEqual(g.dice,[]);
  const blocked=position({0:15},{1:1,2:14});assert.deepEqual(legalMoves(blocked),[]);assert.throws(()=>applyMove(blocked,0,1));
  const black=position({0:15},{23:15},[1,2],'black');assert.ok(legalMoves(black).some(m=>m.to===1));assert.ok(!legalMoves(black).some(m=>m.to===0));
});
test('first-turn special doubles permit two heads, later doubles only one',()=>{
  for(const die of [3,4,6]){
    let g=newGame('narde');g.opening=false;g=rollNarde(g,[die,die]);assert.equal(g.headLimit,2);
    let moves=0;while(g.dice.length){const m=legalMoves(g)[0];g=applyMove(g,m.from,m.to,m.die);moves++;}
    assert.equal(g.board[0],13);assert.equal(moves,die===6?2:4);assert.equal(g.turn,'black');
  }
  const g=position({0:15},{12:15},[]);assert.equal(rollNarde(g,[4,4]).headLimit,1);
});
test('use both dice when possible, otherwise the higher die',()=>{
  const g=position({0:15},{4:15},[1,3]);const moves=legalMoves(g);
  assert.deepEqual(moves.map(m=>m.die),[3]);
  // 1 then 2 works; 2 then 1 would force the second checker to leave the head.
  const both=position({0:1,2:14},{4:15},[1,2]);
  assert.ok(legalMoves(both).every(m=>{const next=applyMove(both,m.from,m.to,m.die);return next.dice.length===1;}));
});
test('six-point primes need an opposing checker ahead, including intermediate moves',()=>{
  const g=position({1:1,2:1,3:1,4:1,5:1,0:10},{12:15},[6]);
  assert.ok(!legalMoves(g).some(m=>m.from===0&&m.to===6));
  const board=[...g.board];board[6]=1;board[0]=9;assert.equal(blocksAll(board,'white',{white:0,black:0}),true);
  board[12]=-14;board[7]=-1;assert.equal(blocksAll(board,'white',{white:0,black:0}),false);
  assert.equal(blocksAll(board,'white',{white:0,black:1}),false);
});
test('bearing off requires all home, exact dice or the farthest checker, with mars results',()=>{
  let g=position({17:1,23:14},{12:15},[1]);assert.ok(!legalMoves(g).some(m=>m.to===24));
  g=position({18:1,23:14},{12:15},[6]);assert.ok(legalMoves(g).some(m=>m.from===18&&m.to===24));assert.ok(!legalMoves(g).some(m=>m.from===23&&m.to===24));
  g=position({22:1},{12:15},[6]);g=applyMove(g,22,24,6);assert.equal(g.winner,'white');assert.equal(g.reason,'mars');assert.equal(g.off.white,15);
  g=position({0:1},{11:1},[1],'black');g=applyMove(g,11,24,1);assert.equal(g.winner,'black');assert.equal(g.reason,'bear-off');
});
test('blocked rolls pass automatically; a serialized partial turn preserves remaining dice',()=>{
  let g=position({0:15},{1:8,2:7},[]);g=rollNarde(g,[1,2]);assert.equal(g.turn,'black');assert.equal(g.history.length,1);assert.deepEqual(g.dice,[]);
  g=rollNarde(newGame('narde'),[5,2]);g=applyMove(g,0,5,5);
  const restored=JSON.parse(JSON.stringify(g));assert.deepEqual(legalMoves(restored),legalMoves(g));assert.equal(restored.headTaken,1);assert.deepEqual(restored.dice,[2]);
});
test('simulated complete games preserve counts, forward movement and eventually finish',()=>{
  let seed=19;const rng=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed;};
  for(let match=0;match<4;match++){
    let game=newGame('narde');
    for(let i=0;i<3500&&!game.winner;i++){
      if(!game.dice.length){let pair;do{pair=[rng()%6+1,rng()%6+1];}while(game.opening&&pair[0]===pair[1]);game=rollNarde(game,pair);}
      else{const moves=legalMoves(game),m=moves[rng()%moves.length];assert.ok(m);if(m.to!==24)assert.ok(nardeProgress(m.to,game.turn)>nardeProgress(m.from,game.turn));game=applyMove(game,m.from,m.to,m.die);}
      assert.equal(game.board.filter(v=>v>0).reduce((a,b)=>a+b,0)+game.off.white,15);
      assert.equal(-game.board.filter(v=>v<0).reduce((a,b)=>a+b,0)+game.off.black,15);
    }
    assert.ok(game.winner);
  }
});
test('illustrated skins are purchasable and use original vector motifs',()=>{
  for(const skin of ['fox','compass']){assert.equal(validSkin(skin),skin);assert.ok(CATALOG.find(i=>i.value===skin&&i.type==='skin').price>0);assert.match(pieceArt(skin),/<svg/);}
  assert.equal(pieceArt('untrusted'),'');assert.notEqual(pieceArt('fox'),pieceArt('compass'));
});
