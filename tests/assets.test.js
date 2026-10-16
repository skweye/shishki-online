import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { brotliCompressSync } from 'node:zlib';
import { readFile, readdir, stat, writeFile } from 'node:fs/promises';
import { watch } from 'node:fs';
import { resolve } from 'node:path';
import { parseHTML } from 'linkedom';
import { prepareAssets } from '../scripts/prepare-assets.mjs';

const root = resolve(import.meta.dirname, '..');
const output = resolve(root, 'test-results/assets-check/.site-assets');
const normalize = text => text.replace(/\r\n?/g, '\n');

test('all pages carry their complete ordered CSS, authorized by the delivered CSP without external style requests', async () => {
  const pages = await prepareAssets(output);
  assert.equal(pages.length, 7);
  const headers = await readFile(resolve(output, '_headers'), 'utf8');
  assert.ok(headers.split('\n').every(line => line.length <= 2000));
  assert.doesNotMatch(headers, /unsafe-inline|unsafe-hashes|fonts\.google/);
  assert.match(headers, /script-src 'self' https:\/\/static.cloudflareinsights.com;/);
  assert.match(headers, /font-src 'self';/);
  for (const { page, hash, stylesheets } of pages) {
    const original = normalize(await readFile(resolve(root, 'public', page), 'utf8'));
    const html = await readFile(resolve(output, page), 'utf8');
    const { document } = parseHTML(html);
    const style = document.querySelector('#page-styles');
    assert.ok(style, page);
    assert.equal(document.querySelectorAll('style').length, 1, page);
    assert.equal(document.querySelectorAll('link[rel="stylesheet"]').length, 0, page);
    assert.doesNotMatch(style.textContent, /@import|fonts\.google/);
    assert.equal(`'sha256-${createHash('sha256').update(style.textContent).digest('base64')}'`, hash);
    assert.ok(headers.includes(hash), page);
    const source = parseHTML(original).document;
    const sheets = [...source.querySelectorAll('link[rel="stylesheet"]')];
    assert.equal(sheets.length, stylesheets);
    const expected = [];
    for (const link of sheets) {
      const href = link.getAttribute('href');
      expected.push(`/* ${href} */\n${normalize(await readFile(resolve(root, 'public', '.' + href), 'utf8'))}`);
    }
    assert.equal(style.textContent, expected.join('\n'), `${page}: preserve every rule and cascade order`);
    assert.match(style.textContent, /@supports not \(color: color-mix/);
    assert.match(style.textContent, /min-height:100vh; min-height:100dvh/);
    assert.ok(html.indexOf('<style') < html.indexOf('<script'), page);
    assert.deepEqual([...document.querySelectorAll('script')].map(e => e.outerHTML), [...source.querySelectorAll('script')].map(e => e.outerHTML));
    assert.ok(brotliCompressSync(Buffer.from(html)).length < 100_000, `${page}: keep first response small`);
  }
  const first = await readFile(resolve(output, 'index.html'), 'utf8');
  await writeFile(resolve(output, 'obsolete.css'), 'stale');
  const directory = await stat(output), watcher = watch(output, { persistent: false });
  try { await prepareAssets(output); } finally { watcher.close(); }
  assert.equal((await stat(output)).ino, directory.ino, 'rebuild preserves the directory watched by Wrangler on Windows');
  assert.equal(await readFile(resolve(output, 'index.html'), 'utf8'), first);
  assert.equal((await readdir(output)).includes('obsolete.css'), false);
});

test('local Golos Text subsets are valid WOFF2 files with the redistribution license', async () => {
  const css = await readFile(resolve(root, 'public/style.css'), 'utf8');
  const fonts = [...css.matchAll(/url\('([^']+\.woff2)'\)/g)];
  assert.equal(fonts.length, 4);
  for (const [, font] of fonts) {
    const bytes = await readFile(resolve(root, 'public', '.' + font));
    assert.equal(bytes.toString('ascii', 0, 4), 'wOF2');
    assert.equal(bytes.readUInt32BE(8), bytes.length);
  }
  assert.match(await readFile(resolve(root, 'public/fonts/Golos-Text-OFL.txt'), 'utf8'), /SIL OPEN FONT LICENSE Version 1\.1/);
  assert.equal([...css.matchAll(/font-display:swap/g)].length, 4);
});

test('asset builder refuses to clean public, the checkout or arbitrary directories', async () => {
  for (const path of [root, resolve(root, 'public'), resolve(root, '../.site-assets'), resolve(root, 'public/.site-assets')]) {
    await assert.rejects(prepareAssets(path), /dedicated .site-assets/);
  }
});
