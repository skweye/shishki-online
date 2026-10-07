// The five Pulse palettes, plus the original light appearance.
(() => {
  const themes = [
    ['mocha', 'Matcha', 'Тёмный шоколад · мягкая карамель', '#29211e'],
    ['pulse', 'PULSE', 'Графит · лайм', '#111211'],
    ['alduin', 'Alduin', 'Уголь · тёплый кремовый', '#1c1c1c'],
    ['80s-after-dark', '80s After Dark', 'Ночной синий · розовый · голубой', '#1b1d36'],
    ['8008', '8008', 'Серо-синий · яркий розовый', '#333a45'],
    ['classic', 'Классическая', 'Светлый лён · шалфей', '#f5f3ed']
  ];
  const key = 'shashki-appearance-v1';
  let selected = 'mocha';
  try { const saved = localStorage.getItem(key); if (themes.some(([id]) => id === saved)) selected = saved; } catch { /* Storage is optional. */ }
  function apply(id) {
    const theme = themes.find(([value]) => value === id);
    if (!theme) return;
    selected = id;
    document.documentElement.dataset.theme = id;
    document.querySelector('meta[name="theme-color"]').content = theme[3];
  }
  apply(selected);
  document.addEventListener('DOMContentLoaded', () => {
    const picker = document.getElementById('theme-options');
    for (const [id, name, description] of themes) {
      const label = document.createElement('label');
      label.className = 'theme-option'; label.dataset.palette = id;
      label.innerHTML = `<input type="radio" name="appearance" value="${id}" ${id === selected ? 'checked' : ''}><span class="theme-option-content"><span class="theme-name"><strong>${name}</strong><small>${description}</small></span><span class="theme-swatches" aria-hidden="true"><i></i><i></i><i></i></span></span>`;
      picker.append(label);
    }
    picker.addEventListener('change', event => {
      apply(event.target.value);
      try { localStorage.setItem(key, selected); } catch { /* Keep the theme for this visit. */ }
    });
  });
})();
