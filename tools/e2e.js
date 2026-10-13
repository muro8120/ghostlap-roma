const { chromium, devices } = require('/opt/node-tools/node_modules/playwright');
const http = require('http'), fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..');
const SHOTS = process.env.SHOTS || '/tmp/ghostlap-shots'; fs.mkdirSync(SHOTS, { recursive: true });
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.png': 'image/png', '.svg': 'image/svg+xml', '.wasm': 'application/wasm', '.webmanifest': 'application/manifest+json' };
const srv = http.createServer((q, r) => {
  let p = decodeURIComponent(new URL(q.url, 'http://x').pathname); if (p.endsWith('/')) p += 'index.html';
  if (p === '/rome.js' && process.env.ROME_JS) { r.writeHead(200, { 'content-type': 'text/javascript' }); return fs.createReadStream(process.env.ROME_JS).pipe(r); }
  const f = path.join(ROOT, p);
  if (false && !f.startsWith(ROOT) || !fs.existsSync(f)) { r.writeHead(404); return r.end('nf'); }
  r.writeHead(200, { 'content-type': TYPES[path.extname(f)] || 'application/octet-stream' }); fs.createReadStream(f).pipe(r);
}).listen(8765);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const results = [];
const check = (name, ok, extra) => { results.push([ok ? 'PASS' : 'FAIL', name, extra || '']); };
// physics checks (node): soft walls and turning circles on the real map
if (process.env.ROME_JS) {
  const GL = require(path.join(ROOT, 'core.js'));
  global.window = {}; eval(fs.readFileSync(process.env.ROME_JS, 'utf8'));
  const route = (id) => { const r = window.ROME.routes.find((q) => q.id === id), pts = []; for (let i = 0; i < r.pts.length; i += 2) pts.push([r.pts[i], r.pts[i + 1]]); return { r, T: GL.buildTrack({ ...r, pts, names: r.names }) }; };
  const { r, T } = route('r-vaticano');
  const R = GL.newRace(T, GL.CARS[1]);
  while (R.car.s < r.marks[1].s - 600) GL.stepRace(R, GL.botInput(T, R.car, { digital: true, line: 0.7 }));
  let flips = 0, last = 0;
  for (let k = 0; k < 360; k++) { const a = R.car.a; GL.stepRace(R, { left: true, right: false }); const da = R.car.a - a; if (Math.abs(da) > 1e-4 && Math.sign(da) !== Math.sign(last)) flips++; last = da; }
  check('wall scrape is smooth (no wobble)', flips <= 3 && R.car.speed > 15, `flips=${flips} speed=${R.car.speed.toFixed(0)}`);
  check('Vatican Museums has a turning circle', T.zones.length >= 1, 'zones=' + T.zones.length);
  // drive into the circle, stop, reverse, turn round, drive out: the route must count it
  const R2 = GL.newRace(T, GL.CARS[0]); const z = T.zones[0];
  while (!R2.car.zone) GL.stepRace(R2, GL.botInput(T, R2.car, { digital: true, line: 0.7 }));
  for (let k = 0; k < 120; k++) GL.stepRace(R2, { left: true, right: true });
  for (let k = 0; k < 600 && R2.car.zdone !== z; k++) GL.stepRace(R2, { left: true, right: false });
  check('turning round inside the circle counts', R2.car.zdone === z && R2.wrong < 1.2, `zdone=${R2.car.zdone === z} idx=${R2.car.idx} iOut=${z.iOut}`);
  for (const id of ['r-vaticano', 'r-popolo', 'r-pantheon', 'r-picks', 'r-prati']) {
    const { T: Tr } = route(id);
    const times = GL.CARS.map((c) => GL.simulate(Tr, { digital: true, line: 0.7 }, 300, c).time);
    check(id + ': every car finishes', times.every((t) => t), times.map((t) => (t ? t.toFixed(0) : 'DNF')).join(' '));
  }
}

(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ ...devices['iPhone 13'] });
  const p = await ctx.newPage();
  const errs = [];
  p.on('pageerror', (e) => errs.push('pageerror: ' + e.message));
  p.on('console', (m) => { if (m.type() === 'error') errs.push('console: ' + m.text()); });
  const base = 'http://localhost:8765/';
  await ctx.addInitScript(() => { if (!sessionStorage.getItem('seeded')) { sessionStorage.setItem('seeded', '1');
    localStorage.setItem('ghostlap-roma-v1', JSON.stringify({ car: 'cinque', sound: false, tracks: { circo: { best: 40 } } })); } });
  await p.goto(base + '?bot=1&fast=6&game=drive');
  await p.waitForTimeout(800);
  await p.screenshot({ path: SHOTS + '/01-menu.png' });
  await p.waitForFunction(() => document.getElementById('offline').textContent.includes('Ready offline'), null, { timeout: 15000 }).then(() => check('offline badge says ready', true)).catch(async () => check('offline badge says ready', false, await p.$eval('#offline', (e) => e.textContent)));
  await p.evaluate(() => document.getElementById('menu').scrollTo(0, 1400));
  await p.waitForTimeout(200);
  await p.screenshot({ path: SHOTS + '/02-menu-scrolled.png' });
  const mig = await p.evaluate(() => ({ v1: localStorage.getItem('ghostlap-roma-v1'), car: window.__ghostlap.save.car, tracks: Object.keys(window.__ghostlap.save.tracks).length }));
  check('old save: car kept, times reset', mig.v1 === null && mig.car === 'cinque' && mig.tracks === 0, JSON.stringify(mig));
  await p.evaluate(() => { document.getElementById('carNext').click(); });
  // locked cards
  const locked = await p.$$eval('#trackList .card.locked', (e) => e.length);
  check('3 tracks locked at start', locked === 3, 'locked=' + locked);
  // sound on (exercises the Web Audio path), race circo with bot
  await p.click('#soundBtn');
  check('sound toggles on', (await p.$eval('#soundBtn', (e) => e.textContent)) === 'Sound: on');
  await p.click('#trackList .card >> nth=0');
  await p.waitForTimeout(600);
  await p.screenshot({ path: SHOTS + '/03-countdown.png' });
  await p.waitForFunction(() => window.__ghostlap.state === 'race', null, { timeout: 5000 });
  await p.waitForTimeout(1500);
  await p.screenshot({ path: SHOTS + '/04-race.png' });
  await p.waitForSelector('#finish.on', { timeout: 60000 });
  await p.waitForTimeout(300);
  await p.screenshot({ path: SHOTS + '/05-finish.png' });
  const s1 = await p.evaluate(() => JSON.parse(localStorage.getItem('ghostlap-roma-v2')));
  check('circo best saved', !!(s1 && s1.tracks.circo && s1.tracks.circo.best > 30), s1 && s1.tracks.circo && s1.tracks.circo.best.toFixed(2));
  check('ghost recorded', s1.tracks.circo.rec.length > 1000, 'samples=' + s1.tracks.circo.rec.length / 3);
  // race again: ghost visible
  await p.click('#againBtn');
  await p.waitForFunction(() => window.__ghostlap.state === 'race', null, { timeout: 5000 });
  await p.waitForTimeout(2500);
  await p.screenshot({ path: SHOTS + '/06-race-ghost.png' });
  const delta = await p.waitForFunction(() => document.getElementById('delta').textContent.length > 0, null, { timeout: 30000 }).then(() => true).catch(() => false);
  check('delta vs ghost shown', delta, await p.$eval('#delta', (e) => e.textContent));
  // pause / resume
  await p.click('#pauseBtn');
  await p.waitForTimeout(200);
  const ps = await p.evaluate(() => window.__ghostlap.state);
  check('pause works', ps === 'paused', ps);
  await p.screenshot({ path: SHOTS + '/07-paused.png' });
  const t0 = await p.evaluate(() => window.__ghostlap.race.t); await p.waitForTimeout(500);
  const t1 = await p.evaluate(() => window.__ghostlap.race.t);
  check('clock frozen while paused', t0 === t1);
  await p.click('#quitBtn');
  await p.waitForTimeout(300);
  const locked2 = await p.$$eval('#trackList .card.locked', (e) => e.length);
  check('colosseo unlocked after bronze', locked2 === 2, 'locked=' + locked2);
  // every track completes with the bot; grab a mid-race shot each
  for (const [i, id] of [[1, 'colosseo'], [2, 'tevere'], [3, 'appia']]) {
    await p.evaluate((k) => { const s = window.__ghostlap.save; }, i);
    await p.evaluate((k) => window.__ghostlap.startRace(k), i);
    await p.waitForFunction(() => window.__ghostlap.state === 'race', null, { timeout: 5000 });
    await p.waitForTimeout(2200);
    await p.screenshot({ path: SHOTS + `/1${i}-${id}.png` });
    const done = await p.waitForSelector('#finish.on', { timeout: 90000 }).then(() => true).catch(() => false);
    const t = await p.evaluate((k) => { const s = JSON.parse(localStorage.getItem('ghostlap-roma-v2')); return s.tracks[k] && s.tracks[k].best; }, id);
    check(id + ' completes', done && t > 0, t && t.toFixed(2));
    await p.click('#menuBtn');
  }
  // real-street routes (only when a rome.js is served)
  if (process.env.ROME_JS) {
    const cityIdx = await p.evaluate(() => [...Array(20).keys()].filter((i) => window.GL.TRACKS[i] && window.GL.TRACKS[i].city));
    check('5 Rome routes registered', cityIdx.length === 5, JSON.stringify(cityIdx));
    for (const i of cityIdx) {
      await p.evaluate((k) => window.__ghostlap.startRace(k), i);
      await p.waitForFunction(() => window.__ghostlap.state === 'race', null, { timeout: 5000 });
      await p.waitForTimeout(1200);
      if (i === cityIdx[0]) {
        await p.screenshot({ path: SHOTS + '/29-city-race.png' });
        const v = await p.evaluate(() => window.__ghostlap.view);
        check('follow camera in Rome: car points up, sits low', v.mode === 'follow' && Math.abs(v.a + Math.PI / 2) < 0.6 && v.y > 0.5 && v.y < 0.75, JSON.stringify(v));
      }
      const nav = await p.$eval('#navSt', (e) => e.textContent);
      const signs = await p.evaluate(() => window.__ghostlap.signs);
      const navOn = await p.$eval('#nav', (e) => getComputedStyle(e).display !== 'none');
      const banners = [];
      const poll = setInterval(async () => { try { const b = await p.$eval('#banner', (e) => e.classList.contains('show') ? e.textContent : ''); if (b && !banners.includes(b)) banners.push(b); } catch (e) {} }, 150);
      const done = await p.waitForSelector('#finish.on', { timeout: 120000 }).then(() => true).catch(() => false);
      clearInterval(poll);
      const via = await p.$eval('.via', (e) => e.textContent).catch(() => '');
      const id = await p.evaluate((k) => window.GL.TRACKS[k].id, i);
      check(id + ' completes, shows street + stops + signs + route list', done && navOn && nav.length > 2 && signs >= 1 && via.includes('MIN ON FOOT') && banners.length >= 2,
        `nav="${nav}" signs=${signs} banners=${JSON.stringify(banners)}`);
      if (i === cityIdx[0]) await p.screenshot({ path: SHOTS + '/30-city-finish.png' });
      await p.click('#menuBtn');
    }
    await p.evaluate(() => document.getElementById('menu').scrollTo(0, 560));
    await p.screenshot({ path: SHOTS + '/31-menu-rome.png' });
  }
  // car picker cycles and persists
  await p.click('#carNext'); await p.waitForTimeout(100);
  const car = await p.evaluate(() => JSON.parse(localStorage.getItem('ghostlap-roma-v2')).car);
  check('car choice persists', car === 'modena', car);
  for (let k = 0; k < 5; k++) { await p.screenshot({ path: SHOTS + `/2${k}-car.png`, clip: { x: 0, y: 100, width: 390, height: 330 } }); await p.click('#carNext'); await p.waitForTimeout(80); }
  await p.evaluate(() => document.getElementById('menu').scrollTo(0, 0));
  await p.screenshot({ path: SHOTS + '/08-menu-after.png', fullPage: false });
  await p.evaluate(() => document.getElementById('menu').scrollTo(0, 600));
  await p.screenshot({ path: SHOTS + '/09-menu-after-scrolled.png', fullPage: false });

  // manual touch steering without the bot
  const p2 = await ctx.newPage();
  p2.on('pageerror', (e) => errs.push('p2 pageerror: ' + e.message));
  await p2.goto(base);
  await p2.waitForTimeout(500);
  await p2.evaluate(() => window.__ghostlap.startRace(0));
  await p2.waitForFunction(() => window.__ghostlap.state === 'race', null, { timeout: 6000 });
  const v0 = await p2.evaluate(() => window.__ghostlap.view);
  check('follow camera is the default: car heading is up the screen', v0.mode === 'follow' && Math.abs(v0.a + Math.PI / 2) < 0.05 && v0.y > 0.5 && v0.y < 0.7 && Math.abs(v0.x - 0.5) < 0.05, JSON.stringify(v0));
  const a0 = await p2.evaluate(() => window.__ghostlap.race.car.a);
  await p2.evaluate(() => { const c = document.getElementById('view'); c.dispatchEvent(new PointerEvent('pointerdown', { pointerId: 7, clientX: 60, clientY: 700, bubbles: true, pointerType: 'touch' })); });
  await p2.waitForTimeout(700);
  const a1 = await p2.evaluate(() => window.__ghostlap.race.car.a);
  await p2.evaluate(() => { window.dispatchEvent(new PointerEvent('pointerup', { pointerId: 7, bubbles: true, pointerType: 'touch' })); });
  check('holding left half turns car left', a1 < a0 - 0.2, `a0=${a0.toFixed(2)} a1=${a1.toFixed(2)}`);
  const vl = await p2.evaluate(() => window.__ghostlap.view);
  check('follow camera turns with the car', Math.abs(vl.a + Math.PI / 2) < 0.5 && Math.abs(vl.r - v0.r) > 0.2, JSON.stringify(vl));
  // both halves = brake
  const sp0 = await p2.evaluate(() => window.__ghostlap.race.car.speed);
  await p2.evaluate(() => { const c = document.getElementById('view');
    c.dispatchEvent(new PointerEvent('pointerdown', { pointerId: 8, clientX: 60, clientY: 700, bubbles: true, pointerType: 'touch' }));
    c.dispatchEvent(new PointerEvent('pointerdown', { pointerId: 9, clientX: 330, clientY: 700, bubbles: true, pointerType: 'touch' })); });
  await p2.waitForTimeout(400);
  const v1 = await p2.evaluate(() => window.__ghostlap.race.car.speed);
  check('both thumbs brake', v1 < sp0 - 50, `v0=${sp0.toFixed(0)} v1=${v1.toFixed(0)}`);
  // keep holding both = reverse (after stopping), with a white reverse light and the R badge
  await p2.waitForTimeout(1300);
  const rv = await p2.evaluate(() => { const c = window.__ghostlap.race.car; return { rev: !!c.rev, vF: c.vx * Math.cos(c.a) + c.vy * Math.sin(c.a), badge: document.getElementById('gear').classList.contains('on') }; });
  check('holding both reverses', rv.rev && rv.vF < -40 && rv.badge, JSON.stringify(rv));
  const a2 = await p2.evaluate(() => window.__ghostlap.race.car.a);
  await p2.evaluate(() => window.dispatchEvent(new PointerEvent('pointerup', { pointerId: 9, bubbles: true, pointerType: 'touch' })));
  await p2.waitForTimeout(600);
  const r2 = await p2.evaluate(() => { const c = window.__ghostlap.race.car; return { rev: !!c.rev, a: c.a }; });
  check('one thumb steers while reversing', r2.rev && Math.abs(r2.a - a2) > 0.15, JSON.stringify({ a2, ...r2 }));
  await p2.evaluate(() => window.dispatchEvent(new PointerEvent('pointerup', { pointerId: 8, bubbles: true, pointerType: 'touch' })));
  await p2.waitForTimeout(900);
  const r3 = await p2.evaluate(() => { const c = window.__ghostlap.race.car; return { rev: !!c.rev, vF: c.vx * Math.cos(c.a) + c.vy * Math.sin(c.a) }; });
  check('letting go drives forward again', !r3.rev && r3.vF > 20, JSON.stringify(r3));
  // hidden page pauses
  await p2.evaluate(() => { Object.defineProperty(document, 'hidden', { value: true, configurable: true }); document.dispatchEvent(new Event('visibilitychange')); });
  check('backgrounding pauses', (await p2.evaluate(() => window.__ghostlap.state)) === 'paused');
  await p2.close();

  // camera setting: North-up persists across a reload; switching back from the pause sheet snaps on resume
  const p4 = await ctx.newPage();
  p4.on('pageerror', (e) => errs.push('p4 pageerror: ' + e.message));
  await p4.goto(base + '?game=drive');
  await p4.waitForTimeout(500);
  await p4.click('#camBtn');
  await p4.reload();
  await p4.waitForTimeout(500);
  const cm = await p4.evaluate(() => ({ save: JSON.parse(localStorage.getItem('ghostlap-roma-v2')).cam, btn: document.getElementById('camBtn').textContent }));
  await p4.evaluate(() => window.__ghostlap.startRace(0));
  await p4.waitForFunction(() => window.__ghostlap.state === 'race', null, { timeout: 6000 });
  const vn = await p4.evaluate(() => ({ ...window.__ghostlap.view, a0: window.__ghostlap.race.car.a }));
  check('North-up persists across reload', cm.save === 'north' && cm.btn === 'Camera: North-up' && vn.mode === 'north' && vn.r === 0 && Math.abs(vn.y - 0.5) < 0.1, JSON.stringify({ ...cm, ...vn }));
  await p4.click('#pauseBtn');
  await p4.click('#camBtn2');
  await p4.click('#resumeBtn');
  await p4.waitForTimeout(100);
  const vf = await p4.evaluate(() => window.__ghostlap.view);
  check('Follow from the pause sheet snaps on resume', vf.mode === 'follow' && Math.abs(vf.a + Math.PI / 2) < 0.1, JSON.stringify(vf));
  await p4.close();

  // offline reload
  await ctx.setOffline(true);
  const p3 = await ctx.newPage();
  p3.on('pageerror', (e) => errs.push('p3 pageerror: ' + e.message));
  const ok = await p3.goto(base).then((r) => r && r.ok()).catch((e) => 'ERR ' + e.message);
  await p3.waitForTimeout(800);
  const hubOn = await p3.$eval('#hub', (e) => e.classList.contains('on')).catch(() => false);   // the launcher shows first
  const cards = await p3.$$eval('.card', (e) => e.length).catch(() => 0);                          // 4 circuits, plus 5 routes when rome.js is present
  check('loads in airplane mode', ok === true && hubOn && cards >= 4, `ok=${ok} hub=${hubOn} cards=${cards}`);
  const chessOff = await p3.evaluate(() => Promise.all(['coach.js', 'engine.js', 'openings.js', 'vendor/stockfish-19-lite-single.wasm', 'vendor/pieces/wK.svg'].map((a) => caches.match(a).then((r) => !!r)))).catch(() => []);
  check('chess files cached for offline', chessOff.length === 5 && chessOff.every(Boolean), JSON.stringify(chessOff));
  await p3.screenshot({ path: SHOTS + '/10-offline.png' });
  check('no JS errors', errs.length === 0, errs.slice(0, 5).join(' | '));
  await b.close(); srv.close();
  for (const r of results) console.log(r.join('  '));
})().catch((e) => { console.error(e); srv.close(); process.exit(1); });
