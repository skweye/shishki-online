import { TABLE } from './pool.js';

const inside = p => p.x >= 0 && p.x <= TABLE.width && p.y >= 0 && p.y <= TABLE.height;

export function attachPoolInput(canvas, { point, current, aim, adjustPower, shoot, place }) {
  let drag = null;
  const ready = state => state.active && state.cue && !state.placing;
  function target(p, cue) {
    const dx = p.x - cue.x, dy = p.y - cue.y;
    if (Math.hypot(dx, dy) >= .1) aim(Math.atan2(dy, dx) * 180 / Math.PI);
  }
  canvas.addEventListener('wheel', event => {
    if (event.ctrlKey || !event.deltaY || !ready(current()) || !inside(point(event))) return;
    event.preventDefault();
    adjustPower(event.deltaY < 0 ? .05 : -.05);
  }, { passive: false });
  canvas.addEventListener('pointerdown', event => {
    const state = current(), p = point(event);
    if (!event.isPrimary || event.button !== 0 || !state.active || !inside(p)) return;
    event.preventDefault(); canvas.focus({ preventScroll: true });
    if (state.placing) { drag = null; place(p.x, p.y); return; }
    if (!state.cue) return;
    canvas.setPointerCapture(event.pointerId);
    drag = { id: event.pointerId, type: event.pointerType, x: event.clientX, y: event.clientY, moved: false,
      cue: state.cue, revision: state.revision, view: state.view, fromCue: Math.hypot(p.x - state.cue.x, p.y - state.cue.y) < .7 };
    if (!drag.fromCue) target(p, state.cue);
  });
  canvas.addEventListener('pointermove', event => {
    const state = current(), p = point(event);
    if (!ready(state)) { drag = null; return; }
    if (!drag) {
      if (event.pointerType === 'mouse' && !event.buttons && inside(p)) target(p, state.cue);
      return;
    }
    if (event.pointerId !== drag.id) return;
    if (state.revision !== drag.revision || state.view !== drag.view) { drag = null; return; }
    if (Math.hypot(event.clientX - drag.x, event.clientY - drag.y) >= 6) drag.moved = true;
    if (!drag.moved) return;
    const dx = drag.fromCue ? drag.cue.x - p.x : p.x - drag.cue.x;
    const dy = drag.fromCue ? drag.cue.y - p.y : p.y - drag.cue.y;
    if (Math.hypot(dx, dy) < .1) return;
    aim(Math.atan2(dy, dx) * 180 / Math.PI, drag.fromCue ? Math.round(Math.max(.05, Math.min(1, Math.hypot(dx, dy) / 5)) * 100) / 100 : undefined);
  });
  canvas.addEventListener('pointerup', event => {
    if (!drag || event.pointerId !== drag.id) return;
    const gesture = drag; drag = null;
    if (canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId);
    const state = current(), p = point(event);
    if (gesture.type !== 'mouse' || event.button !== 0 || gesture.moved || Math.hypot(event.clientX - gesture.x, event.clientY - gesture.y) >= 6 ||
      !ready(state) || state.revision !== gesture.revision || state.view !== gesture.view || !inside(p)) return;
    if (!gesture.fromCue) target(p, state.cue);
    shoot();
  });
  function cancel() {
    const previous = drag; drag = null;
    if (previous && canvas.hasPointerCapture(previous.id)) canvas.releasePointerCapture(previous.id);
  }
  canvas.addEventListener('pointercancel', cancel);
  canvas.addEventListener('lostpointercapture', () => { drag = null; });
  return { cancel };
}
