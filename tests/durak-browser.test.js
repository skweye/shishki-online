import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {browserPath,openChromium} from './helpers/chromium.js';
const base=process.env.TEST_BASE_URL||'http://127.0.0.1:8787';
// Requires the local Wrangler server; never controls the user's browser or cursor.
test('live cards animate under CSP, fit mobile/desktop, and stop for reduced motion',{skip:!browserPath,timeout:60000},async()=>{
  const browser=await openChromium(),{cdp,evaluate}=browser;
  try{
    await cdp('Emulation.setDeviceMetricsOverride',{width:1366,height:1100,deviceScaleFactor:1,mobile:false});
    await cdp('Page.navigate',{url:base});
    await evaluate(`new Promise((resolve,reject)=>{let n=0;const timer=setInterval(()=>{if(document.querySelector('#start-form')?.onsubmit){clearInterval(timer);resolve(true)}else if(++n>200){clearInterval(timer);reject(Error('App did not start'))}},30)})`);
    await evaluate(`(async()=>{const {newDurak}=await import('/durak.js');const hand=[0,9,18,27,5,7,1,10,19,28,4,8];const deck=[...hand,...Array.from({length:36},(_,i)=>i).filter(i=>!hand.includes(i))];const game=newDurak('durak-transfer',deck);game.attacker='white';game.defender='black';game.turn='white';localStorage.setItem('shashki-local-durak-transfer-v1',JSON.stringify(game));})()`);
    await cdp('Page.reload');
    await evaluate(`new Promise((resolve,reject)=>{let n=0;const timer=setInterval(()=>{if(document.querySelector('#start-form')?.onsubmit){clearInterval(timer);resolve(true)}else if(++n>200){clearInterval(timer);reject(Error('App did not restart'))}},30)})`);
    await evaluate(`(async()=>{const f=document.querySelector('#start-form');f.querySelector('[value="durak-transfer"]').checked=true;f.querySelector('[value="local"]').checked=true;f.onchange();await f.onsubmit({preventDefault(){}});document.querySelector('#durak-board [data-control="reveal"]').click();})()`);
    assert.equal(await evaluate(`document.querySelector('#durak-board').hidden`),false);
    assert.equal(await evaluate(`document.querySelectorAll('#durak-board [data-card]').length`),6);
    await evaluate(`document.querySelector('#durak-board [data-card="0"]').click();document.querySelector('#durak-board [data-action="durak-attack"]').click()`);
    assert.equal(await evaluate(`document.querySelectorAll('#durak-board [data-card]').length`),0,'turn change hides local hand');
    assert.ok(await evaluate(`document.querySelector('[data-table-card="0"]').getAnimations().length`),'played card animates');
    await evaluate(`new Promise(r=>setTimeout(r,360))`);
    assert.equal(await evaluate(`document.querySelectorAll('#durak-board .durak-clear').length`),0);
    await evaluate(`document.querySelector('#durak-board [data-control="reveal"]').click();document.querySelector('#durak-board [data-card="1"]').click();document.querySelector('#durak-board [data-target="0"]').click()`);
    assert.ok(await evaluate(`document.querySelector('[data-table-card="1"]').getAnimations().length`),'cover animates');
    await evaluate(`new Promise(r=>setTimeout(r,350))`);
    await mkdir('test-results/durak',{recursive:true});
    for(const width of [1366,390]){
      await cdp('Emulation.setDeviceMetricsOverride',{width,height:1100,deviceScaleFactor:1,mobile:false});
      await evaluate(`document.querySelector('#durak-board').scrollIntoView({block:'center'})`);
      const geometry=await evaluate(`(()=>{const root=document.querySelector('#durak-board'),r=root.getBoundingClientRect();return {overflow:document.documentElement.scrollWidth>innerWidth+1,cards:[...root.querySelectorAll('.durak-table .durak-card')].map(el=>{const b=el.getBoundingClientRect();return {width:b.width,height:b.height,inside:b.left>=r.left&&b.right<=r.right}})}})()`);
      assert.equal(geometry.overflow,false,width+'px overflow');for(const card of geometry.cards){assert.ok(card.inside);assert.ok(Math.abs(card.width/card.height-5/7)<.02);}
      const shot=await cdp('Page.captureScreenshot',{format:'png'});await writeFile(`test-results/durak/game-${width}.png`,Buffer.from(shot.data,'base64'));
    }
    await evaluate(`document.querySelector('#durak-board [data-control="reveal"]').click();document.querySelector('#durak-board [data-action="durak-finish"]').click()`);
    assert.equal(await evaluate(`document.querySelectorAll('#durak-board .durak-clear').length`),1,'discard has animated outgoing cards');
    await evaluate(`new Promise(r=>setTimeout(r,400))`);assert.equal(await evaluate(`document.querySelectorAll('#durak-board .durak-clear').length`),0,'discard cleans up');
    await cdp('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'reduce'}]});
    await evaluate(`document.querySelector('#durak-board [data-control="reveal"]').click();document.querySelector('#durak-board [data-card]:not(:disabled)').click();document.querySelector('#durak-board [data-action="durak-attack"]').click()`);
    assert.equal(await evaluate(`document.querySelector('#durak-board').getAnimations({subtree:true}).length`),0);
    assert.deepEqual(browser.errors,[],'no runtime or CSP errors');
  }finally{await browser.close();}
});
