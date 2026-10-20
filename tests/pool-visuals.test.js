import {test} from 'node:test';
import assert from 'node:assert/strict';
import {poolAim,poolRack,poolRackMarkup,rollOrientation,rotateVector,shotVector,interpolatePoolFrame,poolCanvasResolution,createBallPainter} from '../public/pool-visuals.js';
import {readFileSync} from 'node:fs';
import {newPool,simulatePool,TABLE,applyPoolShot} from '../public/pool.js';
import {transitionSounds} from '../public/sounds.js';
import {angleDelta} from '../public/pool-aim.js';
import {parseHTML} from 'linkedom';
import {createPoolBoard} from '../public/pool-board.js';

test('pool resolution scales with viewport and display density while preserving geometry and a bounded buffer',()=>{
  for(const portrait of [false,true])for(const width of [320,640,1200,1800,2600])for(const dpr of [1,1.25,1.5,2,3]){
    const m=poolCanvasResolution(width,portrait,dpr);
    assert.equal(m.pixelWidth/m.pixelHeight,m.width/m.height);
    assert.equal(m.width,portrait?660:1200);
    assert.equal(m.height,portrait?1200:660);
    assert.ok(m.pixelWidth*m.pixelHeight<=8_400_000);
    const max=portrait?2145:3900;
    assert.ok(m.pixelWidth>=Math.min(width*dpr,max));
  }
  assert.equal(poolCanvasResolution(1800,false,2).pixelWidth,3600,'wide Retina table is not a stretched 1200 px image');
  assert.equal(poolCanvasResolution(1800,false,2,true).pixelWidth,1800);
  assert.ok(poolCanvasResolution(5000,false,4,true).pixelWidth<=1920);
  for(const width of [undefined,NaN,0,-100])assert.ok(Number.isFinite(poolCanvasResolution(width,false,NaN).scale));
});

test('higher resolution and canvas-only resizing do not change aim, placement, remote cues or finish positions',()=>{
  const {document,window}=parseHTML('<html><body><div id="pool-board"></div></body></html>');
  let displayWidth=1200,vertical=false,resize;
  const transforms=[],translations=[],shots=[],places=[],arcs=[];
  const ctx=new Proxy({
    setTransform:(...args)=>transforms.push(args),translate:(...args)=>translations.push(args),arc:(...args)=>arcs.push(args),
    createImageData:(w,h)=>({data:new Uint8ClampedArray(w*h*4)}),
    createLinearGradient:()=>({addColorStop(){}}),createRadialGradient:()=>({addColorStop(){}})
  },{get:(target,key)=>key in target?target[key]:()=>{}});
  window.HTMLCanvasElement.prototype.getContext=()=>ctx;
  window.HTMLCanvasElement.prototype.getBoundingClientRect=()=>({left:10,top:20,width:displayWidth,height:displayWidth*(vertical?1200/660:660/1200)});
  window.HTMLCanvasElement.prototype.setPointerCapture=()=>{};
  window.HTMLCanvasElement.prototype.hasPointerCapture=()=>false;
  Object.assign(globalThis,{document,window,MutationObserver:window.MutationObserver,getComputedStyle:()=>({getPropertyValue:()=>''}),
    ResizeObserver:class{constructor(fn){resize=fn;}observe(){}},
    matchMedia:query=>({get matches(){return query.includes('max-width')?vertical:true;},addEventListener(){}}),
    cancelAnimationFrame(){},requestAnimationFrame:()=>1});
  const board=createPoolBoard({shoot:shot=>shots.push(shot),place:(x,y)=>{places.push({x,y});return true;},sound(){}}),canvas=document.getElementById('pool-canvas');
  let game={...newPool(),breaking:false,ballInHand:null,balls:[{id:0,x:4,y:5},{id:1,x:10,y:7}]};
  function event(type,x,y,flip=false){
    const px=60+(flip?20-x:x)*54,py=60+(flip?10-y:y)*54;
    const screen=vertical?{x:660-py,y:px}:{x:px,y:py};
    const rect=canvas.getBoundingClientRect(),e=new window.Event(type,{bubbles:true,cancelable:true});
    Object.assign(e,{pointerId:1,pointerType:'mouse',isPrimary:true,button:0,buttons:0,clientX:rect.left+screen.x/(vertical?660:1200)*rect.width,clientY:rect.top+screen.y/(vertical?1200:660)*rect.height});
    canvas.dispatchEvent(e);
  }
  try{
    for(const flipped of [false,true])for(vertical of [false,true])for(const dpr of [1,2,3]){
      window.devicePixelRatio=dpr;displayWidth=vertical?360:1800;transforms.length=0;
      board.render(game,flipped,true,'classic');
      assert.equal(canvas.width,poolCanvasResolution(displayWidth,vertical,dpr).pixelWidth);
      assert.ok(transforms.some(m=>m[0]===canvas.width/(vertical?660:1200)&&m[3]===m[0]));
      event('pointermove',8,7,flipped);assert.ok(Math.abs(board.getAim().angle-Math.atan2(2,4)*180/Math.PI)<1e-9);
      event('pointerdown',8,7,flipped);event('pointerup',8,7,flipped);
      assert.ok(Math.abs(shots.at(-1).dy/shots.at(-1).dx-.5)<1e-9,'physical shot follows same line at every resolution');
      game={...game,revision:game.revision+1,ballInHand:'any',balls:[{id:0,x:.1,y:.1},{id:1,x:10,y:7}]};
      board.render(game,flipped,true,'classic');event('pointerdown',4,5,flipped);
      assert.ok(Math.abs(places.at(-1).x-4)<1e-9);assert.ok(Math.abs(places.at(-1).y-5)<1e-9);
      game={...game,revision:game.revision+1,ballInHand:null,balls:[{id:0,x:4,y:5},{id:1,x:10,y:7}]};
      board.render(game,flipped,true,'classic');
    }
    vertical=false;window.devicePixelRatio=2;displayWidth=900;board.render(game,false,true,'classic');
    const angle=board.getAim().angle;assert.equal(canvas.width,1800);
    displayWidth=1800;resize();assert.equal(canvas.width,3600,'widescreen resize redraws without a window resize');
    assert.equal(board.getAim().angle,angle);
    for(vertical of [false,true]){
      const samples=[];
      for(const dpr of [1,2]){
        window.devicePixelRatio=dpr;board.render(game,false,false,'classic');translations.length=0;
        board.setFinishInteraction({effect:'comet',elapsed:1000,options:{winner:'white',loser:'black',seed:1}});
        samples.push([...translations]);
        board.setFinishInteraction(null);
      }
      assert.deepEqual(samples[0],samples[1],'finish effects use logical coordinates, not pixel-buffer dimensions');
    }
    const previous=canvas.width;document.hidden=true;displayWidth=2500;resize();assert.equal(canvas.width,previous,'hidden tabs do not resize/repaint');
    document.hidden=false;
  }finally{board.cancel();}
});

test('ball textures match screen resolution, retain rotation, and reuse stationary pixels',()=>{
  const {document,window}=parseHTML('<html><body></body></html>');globalThis.document=document;
  let writes=0;const draws=[];
  window.HTMLCanvasElement.prototype.getContext=()=>({createImageData:(w,h)=>({data:new Uint8ClampedArray(w*h*4)}),putImageData(){writes++;}});
  const ctx=new Proxy({drawImage:canvas=>draws.push({width:canvas.width,height:canvas.height})},{get:(target,key)=>key in target?target[key]:()=>{}});
  const paint=createBallPainter(),q=[0,0,0,1],ball={id:9},point={x:100,y:100};
  paint(ctx,ball,point,15,q,false,1);assert.equal(draws.at(-1).width,48);
  paint(ctx,ball,point,15,q,false,3);assert.ok(draws.at(-1).width>=90);
  const last=writes;paint(ctx,ball,{x:140,y:120},15,q,false,3);assert.equal(writes,last,'static textures are reused when only position changes');
  paint(ctx,ball,point,15,rollOrientation(q,.2,.1),false,3);assert.equal(writes,last+1);
  paint(ctx,ball,point,15,q,false,100);assert.equal(draws.at(-1).width,192);
});

test('remote cue follows table orientation and disappears on placement, stale state and disconnect',()=>{
  const {document,window}=parseHTML('<html><body><div id="pool-board"></div></body></html>');
  const rotations=[],tips=[],colors=[];
  const ctx=new Proxy({
    rotate:a=>rotations.push(a),moveTo:(x,y)=>{if(y===-3)tips.push(x);},
    createImageData:(w,h)=>({data:new Uint8ClampedArray(w*h*4)}),
    createLinearGradient:()=>({addColorStop:(_,color)=>colors.push(color)}),
    createRadialGradient:()=>({addColorStop(){}})
  },{get:(target,key)=>key in target?target[key]:()=>{}});
  window.HTMLCanvasElement.prototype.getContext=()=>ctx;
  let portrait=false;
  Object.assign(globalThis,{document,window,MutationObserver:window.MutationObserver,
    getComputedStyle:()=>({getPropertyValue:()=>''}),
    matchMedia:query=>({matches:query.includes('max-width')?portrait:true,addEventListener(){}}),
    cancelAnimationFrame:()=>{},requestAnimationFrame:()=>{throw new Error('Reduced motion must not animate');}});
  document.documentElement.dataset.lowPerformance='true';
  const board=createPoolBoard({shoot(){},place(){},sound(){}}),game=newPool();
  const aim={role:'white',revision:0,angle:30,power:.6,placing:false};
  const reset=()=>{rotations.length=tips.length=colors.length=0;};
  try{
    for(const flip of [false,true])for(portrait of [false,true]){
      board.render(game,flip,false,'neon');reset();board.receiveAim(aim);
      const expected=flip?-5*Math.PI/6:Math.PI/6;
      assert.ok(Math.abs(rotations.at(-1)-expected)<1e-9);
      assert.equal(tips.at(-1),-(23+.6*28));assert.ok(colors.includes('#daffff'));
      if(portrait)assert.equal(rotations[0],Math.PI/2);
      assert.equal(document.getElementById('pool-shoot').disabled,true);
      reset();board.receiveAim({...aim,placing:true});assert.equal(tips.length,0);
    }
    board.receiveAim(aim);reset();board.receiveAim(null);assert.equal(tips.length,0);
    board.receiveAim(aim);reset();board.render({...game,revision:1,turn:'black'},false,false,'neon');assert.equal(tips.length,0);
    board.receiveAim(aim);assert.equal(tips.length,0);
  }finally{board.cancel();}
});

test('glancing impacts follow the guide at different angles and strengths',()=>{
  for(const angle of [-160,-90,-35,0,25,90,170])for(const power of [.15,.35,.85,1])for(const offset of [-.48,-.2,.2,.48]){
    const r=angle*Math.PI/180,dx=Math.cos(r),dy=Math.sin(r);
    const target={id:1,x:10+dx*1.2-dy*offset,y:5+dy*1.2+dx*offset};
    const game={...newPool(),breaking:false,ballInHand:null,balls:[{id:0,x:10,y:5},target]};
    const guide=poolAim(game.balls,angle),shot=shotVector(angle,power),sim=simulatePool(game,shot.dx,shot.dy,true);
    assert.equal(sim.firstContact,1);assert.equal(guide.hit.id,1);
    const frame=sim.frames.find(f=>{const b=f.find(b=>b.id===1);return b&&Math.hypot(b.x-target.x,b.y-target.y)>.001;});
    const moved=frame.find(b=>b.id===1),vx=moved.x-target.x,vy=moved.y-target.y,length=Math.hypot(vx,vy);
    assert.ok(Math.abs(vx*guide.normal.y-vy*guide.normal.x)/length<1e-6,`angle=${angle}, power=${power}, offset=${offset}`);
    assert.ok(vx*guide.normal.x+vy*guide.normal.y>0);
  }
});

test('remote cues turn across the angle boundary by the shortest path',()=>{
  assert.equal(angleDelta(179,-179),2);assert.equal(angleDelta(-179,179),-2);
  assert.equal(angleDelta(180,-180),0);assert.equal(angleDelta(30,90),60);
});
test('aim stops at the nearest ball at cue-ball radius, or the cushion',()=>{
  const balls=[{id:0,x:2,y:5},{id:2,x:10,y:5},{id:1,x:6,y:5},{id:3,x:3,y:7}],before=structuredClone(balls);
  const hit=poolAim(balls,0);assert.equal(hit.hit.id,1);assert.ok(Math.abs(hit.end.x-(6-TABLE.radius*2))<1e-9);assert.equal(hit.end.y,5);
  const rail=poolAim(balls,-90);assert.equal(rail.hit,null);assert.ok(Math.abs(rail.end.y-TABLE.radius)<1e-9);
  assert.deepEqual(balls,before);assert.equal(poolAim([],0),null);
});
test('power is clamped and minimum five-percent shots work at every angle',()=>{
  const game=newPool();
  for(let angle=-180;angle<=180;angle+=5){const shot=shotVector(angle,.05);assert.ok(Math.abs(Math.hypot(shot.dx,shot.dy)-.05)<1e-12);assert.doesNotThrow(()=>simulatePool(game,shot.dx,shot.dy));}
  assert.equal(shotVector(0,2).dx,1);assert.equal(shotVector(0,-1).dx,.05);
});
test('rolling uses distance and direction, stays normalized and interpolates without changing physics',()=>{
  const q=rollOrientation([0,0,0,1],TABLE.radius*Math.PI/2,0),normal=rotateVector(q,[0,0,1]);assert.ok(Math.abs(normal[0]-1)<1e-9);assert.ok(Math.abs(normal[2])<1e-9);
  let full=[0,0,0,1];for(let i=0;i<100;i++)full=rollOrientation(full,TABLE.radius*Math.PI*2/100,0);
  assert.ok(Math.abs(Math.hypot(...full)-1)<1e-9);assert.ok(Math.abs(rotateVector(full,[0,0,1])[2]-1)<1e-9);
  const frames=[[{id:0,x:1,y:2}],[{id:0,x:2,y:4}]],copy=structuredClone(frames);
  assert.deepEqual(interpolatePoolFrame(frames,1/120),[{id:0,x:1.5,y:3}]);assert.deepEqual(frames,copy);
});
test('racks track assigned groups and contact sounds have physics timestamps, with no generic checker taps',()=>{
  const game=newPool();assert.deepEqual(poolRack(game,'white'),[]);game.groups={white:'solid',black:'stripe'};game.balls=game.balls.filter(b=>b.id!==3);
  const rack=poolRack(game,'white');assert.equal(rack.length,7);assert.deepEqual(rack.filter(b=>b.potted),[{id:3,potted:true}]);assert.ok(poolRack(game,'black').every(b=>b.id>=9&&!b.potted));
  const initial=newPool(),sim=simulatePool(initial,.85,0,true);
  assert.ok(sim.events.some(e=>e.kind==='ball'));assert.ok(sim.events.some(e=>e.kind==='rail'));
  assert.ok(sim.events.every((e,i)=>e.time>=0&&e.strength>=0&&e.strength<=1&&(!i||e.time>=sim.events[i-1].time)));
  assert.deepEqual(transitionSounds(initial,applyPoolShot(initial,{dx:.85,dy:0})),[]);
});
test('frame timestamps before animation start and after the last frame stay in range',()=>{
  const sim=simulatePool(newPool(),.85,0,true),frames=sim.frames,copy=structuredClone(frames);
  for(const time of [-.001,-1,-Infinity,NaN,undefined,0])assert.deepEqual(interpolatePoolFrame(frames,time),frames[0]);
  const end=(frames.length-1)/60;
  for(const time of [end,end+.1,end+1,Infinity])assert.deepEqual(interpolatePoolFrame(frames,time),frames.at(-1));
  for(let time=-.003;time<end+.2;time+=1/144)assert.ok(interpolatePoolFrame(frames,time).every(b=>Number.isFinite(b.x)&&Number.isFinite(b.y)));
  assert.deepEqual(interpolatePoolFrame([],0),[]);
  assert.deepEqual(interpolatePoolFrame([frames[0]],-.001),frames[0]);
  assert.deepEqual(frames,copy);
});
test('player ball colors use external CSS classes compatible with strict CSP',()=>{
  const game=newPool();game.groups={white:'solid',black:'stripe'};game.balls=game.balls.filter(b=>b.id!==3);
  const css=readFileSync(new URL('../public/pool.css',import.meta.url),'utf8');
  for(const side of ['white','black']){
    const markup=poolRackMarkup(game,side);
    assert.doesNotMatch(markup,/\sstyle\s*=/i);assert.equal((markup.match(/role="img"/g)||[]).length,7);
    for(let i=1;i<=7;i++){assert.ok(markup.includes('pool-color-'+i+' '));assert.ok(css.includes('.pool-color-'+i+'{'));}
  }
  assert.match(poolRackMarkup(game,'white'),/3: Забит/);
  assert.match(poolRackMarkup(game,'black'),/striped/);
  const headers=readFileSync(new URL('../public/_headers',import.meta.url),'utf8');
  assert.doesNotMatch(headers,/unsafe-inline/);
});
