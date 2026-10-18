const { chromium, devices } = require('/opt/node-tools/node_modules/playwright');
const http = require('http'), fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..');
const SHOTS = process.env.SHOTS || '/tmp/ghostlap-shots'; fs.mkdirSync(SHOTS, { recursive: true });
const PORT = +process.env.PORT || 8765;
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.png': 'image/png', '.svg': 'image/svg+xml', '.wasm': 'application/wasm', '.webmanifest': 'application/manifest+json' };
const srv = http.createServer((q, r) => {
  let p = decodeURIComponent(new URL(q.url, 'http://x').pathname); if (p.endsWith('/')) p += 'index.html';
  if (p === '/rome.js' && process.env.ROME_JS) { r.writeHead(200, { 'content-type': 'text/javascript' }); return fs.createReadStream(process.env.ROME_JS).pipe(r); }
  const f = path.join(ROOT, p);
  if (false && !f.startsWith(ROOT) || !fs.existsSync(f)) { r.writeHead(404); return r.end('nf'); }
  r.writeHead(200, { 'content-type': TYPES[path.extname(f)] || 'application/octet-stream' }); fs.createReadStream(f).pipe(r);
}).listen(PORT);
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
  // The chase camera needs WebGL: headless Chromium falls back to SwiftShader (software) for it, which this flag allows
  // without a warning. Forcing --use-angle=swiftshader also moves the 2D canvas onto SwiftShader and makes Follow 5x slower.
  const b = await chromium.launch({ args: ['--enable-unsafe-swiftshader'] });
  const ctx = await b.newContext({ ...devices['iPhone 13'] });
  const p = await ctx.newPage();
  const errs = [];
  p.on('pageerror', (e) => errs.push('pageerror: ' + e.message));
  p.on('console', (m) => { if (m.type() === 'error') errs.push('console: ' + m.text()); });
  const base = 'http://localhost:' + PORT + '/';
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
  const q0 = await p.evaluate(() => ({ q: window.__ghostlap.save.quality, fps: window.__ghostlap.save.fps, btn: document.getElementById('qBtn').textContent }));
  check('quality defaults to Auto, fps readout off', q0.q === 'auto' && q0.fps === false && q0.btn === 'Quality: Auto', JSON.stringify(q0));
  // SwiftShader draws far below 45 fps, so Auto would step down in every race here: pin High (Auto has its own test below, with fake frame times)
  await p.evaluate(() => window.__ghostlap.setQuality('high'));
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
  const vc = await p.evaluate(() => ({ ...window.__ghostlap.view, info: window.__ghostlap.chase }));
  check('chase is the default camera: circuit in 3D, car in the lower middle', vc.mode === 'chase' && vc.chase && Math.abs(vc.x - 0.5) < 0.15 && vc.y > 0.55 && vc.y < 0.85 && vc.info && vc.info.calls > 3 && !vc.info.error, JSON.stringify(vc));
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
      if (i === cityIdx[2]) await p.evaluate(() => window.__ghostlap.setCam('bonnet')); // the third route on the bonnet camera
      await p.evaluate((k) => window.__ghostlap.startRace(k), i);
      await p.waitForFunction(() => window.__ghostlap.state === 'race', null, { timeout: 5000 });
      await p.waitForTimeout(1200);
      if (i === cityIdx[0]) { // chase is the default: the 3D view, car ahead of the camera in the lower middle
        await p.waitForTimeout(1500);
        await p.screenshot({ path: SHOTS + '/29-city-race-chase.png' });
        const v = await p.evaluate(() => ({ ...window.__ghostlap.view, on: document.getElementById('view3d').classList.contains('on') }));
        check('chase camera in Rome: 3D view on, car in the lower middle, pointing away', v.mode === 'chase' && v.chase && v.on && Math.abs(v.x - 0.5) < 0.15 && v.y > 0.55 && v.y < 0.85 && Math.abs(v.a + Math.PI / 2) < 0.8, JSON.stringify(v));
        const info = await p.evaluate(() => window.__ghostlap.chase);
        check('chase renderer numbers are sane (Rome), within the budget of 40 draw calls', info && !info.error && info.calls >= 5 && info.calls <= 40 && info.triangles > 5000 && info.triangles < 600000 && info.buildings > 200 && info.revision >= 160 && info.refl > 0, JSON.stringify(info));
        console.log('chase renderer, Rome ' + JSON.stringify(info));
      }
      if (i === cityIdx[1]) {
        await p.evaluate(() => window.__ghostlap.setCam('follow'));
        await p.waitForTimeout(300);
        await p.screenshot({ path: SHOTS + '/29-city-race-follow.png' });
        const v = await p.evaluate(() => ({ ...window.__ghostlap.view, on: document.getElementById('view3d').classList.contains('on') }));
        check('follow camera in Rome: car points up, sits low', v.mode === 'follow' && !v.chase && !v.on && Math.abs(v.a + Math.PI / 2) < 0.6 && v.y > 0.5 && v.y < 0.75, JSON.stringify(v));
      }
      if (i === cityIdx[2]) {
        await p.waitForTimeout(2500); await p.screenshot({ path: SHOTS + '/29-city-race-bonnet.png' });
        const info = await p.evaluate(() => window.__ghostlap.chase);
        check('bonnet camera in Rome: 3D, within the budget of 40 draw calls', info && info.view === 'bonnet' && !info.error && info.calls >= 5 && info.calls <= 40, JSON.stringify({ view: info.view, calls: info.calls, triangles: info.triangles }));
      }
      const nav = await p.$eval('#navSt', (e) => e.textContent);
      const signs = await p.evaluate(() => window.__ghostlap.signs);
      const navOn = await p.$eval('#nav', (e) => getComputedStyle(e).display !== 'none');
      const banners = [];
      const poll = setInterval(async () => { try { const b = await p.$eval('#banner', (e) => e.classList.contains('show') ? e.textContent : ''); if (b && !banners.includes(b)) banners.push(b); } catch (e) {} }, 150);
      const labs = []; // chase mode: the last frame's label layout, sampled through the run
      const lpoll = setInterval(async () => { try { const L = await p.evaluate(() => window.__ghostlap.labels); if (L) labs.push(L); } catch (e) {} }, 300);
      const sboxes = []; // Follow: the direction signs' boxes, sampled through the run
      const spoll = i === cityIdx[1] && setInterval(async () => { try { const S = await p.evaluate(() => window.__ghostlap.signBoxes); if (S && S.length) sboxes.push(S); } catch (e) {} }, 100);
      const bsamp = []; // Bonnet: the direction signs against the bonnet's rect, sampled through the run
      const bpoll = i === cityIdx[2] && setInterval(async () => { try { const S = await p.evaluate(() => ({ s: window.__ghostlap.signBoxes, r: window.Chase.carRect() })); if (S.s && S.s.length && S.r) bsamp.push(S); } catch (e) {} }, 120);
      const done = await p.waitForSelector('#finish.on', { timeout: 120000 }).then(() => true).catch(() => false);
      clearInterval(poll); clearInterval(lpoll); if (spoll) clearInterval(spoll); if (bpoll) clearInterval(bpoll);
      if (bpoll) {
        const bad = []; // (2 px of slack: the rect is read a moment after the frame the signs were laid out in, and the body pitches)
        for (const S of bsamp) for (const a of S.s) if (a.box[3] > S.r[1] + 2 && a.box[1] < S.r[3] && a.box[0] < S.r[2] && a.box[2] > S.r[0]) bad.push(a.t + ' ' + JSON.stringify([a.box, S.r.map(Math.round)]));
        check('bonnet camera in Rome: no direction sign on the bonnet', bsamp.length > 20 && !bad.length, `samples=${bsamp.length} ${[...new Set(bad)].slice(0, 3).join(' | ')}`);
      }
      if (spoll) {
        const hit = (a, b) => a[0] < b[2] && a[2] > b[0] && a[1] < b[3] && a[3] > b[1], bad = [];
        for (const S of sboxes) S.forEach((a, k) => { for (const o of S.slice(k + 1)) if (hit(a.box, o.box)) bad.push(a.t + ' / ' + o.t + ' ' + JSON.stringify([a.box, o.box])); });
        check('follow camera in Rome: direction signs never overlap (corners included)', sboxes.length > 20 && !bad.length, `samples=${sboxes.length} ${[...new Set(bad)].slice(0, 3).join(' | ')}`);
      }
      const via = await p.$eval('.via', (e) => e.textContent).catch(() => '');
      const id = await p.evaluate((k) => window.GL.TRACKS[k].id, i);
      check(id + ' completes, shows street + stops + signs + route list', done && navOn && nav.length > 2 && signs >= 1 && via.includes('MIN ON FOOT') && banners.length >= 2,
        `nav="${nav}" signs=${signs} banners=${JSON.stringify(banners)}`);
      if (labs.length) {
        const hit = (a, b) => a[0] < b[2] && a[2] > b[0] && a[1] < b[3] && a[3] > b[1], w = (a) => Math.atan2(Math.sin(a), Math.cos(a)), bad = [];
        let most = 0, streets = 0;
        for (const L of labs) {
          const B = L.labels; most = Math.max(most, B.length); streets += B.some((a) => a.kind === 'street');
          if (B.length > 6) bad.push('count ' + B.length);
          B.forEach((a, k) => {
            if (hit(a.box, L.car)) bad.push('on the car: ' + a.t);
            if (a.t.trim() === L.nav) bad.push('current street repeated: ' + a.t);
            if (L.hud.some((r) => hit(a.box, r))) bad.push('under the HUD: ' + a.t);
            for (const b of B.slice(k + 1)) if (hit(a.box, b.box)) bad.push('overlap: ' + a.t + ' / ' + b.t);
          });
          L.signs.forEach((sg, k) => { for (const o of L.signs.slice(k + 1)) if (hit(sg.box, o.box)) bad.push('signs overlap: ' + sg.t + ' / ' + o.t); });
          for (const sg of L.signs) {
            if (L.hud.some((r) => r[1] < 300 && hit(sg.box, r))) bad.push('sign over the nav box or minimap: ' + sg.t);
            // the arrow is the bearing seen from the camera: it matches the north-up minimap's bearing from the car's heading up to the camera's lag
            if (Math.abs(w(sg.ang + Math.PI / 2 - (sg.bear - L.carA))) > Math.abs(w(L.yaw - L.carA)) + 0.02) bad.push('sign arrow off: ' + sg.t);
          }
        }
        check(id + ' chase labels: at most 6, no overlaps, off the car and the HUD, current street not repeated, sign arrows true', !bad.length && most >= 2 && streets > 0,
          `samples=${labs.length} most=${most} withStreet=${streets} ${[...new Set(bad)].slice(0, 4).join(' | ')}`);
      }
      if (i === cityIdx[0]) await p.screenshot({ path: SHOTS + '/30-city-finish.png' });
      if (i === cityIdx[1] || i === cityIdx[2]) await p.evaluate(() => window.__ghostlap.setCam('chase'));
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
  await p2.waitForFunction(() => window.__ghostlap.state === 'race', null, { timeout: 20000 });
  await p2.waitForFunction(() => window.__ghostlap.view.chase, null, { timeout: 8000 }).catch(() => {});
  const vch = await p2.evaluate(() => window.__ghostlap.view);
  check('chase camera is the default: straight behind the car, low in the middle', vch.mode === 'chase' && vch.chase && Math.abs(vch.a + Math.PI / 2) < 0.1 && vch.y > 0.55 && vch.y < 0.8 && Math.abs(vch.x - 0.5) < 0.05, JSON.stringify(vch));
  // the 3D car: a real body within its triangle budget, front wheels that steer with the thumb, a body that leans in the
  // corner and wheels that roll; both thumbs light the brake lights, and reversing the reverse light
  const down = (id, x) => p2.evaluate(([id, x]) => document.getElementById('view').dispatchEvent(new PointerEvent('pointerdown', { pointerId: id, clientX: x, clientY: 700, bubbles: true, pointerType: 'touch' })), [id, x]);
  const up = (id) => p2.evaluate((id) => window.dispatchEvent(new PointerEvent('pointerup', { pointerId: id, bubbles: true, pointerType: 'touch' })), id);
  await p2.waitForTimeout(600);
  const k0 = await p2.evaluate(() => window.__ghostlap.chase.car);
  await down(21, 60); await p2.waitForTimeout(500);
  const k1 = await p2.evaluate(() => window.__ghostlap.chase.car);
  await down(22, 330); await p2.waitForTimeout(400);
  const k2 = await p2.evaluate(() => window.__ghostlap.chase.car);
  await p2.waitForTimeout(1500);
  const k3 = await p2.evaluate(() => ({ ...window.__ghostlap.chase.car, rev: window.__ghostlap.chase.car.rev, isRev: !!window.__ghostlap.race.car.rev }));
  await up(21); await up(22); await p2.waitForTimeout(300);
  check('chase car: under 800 triangles, steers, leans, rolls, brake and reverse lights', k0.tris > 200 && k0.tris < 800 && k1.steer > 0.2 && Math.abs(k1.roll) > 0.003 && k1.spin !== k0.spin &&
    k0.tail === 'a31717' && k2.tail === 'ff3a30' && (!k3.isRev || k3.rev === 'f4f6ff'), JSON.stringify({ k0, k1, k2, k3 }));
  // a hard stop from speed down the first straight leaves tyre marks and smoke (High); a new race starts with a clean road
  await p2.evaluate(() => window.__ghostlap.startRace(0));
  // (the game clock runs slow when the headless frame rate drops under load, hence the long wait)
  await p2.waitForFunction(() => window.__ghostlap.state === 'race' && window.__ghostlap.race.car.speed > 200, null, { timeout: 60000 });
  await down(23, 60); await down(24, 330);
  await p2.waitForFunction(() => window.__ghostlap.chase.marks > 0 && window.__ghostlap.chase.smoke > 0, null, { timeout: 3000 }).catch(() => {});
  const k5 = await p2.evaluate(() => ({ marks: window.__ghostlap.chase.marks, smoke: window.__ghostlap.chase.smoke }));
  await up(23); await up(24);
  await p2.evaluate(() => window.__ghostlap.startRace(0));
  await p2.waitForFunction(() => window.__ghostlap.state === 'count' || window.__ghostlap.state === 'race', null, { timeout: 20000 });
  await p2.waitForTimeout(300);
  const k4 = await p2.evaluate(() => ({ marks: window.__ghostlap.chase.marks, smoke: window.__ghostlap.chase.smoke }));
  check('tyre marks and smoke on a hard stop, cleared for the next race', k5.marks > 0 && k5.smoke > 0 && k4.marks === 0 && k4.smoke === 0, JSON.stringify({ braking: k5, next: k4 }));
  await p2.evaluate(() => { window.__ghostlap.setCam('follow'); window.__ghostlap.startRace(0); });
  await p2.waitForFunction(() => window.__ghostlap.state === 'race', null, { timeout: 20000 });
  const v0 = await p2.evaluate(() => window.__ghostlap.view);
  check('follow camera: car heading is up the screen', v0.mode === 'follow' && Math.abs(v0.a + Math.PI / 2) < 0.05 && v0.y > 0.5 && v0.y < 0.7 && Math.abs(v0.x - 0.5) < 0.05, JSON.stringify(v0));
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
  await p2.evaluate(() => window.__ghostlap.setCam('chase'));
  await p2.close();

  // camera setting: North-up persists across a reload; switching back from the pause sheet snaps on resume
  const p4 = await ctx.newPage();
  p4.on('pageerror', (e) => errs.push('p4 pageerror: ' + e.message));
  await p4.goto(base + '?game=drive');
  await p4.waitForTimeout(500);
  // the garage: the selected car turning in 3D on its plinth; the picture changes with the car and keeps moving
  const gsig = () => p4.evaluate(() => { // the picture's average colour and how much of it is not the panel's colour
    const c = document.getElementById('carView'), d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
    let r = 0, g = 0, b = 0, n = 0, ink = 0;
    for (let i = 0; i < d.length; i += 16) { r += d[i]; g += d[i + 1]; b += d[i + 2]; n++; if (Math.abs(d[i] - 21) + Math.abs(d[i + 1] - 25) + Math.abs(d[i + 2] - 34) > 30) ink++; }
    return { r: Math.round(r / n), g: Math.round(g / n), b: Math.round(b / n), ink: +(ink / n).toFixed(3), w: c.width, ...window.__ghostlap.garage };
  });
  await p4.waitForFunction(() => window.__ghostlap.garage.mode === '3d' && window.__ghostlap.garage.gl > 3, null, { timeout: 15000 }).catch(() => {});
  const ga = await gsig(); await p4.waitForTimeout(700); const gb = await gsig();
  await p4.click('#carNext'); await p4.waitForTimeout(700); const gc = await gsig();
  await p4.click('#carPrev'); await p4.waitForTimeout(300);
  await p4.screenshot({ path: SHOTS + '/60-garage.png', clip: await p4.$eval('.garage', (e) => { const r = e.getBoundingClientRect(); return { x: r.x, y: r.y, width: r.width, height: r.height }; }) });
  check('garage: the car turns in 3D on its plinth, and the picture changes with the car', ga.mode === '3d' && ga.ink > 0.08 && ga.ink < 0.7 && gb.gl > ga.gl &&
    (ga.r !== gb.r || ga.g !== gb.g || ga.b !== gb.b) && Math.abs(gc.r - ga.r) + Math.abs(gc.g - ga.g) + Math.abs(gc.b - ga.b) > 4, JSON.stringify({ ga, gb, gc }));
  // the Camera pill cycles Chase, Bonnet, Follow, North-up and back, and each choice is saved
  const cyc = [];
  for (let k = 0; k < 5; k++) { await p4.click('#camBtn'); cyc.push(await p4.evaluate(() => [document.getElementById('camBtn').textContent.slice(8), JSON.parse(localStorage.getItem('ghostlap-roma-v2')).cam])); }
  await p4.reload(); await p4.waitForTimeout(400);
  const cyr = await p4.evaluate(() => [document.getElementById('camBtn').textContent, window.__ghostlap.save.cam]);
  check('Camera pill cycles Chase, Bonnet, Follow, North-up and saves each (Bonnet survives a reload)', JSON.stringify(cyc) === JSON.stringify([['Bonnet', 'bonnet'], ['Follow', 'follow'], ['North-up', 'north'], ['Chase', 'chase'], ['Bonnet', 'bonnet']]) &&
    cyr[0] === 'Camera: Bonnet' && cyr[1] === 'bonnet', JSON.stringify({ cyc, cyr }));
  // an old save on Follow (the old default) moves to Chase once; choosing Follow again afterwards sticks
  await p4.evaluate(() => { const s = JSON.parse(localStorage.getItem('ghostlap-roma-v2')); s.cam = 'follow'; delete s.camV; localStorage.setItem('ghostlap-roma-v2', JSON.stringify(s)); });
  await p4.reload(); await p4.waitForTimeout(400);
  const mg1 = await p4.evaluate(() => ({ cam: window.__ghostlap.save.cam, btn: document.getElementById('camBtn').textContent }));
  await p4.click('#camBtn'); await p4.click('#camBtn');
  await p4.reload(); await p4.waitForTimeout(400);
  const mg2 = await p4.evaluate(() => ({ cam: window.__ghostlap.save.cam, btn: document.getElementById('camBtn').textContent }));
  check('old Follow save moves to Chase once, then Follow sticks', mg1.cam === 'chase' && mg1.btn === 'Camera: Chase' && mg2.cam === 'follow' && mg2.btn === 'Camera: Follow', JSON.stringify({ mg1, mg2 }));
  await p4.click('#camBtn');
  await p4.reload();
  await p4.waitForTimeout(500);
  const cm = await p4.evaluate(() => ({ save: JSON.parse(localStorage.getItem('ghostlap-roma-v2')).cam, btn: document.getElementById('camBtn').textContent }));
  await p4.evaluate(() => window.__ghostlap.startRace(0));
  await p4.waitForFunction(() => window.__ghostlap.state === 'race', null, { timeout: 20000 });
  const vn = await p4.evaluate(() => ({ ...window.__ghostlap.view, a0: window.__ghostlap.race.car.a }));
  check('North-up persists across reload', cm.save === 'north' && cm.btn === 'Camera: North-up' && vn.mode === 'north' && vn.r === 0 && Math.abs(vn.y - 0.5) < 0.1, JSON.stringify({ ...cm, ...vn }));
  const gr0 = await p4.evaluate(() => window.__ghostlap.garage); await p4.waitForTimeout(700); const gr1 = await p4.evaluate(() => window.__ghostlap.garage);
  check('garage turntable stops during a race', gr1.frames === gr0.frames && gr1.gl === gr0.gl, JSON.stringify({ gr0, gr1 }));
  await p4.click('#pauseBtn');
  await p4.click('#camBtn2');
  await p4.click('#resumeBtn');
  await p4.waitForFunction(() => window.__ghostlap.view.chase, null, { timeout: 8000 }).catch(() => {});
  const vcs = await p4.evaluate(() => window.__ghostlap.view);
  check('Chase from the pause sheet snaps on resume', vcs.mode === 'chase' && vcs.chase && Math.abs(vcs.a + Math.PI / 2) < 0.15, JSON.stringify(vcs));
  await p4.click('#pauseBtn');
  await p4.click('#camBtn2');
  await p4.click('#resumeBtn');
  await p4.waitForFunction(() => window.Chase.view === 'bonnet' && window.__ghostlap.view.chase, null, { timeout: 8000 }).catch(() => {});
  await p4.waitForTimeout(300);
  // Bonnet: the eye is on the car, so the car's own position is behind or below the screen, and the road 160 units
  // ahead is on screen in the lower half; the camera's yaw is the car's heading, so signs and labels point true
  const vb = await p4.evaluate(() => {
    const c = window.__ghostlap.race.car, T = window.__ghostlap.race.T, i = (c.idx + Math.round(160 / T.ds)) % T.N;
    return { mode: window.__ghostlap.save.cam, view: window.Chase.view, me: window.Chase.toScreen(c.x, c.y, 0), ahead: window.Chase.toScreen(T.xs[i], T.ys[i], 0),
      W: innerWidth, H: innerHeight, dyaw: Math.atan2(Math.sin(window.Chase.yaw - c.a), Math.cos(window.Chase.yaw - c.a)), rect: window.Chase.carRect(), calls: window.__ghostlap.chase.calls };
  });
  await p4.screenshot({ path: SHOTS + '/50-bonnet-circuit.png' });
  check('Bonnet from the pause sheet: car off the bottom, road ahead on screen, yaw is the heading, bonnet at the bottom', vb.mode === 'bonnet' && vb.view === 'bonnet' && (!vb.me || vb.me[1] > vb.H) &&
    vb.ahead && vb.ahead[0] > 0 && vb.ahead[0] < vb.W && vb.ahead[1] > vb.H * 0.4 && vb.ahead[1] < vb.H * 0.95 && Math.abs(vb.dyaw) < 0.01 && vb.rect && vb.rect[1] > vb.H * 0.75 && vb.rect[3] === vb.H && vb.calls <= 40, JSON.stringify(vb));
  await p4.click('#pauseBtn');
  await p4.click('#camBtn2');
  await p4.click('#resumeBtn');
  await p4.waitForTimeout(100);
  const vf = await p4.evaluate(() => window.__ghostlap.view);
  check('Follow from the pause sheet snaps on resume', vf.mode === 'follow' && Math.abs(vf.a + Math.PI / 2) < 0.1, JSON.stringify(vf));
  await p4.close();

  // the fps readout and the Quality setting
  const p5 = await ctx.newPage();
  p5.on('pageerror', (e) => errs.push('p5 pageerror: ' + e.message));
  await p5.goto(base + '?game=drive&bot=1');
  await p5.waitForTimeout(500);
  await p5.evaluate(() => { window.__ghostlap.fakeMs = 16; window.__ghostlap.setCam('chase'); }); // a steady 60 fps, so nothing steps down on its own
  await p5.evaluate(() => window.__ghostlap.startRace(0));
  await p5.waitForFunction(() => window.__ghostlap.state === 'race', null, { timeout: 20000 });
  const f0 = await p5.evaluate(() => window.__ghostlap.fps.shown);
  await p5.click('#pauseBtn'); await p5.click('#fpsBtn'); await p5.click('#resumeBtn');
  await p5.waitForTimeout(800);
  const f1 = await p5.evaluate(() => ({ ...window.__ghostlap.fps, saved: JSON.parse(localStorage.getItem('ghostlap-roma-v2')).fps }));
  await p5.screenshot({ path: SHOTS + '/40-fps-readout.png' });
  await p5.screenshot({ path: SHOTS + '/41-fps-readout-zoom.png', clip: { x: 0, y: 0, width: 200, height: 110 } });
  check('Show fps: readout appears with fps, scale and draw calls, and is saved', !f0 && f1.shown && f1.saved === true && /^\d+ fps · 2\.0x · \d+ calls$/.test(f1.text), JSON.stringify({ f0, ...f1 }));
  await p5.reload(); await p5.waitForTimeout(400);
  await p5.evaluate(() => { window.__ghostlap.fakeMs = 16; window.__ghostlap.setCam('follow'); window.__ghostlap.startRace(0); });
  await p5.waitForFunction(() => window.__ghostlap.state === 'race', null, { timeout: 20000 });
  await p5.waitForTimeout(600);
  const f2 = await p5.evaluate(() => ({ ...window.__ghostlap.fps, btn: document.getElementById('fpsBtn').classList.contains('on') }));
  await p5.click('#pauseBtn'); await p5.click('#fpsBtn'); await p5.click('#resumeBtn');
  const f3 = await p5.evaluate(() => ({ shown: window.__ghostlap.fps.shown, saved: JSON.parse(localStorage.getItem('ghostlap-roma-v2')).fps }));
  check('fps readout persists across reload (Follow: no draw calls), and hides again', f2.shown && f2.btn && /^\d+ fps · 2\.0x$/.test(f2.text) && !f3.shown && f3.saved === false, JSON.stringify({ f2, f3 }));
  // the pill cycles Auto, Low, High and is saved
  await p5.evaluate(() => { window.__ghostlap.toMenu(); window.__ghostlap.setCam('chase'); });
  const qs = [];
  for (let k = 0; k < 3; k++) { await p5.click('#qBtn'); qs.push(await p5.evaluate(() => [document.getElementById('qBtn').textContent, document.getElementById('qBtn2').textContent, JSON.parse(localStorage.getItem('ghostlap-roma-v2')).quality])); }
  await p5.reload(); await p5.waitForTimeout(400);
  const qr = await p5.evaluate(() => [document.getElementById('qBtn').textContent, window.__ghostlap.save.quality]);
  check('Quality pill cycles Auto, Low, High and persists', JSON.stringify(qs) === JSON.stringify([['Quality: Auto', 'Quality: Auto', 'auto'], ['Quality: Low', 'Quality: Low', 'low'], ['Quality: High', 'Quality: High', 'high']]) && qr[0] === 'Quality: High' && qr[1] === 'high', JSON.stringify({ qs, qr }));
  // Low: fewer buildings (Rome) and lights, pixel ratio 1; switched from the pause sheet, the rest applies by the next race at the latest
  const qTrack = await p5.evaluate(() => { const k = window.GL.TRACKS.findIndex((t) => t.city); return k >= 0 ? k : 0; });
  await p5.evaluate((k) => { window.__ghostlap.fakeMs = 16; window.__ghostlap.startRace(k); }, qTrack);
  await p5.waitForFunction(() => window.__ghostlap.state === 'race', null, { timeout: 20000 });
  await p5.waitForTimeout(500);
  const qH = await p5.evaluate(() => window.__ghostlap.chase);
  await p5.click('#pauseBtn'); await p5.click('#qBtn2'); await p5.click('#qBtn2');
  const qP = await p5.evaluate(() => ({ ...window.__ghostlap.chase, btn: document.getElementById('qBtn2').textContent }));
  await p5.click('#restartBtn');
  await p5.waitForFunction(() => window.__ghostlap.state === 'race', null, { timeout: 20000 });
  await p5.waitForTimeout(500);
  const qL = await p5.evaluate(() => ({ ...window.__ghostlap.chase, dprCap: window.__ghostlap.fps.dprCap }));
  const fewer = qTrack ? qL.buildings < qH.buildings * 0.85 && qL.parked < qH.parked : true;
  check('Quality Low: fewer buildings and lights, pixel ratio 1, live from the pause sheet', qH.quality === 'high' && qP.btn === 'Quality: Low' && qP.quality === 'low' && qP.dpr === 1 && qP.lights === 2 &&
    qL.built === 'low' && fewer && qL.lights < qH.lights && qL.dpr < qH.dpr && qL.dpr === 1 && qL.dprCap === 1 && !qL.error && qH.calls <= 40 && qL.calls <= 36 && qL.refl === 0 && qL.smoke === 0,
    JSON.stringify({ high: [qH.buildings, qH.parked, qH.lights, qH.dpr, qH.calls, qH.buildMs], paused: [qP.built, qP.lights, qP.dpr], low: [qL.buildings, qL.parked, qL.lights, qL.dpr, qL.calls, qL.buildMs] }));
  await p5.screenshot({ path: SHOTS + '/42-quality-low.png' });
  // Auto: under 45 fps for 3 s of a race steps down to Low for the session, with a one-time notice; never back up
  await p5.evaluate(() => { window.__ghostlap.toMenu(); window.__ghostlap.setQuality('auto'); window.__ghostlap.save.qToast = false; window.__ghostlap.fakeMs = 16; window.__ghostlap.startRace(0); });
  await p5.waitForFunction(() => window.__ghostlap.state === 'race', null, { timeout: 20000 });
  await p5.waitForTimeout(1200);
  const u0 = await p5.evaluate(() => ({ ...window.__ghostlap.fps, q: window.__ghostlap.chase.quality }));
  const toasts = [], tpoll = setInterval(async () => { try { const b = await p5.$eval('#banner', (e) => e.classList.contains('show') ? e.textContent : ''); if (b) toasts.push(b); } catch (e) {} }, 100);
  await p5.evaluate(() => { window.__ghostlap.fakeMs = 40; }); // 25 fps
  const stepped = await p5.waitForFunction(() => window.__ghostlap.fps.autoLow, null, { timeout: 30000 }).then(() => true).catch(() => false);
  await p5.waitForTimeout(300);
  await p5.screenshot({ path: SHOTS + '/43-auto-toast.png' });
  const u1 = await p5.evaluate(() => ({ ...window.__ghostlap.fps, q: window.__ghostlap.chase.quality, dpr: window.__ghostlap.chase.dpr, save: window.__ghostlap.save.quality, toast: window.__ghostlap.save.qToast }));
  await p5.evaluate(() => { window.__ghostlap.fakeMs = 8; }); // 125 fps, and a second more of it
  await p5.waitForFunction(() => window.__ghostlap.fps.fps > 100, null, { timeout: 30000 }).catch(() => {});
  await p5.waitForTimeout(1000);
  const u2 = await p5.evaluate(() => ({ ...window.__ghostlap.fps, q: window.__ghostlap.chase.quality }));
  clearInterval(tpoll);
  const notice = 'Lowered graphics to keep it smooth';
  check('Auto steps down to Low under 45 fps, says so once, never steps back up', !u0.low && u0.q === 'high' && stepped && u1.low && u1.q === 'low' && u1.dpr === 1 && u1.dprCap === 1 && u1.save === 'auto' && u1.toast === true &&
    toasts.includes(notice) && u2.low && u2.q === 'low' && u2.fps > 100, JSON.stringify({ u0: [u0.low, u0.q, u0.fps], u1: [u1.low, u1.q, u1.dpr, u1.save, u1.toast], u2: [u2.low, u2.q, u2.fps], toasts: [...new Set(toasts)] }));
  // a new session starts High again and can step down again, but the notice is not repeated
  await p5.reload(); await p5.waitForTimeout(400);
  await p5.evaluate(() => { window.__ghostlap.fakeMs = 16; window.__ghostlap.startRace(0); });
  await p5.waitForFunction(() => window.__ghostlap.state === 'race', null, { timeout: 20000 });
  await p5.waitForTimeout(1200);
  const b0 = await p5.evaluate(() => ({ ...window.__ghostlap.fps, q: window.__ghostlap.chase.quality }));
  const toasts2 = [], tpoll2 = setInterval(async () => { try { const b = await p5.$eval('#banner', (e) => e.classList.contains('show') ? e.textContent : ''); if (b) toasts2.push(b); } catch (e) {} }, 100);
  await p5.evaluate(() => { window.__ghostlap.fakeMs = 40; });
  const stepped2 = await p5.waitForFunction(() => window.__ghostlap.fps.autoLow, null, { timeout: 30000 }).then(() => true).catch(() => false);
  await p5.waitForTimeout(1500);
  clearInterval(tpoll2);
  check('Auto: a new session starts High; a second step-down shows no notice', !b0.low && b0.q === 'high' && stepped2 && !toasts2.includes(notice), JSON.stringify({ b0: [b0.low, b0.q], stepped2, toasts2: [...new Set(toasts2)] }));
  await p5.evaluate(() => { window.__ghostlap.fakeMs = null; window.__ghostlap.toMenu(); window.__ghostlap.setQuality('high'); });
  await p5.close();

  // a phone without WebGL: Chase and Bonnet both fall back to the flat Follow view (and the choice is kept)
  const ctx6 = await b.newContext({ ...devices['iPhone 13'] });
  await ctx6.addInitScript(() => { const g = HTMLCanvasElement.prototype.getContext; HTMLCanvasElement.prototype.getContext = function (k, o) { return /webgl/.test(k) ? null : g.call(this, k, o); }; });
  const p6 = await ctx6.newPage();
  p6.on('pageerror', (e) => errs.push('p6 pageerror: ' + e.message));
  await p6.goto(base + '?game=drive');
  await p6.waitForTimeout(800);
  const g6 = await p6.evaluate(() => { const c = document.getElementById('carView'), d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
    let ink = 0; for (let i = 3; i < d.length; i += 16) if (d[i] > 40) ink++; return { ...window.__ghostlap.garage, ink: ink / (d.length / 16) }; });
  check('no WebGL: the garage keeps its 2D top view', g6.mode === '2d' && g6.ink > 0.05, JSON.stringify(g6));
  const nw = [];
  for (const cam of ['chase', 'bonnet']) {
    await p6.evaluate((c) => { window.__ghostlap.setCam(c); window.__ghostlap.startRace(0); }, cam);
    await p6.waitForFunction(() => window.__ghostlap.state === 'race', null, { timeout: 20000 });
    await p6.waitForTimeout(300);
    nw.push(await p6.evaluate(() => ({ ...window.__ghostlap.view, on: document.getElementById('view3d').classList.contains('on'), ready: !!(window.Chase && window.Chase.ready) })));
    await p6.evaluate(() => window.__ghostlap.toMenu());
  }
  check('no WebGL: Chase and Bonnet fall back to Follow (car heading up), the setting is kept', nw.every((v, k) => v.mode === ['chase', 'bonnet'][k] && !v.chase && !v.on && !v.ready && Math.abs(v.a + Math.PI / 2) < 0.1), JSON.stringify(nw));
  await ctx6.close();

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
  const chaseOff = await p3.evaluate(() => Promise.all(['chase.js', 'chase-cars.js', 'vendor/three/three.module.min.js', 'vendor/three/three.core.min.js'].map((a) => caches.match(a).then((r) => !!r)))).catch(() => []);
  check('chase camera files cached for offline', chaseOff.length === 4 && chaseOff.every(Boolean), JSON.stringify(chaseOff));
  await p3.screenshot({ path: SHOTS + '/10-offline.png' });
  check('no JS errors', errs.length === 0, errs.slice(0, 5).join(' | '));
  await b.close(); srv.close();
  for (const r of results) console.log(r.join('  '));
})().catch((e) => { console.error(e); for (const r of results) console.log(r.join('  ')); srv.close(); process.exit(1); });
