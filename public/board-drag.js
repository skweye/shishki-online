// Pointer Events support mouse, touch and pen without changing click controls.
export function attachBoardDrag(board, { moves, select, move }) {
  let drag = null, suppressClick = false;
  const squareAt = (x, y) => {
    const square = document.elementFromPoint(x, y)?.closest('[data-index]');
    return square && board.contains(square) ? square : null;
  };
  function cancel() {
    if (!drag) return;
    const previous = drag; drag = null;
    if (previous.active) suppressClick = true;
    previous.ghost?.remove();
    board.classList.remove('dragging');
    board.querySelectorAll('.drag-source, .drop-target').forEach(el => el.classList.remove('drag-source', 'drop-target'));
    if (board.hasPointerCapture(previous.id)) board.releasePointerCapture(previous.id);
  }
  board.addEventListener('pointerdown', event => {
    if (!event.isPrimary || event.button !== 0) return;
    cancel(); suppressClick = false;
    const square = event.target.closest('[data-index]');
    if (!square) return;
    const from = Number(square.dataset.index);
    if (!moves().some(item => item.from === from)) return;
    drag = { id: event.pointerId, from, x: event.clientX, y: event.clientY, active: false };
  });
  window.addEventListener('pointermove', event => {
    if (!drag || drag.id !== event.pointerId) return;
    if (!drag.active) {
      if (Math.hypot(event.clientX - drag.x, event.clientY - drag.y) < 7) return;
      select(drag.from);
      const source = board.querySelector(`[data-index="${drag.from}"]`);
      const piece = source?.querySelector('.piece');
      if (!piece) { cancel(); return; }
      const rect = piece.getBoundingClientRect();
      const ghost = piece.cloneNode(true);
      ghost.classList.add('drag-ghost'); ghost.setAttribute('aria-hidden', 'true');
      ghost.style.width = `${rect.width}px`; ghost.style.height = `${rect.height}px`;
      document.body.append(ghost);
      Object.assign(drag, { active: true, ghost, size: rect.width });
      source.classList.add('drag-source'); board.classList.add('dragging');
      board.setPointerCapture(event.pointerId);
    }
    event.preventDefault();
    drag.ghost.style.left = `${event.clientX - drag.size / 2}px`;
    drag.ghost.style.top = `${event.clientY - drag.size / 2}px`;
    board.querySelector('.drop-target')?.classList.remove('drop-target');
    const target = squareAt(event.clientX, event.clientY);
    if (target && moves().some(item => item.from === drag.from && item.to === Number(target.dataset.index))) target.classList.add('drop-target');
  }, { passive: false });
  window.addEventListener('pointerup', event => {
    if (!drag || drag.id !== event.pointerId) return;
    const { from, active } = drag;
    const target = active ? squareAt(event.clientX, event.clientY) : null;
    const to = target ? Number(target.dataset.index) : null;
    cancel();
    if (!active) return; // Let a normal tap/click reach the existing handler.
    event.preventDefault();
    if (to !== null && moves().some(item => item.from === from && item.to === to)) move(from, to);
  });
  // A cancelled gesture must never turn into an unintended click or move.
  window.addEventListener('pointercancel', event => { if (drag?.id === event.pointerId) cancel(); });
  board.addEventListener('lostpointercapture', event => { if (drag?.id === event.pointerId && drag.active) cancel(); });
  window.addEventListener('blur', cancel);
  document.addEventListener('visibilitychange', () => { if (document.hidden) cancel(); });
  document.addEventListener('keydown', event => { if (event.key === 'Escape') cancel(); });
  board.addEventListener('dragstart', event => event.preventDefault());
  board.addEventListener('click', event => {
    if (suppressClick && event.detail !== 0) { event.preventDefault(); event.stopImmediatePropagation(); suppressClick = false; }
  }, true);
  return { cancel };
}
