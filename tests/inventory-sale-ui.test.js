import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {parseHTML} from 'linkedom';
import {createInventorySale} from '../public/inventory-sale.js';
import {itemById} from '../public/shop-catalog.js';
test('sale confirms price, retries identical request after lost response, restores after reload and plays one success sound',async()=>{
  const {document,window}=parseHTML(readFileSync(new URL('../public/inventory.html',import.meta.url),'utf8'));
  const storage=new Map(),calls=[],sounds=[],notices=[],busy=[];let state={user:{id:'p'},sellable:['card-koi'],owned:['card-koi'],balance:10},attempt=0;
  Object.assign(globalThis,{document,window,CustomEvent:window.CustomEvent,localStorage:{getItem:k=>storage.get(k),setItem:(k,v)=>storage.set(k,v),removeItem:k=>storage.delete(k)}});
  for(const dialog of document.querySelectorAll('dialog')){dialog.showModal=()=>dialog.open=true;dialog.close=()=>dialog.open=false;}
  document.addEventListener('actionsound',e=>sounds.push(e.detail));
  const options={getState:()=>state,update:value=>{state=value;},setBusy:value=>busy.push(value),notice:value=>notices.push(value),request:async(path,data)=>{calls.push({...data});if(attempt++===0)throw Error('offline');return {user:{id:'p'},owned:[],sellable:[],balance:310,sale:{credit:300}};}};
  const flow=createInventorySale(options),$=id=>document.getElementById(id);flow.open(itemById('card-koi'));assert.equal($('sell-value').textContent,'+300 ◈');assert.equal(calls.length,0);
  await $('sell-confirm').onclick();assert.equal(storage.size,1);assert.equal($('sell-dialog').open,true);assert.match($('sell-error').textContent,/offline/);
  $('sell-close').click();const restored=createInventorySale(options);restored.restore();assert.equal($('sell-dialog').open,true);await $('sell-confirm').onclick();
  assert.deepEqual(calls[0],calls[1]);assert.equal(storage.size,0);assert.equal($('sell-dialog').open,false);assert.equal(state.balance,310);assert.equal(sounds.filter(s=>s==='sell').length,1);assert.match(notices[0],/300/);assert.deepEqual(busy,[true,false,true,false]);
});
