// Headless check of the three additions round the edges of the chess half, in Chromium at iPhone 13 width:
//   - Add a game (PGN): coach.js readPgn/importPgn and the sheet on the chess home;
//   - Safe or not (safety.js, safety-data.js) and its row and evidence line on the Train screen;
//   - Backup (hub.js): every ghostlap-* key out as one object and back in.
// node tools/extras-e2e.js   (screenshots in $SHOTS or /tmp/ghostlap-shots; PORT=8784 if 8774 is busy). No engine needed.
const { chromium, devices } = require('/opt/node-tools/node_modules/playwright');
const http = require('http'), fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..');
const SHOTS = process.env.SHOTS || '/tmp/ghostlap-shots'; fs.mkdirSync(SHOTS, { recursive: true });
const PORT = +process.env.PORT || 8774;
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.png': 'image/png', '.wasm': 'application/wasm', '.svg': 'image/svg+xml', '.webmanifest': 'application/manifest+json' };
const srv = http.createServer((q, r) => {
  let p = decodeURIComponent(new URL(q.url, 'http://x').pathname); if (p.endsWith('/')) p += 'index.html';
  const f = path.join(ROOT, p);
  if (!f.startsWith(ROOT) || !fs.existsSync(f)) { r.writeHead(404); return r.end('nf'); }
  r.writeHead(200, { 'content-type': TYPES[path.extname(f)] || 'application/octet-stream' }); fs.createReadStream(f).pipe(r);
}).listen(PORT);
const results = [];
const check = (name, ok, detail) => { results.push([ok ? 'PASS' : 'FAIL', name]); console.log((ok ? 'PASS ' : 'FAIL ') + name + (detail && !ok ? '  [' + detail + ']' : '')); };
// a lichess-style export: clock comments, a 15+10 control, Black (the learner) mated by the Scholar's mate
const PGN = `[Event "Rated Rapid game"]
[Site "https://lichess.org/abcdefgh"]
[Date "2026.11.01"]
[White "someone_else"]
[Black "jg_learner"]
[Result "1-0"]
[UTCDate "2026.11.01"]
[UTCTime "09:30:00"]
[WhiteElo "912"]
[BlackElo "880"]
[TimeControl "900+10"]
[Termination "Normal"]

1. e4 { [%clk 0:15:00] } 1... e5 { [%clk 0:15:00] } 2. Bc4 { [%clk 0:15:05] } 2... Nc6 { [%clk 0:14:40] } 3. Qh5 { [%clk 0:15:02] } 3... Nf6?? { A blunder. } { [%clk 0:11:20] } 4. Qxf7# { [%clk 0:15:08] } 1-0
`;
let b = null;
(async () => {
  b = await chromium.launch();
  const ctx = await b.newContext({ ...devices['iPhone 13'] });
  const p = await ctx.newPage();
  const errs = [];
  p.on('pageerror', (e) => errs.push('pageerror: ' + e.message));
  p.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errs.push('console: ' + m.text()); });
  await p.goto('http://localhost:' + PORT + '/');
  const up = await p.waitForFunction(() => window.__coach && window.__safety && window.__plan && window.__hub, null, { timeout: 8000 }).then(() => true).catch(() => false);
  check('coach, safety, plan and hub hooks present', up);
  if (!up) return done(b);

  // ---- add a game ----
  const r0 = await p.evaluate((t) => { const g = window.__coach.readPgn(t); return { w: g.white, bl: g.black, res: g.res, reason: g.reason, n: g.moves.length, times: g.times, date: g.date, last: g.sans[g.sans.length - 1] }; }, PGN);
  check('readPgn: names, ratings, result, mate, 7 plies', r0.w.name === 'someone_else' && r0.w.elo === 912 && r0.bl.elo === 880 && r0.res === 'w' && r0.reason === 'checkmate' && r0.n === 7 && r0.last === 'Qxf7#', JSON.stringify(r0));
  check('readPgn: think times from the clocks, increment added back (3...Nf6 took 210 s)', r0.times && r0.times[5] === 210000 && r0.times[3] === 30000 && r0.times[0] === 10000, JSON.stringify(r0.times));
  check('readPgn: the date from the tags', /^2026-11-01T09:30/.test(r0.date || ''), r0.date);
  const bad = await p.evaluate(() => [window.__coach.readPgn('hello there').error, window.__coach.readPgn('').error, window.__coach.readPgn('[Result "*"]\n\n1. e4 e5 *').error, window.__coach.readPgn('[FEN "8/8/8/8/8/8/8/K6k w - - 0 1"]\n\n1. Ka2 1/2-1/2').error]);
  check('readPgn: rubbish, nothing, an unfinished game and a set position are each refused in words', bad.every((e) => typeof e === 'string' && e.length > 10), JSON.stringify(bad));
  await p.evaluate(() => window.__hub.chess()); await p.waitForTimeout(300);
  await p.click('#importBtn');
  check('the sheet opens with the how-to and a dead Add button', await p.evaluate(() => document.getElementById('importSheet').classList.contains('on') && /lichess/.test(document.getElementById('importMsg').textContent) && document.getElementById('importGo').disabled));
  await p.fill('#importText', PGN);
  check('pasted: both sides offered, none picked, Add still dead', await p.evaluate(() => !document.getElementById('importSide').hidden && /someone_else \(912\)/.test(document.getElementById('importW').textContent) && /jg_learner \(880\)/.test(document.getElementById('importB').textContent)
    && !document.querySelector('#importSide .on') && document.getElementById('importGo').disabled && /Which side/.test(document.getElementById('importMsg').textContent)), await p.$eval('#importMsg', (e) => e.textContent));
  await p.click('#importB');
  await p.screenshot({ path: SHOTS + '/x1-import.png' });
  check('side picked: Add comes alive', await p.evaluate(() => document.getElementById('importB').classList.contains('on') && !document.getElementById('importGo').disabled));
  await p.click('#importGo'); await p.waitForTimeout(200);
  const g1 = await p.evaluate(() => { const g = window.__coach.history[0]; return { sheet: document.getElementById('pmSheet').classList.contains('on'), imp: document.getElementById('importSheet').classList.contains('on'), g: g && { src: g.src, opp: g.opp, you: g.you, result: g.result, reason: g.reason, elo: g.elo, clean: g.clean, mode: g.mode, times: g.times, pm: g.pm, n: g.moves.length } }; });
  check('added: the post-mortem sheet comes first, as for any game', g1.sheet && !g1.imp, JSON.stringify(g1));
  check('the entry: Black, a loss by checkmate, clean, their rating, only your think times', g1.g && g1.g.src === 'pgn' && g1.g.opp === 'someone_else' && g1.g.you === 'b' && g1.g.result === 'loss' && g1.g.reason === 'checkmate' && g1.g.elo === 912 && g1.g.clean === true
    && g1.g.times[5] === 210000 && g1.g.times[0] === null && g1.g.times[6] === null && g1.g.pm === null, JSON.stringify(g1.g));
  await p.click('#pmLater'); await p.waitForTimeout(150);
  const row = await p.$eval('#chessHist .hcard small', (e) => e.textContent);
  check('history row: vs the opponent, post-mortem due', /vs someone_else/.test(row) && /post-mortem due/.test(row) && /checkmate/.test(row), row);
  const dup = await p.evaluate((t) => window.__coach.importPgn(t, 'b').error, PGN);
  check('the same game twice is refused', /already here/.test(dup || ''), dup);
  const side = await p.evaluate((t) => window.__coach.importPgn(t.replace('3... Nf6??', '3... g6').replace('4. Qxf7#', '4. Qf3').replace('"1-0"', '"1/2-1/2"').replace(/ 1-0\n$/, ' 1/2-1/2\n')).entry, PGN);
  check('next time the side is known from the remembered name', side && side.you === 'b' && side.result === 'draw', JSON.stringify(side && { you: side.you, r: side.result }));
  const out = await p.evaluate(() => window.__coach.pgnOf(window.__coach.history.find((g) => g.reason === 'checkmate')));
  check('shared again as PGN it names the opponent, not an engine', /\[White "someone_else"\]/.test(out) && /\[Black "Jesse"\]/.test(out) && !/Engine/.test(out), out.slice(0, 200));

  // ---- safe or not ----
  const n = await p.evaluate(() => window.__safety.count);
  check('safety set loaded', n >= 300, String(n));
  const data = await p.evaluate(() => String(window.SAFETY).split('\n').map((r) => r.split('|')));
  const legal = await p.evaluate((rows) => rows.every((f) => { if (f.length !== 6) return false; const mv = (u) => ({ from: u.slice(0, 2), to: u.slice(2, 4), promotion: u[4] });
    const a = new Chess(f[1]); if (!a.move(mv(f[4]))) return false; const c = new Chess(f[1]); if (!c.move(mv(f[2]))) return false; return f[3].split(' ').every((u) => !!c.move(mv(u))) && f[2] !== f[4]; }), data);
  check('every row replays: the blunder, its whole punishment, and a different safe move', legal);
  await p.evaluate(() => window.__hub.train()); await p.waitForTimeout(300);
  check('Train: the Safe or not row and the evidence under the safety criterion', await p.evaluate(() => !!document.querySelector('#plSafetyGo') && /Not tried yet/.test(document.getElementById('plSafety').textContent)
    && /Safe or not drill: Not tried yet/.test((document.getElementById('plSafetyEv') || {}).textContent || '')));
  await p.click('#plSafetyGo'); await p.waitForTimeout(200);
  check('the drill opens over the plan: a move, an arrow, two buttons', await p.evaluate(() => document.getElementById('safety').classList.contains('on') && !document.getElementById('plan').classList.contains('on')
    && /: safe\?$/.test(document.getElementById('sfQ').textContent) && document.querySelectorAll('#sfBoard .arrow line').length === 1 && !document.getElementById('sfCall').hidden && document.getElementById('sfNext').hidden));
  await p.screenshot({ path: SHOTS + '/x2-safety-ask.png' });
  await p.evaluate(() => window.__safety.close()); await p.waitForTimeout(100);
  check('Back returns to the plan, nothing logged', await p.evaluate(() => document.getElementById('plan').classList.contains('on') && window.__safety.stats().n === 0));
  // a fixed session: unsafe, unsafe, unsafe, safe, safe
  await p.evaluate(() => window.__safety.open({ count: 5, unsafe: [true, true, true, false, false] }));
  let s = await p.evaluate(() => window.__safety.state);
  check('card 1 is the blunder', s.item.unsafe && s.phase === 'ask');
  await p.click('#sfUnsafe');
  check('Not safe: the move is played and you are asked to show it', await p.evaluate(() => window.__safety.state.phase === 'show' && /Show it/.test(document.getElementById('sfQ').textContent) && document.querySelectorAll('#sfBoard .sq.last').length === 2));
  await p.click('#sfBoard [data-sq="' + s.item.expect.slice(0, 2) + '"]'); await p.click('#sfBoard [data-sq="' + s.item.expect.slice(2, 4) + '"]');
  s = await p.evaluate(() => window.__safety.state);
  check('their move shown by taps: right, with the line and a red arrow', s.phase === 'done' && s.item.right === true && await p.evaluate(() => /Right: not safe/.test(document.getElementById('sfQ').textContent) && /After /.test(document.getElementById('sfNote').textContent) && document.querySelectorAll('#sfBoard .arrow line.red').length === 1), JSON.stringify(s.item));
  await p.screenshot({ path: SHOTS + '/x3-safety-right.png' });
  await p.click('#sfNext');
  await p.click('#sfSafe');   // card 2: a blunder called safe
  check('a blunder called safe: wrong, the line is shown', await p.evaluate(() => { const s = window.__safety.state; return s.phase === 'done' && s.item.right === false && /^Not safe$/.test(document.getElementById('sfQ').textContent) && /You called it safe/.test(document.getElementById('sfNote').textContent); }));
  await p.click('#sfNext');
  // card 3: called unsafe, but the wrong punishment (any legal move that is not theirs and not mate)
  const wrong = await p.evaluate(() => { const s = window.__safety.state; window.__safety.call(true); const mv = (u) => ({ from: u.slice(0, 2), to: u.slice(2, 4), promotion: u[4] });
    const row = String(window.SAFETY).split('\n').map((r) => r.split('|')).find((f) => f[0] === s.item.id), c = new Chess(row[1]); c.move(mv(row[2]));
    const m = c.moves({ verbose: true }).find((m) => m.from + m.to !== s.item.expect.slice(0, 4) && !/#/.test(m.san)); return window.__safety.answer(m.from, m.to); });
  check('right call, wrong reason: a miss', wrong && wrong.right === false && /wrong reason/.test(await p.$eval('#sfQ', (e) => e.textContent)), JSON.stringify(wrong));
  await p.click('#sfNext');
  s = await p.evaluate(() => window.__safety.state);
  check('card 4 is the safe twin', !s.item.unsafe);
  await p.click('#sfSafe');
  check('a safe move called safe: right', await p.evaluate(() => window.__safety.state.item.right === true && /Right: safe/.test(document.getElementById('sfQ').textContent) && document.querySelectorAll('#sfBoard .arrow line').length === 0));
  await p.click('#sfNext');
  const ghost = await p.evaluate(() => { const s = window.__safety.state; window.__safety.call(true); const mv = (u) => ({ from: u.slice(0, 2), to: u.slice(2, 4), promotion: u[4] });
    const row = String(window.SAFETY).split('\n').map((r) => r.split('|')).find((f) => f[0] === s.item.id), c = new Chess(row[1]); c.move(mv(row[4])); const m = c.moves({ verbose: true })[0]; return window.__safety.answer(m.from, m.to); });
  check('a safe move called unsafe: whatever is shown, wrong', ghost && ghost.right === false && /It was safe/.test(await p.$eval('#sfQ', (e) => e.textContent)), JSON.stringify(ghost));
  await p.click('#sfNext'); await p.waitForTimeout(100);
  const sum = await p.evaluate(() => ({ t: document.getElementById('sfSumT').textContent, r: document.getElementById('sfRight').textContent, m: document.getElementById('sfMissed').textContent, lines: [...document.querySelectorAll('#sfLines .sf-line')].map((e) => e.textContent), st: window.__safety.stats() }));
  check('summary: 2 right of 5, one danger missed, a line for each kind of miss', sum.t === '2 right of 5' && sum.r === '2/5' && sum.m === '1' && sum.lines.length === 3 && /called safe/.test(sum.lines[0]) && /wrong reason/.test(sum.lines[1]) && /Seeing ghosts/.test(sum.lines[2]), JSON.stringify(sum));
  check('stats: 5 calls logged, no 30-call figure yet', sum.st.n === 5 && sum.st.sessions === 1 && sum.st.acc30 === null, JSON.stringify(sum.st));
  await p.screenshot({ path: SHOTS + '/x4-safety-summary.png', fullPage: true });
  // thirty right calls give the plan a figure
  await p.evaluate(() => { window.__safety.close(); for (let k = 0; k < 3; k++) { window.__safety.open({ count: 10, unsafe: Array(10).fill(false) }); for (let i = 0; i < 10; i++) { window.__safety.call(false); window.__safety.next(); } window.__safety.close(); } });
  await p.evaluate(() => window.__hub.train()); await p.waitForTimeout(200);
  const ev = await p.$eval('#plSafetyEv', (e) => e.textContent);
  check('after 30 calls the plan shows accuracy and the median time', /Last 30 calls: 100% right, median \d+ s\./.test(ev), ev);

  // ---- the Stage 0 lessons ----
  check('basics hook present, six lessons', await p.evaluate(() => !!window.__basics && window.__basics.list().length === 6));
  await p.evaluate(() => window.__hub.learn()); await p.waitForTimeout(200);
  check('Learn lists Move safety first, six cards, none ticked', await p.evaluate(() => { const l = document.getElementById('learnList'); return l.firstElementChild.id === 'learnFloorH' && document.querySelectorAll('#learnFloor .lcard').length === 6 && !document.querySelector('#learnFloor .bs-tick'); }));
  await p.click('#learnFloor [data-floor=loose]'); await p.waitForTimeout(200);
  check('a lesson opens on a show step: text, marked squares, Next', await p.evaluate(() => document.getElementById('basics').classList.contains('on') && !document.getElementById('learn').classList.contains('on')
    && document.getElementById('bsTitle').textContent === 'UNDEFENDED PIECES' && document.querySelectorAll('#bsBoard .sq.bs-mark').length === 2 && document.getElementById('bsGo').textContent === 'Next' && document.getElementById('bsPos').textContent === '1 of 5'));
  await p.screenshot({ path: SHOTS + '/x6-lesson-show.png' });
  await p.click('#bsGo');
  // tap step, answered right by real taps
  await p.click('#bsBoard [data-sq=c2]'); await p.click('#bsBoard [data-sq=c5]'); await p.click('#bsBoard [data-sq=a1]'); await p.click('#bsBoard [data-sq=a1]'); await p.click('#bsBoard [data-sq=e4]');
  check('tap step: taps toggle, an empty square does nothing, the button says Check', await p.evaluate(() => { const s = window.__basics.state.step; return s.t === 'tap' && s.taps.sort().join() === 'c2,c5' && document.querySelectorAll('#bsBoard .sq.bs-pick').length === 2 && document.getElementById('bsGo').textContent === 'Check'; }));
  await p.click('#bsGo');
  check('checked right: green squares, the why, Next', await p.evaluate(() => window.__basics.state.step.right === true && document.querySelectorAll('#bsBoard .sq.bs-ok').length === 2 && document.getElementById('bsQ').textContent === 'Right' && /Both bishops/.test(document.getElementById('bsNote').textContent) && document.getElementById('bsGo').textContent === 'Next'));
  await p.click('#bsGo');
  // tap step, answered wrong: one found, two missed, one that was not one
  await p.click('#bsBoard [data-sq=f4]'); await p.click('#bsBoard [data-sq=c8]'); await p.click('#bsGo');
  check('checked wrong: green, amber and red, and the answer explained', await p.evaluate(() => window.__basics.state.step.right === false && document.querySelectorAll('#bsBoard .sq.bs-ok').length === 1 && document.querySelectorAll('#bsBoard .sq.bs-miss').length === 2 && document.querySelectorAll('#bsBoard .sq.bs-bad').length === 1 && document.getElementById('bsQ').textContent === 'Not quite'));
  await p.screenshot({ path: SHOTS + '/x7-lesson-tap.png' });
  await p.click('#bsGo');
  // move step: a wrong move first (still asked), then the right one by taps
  const w1 = await p.evaluate(() => window.__basics.move('g8', 'h8'));
  check('move step: a wrong move says so and asks again', w1 && w1.right === false && !w1.shown && await p.evaluate(() => window.__basics.state.step.phase === 'ask' && /^Kh8: not that one/.test(document.getElementById('bsNote').textContent) && document.getElementById('bsGo').hidden));
  await p.click('#bsBoard [data-sq=e4]'); await p.click('#bsBoard [data-sq=d2]');
  check('the right move by taps ends the step, but not as right first time', await p.evaluate(() => { const s = window.__basics.state; return s.step.phase === 'done' && s.step.right === false && document.getElementById('bsQ').textContent === 'Got there' && /Nxd2/.test(document.getElementById('bsNote').textContent); }));
  await p.click('#bsGo');
  const r5 = await p.evaluate(() => window.__basics.move('a7', 'a8'));
  check('last step right first time', r5 && r5.right === true && (await p.$eval('#bsGo', (e) => e.textContent)) === 'Finish');
  await p.click('#bsGo'); await p.waitForTimeout(100);
  const end = await p.evaluate(() => ({ t: document.getElementById('bsSumT').textContent, end: document.getElementById('bsEnd').textContent, pearl: document.getElementById('bsPearl').textContent, next: document.getElementById('bsNextGo').textContent, done: window.__basics.done('loose') }));
  check('summary: 2 of 4 right first time, the takeaway, the pearl, a way on', end.t === '2 of 4 right first time' && /whose pieces are loose/.test(end.end) && /^The pearl: /.test(end.pearl) && end.next === 'Tactics' && end.done && end.done.n === 1 && end.done.best === 2 && end.done.of === 4, JSON.stringify(end));
  await p.screenshot({ path: SHOTS + '/x8-lesson-end.png' });
  await p.click('#bsDone'); await p.waitForTimeout(150);
  check('back on Learn the lesson is ticked with its best', await p.evaluate(() => document.getElementById('learn').classList.contains('on') && document.querySelectorAll('#learnFloor .bs-tick').length === 1 && /Best 2\/4 first time/.test(document.querySelector('#learnFloor [data-floor=loose] .b').textContent)));
  // every other lesson plays through by its own answers: pick, mate-by-any-mating-move, three misses showing the move
  const all = await p.evaluate(() => { const out = {}; for (const l of window.FLOOR_LESSONS) { if (l.id === 'loose') continue; window.__basics.open(l.id);
    for (const s of l.steps) { if (s.t === 'tap') { for (const q of s.answer) window.__basics.tap(q); window.__basics.check(); } else if (s.t === 'pick') window.__basics.pick(s.answer); else if (s.t === 'move') window.__basics.move(s.answer[0].slice(0, 2), s.answer[0].slice(2, 4)); window.__basics.next(); }
    const st = window.__basics.state; out[l.id] = st.ended && st.first === st.asked ? 'ok' : JSON.stringify(st); } return out; });
  check('the other five lessons play through, every answer accepted', Object.values(all).every((v) => v === 'ok') && Object.keys(all).length === 5, JSON.stringify(all));
  const three = await p.evaluate(() => { window.__basics.open('mates'); window.__basics.next(); const a = window.__basics.move('c1', 'c7'), note = document.getElementById('bsNote').textContent; window.__basics.move('c1', 'c2'); const c = window.__basics.move('c1', 'c3');
    return { a, note, c, phase: window.__basics.state.step.phase, arrow: document.querySelectorAll('#bsBoard .arrow line').length, q: document.getElementById('bsQ').textContent }; });
  check('the stalemate move gets its own line; the third miss shows the move as an arrow', three.a.right === false && /^Qc7: Stalemate/.test(three.note) && three.c.shown === true && three.phase === 'done' && three.arrow === 1 && three.q === 'Not quite', JSON.stringify(three));
  await p.evaluate(() => { window.__basics.close(); window.__basics.open('cct'); const l = window.FLOOR_LESSONS.find((x) => x.id === 'cct'); for (const s of l.steps) { if (s.t === 'tap') { for (const q of s.answer) window.__basics.tap(q); window.__basics.check(); } else if (s.t === 'pick') window.__basics.pick(s.answer); else if (s.t === 'move') window.__basics.move(s.answer[0].slice(0, 2), s.answer[0].slice(2, 4)); window.__basics.next(); } });
  await p.click('#bsNextGo'); await p.waitForTimeout(150);
  check('the safety lesson hands on to Safe or not', await p.evaluate(() => document.getElementById('safety').classList.contains('on') && !document.getElementById('basics').classList.contains('on')));
  await p.evaluate(() => window.__safety.close());
  await p.evaluate(() => window.__hub.train()); await p.waitForTimeout(200);
  await p.click('#plLessons'); await p.waitForTimeout(150);
  check('Train: the lesson block has a Lessons button that opens Learn', await p.evaluate(() => document.getElementById('learn').classList.contains('on') && !document.getElementById('plan').classList.contains('on')));

  // ---- backup ----
  await p.evaluate(() => window.__hub.show());
  check('the launcher has the Backup pill, never saved', await p.evaluate(() => !!document.getElementById('backupBtn') && /never saved/.test(document.getElementById('backupWhen').textContent)));
  const bk = await p.evaluate(() => window.__hub.backupData());
  check('the backup holds the chess save and the safety log, and is marked as ours', bk.app === 'ghostlap-roma' && typeof bk.data['ghostlap-chess-v1'] === 'string' && typeof bk.data['ghostlap-safety-v1'] === 'string' && !('ghostlap-backup-v1' in bk.data), Object.keys(bk.data).join(','));
  await p.click('#backupBtn');
  const [dl] = await Promise.all([p.waitForEvent('download', { timeout: 5000 }).catch(() => null), p.click('#backupSave')]);
  check('Save a backup file downloads ghostlap-backup-<date>.json', !!dl && /^ghostlap-backup-\d{4}-\d\d-\d\d\.json$/.test(dl.suggestedFilename()), dl ? dl.suggestedFilename() : 'no download');
  check('and the launcher remembers when', /last saved/.test(await p.$eval('#backupWhen', (e) => e.textContent)));
  check('a file that is not ours is refused', (await p.evaluate(() => window.__hub.backupRestore('{"hello":1}', true))) === 'bad' && /not a Ghostlap backup/.test(await p.$eval('#backupMsg', (e) => e.textContent)));
  await p.screenshot({ path: SHOTS + '/x5-backup.png' });
  await p.evaluate(() => { for (const k of Object.keys(localStorage)) if (k.startsWith('ghostlap-')) localStorage.removeItem(k); });
  await p.reload(); await p.waitForFunction(() => window.__coach && window.__hub, null, { timeout: 8000 });
  check('wiped: no games', (await p.evaluate(() => window.__coach.history.length)) === 0);
  await Promise.all([p.waitForNavigation({ timeout: 8000 }), p.evaluate((t) => { window.__hub.backupRestore(t, true); }, JSON.stringify(bk))]);
  await p.waitForFunction(() => window.__coach && window.__safety, null, { timeout: 8000 });
  const back = await p.evaluate(() => ({ games: window.__coach.history.length, opp: window.__coach.history.map((g) => g.opp).join(','), calls: window.__safety.stats().n }));
  check('restored: both games and the 35 calls are back', back.games === 2 && /someone_else/.test(back.opp) && back.calls === 35, JSON.stringify(back));
  check('no page errors', errs.length === 0, errs.slice(0, 3).join(' | '));
  return done(b);
})().catch(async (e) => { console.error(e); check('test ran to the end', false, e.message); if (b) await b.close(); srv.close(); process.exitCode = 1; });

async function done(b) {
  await b.close(); srv.close();
  const f = results.filter((r) => r[0] === 'FAIL').length;
  console.log('\n' + (results.length - f) + '/' + results.length + ' passed' + (f ? ', ' + f + ' FAILED' : ''));
  process.exitCode = f ? 1 : 0;
}
