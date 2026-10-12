// Headless check of the chess coach with the REAL Stockfish worker in Chromium (iPhone 13 viewport).
// node tools/chess-e2e.js   (screenshots in $SHOTS or /tmp/ghostlap-shots)
const { chromium, devices } = require('/opt/node-tools/node_modules/playwright');
const http = require('http'), fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..');
const SHOTS = process.env.SHOTS || '/tmp/ghostlap-shots'; fs.mkdirSync(SHOTS, { recursive: true });
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.png': 'image/png', '.wasm': 'application/wasm', '.svg': 'image/svg+xml', '.webmanifest': 'application/manifest+json' };
const srv = http.createServer((q, r) => {
  let p = decodeURIComponent(new URL(q.url, 'http://x').pathname); if (p.endsWith('/')) p += 'index.html';
  const f = path.join(ROOT, p);
  if (!f.startsWith(ROOT) || !fs.existsSync(f)) { r.writeHead(404); return r.end('nf'); }
  r.writeHead(200, { 'content-type': TYPES[path.extname(f)] || 'application/octet-stream' }); fs.createReadStream(f).pipe(r);
}).listen(8767);
const results = [];
const check = (name, ok, extra) => { results.push([ok ? 'PASS' : 'FAIL', name, extra || '']); console.log((ok ? 'PASS ' : 'FAIL ') + name + (extra ? '  ' + extra : '')); };

(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ ...devices['iPhone 13'] });
  const p = await ctx.newPage();
  const errs = [];
  p.on('pageerror', (e) => errs.push('pageerror: ' + e.message));
  p.on('console', (m) => { if (m.type() === 'error') errs.push('console: ' + m.text()); });
  const base = 'http://localhost:8767/';
  await p.goto(base);
  await p.waitForTimeout(500);
  await p.screenshot({ path: SHOTS + '/c0-hub.png' });
  check('hub shows first', await p.$eval('#hub', (e) => e.classList.contains('on')));
  await p.click('#pickDrive'); await p.waitForTimeout(200);
  check('Drive opens the race menu', await p.$eval('#menu', (e) => e.classList.contains('on')));
  await p.click('#toHub'); await p.waitForTimeout(200);
  check('Games pill returns to the hub', await p.$eval('#hub', (e) => e.classList.contains('on')));
  await p.click('#pickChess'); await p.waitForTimeout(300);
  check('Chess opens', await p.$eval('#chess', (e) => e.classList.contains('on')));
  await p.screenshot({ path: SHOTS + '/c1-chess-home.png' });
  // real engine must come up
  const ready = await p.waitForFunction(() => window.__coach && window.__coach.state !== undefined, null, { timeout: 5000 }).then(() => true).catch(() => false);
  check('coach hook present', ready);
  await p.evaluate(() => window.__coach.newGame({ color: 'w', elo: 1200 }));
  await p.waitForFunction(() => window.__coach.state === 'playing', null, { timeout: 30000 }).then(() => check('game starts (engine ready)', true)).catch(() => check('game starts (engine ready)', false));
  await p.waitForTimeout(300);
  await p.screenshot({ path: SHOTS + '/c2-game.png' });
  // tap e2 then e4 on the real board
  const tap = async (sq) => { const el = await p.$('#board [data-sq="' + sq + '"]'); check('square ' + sq + ' exists', !!el); if (el) await el.tap(); await p.waitForTimeout(150); };
  await tap('e2'); await p.screenshot({ path: SHOTS + '/c3-selected.png' }); await tap('e4');
  const rated = await p.waitForFunction(() => (document.getElementById('rateLabel').textContent || '').trim().length > 0, null, { timeout: 30000 }).then(() => true).catch(() => false);
  check('human move gets a rating', rated, rated ? await p.$eval('#rate', (e) => e.innerText.replace(/\s+/g, ' ').slice(0, 120)) : '');
  const replied = await p.waitForFunction(() => window.__coach.game && window.__coach.game.moves.length >= 2 && window.__coach.state === 'playing', null, { timeout: 30000 }).then(() => true).catch(() => false);
  check('engine replies', replied, replied ? await p.evaluate(() => window.__coach.game.moves.map((m) => m.san).join(' ')) : '');
  await p.screenshot({ path: SHOTS + '/c4-after-reply.png' });
  // a deliberate blunder: hang the queen if possible via hook moves, else just play a few moves
  for (const m of ['d1h5', 'h5f7']) { const ok = await p.evaluate((u) => window.__coach.move(u), m); if (!ok) break;
    await p.waitForFunction(() => window.__coach.state !== 'thinking', null, { timeout: 30000 }).catch(() => {}); await p.waitForTimeout(200); }
  const hist = await p.evaluate(() => window.__coach.game.moves.map((m) => m.san).join(' '));
  check('several moves played', hist.split(' ').length >= 4, hist);
  await p.screenshot({ path: SHOTS + '/c5-mid.png' });
  check('opening name shown', (await p.$eval('#opening', (e) => e.textContent)).length > 3, await p.$eval('#opening', (e) => e.textContent));
  check('svg pieces rendered', (await p.$$eval('#board .pc.svg', (e) => e.length)) >= 20);
  const hint = await p.evaluate(() => window.__coach.hint());
  check('hint returns the best move', !!(hint && hint.uci && hint.san), JSON.stringify(hint));
  check('hint arrow drawn', (await p.$$eval('#board .arrow line', (e) => e.length)) === 1);
  await p.screenshot({ path: SHOTS + '/c5b-hint.png' });
  await p.evaluate(() => window.__coach.resign());
  await p.waitForSelector('#chessEnd.on', { timeout: 5000 }).then(() => check('resign shows the end sheet', true)).catch(() => check('resign shows the end sheet', false));
  await p.screenshot({ path: SHOTS + '/c6-end.png' });
  await p.click('#endAnalyze');
  const reviewed = await p.waitForFunction(() => window.__coach.state === 'review' && document.getElementById('review').classList.contains('on') && !/analys/i.test(document.getElementById('review').innerText.slice(0, 200)) , null, { timeout: 120000 }).then(() => true).catch(() => false);
  await p.waitForTimeout(400);
  check('analysis completes', reviewed);
  await p.screenshot({ path: SHOTS + '/c7-review.png', fullPage: false });
  await p.click('#rNext'); await p.click('#rNext'); await p.waitForTimeout(200);
  await p.screenshot({ path: SHOTS + '/c8-review-step.png' });
  const h = await p.evaluate(() => JSON.parse(localStorage.getItem('ghostlap-chess-v1')));
  check('hint counted in history', !!(h && h.games[0] && h.games[0].hints === 1), h && h.games[0] && 'hints=' + h.games[0].hints);
  check('history saved with report', !!(h && h.games && h.games.length === 1 && h.games[0].report && h.games[0].report.moves.length >= 4),
    h && h.games && h.games[0] && h.games[0].report ? 'accuracy ' + JSON.stringify(h.games[0].report.accuracy) : JSON.stringify(h).slice(0, 100));
  await p.click('#reviewBack'); await p.waitForTimeout(200);
  check('history list shows the game', (await p.$$eval('#chessHist button', (e) => e.length)) >= 1);
  await p.screenshot({ path: SHOTS + '/c9-home-history.png' });
  await p.click('#themeRow button[data-theme="wood"]'); await p.waitForTimeout(100);
  check('theme persists', (await p.evaluate(() => document.documentElement.dataset.theme + '/' + JSON.parse(localStorage.getItem('ghostlap-chess-v1')).theme)) === 'wood/wood');
  await p.evaluate(() => window.__coach.newGame({ color: 'w', elo: 1600 })); await p.waitForFunction(() => window.__coach.state === 'playing', null, { timeout: 30000 });
  await p.waitForTimeout(300); await p.screenshot({ path: SHOTS + '/c9b-wood.png' });
  check('wood squares', (await p.$eval('#board .sq.d', (e) => getComputedStyle(e).backgroundColor)) === 'rgb(181, 136, 99)', await p.$eval('#board .sq.d', (e) => getComputedStyle(e).backgroundColor));
  // tutor mode: options with reasons, the opponent's idea, take-back after a bad move
  await p.evaluate(() => window.__coach.close()); await p.waitForTimeout(100); await p.evaluate(() => window.__coach.open());
  await p.evaluate(() => window.__coach.newGame({ color: 'w', elo: 1200, tutor: true }));
  const thought = await p.waitForFunction(() => window.__coach.think && window.__coach.think.done, null, { timeout: 60000 }).then(() => true).catch(() => false);
  check('tutor thinks ahead', thought);
  const opts = await p.$$eval('#tutorOpts .opt', (e) => e.map((o) => o.innerText.replace(/\s+/g, ' ')));
  check('three options with reasons', opts.length === 3 && opts.every((o) => o.length > 6), opts.join(' | '));
  const threat = await p.$eval('#tutorThreat', (e) => e.hidden ? '' : e.innerText.replace(/\s+/g, ' '));
  check('opponent idea shown', threat.length > 10, threat);
  await p.click('#tutorOpts .opt >> nth=0'); await p.waitForTimeout(150);
  check('option preview arrow', (await p.$$eval('#board .arrow line.ghost', (e) => e.length)) === 1);
  await p.screenshot({ path: SHOTS + '/c10-tutor.png' });
  await p.evaluate(() => { window.__coach.move('g2g4').catch(() => null); }); // the Grob: a mistake at any depth (not awaited: it resolves after the take-back choice)
  const paused = await p.waitForFunction(() => !document.getElementById('takeRow').hidden, null, { timeout: 30000 }).then(() => true).catch(() => false);
  check('bad move pauses for take-back', paused, await p.$eval('#rate', (e) => e.innerText.replace(/\s+/g, ' ').slice(0, 140)));
  await p.screenshot({ path: SHOTS + '/c11-takeback.png' });
  await p.click('#takeBack'); await p.waitForTimeout(300);
  const undone = await p.evaluate(() => ({ n: window.__coach.game.moves.length, tb: window.__coach.game.takebacks, st: window.__coach.state }));
  check('take-back undoes the move', undone.n === 0 && undone.tb === 1 && undone.st === 'playing', JSON.stringify(undone));
  await p.evaluate(() => window.__coach.move('e2e4'));
  const cont = await p.waitForFunction(() => window.__coach.game.moves.length >= 2 && window.__coach.state === 'playing', null, { timeout: 30000 }).then(() => true).catch(() => false);
  check('game continues after take-back', cont, await p.evaluate(() => window.__coach.game.moves.map((m) => m.san).join(' ')));
  await p.evaluate(() => window.__coach.resign()); await p.waitForTimeout(200);
  const h2 = await p.evaluate(() => JSON.parse(localStorage.getItem('ghostlap-chess-v1')).games[0]);
  check('tutor game tagged in history', h2.tutor === true && h2.takebacks === 1, JSON.stringify({ tutor: h2.tutor, takebacks: h2.takebacks }));
  await p.click('#endHome'); await p.waitForTimeout(200);
  await p.click('#chessBack'); await p.waitForTimeout(200);
  check('back returns to hub', await p.$eval('#hub', (e) => e.classList.contains('on')));
  check('no page errors', errs.length === 0, errs.join(' | ').slice(0, 300));
  await b.close(); srv.close();
  const fails = results.filter((r) => r[0] === 'FAIL').length;
  console.log('\n' + (results.length - fails) + '/' + results.length + ' passed');
  process.exit(fails ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });
