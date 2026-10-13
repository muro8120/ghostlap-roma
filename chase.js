// Ghostlap Roma: the chase camera. A three.js renderer that draws the same 2D world (core.js physics, game.js worlds)
// from behind and above the car: the road as ribbons, the OSM footprints extruded into buildings, street lamps,
// the car's headlight. World (x, y) maps to three (x, height, y), so headings and turns carry over unchanged.
// Loaded as a module (three is ESM only); sets window.Chase. game.js calls init / build / render / toScreen.
import * as THREE from './vendor/three/three.module.min.js';

const CL = 30;                       // the car length the camera is framed on (world units)
const BACK = CL * 6.4, UP = CL * 2.3, LOOK = CL * 17; // chase distance, height, and how far ahead it looks
const STOREY = 3.2;                  // metres
const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));
const C = (c) => new THREE.Color(c);
function hash(a, b) { // stable 0..1 from two integers, so the skyline is the same every run
  let h = Math.imul((a | 0) ^ 0x9e3779b9, 0x85ebca6b) ^ Math.imul((b | 0) + 0x7f4a7c15, 0xc2b2ae35);
  h = Math.imul(h ^ (h >>> 16), 0x45d9f3b); h = Math.imul(h ^ (h >>> 13), 0x45d9f3b); h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

let R = null, scene = null, cam = null, cw = 1, ch = 1, dprNow = 1;
let curT = null, world = null, sky = null, hemi = null, head = null, headT = null, pool = [], lampHeads = [];
let carM = null, ghostM = null, carKey = '', ghostKey = '', tailMat = null, bMat = null, stats = {};
const cs = { x: 0, y: 0, yaw: 0, fx: 0, fy: 0, ok: false };
const U = { uCam: { value: new THREE.Vector3() }, uCar: { value: new THREE.Vector3() } };
const tmp = new THREE.Vector3();

function canvasTex(n, fn, srgb) {
  const c = document.createElement('canvas'); c.width = c.height = n; fn(c.getContext('2d'), n);
  const t = new THREE.CanvasTexture(c); if (srgb !== false) t.colorSpace = THREE.SRGBColorSpace; return t;
}
const radial = (stops) => canvasTex(64, (g, n) => {
  const gr = g.createRadialGradient(n / 2, n / 2, 0, n / 2, n / 2, n / 2);
  for (const [o, c] of stops) gr.addColorStop(o, c);
  g.fillStyle = gr; g.fillRect(0, 0, n, n);
});
let TEX = null;
function textures() {
  if (TEX) return TEX;
  TEX = {
    glow: radial([[0, 'rgba(255,255,255,1)'], [0.3, 'rgba(255,255,255,.4)'], [1, 'rgba(255,255,255,0)']]),
    halo: radial([[0, 'rgba(255,255,255,1)'], [0.12, 'rgba(255,255,255,.75)'], [0.4, 'rgba(255,255,255,.12)'], [1, 'rgba(255,255,255,0)']]),
    blob: radial([[0, 'rgba(0,0,0,.85)'], [0.55, 'rgba(0,0,0,.55)'], [1, 'rgba(0,0,0,0)']]),
    beam: canvasTex(128, (g, n) => { // the headlight's throw on the road, drawn pointing +x from the left edge
      const gr = g.createRadialGradient(0, n / 2, 0, 0, n / 2, n);
      gr.addColorStop(0, 'rgba(255,255,255,.9)'); gr.addColorStop(0.45, 'rgba(255,255,255,.28)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = gr; g.beginPath(); g.moveTo(0, n * 0.44); g.lineTo(n, 0); g.lineTo(n, n); g.lineTo(0, n * 0.56); g.closePath(); g.fill();
    }),
  };
  return TEX;
}

// ---------- geometry helpers ------------------------------------------------------------
// G collects non-indexed triangles: positions, normals, colours and (for buildings) facade coordinates.
const Geo = (fac) => ({ p: [], n: [], c: [], f: fac ? [] : null });
function tri(G, A, B, Cc, n, col, fa, fb, fc) {
  // wind so the face points along n
  const ux = B[0] - A[0], uy = B[1] - A[1], uz = B[2] - A[2], vx = Cc[0] - A[0], vy = Cc[1] - A[1], vz = Cc[2] - A[2];
  const d = (uy * vz - uz * vy) * n[0] + (uz * vx - ux * vz) * n[1] + (ux * vy - uy * vx) * n[2];
  if (d < 0) { [B, Cc] = [Cc, B]; [fb, fc] = [fc, fb]; }
  G.p.push(A[0], A[1], A[2], B[0], B[1], B[2], Cc[0], Cc[1], Cc[2]);
  for (let k = 0; k < 3; k++) { G.n.push(n[0], n[1], n[2]); G.c.push(col.r, col.g, col.b); }
  if (G.f) { const z = [0, 0, 0, 0]; G.f.push(...(fa || z), ...(fb || z), ...(fc || z)); }
}
const UPN = [0, 1, 0];
function flatQuad(G, a, b, c, d, y, col) { // a b c d round the outline, (x, z) pairs
  tri(G, [a[0], y, a[1]], [b[0], y, b[1]], [c[0], y, c[1]], UPN, col);
  tri(G, [a[0], y, a[1]], [c[0], y, c[1]], [d[0], y, d[1]], UPN, col);
}
function toMesh(G, mat) {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(G.p, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(G.n, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(G.c, 3));
  if (G.f) g.setAttribute('fac', new THREE.Float32BufferAttribute(G.f, 4));
  return new THREE.Mesh(g, mat);
}

// nearest track sample, via a grid (the routes have a couple of thousand samples)
function trackGrid(T, cell) {
  const m = new Map(), key = (i, j) => i * 100003 + j;
  for (let i = 0; i < T.N; i++) {
    const k = key(Math.floor(T.xs[i] / cell), Math.floor(T.ys[i] / cell));
    let a = m.get(k); if (!a) m.set(k, (a = [])); a.push(i);
  }
  // returns { d, i } for the nearest sample within reach (d = Infinity if none); skip(i) ignores samples
  return function near(x, y, reach, skip) {
    const r = Math.ceil(reach / cell), ci = Math.floor(x / cell), cj = Math.floor(y / cell);
    let bd = Infinity, bi = -1;
    for (let i = ci - r; i <= ci + r; i++) for (let j = cj - r; j <= cj + r; j++) {
      const a = m.get(key(i, j)); if (!a) continue;
      for (const s of a) {
        if (skip && skip(s)) continue;
        const d = (T.xs[s] - x) ** 2 + (T.ys[s] - y) ** 2;
        if (d < bd) { bd = d; bi = s; }
      }
    }
    return { d: Math.sqrt(bd), i: bi };
  };
}

// ---------- materials -------------------------------------------------------------------
function buildingMaterial() {
  const m = new THREE.MeshLambertMaterial({ vertexColors: true });
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, U);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nattribute vec4 fac;\nvarying vec4 vFac;\nvarying vec3 vW;')
      .replace('#include <project_vertex>', '#include <project_vertex>\nvFac = fac;\nvW = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
uniform vec3 uCam; uniform vec3 uCar; varying vec4 vFac; varying vec3 vW;
float h21(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }`)
      // see-through: never let a building hide the car (the camera swings over corner blocks)
      .replace('#include <clipping_planes_fragment>', `#include <clipping_planes_fragment>
{ vec3 cc = uCar - uCam; float cl = length(cc); vec3 cd = cc / max(cl, 1.0); vec3 pc = vW - uCam; float t = dot(pc, cd);
  if (t > 0.0 && t < cl - 12.0) { float r = length(pc - cd * t);
    vec2 bp = mod(floor(gl_FragCoord.xy), 4.0); float bayer = mod(bp.x * 4.0 + bp.y * 7.0, 16.0) / 16.0;
    float rr = 4.0 + 0.15 * t; // a cone round the line of sight: about the same size on screen all the way to the car
    if (r < rr || (r < rr * 1.45 && bayer > (r - rr) / (rr * 0.45))) discard; } }`)
      // facade: lit and dark windows, shop fronts on the ground floor, lamp light washing up from the street
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
if (vFac.w > 0.5) {
  float hy = vFac.y, H = vFac.w, seed = abs(vFac.z);
  vec3 wash = vec3(1.0, 0.62, 0.32);
  if (vFac.z < 0.0) { // monument: travertine with pilasters and cornices, floodlit from below
    float pil = smoothstep(0.78, 0.84, fract(vFac.x / 4.2)) * (1.0 - smoothstep(0.94, 1.0, fract(vFac.x / 4.2)));
    float cor = smoothstep(0.9, 0.95, fract(hy / 7.5));
    diffuseColor.rgb *= 1.0 - 0.3 * pil + 0.25 * cor;
    totalEmissiveRadiance += diffuseColor.rgb * vec3(1.0, 0.78, 0.5) * (0.05 + 0.6 * exp(-hy / 11.0));
  }
  else {
    vec2 q = vec2(vFac.x / 3.6, hy / ${STOREY.toFixed(1)});
    vec2 cell = floor(q), lp = fract(q), fw = fwidth(q);
    float det = clamp(1.6 - max(fw.x, fw.y) * 3.0, 0.0, 1.0);
    float gf = 1.0 - step(0.5, cell.y);
    vec2 lo = mix(vec2(0.3, 0.3), vec2(0.1, 0.0), gf), hi = mix(vec2(0.7, 0.76), vec2(0.9, 0.72), gf);
    vec2 a = smoothstep(lo - fw, lo + fw, lp) * (1.0 - smoothstep(hi - fw, hi + fw, lp));
    float win = a.x * a.y * step(hy, H - 1.4);
    float r = h21(cell + seed * 31.7);
    float on = step(mix(0.7, 0.5, gf), r);
    vec3 wc = mix(vec3(1.0, 0.5, 0.18), vec3(1.0, 0.78, 0.48), h21(cell.yx + seed)) * (0.55 + 0.8 * fract(r * 7.13));
    totalEmissiveRadiance += wc * (win * on * det + (1.0 - det) * 0.07);
    diffuseColor.rgb *= 1.0 - 0.65 * win * (1.0 - on) * det;
    totalEmissiveRadiance += diffuseColor.rgb * wash * 0.5 * exp(-hy / 4.5);
  }
}`);
  };
  return m;
}
const lambert = (o) => new THREE.MeshLambertMaterial(o);
const additive = (o) => new THREE.MeshBasicMaterial(Object.assign({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false }, o));

// ---------- public: init / resize / dispose -------------------------------------------
function init(canvas, dpr) {
  if (R) return true;
  try {
    // MSAA only on low-density screens; at 2x the edges are fine and the fill rate goes to 60 fps instead
    R = new THREE.WebGLRenderer({ canvas, antialias: (window.devicePixelRatio || 1) < 2, alpha: false, stencil: false, powerPreference: 'high-performance' });
  } catch (e) { R = null; return false; }
  R.setClearColor('#07080c');
  scene = new THREE.Scene();
  cam = new THREE.PerspectiveCamera(60, 1, 5, 4800);
  hemi = new THREE.HemisphereLight('#c4cfff', '#8a6a52', 3.6); scene.add(hemi); // a base like the 2D night palette; lamps add to it
  head = new THREE.SpotLight('#ffefd2', 1500, 950, 0.5, 0.55, 1.15); headT = new THREE.Object3D();
  head.target = headT; scene.add(head, headT);
  for (let k = 0; k < 4; k++) { const l = new THREE.PointLight('#ffb36b', 0, 330, 1.25); pool.push(l); scene.add(l); }
  sky = makeSky(); scene.add(sky);
  bMat = buildingMaterial();
  tailMat = new THREE.MeshBasicMaterial({ color: '#7a1010' });
  resize(window.innerWidth, window.innerHeight, dpr);
  return true;
}
function resize(w, h, dpr) {
  if (!R) return;
  cw = w; ch = h; dprNow = Math.min(2, dpr || 1);
  R.setPixelRatio(dprNow); R.setSize(w, h, false);
  cam.aspect = w / h; cam.updateProjectionMatrix();
}
function disposeObj(o) {
  o.traverse((m) => {
    if (m.geometry) m.geometry.dispose();
    const ms = Array.isArray(m.material) ? m.material : m.material ? [m.material] : [];
    for (const x of ms) { if (x === bMat || x === tailMat) continue; if (x.map && !Object.values(TEX || {}).includes(x.map)) x.map.dispose(); x.dispose(); }
  });
}
function dispose() {
  if (!R) return;
  for (const o of [world, carM, ghostM, sky]) if (o) disposeObj(o);
  if (bMat) bMat.dispose();
  if (TEX) for (const t of Object.values(TEX)) t.dispose();
  R.dispose(); R = scene = cam = world = carM = ghostM = sky = bMat = TEX = null; pool = []; curT = null; carKey = ghostKey = '';
}

function makeSky() {
  // night dome: city glow on the horizon fading to near black, and a few stars that make it through
  const g = new THREE.SphereGeometry(4200, 24, 12), pos = g.attributes.position, cols = [];
  const lo = C('#3a2a2e'), mid = C('#151826'), hi = C('#05060b'), c = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    const y = pos.getY(i) / 4200;
    if (y < 0) c.copy(lo); else if (y < 0.18) c.copy(lo).lerp(mid, y / 0.18); else c.copy(mid).lerp(hi, Math.min(1, (y - 0.18) / 0.5));
    cols.push(c.r, c.g, c.b);
  }
  g.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3));
  const grp = new THREE.Group();
  const dome = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide, fog: false, depthWrite: false }));
  dome.renderOrder = -2; dome.frustumCulled = false;
  const sp = [];
  for (let k = 0; k < 160; k++) {
    const a = hash(k, 1) * Math.PI * 2, e = 0.12 + Math.pow(hash(k, 2), 0.7) * 1.3;
    sp.push(Math.cos(a) * Math.cos(e) * 4000, Math.sin(e) * 4000, Math.sin(a) * Math.cos(e) * 4000);
  }
  const sg = new THREE.BufferGeometry(); sg.setAttribute('position', new THREE.Float32BufferAttribute(sp, 3));
  const stars = new THREE.Points(sg, new THREE.PointsMaterial({ color: '#8f97ad', size: 1.6, sizeAttenuation: false, fog: false, depthWrite: false }));
  stars.renderOrder = -1; stars.frustumCulled = false;
  grp.add(dome, stars);
  return grp;
}

// ---------- public: build the scene for a track ----------------------------------------
function build(W, T, def) {
  if (!R) return;
  if (curT === T && world) return;
  const t0 = performance.now();
  if (world) { scene.remove(world); disposeObj(world); }
  world = new THREE.Group(); curT = T; stats = { buildings: 0 };
  try { buildWorld(W, T, def); } catch (e) { stats.error = String(e && e.message || e); console.warn('chase build', e); }
  stats.buildMs = Math.round(performance.now() - t0);
  scene.add(world);
}
function buildWorld(W, T, def) {
  const city = !!(W.city && window.ROME), ROME = window.ROME, S = city ? ROME.S : 4.5;
  const tx = textures();
  const hw = T.hw, wall = T.hw + T.wall, near = trackGrid(T, 220);
  const zones = T.zones || [];
  const inZone = (x, y, pad) => zones.some((z) => Math.hypot(x - z.x, y - z.y) < z.r + (pad || 0));
  // samples far along the track from i: where a route comes back on itself the other carriageway is "far"
  const K = Math.ceil((wall * 3) / T.ds), far = (i) => (j) => { const d = Math.abs(i - j); return Math.min(d, T.N - d) <= K; };

  const fogC = city ? '#191820' : '#16171c';
  scene.fog = new THREE.Fog(fogC, 700, 3400);
  R.setClearColor(fogC);

  // ground: flat colour, and for the circuits the 2D under-layer (spina, cavea, river, ruins) painted onto it
  const b = T.bounds, cx = (b.minX + b.maxX) / 2, cy = (b.minY + b.maxY) / 2;
  const span = Math.max(b.maxX - b.minX, b.maxY - b.minY) + 12000;
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(span, span).rotateX(-Math.PI / 2), lambert({ color: city ? '#16171a' : W.ground }));
  ground.position.set(cx, 0, cy); world.add(ground);
  if (!city && W.under.length) {
    const pad = 700, x0 = b.minX - pad, y0 = b.minY - pad, w = b.maxX - b.minX + pad * 2, h = b.maxY - b.minY + pad * 2;
    const n = Math.min(2048, R.capabilities.maxTextureSize), k = n / Math.max(w, h);
    const tex = canvasTex(n, (g) => {
      g.fillStyle = W.ground; g.fillRect(0, 0, n, n);
      g.setTransform(k, 0, 0, k, -x0 * k, -y0 * k);
      for (const o of W.under) { try { o.draw(g); } catch (e) {} }
      if (W.extra) try { W.extra(g); } catch (e) {}
    });
    tex.anisotropy = Math.min(8, R.capabilities.getMaxAnisotropy());
    const sz = n / k, m = new THREE.Mesh(new THREE.PlaneGeometry(sz, sz).rotateX(-Math.PI / 2), lambert({ map: tex }));
    m.position.set(x0 + sz / 2, 0.3, y0 + sz / 2); world.add(m);
  }

  // flat layers, one merged mesh: river, side streets, pavement, road, lines, chequer, turning circles
  const F = Geo();
  const ribbon = (o0, o1, y, col, on) => {
    for (let i = 0; i < T.N; i++) {
      if (on && !on(i)) continue;
      const j = (i + 1) % T.N, c = typeof col === 'function' ? col(i) : col;
      const nx0 = -T.ty[i], ny0 = T.tx[i], nx1 = -T.ty[j], ny1 = T.tx[j];
      flatQuad(F, [T.xs[i] + nx0 * o0, T.ys[i] + ny0 * o0], [T.xs[j] + nx1 * o0, T.ys[j] + ny1 * o0],
        [T.xs[j] + nx1 * o1, T.ys[j] + ny1 * o1], [T.xs[i] + nx0 * o1, T.ys[i] + ny0 * o1], y, c);
    }
  };
  const line = (pts, w, y, col, ext) => { // polyline of [x, y] as quads
    for (let i = 1; i < pts.length; i++) {
      const [ax, ay] = pts[i - 1], [bx, by] = pts[i], l = Math.hypot(bx - ax, by - ay) || 1;
      const ux = (bx - ax) / l, uy = (by - ay) / l, nx = -uy * w / 2, ny = ux * w / 2, e = ext || 0;
      flatQuad(F, [ax - ux * e + nx, ay - uy * e + ny], [bx + ux * e + nx, by + uy * e + ny], [bx + ux * e - nx, by + uy * e - ny], [ax - ux * e - nx, ay - uy * e - ny], y, col);
    }
  };
  const disc = (x, y, r, h, col, seg) => {
    const n = seg || 40;
    for (let k = 0; k < n; k++) {
      const a0 = (k / n) * Math.PI * 2, a1 = ((k + 1) / n) * Math.PI * 2;
      tri(F, [x, h, y], [x + Math.cos(a0) * r, h, y + Math.sin(a0) * r], [x + Math.cos(a1) * r, h, y + Math.sin(a1) * r], UPN, col);
    }
  };
  const REACH = 1100; // buildings and side streets this close to the route are built
  if (city) {
    const river = C('#0b1824');
    for (const r of ROME.river) { const p = []; for (let i = 0; i < r.length; i += 2) p.push([r[i], r[i + 1]]); line(p, 92 * S, 0.5, river, 46 * S); }
    const SW = [16 * S, 11 * S, 6 * S], SC = [C('#232429'), C('#1f2025'), C('#1d1e22')], bridge = C('#4b4740'), parapet = C('#77705f');
    for (const s of ROME.streets) {
      const kind = s[0] & 3, br = s[0] & 4, p = [];
      for (let i = 2; i < s.length; i += 2) p.push([s[i], s[i + 1]]);
      if (!p.some((q) => near(q[0], q[1], REACH).d < REACH)) continue;
      if (br) { line(p, 17 * S, 0.7, parapet, 0); line(p, 13 * S, 0.8, bridge, 0); }
      else line(p, SW[kind], 0.6, SC[kind], SW[kind] / 2);
    }
    ribbon(-wall, wall, 1.0, C('#29282a'));
    ribbon(-(hw + 7), hw + 7, 1.2, C('#3a3c42'));
  } else {
    ribbon(-wall, wall, 1.0, C(W.runoff));
    const red = C('#b3262c'), white = C('#d9d6cf'), curb = (i) => Math.abs(T.curv[i]) > 1 / 700;
    const stripe = (i) => (Math.floor((i * T.ds) / 22) % 2 ? red : white);
    ribbon(hw - 2, hw + 8, 1.2, stripe, curb); ribbon(-(hw + 8), -(hw - 2), 1.2, stripe, curb);
  }
  const asphalt = C(W.asphalt), edge = C(W.edge);
  ribbon(-hw, hw, 1.3, asphalt);
  ribbon(-(hw - 4), hw - 4, 1.45, edge);
  ribbon(-(hw - 6.5), hw - 6.5, 1.6, asphalt);
  for (const z of zones) {
    if (city) disc(z.x, z.y, z.r + 10, 1.1, C('#29282a'));
    disc(z.x, z.y, z.r, 1.65, asphalt, 48);
    const ring = []; for (let k = 0; k <= 48; k++) { const a = (k / 48) * Math.PI * 2; ring.push([z.x + Math.cos(a) * (z.r - 6), z.y + Math.sin(a) * (z.r - 6)]); }
    line(ring, 3, 1.7, edge);
    const arc = []; for (let k = 0; k <= 24; k++) { const a = 0.6 + (k / 24) * 4.8; arc.push([z.x + Math.cos(a) * z.r * 0.5, z.y + Math.sin(a) * z.r * 0.5]); }
    line(arc, 7, 1.75, C('#8a6a35'));
  }
  const dash = C('#53555b');
  ribbon(-1.5, 1.5, 1.8, dash, (i) => (i * T.ds) % 84 < 36 && !inZone(T.xs[i], T.ys[i]));
  { // start / finish chequer
    const n0 = Math.floor((hw * 2) / 12), tx0 = T.tx[0], ty0 = T.ty[0], nx = -ty0, ny = tx0, cw2 = (hw * 2) / n0;
    for (let r = 0; r < 2; r++) for (let k = 0; k < n0; k++) {
      const a0 = -12 + r * 12, o0 = -hw + k * cw2, P = (a, o) => [T.xs[0] + tx0 * a + nx * o, T.ys[0] + ty0 * a + ny * o];
      flatQuad(F, P(a0, o0), P(a0 + 12, o0), P(a0 + 12, o0 + cw2), P(a0, o0 + cw2), 1.9, C((r + k) % 2 ? '#e8e6e0' : '#16171a'));
    }
  }
  world.add(toMesh(F, lambert({ vertexColors: true })));

  // soft walls as low kerbs (stone in town, the barrier colour on the circuits); none inside turning circles
  // or across the other carriageway where a route comes back on itself
  const KB = Geo(), kh = city ? 4 : 9, kc = C(city ? '#4d4a44' : W.barrier), kt = C(city ? '#6d685e' : W.barrier).multiplyScalar(1.25);
  for (const side of [-1, 1]) for (let i = 0; i < T.N; i++) {
    const j = (i + 1) % T.N, o = wall * side;
    const ax = T.xs[i] - T.ty[i] * o, ay = T.ys[i] + T.tx[i] * o, bx = T.xs[j] - T.ty[j] * o, by = T.ys[j] + T.tx[j] * o;
    if (inZone(ax, ay, 8) || inZone(bx, by, 8)) continue;
    if (near(ax, ay, wall, far(i)).d < wall - 3) continue;
    const n = [-T.ty[i] * side, 0, T.tx[i] * side], m = [-n[0], 0, -n[2]], w2 = 2;
    const P = (x, y, s, h) => [x + n[0] * s, h, y + n[2] * s];
    tri(KB, P(ax, ay, w2, -1), P(bx, by, w2, -1), P(bx, by, w2, kh), n, kc); tri(KB, P(ax, ay, w2, -1), P(bx, by, w2, kh), P(ax, ay, w2, kh), n, kc);
    tri(KB, P(ax, ay, -w2, -1), P(bx, by, -w2, -1), P(bx, by, -w2, kh), m, kc); tri(KB, P(ax, ay, -w2, -1), P(bx, by, -w2, kh), P(ax, ay, -w2, kh), m, kc);
    tri(KB, P(ax, ay, -w2, kh), P(bx, by, -w2, kh), P(bx, by, w2, kh), UPN, kt); tri(KB, P(ax, ay, -w2, kh), P(bx, by, w2, kh), P(ax, ay, w2, kh), UPN, kt);
  }
  for (const z of zones) { // the turning circle's round soft wall, except where the road goes in and out
    for (let k = 0; k < 64; k++) {
      const a0 = (k / 64) * Math.PI * 2, a1 = ((k + 1) / 64) * Math.PI * 2;
      const ax = z.x + Math.cos(a0) * z.r, ay = z.y + Math.sin(a0) * z.r, bx = z.x + Math.cos(a1) * z.r, by = z.y + Math.sin(a1) * z.r;
      if (near(ax, ay, wall).d < wall || near(bx, by, wall).d < wall) continue;
      const n = [Math.cos(a0), 0, Math.sin(a0)];
      tri(KB, [ax, -1, ay], [bx, -1, by], [bx, kh, by], n, kc); tri(KB, [ax, -1, ay], [bx, kh, by], [ax, kh, ay], n, kc);
      tri(KB, [ax, kh, ay], [bx, kh, by], [z.x + Math.cos(a1) * (z.r + 3), kh, z.y + Math.sin(a1) * (z.r + 3)], UPN, kt);
    }
  }
  if (KB.p.length) world.add(toMesh(KB, lambert({ vertexColors: true })));

  if (city) buildCity(ROME, T, near, REACH, wall, inZone);
  else { trees(W); circuitDecor(T, def, near, wall); }
  lights(W, T, near, wall, city);
}

// OSM footprints near the route, extruded and merged into a few chunks (frustum culling works per chunk)
const FACADE = ['#a0643c', '#b07a45', '#9c5a3c', '#b58a5a', '#8d4f36', '#a8835e', '#c09a6a', '#94603f', '#b46f4a'].map(C);
function buildCity(ROME, T, near, REACH, wall, inZone) {
  const S = ROME.S, CH = 1500, chunks = new Map();
  const Dmin = wall + 8; // building lines stand back from the soft wall, so the car never ends up inside one
  for (let bi = 0; bi < ROME.buildings.length; bi++) {
    const b = ROME.buildings[bi], kind = b[0];
    let pts = [];
    for (let i = 1; i < b.length; i += 2) pts.push([b[i], b[i + 1]]);
    if (pts.length < 3) continue;
    let mx = 0, my = 0; for (const p of pts) { mx += p[0]; my += p[1]; } mx /= pts.length; my /= pts.length;
    let rad = 0; for (const p of pts) rad = Math.max(rad, Math.hypot(p[0] - mx, p[1] - my));
    const nc = near(mx, my, REACH + rad);
    if (nc.d > REACH + rad * 0.5) continue;
    if (nc.d < wall * 0.6 && rad < wall * 2) continue; // a kiosk in the middle of the route
    // densify edges that come near the road, then push those points back to the building line
    const dense = [];
    for (let i = 0; i < pts.length; i++) {
      const a = pts[i], c = pts[(i + 1) % pts.length], l = Math.hypot(c[0] - a[0], c[1] - a[1]);
      let close = false;
      for (let s = 0; s <= l; s += 40) { const x = a[0] + ((c[0] - a[0]) * s) / l, y = a[1] + ((c[1] - a[1]) * s) / l; if (near(x, y, Dmin + 40).d < Dmin + 25 || inZone(x, y, 30)) { close = true; break; } }
      const n = close ? Math.max(1, Math.ceil(l / 24)) : 1;
      for (let s = 0; s < n; s++) dense.push([a[0] + ((c[0] - a[0]) * s) / n, a[1] + ((c[1] - a[1]) * s) / n]);
    }
    let moved = 0;
    for (const p of dense) for (let it = 0; it < 2; it++) {
      for (const z of T.zones || []) {
        const d = Math.hypot(p[0] - z.x, p[1] - z.y), r = z.r + 18;
        if (d < r) { const k = r / (d || 1); p[0] = z.x + (p[0] - z.x) * k; p[1] = z.y + (p[1] - z.y) * k; moved++; }
      }
      const q = near(p[0], p[1], Dmin + 30);
      if (q.d < Dmin) {
        const sx = T.xs[q.i], sy = T.ys[q.i];
        let ux = p[0] - sx, uy = p[1] - sy, l = Math.hypot(ux, uy);
        if (l < 1e-3) { ux = -T.ty[q.i]; uy = T.tx[q.i]; l = 1; }
        p[0] = sx + (ux / l) * Dmin; p[1] = sy + (uy / l) * Dmin; moved++;
      }
    }
    pts = dense;
    // area and winding
    let A2 = 0; for (let i = 0; i < pts.length; i++) { const a = pts[i], c = pts[(i + 1) % pts.length]; A2 += a[0] * c[1] - c[0] * a[1]; }
    const area = Math.abs(A2 / 2) / (S * S);
    if (area < 12) continue;
    // height: 3 to 6 storeys, small footprints lower; landmarks and churches stand taller
    const hx = Math.round(b[1]), hy2 = Math.round(b[2]), r1 = hash(hx, hy2), r2 = hash(hy2, hx + 7);
    let m;
    if (kind) m = 22 + r1 * 20 + Math.min(10, area / 900);
    else {
      let st = 3 + Math.floor(r1 * 4);
      if (area < 220) st = Math.min(st, 2 + Math.floor(r1 * 3)); else if (area > 2500 && st < 4) st++;
      m = st * STOREY + 0.6 + r2 * 1.4;
    }
    const H = m * S, seed = 1 + Math.floor(r2 * 997);
    const fc = kind ? C('#8a7f69').multiplyScalar(0.55 + r2 * 0.15) : FACADE[Math.floor(r2 * FACADE.length)].clone().multiplyScalar(0.3 + r1 * 0.18);
    const rc = (kind ? C('#6d6658') : C('#4e3a30')).multiplyScalar(0.85 + r1 * 0.3);
    const key = Math.floor(mx / CH) + ',' + Math.floor(my / CH);
    let G = chunks.get(key); if (!G) chunks.set(key, (G = Geo(true)));
    prism(G, pts, m, S, fc, rc, kind ? -seed : seed);
    stats.buildings++;
  }
  for (const G of chunks.values()) world.add(toMesh(G, bMat));
  stats.chunks = chunks.size;
}

// One extruded footprint (world units, m metres tall). Walls carry facade coordinates for the window shader:
// metres along the wall, metres up, the building's seed (negative: a floodlit monument), and its height.
// o.mAt(i): per-corner height; o.inward: walls face in (the inside of a ring); o.roof false: no roof; o.base: metres
function prism(G, pts, m, S, fc, rc, seed, o) {
  o = o || {};
  let A2 = 0;
  for (let i = 0; i < pts.length; i++) { const a = pts[i], c = pts[(i + 1) % pts.length]; A2 += a[0] * c[1] - c[0] * a[1]; }
  const sgn = (A2 > 0 ? 1 : -1) * (o.inward ? -1 : 1), y0 = o.base ? o.base * S : -1, mb = o.base || 0;
  const hm = (i) => (o.mAt ? o.mAt(i % pts.length) : m);
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i], c = pts[(i + 1) % pts.length], l = Math.hypot(c[0] - a[0], c[1] - a[1]);
    if (l < 0.5) continue;
    // outward normal: right of travel for a positive shoelace area
    const n = [((c[1] - a[1]) / l) * sgn, 0, (-(c[0] - a[0]) / l) * sgn];
    const u0 = -l / 2 / S, u1 = l / 2 / S, ma = hm(i), mc = hm(i + 1), f = (u, h, H) => [u, h, seed, H];
    tri(G, [a[0], y0, a[1]], [c[0], y0, c[1]], [c[0], mc * S, c[1]], n, fc, f(u0, mb, ma), f(u1, mb, mc), f(u1, mc, mc));
    tri(G, [a[0], y0, a[1]], [c[0], mc * S, c[1]], [a[0], ma * S, a[1]], n, fc, f(u0, mb, ma), f(u1, mc, mc), f(u0, ma, ma));
  }
  if (o.roof === false) return;
  const tris = THREE.ShapeUtils.triangulateShape(pts.map((p) => new THREE.Vector2(p[0], p[1])), []);
  const rf = [0, m, seed, 0];
  for (const [i, j, k] of tris) tri(G, [pts[i][0], hm(i) * S, pts[i][1]], [pts[j][0], hm(j) * S, pts[j][1]], [pts[k][0], hm(k) * S, pts[k][1]], UPN, rc, rf, rf, rf);
}
const ring = (x, y, rx, ry, n, rot) => { const p = []; for (let k = 0; k < n; k++) { const a = (k / n) * Math.PI * 2; const ex = Math.cos(a) * rx, ey = Math.sin(a) * ry, c = Math.cos(rot || 0), s = Math.sin(rot || 0); p.push([x + ex * c - ey * s, y + ex * s + ey * c]); } return p; };
const rect = (x, y, w, h, rot) => { const c = Math.cos(rot || 0), s = Math.sin(rot || 0); return [[-w / 2, -h / 2], [w / 2, -h / 2], [w / 2, h / 2], [-w / 2, h / 2]].map(([u, v]) => [x + u * c - v * s, y + u * s + v * c]); };
function dome(G, x, y, r, base, S, col, seed) { // a ribbed hemisphere sitting at base metres
  const n = 16, m = 6, P = (i, j) => { const a = (i / n) * Math.PI * 2, e = (j / m) * Math.PI / 2; return [x + Math.cos(a) * Math.cos(e) * r, base * S + Math.sin(e) * r, y + Math.sin(a) * Math.cos(e) * r]; };
  for (let i = 0; i < n; i++) for (let j = 0; j < m; j++) {
    const A = P(i, j), B = P(i + 1, j), Cc = P(i + 1, j + 1), D = P(i, j + 1);
    const mid = [(A[0] + Cc[0]) / 2 - x, (A[1] + Cc[1]) / 2 - base * S, (A[2] + Cc[2]) / 2 - y], l = Math.hypot(...mid), nn = mid.map((v) => v / l);
    const f = (Q, k) => [((i + k) / n) * Math.PI * 2 * r / S, Q[1] / S, seed, base + r / S];
    tri(G, A, B, Cc, nn, col, f(A, 0), f(B, 1), f(Cc, 1));
    if (j < m - 1) tri(G, A, Cc, D, nn, col, f(A, 0), f(Cc, 1), f(D, 0));
  }
}

// The circuits' monuments stood up (their flat versions are already on the ground texture; the positions match
// buildWorld in game.js), stands round the Circo Massimo, and a ring of city on the horizon.
function circuitDecor(T, def, near, wall) {
  const S = 4.5, G = Geo(true), D = Geo(), id = def.id;
  const trav = C('#7d7360'), travR = C('#5f594c'), marble = C('#8f8b82'), brick = C('#7a5a42');
  // which side of the track is outside (as outwardSign in game.js)
  let inside = false; { const x = T.xs[0] - T.ty[0] * 400, y = T.ys[0] + T.tx[0] * 400;
    for (let a = 0, b = T.N - 1; a < T.N; b = a++) if ((T.ys[a] > y) !== (T.ys[b] > y) && x < ((T.xs[b] - T.xs[a]) * (y - T.ys[a])) / (T.ys[b] - T.ys[a]) + T.xs[a]) inside = !inside; }
  const out = inside ? -1 : 1, off = (i, d) => [T.xs[i] - T.ty[i] * d * out, T.ys[i] + T.tx[i] * d * out];
  if (id === 'circo') {
    prism(G, rect(0, -15, 1900, 60), 2.5, S, trav, travR, -11);
    prism(G, rect(0, -15, 24, 24), 30, S, C('#a8936c'), C('#a8936c'), -12);
    tri(G, [-12, 30 * S, -27], [12, 30 * S, -27], [0, 34 * S, -15], [0, 0.5, -1], C('#c9b27a')); tri(G, [12, 30 * S, -27], [12, 30 * S, -3], [0, 34 * S, -15], [1, 0.5, 0], C('#c9b27a'));
    tri(G, [12, 30 * S, -3], [-12, 30 * S, -3], [0, 34 * S, -15], [0, 0.5, 1], C('#c9b27a')); tri(G, [-12, 30 * S, -3], [-12, 30 * S, -27], [0, 34 * S, -15], [-1, 0.5, 0], C('#c9b27a'));
    for (const sx of [-1, 1]) for (const k of [0, 1, 2]) prism(G, ring(sx * 995, -36 + k * 21, 11, 11, 8), 7, S, trav, travR, -13);
    // the cavea: three tiers of stands rising away from the track
    const tiers = [[wall + 30, wall + 90, 3], [wall + 90, wall + 150, 6], [wall + 150, wall + 220, 9.5]], cols = [C('#3a3226'), C('#332c22'), C('#3a3226')];
    tiers.forEach(([o0, o1, h], t) => {
      const hp = t ? tiers[t - 1][2] * S : 0, hh = h * S;
      for (let i = 0; i < T.N; i += 2) {
        const j = (i + 2) % T.N, a0 = off(i, o0), b0 = off(j, o0), a1 = off(i, o1), b1 = off(j, o1);
        tri(D, [a0[0], hh, a0[1]], [b0[0], hh, b0[1]], [b1[0], hh, b1[1]], UPN, cols[t]); tri(D, [a0[0], hh, a0[1]], [b1[0], hh, b1[1]], [a1[0], hh, a1[1]], UPN, cols[t]);
        const n = [T.ty[i] * out, 0, -T.tx[i] * out], fc = C('#54483a');
        tri(D, [a0[0], hp, a0[1]], [b0[0], hp, b0[1]], [b0[0], hh, b0[1]], n, fc); tri(D, [a0[0], hp, a0[1]], [b0[0], hh, b0[1]], [a0[0], hh, a0[1]], n, fc);
        if (t === 2) { const m = n.map((v) => -v); tri(D, [a1[0], -1, a1[1]], [b1[0], -1, b1[1]], [b1[0], hh, b1[1]], m, fc); tri(D, [a1[0], -1, a1[1]], [b1[0], hh, b1[1]], [a1[0], hh, a1[1]], m, fc); }
      }
    });
  }
  if (id === 'colosseo') {
    // the amphitheatre: four storeys of arcades outside, the fallen side to the west, the cavea sloping in
    const N = 72, H = 34, cx = 30, cy = 60, rx = 310, ry = 255;
    const outer = ring(cx, cy, rx, ry, N), inner = ring(cx, cy, rx - 46, ry - 46, N), arena = ring(cx, cy, rx - 140, ry - 132, N);
    const fallen = (k) => { const a = (k / N) * Math.PI * 2; return a > 2.4 && a < 3.5 ? 0.66 : 1; };
    prism(G, outer, H, S, trav, travR, -21, { mAt: (k) => H * fallen(k), roof: false });
    prism(G, inner, H * 0.92, S, trav.clone().multiplyScalar(0.8), travR, -22, { inward: true, roof: false });
    for (let k = 0; k < N; k++) { // top of the outer wall, then the cavea down to the arena wall
      const k2 = (k + 1) % N, h0 = H * fallen(k) * S, h1 = H * fallen(k2) * S, hi = H * 0.92 * S;
      tri(G, [outer[k][0], h0, outer[k][1]], [outer[k2][0], h1, outer[k2][1]], [inner[k2][0], hi, inner[k2][1]], UPN, travR, [0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0]);
      tri(G, [outer[k][0], h0, outer[k][1]], [inner[k2][0], hi, inner[k2][1]], [inner[k][0], hi, inner[k][1]], UPN, travR, [0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0]);
      const hA = 5 * S, sc = C('#4a3d2e');
      tri(D, [inner[k][0], hi * 0.98, inner[k][1]], [inner[k2][0], hi * 0.98, inner[k2][1]], [arena[k2][0], hA, arena[k2][1]], UPN, sc);
      tri(D, [inner[k][0], hi * 0.98, inner[k][1]], [arena[k2][0], hA, arena[k2][1]], [arena[k][0], hA, arena[k][1]], UPN, sc);
    }
    prism(G, arena, 5, S, C('#5a4a37'), C('#5a4a37'), -23, { inward: true, roof: false });
    // the Vittoriano at Piazza Venezia, white marble; the Arch of Constantine
    prism(G, rect(-2740, -400, 160, 380), 18, S, marble, marble.clone().multiplyScalar(0.8), -24);
    prism(G, rect(-2630, -400, 60, 340), 30, S, marble, marble.clone().multiplyScalar(0.8), -25);
    prism(G, rect(-300, 360, 96, 32, 0.6), 21, S, trav, travR, -26);
  }
  if (id === 'tevere') {
    const river = (x) => 200 * Math.sin(x / 520), b = T.bounds;
    for (const sg of [-1, 1]) { // the lungotevere parapets
      const p = []; for (let x = b.minX - 400; x <= b.maxX + 400; x += 40) p.push([x, river(x) + sg * 140]);
      for (let i = 1; i < p.length; i++) {
        const [ax, ay] = p[i - 1], [bx, by] = p[i]; if (near((ax + bx) / 2, (ay + by) / 2, wall + 20).d < wall + 10) continue;
        const l = Math.hypot(bx - ax, by - ay), n = [-(by - ay) / l * sg, 0, (bx - ax) / l * sg], c = C('#6a6356');
        tri(D, [ax, -1, ay], [bx, -1, by], [bx, 7, by], n, c); tri(D, [ax, -1, ay], [bx, 7, by], [ax, 7, ay], n, c);
        tri(D, [ax, -1, ay], [bx, -1, by], [bx, 7, by], n.map((v) => -v), c); tri(D, [ax, -1, ay], [bx, 7, by], [ax, 7, ay], n.map((v) => -v), c);
      }
    }
    const sx = -700, sy = river(-700) - 360 - wall - 200; // Castel Sant'Angelo
    prism(G, rect(sx, sy, 300, 300, 0.785), 9, S, brick, brick, -31);
    prism(G, ring(sx, sy, 110, 110, 32), 21, S, trav, travR, -32);
    prism(G, rect(sx, sy, 90, 90), 30, S, brick, brick, -33);
    const px = -1550, py = river(-1550) - 360 - wall - 230; // St Peter's: drum and dome
    prism(G, ring(px, py, 120, 120, 24), 14, S, trav, travR, -34, { roof: false });
    dome(G, px, py, 120, 14, S, C('#7d828a'), -35);
    prism(G, ring(px, py, 16, 16, 8), 6, S, trav, travR, -36, { base: 14 + 120 / S - 1 });
  }
  if (id === 'appia') {
    const k0 = Math.round(T.N * 0.36), [mx, my] = off(k0, wall + 200);
    if (near(mx, my, wall + 200).d > T.hw + T.wall + 100) prism(G, ring(mx, my, 96, 96, 28), 11, S, trav, travR, -41); // Caecilia Metella
    for (let i = 40; i < T.N; i += 55) { // roadside tombs
      const sd = i % 110 < 55 ? 1 : -1, d = wall + 70, x = T.xs[i] - T.ty[i] * d * sd, y = T.ys[i] + T.tx[i] * d * sd;
      if (near(x, y, wall + 60).d > T.hw + T.wall + 40) prism(G, rect(x, y, 46 + (i % 3) * 14, 34, Math.atan2(T.ty[i], T.tx[i])), 4 + (i % 4), S, C('#6e6454'), C('#5a5246'), -42 - i);
    }
    const ay = T.bounds.maxY - 160; // the aqueduct: piers and the channel on top, broken where the road passes
    let run = [];
    const flush = () => { if (run.length > 1) prism(G, rect((run[0] + run[run.length - 1]) / 2 + 13, ay, run[run.length - 1] - run[0] + 26, 30), 3, S, brick, C('#5e4a39'), -44, { base: 19 }); run = []; };
    for (let x = T.bounds.minX; x < T.bounds.maxX; x += 42) {
      if (near(x, ay, wall + 40).d > T.hw + T.wall + 30) { prism(G, rect(x + 13, ay, 26, 26), 19, S, brick, brick, -43); run.push(x); } else flush();
    }
    flush();
  }
  // the city on the horizon
  const b = T.bounds, cx = (b.minX + b.maxX) / 2, cy = (b.minY + b.maxY) / 2, R0 = Math.hypot(b.maxX - b.minX, b.maxY - b.minY) / 2 + 300;
  for (let k = 0; k < 260; k++) {
    const a = hash(k, 91) * Math.PI * 2, d = R0 + hash(k, 92) * 1700, x = cx + Math.cos(a) * d, y = cy + Math.sin(a) * d;
    if (near(x, y, wall + 400).d < wall + 380) continue;
    const st = 3 + Math.floor(hash(k, 93) * (id === 'appia' ? 3 : 5));
    prism(G, rect(x, y, 140 + hash(k, 94) * 200, 120 + hash(k, 95) * 160, hash(k, 96) * 3), st * STOREY + 1, S,
      FACADE[k % FACADE.length].clone().multiplyScalar(0.28 + hash(k, 97) * 0.15), C('#4e3a30'), 1 + k);
  }
  world.add(toMesh(G, bMat));
  if (D.p.length) world.add(toMesh(D, lambert({ vertexColors: true })));
}

// trees on the circuits, from the 2D world's scenery (pines, plane trees, Appia cypresses)
function trees(W) {
  const list = W.over.filter((o) => o.r > 6 && o.r < 90);
  if (!list.length) return;
  const cyp = list.filter((o) => o.r < 18), pin = list.filter((o) => o.r >= 18);
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3(), col = new THREE.Color();
  const trunk = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.5, 0.7, 1, 5).translate(0, 0.5, 0), lambert({ color: '#2a2018' }), list.length);
  list.forEach((o, k) => { m4.compose(p.set(o.x, 0, o.y), q, s.set(o.r * 0.14 + 2, o.r < 18 ? 14 : o.r * 1.15, o.r * 0.14 + 2)); trunk.setMatrixAt(k, m4); });
  world.add(trunk);
  if (pin.length) { // umbrella pines: a flat dark crown
    const crown = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1, 1), lambert({ color: '#ffffff' }), pin.length);
    pin.forEach((o, k) => {
      m4.compose(p.set(o.x, o.r * 1.25, o.y), q.setFromAxisAngle(s.set(0, 1, 0), hash(o.x | 0, o.y | 0) * 6), s.set(o.r, o.r * 0.42, o.r));
      crown.setMatrixAt(k, m4); crown.setColorAt(k, col.set('#1d3524').multiplyScalar(0.7 + hash(o.y | 0, o.x | 0) * 0.5));
    });
    world.add(crown);
  }
  if (cyp.length) {
    const cone = new THREE.InstancedMesh(new THREE.ConeGeometry(1, 1, 7).translate(0, 0.5, 0), lambert({ color: '#ffffff' }), cyp.length);
    q.identity();
    cyp.forEach((o, k) => { m4.compose(p.set(o.x, 6, o.y), q, s.set(o.r * 0.75, o.r * 5.2, o.r * 0.75)); cone.setMatrixAt(k, m4); cone.setColorAt(k, col.set('#123420').multiplyScalar(0.7 + hash(k, 3) * 0.5)); });
    world.add(cone);
  }
}

// street lamps (pole, bracket, lamp, halo, pool of light on the ground) and floodlit spots; all instanced
function lights(W, T, near, wall, city) {
  const tx = textures(), lamps = W.lamps, HEAD = 30;
  lampHeads = [];
  const poles = [], arms = [];
  for (const l of lamps) {
    let px = l.x, py = l.y;
    const q = near(l.x, l.y, wall + 20);
    if (q.i >= 0 && q.d < wall + 6) { // a lamp inside the run-off: pole at the kerb, lamp out over the road on an arm
      const ux = (l.x - T.xs[q.i]) / (q.d || 1), uy = (l.y - T.ys[q.i]) / (q.d || 1);
      px = T.xs[q.i] + ux * (wall + 7); py = T.ys[q.i] + uy * (wall + 7);
      arms.push([px, py, l.x, l.y]);
    }
    poles.push([px, py]);
    lampHeads.push({ x: l.x, y: l.y, c: l.c });
  }
  const m4 = new THREE.Matrix4(), q4 = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3(), col = new THREE.Color(), Y = new THREE.Vector3(0, 1, 0);
  if (poles.length) {
    const pm = new THREE.InstancedMesh(new THREE.CylinderGeometry(1, 1.4, 1, 6).translate(0, 0.5, 0), lambert({ color: '#26272b' }), poles.length);
    poles.forEach(([x, y], k) => { m4.compose(p.set(x, 0, y), q4.identity(), s.set(1, HEAD + 3, 1)); pm.setMatrixAt(k, m4); });
    world.add(pm);
  }
  if (arms.length) {
    const am = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1).translate(0.5, 0, 0), lambert({ color: '#26272b' }), arms.length);
    arms.forEach(([x0, y0, x1, y1], k) => {
      m4.compose(p.set(x0, HEAD + 2.5, y0), q4.setFromAxisAngle(Y, -Math.atan2(y1 - y0, x1 - x0)), s.set(Math.hypot(x1 - x0, y1 - y0), 1.2, 1.2));
      am.setMatrixAt(k, m4);
    });
    world.add(am);
  }
  const warm = C('#ffb46a'), cool = C('#9fbfff');
  if (lamps.length) {
    const hm = new THREE.InstancedMesh(new THREE.SphereGeometry(3.4, 8, 6), new THREE.MeshBasicMaterial({ color: '#fff1cf', fog: false }), lamps.length);
    lamps.forEach((l, k) => { m4.compose(p.set(l.x, HEAD, l.y), q4.identity(), s.set(1, 1, 1)); hm.setMatrixAt(k, m4); });
    world.add(hm);
    const hp = []; for (const l of lamps) hp.push(l.x, HEAD, l.y);
    const hg = new THREE.BufferGeometry(); hg.setAttribute('position', new THREE.Float32BufferAttribute(hp, 3));
    const halo = new THREE.Points(hg, new THREE.PointsMaterial({ color: '#ffc387', size: 16, map: tx.halo, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false, opacity: 0.6 }));
    world.add(halo);
  }
  // pools of light: every lamp, and the floodlit squares and monuments
  const pools = lamps.map((l) => [l.x, l.y, 130, l.c === 'cool' ? cool : warm, 0.15]).concat(W.floods.map((f) => [f.x, f.y, f.r, f.c === 'cool' ? cool : warm, f.a * 0.3]));
  if (pools.length) {
    const gm = new THREE.InstancedMesh(new THREE.PlaneGeometry(2, 2).rotateX(-Math.PI / 2), additive({ map: tx.glow }), pools.length);
    pools.forEach(([x, y, r, c, a], k) => { m4.compose(p.set(x, 2.2, y), q4.identity(), s.set(r, 1, r)); gm.setMatrixAt(k, m4); gm.setColorAt(k, col.copy(c).multiplyScalar(a)); });
    gm.renderOrder = 2; world.add(gm);
  }
}

// ---------- the cars ----------------------------------------------------------------------
function carMesh(sp, ghost) {
  const g = new THREE.Group(), L = sp.len, Wd = sp.wid, st = sp.style;
  const bh = st === 'bubble' ? Wd * 0.42 : st === 'wedge' ? Wd * 0.27 : Wd * 0.31, y0 = 2.6;
  const mat = ghost ? new THREE.MeshBasicMaterial({ color: '#a9d2ff', transparent: true, opacity: 0.35, depthWrite: false })
    : lambert({ color: sp.body, emissive: C(sp.body).multiplyScalar(0.08) });
  const glass = ghost ? mat : lambert({ color: '#0d1117' }), roof = ghost ? mat : lambert({ color: sp.roof });
  const box = (w, h, d, x, y, z, m) => { const o = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); o.position.set(x, y, z); g.add(o); return o; };
  box(L, bh, Wd, 0, y0 + bh / 2, 0, mat);
  const cl = st === 'bubble' ? 0.55 : st === 'gt' ? 0.4 : 0.42, cx = st === 'gt' ? -L * 0.12 : -L * 0.04, chh = st === 'bubble' ? Wd * 0.36 : Wd * 0.27;
  box(L * cl, chh, Wd * 0.8, cx, y0 + bh + chh / 2, 0, glass);
  box(L * cl * 0.8, 0.8, Wd * 0.72, cx - L * 0.02, y0 + bh + chh + 0.4, 0, roof);
  if (st === 'hyper' || st === 'wedge') box(L * 0.08, 1.2, Wd * 0.9, -L * 0.46, y0 + bh + 2.6, 0, roof); // wing
  if (!ghost) {
    const tyre = new THREE.MeshLambertMaterial({ color: '#0b0b0c' }), wg = new THREE.CylinderGeometry(3, 3, 2.6, 10).rotateX(Math.PI / 2);
    for (const [sx, sz] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) { const w = new THREE.Mesh(wg, tyre); w.position.set(sx * L * 0.32, 3, sz * (Wd / 2 - 0.6)); g.add(w); }
    const hl = new THREE.MeshBasicMaterial({ color: '#fff4d6' });
    for (const sz of [-1, 1]) {
      box(0.8, 1.6, Wd * 0.2, L / 2 + 0.2, y0 + bh * 0.62, sz * Wd * 0.3, hl);
      box(0.8, 1.6, Wd * 0.24, -L / 2 - 0.2, y0 + bh * 0.66, sz * Wd * 0.3, tailMat);
    }
    const blob = new THREE.Mesh(new THREE.PlaneGeometry(L * 1.5, Wd * 1.9).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ map: textures().blob, transparent: true, depthWrite: false, opacity: 0.8 }));
    blob.position.y = 2.0; blob.renderOrder = 1; g.add(blob);
    const beam = new THREE.Mesh(new THREE.PlaneGeometry(300, 190).rotateX(-Math.PI / 2), additive({ map: textures().beam, color: C('#ffe9c4').multiplyScalar(0.22) }));
    beam.position.set(L * 0.45 + 150, 2.3, 0); beam.renderOrder = 3; g.add(beam);
  }
  return g;
}
function placeCar(m, c) { m.position.set(c.x, 0, c.y); m.rotation.y = -c.a; }

// ---------- public: render ----------------------------------------------------------------
function snap(car) { cs.yaw = car.a; cs.x = car.x - Math.cos(car.a) * BACK; cs.y = car.y - Math.sin(car.a) * BACK; cs.ok = true; }
function render(car, ghost, dt) {
  if (!R || !world) return;
  if (!cs.ok) snap(car);
  dt = Math.min(0.1, dt || 0);
  // yaw eases after the heading (shortest way round); the position follows the eased yaw
  cs.yaw = wrap(cs.yaw + wrap(car.a - cs.yaw) * (1 - Math.exp(-4.2 * dt)));
  const fx = Math.cos(cs.yaw), fy = Math.sin(cs.yaw), kp = 1 - Math.exp(-12 * dt);
  cs.x += (car.x - fx * BACK - cs.x) * kp; cs.y += (car.y - fy * BACK - cs.y) * kp;
  cam.position.set(cs.x, UP, cs.y);
  cam.lookAt(car.x + fx * LOOK, 0, car.y + fy * LOOK);
  const fov0 = cam.aspect < 0.8 ? 68 : cam.aspect < 1.3 ? 60 : 50;
  cam.fov = fov0 + 7 * Math.min(1, (car.speed || 0) / 420);
  cam.updateProjectionMatrix();
  cam.updateMatrixWorld();
  sky.position.copy(cam.position);
  U.uCam.value.copy(cam.position); U.uCar.value.set(car.x, 8, car.y);

  // the player's car, its headlight and tail lights
  const key = car.spec.id;
  if (key !== carKey) { if (carM) { scene.remove(carM); disposeObj(carM); } carM = carMesh(car.spec, false); scene.add(carM); carKey = key; }
  placeCar(carM, car);
  tailMat.color.set(car.rev ? '#f4f6ff' : car.braking ? '#ff2a2a' : '#8a1414');
  const cx = Math.cos(car.a), cy = Math.sin(car.a);
  head.position.set(car.x + cx * car.spec.len * 0.5, 9, car.y + cy * car.spec.len * 0.5);
  headT.position.set(car.x + cx * 260, 0, car.y + cy * 260);
  // ghost
  const gk = ghost && ghost.spec ? ghost.spec.id : '';
  if (gk !== ghostKey) { if (ghostM) { scene.remove(ghostM); disposeObj(ghostM); ghostM = null; } if (gk) { ghostM = carMesh(ghost.spec, true); scene.add(ghostM); } ghostKey = gk; }
  if (ghostM) { ghostM.visible = !!ghost; if (ghost) placeCar(ghostM, ghost); }

  // the four street lamps nearest the road ahead get a real light; their strength fades with distance so swaps don't pop
  const ax = car.x + fx * 140, ay = car.y + fy * 140, best = [];
  for (const l of lampHeads) {
    const d = (l.x - ax) ** 2 + (l.y - ay) ** 2;
    if (best.length < 4 || d < best[3][0]) { best.push([d, l]); best.sort((a, b) => a[0] - b[0]); if (best.length > 4) best.pop(); }
  }
  for (let k = 0; k < pool.length; k++) {
    const P = pool[k], e = best[k];
    if (!e) { P.intensity = 0; continue; }
    const d = Math.sqrt(e[0]); P.position.set(e[1].x, 30, e[1].y);
    P.color.set(e[1].c === 'cool' ? '#a9c4ff' : '#ffb36b');
    P.intensity = 420 * Math.max(0, Math.min(1, (420 - d) / 220));
  }
  R.render(scene, cam);
  const i = R.info.render;
  stats.calls = i.calls; stats.triangles = i.triangles;
}

// world point -> CSS pixels on the screen, plus its depth; null when behind the camera
function toScreen(x, y, z) {
  if (!cam) return null;
  tmp.set(x, z || 0, y).applyMatrix4(cam.matrixWorldInverse);
  if (tmp.z > -cam.near) return null;
  const d = -tmp.z;
  tmp.applyMatrix4(cam.projectionMatrix);
  return [(tmp.x + 1) / 2 * cw, (1 - tmp.y) / 2 * ch, d];
}

const Chase = {
  init, build, render, snap, toScreen, resize, dispose,
  get ready() { return !!R; },
  get yaw() { return cs.yaw; },                       // the camera's heading in world terms (same convention as car.a)
  info() { return Object.assign({ revision: THREE.REVISION, dpr: dprNow, geometries: R ? R.info.memory.geometries : 0, textures: R ? R.info.memory.textures : 0 }, stats); },
};
window.Chase = Chase;
