// Tiled, retrying Overpass fetch (for when the servers are busy). Writes the same files as
// fetch-osm.sh into tools/osm/: streets, squares, buildings, water, places.
//   node tools/fetch-osm-tiles.mjs [maxMinutes]
import fs from 'fs';
import path from 'path';
import { execFileSync } from 'child_process';
const HERE = path.dirname(new URL(import.meta.url).pathname), OUT = path.join(HERE, 'osm'), PART = path.join(OUT, 'parts');
fs.mkdirSync(PART, { recursive: true });
const S = 41.8945, W = 12.4480, N = 41.9160, E = 12.4890, NY = 4, NX = 4;
const SERVERS = ['https://overpass.kumi.systems/api/interpreter', 'https://overpass.private.coffee/api/interpreter', 'https://overpass-api.de/api/interpreter'];
const UA = 'ghostlap-roma/1.0 (personal offline game; one-off fetch)';
const deadline = Date.now() + (+process.argv[2] || 50) * 60000;
const jobs = [];
for (let j = 0; j < NY; j++) for (let i = 0; i < NX; i++) {
  const b = [S + ((N - S) * j) / NY, W + ((E - W) * i) / NX, S + ((N - S) * (j + 1)) / NY, W + ((E - W) * (i + 1)) / NX].map((v) => v.toFixed(5)).join(',');
  jobs.push({ name: `tile-${j}-${i}`, q: `[out:json][timeout:170];(way["highway"](${b});way["building"](${b}););out geom;` });
}
const bb = `${S},${W},${N},${E}`;
jobs.push({ name: 'extras', q: `[out:json][timeout:170];(way["highway"="pedestrian"]["area"="yes"](${bb});way["place"="square"](${bb});way["waterway"="river"](${bb});` +
  `nwr["tourism"~"^(attraction|museum|hotel|viewpoint)$"]["name"](${bb});nwr["railway"="station"]["name"](${bb});nwr["station"="subway"]["name"](${bb});` +
  `nwr["amenity"~"^(fountain|place_of_worship)$"]["name"](${bb});nwr["historic"]["name"](${bb});nwr["place"="square"]["name"](${bb}););out geom;` });
const ok = (f) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')).elements !== undefined; } catch (e) { return false; } };
let round = 0;
while (Date.now() < deadline) {
  const todo = jobs.filter((j) => !ok(path.join(PART, j.name + '.json')));
  if (!todo.length) break;
  round++;
  for (const [k, job] of todo.entries()) {
    if (Date.now() > deadline) break;
    const srv = SERVERS[(k + round) % SERVERS.length], f = path.join(PART, job.name + '.json');
    const t0 = Date.now();
    try {
      execFileSync('curl', ['-sS', '--fail', '--max-time', '200', '-A', UA, '--data-urlencode', 'data=' + job.q, srv, '-o', f + '.tmp'], { stdio: 'pipe' });
      if (ok(f + '.tmp')) { fs.renameSync(f + '.tmp', f); console.log(`ok   ${job.name} via ${new URL(srv).host} in ${((Date.now() - t0) / 1000) | 0}s`); }
      else console.log(`bad  ${job.name} via ${new URL(srv).host}`);
    } catch (e) { console.log(`fail ${job.name} via ${new URL(srv).host} (${String(e.stderr || e.message).trim().slice(0, 60)})`); }
  }
  const left = jobs.filter((j) => !ok(path.join(PART, j.name + '.json'))).length;
  console.log(`round ${round}: ${jobs.length - left}/${jobs.length} done`);
  if (left) execFileSync('sleep', ['20']);
}
// merge
const all = new Map();
for (const j of jobs) { const f = path.join(PART, j.name + '.json'); if (!ok(f)) continue; for (const e of JSON.parse(fs.readFileSync(f, 'utf8')).elements) all.set(e.type + e.id, e); }
const missing = jobs.filter((j) => !ok(path.join(PART, j.name + '.json'))).map((j) => j.name);
const els = [...all.values()], t = (e) => e.tags || {};
const write = (n, list) => fs.writeFileSync(path.join(OUT, n + '.json'), JSON.stringify({ elements: list }));
write('streets', els.filter((e) => e.type === 'way' && t(e).highway && t(e).area !== 'yes'));
write('squares', els.filter((e) => e.type === 'way' && ((t(e).highway === 'pedestrian' && t(e).area === 'yes') || t(e).place === 'square')));
write('buildings', els.filter((e) => e.type === 'way' && t(e).building));
write('water', els.filter((e) => t(e).waterway === 'river'));
write('places', els.filter((e) => t(e).name && (t(e).tourism || t(e).railway || t(e).station || t(e).amenity || t(e).historic || t(e).place)).map((e) =>
  e.type === 'way' && !e.center && e.geometry ? { ...e, center: { lat: e.geometry.reduce((a, g) => a + g.lat, 0) / e.geometry.length, lon: e.geometry.reduce((a, g) => a + g.lon, 0) / e.geometry.length } } : e));
console.log(missing.length ? 'INCOMPLETE, missing: ' + missing.join(' ') : 'all tiles fetched and merged');
process.exit(missing.length ? 1 : 0);
