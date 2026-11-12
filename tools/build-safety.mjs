// Ghostlap Roma: builds safety-data.js, the positions for the SAFE OR NOT drill (safety.js), from the tactics set.
// node tools/build-safety.mjs [--max 600] [--out safety-data.js]      (about a second per position on the lite engine)
//
// Every lichess puzzle starts with a real human blunder: the FEN is the position before it, moves[0] is the blunder and the
// rest is its punishment. This script keeps the easy ones (two solver moves, rated up to 1100) and asks Stockfish for a
// second move in the same position that is safe, so each position gives a matched pair: one move that loses, one that
// does not, and nothing in the position itself says which you are being shown.
//   - the blunder must cost at least 2 pawns against the engine's best (depth 12), or allow a forced mate;
//   - the safe move comes from the engine's top five, within half a pawn of its best, and is searched again on its own
//     (depth 14) to confirm it; a move by the same piece as the blunder is preferred, then a quiet one;
//   - positions where the mover is already 1.5 pawns down, or where the best move is a forced mate, are left out.
// Seeded by the puzzle order in puzzles-data.js, 'ucinewgame' before every search: the same input gives the same file.
import { createRequire } from 'module';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
const require = createRequire(import.meta.url);
const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const { Chess } = require(path.join(ROOT, 'vendor/chess.js'));
const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const MAX = +arg('--max', 600), OUT = path.resolve(arg('--out', path.join(ROOT, 'safety-data.js'))), TOP = 1100;
require(path.join(ROOT, 'puzzles-data.js'));
const rows = String(globalThis.PUZZLES).split('\n').map((r) => r.split('|')).filter((f) => f.length === 5)
  .map((f) => ({ id: f[0], fen: f[1], moves: f[2].split(' '), rating: +f[3], themes: f[4].split(' ') }))
  .filter((p) => p.moves.length === 4 && p.rating <= TOP);
const mv = (u) => ({ from: u.slice(0, 2), to: u.slice(2, 4), promotion: u[4] });

function uci() {
  const argv = process.argv; process.argv = argv.slice(0, 2);
  let sf; try { sf = require(path.join(ROOT, 'vendor/stockfish-19-lite-single.js')); } finally { process.argv = argv; }
  const eng = sf(); let cb = null;
  eng.listener = (l) => { if (cb) cb(String(l)); };
  const send = (c) => setTimeout(() => eng.processCommand(c), 0);   // never from inside the listener (see endgames-test.js)
  const until = (pred) => new Promise((res) => { cb = (l) => { if (pred(l)) res(l); }; });
  return {
    async ready() { send('uci'); await until((l) => l === 'uciok'); },
    // scores are from the side to move; a mate is +-(100000 - plies)
    async search(fen, depth, multipv) {
      send('ucinewgame'); send('setoption name MultiPV value ' + multipv); send('isready'); await until((l) => l === 'readyok');
      const lines = {};
      const done = new Promise((res) => { cb = (l) => {
        if (l.startsWith('bestmove')) return res();
        const d = /\bdepth (\d+)/.exec(l), sc = /\bscore (cp|mate) (-?\d+)/.exec(l), k = /\bmultipv (\d+)/.exec(l), pv = /\bpv (.+)$/.exec(l);
        if (!d || !sc || !pv || /\b(upper|lower)bound\b/.test(l)) return;
        const v = sc[1] === 'cp' ? +sc[2] : (+sc[2] > 0 ? 100000 - +sc[2] : -100000 - +sc[2]);
        lines[k ? +k[1] : 1] = { v, mate: sc[1] === 'mate', move: pv[1].split(' ')[0] };
      }; });
      send('position fen ' + fen); send('go depth ' + depth);
      await done;
      return Object.keys(lines).map(Number).sort((a, b) => a - b).map((k) => lines[k]);
    },
  };
}

const sf = uci(); await sf.ready();
const out = []; let tried = 0; const t0 = Date.now(), why = {};
const skip = (k) => { why[k] = (why[k] || 0) + 1; };
for (const p of rows) {
  if (out.length >= MAX) break;
  tried++;
  const top = await sf.search(p.fen, 12, 5);
  if (!top.length) { skip('no lines'); continue; }
  const best = top[0];
  if (best.mate) { skip('mate on the board'); continue; }
  if (best.v < -150) { skip('already losing'); continue; }
  const c = new Chess(p.fen), bl = c.move(mv(p.moves[0]));
  if (!bl) { skip('illegal'); continue; }
  const after = await sf.search(c.fen(), 12, 1);
  const blV = after.length ? -after[0].v : 0;
  if (best.v - blV < 200) { skip('blunder under 2 pawns'); continue; }
  const cands = top.filter((l) => l.move !== p.moves[0] && !l.mate && best.v - l.v <= 50).map((l) => {
    const t = new Chess(p.fen), m = t.move(mv(l.move));
    return m ? { l, m, like: (m.from === bl.from ? 2 : 0) + (!m.captured && !/[+#]/.test(m.san) ? 1 : 0) } : null;
  }).filter(Boolean).sort((a, b) => b.like - a.like || b.l.v - a.l.v);
  let safe = null;
  for (const k of cands.slice(0, 2)) {
    const t = new Chess(p.fen); t.move(mv(k.l.move));
    const chk = await sf.search(t.fen(), 14, 1);
    if (chk.length && best.v - -chk[0].v <= 60) { safe = k; break; }
  }
  if (!safe) { skip('no safe twin'); continue; }
  out.push([p.id, p.fen, p.moves[0], p.moves.slice(1).join(' '), safe.l.move, p.rating].join('|'));
  if (out.length % 25 === 0) console.log(out.length + ' kept of ' + tried + ' tried, ' + Math.round((Date.now() - t0) / 1000) + ' s');
}
const head = `// Ghostlap Roma: positions for the SAFE OR NOT drill (safety.js). GENERATED by tools/build-safety.mjs; do not edit by hand.
// Source: the puzzles in puzzles-data.js (lichess.org open puzzle database, CC0 1.0). Each row is a position before a real
// human blunder, the blunder, its punishment, and a safe move in the same position found by Stockfish (see the build script).
// Selection: two solver moves, rated up to ${TOP}; the blunder costs 2 pawns or more, the safe move within 0.6 of the best.
// Format: one row per position, "id|fen|blunder|punishment line|safe|rating", moves in UCI, rows split by \\n.
`;
fs.writeFileSync(OUT, head + "(typeof window !== 'undefined' ? window : globalThis).SAFETY = " + JSON.stringify(out.join('\n')) + ';\n');
console.log('wrote ' + OUT + ': ' + out.length + ' positions from ' + tried + ' tried', why);
process.exit(0);
