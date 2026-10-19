let started = false;
export function startPresence() {
  if (started) return;
  started = true;
  let controller, interval, stopped = false;
  async function beat() {
    if (document.hidden || stopped || controller) return;
    controller = new AbortController();
    const timeout = setTimeout(() => controller?.abort(), 10000);
    try {
      const response = await fetch('/api/presence', {method:'POST',headers:{'Content-Type':'application/json'},body:'{}',signal:controller.signal});
      if (!response.ok) throw Error('presence');
      const data = await response.json();
      if (Number.isInteger(data.online) && Number.isInteger(data.searching)) document.dispatchEvent(new CustomEvent('presencechange',{detail:data}));
    } catch { if (!stopped) document.dispatchEvent(new CustomEvent('presencechange',{detail:null})); }
    finally { clearTimeout(timeout); controller = null; }
  }
  function start() { stopped = false; clearInterval(interval); interval = setInterval(beat,25000); interval.unref?.(); beat(); }
  document.addEventListener('visibilitychange', () => { if (document.hidden) controller?.abort(); else beat(); });
  document.addEventListener('accountchange', beat);
  window.addEventListener('pagehide', () => { stopped = true; clearInterval(interval); controller?.abort(); });
  window.addEventListener('pageshow', start);
  start();
}
