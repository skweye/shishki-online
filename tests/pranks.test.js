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
import {applyShot,simulateShot} from '../public/chapaev.js';
import {findChapaevPrankShot} from '../public/chapaev-prank.js';
import {transitionSounds} from '../public/sounds.js';
import {botDelay} from '../src/bot-room.js';

test('Chapaev prank searches all pieces and glancing angles, knocking out more than a straight full-power shot',()=>{
  for(const side of ['white','black']){
    const game=newGame('chapaev');game.turn=side;
    const original=structuredClone(game),shot=findChapaevPrankShot(game);
    const result=applyShot(game,shot.id,shot.dx,shot.dy);
    let direct=0;
    for(const p of game.pieces.filter(p=>p.side===side))for(const target of game.pieces.filter(p=>p.side!==side)){
      const x=target.x-p.x,y=target.y-p.y,d=Math.hypot(x,y);
      direct=Math.max(direct,applyShot(game,p.id,x/d,y/d).lastShot.otherLost);
    }
    assert.ok(result.lastShot.otherLost>direct,'search must beat simply aiming at a piece centre');
    assert.ok(result.lastShot.otherLost>=3);assert.equal(result.lastShot.ownLost,0);
    assert.notEqual(shot.id,game.pieces.find(p=>p.side===side).id,'selects the shooting piece, not just a direction');
    assert.deepEqual(game,original);
    assert.deepEqual(findChapaevPrankShot({...game,history:[{notation:'old move'}]}),shot,'history does not affect deterministic selection');
  }
});

test('Chapaev prank adjusts power, preserves physics, round scoring, history and the replayable impulse',()=>{
  for(const side of ['white','black']){
    const enemy=side==='white'?'black':'white';
    const game={...newGame('chapaev'),turn:side,revision:7,history:[{side:enemy,notation:'previous shot'}],
      pieces:[{id:0,side,x:4,y:4},{id:8,side:enemy,x:4,y:.5}]};
    const next=applyOwnerPrank(game,side),{id,dx,dy}=next.lastShot;
    const replay=simulateShot(game,id,dx,dy,true);
    assert.ok(Math.hypot(dx,dy)<1);assert.equal(next.lastShot.ownLost,0);
    assert.deepEqual(next.pieces,replay.game.pieces);assert.deepEqual(next.history,replay.game.history);
    assert.deepEqual(next.score,replay.game.score);assert.equal(next.score[side],1);
    assert.equal(next.winner,side);assert.equal(next.reason,'round');assert.equal(next.turn,enemy);
    assert.equal(next.history.length,game.history.length+1);assert.equal(next.lastPrank.revision,8);assert.equal(next.unranked,true);
    assert.ok(replay.frames.length>1);assert.ok(replay.collisions.length>0);
    assert.ok(transitionSounds(game,next,side).includes('capture'));
    assert.deepEqual(transitionSounds(next,next,side),[],'repeat snapshot is silent');
    assert.ok(botDelay(next)>=next.lastShot.duration*1000/.8,'bot waits for shot playback');
  }
});
test('each mode has a bounded, immutable prank, repeatable use and translated instructions',()=>{
  for(const variant of Object.keys(PRANKS)){
    let game=newGame(variant);
    if(variant==='narde')game.opening=false;
    if(variant==='pool8')game.groups={white:'solid',black:'stripe'};
    if(variant==='domino')game=actDomino(game,{type:'domino-play',...dominoMoves(game)[0]});
    if(variant==='battleship'){game=actBattleship(game,'white',{type:'fleet-ready',fleet:randomFleet()});game=actBattleship(game,'black',{type:'fleet-ready',fleet:randomFleet()});}
    const side=game.turn,copy=structuredClone(game),next=applyOwnerPrank(game,side);
    assert.deepEqual(game,copy);assert.equal(next.revision,game.revision+1);assert.equal(next.unranked,true);assert.equal(next.prankUsed,undefined);
assert.throws(()=>applyOwnerPrank(game,side==='white'?'black':'white'));
    if(variant.startsWith('russian'))assert.equal(next.board.filter(p=>p===2).length,1);
    if(variant==='chess')assert.equal(next.fen,game.fen);
    if(variant==='narde')assert.deepEqual(next.dice,[6,6,6,6]);
    if(variant==='chapaev'){assert.ok(next.lastShot.otherLost>0);assert.equal(next.lastShot.revision,next.revision);assert.equal(next.turn,'black');}
    if(variant==='pool8'){assert.deepEqual(next.balls.map(b=>b.id).sort((a,b)=>a-b),[0,9,10,11,12,13,14,15]);assert.equal(next.winner,side);assert.equal(next.lastShot.kind,'sweep');}
    if(variant==='domino'){assert.equal(new Set([...next.hands.white,...next.hands.black,...next.stock,...next.chain.map(t=>t.id)]).size,28);const weight=g=>g.hands[side].reduce((n,id)=>n+DOMINOES[id][0]+DOMINOES[id][1],0);assert.ok(weight(next)<=weight(game));}
    if(variant==='battleship'){assert.equal(next.shots[side].length,1);assert.equal(battleshipView(next,side).fleets.black.flat().length<=1,true);}
    for(const text of [PRANKS[variant].name,PRANKS[variant].description])assert.ok(translations[text]?.en&&translations[text]?.uk,text);
  }
});
test('pranks reject mid-capture, unfinished opening/setup, spent dice and absent targets',()=>{
  assert.throws(()=>applyOwnerPrank({...newGame(),forced:42},'white'));
  for(const variant of ['narde','battleship','domino']){const g=newGame(variant);assert.throws(()=>applyOwnerPrank(g,g.turn));}
  for(const side of ['white','black'])assert.throws(()=>applyOwnerPrank({...newGame('chapaev'),pieces:newGame('chapaev').pieces.filter(p=>p.side===side)},'white'));
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
test('pranks show no notification, retain mode sounds and stop audio on hidden page',t=>{
  t.mock.timers.enable({apis:['setTimeout']});const {document,window}=parseHTML('<html><body><div id="board"></div></body></html>');Object.assign(globalThis,{document,window});
  let stops=0;const sounds=[],effect=createPrankEffect(kind=>{sounds.push(kind);return ()=>stops++;});
  for(const variant of Object.keys(PRANKS).filter(v=>v!=='pool8')){effect.play(variant);assert.equal(document.getElementById('board').children.length,0);assert.equal(sounds.at(-1),'prank-'+variant);}
  document.hidden=true;document.dispatchEvent(new window.Event('visibilitychange'));assert.equal(document.querySelector('.prank-effect'),null);assert.equal(stops,7);
  effect.play('pool8');assert.equal(sounds.length,7);document.hidden=false;effect.play('chess');t.mock.timers.tick(2500);assert.equal(document.querySelector('.prank-effect'),null);assert.equal(stops,8);
});

test('previously used pranks remain repeatable in the same turn and after restoring old saves',()=>{
  for(const variant of ['russian','russian12','chess']){
    let game={...newGame(variant),prankUsed:{white:true}};
    for(let i=0;i<10;i++){game=applyOwnerPrank(game,'white');assert.equal(game.revision,i+1);assert.equal(game.prankUsed,undefined);}
    if(variant!=='chess')assert.equal(game.board.filter(p=>p===2).length,10);
  }
});
