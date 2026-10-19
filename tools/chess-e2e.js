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
}).listen(+process.env.PORT || 8767);   // PORT=8770 node tools/chess-e2e.js if 8767 is taken
// a synthetic analysed game (White): 1. e4 e5 2. Nf3 Nc6 3. Nxe5?? Nxe5 4. d4 Nc6, the knight on e5 simply hung
const SYN = (id, daysAgo, times) => {   // times: optional ms per ply (a seeded long think)
  const mk = (ply, uci, san, label, loss, x) => Object.assign({ ply, color: ply % 2 ? 'w' : 'b', uci, san, label, loss, cpBefore: 30, cpAfter: 30, mateBefore: null, mateAfter: null, best: uci, bestSan: san, reply: null, pv: [], pieces: 14, hung: null }, x || {});
  const moves = [mk(1, 'e2e4', 'e4', 'best', 0), mk(2, 'e7e5', 'e5', 'best', 0), mk(3, 'g1f3', 'Nf3', 'best', 0), mk(4, 'b8c6', 'Nc6', 'best', 0),
    mk(5, 'f3e5', 'Nxe5', 'blunder', 300, { best: 'f1c4', bestSan: 'Bc4', reply: 'c6e5', hung: 'n', cpAfter: -270 }), mk(6, 'c6e5', 'Nxe5', 'best', 0), mk(7, 'd2d4', 'd4', 'great', 10), mk(8, 'e5c6', 'Nc6', 'good', 30)];
  const cnt = (c) => ({ best: 0, great: 0, good: 0, inaccuracy: 0, mistake: 0, blunder: 0, forced: 0, ...c });
  return { id, date: new Date(Date.now() - daysAgo * 864e5).toISOString(), elo: 1200, you: 'w', result: 'loss', reason: 'resign', moves: moves.map((m) => m.uci), sans: moves.map((m) => m.san),
    hints: 0, nudges: 0, tutor: false, takebacks: 0, practice: null, assist: { used: 0, budget: 10 }, hinted: [], times: times || null,
    report: { accuracy: { w: 61, b: 97 }, counts: { w: cnt({ best: 2, great: 1, blunder: 1 }), b: cnt({ best: 3, good: 1 }) }, moves, evals: [30, 30, 30, 30, 30, -270, -270, -280, -260],
      worst: [moves[4]], summary: 'Accuracy 61%. 1 blunder, 0 mistakes, 0 inaccuracies.', lesson: 'Synthetic lesson.' } };
};
const results = [];
// the post-mortem sheet, by taps: your move (ply, 0 = Nowhere), the threat, did you check, the tag, an optional note; Save
const doPm = async (pg, ply, threat, checked, tag, note) => {
  await pg.waitForSelector('#pmSheet.on', { timeout: 5000 });
  await pg.click('#pmMoves [data-ply="' + ply + '"]'); await pg.waitForTimeout(60); await pg.click('#pmNext');
  await pg.click('#pmThreat [data-v="' + threat + '"]'); await pg.click('#pmNext');
  await pg.click('#pmChecked [data-v="' + checked + '"]'); await pg.click('#pmNext');
  await pg.click('#pmTags [data-v="' + tag + '"]'); if (note) await pg.fill('#pmNote', note);
  await pg.click('#pmNext'); await pg.waitForTimeout(100);
};
const check = (name, ok, extra) => { results.push([ok ? 'PASS' : 'FAIL', name, extra || '']); console.log((ok ? 'PASS ' : 'FAIL ') + name + (extra ? '  ' + extra : '')); };

(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ ...devices['iPhone 13'] });
  const p = await ctx.newPage();
  const errs = [];
  p.on('pageerror', (e) => errs.push('pageerror: ' + e.message));
  p.on('console', (m) => { if (m.type() === 'error') errs.push('console: ' + m.text()); });
  const stoneRes = {}; p.on('response', (r) => { const m = /pieces-stone\/(\w+\.svg)/.exec(r.url()); if (m) stoneRes[m[1]] = r.status(); });
  const base = 'http://localhost:' + (+process.env.PORT || 8767) + '/';
  await p.goto(base);
  await p.waitForTimeout(500);
  await p.screenshot({ path: SHOTS + '/c0-hub.png' });
  check('launcher tagline: Two struck out, Four ways, and the aside', await p.evaluate(() => { const t = document.querySelector('#hub .tagline'), a = document.querySelector('#hub .aside');
    return !!t && t.querySelector('s').textContent === 'Two' && t.textContent === 'Two Four ways to lose an evening.' && !!a && a.textContent === 'You are probably here because something else needs doing.'; }));
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
  // record the coach's events (re-hooked after every reload)
  const hook = (pg) => pg.evaluate(() => { window.__ev = []; for (const k of ['game', 'analysed', 'pm', 'mode', 'player']) window.__coach.on(k, (d) => window.__ev.push(k + ':' + (d && d.id ? d.id : d))); });
  await hook(p);
  const ctxAsked = await p.evaluate(() => window.__coach.newGame({ color: 'w', elo: 1200 }) === null && document.getElementById('ctxSheet').classList.contains('on') && window.__coach.ctxToday() === undefined && window.__coach.state === 'home');
  check('the first game of the day asks what kind of day it is', ctxAsked, await p.$eval('#ctxSheet', (e) => e.innerText.replace(/\s+/g, ' ').slice(0, 160)));
  await p.screenshot({ path: SHOTS + '/c1b-context.png' });
  await p.click('#ctxSkip'); await p.waitForTimeout(100);
  check('Skip proceeds and is remembered for the day', !(await p.$eval('#ctxSheet', (e) => e.classList.contains('on'))) && (await p.evaluate(() => window.__coach.ctxToday() === null && !!window.__coach.game && window.__coach.game.ctx === null)));
  await p.waitForFunction(() => window.__coach.state === 'playing', null, { timeout: 30000 }).then(() => check('game starts (engine ready)', true)).catch(() => check('game starts (engine ready)', false));
  await p.waitForTimeout(300);
  await p.screenshot({ path: SHOTS + '/c2-game.png' });
  // the long-think line is Train's only: three minutes into a move in a Play game the strip stays as it was
  const strip0 = await p.$eval('#rateJab', (e) => e.textContent);
  await p.evaluate(() => { window.__coach.game.t0 -= 181000; }); await p.waitForTimeout(1300);
  check('no long-think line in a Play game', (await p.$eval('#rateJab', (e) => e.textContent)) === strip0 && !/Three minutes/.test(strip0), strip0);
  await p.evaluate(() => { window.__coach.game.t0 += 181000; });
  // tap e2 then e4 on the real board
  const tap = async (sq) => { const el = await p.$('#board [data-sq="' + sq + '"]'); check('square ' + sq + ' exists', !!el); if (el) await el.tap(); await p.waitForTimeout(150); };
  await tap('e2'); await p.screenshot({ path: SHOTS + '/c3-selected.png' }); await tap('e4');
  const rated = await p.waitForFunction(() => (document.getElementById('rateLabel').textContent || '').trim().length > 0, null, { timeout: 30000 }).then(() => true).catch(() => false);
  if (rated) {
    await p.click('#whyBtn'); await p.waitForTimeout(100); const whyN = await p.$$eval('#why div', (e) => e.map((d) => d.textContent)); await p.click('#whyBtn');
    check('αβ at the narrow level explains the move without the engine line', whyN.length >= 2 && whyN.some((t) => /^You played/.test(t)) && !whyN.some((t) => /^Engine line/.test(t)) && (await p.evaluate(() => window.__coach.reviewLevel)) === 'narrow', whyN.join(' | ').slice(0, 200));
    await p.evaluate(() => window.__coach.setReviewLevel('full')); await p.click('#whyBtn'); await p.waitForTimeout(100); const why = await p.$$eval('#why div', (e) => e.map((d) => d.textContent)); await p.click('#whyBtn'); await p.evaluate(() => window.__coach.setReviewLevel('narrow'));
    check('αβ explains the move', why.length >= 3 && why.some((t) => /^You played/.test(t)) && why.some((t) => /^Engine line/.test(t)), why.join(' | ').slice(0, 200));
  }
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
  await p.click('#endAnalyze'); await p.waitForTimeout(150);
  const gated = await p.evaluate(() => ({ pm: document.getElementById('pmSheet').classList.contains('on'), end: document.getElementById('chessEnd').classList.contains('on'), review: document.getElementById('review').classList.contains('on'), q: document.getElementById('pmQ').textContent, moves: [...document.querySelectorAll('#pmMoves .pill')].map((b) => b.textContent), next: document.getElementById('pmNext').disabled, st: window.__coach.pm }));
  check('Analyze opens the post-mortem before any engine', gated.pm && !gated.end && !gated.review && /first lose material/.test(gated.q) && gated.moves[0] === 'Nowhere' && gated.moves.length >= 3 && gated.next && gated.st && gated.st.step === 0, JSON.stringify(gated).slice(0, 240));
  await p.screenshot({ path: SHOTS + '/c6b-postmortem.png' });
  await p.click('#pmLater'); await p.waitForTimeout(100);
  check('Later dismisses it, no review, the end sheet comes back', !(await p.$eval('#pmSheet', (e) => e.classList.contains('on'))) && (await p.$eval('#chessEnd', (e) => e.classList.contains('on'))) && (await p.evaluate(() => window.__coach.pmDebt() === 1 && window.__coach.state === 'over' && !window.__coach.pm)));
  await p.click('#endAnalyze'); await p.waitForSelector('#pmSheet.on', { timeout: 5000 });
  await p.click('#pmMoves [data-ply="3"]'); await p.waitForTimeout(100);
  const pb = await p.evaluate(() => ({ on: [...document.querySelectorAll('#pmMoves .pill.on')].map((b) => b.textContent), last: document.querySelectorAll('#pmBoard .sq.last').length, q: !!document.querySelector('#pmBoard [data-sq="h5"] .pc.svg.cw.tq'), next: document.getElementById('pmNext').disabled, step: window.__coach.pm.step, ply: window.__coach.pm.ply }));
  check('post-mortem: tapping a move shows that position on the small board', pb.on.length === 1 && /^2\. Qh5/.test(pb.on[0]) && pb.last === 2 && pb.q && !pb.next && pb.step === 0 && pb.ply === 3, JSON.stringify(pb));
  await p.click('#pmNext'); await p.waitForTimeout(60);
  check('step 2 asks about the threat', /threatened the move before/.test(await p.$eval('#pmQ', (e) => e.textContent)) && (await p.$$eval('#pmThreat .pill', (e) => e.length)) === 6 && (await p.$eval('#pmNext', (e) => e.disabled)) && (await p.$eval('#pmStep1', (e) => e.getClientRects().length === 0)));
  await p.click('#pmThreat [data-v="none"]'); await p.click('#pmNext'); await p.waitForTimeout(60);
  await p.click('#pmBack'); await p.waitForTimeout(60);
  check('Back returns a step with the choice kept', (await p.evaluate(() => window.__coach.pm.step === 1 && window.__coach.pm.threat === 'none')) && (await p.$$eval('#pmThreat .pill.on', (e) => e.length)) === 1);
  await p.click('#pmNext'); await p.click('#pmChecked [data-v="unsure"]'); await p.click('#pmNext'); await p.waitForTimeout(60);
  check('step 4 tags it, with an optional note, and Save', /^Tag it/.test(await p.$eval('#pmQ', (e) => e.textContent)) && (await p.$$eval('#pmTags .pill', (e) => e.length)) === 7 && (await p.$eval('#pmNext', (e) => e.textContent)) === 'Save' && (await p.$eval('#pmNote', (e) => e.getClientRects().length > 0)));
  await p.click('#pmTags [data-v="hung_piece"]'); await p.fill('#pmNote', 'Queen out too early.');
  await p.screenshot({ path: SHOTS + '/c6c-postmortem-tag.png' });
  await p.click('#pmNext');
  const reviewed = await p.waitForFunction(() => window.__coach.state === 'review' && document.getElementById('review').classList.contains('on') && !/analys/i.test(document.getElementById('review').innerText.slice(0, 200)) , null, { timeout: 120000 }).then(() => true).catch(() => false);
  await p.waitForTimeout(400);
  check('analysis completes', reviewed);
  await p.screenshot({ path: SHOTS + '/c7-review.png', fullPage: false });
  // share: the Share pill in the review header builds the PGN; no share sheet in headless Chromium, so the clipboard or the textarea sheet
  check('Share pill in the review header', await p.$eval('#rShare', (e) => e.getClientRects().length > 0 && e.textContent === 'Share' && e.closest('.cbar') !== null));
  const sh = await p.evaluate(async () => { const r = await window.__coach.share(); return { r, pill: document.getElementById('rShare').textContent, sheet: document.getElementById('pgnSheet').classList.contains('on'), text: document.getElementById('pgnText').value.slice(0, 60), pgn: window.__coach.pgnOf(window.__coach.history[0]) }; });
  check('Share copies the PGN or shows it in a sheet to copy; the PGN carries the post-mortem', ((sh.r === 'copied' && sh.pill === 'Copied') || (sh.r === 'sheet' && sh.sheet && /^\[Event "Ghostlap game"\]/.test(sh.text))) && /\[Event "Ghostlap game"\]/.test(sh.pgn) && /2\. Qh5 \{ Post-mortem: first material loss here\. Threat: nothing I saw\. Ran the check: not sure\. Tag: hung piece\. Queen out too early\. \}/.test(sh.pgn) && /\{ Engine: accuracy [\d.]+% \(engine [\d.]+%\)\. \d+ blunders?, \d+ mistakes?, \d+ inaccurac(y|ies)\. (First two-pawn swing: \d+\.(\.\.)? \S+( \(best \S+\))?|No two-pawn swing)\. \} 0-1\n$/.test(sh.pgn), JSON.stringify(sh).slice(0, 500));
  if (sh.sheet) { await p.click('#pgnClose'); await p.waitForTimeout(80); }
  if (sh.r === 'copied') { await p.waitForTimeout(2100); check('Copied reverts to Share after two seconds', (await p.$eval('#rShare', (e) => e.textContent)) === 'Share'); }
  await p.click('#rNext'); await p.click('#rNext'); await p.waitForTimeout(200);
  await p.click('#rWhyBtn'); await p.waitForTimeout(100);
  check('αβ in the review', (await p.$$eval('#rWhy div', (e) => e.length)) >= 2, await p.$eval('#rWhy', (e) => e.innerText.slice(0, 160)));
  // feedback cards above the review; tapping one moves the replay board there and opens αβ
  const rc = await p.$$eval('#rCards .rcard:not(.k-call)', (e) => e.map((d) => ({ cls: d.className, ref: d.querySelector('.kt small').textContent, text: d.innerText.replace(/\s+/g, ' ') })));   // the call card sits above the three feedback cards
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
  // pgnOf() is pure: the synthetic training game with a post-mortem on 3. Nxe5 (ply 5)
  const pg = await p.evaluate((e) => window.__coach.pgnOf(e), Object.assign(SYN('syn0', 0), { mode: 'train', pm: { ply: 5, threat: 'undefended', checked: 'no', tag: 'hung_piece', note: 'Saw it too late.', at: new Date().toISOString() } }));
  const pgHead = pg.split('\n\n')[0].split('\n');
  check('pgnOf: the seven-tag roster plus Site, Ghostlap names, the player by colour, the result', pgHead[0] === '[Event "Ghostlap training game"]' && pgHead[1] === '[Site "Ghostlap Roma"]' && /^\[Date "\d{4}\.\d\d\.\d\d"\]$/.test(pgHead[2]) && pgHead[3] === '[Round "-"]' && pgHead[4] === '[White "Jesse"]' && pgHead[5] === '[Black "Engine 1200"]' && pgHead[6] === '[Result "0-1"]' && pgHead.length === 7, pgHead.join(' '));
  check('pgnOf: 3. Nxe5 carries the post-mortem comment, the final comment has the engine\'s verdict and first two-pawn swing', /1\. e4 e5 2\. Nf3 Nc6\n3\. Nxe5 \{ Post-mortem: first material loss here\. Threat: undefended piece\. Ran the check: no\. Tag: hung piece\. Saw it too late\. \}\nNxe5 4\. d4 Nc6\n\{ Engine: accuracy 61% \(engine 97%\)\. 1 blunder, 0 mistakes, 0 inaccuracies\. First two-pawn swing: 3\. Nxe5 \(best Bc4\)\. \} 0-1\n$/.test(pg) && pg.split('\n').every((l) => l.length <= 80 || /\{/.test(l)), JSON.stringify(pg.split('\n\n')[1]).slice(0, 400));
  const pgN = await p.evaluate((e) => window.__coach.pgnOf(e), Object.assign(SYN('syn0', 0), { you: 'b', result: 'win', report: null, pm: { ply: 0, threat: 'none', checked: 'yes', tag: 'none', note: '' } }));
  check('pgnOf: "nowhere" and no report, Black wins', /\[White "Engine 1200"\]\n\[Black "Jesse"\]\n\[Result "0-1"\]/.test(pgN) && /\{ Post-mortem: no material loss named\. Not analysed yet\. \} 0-1\n$/.test(pgN), pgN.slice(-120));
  await p.screenshot({ path: SHOTS + '/c8-review-step.png' });
  const h = await p.evaluate(() => JSON.parse(localStorage.getItem('ghostlap-chess-v1')).players.jesse);
  check('hint counted in history', !!(h && h.games[0] && h.games[0].hints === 1), h && h.games[0] && 'hints=' + h.games[0].hints);
  check('history saved with report', !!(h && h.games && h.games.length === 1 && h.games[0].report && h.games[0].report.moves.length >= 4),
    h && h.games && h.games[0] && h.games[0].report ? 'accuracy ' + JSON.stringify(h.games[0].report.accuracy) : JSON.stringify(h).slice(0, 100));
  const g1 = h.games[0];
  check('post-mortem saved on the entry', g1.pm && g1.pm.ply === 3 && g1.pm.threat === 'none' && g1.pm.checked === 'unsure' && g1.pm.tag === 'hung_piece' && g1.pm.note === 'Queen out too early.' && /T/.test(g1.pm.at), JSON.stringify(g1.pm));
  check('entry carries mode, ctx, times and clean', g1.mode === 'play' && g1.ctx === null && Array.isArray(g1.times) && g1.times.length === g1.moves.length && typeof g1.times[0] === 'number' && g1.times[1] === null && g1.clean === false, JSON.stringify({ mode: g1.mode, ctx: g1.ctx, times: g1.times, clean: g1.clean }).slice(0, 200));
  const tl = await p.evaluate(() => { const e = window.__coach.history[0], L = window.__coach.ledger, r = L[0]; return { row: r, n: L.length, ev: window.__ev.filter((x) => x.endsWith(':' + e.id)), id: e.id, debt: window.__coach.pmDebt(),
    call: (document.querySelector('#rCards .rcard.k-call') || { querySelector: () => ({ textContent: '' }) }).querySelector('p').textContent, cards: document.querySelectorAll('#rCards .rcard').length, worst: document.querySelectorAll('#rWorst button').length, narrowNote: document.getElementById('rNarrow').getClientRects().length > 0 }; });
  check('ledger row appended on analysis, with the game / pm / analysed events', tl.row && tl.row.id === tl.id && tl.n === 1 && tl.row.mode === 'play' && tl.row.clean === false && tl.row.ctx === null && typeof tl.row.acc === 'number' && typeof tl.row.meanMs === 'number' && tl.row.longestMs >= tl.row.meanMs && tl.row.pm && tl.row.pm.ply === 3 && typeof tl.row.pm.hit === 'boolean' && tl.row.tags && 'hung' in tl.row.tags && tl.row.myMoves >= 2 && tl.ev.includes('game:' + tl.id) && tl.ev.includes('pm:' + tl.id) && tl.ev.includes('analysed:' + tl.id) && tl.debt === 0, JSON.stringify({ row: tl.row, ev: tl.ev }).slice(0, 400));
  check('narrow review: the call card first, one worst moment, the note', /^You said move 2 \(Qh5\)\. The engine/.test(tl.call) && tl.worst <= 1 && tl.narrowNote && tl.cards >= 3 && tl.cards <= 4, tl.call.slice(0, 200));
  check('narrow review hides the engine line in αβ', !(await p.$$eval('#rWhy div', (e) => e.map((d) => d.textContent))).some((t) => /^Engine line/.test(t)));
  await p.click('#reviewBack'); await p.waitForTimeout(200);
  check('patterns card reads the analysed game', /analysed game/.test(await p.$eval('#patterns', (e) => e.innerText)), await p.$eval('#patterns', (e) => e.innerText.replace(/\s+/g, ' ').slice(0, 120)));
  check('history list shows the game', (await p.$$eval('#chessHist button', (e) => e.length)) >= 1);
  await p.screenshot({ path: SHOTS + '/c9-home-history.png' });
  await p.click('#themeRow button[data-theme="classic"]'); await p.waitForTimeout(100);
  check('theme persists', (await p.evaluate(() => document.documentElement.dataset.theme + '/' + JSON.parse(localStorage.getItem('ghostlap-chess-v1')).players.jesse.theme)) === 'classic/classic');
  await p.evaluate(() => window.__coach.newGame({ color: 'w', elo: 1600 })); await p.waitForFunction(() => window.__coach.state === 'playing', null, { timeout: 30000 });
  await p.waitForTimeout(300); await p.screenshot({ path: SHOTS + '/c9b-classic.png' });
  check('classic squares', (await p.$eval('#board .sq.d', (e) => getComputedStyle(e).backgroundColor)) === 'rgb(181, 136, 99)', await p.$eval('#board .sq.d', (e) => getComputedStyle(e).backgroundColor));
  // Stone: own piece folder, all twelve load, the piece is named on pick-up, persists across reload, per player
  await p.evaluate(() => document.querySelector('#themeRow button[data-theme="stone"]').click()); await p.waitForTimeout(600);
  const srcs = await p.$$eval('#board .pc.svg', (e) => [...new Set(e.map((x) => getComputedStyle(x).backgroundImage.replace(/^.*\/vendor\//, '').replace(/"?\)$/, '')))].sort());
  check('stone switches pieces to vendor/pieces-stone', srcs.length === 12 && srcs.every((u) => /^pieces-stone\/[wb][KQRBNP]\.svg$/.test(u)), srcs.join(' '));
  check('all twelve stone pieces load', Object.keys(stoneRes).length === 12 && Object.values(stoneRes).every((v) => v === 200), JSON.stringify(stoneRes));
  check('stone squares', (await p.$eval('#board .sq.d', (e) => getComputedStyle(e).backgroundColor)) === 'rgb(205, 200, 191)', await p.$eval('#board .sq.d', (e) => getComputedStyle(e).backgroundColor));
  await tap('g1');
  check('stone names the picked-up piece', (await p.$eval('#youName', (e) => e.parentNode.dataset.pc)) === 'Knight' && (await p.$$eval('#board .sq.tgt', (e) => e.length)) === 2);
  await p.screenshot({ path: SHOTS + '/c9c-stone.png' });
  await p.waitForTimeout(1400); check('piece name fades', (await p.$eval('#youName', (e) => e.parentNode.dataset.pc)) === undefined);
  await tap('g1');
  await p.reload(); await p.waitForTimeout(500); await p.click('#pickChess'); await p.waitForTimeout(300); await hook(p);
  check('stone persists across reload', (await p.evaluate(() => document.documentElement.dataset.theme + '/' + window.__coach.theme)) === 'stone/stone');
  await p.evaluate(() => window.__coach.setPlayer('j'));
  check('stone is the default theme', (await p.evaluate(() => window.__coach.theme)) === 'stone');
  await p.evaluate(() => document.querySelector('#themeRow button[data-theme="dark"]').click()); await p.waitForTimeout(300);
  const jt = await p.evaluate(() => document.documentElement.dataset.theme + '/' + window.__coach.theme);
  await p.evaluate(() => window.__coach.setPlayer('jesse'));
  check('theme is per player', jt === 'dark/dark' && (await p.evaluate(() => document.documentElement.dataset.theme)) === 'stone', jt);
  // J's profile: kind coach by default, separate history; switched to quiet here to check the quiet voice
  await p.evaluate(() => window.__coach.setPlayer('j'));
  check('J starts with no games, on the Kind voice', (await p.$$eval('#chessHist button', (e) => e.length)) === 0 && (await p.$eval('#voiceBtn', (e) => e.textContent)) === 'Kind');
  await p.evaluate(() => window.__coach.setVoice('quiet'));
  await p.evaluate(() => window.__coach.newGame({ color: 'w', elo: 1200 }));
  check('the day is asked per player: J gets his own sheet', await p.$eval('#ctxSheet', (e) => e.classList.contains('on')));
  await p.click('#ctxShift');
  await p.waitForFunction(() => window.__coach.state === 'playing', null, { timeout: 30000 });
  check('Shift day lands on the game', (await p.evaluate(() => window.__coach.game.ctx + '/' + window.__coach.ctxToday())) === 'shift/shift');
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
  check('the day context is stored on the entry and in the save', jh.store.players.j.games[0].ctx === 'shift' && jh.store.players.j.day && jh.store.players.j.day.ctx === 'shift' && jh.store.players.jesse.day.ctx === null, JSON.stringify(jh.store.players.j.day));
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
  // Train mode: the third mode on the button. Nothing from the engine on screen, no help, rated silently, clean, then the gate and a ledger row
  await p.click('#modeBtn'); await p.click('#modeBtn');   // Play -> Tutor -> Train
  check('mode cycles Play -> Tutor -> Train', (await p.$eval('#modeBtn', (e) => e.textContent)) === 'Train' && (await p.evaluate(() => window.__coach.mode === 'train' && window.__ev.includes('mode:train') && /^Train:/.test(document.getElementById('modeHint').textContent))));
  await p.evaluate(() => window.__coach.newGame({ color: 'w', elo: 1200 }));
  await p.waitForFunction(() => window.__coach.state === 'playing', null, { timeout: 30000 });
  const t0 = await p.evaluate(() => ({ asked: document.getElementById('ctxSheet').classList.contains('on'), mode: window.__coach.game.mode, train: window.__coach.game.train, strip: document.getElementById('rateJab').textContent, ecol: document.querySelector('#chessGame .ecol').getClientRects().length > 0, hint: document.getElementById('hintBtn').getClientRects().length > 0, nudge: document.getElementById('nudgeBtn').getClientRects().length > 0, resign: document.getElementById('resignBtn').getClientRects().length > 0, assist: document.getElementById('assistLine').getClientRects().length > 0, tutor: document.getElementById('tutor').getClientRects().length > 0, opp: document.getElementById('oppName').textContent }));
  check('Train game: no eval bar, hint, nudge, budget or Think ahead; Resign stays; the engine at the saved strength', !t0.asked && t0.mode === 'train' && t0.train && !t0.ecol && !t0.hint && !t0.nudge && t0.resign && !t0.assist && !t0.tutor && /^Training game\. No engine during play\. Afterwards: your post-mortem first, then the review\./.test(t0.strip) && t0.opp === 'Engine · 1200', JSON.stringify(t0).slice(0, 300));
  // the live long-think line: three minutes into the move, once, then the hint comes back with the next move
  await p.evaluate(() => { window.__coach.game.t0 -= 181000; }); await p.waitForTimeout(1300);
  const nudge = await p.evaluate(() => ({ strip: document.getElementById('rateJab').textContent, said: window.__coach.game.longSaid, shown: document.getElementById('rate').getClientRects().length > 0 }));
  check('Train: three minutes on a move puts the long-think line on the strip', nudge.strip === 'Three minutes on this move. A long think means you do not recognise the position: take the safest move you can see and bank the clock.' && nudge.said && nudge.shown, nudge.strip);
  await p.evaluate(() => { window.__coach.game.t0 += 181000; });
  await p.evaluate(() => window.__coach.move('e2e4'));
  await p.waitForFunction(() => window.__coach.game.moves.length >= 2 && window.__coach.state === 'playing', null, { timeout: 30000 });
  const t1 = await p.evaluate(() => ({ strip: document.getElementById('rateJab').textContent, why: document.getElementById('whyBtn').getClientRects().length > 0, labelled: document.querySelectorAll('#moveList .m[class*="l-"]').length, plain: document.querySelectorAll('#moveList .m').length, rated: !!(window.__coach.lastRating && window.__coach.lastRating.label), bar: document.querySelector('#evalBar b').style.height, ms: window.__coach.game.moves[0].ms, ems: window.__coach.game.moves[1].ms }));
  check('Train rates silently: strip back to the hint after the long-think line, plain move list, no αβ, eval bar untouched, think time kept', /^Training game/.test(t1.strip) && t1.labelled === 0 && t1.plain === 2 && t1.rated && !t1.why && /^50(\.0)?%$/.test(t1.bar) && typeof t1.ms === 'number' && t1.ms >= 0 && t1.ems === undefined, JSON.stringify(t1).slice(0, 240));
  check('Train refuses hint, nudge and read', await p.evaluate(async () => [await window.__coach.hint(), await window.__coach.sandbox('d2d4'), await window.__coach.readBoard()].every((x) => x === null)));
  await p.screenshot({ path: SHOTS + '/c11b-train.png' });
  for (const m of ['d1h5', 'h5f7']) { const ok = await p.evaluate((u) => window.__coach.move(u), m); if (!ok) break; await p.waitForFunction(() => window.__coach.state !== 'thinking', null, { timeout: 30000 }).catch(() => {}); await p.waitForTimeout(100); }
  await p.evaluate(() => window.__coach.resign()); await p.waitForSelector('#chessEnd.on', { timeout: 5000 });
  const te = await p.evaluate(() => { const e = window.__coach.history[0]; return { mode: e.mode, clean: e.clean, ctx: e.ctx, pm: e.pm, n: e.moves.length, times: e.times, h3: document.querySelector('#chessEnd h3').textContent }; });
  check('Train entry: mode train, clean, pm owed, times aligned with the moves', te.mode === 'train' && te.clean === true && te.ctx === null && te.pm === null && Array.isArray(te.times) && te.times.length === te.n && typeof te.times[0] === 'number' && te.times[1] === null && te.h3 === 'GAME OVER', JSON.stringify(te).slice(0, 240));
  await p.click('#endAnalyze'); await doPm(p, 0, 'none', 'yes', 'none');
  const trev = await p.waitForFunction(() => window.__coach.state === 'review' && document.getElementById('review').classList.contains('on') && !document.getElementById('rBody').hidden, null, { timeout: 120000 }).then(() => true).catch(() => false);
  await p.waitForTimeout(300);
  const tl2 = await p.evaluate(() => { const e = window.__coach.history[0], L = window.__coach.ledger; return { pm: e.pm, row: L[0], n: L.length, debt: window.__coach.pmDebt(), call: (document.querySelector('#rCards .rcard.k-call') || { querySelector: () => ({ textContent: '' }) }).querySelector('p').textContent, sum: document.getElementById('rSummary').textContent }; });
  check('"Nowhere" saves with ply 0 and the training game is analysed', trev && tl2.pm && tl2.pm.ply === 0 && tl2.pm.tag === 'none' && tl2.pm.note === '' && /Training game/.test(tl2.sum), JSON.stringify(tl2.pm));
  check('the ledger row for the training game is clean, newest first, and judges the call', tl2.row && (tl2.row.mode === 'train' && tl2.row.clean === true && tl2.n === 2 && tl2.row.pm && tl2.row.pm.ply === 0 && tl2.row.pm.hit === (tl2.row.firstBlunder == null) && tl2.debt === 2), JSON.stringify(tl2.row).slice(0, 300));
  check('the call card answers "nowhere"', /^You said nowhere/.test(tl2.call), tl2.call);
  await p.screenshot({ path: SHOTS + '/c11c-train-review.png' });
  await p.click('#reviewBack'); await p.waitForTimeout(200);
  check('history marks the training game and the owed post-mortems', /train/.test(await p.$eval('#chessHist small', (e) => e.textContent)) && (await p.$$eval('#chessHist small', (e) => e.filter((s) => /post-mortem due/.test(s.textContent)).length)) === 2);
  // Chess960 diagnostic: a random back rank (bishops on opposite colours, king between the rooks, Black mirrored), no castling, recorded with variant '960'
  const okRank = (r) => { const b = [r.indexOf('B'), r.lastIndexOf('B')], k = r.indexOf('K'), rr = [r.indexOf('R'), r.lastIndexOf('R')]; return r.length === 8 && [...r].sort().join('') === 'BBKNNQRR' && b[0] % 2 !== b[1] % 2 && rr[0] < k && k < rr[1]; };
  const f960 = await p.evaluate(() => [window.__coach.fen960(518), window.__coach.fen960(0), window.__coach.fen960(959), new Set(Array.from({ length: 960 }, (_, i) => window.__coach.fen960(i))).size]);
  check('fen960: Scharnagl numbering, 518 is the standard rank, all 960 distinct, castling off', f960[0] === 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w - - 0 1' && /^bbqnnrkr\//.test(f960[1]) && /^rkrnnqbb\//.test(f960[2]) && f960[3] === 960, JSON.stringify(f960));
  let v0 = null;
  for (let i = 0; i < 3; i++) {   // a random rank is the standard one once in 960: draw again so the non-standard check holds
    await p.evaluate(() => window.__coach.newGame({ color: 'w', elo: 1200, variant: '960' }));
    await p.waitForFunction(() => window.__coach.state === 'playing' && window.__coach.game.variant === '960', null, { timeout: 30000 });
    v0 = await p.evaluate(() => { const g = window.__coach.game, f = g.chess.fen().split(' '), rows = f[0].split('/'); return { variant: g.variant, fen: g.fen, start: f.join(' ') === g.fen, castle: f[2], r1: rows[7], r8: rows[0], pawns: rows[1] === 'pppppppp' && rows[6] === 'PPPPPPPP', strip: document.getElementById('rateJab').textContent, opening: document.getElementById('opening').getClientRects().length > 0, mode: g.mode, train: g.train, ecol: document.querySelector('#chessGame .ecol').getClientRects().length > 0, hint: document.getElementById('hintBtn').getClientRects().length > 0, asked: document.getElementById('ctxSheet').classList.contains('on') }; });
    if (v0.r1 !== 'RNBQKBNR') break;
  }
  check('Chess960 game: a legal non-standard back rank, mirrored, pawns normal, castling "-", a Train game with the 960 strip and no opening name', v0.variant === '960' && v0.start && v0.castle === '-' && okRank(v0.r1) && v0.r1 !== 'RNBQKBNR' && v0.r8 === v0.r1.toLowerCase() && v0.pawns && v0.mode === 'train' && v0.train && !v0.ecol && !v0.hint && !v0.asked && !v0.opening
    && /^Chess960 diagnostic\. No castling in this variant here\. Develop every piece, connect the rooks, keep the king safe\./.test(v0.strip), JSON.stringify(v0).slice(0, 400));
  await p.screenshot({ path: SHOTS + '/c11b2-960.png' });
  await p.evaluate(() => window.__coach.move('e2e4'));
  await p.waitForFunction(() => window.__coach.game.moves.length >= 2 && window.__coach.state === 'playing', null, { timeout: 30000 });
  check('the engine plays the random position', await p.evaluate(() => { const g = window.__coach.game; return g.moves.length === 2 && g.chess.turn() === 'w' && !document.getElementById('opening').getClientRects().length; }));
  await p.evaluate(() => window.__coach.resign()); await p.waitForSelector('#chessEnd.on', { timeout: 5000 });
  const ve = await p.evaluate(() => { const e = window.__coach.history[0]; return { variant: e.variant, fen: e.fen, mode: e.mode, clean: e.clean, slept: e.slept, n: e.moves.length, hist: document.querySelector('#chessHist small').textContent, prev: window.__coach.history[1].variant }; });
  check('the 960 entry: variant 960 with its start fen, slept null; the history line says 960; the training game before it has variant null', ve.variant === '960' && ve.fen === v0.fen && ve.mode === 'train' && ve.clean === true && ve.slept === null && ve.n === 2 && / · train · 960 · post-mortem due/.test(ve.hist) && ve.prev === null, JSON.stringify(ve).slice(0, 300));
  await p.click('#endAnalyze'); await doPm(p, 0, 'none', 'yes', 'none');
  const vrev = await p.waitForFunction(() => window.__coach.state === 'review' && !document.getElementById('rBody').hidden, null, { timeout: 120000 }).then(() => true).catch(() => false);
  await p.waitForTimeout(300);
  const vl = await p.evaluate(() => { const e = window.__coach.history[0], r = window.__coach.ledger[0]; return { row: r, n: window.__coach.ledger.length, rep: !!(e.report && e.report.moves && e.report.moves.length === 2), start: document.getElementById('rPos').textContent, opening: document.getElementById('rOpening').getClientRects().length > 0, sum: document.getElementById('rSummary').textContent, pgn: window.__coach.pgnOf(e), pcs: document.querySelectorAll('#rBoard .pc.svg').length }; });
  check('the 960 game analyses from its own start: ledger row variant 960 and castled null, no opening in the review, the summary says so', vrev && vl.rep && vl.row && vl.row.variant === '960' && vl.row.castled === null && vl.row.slept === null && vl.row.mode === 'train' && vl.n === 3 && !vl.opening && /Chess960 diagnostic, no castling/.test(vl.sum) && vl.start === 'Start' && vl.pcs === 32, JSON.stringify(vl.row).slice(0, 300));
  check('the 960 PGN carries Variant, SetUp and FEN', /\[Variant "Chess960 \(no castling\)"\]\n\[SetUp "1"\]\n\[FEN "[^"]+ w - - 0 1"\]/.test(vl.pgn) && vl.pgn.includes('[FEN "' + v0.fen + '"]') && /\n\n1\. e4 \S+\n\{ Post-mortem: no material loss named\. Engine: accuracy [\d.]+%/.test(vl.pgn), vl.pgn.slice(0, 300));
  await p.screenshot({ path: SHOTS + '/c11b3-960-review.png' });
  await p.click('#reviewBack'); await p.waitForTimeout(200);
  await p.click('#modeBtn');   // Train -> Play for the rest
  check('mode cycles back to Play', (await p.$eval('#modeBtn', (e) => e.textContent)) === 'Play');
  // drills: a set position against the full-strength engine, the clock where the opponent's name goes, nothing recorded; Again and Back
  const histN = await p.evaluate(() => window.__coach.history.length), ledN = await p.evaluate(() => window.__coach.ledger.length), evN = await p.evaluate(() => window.__ev.length);
  check('a bad fen is refused', (await p.evaluate(() => window.__coach.drill({ fen: 'nonsense', you: 'w' }))) === null && (await p.evaluate(() => window.__coach.state)) === 'home');
  await p.evaluate(() => { window.__dr = []; window.__coach.drill({ fen: '7k/5Q2/6K1/8/8/8/8/8 w - - 0 1', you: 'w', title: 'Queen mate', goal: 'win', targetMs: 30000, onDone: (r) => window.__dr.push(r) }); });
  await p.waitForFunction(() => window.__coach.state === 'playing' && window.__coach.game.drill, null, { timeout: 30000 });
  const clock0 = await p.$eval('#oppName', (e) => e.textContent); await p.waitForTimeout(1300);
  const d0 = await p.evaluate(() => ({ elo: window.__coach.game.elo, clock: document.getElementById('oppName').textContent, strip: document.getElementById('rateJab').textContent, label: document.getElementById('rateLabel').textContent, opening: document.getElementById('opening').getClientRects().length > 0, ecol: document.querySelector('#chessGame .ecol').getClientRects().length > 0, hint: document.getElementById('hintBtn').getClientRects().length > 0, pcs: document.querySelectorAll('#board .pc.svg').length, asked: document.getElementById('ctxSheet').classList.contains('on') }));
  check('drill: set position, engine at 2850, a clock ticking in the opponent slot, bare strip, no day sheet', d0.elo === 2850 && /^\d+:\d\d$/.test(clock0) && /^\d+:\d\d$/.test(d0.clock) && d0.clock !== clock0 && /^Queen mate\. Full-strength engine, clock running\.$/.test(d0.strip) && d0.label === 'Win it · target 0:30' && !d0.opening && !d0.ecol && !d0.hint && d0.pcs === 3 && !d0.asked, JSON.stringify(Object.assign({ clock0 }, d0)));
  check('drill refuses hints', (await p.evaluate(() => window.__coach.hint())) === null);
  await p.screenshot({ path: SHOTS + '/c11d-drill.png' });
  await p.evaluate(() => window.__coach.move('f7f8'));
  await p.waitForSelector('#chessEnd.on', { timeout: 10000 });
  const d1 = await p.evaluate(() => ({ dr: window.__dr, h3: document.querySelector('#chessEnd h3').textContent, title: document.getElementById('endTitle').textContent, msg: document.getElementById('endMsg').textContent, again: document.getElementById('endNew').textContent, back: document.getElementById('endHome').textContent, analyze: document.getElementById('endAnalyze').getClientRects().length > 0, hist: window.__coach.history.length, led: window.__coach.ledger.length, st: window.__coach.state, ev: window.__ev.length }));
  check('mate ends the drill: onDone with a win and metGoal, Again / Back, nothing recorded', d1.dr.length === 1 && d1.dr[0].result === 'win' && d1.dr[0].metGoal === true && d1.dr[0].plies === 1 && d1.dr[0].ms >= 0 && d1.h3 === 'DRILL' && d1.title === 'Checkmate.' && /^Queen mate: checkmate after 1 move in \d+:\d\d\. Target 0:30: made it\./.test(d1.msg) && d1.again === 'Again' && d1.back === 'Back' && !d1.analyze && d1.hist === histN && d1.led === ledN && d1.st === 'over' && d1.ev === evN, JSON.stringify(d1).slice(0, 400));
  await p.screenshot({ path: SHOTS + '/c11e-drill-done.png' });
  await p.click('#endNew');
  await p.waitForFunction(() => window.__coach.state === 'playing' && window.__coach.game.drill && window.__coach.game.moves.length === 0 && document.querySelector('#board [data-sq="f7"] .pc.svg.cw.tq'), null, { timeout: 30000 }).then(() => check('Again restarts the same position', true)).catch(() => check('Again restarts the same position', false));
  await p.evaluate(() => window.__coach.resign()); await p.waitForSelector('#chessEnd.on', { timeout: 5000 });
  check('resigning a drill reports a loss', (await p.evaluate(() => JSON.stringify(window.__dr.map((r) => r.result + ':' + r.metGoal)))) === '["win:true","loss:false"]' && (await p.$eval('#endTitle', (e) => e.textContent)) === 'Resigned.');
  await p.click('#endHome'); await p.waitForTimeout(150);
  check('Back without onBack goes to the chess home', !(await p.$eval('#chessHome', (e) => e.hidden)) && (await p.$eval('#chessEnd', (e) => !e.classList.contains('on'))) && (await p.$eval('#chessEnd h3', (e) => e.textContent)) === 'DRILL');
  // a fen with the engine to move, a draw goal, and onBack
  await p.evaluate(() => { window.__back = 0; window.__dr = []; window.__coach.drill({ fen: '8/8/8/8/8/4k3/8/4K2Q b - - 0 1', you: 'w', title: 'Queen vs king', goal: 'draw', onDone: (r) => window.__dr.push(r), onBack: () => { window.__back++; } }); });
  const eng1 = await p.waitForFunction(() => window.__coach.state === 'playing' && window.__coach.game.moves.length === 1, null, { timeout: 30000 }).then(() => true).catch(() => false);
  check('a fen with the engine to move: it moves first, then your clock', eng1 && (await p.evaluate(() => window.__coach.game.moves[0].ms === undefined && window.__coach.game.t0 > 0)), await p.evaluate(() => JSON.stringify(window.__coach.game.moves)));
  await p.evaluate(() => window.__coach.resign()); await p.waitForSelector('#chessEnd.on', { timeout: 5000 });
  check('a draw goal is not met by a loss', (await p.evaluate(() => window.__dr[0] && window.__dr[0].result === 'loss' && window.__dr[0].metGoal === false)));
  await p.click('#endHome'); await p.waitForTimeout(150);
  check('Back calls onBack and leaves the chess screen', (await p.evaluate(() => window.__back)) === 1 && !(await p.$eval('#chess', (e) => e.classList.contains('on'))) && (await p.evaluate(() => window.__coach.state)) === 'home');
  await p.evaluate(() => window.__hub.chess()); await p.waitForTimeout(150);
  check('a normal game after a drill gets the eval bar and the help back', await p.evaluate(() => { const g = window.__coach.newGame({ color: 'w', elo: 1200 }); const ok = !!g && !g.drill && document.querySelector('#chessGame .ecol').getClientRects().length > 0 && document.getElementById('hintBtn').getClientRects().length > 0 && document.getElementById('opening').getClientRects().length > 0 && document.querySelector('#chessEnd h3').textContent === 'DRILL'; window.__coach.resign(); return ok; }));
  check('a resigned game under two plies is not recorded', (await p.evaluate(() => window.__coach.history.length)) === histN && (await p.$eval('#chessEnd h3', (e) => e.textContent)) === 'GAME OVER');
  await p.click('#endHome'); await p.waitForTimeout(150);
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
  const learnStore = () => p.evaluate(() => (JSON.parse(localStorage.getItem('ghostlap-learn-v1') || '{}').jesse || {}));
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
  await p.reload(); await p.waitForTimeout(600); await hook(p);
  const rl = await p.evaluate(() => ({ box: JSON.parse(localStorage.getItem('ghostlap-learn-v1')).jesse.french.cards, due: window.__learn.due('french') }));
  check('position cards: boxes persist across reload', rl.box.box['1:e6'] === 2 && rl.box.box['3:d5'] === 1 && rl.box.sessions === 1 && rl.due.due === frN - 1, JSON.stringify(rl));
  await p.evaluate(() => { window.__learn.show('french'); window.__learn.cards(); }); await p.waitForTimeout(150);
  for (let n = 0; n < 60; n++) {
    const s = await p.evaluate(() => window.__learn.drill); if (!s || s.phase === 'done') break;
    if (s.phase === 'ask') await p.evaluate((c) => window.__learn.answer(c.from, c.to), s.card); else await p.evaluate(() => window.__learn.next());
  }
  const sum = await p.evaluate(() => ({ d: window.__learn.drill, on: document.getElementById('dSum').getClientRects().length > 0, seen: document.getElementById('dSeen').textContent, first: document.getElementById('dFirst').textContent, box: JSON.parse(localStorage.getItem('ghostlap-learn-v1')).jesse.french.cards.box }));
  check('position cards: session summary', sum.d.phase === 'done' && sum.on && sum.seen === String(frN - 1) && sum.first === '100%' && Object.values(sum.box).filter((b) => b === 2).length === frN, JSON.stringify(sum).slice(0, 260));
  await p.screenshot({ path: SHOTS + '/c24-cards-summary.png' });
  await p.click('#dDone'); await p.waitForTimeout(200);
  const cs1 = await p.evaluate(() => ({ on: document.getElementById('lesson').classList.contains('on'), drill: document.getElementById('drill').classList.contains('on'), st: document.getElementById('lCardsStat').textContent }));
  check('Done goes back to the lesson with the cards status', cs1.on && !cs1.drill && cs1.st.startsWith(frN + ' cards, ' + frN + ' due'), JSON.stringify(cs1));
  await p.click('#lessonBack'); await p.waitForTimeout(200);
  const glyph = await p.$$eval('#learnList .lcard', (e) => e.filter((c) => c.querySelector('.lprog')).map((c) => c.querySelector('.t').textContent));
  check('learn list marks drilled openings', glyph.length === 2 && glyph.some((t) => /Italian/.test(t)) && glyph.some((t) => /French/.test(t)), glyph.join(' | '));
  await p.screenshot({ path: SHOTS + '/c25-learn-progress.png' });
  await p.evaluate(() => { window.__coach.setPlayer('j'); window.__learn.open(); }); await p.waitForTimeout(150);
  const jv = await p.evaluate(() => { const rings = document.querySelectorAll('#learnList .lprog').length; window.__learn.show('italian');
    return { rings, who: window.__learn.player, ms: document.getElementById('lMemStat').textContent, cs: document.getElementById('lCardsStat').textContent, prog: window.__learn.progress('french') }; });
  check('drill progress is per player: J sees none of Jesse\'s', jv.who === 'j' && jv.rings === 0 && !/^Best/.test(jv.ms) && jv.cs.startsWith(mine + ' cards, ' + mine + ' due') && !jv.prog.cards, JSON.stringify(jv).slice(0, 220));
  await p.evaluate(() => { window.__coach.setPlayer('jesse'); window.__learn.open(); }); await p.waitForTimeout(150);
  check('switching back to Jesse brings his rings back', (await p.$$eval('#learnList .lprog', (e) => e.length)) === 2);
  await p.click('#learnBack'); await p.waitForTimeout(200);
  check('back returns to hub', await p.$eval('#hub', (e) => e.classList.contains('on')));

  // escalation and level check, in a fresh phone: Jesse seeded with three analysed games that all hung a piece; J untouched
  const ctx2 = await b.newContext({ ...devices['iPhone 13'] });
  const q = await ctx2.newPage();
  q.on('pageerror', (e) => errs.push('pageerror(2): ' + e.message));
  q.on('console', (m) => { if (m.type() === 'error') errs.push('console(2): ' + m.text()); });
  await q.goto(base);
  await q.evaluate((games) => localStorage.setItem('ghostlap-chess-v1', JSON.stringify({ player: 'jesse', players: { jesse: { name: 'Jesse', elo: 1400, color: 'w', theme: 'night', mode: 'play', voice: 'kind', games } } })), [SYN('s1', 1, [200000, null, 5000, null, 3000, null, 2000, null]), SYN('s2', 2), SYN('s3', 3)]);
  await q.reload(); await q.waitForTimeout(300);
  await q.click('#pickChess'); await q.waitForTimeout(300);
  const esc = await q.evaluate(() => ({ st: window.__coach.streaks().hung, line: window.__coach.focusLine(), box: document.getElementById('focusBox').hidden ? '' : document.getElementById('focusBox').innerText.replace(/\s+/g, ' '),
    calib: !document.getElementById('calibCard').hidden, cal: window.__coach.calib, one: window.__coach.cards(window.__coach.history[0]) }));
  check('streak counts three games running', esc.st === 3, JSON.stringify(esc.st));
  check('pre-game focus gets firmer after three games', /^Same thing three games running\. This game, before every move: what of mine is undefended\?$/.test(esc.line) && esc.box.includes(esc.line), esc.line + ' / ' + esc.box);
  check('the one thing says third game running', esc.one[1] && esc.one[1].head === 'Third game running: hanging pieces' && /^Next game, before every move/.test(esc.one[2].text), JSON.stringify(esc.one.map((c) => [c.head, c.text])).slice(0, 300));
  check('3+ analysed games count as calibrated', !esc.calib && esc.cal.calibrated && esc.cal.elo === 1400, JSON.stringify(esc.cal));
  const lg = await q.evaluate(() => ({ L: window.__coach.ledger, debt: window.__coach.pmDebt(), h0: window.__coach.history[0], saved: JSON.parse(localStorage.getItem('ghostlap-chess-v1')).players.jesse.ledger.length }));
  check('ledger backfilled on load for analysed games without rows (firstBlunder at move 3, old fields filled with nulls)', lg.L.length === 3 && lg.saved === 3 && lg.L.every((r) => r.firstBlunder === 3 && r.hung === 1 && r.pm === null && r.mode === 'play' && r.ctx === null && r.clean === true && r.blunders === 1 && r.mistakes === 0 && r.castled === null && r.myMoves === 4 && r.plies === 8 && r.acc === 61 && r.tags.hung === 1 && r.tags.opening === 1 && r.endgame === false && r.you === 'w' && r.result === 'loss')
    && lg.L.map((r) => r.id).join() === 's1,s2,s3' && lg.L[0].longestMs === 200000 && lg.L[0].meanMs === 52500 && lg.L[1].longestMs === null && lg.L[1].meanMs === null && lg.debt === 3 && lg.h0.mode === 'play' && lg.h0.ctx === null && lg.h0.pm === null && lg.h0.clean === true && Array.isArray(lg.h0.times), JSON.stringify(lg.L[0]).slice(0, 400));
  await q.click('#chessHist .rv >> nth=0');
  check('an old analysed game gets the gate too', await q.waitForSelector('#pmSheet.on', { timeout: 5000 }).then(() => true).catch(() => false));
  await doPm(q, 5, 'undefended', 'no', 'hung_piece');
  await q.waitForFunction(() => window.__coach.state === 'review' && !document.getElementById('rBody').hidden, null, { timeout: 10000 }); await q.waitForTimeout(300);
  const old = await q.evaluate(() => ({ row: window.__coach.ledger[0], debt: window.__coach.pmDebt(), n: window.__coach.ledger.length }));
  check('the post-mortem of an old game updates its ledger row in place: the call hit the engine\'s move 3', old.row.id === 's1' && old.n === 3 && old.row.firstBlunder === 3 && old.row.pm && old.row.pm.ply === 5 && old.row.pm.hit === true && old.row.pm.tag === 'hung_piece' && old.row.pm.threat === 'undefended' && old.row.pm.checked === 'no' && old.debt === 2, JSON.stringify(old.row.pm));
  const rcs = await q.$$eval('#rCards .rcard', (e) => e.map((d) => d.innerText.replace(/\s+/g, ' ')));
  check('review of an old entry shows the escalated cards, after the call card', rcs.length === 4 && /You said move 3 \(Nxe5\)\. The engine’s first big swing was move 3 \(Nxe5\?\?\)\. Same move\./.test(rcs[0]) && rcs.some((t) => /Third game running: hanging pieces/.test(t)), rcs.join(' | ').slice(0, 300));
  await q.screenshot({ path: SHOTS + '/c16-cards-escalated.png' });
  await q.click('#rCards .rcard.k-one .drill'); await q.waitForTimeout(150);
  const dr = await q.evaluate(() => ({ focus: window.__coach.focus, pos: document.getElementById('rPos').textContent, btn: document.querySelector('#rCards .rcard.k-one .drill').textContent }));
  check('Drill this sets the focus for three games (without moving the board)', dr.focus && dr.focus.key === 'hung' && dr.focus.left === 3 && dr.pos === 'Start' && /Drilling/.test(dr.btn), JSON.stringify(dr));
  await q.click('#rMoveList .m.lt'); await q.waitForTimeout(100);
  const lt = await q.evaluate(() => ({ n: document.querySelectorAll('#rMoveList .m.lt').length, pos: document.getElementById('rPos').textContent, shown: document.getElementById('rThink').getClientRects().length > 0, text: document.getElementById('rThink').textContent, title: document.querySelector('#rMoveList .m.lt').title }));
  check('a long think is marked in the move list and said plainly on the move', lt.n === 1 && lt.pos === '1. e4' && lt.shown && lt.text === '3 min 20 s on this move: a long think means you did not recognise the position.' && lt.title === '3 min 20 s on this move', JSON.stringify(lt));
  await q.click('#rNext'); await q.waitForTimeout(60);
  check('the long-think line goes with the move', !(await q.$eval('#rThink', (e) => e.getClientRects().length > 0)));
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
    await q.click('#calibGo'); await q.waitForTimeout(100);
    const asked = await q.$eval('#ctxSheet', (e) => e.classList.contains('on'));
    check('level check game ' + n + (n === 1 ? ' asks the day first' : ' does not ask again'), asked === (n === 1));
    if (asked) await q.click('#ctxMorning');
    await q.waitForFunction(() => window.__coach.state === 'playing', null, { timeout: 30000 });
    const g = await q.evaluate(() => ({ elo: window.__coach.game.elo, calib: window.__coach.game.calib, tutor: window.__coach.game.tutor, ctx: window.__coach.game.ctx, mode: window.__coach.game.mode }));
    check('level check game ' + n + ' starts at ' + want, g.calib && !g.tutor && g.elo === want && g.ctx === 'morning' && g.mode === 'play', JSON.stringify(g));
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
  const k2 = await q.evaluate(() => ({ head: document.getElementById('calibHead').textContent, cal: window.__coach.calib, hist: document.querySelector('#chessHist small').textContent }));
  check('card progresses to Game 2 of 3 (accuracy counted)', /Game 2 of 3/.test(k2.head) && k2.cal.progress.games.length === 1 && k2.cal.progress.games[0].acc != null, JSON.stringify(k2.cal.progress));
  check('history line tags the level check', /level check/.test(k2.hist), k2.hist);
  await q.screenshot({ path: SHOTS + '/c19-calib-progress.png' });
  // leaving mid-way survives a reload
  await q.reload(); await q.waitForTimeout(300); await q.click('#pickChess'); await q.waitForTimeout(200);
  check('level check progress survives a reload', /Game 2 of 3/.test(await q.$eval('#calibHead', (e) => e.textContent)));
  await calibGame(2);
  await q.waitForFunction(() => { const c = window.__coach.calib.progress; return c && c.games[1] && c.games[1].acc != null; }, null, { timeout: 120000 }).catch(() => {});
  await q.click('#endHome'); await q.waitForTimeout(200);
  await calibGame(3);
  const lvlDone = await q.waitForSelector('#calibDone.on', { timeout: 120000 }).then(() => true).catch(() => false);
  const fin = await q.evaluate(() => ({ title: document.getElementById('calibTitle').textContent, msg: document.getElementById('calibMsg').textContent, cal: window.__coach.calib, hist: window.__coach.history.filter((g) => g.calib).length }));
  check('after game 3 the level is set', lvlDone && fin.cal.calibrated && !fin.cal.progress && fin.title === 'Your level: ~' + fin.cal.elo && fin.cal.elo % 50 === 0 && fin.cal.elo >= 800 && fin.cal.elo <= 2850
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
