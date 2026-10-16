import {test} from 'node:test';
import assert from 'node:assert/strict';
import {parseHTML} from 'linkedom';
import {readFileSync} from 'node:fs';
import {createCaseShop} from '../public/case-shop.js';
import {progression} from '../public/cases.js';

function setup(storage=new Map()){
  const {document,window}=parseHTML(readFileSync(new URL('../public/shop.html',import.meta.url),'utf8'));
  Object.assign(globalThis,{document,window,localStorage:{getItem:key=>storage.get(key)||null,setItem:(key,value)=>storage.set(key,value),removeItem:key=>storage.delete(key)},matchMedia:()=>({matches:true})});
  const dialog=document.getElementById('case-dialog');dialog.showModal=()=>{dialog.open=true;};dialog.close=()=>{dialog.open=false;};
  return {document,window,storage,$:id=>document.getElementById(id)};
}
const account=()=>({user:{id:'player'},balance:100,cases:{standard:0,premium:0,royal:0},progression:progression(),openings:[],owned:['skin-classic']});

test('case UI discloses odds before confirming and retries the same request after a lost response',async()=>{
  const {$,storage}=setup();let state=account(),calls=[],viewed;
  const opening={requestId:'fixed',caseId:'standard',itemId:'skin-marble',rarity:'epic',duplicate:false,compensation:0};
  const component=createCaseShop({getState:()=>state,update:next=>{state=next;},preview:item=>{viewed=item.id;},request:async(path,body)=>{
    calls.push({path,body:structuredClone(body)});if(calls.length===1)throw new Error('Network timeout');
    return {...state,balance:0,owned:[...state.owned,'skin-marble'],opening,openings:[opening]};
  }});
  component.render();assert.equal($('case-catalog').querySelectorAll('article').length,3);
  $('case-catalog').querySelector('button').click();assert.equal(calls.length,0);assert.equal($('case-dialog').open,true);
  assert.match($('case-odds').textContent,/Легендарный 1%/);assert.match($('case-contents').textContent,/Кий · Северное сияние/);assert.match($('case-cost').textContent,/100/);
  await $('case-confirm').onclick();assert.equal(calls.length,1);assert.equal(storage.size,1);assert.match($('case-error').textContent,/timeout/);
  await $('case-confirm').onclick();assert.equal(calls.length,2);assert.deepEqual(calls[0],calls[1]);assert.equal(storage.size,0);
  assert.equal(state.balance,0);assert.match($('case-result').textContent,/Каррарский мрамор/);assert.equal($('case-confirm').hidden,true);
  assert.equal($('case-prize').querySelectorAll('.piece').length,2);$('case-preview').click();assert.equal(viewed,'skin-marble');
});

test('pending requests restore after reload, reward cases cost no coins and low balances cannot buy cases',async()=>{
  const old={caseId:'standard',source:'coins',requestId:'persisted-request-0001'};
  const {$}=setup(new Map([['shishki-case-pending-player',JSON.stringify(old)]]));let state=account(),sent;
  const component=createCaseShop({getState:()=>state,update:next=>{state=next;},preview(){},request:async(path,body)=>{sent=body;throw Object.assign(new Error('Insufficient funds'),{status:409});}});
  component.render();assert.equal($('case-dialog').open,true);assert.match($('case-error').textContent,/незавершённый/);
  await $('case-confirm').onclick();assert.deepEqual(sent,old);$('case-close').click();
  state={...state,balance:0,cases:{standard:1,premium:0,royal:0},progression:progression(1800)};component.render();
  const buttons=$('case-catalog').querySelectorAll('button');assert.equal(buttons[0].disabled,false);assert.equal(buttons[1].disabled,true);
  buttons[0].click();assert.match($('case-cost').textContent,/бесплатно/);assert.match($('level-progress').textContent,/Уровень 10/);
  await $('case-confirm').onclick();assert.equal(sent.source,'reward');
});
