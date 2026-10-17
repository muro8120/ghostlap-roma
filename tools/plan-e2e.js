// Headless check of the TRAIN screen (plan.js), the hub's Train card and the Learn relabel, in Chromium at iPhone 13 width.
// node tools/plan-e2e.js   (screenshots in $SHOTS or /tmp/ghostlap-shots; PORT=8783 if 8773 is busy)
// Until index.html loads curriculum.js, puzzles-data.js, puzzles.js, endgames.js and plan.js itself, the test serves a copy
// of index.html with the missing script tags added (written to $SCRATCH or the OS temp dir); the real index.html is never touched.
// One check plays a short training game against the real engine, so the engine has to come up (about 30 s on a slow box).
const { chromium, devices } = require('/opt/node-tools/node_modules/playwright');
const http = require('http'), fs = require('fs'), path = require('path'), os = require('os');
const ROOT = path.join(__dirname, '..');
const SHOTS = process.env.SHOTS || '/tmp/ghostlap-shots'; fs.mkdirSync(SHOTS, { recursive: true });
const PORT = +process.env.PORT || 8773;
let INDEX = path.join(ROOT, 'index.html');
{
  let html = fs.readFileSync(INDEX, 'utf8'), changed = false;
  const tag = (f) => '<script src="' + f + '"></script>';
  const after = (anchor, f) => { if (!html.includes(tag(f))) { html = html.replace(tag(anchor), tag(anchor) + '\n' + tag(f)); changed = true; } };
  const before = (anchor, f) => { if (!html.includes(tag(f))) { html = html.replace(tag(anchor), tag(f) + '\n' + tag(anchor)); changed = true; } };
  after('lessons.js', 'curriculum.js'); before('coach.js', 'puzzles-data.js');
  after('learn.js', 'puzzles.js'); after('puzzles.js', 'endgames.js'); after('endgames.js', 'plan.js');   // ... then hub.js, which already follows learn.js
  if (changed) { INDEX = path.join(process.env.SCRATCH || os.tmpdir(), 'ghostlap-plan-index.html'); fs.writeFileSync(INDEX, html); }
}
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.png': 'image/png', '.wasm': 'application/wasm', '.svg': 'image/svg+xml', '.webmanifest': 'application/manifest+json' };
const srv = http.createServer((q, r) => {
  let p = decodeURIComponent(new URL(q.url, 'http://x').pathname); if (p.endsWith('/')) p += 'index.html';
  const f = p === '/index.html' ? INDEX : path.join(ROOT, p);
  if ((f !== INDEX && !f.startsWith(ROOT)) || !fs.existsSync(f)) { r.writeHead(404); return r.end('nf'); }
  r.writeHead(200, { 'content-type': TYPES[path.extname(f)] || 'application/octet-stream' }); fs.createReadStream(f).pipe(r);
}).listen(PORT);
// a synthetic analysed game (White), as in chess-e2e.js: 3. Nxe5?? hangs the knight (first blunder at move 3), never castled, no post-mortem.
// Ten of them give the S0 criteria a full ten-game window: hung pieces 1 per game (met), first blunder at move 3 (unmet), castled 0% (unmet).
const SYN = (i) => {
  const mk = (ply, uci, san, label, loss, x) => Object.assign({ ply, color: ply % 2 ? 'w' : 'b', uci, san, label, loss, cpBefore: 30, cpAfter: 30, mateBefore: null, mateAfter: null, best: uci, bestSan: san, reply: null, pv: [], pieces: 14, hung: null }, x || {});
  const moves = [mk(1, 'e2e4', 'e4', 'best', 0), mk(2, 'e7e5', 'e5', 'best', 0), mk(3, 'g1f3', 'Nf3', 'best', 0), mk(4, 'b8c6', 'Nc6', 'best', 0),
    mk(5, 'f3e5', 'Nxe5', 'blunder', 300, { best: 'f1c4', bestSan: 'Bc4', reply: 'c6e5', hung: 'n', cpAfter: -270 }), mk(6, 'c6e5', 'Nxe5', 'best', 0), mk(7, 'd2d4', 'd4', 'great', 10), mk(8, 'e5c6', 'Nc6', 'good', 30)];
  const cnt = (c) => ({ best: 0, great: 0, good: 0, inaccuracy: 0, mistake: 0, blunder: 0, forced: 0, ...c });
  return { id: 'syn' + i, date: new Date(Date.now() - (i + 1) * 864e5).toISOString(), elo: 1200, you: 'w', result: 'loss', reason: 'resign', moves: moves.map((m) => m.uci), sans: moves.map((m) => m.san),
    hints: 0, nudges: 0, tutor: false, takebacks: 0, practice: null, assist: { used: 0, budget: 10 }, hinted: [],
    report: { accuracy: { w: 61, b: 97 }, counts: { w: cnt({ best: 2, great: 1, blunder: 1 }), b: cnt({ best: 3, good: 1 }) }, moves, evals: [30, 30, 30, 30, 30, -270, -270, -280, -260],
      worst: [moves[4]], summary: 'Accuracy 61%. 1 blunder, 0 mistakes, 0 inaccuracies.', lesson: 'Synthetic lesson.' } };
};
const results = [];
const check = (name, ok, extra) => { results.push([ok ? 'PASS' : 'FAIL', name, extra || '']); console.log((ok ? 'PASS ' : 'FAIL ') + name + (extra ? '  ' + extra : '')); };
const KEY = 'ghostlap-train-v1';

let b = null;
(async () => {
  b = await chromium.launch();
  const ctx = await b.newContext({ ...devices['iPhone 13'] });
  // seed the chess save once (not on reloads) with ten analysed games for Jesse; the coach backfills their ledger rows on load
  await ctx.addInitScript((games) => { if (!localStorage.getItem('ghostlap-chess-v1')) localStorage.setItem('ghostlap-chess-v1', JSON.stringify({ player: 'jesse', players: { jesse: { name: 'Jesse', games } } })); },
    Array.from({ length: 10 }, (_, i) => SYN(i)));
  const p = await ctx.newPage();
  const errs = [];
  p.on('pageerror', (e) => errs.push('pageerror: ' + e.message));
  p.on('console', (m) => { if (m.type() === 'error') errs.push('console: ' + m.text()); });
  const base = 'http://localhost:' + PORT + '/';
  await p.goto(base);
  const up = await p.waitForFunction(() => window.__plan && window.__coach && window.__puzzles && window.__endgames && window.Curriculum, null, { timeout: 8000 }).then(() => true).catch(() => false);
  check('plan, coach, puzzles, endgames and curriculum hooks present', up);
  if (!up) return done();
  const txt = (sel) => p.$eval(sel, (e) => e.innerText.replace(/\s+/g, ' ').trim()).catch(() => '');
  const onScreens = () => p.evaluate(() => [...document.querySelectorAll('.screen.on')].map((e) => e.id));
  const noHScroll = () => p.evaluate(() => { const s = document.getElementById('plan'); return s.scrollWidth <= s.clientWidth + 1 && document.documentElement.scrollWidth <= window.innerWidth + 1; });

  // ---- the launcher ----
  await p.screenshot({ path: SHOTS + '/p0-hub.png' });
  const card = await p.evaluate(() => { const b = document.getElementById('pickTrain'); const r = b && b.getBoundingClientRect(); return b && { t: b.querySelector('.t').textContent, b: b.querySelector('.b').textContent, visible: r.width > 200 && r.height > 50, n: document.querySelectorAll('#hub .pick button').length }; });
  check('launcher shows the Train card, fourth, with a description', !!card && card.t === 'Train' && card.n === 4 && card.visible && card.b.length > 20, JSON.stringify(card));
  check('section and .pl- style injected, hidden at load', await p.evaluate(() => { const s = document.getElementById('plan'), st = document.getElementById('plStyle'); return !!s && s.classList.contains('screen') && !s.classList.contains('on') && !!st && /\.pl-block/.test(st.textContent); }));
  await p.click('#pickTrain'); await p.waitForTimeout(200);
  check('Train opens the plan alone', (await onScreens()).join(',') === 'plan', (await onScreens()).join(','));
  await p.screenshot({ path: SHOTS + '/p1-train.png', fullPage: false });

  // ---- Stage 0 and its blocks ----
  const s0 = await p.evaluate(() => ({
    title: document.getElementById('plStageTitle').textContent, stage: window.__plan.stage(), start: window.__plan.store.startISO, week: document.getElementById('plWeekHead').textContent,
    blocks: [...document.querySelectorAll('#plToday .pl-block')].map((e) => e.dataset.block + ':' + e.dataset.kind + ':' + (e.classList.contains('pl-off') ? 'off' : 'on')),
    acts: [...document.querySelectorAll('#plToday [data-act]')].map((e) => e.dataset.act), dones: [...document.querySelectorAll('#plToday [data-done]')].map((e) => e.dataset.done),
    q: !!document.getElementById('plCtx'), counts: [...document.querySelectorAll('#plToday .pl-count')].map((e) => e.textContent),
    step: document.getElementById('plStep').textContent, pearl: document.getElementById('plPearl').dataset.id, grade: document.querySelector('#plPearl .pl-grade').textContent,
    level: window.__coach.reviewLevel, h2: [...document.querySelectorAll('#plan h2')].map((e) => e.textContent),
  }));
  check('opens on Stage 0 with the start date set and week 1', s0.title === 'Stage 0: Floor, move safety' && s0.stage === 'S0' && !!s0.start && /Week 1 of about 8/.test(s0.week), s0.title + ' | ' + s0.week);
  check('the four S0 blocks, all on, with the day question unanswered', s0.q && s0.blocks.join(' ') === 'S0-B1:game:on S0-B2:lesson:on S0-B3:puzzles:on S0-B4:endgames:on', s0.blocks.join(' '));
  check('each block has its action; Lesson has a manual Done', s0.acts.join(',') === 'game,lesson,puzzles,endgames' && s0.dones.join(',') === 'S0-B2', s0.acts.join(',') + ' / ' + s0.dones.join(','));
  check('tick counts start at 0 of n this week', s0.counts.join('|') === '0 of 2 this week|0 of 1 this week|0 of 4 this week|0 of 1 this week', s0.counts.join('|'));
  check('week 1 micro-step and the pearl of the week with its grade', /week 1/.test(s0.step) && /3 games at 15\+10/.test(s0.step) && s0.pearl === 'P01' && s0.grade === 'C', s0.step.slice(0, 60) + ' | ' + s0.pearl + ' ' + s0.grade);
  check('five sections in order', s0.h2.join(',') === 'Today,This week,Stage,Metrics,Resources' && s0.level === 'narrow', s0.h2.join(','));
  check('no horizontal scroll at iPhone 13 width', await noHScroll());

  // ---- metrics and criteria from the seeded games ----
  const m0 = await p.evaluate(() => ({
    fb: document.querySelector('#plGrid .pl-gv[data-metric="first_blunder_move_median"]').textContent, hung: document.querySelector('#plGrid .pl-gv[data-metric="hung_pieces_per_game"]').textContent,
    castled: document.querySelector('#plGrid .pl-gv[data-metric="castled_by_move_10_pct"]').textContent, rev: document.querySelector('#plGrid .pl-gv[data-metric="review_completed_pct"]').textContent,
    clean: document.getElementById('plClean').textContent, ledger: window.__coach.ledger.length,
    crit: [...document.querySelectorAll('#plCrit .pl-crit')].map((e) => e.dataset.metric + '=' + e.dataset.status), labels: [...document.querySelectorAll('#plCrit .pl-crit')].map((e) => e.textContent),
    adv: !!document.getElementById('plAdvAnyway') && !document.getElementById('plAdvGo'), debt: (document.getElementById('plDebt') || {}).textContent || '',
  }));
  check('the ten seeded games are in the ledger and the metrics grid reads them', m0.ledger === 10 && m0.fb === '3' && m0.hung === '1' && m0.castled === '0%' && m0.rev === '0%' && /last 10 clean games[^:]*: 10 so far/.test(m0.clean), JSON.stringify([m0.fb, m0.hung, m0.castled, m0.rev, m0.clean]));
  check('criteria: hung pieces met, first blunder and castling unmet, the rest unknown', m0.crit.join(' ') === 'hung_pieces_per_game=met first_blunder_move_median=unmet safety_check_seconds=unknown mate_KQ_seconds=unknown mate_KR_seconds=unknown KP_vs_K_win=unknown castled_by_move_10_pct=unmet', m0.crit.join(' '));
  check('actual values sit next to the targets', m0.labels.some((l) => /first two-pawn blunder: 3 \(target over 20, last 10 clean games\)/.test(l)) && m0.labels.some((l) => /Pieces hung per game: 1 \(target 1 or fewer/.test(l)), m0.labels[1]);
  check('Advance anyway offered, not Advance; 10 games owe a post-mortem', m0.adv && /10 games owe a post-mortem/.test(m0.debt), m0.debt);

  // ---- the day question ----
  await p.click('#plCtx [data-ctx="post"]'); await p.waitForTimeout(100);
  const post = await p.evaluate(() => ({
    coach: window.__coach.ctxToday(), plan: window.__plan.ctxToday(), day: window.__plan.store.days[Object.keys(window.__plan.store.days)[0]],
    blocks: [...document.querySelectorAll('#plToday .pl-block')].map((e) => e.dataset.block + ':' + (e.classList.contains('pl-off') ? 'off' : 'on')),
    why: [...document.querySelectorAll('#plToday .pl-off .pl-why')].map((e) => e.textContent), research: [...document.querySelectorAll('#plToday .pl-off .pl-dim')].map((e) => e.textContent),
    acts: [...document.querySelectorAll('#plToday [data-act]')].map((e) => e.dataset.act), q: !!document.getElementById('plCtx'),
  }));
  check('"After a shift" is shared with the coach and remembered', post.coach === 'post' && post.plan === 'post' && post.day === 'post' && !post.q);
  // the curriculum keeps only shift-day work after a shift, so the any-day endgame drill is greyed too; easy tactics is the one thing left on
  check('the long game and the lesson are greyed with "Not today" and the research line', post.blocks.join(' ') === 'S0-B1:off S0-B2:off S0-B3:on S0-B4:off' && post.why.length === 3 && post.why.every((w) => w === 'Not today: easy repetition only.')
    && post.research.length === 3 && /shift/i.test(post.research[0]) && /grade A/.test(post.research[0]) && post.acts.join(',') === 'puzzles', post.blocks.join(' ') + ' | ' + post.research[0].slice(0, 80));
  await p.screenshot({ path: SHOTS + '/p2-post-shift.png' });
  await p.click('#plCtxChange'); await p.waitForTimeout(80);
  check('Change asks again', await p.evaluate(() => !!document.getElementById('plCtx') && document.querySelectorAll('#plToday .pl-block').length === 4));
  await p.click('#plCtx [data-ctx="morning"]'); await p.waitForTimeout(80);
  const morn = await p.evaluate(() => ({ coach: window.__coach.ctxToday(), blocks: [...document.querySelectorAll('#plToday .pl-block')].map((e) => e.dataset.block) }));
  check('an off-day morning lists the morning, off-day and any-day blocks', morn.coach === 'morning' && morn.blocks.join(',') === 'S0-B1,S0-B2,S0-B4', morn.blocks.join(','));

  // ---- self-attested toggle ----
  const before = await p.$eval('#plCrit .pl-crit[data-metric="safety_check_seconds"]', (e) => e.dataset.status + ':' + e.querySelector('[data-attest]').textContent);
  await p.click('#plCrit [data-attest="safety_check_seconds"]'); await p.waitForTimeout(80);
  const after = await p.evaluate(() => { const e = document.querySelector('#plCrit .pl-crit[data-metric="safety_check_seconds"]'); return { st: e.dataset.status, pill: e.querySelector('[data-attest]').textContent, on: e.querySelector('[data-attest]').classList.contains('on'), label: e.textContent, store: window.__plan.store.attest, honest: /on your word/.test(document.getElementById('plCrit').textContent) }; });
  check('toggling a self-attested criterion flips unknown to met and is stored', before === 'unknown:Not yet' && after.st === 'met' && after.pill === 'Yes' && after.on && after.store.safety_check_seconds === true && /yes \(you said so\)/.test(after.label) && after.honest, before + ' -> ' + after.st);
  await p.click('#plCrit [data-attest="safety_check_seconds"]'); await p.waitForTimeout(80);
  check('and back to not yet (unmet, on your word)', await p.$eval('#plCrit .pl-crit[data-metric="safety_check_seconds"]', (e) => e.dataset.status) === 'unmet' && (await p.evaluate(() => window.__plan.store.attest.safety_check_seconds)) === false);

  // ---- weekly ticks: manual Done, the tick hook, and the block actions opening the other screens ----
  await p.click('#plToday [data-done="S0-B2"]'); await p.waitForTimeout(80);
  const t1 = await p.evaluate(() => ({ n: document.querySelector('#plToday .pl-block[data-block="S0-B2"] .pl-count').textContent, dots: document.querySelectorAll('#plToday .pl-block[data-block="S0-B2"] .pl-dots i.on').length, done: window.__plan.store.done }));
  check('Done ticks the lesson block for this week', t1.n === '1 of 1 this week' && t1.dots === 1 && Object.values(t1.done)[0]['S0-B2'] === 1, JSON.stringify(t1.done));
  check('tick() counts within the plan week', (await p.evaluate(() => window.__plan.tick('S0-B3'))) === 1 && (await p.evaluate(() => window.__plan.days.length === 7 && window.__plan.week === 0)));
  await p.click('#plToday [data-act="endgames"]'); await p.waitForTimeout(150);
  const eg = await p.evaluate(() => ({ on: [...document.querySelectorAll('.screen.on')].map((e) => e.id).join(','), filter: window.__endgames.filter }));
  check('Endgame drill opens the Stage 0 endgames', eg.on === 'endgames' && eg.filter === 'S0', JSON.stringify(eg));
  await p.click('#egBack'); await p.waitForTimeout(150);
  check('back from endgames returns to the plan, no tick without a drill played', (await onScreens()).join(',') === 'plan' && (await p.$eval('#plToday .pl-block[data-block="S0-B4"] .pl-count', (e) => e.textContent)) === '0 of 1 this week');
  await p.evaluate(() => window.__plan.setCtx('shift'));
  await p.click('#plToday [data-act="puzzles"]'); await p.waitForTimeout(200);
  const pz = await p.evaluate(() => ({ on: [...document.querySelectorAll('.screen.on')].map((e) => e.id).join(','), sub: document.getElementById('pzSub').textContent, st: window.__puzzles.state }));
  check('Easy tactics opens a session in the Stage 0 band for the block\'s minutes', pz.on === 'puzzles' && /Rated 500–799/.test(pz.sub) && /about 15 min/.test(pz.sub) && pz.st && pz.st.band[0] === 500, pz.sub);
  await p.evaluate(() => window.__puzzles.close()); await p.waitForTimeout(100);
  await p.evaluate(() => window.__hub.train()); await p.waitForTimeout(100);

  // ---- post-mortem debt: the sheet opens over the coach, Later brings the plan back ----
  await p.click('#plDebtGo'); await p.waitForTimeout(150);
  const pmOpen = await p.evaluate(() => ({ sheet: document.getElementById('pmSheet').classList.contains('on'), on: [...document.querySelectorAll('.screen.on')].map((e) => e.id).join(','), id: window.__coach.pm && window.__coach.pm.id }));
  check('the debt button opens the post-mortem of the oldest game', pmOpen.sheet && pmOpen.on === 'chess' && pmOpen.id === 'syn9', JSON.stringify(pmOpen));
  await p.screenshot({ path: SHOTS + '/p3-debt-pm.png' });
  await p.click('#pmLater'); await p.waitForTimeout(150);
  check('Later closes the sheet and the plan is back', (await onScreens()).join(',') === 'plan' && !(await p.$eval('#pmSheet', (e) => e.classList.contains('on'))));

  // ---- a real training game from the Long game block (engine needed) ticks the block through the 'game' event ----
  await p.evaluate(() => window.__plan.setCtx('morning'));
  await p.click('#plToday [data-act="game"]'); await p.waitForTimeout(200);
  const g0 = await p.evaluate(() => ({ on: [...document.querySelectorAll('.screen.on')].map((e) => e.id).join(','), mode: window.__coach.game && window.__coach.game.mode, ctx: window.__coach.game && window.__coach.game.ctx, sheet: document.getElementById('ctxSheet').classList.contains('on') }));
  check('Long game starts a training game with today\'s context, no day sheet', g0.on === 'chess' && g0.mode === 'train' && g0.ctx === 'morning' && !g0.sheet, JSON.stringify(g0));
  const playing = await p.waitForFunction(() => window.__coach.state === 'playing', null, { timeout: 60000 }).then(() => true).catch(() => false);
  check('engine ready for the training game', playing);
  if (playing) {
    await p.evaluate(() => window.__coach.move('e2e4'));
    await p.waitForFunction(() => window.__coach.state === 'playing' && window.__coach.game.moves.length >= 2, null, { timeout: 60000 }).catch(() => {});
    await p.evaluate(() => window.__coach.resign()); await p.waitForTimeout(200);
    const g1 = await p.evaluate(() => ({ n: window.__coach.history.length, mode: window.__coach.history[0].mode, done: window.__plan.store.done, debt: window.__coach.pmDebt() }));
    check('the recorded training game ticks the long-game block', g1.n === 11 && g1.mode === 'train' && Object.values(g1.done)[0]['S0-B1'] === 1 && g1.debt === 11, JSON.stringify(g1.done));
    await p.evaluate(() => window.__coach.close()); await p.waitForTimeout(100);
    await p.evaluate(() => window.__hub.train()); await p.waitForTimeout(100);
    check('the plan shows 1 of 2 long games and 11 games owing', (await p.$eval('#plToday .pl-block[data-block="S0-B1"] .pl-count', (e) => e.textContent)) === '1 of 2 this week' && /11 games owe/.test(await txt('#plDebt')));
  } else { await p.evaluate(() => window.__coach.close()); await p.evaluate(() => window.__hub.train()); }

  // ---- resources and the folds ----
  await p.click('#plResList [data-res="S0:0"]'); await p.waitForTimeout(80);
  const rs = await p.evaluate(() => ({ on: document.querySelector('#plResList [data-res="S0:0"]').classList.contains('on'), store: window.__plan.store.resources, n: document.querySelectorAll('#plResList .pl-rrow').length,
    links: [...document.querySelectorAll('#plResList a.pl-link')].map((a) => a.target + ' ' + a.href), pit: document.getElementById('pl-pit').open, so: document.getElementById('pl-so').open, giants: document.getElementById('pl-giants').open }));
  check('resource checklist ticks and stores; links open in a new tab when online', rs.on && rs.store['S0:0'] === true && rs.n === 4 && rs.links.length === 4 && rs.links.every((l) => /^_blank https?:/.test(l)) && /lichess\.org/.test(rs.links[3]), rs.links[0]);
  check('standing orders, giants and pitfalls start collapsed', !rs.pit && !rs.so && !rs.giants);
  await p.click('#pl-pit summary'); await p.waitForTimeout(80);
  const pit = await p.evaluate(() => ({ open: document.getElementById('pl-pit').open, n: document.querySelectorAll('#pl-pit .pl-li').length, first: document.querySelector('#pl-pit .pl-li').textContent }));
  check('pitfalls unfold: eight, the differential', pit.open && pit.n === 8 && /Volume substitution/.test(pit.first), pit.first.slice(0, 60));
  await p.click('#plPearl .pl-grade'); await p.waitForTimeout(80);
  const lg = await p.evaluate(() => ({ legend: !!document.getElementById('plLegend'), n: document.querySelectorAll('#plLegend .pl-li').length, pit: document.getElementById('pl-pit').open, realism: /1600–1800 in 2–3 years/.test(document.getElementById('plMetrics').textContent) }));
  check('the grade badge shows the legend (A to D) and the open fold stays open', lg.legend && lg.n === 4 && lg.pit && lg.realism, JSON.stringify(lg));
  await p.screenshot({ path: SHOTS + '/p4-week-legend.png' });
  check('still no horizontal scroll with everything open', await noHScroll());

  // ---- Advance anyway ----
  await p.click('#plAdvAnyway'); await p.waitForTimeout(80);
  check('Advance anyway asks first', await p.evaluate(() => !!document.getElementById('plAdvYes') && !!document.getElementById('plAdvNo') && window.__plan.stage() === 'S0'));
  await p.click('#plAdvNo'); await p.waitForTimeout(80);
  check('Keep going changes nothing', await p.evaluate(() => !!document.getElementById('plAdvAnyway') && window.__plan.stage() === 'S0'));
  await p.click('#plAdvAnyway'); await p.waitForTimeout(80); await p.click('#plAdvYes'); await p.waitForTimeout(100);
  const a1 = await p.evaluate(() => ({ stage: window.__plan.stage(), adv: window.__plan.store.advanced, title: document.getElementById('plStageTitle').textContent, entered: (document.getElementById('plEntered') || {}).textContent, level: window.__coach.reviewLevel,
    blocks: [...document.querySelectorAll('#plToday .pl-block')].map((e) => e.dataset.block), raw: JSON.parse(localStorage.getItem('ghostlap-train-v1')).jesse.stage }));
  check('"Advance anyway" records the override and moves to Stage 1', a1.stage === 'S1' && a1.raw === 'S1' && a1.adv.length === 1 && a1.adv[0].from === 'S0' && a1.adv[0].to === 'S1' && a1.adv[0].override === true && /T/.test(a1.adv[0].date)
    && a1.title === 'Stage 1: Principles under pressure' && /by override/.test(a1.entered) && a1.level === 'narrow' && a1.blocks.join(',') === 'S1-B1,S1-B2,S1-B4', JSON.stringify(a1.adv));
  check('__plan.advance() without override refuses when the criteria are unmet', (await p.evaluate(() => window.__plan.advance())) === null && (await p.evaluate(() => window.__plan.stage())) === 'S1');
  await p.screenshot({ path: SHOTS + '/p5-stage1.png' });

  // ---- the Learn relabel (below Stage 3) ----
  await p.evaluate(() => window.__hub.learn()); await p.waitForTimeout(150);
  const ls = await p.evaluate(() => { const n = document.getElementById('learnStage'); return { on: [...document.querySelectorAll('.screen.on')].map((e) => e.id).join(','), text: n ? n.textContent : '', after: n && n.previousElementSibling && n.previousElementSibling.textContent }; });
  check('the Learn list labels the drills Stage 3 material', ls.on === 'learn' && /Stage 3 material/.test(ls.text) && /Openings are ideas to move 8-10 until Stage 3\. The idea paragraph and the plan are for now\./.test(ls.text) && ls.after === 'With White', ls.text.slice(0, 80));
  const opening = await p.evaluate(() => window.LESSONS.find((l) => l.kind === 'opening').id);
  await p.evaluate((id) => window.__learn.show(id), opening); await p.waitForTimeout(150);
  const lsn = await p.evaluate(() => { const n = document.getElementById('lDrillStage'); return { hidden: n.hidden, shown: n.getClientRects().length > 0, text: n.textContent, mem: !document.getElementById('lMem').disabled, cards: !document.getElementById('lCards').disabled, inDrills: n.parentElement.id === 'lDrills' }; });
  check('the lesson screen labels the drills, still usable', !lsn.hidden && lsn.shown && /^Stage 3 material\./.test(lsn.text) && lsn.mem && lsn.cards && lsn.inDrills, lsn.text.slice(0, 60));
  await p.screenshot({ path: SHOTS + '/p6-lesson-label.png' });
  await p.evaluate(() => window.__learn.show(window.LESSONS.find((l) => l.kind === 'basics').id)); await p.waitForTimeout(80);
  check('no label on a basics lesson', await p.evaluate(() => document.getElementById('lDrillStage').getClientRects().length === 0));
  await p.evaluate(() => window.__learn.close()); await p.waitForTimeout(80);

  // ---- Stage 3 raises the review level; per player; reload ----
  await p.evaluate(() => { window.__plan.advance(true); window.__plan.advance(true); });
  const s3 = await p.evaluate(() => ({ stage: window.__plan.stage(), level: window.__coach.reviewLevel, n: window.__plan.store.advanced.length }));
  check('reaching Stage 3 sets the review level to full', s3.stage === 'S3' && s3.level === 'full' && s3.n === 3, JSON.stringify(s3));
  await p.evaluate(() => window.__hub.learn()); await p.waitForTimeout(80);
  check('at Stage 3 the Learn list drops the label', await p.evaluate(() => !document.getElementById('learnStage')));
  await p.evaluate(() => window.__learn.close());
  await p.evaluate(() => window.__coach.setPlayer('j')); await p.waitForTimeout(80);
  await p.evaluate(() => window.__hub.train()); await p.waitForTimeout(100);
  const pj = await p.evaluate(() => ({ stage: window.__plan.stage(), level: window.__coach.reviewLevel, title: document.getElementById('plStageTitle').textContent, q: !!document.getElementById('plCtx'), debt: !!document.getElementById('plDebt'), who: window.__plan.player }));
  check('J has her own plan: Stage 0, narrow review, her own day question, no debt', pj.stage === 'S0' && pj.level === 'narrow' && pj.title === 'Stage 0: Floor, move safety' && pj.q && !pj.debt && pj.who === 'j', JSON.stringify(pj));
  await p.evaluate(() => window.__coach.setPlayer('jesse'));
  await p.reload(); await p.waitForFunction(() => window.__plan && window.__coach, null, { timeout: 8000 });
  await p.goto(base + '?game=train'); await p.waitForFunction(() => window.__plan && document.getElementById('plan').classList.contains('on'), null, { timeout: 8000 }).catch(() => {});
  const rl = await p.evaluate(() => ({ stage: window.__plan.stage(), on: [...document.querySelectorAll('.screen.on')].map((e) => e.id).join(','), level: window.__coach.reviewLevel, res: window.__plan.store.resources['S0:0'], adv: window.__plan.store.advanced.length, ctx: window.__plan.ctxToday(), title: document.getElementById('plStageTitle').textContent }));
  check('everything survives a reload; ?game=train deep-links to the plan', rl.stage === 'S3' && rl.on === 'plan' && rl.level === 'full' && rl.res === true && rl.adv === 3 && rl.ctx === 'morning' && /^Stage 3: Strong club/.test(rl.title), JSON.stringify(rl));
  await p.screenshot({ path: SHOTS + '/p7-stage3.png' });
  check('no horizontal scroll at Stage 3', await noHScroll());
  await p.click('#plBack'); await p.waitForTimeout(100);
  check('Back returns to the launcher', (await onScreens()).join(',') === 'hub');

  check('no page errors', errs.length === 0, errs.slice(0, 3).join(' | '));
  return done();
})().catch(async (e) => { console.error(e); check('test ran to the end', false, e.message); await done(); });

async function done() {
  if (b) await b.close(); srv.close();
  const f = results.filter((r) => r[0] === 'FAIL').length;
  console.log('\n' + (results.length - f) + '/' + results.length + ' passed' + (f ? ', ' + f + ' FAILED' : ''));
  process.exitCode = f ? 1 : 0;
}
