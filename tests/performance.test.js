import {test} from 'node:test';
import assert from 'node:assert/strict';
import {parseHTML} from 'linkedom';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import {initPerformance,PERFORMANCE_KEY} from '../public/performance.js';
import {mountAccountShell} from '../public/account-shell.js';

test('performance setting persists, restores across pages and remains usable without storage',()=>{
  const store=new Map(),storage={getItem:key=>store.get(key),setItem:(key,value)=>store.set(key,value)};
  for(const page of ['index','profile','shop']){
    const {document,window}=parseHTML(readFileSync(new URL('../public/'+page+'.html',import.meta.url),'utf8'));
    mountAccountShell(document);
    const original=globalThis.Event;globalThis.Event=window.Event;
    try{
      let events=0;document.addEventListener('performancechange',()=>events++);
      const control=initPerformance(document,storage),input=document.getElementById('low-performance');
      assert.ok(input);assert.equal(input.checked,page!=='index');
      input.checked=true;input.onchange();assert.equal(store.get(PERFORMANCE_KEY),'true');assert.equal(document.documentElement.dataset.lowPerformance,'true');
      control.apply(false);assert.equal(input.checked,false);assert.equal(document.documentElement.dataset.lowPerformance,'false');assert.equal(events,3);
      initPerformance(document,{getItem(){throw Error('blocked');},setItem(){throw Error('blocked');}});
      input.checked=true;assert.doesNotThrow(()=>input.onchange());assert.equal(document.documentElement.dataset.lowPerformance,'true');
    }finally{globalThis.Event=original;}
  }
});

test('saved low performance is applied before page rendering by the theme bootstrap',()=>{
  const {document,window}=parseHTML('<html><head></head><body></body></html>');
  runInNewContext(readFileSync(new URL('../public/theme.js',import.meta.url),'utf8'),{document,Event:window.Event,localStorage:{getItem:key=>key===PERFORMANCE_KEY?'true':null}});
  assert.equal(document.documentElement.dataset.lowPerformance,'true');assert.equal(document.documentElement.dataset.theme,'mocha');
});
