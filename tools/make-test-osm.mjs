// Synthetic stand-in for the Overpass data: a street grid with the real stop names at
// roughly the real places. Only for exercising build-rome.mjs and the game without network.
import fs from 'fs';
import path from 'path';
const OUT = path.join(path.dirname(new URL(import.meta.url).pathname), 'osm-test');
fs.mkdirSync(OUT, { recursive: true });
const LAT0 = 41.9075, LON0 = 12.4665, KX = Math.cos((LAT0 * Math.PI) / 180) * 111320, KY = 110574;
const ll = (x, y) => ({ lat: LAT0 - y / KY, lon: LON0 + x / KX });
const at = (lat, lon) => [(lon - LON0) * KX, -(lat - LAT0) * KY];
const POI = {
  'NYX Hotel Rome': [41.9075, 12.4665, { tourism: 'hotel' }], 'Musei Vaticani': [41.9065, 12.4536, { tourism: 'museum' }],
  'Piazza San Pietro': [41.9022, 12.4572, { place: 'square' }], 'Piazza del Popolo': [41.9107, 12.4764, { place: 'square' }],
  'Piazza di Spagna': [41.9057, 12.4822, { place: 'square' }], Pantheon: [41.8986, 12.4769, { tourism: 'attraction' }],
  'Fontana di Trevi': [41.9009, 12.4833, { tourism: 'attraction' }], Lepanto: [41.9113, 12.4634, { railway: 'station', station: 'subway' }],
  Ottaviano: [41.9093, 12.4579, { railway: 'station', station: 'subway' }], 'Piazza Cavour': [41.9035, 12.4710, { place: 'square' }],
  "Castel Sant'Angelo": [41.9031, 12.4663, { tourism: 'attraction' }],
};
const SP = 110, xs = [], ys = [];
for (let x = -1500; x <= 1900; x += SP) xs.push(x);
for (let y = -1000; y <= 1100; y += SP) ys.push(y);
let nid = 1, wid = 1;
const nodeAt = new Map();
const node = (i, j) => { const k = i + ',' + j; if (!nodeAt.has(k)) nodeAt.set(k, nid++); return nodeAt.get(k); };
const special = {};
for (const [name, [lat, lon]] of Object.entries(POI)) special[name] = at(lat, lon);
const named = (axis, v) => {
  const near = (name, c) => Math.abs((axis === 'x' ? special[name][0] : special[name][1]) - c) < SP / 2;
  if (axis === 'y' && near('NYX Hotel Rome', v)) return 'Via Cicerone';
  if (axis === 'x' && near('Musei Vaticani', v)) return 'Viale Vaticano';
  if (axis === 'y' && near('Pantheon', v)) return 'Piazza della Rotonda';
  if (axis === 'x' && near('Fontana di Trevi', v)) return 'Piazza di Trevi';
  return (axis === 'x' ? 'Via Verticale ' : 'Via Orizzontale ') + Math.round(v / SP);
};
const streets = [];
ys.forEach((y, j) => streets.push({ type: 'way', id: wid++, tags: { highway: j % 4 ? 'residential' : 'secondary', name: named('y', y) },
  nodes: xs.map((_, i) => node(i, j)), geometry: xs.map((x) => ll(x, y)) }));
xs.forEach((x, i) => streets.push({ type: 'way', id: wid++, tags: { highway: i % 5 ? 'residential' : 'tertiary', name: named('x', x) },
  nodes: ys.map((_, j) => node(i, j)), geometry: ys.map((y) => ll(x, y)) }));
const places = Object.entries(POI).map(([name, [lat, lon, tags]], k) => ({ type: 'node', id: 900000 + k, lat, lon, tags: { name, ...tags } }));
const buildings = [];
for (let i = 0; i + 1 < xs.length; i++) for (let j = 0; j + 1 < ys.length; j++) {
  const x0 = xs[i] + 14, x1 = xs[i + 1] - 14, y0 = ys[j] + 14, y1 = ys[j + 1] - 14;
  buildings.push({ type: 'way', id: wid++, tags: { building: 'yes' }, geometry: [ll(x0, y0), ll(x1, y0), ll(x1, y1), ll(x0, y1), ll(x0, y0)] });
}
const water = [{ type: 'way', id: wid++, tags: { waterway: 'river', name: 'Tevere' }, geometry: [ll(-300, -1100), ll(250, -300), ll(150, 300), ll(600, 1200)] }];
const w = (n, elements) => fs.writeFileSync(path.join(OUT, n + '.json'), JSON.stringify({ elements }));
w('streets', streets); w('places', places); w('buildings', buildings); w('water', water); w('squares', []);
console.log('test OSM written to', OUT);
