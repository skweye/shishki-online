// Mouse, touch and pen share the same legal actions as the click controls.
export function attachDurakDrag(root, { actions, select, submit, sound }) {
  let drag = null, suppressClick = false;
  function cancel() {
    if (!drag) return;
    const previous = drag; drag = null;
    if (previous.active) suppressClick = true;
    previous.ghost?.remove();
    root.classList.remove('durak-dragging');
    root.querySelectorAll('.durak-drag-source,.durak-drop-hover').forEach(el => el.classList.remove('durak-drag-source', 'durak-drop-hover'));
    if (root.hasPointerCapture?.(previous.id)) root.releasePointerCapture(previous.id);
  }
  function destination(x, y) {
    const element = document.elementFromPoint(x, y);
    if (!element || !root.contains(element)) return null;
    const table = element.closest('.durak-table');
    if (!table) return null;
    const legal = actions().filter(action => action.card === drag.card);
    const pair = element.closest('[data-target]');
    // A card dropped on an attack covers it. Transfers use the open table area.
    const action = pair
      ? legal.find(a => a.type === 'durak-defend' && a.target === Number(pair.dataset.target)) || legal.find(a => a.type === 'durak-attack')
      : legal.find(a => a.type === 'durak-attack' || a.type === 'durak-transfer');
    return action ? { action, element: action.type === 'durak-defend' ? pair : table.querySelector('.durak-drop-play') || table } : null;
  }
  root.addEventListener('pointerdown', event => {
    if (!event.isPrimary || event.button !== 0 || document.hidden) return;
    cancel(); suppressClick = false;
    const source = event.target.closest('.durak-hand [data-card]');
    if (!source || source.disabled || !actions().some(a => a.card === Number(source.dataset.card))) return;
    const rect = source.getBoundingClientRect();
    drag = { id: event.pointerId, card: Number(source.dataset.card), x: event.clientX, y: event.clientY,
      width: rect.width, height: rect.height, offsetX: event.clientX - rect.left, offsetY: event.clientY - rect.top, active: false };
    // Prevent native SVG/text dragging from stealing the gesture.
    event.preventDefault();
    root.setPointerCapture?.(event.pointerId);
  });
  window.addEventListener('pointermove', event => {
    if (!drag || drag.id !== event.pointerId) return;
    if (!drag.active) {
      if (Math.hypot(event.clientX - drag.x, event.clientY - drag.y) < 7) return;
      if (!actions().some(a => a.card === drag.card)) { cancel(); return; }
      select(drag.card);
      const source = root.querySelector(`.durak-hand [data-card="${drag.card}"]`);
      if (!source) { cancel(); return; }
      const ghost = document.createElement('div');
      ghost.className = 'durak-card durak-drag-ghost'; ghost.innerHTML = source.innerHTML;
      ghost.setAttribute('aria-hidden', 'true'); ghost.inert = true;
      ghost.style.width = `${drag.width}px`; ghost.style.height = `${drag.height}px`;
      document.body.append(ghost);
      Object.assign(drag, { active: true, ghost });
      source.classList.add('durak-drag-source'); root.classList.add('durak-dragging');
    }
    event.preventDefault();
    drag.ghost.style.left = `${event.clientX - drag.offsetX}px`;
    drag.ghost.style.top = `${event.clientY - drag.offsetY}px`;
    root.querySelector('.durak-drop-hover')?.classList.remove('durak-drop-hover');
    destination(event.clientX, event.clientY)?.element.classList.add('durak-drop-hover');
  }, { passive: false });
  window.addEventListener('pointerup', event => {
    if (!drag || drag.id !== event.pointerId) return;
    const { active, card } = drag, target = active ? destination(event.clientX, event.clientY) : null;
    const source = !active && root.querySelector(`.durak-hand [data-card="${card}"]`);
    const tapped = source && source.contains(document.elementFromPoint(event.clientX, event.clientY));
    cancel();
    if (!active) {
      // Capture retargets the browser's click to the root, so forward a short
      // tap through the original button once. Keyboard clicks remain native.
      if (tapped && actions().some(a => a.card === card)) { source.click(); suppressClick = true; }
      return;
    }
    event.preventDefault();
    if (target) submit(target.action); else sound('error');
  });
  window.addEventListener('pointercancel', event => { if (drag?.id === event.pointerId) cancel(); });
  root.addEventListener('lostpointercapture', event => { if (drag?.id === event.pointerId) cancel(); });
  window.addEventListener('blur', cancel);
  document.addEventListener('keydown', event => { if (event.key === 'Escape') cancel(); });
  root.addEventListener('dragstart', event => event.preventDefault());
  root.addEventListener('click', event => {
    if (suppressClick && event.detail > 0) {
      event.preventDefault(); event.stopImmediatePropagation(); suppressClick = false;
    }
  }, true);
  return { cancel };
}
