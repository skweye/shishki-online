import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { parseHTML } from 'linkedom';

const base = new URL(process.argv[2] || 'http://127.0.0.1:8787');
const agents = {
  iPhone: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.6 Mobile/15E148 Safari/604.1',
  desktop: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36'
};
const pages = ['/', '/profile', '/shop', '/inventory', '/admin', '/privacy', '/terms'];
const fonts = new Set();
for (const [name, ua] of Object.entries(agents)) {
  for (const path of pages) {
    const response = await fetch(new URL(path, base), { headers: { 'User-Agent': ua, 'Cache-Control': 'no-cache' } });
    assert.equal(response.status, 200, `${name} ${path}`);
    assert.match(response.headers.get('content-type'), /text\/html/);
    const document = parseHTML(await response.text()).document;
    assert.equal(document.querySelectorAll('link[rel="stylesheet"]').length, 0, `${path}: separate CSS request`);
    const style = document.querySelector('#page-styles');
    assert.ok(style, `${name} ${path}: missing embedded styles`);
    assert.doesNotMatch(style.textContent, /@import|fonts\.google/);
    const hash = `'sha256-${createHash('sha256').update(style.textContent).digest('base64')}'`;
    const policy = response.headers.get('content-security-policy') || '';
    const stylePolicy = policy.split(';').find(directive => directive.trim().startsWith('style-src '));
    assert.ok(stylePolicy?.includes(hash), `${name} ${path}: CSS blocked by CSP`);
    assert.doesNotMatch(policy, /unsafe-inline/);
    for (const [, url] of style.textContent.matchAll(/url\('([^']+\.woff2)'\)/g)) fonts.add(url);
    console.log(`${name} ${path}: HTML + CSS + CSP OK`);
  }
}
for (const path of fonts) {
  const response = await fetch(new URL(path, base));
  assert.equal(response.status, 200, path);
  assert.match(response.headers.get('content-type'), /font\/woff2|application\/(?:font-woff|octet-stream)/);
  assert.equal(Buffer.from(await response.arrayBuffer()).toString('ascii', 0, 4), 'wOF2');
}
console.log(`${fonts.size} local fonts OK. HTTP checks do not emulate Safari rendering.`);
