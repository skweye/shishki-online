export const PERFORMANCE_KEY = 'shashki-low-performance-v1';
export const lowPerformance = () => typeof document !== 'undefined' && document.documentElement.dataset.lowPerformance === 'true';

export function initPerformance(doc = document, storage) {
  const input = doc.getElementById('low-performance');
  function apply(enabled) {
    doc.documentElement.dataset.lowPerformance = String(enabled);
    if (input) input.checked = enabled;
    doc.dispatchEvent(new doc.defaultView.Event('performancechange'));
  }
  let saved = false;
  try { storage ??= localStorage; saved = storage.getItem(PERFORMANCE_KEY) === 'true'; } catch { /* Storage is optional. */ }
  apply(saved);
  if (input) input.onchange = () => {
    apply(input.checked);
    try { storage.setItem(PERFORMANCE_KEY, String(input.checked)); } catch { /* Still works for this page. */ }
  };
  return { apply };
}
