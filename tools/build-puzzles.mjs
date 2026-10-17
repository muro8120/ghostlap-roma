// Builds puzzles-data.js, the offline tactics set, from the lichess puzzle database (CC0).
//   curl -L -o /some/empty/dir/lichess_db_puzzle.csv.zst https://database.lichess.org/lichess_db_puzzle.csv.zst
//   node tools/build-puzzles.mjs /some/empty/dir/lichess_db_puzzle.csv.zst [--out puzzles-data.js]
// Download it outside the repo (about 300 MB). The file is only parsed: every field is checked against a strict pattern
// before it goes anywhere near the output, and every puzzle is replayed through vendor/chess.js.
// Selection (the build contract, docs: README "Tactics"):
//   Rating 500..1400, RatingDeviation <= 90, Popularity >= 90, NbPlays >= 2000, 2..6 solver moves.
//   Four rating bands (500-799, 800-999, 1000-1199, 1200-1400), up to 900 each. Inside a band no primary theme above 20%.
//   Puzzles whose only themes are length tags (short, long, veryLong, oneMove) are dropped.
//   Order inside a band is a seeded hash of the puzzle id, so the same source file always gives the same output.
// The lichess file is a pzstd stream (a skippable frame holding the size before every zstd frame); node's zstd decoder
// does not skip those, so SkipFrames below removes them first.
import fs from 'fs';
import path from 'path';
import zlib from 'zlib';
import crypto from 'crypto';
import readline from 'readline';
import { Transform } from 'stream';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const HERE = path.dirname(new URL(import.meta.url).pathname);
const { Chess } = require(path.join(HERE, '..', 'vendor', 'chess.js'));

const SRC = process.argv[2];
const OUT = process.argv.includes('--out') ? path.resolve(process.argv[process.argv.indexOf('--out') + 1]) : path.join(HERE, '..', 'puzzles-data.js');
if (!SRC || SRC.startsWith('--') || !fs.existsSync(SRC)) { console.error('usage: node tools/build-puzzles.mjs <path-to-lichess_db_puzzle.csv.zst> [--out file]'); process.exit(2); }

const SEED = 'ghostlap-puzzles-v1';
const BANDS = [[500, 799], [800, 999], [1000, 1199], [1200, 1400]];
const TARGET = 900, CAP = 0.2, MAX_BYTES = 450 * 1024;
const LENGTH = new Set(['short', 'long', 'veryLong', 'oneMove']);
const META = new Set(['master', 'masterVsMaster', 'superGM']);         // about the source game, not the position: not shown
const PHASE = ['endgame', 'middlegame', 'opening'];
const GOAL = ['mate', 'crushing', 'advantage', 'equality'];
// concrete motifs first (in this order); broad attacking tags after; then mate length, endgame type, phase, goal
const MOTIFS = ['fork', 'pin', 'skewer', 'discoveredAttack', 'discoveredCheck', 'doubleCheck', 'hangingPiece', 'trappedPiece', 'deflection',
  'attraction', 'clearance', 'interference', 'intermezzo', 'xRayAttack', 'capturingDefender', 'quietMove', 'zugzwang', 'promotion',
  'underPromotion', 'enPassant', 'castling', 'collinearMove', 'defensiveMove', 'attackingF2F7', 'advancedPawn'];
const BROAD = ['sacrifice', 'exposedKing', 'kingsideAttack', 'queensideAttack'];
function rank(t) {
  if (/^[a-z]+Mate$/i.test(t) && t !== 'mate') return 0;               // a named mate pattern says the most
  const m = MOTIFS.indexOf(t); if (m >= 0) return 1 + m / 100;
  if (BROAD.includes(t)) return 3 + BROAD.indexOf(t) / 100;
  if (/^mateIn\d$/.test(t)) return 4;
  if (/^[a-z]+Endgame$/.test(t) && t !== 'endgame') return 5;
  if (PHASE.includes(t)) return 6 + PHASE.indexOf(t) / 100;
  if (GOAL.includes(t)) return 7 + GOAL.indexOf(t) / 100;
  return 2;                                                              // a theme lichess added after this was written: treat as a motif
}
// stored tags: length and source tags dropped, the primary theme first, the rest in lichess order
function tagsOf(themes) {
  const keep = themes.filter((t) => !LENGTH.has(t) && !META.has(t));
  if (!keep.length) return null;
  let best = 0; for (let i = 1; i < keep.length; i++) if (rank(keep[i]) < rank(keep[best])) best = i;
  return [keep[best]].concat(keep.filter((_, i) => i !== best));
}

// strict field patterns: anything else is skipped, so nothing from the file can break out of the JS string literal
const RX = {
  id: /^[A-Za-z0-9]{5,8}$/,
  fen: /^[1-8pnbrqkPNBRQK]+(\/[1-8pnbrqkPNBRQK]+){7} [wb] (-|K?Q?k?q?) (-|[a-h][36]) \d{1,3} \d{1,4}$/,
  uci: /^[a-h][1-8][a-h][1-8][qrbn]?$/,
  num: /^-?\d{1,6}$/,
  theme: /^[A-Za-z0-9]{2,32}$/,
};
function replay(fen, moves) {
  let c; try { c = new Chess(fen); } catch (e) { return false; }
  if (!c.validate_fen(fen).valid) return false;
  for (const u of moves) { const m = c.move({ from: u.slice(0, 2), to: u.slice(2, 4), promotion: u[4] }); if (!m) return false; }
  return true;
}

class SkipFrames extends Transform {
  constructor() { super(); this.st = 'hdr'; this.left = 0; this.hold = null; }
  _transform(chunk, enc, cb) {
    let b = this.hold ? Buffer.concat([this.hold, chunk]) : chunk; this.hold = null;
    while (b.length) {
      if (this.st === 'raw') { this.push(b); break; }
      if (this.st === 'pass' || this.st === 'skip') {
        const n = Math.min(this.left, b.length); if (this.st === 'pass') this.push(b.subarray(0, n));
        b = b.subarray(n); this.left -= n; if (!this.left) this.st = 'hdr'; continue;
      }
      if (b.length < 12) { this.hold = Buffer.from(b); break; }
      const magic = b.readUInt32LE(0);
      if (((magic & 0xFFFFFFF0) >>> 0) === 0x184D2A50) {                  // skippable frame
        const size = b.readUInt32LE(4);
        if (size === 4) { this.left = b.readUInt32LE(8); this.st = 'pass'; b = b.subarray(12); }   // pzstd: size of the next frame
        else { this.left = size; this.st = 'skip'; b = b.subarray(8); }
      } else this.st = 'raw';                                               // plain zstd from here on
    }
    cb();
  }
  _flush(cb) { if (this.hold) this.push(this.hold); cb(); }
}

const hash = (id) => crypto.createHash('sha1').update(SEED + ':' + id).digest('hex');
const bandOf = (r) => BANDS.findIndex(([lo, hi]) => r >= lo && r <= hi);
const pool = BANDS.map(() => []);
let rows = 0, bad = 0, illegal = 0, lenOnly = 0, col = null;
const input = fs.createReadStream(SRC).pipe(new SkipFrames()).pipe(zlib.createZstdDecompress());
for await (const line of readline.createInterface({ input, crlfDelay: Infinity })) {
  if (!col) { col = {}; line.split(',').forEach((h, i) => { col[h.trim()] = i; }); for (const k of ['PuzzleId', 'FEN', 'Moves', 'Rating', 'RatingDeviation', 'Popularity', 'NbPlays', 'Themes']) if (!(k in col)) throw new Error('missing column ' + k); continue; }
  rows++;
  const f = line.split(',');
  const id = f[col.PuzzleId], fen = f[col.FEN], mv = (f[col.Moves] || '').split(' '), th = (f[col.Themes] || '').split(' ');
  const nums = [f[col.Rating], f[col.RatingDeviation], f[col.Popularity], f[col.NbPlays]];
  if (!RX.id.test(id || '') || !RX.fen.test(fen || '') || !mv.every((u) => RX.uci.test(u)) || !nums.every((n) => RX.num.test(n || '')) || !th.every((t) => RX.theme.test(t))) { bad++; continue; }
  const [rating, rd, pop, plays] = nums.map(Number);
  const band = bandOf(rating);
  if (band < 0 || rd > 90 || pop < 90 || plays < 2000) continue;
  if (mv.length % 2 || mv.length / 2 < 2 || mv.length / 2 > 6) continue;   // Moves[0] is theirs; solver moves = length / 2
  const tags = tagsOf(th); if (!tags) { lenOnly++; continue; }
  if (!replay(fen, mv)) { illegal++; continue; }
  pool[band].push({ id, fen, moves: mv.join(' '), rating, tags, h: hash(id) });
}

// greedy over the seeded order, capping the primary theme; if a band comes up short, shrink the target until the cap holds
function pick(cands) {
  cands.sort((a, b) => (a.h < b.h ? -1 : a.h > b.h ? 1 : 0));
  let target = Math.min(TARGET, cands.length);
  for (;;) {
    const cap = Math.floor(CAP * target), n = {}, out = [];
    for (const c of cands) { if (out.length >= target) break; const p = c.tags[0]; if ((n[p] || 0) >= cap) continue; n[p] = (n[p] || 0) + 1; out.push(c); }
    if (Object.values(n).every((k) => k <= CAP * out.length)) return out;
    target = out.length - 1;
  }
}
const chosen = pool.map(pick);
const all = [].concat(...chosen).sort((a, b) => a.rating - b.rating || (a.id < b.id ? -1 : 1));
const body = all.map((p) => [p.id, p.fen, p.moves, p.rating, p.tags.join(' ')].join('|')).join('\n');
const date = new Date().toISOString().slice(0, 10);
const head = [
  '// Ghostlap Roma: tactics puzzles for the TACTICS screen (puzzles.js). GENERATED by tools/build-puzzles.mjs; do not edit by hand.',
  '// Source: the lichess.org open puzzle database, https://database.lichess.org/#puzzles (lichess_db_puzzle.csv.zst).',
  '// Licence: Creative Commons CC0 1.0 (public domain dedication) by lichess.org. Built ' + date + ' from ' + rows + ' puzzles.',
  '// Selection: Rating 500..1400, RatingDeviation <= 90, Popularity >= 90, NbPlays >= 2000, 2..6 solver moves, replayed legal with',
  '// chess.js. Bands 500-799 / 800-999 / 1000-1199 / 1200-1400: ' + chosen.map((c) => c.length).join(' / ') + ' puzzles; no primary theme above 20% of a band.',
  '// Seeded order (sha1 of "' + SEED + ':" + id), so the same source gives the same file.',
  '// Format: one row per puzzle, "id|fen|moves|rating|themes", rows split by \\n. FEN is the position BEFORE the opponent\'s move;',
  '// moves are UCI, moves[0] is the opponent\'s, then solver, opponent, ... ending on the solver. themes: the primary theme first,',
  '// then the other lichess themes (length tags and master/superGM source tags dropped).',
];
const js = head.join('\n') + '\n(typeof window !== \'undefined\' ? window : globalThis).PUZZLES = ' + JSON.stringify(body) + ';\n';
fs.writeFileSync(OUT, js);

console.log('rows ' + rows + ', malformed ' + bad + ', illegal ' + illegal + ', length-tags-only ' + lenOnly);
BANDS.forEach(([lo, hi], i) => {
  const n = {}; for (const p of chosen[i]) n[p.tags[0]] = (n[p.tags[0]] || 0) + 1;
  const top = Object.entries(n).sort((a, b) => b[1] - a[1]).slice(0, 6).map(([t, k]) => t + ' ' + (k / chosen[i].length * 100).toFixed(1) + '%').join(', ');
  console.log(lo + '-' + hi + ': pool ' + pool[i].length + ', chose ' + chosen[i].length + ' (' + top + ')');
});
console.log('wrote ' + path.relative(process.cwd(), OUT) + ': ' + all.length + ' puzzles, ' + (js.length / 1024).toFixed(1) + ' KB');
if (js.length > MAX_BYTES) { console.error('puzzles-data.js is over ' + MAX_BYTES / 1024 + ' KB'); process.exit(1); }
