// A WebSocket can remain OPEN even when its last state message was lost.
// Request a snapshot while waiting for a bot; reconnect if that request goes unanswered.
export function createRoomSync({ current, send, reconnect, now = () => Date.now() }) {
  let key = null, receivedAt = now(), requestedAt = null;
  function reset() { key = null; receivedAt = now(); requestedAt = null; }
  function received() { receivedAt = now(); requestedAt = null; }
  function check(force = false) {
    const c = current(), time = now();
    if (!c?.active || !c.bot || !c.connected) { reset(); return; }
    if (key !== c.code) { reset(); key = c.code; }
    if (c.hidden) return;
    if (requestedAt !== null) {
      if (time - requestedAt >= 4500) { reset(); reconnect(); }
      return;
    }
    if (force || time - receivedAt >= (c.waiting ? 2000 : 12000)) {
      requestedAt = time; send({ type: 'sync' });
    }
  }
  return { check, received, reset };
}
