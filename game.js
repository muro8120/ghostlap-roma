// Ghostlap Roma: rendering, input, screens, sound, saving, offline.
(function () {
  'use strict';
  const GL = window.GL;
  const $ = (id) => document.getElementById(id);
  const params = new URLSearchParams(location.search);
  const BOT = params.has('bot');                                   // test autopilot
  const FAST = Math.max(1, Math.min(8, +params.get('fast') || 1)); // test time-warp

  // ---------- saving --------------------------------------------------------
  // v2: cars got 15% slower (Oct 2026), so old times and ghosts were reset; car and sound carry over
  const KEY = 'ghostlap-roma-v2';
  // cam: 'chase' (3D, the default) | 'bonnet' (3D) | 'follow' | 'north'. camV 1: a saved 'follow' (the old default) moved to chase once
  // quality: 'auto' | 'low' | 'high' (see Chase.setQuality); fps: the frame-rate readout in the HUD; qToast: Auto's one-time notice shown
  let save = { car: 'maranello', sound: false, help: true, cam: 'chase', camV: 1, quality: 'auto', fps: false, qToast: false, tracks: {} };
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const s = JSON.parse(raw);
      if (!s.camV) { if (!s.cam || s.cam === 'follow') s.cam = 'chase'; s.camV = 1; }
      save = Object.assign(save, s);
    }
    else {
      const old = JSON.parse(localStorage.getItem('ghostlap-roma-v1') || 'null');
      if (old) { save.car = old.car || save.car; save.sound = !!old.sound; localStorage.removeItem('ghostlap-roma-v1'); }
    }
  } catch (e) { /* private mode: keep in memory */ }
  function persist() { try { localStorage.setItem(KEY, JSON.stringify(save)); } catch (e) {} }

  function fmt(t) {
    if (t == null || !isFinite(t)) return '-:--.--';
    const cs = Math.round(t * 100);
    const m = Math.floor(cs / 6000), s = Math.floor(cs / 100) % 60, c = cs % 100;
    return m + ':' + (s < 10 ? '0' : '') + s + '.' + (c < 10 ? '0' : '') + c;
  }
  const medalOf = (def, t) => (t == null ? 0 : t <= def.medals[0] ? 3 : t <= def.medals[1] ? 2 : t <= def.medals[2] ? 1 : 0);
  const MEDAL = ['', 'BRONZE', 'SILVER', 'GOLD'];

  // ---------- tracks & worlds ----------------------------------------------
  // ---------- real-street routes from the NYX (rome.js, built from OpenStreetMap) -------
  const ROME = window.ROME || null;
  if (ROME) for (const r of ROME.routes) {
    const pts = [];
    for (let i = 0; i < r.pts.length; i += 2) pts.push([r.pts[i], r.pts[i + 1]]);
    GL.TRACKS.push({ id: r.id, name: r.name, blurb: r.blurb, w: r.w, wall: r.wall, laps: r.laps, sectors: r.sectors,
      medals: r.medals, pts, names: r.names, city: true, marks: r.marks, via: r.via, km: r.km });
  }
  const BUILT = GL.TRACKS.map(GL.buildTrack);
  const worlds = [];
  const world = (i) => worlds[i] || (worlds[i] = buildWorld(BUILT[i]));

  function rng(seed) {
    return function () {
      seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
      let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  // true when a circle of radius r at (x, y) stays clear of the road and its run-off
  function clearOf(T, x, y, r) {
    const n = GL.nearest(T, x, y);
    return Math.hypot(n.px - x, n.py - y) > T.hw + T.wall + r;
  }

  function pathOf(T, from, to) {
    const p = new Path2D();
    if (from == null) {
      p.moveTo(T.xs[0], T.ys[0]);
      for (let i = 1; i < T.N; i++) p.lineTo(T.xs[i], T.ys[i]);
      p.closePath();
      return p;
    }
    for (const [a, b] of from) {
      p.moveTo(T.xs[a % T.N], T.ys[a % T.N]);
      for (let i = a + 1; i <= b; i++) p.lineTo(T.xs[i % T.N], T.ys[i % T.N]);
    }
    return p;
  }
  function runs(T, test) {
    const out = [];
    let start = -1;
    for (let i = 0; i <= T.N; i++) {
      const on = i < T.N && test(i);
      if (on && start < 0) start = i;
      if (!on && start >= 0) { out.push([start, i]); start = -1; }
    }
    return out;
  }
  // which side of the track (+1 right / -1 left of travel) faces outward
  function outwardSign(T) {
    const i = 0, d = 400;
    const x = T.xs[i] - T.ty[i] * d, y = T.ys[i] + T.tx[i] * d;
    let inside = false;
    for (let a = 0, b = T.N - 1; a < T.N; b = a++) {
      if ((T.ys[a] > y) !== (T.ys[b] > y) && x < ((T.xs[b] - T.xs[a]) * (y - T.ys[a])) / (T.ys[b] - T.ys[a]) + T.xs[a]) inside = !inside;
    }
    return inside ? -1 : 1;
  }
  function offsetLine(T, d, sgn) {
    const pts = [];
    for (let i = 0; i < T.N; i += 2) pts.push([T.xs[i] - T.ty[i] * d * sgn, T.ys[i] + T.tx[i] * d * sgn]);
    return pts;
  }

  // drawing helpers for world items
  const item = (x, y, r, draw) => ({ x, y, r, draw });
  function pine(x, y, r, c1, c2) {
    return item(x, y, r, (g) => {
      g.fillStyle = 'rgba(0,0,0,.35)'; g.beginPath(); g.arc(x + r * 0.18, y + r * 0.22, r, 0, 7); g.fill();
      g.fillStyle = c1; g.beginPath(); g.arc(x, y, r, 0, 7); g.fill();
      g.fillStyle = c2; g.beginPath(); g.arc(x - r * 0.25, y - r * 0.25, r * 0.55, 0, 7); g.fill();
    });
  }
  function rectItem(x, y, w, h, ang, fill, stroke, lw) {
    return item(x, y, Math.hypot(w, h) / 2, (g) => {
      g.save(); g.translate(x, y); g.rotate(ang || 0);
      if (fill) { g.fillStyle = fill; g.fillRect(-w / 2, -h / 2, w, h); }
      if (stroke) { g.strokeStyle = stroke; g.lineWidth = lw || 4; g.strokeRect(-w / 2, -h / 2, w, h); }
      g.restore();
    });
  }

  // ---------- the real map round the hotel --------------------------------------------
  const VIEW = { x0: 0, y0: 0, x1: 0, y1: 0 };
  const CELL = 900, CELL_PAD = 800;
  let CITY = null; // shared map layers, built once
  function cityLayers() {
    if (CITY) return CITY;
    const cells = new Map();
    const cell = (x, y) => {
      const cx = Math.floor(x / CELL), cy = Math.floor(y / CELL), k = cx + ',' + cy;
      if (!cells.has(k)) cells.set(k, { x: cx * CELL, y: cy * CELL, b: new Path2D(), lm: new Path2D(), st: [new Path2D(), new Path2D(), new Path2D()], br: new Path2D() });
      return cells.get(k);
    };
    for (const b of ROME.buildings) {
      const c = cell(b[1], b[2]), p = b[0] ? c.lm : c.b;
      p.moveTo(b[1], b[2]);
      for (let i = 3; i < b.length; i += 2) p.lineTo(b[i], b[i + 1]);
      p.closePath();
    }
    for (const s of ROME.streets) {
      const kind = s[0] & 3, bridge = s[0] & 4;
      for (let i = 4; i < s.length; i += 2) {
        const c = cell((s[i - 2] + s[i]) / 2, (s[i - 1] + s[i + 1]) / 2), p = bridge ? c.br : c.st[kind];
        p.moveTo(s[i - 2], s[i - 1]); p.lineTo(s[i], s[i + 1]);
      }
    }
    const river = new Path2D();
    for (const r of ROME.river) { river.moveTo(r[0], r[1]); for (let i = 2; i < r.length; i += 2) river.lineTo(r[i], r[i + 1]); }
    CITY = { cells: [...cells.values()], river };
    return CITY;
  }
  function buildCityWorld(T) {
    const L = cityLayers(), S = ROME.S;
    const W = {
      T, city: true, ground: '#0d0f12', asphalt: '#2e3036', edge: '#6a6c70',
      under: [], over: [], lamps: [], floods: [], extra: null, path: pathOf(T), curbs: new Path2D(),
    };
    const SW = [16 * S, 11 * S, 6 * S], SC = ['#25272d', '#212328', '#2a2721'];
    W.under.push(item(0, 0, 1e9, (g) => {
      g.lineCap = 'round'; g.lineJoin = 'round';
      g.strokeStyle = '#0c1b28'; g.lineWidth = 92 * S; g.stroke(L.river);
      g.strokeStyle = '#2b2a27'; g.lineWidth = 3 * S; g.setLineDash([]);
      const vis = L.cells.filter((c) => c.x + CELL + CELL_PAD > VIEW.x0 && c.x - CELL_PAD < VIEW.x1 && c.y + CELL + CELL_PAD > VIEW.y0 && c.y - CELL_PAD < VIEW.y1);
      for (const c of vis) { g.strokeStyle = '#8a8478'; g.lineWidth = 15 * S; g.stroke(c.br); g.strokeStyle = '#4b4740'; g.lineWidth = 12 * S; g.stroke(c.br); }
      for (let k = 0; k < 3; k++) { g.strokeStyle = SC[k]; g.lineWidth = SW[k]; for (const c of vis) g.stroke(c.st[k]); }
      g.lineWidth = 2;
      g.fillStyle = '#1e2128'; g.strokeStyle = '#2c3038';
      for (const c of vis) { g.fill(c.b); g.stroke(c.b); }
      g.fillStyle = '#332d24'; g.strokeStyle = '#66583f';
      for (const c of vis) { g.fill(c.lm); g.stroke(c.lm); }
      g.lineCap = 'butt';
    }));
    for (let i = 0; i < T.N; i += 14) {
      const side = (i / 14) % 2 ? 1 : -1, d = T.hw + 14;
      W.lamps.push({ x: T.xs[i] - T.ty[i] * d * side, y: T.ys[i] + T.tx[i] * d * side, c: 'warm' });
    }
    for (const p of ROME.places) {
      if (p.k === 'hotel') W.floods.push({ x: p.x, y: p.y, r: 320, c: 'warm', a: 0.45 });
      else if (p.k === 'stop' || p.k === 'sight') W.floods.push({ x: p.x, y: p.y, r: 420, c: p.k === 'stop' ? 'warm' : 'cool', a: 0.22 });
    }
    W.labels = () => drawCityLabels();
    return W;
  }
  // screen areas covered by the race panels, so map labels don't show through them
  let hudCache = null;
  function hudRects() {
    if (hudCache) return hudCache;
    hudCache = [];
    for (const el of document.querySelectorAll('#hud .box, #pauseBtn, #nav, #mini, #gear, #fps')) {
      const r = el.getBoundingClientRect();
      if (r.width && r.height) hudCache.push([r.left - 6, r.top - 6, r.right + 6, r.bottom + 6]);
    }
    return hudCache;
  }
  const underHud = (x, y, rects) => rects.some((r) => x > r[0] && x < r[2] && y > r[1] && y < r[3]);

  // street names and places, drawn crisp in screen space
  function drawCityLabels() {
    if (chaseView) return drawChaseLabels();
    const hud = state === 'menu' ? [] : hudRects();
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.textAlign = 'center'; g.textBaseline = 'middle'; g.lineJoin = 'round';
    g.font = '600 11px -apple-system, system-ui, sans-serif';
    for (const a of ROME.anchors) {
      const [sx, sy] = toScr(a[0], a[1]);
      if (sx < -90 || sx > vw + 90 || sy < -20 || sy > vh + 20 || underHud(sx, sy, hud)) continue;
      const t = ROME.names[a[3]], ra = wrap(a[2] / 100 + cam.r); // keep the text upright
      g.save(); g.translate(sx, sy); g.rotate(ra > Math.PI / 2 ? ra - Math.PI : ra < -Math.PI / 2 ? ra + Math.PI : ra);
      g.lineWidth = 3; g.strokeStyle = 'rgba(12,13,17,.9)'; g.strokeText(t, 0, 0);
      g.fillStyle = 'rgba(200,206,216,.62)'; g.fillText(t, 0, 0);
      g.restore();
    }
    const taken = hud.slice();
    const free = (x0, y0, x1, y1) => { for (const r of taken) if (x0 < r[2] && x1 > r[0] && y0 < r[3] && y1 > r[1]) return false; taken.push([x0, y0, x1, y1]); return true; };
    for (const p of ROME.places) {
      const [sx, sy] = toScr(p.x, p.y);
      if (sx < -120 || sx > vw + 120 || sy < -30 || sy > vh + 30 || underHud(sx, sy - 10, hud)) continue;
      taken.push([sx - 70, sy - 24, sx + 70, sy + 8]);
      drawPlace(p, sx, sy);
    }
    drawPicks(free);
    drawLandmarks(free);
    if (state !== 'menu' && race && race.T.def.city) drawSigns(hud);
  }
  const placeFont = (p) => (p.k === 'sight' ? 'italic 600 ' : '800 ') + (p.k === 'hotel' || p.k === 'stop' ? '13px' : '11px') + ' -apple-system, system-ui, sans-serif';
  function drawPlace(p, sx, sy) { // a dot with the name above (expects textAlign center, textBaseline middle)
    const col = p.k === 'hotel' ? '#f2b24c' : p.k === 'metro' ? '#ff5a5f' : p.k === 'stop' ? '#ffffff' : '#a9d2ff';
    g.fillStyle = col; g.strokeStyle = 'rgba(12,13,17,.9)'; g.lineWidth = 2;
    g.beginPath(); g.arc(sx, sy, p.k === 'hotel' ? 7 : 5, 0, 7); g.fill(); g.stroke();
    if (p.k === 'metro') { g.fillStyle = '#fff'; g.font = '800 8px -apple-system, system-ui, sans-serif'; g.fillText('M', sx, sy + 0.5); }
    g.font = placeFont(p);
    g.lineWidth = 4; g.strokeText(p.n, sx, sy - 15); g.fillStyle = col; g.fillText(p.n, sx, sy - 15);
  }

  // Jesse's places (from his Andiamo trip page): gold stars with a short note
  function star(x, y, r) {
    g.beginPath();
    for (let k = 0; k < 10; k++) { const a = -Math.PI / 2 + (k * Math.PI) / 5, rr2 = k % 2 ? r * 0.45 : r; g.lineTo(x + Math.cos(a) * rr2, y + Math.sin(a) * rr2); }
    g.closePath();
  }
  const GOLD = '#ffd166';
  function drawPicks(free) {
    for (const p of ROME.picks || []) {
      const [sx, sy] = toScr(p.x, p.y);
      if (sx < -60 || sx > vw + 60 || sy < -30 || sy > vh + 30) continue;
      g.font = '800 12px -apple-system, system-ui, sans-serif';
      const w = g.measureText(p.n).width;
      free(sx - 10, sy - 10, sx + w + 16, sy + 22);
      goldStar(sx, sy, 8);
      pickText(p, sx, sy);
    }
  }
  function goldStar(sx, sy, r) {
    g.save(); g.shadowColor = GOLD; g.shadowBlur = 10; g.fillStyle = GOLD; star(sx, sy, r); g.fill(); g.restore();
    g.strokeStyle = 'rgba(12,13,17,.95)'; g.lineWidth = 1.5; star(sx, sy, r); g.stroke();
  }
  const pickNote = (p) => p.note + (p.sun ? ' \u00b7 closed Sun' : '');
  function pickText(p, sx, sy) { // name and note to the right of the star
    g.font = '800 12px -apple-system, system-ui, sans-serif';
    g.textAlign = 'left'; g.textBaseline = 'middle'; g.lineJoin = 'round';
    g.lineWidth = 4; g.strokeStyle = 'rgba(12,13,17,.92)'; g.strokeText(p.n, sx + 12, sy); g.fillStyle = GOLD; g.fillText(p.n, sx + 12, sy);
    const note = pickNote(p);
    g.font = '600 10px -apple-system, system-ui, sans-serif';
    g.lineWidth = 3; g.strokeText(note, sx + 12, sy + 13); g.fillStyle = 'rgba(255,209,102,.8)'; g.fillText(note, sx + 12, sy + 13);
  }

  // Direction signs at the screen edge: the hotel, the next stop, and the nearest of Jesse's places,
  // each with its straight-line distance, so you learn which way things are from wherever you are.
  let signCount = 0;
  function drawSigns(hud) { paintSigns(layoutSigns(hud)); }
  function layoutSigns(hud) {
    const T = race.T, c = race.car, S = ROME.S;
    const [cx, cy] = carScr(c);
    const targets = [];
    const home = ROME.places.find((p) => p.k === 'hotel');
    if (home) targets.push({ x: home.x, y: home.y, t: 'NYX Hotel', col: '#f2b24c', solid: true });
    const marks = T.def.marks || [];
    if (markIdx < marks.length) {
      const m = marks[markIdx], i = Math.round(m.s / T.ds) % T.N;
      targets.push({ x: T.xs[i], y: T.ys[i], t: m.name, col: '#ffffff' });
    }
    targets.push(...(ROME.picks || []).filter((p) => !targets.some((t) => t.t === p.n))
      .map((p) => ({ x: p.x, y: p.y, t: p.n, col: GOLD, d: Math.hypot(p.x - c.x, p.y - c.y) }))
      .sort((a, b) => a.d - b.d).slice(0, 2));
    let top = 8;
    for (const r of hud) if (r[1] < vh * 0.4) top = Math.max(top, r[3]);
    const box = { l: 8, t: top + 4, r: vw - 8, b: vh - 14 }, h = 22;
    if (chaseView && Chase.view === 'bonnet') box.b = Math.min(box.b, bonnetTop() - 6); // the bonnet is the car's: signs stay above it
    g.font = '700 10.5px -apple-system, system-ui, sans-serif';
    // 1) where each off-screen place's direction leaves the sign area
    const chips = [];
    for (const tg of targets) {
      const [sx, sy] = toScr(tg.x, tg.y);
      if (sx > box.l + 30 && sx < box.r - 30 && sy > box.t + 20 && sy < box.b - 20 && (!chaseView || Chase.toScreen(tg.x, tg.y, 0)[2] < CH_SIGN)) continue; // visible already (chase: and near enough to read)
      const wx = tg.x - c.x, wy = tg.y - c.y, m = Math.hypot(wx, wy) / S;
      let dx = sx - cx, dy = sy - cy;
      if (chaseView) { const r = -(Chase.yaw + Math.PI / 2); dx = wx * Math.cos(r) - wy * Math.sin(r); dy = wx * Math.sin(r) + wy * Math.cos(r); } // map-style bearing
      const text = tg.t + ' \u00b7 ' + (m < 950 ? Math.round(m / 10) * 10 + ' m' : (m / 1000).toFixed(1) + ' km');
      const w = g.measureText(text).width + 32;
      const kx = dx > 0 ? (box.r - cx) / dx : dx < 0 ? (box.l - cx) / dx : Infinity;
      const ky = dy > 0 ? (box.b - cy) / dy : dy < 0 ? (box.t - cy) / dy : Infinity;
      const k = Math.min(kx, ky), edge = ky <= kx ? (dy < 0 ? 't' : 'b') : dx < 0 ? 'l' : 'r';
      chips.push({ tg, text, w, ang: Math.atan2(dy, dx), edge, px: cx + dx * k, py: cy + dy * k });
    }
    // 2) stack the chips on each edge so none overlap (and keep them clear of the car)
    for (const e of ['t', 'b', 'l', 'r']) {
      const list = chips.filter((ch) => ch.edge === e);
      const side = e === 'l' || e === 'r';
      for (const ch of list) {
        ch.px = Math.max(box.l + ch.w / 2, Math.min(box.r - ch.w / 2, side ? (e === 'l' ? box.l + ch.w / 2 : box.r - ch.w / 2) : ch.px));
        ch.py = Math.max(box.t + h / 2, Math.min(box.b - h / 2, side ? ch.py : e === 't' ? box.t + h / 2 : box.b - h / 2));
      }
      if (side) {
        list.sort((a, b) => a.py - b.py);
        for (let i = 1; i < list.length; i++) list[i].py = Math.max(list[i].py, list[i - 1].py + h + 4);
        const over = list.length ? list[list.length - 1].py - (box.b - h / 2) : 0;
        if (over > 0) for (const ch of list) ch.py -= over;
      } else {
        // top/bottom: one row per chip so long names never collide
        list.sort((a, b) => a.px - b.px);
        list.forEach((ch, i) => { ch.py += (e === 't' ? 1 : -1) * i * (h + 4); });
      }
      for (const ch of list) { // nudge away from the car
        if (Math.abs(ch.px - cx) < ch.w / 2 + 18 && Math.abs(ch.py - cy) < h / 2 + 18) ch.py += ch.py < cy ? -(h + 22) : h + 22;
        if (chaseView) ch.py = Math.max(box.t + h / 2, Math.min(box.b - h / 2, ch.py)); // never up under the nav box or the minimap
      }
    }
    // chips on two edges can meet in a corner; step the later one towards the middle until it is clear
    for (let i = 1; i < chips.length; i++) for (let j = 0, n = 0; j < i && n < 12; j++) {
      const a = chips[i], b = chips[j];
      if (Math.abs(a.px - b.px) < (a.w + b.w) / 2 + 4 && Math.abs(a.py - b.py) < h + 4) {
        a.py = Math.max(box.t + h / 2, Math.min(box.b - h / 2, b.py + (a.py > (box.t + box.b) / 2 ? -1 : 1) * (h + 4))); j = -1; n++;
      }
    }
    // still crowded (rare): the later sign gives way; the list is in priority order (hotel, next stop, Jesse's places)
    return chips.filter((a, i) => !chips.slice(0, i).some((b) => Math.abs(a.px - b.px) < (a.w + b.w) / 2 + 2 && Math.abs(a.py - b.py) < h + 2));
  }
  let signBoxes = [];
  function paintSigns(chips) {
    const h = 22;
    signCount = chips.length; signBoxes = chips.map((ch) => ({ t: ch.tg.t, box: [ch.px - ch.w / 2, ch.py - h / 2, ch.px + ch.w / 2, ch.py + h / 2].map(Math.round) }));
    g.font = '700 10.5px -apple-system, system-ui, sans-serif'; g.textBaseline = 'middle';
    for (const ch of chips) {
      const { px, py, w, tg } = ch;
      const fg = tg.solid ? '#1a1205' : tg.col; // the hotel sign is solid amber: "home"
      g.fillStyle = tg.solid ? tg.col : 'rgba(11,13,18,.8)'; rr(g, px - w / 2, py - h / 2, w, h, 11); g.fill();
      g.strokeStyle = tg.col; g.lineWidth = 1.3; rr(g, px - w / 2, py - h / 2, w, h, 11); g.stroke();
      g.save(); g.translate(px - w / 2 + 12, py); g.rotate(ch.ang);
      g.fillStyle = fg; g.beginPath(); g.moveTo(7, 0); g.lineTo(0.5, -5); g.lineTo(0.5, -1.6); g.lineTo(-6, -1.6); g.lineTo(-6, 1.6); g.lineTo(0.5, 1.6); g.lineTo(0.5, 5); g.closePath(); g.fill();
      g.restore();
      g.fillStyle = fg; g.textAlign = 'left'; g.fillText(ch.text, px - w / 2 + 23, py + 0.5);
    }
  }


  // shop fronts and street furniture you'd spot on foot: green pharmacy crosses, the tabacchi T,
  // churches, supermarkets, gelaterie, nasoni (drinking fountains), cash machines...
  const POI_STYLE = {
    pharmacy: { pri: 1, col: '#3ddc84', icon: 'cross' }, tabacchi: { pri: 1, col: '#ffffff', bg: '#1d3f8f', icon: 'T' },
    metro: { pri: 1, col: '#ff7a7f', bg: '#c4262e', icon: 'M' }, church: { pri: 2, col: '#e6dcc4', icon: 'church', it: 1 },
    sight: { pri: 2, col: '#a9d2ff', icon: 'dot', it: 1 }, fountain: { pri: 2, col: '#8fd0ff', icon: 'drop', it: 1 },
    market: { pri: 3, col: '#ffb347', bg: '#a65200', icon: 'sign' }, gelato: { pri: 3, col: '#ff9ecb', icon: 'dot' },
    tram: { pri: 3, col: '#ffd166', bg: '#6b4f00', icon: 't' }, water: { pri: 4, col: '#8fd0ff', icon: 'drop', small: 1 },
    atm: { pri: 4, col: '#9fe0c8', bg: '#1d5f4f', icon: '\u20ac' }, wc: { pri: 4, col: '#d5dbe5', bg: '#3a4150', icon: 'WC' },
    post: { pri: 4, col: '#ffd84a', bg: '#23408f', icon: 'P' }, cafe: { pri: 5, col: '#e3c9a8', icon: 'dot' },
  };
  let POIS = null;
  const textW = new Map();
  function drawLandmarks(free) {
    if (!ROME.pois) return;
    if (!POIS) POIS = ROME.pois.map(([k, x, y, l]) => ({ st: POI_STYLE[ROME.poiKinds[k]] || POI_STYLE.sight, x, y, t: ROME.poiLabels[l] })).sort((a, b) => a.st.pri - b.st.pri);
    const font = poiFont;
    g.textBaseline = 'middle';
    for (const p of POIS) {
      const [sx, sy] = toScr(p.x, p.y), st = p.st;
      if (sx < -20 || sx > vw + 20 || sy < -20 || sy > vh + 20) continue;
      g.font = font(st);
      const key = p.t + st.small;
      if (!textW.has(key)) textW.set(key, g.measureText(p.t).width);
      const w = textW.get(key), sign = st.icon === 'sign';
      if (!free(sx - 8, sy - 8, sx + (sign ? w + 4 : w + 14), sy + 8)) continue;
      drawPoi(p, sx, sy, w);
    }
  }
  const poiFont = (st) => (st.it ? 'italic 600 ' : '700 ') + (st.small ? '9px' : '10px') + ' -apple-system, system-ui, sans-serif';
  function drawPoi(p, sx, sy, w) { // icon and label; w is the label's width in poiFont (expects textBaseline middle)
    const st = p.st;
    g.lineJoin = 'round';
    if (st.icon === 'sign') { // supermarket: the label is the sign
      g.fillStyle = st.bg; rr(g, sx - 6, sy - 7, w + 12, 14, 3); g.fill();
      g.fillStyle = '#fff'; g.textAlign = 'left'; g.fillText(p.t, sx, sy + 0.5);
      return;
    }
    if (st.bg) {
      g.fillStyle = st.bg; rr(g, sx - 6, sy - 6, 12, 12, 2.5); g.fill();
      g.fillStyle = '#fff'; g.textAlign = 'center'; g.font = '800 ' + (st.icon.length > 1 ? '6px' : '9px') + ' -apple-system, system-ui, sans-serif';
      g.fillText(st.icon, sx, sy + 0.5);
    } else if (st.icon === 'cross') {
      g.save(); g.shadowColor = '#3ddc84'; g.shadowBlur = 8; g.fillStyle = '#3ddc84';
      g.fillRect(sx - 1.8, sy - 6, 3.6, 12); g.fillRect(sx - 6, sy - 1.8, 12, 3.6); g.restore();
    } else if (st.icon === 'church') {
      g.strokeStyle = st.col; g.lineWidth = 1.6; g.beginPath(); g.moveTo(sx, sy - 6); g.lineTo(sx, sy + 6); g.moveTo(sx - 3.5, sy - 2.5); g.lineTo(sx + 3.5, sy - 2.5); g.stroke();
    } else {
      g.fillStyle = st.col; g.beginPath(); g.arc(sx, sy, st.small ? 2.8 : 3.6, 0, 7); g.fill();
    }
    g.font = poiFont(st); g.textAlign = 'left';
    g.lineWidth = 3; g.strokeStyle = 'rgba(12,13,17,.92)'; g.strokeText(p.t, sx + 9, sy + 0.5);
    g.fillStyle = st.col; g.fillText(p.t, sx + 9, sy + 0.5);
  }

  // ---------- labels in the chase view ---------------------------------------------------------------
  // In 3D a label has to earn its place: only what is near enough to read, shrunk and faded with its depth (Chase.toScreen),
  // nearest first through a greedy pass so no two overlap, at most CH_MAX on screen, and never over the HUD, the sign
  // chips, the car, or the bottom third of the screen where the road is. The current street is in the nav box already.
  const CH_MAX = 6, CH_CAP = { street: 3, spot: 4, pick: 2 }, CH_SIGN = 700;
  const SFONT = '600 12px -apple-system, system-ui, sans-serif', PFONT = '800 12px -apple-system, system-ui, sans-serif', NFONT = '600 10px -apple-system, system-ui, sans-serif';
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v)), fade = (d, a, b) => clamp((b - d) / (b - a), 0, 1);
  const hit = (b, r) => b[0] < r[2] && b[2] > r[0] && b[1] < r[3] && b[3] > r[1];
  const chW = new Map();
  const measure = (font, t) => { const k = font + t; if (!chW.has(k)) { g.font = font; chW.set(k, g.measureText(t).width); } return chW.get(k); };
  const pois = () => POIS || (POIS = ROME.pois.map(([k, x, y, l]) => ({ st: POI_STYLE[ROME.poiKinds[k]] || POI_STYLE.sight, x, y, t: ROME.poiLabels[l] })).sort((a, b) => a.st.pri - b.st.pri));
  let chaseLabels = null; // the last frame's layout (read by the test hook)
  let SGRID = null;
  function streetGrid() { // points every ~120 units along the named streets, [x, y, angle, name] by 400-unit cell
    if (SGRID) return SGRID;
    SGRID = new Map();
    for (const s of ROME.streets) {
      if (!ROME.names[s[1]]) continue;
      for (let i = 4; i < s.length; i += 2) {
        const x0 = s[i - 2], y0 = s[i - 1], x1 = s[i], y1 = s[i + 1], n = Math.max(1, Math.round(Math.hypot(x1 - x0, y1 - y0) / 120));
        for (let j = 0; j < n; j++) {
          const t = (j + 0.5) / n, x = x0 + (x1 - x0) * t, y = y0 + (y1 - y0) * t, k = Math.floor(x / 400) + ',' + Math.floor(y / 400);
          if (!SGRID.has(k)) SGRID.set(k, []);
          SGRID.get(k).push(x, y, Math.atan2(y1 - y0, x1 - x0), s[1]);
        }
      }
    }
    return SGRID;
  }
  function drawChaseLabels() {
    const c = race.car, hud = hudRects(), P = (x, y) => Chase.toScreen(x, y, 0);
    const near = (x, y) => (x - c.x) ** 2 + (y - c.y) ** 2 < 1100 * 1100;
    const cp = P(c.x, c.y) || [vw / 2, vh * 0.65], road = vh * 0.67;
    // the car's reserved rectangle: its projected corners (roof included) with a margin, and never less than a fixed box
    const carBox = [cp[0] - 56, cp[1] - 46, cp[0] + 56, cp[1] + 30], ca = Math.cos(c.a), sa = Math.sin(c.a), cl = c.spec.len / 2, cw = c.spec.wid / 2;
    if (Chase.view === 'bonnet') { const r = Chase.carRect() || [0, vh * 0.85, vw, vh]; carBox.splice(0, 4, 0, r[1] - 16, vw, vh); }
    else for (const [u, v] of [[cl, cw], [cl, -cw], [-cl, cw], [-cl, -cw]]) for (const z of [0, c.spec.wid * 0.7 + 4]) {
      const q = Chase.toScreen(c.x + u * ca - v * sa, c.y + u * sa + v * ca, z);
      if (q) { carBox[0] = Math.min(carBox[0], q[0] - 18); carBox[1] = Math.min(carBox[1], q[1] - 22); carBox[2] = Math.max(carBox[2], q[0] + 18); carBox[3] = Math.max(carBox[3], q[1] + 14); }
    }
    const chips = layoutSigns(hud), taken = chips.map((ch) => [ch.px - ch.w / 2 - 4, ch.py - 15, ch.px + ch.w / 2 + 4, ch.py + 15]);
    const cand = [], stars = [];
    // a label at screen point p (with depth p[2]), scale k, opacity a; rel is its box round p at scale 1
    const add = (L, p, rel) => { if (L.a > 0.06) cand.push(Object.assign(L, { sx: p[0], sy: p[1], d: p[2], box: [p[0] + rel[0] * L.k, p[1] + rel[1] * L.k, p[0] + rel[2] * L.k, p[1] + rel[3] * L.k] })); };
    // street names: for each named street ahead, its nearest point on screen above the road (nearer the middle is
    // better: that is where it meets the street you're on), along the street as seen on screen, never upside down or on end
    const fx = Math.cos(Chase.yaw), fy = Math.sin(Chase.yaw), G = streetGrid(), best = new Map();
    for (let gx = Math.floor((c.x - 1000) / 400); gx <= Math.floor((c.x + 1000) / 400); gx++) for (let gy = Math.floor((c.y - 1000) / 400); gy <= Math.floor((c.y + 1000) / 400); gy++) {
      const cell = G.get(gx + ',' + gy);
      if (cell) for (let i = 0; i < cell.length; i += 4) {
        const x = cell[i], y = cell[i + 1], dx = x - c.x, dy = y - c.y;
        if (dx * fx + dy * fy < 0 || dx * dx + dy * dy > 1e6) continue;
        const p = P(x, y);
        if (!p || p[2] < 200 || p[2] > 850 || p[0] < 30 || p[0] > vw - 30 || p[1] < 0 || p[1] > road - 8) continue;
        const sc = p[2] + Math.abs(p[0] - vw / 2) * 0.6, b = best.get(cell[i + 3]);
        if (!b || sc < b.sc) best.set(cell[i + 3], { sc, p, x, y, ang: cell[i + 2] });
      }
    }
    for (const [ni, { p, x, y, ang }] of best) {
      const t = ROME.names[ni];
      if (t.trim() === navStreet) continue;
      const ex = Math.cos(ang) * 24, ey = Math.sin(ang) * 24, p0 = P(x - ex, y - ey), p1 = P(x + ex, y + ey);
      if (!p0 || !p1) continue;
      let ra = Math.atan2(p1[1] - p0[1], p1[0] - p0[0]);
      if (ra > Math.PI / 2) ra -= Math.PI; else if (ra < -Math.PI / 2) ra += Math.PI;
      if (Math.abs(ra) > 1.05) continue; // a street running away from the camera: its name would stand on end
      const k = clamp(330 / p[2], 0.8, 1), hw = measure(SFONT, t) / 2, cs = Math.abs(Math.cos(ra)), sn = Math.abs(Math.sin(ra));
      const ex2 = cs * hw + sn * 7, ey2 = sn * hw + cs * 7;
      add({ kind: 'street', grp: 'street', t, key: p[2] * 0.9, k, a: 0.35 + 0.65 * fade(p[2], 450, 850), ra, draw() {
        g.font = SFONT; g.textAlign = 'center'; g.lineWidth = 3; g.strokeStyle = 'rgba(12,13,17,.9)'; g.strokeText(t, 0, 0);
        g.fillStyle = 'rgba(214,220,230,.86)'; g.fillText(t, 0, 0);
      } }, p, [-ex2, -ey2, ex2, ey2]);
    }
    // the hotel, the stops, metro stations and sights
    for (const q of ROME.places) {
      const p = near(q.x, q.y) && P(q.x, q.y);
      if (!p || p[2] > 1000) continue;
      const hw = Math.max(measure(placeFont(q), q.n) / 2 + 2, 8);
      add({ kind: 'place', grp: 'spot', t: q.n, key: p[2] * (q.k === 'hotel' || q.k === 'stop' ? 0.6 : 0.8), k: clamp(300 / p[2], 0.65, 1), a: fade(p[2], 650, 1000),
        draw() { g.textAlign = 'center'; drawPlace(q, 0, 0); } }, p, [-hw, -23, hw, 8]);
    }
    // shop fronts and street furniture: only the nearest handful
    for (const q of ROME.pois ? pois() : []) {
      const p = near(q.x, q.y) && P(q.x, q.y);
      if (!p || p[2] > 760) continue;
      const st = q.st, w = measure(poiFont(st), q.t);
      add({ kind: 'poi', grp: 'spot', t: q.t, key: p[2] * (0.85 + st.pri * 0.06), k: clamp(300 / p[2], 0.7, 1), a: fade(p[2], 450, 760),
        draw() { g.font = poiFont(st); drawPoi(q, 0, 0, w); } }, p, [-8, -8, st.icon === 'sign' ? w + 6 : w + 13, 8]);
    }
    // gold stars: always drawn when in view, sized by depth; their names go through the placement first
    for (const q of ROME.picks || []) {
      const p = P(q.x, q.y);
      if (!p || p[2] > 2400 || p[0] < -20 || p[0] > vw + 20 || p[1] < -20 || p[1] > vh + 20) continue;
      const ks = clamp(260 / p[2], 0.45, 1.15), k = clamp(300 / p[2], 0.7, 1);
      stars.push([p[0], p[1], ks]); taken.push([p[0] - 9 * ks, p[1] - 9 * ks, p[0] + 9 * ks, p[1] + 9 * ks]);
      if (p[2] > 1000) continue;
      const w = Math.max(measure(PFONT, q.n), measure(NFONT, pickNote(q)));
      add({ kind: 'pick', grp: 'pick', t: q.n, key: p[2] * 0.5, k, a: fade(p[2], 700, 1000), draw() { pickText(q, 0, 0); } },
        [p[0] + 8 * ks - 8 * k, p[1], p[2]], [10, -9, w + 14, 19]); // the text starts just right of the star at either size
    }
    // greedy, nearest (and most useful) first: skip whatever would overlap a label already placed
    cand.sort((a, b) => a.key - b.key);
    const placed = [], n = { street: 0, spot: 0, pick: 0 }, names = new Set([navStreet]); // nothing repeats the nav box
    for (const L of cand) {
      if (placed.length >= CH_MAX) break;
      if (n[L.grp] >= CH_CAP[L.grp] || names.has(L.t)) continue;
      const b = L.box;
      // lift it out of the road band and the car's box when only a little of it is in there; otherwise skip it
      let lift = Math.max(0, b[3] - road);
      if (hit([b[0], b[1] - lift, b[2], b[3] - lift], carBox)) lift = b[3] - carBox[1] + 1;
      if (lift > 30 || b[0] < 2 || b[2] > vw - 2 || b[1] - lift < 2) continue;
      const bb = [b[0], b[1] - lift, b[2], b[3] - lift];
      if (hud.some((r) => hit(bb, r)) || taken.some((r) => hit(bb, r))) continue;
      taken.push(bb); placed.push(L); L.b = bb; L.lift = lift; n[L.grp]++; names.add(L.t);
    }
    g.setTransform(dpr, 0, 0, dpr, 0, 0); g.textBaseline = 'middle'; g.lineJoin = 'round';
    for (const [x, y, ks] of stars) { g.save(); g.translate(x, y); g.scale(ks, ks); goldStar(0, 0, 8); g.restore(); }
    for (const L of placed) {
      g.save(); g.globalAlpha = L.a; g.translate(L.sx, L.sy - L.lift);
      if (L.ra) g.rotate(L.ra);
      g.scale(L.k, L.k); L.draw(); g.restore();
    }
    paintSigns(chips);
    chaseLabels = { cand: cand.length, labels: placed.map((L) => ({ kind: L.kind, t: L.t, d: Math.round(L.d), a: +L.a.toFixed(2), box: L.b.map(Math.round) })), stars: stars.length,
      car: carBox.map(Math.round), road: Math.round(road), hud: hud.map((r) => r.map(Math.round)), nav: navStreet, yaw: Chase.yaw, carA: c.a,
      signs: chips.map((ch) => ({ t: ch.tg.t, ang: ch.ang, bear: Math.atan2(ch.tg.y - c.y, ch.tg.x - c.x), box: [ch.px - ch.w / 2, ch.py - 11, ch.px + ch.w / 2, ch.py + 11].map(Math.round) })) };
  }

  function buildWorld(T) {
    if (T.def.city) return buildCityWorld(T);
    const def = T.def, R = rng(def.id.length * 977 + 13);
    const W = {
      T, ground: '#11141a', runoff: '#1d1e20', barrier: '#3d3830', asphalt: '#2a2c31', edge: '#6b6c6c',
      under: [], over: [], lamps: [], floods: [], extra: null,
      path: pathOf(T),
      curbs: pathOf(T, runs(T, (i) => Math.abs(T.curv[i]) > 1 / 700)),
    };
    const out = outwardSign(T);
    const wall = T.hw + T.wall;
    const lamp = (i, side, col) => {
      const d = wall + 16;
      W.lamps.push({ x: T.xs[i] - T.ty[i] * d * side, y: T.ys[i] + T.tx[i] * d * side, c: col || 'warm' });
    };
    const scatter = (n, minR, maxR, c1, c2, pad, box) => {
      const b = box || T.bounds;
      for (let k = 0; k < n; k++) {
        const x = b.minX + R() * (b.maxX - b.minX), y = b.minY + R() * (b.maxY - b.minY), r = minR + R() * (maxR - minR);
        if (clearOf(T, x, y, r + (pad || 10)) && (!W.keep || W.keep(x, y, r))) W.over.push(pine(x, y, r, c1, c2));
      }
    };

    if (def.id === 'circo') {
      W.ground = '#13150f'; W.runoff = '#2a2418'; W.barrier = '#5a4c36';
      // the spina down the middle, with obelisk, water basins and turning posts
      W.under.push(item(0, -15, 1100, (g) => {
        g.fillStyle = '#3b3326'; g.fillRect(-950, -45, 1900, 60);
        g.strokeStyle = '#6a5a40'; g.lineWidth = 4; g.strokeRect(-950, -45, 1900, 60);
        g.fillStyle = '#16283a';
        for (const x0 of [-860, -520, 140, 480]) g.fillRect(x0, -30, 240, 30);
        for (const s of [-1, 1]) for (const k of [0, 1, 2]) {
          g.fillStyle = '#7a6748'; g.beginPath(); g.arc(s * 995, -36 + k * 21, 11, 0, 7); g.fill();
        }
        // obelisk + long moon shadow
        g.fillStyle = 'rgba(0,0,0,.45)'; g.beginPath(); g.moveTo(-9, -24); g.lineTo(240, 30); g.lineTo(250, 12); g.lineTo(9, -6); g.fill();
        g.fillStyle = '#b39c74'; g.fillRect(-12, -27, 24, 24);
        g.strokeStyle = '#6a5a40'; g.lineWidth = 2; g.beginPath(); g.moveTo(-12, -27); g.lineTo(12, -3); g.moveTo(12, -27); g.lineTo(-12, -3); g.stroke();
      }));
      // the cavea: tiered stands following the track outside
      const tiers = [[wall + 30, wall + 90, '#2b261d'], [wall + 90, wall + 150, '#251f18'], [wall + 150, wall + 220, '#2b261d']];
      const rings = tiers.map(([a, b, c]) => {
        const p = new Path2D(), A = offsetLine(T, a, out), B = offsetLine(T, b, out);
        p.moveTo(A[0][0], A[0][1]); for (const q of A) p.lineTo(q[0], q[1]); p.closePath();
        p.moveTo(B[0][0], B[0][1]); for (let k = B.length - 1; k >= 0; k--) p.lineTo(B[k][0], B[k][1]); p.closePath();
        return [p, c];
      });
      W.under.push(item(0, 0, 99999, (g) => {
        for (const [p, c] of rings) { g.fillStyle = c; g.fill(p, 'evenodd'); }
        g.strokeStyle = '#3e3529'; g.lineWidth = 3;
        for (const [p] of rings) g.stroke(p);
      }));
      // Palatine ruins to the north, pines around
      for (let k = 0; k < 16; k++) {
        const x = -900 + R() * 1800, y = -880 - R() * 420, w = 60 + R() * 140, h = 40 + R() * 100;
        W.under.push(rectItem(x, y, w, h, (R() - 0.5) * 0.3, '#221a14', '#5b3c2a', 6));
      }
      W.keep = (x, y, r) => Math.abs(GL.nearest(T, x, y).off) > wall + 230 + r;
      scatter(90, 26, 56, '#14261a', '#1d3524');
      for (let i = 0; i < T.N; i += 30) lamp(i, -out);
    }

    if (def.id === 'colosseo') {
      W.ground = '#141518'; W.runoff = '#232326'; W.barrier = '#4a4640';
      const cx = 30, cy = 60, rx = 310, ry = 255;
      W.under.push(item(cx, cy, rx + 20, (g) => {
        g.save(); g.translate(cx, cy);
        const ell = (a, b) => { g.beginPath(); g.ellipse(0, 0, a, b, 0, 0, 7); };
        g.fillStyle = 'rgba(0,0,0,.4)'; g.beginPath(); g.ellipse(24, 30, rx, ry, 0, 0, 7); g.fill();
        g.fillStyle = '#6e5c44'; ell(rx, ry); g.fill();
        g.fillStyle = '#5a4a37'; ell(rx - 40, ry - 40); g.fill();
        g.fillStyle = '#4a3d2e'; ell(rx - 85, ry - 85); g.fill();
        g.fillStyle = '#2c241b'; ell(rx - 130, ry - 120); g.fill();
        // hypogeum walls
        g.strokeStyle = '#4d3f30'; g.lineWidth = 4;
        for (let k = -3; k <= 3; k++) { g.beginPath(); g.moveTo(-150, k * 18); g.lineTo(150, k * 18); g.stroke(); }
        // arches round the outer ring, and the fallen side
        g.fillStyle = '#2d241b';
        for (let k = 0; k < 64; k++) {
          const a = (k / 64) * Math.PI * 2;
          g.beginPath(); g.arc(Math.cos(a) * (rx - 20), Math.sin(a) * (ry - 20), 6, 0, 7); g.fill();
        }
        g.strokeStyle = '#141518'; g.lineWidth = 22;
        g.beginPath(); g.ellipse(0, 0, rx - 6, ry - 6, 0, 2.4, 3.5); g.stroke();
        g.restore();
      }));
      W.floods.push({ x: cx, y: cy, r: 520, c: 'warm', a: 0.32 });
      // Vittoriano: the white wedding cake at Piazza Venezia
      const vx = -2700, vy = -400;
      W.under.push(item(vx, vy, 260, (g) => {
        g.save(); g.translate(vx, vy);
        g.fillStyle = '#8f8b82'; g.fillRect(-120, -190, 160, 380);
        g.fillStyle = '#a9a59a'; g.fillRect(40, -170, 60, 340);
        g.strokeStyle = '#d6d1c4'; g.lineWidth = 3;
        for (let k = 0; k < 9; k++) { g.beginPath(); g.moveTo(44 + k * 6.5, -165); g.lineTo(44 + k * 6.5, 165); g.stroke(); }
        g.fillStyle = '#6f6b63';
        for (let k = -7; k <= 7; k++) { g.beginPath(); g.arc(-40, k * 24, 6, 0, 7); g.fill(); }
        g.fillStyle = '#c9b27a'; g.beginPath(); g.arc(-100, -170, 14, 0, 7); g.arc(-100, 170, 14, 0, 7); g.fill();
        g.restore();
      }));
      W.floods.push({ x: vx, y: vy, r: 460, c: 'cool', a: 0.3 });
      // Arch of Constantine
      W.under.push(item(-300, 360, 60, (g) => {
        g.save(); g.translate(-300, 360); g.rotate(0.6);
        g.fillStyle = '#7d6d55'; g.fillRect(-48, -16, 96, 32);
        g.fillStyle = '#2a231a'; g.fillRect(-10, -16, 20, 32); g.fillRect(-36, -16, 10, 32); g.fillRect(26, -16, 10, 32);
        g.restore();
      }));
      // Forum ruins between the straights
      W.keep = (x, y, r) => Math.hypot((x - cx) / (rx + 60), (y - cy) / (ry + 60)) > 1 && !(x < -2350 && x > -2900);
      for (let k = 0; k < 70; k++) {
        const x = -1900 + R() * 1200, y = -420 + R() * 330;
        if (clearOf(T, x, y, 14)) W.under.push(item(x, y, 10, (g) => { g.fillStyle = '#8a7c66'; g.beginPath(); g.arc(x, y, 6, 0, 7); g.fill(); }));
      }
      for (let k = 0; k < 6; k++) {
        const x = -1800 + k * 180 + R() * 60, y = -250 + (R() - 0.5) * 80;
        if (clearOf(T, x, y, 60)) W.under.push(rectItem(x, y, 90, 50, 0.08, '#1d1914', '#6a5d4b', 5));
      }
      scatter(70, 24, 48, '#132418', '#1a3121');
      for (let i = 0; i < T.N; i += 26) { lamp(i, 1); lamp((i + 13) % T.N, -1); }
    }

    if (def.id === 'tevere') {
      W.ground = '#101318'; W.runoff = '#1f2023'; W.barrier = '#45413a';
      const river = (x) => 200 * Math.sin(x / 520);
      const b = T.bounds;
      const water = new Path2D(), banks = new Path2D();
      water.moveTo(b.minX - 400, river(b.minX - 400) - 130);
      for (let x = b.minX - 400; x <= b.maxX + 400; x += 40) water.lineTo(x, river(x) - 130);
      for (let x = b.maxX + 400; x >= b.minX - 400; x -= 40) water.lineTo(x, river(x) + 130);
      water.closePath();
      for (const s of [-1, 1]) {
        banks.moveTo(b.minX - 400, river(b.minX - 400) + s * 134);
        for (let x = b.minX - 400; x <= b.maxX + 400; x += 40) banks.lineTo(x, river(x) + s * 134);
      }
      const ripples = [];
      for (let k = 0; k < 160; k++) { const x = b.minX + R() * (b.maxX - b.minX); ripples.push([x, river(x) + (R() - 0.5) * 200, 20 + R() * 50]); }
      W.under.push(item(0, 0, 99999, (g) => {
        g.fillStyle = '#0d1f2e'; g.fill(water);
        g.strokeStyle = '#3e3b35'; g.lineWidth = 10; g.stroke(banks);
        g.strokeStyle = 'rgba(160,190,220,.12)'; g.lineWidth = 3; g.beginPath();
        for (const [x, y, l] of ripples) { g.moveTo(x, y); g.lineTo(x + l, y); }
        g.stroke();
      }));
      const bridge = runs(T, (i) => Math.abs(T.ys[i] - river(T.xs[i])) < 175);
      const bp = pathOf(T, bridge);
      W.extra = (g) => {
        g.strokeStyle = '#8b857a'; g.lineWidth = wall * 2 + 14; g.stroke(bp);
        g.strokeStyle = '#4b473f'; g.lineWidth = wall * 2; g.stroke(bp);
      };
      // Castel Sant'Angelo on the north bank, St Peter's dome further west
      const sx = -700, sy = river(-700) - 360 - wall - 200;
      W.under.push(item(sx, sy, 230, (g) => {
        g.save(); g.translate(sx, sy); g.rotate(0.785);
        g.fillStyle = '#3c3428'; g.fillRect(-150, -150, 300, 300);
        g.fillStyle = '#4a4033'; for (const [a, c] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) { g.beginPath(); g.arc(a * 150, c * 150, 36, 0, 7); g.fill(); }
        g.restore();
        g.fillStyle = '#6a5a45'; g.beginPath(); g.arc(sx, sy, 110, 0, 7); g.fill();
        g.fillStyle = '#54473a'; g.beginPath(); g.arc(sx, sy, 70, 0, 7); g.fill();
        g.fillStyle = '#c9b27a'; g.beginPath(); g.arc(sx, sy, 9, 0, 7); g.fill();
      }));
      W.floods.push({ x: sx, y: sy, r: 360, c: 'warm', a: 0.35 });
      const px = -1550, py = river(-1550) - 360 - wall - 230;
      W.under.push(item(px, py, 200, (g) => {
        g.fillStyle = '#5d6168'; g.beginPath(); g.arc(px, py, 150, 0, 7); g.fill();
        g.strokeStyle = '#7c8189'; g.lineWidth = 4; g.beginPath();
        for (let k = 0; k < 16; k++) { const a = (k / 16) * Math.PI * 2; g.moveTo(px, py); g.lineTo(px + Math.cos(a) * 150, py + Math.sin(a) * 150); }
        g.stroke();
        g.fillStyle = '#9aa0a8'; g.beginPath(); g.arc(px, py, 26, 0, 7); g.fill();
      }));
      W.floods.push({ x: px, y: py, r: 380, c: 'cool', a: 0.28 });
      // plane trees on the riverside walks and outer pavements
      for (let x = b.minX; x < b.maxX; x += 130) for (const s of [-1, 1]) {
        const y1 = river(x) + s * 190;
        if (clearOf(T, x, y1, 26)) W.over.push(pine(x, y1, 24, '#15281c', '#1d3626'));
        const y2 = river(x) + s * (360 + wall + 50);
        if (clearOf(T, x + 60, y2, 30)) W.over.push(pine(x + 60, y2, 28, '#15281c', '#1d3626'));
      }
      for (let i = 0; i < T.N; i += 24) lamp(i, 1);
      for (let i = 12; i < T.N; i += 24) lamp(i, -1);
    }

    if (def.id === 'appia') {
      W.ground = '#0f140e'; W.runoff = '#1e1f19'; W.barrier = '#3b3a30'; W.asphalt = '#2d2b28'; W.edge = '#5a574f';
      // cypress rows both sides
      for (let i = 0; i < T.N; i += 7) for (const s of [-1, 1]) {
        const d = wall + 22 + (i % 14 === 0 ? 0 : 6);
        const x = T.xs[i] - T.ty[i] * d * s, y = T.ys[i] + T.tx[i] * d * s;
        if (clearOf(T, x, y, 10)) W.over.push(item(x, y, 14, (g) => {
          g.fillStyle = 'rgba(0,0,0,.35)'; g.beginPath(); g.arc(x + 3, y + 4, 11, 0, 7); g.fill();
          g.fillStyle = '#0c2414'; g.beginPath(); g.arc(x, y, 11, 0, 7); g.fill();
          g.fillStyle = '#123420'; g.beginPath(); g.arc(x - 3, y - 3, 5, 0, 7); g.fill();
        }));
      }
      // tomb of Caecilia Metella and roadside tombs
      const k0 = Math.round(T.N * 0.36), d0 = wall + 200;
      const mx = T.xs[k0] - T.ty[k0] * d0 * out, my = T.ys[k0] + T.tx[k0] * d0 * out;
      if (clearOf(T, mx, my, 100)) {
        W.under.push(item(mx, my, 110, (g) => {
          g.fillStyle = 'rgba(0,0,0,.4)'; g.beginPath(); g.arc(mx + 14, my + 18, 96, 0, 7); g.fill();
          g.fillStyle = '#6d6455'; g.beginPath(); g.arc(mx, my, 96, 0, 7); g.fill();
          g.fillStyle = '#4e463b'; g.beginPath(); g.arc(mx, my, 70, 0, 7); g.fill();
          g.fillStyle = '#6d6455';
          for (let k = 0; k < 20; k++) { const a = (k / 20) * Math.PI * 2; g.fillRect(mx + Math.cos(a) * 88 - 6, my + Math.sin(a) * 88 - 6, 12, 12); }
        }));
        W.floods.push({ x: mx, y: my, r: 300, c: 'warm', a: 0.3 });
      }
      for (let i = 40; i < T.N; i += 55) {
        const s = i % 110 < 55 ? 1 : -1, d = wall + 70;
        const x = T.xs[i] - T.ty[i] * d * s, y = T.ys[i] + T.tx[i] * d * s;
        if (clearOf(T, x, y, 40)) W.under.push(rectItem(x, y, 46 + (i % 3) * 14, 34, Math.atan2(T.ty[i], T.tx[i]), '#26231d', '#5e5547', 4));
      }
      // aqueduct running across the countryside
      const ay = T.bounds.maxY - 160;
      const piers = [];
      for (let x = T.bounds.minX; x < T.bounds.maxX; x += 42) if (clearOf(T, x, ay, 30)) piers.push(x);
      W.under.push(item(0, ay, 99999, (g) => {
        g.fillStyle = 'rgba(0,0,0,.4)'; for (const x of piers) g.fillRect(x + 8, ay - 4, 22, 30);
        g.fillStyle = '#5e4a39'; for (const x of piers) g.fillRect(x, ay - 13, 26, 26);
        g.fillStyle = '#7a614b'; for (const x of piers) g.fillRect(x - 8, ay - 6, 42, 12);
      }));
      W.keep = null;
      scatter(220, 30, 66, '#13281a', '#1a3523', 20);
      for (let i = 0; i < T.N; i += 48) lamp(i, i % 96 ? 1 : -1);
    }
    return W;
  }

  // ---------- sprites ---------------------------------------------------------
  function sprite(w, h, fn) { const c = document.createElement('canvas'); c.width = w; c.height = h; fn(c.getContext('2d'), w, h); return c; }
  const GLOW = {
    warm: sprite(128, 128, (g) => {
      const gr = g.createRadialGradient(64, 64, 0, 64, 64, 64);
      gr.addColorStop(0, 'rgba(255,200,130,1)'); gr.addColorStop(0.35, 'rgba(255,170,90,.38)'); gr.addColorStop(1, 'rgba(255,150,70,0)');
      g.fillStyle = gr; g.fillRect(0, 0, 128, 128);
    }),
    cool: sprite(128, 128, (g) => {
      const gr = g.createRadialGradient(64, 64, 0, 64, 64, 64);
      gr.addColorStop(0, 'rgba(200,220,255,1)'); gr.addColorStop(0.4, 'rgba(160,190,255,.3)'); gr.addColorStop(1, 'rgba(140,170,255,0)');
      g.fillStyle = gr; g.fillRect(0, 0, 128, 128);
    }),
  };
  const BEAM = sprite(256, 160, (g) => {
    const gr = g.createRadialGradient(0, 80, 0, 0, 80, 256);
    gr.addColorStop(0, 'rgba(255,240,205,.9)'); gr.addColorStop(0.5, 'rgba(255,230,190,.25)'); gr.addColorStop(1, 'rgba(255,230,190,0)');
    g.fillStyle = gr; g.beginPath(); g.moveTo(0, 70); g.lineTo(256, 0); g.lineTo(256, 160); g.lineTo(0, 90); g.closePath(); g.fill();
  });

  // ---------- cars -------------------------------------------------------------
  function rr(g, x, y, w, h, r) {
    g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r);
    g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath();
  }
  function bodyPath(g, s) {
    const L = s.len, W = s.wid;
    if (s.style === 'wedge') {
      g.beginPath(); g.moveTo(L / 2, -W * 0.26); g.lineTo(L / 2, W * 0.26); g.lineTo(-L * 0.18, W / 2);
      g.lineTo(-L / 2, W / 2); g.lineTo(-L / 2, -W / 2); g.lineTo(-L * 0.18, -W / 2); g.closePath();
    } else rr(g, -L / 2, -W / 2, L, W, W * (s.style === 'bubble' ? 0.45 : s.style === 'hyper' ? 0.42 : 0.3));
  }
  // Draws a car centred at the origin pointing +x. ghost: translucent outline only.
  function drawCarLocal(g, s, ghost, brake, rev) {
    const L = s.len, W = s.wid;
    if (ghost) {
      bodyPath(g, s); g.fillStyle = 'rgba(169,210,255,.34)'; g.fill();
      g.strokeStyle = 'rgba(190,222,255,.95)'; g.lineWidth = 2.2; g.stroke();
      return;
    }
    g.save(); g.translate(2.5, 3.5); bodyPath(g, s); g.fillStyle = 'rgba(0,0,0,.5)'; g.fill(); g.restore();
    bodyPath(g, s); g.fillStyle = s.body; g.fill();
    g.fillStyle = '#0c1117';
    if (s.style === 'bubble') {
      rr(g, -L * 0.3, -W * 0.36, L * 0.52, W * 0.72, W * 0.3); g.fill();
      g.fillStyle = s.roof; rr(g, -L * 0.24, -W * 0.3, L * 0.36, W * 0.6, W * 0.26); g.fill();
    } else if (s.style === 'gt') {
      rr(g, -L * 0.34, -W * 0.36, L * 0.42, W * 0.72, 3); g.fill();
      g.fillStyle = s.roof; rr(g, -L * 0.27, -W * 0.31, L * 0.24, W * 0.62, 2); g.fill();
      g.strokeStyle = 'rgba(0,0,0,.35)'; g.lineWidth = 1; g.beginPath(); g.moveTo(L * 0.12, 0); g.lineTo(L * 0.45, 0); g.stroke();
    } else if (s.style === 'hyper') {
      g.beginPath(); g.ellipse(L * 0.02, 0, L * 0.24, W * 0.3, 0, 0, 7); g.fill();
      g.fillStyle = '#20252b'; g.fillRect(-L * 0.5, -W * 0.5, L * 0.08, W);
      g.fillStyle = '#111'; g.fillRect(-L * 0.18, -W * 0.5, L * 0.16, 2.2); g.fillRect(-L * 0.18, W * 0.5 - 2.2, L * 0.16, 2.2);
    } else {
      g.beginPath(); g.moveTo(L * 0.16, -W * 0.28); g.lineTo(L * 0.16, W * 0.28); g.lineTo(-L * 0.1, W * 0.36); g.lineTo(-L * 0.1, -W * 0.36); g.closePath(); g.fill();
      g.strokeStyle = 'rgba(0,0,0,.45)'; g.lineWidth = 1.2; g.beginPath();
      for (let k = 0; k < 4; k++) { const x = -L * 0.18 - k * L * 0.07; g.moveTo(x, -W * 0.3); g.lineTo(x, W * 0.3); }
      g.stroke();
    }
    const hy = s.style === 'wedge' ? 0.24 : 0.42, hh = s.style === 'wedge' ? 0.14 : 0.2;
    g.fillStyle = '#fff4d6';
    g.fillRect(L / 2 - 3, -W * hy, 2.5, W * hh); g.fillRect(L / 2 - 3, W * (hy - hh), 2.5, W * hh);
    g.fillStyle = rev ? '#f4f6ff' : brake ? '#ff3b3b' : '#8a1c1c';
    g.fillRect(-L / 2 + 0.5, -W * 0.42, 2, W * 0.22); g.fillRect(-L / 2 + 0.5, W * 0.2, 2, W * 0.22);
  }
  function drawCar(g, s, x, y, a, ghost, brake, rev) {
    g.save(); g.translate(x, y); g.rotate(a); drawCarLocal(g, s, ghost, brake, rev); g.restore();
  }

  // ---------- canvas, camera, rendering ----------------------------------------
  const view = $('view'), g = view.getContext('2d');
  // quality: Low (or Auto once it has stepped down, for the rest of the session) draws at 1x in every view
  let autoLow = false;
  const lowQ = () => save.quality === 'low' || (save.quality === 'auto' && autoLow);
  const fullCap = () => (lowQ() ? 1 : Math.min(2, window.devicePixelRatio || 1));
  let vw = 0, vh = 0, dpr = 1, dprCap = fullCap();
  // cam.x/y is the world point drawn at screen (vw/2, vh*cam.fy); cam.r turns the world (follow mode: car heading up)
  const cam = { x: 0, y: 0, z: 0.7, r: 0, fy: 0.5, lx: 0, ly: 0, ax: 0, ay: 0, c: 1, s: 0 };
  const follow = () => save.cam !== 'north';
  const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));
  function camFrame() { cam.ax = vw / 2; cam.ay = vh * cam.fy; cam.c = Math.cos(cam.r); cam.s = Math.sin(cam.r); }
  // chase mode: labels, signs and picks go through the 3D camera; off screen (behind, or too far to read) when it can't see them
  let chaseView = false;
  const OFF = [-1e5, -1e5];
  function toScr(x, y) {
    if (chaseView) { const p = Chase.toScreen(x, y, 0); return p && p[2] < 1100 ? p : OFF; }
    const dx = (x - cam.x) * cam.z, dy = (y - cam.y) * cam.z;
    return [cam.ax + dx * cam.c - dy * cam.s, cam.ay + dx * cam.s + dy * cam.c];
  }
  // where the car is on the screen, for the signs' rays; in Bonnet the car is under the camera, so the middle of the
  // screen just above the bonnet
  const bonnetTop = () => { const r = Chase.carRect(); return r ? r[1] : vh * 0.88; };
  const carScr = (c) => (chaseView && Chase.view === 'bonnet' ? [vw / 2, Math.min(vh * 0.86, bonnetTop() - 40)] : toScr(c.x, c.y));
  function toWorld(sx, sy) {
    const dx = (sx - cam.ax) / cam.z, dy = (sy - cam.ay) / cam.z;
    return [cam.x + dx * cam.c + dy * cam.s, cam.y - dx * cam.s + dy * cam.c];
  }
  function baseZoom() { return Math.max(0.42, Math.min(1.3, Math.min(vw, vh * 0.62) / 520)); }
  function resize() {
    vw = window.innerWidth; vh = window.innerHeight; dpr = dprCap; hudCache = null;
    view.width = Math.round(vw * dpr); view.height = Math.round(vh * dpr);
    if (window.Chase && Chase.ready) Chase.resize(vw, vh, dpr);
    if (state === 'paused' && race) drawRace(0); // behind the pause sheet: the race as it was, not the menu still
    else if (!running()) drawStill();
  }

  let skids = [], lastRear = null;
  function addSkids(c) {
    const s = c.spec, L = s.len, Wd = s.wid;
    const bx = c.x - Math.cos(c.a) * L * 0.32, by = c.y - Math.sin(c.a) * L * 0.32;
    const rx = -Math.sin(c.a) * Wd * 0.38, ry = Math.cos(c.a) * Wd * 0.38;
    const now = [bx + rx, by + ry, bx - rx, by - ry];
    if (c.slip > 0.32 && c.speed > 110 && c.onRoad) {
      if (lastRear) {
        skids.push([lastRear[0], lastRear[1], now[0], now[1]], [lastRear[2], lastRear[3], now[2], now[3]]);
        if (skids.length > 900) skids.splice(0, skids.length - 900);
      }
      lastRear = now;
    } else lastRear = null;
  }

  function render(W, car, ghost) {
    const T = W.T;
    chaseView = false; show3d(false);
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.fillStyle = W.ground; g.fillRect(0, 0, vw, vh);
    const z = cam.z;
    camFrame();
    g.save();
    g.translate(cam.ax, cam.ay); g.scale(z, z); g.rotate(cam.r); g.translate(-cam.x, -cam.y);
    // cull round the screen centre; a turned view needs the radius of its corners
    const [wx, wy] = toWorld(vw / 2, vh / 2), rad = Math.hypot(vw, vh) / 2 / z + 60;
    const hx = cam.r ? rad : vw / 2 / z + 60, hy = cam.r ? rad : vh / 2 / z + 60;
    VIEW.x0 = wx - hx; VIEW.x1 = wx + hx; VIEW.y0 = wy - hy; VIEW.y1 = wy + hy;
    const vis = (o) => o.x + o.r > wx - hx && o.x - o.r < wx + hx && o.y + o.r > wy - hy && o.y - o.r < wy + hy;
    for (const o of W.under) if (vis(o)) o.draw(g);
    g.lineJoin = 'round'; g.lineCap = 'butt';
    const wall = T.hw + T.wall;
    if (W.city) {
      g.strokeStyle = 'rgba(70,72,80,.42)'; g.lineWidth = wall * 2; g.stroke(W.path);
      g.strokeStyle = '#3a3c42'; g.lineWidth = T.hw * 2 + 14; g.stroke(W.path);
      for (const zn of T.zones || []) { g.fillStyle = 'rgba(70,72,80,.42)'; g.beginPath(); g.arc(zn.x, zn.y, zn.r + 10, 0, 7); g.fill(); }
    }
    else {
      g.strokeStyle = W.barrier; g.lineWidth = wall * 2 + 8; g.stroke(W.path);
      g.strokeStyle = W.runoff; g.lineWidth = wall * 2; g.stroke(W.path);
      if (W.extra) W.extra(g);
      g.strokeStyle = '#d9d6cf'; g.lineWidth = T.hw * 2 + 16; g.stroke(W.curbs);
      g.setLineDash([22, 22]); g.strokeStyle = '#b3262c'; g.stroke(W.curbs); g.setLineDash([]);
    }
    g.strokeStyle = W.asphalt; g.lineWidth = T.hw * 2; g.stroke(W.path);
    g.strokeStyle = W.edge; g.lineWidth = T.hw * 2 - 8; g.stroke(W.path);
    g.strokeStyle = W.asphalt; g.lineWidth = T.hw * 2 - 13; g.stroke(W.path);
    for (const zn of T.zones || []) { // turning circle: round piazza with a turn-round arrow
      g.fillStyle = W.asphalt; g.beginPath(); g.arc(zn.x, zn.y, zn.r, 0, 7); g.fill();
      g.strokeStyle = W.edge; g.lineWidth = 3; g.beginPath(); g.arc(zn.x, zn.y, zn.r - 6, 0, 7); g.stroke();
      g.strokeStyle = 'rgba(242,178,76,.55)'; g.lineWidth = 7; g.beginPath(); g.arc(zn.x, zn.y, zn.r * 0.5, 0.6, 5.4); g.stroke();
      const ax = zn.x + Math.cos(5.4) * zn.r * 0.5, ay = zn.y + Math.sin(5.4) * zn.r * 0.5;
      g.fillStyle = 'rgba(242,178,76,.55)'; g.beginPath(); g.moveTo(ax + 14, ay + 6); g.lineTo(ax - 10, ay + 12); g.lineTo(ax + 2, ay - 14); g.fill();
    }
    g.setLineDash([36, 48]); g.strokeStyle = 'rgba(255,255,255,.14)'; g.lineWidth = 3; g.stroke(W.path); g.setLineDash([]);
    // start / finish chequers
    g.save(); g.translate(T.xs[0], T.ys[0]); g.rotate(Math.atan2(T.ty[0], T.tx[0]));
    const n = Math.floor((T.hw * 2) / 12);
    for (let r = 0; r < 2; r++) for (let k = 0; k < n; k++) {
      g.fillStyle = (r + k) % 2 ? '#e8e6e0' : '#16171a';
      g.fillRect(-12 + r * 12, -T.hw + k * ((T.hw * 2) / n), 12, (T.hw * 2) / n);
    }
    g.restore();
    if (skids.length) {
      g.strokeStyle = 'rgba(8,8,10,.42)'; g.lineWidth = 3; g.lineCap = 'round'; g.beginPath();
      for (const s of skids) { g.moveTo(s[0], s[1]); g.lineTo(s[2], s[3]); }
      g.stroke();
    }
    for (const o of W.over) if (vis(o)) o.draw(g);
    if (ghost) drawCar(g, ghost.spec, ghost.x, ghost.y, ghost.a, true);
    if (car) drawCar(g, car.spec, car.x, car.y, car.a, false, car.braking, car.rev);
    // light pass
    g.globalCompositeOperation = 'lighter';
    for (const f of W.floods) if (vis(f)) { g.globalAlpha = f.a; g.drawImage(GLOW[f.c], f.x - f.r, f.y - f.r, f.r * 2, f.r * 2); }
    g.globalAlpha = 0.34;
    for (const l of W.lamps) {
      if (l.x > wx - hx - 140 && l.x < wx + hx + 140 && l.y > wy - hy - 140 && l.y < wy + hy + 140) g.drawImage(GLOW[l.c], l.x - 135, l.y - 135, 270, 270);
    }
    g.globalAlpha = 1;
    if (car) {
      g.save(); g.translate(car.x, car.y); g.rotate(car.a); g.globalAlpha = 0.3;
      g.drawImage(BEAM, car.spec.len * 0.45, -100, 330, 200); g.restore();
    }
    g.globalAlpha = 1; g.globalCompositeOperation = 'source-over';
    g.fillStyle = '#fff1cf';
    for (const l of W.lamps) if (Math.abs(l.x - wx) < hx && Math.abs(l.y - wy) < hy) { g.beginPath(); g.arc(l.x, l.y, 4, 0, 7); g.fill(); }
    g.restore();
    vignette();
    if (W.labels) W.labels();
  }
  function vignette() { // night vignette
    const vg = g.createRadialGradient(vw / 2, vh / 2, Math.min(vw, vh) * 0.32, vw / 2, vh / 2, Math.max(vw, vh) * 0.75);
    vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(0,0,0,.55)');
    g.fillStyle = vg; g.fillRect(0, 0, vw, vh);
  }

  // ---------- chase camera (chase.js, three.js on #view3d under the 2D canvas) ------------------
  // Falls back to Follow while chase.js is still loading or if WebGL is unavailable.
  const view3d = $('view3d');
  let chaseBad = false;
  function chaseNow() {
    if (!is3d(save.cam) || chaseBad || !window.Chase) return false;
    if (!Chase.ready) { Chase.setQuality(lowQ() ? 'low' : 'high'); if (!Chase.init(view3d, dpr)) { chaseBad = true; return false; } }
    return true;
  }
  const is3d = (m) => m === 'chase' || m === 'bonnet';
  function show3d(on) { if (view3d.classList.contains('on') !== on) view3d.classList.toggle('on', on); }
  let chaseFresh = false; // set by startRace: a scene built at the other quality is rebuilt then, never mid-race
  function renderChase(W, car, ghost, dt) {
    show3d(true);
    Chase.build(W, W.T, W.T.def, chaseFresh); chaseFresh = false;
    Chase.setView(save.cam);
    Chase.render(car, ghost, dt);
    g.setTransform(dpr, 0, 0, dpr, 0, 0); g.clearRect(0, 0, vw, vh);
    vignette();
    chaseView = true;
    if (W.labels) W.labels();
  }

  const snapCamera = (car) => { moveCamera(car, 0, true); if (window.Chase && Chase.ready) Chase.snap(car); };
  function moveCamera(car, dt, snap) {
    const look = 0.42, k = snap ? 1 : 1 - Math.exp(-4.5 * dt);
    const mx = (vw / 2 / cam.z) * 0.42, my = (vh / 2 / cam.z) * 0.42;
    if (follow()) {
      // turn the world so the car points up (shortest way round); the car sits low so the road ahead shows
      cam.r = wrap(cam.r + wrap(-(car.a + Math.PI / 2) - cam.r) * (snap ? 1 : 1 - Math.exp(-10 * dt)));
      cam.fy = 0.56;
      // look-ahead along the velocity in the turned frame, eased as an offset so speed can't drag the car up the screen
      const c = Math.cos(cam.r), s = Math.sin(cam.r), fy = (vh * 0.07) / cam.z;
      cam.lx += (Math.max(-mx, Math.min(mx, (car.vx * c - car.vy * s) * look)) - cam.lx) * k;
      cam.ly += (Math.max(-fy, Math.min(fy, (car.vx * s + car.vy * c) * look)) - cam.ly) * k;
      cam.x = car.x + cam.lx * c + cam.ly * s; cam.y = car.y - cam.lx * s + cam.ly * c;
    } else {
      cam.r = 0; cam.fy = 0.5; cam.lx = cam.ly = 0;
      const tx = car.x + Math.max(-mx, Math.min(mx, car.vx * look));
      const ty = car.y + Math.max(-my, Math.min(my, car.vy * look));
      cam.x += (tx - cam.x) * k; cam.y += (ty - cam.y) * k;
    }
    const tz = baseZoom() * (1 - 0.12 * Math.min(1, car.speed / 500));
    cam.z += (tz - cam.z) * (snap ? 1 : 1 - Math.exp(-1.5 * dt));
  }

  // ---------- sound (synthesised, off by default) -----------------------------
  const Snd = {
    ctx: null, on: !!save.sound,
    ensure() {
      if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      const ctx = (this.ctx = new AC());
      const master = (this.master = ctx.createGain()); master.gain.value = this.on ? 0.5 : 0; master.connect(ctx.destination);
      const o1 = ctx.createOscillator(), o2 = ctx.createOscillator(); o1.type = 'sawtooth'; o2.type = 'square';
      const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 600; f.Q.value = 3;
      const mix = ctx.createGain(); mix.gain.value = 0.35;
      const eg = ctx.createGain(); eg.gain.value = 0;
      o1.connect(f); o2.connect(mix); mix.connect(f); f.connect(eg); eg.connect(master);
      const buf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate), d = buf.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
      const ns = ctx.createBufferSource(); ns.buffer = buf; ns.loop = true;
      const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 1800; bp.Q.value = 5;
      const sg = ctx.createGain(); sg.gain.value = 0;
      ns.connect(bp); bp.connect(sg); sg.connect(master);
      o1.start(); o2.start(); ns.start();
      this.e = { o1, o2, f, eg, sg };
    },
    set(on) {
      this.on = on; save.sound = on; persist();
      if (on) this.ensure();
      if (this.master) this.master.gain.setTargetAtTime(on ? 0.5 : 0, this.ctx.currentTime, 0.05);
      syncSoundButtons();
    },
    engine(c, live) {
      if (!this.ctx || !this.on) return;
      const t = this.ctx.currentTime, r = Math.min(1.1, c.speed / c.spec.vmax);
      const gear = Math.min(4, Math.floor(r * 5)), within = r * 5 - gear;
      const hz = 46 + gear * 9 + within * 62;
      this.e.o1.frequency.setTargetAtTime(hz, t, 0.03); this.e.o2.frequency.setTargetAtTime(hz / 2, t, 0.03);
      this.e.f.frequency.setTargetAtTime(380 + r * 1300, t, 0.05);
      this.e.eg.gain.setTargetAtTime(live ? 0.13 + r * 0.09 : 0, t, 0.08);
      this.e.sg.gain.setTargetAtTime(live && c.onRoad ? Math.max(0, Math.min(0.22, (c.slip - 0.28) * 0.6)) : 0, t, 0.05);
    },
    hush() { if (this.e) { const t = this.ctx.currentTime; this.e.eg.gain.setTargetAtTime(0, t, 0.05); this.e.sg.gain.setTargetAtTime(0, t, 0.05); } },
    sleep() { this.hush(); if (this.ctx && this.ctx.state === 'running') this.ctx.suspend(); },
    beep(hz, dur, vol) {
      if (!this.ctx || !this.on) return;
      const t = this.ctx.currentTime, o = this.ctx.createOscillator(), gn = this.ctx.createGain();
      o.type = 'square'; o.frequency.value = hz;
      gn.gain.setValueAtTime(vol || 0.12, t); gn.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.connect(gn); gn.connect(this.master); o.start(t); o.stop(t + dur + 0.02);
    },
  };
  function syncSoundButtons() {
    for (const b of [$('soundBtn'), $('soundBtn2')]) { b.textContent = 'Sound: ' + (Snd.on ? 'on' : 'off'); b.classList.toggle('on', Snd.on); }
    for (const b of [$('camBtn'), $('camBtn2')]) { b.textContent = 'Camera: ' + CAM_NAME[save.cam]; b.classList.toggle('on', follow()); }
    for (const b of [$('qBtn'), $('qBtn2')]) { b.textContent = 'Quality: ' + Q_NAME[save.quality]; b.classList.toggle('on', save.quality !== 'low'); }
    $('fpsBtn').classList.toggle('on', !!save.fps); $('fpsBtn').setAttribute('aria-pressed', save.fps ? 'true' : 'false');
    if (hud.classList.contains('fps') !== !!save.fps) { hud.classList.toggle('fps', !!save.fps); hudCache = null; }
  }
  const CAMS = ['chase', 'bonnet', 'follow', 'north'], CAM_NAME = { chase: 'Chase', bonnet: 'Bonnet', follow: 'Follow', north: 'North-up' };
  if (!CAM_NAME[save.cam]) save.cam = 'chase';
  function setCam(m) { save.cam = m; persist(); syncSoundButtons(); }
  const QUALS = ['auto', 'low', 'high'], Q_NAME = { auto: 'Auto', low: 'Low', high: 'High' };
  if (!Q_NAME[save.quality]) save.quality = 'auto';
  // from the pause sheet the scene is rebuilt straight away when that is quick (under about 300 ms), else at the next race
  function setQuality(q) { save.quality = q; persist(); applyQuality(state === 'paused'); syncSoundButtons(); }
  function applyQuality(now) {
    if (window.Chase && Chase.setQuality(lowQ() ? 'low' : 'high') && now) Chase.rebuild(300);
    dprCap = fullCap(); resize(); fpsText();
  }

  // ---------- frame rate ------------------------------------------------------------
  // a one-second rolling average of the frame times (the test hook can feed fake ones). Auto steps down to Low when it
  // stays under 45 fps for 3 seconds of a race, once per session, and never steps back up
  let fq = [], fsum = 0, fps = 60, lowFor = 0, fpsT = 0, fakeMs = null;
  function fpsTick(ft) {
    fq.push(ft); fsum += ft;
    while (fq.length > 1 && fsum - fq[0] >= 1) fsum -= fq.shift();
    fps = fq.length / fsum;
    if (state === 'race' && save.quality === 'auto' && !autoLow && fsum > 0.9) {
      lowFor = fps < 45 ? lowFor + ft : 0;
      if (lowFor >= 3) stepDown();
    } else lowFor = 0;
    if (save.fps && (fpsT -= ft) <= 0) { fpsT = 0.25; fpsText(); }
  }
  function fpsText() { // "58 fps · 2.0x", and the draw calls in chase
    const ci = chaseView && window.Chase && Chase.ready && Chase.info();
    $('fps').textContent = Math.round(fps) + ' fps \u00b7 ' + (ci ? ci.dpr : dpr).toFixed(1) + 'x' + (ci ? ' \u00b7 ' + ci.calls + ' calls' : '');
  }
  function stepDown() {
    autoLow = true; lowFor = 0; applyQuality(false);
    if (!save.qToast) { save.qToast = true; persist(); banner('Lowered graphics to keep it smooth', false, 2.8, true); }
  }

  // ---------- input ---------------------------------------------------------------
  const touches = new Map();
  const keys = { l: false, r: false };
  function readInput() {
    if (BOT && race) return GL.botInput(race.T, race.car, { digital: true, line: 0.7 });
    let l = keys.l, r = keys.r;
    for (const side of touches.values()) { if (side === 'L') l = true; else r = true; }
    return { left: l, right: r };
  }
  const sideOf = (x) => (x < vw / 2 ? 'L' : 'R');
  const hud = $('hud');
  function onDown(e) {
    if (!running()) return;
    e.preventDefault();
    touches.set(e.pointerId, sideOf(e.clientX));
  }
  function onMove(e) { if (touches.has(e.pointerId)) { e.preventDefault(); touches.set(e.pointerId, sideOf(e.clientX)); } }
  function onUp(e) { touches.delete(e.pointerId); }
  for (const el of [view, hud]) {
    el.addEventListener('pointerdown', onDown, { passive: false });
    el.addEventListener('pointermove', onMove, { passive: false });
  }
  window.addEventListener('pointerup', onUp); window.addEventListener('pointercancel', onUp);
  // stop iOS from scrolling / zooming / long-press selecting during a race
  for (const ev of ['touchstart', 'touchmove']) hud.addEventListener(ev, (e) => { if (e.target.id !== 'pauseBtn') e.preventDefault(); }, { passive: false });
  view.addEventListener('touchstart', (e) => e.preventDefault(), { passive: false });
  document.addEventListener('gesturestart', (e) => e.preventDefault());
  window.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowLeft' || e.key === 'a') keys.l = true;
    if (e.key === 'ArrowRight' || e.key === 'd') keys.r = true;
    if ((e.key === 'Escape' || e.key === 'p') && running()) pause();
  });
  window.addEventListener('keyup', (e) => {
    if (e.key === 'ArrowLeft' || e.key === 'a') keys.l = false;
    if (e.key === 'ArrowRight' || e.key === 'd') keys.r = false;
  });

  // ---------- game state ------------------------------------------------------------
  let state = 'menu';           // menu | count | race | finishing | paused | done
  let pausedFrom = null;
  let cur = 0, race = null, W = null, ghostRec = null, ghostSpec = null, ghostBest = null;
  let cd = 0, acc = 0, finishWait = 0, helpT = 0, bannerT = 0, deltaT = 0;
  let markIdx = 0, navStreet = null, lastZoneCue = null;

  // where you are and where you're heading (real-street routes)
  function updateNav(c) {
    const T = race.T, marks = T.def.marks || [];
    const st = (T.streetNames[T.street[c.idx]] || '').trim() || 'Piazza / passage';
    if (st !== navStreet) {
      navStreet = st; const el = $('navSt'); el.textContent = st;
      el.classList.remove('pop'); void el.offsetWidth; el.classList.add('pop');
    }
    const to = markIdx < marks.length ? marks[markIdx].name : 'NYX Hotel';
    if ($('navTo').dataset.to !== to) { $('navTo').dataset.to = to; $('navTo').textContent = '\u2192 ' + to; }
  }
  function checkMark(s0, s1) {
    const T = race.T, marks = T.def.marks;
    if (!marks || markIdx >= marks.length) return;
    let d = s1 - s0;
    if (d < -T.L / 2) d += T.L;
    if (d <= 0 || d > T.L / 2) return;
    const m = marks[markIdx].s, a = s0, b = s0 + d;
    if ((a < m && b >= m) || (a < m + T.L && b >= m + T.L)) {
      banner(marks[markIdx].name.toUpperCase(), false, 1.8);
      Snd.beep(784, 0.12); setTimeout(() => Snd.beep(1046, 0.2), 120);
      markIdx++;
    }
  }

  // minimap for the city routes: whole route, hotel, you and the ghost
  let miniBg = null, miniF = null;
  function prepMini(T) {
    const el = $('mini');
    if (!T.def.city) { el.style.display = 'none'; miniBg = null; return; }
    el.style.display = 'block';
    const d = Math.min(2, window.devicePixelRatio || 1), w = 108, h = 108;
    el.width = w * d; el.height = h * d;
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (let i = 0; i < T.N; i++) { minX = Math.min(minX, T.xs[i]); maxX = Math.max(maxX, T.xs[i]); minY = Math.min(minY, T.ys[i]); maxY = Math.max(maxY, T.ys[i]); }
    const k = Math.min((w - 16) / (maxX - minX), (h - 16) / (maxY - minY));
    const ox = (w - (maxX - minX) * k) / 2 - minX * k, oy = (h - (maxY - minY) * k) / 2 - minY * k;
    miniF = (x, y) => [x * k + ox, y * k + oy];
    miniBg = sprite(w * d, h * d, (c) => {
      c.scale(d, d);
      c.fillStyle = 'rgba(11,13,18,.72)'; rr(c, 0, 0, w, h, 12); c.fill();
      if (ROME) {
        c.strokeStyle = 'rgba(40,80,110,.9)'; c.lineWidth = 92 * ROME.S * k; c.lineCap = 'round';
        for (const r of ROME.river) { c.beginPath(); for (let i = 0; i < r.length; i += 2) c.lineTo(...miniF(r[i], r[i + 1])); c.stroke(); }
      }
      c.strokeStyle = '#8b93a1'; c.lineWidth = 2.2; c.lineJoin = 'round'; c.beginPath();
      for (let i = 0; i < T.N; i += 2) c.lineTo(...miniF(T.xs[i], T.ys[i]));
      c.closePath(); c.stroke();
      c.fillStyle = '#fff';
      for (const m of T.def.marks || []) { const i = Math.round(m.s / T.ds) % T.N; c.beginPath(); c.arc(...miniF(T.xs[i], T.ys[i]), 2.6, 0, 7); c.fill(); }
      c.fillStyle = '#f2b24c'; c.beginPath(); c.arc(...miniF(T.xs[0], T.ys[0]), 3.6, 0, 7); c.fill();
    });
  }
  function drawMini(car, ghost) {
    if (!miniBg) return;
    const el = $('mini'), c = el.getContext('2d'), d = el.width / 108;
    c.setTransform(1, 0, 0, 1, 0, 0); c.clearRect(0, 0, el.width, el.height); c.drawImage(miniBg, 0, 0);
    c.setTransform(d, 0, 0, d, 0, 0);
    if (ghost) { c.fillStyle = '#a9d2ff'; c.beginPath(); c.arc(...miniF(ghost.x, ghost.y), 2.6, 0, 7); c.fill(); }
    c.save(); c.translate(...miniF(car.x, car.y)); c.rotate(car.a); // north-up map, car as a heading arrow
    c.fillStyle = '#ff5a5f'; c.strokeStyle = '#fff'; c.lineWidth = 1.2; c.lineJoin = 'round';
    c.beginPath(); c.moveTo(6, 0); c.lineTo(-4, -3.8); c.lineTo(-4, 3.8); c.closePath(); c.fill(); c.stroke(); c.restore();
  }
  const running = () => state === 'count' || state === 'race' || state === 'finishing';
  let carIdx = Math.max(0, GL.CARS.findIndex((c) => c.id === save.car));
  const spec = () => GL.CARS[carIdx];
  const tsave = (i) => save.tracks[GL.TRACKS[i].id];
  const CIRC = GL.TRACKS.map((_, i) => i).filter((i) => !GL.TRACKS[i].city);
  const prevCirc = (i) => CIRC[CIRC.indexOf(i) - 1];
  const unlocked = (i) => {
    if (GL.TRACKS[i].city || CIRC.indexOf(i) <= 0) return true;
    const p = prevCirc(i);
    return !!(tsave(p) && medalOf(GL.TRACKS[p], tsave(p).best) >= 1);
  };

  function showScreen(id) {
    for (const s of ['menu', 'hud']) $(s).classList.toggle('on', s === id);
  }
  function sheet(id, on) { $(id).classList.toggle('on', on); }

  function banner(text, warn, secs, small) {
    const b = $('banner'); b.textContent = text; b.classList.toggle('warn', !!warn); b.classList.toggle('small', !!small); b.classList.add('show');
    bannerT = secs || 1.4;
  }
  function showDelta() {
    const k = race.splits.length - 1;
    if (!ghostBest || !ghostBest.splits || ghostBest.splits[k] == null) return;
    const d = race.splits[k] - ghostBest.splits[k], el = $('delta');
    el.textContent = (d < 0 ? '−' : '+') + Math.abs(d).toFixed(2);
    el.className = 'num show ' + (d < 0 ? 'fast' : 'slow');
    deltaT = 2.4;
  }

  function startRace(i) {
    cur = i; W = world(i);
    const T = BUILT[i];
    race = GL.newRace(T, spec());
    const rec = tsave(i);
    ghostBest = rec || null;
    ghostRec = rec && rec.rec && rec.rec.length ? rec.rec : null;
    ghostSpec = rec ? GL.carById(rec.car) : null;
    $('ghostT').textContent = rec ? 'ghost ' + fmt(rec.best) : '';
    skids = []; lastRear = null; touches.clear(); acc = 0; cd = 0; finishWait = 0; deltaT = 0; bannerT = 0;
    $('delta').className = 'num'; $('banner').className = '';
    $('lapV').textContent = '1/' + T.laps; $('timeV').textContent = fmt(0);
    markIdx = 0; navStreet = null; lastZoneCue = null; hud.classList.toggle('city', !!T.def.city); prepMini(T); $('gear').classList.remove('on'); hudCache = null;
    chaseFresh = true; fq = []; fsum = 0; lowFor = 0; fpsT = 0;
    if (T.def.city) updateNav(race.car);
    snapCamera(race.car);
    sheet('pause', false); sheet('finish', false);
    showScreen('hud');
    helpT = save.help ? 5.5 : 0;
    hud.classList.toggle('help', helpT > 0);
    $('lights').className = 'on'; for (const l of $('lights').children) l.className = '';
    state = 'count';
    if (Snd.on) Snd.ensure();
    wake(true);
    startLoop();
  }

  function onEvent(ev) {
    if (ev === 'split') showDelta();
    if (ev === 'lap') {
      showDelta();
      banner(race.lap === race.T.laps - 1 ? 'FINAL LAP' : 'LAP ' + (race.lap + 1));
      markIdx = 0;
      Snd.beep(880, 0.18);
    }
    if (ev === 'finish') {
      showDelta();
      state = 'finishing'; finishWait = 1.5;
      banner('ARRIVO!', false, 1.5);
      Snd.beep(660, 0.14); setTimeout(() => Snd.beep(990, 0.3), 140);
      recordResult();
    }
  }

  let lastResult = null;
  function recordResult() {
    const def = GL.TRACKS[cur], prev = tsave(cur), t = race.finishT;
    const wasUnlocked = GL.TRACKS.map((_, i) => unlocked(i));
    const isBest = !prev || t < prev.best;
    if (isBest) save.tracks[def.id] = { best: t, laps: race.laps.slice(), splits: race.splits.slice(), rec: race.rec.slice(), car: spec().id };
    save.help = false;
    persist();
    const newly = GL.TRACKS.findIndex((_, i) => !wasUnlocked[i] && unlocked(i));
    lastResult = { t, prev, isBest, medal: medalOf(def, t), newly };
  }

  function showFinish() {
    const def = GL.TRACKS[cur], r = lastResult;
    $('finTrack').textContent = def.name.toUpperCase();
    $('finT').textContent = fmt(r.t);
    const m = $('finMedal');
    m.className = 'medalBig ' + ['n', 'b', 's', 'g'][r.medal]; m.textContent = r.medal ? MEDAL[r.medal] : 'NO MEDAL';
    let msg;
    if (!r.prev) msg = 'First run in the books. <b>Your ghost</b> races you next time.';
    else if (r.isBest) msg = 'New best by ' + (r.prev.best - r.t).toFixed(2) + 's. <b>Ghost updated.</b>';
    else msg = '+' + (r.t - r.prev.best).toFixed(2) + 's off your best (' + fmt(r.prev.best) + ').';
    const best = tsave(cur).best, bm = medalOf(def, best);
    if (bm < 3) msg += '<br>' + MEDAL[bm + 1][0] + MEDAL[bm + 1].slice(1).toLowerCase() + ' at ' + fmt(def.medals[2 - bm]) + ' (' + (best - def.medals[2 - bm]).toFixed(2) + 's to find).';
    else msg += '<br>Gold. Imperatore.';
    if (r.newly >= 0) msg += '<br><span style="color:var(--amber)">' + GL.TRACKS[r.newly].name + ' unlocked.</span>';
    if (def.city) {
      const mins = Math.round((def.km / 4.8) * 60);
      msg += '<div class="via"><small>YOUR ROUTE \u00b7 ' + def.km.toFixed(1) + ' KM \u00b7 ABOUT ' + mins + ' MIN ON FOOT</small>' +
        def.via.map((n) => '<span>' + n + '</span>').join(' \u2192 ') + '</div>';
    }
    $('finMsg').innerHTML = msg;
    const bl = Math.min(...race.laps);
    $('finLaps').innerHTML = race.laps.map((t, k) => '<div class="' + (t === bl ? 'best' : '') + '"><small>LAP ' + (k + 1) + '</small>' + fmt(t) + '</div>').join('');
    sheet('finish', true);
  }

  function pause() {
    if (!running()) return;
    pausedFrom = state; state = 'paused';
    stopLoop(); touches.clear(); Snd.hush(); wake(false);
    $('pauseT').textContent = fmt(race.t);
    sheet('pause', true);
  }
  function resume() {
    sheet('pause', false);
    state = pausedFrom || 'race'; pausedFrom = null;
    if (race) snapCamera(race.car);
    if (Snd.on) Snd.ensure();
    wake(true); startLoop();
  }
  function toMenu() {
    stopLoop(); state = 'menu'; Snd.sleep(); wake(false);
    sheet('pause', false); sheet('finish', false);
    showScreen('menu'); buildMenu(); drawStill();
  }

  // ---------- loop ------------------------------------------------------------------
  let raf = 0, last = 0, ftAcc = 0, ftN = 0;
  function startLoop() { if (!raf) { last = 0; raf = requestAnimationFrame(frame); } }
  function stopLoop() { if (raf) cancelAnimationFrame(raf); raf = 0; }
  function frame(ts) {
    raf = requestAnimationFrame(frame);
    const raw = last ? (ts - last) / 1000 : 1 / 60, real = Math.min(0.1, raw);
    last = ts;
    // drop resolution if this phone is struggling (keeps 60fps and battery); Low is at 1x already
    const ft = fakeMs != null ? fakeMs / 1000 : null;
    ftAcc += ft != null ? ft : real; ftN++;
    if (ftN === 90) {
      if (ftAcc / ftN > 0.022 && dprCap > 1) { dprCap = Math.max(1, dprCap - 0.5); resize(); }
      ftAcc = 0; ftN = 0;
    }
    fpsTick(ft != null ? ft : Math.min(1, raw));
    update(real);
    if (!race) return;
    drawRace(real * FAST);
  }
  function drawRace(dt) {
    let gpose = null;
    if (ghostRec && state !== 'count') {
      const p = GL.ghostAt(ghostRec, race.t);
      if (p) { p.spec = ghostSpec; gpose = p; }
    } else if (ghostRec) {
      const p = GL.ghostAt(ghostRec, 0.001);
      if (p) { p.spec = ghostSpec; gpose = p; }
    }
    if (chaseNow()) renderChase(W, race.car, gpose, dt);
    else render(W, race.car, gpose);
    drawMini(race.car, gpose);
  }

  function update(dt) {
    const c = race.car;
    if (state === 'count') {
      cd += dt * FAST;
      const lights = $('lights').children, lit = Math.floor(cd / 0.6);
      for (let k = 0; k < 3; k++) lights[k].className = k < lit ? 'r' : '';
      if (lit > (update.lit || 0) && lit <= 3) Snd.beep(440, 0.12);
      update.lit = lit;
      if (cd >= 2.4) {
        state = 'race'; update.lit = 0;
        $('lights').className = 'on go'; setTimeout(() => { if (state !== 'count') $('lights').className = ''; }, 700);
        Snd.beep(880, 0.35);
      }
      moveCamera(c, dt * FAST);
      Snd.engine(c, true);
      return;
    }
    if (state === 'race') {
      acc += dt * FAST;
      while (acc >= GL.DT && state === 'race') {
        acc -= GL.DT;
        const inp = readInput();
        c.braking = (!!(inp.left && inp.right) || !!inp.brake) && !c.rev;
        const s0 = c.s;
        const ev = GL.stepRace(race, inp);
        if (race.T.def.city) checkMark(s0, c.s);
        if (ev) onEvent(ev);
      }
      if (!chaseView) addSkids(c);
      if (race.T.def.city) updateNav(c);
      if (c.zone && c.zdone !== c.zone && c.zone !== lastZoneCue) { banner('\u21ba TURN ROUND', false, 1.8); lastZoneCue = c.zone; }
      if (!c.zone && c.zdone == null) lastZoneCue = null;
      $('lapV').textContent = Math.min(race.lap + 1, race.T.laps) + '/' + race.T.laps;
      $('timeV').textContent = fmt(race.t);
      if (race.wrong > 1.2) banner('WRONG WAY', true, 0.3);
      $('gear').classList.toggle('on', !!c.rev);
    } else if (state === 'finishing') {
      const k = Math.exp(-2.2 * dt);
      c.vx *= k; c.vy *= k; c.x += c.vx * dt; c.y += c.vy * dt; c.speed = Math.hypot(c.vx, c.vy); c.slip = 0; c.braking = true;
      $('timeV').textContent = fmt(race.finishT); $('gear').classList.remove('on');
      $('lapV').textContent = race.T.laps + '/' + race.T.laps;
      finishWait -= dt * FAST;
      if (finishWait <= 0) {
        state = 'done'; Snd.hush(); wake(false); stopLoop(); showFinish();
      }
    }
    moveCamera(c, dt * FAST);
    Snd.engine(c, state === 'race');
    if (helpT > 0) { helpT -= dt; if (helpT <= 0) hud.classList.remove('help'); }
    if (bannerT > 0) { bannerT -= dt; if (bannerT <= 0) $('banner').classList.remove('show'); }
    if (deltaT > 0) { deltaT -= dt; if (deltaT <= 0) $('delta').classList.remove('show'); }
  }

  // still frame behind the menu
  function drawStill() {
    if (!vw) return;
    const i = Math.max(0, CIRC.findIndex((k, n) => n + 1 >= CIRC.length || !unlocked(CIRC[n + 1])));
    const firstCity = GL.TRACKS.findIndex((t) => t.city);
    const idx = firstCity >= 0 ? firstCity : CIRC[Math.min(i, CIRC.length - 1)];
    const Wd = world(idx);
    const c = GL.newCar(BUILT[idx], spec());
    snapCamera(c); cam.r = 0; cam.fy = 0.5; cam.z = baseZoom() * 1.1;
    cam.y += vh * 0.18 / cam.z;
    render(Wd, c, null);
  }

  // ---------- wake lock (keeps the screen on mid-race; harmless if unsupported) -------
  let lock = null;
  async function wake(on) {
    try {
      if (on && !lock && navigator.wakeLock) { lock = await navigator.wakeLock.request('screen'); lock.addEventListener('release', () => { lock = null; }); }
      if (!on && lock) { await lock.release(); lock = null; }
    } catch (e) { lock = null; }
  }

  // ---------- menu -----------------------------------------------------------------
  const carView = $('carView'), cg = carView.getContext('2d');
  function drawGarage() {
    const s = spec();
    const r = carView.getBoundingClientRect(), d = Math.min(3, window.devicePixelRatio || 1);
    carView.width = Math.max(1, Math.round(r.width * d)); carView.height = Math.max(1, Math.round(r.height * d));
    cg.setTransform(d, 0, 0, d, 0, 0);
    cg.clearRect(0, 0, r.width, r.height);
    const gr = cg.createRadialGradient(r.width / 2, r.height / 2, 4, r.width / 2, r.height / 2, r.width / 2);
    gr.addColorStop(0, 'rgba(242,178,76,.16)'); gr.addColorStop(1, 'rgba(242,178,76,0)');
    cg.fillStyle = gr; cg.fillRect(0, 0, r.width, r.height);
    cg.save(); cg.translate(r.width / 2, r.height / 2);
    const k = Math.min((r.width * 0.62) / s.len, (r.height * 0.7) / s.wid, 5.2);
    cg.scale(k, k); cg.rotate(-0.12); drawCarLocal(cg, s, false, false); cg.restore();
    $('carName').textContent = s.name;
    $('carTag').textContent = s.tag;
    $('carDots').innerHTML = GL.CARS.map((_, i) => '<i class="' + (i === carIdx ? 'on' : '') + '"></i>').join('');
    const span = (key) => { const v = GL.CARS.map((c) => c[key]); return [Math.min(...v), Math.max(...v)]; };
    const bar = (label, key) => { const [lo, hi] = span(key); const f = 0.2 + 0.8 * ((s[key] - lo) / (hi - lo || 1)); return '<span>' + label + '</span><div class="bar"><b style="width:' + (f * 100).toFixed(0) + '%"></b></div>'; };
    $('carStats').innerHTML = bar('Top speed', 'vmax') + bar('Acceleration', 'accel') + bar('Grip', 'grip') + bar('Steering', 'turn');
  }
  function pickCar(d) {
    carIdx = (carIdx + d + GL.CARS.length) % GL.CARS.length;
    save.car = spec().id; persist(); drawGarage();
  }
  $('carPrev').onclick = () => pickCar(-1);
  $('carNext').onclick = () => pickCar(1);
  carView.onclick = () => pickCar(1);

  function miniMap(cv, T) {
    const d = Math.min(3, window.devicePixelRatio || 1), w = 76, h = 60;
    cv.width = w * d; cv.height = h * d;
    const c = cv.getContext('2d'); c.setTransform(d, 0, 0, d, 0, 0);
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (let i = 0; i < T.N; i++) { minX = Math.min(minX, T.xs[i]); maxX = Math.max(maxX, T.xs[i]); minY = Math.min(minY, T.ys[i]); maxY = Math.max(maxY, T.ys[i]); }
    const k = Math.min((w - 12) / (maxX - minX), (h - 12) / (maxY - minY));
    const ox = (w - (maxX - minX) * k) / 2 - minX * k, oy = (h - (maxY - minY) * k) / 2 - minY * k;
    c.strokeStyle = '#8b93a1'; c.lineWidth = 3; c.lineJoin = 'round'; c.beginPath();
    for (let i = 0; i < T.N; i += 3) c.lineTo(T.xs[i] * k + ox, T.ys[i] * k + oy);
    c.closePath(); c.stroke();
    c.fillStyle = '#f2b24c'; c.beginPath(); c.arc(T.xs[0] * k + ox, T.ys[0] * k + oy, 3.5, 0, 7); c.fill();
  }

  function buildMenu() {
    const list = $('trackList'), rl = $('romeList');
    list.innerHTML = ''; rl.innerHTML = '';
    $('romeSec').hidden = !ROME;
    if (ROME) {
      $('romeNote').innerHTML = ROME.synthetic ? '<b style="color:var(--red)">TEST MAP: not real streets.</b>' :
        'Real streets round the NYX. The street you\u2019re on shows at the top.';
      $('osmCredit').hidden = false;
    }
    GL.TRACKS.forEach((def, i) => {
      const rec = save.tracks[def.id], open = unlocked(i), m = rec ? medalOf(def, rec.best) : 0;
      const b = document.createElement('button');
      b.className = 'card' + (open ? '' : ' locked');
      let line;
      if (!open) line = 'Bronze on ' + GL.TRACKS[prevCirc(i)].name + ' unlocks';
      else if (!rec) line = 'No time yet<br><span style="color:var(--dim)">Bronze ' + fmt(def.medals[2]) + '</span>';
      else {
        line = 'Best <b class="num">' + fmt(rec.best) + '</b><br><span class="gh">' + GL.carById(rec.car).name + '</span>';
        if (m < 3) line += '<span style="color:var(--dim)"> &middot; ' + MEDAL[m + 1][0] + MEDAL[m + 1].slice(1).toLowerCase() + ' ' + fmt(def.medals[2 - m]) + '</span>';
      }
      const blurb = def.city ? def.blurb + '<br>' + def.km.toFixed(1) + ' km round trip \u00b7 about ' + Math.round((def.km / 4.8) * 60) + ' min on foot' : def.blurb;
      b.innerHTML = '<canvas></canvas><div><div class="t">' + def.name + '</div><div class="b">' + blurb + '</div><div class="best">' + line + '</div></div>' +
        '<div style="display:grid;gap:8px;justify-items:end"><div class="medals"><i class="medal b' + (m >= 1 ? ' on' : '') + '"></i><i class="medal s' + (m >= 2 ? ' on' : '') + '"></i><i class="medal g' + (m >= 3 ? ' on' : '') + '"></i></div><span class="go">' + (open ? '&#8250;' : '&#128274;') + '</span></div>';
      miniMap(b.querySelector('canvas'), BUILT[i]);
      b.onclick = () => { if (open) startRace(i); };
      (def.city ? rl : list).appendChild(b);
    });
    drawGarage();
    syncSoundButtons();
  }

  $('pauseBtn').addEventListener('pointerdown', (e) => { e.stopPropagation(); e.preventDefault(); pause(); });
  $('resumeBtn').onclick = resume;
  $('restartBtn').onclick = () => startRace(cur);
  $('quitBtn').onclick = toMenu;
  $('againBtn').onclick = () => startRace(cur);
  $('menuBtn').onclick = toMenu;
  $('soundBtn').onclick = () => Snd.set(!Snd.on);
  $('soundBtn2').onclick = () => Snd.set(!Snd.on);
  $('camBtn').onclick = $('camBtn2').onclick = () => setCam(CAMS[(CAMS.indexOf(save.cam) + 1) % CAMS.length]);
  $('qBtn').onclick = $('qBtn2').onclick = () => setQuality(QUALS[(QUALS.indexOf(save.quality) + 1) % QUALS.length]);
  $('fpsBtn').onclick = () => { save.fps = !save.fps; persist(); fpsT = 0; fpsText(); syncSoundButtons(); };

  document.addEventListener('visibilitychange', () => { if (document.hidden) pause(); });
  window.addEventListener('pagehide', pause);
  window.addEventListener('blur', pause);
  window.addEventListener('resize', () => { resize(); if (state === 'menu') drawGarage(); });

  // ---------- offline ------------------------------------------------------------------
  const ASSETS = ['./', 'index.html', 'core.js', 'game.js', 'hub.js', 'engine.js', 'coach.js', 'vendor/chess.js', 'vendor/stockfish-19-lite-single.js',
    'vendor/stockfish-19-lite-single.wasm', 'openings.js', 'lessons.js', 'learn.js', 'chase.js', 'chase-cars.js', 'vendor/three/three.module.min.js', 'vendor/three/three.core.min.js',
    'vendor/pieces/wK.svg', 'vendor/pieces/wQ.svg', 'vendor/pieces/wR.svg', 'vendor/pieces/wB.svg', 'vendor/pieces/wN.svg', 'vendor/pieces/wP.svg', 'vendor/pieces/bK.svg', 'vendor/pieces/bQ.svg', 'vendor/pieces/bR.svg', 'vendor/pieces/bB.svg', 'vendor/pieces/bN.svg', 'vendor/pieces/bP.svg', 'manifest.webmanifest', 'icon-180.png', 'icon-192.png', 'icon-512.png'].concat(ROME ? ['rome.js'] : []);
  async function offline() {
    const el = $('offline');
    if (!('serviceWorker' in navigator) || !window.caches || !window.isSecureContext) {
      el.textContent = 'Offline needs the installed version'; return;
    }
    try {
      await navigator.serviceWorker.register('sw.js');
      await navigator.serviceWorker.ready;
      for (let k = 0; k < 40; k++) {
        let ok = true;
        for (const a of ASSETS) if (!(await caches.match(a))) { ok = false; break; }
        if (ok) { el.textContent = '✓ Ready offline'; el.classList.add('ok'); return; }
        await new Promise((r) => setTimeout(r, 400));
      }
      el.textContent = 'Not cached yet: reopen while online';
    } catch (e) { el.textContent = 'Offline cache failed'; }
  }

  // test hook (read-only peek for the headless tests)
  window.__ghostlap = { get state() { return state; }, get race() { return race; }, get save() { return save; }, get signs() { return signCount; }, get labels() { return chaseView ? chaseLabels : null; },
    get view() {
      const c = race && race.car, [x, y] = c ? toScr(c.x, c.y) : [0, 0], r = chaseView ? -(Chase.yaw + Math.PI / 2) : cam.r;
      return { mode: save.cam, chase: chaseView, r, x: x / vw, y: y / vh, a: c ? wrap(c.a + r) : 0 };
    },
    get chase() { return window.Chase && Chase.ready ? Chase.info() : null; }, setCam, setQuality, startRace, toMenu,
    get signBoxes() { return signBoxes; },
    get fps() { return { fps: +fps.toFixed(1), lowFor: +lowFor.toFixed(2), autoLow, low: lowQ(), dprCap, text: $('fps').textContent, shown: getComputedStyle($('fps')).display !== 'none' }; },
    set fakeMs(v) { fakeMs = v == null ? null : +v; } }; // test only: frame times (ms) for the fps meter and Auto, instead of the real ones

  resize();
  buildMenu();
  drawStill();
  offline();
})();
