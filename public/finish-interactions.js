const clamp = value => Math.max(0, Math.min(1, value));
const smooth = value => { const t = clamp(value); return t * t * (3 - 2 * t); };
export const FINISH_DURATION = 2600;

// Pure visual offsets in board-relative units. Never writes to a game position.
export function pieceReaction(effect, piece, elapsed, { winner = 'white', fromTop = false, reduced = false } = {}) {
  const out = { x: 0, y: 0, scale: 1, rotation: 0, opacity: 1, brightness: 1, hue: 0, glow: 0, color: '#ffdf9c' };
  if (elapsed < 0 || elapsed >= FINISH_DURATION || effect === 'none') return out;
  const winning = piece.side === winner, x = piece.x, y = piece.y;
  if (reduced) return { ...out, brightness: winning ? 1.15 : .9, glow: winning ? 5 : 0 };
  const t = elapsed, restore = 1 - smooth((t - 2250) / 350), strength = winning ? .35 : 1;
  if (effect === 'rocket') {
    const dx = x - .5, dy = y - (fromTop ? .76 : .24), distance = Math.hypot(dx, dy);
    const wave = smooth((t - 1230 - distance * 260) / 400);
    out.x = dx / Math.max(.12, distance) * .19 * wave * strength;
    out.y = dy / Math.max(.12, distance) * .19 * wave * strength - Math.sin(wave * Math.PI) * .055;
    out.rotation = (dx >= 0 ? 1 : -1) * wave * 65 * strength;
    out.opacity = 1 - wave * (winning ? 0 : .55); out.glow = wave * 15; out.brightness = 1 + wave * .6;
  } else if (effect === 'comet') {
    const along = (x - y + 1) / 2, crossing = ((fromTop ? 1 - along : along) + .15) / 1.3 * 2200;
    const distance = Math.abs(x + y - 1) / Math.SQRT2, wave = smooth((t - crossing) / 320);
    const force = Math.exp(-distance * 5) * wave * strength, direction = fromTop ? -1 : 1;
    out.x = direction * force * .17; out.y = -direction * force * .17 - Math.sin(wave * Math.PI) * .035;
    out.rotation = direction * force * 75; out.glow = Math.exp(-distance * 4) * wave * 18; out.color = '#d6b6ff'; out.brightness = 1 + wave * .45;
  } else if (effect === 'lightning') {
    const phase = clamp((t - 350 - Math.hypot(x - .5, y - .55) * 350) / 750), pulse = Math.sin(phase * Math.PI);
    out.x = Math.sin(phase * 45) * pulse * .018 * strength; out.y = -pulse * .035;
    out.rotation = Math.sin(phase * 35) * pulse * 9 * strength; out.brightness = 1 + pulse * 1.4; out.glow = pulse * 22;
  } else if (effect === 'portal') {
    const pull = smooth((t - 450) / 1300), dx = x - .5, dy = y - .5, angle = pull * Math.PI * 1.7;
    if (!winning) {
      const radius = 1 - pull;
      out.x = (dx * Math.cos(angle) - dy * Math.sin(angle)) * radius - dx;
      out.y = (dx * Math.sin(angle) + dy * Math.cos(angle)) * radius - dy;
      out.scale = 1 - pull * .95; out.opacity = 1 - smooth((pull - .65) / .35); out.rotation = pull * 260;
    } else { out.y = -Math.sin(pull * Math.PI) * .045; out.scale = 1 + Math.sin(pull * Math.PI) * .12; }
    out.color = '#b2a2ff'; out.glow = Math.sin(pull * Math.PI) * 18;
  } else if (effect === 'blizzard') {
    const wind = smooth(t / 600), freeze = Math.sin(clamp(t / 2250) * Math.PI);
    out.x = Math.sin(t / 350 + y * 5) * .025 * wind * strength; out.y = .045 * wind * strength;
    out.rotation = Math.sin(t / 450 + x * 4) * 12 * strength; out.hue = freeze * 150; out.brightness = 1 + freeze * .45; out.glow = freeze * 13; out.color = '#a9e4ff';
  } else if (effect === 'petals') {
    const breeze = Math.sin(clamp(t / 2250) * Math.PI);
    out.x = Math.sin(t / 600 + y * 4) * .035 * breeze; out.y = -Math.abs(Math.sin(t / 550 + x * 3)) * .04 * breeze;
    out.rotation = Math.sin(t / 500 + x * 4) * 12 * breeze; out.color = '#ffa9c9'; out.glow = breeze * 10;
  } else if (effect === 'eclipse') {
    const shadow = Math.sin(clamp(t / 2250) * Math.PI);
    out.brightness = winning ? 1 + shadow * .25 : 1 - shadow * .8;
    out.scale = 1 + shadow * (winning ? .1 : -.15); out.glow = winning ? shadow * 20 : 0;
  } else if (['confetti', 'laurel', 'fireworks'].includes(effect)) {
    const delay = (x + y) * 140, progress = clamp((t - delay - 150) / 1700);
    const bounce = Math.abs(Math.sin(progress * Math.PI * (effect === 'fireworks' ? 3 : 2))) * Math.sin(progress * Math.PI);
    out.y = -bounce * (winning ? .09 : .018); out.rotation = Math.sin(progress * Math.PI * 4) * (winning ? 9 : 3);
    out.scale = 1 + bounce * (winning ? .14 : -.04); out.glow = bounce * (winning ? 20 : 4);
    out.brightness = 1 + bounce * .25;
  }
  for (const key of ['x', 'y', 'rotation', 'hue', 'glow']) out[key] *= restore;
  for (const key of ['scale', 'opacity', 'brightness']) out[key] = 1 + (out[key] - 1) * restore;
  return out;
}

export function createPieceInteractions(frame) {
  let layer, raf = 0, canvasBoard;
  function cancel() {
    cancelAnimationFrame(raf); raf = 0; layer?.remove(); layer = null;
    frame.classList.remove('finish-interacting'); canvasBoard?.setFinishInteraction(null); canvasBoard = null;
  }
  function launch(effect, options) {
    cancel(); canvasBoard = options.canvasBoard;
    const rect = frame.getBoundingClientRect(), width = frame.clientWidth, height = frame.clientHeight;
    layer = document.createElement('div'); layer.className = 'finish-pieces'; layer.setAttribute('aria-hidden', 'true');
    const pieces = [...frame.querySelectorAll('#board .piece, #narde-board .piece, .preview-checkers .piece')].filter(node => node.getBoundingClientRect().width && !node.classList.contains('captured')).map(node => {
      const bounds = node.getBoundingClientRect(), style = getComputedStyle(node), clone = node.cloneNode(true), proxy = document.createElement('div');
      clone.removeAttribute('id'); clone.querySelectorAll('[id]').forEach(child => child.removeAttribute('id'));
      proxy.className = 'finish-piece-proxy';
      const left = (bounds.left - rect.left - frame.clientLeft) / width, top = (bounds.top - rect.top - frame.clientTop) / height;
      Object.assign(proxy.style, { left: left * 100 + '%', top: top * 100 + '%', width: bounds.width / width * 100 + '%', height: bounds.height / height * 100 + '%' });
      for (const property of ['background', 'border', 'borderRadius', 'boxShadow', 'fontSize', 'fontFamily', 'fontWeight', 'color', 'lineHeight']) clone.style[property] = style[property];
      Object.assign(clone.style, { position: 'relative', inset: 'auto', width: '100%', height: '100%', margin: '0', translate: 'none', transform: 'none', visibility: 'visible' });
      proxy.append(clone); layer.append(proxy);
      return { proxy, x: left + bounds.width / width / 2, y: top + bounds.height / height / 2, side: node.classList.contains('white') ? 'white' : 'black' };
    });
    frame.append(layer); frame.classList.add('finish-interacting');
    const started = performance.now();
    function tick(now) {
      const elapsed = now - started;
      for (const piece of pieces) {
        const reaction = pieceReaction(effect, piece, elapsed, options);
        piece.proxy.style.transform = `translate(${reaction.x * frame.clientWidth}px,${reaction.y * frame.clientHeight}px) rotate(${reaction.rotation}deg) scale(${reaction.scale})`;
        piece.proxy.style.opacity = reaction.opacity;
        piece.proxy.style.filter = `brightness(${reaction.brightness}) hue-rotate(${reaction.hue}deg) drop-shadow(0 0 ${reaction.glow}px ${reaction.color})`;
      }
      canvasBoard?.setFinishInteraction({ effect, elapsed, options });
      if (elapsed < (options.reduced ? 350 : FINISH_DURATION)) raf = requestAnimationFrame(tick);
    }
    tick(started);
  }
  return { launch, cancel };
}
