import { createHash } from 'node:crypto';
import { cp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { basename, isAbsolute, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const source = resolve(root, 'public');
const normalize = text => text.replace(/\r\n?/g, '\n');
const attributes = tag => Object.fromEntries([...tag.matchAll(/([\w-]+)\s*=\s*["']([^"']*)["']/g)].map(([, key, value]) => [key.toLowerCase(), value]));

// CSS travels with the document: no dependency on separate stylesheet requests
// or third-party fonts. Exact CSP hashes authorize only the generated CSS.
export async function prepareAssets(outputDir = resolve(root, '.site-assets')) {
  outputDir = resolve(outputDir);
  const inside = relative(root, outputDir);
  if (!inside || inside.startsWith('..') || isAbsolute(inside) || basename(outputDir) !== '.site-assets' || outputDir.startsWith(source)) {
    throw new Error('Asset output must be a dedicated .site-assets directory inside the project, outside public.');
  }
  const pages = (await readdir(source)).filter(name => name.endsWith('.html')).sort();
  const generated = [], hashes = new Set();
  for (const page of pages) {
    let html = normalize(await readFile(resolve(source, page), 'utf8'));
    const links = [...html.matchAll(/<link\b[^>]*>/gi)].filter(([tag]) => attributes(tag).rel === 'stylesheet');
    if (!links.length || /<style\b/i.test(html)) throw new Error(`${page}: expected linked source styles only`);
    const styles = [];
    for (const [tag] of links) {
      const { href, media } = attributes(tag);
      if (!href || !/^\/[\w/-]+\.css$/.test(href) || media) throw new Error(`${page}: unsupported stylesheet ${tag}`);
      const css = normalize(await readFile(resolve(source, '.' + href), 'utf8'));
      if (/@import\b|<\/style/i.test(css)) throw new Error(`${href}: imports and closing style tags are not allowed`);
      // Bundling changes the base URL; current assets must use root-relative URLs.
      for (const [, url] of css.matchAll(/url\(\s*["']?([^"')\s]+)/gi)) {
        if (!url.startsWith('/') || url.startsWith('//')) throw new Error(`${href}: use a same-origin root-relative asset URL`);
      }
      styles.push(`/* ${href} */\n${css}`);
    }
    const css = styles.join('\n');
    const hash = `'sha256-${createHash('sha256').update(css).digest('base64')}'`;
    hashes.add(hash);
    let first = true;
    html = html.replace(/<link\b[^>]*>/gi, tag => {
      if (attributes(tag).rel !== 'stylesheet') return tag;
      if (!first) return '';
      first = false;
      return `<style id="page-styles">${css}</style>`;
    });
    generated.push({ page, html, hash, stylesheets: links.length });
  }
  let headers = normalize(await readFile(resolve(source, '_headers'), 'utf8'));
  if (!/style-src 'self';/.test(headers)) throw new Error('Expected a strict same-origin source style policy');
  headers = headers.replace("style-src 'self';", `style-src 'self' ${[...hashes].join(' ')};`);
  if (headers.split('\n').some(line => line.length > 2000)) throw new Error('Cloudflare header line exceeds 2000 characters');

  // The resolved destination was checked above; never clean the source checkout.
  await rm(outputDir, { recursive: true, force: true });
  await mkdir(outputDir, { recursive: true });
  await cp(source, outputDir, { recursive: true });
  for (const { page, html } of generated) await writeFile(resolve(outputDir, page), html);
  await writeFile(resolve(outputDir, '_headers'), headers);
  return generated.map(({ page, hash, stylesheets }) => ({ page, hash, stylesheets }));
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const pages = await prepareAssets();
  console.log(`Prepared ${pages.length} pages with embedded styles, strict CSP hashes and local fonts.`);
}
