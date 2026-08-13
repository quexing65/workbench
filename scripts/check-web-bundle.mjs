import { gzipSync } from 'node:zlib';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const dist = join(root, 'apps', 'web', 'dist');
const html = readFileSync(join(dist, 'index.html'), 'utf8');
const initialFiles = [...html.matchAll(/(?:src|href)="\/?([^"?]+\.js)"/gu)].map(
  (match) => match[1],
);
const jsFiles = readdirSync(join(dist, 'assets'))
  .filter((file) => file.endsWith('.js'))
  .map((file) => join(dist, 'assets', file));

const largest = Math.max(...jsFiles.map((file) => statSync(file).size));
const initialGzip = initialFiles.reduce((total, file) => {
  if (file === undefined) return total;
  return total + gzipSync(readFileSync(join(dist, file))).byteLength;
}, 0);
const maxChunkBytes = 350 * 1024;
const maxInitialGzipBytes = 200 * 1024;

if (largest > maxChunkBytes) {
  throw new Error(`Largest JavaScript chunk is ${largest} bytes; limit is ${maxChunkBytes}`);
}
if (initialGzip > maxInitialGzipBytes) {
  throw new Error(
    `Initial JavaScript gzip total is ${initialGzip} bytes; limit is ${maxInitialGzipBytes}`,
  );
}

process.stdout.write(
  `Bundle budget passed: largest chunk ${(largest / 1024).toFixed(2)} KiB, initial gzip ${(initialGzip / 1024).toFixed(2)} KiB.\n`,
);
