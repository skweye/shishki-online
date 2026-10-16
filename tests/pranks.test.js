import {test} from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync,readdirSync} from 'node:fs';
import {parseHTML} from 'linkedom';
import {PRANKS,applyOwnerPrank,ownerPranks} from '../public/pranks.js';
import {newGame} from '../public/game.js';
import {actDomino,dominoMoves,DOMINOES} from '../public/domino.js';
import {actBattleship,randomFleet,battleshipView} from '../public/battleship.js';
import {createPrankEffect} from '../public/prank-effect.js';
import {translations} from '../public/locales.js';
test('each mode has a bounded, immutable prank, one use per match and translated instructions',()=>{
  for(const variant of Object.keys(PRANKS)){
    let game=newGame(variant);
    if(variant==='narde')game.opening=false;
    if(variant==='chapaev')game.pieces.shift();
    if(variant==='pool8')game.groups={white:'solid',black:'stripe'};
    if(variant==='domino')game=actDomino(game,{type:'domino-play',...dominoMoves(game)[0]});
    if(variant==='battleship'){game=actBattleship(game,'white',{type:'fleet-ready',fleet:randomFleet()});game=actBattleship(game,'black',{type:'fleet-ready',fleet:randomFleet()});}
    const side=game.turn,copy=structuredClone(game),next=applyOwnerPrank(game,side);
    assert.deepEqual(game,copy);assert.equal(next.revision,game.revision+1);assert.equal(next.unranked,true);assert.equal(next.prankUsed[side],true);
    assert.throws(()=>applyOwnerPrank(next,side));assert.throws(()=>applyOwnerPrank(game,side==='white'?'black':'white'));
    if(variant.startsWith('russian'))assert.equal(next.board.filter(p=>p===2).length,1);
    if(variant==='chess')assert.equal(next.fen,game.fen);
    if(variant==='narde')assert.deepEqual(next.dice,[6,6,6,6]);
    if(variant==='chapaev')assert.equal(next.pieces.length,16);
    if(variant==='pool8'){assert.equal(next.balls.length,15);assert.ok(next.balls.some(b=>b.id===8));assert.ok(next.balls.some(b=>b.id===0));}
    if(variant==='domino'){assert.equal(new Set([...next.hands.white,...next.hands.black,...next.stock,...next.chain.map(t=>t.id)]).size,28);const weight=g=>g.hands[side].reduce((n,id)=>n+DOMINOES[id][0]+DOMINOES[id][1],0);assert.ok(weight(next)<=weight(game));}
    if(variant==='battleship'){assert.equal(next.shots[side].length,1);assert.equal(battleshipView(next,side).fleets.black.flat().length<=1,true);}
    for(const text of [PRANKS[variant].name,PRANKS[variant].description])assert.ok(translations[text]?.en&&translations[text]?.uk,text);
  }
});
test('pranks reject mid-capture, unfinished opening/setup, spent dice and absent targets',()=>{
  assert.throws(()=>applyOwnerPrank({...newGame(),forced:42},'white'));
  for(const variant of ['chapaev','pool8','narde','battleship','domino']){const g=newGame(variant);assert.throws(()=>applyOwnerPrank(g,g.turn));}
  assert.throws(()=>applyOwnerPrank({...newGame('narde'),opening:false,dice:[1]},'white'));
});
test('migration grants only existing verified owner and prevents admin or recreated-account grants',()=>{
  const db=new DatabaseSync(':memory:');try{
    const files=readdirSync(new URL('../migrations/',import.meta.url)).sort();
    for(const file of files.filter(f=>f<'0014'))db.exec(readFileSync(new URL('../migrations/'+file,import.meta.url),'utf8'));
    const add=db.prepare('INSERT INTO users(id,name,email,email_verified,google_sub,created_at) VALUES(?,?,?,?,?,0)');
    add.run('owner','Owner','kkoallqq@gmail.com',1,'google');add.run('admin','Admin','other@example.com',1,'other');
    db.exec(readFileSync(new URL('../migrations/0014_owner_pranks.sql',import.meta.url),'utf8'));
    assert.equal(db.prepare('SELECT owner_pranks FROM users WHERE id=?').get('owner').owner_pranks,1);
    db.exec("UPDATE users SET admin_level=3,shop_access=1 WHERE id='admin'");assert.equal(db.prepare('SELECT owner_pranks FROM users WHERE id=?').get('admin').owner_pranks,0);
    assert.throws(()=>db.exec("UPDATE users SET owner_pranks=1 WHERE id='admin'"));
    db.exec("DELETE FROM users WHERE id='owner'");add.run('new','New','kkoallqq@gmail.com',1,'new');
    assert.equal(db.prepare('SELECT owner_pranks FROM users WHERE id=?').get('new').owner_pranks,0);
    assert.equal(ownerPranks({ownerPranks:true,email:'other@example.com',emailVerified:true}),false);
  }finally{db.close();}
});
test('effect uses mode sound once and cleans both audio and visuals on hidden page',t=>{
  t.mock.timers.enable({apis:['setTimeout']});const {document,window}=parseHTML('<html><body><div id="board"></div></body></html>');Object.assign(globalThis,{document,window});
  let stops=0;const sounds=[],effect=createPrankEffect(document.getElementById('board'),kind=>{sounds.push(kind);return ()=>stops++;});
  for(const variant of Object.keys(PRANKS)){effect.play(variant);assert.equal(document.querySelectorAll('.prank-effect').length,1);assert.equal(sounds.at(-1),'prank-'+variant);}
  document.hidden=true;document.dispatchEvent(new window.Event('visibilitychange'));assert.equal(document.querySelector('.prank-effect'),null);assert.equal(stops,8);
  effect.play('pool8');assert.equal(sounds.length,8);document.hidden=false;effect.play('chess');t.mock.timers.tick(2500);assert.equal(document.querySelector('.prank-effect'),null);assert.equal(stops,9);
});
