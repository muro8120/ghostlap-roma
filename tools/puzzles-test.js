// Checks the generated tactics set (puzzles-data.js) under node: every puzzle replays legally through vendor/chess.js,
// the selection rules hold, and the band and theme distributions are printed.
//   node tools/puzzles-test.js
const path = require('path');
const { Chess } = require(path.join(__dirname, '..', 'vendor', 'chess.js'));
require(path.join(__dirname, '..', 'puzzles-data.js'));
const fs = require('fs');
const SRC = fs.readFileSync(path.join(__dirname, '..', 'puzzles-data.js'), 'utf8');

const BANDS = [[500, 799], [800, 999], [1000, 1199], [1200, 1400]];
const LENGTH = new Set(['short', 'long', 'veryLong', 'oneMove']);
let fails = 0;
const check = (name, ok, extra) => { if (!ok) fails++; console.log((ok ? 'PASS ' : 'FAIL ') + name + (extra ? '  ' + extra : '')); };

const rows = String(globalThis.PUZZLES || '').split('\n');
const P = [], bad = [];
for (const r of rows) {
  const f = r.split('|');
  if (f.length !== 5) { bad.push(r.slice(0, 60)); continue; }
  P.push({ id: f[0], fen: f[1], moves: f[2].split(' '), rating: +f[3], themes: f[4].split(' ') });
}
check('every row has 5 fields', !bad.length, bad.length ? bad.length + ' bad, e.g. ' + bad[0] : P.length + ' puzzles');
check('ids are unique', new Set(P.map((p) => p.id)).size === P.length);

// replay: their move first (moves[0]), then the solver, alternating, ending on the solver's move
let illegal = [], wrongEnd = [], lenBad = [];
const solverMoves = {};
for (const p of P) {
  const c = new Chess();
  if (!c.validate_fen(p.fen).valid || !c.load(p.fen)) { illegal.push(p.id + ' fen'); continue; }
  const them = c.turn();
  if (p.moves.length % 2 || p.moves.length < 4 || p.moves.length > 12) lenBad.push(p.id);
  solverMoves[p.moves.length / 2] = (solverMoves[p.moves.length / 2] || 0) + 1;
  for (let i = 0; i < p.moves.length; i++) {
    const u = p.moves[i];
    if ((i % 2 === 0) !== (c.turn() === them)) { illegal.push(p.id + ' turn ' + i); break; }
    const m = c.move({ from: u.slice(0, 2), to: u.slice(2, 4), promotion: u[4] });
    if (!m) { illegal.push(p.id + ' ' + u + ' at ' + i); break; }
  }
  if (c.turn() !== them) wrongEnd.push(p.id);   // after the solver's last move it is their turn again
}
check('every move of every puzzle is legal', !illegal.length, illegal.length ? illegal.length + ': ' + illegal.slice(0, 5).join(', ') : P.length + ' replayed');
check('every line ends on the solver\'s move', !wrongEnd.length, wrongEnd.slice(0, 5).join(', '));
check('2..6 solver moves', !lenBad.length, Object.entries(solverMoves).map(([k, n]) => k + ' moves: ' + n).join(', '));
check('ratings within 500..1400', P.every((p) => p.rating >= 500 && p.rating <= 1400));
check('no puzzle with only length tags, none stored', P.every((p) => p.themes.length && p.themes.every((t) => t && !LENGTH.has(t))));

// bands: about 900 each (the lowest band is limited by the source: few 500-799 puzzles pass RD <= 90 and NbPlays >= 2000)
const head = /Bands 500-799 \/ 800-999 \/ 1000-1199 \/ 1200-1400: (\d+) \/ (\d+) \/ (\d+) \/ (\d+) puzzles/.exec(SRC);
const per = BANDS.map(([lo, hi]) => P.filter((p) => p.rating >= lo && p.rating <= hi));
console.log('\nBand        count  top primary themes');
per.forEach((b, i) => {
  const n = {}; for (const p of b) n[p.themes[0]] = (n[p.themes[0]] || 0) + 1;
  const top = Object.entries(n).sort((a, c) => c[1] - a[1]);
  console.log((BANDS[i].join('-')).padEnd(11) + ' ' + String(b.length).padStart(5) + '  ' + top.slice(0, 8).map(([t, k]) => t + ' ' + (k / b.length * 100).toFixed(1) + '%').join(', ') + ' (' + top.length + ' themes)');
});
const all = {}; for (const p of P) for (const t of p.themes) all[t] = (all[t] || 0) + 1;
console.log('\nAll themes (any position in the tag list):\n' + Object.entries(all).sort((a, b) => b[1] - a[1]).map(([t, k]) => t + ' ' + k).join(', ') + '\n');
check('header band counts match the data', !!head && per.every((b, i) => b.length === +head[i + 1]), head ? head.slice(1).join(' / ') : 'no header line');
per.forEach((b, i) => check('band ' + BANDS[i].join('-') + ' has about 900 (750..900)', b.length >= 750 && b.length <= 900, String(b.length)));
check('three upper bands are full at 900', per.slice(1).every((b) => b.length === 900));
per.forEach((b, i) => {
  const n = {}; for (const p of b) n[p.themes[0]] = (n[p.themes[0]] || 0) + 1;
  const [t, k] = Object.entries(n).sort((a, c) => c[1] - a[1])[0] || ['-', 0];
  check('band ' + BANDS[i].join('-') + ': no primary theme above 20%', k <= 0.2 * b.length, t + ' ' + (k / b.length * 100).toFixed(1) + '%');
});
check('file under 450 KB', SRC.length <= 450 * 1024, (SRC.length / 1024).toFixed(1) + ' KB');
check('header names the source and the CC0 licence', /database\.lichess\.org/.test(SRC) && /CC0/.test(SRC) && /Built \d{4}-\d\d-\d\d/.test(SRC));

console.log('\n' + (fails ? fails + ' FAILED' : 'all passed'));
process.exit(fails ? 1 : 0);
