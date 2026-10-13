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
}).listen(+process.env.PORT || 8767);   // PORT=8770 node tools/chess-e2e.js if 8767 is taken
// a synthetic analysed game (White): 1. e4 e5 2. Nf3 Nc6 3. Nxe5?? Nxe5 4. d4 Nc6, the knight on e5 simply hung
const SYN = (id, daysAgo) => {
  const mk = (ply, uci, san, label, loss, x) => Object.assign({ ply, color: ply % 2 ? 'w' : 'b', uci, san, label, loss, cpBefore: 30, cpAfter: 30, mateBefore: null, mateAfter: null, best: uci, bestSan: san, reply: null, pv: [], pieces: 14, hung: null }, x || {});
  const moves = [mk(1, 'e2e4', 'e4', 'best', 0), mk(2, 'e7e5', 'e5', 'best', 0), mk(3, 'g1f3', 'Nf3', 'best', 0), mk(4, 'b8c6', 'Nc6', 'best', 0),
    mk(5, 'f3e5', 'Nxe5', 'blunder', 300, { best: 'f1c4', bestSan: 'Bc4', reply: 'c6e5', hung: 'n', cpAfter: -270 }), mk(6, 'c6e5', 'Nxe5', 'best', 0), mk(7, 'd2d4', 'd4', 'great', 10), mk(8, 'e5c6', 'Nc6', 'good', 30)];
  const cnt = (c) => ({ best: 0, great: 0, good: 0, inaccuracy: 0, mistake: 0, blunder: 0, forced: 0, ...c });
  return { id, date: new Date(Date.now() - daysAgo * 864e5).toISOString(), elo: 1200, you: 'w', result: 'loss', reason: 'resign', moves: moves.map((m) => m.uci), sans: moves.map((m) => m.san),
    hints: 0, nudges: 0, tutor: false, takebacks: 0, practice: null, assist: { used: 0, budget: 10 }, hinted: [],
    report: { accuracy: { w: 61, b: 97 }, counts: { w: cnt({ best: 2, great: 1, blunder: 1 }), b: cnt({ best: 3, good: 1 }) }, moves, evals: [30, 30, 30, 30, 30, -270, -270, -280, -260],
      worst: [moves[4]], summary: 'Accuracy 61%. 1 blunder, 0 mistakes, 0 inaccuracies.', lesson: 'Synthetic lesson.' } };
};
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
  // feedback cards above the review; tapping one moves the replay board there and opens αβ
  const rc = await p.$$eval('#rCards .rcard', (e) => e.map((d) => ({ cls: d.className, ref: d.querySelector('.kt small').textContent, text: d.innerText.replace(/\s+/g, ' ') })));
  check('feedback cards render after analysis', rc.length >= 2 && rc.length <= 3, rc.map((c) => c.text).join(' | ').slice(0, 300));
  await p.evaluate(() => document.getElementById('review').scrollTo(0, 0)); await p.waitForTimeout(100);
  await p.screenshot({ path: SHOTS + '/c7b-cards.png' });
  const tc = rc.find((c) => /k-one/.test(c.cls) && c.ref) || rc.find((c) => c.ref);
  await p.evaluate(() => { document.getElementById('rWhy').hidden = true; });
  await p.click('#rCards .rcard.' + tc.cls.split(' ').find((c) => /^k-/.test(c))); await p.waitForTimeout(400);
  const moved = await p.evaluate(() => ({ pos: document.getElementById('rPos').textContent, why: !document.getElementById('rWhy').hidden, last: document.querySelectorAll('#rBoard .sq.last').length }));
  check('tapping a card scrubs the replay board and opens αβ', moved.pos === tc.ref && moved.why && moved.last === 2, JSON.stringify({ moved, want: tc.ref }));
  await p.screenshot({ path: SHOTS + '/c7c-card-tapped.png' });
  // cards() is pure: a synthetic game where 3. Nxe5 hangs the knight
  const cs = await p.evaluate((e) => window.__coach.cards(e, []), SYN('syn0', 0));
  check('cards() on a synthetic entry: three cards, hanging pieces', cs.length === 3 && cs[0].kind === 'good' && cs[1].pattern === 'hung' && cs[1].ply === 5 && /knight/.test(cs[1].text)
    && /what of mine is undefended/.test(cs[2].text) && cs.every((c) => c.text.length > 10), JSON.stringify(cs.map((c) => [c.kind, c.head, c.text, c.ply])).slice(0, 400));
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
  // J's profile: kind coach by default, separate history; switched to quiet here to check the quiet voice
  await p.evaluate(() => window.__coach.setPlayer('j'));
  check('J starts with no games, on the Kind voice', (await p.$$eval('#chessHist button', (e) => e.length)) === 0 && (await p.$eval('#voiceBtn', (e) => e.textContent)) === 'Kind');
  await p.evaluate(() => window.__coach.setVoice('quiet'));
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
  await p.click('#lPractice');
  await p.waitForFunction(() => window.__coach.state === 'playing', null, { timeout: 30000 });
  check('practice starts a game', await p.$eval('#chess', (e) => e.classList.contains('on')) && (await p.evaluate(() => !!window.__coach.game.practice)));
  await p.evaluate(() => window.__coach.move('e2e4'));
  await p.waitForFunction(() => window.__coach.game.moves.length >= 2 && window.__coach.state === 'playing', null, { timeout: 30000 });
  const pr1 = await p.evaluate(() => ({ sans: window.__coach.game.moves.map((m) => m.san).join(' '), jab: document.getElementById('rateJab').textContent }));
  check('engine follows the book', pr1.sans === 'e4 e5' && /Book move/.test(pr1.jab), JSON.stringify(pr1).slice(0, 160));
  await p.evaluate(() => window.__coach.move('f2f4'));
  await p.waitForFunction(() => window.__coach.game.moves.length >= 4 && window.__coach.state === 'playing', null, { timeout: 30000 });
  const pr2 = await p.evaluate(() => ({ off: window.__coach.game.practice.off, jab: document.getElementById('rateJab').textContent }));
  check('leaving the line is called out', pr2.off === true && /Out of the Italian Game line/.test(pr2.jab), pr2.jab.slice(0, 160));
  await p.evaluate(() => window.__coach.resign()); await p.waitForTimeout(200); await p.click('#endHome'); await p.waitForTimeout(100);
  await p.click('#chessBack'); await p.waitForTimeout(200);
  check('back returns to hub', await p.$eval('#hub', (e) => e.classList.contains('on')));

  // escalation and level check, in a fresh phone: Jesse seeded with three analysed games that all hung a piece; J untouched
  const ctx2 = await b.newContext({ ...devices['iPhone 13'] });
  const q = await ctx2.newPage();
  q.on('pageerror', (e) => errs.push('pageerror(2): ' + e.message));
  q.on('console', (m) => { if (m.type() === 'error') errs.push('console(2): ' + m.text()); });
  await q.goto(base);
  await q.evaluate((games) => localStorage.setItem('ghostlap-chess-v1', JSON.stringify({ player: 'jesse', players: { jesse: { name: 'Jesse', elo: 1400, color: 'w', theme: 'night', mode: 'play', voice: 'kind', games } } })), [SYN('s1', 1), SYN('s2', 2), SYN('s3', 3)]);
  await q.reload(); await q.waitForTimeout(300);
  await q.click('#pickChess'); await q.waitForTimeout(300);
  const esc = await q.evaluate(() => ({ st: window.__coach.streaks().hung, line: window.__coach.focusLine(), box: document.getElementById('focusBox').hidden ? '' : document.getElementById('focusBox').innerText.replace(/\s+/g, ' '),
    calib: !document.getElementById('calibCard').hidden, cal: window.__coach.calib, one: window.__coach.cards(window.__coach.history[0]) }));
  check('streak counts three games running', esc.st === 3, JSON.stringify(esc.st));
  check('pre-game focus gets firmer after three games', /^Same thing three games running\. This game, before every move: what of mine is undefended\?$/.test(esc.line) && esc.box.includes(esc.line), esc.line + ' / ' + esc.box);
  check('the one thing says third game running', esc.one[1] && esc.one[1].head === 'Third game running: hanging pieces' && /^Next game, before every move/.test(esc.one[2].text), JSON.stringify(esc.one.map((c) => [c.head, c.text])).slice(0, 300));
  check('3+ analysed games count as calibrated', !esc.calib && esc.cal.calibrated && esc.cal.elo === 1400, JSON.stringify(esc.cal));
  await q.click('#chessHist .rv >> nth=0'); await q.waitForTimeout(400);
  const rcs = await q.$$eval('#rCards .rcard', (e) => e.map((d) => d.innerText.replace(/\s+/g, ' ')));
  check('review of an old entry shows the escalated cards', rcs.length === 3 && rcs.some((t) => /Third game running: hanging pieces/.test(t)), rcs.join(' | ').slice(0, 300));
  await q.screenshot({ path: SHOTS + '/c16-cards-escalated.png' });
  await q.click('#rCards .rcard.k-one .drill'); await q.waitForTimeout(150);
  const dr = await q.evaluate(() => ({ focus: window.__coach.focus, pos: document.getElementById('rPos').textContent, btn: document.querySelector('#rCards .rcard.k-one .drill').textContent }));
  check('Drill this sets the focus for three games (without moving the board)', dr.focus && dr.focus.key === 'hung' && dr.focus.left === 3 && dr.pos === 'Start' && /Drilling/.test(dr.btn), JSON.stringify(dr));
  await q.click('#reviewBack'); await q.waitForTimeout(200);
  const fb = await q.$eval('#focusBox', (e) => e.hidden ? '' : e.innerText.replace(/\s+/g, ' '));
  check('chosen focus shows on the chess home', /Your drill · 3 games left/i.test(fb), fb);
  await q.screenshot({ path: SHOTS + '/c17-focus-home.png' });
  // J: fresh profile, Kind voice, gets the level check
  await q.evaluate(() => window.__coach.setPlayer('j')); await q.waitForTimeout(150);
  const cc = await q.evaluate(() => ({ on: !document.getElementById('calibCard').hidden, head: document.getElementById('calibHead').textContent, voice: document.getElementById('voiceBtn').textContent }));
  check('fresh profile gets the Find your level card', cc.on && cc.head === 'Find your level: three quick games' && cc.voice === 'Kind', JSON.stringify(cc));
  await q.screenshot({ path: SHOTS + '/c18-calib-card.png' });
  const calibGame = async (n) => {
    const want = await q.evaluate(() => window.__coach.calib.next);
    await q.click('#calibGo');
    await q.waitForFunction(() => window.__coach.state === 'playing', null, { timeout: 30000 });
    const g = await q.evaluate(() => ({ elo: window.__coach.game.elo, calib: window.__coach.game.calib, tutor: window.__coach.game.tutor }));
    check('level check game ' + n + ' starts at ' + want, g.calib && !g.tutor && g.elo === want, JSON.stringify(g));
    await q.evaluate(() => window.__coach.move('e2e4'));
    await q.waitForFunction(() => window.__coach.game.moves.length >= 2 && window.__coach.state === 'playing', null, { timeout: 30000 });
    await q.evaluate(() => window.__coach.resign());
    await q.waitForSelector('#chessEnd.on', { timeout: 5000 }).catch(() => {});
    const msg = await q.$eval('#endMsg', (e) => e.textContent);
    check('end sheet notes the level check (' + n + ')', new RegExp(n < 3 ? 'Level check: game ' + n + ' of 3 done' : 'Level check done').test(msg), msg);
  };
  await calibGame(1);
  await q.waitForFunction(() => { const c = window.__coach.calib.progress; return c && c.games[0] && c.games[0].acc != null; }, null, { timeout: 120000 }).catch(() => {});
  const e1 = await q.evaluate(() => ({ btn: document.getElementById('endNew').textContent, msg: document.getElementById('endMsg').textContent, next: window.__coach.calib.next }));
  check('end sheet offers the next level-check game at the adjusted strength', e1.btn === 'Game 2 of 3' && e1.msg.endsWith('Next game at ' + e1.next + '.'), JSON.stringify(e1));
  await q.click('#endHome'); await q.waitForTimeout(200);
  const c2 = await q.evaluate(() => ({ head: document.getElementById('calibHead').textContent, cal: window.__coach.calib, hist: document.querySelector('#chessHist small').textContent }));
  check('card progresses to Game 2 of 3 (accuracy counted)', /Game 2 of 3/.test(c2.head) && c2.cal.progress.games.length === 1 && c2.cal.progress.games[0].acc != null, JSON.stringify(c2.cal.progress));
  check('history line tags the level check', /level check/.test(c2.hist), c2.hist);
  await q.screenshot({ path: SHOTS + '/c19-calib-progress.png' });
  // leaving mid-way survives a reload
  await q.reload(); await q.waitForTimeout(300); await q.click('#pickChess'); await q.waitForTimeout(200);
  check('level check progress survives a reload', /Game 2 of 3/.test(await q.$eval('#calibHead', (e) => e.textContent)));
  await calibGame(2);
  await q.waitForFunction(() => { const c = window.__coach.calib.progress; return c && c.games[1] && c.games[1].acc != null; }, null, { timeout: 120000 }).catch(() => {});
  await q.click('#endHome'); await q.waitForTimeout(200);
  await calibGame(3);
  const done = await q.waitForSelector('#calibDone.on', { timeout: 120000 }).then(() => true).catch(() => false);
  const fin = await q.evaluate(() => ({ title: document.getElementById('calibTitle').textContent, msg: document.getElementById('calibMsg').textContent, cal: window.__coach.calib, hist: window.__coach.history.filter((g) => g.calib).length }));
  check('after game 3 the level is set', done && fin.cal.calibrated && !fin.cal.progress && fin.title === 'Your level: ~' + fin.cal.elo && fin.cal.elo % 50 === 0 && fin.cal.elo >= 800 && fin.cal.elo <= 2850
    && /will play at that strength/.test(fin.msg) && fin.hist === 3, JSON.stringify(fin));
  await q.screenshot({ path: SHOTS + '/c20-calib-done.png' });
  await q.click('#calibOk'); await q.waitForTimeout(150);
  check('level card gone once calibrated', await q.$eval('#calibCard', (e) => e.hidden) && (await q.$eval('#eloV', (e) => e.textContent)) === String(fin.cal.elo) && !(await q.$eval('#chessHome', (e) => e.hidden)));
  await ctx2.close();

  check('no page errors', errs.length === 0, errs.join(' | ').slice(0, 300));
  await b.close(); srv.close();
  const fails = results.filter((r) => r[0] === 'FAIL').length;
  console.log('\n' + (results.length - fails) + '/' + results.length + ' passed');
  process.exit(fails ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });
