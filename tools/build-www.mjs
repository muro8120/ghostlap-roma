// Copy the files the app needs into www/ for the Capacitor iOS shell.
// node tools/build-www.mjs   (or: npm run build:www)
// The file list comes from ASSETS + OPTIONAL in sw.js, so there is one list to keep up to date.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'www');

const sw = fs.readFileSync(path.join(ROOT, 'sw.js'), 'utf8');
function list(name) {
  const m = sw.match(new RegExp('const ' + name + '\\s*=\\s*(\\[[\\s\\S]*?\\]);'));
  if (!m) throw new Error('sw.js: could not find ' + name);
  return JSON.parse(m[1].replace(/'/g, '"'));
}
const required = list('ASSETS').filter((a) => a !== './');
const optional = list('OPTIONAL');
// sw.js keeps www/ usable as a plain web build too; the licences travel with the code they cover.
const extra = ['sw.js', 'vendor/STOCKFISH-LICENSE.txt', 'vendor/CHESSJS-LICENSE.txt', 'vendor/pieces/LICENSE.txt', 'vendor/three/LICENSE'];

fs.rmSync(OUT, { recursive: true, force: true });
let n = 0, bytes = 0;
function copy(rel, must) {
  const src = path.join(ROOT, rel);
  if (!fs.existsSync(src)) {
    if (must) throw new Error('missing required file: ' + rel);
    console.warn('skip (not present): ' + rel);
    return;
  }
  const dst = path.join(OUT, rel);
  fs.mkdirSync(path.dirname(dst), { recursive: true });
  fs.copyFileSync(src, dst);
  n++; bytes += fs.statSync(src).size;
}
for (const a of required) copy(a, true);
for (const a of optional) copy(a, false);
for (const a of extra) copy(a, false);
console.log(`www/: ${n} files, ${(bytes / 1048576).toFixed(1)} MB`);
