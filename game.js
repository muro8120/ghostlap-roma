// Ghostlap Roma: rendering, input, screens, sound, saving, offline.
(function () {
  'use strict';
  const GL = window.GL;
  const $ = (id) => document.getElementById(id);
  const params = new URLSearchParams(location.search);
  const BOT = params.has('bot');                                   // test autopilot
  const FAST = Math.max(1, Math.min(8, +params.get('fast') || 1)); // test time-warp

  // ---------- saving --------------------------------------------------------
  const KEY = 'ghostlap-roma-v1';
  let save = { car: 'maranello', sound: false, help: true, tracks: {} };
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) save = Object.assign(save, JSON.parse(raw));
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
    return Math.hypot(n.px - x, n.py - y) > T.hw + GL.CAR.wall + r;
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

  function buildWorld(T) {
    const def = T.def, R = rng(def.id.length * 977 + 13);
    const W = {
      T, ground: '#11141a', runoff: '#1d1e20', barrier: '#3d3830', asphalt: '#2a2c31', edge: '#6b6c6c',
      under: [], over: [], lamps: [], floods: [], extra: null,
      path: pathOf(T),
      curbs: pathOf(T, runs(T, (i) => Math.abs(T.curv[i]) > 1 / 700)),
    };
    const out = outwardSign(T);
    const wall = T.hw + GL.CAR.wall;
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
  function drawCarLocal(g, s, ghost, brake) {
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
    g.fillStyle = brake ? '#ff3b3b' : '#8a1c1c';
    g.fillRect(-L / 2 + 0.5, -W * 0.42, 2, W * 0.22); g.fillRect(-L / 2 + 0.5, W * 0.2, 2, W * 0.22);
  }
  function drawCar(g, s, x, y, a, ghost, brake) {
    g.save(); g.translate(x, y); g.rotate(a); drawCarLocal(g, s, ghost, brake); g.restore();
  }

  // ---------- canvas, camera, rendering ----------------------------------------
  const view = $('view'), g = view.getContext('2d');
  let vw = 0, vh = 0, dpr = 1, dprCap = Math.min(2, window.devicePixelRatio || 1);
  const cam = { x: 0, y: 0, z: 0.7 };
  function baseZoom() { return Math.max(0.42, Math.min(1.3, Math.min(vw, vh * 0.62) / 520)); }
  function resize() {
    vw = window.innerWidth; vh = window.innerHeight; dpr = dprCap;
    view.width = Math.round(vw * dpr); view.height = Math.round(vh * dpr);
    if (!running()) drawStill();
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
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.fillStyle = W.ground; g.fillRect(0, 0, vw, vh);
    const z = cam.z;
    g.save();
    g.translate(vw / 2, vh / 2); g.scale(z, z); g.translate(-cam.x, -cam.y);
    const hx = vw / 2 / z + 60, hy = vh / 2 / z + 60;
    const vis = (o) => o.x + o.r > cam.x - hx && o.x - o.r < cam.x + hx && o.y + o.r > cam.y - hy && o.y - o.r < cam.y + hy;
    for (const o of W.under) if (vis(o)) o.draw(g);
    g.lineJoin = 'round'; g.lineCap = 'butt';
    const wall = T.hw + GL.CAR.wall;
    g.strokeStyle = W.barrier; g.lineWidth = wall * 2 + 8; g.stroke(W.path);
    g.strokeStyle = W.runoff; g.lineWidth = wall * 2; g.stroke(W.path);
    if (W.extra) W.extra(g);
    g.strokeStyle = '#d9d6cf'; g.lineWidth = T.hw * 2 + 16; g.stroke(W.curbs);
    g.setLineDash([22, 22]); g.strokeStyle = '#b3262c'; g.stroke(W.curbs); g.setLineDash([]);
    g.strokeStyle = W.asphalt; g.lineWidth = T.hw * 2; g.stroke(W.path);
    g.strokeStyle = W.edge; g.lineWidth = T.hw * 2 - 8; g.stroke(W.path);
    g.strokeStyle = W.asphalt; g.lineWidth = T.hw * 2 - 13; g.stroke(W.path);
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
    if (car) drawCar(g, car.spec, car.x, car.y, car.a, false, car.braking);
    // light pass
    g.globalCompositeOperation = 'lighter';
    for (const f of W.floods) if (vis(f)) { g.globalAlpha = f.a; g.drawImage(GLOW[f.c], f.x - f.r, f.y - f.r, f.r * 2, f.r * 2); }
    g.globalAlpha = 0.34;
    for (const l of W.lamps) {
      if (l.x > cam.x - hx - 140 && l.x < cam.x + hx + 140 && l.y > cam.y - hy - 140 && l.y < cam.y + hy + 140) g.drawImage(GLOW[l.c], l.x - 135, l.y - 135, 270, 270);
    }
    g.globalAlpha = 1;
    if (car) {
      g.save(); g.translate(car.x, car.y); g.rotate(car.a); g.globalAlpha = 0.3;
      g.drawImage(BEAM, car.spec.len * 0.45, -100, 330, 200); g.restore();
    }
    g.globalAlpha = 1; g.globalCompositeOperation = 'source-over';
    g.fillStyle = '#fff1cf';
    for (const l of W.lamps) if (Math.abs(l.x - cam.x) < hx && Math.abs(l.y - cam.y) < hy) { g.beginPath(); g.arc(l.x, l.y, 4, 0, 7); g.fill(); }
    g.restore();
    // night vignette
    const vg = g.createRadialGradient(vw / 2, vh / 2, Math.min(vw, vh) * 0.32, vw / 2, vh / 2, Math.max(vw, vh) * 0.75);
    vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(0,0,0,.55)');
    g.fillStyle = vg; g.fillRect(0, 0, vw, vh);
  }

  function snapCamera(car) { cam.x = car.x; cam.y = car.y; cam.z = baseZoom(); }
  function moveCamera(car, dt) {
    const look = 0.42;
    const mx = (vw / 2 / cam.z) * 0.42, my = (vh / 2 / cam.z) * 0.42;
    const tx = car.x + Math.max(-mx, Math.min(mx, car.vx * look));
    const ty = car.y + Math.max(-my, Math.min(my, car.vy * look));
    const k = 1 - Math.exp(-4.5 * dt);
    cam.x += (tx - cam.x) * k; cam.y += (ty - cam.y) * k;
    const tz = baseZoom() * (1 - 0.12 * Math.min(1, car.speed / 500));
    cam.z += (tz - cam.z) * (1 - Math.exp(-1.5 * dt));
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
  const running = () => state === 'count' || state === 'race' || state === 'finishing';
  let carIdx = Math.max(0, GL.CARS.findIndex((c) => c.id === save.car));
  const spec = () => GL.CARS[carIdx];
  const tsave = (i) => save.tracks[GL.TRACKS[i].id];
  const unlocked = (i) => i === 0 || (tsave(i - 1) && medalOf(GL.TRACKS[i - 1], tsave(i - 1).best) >= 1);

  function showScreen(id) {
    for (const s of ['menu', 'hud']) $(s).classList.toggle('on', s === id);
  }
  function sheet(id, on) { $(id).classList.toggle('on', on); }

  function banner(text, warn, secs) {
    const b = $('banner'); b.textContent = text; b.classList.toggle('warn', !!warn); b.classList.add('show');
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
    $('lapV').textContent = '1/' + GL.LAPS; $('timeV').textContent = fmt(0);
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
      banner(race.lap === GL.LAPS - 1 ? 'FINAL LAP' : 'LAP ' + (race.lap + 1));
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
    const real = last ? Math.min(0.1, (ts - last) / 1000) : 1 / 60;
    last = ts;
    // drop resolution if this phone is struggling (keeps 60fps and battery)
    ftAcc += real; ftN++;
    if (ftN === 90) {
      if (ftAcc / ftN > 0.022 && dprCap > 1) { dprCap = Math.max(1, dprCap - 0.5); resize(); }
      ftAcc = 0; ftN = 0;
    }
    update(real);
    if (!race) return;
    let gpose = null;
    if (ghostRec && state !== 'count') {
      const p = GL.ghostAt(ghostRec, race.t);
      if (p) { p.spec = ghostSpec; gpose = p; }
    } else if (ghostRec) {
      const p = GL.ghostAt(ghostRec, 0.001);
      if (p) { p.spec = ghostSpec; gpose = p; }
    }
    render(W, race.car, gpose);
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
        c.braking = !!(inp.left && inp.right) || !!inp.brake;
        const ev = GL.stepRace(race, inp);
        if (ev) onEvent(ev);
      }
      addSkids(c);
      $('lapV').textContent = Math.min(race.lap + 1, GL.LAPS) + '/' + GL.LAPS;
      $('timeV').textContent = fmt(race.t);
      if (race.wrong > 1.2) banner('WRONG WAY', true, 0.3);
    } else if (state === 'finishing') {
      const k = Math.exp(-2.2 * dt);
      c.vx *= k; c.vy *= k; c.x += c.vx * dt; c.y += c.vy * dt; c.speed = Math.hypot(c.vx, c.vy); c.slip = 0; c.braking = true;
      $('timeV').textContent = fmt(race.finishT);
      $('lapV').textContent = GL.LAPS + '/' + GL.LAPS;
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
    const i = Math.max(0, GL.TRACKS.findIndex((_, k) => !unlocked(k + 1)));
    const idx = Math.min(i, GL.TRACKS.length - 1);
    const Wd = world(idx);
    const c = GL.newCar(BUILT[idx], spec());
    snapCamera(c); cam.z = baseZoom() * 1.1;
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
    const list = $('trackList');
    list.innerHTML = '';
    GL.TRACKS.forEach((def, i) => {
      const rec = save.tracks[def.id], open = unlocked(i), m = rec ? medalOf(def, rec.best) : 0;
      const b = document.createElement('button');
      b.className = 'card' + (open ? '' : ' locked');
      let line;
      if (!open) line = 'Bronze on ' + GL.TRACKS[i - 1].name + ' unlocks';
      else if (!rec) line = 'No time yet<br><span style="color:var(--dim)">Bronze ' + fmt(def.medals[2]) + '</span>';
      else {
        line = 'Best <b class="num">' + fmt(rec.best) + '</b><br><span class="gh">' + GL.carById(rec.car).name + '</span>';
        if (m < 3) line += '<span style="color:var(--dim)"> &middot; ' + MEDAL[m + 1][0] + MEDAL[m + 1].slice(1).toLowerCase() + ' ' + fmt(def.medals[2 - m]) + '</span>';
      }
      b.innerHTML = '<canvas></canvas><div><div class="t">' + def.name + '</div><div class="b">' + def.blurb + '</div><div class="best">' + line + '</div></div>' +
        '<div style="display:grid;gap:8px;justify-items:end"><div class="medals"><i class="medal b' + (m >= 1 ? ' on' : '') + '"></i><i class="medal s' + (m >= 2 ? ' on' : '') + '"></i><i class="medal g' + (m >= 3 ? ' on' : '') + '"></i></div><span class="go">' + (open ? '&#8250;' : '&#128274;') + '</span></div>';
      miniMap(b.querySelector('canvas'), BUILT[i]);
      b.onclick = () => { if (open) startRace(i); };
      list.appendChild(b);
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

  document.addEventListener('visibilitychange', () => { if (document.hidden) pause(); });
  window.addEventListener('pagehide', pause);
  window.addEventListener('blur', pause);
  window.addEventListener('resize', () => { resize(); if (state === 'menu') drawGarage(); });

  // ---------- offline ------------------------------------------------------------------
  const ASSETS = ['./', 'index.html', 'core.js', 'game.js', 'manifest.webmanifest', 'icon-180.png', 'icon-192.png', 'icon-512.png'];
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
  window.__ghostlap = { get state() { return state; }, get race() { return race; }, get save() { return save; }, startRace, toMenu };

  resize();
  buildMenu();
  drawStill();
  offline();
})();
