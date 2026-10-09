import { TABLE, POCKETS, poolTargets, simulatePool, validCuePosition } from './pool.js';
import { t } from './i18n.js';
const colors=['#f6f1e6','#edbe38','#3b6bc6','#c34840','#7852a1','#db8639','#387e67','#813d4d','#22252b'];
const foulText={scratch:'Биток в лузе.', 'no-contact':'Биток не коснулся прицельного шара.', 'wrong-ball':'Первое касание чужого шара.', kitchen:'Первое касание должно быть за линией дома.', 'no-rail':'После касания нужен борт или забитый шар.',break:'Слабый разбой: пирамида восстановлена.'};
export function createPoolBoard({shoot,place,impact}) {
  const root=document.getElementById('pool-board');
  root.innerHTML=`<canvas id="pool-canvas" width="1200" height="660" tabindex="0" aria-label="${t('Бильярдный стол. Нажмите для прицеливания; управление с клавиатуры ниже.')}" data-no-translate></canvas><div class="pool-console"><p id="pool-notice" role="status" data-no-translate></p><div class="pool-fields"><label>${t('Заказать шар')}<select id="pool-ball"></select></label><label>${t('Заказать лузу')}<select id="pool-pocket">${POCKETS.map((_,i)=>`<option value="${i}">${i+1}</option>`).join('')}</select></label><label>${t('Направление')}<output id="pool-angle-value">0°</output><input id="pool-angle" aria-label="${t('Направление')}" type="range" min="-180" max="180" value="0"></label><label>${t('Сила')}<output id="pool-power-value">85%</output><input id="pool-power" aria-label="${t('Сила')}" type="range" min="5" max="100" value="85"></label></div><div class="pool-actions"><button id="pool-place" class="secondary-button">${t('Переставить биток')}</button><button id="pool-shoot" class="primary-button">${t('Ударить ↗')}</button></div><div id="pool-placement" hidden><p>${t('Нажмите на свободное место стола или задайте координаты.')}</p><div class="pool-placement-fields"><label>X<input id="pool-x" type="number" min="0.27" max="19.73" step="0.1" value="4.5"></label><label>Y<input id="pool-y" type="number" min="0.27" max="9.73" step="0.1" value="5"></label><button id="pool-position" class="secondary-button">${t('Поставить биток')}</button></div></div></div>`;
  const $=id=>document.getElementById('pool-'+id),canvas=$('canvas'),ctx=canvas.getContext('2d');
  let state,flipped=false,playable=false,placing=false,shown=null,raf=0,finish=null,angle=0,power=.85,drag=null;
  const portrait=()=>matchMedia('(max-width:600px)').matches;
  const point=(x,y)=>({x:60+(flipped?20-x:x)*54,y:60+(flipped?10-y:y)*54});
  function ball(b) {
    const p=point(b.x,b.y),r=TABLE.radius*54;
    ctx.save();ctx.shadowColor='#0009';ctx.shadowBlur=8;ctx.shadowOffsetY=3;
    ctx.fillStyle=b.id>8?'#eee9da':colors[b.id];ctx.beginPath();ctx.arc(p.x,p.y,r,0,Math.PI*2);ctx.fill();ctx.shadowBlur=0;ctx.shadowOffsetY=0;
    ctx.clip();if(b.id>8){ctx.fillStyle=colors[b.id-8];ctx.fillRect(p.x-r,p.y-r*.6,2*r,r*1.2);}
    const g=ctx.createRadialGradient(p.x-r*.4,p.y-r*.5,1,p.x,p.y,r);g.addColorStop(0,'#ffffff66');g.addColorStop(.4,'#ffffff08');g.addColorStop(1,'#00000055');ctx.fillStyle=g;ctx.fillRect(p.x-r,p.y-r,2*r,2*r);
    if(b.id){ctx.fillStyle='#f7f0df';ctx.beginPath();ctx.arc(p.x,p.y,r*.48,0,Math.PI*2);ctx.fill();ctx.fillStyle='#151b20';ctx.font='bold 11px sans-serif';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(b.id,p.x,p.y+.5);}
    ctx.restore();
  }
  function draw() {
    if(!state)return;const theme=getComputedStyle(document.documentElement),accent=theme.getPropertyValue('--theme-accent').trim()||'#cfae90';
    const vertical=portrait(),width=vertical?660:1200,height=vertical?1200:660;
    if(canvas.width!==width){canvas.width=width;canvas.height=height;}
    ctx.setTransform(1,0,0,1,0,0);ctx.clearRect(0,0,width,height);if(vertical){ctx.translate(660,0);ctx.rotate(Math.PI/2);}
    ctx.fillStyle=theme.getPropertyValue('--theme-raised').trim()||'#342b25';ctx.beginPath();ctx.roundRect(7,7,1186,646,40);ctx.fill();
    ctx.strokeStyle=accent;ctx.globalAlpha=.5;ctx.lineWidth=2;ctx.stroke();ctx.globalAlpha=1;
    const felt=ctx.createLinearGradient(0,0,1200,660);felt.addColorStop(0,'#245851');felt.addColorStop(1,'#143c3b');ctx.fillStyle=felt;ctx.fillRect(44,44,1112,572);
    ctx.strokeStyle='#0f2926';ctx.lineWidth=15;ctx.strokeRect(52,52,1096,556);
    ctx.save();ctx.beginPath();ctx.rect(60,60,1080,540);ctx.clip();
    if(state.ballInHand==='kitchen'&&playable&&!shown){ctx.fillStyle='#ffffff0c';const a=point(0,0),b=point(5,10);ctx.fillRect(Math.min(a.x,b.x),60,270,540);}
    ctx.strokeStyle='#ffffff22';ctx.lineWidth=1;ctx.setLineDash([5,9]);const line=point(5,0);ctx.beginPath();ctx.moveTo(line.x,60);ctx.lineTo(line.x,600);ctx.stroke();ctx.setLineDash([]);ctx.restore();
    POCKETS.forEach((p,i)=>{const q=point(p.x,p.y);ctx.fillStyle='#080e10';ctx.beginPath();ctx.arc(q.x,q.y,30,0,Math.PI*2);ctx.fill();ctx.strokeStyle=Number($('pocket').value)===i&&!state.breaking&&playable?accent:'#8d795b';ctx.lineWidth=3;ctx.stroke();ctx.fillStyle=accent;ctx.font='bold 16px sans-serif';ctx.textAlign='center';ctx.fillText(i+1,q.x,q.y+(q.y<300?-37:42));});
    const balls=shown||state.balls,cue=balls.find(b=>b.id===0);
    if(cue&&playable&&!placing&&!shown){const q=point(cue.x,cue.y),a=angle*Math.PI/180,sign=flipped?-1:1;ctx.save();ctx.strokeStyle='#f8f4d399';ctx.lineWidth=2;ctx.setLineDash([7,7]);ctx.beginPath();ctx.moveTo(q.x,q.y);ctx.lineTo(q.x+Math.cos(a)*240*sign,q.y+Math.sin(a)*240*sign);ctx.stroke();ctx.setLineDash([]);ctx.strokeStyle='#d8b082';ctx.lineWidth=6;ctx.lineCap='round';ctx.beginPath();ctx.moveTo(q.x-Math.cos(a)*(25+power*30)*sign,q.y-Math.sin(a)*(25+power*30)*sign);ctx.lineTo(q.x-Math.cos(a)*(170+power*30)*sign,q.y-Math.sin(a)*(170+power*30)*sign);ctx.stroke();ctx.restore();}
    balls.forEach(ball);ctx.setTransform(1,0,0,1,0,0);
  }
  function controls(){
    if(!state)return;root.querySelectorAll('input,select,button').forEach(el=>el.disabled=!playable||!!shown);
    $('ball').disabled=$('pocket').disabled=!playable||!!shown||state.breaking;
    $('place').hidden=!state.ballInHand;$('placement').hidden=!placing;$('shoot').disabled=!playable||!!shown||placing||!state.balls.some(b=>b.id===0);
    $('angle-value').textContent=Math.round(angle)+'°';$('power-value').textContent=Math.round(power*100)+'%';$('angle').value=angle;$('power').value=power*100;
    $('notice').textContent=[state.foul?t(foulText[state.foul]):'',state.winner?'':state.breaking?t('Разбой. Заказ шара и лузы не нужен.'):state.ballInHand?t(state.ballInHand==='kitchen'?'Биток с руки в доме: X меньше 5.':'Биток с руки в любой свободной точке.'):t('Закажите шар и лузу, затем прицельтесь.')].filter(Boolean).join(' ');
    canvas.style.cursor=placing?'crosshair':'default';
  }
  function aim(){angle=Number($('angle').value);power=Number($('power').value)/100;controls();draw();}
  $('angle').oninput=$('power').oninput=aim;$('pocket').onchange=draw;
  $('place').onclick=()=>{placing=!placing;controls();draw();};
  function position(x,y){if(playable&&state.ballInHand&&place(x,y)!==false){placing=false;controls();draw();}}
  $('position').onclick=()=>position(Number($('x').value),Number($('y').value));
  $('shoot').onclick=()=>{if(!playable||shown||placing)return;const a=angle*Math.PI/180;shoot({dx:Math.cos(a)*power,dy:Math.sin(a)*power,ball:Number($('ball').value),pocket:Number($('pocket').value)});};
  const localPoint=e=>{const rect=canvas.getBoundingClientRect(),screenX=(e.clientX-rect.left)/rect.width*canvas.width,screenY=(e.clientY-rect.top)/rect.height*canvas.height,x=portrait()?screenY:screenX,y=portrait()?660-screenX:screenY;return{x:flipped?20-(x-60)/54:(x-60)/54,y:flipped?10-(y-60)/54:(y-60)/54};};
  canvas.onpointerdown=e=>{if(!playable||shown)return;e.preventDefault();canvas.focus({preventScroll:true});const p=localPoint(e);if(placing){position(p.x,p.y);return;}const cue=state.balls.find(b=>b.id===0);if(!cue)return;canvas.setPointerCapture(e.pointerId);drag={start:p,cue,fromCue:Math.hypot(p.x-cue.x,p.y-cue.y)<.7};if(!drag.fromCue){angle=Math.atan2(p.y-cue.y,p.x-cue.x)*180/Math.PI;controls();draw();}};
  canvas.onpointermove=e=>{if(!drag)return;const p=localPoint(e),dx=drag.fromCue?drag.cue.x-p.x:p.x-drag.cue.x,dy=drag.fromCue?drag.cue.y-p.y:p.y-drag.cue.y;if(Math.hypot(dx,dy)<.1)return;angle=Math.atan2(dy,dx)*180/Math.PI;if(drag.fromCue)power=Math.max(.05,Math.min(1,Math.hypot(dx,dy)/5));controls();draw();};
  canvas.onpointerup=canvas.onpointercancel=()=>{drag=null;};
  function cancel(){cancelAnimationFrame(raf);raf=0;shown=null;finish=null;drag=null;}
  function animate(before,next,done){cancel();const sim=simulatePool(before,next.lastShot.dx,next.lastShot.dy,true);let started=performance.now(),sound=0;finish=()=>{cancel();state=next;draw();done();};
    if(document.hidden||matchMedia('(prefers-reduced-motion: reduce)').matches){finish();return;}
    shown=sim.frames[0];controls();draw();const tick=now=>{const elapsed=(now-started)/1000,index=Math.floor(elapsed*60);if(index>=sim.frames.length){finish?.();return;}shown=sim.frames[index];while(sound<sim.collisions.length&&sim.collisions[sound]<=elapsed){impact();sound++;}draw();raf=requestAnimationFrame(tick);};raf=requestAnimationFrame(tick);
  }
  document.addEventListener('visibilitychange',()=>{if(document.hidden)finish?.();});
  window.addEventListener('resize',draw);
  new MutationObserver(draw).observe(document.documentElement,{attributes:true,attributeFilter:['data-theme']});
  window.addEventListener('languagechange',()=>{canvas.setAttribute('aria-label',t('Бильярдный стол. Нажмите для прицеливания; управление с клавиатуры ниже.'));controls();});
  return {render(next,flip,canPlay){const previous=state;state=next;flipped=flip;playable=canPlay;if(previous?.revision!==next.revision){placing=!!next.ballInHand&&!next.balls.some(b=>b.id===0&&validCuePosition(next,b.x,b.y));const old=$('ball').value;$('ball').replaceChildren(...poolTargets(next).sort((a,b)=>a-b).map(id=>{const o=document.createElement('option');o.value=id;o.textContent=id;return o;}));if([...$('ball').options].some(o=>o.value===old))$('ball').value=old;}controls();draw();},animate,cancel};
}
