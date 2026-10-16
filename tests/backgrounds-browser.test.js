import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawn } from 'node:child_process';

// Optional real-layout regression: BROWSER_BIN can point to any Chromium binary.
// Run with node --test tests/backgrounds-browser.test.js. No visible browser/cursor.
const browser = [process.env.BROWSER_BIN,
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  '/usr/bin/chromium', '/usr/bin/google-chrome',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
].find(path => path && existsSync(path));

test('background artwork survives Windows transparency, motion and performance settings', {
  skip: !browser && 'Set BROWSER_BIN to run the real-browser regression', timeout: 60000,
}, async () => {
  const profile = mkdtempSync(join(tmpdir(), 'shishki-background-test-'));
  const child = spawn(browser, ['--headless', '--disable-gpu', '--no-first-run',
    '--no-default-browser-check', '--disable-background-networking',
    '--remote-debugging-pipe', '--user-data-dir=' + profile],
  { windowsHide: true, stdio: ['ignore', 'ignore', 'ignore', 'pipe', 'pipe'] });
  const exited = new Promise(resolve => child.once('exit', resolve));
  let id = 0, buffer = '';
  const pending = new Map();
  child.stdio[4].on('data', chunk => {
    buffer += chunk.toString();
    let end;
    while ((end = buffer.indexOf('\0')) >= 0) {
      const message = JSON.parse(buffer.slice(0, end)); buffer = buffer.slice(end + 1);
      const waiter = pending.get(message.id);
      if (waiter) {
        pending.delete(message.id); clearTimeout(waiter.timer);
        if (message.error) waiter.reject(new Error(JSON.stringify(message.error)));
        else waiter.resolve(message.result);
      }
    }
  });
  const send = (method, params = {}, sessionId) => new Promise((resolve, reject) => {
    const key = ++id;
    const timer = setTimeout(() => { pending.delete(key); reject(new Error(method + ' timed out')); }, 10000);
    pending.set(key, { resolve, reject, timer });
    child.stdio[3].write(JSON.stringify({ id: key, method, params, sessionId }) + '\0');
  });
  try {
    const { targetId } = await send('Target.createTarget', { url: 'about:blank' });
    const { sessionId } = await send('Target.attachToTarget', { targetId, flatten: true });
    const cdp = (method, params) => send(method, params, sessionId);
    const source = readFileSync(new URL('../public/index.html', import.meta.url), 'utf8');
    const css = [...source.matchAll(/<link[^>]*href="([^"]+\.css)"[^>]*>/g)]
      .map(([, href]) => readFileSync(new URL('../public' + href, import.meta.url), 'utf8')).join('\n');
    const body = source.slice(source.indexOf('<body'), source.indexOf('</body>') + 7)
      .replace(/<script\b[^>]*>[\s\S]*?<\/script>/g, '');
    const html = '<!doctype html><html><head><style>' + css
      + '\n.ambient-mode{transition:none!important}</style></head>' + body + '</html>';
    const { frameTree } = await cdp('Page.getFrameTree');
    await cdp('Page.setDocumentContent', { frameId: frameTree.frame.id, html });
    for (const width of [390, 1366]) for (const transparency of ['no-preference', 'reduce']) for (const motion of ['no-preference', 'reduce']) {
      await cdp('Emulation.setDeviceMetricsOverride', { width, height: 900, deviceScaleFactor: 1, mobile: false });
      await cdp('Emulation.setEmulatedMedia', { features: [
        { name: 'prefers-reduced-transparency', value: transparency },
        { name: 'prefers-reduced-motion', value: motion },
      ] });
      const { result, exceptionDetails } = await cdp('Runtime.evaluate', { returnByValue: true, expression: `(() => {
        const errors = []; let count = 0;
        const scenes = [...document.querySelectorAll('[data-scene]')];
        const ambient = document.querySelector('.ambient-scene');
        for (const theme of ['mocha','pulse','alduin','80s-after-dark','8008','classic'])
        for (const low of [false,true]) for (const match of [false,true]) for (const scene of scenes) {
          document.documentElement.dataset.theme = theme;
          document.documentElement.dataset.lowPerformance = String(low);
          document.body.classList.toggle('in-match', match);
          scenes.forEach(el => el.classList.toggle('is-active', el === scene));
          const label = [theme,low,match,scene.dataset.scene].join('/');
          const style = getComputedStyle(ambient), rect = ambient.getBoundingClientRect();
          if (style.display === 'none' || Number(style.opacity) < .5 || rect.width < innerWidth - 30 || rect.height < innerHeight)
            errors.push(label + ': background hidden');
          if (getComputedStyle(scene).opacity !== '1' || getComputedStyle(scene).backgroundImage === 'none')
            errors.push(label + ': scene hidden');
          const art = [...scene.children].filter(el => {
            const s = getComputedStyle(el), r = el.getBoundingClientRect();
            return s.display !== 'none' && s.visibility !== 'hidden' && Number(s.opacity) > 0 &&
              r.width > 0 && r.height > 0 && r.right > 0 && r.left < innerWidth && r.bottom > 0 && r.top < innerHeight;
          });
          if (!art.length) errors.push(label + ': artwork hidden');
          if (low || matchMedia('(prefers-reduced-motion:reduce)').matches) {
            if (art.some(el => getComputedStyle(el).animationName !== 'none')) errors.push(label + ': static mode animates');
          } else {
            document.body.classList.add('ambient-paused');
            if (art.some(el => getComputedStyle(el).animationName !== 'none' && getComputedStyle(el).animationPlayState !== 'paused'))
              errors.push(label + ': hidden tab animates');
            document.body.classList.remove('ambient-paused');
          }
          count++;
        }
        return { errors, count, reducedTransparency:matchMedia('(prefers-reduced-transparency:reduce)').matches,
          reducedMotion:matchMedia('(prefers-reduced-motion:reduce)').matches };
      })()` });
      assert.equal(exceptionDetails, undefined);
      assert.equal(result.value.reducedTransparency, transparency === 'reduce');
      assert.equal(result.value.reducedMotion, motion === 'reduce');
      assert.equal(result.value.count, 192);
      assert.deepEqual(result.value.errors, [], `${width}px / transparency=${transparency} / motion=${motion}`);
    }
  } finally {
    for (const { timer } of pending.values()) clearTimeout(timer);
    child.kill(); await exited;
    // Only the dedicated directory returned by mkdtemp above is removed.
    rmSync(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  }
});
