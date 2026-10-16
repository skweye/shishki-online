import {test} from 'node:test';
import assert from 'node:assert/strict';
import {parseHTML} from 'linkedom';
import {readFileSync} from 'node:fs';
import {mountAccountShell} from '../public/account-shell.js';
import {progression} from '../public/cases.js';

test('inventory deep link previews the awarded item, filters only owned items and equips without profile navigation',async()=>{
  const {document,window}=parseHTML(readFileSync(new URL('../public/inventory.html',import.meta.url),'utf8'));
  mountAccountShell(document);
  const requests=[],navigations=[];
  let state={user:{id:'player',name:'Player',level:4,pieceSkin:'classic',cueSkin:'classic',shipSkin:'classic',victoryEffect:'none',finishEffect:'none'},owned:['skin-classic','skin-marble'],balance:0,progression:progression(),cases:{},openings:[]};
  Object.assign(globalThis,{document,window,Node:window.Node,NodeFilter:{SHOW_ELEMENT:1,SHOW_TEXT:4},MutationObserver:window.MutationObserver,CustomEvent:window.CustomEvent,
    localStorage:{getItem:()=>null,setItem(){}},matchMedia:()=>({matches:true,addEventListener(){}}),requestAnimationFrame:()=>1,cancelAnimationFrame(){},
    location:{href:'https://game.test/inventory?item=skin-marble',pathname:'/inventory',assign:path=>navigations.push(path)},
    fetch:async(path,options)=>{
      requests.push(path);
      if(path==='/api/auth/shop/equip'){assert.equal(JSON.parse(options.body).item,'skin-marble');state={...state,user:{...state.user,pieceSkin:'marble'}};}
      return {ok:true,json:async()=>path==='/api/auth/me'?{user:state.user}:state};
    }});
  for(const dialog of document.querySelectorAll('dialog')){dialog.showModal=()=>dialog.open=true;dialog.close=()=>dialog.open=false;}
  await import('../public/shop.js');
  const $=id=>document.getElementById(id);
  assert.equal($('preview-dialog').open,true);assert.equal($('preview-title').textContent,'Каррарский мрамор');
  assert.equal($('shop-catalog').children.length,2);assert.equal($('case-dialog'),null);assert.equal($('account-level').textContent,'4');
  $('preview-close').click();assert.equal($('preview-dialog').open,false);
  assert.equal(document.querySelectorAll('.shop-item-actions button[disabled]').length,0);
  const marble=[...document.querySelectorAll('.shop-item')].find(card=>card.textContent.includes('Каррарский мрамор'));
  marble.querySelector('[data-action="equip"]').click();await new Promise(resolve=>setImmediate(resolve));
  assert.ok(requests.includes('/api/auth/shop/equip'));assert.equal(state.user.pieceSkin,'marble');assert.deepEqual(navigations,[]);
  document.querySelector('[data-filter="cue"]').click();assert.equal($('shop-catalog').querySelectorAll('article').length,0);
  assert.match($('shop-catalog').textContent,/нет предметов/);
});
