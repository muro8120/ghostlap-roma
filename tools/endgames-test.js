// Check of the endgame catalogue in endgames.js: the shape of every position, the store maths (mastered, best, stats()),
// and an engine verdict on every position with the real Stockfish 19 Lite WASM under node at depth 20.
// Usage: node tools/endgames-test.js [--no-engine] [path/to/stockfish.js]
//   --no-engine  run only the shape and store checks (instant)
//   path         a Stockfish build to drive instead of the vendored one (also $STOCKFISH_JS); it needs its .wasm beside it
// Thresholds (never loosen them; fix the position instead): a K+Q or K+R mate must report a mate score for the learner;
// any other 'win' must be a mate for the learner or at least +500 cp from the learner's side; a 'draw' must be within ±50 cp
// and not a mate either way. Takes about half a minute.
'use strict';
const path = require('path');
const ROOT = path.join(__dirname, '..');
const E = require(path.join(ROOT, 'engine.js'));
const { Chess } = require(path.join(ROOT, 'vendor/chess.js'));
const EG = require(path.join(ROOT, 'endgames.js'));
const ARGS = process.argv.slice(2);
const NO_ENGINE = ARGS.includes('--no-engine');
const SF_JS = path.resolve(ARGS.find((a) => !a.startsWith('--')) || process.env.STOCKFISH_JS || path.join(ROOT, 'vendor/stockfish-19-lite-single.js'));
const DEPTH = 20, WIN_CP = 500, DRAW_CP = 50;

let fails = 0, passes = 0;
function check(name, ok, info) {
  if (ok) passes++; else fails++;
  console.log((ok ? 'PASS ' : 'FAIL ') + name + (info != null ? '  (' + info + ')' : ''));
}

// ---- shape: ids, sets, counts, legal FENs, material that matches the kind ----------------------------------------------
function material(fen) {   // e.g. { w: 'KQ', b: 'K' } with pieces sorted K Q R B N P
  const order = 'KQRBNP', out = { w: '', b: '' };
  for (const ch of fen.split(' ')[0]) if (/[a-zA-Z]/.test(ch)) out[ch === ch.toUpperCase() ? 'w' : 'b'] += ch.toUpperCase();
  for (const k of ['w', 'b']) out[k] = out[k].split('').sort((a, b) => order.indexOf(a) - order.indexOf(b)).join('');
  return out;
}
function shapeTests() {
  const C = EG.catalogue, ids = new Set(), titles = new Set();
  check('catalogue loaded', Array.isArray(C) && C.length > 0, C.length + ' positions');
  const n = (pred) => C.filter(pred).length;
  check('S0: three K+Q vs K', n((p) => p.set === 'S0' && p.kind === 'KQ') === 3);
  check('S0: three K+R vs K', n((p) => p.set === 'S0' && p.kind === 'KR') === 3);
  check('S0: three K+P vs K wins and one held draw', n((p) => p.kind === 'KP' && p.goal === 'win') === 3 && n((p) => p.kind === 'KP' && p.goal === 'draw') === 1);
  check('S0: ten positions', n((p) => p.set === 'S0') === 10);
  check('S1: two rook endings two pawns up', n((p) => p.set === 'S1') === 2 && n((p) => p.set === 'S1' && p.kind === 'R2' && p.goal === 'win') === 2);
  const s2 = n((p) => p.set === 'S2');
  check('S2: the twenty (the curriculum asks for endgames_mastered_count >= 20)', s2 === 20, s2 + ' positions, ' + n((p) => p.set === 'S2' && p.goal === 'win') + ' wins, ' + n((p) => p.set === 'S2' && p.goal === 'draw') + ' draws');
  for (const p of C) {
    const probs = [];
    if (typeof p.id !== 'string' || !/^[a-z0-9-]+$/.test(p.id) || ids.has(p.id)) probs.push('id missing, malformed or duplicate');
    if (typeof p.title !== 'string' || !p.title.trim() || titles.has(p.title)) probs.push('title missing or duplicate');
    ids.add(p.id); titles.add(p.title);
    if (!['S0', 'S1', 'S2'].includes(p.set)) probs.push('set ' + p.set);
    if (p.you !== 'w' && p.you !== 'b') probs.push('you ' + p.you);
    if (p.goal !== 'win' && p.goal !== 'draw') probs.push('goal ' + p.goal);
    if (typeof p.note !== 'string' || p.note.trim().length < 30 || /\n/.test(p.note) || p.note.length > 170) probs.push('note should be one line of plain technique (30..170 chars), is ' + (p.note || '').length);
    // the drill's coach card: a short technique and the one trap (the e2e checks the card fits three lines on an iPhone)
    if (typeof p.cue !== 'string' || p.cue.length < 30 || p.cue.length > 100) probs.push('cue should be a short technique (30..100 chars), is ' + (p.cue || '').length);
    if (typeof p.trap !== 'string' || p.trap.length < 15 || p.trap.length > 60 || /\.$/.test(p.trap) === false) probs.push('trap should be one short sentence ending in a full stop (15..60 chars), is ' + (p.trap || '').length);
    const kq = p.kind === 'KQ' || p.kind === 'KR';
    if (kq ? p.targetMs !== EG.KQR_MS : p.targetMs !== null) probs.push('targetMs ' + p.targetMs + (kq ? ', want ' + EG.KQR_MS : ', want null'));
    if (kq && p.goal !== 'win') probs.push('mates are wins');
    // FEN: six fields, no castling, no en passant, halfmove 0, fullmove 1, legal and not over
    const f = (p.fen || '').split(' ');
    if (f.length !== 6) probs.push('fen needs 6 fields');
    else {
      if (f[2] !== '-') probs.push('castling should be -');
      if (f[3] !== '-') probs.push('en passant should be -');
      if (f[4] !== '0' || f[5] !== '1') probs.push('halfmove/fullmove should be 0 1');
    }
    const v = new Chess().validate_fen(p.fen || '');
    if (!v.valid) probs.push('invalid fen: ' + v.error);
    else {
      const m = material(p.fen), board = p.fen.split(' ')[0];
      if ((board.match(/K/g) || []).length !== 1 || (board.match(/k/g) || []).length !== 1) probs.push('needs exactly one king each');
      if (/[pP]/.test(board.split('/')[0] + board.split('/')[7])) probs.push('pawn on the first or last rank');
      const c = new Chess(p.fen);
      if (c.game_over()) probs.push('position is already over');
      const other = new Chess(p.fen.replace(/ [wb] /, (s) => (s === ' w ' ? ' b ' : ' w ')));
      if (other.in_check()) probs.push('the side not to move is in check');
      const me = m[p.you], them = m[p.you === 'w' ? 'b' : 'w'];
      if (p.kind === 'KQ' && !(me === 'KQ' && them === 'K')) probs.push('K+Q vs K expected, is ' + me + ' v ' + them);
      if (p.kind === 'KR' && !(me === 'KR' && them === 'K')) probs.push('K+R vs K expected, is ' + me + ' v ' + them);
      if (p.kind === 'KP' && p.goal === 'win' && !(me === 'KP' && them === 'K')) probs.push('K+P vs K expected, is ' + me + ' v ' + them);
      if (p.kind === 'KP' && p.goal === 'draw' && !(me === 'K' && them === 'KP')) probs.push('lone king vs K+P expected, is ' + me + ' v ' + them);
      if (p.kind === 'R2') {
        const pawns = (s) => (s.match(/P/g) || []).length;
        if (!(me.startsWith('KR') && them.startsWith('KR') && me.replace(/P/g, '') === 'KR' && them.replace(/P/g, '') === 'KR' && pawns(me) - pawns(them) === 2)) probs.push('rook and pawns, two pawns up expected, is ' + me + ' v ' + them);
      }
    }
    check(p.set + ' ' + p.id + ': shape', !probs.length, probs.join('; ') || null);
  }
}

// ---- store maths: mastered, best, stats() ---------------------------------------------------------------------------------
function storeTests() {
  const C = EG.catalogue, byId = (id) => C.find((p) => p.id === id);
  const kq = C.find((p) => p.kind === 'KQ'), kr = C.find((p) => p.kind === 'KR'), draw = C.find((p) => p.set === 'S2' && p.goal === 'draw');
  const T = '2026-10-17T08:00:00.000Z';
  let r = EG.record(undefined, kq, { result: 'win', ms: 41000, plies: 21, metGoal: true }, T);
  check('record: first try', r.tries === 1 && r.wins === 1 && r.best === 41000 && r.ok === 0 && !r.mastered && r.last === T && r.lastResult.met, JSON.stringify(r));
  r = EG.record(r, kq, { result: 'win', ms: 24000, metGoal: true }, T);
  check('record: under target counts, best improves', r.tries === 2 && r.wins === 2 && r.best === 24000 && r.ok === 1 && !r.mastered, JSON.stringify(r));
  r = EG.record(r, kq, { result: 'loss', ms: 9000, metGoal: false }, T);
  check('record: a failed run is a try, nothing else', r.tries === 3 && r.wins === 2 && r.best === 24000 && r.ok === 1 && !r.mastered);
  r = EG.record(r, kq, { result: 'draw', ms: 15000, metGoal: false }, T);
  check('record: stalemate does not meet a win goal', r.wins === 2 && r.best === 24000);
  r = EG.record(r, kq, { result: 'win', ms: 29999, metGoal: true }, T);
  check('record: goal met twice under target -> mastered', r.ok === 2 && r.mastered && r.best === 24000, JSON.stringify(r));
  r = EG.record(r, kq, { result: 'loss', ms: 1000, metGoal: false }, T);
  check('record: mastered stays', r.mastered);
  let d = EG.record(null, draw, { result: 'draw', ms: 90000, metGoal: true }, T);
  d = EG.record(d, draw, { result: 'draw', ms: 120000, metGoal: true }, T);
  check('record: draws held twice (no target) -> mastered', d.mastered && d.wins === 2 && d.best === 90000);
  const exact = EG.record(EG.record(null, kr, { result: 'win', ms: 30000, metGoal: true }, T), kr, { result: 'win', ms: 30000, metGoal: true }, T);
  check('record: exactly 30 s is not under 30 s', !exact.mastered && exact.ok === 0);

  const empty = EG.statsOf({});
  check('stats: empty', empty.KQ_ms_best === null && empty.KR_ms_best === null && empty.KP_win === false && empty.rook2_convert === false && empty.mastered === 0 && empty.total === 20 && JSON.stringify(empty.perPos) === '{}', JSON.stringify(empty));
  const pm = {};
  pm[kq.id] = r;
  pm['kq-far'] = EG.record(null, byId('kq-far'), { result: 'win', ms: 19000, metGoal: true }, T);
  pm['kr-centre'] = EG.record(null, byId('kr-centre'), { result: 'win', ms: 52000, metGoal: true }, T);
  const kpWins = C.filter((p) => p.kind === 'KP' && p.goal === 'win');
  for (const p of kpWins.slice(0, 2)) pm[p.id] = { tries: 2, wins: 2, ok: 2, best: 30000, mastered: true };
  for (const p of C.filter((x) => x.set === 'S2').slice(0, 5)) pm[p.id] = { tries: 2, wins: 2, ok: 2, best: 60000, mastered: true };
  pm['r2-connected'] = { tries: 3, wins: 2, ok: 2, best: 200000, mastered: true };
  let s = EG.statsOf(pm);
  check('stats: best K+Q over the three, K+R', s.KQ_ms_best === 19000 && s.KR_ms_best === 52000, s.KQ_ms_best + ' ' + s.KR_ms_best);
  check('stats: K+P win needs all three K+P wins mastered', s.KP_win === false);
  check('stats: rook ending needs both mastered', s.rook2_convert === false);
  check('stats: S2 mastered count', s.mastered === 5 && s.total === 20);
  pm[kpWins[2].id] = { tries: 2, wins: 2, ok: 2, best: 40000, mastered: true };
  pm['kp-hold'] = { tries: 1, wins: 0, ok: 0, best: null, mastered: false };
  pm['r2-outside'] = { tries: 2, wins: 2, ok: 2, best: 250000, mastered: true };
  s = EG.statsOf(pm);
  check('stats: K+P win and rook conversion once all mastered (the held draw does not count)', s.KP_win === true && s.rook2_convert === true);
  check('stats: perPos is a copy', s.perPos !== pm && s.perPos['kq-far'].best === 19000);
  check('fmt', EG.fmt(null) === '–' && EG.fmt(29999) === '0:30' && EG.fmt(24000) === '0:24' && EG.fmt(125000) === '2:05');
}

// ---- engine verdicts --------------------------------------------------------------------------------------------------------
// The vendored stockfish.js under node: a factory whose engine takes UCI lines through processCommand and prints through
// engine.listener (see tools/engine-test.js). Commands are sent on a fresh tick, never from inside the listener: a command
// issued while the engine is still printing gets lost and the run hangs. Searches go straight to the engine with
// 'go depth 20' (engine.js evaluate() caps a search at 4 s, which is right on a phone but would let a slow position
// report a shallower depth here). 'ucinewgame' before each position clears the hash, so each verdict depends only on the
// position: the run is deterministic.
function uci() {
  const argv = process.argv;
  process.argv = argv.slice(0, 2);   // stockfish.js replays process.argv as UCI commands when loaded
  let sf;
  try { sf = require(SF_JS); } finally { process.argv = argv; }
  const eng = sf();
  let cb = null;
  eng.listener = (l) => { if (cb) cb(String(l)); };
  const send = (c) => setTimeout(() => eng.processCommand(c), 0);
  const until = (pred) => new Promise((res) => { cb = (l) => { if (pred(l)) res(l); }; });
  return {
    async ready() { send('uci'); await until((l) => l === 'uciok'); },
    async search(fen, depth) {
      send('ucinewgame'); send('isready'); await until((l) => l === 'readyok');
      const s = { lines: {} };
      const done = new Promise((res) => { cb = (l) => { if (l.startsWith('info ')) E.parseInfo(l, s); else if (l.startsWith('bestmove')) res(l.split(/\s+/)[1]); }; });
      send('position fen ' + fen); send('go depth ' + depth);
      const best = await done, top = s.lines[1] || { depth: 0, kind: 'cp', v: 0, pv: [] };
      return { best, depth: top.depth, kind: top.kind, v: top.v, pv: top.pv };   // score from the side to move
    },
  };
}
const san = (fen, ucis) => { const c = new Chess(fen), out = []; for (const u of ucis) { const m = c.move({ from: u.slice(0, 2), to: u.slice(2, 4), promotion: u[4] }); if (!m) break; out.push(m.san); } return out.join(' '); };
async function engineTests() {
  const sf = uci(), t0 = Date.now();
  await sf.ready();
  const rows = [];
  for (const p of EG.catalogue) {
    const t = Date.now(), r = await sf.search(p.fen, DEPTH);
    const sgn = p.fen.split(' ')[1] === p.you ? 1 : -1;   // flip the side-to-move score to the learner's side
    const mate = r.kind === 'mate' ? r.v * sgn : null, cp = r.kind === 'cp' ? r.v * sgn : null;
    const mustMate = p.kind === 'KQ' || p.kind === 'KR';
    let ok, want;
    if (mustMate) { want = 'mate for you'; ok = mate != null && mate > 0; }
    else if (p.goal === 'win') { want = 'mate or >= +' + WIN_CP; ok = (mate != null && mate > 0) || (cp != null && cp >= WIN_CP); }
    else { want = 'within ±' + DRAW_CP; ok = cp != null && Math.abs(cp) <= DRAW_CP; }
    ok = ok && r.depth >= DEPTH;
    const verdict = mate != null ? 'mate ' + (mate > 0 ? 'in ' + mate : 'against you in ' + -mate) : (cp >= 0 ? '+' : '') + cp + ' cp';
    rows.push({ p, verdict, want, ok, depth: r.depth, line: san(p.fen, r.pv.slice(0, 6)), ms: Date.now() - t });
    check(p.set + ' ' + p.id + ': engine says ' + p.goal, ok, verdict + ' at depth ' + r.depth + ', want ' + want);
  }
  const w = (s, n) => String(s).padEnd(n).slice(0, n);
  console.log('\n' + w('id', 18) + w('set', 4) + w('title', 44) + w('you', 6) + w('goal', 5) + w('engine (your side)', 20) + w('d', 3) + 'line');
  for (const r of rows) console.log(w(r.p.id, 18) + w(r.p.set, 4) + w(r.p.title, 44) + w(r.p.you === 'w' ? 'White' : 'Black', 6) + w(r.p.goal, 5) + w((r.ok ? '' : '!! ') + r.verdict, 20) + w(r.depth, 3) + r.line);
  console.log('engine: ' + rows.length + ' positions at depth ' + DEPTH + ', ' + (Date.now() - t0) + ' ms');
}

(async () => {
  const keep = setInterval(() => {}, 1000);   // the wasm's own timers do not always hold the event loop open between searches
  const t0 = Date.now();
  shapeTests();
  storeTests();
  if (!NO_ENGINE) { try { await engineTests(); } catch (e) { check('engine tests threw', false, (e && e.stack) || JSON.stringify(e)); } }
  clearInterval(keep);
  console.log('\n' + passes + ' passed, ' + fails + ' failed, ' + (Date.now() - t0) + ' ms');
  process.exit(fails ? 1 : 0);
})();
