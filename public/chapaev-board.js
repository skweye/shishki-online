import { RADIUS, simulateShot } from './chapaev.js';

export function createChapaevBoard({ shoot, impact }) {
  const $ = id => document.getElementById(id), canvas = $('chapaev-canvas'), ctx = canvas.getContext('2d');
  const selector = $('shot-piece'), angle = $('shot-angle'), power = $('shot-power');
  let state, flipped = false, playable = false, selected = null, drag = null, animation = null, raf = 0, shown = [];
  const transform = p => flipped ? { x: 8 - p.x, y: 8 - p.y } : p;
  const point = event => { const r = canvas.getBoundingClientRect(); return transform({ x: (event.clientX - r.left) * 8 / r.width, y: (event.clientY - r.top) * 8 / r.height }); };
  function impulse() {
    const radians = Number(angle.value) * Math.PI / 180, force = Number(power.value) / 100, sign = flipped ? -1 : 1;
    return { dx: Math.sin(radians) * force * sign, dy: -Math.cos(radians) * force * sign };
  }
  function labels() { $('shot-angle-value').value = `${angle.value}°`; $('shot-power-value').value = `${power.value}%`; }
  function draw() {
    const width = canvas.clientWidth;
    if (!width) return;
    const dpr = Math.min(devicePixelRatio || 1, 2), pixels = Math.round(width * dpr);
    if (canvas.width !== pixels) { canvas.width = pixels; canvas.height = pixels; }
    ctx.setTransform(pixels / 8, 0, 0, pixels / 8, 0, 0);
    const style = getComputedStyle(document.documentElement);
    const accent = style.getPropertyValue('--theme-accent').trim() || '#d1b395';
    const dark = `color-mix(in srgb, ${accent} 27%, #465046)`;
    const light = `color-mix(in srgb, ${accent} 14%, #e5dfcf)`;
    for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) { ctx.fillStyle = (x + y) % 2 ? dark : light; ctx.fillRect(x, y, 1, 1); }
    for (const piece of shown) {
      const p = transform(piece), white = piece.side === 'white';
      ctx.beginPath(); ctx.ellipse(p.x, p.y + .05, RADIUS, RADIUS, 0, 0, Math.PI * 2); ctx.fillStyle = '#0005'; ctx.fill();
      const gradient = ctx.createRadialGradient(p.x - .12, p.y - .15, .02, p.x, p.y, RADIUS);
      gradient.addColorStop(0, white ? '#fff8e8' : '#62564a'); gradient.addColorStop(1, white ? '#d6c4a7' : '#25211e');
      ctx.beginPath(); ctx.arc(p.x, p.y, RADIUS, 0, Math.PI * 2); ctx.fillStyle = gradient; ctx.fill();
      ctx.strokeStyle = white ? '#f8edda' : '#928170'; ctx.lineWidth = .018; ctx.stroke();
      ctx.beginPath(); ctx.arc(p.x, p.y, RADIUS * .7, 0, Math.PI * 2); ctx.strokeStyle = white ? '#ac967b' : '#9a887a'; ctx.stroke();
      ctx.fillStyle = white ? '#675747' : '#eee1cf'; ctx.font = '500 .19px system-ui'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(String(piece.id % 8 + 1), p.x, p.y);
      if (piece.id === selected && playable && !animation) {
        ctx.beginPath(); ctx.arc(p.x, p.y, RADIUS + .07, 0, Math.PI * 2); ctx.strokeStyle = accent; ctx.lineWidth = .04; ctx.stroke();
      }
    }
    const piece = shown.find(p => p.id === selected);
    if (piece && playable && !animation) {
      const p = transform(piece), { dx, dy } = drag || impulse(), sign = flipped ? -1 : 1;
      const x = p.x + dx * 2 * sign, y = p.y + dy * 2 * sign;
      ctx.strokeStyle = '#fff4d9'; ctx.fillStyle = '#fff4d9'; ctx.lineWidth = .055; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(x, y); ctx.stroke();
      const a = Math.atan2(dy * sign, dx * sign);
      ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x - .22 * Math.cos(a - .55), y - .22 * Math.sin(a - .55)); ctx.lineTo(x - .22 * Math.cos(a + .55), y - .22 * Math.sin(a + .55)); ctx.closePath(); ctx.fill();
    }
  }
  function cancelDrag() { const pointer = drag?.pointer; drag = null; if (pointer !== undefined && canvas.hasPointerCapture(pointer)) canvas.releasePointerCapture(pointer); draw(); }
  canvas.addEventListener('pointerdown', event => {
    if (!playable || animation || !event.isPrimary || event.button !== 0) return;
    const p = point(event), hit = state.pieces.find(piece => piece.side === state.turn && Math.hypot(piece.x - p.x, piece.y - p.y) < RADIUS + .12);
    if (!hit) return;
    selected = hit.id; selector.value = selected;
    drag = { pointer: event.pointerId, x: p.x, y: p.y, dx: 0, dy: 0 };
    canvas.setPointerCapture(event.pointerId); event.preventDefault(); draw();
  });
  canvas.addEventListener('pointermove', event => {
    if (!drag || drag.pointer !== event.pointerId) return;
    const p = point(event), dx = (drag.x - p.x) / 2.2, dy = (drag.y - p.y) / 2.2, length = Math.hypot(dx, dy);
    drag.dx = dx / Math.max(1, length); drag.dy = dy / Math.max(1, length);
    const sign = flipped ? -1 : 1;
    angle.value = Math.round(Math.atan2(drag.dx * sign, -drag.dy * sign) * 180 / Math.PI);
    power.value = Math.max(5, Math.round(Math.min(1, length) * 100)); labels(); draw();
  });
  canvas.addEventListener('pointerup', event => {
    if (!drag || drag.pointer !== event.pointerId) return;
    const { dx, dy } = drag, id = selected; cancelDrag();
    if (Math.hypot(dx, dy) >= .05 && playable) shoot(id, dx, dy);
  });
  canvas.addEventListener('pointercancel', cancelDrag);
  canvas.addEventListener('lostpointercapture', cancelDrag);
  window.addEventListener('blur', cancelDrag);
  document.addEventListener('keydown', e => { if (e.key === 'Escape') cancelDrag(); });
  selector.onchange = () => { selected = Number(selector.value); draw(); };
  angle.oninput = power.oninput = () => { labels(); draw(); };
  $('shot-button').onclick = () => { if (playable && !animation && selected !== null) { const { dx, dy } = impulse(); shoot(selected, dx, dy); } };
  new ResizeObserver(draw).observe(canvas);
  new MutationObserver(draw).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
  function cancel() { cancelAnimationFrame(raf); animation = null; cancelDrag(); }
  return {
    cancel,
    render(game, flip, canPlay) {
      if (state?.revision !== game.revision || !canPlay || flipped !== flip) cancelDrag();
      if (state?.turn !== game.turn || flipped !== flip) angle.value = (game.turn === 'white') !== flip ? 0 : 180;
      state = game; flipped = flip; playable = canPlay;
      const available = game.pieces.filter(p => p.side === game.turn);
      if (!available.some(p => p.id === selected)) selected = available[0]?.id ?? null;
      selector.replaceChildren(...available.map(p => { const option = document.createElement('option'); option.value = p.id; option.textContent = `Шашка ${p.id % 8 + 1}`; return option; }));
      selector.value = selected;
      for (const el of [selector, angle, power, $('shot-button')]) el.disabled = !canPlay;
      if (!animation) shown = game.pieces;
      labels(); draw();
    },
    animate(previous, next, done) {
      cancel();
      if (matchMedia('(prefers-reduced-motion: reduce)').matches || document.hidden) { shown = next.pieces; done(); return; }
      const { id, dx, dy } = next.lastShot;
      const { frames, collisions } = simulateShot(previous, id, dx, dy, true);
      // Interpolate at the display refresh rate; a little slow motion keeps contacts readable.
      const started = performance.now(), playbackSpeed = .8; let collision = 0;
      animation = true;
      function tick(now) {
        const elapsed = Math.max(0, (now - started) / 1000) * playbackSpeed;
        if (document.hidden || elapsed >= (frames.length - 1) / 60) { animation = null; shown = next.pieces; draw(); done(); return; }
        const position = elapsed * 60, index = Math.floor(position), fraction = position - index;
        const following = new Map(frames[index + 1].map(piece => [piece.id, piece]));
        shown = frames[index].map(piece => {
          const target = following.get(piece.id);
          return target ? { ...piece, x: piece.x + (target.x - piece.x) * fraction, y: piece.y + (target.y - piece.y) * fraction } : piece;
        });
        if (collision < collisions.length && collisions[collision] <= elapsed) { impact(); while (collisions[collision] <= elapsed) collision++; }
        draw(); raf = requestAnimationFrame(tick);
      }
      raf = requestAnimationFrame(tick);
    }
  };
}
