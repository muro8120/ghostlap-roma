// Headless check of the chess coach with the REAL Stockfish worker in Chromium (iPhone 13 viewport).
// node tools/chess-e2e.js   (screenshots in $SHOTS or /tmp/ghostlap-shots; PORT=8768 if 8767 is busy)
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
}).listen(+process.env.PORT || 8767);
const results = [];
const check = (name, ok, extra) => { results.push([ok ? 'PASS' : 'FAIL', name, extra || '']); console.log((ok ? 'PASS ' : 'FAIL ') + name + (extra ? '  ' + extra : '')); };

(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ ...devices['iPhone 13'] });
  const p = await ctx.newPage();
  const errs = [];
  p.on('pageerror', (e) => errs.push('pageerror: ' + e.message));
  p.on('console', (m) => { if (m.type() === 'error') errs.push('console: ' + m.text()); });
  const base = 'http://localhost:' + (+process.env.PORT || 8767) + '/';
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
  if (rated) { await p.click('#whyBtn'); await p.waitForTimeout(100); const why = await p.$$eval('#why div', (e) => e.map((d) => d.textContent)); check('αβ explains the move', why.length >= 3 && why.some((t) => /^You played/.test(t)) && why.some((t) => /^Engine line/.test(t)), why.join(' | ').slice(0, 200)); await p.click('#whyBtn'); }
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
  await p.click('#rWhyBtn'); await p.waitForTimeout(100);
  check('αβ in the review', (await p.$$eval('#rWhy div', (e) => e.length)) >= 2, await p.$eval('#rWhy', (e) => e.innerText.slice(0, 160)));
  await p.screenshot({ path: SHOTS + '/c8-review-step.png' });
  const h = await p.evaluate(() => JSON.parse(localStorage.getItem('ghostlap-chess-v1')).players.jesse);
  check('hint counted in history', !!(h && h.games[0] && h.games[0].hints === 1), h && h.games[0] && 'hints=' + h.games[0].hints);
  check('history saved with report', !!(h && h.games && h.games.length === 1 && h.games[0].report && h.games[0].report.moves.length >= 4),
    h && h.games && h.games[0] && h.games[0].report ? 'accuracy ' + JSON.stringify(h.games[0].report.accuracy) : JSON.stringify(h).slice(0, 100));
  await p.click('#reviewBack'); await p.waitForTimeout(200);
  check('patterns card reads the analysed game', /analysed game/.test(await p.$eval('#patterns', (e) => e.innerText)), await p.$eval('#patterns', (e) => e.innerText.replace(/\s+/g, ' ').slice(0, 120)));
  check('history list shows the game', (await p.$$eval('#chessHist button', (e) => e.length)) >= 1);
  await p.screenshot({ path: SHOTS + '/c9-home-history.png' });
  await p.click('#themeRow button[data-theme="wood"]'); await p.waitForTimeout(100);
  check('theme persists', (await p.evaluate(() => document.documentElement.dataset.theme + '/' + JSON.parse(localStorage.getItem('ghostlap-chess-v1')).players.jesse.theme)) === 'wood/wood');
  await p.evaluate(() => window.__coach.newGame({ color: 'w', elo: 1600 })); await p.waitForFunction(() => window.__coach.state === 'playing', null, { timeout: 30000 });
  await p.waitForTimeout(300); await p.screenshot({ path: SHOTS + '/c9b-wood.png' });
  check('wood squares', (await p.$eval('#board .sq.d', (e) => getComputedStyle(e).backgroundColor)) === 'rgb(181, 136, 99)', await p.$eval('#board .sq.d', (e) => getComputedStyle(e).backgroundColor));
  // J's profile: quiet coach, separate history
  await p.evaluate(() => window.__coach.setPlayer('j'));
  check('J starts with no games', (await p.$$eval('#chessHist button', (e) => e.length)) === 0 && (await p.$eval('#voiceBtn', (e) => e.textContent)) === 'Quiet');
  await p.evaluate(() => window.__coach.newGame({ color: 'w', elo: 1200 }));
  await p.waitForFunction(() => window.__coach.state === 'playing', null, { timeout: 30000 });
  await p.evaluate(() => window.__coach.move('e2e4'));
  await p.waitForFunction(() => window.__coach.game.moves.length >= 2 && window.__coach.state === 'playing', null, { timeout: 30000 }).catch(() => {});
  const quiet = await p.evaluate(() => ({ rateHidden: document.getElementById('rate').hidden, labelled: document.querySelectorAll('#moveList .m[class*="l-"]').length, rated: !!(window.__coach.lastRating && window.__coach.lastRating.label) }));
  check('quiet mode shows no verdicts but still rates', quiet.rateHidden && quiet.labelled === 0 && quiet.rated, JSON.stringify(quiet));
  await p.screenshot({ path: SHOTS + '/c12-quiet.png' });
  await p.evaluate(() => window.__coach.resign()); await p.waitForTimeout(200);
  check('quiet end sheet is neutral', !/respect|didn’t even/.test(await p.$eval('#endMsg', (e) => e.textContent)), await p.$eval('#endMsg', (e) => e.textContent));
  await p.click('#endHome'); await p.waitForTimeout(200);
  const jh = await p.evaluate(() => ({ j: window.__coach.history.length, store: JSON.parse(localStorage.getItem('ghostlap-chess-v1')) }));
  check('assist recorded in history', !!(jh.store.players.jesse.games[0].assist) && jh.store.players.jesse.games[0].assist.budget === 10, JSON.stringify(jh.store.players.jesse.games[0].assist));
  check('J has his own history', jh.j === 1 && jh.store.players.jesse.games.length >= 1 && jh.store.players.j.games.length === 1, JSON.stringify({ j: jh.j, jesse: jh.store.players.jesse.games.length }));
  await p.evaluate(() => { window.__coach.setPlayer('jesse'); window.__coach.setVoice('kind'); });
  await p.evaluate(() => window.__coach.newGame({ color: 'w', elo: 1200 }));
  await p.waitForFunction(() => window.__coach.state === 'playing', null, { timeout: 30000 });
  await p.evaluate(() => window.__coach.move('e2e4'));
  await p.waitForFunction(() => window.__coach.lastRating && window.__coach.lastRating.label, null, { timeout: 30000 }).catch(() => {});
  const kind = await p.$eval('#rateJab', (e) => e.textContent);
  check('kind voice is factual', /Best move|better|Fine|Very good/.test(kind), kind);
  // nudge: sandbox a move (rated, not played, no answer) and read the board
  const sb = await p.evaluate(() => window.__coach.sandbox('d2d4'));
  const sbState = await p.evaluate(() => ({ n: window.__coach.game.moves.length, left: window.__coach.game.sandLeft, nudges: window.__coach.game.nudges, strip: document.getElementById('rate').innerText.replace(/\s+/g, ' ').slice(0, 100) }));
  check('sandbox rates without playing', !!(sb && sb.label) && sbState.n === 2 && sbState.left === 1 && sbState.nudges === 1 && /sandbox/i.test(sbState.strip), JSON.stringify(sb) + ' ' + JSON.stringify(sbState));
  check('sandbox hides the better move', !/was the move|Best was/.test(sbState.strip), sbState.strip);
  const rb = await p.evaluate(() => window.__coach.readBoard());
  const bud = await p.evaluate(() => ({ budget: window.__coach.game.budget, used: window.__coach.game.used, line: document.getElementById('assistLine').textContent }));
  check('assist budget counts nudges', bud.budget === 10 && bud.used === 2 && /8 of 10/.test(bud.line), JSON.stringify(bud));
  // burn the rest with hints (3 each): 2 more hints fit, the third must degrade to a nudge, then nothing
  await p.evaluate(() => window.__coach.move('e2e4').then(() => null)); await p.waitForFunction(() => window.__coach.state === 'playing' && window.__coach.game.moves.length >= 2, null, { timeout: 30000 }).catch(() => {});
  const hA = await p.evaluate(() => window.__coach.hint()); await p.evaluate(() => window.__coach.move('b1c3')); await p.waitForFunction(() => window.__coach.state === 'playing' && window.__coach.game.moves.length >= 4, null, { timeout: 30000 }).catch(() => {});
  const hB = await p.evaluate(() => window.__coach.hint()); await p.evaluate(() => window.__coach.move('g1f3')); await p.waitForFunction(() => window.__coach.state === 'playing' && window.__coach.game.moves.length >= 6, null, { timeout: 30000 }).catch(() => {});
  const hC = await p.evaluate(() => window.__coach.hint());
  const bud2 = await p.evaluate(() => ({ used: window.__coach.game.used, hintDisabled: document.getElementById('hintBtn').disabled, nudgeRow: !document.getElementById('nudgeRow').hidden }));
  check('soft cap: hint degrades to a nudge when it cannot afford 3', !!(hA && hA.uci) && !!(hB && hB.uci) && !!(hC && hC.degraded) && bud2.used === 8 && bud2.nudgeRow, JSON.stringify({ hA: !!hA, hB: !!hB, hC, bud2 }));
  check('read the board', Array.isArray(rb) && rb.length >= 6 && rb.some((l) => /^Material/.test(l)) && rb.some((l) => /^Your priority/.test(l)) && rb.some((l) => /^Their priority/.test(l)), (rb || []).join(' | ').slice(0, 240));
  await p.screenshot({ path: SHOTS + '/c13-read.png' });
  await p.evaluate(() => { window.__coach.resign(); window.__coach.setVoice('tough'); }); await p.waitForTimeout(200);
  await p.click('#endHome'); await p.waitForTimeout(100);
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
  const h2 = await p.evaluate(() => JSON.parse(localStorage.getItem('ghostlap-chess-v1')).players.jesse.games[0]);
  check('tutor game tagged in history', h2.tutor === true && h2.takebacks === 1, JSON.stringify({ tutor: h2.tutor, takebacks: h2.takebacks }));
  await p.click('#endHome'); await p.waitForTimeout(200);
  // learn: lessons, the step-through board, practice hands over to the coach with the book line
  await p.click('#chessBack'); await p.waitForTimeout(200);
  await p.click('#pickLearn'); await p.waitForTimeout(200);
  check('learn opens with lessons', await p.$eval('#learn', (e) => e.classList.contains('on')) && (await p.$$eval('#learnList .lcard', (e) => e.length)) >= 8);
  await p.screenshot({ path: SHOTS + '/c14-learn.png' });
  await p.evaluate(() => window.__learn.show('italian')); await p.waitForTimeout(200);
  await p.click('#lNext'); await p.click('#lNext'); await p.click('#lNext'); await p.waitForTimeout(150);
  const les = await p.evaluate(() => ({ ply: window.__learn.ply, note: document.getElementById('lNote').textContent, pcs: document.querySelectorAll('#lBoard .pc.svg').length, bc4: !!document.querySelector('#lBoard [data-sq="c4"] .pc.svg') }));
  check('lesson steps through the line', les.ply === 3 && les.note.length > 10 && les.pcs === 32 && !les.bc4 && true, JSON.stringify(les).slice(0, 160));
  await p.click('#lNext'); await p.click('#lNext'); await p.waitForTimeout(150);
  check('bishop lands on c4 at move 5', await p.evaluate(() => !!document.querySelector('#lBoard [data-sq="c4"] .pc.svg.cw.tb')));
  await p.screenshot({ path: SHOTS + '/c15-lesson.png' });
  const histBefore = await p.evaluate(() => window.__coach.history.map((g) => g.id).join(','));
  await p.click('#lPractice');
  await p.waitForFunction(() => window.__coach.state === 'playing', null, { timeout: 30000 });
  check('practice starts a game', await p.$eval('#chess', (e) => e.classList.contains('on')) && (await p.evaluate(() => !!window.__coach.game.practice)));
  const shown = (sel) => p.$eval(sel, (e) => e.getClientRects().length > 0);
  const ui = { assist: await shown('#assistLine'), hint: await shown('#hintBtn'), nudge: await shown('#nudgeBtn'), nudgeRow: await shown('#nudgeRow'), resign: await shown('#resignBtn'), lesson: await shown('#lessonBtn'), tutor: await shown('#tutor') };
  check('practice: no budget, hint, nudge or resign; Back to lesson and Think ahead shown', !ui.assist && !ui.hint && !ui.nudge && !ui.nudgeRow && !ui.resign && ui.lesson && ui.tutor, JSON.stringify(ui));
  check('practice: hint and nudge refuse', (await p.evaluate(() => window.__coach.hint())) === null && (await p.evaluate(() => window.__coach.sandbox('e2e4'))) === null);
  await p.waitForFunction(() => window.__coach.think && window.__coach.think.done, null, { timeout: 60000 }).catch(() => {});
  const bookOpt = await p.$$eval('#tutorOpts .opt.book', (e) => e.map((o) => o.innerText.replace(/\s+/g, ' ')));
  check('think ahead tags the book move', bookOpt.length === 1 && /^e4 /.test(bookOpt[0]) && /Book/.test(bookOpt[0]), bookOpt.join(' | '));
  await p.screenshot({ path: SHOTS + '/c16-practice.png' });
  await p.evaluate(() => window.__coach.move('e2e4'));
  await p.waitForFunction(() => window.__coach.game.moves.length >= 2 && window.__coach.state === 'playing', null, { timeout: 30000 });
  const pr1 = await p.evaluate(() => ({ sans: window.__coach.game.moves.map((m) => m.san).join(' '), jab: document.getElementById('rateJab').textContent, label: document.getElementById('rateLabel').textContent }));
  check('engine follows the book', pr1.sans === 'e4 e5' && /^Book move/.test(pr1.jab) && pr1.label === 'Book', JSON.stringify(pr1).slice(0, 160));
  const fen2 = await p.evaluate(() => window.__coach.game.chess.fen());
  await p.evaluate(() => { window.__coach.move('f2f4').catch(() => null); });
  const slip = await p.waitForFunction(() => window.__coach.practiceState().prompt === 'slip', null, { timeout: 30000 }).then(() => true).catch(() => false);
  const sl = await p.evaluate(() => ({ n: window.__coach.game.moves.length, jab: document.getElementById('rateJab').textContent, row: document.getElementById('slipRow').getClientRects().length > 0, st: window.__coach.practiceState() }));
  check('a move off the line stops before the engine replies', slip && sl.n === 3 && sl.row && /^Not the line\. The line goes Nf3: /.test(sl.jab) && sl.st.slips === 1, JSON.stringify(sl).slice(0, 220));
  await p.waitForTimeout(500); await p.screenshot({ path: SHOTS + '/c17-slip.png' });
  await p.click('#slipBack'); await p.waitForTimeout(300);
  const tb = await p.evaluate(() => ({ fen: window.__coach.game.chess.fen(), n: window.__coach.game.moves.length, st: window.__coach.state, tb: window.__coach.game.takebacks, used: window.__coach.game.used, ps: window.__coach.practiceState() }));
  check('take it back restores the position, free', tb.fen === fen2 && tb.n === 2 && tb.st === 'playing' && tb.tb === 0 && tb.used === 0 && tb.ps.onLine && tb.ps.slips === 1, JSON.stringify(tb).slice(0, 220));
  // play the rest of the line as the lesson has it
  const line = await p.evaluate(() => window.__coach.game.practice.line);
  let onBook = true;
  for (let i = 2; i < line.length; i += 2) {
    await p.evaluate((u) => { window.__coach.move(u).catch(() => null); }, line[i]);
    if (i + 1 >= line.length) break;
    const ok = await p.waitForFunction((n) => window.__coach.game.moves.length >= n && window.__coach.state === 'playing', i + 2, { timeout: 30000 }).then(() => true).catch(() => false);
    if (!ok) { onBook = false; break; }
  }
  const done = await p.waitForSelector('#lineDone.on', { timeout: 30000 }).then(() => true).catch(() => false);
  const ld = await p.evaluate(() => ({ title: document.getElementById('ldTitle').textContent, msg: document.getElementById('ldMsg').textContent, st: window.__coach.practiceState(), sans: window.__coach.game.moves.map((m) => m.san).join(' ') }));
  check('completing the line shows Line done', onBook && done && ld.title === 'Line done: the Italian Game' && /1 correction\./.test(ld.msg) && ld.st.done && ld.st.ply === line.length, JSON.stringify(ld).slice(0, 260));
  await p.screenshot({ path: SHOTS + '/c18-linedone.png' });
  await p.click('#ldOn');
  const po = await p.waitForFunction((n) => window.__coach.game.moves.length > n && window.__coach.state === 'playing', line.length, { timeout: 30000 }).then(() => true).catch(() => false);
  check('Play on continues against the engine', po && !(await p.$eval('#lineDone', (e) => e.classList.contains('on'))) && !(await shown('#hintBtn')) && (await shown('#lessonBtn')), await p.evaluate(() => window.__coach.game.moves.map((m) => m.san).slice(-3).join(' ')));
  await p.click('#lessonBtn'); await p.waitForTimeout(200);
  check('Back to lesson returns to the lesson', await p.$eval('#lesson', (e) => e.classList.contains('on')) && !(await p.$eval('#chess', (e) => e.classList.contains('on'))) && (await p.evaluate(() => window.__learn.lesson.id)) === 'italian');
  // again, and this time play on anyway
  await p.click('#lPractice');
  await p.waitForFunction(() => window.__coach.state === 'playing', null, { timeout: 30000 });
  await p.evaluate(() => window.__coach.move('e2e4'));
  await p.waitForFunction(() => window.__coach.game.moves.length >= 2 && window.__coach.state === 'playing', null, { timeout: 30000 });
  await p.evaluate(() => { window.__coach.move('f2f4').catch(() => null); });
  await p.waitForFunction(() => window.__coach.practiceState().prompt === 'slip', null, { timeout: 30000 }).catch(() => {});
  await p.click('#slipOn');
  const pa = await p.waitForFunction(() => window.__coach.game.moves.length >= 4 && window.__coach.state === 'playing', null, { timeout: 30000 }).then(() => true).catch(() => false);
  const pas = await p.evaluate(() => ({ st: window.__coach.practiceState(), jab: document.getElementById('rateJab').textContent, assist: document.getElementById('assistLine').getClientRects().length > 0 }));
  check('Play on anyway leaves the line and the engine answers', pa && pas.st.off && !pas.st.onLine && pas.st.slips === 1 && !pas.assist, JSON.stringify(pas).slice(0, 220));
  check('practice jabs are tutor-toned', !/respect|dignity|keep up|watching/.test(pas.jab), pas.jab.slice(0, 160));
  await p.click('#lessonBtn'); await p.waitForTimeout(200);
  const histAfter = await p.evaluate(() => ({ ids: window.__coach.history.map((g) => g.id).join(','), store: JSON.parse(localStorage.getItem('ghostlap-chess-v1')).players.jesse.games.length }));
  check('practice games are not in history', histAfter.ids === histBefore && histAfter.store === histBefore.split(',').filter(Boolean).length, JSON.stringify({ before: histBefore.split(',').length, after: histAfter.ids.split(',').length }));
  // drills: From memory (the strict practice without Think ahead, scored and stored under the learn key)
  const learnStore = () => p.evaluate(() => JSON.parse(localStorage.getItem('ghostlap-learn-v1') || '{}'));
  const mine = Math.ceil(line.length / 2), frN = await p.evaluate(() => Math.floor(window.LESSONS.find((l) => l.id === 'french').line.length / 2));
  const ds = await p.evaluate(() => ({ mem: document.getElementById('lMem').getClientRects().length > 0, cards: document.getElementById('lCards').getClientRects().length > 0, ms: document.getElementById('lMemStat').textContent, cs: document.getElementById('lCardsStat').textContent }));
  check('lesson offers both drills with a status line', ds.mem && ds.cards && ds.ms.length > 10 && ds.cs.startsWith(mine + ' cards, ' + mine + ' due'), JSON.stringify(ds));
  await p.click('#lMem');
  await p.waitForFunction(() => window.__coach.state === 'playing', null, { timeout: 30000 });
  await p.waitForTimeout(1500);
  const md = await p.evaluate(() => ({ tutor: document.getElementById('tutor').getClientRects().length > 0, opts: document.querySelectorAll('#tutorOpts .opt').length, think: window.__coach.think, st: window.__coach.practiceState(), jab: document.getElementById('rateJab').textContent }));
  check('memory drill hides Think ahead and shows no note before the move', !md.tutor && md.opts === 0 && !md.think && md.st.drill === 'memory' && /^From memory/.test(md.jab) && !/Centre pawn/.test(md.jab), JSON.stringify(md).slice(0, 220));
  await p.screenshot({ path: SHOTS + '/c19-memory.png' });
  let memOk = true;
  for (let i = 0; i < line.length; i += 2) {
    await p.evaluate((u) => { window.__coach.move(u).catch(() => null); }, line[i]);
    if (i + 1 >= line.length) break;
    const ok = await p.waitForFunction((n) => window.__coach.game.moves.length >= n && window.__coach.state === 'playing', i + 2, { timeout: 30000 }).then(() => true).catch(() => false);
    if (!ok) { memOk = false; break; }
    if (i === 0) check('memory drill confirms a book move with its note', /^Book move\. Centre pawn/.test(await p.$eval('#rateJab', (e) => e.textContent)), await p.$eval('#rateJab', (e) => e.textContent.slice(0, 80)));
  }
  const mdone = await p.waitForSelector('#lineDone.on', { timeout: 30000 }).then(() => true).catch(() => false);
  const mld = await p.evaluate(() => ({ h: document.querySelector('#lineDone h3').textContent, msg: document.getElementById('ldMsg').textContent, sc: window.__coach.practiceState().score }));
  const ls1 = await learnStore();
  check('memory drill scores a clean line', memOk && mdone && mld.h === 'FROM MEMORY' && mld.msg.startsWith(mine + '/' + mine + ' right first time. No slips.') && mld.sc.first === mine && mld.sc.of === mine, JSON.stringify(mld));
  check('memory score stored under the learn key', !!(ls1.italian && ls1.italian.mem && ls1.italian.mem.tries === 1 && ls1.italian.mem.best.first === mine && ls1.italian.mem.last.of === mine && ls1.italian.mem.date), JSON.stringify(ls1.italian));
  await p.screenshot({ path: SHOTS + '/c20-memory-done.png' });
  await p.click('#ldLesson'); await p.waitForTimeout(200);
  const ms1 = await p.$eval('#lMemStat', (e) => e.textContent);
  check('lesson shows the memory best', ms1.startsWith('Best ' + mine + '/' + mine + ' · 1 try'), ms1);
  check('memory drill is not in the chess history', (await p.evaluate(() => window.__coach.history.map((g) => g.id).join(','))) === histBefore);
  // drills: Position cards, as Black (flipped board), no engine
  await p.evaluate(() => window.__learn.show('french')); await p.waitForTimeout(150);
  await p.click('#lCards'); await p.waitForTimeout(200);
  const c0 = await p.evaluate(() => ({ on: document.getElementById('drill').classList.contains('on'), d: window.__learn.drill, q: document.getElementById('dQ').textContent, corner: document.querySelector('#dBoard .sq').dataset.sq }));
  check('position cards: first card asks for your move on a flipped board', c0.on && c0.d.phase === 'ask' && c0.d.seen === frN && c0.q === 'Your move?' && c0.corner === 'h1' && c0.d.card.san === 'e6', JSON.stringify(c0).slice(0, 220));
  await p.screenshot({ path: SHOTS + '/c21-cards.png' });
  const dtap = async (sq) => { await p.tap('#dBoard [data-sq="' + sq + '"]'); await p.waitForTimeout(120); };
  await dtap(c0.d.card.from); await dtap(c0.d.card.to);
  const c1 = await p.evaluate(() => ({ d: window.__learn.drill, q: document.getElementById('dQ').textContent, note: document.getElementById('dNote').textContent }));
  check('position cards: two taps, right answer shows the note', c1.d.phase === 'right' && c1.d.first === 1 && c1.d.card.box === 2 && c1.q === 'Right: e6' && /^The French/.test(c1.note), JSON.stringify(c1).slice(0, 220));
  await p.screenshot({ path: SHOTS + '/c22-cards-right.png' });
  await p.evaluate(() => window.__learn.next());
  const wr = await p.evaluate(() => { const d = window.__learn.drill, m = new Chess(d.card.fen).moves({ verbose: true }).find((x) => x.san !== d.card.san); return window.__learn.answer(m.from, m.to); });
  const c2 = await p.evaluate(() => ({ d: window.__learn.drill, arrows: document.querySelectorAll('#dBoard .arrow line').length, note: document.getElementById('dNote').textContent }));
  check('position cards: wrong answer shows the move with an arrow and repeats the card later', wr && wr.ok === false && c2.d.phase === 'wrong' && c2.arrows === 1 && /^You played .*The challenge/.test(c2.note) && c2.d.queue.includes(3) && c2.d.queue[0] !== 3 && c2.d.card.box === 1, JSON.stringify({ wr, c2 }).slice(0, 260));
  await p.screenshot({ path: SHOTS + '/c23-cards-wrong.png' });
  await p.reload(); await p.waitForTimeout(600);
  const rl = await p.evaluate(() => ({ box: JSON.parse(localStorage.getItem('ghostlap-learn-v1')).french.cards, due: window.__learn.due('french') }));
  check('position cards: boxes persist across reload', rl.box.box['1:e6'] === 2 && rl.box.box['3:d5'] === 1 && rl.box.sessions === 1 && rl.due.due === frN - 1, JSON.stringify(rl));
  await p.evaluate(() => { window.__learn.show('french'); window.__learn.cards(); }); await p.waitForTimeout(150);
  for (let n = 0; n < 60; n++) {
    const s = await p.evaluate(() => window.__learn.drill); if (!s || s.phase === 'done') break;
    if (s.phase === 'ask') await p.evaluate((c) => window.__learn.answer(c.from, c.to), s.card); else await p.evaluate(() => window.__learn.next());
  }
  const sum = await p.evaluate(() => ({ d: window.__learn.drill, on: document.getElementById('dSum').getClientRects().length > 0, seen: document.getElementById('dSeen').textContent, first: document.getElementById('dFirst').textContent, box: JSON.parse(localStorage.getItem('ghostlap-learn-v1')).french.cards.box }));
  check('position cards: session summary', sum.d.phase === 'done' && sum.on && sum.seen === String(frN - 1) && sum.first === '100%' && Object.values(sum.box).filter((b) => b === 2).length === frN, JSON.stringify(sum).slice(0, 260));
  await p.screenshot({ path: SHOTS + '/c24-cards-summary.png' });
  await p.click('#dDone'); await p.waitForTimeout(200);
  const cs1 = await p.evaluate(() => ({ on: document.getElementById('lesson').classList.contains('on'), drill: document.getElementById('drill').classList.contains('on'), st: document.getElementById('lCardsStat').textContent }));
  check('Done goes back to the lesson with the cards status', cs1.on && !cs1.drill && cs1.st.startsWith(frN + ' cards, ' + frN + ' due'), JSON.stringify(cs1));
  await p.click('#lessonBack'); await p.waitForTimeout(200);
  const glyph = await p.$$eval('#learnList .lcard', (e) => e.filter((c) => c.querySelector('.lprog')).map((c) => c.querySelector('.t').textContent));
  check('learn list marks drilled openings', glyph.length === 2 && glyph.some((t) => /Italian/.test(t)) && glyph.some((t) => /French/.test(t)), glyph.join(' | '));
  await p.screenshot({ path: SHOTS + '/c25-learn-progress.png' });
  await p.click('#learnBack'); await p.waitForTimeout(200);
  check('back returns to hub', await p.$eval('#hub', (e) => e.classList.contains('on')));
  check('no page errors', errs.length === 0, errs.join(' | ').slice(0, 300));
  await b.close(); srv.close();
  const fails = results.filter((r) => r[0] === 'FAIL').length;
  console.log('\n' + (results.length - fails) + '/' + results.length + ' passed');
  process.exit(fails ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });
