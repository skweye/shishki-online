import {test} from 'node:test';
import assert from 'node:assert/strict';
import {parseHTML} from 'linkedom';
import {readFileSync} from 'node:fs';
import {newGame} from '../public/game.js';
import {applyOwnerPrank} from '../public/pranks.js';
import {applyPoolShot} from '../public/pool.js';

test('complete app starts every local mode with one menu and state-specific controls',async()=>{
  const {document,window}=parseHTML(readFileSync(new URL('../public/index.html',import.meta.url),'utf8'));
  assert.equal(document.querySelectorAll('.ambient-mode.is-active').length,1,'background is visible before game modules start');
  assert.equal(document.querySelector('.ambient-mode.is-active').dataset.scene,'russian');
  const $=id=>document.getElementById(id),store=new Map();let focused;
  Object.defineProperty(document,'activeElement',{get:()=>focused});
  window.HTMLElement.prototype.focus=function(){focused=this;};
  window.HTMLElement.prototype.getBoundingClientRect=()=>({x:0,y:0,left:0,top:0,right:640,bottom:640,width:640,height:640});
  Object.defineProperty(window.HTMLSelectElement.prototype,'value',{get(){return this._value??this.querySelector('option')?.value??'';},set(value){this._value=String(value);}});
  const gradient={addColorStop(){}};
  const context=new Proxy({createImageData:(w,h)=>({data:new Uint8ClampedArray(w*h*4)}),getImageData:(x,y,w,h)=>({data:new Uint8ClampedArray(w*h*4)}),createLinearGradient:()=>gradient,createRadialGradient:()=>gradient,measureText:()=>({width:30})},{get:(target,key)=>key in target?target[key]:()=>{}});
  window.HTMLCanvasElement.prototype.getContext=()=>context;
  const intervals=[],realInterval=globalThis.setInterval;
  let channel,roomData,creations=0;const searches=[];
  class Channel{
    static OPEN=1;
    constructor(){channel=this;this.readyState=1;queueMicrotask(()=>this.onopen?.());}
    send(message){this.lastMessage=message;}
    close(){this.readyState=3;this.onclose?.({code:1000});}
  }
  Object.assign(globalThis,{document,window,Node:window.Node,NodeFilter:{SHOW_ELEMENT:1,SHOW_TEXT:4},MutationObserver:window.MutationObserver,CustomEvent:window.CustomEvent,
    localStorage:{getItem:key=>store.get(key)||null,setItem:(key,value)=>store.set(key,value),removeItem:key=>store.delete(key)},
    matchMedia:()=>({matches:true,addEventListener(){},removeEventListener(){}}),requestAnimationFrame:()=>1,cancelAnimationFrame(){},
    getComputedStyle:()=>({getPropertyValue:()=>'',position:'relative'}),ResizeObserver:class{observe(){}disconnect(){}},
    history:{replaceState(){}},location:{href:'https://game.test/',origin:'https://game.test',pathname:'/',host:'game.test',protocol:'https:',assign(){}},WebSocket:Channel,
    fetch:async(path,options)=>{
      if(path==='/api/matchmaking'){
        const data=JSON.parse(options.body);searches.push(data);
        roomData={code:'112233445566',token:'found-seat',role:'black',game:newGame(data.variant||'chess'),ready:true,online:{white:true,black:true},rematch:[],drawOffer:null,chat:[]};
        return {ok:true,json:async()=>({status:'matched',ticket:data.ticket,code:roomData.code,token:roomData.token})};
      }
      if(path==='/api/rooms/112233445566/join')return {ok:true,json:async()=>structuredClone(roomData)};
      if(path==='/api/rooms'){
        creations++;roomData={code:'AABBCCDDEEFF',token:'test',role:'white',game:newGame(JSON.parse(options.body).variant),ready:false,online:{white:true,black:false},rematch:[],drawOffer:null,chat:[]};
        return {ok:true,json:async()=>structuredClone(roomData)};
      }
      return {ok:true,json:async()=>({user:{id:'owner',name:'Owner',email:'kkoallqq@gmail.com',emailVerified:true,ownerPranks:true},googleEnabled:false})};
    },
    setInterval:(...args)=>{const id=realInterval(...args);id.unref();intervals.push(id);return id;}
  });
  window.scrollTo=()=>{};
  for(const dialog of document.querySelectorAll('dialog')){dialog.showModal=()=>{dialog.open=true;};dialog.close=()=>{if(dialog.open){dialog.open=false;dialog.dispatchEvent(new window.Event('close'));}};}
  const variant={value:'russian'},playMode={value:'local'};Object.defineProperty($('start-form'),'elements',{value:{variant,'play-mode':playMode}});
  async function menuClick(id){
    if($('match-menu').hidden)$('match-menu-button').click();
    const target=$(id),previous=document.activeElement;
    assert.equal(target.hidden,false,id);assert.equal(target.disabled,false,id);
    target.dispatchEvent(new window.Event('pointerdown',{bubbles:true}));
    document.body.focus();const blur=new window.Event('focusout',{bubbles:true});blur.relatedTarget=target;previous?.dispatchEvent(blur);
    await Promise.resolve();assert.equal($('match-menu').hidden,false,id+' hidden before click');
    target.focus();target.dispatchEvent(new window.Event('focusin',{bubbles:true}));
    target.dispatchEvent(new window.Event('pointerup',{bubbles:true}));target.click();
  }
  // The shell is mounted by auth dependencies before the app starts.
  try{
    await import('../public/app.js');
    for(const name of ['russian','russian12','chess','narde','pool8','chapaev','domino','battleship']){
      variant.value=name;$('start-form').onchange();
      assert.equal(document.querySelectorAll('.ambient-mode.is-active').length,1);
      assert.equal(document.querySelector('.ambient-mode.is-active').dataset.scene,name,'home background follows selected game');
      await $('start-form').onsubmit({preventDefault(){}});
      assert.equal(document.querySelector('.ambient-mode.is-active').dataset.scene,name,'match keeps the selected background');
      document.hidden=true;document.dispatchEvent(new window.Event('visibilitychange'));
      assert.equal(document.body.classList.contains('ambient-paused'),true);
      document.hidden=false;document.dispatchEvent(new window.Event('visibilitychange'));
      assert.equal(document.body.classList.contains('ambient-paused'),false);
      assert.equal($('game-screen').hidden,false,name);
      assert.equal($('status-title').textContent.length>0,true,name);
      assert.equal(document.querySelectorAll('#match-menu').length,1);
      assert.equal($('shot-controls').hidden,name!=='chapaev');
      assert.equal($('flip-button').hidden,['domino','battleship'].includes(name));
      $('match-menu-button').click();assert.equal($('match-menu').hidden,false);
      await menuClick('rules-button');assert.equal($('rules-dialog').open,true);$('rules-dialog').close();
      if(name==='chess'){
        assert.equal($('prank-button').hidden,false);
        const clockBefore=Number($('clock-white').textContent.split(':')[0]);
        await menuClick('prank-button');await menuClick('prank-button');
        assert.equal(Number($('clock-white').textContent.split(':')[0]),clockBefore+2);
        assert.equal($('prank-button').disabled,false);
        assert.equal(document.querySelector('#prank-dialog,#prank-session-note,.prank-effect'),null);
      }
      if(name==='narde'){
        assert.equal(document.querySelector('.narde-off').hidden,true);
        assert.equal(document.querySelector('.narde-deselect').hidden,true);
        assert.equal(document.querySelector('.narde-roll').hidden,false);
      }
      if(!['domino','battleship'].includes(name)){const first=$('clock-white').parentElement.parentElement.firstElementChild;await menuClick('flip-button');assert.notEqual($('clock-white').parentElement.parentElement.firstElementChild,first,name);await menuClick('flip-button');}
      if(name==='pool8')assert.equal($('pool-shoot').hidden,false);
      if(name==='russian'){
        $('board').querySelector('.available').click();$('board').querySelector('.legal').click();
        assert.equal($('new-button').hidden,false);await menuClick('new-button');assert.equal($('confirm-dialog').open,true);
        $('confirm-yes').click();assert.equal($('new-button').hidden,true);
        await menuClick('resign-button');$('confirm-yes').click();assert.equal($('result-dialog').open,true);
        assert.equal($('round-actions').hidden,true);$('result-dialog').close();assert.equal($('round-actions').hidden,false);
        $('rematch-button').click();assert.equal($('round-actions').hidden,true);assert.equal($('resign-button').hidden,false);
      }
      await menuClick('draw-button');assert.equal($('confirm-dialog').open,true,name);$('confirm-dialog').close();
      if(name!=='russian'){
        $('match-menu-button').click();await menuClick('resign-button');assert.equal($('confirm-dialog').open,true,name);
        $('confirm-yes').click();assert.equal($('result-dialog').open,true,name);
        assert.match($('result-text').textContent,/сдались/,name);
        $('result-rematch').click();assert.equal($('resign-button').disabled,false,name);assert.equal($('result-dialog').open,false,name);
      }
      await menuClick('home-button');assert.equal($('home-screen').hidden,false);
    }
    playMode.value='online';variant.value='chapaev';await $('start-form').onsubmit({preventDefault(){}});
    assert.equal(creations,1);assert.equal($('room-controls').open,true);assert.equal($('resign-button').hidden,true);assert.equal($('shot-controls').hidden,true);
    const snapshot=()=>channel.onmessage({data:JSON.stringify({type:'state',...roomData})});
    roomData.ready=true;roomData.online.black=true;snapshot();assert.equal($('room-controls').open,false);assert.equal($('shot-controls').hidden,false);
    $('chat-tab').click();snapshot();assert.equal($('chat-panel').hidden,false,'incoming states must not switch tabs');
    $('history-tab').click();channel.onmessage({data:JSON.stringify({type:'chat',message:{id:'first',side:'black',name:'Friend',text:'Hello',sentAt:Date.now()}})});
    assert.equal($('chat-unread').textContent,'1');
    roomData.game.turn='black';roomData.game.revision++;snapshot();assert.equal($('shot-controls').hidden,true);
    await menuClick('draw-button');assert.equal(JSON.parse(channel.lastMessage).type,'draw');
    roomData.drawOffer='white';snapshot();assert.equal($('draw-button').hidden,true);assert.equal($('draw-offer-status').hidden,false);
    // An opponent can move while surrender confirmation is open.
    roomData.drawOffer=null;snapshot();$('match-menu-button').click();await menuClick('resign-button');
    assert.equal($('confirm-dialog').open,true);assert.equal($('match-menu').hidden,true);
    roomData.game.revision++;roomData.game.turn='white';snapshot();
    $('confirm-yes').click();assert.equal(JSON.parse(channel.lastMessage).type,'resign');
    assert.equal(JSON.parse(channel.lastMessage).revision,roomData.game.revision);
    snapshot(); // Server state clears pending for the following disconnection check.
    channel.close();assert.equal($('resign-button').disabled,true);assert.equal($('chat-input').disabled,true);
    await menuClick('home-button');$('confirm-yes').click();assert.equal($('home-screen').hidden,false);
    playMode.value='search';variant.value='chess';$('start-form').onchange();
    assert.match($('start-button').textContent,/Найти соперника/);
    await $('start-form').onsubmit({preventDefault(){}});
    assert.deepEqual(searches.map(s=>s.action),['join','ack']);assert.equal(creations,1);
    assert.equal($('game-screen').hidden,false);assert.equal($('search-dialog').open,false);assert.equal($('room-controls').open,false);
    assert.equal(store.has('shishki-search-v1'),false);assert.equal(store.get('shashki-room-112233445566'),'found-seat');
    await menuClick('home-button');$('confirm-yes').click();
    // Shot outcomes remain hidden through repeat snapshots until the canvas finishes.
    playMode.value='online';variant.value='pool8';await $('start-form').onsubmit({preventDefault(){}});
    roomData.ready=true;roomData.online.black=true;
    roomData.game={...newGame('pool8'),breaking:false,ballInHand:null,balls:[{id:0,x:10,y:3},{id:1,x:10,y:.8},{id:2,x:3,y:5},{id:8,x:15,y:6},{id:9,x:18,y:6}]};snapshot();
    const frames=new Map();let frameId=0;
    globalThis.matchMedia=()=>({matches:false,addEventListener(){},removeEventListener(){}});
    globalThis.requestAnimationFrame=fn=>{frames.set(++frameId,fn);return frameId;};globalThis.cancelAnimationFrame=id=>frames.delete(id);
    document.documentElement.dataset.lowPerformance='true';
    roomData.game=applyPoolShot(roomData.game,{dx:0,dy:-.2});snapshot();
    assert.equal($('status-title').textContent,'Шары в движении');assert.equal(document.querySelectorAll('.pool-rack').length,0);
    assert.equal($('move-count').textContent,'0 ударов');assert.equal($('pool-notice').textContent,'');
    snapshot();assert.equal(document.querySelectorAll('.pool-rack').length,0,'duplicate snapshots cannot reveal the assigned group');
    const runFrame=time=>{const pending=[...frames.values()];frames.clear();pending.forEach(fn=>fn(time));};
    runFrame(0);runFrame(60000);
    assert.equal(document.querySelectorAll('.pool-rack').length,2);assert.ok(document.querySelector('.pool-rack-ball[aria-label="1: Забит"]'));
    assert.equal($('move-count').textContent,'1 удар');
    // Existing groups and their remaining counts also wait; hiding the tab completes cleanly.
    roomData.game={...newGame('pool8'),revision:10,breaking:false,ballInHand:null,groups:{white:'solid',black:'stripe'},balls:[{id:0,x:10,y:3},{id:1,x:10,y:.8},{id:2,x:3,y:5},{id:8,x:15,y:6},{id:9,x:18,y:6}]};snapshot();
    roomData.game=applyPoolShot(roomData.game,{dx:0,dy:-.2});snapshot();
    assert.ok(document.querySelector('.pool-rack-ball[aria-label="1: На столе"]'));assert.match($('bottom-player').querySelector('.piece-count').textContent,/2/);
    document.hidden=true;document.dispatchEvent(new window.Event('visibilitychange'));
    assert.ok(document.querySelector('.pool-rack-ball[aria-label="1: Забит"]'));assert.match($('bottom-player').querySelector('.piece-count').textContent,/1/);
    document.hidden=false;
    // The sweep uses the shot lifecycle: no notice, premature rack or victory.
    roomData.game={...newGame('pool8'),revision:20,breaking:false,ballInHand:null,groups:{white:'solid',black:'stripe'},balls:[{id:0,x:4,y:5},{id:1,x:8,y:3},{id:8,x:14,y:6},{id:9,x:18,y:4}]};snapshot();
    await menuClick('prank-button');assert.equal(JSON.parse(channel.lastMessage).type,'owner-prank');
    roomData.game=applyOwnerPrank(roomData.game,'white');snapshot();
    assert.equal($('status-title').textContent,'Шары в движении');assert.equal($('result-dialog').open,false);
    assert.ok(document.querySelector('.pool-rack-ball[aria-label="1: На столе"]'));
    assert.equal(document.querySelector('#prank-dialog,#prank-session-note,.prank-effect'),null);
    snapshot();runFrame(0);runFrame(200);assert.equal($('result-dialog').open,false);
    runFrame(60000);assert.equal($('result-dialog').open,true);assert.ok(document.querySelector('.pool-rack-ball[aria-label="1: Забит"]'));
    $('result-dialog').close();await menuClick('home-button');

  }finally{intervals.forEach(clearInterval);globalThis.setInterval=realInterval;}
});
