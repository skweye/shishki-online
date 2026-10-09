import { TABLE, POCKETS, simulatePool, validCuePosition } from './pool.js';
import { poolAim, shotVector, rollOrientation, interpolatePoolFrame, createBallPainter } from './pool-visuals.js';
import { t } from './i18n.js';
import { attachPoolInput } from './pool-input.js';
const foulText={scratch:'Биток в лузе.', 'no-contact':'Биток не коснулся прицельного шара.', 'wrong-ball':'Первое касание чужого шара.', kitchen:'Первое касание должно быть за линией дома.', 'no-rail':'После касания нужен борт или забитый шар.',break:'Слабый разбой: пирамида восстановлена.'};
export function createPoolBoard({shoot,place,sound}) {
  const root=document.getElementById('pool-board');
  root.innerHTML=`<canvas id="pool-canvas" width="1200" height="660" tabindex="0" aria-label="${t('Бильярдный стол. Мышь — прицел, колесо — сила, ЛКМ — удар. Управление с клавиатуры ниже.')}" data-no-translate></canvas><div class="pool-console"><p id="pool-notice" role="status" data-no-translate></p><div class="pool-fields"><label>${t('Направление')}<output id="pool-angle-value">0°</output><input id="pool-angle" aria-label="${t('Направление')}" type="range" min="-180" max="180" step="1" value="0"></label><label>${t('Сила')}<output id="pool-power-value">85%</output><input id="pool-power" aria-label="${t('Сила')}" type="range" min="5" max="100" step="1" value="85"></label></div><div class="pool-actions"><button id="pool-place" class="secondary-button">${t('Переставить биток')}</button><button id="pool-shoot" class="primary-button">${t('Ударить ↗')}</button></div><div id="pool-placement" hidden><p>${t('Нажмите на свободное место стола или задайте координаты.')}</p><div class="pool-placement-fields"><label>X<input id="pool-x" type="number" min="0.27" max="19.73" step="0.1" value="4.5"></label><label>Y<input id="pool-y" type="number" min="0.27" max="9.73" step="0.1" value="5"></label><button id="pool-position" class="secondary-button">${t('Поставить биток')}</button></div></div></div>`;
  const $=id=>document.getElementById('pool-'+id),canvas=$('canvas'),ctx=canvas.getContext('2d'),paintBall=createBallPainter();
  let state,flipped=false,playable=false,placing=false,shown=null,raf=0,finish=null,angle=0,power=.85,sinking=[];
  const orientations=new Map();
  const portrait=()=>matchMedia('(max-width:600px)').matches;
  const point=(x,y)=>({x:60+(flipped?20-x:x)*54,y:60+(flipped?10-y:y)*54});
  function ball(b,scale=1,opacity=1) {
    const p=point(b.x,b.y),r=TABLE.radius*54*scale;
    ctx.save();ctx.globalAlpha=opacity;
    const shade=ctx.createRadialGradient(p.x+2,p.y+5,0,p.x+2,p.y+5,r*1.4);shade.addColorStop(0,'#0008');shade.addColorStop(1,'#0000');ctx.fillStyle=shade;ctx.fillRect(p.x-r*1.5,p.y-r*1.2,r*3,r*3);
    ctx.beginPath();ctx.arc(p.x,p.y,r,0,Math.PI*2);ctx.clip();paintBall(ctx,b,p,r,orientations.get(b.id)||[0,0,0,1],flipped);ctx.restore();
  }
  function pocket(p) {
    const q=point(p.x,p.y),r=p.x===10?29:32;
    ctx.save();
    // A cut-out in the rail: a dark well, with a thin edge only on the outside.
    const g=ctx.createRadialGradient(q.x,q.y+4,2,q.x,q.y,r);g.addColorStop(0,'#010203');g.addColorStop(.75,'#020608');g.addColorStop(1,'#10201f');
    ctx.fillStyle=g;ctx.beginPath();ctx.arc(q.x,q.y,r,0,Math.PI*2);ctx.fill();
    const mouth=Math.atan2(330-q.y,600-q.x);
    ctx.strokeStyle='#8baba780';ctx.lineWidth=1.5;ctx.beginPath();ctx.arc(q.x,q.y,r,mouth+.8,mouth+Math.PI*2-.8);ctx.stroke();
    ctx.beginPath();ctx.arc(q.x,q.y,r-1,0,Math.PI*2);ctx.clip();
    ctx.strokeStyle='#000b';ctx.lineWidth=5;ctx.beginPath();ctx.arc(q.x,q.y+3,r-2,Math.PI,Math.PI*2);ctx.stroke();ctx.restore();
  }
  function guide(balls) {
    const path=poolAim(balls,angle);if(!path)return;
    const q=point(path.cue.x,path.cue.y),end=point(path.end.x,path.end.y),sign=flipped?-1:1,dx=path.direction.x*sign,dy=path.direction.y*sign;
    ctx.save();ctx.beginPath();ctx.rect(22,22,1156,616);ctx.clip();
    const glow=ctx.createLinearGradient(q.x,q.y,end.x,end.y);glow.addColorStop(0,'#fff5d7a0');glow.addColorStop(1,'#fff7deee');
    ctx.strokeStyle=glow;ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(q.x+dx*17,q.y+dy*17);ctx.lineTo(end.x,end.y);ctx.stroke();
    ctx.strokeStyle='#fff9e6cc';ctx.lineWidth=1.5;ctx.beginPath();ctx.arc(end.x,end.y,TABLE.radius*54,0,Math.PI*2);ctx.stroke();
    if(path.hit){const hit=point(path.hit.x,path.hit.y),nx=path.normal.x*sign,ny=path.normal.y*sign;
      ctx.strokeStyle='#e9c68eaa';ctx.setLineDash([5,5]);ctx.beginPath();ctx.moveTo(hit.x,hit.y);ctx.lineTo(hit.x+nx*88,hit.y+ny*88);ctx.stroke();ctx.setLineDash([]);
      const dot=dx*nx+dy*ny,tx=dx-dot*nx,ty=dy-dot*ny;
      ctx.strokeStyle='#ffffff60';ctx.beginPath();ctx.moveTo(end.x,end.y);ctx.lineTo(end.x+tx*65,end.y+ty*65);ctx.stroke();
    }
    ctx.translate(q.x,q.y);ctx.rotate(Math.atan2(dy,dx));const gap=23+power*28;
    const wood=ctx.createLinearGradient(0,-5,0,5);wood.addColorStop(0,'#f0d4a6');wood.addColorStop(.45,'#c48d53');wood.addColorStop(1,'#634124');
    ctx.shadowColor='#0007';ctx.shadowBlur=5;ctx.shadowOffsetY=4;ctx.fillStyle=wood;ctx.beginPath();ctx.moveTo(-gap,-2.5);ctx.lineTo(-gap-230,-6);ctx.lineTo(-gap-230,6);ctx.lineTo(-gap,2.5);ctx.closePath();ctx.fill();ctx.shadowBlur=0;ctx.shadowOffsetY=0;
    ctx.fillStyle='#efe6d1';ctx.fillRect(-gap-11,-2.8,10,5.6);ctx.fillStyle='#609d9b';ctx.fillRect(-gap-2,-2.8,3,5.6);ctx.restore();
  }
  function draw() {
    if(!state)return;const theme=getComputedStyle(document.documentElement),accent=theme.getPropertyValue('--theme-accent').trim()||'#cfae90';
    const vertical=portrait(),width=vertical?660:1200,height=vertical?1200:660;
    if(canvas.width!==width){canvas.width=width;canvas.height=height;}
    ctx.setTransform(1,0,0,1,0,0);ctx.clearRect(0,0,width,height);if(vertical){ctx.translate(660,0);ctx.rotate(Math.PI/2);}
    const wood=ctx.createLinearGradient(0,0,0,660);wood.addColorStop(0,'#665144');wood.addColorStop(.5,'#362b26');wood.addColorStop(1,'#6f5440');ctx.fillStyle=wood;ctx.beginPath();ctx.roundRect(7,7,1186,646,40);ctx.fill();
    ctx.strokeStyle=accent;ctx.globalAlpha=.5;ctx.lineWidth=2;ctx.stroke();ctx.globalAlpha=1;
    const felt=ctx.createRadialGradient(520,230,60,600,330,650);felt.addColorStop(0,'#28665b');felt.addColorStop(1,'#103b36');ctx.fillStyle=felt;ctx.fillRect(44,44,1112,572);
    ctx.strokeStyle='#0c2925';ctx.lineWidth=17;ctx.strokeRect(51,51,1098,558);ctx.strokeStyle='#6c9e6955';ctx.lineWidth=3;ctx.strokeRect(62,62,1076,536);
    for(let i=1;i<8;i++){if(i===4)continue;ctx.fillStyle='#d8c29999';for(const y of [26,634]){ctx.beginPath();ctx.arc(60+i*135,y,2.4,0,Math.PI*2);ctx.fill();}}
    ctx.save();ctx.beginPath();ctx.rect(60,60,1080,540);ctx.clip();
    if(state.ballInHand==='kitchen'&&playable&&!shown){ctx.fillStyle='#ffffff0c';const a=point(0,0),b=point(5,10);ctx.fillRect(Math.min(a.x,b.x),60,270,540);}
    ctx.strokeStyle='#ffffff18';ctx.lineWidth=1;ctx.setLineDash([5,9]);const line=point(5,0);ctx.beginPath();ctx.moveTo(line.x,60);ctx.lineTo(line.x,600);ctx.stroke();ctx.setLineDash([]);ctx.restore();
    POCKETS.forEach(pocket);
    const balls=shown||state.balls;
    if(playable&&!placing&&!shown)guide(balls);
    balls.forEach(b=>ball(b));
    for(const b of sinking)ball(b,1-b.progress*.88,1-b.progress);
    ctx.setTransform(1,0,0,1,0,0);
  }
  function readings(){
    $('angle-value').textContent=Math.round(angle)+'°';$('power-value').textContent=Math.round(power*100)+'%';
    for(const [id,value] of [['angle',angle],['power',Math.round(power*100)]]){const input=$(id);if(document.activeElement!==input)input.value=value;input.style.setProperty('--range-fill',((Number(input.value)-Number(input.min))/(Number(input.max)-Number(input.min))*100)+'%');}
  }
  function controls(){
    if(!state)return;root.querySelectorAll('input,button').forEach(el=>el.disabled=!playable||!!shown);
    $('place').hidden=!state.ballInHand;$('placement').hidden=!placing;$('shoot').disabled=!playable||!!shown||placing||!state.balls.some(b=>b.id===0);
    readings();
    $('notice').textContent=[state.foul?t(foulText[state.foul]):'',state.winner?'':state.breaking?t('Разбейте пирамиду.'):state.ballInHand?t(state.ballInHand==='kitchen'?'Биток с руки в доме: X меньше 5.':'Биток с руки в любой свободной точке.'):t('Прицельтесь и выберите силу удара. Заказы не нужны.')].filter(Boolean).join(' ');
    canvas.style.cursor=playable&&!shown?'crosshair':'default';
  }
  $('angle').oninput=()=>{angle=Number($('angle').value);readings();draw();};
  $('power').oninput=()=>{power=Math.max(.05,Math.min(1,Number($('power').value)/100));readings();draw();};
  $('place').onclick=()=>{placing=!placing;controls();draw();};
  function position(x,y){if(playable&&state.ballInHand&&place(x,y)!==false){placing=false;controls();draw();}}
  $('position').onclick=()=>position(Number($('x').value),Number($('y').value));
  function fire(){if(!playable||shown||placing)return;shoot(shotVector(angle,power));}
  $('shoot').onclick=fire;
  const localPoint=e=>{const rect=canvas.getBoundingClientRect(),screenX=(e.clientX-rect.left)/rect.width*canvas.width,screenY=(e.clientY-rect.top)/rect.height*canvas.height,x=portrait()?screenY:screenX,y=portrait()?660-screenX:screenY;return{x:flipped?20-(x-60)/54:(x-60)/54,y:flipped?10-(y-60)/54:(y-60)/54};};
  const input=attachPoolInput(canvas,{
    point:localPoint,
    current:()=>({active:playable&&!shown,placing,cue:state?.balls.find(b=>b.id===0),revision:state?.revision,view:flipped}),
    aim(value,force){angle=value;if(force!==undefined)power=force;controls();draw();},
    adjustPower(delta){power=Math.max(.05,Math.min(1,Math.round((power+delta)*100)/100));$('power').value=Math.round(power*100);readings();draw();},
    shoot:fire,place:position
  });
  function cancel(){cancelAnimationFrame(raf);raf=0;shown=null;sinking=[];finish=null;input.cancel();}
  function animate(before,next,done){
    cancel();const sim=simulatePool(before,next.lastShot.dx,next.lastShot.dy,true);let started=null,soundIndex=0,last=sim.frames[0];
    sound('cue',Math.hypot(next.lastShot.dx,next.lastShot.dy));
    finish=()=>{cancel();state=next;draw();done();};
    if(document.hidden||matchMedia('(prefers-reduced-motion: reduce)').matches){finish();return;}
    shown=sim.frames[0];controls();draw();const tick=now=>{
      // requestAnimationFrame uses a frame timestamp which can precede performance.now().
      // Establish the origin from the same clock on the first callback.
      started??=now;
      const elapsed=Math.max(0,(now-started)/1000);
      if(elapsed>=(sim.frames.length-1)/60+.2){finish?.();return;}
      shown=interpolatePoolFrame(sim.frames,elapsed);
      const previous=new Map(last.map(b=>[b.id,b]));
      for(const b of shown){const old=previous.get(b.id);if(old)orientations.set(b.id,rollOrientation(orientations.get(b.id)||[0,0,0,1],b.x-old.x,b.y-old.y));}last=shown;
      while(soundIndex<sim.events.length&&sim.events[soundIndex].time<=elapsed){const event=sim.events[soundIndex++];sound(event.kind,event.strength);}
      sinking=sim.events.filter(e=>e.kind==='pocket'&&elapsed>=e.time&&elapsed<e.time+.2).map(e=>{const progress=(elapsed-e.time)/.2,p=POCKETS[e.pocket];return{id:e.id,x:e.x+(p.x-e.x)*progress,y:e.y+(p.y-e.y)*progress,progress};});
      draw();raf=requestAnimationFrame(tick);
    };raf=requestAnimationFrame(tick);
  }
  document.addEventListener('visibilitychange',()=>{if(document.hidden){input.cancel();finish?.();}});
  window.addEventListener('blur',()=>input.cancel());
  matchMedia('(prefers-reduced-motion: reduce)').addEventListener('change',e=>{if(e.matches)finish?.();});
  window.addEventListener('resize',draw);
  new MutationObserver(draw).observe(document.documentElement,{attributes:true,attributeFilter:['data-theme']});
  document.addEventListener('languagechange',()=>{canvas.setAttribute('aria-label',t('Бильярдный стол. Мышь — прицел, колесо — сила, ЛКМ — удар. Управление с клавиатуры ниже.'));controls();});
  return {render(next,flip,canPlay){const previous=state;state=next;flipped=flip;playable=canPlay;if(previous?.revision!==next.revision){placing=!!next.ballInHand&&!next.balls.some(b=>b.id===0&&validCuePosition(next,b.x,b.y));if(!next.history.length)orientations.clear();}controls();draw();},animate,cancel};
}
