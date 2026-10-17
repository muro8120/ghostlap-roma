// Render the app icon from tools/icon.svg into every PNG the app and the iOS project use.
// node tools/build-icon.mjs   (or: npm run build:icon)
// Writes icon-512.png, icon-192.png, icon-180.png (PWA and favicon), the 1024 px App Store icon in
// ios/App/App/Assets.xcassets/AppIcon.appiconset and the three 2732 px launch images in Splash.imageset
// (the icon at 380 px on the app's dark background, which is how the launch screen already looked).
// Uses the same headless Chromium as the e2e tests; the PNGs are written without an alpha channel, which
// App Store Connect insists on for the icon.
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const SVG = fs.readFileSync(path.join(ROOT, 'tools/icon.svg'), 'utf8');
const BG = '#0b0d12';
const { chromium } = (() => { try { return require('playwright'); } catch { return require('/opt/node-tools/node_modules/playwright'); } })();

const ICONS = [
  ['icon-512.png', 512], ['icon-192.png', 192], ['icon-180.png', 180],
  ['ios/App/App/Assets.xcassets/AppIcon.appiconset/AppIcon-512@2x.png', 1024],
];
const SPLASH = ['splash-2732x2732.png', 'splash-2732x2732-1.png', 'splash-2732x2732-2.png'].map((f) => 'ios/App/App/Assets.xcassets/Splash.imageset/' + f);

const page = (w, h, iconPx) => `<!doctype html><html><head><meta charset="utf-8"><style>
  html,body{margin:0;width:${w}px;height:${h}px;background:${BG};overflow:hidden}
  body{display:grid;place-items:center} svg{width:${iconPx}px;height:${iconPx}px;display:block}
</style></head><body>${SVG}</body></html>`;

const browser = await chromium.launch();
const ctx = await browser.newContext({ deviceScaleFactor: 1 });
const p = await ctx.newPage();
async function shot(w, h, iconPx) {
  await p.setViewportSize({ width: w, height: h });
  await p.setContent(page(w, h, iconPx));
  return rgb(await p.screenshot({ type: 'png', clip: { x: 0, y: 0, width: w, height: h } }));
}
for (const [rel, px] of ICONS) { fs.writeFileSync(path.join(ROOT, rel), await shot(px, px, px)); console.log(rel, px + 'px'); }
const splash = await shot(2732, 2732, 380);
for (const rel of SPLASH) { fs.writeFileSync(path.join(ROOT, rel), splash); console.log(rel, '2732px'); }
await browser.close();

// Strip the alpha channel from an 8-bit RGBA PNG (what Chromium writes) and return an 8-bit RGB one.
// Only the chunks the icon needs are kept: IHDR, IDAT, IEND.
function rgb(png) {
  const SIG = 8; let off = SIG; const idat = []; let ihdr;
  while (off < png.length) {
    const len = png.readUInt32BE(off), type = png.toString('ascii', off + 4, off + 8), data = png.subarray(off + 8, off + 8 + len);
    if (type === 'IHDR') ihdr = data; else if (type === 'IDAT') idat.push(data);
    off += 12 + len;
  }
  const w = ihdr.readUInt32BE(0), h = ihdr.readUInt32BE(4), depth = ihdr[8], ctype = ihdr[9];
  if (depth !== 8 || ihdr[12] !== 0) throw new Error('unexpected PNG layout');
  if (ctype === 2) return png;   // already RGB
  if (ctype !== 6) throw new Error('unexpected PNG colour type ' + ctype);
  const raw = zlib.inflateSync(Buffer.concat(idat)), bpp = 4, stride = w * bpp;
  const prev = Buffer.alloc(stride), cur = Buffer.alloc(stride), out = Buffer.alloc(h * (1 + w * 3));
  const paeth = (a, b, c) => { const pp = a + b - c, pa = Math.abs(pp - a), pb = Math.abs(pp - b), pc = Math.abs(pp - c); return pa <= pb && pa <= pc ? a : pb <= pc ? b : c; };
  for (let y = 0, src = 0, dst = 0; y < h; y++) {
    const f = raw[src++];
    for (let i = 0; i < stride; i++) {
      const x = raw[src++], a = i >= bpp ? cur[i - bpp] : 0, b = prev[i], c = i >= bpp ? prev[i - bpp] : 0;
      cur[i] = (f === 0 ? x : f === 1 ? x + a : f === 2 ? x + b : f === 3 ? x + ((a + b) >> 1) : x + paeth(a, b, c)) & 255;
    }
    out[dst++] = 0;   // filter: none
    for (let x = 0; x < w; x++) { out[dst++] = cur[x * 4]; out[dst++] = cur[x * 4 + 1]; out[dst++] = cur[x * 4 + 2]; }
    cur.copy(prev);
  }
  const hdr = Buffer.from(ihdr); hdr[9] = 2;
  return Buffer.concat([png.subarray(0, SIG), chunk('IHDR', hdr), chunk('IDAT', zlib.deflateSync(out, { level: 9 })), chunk('IEND', Buffer.alloc(0))]);
}
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td) >>> 0);
  return Buffer.concat([len, td, crc]);
}
const TABLE = new Int32Array(256).map((_, n) => { for (let k = 0; k < 8; k++) n = n & 1 ? 0xedb88320 ^ (n >>> 1) : n >>> 1; return n; });
function crc32(b) { let c = -1; for (let i = 0; i < b.length; i++) c = TABLE[(c ^ b[i]) & 255] ^ (c >>> 8); return c ^ -1; }
