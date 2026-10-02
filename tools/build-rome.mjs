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
const REUSE = +(process.env.REUSE || 2.2), NEARBY = +(process.env.NEARBY || 1.25); // between-stop legs: mild push onto fresh streets
const W = 100, WALL = 45; // route asphalt width / run-off (game units)
const log = (...a) => console.log(...a);
const load = (n) => JSON.parse(fs.readFileSync(path.join(OSM, n + '.json'), 'utf8')).elements;

// ---------- stops & routes --------------------------------------------------------
// Each stop is found in the map data by name (pool: which OSM file), never by hand-typed coordinates.
const STOPS = {
  hotel: { label: 'NYX Hotel', pool: 'places', match: (t) => t.tourism === 'hotel' && /\bnyx\b/i.test(t.name || '') },
  musei: { label: 'Vatican Museums', pool: 'places', match: (t) => t.name === 'Porta Musei Vaticani', street: 'Viale Vaticano' },
  sanpietro: { label: "St Peter's Square", pool: 'any', match: (t) => t.name === 'Obelisco Vaticano' },
  popolo: { label: 'Piazza del Popolo', pool: 'any', match: (t) => t.name === 'Obelisco Flaminio' },
  spagna: { label: 'Spanish Steps', pool: 'any', match: (t) => t.name === 'Fontana della Barcaccia' },
  pantheon: { label: 'Pantheon', pool: 'any', match: (t) => t.name === 'Obelisco Macuteo' },
  trevi: { label: 'Trevi Fountain', pool: 'streets', match: (t) => t.name === 'Piazza di Trevi' },
  lepanto: { label: 'Lepanto metro', pool: 'places', match: (t) => /^Lepanto$/i.test(t.name || '') && (t.station === 'subway' || t.railway === 'station') },
  ottaviano: { label: 'Ottaviano metro', pool: 'places', match: (t) => /^Ottaviano/i.test(t.name || '') && (t.station === 'subway' || t.railway === 'station') },
  cavour: { label: 'Piazza Cavour', pool: 'places', match: (t) => /^Piazza Cavour$/i.test(t.name || ''), street: 'Piazza Cavour', roadOnly: true },
  // the places Jesse picked (his "Rome from the NYX" page, Andiamo trip project)
  teatro: { label: 'Gelateria del Teatro', pool: 'pois', match: (t) => t.name === 'Gelateria del Teatro' },
  culdesac: { label: 'Cul de Sac', pool: 'pois', match: (t) => t.name === 'Cul de Sac' && t['addr:street'] === 'Piazza di Pasquino' },
  eustachio: { label: "Caff\u00e8 Sant'Eustachio", pool: 'pois', match: (t) => t.name === "Sant'Eustachio" && t['addr:housenumber'] === '82' },
  forno: { label: "Forno Campo de' Fiori", pool: 'pois', match: (t) => t.name === 'Forno Campo de Fiori' },
  roscioli: { label: 'Roscioli Salumeria', pool: 'pois', match: (t) => t.name === 'Salumeria Roscioli' },
};
// Jesse's list, shown as gold pins and direction signs; sun: closed on Sundays (his Rome Sundays are Oct 4 and 11)
const PICKS = [
  { key: 'eustachio', note: "say \u201camaro\u201d for it unsweetened" },
  { key: 'forno', note: 'pizza bianca', sun: true },
  { key: 'roscioli', note: 'book ahead' },
  { key: 'culdesac', note: 'wine bar, open Sundays' },
  { key: 'teatro', note: 'gelato, open late' },
  { label: 'Enoteca Costantini', match: (t) => t.name === 'Enoteca Costantini' && t['addr:housenumber'] === '16', note: 'wine shop', sun: true },
  { label: 'Da Oio a Casa Mia', match: (t) => t.name === 'Da Oio a Casa Mia', note: 'Testaccio \u00b7 taxi', sun: true },
  { label: 'Trapizzino Testaccio', match: (t) => t.name === 'Trapizzino Testaccio', note: 'Testaccio \u00b7 open Sundays' },
];
const ROUTES = [
  { id: 'r-vaticano', name: 'NYX → San Pietro', blurb: "Past Ottaviano metro to the Vatican Museums, then St Peter's Square.", laps: 1, sectors: 6, stops: ['hotel', 'ottaviano', 'musei', 'sanpietro', 'hotel'] },
  { id: 'r-popolo', name: 'NYX → Popolo → Spagna', blurb: 'Over the Tiber to Piazza del Popolo, down to the Spanish Steps.', laps: 1, sectors: 6, stops: ['hotel', 'popolo', 'spagna', 'hotel'] },
  { id: 'r-pantheon', name: 'NYX → Pantheon → Trevi', blurb: 'Into the old centre: the Pantheon, then the Trevi Fountain.', laps: 1, sectors: 6, stops: ['hotel', 'pantheon', 'trevi', 'hotel'] },
  { id: 'r-picks', name: 'NYX \u2192 your picks', blurb: "Your Andiamo list: Gelateria del Teatro, Cul de Sac, Sant'Eustachio, Campo de' Fiori, Roscioli.", laps: 1, sectors: 6, stops: ['hotel', 'teatro', 'culdesac', 'eustachio', 'forno', 'roscioli', 'hotel'] },
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
const POOLS = { places, squares, streets, buildings: fs.existsSync(path.join(OSM, 'buildings.json')) ? load('buildings') : [] };
POOLS.pois = fs.existsSync(path.join(OSM, 'pois.json')) ? load('pois') : [];
{ const seen = new Set(); POOLS.any = [...places, ...POOLS.buildings, ...squares].filter((e) => !seen.has(e.type + e.id) && seen.add(e.type + e.id)); }
// centre of everything that matched (e.g. all the little ways that make up one piazza)
const centroid = (els) => {
  const pts = els.flatMap((e) => (e.type === 'node' ? [[e.lat, e.lon]] : (e.geometry || []).map((g) => [g.lat, g.lon])).concat(e.center && !e.geometry ? [[e.center.lat, e.center.lon]] : []));
  return pts.length ? [pts.reduce((a, p) => a + p[0], 0) / pts.length, pts.reduce((a, p) => a + p[1], 0) / pts.length] : null;
};
const stopAt = {};
for (const [key, st] of Object.entries(STOPS)) {
  const cands = key === 'hotel' ? [hotelEl] : POOLS[st.pool].filter((e) => e.tags && st.match(e.tags));
  const c = cands.length ? centroid(cands) : null;
  if (!c) { log('!! stop not found:', key); continue; }
  cands[0] = { ...cands[0], tags: { ...cands[0].tags } };
  const [lat, lon] = c;
  const [x, y] = P(lat, lon);
  const roadOnly = (id) => adj.get(id).some((e) => !/^(footway|path|steps)$/.test(ways[e.way].hw) && (!st.street || ways[e.way].name === st.street));
  let node = st.street ? nearestNode(x, y, st.roadOnly ? roadOnly : onStreet(st.street)) : null;
  if (!node) node = nearestNode(x, y);
  const np = nodes.get(node), snap = Math.hypot(np[0] - x, np[1] - y);
  // passing within ~40 m of a landmark counts as visiting it, so routes sweep past instead of poking in and back out
  const near = new Set([node]);
  if (key !== 'hotel') for (const [id, p] of nodes) if (inMain(id) && Math.hypot(p[0] - x, p[1] - y) < Math.max(st.passBy || 25, snap + 8) && (!st.street || onStreet(st.street)(id) || st.roadOnly)) near.add(id);
  stopAt[key] = { node, near, x, y, label: st.label, snap };
  log(`stop ${key.padEnd(9)} -> node ${node} (${stopAt[key].snap.toFixed(0)} m from ${cands[0].tags.name})`);
}

// ---------- routing -------------------------------------------------------------------
function dijkstra(src, dstSet, cost) {
  let dst = null;
  const dist = new Map([[src, 0]]), prev = new Map();
  const heap = [[0, src]];
  const push = (it) => { heap.push(it); let i = heap.length - 1; while (i) { const p = (i - 1) >> 1; if (heap[p][0] <= heap[i][0]) break; [heap[p], heap[i]] = [heap[i], heap[p]]; i = p; } };
  const pop = () => { const top = heap[0], last = heap.pop(); if (heap.length) { heap[0] = last; let i = 0; for (;;) { const l = i * 2 + 1, r = l + 1; let m = i; if (l < heap.length && heap[l][0] < heap[m][0]) m = l; if (r < heap.length && heap[r][0] < heap[m][0]) m = r; if (m === i) break; [heap[m], heap[i]] = [heap[i], heap[m]]; i = m; } } return top; };
  while (heap.length) {
    const [d, u] = pop();
    if (dstSet.has(u) && u !== src) { dst = u; break; }
    if (d > dist.get(u)) continue;
    for (const e of adj.get(u)) {
      const nd = d + cost(u, e);
      if (nd < (dist.has(e.to) ? dist.get(e.to) : Infinity)) { dist.set(e.to, nd); prev.set(e.to, [u, e]); push([nd, e.to]); }
    }
  }
  if (dst == null) return null;
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
  let from = null;
  for (let k = 1; k < spec.stops.length; k++) {
    const a = stopAt[spec.stops[k - 1]], b = stopAt[spec.stops[k]];
    if (!a || !b) throw new Error('missing stop for ' + spec.id);
    const src = from != null ? from : a.node, dsts = b.near;
    // Every leg is the real shortest walk, except that streets already used cost more, and the
    // last leg home also keeps a little distance from the way out, so you learn a second way back.
    const lastLeg = k === spec.stops.length - 1;
    const leg = dijkstra(src, dsts, (u, e) => {
      const wy = ways[e.way];
      let m = wy.name ? 1 : /^(footway|path)$/.test(wy.hw) ? 2 : 1.25;
      if (wy.hw === 'steps') m *= 1.1;
      if (usedEdge.has(key(u, e.to))) m *= lastLeg ? 4 : REUSE;
      else {
        const pu = nodes.get(u), pv = nodes.get(e.to);
        if (near((pu[0] + pv[0]) / 2, (pu[1] + pv[1]) / 2, sep)) m *= lastLeg ? 1.8 : NEARBY;
      }
      return e.len * m;
    });
    if (!leg) throw new Error('no path ' + spec.stops[k - 1] + ' -> ' + spec.stops[k]);
    from = leg[leg.length - 1].to;
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
  // trim tiny out-and-back blips (a b a) but keep real dead-end visits, like up to the Museums gate
  const segLen = (a, b) => { const p = nodes.get(a), q = nodes.get(b); return Math.hypot(p[0] - q[0], p[1] - q[1]); };
  for (let changed = true; changed;) {
    changed = false;
    for (let i = 1; i + 1 < seq.length; i++) {
      if (seq[i - 1].id !== seq[i + 1].id) continue;
      let k = 1, len = segLen(seq[i - 1].id, seq[i].id);
      while (i - k - 1 >= 0 && i + k + 1 < seq.length && seq[i - k - 1].id === seq[i + k + 1].id) { len += segLen(seq[i - k - 1].id, seq[i - k].id); k++; }
      if (len < 25) { seq.splice(i, 2); changed = true; break; }
    }
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
for (const spec of ROUTES) for (const sep of [30, 50, 80]) {
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
  const crossings = [], overlaps = [], parallels = [];
  for (let i = 0; i < T.N; i += 2) for (let j = i + gap; j < T.N; j += 2) {
    if (T.N - (j - i) < gap) continue;
    const d = Math.hypot(T.xs[i] - T.xs[j], T.ys[i] - T.ys[j]);
    if (d >= need) continue;
    const dot = Math.abs(T.tx[i] * T.tx[j] + T.ty[i] * T.ty[j]);
    const along = Math.min(j - i, T.N - (j - i)) * T.ds / S; // metres apart along the route
    const list = dot < 0.6 ? crossings : along < 400 ? overlaps : parallels;
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
    `${crossings.length} crossing(s), ${parallels.length} parallel stretch(es)` + (overlaps.length ? `  !! ${overlaps.length} HAIRPIN OVERLAP(S): ` + overlaps.map(([a, b]) => `${nm(a) || '?'} / ${nm(b) || '?'}`).join('; ') : ''));
  if (overlaps.length && sep < 80) { log('   retrying with wider separation'); continue; }
  if (overlaps.length) problems.push(spec.id);
  // marks: where the route passes each stop (first pass), in order
  const marks = [];
  for (const key of spec.stops.slice(1, -1)) {
    const st = stopAt[key], ux = st.x * S, uy = st.y * S;
    let bi = 0, bd = Infinity;
    for (let i = 0; i < T.N; i++) { const d = (T.xs[i] - ux) ** 2 + (T.ys[i] - uy) ** 2; if (d < bd) { bd = d; bi = i; } }
    marks.push({ s: Math.round(bi * T.ds), name: st.label });
  }
  for (const key of spec.stops) {
    const st = stopAt[key]; let bd = Infinity;
    for (let i = 0; i < T.N; i++) bd = Math.min(bd, Math.hypot(T.xs[i] - st.x * S, T.ys[i] - st.y * S) / S);
    if (bd > 45) { log(`   !! route passes ${bd.toFixed(0)} m from ${st.label}`); problems.push(spec.id + ':' + key); }
  }
  // medal times from the test drivers (same rule as the circuits)
  const an = GL.CARS.map((c) => Math.min(GL.simulate(T, { line: 0.8, look: 150 }, 600, c).time || 999, GL.simulate(T, {}, 600, c).time || 999));
  const dg = GL.CARS.map((c) => GL.simulate(T, { digital: true, line: 0.7 }, 600, c)).map((r) => r.time || 999).sort((a, b) => a - b);
  const gold = Math.ceil(Math.min(...an, dg[0]) * 2) / 2;
  def.medals = [gold, Math.max(gold + 2, Math.ceil(dg[2] * 1.04 * 2) / 2), Math.max(gold + 5, Math.ceil(dg[2] * 1.15))];
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
// things you'd recognise walking past, kept only if they sit close to a route
// [kind, matches, label, min spacing between two of the same kind (m), max distance from the route (m)]
const POI_RULES = [
  ['pharmacy', (t) => t.amenity === 'pharmacy', () => 'FARMACIA', 50, 35],
  ['tabacchi', (t) => t.shop === 'tobacco' || /tabacch/i.test(t.name || ''), () => 'TABACCHI', 50, 35],
  ['metro', (t) => t.railway === 'subway_entrance', (t) => 'Metro' + (t.name ? ' \u00b7 ' + t.name.replace(/^Metro\s*/i, '') : ''), 60, 40],
  ['church', (t) => t.amenity === 'place_of_worship' && t.name, (t) => t.name, 0, 45],
  ['sight', (t) => t.name && (/^(monument|church|palace|castle|archaeological_site|ruins|city_gate|building)$/.test(t.historic || '') || /^(attraction|museum)$/.test(t.tourism || '')), (t) => t.name, 0, 50],
  ['fountain', (t) => t.amenity === 'fountain' && t.name, (t) => t.name, 0, 45],
  ['market', (t) => t.shop === 'supermarket' || (t.shop === 'convenience' && (t.brand || t.name)), (t) => t.brand || t.name || 'Supermercato', 70, 35],
  ['gelato', (t) => t.amenity === 'ice_cream' && t.name, (t) => 'Gelato \u00b7 ' + t.name, 80, 30],
  ['water', (t) => t.amenity === 'drinking_water', () => 'nasone (water)', 140, 25],
  ['atm', (t) => t.amenity === 'atm' || t.amenity === 'bank', () => 'Bancomat', 140, 30],
  ['tram', (t) => t.railway === 'tram_stop' && t.name, (t) => 'Tram \u00b7 ' + t.name, 80, 40],
  ['wc', (t) => t.amenity === 'toilets', () => 'WC', 150, 35],
  ['post', (t) => t.amenity === 'post_office', () => 'Poste', 150, 35],
  ['cafe', (t) => /^(cafe|bar)$/.test(t.amenity || '') && t.name, (t) => t.name, 110, 16],
];
const pg = new Map(), PG = 25;
for (const [x, y] of routePts) { const k = Math.floor(x / PG) + ',' + Math.floor(y / PG); if (!pg.has(k)) pg.set(k, []); pg.get(k).push([x, y]); }
const routeDist = (x, y) => {
  let b = Infinity; const gx = Math.floor(x / PG), gy = Math.floor(y / PG);
  for (let i = -3; i <= 3; i++) for (let j = -3; j <= 3; j++) for (const p of pg.get(gx + i + ',' + (gy + j)) || []) b = Math.min(b, Math.hypot(p[0] - x, p[1] - y));
  return b;
};
const poiLabels = [], outPois = [], kept = POI_RULES.map(() => []);
const poiSrc = fs.existsSync(path.join(OSM, 'pois.json')) ? load('pois') : [];
const taken = new Set(outPlaces.map((p) => p.n.toLowerCase()));
for (const e of poiSrc) {
  const t = e.tags || {}, c = e.type === 'node' ? [e.lat, e.lon] : e.center ? [e.center.lat, e.center.lon] : null;
  if (!c) continue;
  const ri = POI_RULES.findIndex(([, m]) => m(t));
  if (ri < 0) continue;
  const [kind, , label, spacing, maxD] = POI_RULES[ri];
  const [x, y] = P(c[0], c[1]);
  if (routeDist(x, y) > maxD) continue;
  const text = label(t);
  if (taken.has(text.toLowerCase())) continue;
  if (kept[ri].some(([qx, qy, qt]) => Math.hypot(qx - x, qy - y) < Math.max(spacing, qt === text ? 80 : 0))) continue;
  kept[ri].push([x, y, text]);
  let li = poiLabels.indexOf(text); if (li < 0) { poiLabels.push(text); li = poiLabels.length - 1; }
  outPois.push([ri, toU(x), toU(y), li]);
}
log('landmarks near the routes: ' + POI_RULES.map(([k], i) => `${k} ${kept[i].length}`).join(', '));

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
// picks: resolved by name in the map data (never typed coordinates)
const outPicks = [];
for (const pk of PICKS) {
  const st = pk.key ? stopAt[pk.key] : null;
  let x, y, label = pk.label;
  if (st) { x = st.x; y = st.y; label = st.label; }
  else {
    const hit = POOLS.pois.find((e) => e.tags && pk.match(e.tags));
    const c = hit && centroid([hit]);
    if (!c) { log('!! pick not found:', pk.label); continue; }
    [x, y] = P(c[0], c[1]);
  }
  outPicks.push({ n: label, note: pk.note, sun: !!pk.sun, x: toU(x), y: toU(y) });
}
log('picks: ' + outPicks.map((p) => p.n).join(', '));
const ROME = { synthetic: OSM.endsWith('osm-test'), S, origin: [LAT0, LON0], names, streets: outStreets, buildings: outBuildings, river: outRiver, places: outPlaces, anchors, routes: outRoutes,
  poiKinds: POI_RULES.map(([k]) => k), poiLabels, pois: outPois, picks: outPicks,
  credit: '© OpenStreetMap contributors (ODbL)' };
const js = '// Generated by tools/build-rome.mjs from OpenStreetMap data, © OpenStreetMap contributors, ODbL.\nwindow.ROME = ' + JSON.stringify(ROME) + ';\n';
fs.writeFileSync(OUT, js);
log(`wrote ${OUT}: ${(js.length / 1024).toFixed(0)} KB, ${outStreets.length} streets, ${bCount} buildings, ${outPlaces.length} labels, ${anchors.length} street labels`);
