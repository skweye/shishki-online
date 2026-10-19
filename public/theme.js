// Shared palettes for every page; stored IDs remain stable across updates.
(() => {
  const themes = [
    ['mocha', 'Matcha', 'Тёмный шоколад · мягкая карамель', '#29211e'],
    ['pulse', 'PULSE', 'Графит · лайм', '#111211'],
    ['alduin', 'Alduin', 'Уголь · тёплый кремовый', '#1c1c1c'],
    ['80s-after-dark', '80s After Dark', 'Ночной синий · розовый · голубой', '#1b1d36'],
    ['8008', '8008', 'Серо-синий · яркий розовый', '#333a45'],
    ['obsidian', 'Obsidian', 'Чёрный · серебро', '#101114'],
    ['midnight', 'Midnight', 'Полночь · лунный синий', '#101624'],
    ['abyss', 'Abyss', 'Глубокий океан · бирюза', '#0c1b20'],
    ['evergreen', 'Evergreen', 'Тёмный лес · мята', '#111c18'],
    ['blackberry', 'Blackberry', 'Тёмная слива · лаванда', '#201522'],
    ['classic', 'Классическая', 'Светлый лён · шалфей', '#f5f3ed']
  ];
  try { document.documentElement.dataset.lowPerformance = String(localStorage.getItem('shashki-low-performance-v1') === 'true'); } catch {}
  const key = 'shashki-appearance-v1';
  let selected = 'mocha';
  try { const saved = localStorage.getItem(key); if (themes.some(([id]) => id === saved)) selected = saved; } catch { /* Storage is optional. */ }
  function apply(id) {
    const theme = themes.find(([value]) => value === id);
    if (!theme) return;
    selected = id;
    document.documentElement.dataset.theme = id;
    const color = document.querySelector('meta[name="theme-color"]');
    if (color) color.content = theme[3];
    document.querySelectorAll('[data-theme-choice]').forEach(button => button.setAttribute('aria-checked', String(button.dataset.themeChoice === id)));
  }
  apply(selected);
  document.addEventListener('DOMContentLoaded', () => {
    const picker = document.getElementById('theme-options');
    for (const [id, name, description] of themes) {
      const button = document.createElement('button');
      button.type = 'button'; button.dataset.palette = id; button.dataset.themeChoice = id;
      button.setAttribute('role', 'menuitemradio'); button.setAttribute('aria-checked', String(id === selected));
      button.innerHTML = '<span class="theme-dot" aria-hidden="true"></span><span>'+name+'</span><span class="menu-check" aria-hidden="true">✓</span>';
      button.onclick = () => { if (selected === id) return; apply(id); try { localStorage.setItem(key, selected); } catch {} document.dispatchEvent(new CustomEvent('actionsound', { detail: 'select' })); };
      picker.append(button);
    }
    document.dispatchEvent(new Event('themesready'));
  });
})();
