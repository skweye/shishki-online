import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {browserPath,openChromium} from './helpers/chromium.js';
const base=process.env.TEST_BASE_URL||'http://127.0.0.1:8787';
// Requires the local Wrangler server; never controls the user's browser or cursor.
test('live cards animate under CSP, fit mobile/desktop, and stop for reduced motion',{skip:!browserPath,timeout:60000},async()=>{
  const browser=await openChromium(),{cdp,evaluate}=browser;
  try{
    await cdp('Emulation.setDeviceMetricsOverride',{width:1366,height:1400,deviceScaleFactor:1,mobile:false});
    await cdp('Page.navigate',{url:base});
    await evaluate(`new Promise((resolve,reject)=>{let n=0;const timer=setInterval(()=>{if(document.querySelector('#start-form')?.onsubmit){clearInterval(timer);resolve(true)}else if(++n>200){clearInterval(timer);reject(Error('App did not start'))}},30)})`);
    await evaluate(`(async()=>{const {newDurak}=await import('/durak.js');const hand=[0,9,18,27,5,7,1,10,19,28,4,8];const deck=[...hand,...Array.from({length:36},(_,i)=>i).filter(i=>!hand.includes(i))];const game=newDurak('durak-transfer',deck);game.attacker='white';game.defender='black';game.turn='white';localStorage.setItem('shashki-local-durak-transfer-v1',JSON.stringify(game));})()`);
    await cdp('Page.reload');
    await evaluate(`new Promise((resolve,reject)=>{let n=0;const timer=setInterval(()=>{if(document.querySelector('#start-form')?.onsubmit){clearInterval(timer);resolve(true)}else if(++n>200){clearInterval(timer);reject(Error('App did not restart'))}},30)})`);
    await evaluate(`(async()=>{const f=document.querySelector('#start-form');f.querySelector('[value="durak-transfer"]').checked=true;f.querySelector('[value="local"]').checked=true;f.onchange();await f.onsubmit({preventDefault(){}});document.querySelector('#durak-board [data-control="reveal"]').click();})()`);
    assert.equal(await evaluate(`document.querySelector('#durak-board').hidden`),false);
    assert.equal(await evaluate(`document.querySelectorAll('#durak-board [data-card]').length`),6);
    await evaluate(`new Promise(r=>setTimeout(r,260))`);
    const tap=await evaluate(`(()=>{const r=document.querySelector('#durak-board [data-card="0"]').getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2}})()`);
    await cdp('Input.dispatchMouseEvent',{type:'mousePressed',button:'left',clickCount:1,...tap});
    await cdp('Input.dispatchMouseEvent',{type:'mouseReleased',button:'left',clickCount:1,...tap});
    assert.equal(await evaluate(`document.querySelector('#durak-board [data-card="0"]').getAttribute('aria-pressed')`),'true','real mouse click still selects a card');
    async function dragCard(card, target, touch=false) {
      await evaluate(`document.querySelector('#durak-board').scrollIntoView({block:'center'})`);
      const origin=await evaluate(`(()=>{const r=document.querySelector('#durak-board [data-card="${card}"]').getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2}})()`);
      if(touch)await cdp('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[origin]});
      else {await cdp('Input.dispatchMouseEvent',{type:'mouseMoved',...origin});await cdp('Input.dispatchMouseEvent',{type:'mousePressed',button:'left',clickCount:1,...origin});}
      const move={x:origin.x,y:origin.y-35};
      if(touch)await cdp('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[move]});
      else await cdp('Input.dispatchMouseEvent',{type:'mouseMoved',buttons:1,...move});
      assert.equal(await evaluate(`document.querySelectorAll('.durak-drag-ghost').length`),1,'drag has a ghost');
      const destination=await evaluate(`(()=>{const r=document.querySelector(${JSON.stringify(target)}).getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2}})()`);
      if(touch){await cdp('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[destination]});await cdp('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});}
      else {await cdp('Input.dispatchMouseEvent',{type:'mouseMoved',buttons:1,...destination});await cdp('Input.dispatchMouseEvent',{type:'mouseReleased',button:'left',clickCount:1,...destination});}
      assert.equal(await evaluate(`document.querySelectorAll('.durak-drag-ghost').length`),0,'drag cleans up');
    }
    await dragCard(0,'#durak-board .durak-drop-play');
    assert.equal(await evaluate(`document.querySelectorAll('#durak-board [data-card]').length`),0,'turn change hides local hand');
    assert.ok(await evaluate(`document.querySelector('[data-table-card="0"]').getAnimations().length`),'played card animates');
    await evaluate(`new Promise(r=>setTimeout(r,420))`);
    assert.equal(await evaluate(`document.querySelectorAll('#durak-board .durak-flight').length`),0);
    await evaluate(`document.querySelector('#durak-board [data-control="reveal"]').click()`);
    await dragCard(1,'#durak-board .durak-stock');
    assert.equal(await evaluate(`document.querySelectorAll('#durak-board [data-card]').length`),6,'invalid drop keeps the hand');
    await dragCard(1,'#durak-board [data-target="0"]',true);
    assert.ok(await evaluate(`document.querySelector('[data-table-card="1"]').getAnimations().length`),'cover animates');
    await evaluate(`new Promise(r=>setTimeout(r,420))`);
    await mkdir('test-results/durak',{recursive:true});
    for(const width of [1366,800,390,320]){
      await cdp('Emulation.setDeviceMetricsOverride',{width,height:1100,deviceScaleFactor:1,mobile:false});
      await evaluate(`document.querySelector('#durak-board').scrollIntoView({block:'center'})`);
      const geometry=await evaluate(`(()=>{const root=document.querySelector('#durak-board'),r=root.getBoundingClientRect();return {overflow:document.documentElement.scrollWidth>innerWidth+1,cards:[...root.querySelectorAll('.durak-table .durak-card')].map(el=>{const b=el.getBoundingClientRect();return {width:b.width,height:b.height,inside:b.left>=r.left&&b.right<=r.right}})}})()`);
      assert.equal(geometry.overflow,false,width+'px overflow');for(const card of geometry.cards){assert.ok(card.inside);assert.ok(Math.abs(card.width/card.height-5/7)<.02);}
      const stock=await evaluate(`(()=>{const root=document.querySelector('#durak-board'),arena=root.querySelector('.durak-arena').getBoundingClientRect(),face=root.querySelector('[data-trump-card]').getBoundingClientRect(),back=root.querySelector('[data-deck-card]').getBoundingClientRect();return {height:arena.height,visible:(face.right-Math.max(face.left,back.right))/face.width,inside:face.left>=arena.left&&face.right<=arena.right,label:root.querySelector('.durak-trump-label').textContent}})()`);
      assert.ok(stock.height>=350,'larger table');assert.ok(stock.visible>.7,'at least 70% of trump face remains visible');assert.ok(stock.inside,'trump stays inside frame');assert.match(stock.label,/A♠/);
      const shot=await cdp('Page.captureScreenshot',{format:'png'});await writeFile(`test-results/durak/game-${width}.png`,Buffer.from(shot.data,'base64'));
    }
    await evaluate(`document.querySelector('#durak-board [data-control="reveal"]').click();document.querySelector('#durak-board [data-action="durak-finish"]').click()`);
    assert.equal(await evaluate(`document.querySelectorAll('#durak-board [data-flight="discard"]').length`),2,'each discarded card has its own flight');
    assert.equal(await evaluate(`document.querySelectorAll('#durak-board [data-flight="draw"]').length`),2,'each player draws one replacement card');
    assert.equal(await evaluate(`document.querySelectorAll('#durak-board [data-flight="draw"] .card-back').length`),2,'local handoff never reveals drawn cards');
    await evaluate(`new Promise(r=>setTimeout(r,1100))`);assert.equal(await evaluate(`document.querySelectorAll('#durak-board .durak-flight').length`),0,'discard and draw clean up');
    assert.equal(await evaluate(`document.querySelectorAll('#durak-board .durak-motion-hidden').length`),0,'final cards are visible');
    await cdp('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'reduce'}]});
    await evaluate(`document.querySelector('#durak-board [data-control="reveal"]').click()`);
    const nextCard=await evaluate(`Number(document.querySelector('#durak-board [data-card]:not(:disabled)').dataset.card)`);
    await dragCard(nextCard,'#durak-board .durak-drop-play',true);
    assert.equal(await evaluate(`document.querySelectorAll('#durak-board [data-card]').length`),0,'touch drag also works on a 320px screen');
    assert.equal(await evaluate(`document.querySelector('#durak-board').getAnimations({subtree:true}).length`),0);
    assert.deepEqual(browser.errors,[],'no runtime or CSP errors');
  }finally{await browser.close();}
});

test('the last cards finish flying before the result, and a rematch deals twelve private cards',{skip:!browserPath,timeout:30000},async()=>{
  const browser=await openChromium(),{cdp,evaluate}=browser;
  const ready=()=>evaluate(`new Promise((resolve,reject)=>{let n=0;const timer=setInterval(()=>{if(document.querySelector('#start-form')?.onsubmit){clearInterval(timer);resolve()}else if(++n>150){clearInterval(timer);reject(Error('App did not start'))}},30)})`);
  try{
    await cdp('Emulation.setDeviceMetricsOverride',{width:1366,height:1400,deviceScaleFactor:1,mobile:false});
    await cdp('Page.navigate',{url:base});await ready();
    await evaluate(`(async()=>{const {newDurak}=await import('/durak.js');const game=newDurak('durak-simple');Object.assign(game,{hands:{white:[0],black:[1]},stock:[],discard:Array.from({length:34},(_,i)=>i+2),trump:35,attacker:'white',defender:'black',turn:'white'});localStorage.setItem('shashki-local-durak-simple-v1',JSON.stringify(game));})()`);
    await cdp('Page.reload');await ready();
    await evaluate(`(async()=>{const f=document.querySelector('#start-form');f.querySelector('[value="durak-simple"]').checked=true;f.querySelector('[value="local"]').checked=true;f.onchange();await f.onsubmit({preventDefault(){}});})()`);
    assert.equal(await evaluate(`document.querySelectorAll('[data-flight="deal"]').length`),0,'restoring a saved deal does not replay it');
    await evaluate(`document.querySelector('#durak-board [data-control="reveal"]').click();document.querySelector('#durak-board [data-card="0"]').click();document.querySelector('#durak-board [data-action="durak-attack"]').click()`);
    await evaluate(`new Promise(r=>setTimeout(r,420))`);
    await evaluate(`document.querySelector('#durak-board [data-control="reveal"]').click();document.querySelector('#durak-board [data-card="1"]').click();document.querySelector('#durak-board [data-target="0"]').click()`);
    await evaluate(`new Promise(r=>setTimeout(r,420))`);
    await evaluate(`document.querySelector('#durak-board [data-control="reveal"]').click();document.querySelector('#durak-board [data-action="durak-finish"]').click()`);
    assert.equal(await evaluate(`document.querySelectorAll('[data-flight="discard"]').length`),2);
    assert.equal(await evaluate(`document.querySelector('#result-dialog').open`),false,'result waits for the table to clear');
    await evaluate(`new Promise(r=>setTimeout(r,650))`);
    assert.equal(await evaluate(`document.querySelector('#result-dialog').open`),true);
    await evaluate(`document.querySelector('#result-rematch').click()`);
    assert.equal(await evaluate(`document.querySelectorAll('[data-flight="deal"]').length`),12);
    assert.equal(await evaluate(`document.querySelectorAll('[data-flight="deal"] .card-back').length`),12);
    const shot=await cdp('Page.captureScreenshot',{format:'png'});await mkdir('test-results/durak',{recursive:true});await writeFile('test-results/durak/dealing.png',Buffer.from(shot.data,'base64'));
    await evaluate(`new Promise(r=>setTimeout(r,1250))`);
    assert.equal(await evaluate(`document.querySelectorAll('.durak-flight,.durak-motion-hidden').length`),0);
    assert.equal(await evaluate(`document.querySelectorAll('#durak-board [data-card]').length`),0,'hand stays closed after dealing');
    assert.deepEqual(browser.errors,[]);
  }finally{await browser.close();}
});

test('both online perspectives animate transfers, taking and drawing without revealing the opponent hand',{skip:!browserPath,timeout:30000},async()=>{
  const browser=await openChromium(),{cdp,evaluate}=browser;
  try{
    await cdp('Emulation.setDeviceMetricsOverride',{width:1366,height:1400,deviceScaleFactor:1,mobile:false});
    await cdp('Page.navigate',{url:base});
    await evaluate(`new Promise((resolve,reject)=>{let n=0;const timer=setInterval(()=>{if(document.querySelector('#start-form')?.onsubmit){clearInterval(timer);resolve()}else if(++n>150){clearInterval(timer);reject(Error('App did not start'))}},30)})`);
    await evaluate(`(async()=>{
      const {newDurak,actDurak,durakView}=await import('/durak.js'),{createDurakBoard}=await import('/durak-board.js');
      const host=document.createElement('div');host.id='motion-test';host.style.cssText='display:flex;gap:12px;position:absolute;top:0;left:0;background:var(--theme-bg);z-index:2000;width:1300px';document.body.append(host);
      let game=newDurak('durak-transfer',Array.from({length:36},(_,i)=>i));const sounds=[];
      const views=['white','black'].map(role=>{const root=document.createElement('div');root.id='motion-'+role;root.style.cssText='position:relative;width:640px';host.append(root);return {root,role,board:createDurakBoard(root,()=>{},(kind,delay)=>{sounds.push({role,kind,delay});return ()=>{};})};});
      const render=live=>views.forEach(({board,role})=>board.render(durakView(game,role),{mode:'online',roomCode:'one',role,enabled:game.turn===role,live,skins:{white:'astral',black:'koi'}}));render(false);
      window.cardMotionTest={sounds,advance(action,live=true){game=actDurak(game,game.turn,action);render(live);},repeat(){render(true);}};
    })()`);
    await evaluate(`cardMotionTest.advance({type:'durak-attack',card:0})`);
    await evaluate(`new Promise(r=>setTimeout(r,420))`);
    await evaluate(`cardMotionTest.advance({type:'durak-transfer',card:9})`);
    assert.equal(await evaluate(`['white','black'].every(role=>document.querySelector('#motion-'+role+' [data-table-card="9"]').getAnimations().length>0)`),true);
    await evaluate(`new Promise(r=>setTimeout(r,420))`);
    await evaluate(`cardMotionTest.advance({type:'durak-take'});cardMotionTest.advance({type:'durak-finish'});`);
    const state=await evaluate(`['white','black'].map(role=>{const root=document.querySelector('#motion-'+role);return {take:root.querySelectorAll('[data-flight="take"]').length,draw:root.querySelectorAll('[data-flight="draw"]').length,backs:root.querySelectorAll('[data-flight="draw"] .card-back').length,hand:[...root.querySelectorAll('[data-card]')].map(el=>Number(el.dataset.card)),delays:[...root.querySelectorAll('[data-flight="draw"]')].map(el=>el.getAnimations()[0].effect.getTiming().delay)}})`);
    assert.deepEqual(state.map(s=>s.take),[2,2]);assert.deepEqual(state.map(s=>s.draw),[1,1]);assert.deepEqual(state.map(s=>s.backs),[1,0]);
    assert.ok(state[0].hand.includes(9));assert.ok(!state[0].hand.includes(12));assert.ok(state[1].hand.includes(12));assert.ok(!state[1].hand.includes(9));
    assert.ok(state.every(s=>s.delays[0]>=400));
    const sounds=await evaluate(`cardMotionTest.sounds.length`);await evaluate(`cardMotionTest.repeat()`);assert.equal(await evaluate(`cardMotionTest.sounds.length`),sounds);
    await evaluate(`new Promise(r=>setTimeout(r,1000))`);
    assert.equal(await evaluate(`document.querySelectorAll('#motion-test .durak-flight,#motion-test .durak-motion-hidden').length`),0);
    await evaluate(`cardMotionTest.advance({type:'durak-attack',card:6},false)`);
    assert.equal(await evaluate(`document.querySelector('#motion-test').getAnimations({subtree:true}).length`),0,'restored single-step snapshots stay still');
    assert.equal(await evaluate(`cardMotionTest.sounds.length`),sounds,'restores stay silent');
    assert.deepEqual(browser.errors,[]);
  }finally{await browser.close();}
});
