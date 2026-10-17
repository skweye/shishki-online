import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {openChromium,browserPath} from './helpers/chromium.js';
const base=process.env.TEST_BASE_URL||'http://127.0.0.1:8787';
test('inventory sells an earned item through confirmation and renders all premium card decks',{skip:!browserPath,timeout:45000},async()=>{
  const browser=await openChromium(),{cdp,evaluate}=browser,email=`sale-ui-${crypto.randomUUID()}@example.invalid`,password='Local-Sale-Test-2026!a';let registered=false;
  try{
    await cdp('Emulation.setDeviceMetricsOverride',{width:1366,height:1100,deviceScaleFactor:1,mobile:false});await cdp('Page.navigate',{url:base+'/inventory'});
    await evaluate(`new Promise((resolve,reject)=>{let n=0;const timer=setInterval(()=>{if(document.querySelector('#shop-retry')?.onclick){clearInterval(timer);resolve(true)}else if(++n>200){clearInterval(timer);reject(Error('Inventory not loaded'))}},30)})`);
    const setup=await evaluate(`(async()=>{const post=async(path,body)=>{const r=await fetch('/api/auth/'+path,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});if(!r.ok)throw Error(await r.text());return r.json();};await post('register',{name:'Sale browser test',email:${JSON.stringify(email)},password:${JSON.stringify(password)},confirmPassword:${JSON.stringify(password)}});const box=await post('shop/open',{caseId:'standard',source:'coins',requestId:crypto.randomUUID()});const {itemById,saleValue}=await import('/shop-catalog.js');return {id:box.opening.itemId,credit:saleValue(itemById(box.opening.itemId))};})()`);registered=true;
    await cdp('Page.navigate',{url:base+'/inventory'});
    await evaluate(`new Promise((resolve,reject)=>{let n=0;const timer=setInterval(()=>{if(document.querySelector('[data-action="sell"]')){clearInterval(timer);resolve(true)}else if(++n>200){clearInterval(timer);reject(Error('No sale action'))}},30)})`);
    await evaluate(`document.querySelector('[data-action="sell"]').click()`);
    assert.equal(await evaluate(`document.querySelector('#sell-dialog').open`),true);assert.equal(await evaluate(`document.querySelector('#sell-value').textContent`),'+'+setup.credit+' ◈');
    await mkdir('test-results/durak',{recursive:true});let shot=await cdp('Page.captureScreenshot',{format:'png'});await writeFile('test-results/durak/sale-confirm.png',Buffer.from(shot.data,'base64'));
    await evaluate(`document.querySelector('#sell-confirm').click()`);
    await evaluate(`new Promise((resolve,reject)=>{let n=0;const timer=setInterval(()=>{if(!document.querySelector('#sell-dialog').open){clearInterval(timer);resolve(true)}else if(++n>200){clearInterval(timer);reject(Error(document.querySelector('#sell-error').textContent))}},30)})`);
    assert.equal(await evaluate(`Number(document.querySelector('#coin-balance').textContent)`),setup.credit);assert.equal(await evaluate(`document.querySelectorAll('[data-action="sell"]').length`),0);
    await evaluate(`(async()=>{const {cardPreview}=await import('/card-art.js');const {CATALOG}=await import('/shop-catalog.js');const root=document.querySelector('#shop-catalog');root.replaceChildren(...CATALOG.filter(i=>i.type==='card'&&i.price).map(item=>{const el=document.createElement('article');el.className='shop-item';const art=document.createElement('div');art.className='shop-art';art.innerHTML=cardPreview(item.value);const title=document.createElement('h3');title.textContent=item.name;el.append(art,title);return el;}));root.scrollIntoView({block:'center'});})()`);
    shot=await cdp('Page.captureScreenshot',{format:'png'});await writeFile('test-results/durak/premium-decks.png',Buffer.from(shot.data,'base64'));
    assert.equal(await evaluate(`document.querySelectorAll('.card-preview svg').length`),9);assert.deepEqual(browser.errors,[]);
  }finally{
    try{if(registered)await evaluate(`fetch('/api/auth/delete-account',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:${JSON.stringify(email)},password:${JSON.stringify(password)},confirmation:'DELETE'})}).then(r=>r.status)`);
    }finally{await browser.close();}
  }
});
