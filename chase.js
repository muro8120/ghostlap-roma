// Ghostlap Roma: the chase camera. A three.js renderer that draws the same 2D world (core.js physics, game.js worlds)
// from behind and above the car: the road as ribbons, the OSM footprints extruded into buildings, street lamps,
// the car's headlight. World (x, y) maps to three (x, height, y), so headings and turns carry over unchanged.
// Loaded as a module (three is ESM only); sets window.Chase. game.js calls init / build / render / toScreen.
import * as THREE from './vendor/three/three.module.min.js';

const CL = 30;                       // the car length the camera is framed on (world units)
const BACK = CL * 5.0, UP = CL * 1.6, LOOK = CL * 20; // chase distance, eye height, and how far ahead it looks
const LAG = 0.44;                    // the most the camera's yaw may trail the car's heading (25 degrees)
const CAR_SC = 1.2;                  // the cars drawn a touch bigger than their physics box, so they don't read as toys
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
const cs = { x: 0, y: 0, yaw: 0, ao: 0, ok: false };
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
// the track samples a flat ribbon needs: every one in the bends, fewer down the straights (the same look for far fewer
// triangles); brk(i) adds one wherever its value changes, so a ribbon can start and stop exactly
function keySamples(T, gap, brk) {
  const out = [0];
  let last = 0, a0 = Math.atan2(T.ty[0], T.tx[0]), b0 = brk ? brk(0) : 0;
  for (let i = 1; i < T.N; i++) {
    const a = Math.atan2(T.ty[i], T.tx[i]), b = brk ? brk(i) : 0;
    if (i - last >= gap || Math.abs(wrap(a - a0)) > 0.035 || b !== b0) { out.push(i); last = i; a0 = a; b0 = b; }
  }
  return out;
}
function quad(G, A, B, Cc, D, n, col) { tri(G, A, B, Cc, n, col); tri(G, A, Cc, D, n, col); }
function box(G, x, z, y0, y1, hl, hb, ang, col) { // an upright box, hl half-length along ang and hb half-breadth; no bottom
  const c = Math.cos(ang), s = Math.sin(ang), P = (u, v, y) => [x + u * c - v * s, y, z + u * s + v * c];
  const k4 = [[-hl, -hb], [hl, -hb], [hl, hb], [-hl, hb]];
  for (let k = 0; k < 4; k++) {
    const [u0, v0] = k4[k], [u1, v1] = k4[(k + 1) % 4], mu = (u0 + u1) / 2, mv = (v0 + v1) / 2, l = Math.hypot(mu, mv) || 1;
    quad(G, P(u0, v0, y0), P(u1, v1, y0), P(u1, v1, y1), P(u0, v0, y1), [(mu * c - mv * s) / l, 0, (mu * s + mv * c) / l], col);
  }
  quad(G, P(-hl, -hb, y1), P(hl, -hb, y1), P(hl, hb, y1), P(-hl, hb, y1), UPN, col);
}
const hex = (c, k) => '#' + C(c).multiplyScalar(k).getHexString();

const NOISE = `
float gh(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
float gn(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(gh(i), gh(i + vec2(1.0, 0.0)), f.x), mix(gh(i + vec2(0.0, 1.0)), gh(i + vec2(1.0, 1.0)), f.x), f.y); }`;
// the flat layers: one vertex-coloured mesh, told apart by height. Asphalt gets grain and damp patches, the city
// pavements their slabs, the circuits' run-off a gravel mottle; all fade to flat colour where they'd shimmer
function flatMat() {
  const m = lambert({ vertexColors: true });
  m.onBeforeCompile = (sh) => {
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vF;\nvarying float vFn;')
      .replace('#include <project_vertex>', '#include <project_vertex>\nvF = (modelMatrix * vec4(transformed, 1.0)).xyz;\nvFn = normal.y;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec3 vF;\nvarying float vFn;' + NOISE)
      .replace('#include <map_fragment>', `#include <map_fragment>
if (vFn > 0.5) {
  float fw = length(fwidth(vF.xz)), fine = clamp(1.0 - fw / 5.0, 0.0, 1.0);
  if (abs(vF.y - ${PAVE.toFixed(2)}) < 0.03) {
    vec2 q = vF.xz / vec2(5.4, 3.6); q.x += 0.5 * mod(floor(q.y), 2.0); vec2 e = abs(fract(q) - 0.5);
    float joint = smoothstep(0.42, 0.49, max(e.x, e.y)) * fine;
    diffuseColor.rgb *= (0.88 + 0.24 * mix(0.5, gh(floor(q)), fine)) * (1.0 - 0.35 * joint) * (0.9 + 0.2 * gn(vF.xz / 70.0));
  } else if (vF.y > 1.25 && vF.y < 1.65) {
    diffuseColor.rgb *= 0.84 + 0.2 * gn(vF.xz / 90.0) + 0.1 * mix(0.5, gn(vF.xz / 3.0), fine);
  } else if (abs(vF.y - 1.0) < 0.05) {
    diffuseColor.rgb *= 0.78 + 0.3 * gn(vF.xz / 34.0) + 0.2 * mix(0.5, gn(vF.xz / 3.5), fine);
  }
}`);
  };
  return m;
}
// the ground: a world-space mottle so it isn't a flat sheet. kind 1: grass, 2: paving stones
function groundMat(o, kind) {
  const m = lambert(o);
  if (!kind) return m;
  m.onBeforeCompile = (sh) => {
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec2 vG;')
      .replace('#include <project_vertex>', '#include <project_vertex>\nvG = (modelMatrix * vec4(transformed, 1.0)).xz;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec2 vG;' + NOISE)
      .replace('#include <map_fragment>', `#include <map_fragment>
{ float fw = length(fwidth(vG)), fine = clamp(1.0 - fw / 6.0, 0.0, 1.0);
  float n = gn(vG / 170.0) * 0.5 + gn(vG / 43.0) * 0.3 + mix(0.5, gn(vG / 8.0), fine) * 0.2;
  ${kind === 1 ? 'diffuseColor.rgb *= mix(vec3(0.66, 0.74, 0.62), vec3(1.3, 1.45, 1.12), n);'
    : `vec2 q = vG / 9.0; q.x += 0.5 * mod(floor(q.y), 2.0); vec2 e = abs(fract(q) - 0.5);
  float joint = smoothstep(0.42, 0.48, max(e.x, e.y)) * fine;
  diffuseColor.rgb *= mix(0.75, 1.3, n) * (1.0 - 0.35 * joint);`} }`);
  };
  return m;
}

const PAVE = 2.3; // the top of the city pavements (the road is at 1.3: a kerb of about 20 cm)
let paveSide = null, carLift = 0;
function buildWorld(W, T, def) {
  const city = !!(W.city && window.ROME), ROME = window.ROME, S = city ? ROME.S : 4.5;
  const tx = textures();
  const hw = T.hw, wall = T.hw + T.wall, near = trackGrid(T, 220);
  const zones = T.zones || [];
  const inZone = (x, y, pad) => zones.some((z) => Math.hypot(x - z.x, y - z.y) < z.r + (pad || 0));
  // samples far along the track from i: where a route comes back on itself the other carriageway is "far"
  const K = Math.ceil((wall * 3) / T.ds), far = (i) => (j) => { const d = Math.abs(i - j); return Math.min(d, T.N - d) <= K; };
  const at = (i, o) => [T.xs[i] - T.ty[i] * o, T.ys[i] + T.tx[i] * o]; // o to the right of travel (as car.off)
  const ALL = Array.from({ length: T.N }, (_, i) => i), KEY = keySamples(T, 8);
  paveSide = null;

  const fogC = city ? '#191820' : '#17171d';
  scene.fog = new THREE.Fog(fogC, city ? 700 : 900, city ? 3400 : 4200);
  R.setClearColor(fogC);

  // ground: grass or paving stones, and for the circuits the 2D under-layer (spina, cavea, river, ruins) painted onto it,
  // with a darker verge just outside the run-off
  const gk = city ? 0 : def.id === 'circo' || def.id === 'appia' ? 1 : 2;
  const b = T.bounds, cx = (b.minX + b.maxX) / 2, cy = (b.minY + b.maxY) / 2;
  const span = Math.max(b.maxX - b.minX, b.maxY - b.minY) + 12000;
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(span, span).rotateX(-Math.PI / 2), groundMat({ color: city ? '#16171a' : hex(W.ground, 1.5) }, gk));
  ground.position.set(cx, 0, cy); world.add(ground);
  if (!city && W.under.length) {
    const pad = 700, x0 = b.minX - pad, y0 = b.minY - pad, w = b.maxX - b.minX + pad * 2, h = b.maxY - b.minY + pad * 2;
    const n = Math.min(2048, R.capabilities.maxTextureSize), k = n / Math.max(w, h);
    const tex = canvasTex(n, (g) => {
      g.fillStyle = hex(W.ground, 1.5); g.fillRect(0, 0, n, n);
      g.setTransform(k, 0, 0, k, -x0 * k, -y0 * k);
      if (W.path) { g.lineJoin = 'round'; g.strokeStyle = hex(W.ground, 0.5); g.lineWidth = (wall + 110) * 2; g.stroke(W.path); }
      for (const o of W.under) { try { o.draw(g); } catch (e) {} }
      if (W.extra) try { W.extra(g); } catch (e) {}
    });
    tex.anisotropy = Math.min(8, R.capabilities.getMaxAnisotropy());
    const sz = n / k, m = new THREE.Mesh(new THREE.PlaneGeometry(sz, sz).rotateX(-Math.PI / 2), groundMat({ map: tex }, gk));
    m.position.set(x0 + sz / 2, 0.3, y0 + sz / 2); world.add(m);
  }

  // flat layers, one merged mesh: river, side streets, pavements, road, lines, chequer, turning circles
  const F = Geo();
  const ribbon = (o0, o1, y, col, on) => {
    const ks = on ? ALL : KEY, n = ks.length;
    for (let k = 0; k < n; k++) {
      const i = ks[k], j = ks[(k + 1) % n];
      if (on && !on(i)) continue;
      flatQuad(F, at(i, o0), at(j, o0), at(j, o1), at(i, o1), y, typeof col === 'function' ? col(i) : col);
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
  const PV = C('#6e695f'), KERB = C('#9d968a'), KFACE = C('#5a564e');
  let mouth = () => false, bridgeAt = null;
  const bridges = [];
  if (city) {
    const river = C('#0b1824');
    for (const r of ROME.river) { const p = []; for (let i = 0; i < r.length; i += 2) p.push([r[i], r[i + 1]]); line(p, 92 * S, 0.5, river, 46 * S); }
    const SW = [16 * S, 11 * S, 6 * S], SC = [C('#232429'), C('#1f2025'), C('#1d1e22')], bridge = C('#4b4740'), parapet = C('#77705f');
    // side streets and bridges also go into a grid: a side street's mouth breaks the pavement, a bridge gets parapets
    const sg = new Map(), bg = new Map(), CELL = 60, gkey = (x, y) => Math.floor(x / CELL) * 100003 + Math.floor(y / CELL);
    const put = (m, x, y, v) => { const k = gkey(x, y); let a = m.get(k); if (!a) m.set(k, (a = [])); a.push(v); };
    const any = (m, x, y, f) => {
      const ci = Math.floor(x / CELL), cj = Math.floor(y / CELL);
      for (let i = ci - 1; i <= ci + 1; i++) for (let j = cj - 1; j <= cj + 1; j++) { const a = m.get(i * 100003 + j); if (a) for (const v of a) if (f(v)) return true; }
      return false;
    };
    for (const s of ROME.streets) {
      const kind = s[0] & 3, br = s[0] & 4, p = [];
      for (let i = 2; i < s.length; i += 2) p.push([s[i], s[i + 1]]);
      if (!p.some((q) => near(q[0], q[1], REACH).d < REACH)) continue;
      if (br) { line(p, 17 * S, 0.7, parapet, 0); line(p, 13 * S, 0.8, bridge, 0); bridges.push(p); }
      else line(p, SW[kind], 0.6, SC[kind], SW[kind] / 2);
      for (let i = 1; i < p.length; i++) {
        const [ax, ay] = p[i - 1], [bx, by] = p[i], l = Math.hypot(bx - ax, by - ay) || 1, ux = (bx - ax) / l, uy = (by - ay) / l;
        for (let d = 0; d <= l; d += 10) put(br ? bg : sg, ax + ux * d, ay + uy * d, [ax + ux * d, ay + uy * d, SW[kind] / 2, ux, uy]);
      }
    }
    mouth = (x, y, tx0, ty0) => any(sg, x, y, (v) => (v[0] - x) ** 2 + (v[1] - y) ** 2 < (v[2] + 2) ** 2 && Math.abs(v[3] * tx0 + v[4] * ty0) < 0.7);
    bridgeAt = new Uint8Array(T.N);
    for (let i = 0; i < T.N; i++) bridgeAt[i] = any(bg, T.xs[i], T.ys[i], (v) => (v[0] - T.xs[i]) ** 2 + (v[1] - T.ys[i]) ** 2 < 900) ? 1 : 0;
    ribbon(-(hw + 7), hw + 7, 1.2, C('#3a3c42')); // gutters
    // pavements: a kerb, then paving back to the building line (to the parapet on a bridge), broken for a side street's
    // mouth, a turning circle, or the other carriageway where a route comes back on itself
    paveSide = [];
    for (const s of [-1, 1]) {
      const on = new Uint8Array(T.N);
      for (let i = 0; i < T.N; i++) {
        let ok = bridgeAt[i] ? 2 : 1;
        for (const o of [hw + 9, (hw + wall) / 2 + 4, wall + 10]) {
          const [x, y] = at(i, o * s);
          if (inZone(x, y, 6) || near(x, y, hw + 10, far(i)).d < hw + 9 || (!bridgeAt[i] && mouth(x, y, T.tx[i], T.ty[i]))) { ok = 0; break; }
        }
        on[i] = ok;
      }
      paveSide.push(on);
      const ks = keySamples(T, 4, (i) => on[i]);
      for (let k = 0; k < ks.length; k++) {
        const i = ks[k], j = ks[(k + 1) % ks.length];
        if (!on[i]) continue;
        const o0 = (hw + 7) * s, o1 = (hw + 9.5) * s, o2 = (on[i] === 2 ? wall : wall + 12) * s, a0 = at(i, o0), b0 = at(j, o0);
        quad(F, [a0[0], 1.2, a0[1]], [b0[0], 1.2, b0[1]], [b0[0], PAVE, b0[1]], [a0[0], PAVE, a0[1]], [T.ty[i] * s, 0, -T.tx[i] * s], KFACE);
        flatQuad(F, a0, b0, at(j, o1), at(i, o1), PAVE, KERB);
        flatQuad(F, at(i, o1), at(j, o1), at(j, o2), at(i, o2), PAVE, PV);
      }
    }
  } else {
    ribbon(-wall, wall, 1.0, C(W.runoff));
    // red and white kerbs on the bends: flush with the asphalt on the inside, rising a little to the outer edge
    const red = C('#a8262b'), white = C('#cfccc4'), curb = (i) => Math.abs(T.curv[i]) > 1 / 700;
    const stripe = (i) => (Math.floor((i * T.ds) / 22) % 2 ? red : white);
    for (const s of [-1, 1]) for (let i = 0; i < T.N; i++) {
      if (!curb(i)) continue;
      const j = (i + 1) % T.N, a0 = at(i, (hw - 2) * s), b0 = at(j, (hw - 2) * s), a1 = at(i, (hw + 9) * s), b1 = at(j, (hw + 9) * s);
      quad(F, [a0[0], 1.38, a0[1]], [b0[0], 1.38, b0[1]], [b1[0], 2.1, b1[1]], [a1[0], 2.1, a1[1]], UPN, stripe(i));
    }
  }
  const asphalt = C(W.asphalt), edge = C(W.edge);
  ribbon(-hw, hw, 1.3, asphalt);
  ribbon(-(hw - 4), hw - 4, 1.45, edge);
  ribbon(-(hw - 6.5), hw - 6.5, 1.6, asphalt);
  for (const z of zones) {
    if (city) { // a round piazza: paving round the asphalt, except where the road comes in and goes out
      for (let k = 0; k < 64; k++) {
        const a0 = (k / 64) * Math.PI * 2, a1 = ((k + 1) / 64) * Math.PI * 2, P = (a, r) => [z.x + Math.cos(a) * r, z.y + Math.sin(a) * r];
        const [ax, ay] = P(a0, z.r), [bx, by] = P(a1, z.r);
        if (near(ax, ay, hw + 12).d < hw + 10 || near(bx, by, hw + 12).d < hw + 10) continue;
        flatQuad(F, P(a0, z.r), P(a1, z.r), P(a1, z.r + 30), P(a0, z.r + 30), PAVE, PV);
        quad(F, [ax, 1.2, ay], [bx, 1.2, by], [bx, PAVE, by], [ax, PAVE, ay], [-Math.cos(a0), 0, -Math.sin(a0)], KFACE);
      }
    }
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
  world.add(toMesh(F, flatMat()));

  // soft walls: barriers on the circuits; in town the building line is the wall, so only bridges get one (a parapet),
  // and the turning circles their round kerb. None across the other carriageway where a route comes back on itself
  const KB = Geo(), kc = C(city ? '#4d4a44' : W.barrier), kt = C(city ? '#6d685e' : W.barrier).multiplyScalar(1.25);
  const pc = C('#8a8373'), pt = C('#a39b88');
  for (const side of [-1, 1]) {
    const okAt = (i) => {
      if (city && !bridgeAt[i]) return 0;
      const j = (i + 1) % T.N, [ax, ay] = at(i, wall * side), [bx, by] = at(j, wall * side);
      if (inZone(ax, ay, 8) || inZone(bx, by, 8)) return 0;
      return near(ax, ay, wall, far(i)).d < wall - 3 ? 0 : 1;
    };
    const on = ALL.map(okAt), ks = keySamples(T, 6, (i) => on[i]);
    for (let k = 0; k < ks.length; k++) {
      const i = ks[k], j = ks[(k + 1) % ks.length];
      if (!on[i]) continue;
      const [ax, ay] = at(i, wall * side), [bx, by] = at(j, wall * side), kh = city ? PAVE + 5 : 9, c0 = city ? pc : kc, c1 = city ? pt : kt;
      const n = [-T.ty[i] * side, 0, T.tx[i] * side], m = [-n[0], 0, -n[2]], w2 = 2;
      const P = (x, y, s, h) => [x + n[0] * s, h, y + n[2] * s];
      quad(KB, P(ax, ay, w2, -1), P(bx, by, w2, -1), P(bx, by, w2, kh), P(ax, ay, w2, kh), n, c0);
      quad(KB, P(ax, ay, -w2, -1), P(bx, by, -w2, -1), P(bx, by, -w2, kh), P(ax, ay, -w2, kh), m, c0);
      quad(KB, P(ax, ay, -w2, kh), P(bx, by, -w2, kh), P(bx, by, w2, kh), P(ax, ay, w2, kh), UPN, c1);
    }
  }
  for (const p of bridges) for (let i = 1; i < p.length; i++) { // the other bridges in view: low parapets both sides
    const [ax, ay] = p[i - 1], [bx, by] = p[i], l = Math.hypot(bx - ax, by - ay) || 1, ux = (bx - ax) / l, uy = (by - ay) / l;
    if (near((ax + bx) / 2, (ay + by) / 2, wall + 30).d < wall + 20) continue;
    for (const sd of [-1, 1]) {
      const o = 7.5 * S * sd, A = [ax - uy * o, ay + ux * o], B = [bx - uy * o, by + ux * o];
      box(KB, (A[0] + B[0]) / 2, (A[1] + B[1]) / 2, 0, 6, l / 2, 1.6, Math.atan2(uy, ux), pc);
    }
  }
  for (const z of zones) { // the turning circle's round soft wall, except where the road goes in and out
    const zh = city ? PAVE + 2.5 : 9;
    for (let k = 0; k < 64; k++) {
      const a0 = (k / 64) * Math.PI * 2, a1 = ((k + 1) / 64) * Math.PI * 2;
      const ax = z.x + Math.cos(a0) * z.r, ay = z.y + Math.sin(a0) * z.r, bx = z.x + Math.cos(a1) * z.r, by = z.y + Math.sin(a1) * z.r;
      if (near(ax, ay, wall).d < wall || near(bx, by, wall).d < wall) continue;
      const n = [Math.cos(a0), 0, Math.sin(a0)];
      quad(KB, [ax, -1, ay], [bx, -1, by], [bx, zh, by], [ax, zh, ay], n, kc);
      tri(KB, [ax, zh, ay], [bx, zh, by], [z.x + Math.cos(a1) * (z.r + 3), zh, z.y + Math.sin(a1) * (z.r + 3)], UPN, kt);
    }
  }
  { // start / finish gantry: two posts and a beam over the line, with a chequered banner hanging under it
    const o = wall + 9, hg = 74, ang = Math.atan2(T.ty[0], T.tx[0]), gc = C('#3b3d43');
    for (const s of [-1, 1]) { const [x, y] = at(0, o * s); box(KB, x, y, -1, hg + 4, 2.4, 2.4, ang, gc); }
    box(KB, T.xs[0], T.ys[0], hg, hg + 4, 2, o + 2.4, ang, gc);
    const bw = o * 2 - 6, ct = canvasTex(32, (g, n) => { for (let i = 0; i < 2; i++) for (let j = 0; j < 2; j++) { g.fillStyle = (i + j) % 2 ? '#16171a' : '#ece9e2'; g.fillRect(i * n / 2, j * n / 2, n / 2, n / 2); } });
    ct.wrapS = THREE.RepeatWrapping; ct.repeat.set(Math.round(bw / 18), 1); ct.magFilter = THREE.NearestFilter;
    const bn = new THREE.Mesh(new THREE.PlaneGeometry(bw, 9), new THREE.MeshBasicMaterial({ map: ct, side: THREE.DoubleSide, color: '#c9c6bf' }));
    bn.position.set(T.xs[0], hg - 4.5, T.ys[0]); bn.rotation.y = Math.atan2(T.tx[0], T.ty[0]);
    world.add(bn);
  }
  if (KB.p.length) world.add(toMesh(KB, lambert({ vertexColors: true })));

  let lamps = W.lamps;
  if (city) { const occ = buildCity(ROME, T, near, REACH, wall, inZone); cityFurniture(T, near, far, wall, inZone, mouth, bridgeAt, occ, at); }
  else {
    // which side of the track is outside (as outwardSign in game.js)
    let inside = false; { const x = T.xs[0] - T.ty[0] * 400, y = T.ys[0] + T.tx[0] * 400;
      for (let a = 0, c = T.N - 1; a < T.N; c = a++) if ((T.ys[a] > y) !== (T.ys[c] > y) && x < ((T.xs[c] - T.xs[a]) * (y - T.ys[a])) / (T.ys[c] - T.ys[a]) + T.xs[a]) inside = !inside; }
    const out = inside ? -1 : 1, avoid = keepOut(def.id, T, wall, out);
    trees(W); circuitDecor(T, def, near, wall, out);
    lamps = circuitScenery(W, T, def.id, near, wall, out, avoid);
  }
  lights(W, T, near, wall, lamps);
}

// where the circuits' monuments stand (the same spots as circuitDecor), so trees and lamps keep clear of them
function keepOut(id, T, wall, out) {
  const c = []; let f = null; // circles [x, y, r], and a shape test
  const off = (i, d) => [T.xs[i] - T.ty[i] * d * out, T.ys[i] + T.tx[i] * d * out];
  if (id === 'circo') f = (x, y, r) => Math.abs(y + 15) < 50 + r && Math.abs(x) < 1010 + r;
  if (id === 'colosseo') { f = (x, y, r) => ((x - 30) / (335 + r)) ** 2 + ((y - 60) / (280 + r)) ** 2 < 1; c.push([-2700, -400, 240], [-300, 360, 70]); }
  if (id === 'tevere') {
    const river = (x) => 200 * Math.sin(x / 520);
    f = (x, y, r) => Math.abs(y - river(x)) < 150 + r;
    c.push([-700, river(-700) - 360 - wall - 200, 230], [-1550, river(-1550) - 360 - wall - 230, 150]);
  }
  if (id === 'appia') {
    const [mx, my] = off(Math.round(T.N * 0.36), wall + 200), ay = T.bounds.maxY - 160;
    c.push([mx, my, 110]);
    for (let i = 40; i < T.N; i += 55) { const sd = i % 110 < 55 ? 1 : -1, d = wall + 70; c.push([T.xs[i] - T.ty[i] * d * sd, T.ys[i] + T.tx[i] * d * sd, 45]); }
    f = (x, y, r) => Math.abs(y - ay) < 30 + r;
  }
  return (x, y, r) => (f && f(x, y, r)) || c.some(([qx, qy, qr]) => (x - qx) ** 2 + (y - qy) ** 2 < (qr + r) ** 2);
}

// instanced scenery: one merged, vertex-coloured shape drawn many times (one draw call per kind)
function instanced(parts, list, tint) { // parts as merged(); list of [x, y, z, scale, yaw, colour]
  if (!list.length) { for (const p of parts) p[0].dispose(); return; }
  const m = new THREE.InstancedMesh(merged(parts), lambert({ vertexColors: true }), list.length);
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3(), Y = new THREE.Vector3(0, 1, 0), col = new THREE.Color();
  list.forEach(([x, y, z, sc, yaw, c], k) => {
    m4.compose(p.set(x, y, z), q.setFromAxisAngle(Y, yaw || 0), s.set(sc, sc, sc)); m.setMatrixAt(k, m4);
    if (tint) m.setColorAt(k, col.set(c || '#ffffff'));
  });
  world.add(m);
  return m;
}
const TREE = { // shapes at scale 1, coloured per vertex
  pine: () => [[new THREE.CylinderGeometry(1.1, 1.6, 30, 5, 1, true), 0, 15, 0, '#3a2c20'], [new THREE.IcosahedronGeometry(1, 0).scale(19, 7, 19), 0, 33, 0, '#26402a']],
  plane: () => [[new THREE.CylinderGeometry(1.3, 1.8, 24, 5, 1, true), 0, 12, 0, '#4a4034'], [new THREE.IcosahedronGeometry(1, 0).scale(15, 13, 15), 0, 34, 0, '#2f4a2c']],
  cypress: () => [[new THREE.ConeGeometry(6, 62, 6, 1, true), 0, 31, 0, '#183a24']],
};

// The circuits: lamps the whole way round at an even spacing (filling in between game.js's own), and a tree line
// outside the run-off on both sides. Returns the full lamp list.
function circuitScenery(W, T, id, near, wall, out, avoid) {
  const lamps = W.lamps.slice(), step = Math.max(1, Math.round(190 / T.ds));
  const clear = (x, y, r) => !lamps.some((l) => (l.x - x) ** 2 + (l.y - y) ** 2 < r * r);
  for (let i = 0, k = 0; i < T.N; i += step, k++) {
    const s = k % 2 ? 1 : -1, d = wall + 16, x = T.xs[i] - T.ty[i] * d * s, y = T.ys[i] + T.tx[i] * d * s;
    if (!clear(x, y, 110) || near(x, y, wall + 16).d < wall + 12 || avoid(x, y, 14)) continue;
    lamps.push({ x, y, c: 'warm' });
  }
  const kinds = { circo: ['pine', 'pine'], colosseo: ['pine', 'plane'], tevere: ['plane', 'plane'], appia: ['cypress', 'pine'] }[id] || ['pine', 'plane'];
  const lists = { pine: [], plane: [], cypress: [] }, olds = W.over.filter((o) => o.r > 6 && o.r < 90), tstep = Math.max(1, Math.round(70 / T.ds));
  for (const s of [-1, 1]) {
    if (id === 'circo' && s === out) continue; // the stands are there
    for (let i = 0; i < T.N; i += tstep) {
      const h = hash(i, s + 3), kind = kinds[h < 0.6 ? 0 : 1], r = kind === 'cypress' ? 8 : 20;
      if (hash(i, s + 9) < 0.18) continue; // a few gaps, so it isn't a hedge
      const d = wall + 30 + r + hash(i, s + 5) * 34, x = T.xs[i] - T.ty[i] * d * s + (hash(i, 11) - 0.5) * 20, y = T.ys[i] + T.tx[i] * d * s + (hash(i, 12) - 0.5) * 20;
      if (near(x, y, wall + r + 40).d < wall + r + 24 || avoid(x, y, r + 6) || olds.some((o) => (o.x - x) ** 2 + (o.y - y) ** 2 < (o.r + r) ** 2)) continue;
      if (lamps.some((l) => (l.x - x) ** 2 + (l.y - y) ** 2 < 900)) continue;
      const sc = 0.8 + hash(i, s + 7) * 0.45;
      lists[kind].push([x, 0, y, sc, hash(i, 13) * 6, '#' + C('#ffffff').multiplyScalar(0.7 + hash(i, 14) * 0.45).getHexString()]);
    }
  }
  for (const k of Object.keys(lists)) instanced(TREE[k](), lists[k], true);
  stats.trees = lists.pine.length + lists.plane.length + lists.cypress.length;
  return lamps;
}

// Rome: where the building line has a gap (a piazza, a park, a side street), something low fills it, chosen by a
// seeded hash so the street looks the same every run: a row of parked cars, plane trees, or bollards along the wall
const PARKED = ['#5a6270', '#7a3a3a', '#4f6457', '#8a8d92', '#3d4250', '#8c7a5a', '#33405e', '#a0a3a8', '#6a5f52'];
function cityFurniture(T, near, far, wall, inZone, mouth, bridgeAt, occ, at) {
  const cars = [], trees = [], bols = [];
  for (const s of [-1, 1]) {
    let kind = -1;
    for (let i = 0; i < T.N; i += 4) {
      const [x1, y1] = at(i, (wall + 19) * s), [x2, y2] = at(i, (wall + 40) * s), [xw, yw] = at(i, wall * s);
      const ok = !bridgeAt[i] && !inZone(x1, y1, 14) && near(x1, y1, wall + 20, far(i)).d >= wall + 14;
      if (!ok || occ(x1, y1, 6)) { kind = -1; continue; }
      const yaw = -Math.atan2(T.ty[i], T.tx[i]);
      if (mouth(xw, yw, T.tx[i], T.ty[i]) || mouth(x1, y1, T.tx[i], T.ty[i])) { // a side street: bollards across its mouth
        for (const u of [-13, 0, 13]) bols.push([xw + T.tx[i] * u, PAVE - 0.5, yw + T.ty[i] * u, 1, 0]);
        kind = -1; continue;
      }
      if (kind < 0) { const h = hash(i, s + 21); kind = h < 0.42 ? 0 : h < 0.78 ? 1 : 2; }
      const wide = !occ(x2, y2, 10);
      if (kind === 0 && wide) {
        const last = cars[cars.length - 1]; // keep a car's length apart where the kerb bends round
        if (hash(i, s + 23) > 0.22 && (!last || (last[0] - x1) ** 2 + (last[2] - y1) ** 2 > 34 * 34)) cars.push([x1, 0, y1, 1, yaw + (hash(i, 29) < 0.5 ? 0 : Math.PI), PARKED[Math.floor(hash(i, s + 25) * PARKED.length)]]);
      }
      else if (kind === 1 && wide) {
        const [tx1, ty1] = at(i, (wall + 22) * s);
        if ((i / 4) % 2 === 0) trees.push([tx1, 0, ty1, 0.85 + hash(i, 27) * 0.35, hash(i, 31) * 6, '#' + C('#ffffff').multiplyScalar(0.75 + hash(i, 33) * 0.4).getHexString()]);
      }
      else for (const u of [-13, 0, 13]) bols.push([xw + T.tx[i] * u, PAVE - 0.5, yw + T.ty[i] * u, 1, 0]);
    }
  }
  instanced([[new THREE.BoxGeometry(26, 4.6, 12), 0, 5.2, 0, '#ffffff'], [new THREE.BoxGeometry(12.5, 3.8, 10.4), -1.5, 9.4, 0, '#454b55']], cars, true);
  instanced(TREE.plane(), trees, true);
  instanced([[new THREE.CylinderGeometry(0.8, 1.1, 5.4, 6, 1, true), 0, 2.7, 0, '#3a3c41']], bols, false);
  stats.parked = cars.length; stats.trees = trees.length; stats.bollards = bols.length;
}

// OSM footprints near the route, extruded and merged into a few chunks (frustum culling works per chunk)
const FACADE = ['#a0643c', '#b07a45', '#9c5a3c', '#b58a5a', '#8d4f36', '#a8835e', '#c09a6a', '#94603f', '#b46f4a'].map(C);
function buildCity(ROME, T, near, REACH, wall, inZone) {
  const S = ROME.S, CH = 1500, chunks = new Map(), OC = 12, occ = new Set();
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
    // the footprint on a coarse grid, so the street furniture can find the gaps between buildings
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const p of pts) { x0 = Math.min(x0, p[0]); y0 = Math.min(y0, p[1]); x1 = Math.max(x1, p[0]); y1 = Math.max(y1, p[1]); }
    for (let i = Math.floor(x0 / OC); i <= Math.floor(x1 / OC); i++) for (let j = Math.floor(y0 / OC); j <= Math.floor(y1 / OC); j++) {
      const px = (i + 0.5) * OC, py = (j + 0.5) * OC;
      let inn = false;
      for (let a = 0, c = pts.length - 1; a < pts.length; c = a++) if ((pts[a][1] > py) !== (pts[c][1] > py) && px < ((pts[c][0] - pts[a][0]) * (py - pts[a][1])) / (pts[c][1] - pts[a][1]) + pts[a][0]) inn = !inn;
      if (inn) occ.add(i * 100003 + j);
    }
  }
  for (const G of chunks.values()) world.add(toMesh(G, bMat));
  stats.chunks = chunks.size;
  return (x, y, r) => { // is there a building within about r of (x, y)?
    const n = Math.ceil(r / OC), ci = Math.floor(x / OC), cj = Math.floor(y / OC);
    for (let i = ci - n; i <= ci + n; i++) for (let j = cj - n; j <= cj + n; j++) if (occ.has(i * 100003 + j)) return true;
    return false;
  };
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
        // the tier fronts are travertine, floodlit from below like the monuments
        const n = [T.ty[i] * out, 0, -T.tx[i] * out], fc = C('#54483a'), tf = C('#6a5e4c'), u0 = (i * T.ds) / S, u1 = ((i + 2) * T.ds) / S, f = (u, y) => [u, y / S, -14, h];
        tri(G, [a0[0], hp, a0[1]], [b0[0], hp, b0[1]], [b0[0], hh, b0[1]], n, tf, f(u0, hp), f(u1, hp), f(u1, hh)); tri(G, [a0[0], hp, a0[1]], [b0[0], hh, b0[1]], [a0[0], hh, a0[1]], n, tf, f(u0, hp), f(u1, hh), f(u0, hh));
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
  const H = Geo(true);
  for (let k = 0; k < 260; k++) {
    const a = hash(k, 91) * Math.PI * 2, d = R0 + hash(k, 92) * 1500, x = cx + Math.cos(a) * d, y = cy + Math.sin(a) * d;
    if (near(x, y, wall + 400).d < wall + 380) continue;
    const st = 4 + Math.floor(hash(k, 93) * (id === 'appia' ? 3 : 6));
    prism(H, rect(x, y, 140 + hash(k, 94) * 200, 120 + hash(k, 95) * 160, hash(k, 96) * 3), st * STOREY + 1, S,
      FACADE[k % FACADE.length].clone().multiplyScalar(0.28 + hash(k, 97) * 0.15), C('#4e3a30'), 1 + k);
  }
  world.add(toMesh(G, bMat));
  const far = buildingMaterial(); far.fog = false; // the far city stays a dark skyline with its windows lit, not lost in the haze
  world.add(toMesh(H, far));
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
function lights(W, T, near, wall, lamps) {
  const tx = textures(), HEAD = 30;
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
    const pm = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.55, 0.85, 1, 5, 1, true).translate(0, 0.5, 0), lambert({ color: '#2b2c30' }), poles.length);
    poles.forEach(([x, y], k) => { m4.compose(p.set(x, 0, y), q4.identity(), s.set(1, HEAD + 3, 1)); pm.setMatrixAt(k, m4); });
    world.add(pm);
  }
  if (arms.length) {
    const am = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1).translate(0.5, 0, 0), lambert({ color: '#26272b' }), arms.length);
    arms.forEach(([x0, y0, x1, y1], k) => {
      m4.compose(p.set(x0, HEAD + 1.6, y0), q4.setFromAxisAngle(Y, -Math.atan2(y1 - y0, x1 - x0)), s.set(Math.hypot(x1 - x0, y1 - y0), 0.7, 0.7));
      am.setMatrixAt(k, m4);
    });
    world.add(am);
  }
  const warm = C('#ffb46a'), cool = C('#9fbfff');
  if (lamps.length) {
    // a small lantern under a dark cap (one shape), and a soft halo round it
    const hm = new THREE.InstancedMesh(merged([[new THREE.BoxGeometry(3, 1.5, 3), 0, 0, 0, '#ffe9c2'], [new THREE.ConeGeometry(2.6, 1.6, 4, 1, true).rotateY(Math.PI / 4), 0, 1.5, 0, '#3a3530']]),
      new THREE.MeshBasicMaterial({ vertexColors: true, fog: false }), lamps.length);
    lamps.forEach((l, k) => { m4.compose(p.set(l.x, HEAD, l.y), q4.identity(), s.set(1, 1, 1)); hm.setMatrixAt(k, m4); });
    world.add(hm);
    const hp = []; for (const l of lamps) hp.push(l.x, HEAD - 0.6, l.y);
    const hg = new THREE.BufferGeometry(); hg.setAttribute('position', new THREE.Float32BufferAttribute(hp, 3));
    const halo = new THREE.Points(hg, new THREE.PointsMaterial({ color: '#ffc387', size: 13, map: tx.halo, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false, opacity: 0.45 }));
    world.add(halo);
  }
  // pools of light: every lamp, and the floodlit squares and monuments
  const pools = lamps.map((l) => [l.x, l.y, W.city ? 130 : 150, l.c === 'cool' ? cool : warm, W.city ? 0.15 : 0.2]).concat(W.floods.map((f) => [f.x, f.y, f.r, f.c === 'cool' ? cool : warm, f.a * 0.3]));
  if (pools.length) {
    const gm = new THREE.InstancedMesh(new THREE.PlaneGeometry(2, 2).rotateX(-Math.PI / 2), additive({ map: tx.glow }), pools.length);
    pools.forEach(([x, y, r, c, a], k) => { m4.compose(p.set(x, 2.2, y), q4.identity(), s.set(r, 1, r)); gm.setMatrixAt(k, m4); gm.setColorAt(k, col.copy(c).multiplyScalar(a)); });
    gm.renderOrder = 2; world.add(gm);
  }
}

// ---------- the cars ----------------------------------------------------------------------
// parts that share a material merged into one geometry (positions and normals), so a car is a handful of draw calls
function merged(parts) { // [[geometry, x, y, z, colour?], ...]; with colours, a per-vertex colour attribute
  const p = [], n = [], c = [], col = new THREE.Color(), tinted = parts.some((q) => q[4]);
  for (const [g0, x, y, z, cc] of parts) {
    const g = g0.index ? g0.toNonIndexed() : g0, a = g.attributes.position, b = g.attributes.normal;
    col.set(cc || '#ffffff');
    for (let i = 0; i < a.count; i++) {
      p.push(a.getX(i) + x, a.getY(i) + y, a.getZ(i) + z);
      if (b) n.push(b.getX(i), b.getY(i), b.getZ(i));
      if (tinted) c.push(col.r, col.g, col.b);
    }
    if (g !== g0) g.dispose(); g0.dispose();
  }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(p, 3));
  if (n.length) g.setAttribute('normal', new THREE.Float32BufferAttribute(n, 3));
  if (tinted) g.setAttribute('color', new THREE.Float32BufferAttribute(c, 3));
  return g;
}
function carMesh(sp, ghost) {
  const g = new THREE.Group(), L = sp.len, Wd = sp.wid, st = sp.style;
  const bh = st === 'bubble' ? Wd * 0.42 : st === 'wedge' ? Wd * 0.27 : Wd * 0.31, y0 = 2.6;
  const B = (w, h, d, x, y, z) => [new THREE.BoxGeometry(w, h, d), x, y, z];
  const cl = st === 'bubble' ? 0.55 : st === 'gt' ? 0.4 : 0.42, cx = st === 'gt' ? -L * 0.12 : -L * 0.04, chh = st === 'bubble' ? Wd * 0.36 : Wd * 0.27;
  const body = [B(L, bh, Wd, 0, y0 + bh / 2, 0)], cabin = [B(L * cl, chh, Wd * 0.8, cx, y0 + bh + chh / 2, 0)];
  const roof = [B(L * cl * 0.8, 0.8, Wd * 0.72, cx - L * 0.02, y0 + bh + chh + 0.4, 0)];
  if (st === 'hyper' || st === 'wedge') roof.push(B(L * 0.08, 1.2, Wd * 0.9, -L * 0.46, y0 + bh + 2.6, 0)); // wing
  g.scale.setScalar(CAR_SC);
  if (ghost) {
    // a ghost: pale blue glass with a faint bright outline, and a cold glow on the road so it shows on dark asphalt
    const all = body.concat(cabin, roof), edges = all.map(([b0, x, y, z]) => [new THREE.EdgesGeometry(b0), x, y, z]);
    g.add(new THREE.Mesh(merged(all),new THREE.MeshBasicMaterial({ color: '#a9d3ff', transparent: true, opacity: 0.42, depthWrite: false })));
    const ol = new THREE.LineSegments(merged(edges), new THREE.LineBasicMaterial({ color: '#e4f3ff', transparent: true, opacity: 0.4, depthWrite: false }));
    ol.renderOrder = 4; g.add(ol);
    const gl = new THREE.Mesh(new THREE.PlaneGeometry(L * 2, Wd * 2.6).rotateX(-Math.PI / 2), additive({ map: textures().glow, color: C('#5f9dff').multiplyScalar(0.4) }));
    gl.position.y = 2.1; gl.renderOrder = 2; g.add(gl);
    return g;
  }
  g.add(new THREE.Mesh(merged(body), lambert({ color: sp.body, emissive: C(sp.body).multiplyScalar(0.08) })));
  g.add(new THREE.Mesh(merged(cabin), lambert({ color: '#0d1117' })));
  g.add(new THREE.Mesh(merged(roof), lambert({ color: sp.roof })));
  const wheels = []; for (const [sx, sz] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) wheels.push([new THREE.CylinderGeometry(3, 3, 2.6, 10).rotateX(Math.PI / 2), sx * L * 0.32, 3, sz * (Wd / 2 - 0.6)]);
  g.add(new THREE.Mesh(merged(wheels), lambert({ color: '#0b0b0c' })));
  const hl = [], tl = [];
  for (const sz of [-1, 1]) { hl.push(B(0.8, 1.6, Wd * 0.2, L / 2 + 0.2, y0 + bh * 0.62, sz * Wd * 0.3)); tl.push(B(0.8, 1.6, Wd * 0.24, -L / 2 - 0.2, y0 + bh * 0.66, sz * Wd * 0.3)); }
  g.add(new THREE.Mesh(merged(hl), new THREE.MeshBasicMaterial({ color: '#fff4d6' })), new THREE.Mesh(merged(tl), tailMat));
  const blob = new THREE.Mesh(new THREE.PlaneGeometry(L * 1.5, Wd * 1.9).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ map: textures().blob, transparent: true, depthWrite: false, opacity: 0.8 }));
  blob.position.y = 2.0; blob.renderOrder = 1; g.add(blob);
  const beam = new THREE.Mesh(new THREE.PlaneGeometry(300, 190).rotateX(-Math.PI / 2), additive({ map: textures().beam, color: C('#ffe9c4').multiplyScalar(0.22) }));
  beam.position.set(L * 0.45 + 150, 2.3, 0); beam.renderOrder = 3; g.add(beam);
  // the beam's sheen on wet asphalt: a long soft streak down the middle of the throw
  const wet = new THREE.Mesh(new THREE.PlaneGeometry(230, 30).rotateX(-Math.PI / 2), additive({ map: textures().glow, color: C('#ffe2b8').multiplyScalar(0.14) }));
  wet.position.set(L * 0.5 + 100, 2.4, 0); wet.renderOrder = 3; g.add(wet);
  return g;
}
function placeCar(m, c) { m.position.set(c.x, 0, c.y); m.rotation.y = -c.a; }

// ---------- public: render ----------------------------------------------------------------
function snap(car) { cs.yaw = car.a; cs.ao = 0; cs.x = car.x - Math.cos(car.a) * BACK; cs.y = car.y - Math.sin(car.a) * BACK; cs.ok = true; }
function render(car, ghost, dt) {
  if (!R || !world) return;
  if (!cs.ok) snap(car);
  dt = Math.min(0.1, dt || 0);
  // yaw springs after the heading (shortest way round) and never trails it by more than LAG, so in a hairpin the car
  // stays pointing up the screen instead of swinging out sideways; the position follows the eased yaw
  cs.yaw = wrap(cs.yaw + wrap(car.a - cs.yaw) * (1 - Math.exp(-7.5 * dt)));
  const lag = wrap(car.a - cs.yaw);
  if (Math.abs(lag) > LAG) cs.yaw = wrap(car.a - Math.sign(lag) * LAG);
  const fx = Math.cos(cs.yaw), fy = Math.sin(cs.yaw), kp = 1 - Math.exp(-12 * dt);
  cs.x += (car.x - fx * BACK - cs.x) * kp; cs.y += (car.y - fy * BACK - cs.y) * kp;
  // the look-at point leans part way round towards the heading (eased), so a corner reads before the car is in it
  cs.ao += (wrap(car.a - cs.yaw) * 0.25 - cs.ao) * (1 - Math.exp(-5 * dt));
  cam.position.set(cs.x, UP, cs.y);
  cam.lookAt(car.x + Math.cos(cs.yaw + cs.ao) * LOOK, -22, car.y + Math.sin(cs.yaw + cs.ao) * LOOK); // a touch below the road: less sky
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
  // up the kerb onto the pavement when the car runs wide in town
  let lift = 0;
  if (paveSide && car.idx != null && Math.abs(car.off || 0) > curT.hw + 8 && !car.zone) { const on = paveSide[car.off > 0 ? 1 : 0][car.idx]; if (on) lift = PAVE - 1.3; }
  carLift += (lift - carLift) * (1 - Math.exp(-25 * dt));
  carM.position.y = carLift;
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
