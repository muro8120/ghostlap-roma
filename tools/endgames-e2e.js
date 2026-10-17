// Headless check of the ENDGAMES screen with the REAL Stockfish worker in Chromium (iPhone 13 viewport): the catalogue,
// the per-player store, and a K+Q drill played to mate through __coach.drill with the engine defending.
// node tools/endgames-e2e.js           (screenshots in $SHOTS or /tmp/ghostlap-shots; PORT=8774 if 8772 is busy)
// node tools/endgames-e2e.js --smoke   catalogue screen only (no drill), for a coach without __coach.drill
// If index.html does not load endgames.js yet, the script is injected after load with page.addScriptTag.
const { chromium, devices } = require('/opt/node-tools/node_modules/playwright');
const http = require('http'), fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..');
const SMOKE = process.argv.includes('--smoke');
const SHOTS = process.env.SHOTS || '/tmp/ghostlap-shots'; fs.mkdirSync(SHOTS, { recursive: true });
const PORT = +process.env.PORT || 8772;
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.png': 'image/png', '.wasm': 'application/wasm', '.svg': 'image/svg+xml', '.webmanifest': 'application/manifest+json' };
const srv = http.createServer((q, r) => {
  let p = decodeURIComponent(new URL(q.url, 'http://x').pathname); if (p.endsWith('/')) p += 'index.html';
  const f = path.join(ROOT, p);
  if (!f.startsWith(ROOT) || !fs.existsSync(f)) { r.writeHead(404); return r.end('nf'); }
  r.writeHead(200, { 'content-type': TYPES[path.extname(f)] || 'application/octet-stream' }); fs.createReadStream(f).pipe(r);
}).listen(PORT);
const results = [];
const check = (name, ok, extra) => { results.push([ok ? 'PASS' : 'FAIL', name, extra || '']); console.log((ok ? 'PASS ' : 'FAIL ') + name + (extra ? '  ' + extra : '')); };
const KEY = 'ghostlap-endgames-v1';

(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ ...devices['iPhone 13'] });
  const p = await ctx.newPage();
  const errs = [];
  p.on('pageerror', (e) => errs.push('pageerror: ' + e.message));
  p.on('console', (m) => { if (m.type() === 'error') errs.push('console: ' + m.text()); });
  const base = 'http://localhost:' + PORT + '/';
  // load the app and make sure endgames.js is there (injected when the orchestrator has not wired the tag yet)
  const boot = async () => {
    await p.goto(base); await p.waitForTimeout(500);
    await p.waitForFunction(() => !!window.__coach, null, { timeout: 10000 }).catch(() => {});
    if (!(await p.evaluate(() => !!window.__endgames))) await p.addScriptTag({ url: 'endgames.js' });
    return p.evaluate(() => !!window.__endgames);
  };
  check('endgames.js loads and exposes __endgames', await boot());
  await p.evaluate((k) => localStorage.removeItem(k), KEY);
  await boot();

  // ---- the catalogue ----------------------------------------------------------------------------------------------------
  check('section injected and hidden at load', await p.evaluate(() => { const s = document.getElementById('endgames'); return !!s && s.classList.contains('screen') && !s.classList.contains('on'); }));
  check('styles injected with the eg- prefix', await p.evaluate(() => [...document.querySelectorAll('style')].some((s) => /\.eg-pos/.test(s.textContent))));
  await p.evaluate(() => window.__endgames.open({ set: 'all' })); await p.waitForTimeout(150);
  const all = await p.evaluate(() => ({
    on: document.getElementById('endgames').classList.contains('on'),
    others: [...document.querySelectorAll('.screen.on')].map((e) => e.id),
    cards: document.querySelectorAll('#egList .eg-pos').length,
    heads: [...document.querySelectorAll('#egList h2')].map((h) => h.textContent),
    plays: document.querySelectorAll('#egList .eg-play').length,
    stat: document.querySelector('#egList .eg-pos[data-id="kq-corner"] .eg-stat').textContent,
    sub: document.querySelector('#egList .eg-pos[data-id="kq-corner"] .eg-sub').textContent,
    goals: [...document.querySelectorAll('#egList .eg-goal')].map((g) => g.textContent),
    sum: [...document.querySelectorAll('#egSum .srow')].map((r) => r.textContent).join(' '),
    catalogue: window.__endgames.catalogue.length,
  }));
  await p.screenshot({ path: SHOTS + '/e1-endgames.png' });
  check('open(all) shows the screen alone', all.on && all.others.length === 1 && all.others[0] === 'endgames', all.others.join(','));
  check('every position has a card and a Play button', all.cards === all.catalogue && all.cards === 32 && all.plays === 32, all.cards + ' cards');
  check('grouped by set', all.heads.length === 3 && /Stage 0/.test(all.heads[0]) && /Stage 1/.test(all.heads[1]) && /Stage 2/.test(all.heads[2]), all.heads.join(' | '));
  check('each card labelled win or draw', all.goals.length === 32 && all.goals.every((g) => g === 'Win' || g === 'Draw') && all.goals.includes('Draw'));
  check('status line before any try', /Not tried yet/.test(all.stat) && /0:30/.test(all.stat) && /White/.test(all.sub) && /target 0:30/.test(all.sub), all.stat + ' / ' + all.sub);
  check('summary row', /Queen mate, best/.test(all.sum) && /The twenty0 \/ 20/.test(all.sum), all.sum);
  await p.evaluate(() => window.__endgames.open({ set: 'S0' })); await p.waitForTimeout(100);
  const s0 = await p.evaluate(() => ({ cards: [...document.querySelectorAll('#egList .eg-pos')].map((c) => c.dataset.id), pill: document.querySelector('#egSets .pill.on').dataset.set, filter: window.__endgames.filter }));
  check('open(S0) shows only Stage 0', s0.cards.length === 10 && s0.cards.includes('kp-hold') && s0.pill === 'S0' && s0.filter === 'S0', s0.cards.join(','));
  await p.click('#egSets .pill[data-set="S2"]'); await p.waitForTimeout(100);
  check('set pills switch the list', (await p.$$eval('#egList .eg-pos', (e) => e.length)) === 20);
  await p.click('#egSets .pill[data-set="S0"]'); await p.waitForTimeout(100);
  await p.click('#egList .eg-pos[data-id="kq-black"] .eg-look'); await p.waitForTimeout(150);
  const peek = await p.evaluate(() => { const bd = document.querySelector('#egList .eg-pos[data-id="kq-black"] .eg-brow .board'); return bd && { sq: bd.querySelectorAll('.sq').length, pcs: bd.querySelectorAll('.pc.svg').length, bottomLeft: bd.children[56].dataset.sq, w: bd.getBoundingClientRect().width }; });
  check('Board shows the position, flipped for Black', !!peek && peek.sq === 64 && peek.pcs === 3 && peek.bottomLeft === 'h8' && peek.w > 150, JSON.stringify(peek));
  await p.screenshot({ path: SHOTS + '/e2-endgames-board.png' });
  const st0 = await p.evaluate(() => window.__endgames.stats());
  check('stats() before any drill', st0.KQ_ms_best === null && st0.KR_ms_best === null && st0.KP_win === false && st0.rook2_convert === false && st0.mastered === 0 && st0.total === 20 && JSON.stringify(st0.perPos) === '{}', JSON.stringify(st0));
  const cb = await p.evaluate(() => new Promise((res) => { window.__endgames.open({ set: 'S2', onDone: (s) => res({ total: s.total, on: document.getElementById('endgames').classList.contains('on') }) }); window.__endgames.close(); }));
  check('close() hands stats to onDone', cb.total === 20 && !cb.on, JSON.stringify(cb));
  await p.evaluate(() => window.__endgames.open()); await p.click('#egBack'); await p.waitForTimeout(150);
  check('Back without onDone returns to the launcher', await p.$eval('#hub', (e) => e.classList.contains('on')));
  // a record written by hand shows on the card and survives a reload
  await p.evaluate((k) => localStorage.setItem(k, JSON.stringify({ j: { pos: { 'kr-opp': { best: 21000, tries: 3, wins: 2, ok: 2, last: new Date().toISOString(), mastered: true } } } })), KEY);
  await boot();
  await p.evaluate(() => window.__coach.setPlayer('j'));
  await p.evaluate(() => window.__endgames.open({ set: 'S0' })); await p.waitForTimeout(100);
  const jv = await p.evaluate(() => ({ st: document.querySelector('#egList .eg-pos[data-id="kr-opp"] .eg-stat').textContent, done: document.querySelector('#egList .eg-pos[data-id="kr-opp"]').classList.contains('done'), s: window.__endgames.stats() }));
  check('per player: J sees her record', /Best 0:21/.test(jv.st) && /3 tries/.test(jv.st) && /mastered/.test(jv.st) && jv.done && jv.s.KR_ms_best === 21000, jv.st);
  await p.evaluate(() => window.__coach.setPlayer('jesse'));
  await p.evaluate(() => window.__endgames.open({ set: 'S0' })); await p.waitForTimeout(100);
  check('per player: Jesse does not', (await p.evaluate(() => window.__endgames.stats().KR_ms_best)) === null && /Not tried/.test(await p.$eval('#egList .eg-pos[data-id="kr-opp"] .eg-stat', (e) => e.textContent)));
  await p.evaluate((k) => localStorage.removeItem(k), KEY);

  // ---- a K+Q drill played to mate through the coach --------------------------------------------------------------------
  if (SMOKE) console.log('(--smoke: drill checks skipped)');
  else {
    await boot();
    const hasDrill = await p.evaluate(() => typeof (window.__coach && window.__coach.drill) === 'function');
    check('__coach.drill exists', hasDrill);
    if (hasDrill) {
      await p.evaluate(() => window.__endgames.open({ set: 'S0' })); await p.waitForTimeout(100);
      await p.click('#egList .eg-pos[data-id="kq-corner"] .eg-play');
      const started = await p.waitForFunction(() => window.__coach.state === 'playing' && window.__coach.game && window.__coach.game.drill, null, { timeout: 30000 }).then(() => true).catch(() => false);
      const g = await p.evaluate(() => ({ chess: document.getElementById('chess').classList.contains('on'), eg: document.getElementById('endgames').classList.contains('on'), fen: window.__coach.game && window.__coach.game.chess.fen(), you: window.__coach.game && window.__coach.game.you, elo: window.__coach.game && window.__coach.game.elo, opp: document.getElementById('oppName').textContent }));
      check('Play starts the drill on the coach board', started && g.chess && !g.eg && /^8\/8\/8\/4k3\/8\/8\/8\/K6Q w/.test(g.fen) && g.you === 'w' && g.elo === 2850, JSON.stringify(g));
      check('drill shows a timer where the opponent name goes', /^\d+:\d\d$/.test(g.opp), g.opp);
      await p.screenshot({ path: SHOTS + '/e3-drill.png' });
      // our moves come from a second full-strength engine in the page; the coach's engine defends at 2850
      await p.evaluate(() => { window.__egHelper = window.ChessEngine.create(); return window.__egHelper.ready(); });
      let plies = 0;
      for (let i = 0; i < 40; i++) {
        const turn = await p.waitForFunction(() => { const c = window.__coach, gm = c.game; return gm && (gm.chess.game_over() || (c.state === 'playing' && gm.chess.turn() === gm.you)); }, null, { timeout: 30000 }).then(() => true).catch(() => false);
        if (!turn) break;
        const over = await p.evaluate(() => window.__coach.game.chess.game_over());
        if (over) break;
        const ok = await p.evaluate(async () => { const fen = window.__coach.game.chess.fen(), r = await window.__egHelper.evaluate(fen, { depth: 14 }); return r.best ? window.__coach.move(r.best) : false; });
        if (!ok) break;
        plies++;
      }
      const end = await p.evaluate(() => ({ mate: window.__coach.game && window.__coach.game.chess.in_checkmate(), fen: window.__coach.game && window.__coach.game.chess.fen() }));
      check('the drill is played to mate', end.mate, plies + ' of our moves, ' + end.fen);
      const rec = await p.waitForFunction(() => { const s = window.__endgames.stats().perPos['kq-corner']; return s && s.tries === 1 && s; }, null, { timeout: 10000 }).then((h) => h.jsonValue()).catch(() => null);
      check('onDone recorded the run', !!rec && rec.wins === 1 && rec.best > 0 && rec.lastResult && rec.lastResult.result === 'win' && rec.lastResult.met && !rec.mastered, JSON.stringify(rec));
      const st = await p.evaluate(() => window.__endgames.stats());
      check('stats(): K+Q best time', !!rec && st.KQ_ms_best === rec.best && st.KR_ms_best === null && st.mastered === 0, JSON.stringify({ KQ: st.KQ_ms_best, KR: st.KR_ms_best }));
      check('stored per player under ' + KEY, await p.evaluate((k) => { try { const s = JSON.parse(localStorage.getItem(k)); return !!(s && s.jesse && s.jesse.pos && s.jesse.pos['kq-corner'] && s.jesse.pos['kq-corner'].tries === 1); } catch (e) { return false; } }, KEY));
      const sheet = await p.waitForSelector('#chessEnd.on', { timeout: 5000 }).then(() => true).catch(() => false);
      await p.screenshot({ path: SHOTS + '/e4-drill-end.png' });
      const btns = await p.$$eval('#chessEnd.on button', (e) => e.filter((x) => x.offsetParent !== null).map((x) => x.textContent.trim()));
      check('end sheet offers Again and Back', sheet && btns.some((t) => /^Again/.test(t)) && btns.some((t) => /^Back/.test(t)), btns.join(' | '));
      let clicked = false;
      for (const h of await p.$$('#chessEnd.on button')) { const t = (await h.textContent()).trim(); if (/^Back/.test(t) && await h.isVisible()) { await h.click(); clicked = true; break; } }
      await p.waitForTimeout(250);
      const back = await p.evaluate(() => ({ on: document.getElementById('endgames').classList.contains('on'), chess: document.getElementById('chess').classList.contains('on'), st: (document.querySelector('#egList .eg-pos[data-id="kq-corner"] .eg-stat') || {}).textContent }));
      check('Back returns to the catalogue with the new status', clicked && back.on && !back.chess && /Best \d+:\d\d/.test(back.st) && /1 try/.test(back.st) && /1 win/.test(back.st), JSON.stringify(back));
      await p.screenshot({ path: SHOTS + '/e5-after-drill.png' });
      await boot();
      check('the record survives a reload', (await p.evaluate(() => (window.__endgames.stats().perPos['kq-corner'] || {}).tries)) === 1);
    }
  }

  check('no page errors', errs.length === 0, errs.join(' | ').slice(0, 300));
  await b.close(); srv.close();
  const fails = results.filter((r) => r[0] === 'FAIL').length;
  console.log('\n' + (results.length - fails) + '/' + results.length + ' passed');
  process.exit(fails ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });
