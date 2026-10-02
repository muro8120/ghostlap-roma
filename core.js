// Ghostlap Roma: track geometry, car physics, lap timing, ghost recording.
// Pure logic, no DOM, so the same code runs in the browser and under node for tests.
(function (root) {
  'use strict';

  const TAU = Math.PI * 2;
  const DT = 1 / 120;          // fixed physics step
  const LAPS = 3;
  const GHOST_HZ = 20;         // ghost samples per second

  // ---- Tracks -------------------------------------------------------------
  // Control points for a closed centripetal Catmull-Rom spline (world units, y down).
  // `w` is the full asphalt width. Decor is placed by game.js from `landmarks`.
  const TRACKS = [
    {
      id: 'circo', name: 'Circo Massimo', blurb: 'The original racetrack. Two long straights, two turns.',
      w: 150, medals: [44, 46.5, 52],
      pts: [
        [-1100, 300], [-500, 300], [100, 300], [700, 300], [1100, 300],
        [1330, 230], [1460, 60], [1440, -150], [1300, -280], [1100, -330],
        [700, -330], [100, -330], [-500, -330], [-1100, -330],
        [-1310, -300], [-1400, -160], [-1400, 130], [-1310, 270],
      ],
      landmarks: { kind: 'circo' },
    },
    {
      id: 'colosseo', name: 'Colosseo', blurb: 'Round the amphitheatre, hairpin at Piazza Venezia.',
      w: 130, medals: [51, 55, 61],
      pts: [
        [600, 200], [520, 520], [200, 720], [-200, 700], [-520, 480],
        [-760, 200], [-1150, 30], [-1650, -80], [-2050, -100],
        [-2280, -260], [-2240, -520], [-1980, -600],
        [-1500, -560], [-1000, -500], [-600, -560], [-200, -700],
        [250, -650], [560, -380],
      ],
      landmarks: { kind: 'colosseo' },
    },
    {
      id: 'tevere', name: 'Lungotevere', blurb: 'Both banks of the Tiber. Two bridges, endless esses.',
      w: 120, medals: [65, 70, 78],
      pts: (function () {
        // Track follows a meandering river: south bank westward, bridge, north bank eastward, bridge.
        const p = [];
        const river = (x) => 200 * Math.sin(x / 520);
        for (let x = 1700; x >= -1700; x -= 340) p.push([x, river(x) + 360]);
        p.push([-2050, river(-2050) + 160], [-2120, river(-2120)], [-2050, river(-2050) - 160]);
        for (let x = -1700; x <= 1700; x += 340) p.push([x, river(x) - 360]);
        p.push([2050, river(2050) - 160], [2120, river(2120)], [2050, river(2050) + 160]);
        return p;
      })(),
      landmarks: { kind: 'tevere' },
    },
    {
      id: 'appia', name: 'Via Appia Antica', blurb: 'Narrow, fast, lined with cypress. For the brave.',
      w: 106, medals: [84.5, 92.5, 103],
      pts: [
        [0, 0], [700, -60], [1300, -280], [1750, -180], [1900, 220],
        [1650, 560], [1250, 560], [950, 700], [780, 920], [880, 1060], [1150, 1080], [1550, 1300],
        [1650, 1650], [1300, 1900], [700, 1850], [250, 1600],
        [-150, 1700], [-600, 1850], [-1050, 1700], [-1150, 1250],
        [-850, 950], [-1050, 600], [-1400, 420], [-1480, 200], [-1300, 60], [-1050, 20], [-550, 40],
      ],
      landmarks: { kind: 'appia' },
    },
  ];

  // Centripetal Catmull-Rom between p1 and p2 (alpha 0.5), closed loop.
  function catmull(p0, p1, p2, p3, t) {
    const a = 0.5;
    const d = (u, v) => Math.pow(Math.hypot(v[0] - u[0], v[1] - u[1]), a) || 1e-4;
    const t0 = 0, t1 = t0 + d(p0, p1), t2 = t1 + d(p1, p2), t3 = t2 + d(p2, p3);
    const tt = t1 + (t2 - t1) * t;
    const lerp = (u, v, ta, tb) => {
      const k = (tt - ta) / (tb - ta);
      return [u[0] + (v[0] - u[0]) * k, u[1] + (v[1] - u[1]) * k];
    };
    const A1 = lerp(p0, p1, t0, t1), A2 = lerp(p1, p2, t1, t2), A3 = lerp(p2, p3, t2, t3);
    const B1 = lerp(A1, A2, t0, t2), B2 = lerp(A2, A3, t1, t3);
    return lerp(B1, B2, t1, t2);
  }

  // Build an arc-length resampled polyline with tangents, normals and curvature.
  function buildTrack(def) {
    const P = def.pts, n = P.length;
    const dense = [], denseSeg = [];
    for (let i = 0; i < n; i++) {
      const p0 = P[(i - 1 + n) % n], p1 = P[i], p2 = P[(i + 1) % n], p3 = P[(i + 2) % n];
      const seg = Math.hypot(p2[0] - p1[0], p2[1] - p1[1]);
      const steps = Math.max(def.names ? 2 : 8, Math.ceil(seg / 4));
      for (let s = 0; s < steps; s++) { dense.push(catmull(p0, p1, p2, p3, s / steps)); denseSeg.push(i); }
    }
    // cumulative length
    const cum = [0];
    for (let i = 1; i <= dense.length; i++) {
      const a = dense[i - 1], b = dense[i % dense.length];
      cum.push(cum[i - 1] + Math.hypot(b[0] - a[0], b[1] - a[1]));
    }
    const L = cum[dense.length];
    const STEP = 10;
    const N = Math.round(L / STEP);
    const xs = new Float32Array(N), ys = new Float32Array(N);
    // street name per sample (real-street routes only)
    const streetNames = def.names ? [...new Set(def.names)] : null;
    const street = streetNames ? new Uint16Array(N) : null;
    let j = 0;
    for (let i = 0; i < N; i++) {
      const s = (i / N) * L;
      while (cum[j + 1] < s) j++;
      if (street) street[i] = streetNames.indexOf(def.names[denseSeg[j]]);
      const a = dense[j], b = dense[(j + 1) % dense.length];
      const k = (s - cum[j]) / (cum[j + 1] - cum[j] || 1);
      xs[i] = a[0] + (b[0] - a[0]) * k;
      ys[i] = a[1] + (b[1] - a[1]) * k;
    }
    const tx = new Float32Array(N), ty = new Float32Array(N), curv = new Float32Array(N);
    for (let i = 0; i < N; i++) {
      const p = (i - 1 + N) % N, q = (i + 1) % N;
      let dx = xs[q] - xs[p], dy = ys[q] - ys[p];
      const m = Math.hypot(dx, dy) || 1;
      tx[i] = dx / m; ty[i] = dy / m;
    }
    for (let i = 0; i < N; i++) {
      const p = (i - 2 + N) % N, q = (i + 2) % N;
      let da = Math.atan2(ty[q], tx[q]) - Math.atan2(ty[p], tx[p]);
      while (da > Math.PI) da -= TAU;
      while (da < -Math.PI) da += TAU;
      curv[i] = da / (4 * (L / N)); // signed, 1/radius
    }
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (let i = 0; i < N; i++) {
      minX = Math.min(minX, xs[i]); maxX = Math.max(maxX, xs[i]);
      minY = Math.min(minY, ys[i]); maxY = Math.max(maxY, ys[i]);
    }
    const hw = def.w / 2;
    return {
      def, id: def.id, name: def.name, N, L, ds: L / N, xs, ys, tx, ty, curv, hw,
      wall: def.wall != null ? def.wall : CAR.wall, laps: def.laps || LAPS, sectors: def.sectors || SECTORS,
      street, streetNames,
      bounds: { minX: minX - hw - 400, minY: minY - hw - 400, maxX: maxX + hw + 400, maxY: maxY + hw + 400 },
    };
  }

  // Nearest centerline sample to (x, y). With a hint index, search locally first.
  function nearest(T, x, y, hint) {
    let best = -1, bd = Infinity;
    if (hint != null && hint >= 0) {
      // Prefer samples close to the last one along the track, so where a route doubles back
      // on itself (round an obelisk, out and back on one street) the car stays on its own side.
      const W = 60, P = (T.ds * 0.35) ** 2;
      let bs = Infinity;
      for (let k = -W; k <= W; k++) {
        const i = (hint + k + T.N) % T.N;
        const dx = x - T.xs[i], dy = y - T.ys[i], d = dx * dx + dy * dy, sc = d + k * k * P;
        if (sc < bs) { bs = sc; bd = d; best = i; }
      }
      // Local result is trustworthy if we are close to the road.
      if (bd < (T.hw * 3) * (T.hw * 3)) return refine(T, x, y, best);
    }
    for (let i = 0; i < T.N; i++) {
      const dx = x - T.xs[i], dy = y - T.ys[i], d = dx * dx + dy * dy;
      if (d < bd) { bd = d; best = i; }
    }
    return refine(T, x, y, best);
  }

  // Project onto the segment between neighbouring samples for smooth progress/offset.
  function refine(T, x, y, i) {
    const j = (i + 1) % T.N, h = (i - 1 + T.N) % T.N;
    let a = i, b = j;
    const dj = (x - T.xs[j]) ** 2 + (y - T.ys[j]) ** 2;
    const dh = (x - T.xs[h]) ** 2 + (y - T.ys[h]) ** 2;
    if (dh < dj) { a = h; b = i; }
    const ax = T.xs[a], ay = T.ys[a], bx = T.xs[b], by = T.ys[b];
    const vx = bx - ax, vy = by - ay;
    const len2 = vx * vx + vy * vy || 1;
    let k = ((x - ax) * vx + (y - ay) * vy) / len2;
    k = Math.max(0, Math.min(1, k));
    const px = ax + vx * k, py = ay + vy * k;
    const s = (a + k) * T.ds;
    // signed lateral offset: + is to the right of travel direction (y-down screen)
    const nx = -T.ty[i], ny = T.tx[i];
    const off = (x - px) * nx + (y - py) * ny;
    return { i, s: ((s % T.L) + T.L) % T.L, off, px, py };
  }

  // ---- Car ---------------------------------------------------------------
  const CAR = {
    vmaxOff: 210,     // top speed off the asphalt
    brake: 700,
    slipDrag: 0.6,
    wall: 70,         // run-off width beyond the asphalt edge before the barrier
  };

  // The garage. Homages to Rome and Modena's Motor Valley, named after towns, not brands.
  // accel: units/s^2 from rest; vmax: top speed; turn: rad/s at full lock;
  // grip: lateral velocity decay /s; scrub: speed lost at full lock; ramp: steering response.
  const CARS = [
    { id: 'cinque', name: 'Cinquecento', tag: 'Roman runabout. Grips like glue, short of breath.',
      accel: 480, vmax: 455, turn: 3.3, grip: 11, scrub: 0.3, ramp: 6.5,
      len: 22, wid: 14, body: '#7fb7c9', roof: '#e9eef0', style: 'bubble' },
    { id: 'maranello', name: 'Maranello 12', tag: 'Front-engined V12 GT. Does everything well.',
      accel: 440, vmax: 475, turn: 2.8, grip: 8, scrub: 0.5, ramp: 5.5,
      len: 30, wid: 15, body: '#c8202a', roof: '#3a0d10', style: 'gt' },
    { id: 'modena', name: 'Modena GT', tag: 'Grand tourer. Heavy, planted, unflappable.',
      accel: 400, vmax: 480, turn: 2.6, grip: 9.5, scrub: 0.45, ramp: 4.6,
      len: 31, wid: 16, body: '#1f3f8f', roof: '#0c1838', style: 'gt' },
    { id: 'sancesario', name: 'San Cesario', tag: 'Carbon hypercar. Brutal shove, nervous hands.',
      accel: 600, vmax: 465, turn: 2.95, grip: 6.8, scrub: 0.6, ramp: 7.5,
      len: 29, wid: 17, body: '#b9c0c8', roof: '#20252b', style: 'hyper' },
    { id: 'santagata', name: "Sant'Agata", tag: 'The wedge. Fastest flat out, loves to slide.',
      accel: 410, vmax: 510, turn: 2.45, grip: 5.6, scrub: 0.66, ramp: 5.2,
      len: 30, wid: 17, body: '#9bd32a', roof: '#1b2410', style: 'wedge' },
  ];
  const carById = (id) => CARS.find((c) => c.id === id) || CARS[1];

  function newCar(T, spec) {
    // Start a little behind the line, pointing along the track.
    const i0 = (T.N - Math.round(45 / T.ds)) % T.N;
    return {
      x: T.xs[i0], y: T.ys[i0], a: Math.atan2(T.ty[i0], T.tx[i0]),
      vx: 0, vy: 0, steer: 0, idx: i0, s: i0 * T.ds, off: 0,
      onRoad: true, bump: 0, slip: 0, speed: 0, spec: spec || CARS[1],
    };
  }

  // input: { left: bool, right: bool } for touch; or { steer: -1..1 } analog (bots).
  function stepCar(T, c, input, dt) {
    const P = c.spec;
    let target;
    let braking = false;
    if (input.steer != null) { target = input.steer; braking = !!input.brake; }
    else {
      target = (input.right ? 1 : 0) - (input.left ? 1 : 0);
      braking = input.left && input.right;
      if (braking) target = 0;
    }
    // Steering ramps so a quick tap is a small correction (forgiving in turbulence).
    const rate = target === 0 ? 9 : (Math.sign(target) !== Math.sign(c.steer) && c.steer !== 0 ? 12 : P.ramp);
    if (c.steer < target) c.steer = Math.min(target, c.steer + rate * dt);
    else if (c.steer > target) c.steer = Math.max(target, c.steer - rate * dt);

    const fx = Math.cos(c.a), fy = Math.sin(c.a);
    const rx = -fy, ry = fx;
    let vF = c.vx * fx + c.vy * fy;
    let vR = c.vx * rx + c.vy * ry;

    const vmax = c.onRoad ? P.vmax : CAR.vmaxOff;
    if (braking) vF -= CAR.brake * dt * Math.sign(vF || 1);
    else if (vF < vmax) vF += P.accel * (1 - Math.max(0, vF) / vmax) * dt;
    if (!c.onRoad) vF *= Math.exp(-1.6 * dt);
    if (vF > vmax) vF += (vmax - vF) * Math.min(1, 2.5 * dt);

    // turning: scale with speed so the car can't spin on the spot
    const sf = Math.min(1, Math.abs(vF) / 140) / (1 + Math.abs(vF) / 1400);
    c.a += c.steer * P.turn * sf * dt * Math.sign(vF || 1);
    vF *= Math.exp(-P.scrub * Math.abs(c.steer) * Math.min(1, Math.abs(vF) / 200) * dt);
    vR *= Math.exp(-(c.onRoad ? P.grip : P.grip * 0.8) * dt);
    vF *= Math.exp(-CAR.slipDrag * Math.abs(vR) / 100 * dt); // sliding costs speed

    const nfx = Math.cos(c.a), nfy = Math.sin(c.a);
    c.vx = nfx * vF + -nfy * vR;
    c.vy = nfy * vF + nfx * vR;
    c.x += c.vx * dt;
    c.y += c.vy * dt;

    const near = nearest(T, c.x, c.y, c.idx);
    c.idx = near.i;
    const prevS = c.s;
    c.s = near.s;
    c.off = near.off;
    const edge = Math.abs(near.off);
    c.onRoad = edge <= T.hw + 4;
    const limit = T.hw + T.wall;
    c.bump = Math.max(0, c.bump - dt);
    if (edge > limit) {
      // Barrier: put the car back inside and bleed speed.
      const k = (edge - limit) * Math.sign(near.off);
      const nx = -T.ty[near.i], ny = T.tx[near.i];
      c.x -= nx * k; c.y -= ny * k;
      const vn = c.vx * nx + c.vy * ny;
      if (vn * Math.sign(near.off) > 0) { c.vx -= nx * vn * 1.4; c.vy -= ny * vn * 1.4; }
      c.vx *= 0.82; c.vy *= 0.82;
      if (c.bump <= 0) c.bump = 0.35;
    }
    c.speed = Math.hypot(c.vx, c.vy);
    c.slip = Math.abs(vR) / (Math.abs(vF) + 60);
    return prevS;
  }

  // ---- Race (timing, checkpoints, ghost recording) -----------------------
  const SECTORS = 4; // checkpoints per lap, including the finish line

  function newRace(T, spec) {
    return {
      T, car: newCar(T, spec), t: 0, lap: 0, next: 1, splits: [], laps: [], lapStart: 0,
      done: false, finishT: 0, rec: [], recAcc: 0, wrong: 0,
    };
  }

  // Advance one fixed step. Returns event name when something happens.
  function stepRace(R, input) {
    const T = R.T, c = R.car;
    const prevS = stepCar(T, c, input, DT);
    R.t += DT;
    let ev = null;
    // forward crossing of the expected checkpoint
    const cp = (R.next % T.sectors) * T.L / T.sectors;
    let d = c.s - prevS;
    if (d < -T.L / 2) d += T.L;
    if (d > T.L / 2) d -= T.L;
    if (d > 0) {
      const from = prevS, to = prevS + d;
      const crossed = (from < cp && to >= cp) || (from < cp + T.L && to >= cp + T.L);
      if (crossed) {
        R.splits.push(R.t);
        if (R.next % T.sectors === 0) {
          R.laps.push(R.t - R.lapStart);
          R.lapStart = R.t;
          R.lap++;
          ev = R.lap >= T.laps ? 'finish' : 'lap';
          if (ev === 'finish') { R.done = true; R.finishT = R.t; }
        } else ev = 'split';
        R.next++;
      }
    }
    // wrong way detector
    const dot = c.vx * T.tx[c.idx] + c.vy * T.ty[c.idx];
    R.wrong = dot < -40 ? R.wrong + DT : 0;
    // ghost sampling
    R.recAcc += DT;
    if (R.recAcc >= 1 / GHOST_HZ - 1e-9) {
      R.recAcc -= 1 / GHOST_HZ;
      R.rec.push(Math.round(c.x * 10) / 10, Math.round(c.y * 10) / 10, Math.round(c.a * 1000) / 1000);
    }
    return ev;
  }

  // Ghost pose at race time t from a recording (flat [x,y,a,...] at GHOST_HZ).
  function ghostAt(rec, t) {
    const n = rec.length / 3;
    if (n < 2) return null;
    const f = t * GHOST_HZ - 1; // first sample is taken after one interval
    if (f >= n - 1) return null; // ghost has finished
    const i = Math.max(0, Math.floor(f)), k = Math.max(0, Math.min(1, f - i));
    const j = Math.min(n - 1, i + 1);
    let a0 = rec[i * 3 + 2], a1 = rec[j * 3 + 2];
    let da = a1 - a0;
    while (da > Math.PI) da -= TAU;
    while (da < -Math.PI) da += TAU;
    return {
      x: rec[i * 3] + (rec[j * 3] - rec[i * 3]) * k,
      y: rec[i * 3 + 1] + (rec[j * 3 + 1] - rec[i * 3 + 1]) * k,
      a: a0 + da * k,
    };
  }

  // ---- Simple driver for tests / medal calibration ------------------------
  // look: look-ahead distance; digital: emulate touch (left/right only)
  function botInput(T, c, opt) {
    const look = (opt.look || 120) + c.speed * (opt.lookV || 0.35);
    const ahead = Math.round(look / T.ds);
    const i = (c.idx + ahead) % T.N;
    const line = opt.line || 0;
    // aim at an inside line on curves
    const nx = -T.ty[i], ny = T.tx[i];
    const cv = T.curv[i];
    const lat = line ? Math.max(-1, Math.min(1, -cv * 220)) * T.hw * line : 0;
    const gx = T.xs[i] + nx * lat, gy = T.ys[i] + ny * lat;
    let err = Math.atan2(gy - c.y, gx - c.x) - c.a;
    while (err > Math.PI) err -= TAU;
    while (err < -Math.PI) err += TAU;
    const s = Math.max(-1, Math.min(1, err * (opt.gain || 3)));
    if (opt.digital) {
      const dz = opt.dz || 0.18;
      return { left: s < -dz, right: s > dz };
    }
    return { steer: s };
  }

  function simulate(T, opt, maxT, spec) {
    const R = newRace(T, spec);
    let bumps = 0, offT = 0;
    while (!R.done && R.t < (maxT || 400)) {
      stepRace(R, botInput(T, R.car, opt || {}));
      if (R.car.bump >= 0.35 - 1e-9) bumps++;
      if (!R.car.onRoad) offT += DT;
    }
    return { time: R.done ? R.finishT : null, laps: R.laps, bumps, offT, rec: R.rec, splits: R.splits };
  }

  const api = { TRACKS, CARS, carById, buildTrack, nearest, newCar, stepCar, newRace, stepRace, ghostAt, botInput, simulate, DT, LAPS, SECTORS, GHOST_HZ, CAR };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.GL = api;
})(typeof self !== 'undefined' ? self : this);
