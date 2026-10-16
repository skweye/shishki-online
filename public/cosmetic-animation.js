import { lowPerformance } from './performance.js';

export const cosmeticMotionAllowed=()=>!document.hidden&&!lowPerformance()&&!matchMedia('(prefers-reduced-motion: reduce)').matches;
export const cosmeticTime=()=>cosmeticMotionAllowed()?performance.now():0;
export function canvasVisible(canvas){
  if(!canvas?.isConnected||!canvas.getClientRects?.().length)return false;
  const r=canvas.getBoundingClientRect();
  return r.width>0&&r.height>0&&r.bottom>0&&r.right>0&&r.top<window.innerHeight&&r.left<window.innerWidth;
}
// A single 30 fps loop per surface; no work for static, hidden or offscreen art.
export function createCosmeticAnimation(paint,active){
  let frame=0,last=0;
  const wanted=()=>cosmeticMotionAllowed()&&active();
  function refresh(){
    if(!wanted()){cancelAnimationFrame(frame);frame=0;return;}
    if(!frame)frame=requestAnimationFrame(tick);
  }
  function tick(now){
    frame=0;if(!wanted())return;
    if(now-last>=1000/30){last=now;paint(now);}
    refresh();
  }
  function changed(){refresh();paint(cosmeticTime());}
  document.addEventListener('visibilitychange',changed);
  document.addEventListener('performancechange',changed);
  matchMedia('(prefers-reduced-motion: reduce)').addEventListener('change',changed);
  window.addEventListener('scroll',refresh,{passive:true});
  window.addEventListener('resize',refresh);
  return {refresh};
}
