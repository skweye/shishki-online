import { translations, patterns } from './locales.js';
const key = 'shashki-language-v1';
let selected = 'ru';
try { const saved = localStorage.getItem(key); if (['ru', 'en', 'uk'].includes(saved)) selected = saved; } catch {}
export const language = () => selected;
export function t(text, locale = selected) {
  if (locale === 'ru' || typeof text !== 'string') return text;
  const trimmed = text.trim(), entry = translations[trimmed];
  if (entry) return text.replace(trimmed, entry[locale]);
  for (const [pattern, translate] of patterns) {
    const match = trimmed.match(pattern);
    if (match) return text.replace(trimmed, translate(match, locale));
  }
  return text;
}
// Preserve source text separately so switching back never depends on reverse
// translation. User content and notation are explicitly excluded from traversal.
const originals = new WeakMap();
const sourceByTranslation = new Map(Object.entries(translations).flatMap(([source, values]) => Object.values(values).map(value => [value, source])));
const excluded = 'script,style,[data-no-translate],.history-row,#room-code,#profile-avatar-preview,#account-avatar';
const attributes = ['aria-label', 'placeholder', 'title'];
function translateValue(owner, name, read, write) {
  const value = read(); if (!value) return;
  let record = originals.get(owner);
  if (!record) originals.set(owner, record = {});
  let field = record[name];
  if (!field || field.rendered !== value) {
    const source = sourceByTranslation.get(value.trim());
    field = record[name] = { source: source ? value.replace(value.trim(), source) : value, rendered: value };
  }
  const translated = t(field.source);
  if (value !== translated) write(translated);
  field.rendered = translated;
}
let observer;
export function translatePage() {
  if (typeof document === 'undefined') return;
  observer?.disconnect();
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT);
  let node;
  while ((node = walker.nextNode())) {
    const element = node.nodeType === Node.TEXT_NODE ? node.parentElement : node;
    if (element.closest(excluded)) continue;
    if (node.nodeType === Node.TEXT_NODE) translateValue(node, 'text', () => node.nodeValue, value => { node.nodeValue = value; });
    else for (const attribute of attributes) translateValue(node, attribute, () => node.getAttribute(attribute), value => node.setAttribute(attribute, value));
  }
  document.documentElement.lang = selected;
  document.title = t('Шашки — хорошая партия начинается здесь');
  observer?.observe(document.body, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: attributes });
}
export function setLanguage(locale) {
  if (!['ru', 'en', 'uk'].includes(locale)) return;
  selected = locale;
  try { localStorage.setItem(key, locale); } catch {}
  translatePage(); document.dispatchEvent(new Event('languagechange'));
}
if (typeof document !== 'undefined') {
  observer = new MutationObserver(translatePage);
  translatePage();
}
