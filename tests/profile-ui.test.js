import {test} from 'node:test';
import assert from 'node:assert/strict';
import {parseHTML} from 'linkedom';
import {readFileSync,readdirSync} from 'node:fs';
import {mountAccountShell} from '../public/account-shell.js';
import {progression,levelThreshold} from '../public/cases.js';

const read=file=>readFileSync(new URL('../public/'+file,import.meta.url),'utf8');

test('profile level claims free rewards in place, retries safely and survives nickname edits',async()=>{
  const {document,window}=parseHTML(read('profile.html'));
  mountAccountShell(document);
  const $=id=>document.getElementById(id),store=new Map(),sent=[],navigations=[];
  let user={id:'player',name:'Player',email:'test@example.invalid',avatar:null,createdAt:1700000000,level:20,isAdmin:true,googleLinked:true};
  let state={user,balance:100,fullAccess:true,owned:['skin-classic'],progression:progression(levelThreshold(20)+150),cases:{standard:1,premium:1,royal:0},openings:[]};
  Object.assign(globalThis,{document,window,Node:window.Node,NodeFilter:{SHOW_ELEMENT:1,SHOW_TEXT:4},MutationObserver:window.MutationObserver,CustomEvent:window.CustomEvent,
    localStorage:{getItem:key=>store.get(key)||null,setItem:(key,value)=>store.set(key,value),removeItem:key=>store.delete(key)},matchMedia:()=>({matches:true,addEventListener(){}}),
    location:{href:'https://game.test/profile',pathname:'/profile',assign:path=>navigations.push(path)},
    fetch:async(path,options)=>{
      if(path==='/api/auth/account')return {ok:true,json:async()=>({user,shop:state,modes:[],recent:[],googleEnabled:true})};
      if(path==='/api/auth/profile')user={...user,name:JSON.parse(options.body).name};
      if(path==='/api/auth/shop/open'){
        const body=JSON.parse(options.body);sent.push(body);
        if(sent.length===1)throw new Error('Network timeout');
        assert.equal(body.source,'reward'); // Full access must not consume an access case instead.
        const opening={...body,itemId:'skin-marble',rarity:'epic',duplicate:false,compensation:0};
        state={...state,user,cases:{...state.cases,[body.caseId]:state.cases[body.caseId]-1},opening,openings:[opening]};
        return {ok:true,json:async()=>state};
      }
      return {ok:true,json:async()=>({user,googleEnabled:true})};
    }});
  for(const dialog of document.querySelectorAll('dialog')){dialog.showModal=()=>dialog.open=true;dialog.close=()=>dialog.open=false;}
  await import('../public/profile-page.js');
  assert.equal($('account-content').hidden,false);assert.equal($('hero-name').textContent,'Player');
  assert.equal($('hero-level').dataset.reward,'true');assert.match($('hero-level').textContent,/Забрать награду · 2/);
  assert.equal($('hero-level').querySelector('progress').value,150);assert.equal($('hero-level').querySelector('progress').max,1150);
  $('nickname').value='New nickname';await $('edit-profile').onsubmit({preventDefault(){}});
  assert.equal($('hero-name').textContent,'New nickname');assert.equal($('hero-level').querySelector('progress').value,150);
  $('hero-level').click();assert.equal($('case-dialog').open,true);assert.match($('case-cost').textContent,/Награда за уровень/);
  await $('case-confirm').onclick();assert.match($('case-error').textContent,/Network timeout/);
  $('case-close').click();$('hero-level').click();assert.match($('case-error').textContent,/незавершённый/);
  await $('case-confirm').onclick();assert.deepEqual(sent[0],sent[1]);assert.equal(store.size,0);
  assert.equal(state.balance,100);assert.match($('hero-level').textContent,/Забрать награду · 1/);
  assert.equal($('case-prize').querySelectorAll('.piece').length,2);
  $('case-preview').click();assert.deepEqual(navigations,['/inventory?item=skin-marble']);
  $('hero-level').click();assert.equal($('case-title').textContent,'Кейс мастера');await $('case-confirm').onclick();
  assert.equal(sent.at(-1).caseId,'premium');assert.equal($('hero-level').disabled,true);assert.equal($('hero-level').dataset.reward,'false');
  assert.match($('hero-level').textContent,/Кейс на уровне 30/);assert.equal(state.balance,100);
  assert.equal($('level-progress'),null);assert.equal($('admin-link'),null);assert.equal($('sign-out'),null);
  const {t}=await import('../public/i18n.js');
  for(const text of ['Забрать награду','Кейс на уровне'])for(const locale of ['en','uk'])assert.notEqual(t(text,locale),text);
});

test('secondary pages use the account menu instead of duplicate navigation and experience panels',()=>{
  for(const file of readdirSync(new URL('../public/',import.meta.url)).filter(file=>file.endsWith('.html'))){
    const {document}=parseHTML(read(file));mountAccountShell(document);
    assert.equal(document.querySelector('#level-progress,.inventory-banner,.collection-navigation,.back-link,a.back'),null,file);
    for(const link of document.querySelectorAll('footer a'))assert.ok(!['/','/profile','/admin','/inventory','/shop'].includes(link.getAttribute('href')),file);
    assert.ok(document.querySelector('.site-header #menu-home'),file);
    assert.ok(document.querySelector('.site-header #menu-inventory'),file);
  }
});
