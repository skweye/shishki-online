import { mkdir, copyFile } from 'node:fs/promises';
await mkdir(new URL('../public/vendor/', import.meta.url), { recursive: true });
for (const [source, target] of [['dist/esm/chess.js', 'chess.js'], ['LICENSE', 'chess.LICENSE']]) {
  await copyFile(new URL('../node_modules/chess.js/' + source, import.meta.url), new URL('../public/vendor/' + target, import.meta.url));
}
