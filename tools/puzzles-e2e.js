// Headless check of the TACTICS screen (puzzles.js) in Chromium, iPhone 13 viewport. No engine needed.
// node tools/puzzles-e2e.js   (screenshots in $SHOTS or /tmp/ghostlap-shots; PORT=8781 if 8771 is busy)
// Until index.html loads puzzles-data.js and puzzles.js itself, the test serves a copy of index.html with the two script
// tags added (written to $SCRATCH or the OS temp dir); the real index.html is never touched.
const { chromium, devices } = require('/opt/node-tools/node_modules/playwright');
const http = require('http'), fs = require('fs'), path = require('path'), os = require('os');
const ROOT = path.join(__dirname, '..');
const SHOTS = process.env.SHOTS || '/tmp/ghostlap-shots'; fs.mkdirSync(SHOTS, { recursive: true });
const PORT = +process.env.PORT || 8771;
let INDEX = path.join(ROOT, 'index.html');
{
  let html = fs.readFileSync(INDEX, 'utf8');
  if (!/src="puzzles\.js"/.test(html)) {
    if (!/src="puzzles-data\.js"/.test(html)) html = html.replace('<script src="coach.js"></script>', '<script src="puzzles-data.js"></script>\n<script src="coach.js"></script>');
    html = html.replace('<script src="learn.js"></script>', '<script src="learn.js"></script>\n<script src="puzzles.js"></script>');
    INDEX = path.join(process.env.SCRATCH || os.tmpdir(), 'ghostlap-puzzles-index.html');
    fs.writeFileSync(INDEX, html);
  }
}
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.png': 'image/png', '.wasm': 'application/wasm', '.svg': 'image/svg+xml', '.webmanifest': 'application/manifest+json' };
const srv = http.createServer((q, r) => {
  let p = decodeURIComponent(new URL(q.url, 'http://x').pathname); if (p.endsWith('/')) p += 'index.html';
  const f = p === '/index.html' ? INDEX : path.join(ROOT, p);
  if ((f !== INDEX && !f.startsWith(ROOT)) || !fs.existsSync(f)) { r.writeHead(404); return r.end('nf'); }
  r.writeHead(200, { 'content-type': TYPES[path.extname(f)] || 'application/octet-stream' }); fs.createReadStream(f).pipe(r);
}).listen(PORT);
// a synthetic analysed game (White), as in chess-e2e.js: 3. Nxe5?? hangs the knight, the engine wanted 3. Bc4. One own-game card.
const SYN = () => {
  const mk = (ply, uci, san, label, loss, x) => Object.assign({ ply, color: ply % 2 ? 'w' : 'b', uci, san, label, loss, cpBefore: 30, cpAfter: 30, mateBefore: null, mateAfter: null, best: uci, bestSan: san, reply: null, pv: [], pieces: 14, hung: null }, x || {});
  const moves = [mk(1, 'e2e4', 'e4', 'best', 0), mk(2, 'e7e5', 'e5', 'best', 0), mk(3, 'g1f3', 'Nf3', 'best', 0), mk(4, 'b8c6', 'Nc6', 'best', 0),
    mk(5, 'f3e5', 'Nxe5', 'blunder', 300, { best: 'f1c4', bestSan: 'Bc4', reply: 'c6e5', hung: 'n', cpAfter: -270 }), mk(6, 'c6e5', 'Nxe5', 'best', 0), mk(7, 'd2d4', 'd4', 'great', 10), mk(8, 'e5c6', 'Nc6', 'good', 30)];
  const cnt = (c) => ({ best: 0, great: 0, good: 0, inaccuracy: 0, mistake: 0, blunder: 0, forced: 0, ...c });
  return { id: 'syn1', date: new Date(Date.now() - 2 * 864e5).toISOString(), elo: 1200, you: 'w', result: 'loss', reason: 'resign', moves: moves.map((m) => m.uci), sans: moves.map((m) => m.san),
    hints: 0, nudges: 0, tutor: false, takebacks: 0, practice: null, assist: { used: 0, budget: 10 }, hinted: [],
    report: { accuracy: { w: 61, b: 97 }, counts: { w: cnt({ best: 2, great: 1, blunder: 1 }), b: cnt({ best: 3, good: 1 }) }, moves, evals: [30, 30, 30, 30, 30, -270, -270, -280, -260],
      worst: [moves[4]], summary: 'Accuracy 61%. 1 blunder, 0 mistakes, 0 inaccuracies.', lesson: 'Synthetic lesson.' } };
};
const results = [];
const check = (name, ok, extra) => { results.push([ok ? 'PASS' : 'FAIL', name, extra || '']); console.log((ok ? 'PASS ' : 'FAIL ') + name + (extra ? '  ' + extra : '')); };

let b = null;
(async () => {
  b = await chromium.launch();
  const ctx = await b.newContext({ ...devices['iPhone 13'] });
  // seed the chess save once (not on reloads) with one analysed game for Jesse
  await ctx.addInitScript((g) => { if (!localStorage.getItem('ghostlap-chess-v1')) localStorage.setItem('ghostlap-chess-v1', JSON.stringify({ player: 'jesse', players: { jesse: { name: 'Jesse', games: [g] } } })); }, SYN());
  const p = await ctx.newPage();
  const errs = [];
  p.on('pageerror', (e) => errs.push('pageerror: ' + e.message));
  p.on('console', (m) => { if (m.type() === 'error') errs.push('console: ' + m.text()); });
  await p.goto('http://localhost:' + PORT + '/');
  const up = await p.waitForFunction(() => window.__puzzles && window.__coach, null, { timeout: 5000 }).then(() => true).catch(() => false);
  check('puzzles and coach hooks present', up);
  if (!up) return done(b);
  check('section and .pz- style injected', await p.evaluate(() => !!document.getElementById('puzzles') && !!document.getElementById('pzStyle') && /\.pz-tag/.test(document.getElementById('pzStyle').textContent)));
  check('set loaded', (await p.evaluate(() => window.__puzzles.count)) > 3000, String(await p.evaluate(() => window.__puzzles.count)));
  const s0 = await p.evaluate(() => window.__puzzles.stats());
  check('stats before: no sessions, one own card from the analysed game', s0.sessions === 0 && s0.last === null && s0.acc30 === null && s0.ownCards.total === 1 && s0.ownCards.due === 1, JSON.stringify(s0));

  // ---- session 1: own card, one set puzzle right (first move by real taps), one wrong then walked through ----
  let summary = null;
  await p.exposeFunction('pzDone', (s) => { summary = s; });
  const st0 = await p.evaluate(() => window.__puzzles.open({ band: [800, 999], count: 3, minutes: 15, onDone: (s) => window.pzDone(s) }));
  check('session opens with the screen on and the hub off', await p.evaluate(() => document.getElementById('puzzles').classList.contains('on') && !document.getElementById('hub').classList.contains('on')));
  check('due own card comes first, then the set', st0 && st0.n === 3 && st0.item.kind === 'own' && st0.item.expect === 'f1c4', st0 && JSON.stringify(st0.item));
  check('own card: White at the bottom, your-game note', await p.evaluate(() => /From your game/.test(document.getElementById('pzNote').textContent) && /You played Nxe5/.test(document.getElementById('pzNote').textContent)
    && document.querySelector('#pzBoard .sq').dataset.sq === 'a8'), await p.$eval('#pzNote', (e) => e.textContent));
  await p.screenshot({ path: SHOTS + '/pz1-own-card.png' });
  const a0 = await p.evaluate(() => window.__puzzles.answer('f1', 'c4'));
  const box = await p.evaluate(() => JSON.parse(localStorage.getItem('ghostlap-puzzles-v1')).jesse.own['syn1:5'].box);
  check('own card right moves it up to box 2', a0 && a0.ok && a0.done && box === 2, JSON.stringify(a0) + ' box ' + box);
  check('own card done shows the engine move', /Bc4/.test(await p.$eval('#pzNote', (e) => e.textContent)));
  await p.evaluate(() => window.__puzzles.next());

  const waitMove = () => p.waitForFunction(() => { const s = window.__puzzles.state; return !!s && s.phase === 'move'; }, null, { timeout: 5000 }).then(() => true).catch(() => false);
  check('set puzzle: their first move plays, then your turn', await waitMove());
  let st = await p.evaluate(() => window.__puzzles.state);
  const flipOk = await p.evaluate(() => { const s = window.__puzzles.state, top = document.querySelector('#pzBoard .sq').dataset.sq; return s.item.you === 'w' ? top === 'a8' : top === 'h1'; });
  check('set puzzle: their move highlighted, the solver at the bottom', st.item.kind === 'set' && st.item.step === 1 && flipOk && (await p.$$eval('#pzBoard .sq.last', (e) => e.length)) === 2, st.item.id + ' ' + st.item.you);
  const note1 = await p.$eval('#pzNote', (e) => e.textContent);
  check('"They played X. Your move. Play the whole line."', /^They played \S+\. Your move\. Play the whole line\.$/.test(note1), note1);
  check('no themes or rating before solving', await p.$eval('#pzTags', (e) => e.hidden && !e.textContent));
  await p.screenshot({ path: SHOTS + '/pz2-set-puzzle.png' });
  // the first solver move by tapping the real board
  const e1 = st.item.expect;
  for (const sq of [e1.slice(0, 2), e1.slice(2, 4)]) { await p.tap('#pzBoard [data-sq="' + sq + '"]'); await p.waitForTimeout(120); }
  st = await p.evaluate(() => window.__puzzles.state);
  check('a right move by taps is accepted', st.item.right && st.item.step >= 2, 'step ' + st.item.step + ' phase ' + st.phase);
  const solve = async () => {
    for (const t = Date.now(); Date.now() - t < 15000;) {   // their replies come 650 ms after your move
      const s = await p.evaluate(() => window.__puzzles.state);
      if (s.phase === 'done') return s;
      if (s.phase !== 'move') { await p.waitForTimeout(150); continue; }
      await p.evaluate((u) => window.__puzzles.answer(u.slice(0, 2), u.slice(2, 4)), s.item.expect);
    }
    return p.evaluate(() => window.__puzzles.state);
  };
  st = await solve();
  check('set puzzle solved through the whole line', st.phase === 'done' && st.item.right && st.item.step === st.item.line.length, st.item.line.join(' '));
  const tags = await p.$$eval('#pzTags .pz-tag', (e) => e.map((x) => x.textContent));
  check('after solving: rating and themes shown as tags', tags.length >= 2 && /^Rated \d+$/.test(tags[0]), tags.join(', '));
  await p.screenshot({ path: SHOTS + '/pz3-solved.png' });
  await p.evaluate(() => window.__puzzles.next());

  check('second set puzzle comes up', await waitMove());
  // a legal move that is not the answer (and not a mate, which would count)
  const wrong = await p.evaluate(() => { const s = window.__puzzles.state, c = new Chess(s.item.fen);
    const m = c.moves({ verbose: true }).find((x) => x.from + x.to !== s.item.expect.slice(0, 4) && !/#/.test(x.san)); return m && m.from + m.to; });
  const aw = await p.evaluate((u) => window.__puzzles.answer(u.slice(0, 2), u.slice(2, 4)), wrong);
  st = await p.evaluate(() => window.__puzzles.state);
  check('a wrong move marks the puzzle wrong and stays on the position', aw && aw.legal && !aw.ok && !st.item.right && st.phase === 'move' && st.item.step === 1, JSON.stringify(aw));
  check('wrong: your try in red, the right move as an arrow', (await p.$$eval('#pzBoard .arrow line', (e) => e.length)) === 2 && (await p.$$eval('#pzBoard .arrow line.red', (e) => e.length)) === 1);
  check('wrong: no way to skip, you play it out', await p.$eval('#pzNext', (e) => e.hidden));
  await p.screenshot({ path: SHOTS + '/pz4-wrong.png' });
  st = await solve();
  check('the rest of the line is still walked through', st.phase === 'done' && !st.item.right && st.item.step === st.item.line.length, st.item.line.join(' '));
  check('done after a slip says so', /counts as wrong/.test(await p.$eval('#pzNote', (e) => e.textContent)));
  check('button reads Finish on the last puzzle', (await p.$eval('#pzNext', (e) => e.textContent)) === 'Finish');
  await p.click('#pzNext'); await p.waitForTimeout(200);
  st = await p.evaluate(() => window.__puzzles.state);
  check('session ends with the summary', st.phase === 'end' && await p.$eval('#pzSum', (e) => !e.hidden) && await p.$eval('#pzPlay', (e) => e.hidden));
  const lines = await p.$$eval('#pzLines p', (e) => e.map((x) => x.textContent));
  check('end lines: under 85% and under 15 s', lines.includes('Slow down. Accuracy before speed.') && lines.includes('That was fast. The research says slow, written, whole line. Speed is not the goal here.'), lines.join(' | '));
  check('summary: 2 right of 3', (await p.$eval('#pzRight', (e) => e.textContent)) === '2/3' && /2 right of 3/.test(await p.$eval('#pzSumT', (e) => e.textContent)));
  check('onDone called with the summary', !!summary && summary.n === 3 && summary.right === 2 && summary.own === 1 && summary.ids.length === 3 && summary.ids[0] === 'own:syn1:5', JSON.stringify(summary));
  await p.screenshot({ path: SHOTS + '/pz5-summary.png' });
  let s1 = await p.evaluate(() => window.__puzzles.stats());
  check('stats after: 1 session, last 2/3, acc30 still null under 10', s1.sessions === 1 && s1.last.n === 3 && s1.last.right === 2 && s1.last.meanMs > 0 && s1.acc30 === null && s1.ownCards.total === 1 && s1.ownCards.box3 === 0, JSON.stringify(s1));
  const raw = await p.evaluate(() => JSON.parse(localStorage.getItem('ghostlap-puzzles-v1')).jesse);
  check('store: sessions, seen, own, log as specified', raw.sessions.length === 1 && raw.sessions[0].band.join('-') === '800-999' && Object.keys(raw.seen).length === 2 && raw.log.length === 3
    && raw.log.every((r) => typeof r.right === 'boolean' && r.ms > 0 && r.date && r.id) && raw.own['syn1:5'].fen && raw.own['syn1:5'].best === 'f1c4' && raw.own['syn1:5'].gameId === 'syn1' && raw.own['syn1:5'].ply === 5);
  await p.click('#pzDone'); await p.waitForTimeout(150);
  check('Done goes back to the launcher', await p.evaluate(() => !document.getElementById('puzzles').classList.contains('on') && document.getElementById('hub').classList.contains('on')));

  // ---- session 2: eight more from the set, all right, so acc30 kicks in; seen puzzles are not repeated ----
  const st2 = await p.evaluate(() => window.__puzzles.open({ band: [800, 999], count: 8 }));
  check('session 2: box-2 card not due, all from the set, none seen before', st2.n === 8 && st2.item.kind === 'set' && !raw.seen[st2.item.id]);
  for (let k = 0; k < 8; k++) { await waitMove(); await solve(); await p.evaluate(() => window.__puzzles.next()); }
  st = await p.evaluate(() => window.__puzzles.state);
  s1 = await p.evaluate(() => window.__puzzles.stats());
  check('stats: 2 sessions, last 8/8, acc30 = 90 over 10 set puzzles', st.phase === 'end' && s1.sessions === 2 && s1.last.right === 8 && s1.acc30 === 90 && s1.acc30Easy === 90, JSON.stringify(s1));
  const raw2 = await p.evaluate(() => JSON.parse(localStorage.getItem('ghostlap-puzzles-v1')).jesse);
  check('no set puzzle repeated across sessions', new Set(raw2.log.filter((r) => !r.own).map((r) => r.id)).size === 10);
  await p.evaluate(() => window.__puzzles.close());

  // ---- per player ----
  await p.evaluate(() => window.__coach.setPlayer('j'));
  const sj = await p.evaluate(() => window.__puzzles.stats());
  check('J has her own store', sj.sessions === 0 && sj.ownCards.total === 0, JSON.stringify(sj));
  await p.evaluate(() => window.__coach.setPlayer('jesse'));
  await p.reload(); await p.waitForFunction(() => window.__puzzles, null, { timeout: 5000 });
  check('stats survive a reload', (await p.evaluate(() => window.__puzzles.stats().sessions)) === 2);
  check('no page errors', errs.length === 0, errs.slice(0, 3).join(' | '));
  return done(b);
})().catch(async (e) => { console.error(e); check('test ran to the end', false, e.message); if (b) await b.close(); srv.close(); process.exitCode = 1; });

async function done(b) {
  await b.close(); srv.close();
  const f = results.filter((r) => r[0] === 'FAIL').length;
  console.log('\n' + (results.length - f) + '/' + results.length + ' passed' + (f ? ', ' + f + ' FAILED' : ''));
  process.exitCode = f ? 1 : 0;
}
