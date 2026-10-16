import { lowPerformance } from './performance.js';
import { validEffect } from './shop-catalog.js';
import { createPieceInteractions, FINISH_DURATION } from './finish-interactions.js';
import { measureFinishLayout } from './finish-layout.js';

export function isFinishTransition(previous, next, live = true) {
  return live && next.reason !== 'round' && validEffect(next.finishEffect) !== 'none' && ['white', 'black'].includes(next.winner) && !previous.winner && next.revision > previous.revision;
}

export function createRocketEffect(frame, sounds) {
  let overlay, timer, impactTimer, complete, resizeObserver, weatherAnimations = [];
  const interactions = createPieceInteractions(frame);
  function cancel() {
    complete = null;
    clearTimeout(timer); clearTimeout(impactTimer);
    resizeObserver?.disconnect(); resizeObserver=null;
    weatherAnimations.forEach(animation => animation.cancel()); weatherAnimations = [];
    interactions.cancel();
    overlay?.remove(); overlay = null; frame.classList.remove('rocket-impact');
  }
  document.addEventListener('performancechange', () => { if(lowPerformance()) complete?.(); });
  document.addEventListener('visibilitychange', () => { if(document.hidden) complete?.(); });
  function launch(fromTop, finished, effect = 'rocket', options = {}) {
    cancel();
    complete = () => { cancel(); finished(); };
    if(lowPerformance()){complete();return;}
    const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
    overlay = document.createElement('div'); overlay.className = 'rocket-effect finish-' + validEffect(effect);
    overlay.dataset.direction = fromTop ? 'down' : 'up'; overlay.setAttribute('aria-hidden', 'true');
    overlay.innerHTML = '<div class="rocket-flight"><div class="rocket-trail"></div><svg class="rocket-ship" viewBox="0 0 80 160"><path class="rocket-flame" d="M28 114Q18 136 40 157Q62 136 52 114Z" fill="#ffc46e"/><path d="M20 66 5 102 22 98M60 66 75 102 58 98" fill="#d88762"/><path d="M40 5Q12 30 22 111H58Q68 30 40 5Z" fill="#f4e8d4"/><path d="M40 5Q26 17 23 33H57Q54 17 40 5Z" fill="#cf7755"/><circle cx="40" cy="56" r="12" fill="#566f75" stroke="#c7b9a2" stroke-width="5"/><path d="M33 90H47V119H33Z" fill="#b96b4f"/></svg><div class="rocket-blast"></div><div class="rocket-ring"></div><div class="rocket-sparks">✦</div></div>';
    if (effect !== 'rocket') {
      const visuals = {
        comet: '<div class="comet-flight"><div class="comet-body"><div class="comet-tail"></div><div class="comet-core">✦</div></div></div>',
        lightning: '<svg class="lightning-bolt" viewBox="0 0 100 180"><path d="M60 5 20 100 48 97 35 175 86 75 56 82Z" fill="#fff3b5" stroke="#e7b75e" stroke-width="3"/></svg><div class="lightning-glow"></div>',
        confetti: '<div class="confetti-crown">♛</div><div class="confetti-particles">' + '<i></i>'.repeat(12) + '</div>',
        laurel: '<div class="laurel-wreath"><span>❧</span><b>♛</b><span>❧</span></div><div class="laurel-halo"></div>',
        fireworks: '<div class="firework burst-one"></div><div class="firework burst-two"></div><div class="firework burst-three"></div>',
        portal: '<div class="portal-ring ring-one"></div><div class="portal-ring ring-two"></div><div class="portal-ring ring-three"></div><div class="portal-star">✦</div>',
        blizzard: '<div class="weather-field"><div class="winter-frost"></div><div class="winter-mist"></div></div>',
        petals: '<div class="weather-field"><div class="sakura-light"></div></div>',
        eclipse: '<div class="eclipse-corona"></div><div class="eclipse-disc"></div><div class="eclipse-star">✦</div>'
      };
      overlay.innerHTML = visuals[effect] || '';
    }
    const viewport=measureFinishLayout(frame),stage=document.createElement('div');stage.className='finish-stage';
    stage.append(...overlay.childNodes);overlay.append(stage);
    Object.assign(overlay.style,{inset:'auto',left:viewport.left+'px',top:viewport.top+'px',width:viewport.width+'px',height:viewport.height+'px'});
    Object.assign(stage.style,{width:viewport.size+'px',height:viewport.size+'px'});
    frame.append(overlay);
    weatherAnimations = animateFinishWeather(stage, viewport, effect, reduced);
    interactions.launch(effect, { ...options, fromTop, reduced, viewport });
    // End a short effect cleanly on a resize rather than distorting its live proxies.
    if(typeof ResizeObserver!=='undefined'){
      const width=frame.clientWidth,height=frame.clientHeight;
      resizeObserver=new ResizeObserver(()=>{if(frame.clientWidth!==width||frame.clientHeight!==height)complete?.();});resizeObserver.observe(frame);
    }
    sounds.play(effect === 'rocket' || effect === 'comet' ? 'rocket' : ['petals','blizzard'].includes(effect) ? effect : 'promotion');
    if (['rocket', 'lightning', 'comet'].includes(effect)) impactTimer = setTimeout(() => { if (!reduced) frame.classList.add('rocket-impact'); sounds.play('impact'); }, reduced ? 100 : 1250);
    timer = setTimeout(() => complete?.(), reduced ? 350 : FINISH_DURATION);
  }
  return { launch, cancel };
}

// The weather spans the playing surface, while individual particles keep their
// own pixel dimensions even on wide pool tables and double battleship fields.
export function animateFinishWeather(stage, viewport, effect, reduced) {
  const field = stage.querySelector('.weather-field');
  if (!field) return [];
  Object.assign(field.style, {width: viewport.width+'px', height: viewport.height+'px'});
  if (reduced) return [];
  const animations = [], snow = effect === 'blizzard', count = snow ? 64 : 34;
  const size = viewport.size, direction = stage.parentElement?.dataset.direction === 'down' ? -1 : 1;
  for (let i=0;i<count;i++) {
    const particle = document.createElement('i');
    particle.className = snow ? 'weather-snow' : 'weather-petal';
    particle.dataset.depth = String(i%3);
    if(snow && i%7===0) {
      particle.classList.add('snow-crystal');
      particle.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4"><path d="M12 1v22M2.5 6.5l19 11M2.5 17.5l19-11M8 3l4 3 4-3M8 21l4-3 4 3M3 10l4-1-1-4M21 14l-4 1 1 4M3 14l4 1-1 4M21 10l-4-1 1-4"/></svg>';
    }
    field.append(particle);
    if(typeof particle.animate !== 'function')continue;
    const x=((i*37)%101)/100*viewport.width, y=((i*61)%103)/103*viewport.height;
    const drift=direction*size*(snow?.48:.20), fall=size*(snow?.22:.36), phase=i*1.7;
    const angle=i*47, scale=.6+(i%5)*.15;
    const frames=Array.from({length:6},(_,step)=>{
      const p=step/5, flutter=Math.sin(p*Math.PI*3+phase)*size*(snow?.025:.045)*Math.sin(p*Math.PI);
      return {transform:'translate('+ (x+drift*p+flutter)+'px,'+(y+fall*p-size*.16)+'px) rotate('+(angle+p*(snow?100:260))+'deg) rotateY('+(snow?0:Math.sin(p*Math.PI*3+phase)*65)+'deg) scale('+scale+')',opacity:step===0||step===5?0:(i%3===0?.55:.9)};
    });
    animations.push(particle.animate(frames,{duration:1900+(i%4)*100,delay:(i%7)*50,easing:'linear',fill:'both'}));
  }
  return animations;
}
