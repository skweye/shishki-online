import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { accountMarkup, accountDialogs } from '../public/account-shell.js';
import { t } from '../public/i18n.js';
import { translations } from '../public/locales.js';
test('both languages cover static game UI text and accessibility labels', () => {
  const html=readFileSync(new URL('../public/index.html',import.meta.url),'utf8')+accountMarkup+accountDialogs;
  const strings=[...html.matchAll(/>([^<>]*[А-Яа-яЁё][^<>]*)</g),...html.matchAll(/(?:aria-label|placeholder)="([^"]*[А-Яа-яЁё][^"]*)"/g)].map(m=>m[1].trim());
  const names=new Set(['шашки','Русский','Українська']);
  for(const value of strings) if(!names.has(value)) assert.notEqual(t(value,'en'),value,'Missing translation: '+value);
  for(const [source,entry] of Object.entries(translations)) for(const language of ['en','uk']) assert.ok(typeof entry[language]==='string' && entry[language].length,'Missing '+language+': '+source);
});
test('dynamic chess labels and draw prompts use the selected language', () => {
  assert.equal(t('e1, Белые, король','en'),'e1, White, king');
  assert.equal(t('a8, Чёрные, ладья','uk'),'a8, Чорні, тура');
  assert.equal(t('Чёрные, согласны на ничью?','uk'),'Чорні, згодні на нічию?');
  assert.equal(t('Матча ♟','en'),'Матча ♟');
});
