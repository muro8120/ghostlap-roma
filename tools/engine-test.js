// Unit test for engine.js against the real Stockfish 19 Lite WASM under node, plus an engine check of every lesson line.
// Usage: node tools/engine-test.js [--lessons] [path/to/stockfish.js]
//   --lessons   run only the pure helpers and the lesson checks (skip the engine plumbing tests)
//   path        a Stockfish build to drive instead of the vendored one (also $STOCKFISH_JS); it needs its .wasm beside it
'use strict';
const path = require('path');
const fs = require('fs');
const vm = require('vm');
const ROOT = path.join(__dirname, '..');
const E = require(path.join(ROOT, 'engine.js'));
const { Chess } = require(path.join(ROOT, 'vendor/chess.js'));
const ARGS = process.argv.slice(2);
const ONLY_LESSONS = ARGS.includes('--lessons');
const SF_JS = path.resolve(ARGS.find((a) => !a.startsWith('--')) || process.env.STOCKFISH_JS || path.join(ROOT, 'vendor/stockfish-19-lite-single.js'));

let fails = 0, passes = 0;
function check(name, ok, info) {
  if (ok) passes++; else fails++;
  console.log((ok ? 'PASS ' : 'FAIL ') + name + (info != null ? '  (' + info + ')' : ''));
}
const timed = async (fn) => { const t = Date.now(); const r = await fn(); return [r, Date.now() - t]; };
const legal = (fen, uci) => !!uci && !!new Chess(fen).move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] });

// The vendored stockfish.js, required under node, exports a factory: the engine object takes UCI lines through
// processCommand (queued until the wasm is ready) and prints through engine.listener. It also replays
// process.argv as UCI commands when loaded, so it is loaded with our own arguments hidden. The module holds a single
// engine, so one transport is made and shared by every test. 'quit' would call process.exit() from inside the wasm
// and cut the run short, so terminate only detaches the listener; the process exits at the end of the run.
let shared = null;
function nodeTransport() {
  if (shared) return shared;
  const argv = process.argv;
  process.argv = argv.slice(0, 2);
  let sf;
  try { sf = require(SF_JS); } finally { process.argv = argv; }
  const eng = sf();
  let cb = null;
  eng.listener = (l) => { if (cb) cb(String(l)); };
  shared = { send: (c) => eng.processCommand(c), onLine: (f) => { cb = f; }, terminate: () => { cb = null; } };
  return shared;
}

// ---- pure helpers (no engine) ------------------------------------------------------------
function pureTests() {
  check('label thresholds', ['best', 'great', 'good', 'inaccuracy', 'mistake', 'blunder'].join() ===
    [E.label(3), E.label(15), E.label(40), E.label(80), E.label(200), E.label(400)].join());
  let r = E.rate({ cpBefore: 30, cpAfter: -300, color: 'w', played: 'e2e4', best: 'd2d4' });
  check('rate white blunder', r.label === 'blunder' && r.loss === 330, JSON.stringify(r));
  r = E.rate({ cpBefore: -30, cpAfter: 120, color: 'b', played: 'e7e5', best: 'c7c5' });
  check('rate black mistake', r.label === 'mistake' && r.loss === 150, JSON.stringify(r));
  r = E.rate({ cpBefore: 50, cpAfter: -20, color: 'w', played: 'g1f3', best: 'g1f3' });
  check('rate played===best wins', r.label === 'best' && r.loss === 70, JSON.stringify(r));
  r = E.rate({ cpBefore: 50, cpAfter: 40, color: 'w', played: 'a2a3', best: 'g1f3' });
  check('rate great', r.label === 'great' && r.loss === 10, JSON.stringify(r));
  r = E.rate({ cpBefore: 9999, cpAfter: 9998, color: 'w', played: 'a2a3', best: 'h5f7', mateBefore: 1, mateAfter: 2 });
  check('rate still mating = great/best', r.label === 'best' || r.label === 'great', JSON.stringify(r));
  r = E.rate({ cpBefore: 9999, cpAfter: 300, color: 'w', played: 'a2a3', best: 'h5f7', mateBefore: 1, mateAfter: null });
  check('rate threw away mate = blunder', r.label === 'blunder', JSON.stringify(r));
  r = E.rate({ cpBefore: -9999, cpAfter: -9998, color: 'w', played: 'a2a3', best: 'h5f7', mateBefore: -1, mateAfter: -2 });
  check('rate getting mated anyway = not blunder', r.label !== 'blunder', JSON.stringify(r));
  r = E.rate({ cpBefore: 20, cpAfter: 9999, color: 'b', played: 'g8f6', best: 'g7g6', mateBefore: null, mateAfter: 1 });
  check('rate black allowed mate = blunder', r.label === 'blunder' && r.loss === 1980, JSON.stringify(r));
  r = E.rate({ cpBefore: 1900, cpAfter: 9999, color: 'b', played: 'g8f6', best: 'g7g6', mateBefore: null, mateAfter: 1 });
  check('rate allowed mate with small cp loss = blunder', r.label === 'blunder', JSON.stringify(r));
  r = E.rate({ cpBefore: 0, cpAfter: -500, color: 'w', played: 'e1e2', best: 'e1e2', onlyMove: true });
  check('rate forced', r.label === 'forced', JSON.stringify(r));
  const a0 = E.accuracy([]), a1 = E.accuracy([0, 0, 0]), a2 = E.accuracy([300, 300, 300]), a3 = E.accuracy([10, 20, 30, 40]);
  check('accuracy range', a0 === 100 && a1 === 100 && a2 > 0 && a2 < 50 && a3 > a2 && a3 <= 100, [a0, a1, a2, a3].join());
  const labels = ['best', 'great', 'good', 'inaccuracy', 'mistake', 'blunder', 'forced'];
  let ok = true;
  for (const l of labels) {
    const seen = new Set();
    for (let p = 0; p < 12; p++) seen.add(E.jab(l, { san: 'Nf3', bestSan: 'd4', loss: 123, ply: p, streak: 0 }));
    if (seen.size < 6) ok = false;
    for (const s of seen) if (typeof s !== 'string' || !s.length) ok = false;
  }
  check('jab: >= 6 distinct lines per label', ok);
  const st = E.jab('blunder', { san: 'Qh5', bestSan: 'Nf3', loss: 400, ply: 7, streak: 3 });
  check('jab: streak line', /3/.test(st), st);
  const mj = E.jab('blunder', { san: 'Nf6', bestSan: 'Qe7', loss: 2038, ply: 6, streak: 1, cpAfter: 10000, color: 'b' });
  check('jab: allowed-mate line', /mate|over|king/i.test(mj) && mj !== E.jab('blunder', { san: 'Nf6', bestSan: 'Qe7', loss: 300, ply: 6, streak: 1, cpAfter: -300, color: 'b' }), mj);
  check('endLine', typeof E.endLine('loss', 'checkmate', { ply: 9 }) === 'string' && typeof E.endLine('win', 'resign', {}) === 'string' && typeof E.endLine('draw', 'stalemate', {}) === 'string');
  check('parseInfo keeps deepest per multipv', (() => {
    const s = { lines: {} };
    E.parseInfo('info depth 5 seldepth 7 multipv 1 score cp 20 nodes 1 nps 1 pv e2e4 e7e5', s);
    E.parseInfo('info depth 8 seldepth 9 multipv 2 score mate 3 nodes 1 nps 1 pv d2d4', s);
    E.parseInfo('info depth 9 seldepth 9 multipv 1 score cp 33 lowerbound nodes 1 nps 1 pv e2e4', s);
    E.parseInfo('info depth 9 seldepth 9 multipv 1 score cp 31 nodes 1 nps 1 pv e2e4 c7c5', s);
    E.parseInfo('info string hello', s);
    return s.lines[1].v === 31 && s.lines[1].pv.length === 2 && s.lines[2].kind === 'mate' && s.lines[2].v === 3;
  })());
}

// ---- engine tests -------------------------------------------------------------------------
async function engineTests(eng) {
  const [, tReady] = await timed(() => eng.ready());
  check('ready()', true, tReady + ' ms');
  const START = new Chess().fen();

  eng.setStrength(1000);
  let [r, t] = await timed(() => eng.play(START));
  check('play @1000 legal', legal(START, r.move), r.move + ', ' + t + ' ms');
  eng.setStrength(2500);
  [r, t] = await timed(() => eng.play(START));
  check('play @2500 legal', legal(START, r.move), r.move + ', ' + t + ' ms');

  [r, t] = await timed(() => eng.evaluate(START, { depth: 10 }));
  check('evaluate startpos d10', Math.abs(r.cp) < 100 && r.mate == null && legal(START, r.best) && r.pv.length > 0 && r.depth >= 10, JSON.stringify({ cp: r.cp, best: r.best, depth: r.depth }) + ', ' + t + ' ms');
  [r, t] = await timed(() => eng.evaluate(START, { depth: 12 }));
  check('evaluate startpos d12', r.depth >= 12, t + ' ms');
  // play after evaluate must restore the user's strength (no crash, legal move)
  [r, t] = await timed(() => eng.play(START));
  check('play after evaluate', legal(START, r.move), r.move + ', ' + t + ' ms');
  // mate in 1 for white (scholar's mate), white POV
  const M1 = 'r1bqkb1r/pppp1ppp/2n2n2/4p2Q/2B1P3/8/PPPP1PPP/RNB1K1NR w KQkq - 4 4';
  [r, t] = await timed(() => eng.evaluate(M1, { depth: 10 }));
  check('evaluate mate-in-1 (white)', r.mate === 1 && r.cp >= 2000 && r.best === 'h5f7', JSON.stringify({ cp: r.cp, mate: r.mate, best: r.best }) + ', ' + t + ' ms');
  // same, black to move with mate in 1 for black: negative mate
  const M1B = 'rnbqkbnr/pppp1ppp/8/4p3/6P1/5P2/PPPPP2P/RNBQKBNR b KQkq g3 0 2';
  r = await eng.evaluate(M1B, { depth: 8 });
  check('evaluate mate-in-1 (black) negative', r.mate === -1 && r.cp <= -2000, JSON.stringify({ cp: r.cp, mate: r.mate, best: r.best }));
  // checkmated position: black mated after Qxf7#
  const MATED = 'r1bqkb1r/pppp1Qpp/2n2n2/4p3/2B1P3/8/PPPP1PPP/RNB1K1NR b KQkq - 0 4';
  r = await eng.evaluate(MATED, { depth: 8 });
  check('evaluate mated position', r.mate === 0 && r.cp > 0 && r.best === null, JSON.stringify({ cp: r.cp, mate: r.mate, best: r.best }));
  const STALE = '7k/5Q2/6K1/8/8/8/8/8 b - - 0 1';
  r = await eng.evaluate(STALE, { depth: 8 });
  check('evaluate stalemate', r.cp === 0 && r.best === null, JSON.stringify(r));
  // multipv
  r = await eng.evaluate(START, { depth: 8, multipv: 3 });
  check('evaluate multipv 3', r.lines.length === 3 && r.lines.every((l) => l.pv.length), r.lines.map((l) => l.pv[0] + ':' + l.cp).join(' '));
  // queued searches do not fight: fire several at once
  const batch = await Promise.all([eng.evaluate(START, { depth: 6 }), eng.play(START), eng.evaluate(M1, { depth: 6 })]);
  check('queued searches', legal(START, batch[0].best) && legal(START, batch[1].move) && batch[2].mate === 1);
  // stop(): a deep search is cut short but still resolves
  const pDeep = eng.evaluate(START, { depth: 30 });
  setTimeout(() => eng.stop(), 150);
  [r, t] = await timed(() => pDeep);
  check('stop() resolves early', t < 2500 && legal(START, r.best), t + ' ms, depth ' + r.depth);

  // analyze: scholar's mate, human is black and blunders 3...Nf6??
  const game = ['e2e4', 'e7e5', 'f1c4', 'b8c6', 'd1h5', 'g8f6', 'h5f7'];
  const prog = [];
  const sig = { cancelled: false };
  let rep;
  [rep, t] = await timed(() => E.analyze(eng, game, { depth: 10, color: 'b', onProgress: (i, n) => prog.push(i + '/' + n), signal: sig }));
  check('analyze returns report', !!rep && rep.moves.length === 7 && rep.evals.length === 8, t + ' ms');
  check('analyze progress', prog.length === 9 && prog[prog.length - 1] === '8/8', prog.join(' '));
  const m6 = rep.moves[5];
  check('analyze flags 3...Nf6?? as blunder', m6.san === 'Nf6' && m6.label === 'blunder' && m6.loss > 250 && m6.mateAfter === 1, JSON.stringify({ san: m6.san, label: m6.label, loss: m6.loss, best: m6.bestSan, mateAfter: m6.mateAfter }));
  check('analyze last move is mate', rep.moves[6].san === 'Qxf7#' && rep.moves[6].label === 'best' && rep.evals[7] === 2000, JSON.stringify({ san: rep.moves[6].san, label: rep.moves[6].label, ev: rep.evals[7] }));
  check('analyze accuracy 0..100', rep.accuracy.w >= 0 && rep.accuracy.w <= 100 && rep.accuracy.b >= 0 && rep.accuracy.b <= 100 && rep.accuracy.b < rep.accuracy.w, JSON.stringify(rep.accuracy));
  check('analyze counts', rep.counts.b.blunder >= 1 && Object.values(rep.counts.w).reduce((a, b) => a + b, 0) === 4 && Object.values(rep.counts.b).reduce((a, b) => a + b, 0) === 3, JSON.stringify(rep.counts));
  check('analyze worst', rep.worst.length >= 1 && rep.worst[0].san === 'Nf6' && rep.worst.every((e) => e.color === 'b'), rep.worst.map((e) => e.san + ':' + e.loss).join(' '));
  check('analyze jab/bestSan on every move', rep.moves.every((e) => typeof e.jab === 'string' && e.jab.length && (e.bestSan || e.ply === 7)), rep.moves.map((e) => e.bestSan).join(' '));
  check('analyze lesson', typeof rep.lesson === 'string' && rep.lesson.length > 80 && /mate/i.test(rep.lesson), rep.lesson.slice(0, 90) + '...');
  check('analyze summary 2 lines', typeof rep.summary === 'string' && rep.summary.split('\n').length === 2, rep.summary.replace('\n', ' | '));
  // cancellation
  const sig2 = { cancelled: false };
  const pc = E.analyze(eng, game, { depth: 10, color: 'w', signal: sig2, onProgress: (i) => { if (i === 2) { sig2.cancelled = true; eng.stop(); } } });
  check('analyze cancelled -> null', (await pc) === null);

  console.log('\n--- sample output ---');
  for (const e of rep.moves) console.log(' ' + Math.ceil(e.ply / 2) + (e.color === 'w' ? '. ' : '... ') + e.san + ' [' + e.label + ' -' + (e.loss / 100).toFixed(1) + '] ' + e.jab);
  console.log(' summary: ' + rep.summary.replace('\n', ' / '));
  console.log(' lesson: ' + rep.lesson);
}

// ---- lessons: schema, legal SAN, and an engine check of every move ------------------------
// Every move in a lesson line is rated exactly as the coach rates a move (E.rate on the eval before and after),
// at depth 12 (the live strip during Practice) and depth 14 (the postgame review). A 'mistake' or 'blunder' at
// either depth fails; an 'inaccuracy' is reported as a warning with the SAN so the author can decide.
// The hash is cleared before every search, so each verdict depends only on the position and the depth: adding or
// editing one lesson cannot change the verdicts on another, and repeated runs give the same numbers.
const LESSON_DEPTHS = [12, 14];
function loadLessons() {
  const ctx = { window: {} };
  vm.runInNewContext(fs.readFileSync(path.join(ROOT, 'lessons.js'), 'utf8'), ctx, { filename: 'lessons.js' });
  return ctx.window.LESSONS || [];
}
// Schema and legality. Returns the lessons whose line replays, with their fens and uci moves.
function lessonShapeTests(L) {
  check('lessons: loaded', Array.isArray(L) && L.length > 0, L.length + ' lessons');
  const ids = new Set(), titles = new Set(), ok = [];
  const isText = (v) => typeof v === 'string' && v.trim().length > 0;
  const isList = (v) => Array.isArray(v) && v.length > 0 && v.every(isText);
  for (const l of L) {
    const tag = 'lesson ' + (l.id || '?');
    const probs = [];
    if (!isText(l.id) || ids.has(l.id)) probs.push('id missing or duplicate');
    if (!isText(l.title) || titles.has(l.title)) probs.push('title missing or duplicate');
    ids.add(l.id); titles.add(l.title);
    if (l.kind !== 'basics' && l.kind !== 'opening') probs.push('kind ' + l.kind);
    if (l.kind === 'opening' && !(l.side === 'w' || l.side === 'b')) probs.push('side ' + l.side);
    if (l.kind === 'opening' && !/^[A-E]\d\d$/.test(l.eco || '')) probs.push('eco ' + l.eco);
    if (l.kind === 'opening' && !(l.line && l.line.length >= 14 && l.line.length <= 20)) probs.push('opening line should be 14 to 20 plies, is ' + (l.line || []).length);
    for (const k of ['blurb', 'idea', 'then']) if (!isText(l[k])) probs.push(k + ' missing');
    for (const k of ['line', 'notes', 'want', 'avoid']) if (!isList(l[k])) probs.push(k + ' missing or empty');
    check(tag + ': schema', !probs.length, probs.join('; ') || null);
    check(tag + ': one note per move', !!l.line && !!l.notes && l.notes.length === l.line.length, (l.notes || []).length + ' notes, ' + (l.line || []).length + ' moves');
    // every SAN legal, and written the way chess.js writes it (so + and # are right and Practice matches)
    const c = new Chess(), fens = [c.fen()], ucis = [];
    let bad = null;
    for (let i = 0; i < (l.line || []).length; i++) {
      const s = l.line[i], m = c.move(s);
      if (!m) { bad = 'ply ' + (i + 1) + ' ' + s + ' is illegal'; break; }
      if (m.san !== s) { bad = 'ply ' + (i + 1) + ' ' + s + ' should be written ' + m.san; break; }
      ucis.push(m.from + m.to + (m.promotion || '')); fens.push(c.fen());
    }
    check(tag + ': every move legal', !bad, bad);
    if (!bad && l.line && l.line.length) ok.push({ l, fens, ucis });
  }
  return ok;
}
async function lessonEngineTests(eng, tr, playable) {
  const ev = async (fen, depth) => { tr.send('ucinewgame'); return eng.evaluate(fen, { depth }); };
  let warned = 0;
  for (const { l, fens, ucis } of playable) {
    const t = Date.now(), evals = {};
    for (const d of LESSON_DEPTHS) { evals[d] = []; for (const f of fens) evals[d].push(await ev(f, d)); }
    const bad = [], warn = [], shallow = [];
    let worst = null;
    for (let i = 0; i < ucis.length; i++) {
      const color = i % 2 ? 'b' : 'w', mv = Math.floor(i / 2) + 1 + (color === 'w' ? '. ' : '... ') + l.line[i];
      for (const d of LESSON_DEPTHS) {
        const a = evals[d][i], b = evals[d][i + 1];
        if ((a.best && a.depth < d) || (b.best && b.depth < d)) shallow.push(mv + ' d' + d);
        const r = E.rate({ cpBefore: a.cp, cpAfter: b.cp, color, played: ucis[i], best: a.best, mateBefore: a.mate, mateAfter: b.mate });
        const sc = new Chess(fens[i]), bm = a.best && sc.move({ from: a.best.slice(0, 2), to: a.best.slice(2, 4), promotion: a.best[4] });
        const say = mv + ' ' + r.label + ' -' + (r.loss / 100).toFixed(2) + ' at depth ' + d + ', engine prefers ' + (bm ? bm.san : '?');
        if (!worst || r.loss > worst.loss) worst = { loss: r.loss, say: mv + ' -' + (r.loss / 100).toFixed(2) + ' d' + d };
        if (r.label === 'mistake' || r.label === 'blunder') bad.push(say);
        else if (r.label === 'inaccuracy') warn.push(say);
      }
    }
    for (const w of warn) { warned++; console.log('WARN lesson ' + l.id + ': inaccuracy in the line: ' + w); }
    check('lesson ' + l.id + ': search reached full depth', !shallow.length, shallow.join(', ') || null);
    check('lesson ' + l.id + ': no mistake or blunder in the line', !bad.length, bad.join(' | ') || (ucis.length + ' moves, worst ' + (worst ? worst.say : '-') + ', ' + (Date.now() - t) + ' ms'));
  }
  console.log('lessons: ' + playable.length + ' lines checked at depth ' + LESSON_DEPTHS.join(' and ') + ', ' + warned + ' inaccuracy warning' + (warned === 1 ? '' : 's'));
}
async function lessonTests(eng, tr) {
  const playable = lessonShapeTests(loadLessons());
  await eng.ready();
  await lessonEngineTests(eng, tr, playable);
}

(async () => {
  const t0 = Date.now();
  pureTests();
  const tr = nodeTransport(), eng = E.create({ transport: tr });
  if (!ONLY_LESSONS) { try { await engineTests(eng); } catch (e) { check('engine tests threw', false, (e && e.stack) || JSON.stringify(e)); } }
  try { await lessonTests(eng, tr); } catch (e) { check('lesson tests threw', false, (e && e.stack) || JSON.stringify(e)); }
  eng.terminate();
  console.log('\n' + passes + ' passed, ' + fails + ' failed, ' + (Date.now() - t0) + ' ms');
  process.exit(fails ? 1 : 0);
})();
