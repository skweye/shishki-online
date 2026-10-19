import {test} from 'node:test';
import assert from 'node:assert/strict';
import {parseHTML} from 'linkedom';
import {readFileSync} from 'node:fs';
import {createHomeHub} from '../public/home-hub.js';
test('home shows real counters, safe identity, independent stats and rewards; stale accounts never leak',async()=>{
  const {document,window}=parseHTML(readFileSync(new URL('../public/index.html',import.meta.url),'utf8'));
  Object.assign(globalThis,{document,window,CustomEvent:window.CustomEvent});const $=id=>document.getElementById(id);
  const user={id:'a',name:'<img onerror=alert(1)>',level:14};
  globalThis.fetch=async path=>({ok:true,json:async()=>path.endsWith('account')?{modes:[{played:4,wins:2},{played:6,wins:3}]}:{balance:900,progression:{level:14,current:200,required:850},cases:{standard:1}}});
  const hub=createHomeHub();await hub.update(user);
  assert.equal($('hub-name').textContent,user.name);assert.equal($('hub-name').children.length,0);
  assert.equal($('hub-played').textContent,'10');assert.equal($('hub-wins').textContent,'5');assert.equal($('hub-coins').textContent,'900');
  assert.equal($('hub-level').classList.contains('has-reward'),true);assert.equal($('hub-xp').value,200);assert.equal($('hub-xp').max,850);
  document.dispatchEvent(new window.CustomEvent('presencechange',{detail:{online:37,searching:4}}));assert.equal($('home-online').textContent,'37');
  document.dispatchEvent(new window.CustomEvent('presencechange',{detail:null}));assert.equal($('home-online').textContent,'—');
  // Resolve both requests after switching to a guest, including fetch implementations that ignore abort.
  const requests=[];globalThis.fetch=()=>new Promise(resolve=>requests.push(resolve));const waiting=hub.update(user);
  await hub.update(null);requests.forEach(resolve=>resolve({ok:true,json:async()=>({modes:[{played:999,wins:999}]})}));await waiting;
  assert.equal($('hub-stats').hidden,true);assert.equal($('hub-name').textContent,'Гость');assert.equal($('hub-played').textContent,'—');
});
