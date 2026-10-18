// Headless check of the four board templates (Stone, Classic, Dark, Wire) in Chromium at iPhone 13 size (390 px, scale 3).
// node tools/themes-e2e.js   (screenshots in $SHOTS or /tmp/ghostlap-shots/themes; PORT=8783 if 8773 is busy)
// Old saved themes migrate (Wood to Classic, the rest to Stone); each template is picked from the settings row, persists, and
// reaches every board (chess, review, lesson, tactics, endgames) with its own squares and all twelve piece SVGs loading.
// Screenshots per template: <name>-chess.png mid-game with a piece picked up, <name>-review.png on the worst moment,
// <name>-tactics.png on a puzzle.
const { chromium, devices } = require('/opt/node-tools/node_modules/playwright');
const http = require('http'), fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..');
const SHOTS = process.env.SHOTS || '/tmp/ghostlap-shots/themes'; fs.mkdirSync(SHOTS, { recursive: true });
const PORT = +process.env.PORT || 8773;
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.png': 'image/png', '.wasm': 'application/wasm', '.svg': 'image/svg+xml', '.webmanifest': 'application/manifest+json' };
const srv = http.createServer((q, r) => {
  let p = decodeURIComponent(new URL(q.url, 'http://x').pathname); if (p.endsWith('/')) p += 'index.html';
  const f = path.join(ROOT, p);
  if (!f.startsWith(ROOT) || !fs.existsSync(f)) { r.writeHead(404); return r.end('nf'); }
  r.writeHead(200, { 'content-type': TYPES[path.extname(f)] || 'application/octet-stream' }); fs.createReadStream(f).pipe(r);
}).listen(PORT);
// per template: the piece folder, the dark square's computed background, whether it is a Stone template (mint, piece named)
const T = {
  stone: { label: 'Stone', dir: 'pieces-stone', sqD: 'rgb(205, 200, 191)', stoneish: true },
  classic: { label: 'Classic', dir: 'pieces', sqD: 'rgb(181, 136, 99)', stoneish: false },
  dark: { label: 'Dark', dir: 'pieces-stone', sqD: 'rgb(46, 53, 68)', stoneish: true },
  wire: { label: 'Wire', dir: 'pieces-stone-wire', sqD: 'rgb(235, 231, 220)', stoneish: true },
};
// a synthetic analysed game (White) with its post-mortem done, as in chess-e2e.js: 3. Nxe5?? hangs the knight
const SYN = () => {
  const mk = (ply, uci, san, label, loss, x) => Object.assign({ ply, color: ply % 2 ? 'w' : 'b', uci, san, label, loss, cpBefore: 30, cpAfter: 30, mateBefore: null, mateAfter: null, best: uci, bestSan: san, reply: null, pv: [], pieces: 14, hung: null }, x || {});
  const moves = [mk(1, 'e2e4', 'e4', 'best', 0), mk(2, 'e7e5', 'e5', 'best', 0), mk(3, 'g1f3', 'Nf3', 'best', 0), mk(4, 'b8c6', 'Nc6', 'best', 0),
    mk(5, 'f3e5', 'Nxe5', 'blunder', 300, { best: 'f1c4', bestSan: 'Bc4', reply: 'c6e5', hung: 'n', cpAfter: -270 }), mk(6, 'c6e5', 'Nxe5', 'best', 0), mk(7, 'd2d4', 'd4', 'great', 10), mk(8, 'e5c6', 'Nc6', 'good', 30)];
  const cnt = (c) => ({ best: 0, great: 0, good: 0, inaccuracy: 0, mistake: 0, blunder: 0, forced: 0, ...c });
  return { id: 'syn1', date: new Date(Date.now() - 864e5).toISOString(), elo: 1200, you: 'w', result: 'loss', reason: 'resign', moves: moves.map((m) => m.uci), sans: moves.map((m) => m.san),
    hints: 0, nudges: 0, tutor: false, takebacks: 0, practice: null, assist: { used: 0, budget: 10 }, hinted: [], times: null, mode: 'play',
    pm: { ply: 5, threat: 'undefended', checked: 'no', tag: 'hung_piece', note: '', at: new Date().toISOString() },
    report: { accuracy: { w: 61, b: 97 }, counts: { w: cnt({ best: 2, great: 1, blunder: 1 }), b: cnt({ best: 3, good: 1 }) }, moves, evals: [30, 30, 30, 30, 30, -270, -270, -280, -260],
      worst: [moves[4]], summary: 'Accuracy 61%. 1 blunder, 0 mistakes, 0 inaccuracies.', lesson: 'Synthetic lesson.' } };
};
const results = [];
const check = (name, ok, extra) => { results.push([ok ? 'PASS' : 'FAIL', name, extra || '']); console.log((ok ? 'PASS ' : 'FAIL ') + name + (extra ? '  ' + extra : '')); };

(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ ...devices['iPhone 13'] });
  const p = await ctx.newPage();
  const errs = [], pieces = {};   // pieces: 'dir/xX.svg' -> HTTP status
  p.on('pageerror', (e) => errs.push('pageerror: ' + e.message));
  p.on('console', (m) => { if (m.type() === 'error') errs.push('console: ' + m.text()); });
  p.on('response', (r) => { const m = /vendor\/(pieces[\w-]*\/\w+\.svg)/.exec(r.url()); if (m) pieces[m[1]] = r.status(); });
  const base = 'http://localhost:' + PORT + '/';
  await p.goto(base); await p.waitForTimeout(300);
  check('a fresh phone starts on Stone', (await p.evaluate(() => document.documentElement.dataset.theme + '/' + window.__coach.theme)) === 'stone/stone');

  // ---- migration from the five old themes ----
  const seed = (jesse, j, extra) => p.evaluate(([a, c, x]) => localStorage.setItem('ghostlap-chess-v1', JSON.stringify(Object.assign({ player: 'jesse', stoneDefault: true,
    players: { jesse: { name: 'Jesse', theme: a, games: [] }, j: { name: 'J', theme: c, games: [] } } }, x || {}))), [jesse, j, extra]);
  const themes = async () => { await p.reload(); await p.waitForTimeout(300);
    const a = await p.evaluate(() => document.documentElement.dataset.theme + '/' + window.__coach.theme); await p.evaluate(() => window.__coach.setPlayer('j'));
    const c = await p.evaluate(() => document.documentElement.dataset.theme + '/' + window.__coach.theme); await p.evaluate(() => window.__coach.setPlayer('jesse')); return a + ' ' + c; };
  await seed('wood', 'night'); let m = await themes();
  check('saved Wood becomes Classic, Night becomes Stone', m === 'classic/classic stone/stone', m);
  await seed('modern', 'mono'); m = await themes();
  check('saved Modern and Mono become Stone', m === 'stone/stone stone/stone', m);
  await seed('marble', 'dark'); m = await themes();
  check('an unknown theme falls back to Stone; Dark is kept', m === 'stone/stone dark/dark', m);
  await seed('night', 'wire', { stoneDefault: false }); m = await themes();
  check('the old Stone-default move still lands Night on Stone, Wire is kept', m === 'stone/stone wire/wire', m);
  await p.evaluate(() => window.__coach.setPlayer('j'));   // a persist, so the saved value is the migrated one
  await p.evaluate(() => window.__coach.setPlayer('jesse'));
  check('the migrated theme is what gets saved', (await p.evaluate(() => JSON.parse(localStorage.getItem('ghostlap-chess-v1')).players.jesse.theme)) === 'stone');

  // ---- the picker, then each template on every board ----
  await p.evaluate((g) => localStorage.setItem('ghostlap-chess-v1', JSON.stringify({ player: 'jesse', stoneDefault: true, players: { jesse: { name: 'Jesse', theme: 'stone', games: [g] }, j: { name: 'J', games: [] } } })), SYN());
  await p.reload(); await p.waitForTimeout(300);
  await p.click('#pickChess'); await p.waitForTimeout(300);
  const row = await p.$$eval('#themeRow button', (e) => e.map((x) => [x.dataset.theme, x.textContent, x.getAttribute('aria-label')]));
  check('picker: four templates in order, labelled, with aria-labels', JSON.stringify(row) === JSON.stringify(Object.keys(T).map((k) => [k, T[k].label, k + ' board'])), JSON.stringify(row));
  await p.$eval('#themeRow', (e) => e.scrollIntoView({ block: 'center' })); await p.waitForTimeout(100);
  await p.screenshot({ path: SHOTS + '/picker.png' });
  await p.$eval('#chess', (e) => { e.scrollTop = 0; });
  const dirOf = (sel) => p.$$eval(sel + ' .pc.svg', (e) => [...new Set(e.map((x) => getComputedStyle(x).backgroundImage.replace(/^.*\/vendor\//, '').replace(/\/\w+\.svg"?\)$/, '')))]);
  const sqD = (sel) => p.$eval(sel + ' .sq.d', (e) => getComputedStyle(e).backgroundColor);
  let first = true;
  for (const k of Object.keys(T)) {
    const t = T[k];
    await p.click('#themeRow button[data-theme="' + k + '"]'); await p.waitForTimeout(150);
    check(k + ': picked from the settings row, saved, marked on', (await p.evaluate(() => document.documentElement.dataset.theme + '/' + JSON.parse(localStorage.getItem('ghostlap-chess-v1')).players.jesse.theme)) === k + '/' + k
      && (await p.$eval('#themeRow button.on', (e) => e.dataset.theme)) === k);
    // review: the synthetic game's worst moment, best move drawn as an arrow
    await p.click('#chessHist .hcard:last-child .rv');
    await p.waitForFunction(() => document.getElementById('review').classList.contains('on') && !document.getElementById('rBody').hidden, null, { timeout: 10000 }).catch(() => {});
    const w = await p.$('#rWorst button'); if (w) await w.click(); else for (let i = 0; i < 5; i++) await p.click('#rNext');
    await p.waitForTimeout(250);
    await p.$eval('#rBoard', (e) => e.scrollIntoView({ block: 'center' })); await p.waitForTimeout(100);
    check(k + ': review board follows the template', (await sqD('#rBoard')) === t.sqD && JSON.stringify(await dirOf('#rBoard')) === JSON.stringify([t.dir]) && (await p.$$eval('#rBoard .arrow line', (e) => e.length)) >= 1, (await sqD('#rBoard')) + ' ' + (await dirOf('#rBoard')));
    await p.screenshot({ path: SHOTS + '/' + k + '-review.png' });
    await p.click('#reviewBack'); await p.waitForTimeout(200);
    // chess: three moves into a game, a knight picked up
    await p.evaluate(() => window.__coach.newGame({ color: 'w', elo: 1200 })); await p.waitForTimeout(150);
    if (first) { await p.click('#ctxSkip'); first = false; }
    await p.waitForFunction(() => window.__coach.state === 'playing', null, { timeout: 30000 });
    for (const pick of [['e2e4', 'd2d4'], ['g1f3', 'b1c3'], ['f1c4', 'f1e2', 'd2d3']]) {
      await p.evaluate((ms) => { const c = window.__coach.game.chess, legal = c.moves({ verbose: true }).map((x) => x.from + x.to); window.__coach.move(ms.find((u) => legal.includes(u)) || legal[0]); }, pick);
      await p.waitForFunction(() => window.__coach.state === 'playing' && window.__coach.game.moves.length % 2 === 0, null, { timeout: 30000 }).catch(() => {});
      await p.waitForTimeout(150);
    }
    const kn = await p.evaluate(() => { const c = window.__coach.game.chess; return ['f3', 'c3', 'b1', 'g1'].find((s) => { const q = c.get(s); return q && q.type === 'n' && q.color === 'w' && c.moves({ square: s }).length; }); });
    await p.tap('#board [data-sq="' + kn + '"]'); await p.waitForTimeout(150);
    const named = await p.$eval('#youName', (e) => e.parentNode.dataset.pc);
    check(k + ': chess board follows the template', (await sqD('#board')) === t.sqD && JSON.stringify(await dirOf('#board')) === JSON.stringify([t.dir]) && (await p.$$eval('#board .sq.tgt, #board .sq.cap', (e) => e.length)) >= 2, (await sqD('#board')) + ' ' + (await dirOf('#board')));
    check(k + ': ' + (t.stoneish ? 'names the piece you pick up' : 'no piece name (Stone templates only)'), t.stoneish ? named === 'Knight' : named === undefined, String(named));
    check(k + ': ' + (t.stoneish ? 'mint selection' : 'amber ring on the selection'), (await p.$eval('#board .sq.sel', (e) => getComputedStyle(e, '::before').boxShadow)).includes(t.stoneish ? (k === 'wire' ? 'rgb(22, 163, 108)' : 'rgb(72, 196, 140)') : 'rgb(242, 178, 76)'));
    await p.evaluate(() => window.scrollTo(0, 0)); await p.$eval('#chess', (e) => { e.scrollTop = 0; });
    await p.screenshot({ path: SHOTS + '/' + k + '-chess.png' });
    await p.waitForTimeout(1300);
    await p.evaluate(() => window.__coach.close()); await p.waitForTimeout(200);
    // lesson
    await p.evaluate(() => window.__learn.show('italian')); await p.waitForTimeout(200);
    check(k + ': lesson board follows the template', (await sqD('#lBoard')) === t.sqD && JSON.stringify(await dirOf('#lBoard')) === JSON.stringify([t.dir]));
    // tactics
    await p.evaluate(() => window.__puzzles.open({ band: [800, 999], count: 1 }));
    await p.waitForFunction(() => window.__puzzles.state.phase === 'move', null, { timeout: 10000 }).catch(() => {});
    await p.waitForTimeout(300);
    check(k + ': tactics board follows the template', (await sqD('#pzBoard')) === t.sqD && JSON.stringify(await dirOf('#pzBoard')) === JSON.stringify([t.dir]));
    await p.screenshot({ path: SHOTS + '/' + k + '-tactics.png' });
    await p.evaluate(() => window.__puzzles.close()); await p.waitForTimeout(150);
    // endgames: the small preview board under a card
    await p.evaluate(() => window.__endgames.open()); await p.waitForTimeout(200);
    await p.click('#egList .eg-look'); await p.waitForTimeout(200);
    check(k + ': endgames preview board follows the template', (await sqD('#egList .board')) === t.sqD && JSON.stringify(await dirOf('#egList .board')) === JSON.stringify([t.dir]));
    await p.evaluate(() => window.__endgames.close()); await p.waitForTimeout(150);
    await p.evaluate(() => { for (const e of document.querySelectorAll('.screen.on')) e.classList.remove('on'); }); await p.click('#pickChess').catch(() => {}); await p.waitForTimeout(250);
    if (!(await p.$eval('#chess', (e) => e.classList.contains('on')))) { await p.evaluate(() => window.__hub && window.__hub.show()); await p.click('#pickChess'); await p.waitForTimeout(250); }
  }
  for (const d of ['pieces-stone', 'pieces', 'pieces-stone-wire']) {
    const got = Object.keys(pieces).filter((u) => u.startsWith(d + '/'));
    check('all twelve ' + d + ' SVGs load (no 404s)', got.length === 12 && got.every((u) => pieces[u] === 200), JSON.stringify(got.filter((u) => pieces[u] !== 200)));
  }
  await p.reload(); await p.waitForTimeout(300);
  check('the last template picked persists across a reload', (await p.evaluate(() => document.documentElement.dataset.theme + '/' + window.__coach.theme)) === 'wire/wire');
  check('no page errors', errs.length === 0, errs.slice(0, 3).join(' | '));
  await b.close(); srv.close();
  const fail = results.filter((r) => r[0] === 'FAIL').length;
  console.log('\n' + (results.length - fail) + '/' + results.length + ' passed');
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
