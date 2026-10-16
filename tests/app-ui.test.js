import {test} from 'node:test';
import assert from 'node:assert/strict';
import {parseHTML} from 'linkedom';
import {readFileSync} from 'node:fs';
import {newGame} from '../public/game.js';

test('complete app starts every local mode with one menu and state-specific controls',async()=>{
  const {document,window}=parseHTML(readFileSync(new URL('../public/index.html',import.meta.url),'utf8'));
  const $=id=>document.getElementById(id),store=new Map();let focused;
  Object.defineProperty(document,'activeElement',{get:()=>focused});
  window.HTMLElement.prototype.focus=function(){focused=this;};
  window.HTMLElement.prototype.getBoundingClientRect=()=>({x:0,y:0,left:0,top:0,right:640,bottom:640,width:640,height:640});
  Object.defineProperty(window.HTMLSelectElement.prototype,'value',{get(){return this._value??this.querySelector('option')?.value??'';},set(value){this._value=String(value);}});
  const gradient={addColorStop(){}};
  const context=new Proxy({createImageData:(w,h)=>({data:new Uint8ClampedArray(w*h*4)}),getImageData:(x,y,w,h)=>({data:new Uint8ClampedArray(w*h*4)}),createLinearGradient:()=>gradient,createRadialGradient:()=>gradient,measureText:()=>({width:30})},{get:(target,key)=>key in target?target[key]:()=>{}});
  window.HTMLCanvasElement.prototype.getContext=()=>context;
  const intervals=[],realInterval=globalThis.setInterval;
  let channel,roomData,creations=0;
  class Channel{
    static OPEN=1;
    constructor(){channel=this;this.readyState=1;queueMicrotask(()=>this.onopen?.());}
    send(message){this.lastMessage=message;}
    close(){this.readyState=3;this.onclose?.({code:1000});}
  }
  Object.assign(globalThis,{document,window,Node:window.Node,NodeFilter:{SHOW_ELEMENT:1,SHOW_TEXT:4},MutationObserver:window.MutationObserver,CustomEvent:window.CustomEvent,
    localStorage:{getItem:key=>store.get(key)||null,setItem:(key,value)=>store.set(key,value)},
    matchMedia:()=>({matches:true,addEventListener(){},removeEventListener(){}}),requestAnimationFrame:()=>1,cancelAnimationFrame(){},
    getComputedStyle:()=>({getPropertyValue:()=>'',position:'relative'}),ResizeObserver:class{observe(){}disconnect(){}},
    history:{replaceState(){}},location:{href:'https://game.test/',origin:'https://game.test',pathname:'/',host:'game.test',protocol:'https:',assign(){}},WebSocket:Channel,
    fetch:async(path,options)=>{
      if(path==='/api/rooms'){
        creations++;roomData={code:'AABBCCDDEEFF',token:'test',role:'white',game:newGame(JSON.parse(options.body).variant),ready:false,online:{white:true,black:false},rematch:[],drawOffer:null,chat:[]};
        return {ok:true,json:async()=>structuredClone(roomData)};
      }
      return {ok:true,json:async()=>({user:null,googleEnabled:false})};
    },
    setInterval:(...args)=>{const id=realInterval(...args);id.unref();intervals.push(id);return id;}
  });
  window.scrollTo=()=>{};
  for(const dialog of document.querySelectorAll('dialog')){dialog.showModal=()=>{dialog.open=true;};dialog.close=()=>{if(dialog.open){dialog.open=false;dialog.dispatchEvent(new window.Event('close'));}};}
  const variant={value:'russian'},playMode={value:'local'};Object.defineProperty($('start-form'),'elements',{value:{variant,'play-mode':playMode}});
  // The shell is mounted by auth dependencies before the app starts.
  try{
    await import('../public/app.js');
    for(const name of ['russian','russian12','chess','narde','pool8','chapaev','domino','battleship']){
      variant.value=name;$('start-form').onchange();await $('start-form').onsubmit({preventDefault(){}});
      assert.equal($('game-screen').hidden,false,name);
      assert.equal($('status-title').textContent.length>0,true,name);
      assert.equal(document.querySelectorAll('#match-menu').length,1);
      assert.equal($('shot-controls').hidden,name!=='chapaev');
      assert.equal($('flip-button').hidden,['domino','battleship'].includes(name));
      $('match-menu-button').click();assert.equal($('match-menu').hidden,false);
      $('rules-button').click();assert.equal($('rules-dialog').open,true);$('rules-dialog').close();
      if(name==='narde'){
        assert.equal(document.querySelector('.narde-off').hidden,true);
        assert.equal(document.querySelector('.narde-deselect').hidden,true);
        assert.equal(document.querySelector('.narde-roll').hidden,false);
      }
      if(name==='pool8')assert.equal($('pool-shoot').hidden,false);
      if(name==='russian'){
        $('board').querySelector('.available').click();$('board').querySelector('.legal').click();
        assert.equal($('new-button').hidden,false);$('new-button').click();assert.equal($('confirm-dialog').open,true);
        $('confirm-yes').click();assert.equal($('new-button').hidden,true);
        $('resign-button').click();$('confirm-yes').click();assert.equal($('result-dialog').open,true);
        assert.equal($('round-actions').hidden,true);$('result-dialog').close();assert.equal($('round-actions').hidden,false);
        $('rematch-button').click();assert.equal($('round-actions').hidden,true);assert.equal($('resign-button').hidden,false);
      }
      if(name!=='russian'){
        $('match-menu-button').click();$('resign-button').click();assert.equal($('confirm-dialog').open,true,name);
        $('confirm-yes').click();assert.equal($('result-dialog').open,true,name);
        assert.match($('result-text').textContent,/сдались/,name);
        $('result-rematch').click();assert.equal($('resign-button').disabled,false,name);assert.equal($('result-dialog').open,false,name);
      }
      $('home-button').click();assert.equal($('home-screen').hidden,false);
    }
    playMode.value='online';variant.value='chapaev';await $('start-form').onsubmit({preventDefault(){}});
    assert.equal(creations,1);assert.equal($('room-controls').open,true);assert.equal($('resign-button').hidden,true);assert.equal($('shot-controls').hidden,true);
    const snapshot=()=>channel.onmessage({data:JSON.stringify({type:'state',...roomData})});
    roomData.ready=true;roomData.online.black=true;snapshot();assert.equal($('room-controls').open,false);assert.equal($('shot-controls').hidden,false);
    $('chat-tab').click();snapshot();assert.equal($('chat-panel').hidden,false,'incoming states must not switch tabs');
    $('history-tab').click();channel.onmessage({data:JSON.stringify({type:'chat',message:{id:'first',side:'black',name:'Friend',text:'Hello',sentAt:Date.now()}})});
    assert.equal($('chat-unread').textContent,'1');
    roomData.game.turn='black';roomData.game.revision++;snapshot();assert.equal($('shot-controls').hidden,true);
    $('draw-button').click();assert.equal(JSON.parse(channel.lastMessage).type,'draw');
    roomData.drawOffer='white';snapshot();assert.equal($('draw-button').hidden,true);assert.equal($('draw-offer-status').hidden,false);
    // An opponent can move while surrender confirmation is open.
    roomData.drawOffer=null;snapshot();$('match-menu-button').click();$('resign-button').click();
    assert.equal($('confirm-dialog').open,true);assert.equal($('match-menu').hidden,true);
    roomData.game.revision++;roomData.game.turn='white';snapshot();
    $('confirm-yes').click();assert.equal(JSON.parse(channel.lastMessage).type,'resign');
    assert.equal(JSON.parse(channel.lastMessage).revision,roomData.game.revision);
    snapshot(); // Server state clears pending for the following disconnection check.
    channel.close();assert.equal($('resign-button').disabled,true);assert.equal($('chat-input').disabled,true);
    $('home-button').click();$('confirm-yes').click();assert.equal($('home-screen').hidden,false);
  }finally{intervals.forEach(clearInterval);globalThis.setInterval=realInterval;}
});
