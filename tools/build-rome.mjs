// Turns OpenStreetMap data (from fetch-osm.sh) into rome.js: real-street routes from the
// NYX Hotel (Via Cicerone 55) plus the surrounding map (streets, buildings, river, labels).
// Routes are shortest walking paths between stops; the way back is pushed onto different streets.
//   node tools/build-rome.mjs            (reads tools/osm/*.json)
//   OSM_DIR=tools/osm-test node tools/build-rome.mjs --out /tmp/rome.js
import fs from 'fs';
import path from 'path';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const HERE = path.dirname(new URL(import.meta.url).pathname);
const GL = require(path.join(HERE, '..', 'core.js'));

const OSM = process.env.OSM_DIR ? path.resolve(process.env.OSM_DIR) : path.join(HERE, 'osm');
const OUT = process.argv.includes('--out') ? process.argv[process.argv.indexOf('--out') + 1] : path.join(HERE, '..', 'rome.js');
const S = 4.5;            // game units per metre
const SMOOTH = 18;        // metres: corner smoothing (gaussian sigma)
const W = 100, WALL = 45; // route asphalt width / run-off (game units)
const log = (...a) => console.log(...a);
const load = (n) => JSON.parse(fs.readFileSync(path.join(OSM, n + '.json'), 'utf8')).elements;

// ---------- stops & routes --------------------------------------------------------
const STOPS = {
  hotel: { label: 'NYX Hotel', match: (t) => t.tourism === 'hotel' && /\bnyx\b/i.test(t.name || '') },
  musei: { label: 'Vatican Museums', match: (t) => /^Musei Vaticani$/i.test(t.name || ''), street: 'Viale Vaticano', preferNode: true },
  sanpietro: { label: "St Peter's Square", match: (t) => /^Piazza San Pietro$/i.test(t.name || '') },
  popolo: { label: 'Piazza del Popolo', match: (t) => /^Piazza del Popolo$/i.test(t.name || '') },
  spagna: { label: 'Spanish Steps', match: (t) => /^Piazza di Spagna$/i.test(t.name || '') },
  pantheon: { label: 'Pantheon', match: (t) => /^Pantheon$/i.test(t.name || ''), street: 'Piazza della Rotonda' },
  trevi: { label: 'Trevi Fountain', match: (t) => /^Fontana di Trevi$/i.test(t.name || ''), street: 'Piazza di Trevi' },
  lepanto: { label: 'Lepanto metro', match: (t) => /^Lepanto$/i.test(t.name || '') && (t.station === 'subway' || t.railway === 'station') },
  ottaviano: { label: 'Ottaviano metro', match: (t) => /^Ottaviano/i.test(t.name || '') && (t.station === 'subway' || t.railway === 'station') },
  cavour: { label: 'Piazza Cavour', match: (t) => /^Piazza Cavour$/i.test(t.name || '') },
};
const ROUTES = [
  { id: 'r-vaticano', name: 'NYX → San Pietro', blurb: "Vatican Museums entrance, then St Peter's Square.", laps: 1, sectors: 6, stops: ['hotel', 'musei', 'sanpietro', 'hotel'] },
  { id: 'r-popolo', name: 'NYX → Popolo → Spagna', blurb: 'Over the Tiber to Piazza del Popolo, down to the Spanish Steps.', laps: 1, sectors: 6, stops: ['hotel', 'popolo', 'spagna', 'hotel'] },
  { id: 'r-pantheon', name: 'NYX → Pantheon → Trevi', blurb: 'Into the old centre: the Pantheon, then the Trevi Fountain.', laps: 1, sectors: 6, stops: ['hotel', 'pantheon', 'trevi', 'hotel'] },
  { id: 'r-prati', name: 'Prati loop', blurb: 'Your neighbourhood: Lepanto metro, round to Piazza Cavour.', laps: 2, sectors: 4, stops: ['hotel', 'lepanto', 'cavour', 'hotel'] },
];
// labels drawn on the map (beyond the route stops)
const LABELS = [
  [/^Castel Sant'Angelo$/i, "Castel Sant'Angelo"], [/^Palazzo di Giustizia$/i, 'Palace of Justice'],
  [/^Basilica di San Pietro/i, "St Peter's Basilica"], [/^Piazza Navona$/i, 'Piazza Navona'],
  [/^Mausoleo di Augusto$/i, 'Mausoleum of Augustus'], [/^Ara Pacis/i, 'Ara Pacis'],
  [/^Piazza del Risorgimento$/i, 'Piazza del Risorgimento'], [/^Piazza della Libert/i, 'Piazza della Libertà'],
  [/^Piazza Colonna$/i, 'Piazza Colonna'], [/^Fontana della Barcaccia$/i, 'Barcaccia fountain'],
  [/^Trinità dei Monti$/i, 'Trinità dei Monti'], [/^Spagna$/i, 'Spagna metro'], [/^Flaminio/i, 'Flaminio metro'],
];

// ---------- projection --------------------------------------------------------------
const places = load('places');
const center = (e) => (e.type === 'node' ? [e.lat, e.lon] : e.center ? [e.center.lat, e.center.lon] : null);
const hotelEl = places.find((e) => e.tags && STOPS.hotel.match(e.tags)) ||
  places.find((e) => e.tags && e.tags['addr:street'] === 'Via Cicerone' && e.tags['addr:housenumber'] === '55');
if (!hotelEl) {
  log('Hotel not found. Hotels in data:', places.filter((e) => e.tags && e.tags.tourism === 'hotel').map((e) => e.tags.name).slice(0, 40));
  process.exit(1);
}
const [LAT0, LON0] = center(hotelEl);
const KX = Math.cos((LAT0 * Math.PI) / 180) * 111320, KY = 110574;
const P = (lat, lon) => [(lon - LON0) * KX, -(lat - LAT0) * KY]; // metres, y down
const toU = (m) => Math.round(m * S);

// ---------- walking graph -----------------------------------------------------------
const WALK = new Set(['primary', 'secondary', 'tertiary', 'primary_link', 'secondary_link', 'tertiary_link', 'unclassified', 'residential',
  'living_street', 'pedestrian', 'footway', 'path', 'steps', 'service']);
const streets = load('streets');
const nodes = new Map();      // id -> [x, y] metres
const adj = new Map();        // id -> [{to, len, way}]
const ways = [];
for (const w of streets) {
  const t = w.tags || {};
  if (!WALK.has(t.highway) || !w.nodes || !w.geometry) continue;
  if (/^(private|no)$/.test(t.access || '') && !/^(yes|designated|permissive)$/.test(t.foot || '')) continue;
  if (t.foot === 'no') continue;
  if (t.highway === 'footway' && /^(sidewalk|crossing|traffic_island)$/.test(t.footway || '')) continue;
  if (t.highway === 'service' && !t.name) continue;
  const wi = ways.length;
  ways.push({ name: t.name || '', hw: t.highway, bridge: t.bridge === 'yes' });
  for (let k = 0; k < w.nodes.length; k++) {
    const id = w.nodes[k];
    if (!nodes.has(id)) nodes.set(id, P(w.geometry[k].lat, w.geometry[k].lon));
    if (k) {
      const a = w.nodes[k - 1], b = id, pa = nodes.get(a), pb = nodes.get(b);
      const len = Math.hypot(pb[0] - pa[0], pb[1] - pa[1]);
      if (!adj.has(a)) adj.set(a, []);
      if (!adj.has(b)) adj.set(b, []);
      adj.get(a).push({ to: b, len, way: wi });
      adj.get(b).push({ to: a, len, way: wi });
    }
  }
}
log('graph:', nodes.size, 'nodes,', ways.length, 'ways');

// keep only the largest connected component (islands make unreachable stops)
const comp = new Map();
let bestComp = -1, bestSize = 0;
for (const id of adj.keys()) {
  if (comp.has(id)) continue;
  const label = id;
  const stack = [id]; let size = 0; comp.set(id, label);
  while (stack.length) { const u = stack.pop(); size++; for (const e of adj.get(u)) if (!comp.has(e.to)) { comp.set(e.to, label); stack.push(e.to); } }
  if (size > bestSize) { bestSize = size; bestComp = label; }
}
const inMain = (id) => comp.get(id) === bestComp;

function nearestNode(x, y, filter) {
  let best = null, bd = Infinity;
  for (const [id, p] of nodes) {
    if (!inMain(id) || (filter && !filter(id))) continue;
    const d = (p[0] - x) ** 2 + (p[1] - y) ** 2;
    if (d < bd) { bd = d; best = id; }
  }
  return best;
}
const onStreet = (name) => (id) => adj.get(id).some((e) => ways[e.way].name === name);

// resolve stops to graph nodes
const squares = fs.existsSync(path.join(OSM, 'squares.json')) ? load('squares') : [];
const pool = [...places, ...squares.map((w) => ({ ...w, center: w.geometry ? { lat: w.geometry.reduce((a, g) => a + g.lat, 0) / w.geometry.length, lon: w.geometry.reduce((a, g) => a + g.lon, 0) / w.geometry.length } : null }))];
const stopAt = {};
for (const [key, st] of Object.entries(STOPS)) {
  let cands = pool.filter((e) => e.tags && st.match(e.tags) && center(e));
  if (key === 'hotel') cands = [hotelEl];
  if (st.preferNode && cands.some((e) => e.type === 'node')) cands = cands.filter((e) => e.type === 'node');
  if (!cands.length) { log('!! stop not found:', key); continue; }
  const [lat, lon] = center(cands[0]);
  const [x, y] = P(lat, lon);
  let node = st.street ? nearestNode(x, y, onStreet(st.street)) : null;
  if (!node) node = nearestNode(x, y);
  const np = nodes.get(node);
  stopAt[key] = { node, x, y, label: st.label, snap: Math.hypot(np[0] - x, np[1] - y) };
  log(`stop ${key.padEnd(9)} -> node ${node} (${stopAt[key].snap.toFixed(0)} m from ${cands[0].tags.name})`);
}

// ---------- routing -------------------------------------------------------------------
function dijkstra(src, dst, cost) {
  const dist = new Map([[src, 0]]), prev = new Map();
  const heap = [[0, src]];
  const push = (it) => { heap.push(it); let i = heap.length - 1; while (i) { const p = (i - 1) >> 1; if (heap[p][0] <= heap[i][0]) break; [heap[p], heap[i]] = [heap[i], heap[p]]; i = p; } };
  const pop = () => { const top = heap[0], last = heap.pop(); if (heap.length) { heap[0] = last; let i = 0; for (;;) { const l = i * 2 + 1, r = l + 1; let m = i; if (l < heap.length && heap[l][0] < heap[m][0]) m = l; if (r < heap.length && heap[r][0] < heap[m][0]) m = r; if (m === i) break; [heap[m], heap[i]] = [heap[i], heap[m]]; i = m; } } return top; };
  while (heap.length) {
    const [d, u] = pop();
    if (u === dst) break;
    if (d > dist.get(u)) continue;
    for (const e of adj.get(u)) {
      const nd = d + cost(u, e);
      if (nd < (dist.has(e.to) ? dist.get(e.to) : Infinity)) { dist.set(e.to, nd); prev.set(e.to, [u, e]); push([nd, e.to]); }
    }
  }
  if (!prev.has(dst) && src !== dst) return null;
  const out = []; let v = dst;
  while (v !== src) { const [u, e] = prev.get(v); out.push({ from: u, to: v, way: e.way, len: e.len }); v = u; }
  return out.reverse();
}

function buildRoute(spec, sep = 45) {
  const usedEdge = new Set(), usedPts = [];
  const key = (a, b) => (a < b ? a + ':' + b : b + ':' + a);
  const grid = new Map(), G = 40;
  const addPt = (x, y) => { const k = Math.floor(x / G) + ',' + Math.floor(y / G); if (!grid.has(k)) grid.set(k, []); grid.get(k).push([x, y]); };
  const near = (x, y, r) => {
    const gx = Math.floor(x / G), gy = Math.floor(y / G);
    for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) for (const p of grid.get(gx + i + ',' + (gy + j)) || []) if ((p[0] - x) ** 2 + (p[1] - y) ** 2 < r * r) return true;
    return false;
  };
  const legs = [];
  for (let k = 1; k < spec.stops.length; k++) {
    const a = stopAt[spec.stops[k - 1]], b = stopAt[spec.stops[k]];
    if (!a || !b) throw new Error('missing stop for ' + spec.id);
    const leg = dijkstra(a.node, b.node, (u, e) => {
      let m = ways[e.way].name ? 1 : 1.2;
      if (ways[e.way].hw === 'steps') m *= 1.1;
      if (usedEdge.has(key(u, e.to))) m *= 12;
      else {
        const pu = nodes.get(u), pv = nodes.get(e.to);
        if (near((pu[0] + pv[0]) / 2, (pu[1] + pv[1]) / 2, sep)) m *= 3.5;
      }
      return e.len * m;
    });
    if (!leg) throw new Error('no path ' + spec.stops[k - 1] + ' -> ' + spec.stops[k]);
    for (const s of leg) {
      usedEdge.add(key(s.from, s.to));
      const pa = nodes.get(s.from), pb = nodes.get(s.to), n = Math.ceil(s.len / 8);
      for (let i = 0; i <= n; i++) addPt(pa[0] + ((pb[0] - pa[0]) * i) / n, pa[1] + ((pb[1] - pa[1]) * i) / n);
    }
    legs.push(leg);
  }
  // node sequence with the way used to reach each node; collapse out-and-back spikes (a b a)
  let seq = [{ id: legs[0][0].from, way: legs[0][0].way }];
  for (const leg of legs) for (const s of leg) seq.push({ id: s.to, way: s.way });
  for (let changed = true; changed;) {
    changed = false;
    for (let i = 1; i + 1 < seq.length; i++) if (seq[i - 1].id === seq[i + 1].id) { seq.splice(i, 2); changed = true; break; }
  }
  seq.pop(); // last == first (closed loop)
  return { legs, seq };
}

// resample closed polyline every `step` metres keeping a name per point, then gaussian-smooth
function smoothLoop(pts, names, step, sigma) {
  const n = pts.length, cum = [0];
  for (let i = 1; i <= n; i++) { const a = pts[i - 1], b = pts[i % n]; cum.push(cum[i - 1] + Math.hypot(b[0] - a[0], b[1] - a[1])); }
  const L = cum[n], M = Math.round(L / step), rs = [], rn = [];
  let j = 0;
  for (let i = 0; i < M; i++) {
    const s = (i / M) * L;
    while (cum[j + 1] < s) j++;
    const a = pts[j], b = pts[(j + 1) % n], k = (s - cum[j]) / (cum[j + 1] - cum[j] || 1);
    rs.push([a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k]); rn.push(names[(j + 1) % n]);
  }
  const R = Math.ceil((3 * sigma) / step), wts = [];
  for (let k = -R; k <= R; k++) wts.push(Math.exp(-((k * step) ** 2) / (2 * sigma * sigma)));
  const wsum = wts.reduce((a, b) => a + b, 0);
  const out = rs.map((_, i) => {
    let x = 0, y = 0;
    for (let k = -R; k <= R; k++) { const p = rs[(i + k + M) % M], w = wts[k + R]; x += p[0] * w; y += p[1] * w; }
    return [x / wsum, y / wsum];
  });
  return { pts: out, names: rn, L };
}

// ---------- geometry helpers --------------------------------------------------------
function simplify(pts, eps) { // Douglas-Peucker on [[x,y]...]
  if (pts.length < 3) return pts;
  const keep = new Uint8Array(pts.length); keep[0] = keep[pts.length - 1] = 1;
  const st = [[0, pts.length - 1]];
  while (st.length) {
    const [a, b] = st.pop(); let md = 0, mi = -1;
    const [ax, ay] = pts[a], [bx, by] = pts[b], dx = bx - ax, dy = by - ay, L = Math.hypot(dx, dy) || 1e-9;
    for (let i = a + 1; i < b; i++) { const d = Math.abs((pts[i][0] - ax) * dy - (pts[i][1] - ay) * dx) / L; if (d > md) { md = d; mi = i; } }
    if (md > eps) { keep[mi] = 1; st.push([a, mi], [mi, b]); }
  }
  return pts.filter((_, i) => keep[i]);
}
// closed rings: split at the vertex farthest from the first so the line simplifier has a real baseline
function simplifyRing(pts, eps) {
  const ring = pts.length > 1 && pts[0][0] === pts[pts.length - 1][0] && pts[0][1] === pts[pts.length - 1][1] ? pts.slice(0, -1) : pts;
  if (ring.length < 4) return ring;
  let m = 1, md = 0;
  for (let i = 1; i < ring.length; i++) { const d = Math.hypot(ring[i][0] - ring[0][0], ring[i][1] - ring[0][1]); if (d > md) { md = d; m = i; } }
  const a = simplify(ring.slice(0, m + 1), eps), b = simplify([...ring.slice(m), ring[0]], eps);
  return [...a, ...b.slice(1, -1)];
}
const flat = (pts) => pts.flatMap(([x, y]) => [toU(x), toU(y)]);

// ---------- build routes -------------------------------------------------------------
const outRoutes = [], routePts = [], problems = [];
for (const spec of ROUTES) for (const sep of [45, 70, 100]) {
  const { seq } = buildRoute(spec, sep);
  const raw = seq.map((s) => nodes.get(s.id));
  const rawNames = seq.map((s) => ways[s.way].name);
  const sm = smoothLoop(raw, rawNames, 2, SMOOTH);
  // control points every 10 m
  const ctrl = [], cnames = [];
  for (let i = 0; i < sm.pts.length; i += 5) { ctrl.push(sm.pts[i]); cnames.push(sm.names[i]); }
  const def = { id: spec.id, name: spec.name, blurb: spec.blurb, w: W, wall: WALL, laps: spec.laps, sectors: spec.sectors,
    pts: ctrl.map(([x, y]) => [toU(x), toU(y)]), names: cnames, medals: [0, 0, 0] };
  const T = GL.buildTrack(def);
  // checks: corner radius and clearance between non-adjacent parts of the route
  let minR = Infinity, minRi = 0;
  for (let i = 0; i < T.N; i++) { const r = 1 / Math.abs(T.curv[i] || 1e-9); if (r < minR) { minR = r; minRi = i; } }
  const gap = Math.round((150 * S) / T.ds), need = 2 * (T.hw + T.wall) + 20;
  const nm = (i) => (T.street ? T.streetNames[T.street[i]] : '');
  const crossings = [], overlaps = [];
  for (let i = 0; i < T.N; i += 2) for (let j = i + gap; j < T.N; j += 2) {
    if (T.N - (j - i) < gap) continue;
    const d = Math.hypot(T.xs[i] - T.xs[j], T.ys[i] - T.ys[j]);
    if (d >= need) continue;
    const dot = Math.abs(T.tx[i] * T.tx[j] + T.ty[i] * T.ty[j]);
    const list = dot < 0.6 && d < need ? crossings : overlaps;
    if (!list.some(([a, b]) => Math.abs(a - i) < gap && Math.abs(b - j) < gap)) list.push([i, j]);
  }
  let dev = 0; // how far smoothing pulled the line off the real street (point-to-segment)
  for (const [x, y] of sm.pts) {
    let b = Infinity;
    for (let i = 0; i < raw.length; i++) {
      const [ax, ay] = raw[i], [bx, by] = raw[(i + 1) % raw.length], vx = bx - ax, vy = by - ay;
      const k = Math.max(0, Math.min(1, ((x - ax) * vx + (y - ay) * vy) / (vx * vx + vy * vy || 1)));
      b = Math.min(b, Math.hypot(ax + vx * k - x, ay + vy * k - y));
    }
    dev = Math.max(dev, b);
  }
  log(`${spec.id}: ${(sm.L / 1000).toFixed(2)} km, min corner radius ${(minR / S).toFixed(0)} m @ ${nm(minRi) || '?'}, max smoothing drift ${dev.toFixed(0)} m, ` +
    `${crossings.length} crossing(s)` + (overlaps.length ? `  !! ${overlaps.length} SIDE-BY-SIDE OVERLAP(S): ` + overlaps.map(([a, b]) => `${nm(a) || '?'} / ${nm(b) || '?'}`).join('; ') : ''));
  if (overlaps.length && sep < 100) { log('   retrying with wider separation'); continue; }
  if (overlaps.length) problems.push(spec.id);
  // marks: where the route passes each stop (first pass), in order
  const marks = [];
  for (const key of spec.stops.slice(1, -1)) {
    const st = stopAt[key], ux = st.x * S, uy = st.y * S;
    let bi = 0, bd = Infinity;
    for (let i = 0; i < T.N; i++) { const d = (T.xs[i] - ux) ** 2 + (T.ys[i] - uy) ** 2; if (d < bd) { bd = d; bi = i; } }
    marks.push({ s: Math.round(bi * T.ds), name: st.label });
  }
  // medal times from the test drivers (same rule as the circuits)
  const an = GL.CARS.map((c) => Math.min(GL.simulate(T, { line: 0.8, look: 150 }, 600, c).time || 999, GL.simulate(T, {}, 600, c).time || 999));
  const dg = GL.CARS.map((c) => GL.simulate(T, { digital: true, line: 0.7 }, 600, c)).map((r) => r.time || 999).sort((a, b) => a - b);
  def.medals = [Math.ceil(Math.min(...an) * 2) / 2, Math.ceil(dg[2] * 1.04 * 2) / 2, Math.ceil(dg[2] * 1.15)];
  log(`   medals ${JSON.stringify(def.medals)}  digital-bot median ${dg[2].toFixed(1)}s`);
  // ordered list of streets taken (for the finish screen)
  const via = [];
  for (const n of cnames) if (n && via[via.length - 1] !== n) via.push(n);
  outRoutes.push({ ...def, pts: def.pts.flat(), marks, via, km: +(sm.L / 1000).toFixed(2) });
  routePts.push(...sm.pts);
  break;
}

// ---------- map layers -----------------------------------------------------------------
const rgrid = new Set(), RG = 100;
for (const [x, y] of routePts) rgrid.add(Math.floor(x / RG) + ',' + Math.floor(y / RG));
const nearRoute = (x, y, r) => { const k = Math.ceil(r / RG); const gx = Math.floor(x / RG), gy = Math.floor(y / RG);
  for (let i = -k; i <= k; i++) for (let j = -k; j <= k; j++) if (rgrid.has(gx + i + ',' + (gy + j))) return true; return false; };

const names = [], nameIdx = (n) => { let i = names.indexOf(n); if (i < 0) { names.push(n); i = names.length - 1; } return i; };
const KIND = (hw) => (/^(primary|secondary|tertiary)/.test(hw) ? 0 : /^(pedestrian|footway|path|steps)$/.test(hw) ? 2 : 1);
const outStreets = [];
for (const w of streets) {
  const t = w.tags || {};
  if (!w.geometry || !WALK.has(t.highway) || (t.highway === 'footway' && !t.name) || (t.highway === 'service' && !t.name)) continue;
  const pts = w.geometry.map((g) => P(g.lat, g.lon));
  if (!pts.some(([x, y]) => nearRoute(x, y, 500))) continue;
  outStreets.push([KIND(t.highway) + (t.bridge === 'yes' ? 4 : 0), t.name ? nameIdx(t.name) : -1, ...flat(simplify(pts, 1.2))]);
}
const outBuildings = [];
let bCount = 0;
for (const b of load('buildings')) {
  if (!b.geometry || b.geometry.length < 4) continue;
  const pts = b.geometry.map((g) => P(g.lat, g.lon));
  const cx = pts.reduce((a, p) => a + p[0], 0) / pts.length, cy = pts.reduce((a, p) => a + p[1], 0) / pts.length;
  if (!nearRoute(cx, cy, 350)) continue;
  let area = 0; for (let i = 0; i < pts.length; i++) { const a = pts[i], c = pts[(i + 1) % pts.length]; area += a[0] * c[1] - c[0] * a[1]; }
  if (Math.abs(area / 2) < 25) continue;
  const t = b.tags || {};
  const notable = !!t.name && !!(t.historic || t.tourism || /church|cathedral|basilica|chapel|castle|government|civic|museum/.test(t.building + ' ' + (t.amenity || '')));
  outBuildings.push([notable ? 1 : 0, ...flat(simplifyRing(pts, 0.9))]);
  bCount++;
}
const outRiver = [];
for (const w of load('water')) if (w.type === 'way' && w.tags && w.tags.waterway === 'river' && w.geometry) outRiver.push(flat(simplify(w.geometry.map((g) => P(g.lat, g.lon)), 3)));

// labels: stops, curated landmarks, metro stations
const outPlaces = [{ n: 'NYX Hotel · Via Cicerone 55', k: 'hotel', x: 0, y: 0 }];
for (const [key, st] of Object.entries(stopAt)) if (key !== 'hotel') outPlaces.push({ n: st.label, k: /metro/.test(st.label) ? 'metro' : 'stop', x: toU(st.x), y: toU(st.y) });
for (const [re, label] of LABELS) {
  const e = pool.find((p) => p.tags && re.test(p.tags.name || '') && center(p));
  if (!e || outPlaces.some((p) => p.n === label)) continue;
  const [x, y] = P(...center(e));
  outPlaces.push({ n: label, k: /metro/.test(label) ? 'metro' : 'sight', x: toU(x), y: toU(y) });
}
// street label anchors along named streets (deduped per name)
const anchors = [], seen = new Map();
for (const s of outStreets) {
  if (s[1] < 0) continue;
  const p = []; for (let i = 2; i < s.length; i += 2) p.push([s[i], s[i + 1]]);
  let L = 0; for (let i = 1; i < p.length; i++) L += Math.hypot(p[i][0] - p[i - 1][0], p[i][1] - p[i - 1][1]);
  if (L < 60 * S) continue;
  for (let at = L / 2; at < L; at += 320 * S) {
    let acc = 0;
    for (let i = 1; i < p.length; i++) {
      const d = Math.hypot(p[i][0] - p[i - 1][0], p[i][1] - p[i - 1][1]);
      if (acc + d >= at) {
        const k = (at - acc) / d, x = p[i - 1][0] + (p[i][0] - p[i - 1][0]) * k, y = p[i - 1][1] + (p[i][1] - p[i - 1][1]) * k;
        const prev = seen.get(s[1]) || [];
        if (!prev.some(([qx, qy]) => Math.hypot(qx - x, qy - y) < 220 * S)) {
          let ang = Math.atan2(p[i][1] - p[i - 1][1], p[i][0] - p[i - 1][0]);
          if (ang > Math.PI / 2) ang -= Math.PI; if (ang < -Math.PI / 2) ang += Math.PI;
          anchors.push([Math.round(x), Math.round(y), Math.round(ang * 100), s[1]]);
          prev.push([x, y]); seen.set(s[1], prev);
        }
        break;
      }
      acc += d;
    }
  }
}

if (problems.length) log('!! routes with overlaps:', problems.join(', '));
const ROME = { synthetic: OSM.endsWith('osm-test'), S, origin: [LAT0, LON0], names, streets: outStreets, buildings: outBuildings, river: outRiver, places: outPlaces, anchors, routes: outRoutes,
  credit: '© OpenStreetMap contributors (ODbL)' };
const js = '// Generated by tools/build-rome.mjs from OpenStreetMap data, © OpenStreetMap contributors, ODbL.\nwindow.ROME = ' + JSON.stringify(ROME) + ';\n';
fs.writeFileSync(OUT, js);
log(`wrote ${OUT}: ${(js.length / 1024).toFixed(0)} KB, ${outStreets.length} streets, ${bCount} buildings, ${outPlaces.length} labels, ${anchors.length} street labels`);
