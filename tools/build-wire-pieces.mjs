// Derive the Wire piece set (vendor/pieces-stone-wire/) from the Stone set (vendor/pieces-stone/).
// node tools/build-wire-pieces.mjs   (run again after changing a Stone SVG; the output is checked in)
// Same silhouettes, same 45x45 viewBox, same one cue per piece, but drawn as ink line art for the Wire board
// (a paper-white drafting sheet). The two sides follow the printed-diagram convention, which reads at a glance even on
// the 34 px post-mortem board: White is a hollow ink outline (filled with the paper colour, so the hatch on a dark square
// does not run through it), Black is a solid ink silhouette with a paper hairline just inside the outline (the
// engraved double line is what keeps it line art rather than a blob). The cue is a line in the opposite colour:
// the king's cross becomes a plus, the knight's eye a dot, the bishop's slit stays a cut through the piece.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const SRC = path.join(ROOT, 'vendor/pieces-stone'), OUT = path.join(ROOT, 'vendor/pieces-stone-wire');
const INK = '#1d2433', PAPER = '#f4f1e8';
const W = 2.2;     // outline width in viewBox units (about 1.8 CSS px on the phone's chess board)
const HAIR = .9;   // Black's paper hairline, just inside the outline
const LJ = ' stroke-linejoin="round"';

// the absolute M/H/V/Z path of the king's cross, walked to its bounding box: the plus runs down the middle of each arm
function plus(d) {
  const t = d.match(/[MHVZ]|-?\d*\.?\d+/g); let x = 0, y = 0, cmd = ''; const xs = [], ys = [], vx = [], hy = [];
  for (let i = 0; i < t.length; i++) {
    if (/[MHVZ]/.test(t[i])) { cmd = t[i]; continue; }
    if (cmd === 'M') { x = +t[i]; y = +t[++i]; } else if (cmd === 'H') x = +t[i]; else if (cmd === 'V') y = +t[i];
    xs.push(x); ys.push(y);
  }
  const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
  for (let i = 0; i < xs.length; i++) { if (ys[i] === y0) vx.push(xs[i]); if (xs[i] === x0) hy.push(ys[i]); }   // the top arm's two x, the left arm's two y
  const cx = (Math.min(...vx) + Math.max(...vx)) / 2, cy = (Math.min(...hy) + Math.max(...hy)) / 2, r = (v) => +v.toFixed(2);
  return 'M' + r(cx) + ' ' + r(y0 + .6) + 'V' + r(y1 - .6) + 'M' + r(x0 + .6) + ' ' + r(cy) + 'H' + r(x1 - .6);
}

function wire(name, svg) {
  const black = name[0] === 'b';
  const body = svg.match(/<path id="b" d="([^"]+)"\/>/)[1];
  const head = svg.match(/<circle id="c" cx="([\d.]+)" cy="([\d.]+)" r="([\d.]+)"\/>/);
  const cross = svg.match(/<path d="(M[\d.]+ [\d.]+H[^"]+Z)" fill=/);
  const eye = svg.match(/<circle cx="([\d.]+)" cy="([\d.]+)" r="1\.9"/);
  const slit = svg.match(/<mask id="m"><rect[^>]*\/><path d="([^"]+)" stroke="#000" stroke-width="([\d.]+)"\/><\/mask>/);
  const shapes = ['b'].concat(head ? ['c'] : []);
  let defs = '<path id="b" d="' + body + '"/>' + (head ? '<circle id="c" cx="' + head[1] + '" cy="' + head[2] + '" r="' + head[3] + '"/>' : '');
  if (black || slit) defs += shapes.map((s) => '<clipPath id="k' + s + '"><use xlink:href="#' + s + '"/></clipPath>').join('');   // the hairline and the slit edges stay inside the body
  if (slit) defs += '<mask id="m"><rect width="45" height="45" fill="#fff"/><path d="' + slit[1] + '" stroke="#000" stroke-width="' + slit[2] + '"/></mask>';
  let g = '';
  for (const s of shapes) {
    if (!black) { g += '<use xlink:href="#' + s + '" fill="' + PAPER + '" stroke="' + INK + '" stroke-width="' + W + '"' + LJ + '/>'; continue; }
    g += '<use xlink:href="#' + s + '" fill="' + INK + '" stroke="' + INK + '" stroke-width="' + W + '"' + LJ + '/>'
      + '<use xlink:href="#' + s + '" fill="none" stroke="' + PAPER + '" stroke-width="' + +(W + 2 * HAIR).toFixed(2) + '"' + LJ + ' clip-path="url(#k' + s + ')"/>'
      + '<use xlink:href="#' + s + '" fill="none" stroke="' + INK + '" stroke-width="' + W + '"' + LJ + ' clip-path="url(#k' + s + ')"/>';
  }
  if (slit) {   // the cut keeps the body's edge treatment along both sides: an ink line for White, ink then paper hairline for Black
    const gap = +slit[2], line = (c, w) => '<path d="' + slit[1] + '" stroke="' + c + '" stroke-width="' + +w.toFixed(2) + '" clip-path="url(#kb)"/>';
    g += black ? line(PAPER, gap + W + 2 * HAIR) + line(INK, gap + W) : line(INK, gap + W);
  }
  const cue = black ? PAPER : INK;
  if (cross) g += '<path d="' + plus(cross[1]) + '" fill="none" stroke="' + cue + '" stroke-width="1.9" stroke-linecap="round"/>';
  if (eye) g += '<circle cx="' + eye[1] + '" cy="' + eye[2] + '" r="1.7" fill="' + cue + '"/>';
  return '<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 45 45">\n'
    + '<defs>' + defs + '</defs>\n' + (slit ? '<g mask="url(#m)">' + g + '</g>' : g) + '\n</svg>\n';
}

fs.mkdirSync(OUT, { recursive: true });
const names = fs.readdirSync(SRC).filter((f) => /^[wb][KQRBNP]\.svg$/.test(f)).sort();
for (const f of names) fs.writeFileSync(path.join(OUT, f), wire(f, fs.readFileSync(path.join(SRC, f), 'utf8')));
console.log('vendor/pieces-stone-wire/: ' + names.length + ' pieces from vendor/pieces-stone/');
