import { validEffect } from './shop-catalog.js';

export function isFinishTransition(previous, next, live = true) {
  return live && next.reason === 'resign' && validEffect(next.finishEffect) !== 'none' && !!next.winner && !previous.winner && next.revision > previous.revision;
}

export function createRocketEffect(frame, sounds) {
  let overlay, timer, impactTimer;
  function cancel() {
    clearTimeout(timer); clearTimeout(impactTimer);
    overlay?.remove(); overlay = null; frame.classList.remove('rocket-impact');
  }
  function launch(fromTop, finished, effect = 'rocket') {
    cancel();
    const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
    overlay = document.createElement('div'); overlay.className = 'rocket-effect finish-' + validEffect(effect);
    overlay.dataset.direction = fromTop ? 'down' : 'up'; overlay.setAttribute('aria-hidden', 'true');
    overlay.innerHTML = '<div class="rocket-flight"><div class="rocket-trail"></div><svg class="rocket-ship" viewBox="0 0 80 160"><path class="rocket-flame" d="M28 114Q18 136 40 157Q62 136 52 114Z" fill="#ffc46e"/><path d="M20 66 5 102 22 98M60 66 75 102 58 98" fill="#d88762"/><path d="M40 5Q12 30 22 111H58Q68 30 40 5Z" fill="#f4e8d4"/><path d="M40 5Q26 17 23 33H57Q54 17 40 5Z" fill="#cf7755"/><circle cx="40" cy="56" r="12" fill="#566f75" stroke="#c7b9a2" stroke-width="5"/><path d="M33 90H47V119H33Z" fill="#b96b4f"/></svg><div class="rocket-blast"></div><div class="rocket-ring"></div><div class="rocket-sparks">✦</div></div>';
    if (effect !== 'rocket') {
      const visuals = {
        comet: '<div class="comet-tail"></div><div class="comet-core">✦</div><div class="cosmic-ring"></div>',
        lightning: '<svg class="lightning-bolt" viewBox="0 0 100 180"><path d="M60 5 20 100 48 97 35 175 86 75 56 82Z" fill="#fff3b5" stroke="#e7b75e" stroke-width="3"/></svg><div class="lightning-glow"></div>',
        confetti: '<div class="confetti-crown">♛</div><div class="confetti-particles">' + '<i></i>'.repeat(12) + '</div>'
      };
      overlay.innerHTML = visuals[effect] || '';
    }
    frame.append(overlay);
    sounds.play(effect === 'rocket' || effect === 'comet' ? 'rocket' : 'promotion');
    impactTimer = setTimeout(() => { frame.classList.add('rocket-impact'); sounds.play('impact'); }, reduced ? 100 : 1250);
    timer = setTimeout(() => { cancel(); finished(); }, reduced ? 350 : 2200);
  }
  return { launch, cancel };
}
