// Alternative to Overpass: pull raw map tiles from the main OSM API (api.openstreetmap.org/api/0.6/map),
// splitting any tile the API refuses as too big, and write the same files build-rome.mjs reads.
//   node tools/fetch-osmapi.mjs
import fs from 'fs';
import path from 'path';
import { execFileSync } from 'child_process';
const HERE = path.dirname(new URL(import.meta.url).pathname), OUT = path.join(HERE, 'osm'), PART = path.join(OUT, 'api');
fs.mkdirSync(PART, { recursive: true });
const UA = 'ghostlap-roma/1.0 (personal offline game; one-off fetch)';
const nodes = new Map(), ways = new Map(), tagged = new Map();
const unesc = (s) => s.replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
function parse(xml) {
  let cur = null;
  for (const line of xml.split('\n')) {
    let m;
    if ((m = line.match(/<node id="(\d+)"[^>]*?lat="([-\d.]+)" lon="([-\d.]+)"(\/?)>/))) {
      nodes.set(+m[1], [+m[2], +m[3]]);
      cur = m[4] ? null : { type: 'node', id: +m[1], lat: +m[2], lon: +m[3], tags: {} };
    } else if ((m = line.match(/<way id="(\d+)"/))) cur = { type: 'way', id: +m[1], nodes: [], tags: {} };
    else if ((m = line.match(/<relation id="(\d+)"/))) cur = null;
    else if (cur && (m = line.match(/<nd ref="(\d+)"/))) cur.nodes.push(+m[1]);
    else if (cur && (m = line.match(/<tag k="([^"]*)" v="([^"]*)"/))) cur.tags[unesc(m[1])] = unesc(m[2]);
    else if (cur && /<\/(node|way)>/.test(line)) {
      if (cur.type === 'way') ways.set(cur.id, cur);
      else if (Object.keys(cur.tags).length) tagged.set(cur.id, cur);
      cur = null;
    }
  }
}
function fetchBox(s, w, n, e, depth = 0) {
  const f = path.join(PART, [s, w, n, e].map((v) => v.toFixed(5)).join('_') + '.osm');
  if (!fs.existsSync(f)) {
    const url = `https://api.openstreetmap.org/api/0.6/map?bbox=${w},${s},${e},${n}`;
    let code = '';
    for (let t = 1; t <= 4; t++) {
      try { code = execFileSync('curl', ['-sS', '--max-time', '120', '-A', UA, '-o', f + '.tmp', '-w', '%{http_code}', url]).toString(); } catch (err) { code = 'ERR'; }
      if (code === '200' || code === '400' || code === '509') break;
      execFileSync('sleep', [String(2 ** t)]);
    }
    if (code === '400') { // too many nodes: split in four
      if (depth > 3) throw new Error('tile still too big ' + f);
      const ms = (s + n) / 2, mw = (w + e) / 2;
      for (const [a, b, c, d] of [[s, w, ms, mw], [s, mw, ms, e], [ms, w, n, mw], [ms, mw, n, e]]) fetchBox(a, b, c, d, depth + 1);
      return;
    }
    if (code !== '200') throw new Error('HTTP ' + code + ' for ' + url);
    fs.renameSync(f + '.tmp', f);
    console.log('ok', path.basename(f), (fs.statSync(f).size / 1024) | 0, 'KB');
    execFileSync('sleep', ['1']);
  }
  parse(fs.readFileSync(f, 'utf8'));
}
const S = 41.8945, W = 12.4480, N = 41.9160, E = 12.4890, NY = 4, NX = 4;
for (let j = 0; j < NY; j++) for (let i = 0; i < NX; i++)
  fetchBox(S + ((N - S) * j) / NY, W + ((E - W) * i) / NX, S + ((N - S) * (j + 1)) / NY, W + ((E - W) * (i + 1)) / NX);
// strip south to Campo de' Fiori / Via dei Giubbonari, and a patch of Testaccio (Andiamo picks)
for (let i = 0; i < NX; i++) fetchBox(41.8905, W + ((E - W) * i) / NX, S, W + ((E - W) * (i + 1)) / NX);
fetchBox(41.8740, 12.4700, 41.8800, 12.4800);
// to Overpass-style JSON
const asWay = (w) => {
  const geometry = w.nodes.map((id) => nodes.get(id)).filter(Boolean).map(([lat, lon]) => ({ lat, lon }));
  return { type: 'way', id: w.id, nodes: w.nodes.filter((id) => nodes.has(id)), tags: w.tags, geometry };
};
const all = [...ways.values()].map(asWay).filter((w) => w.geometry.length >= 2);
const t = (e) => e.tags || {};
const write = (n, list) => fs.writeFileSync(path.join(OUT, n + '.json'), JSON.stringify({ elements: list }));
write('streets', all.filter((e) => t(e).highway && t(e).area !== 'yes'));
write('squares', all.filter((e) => (t(e).highway === 'pedestrian' && t(e).area === 'yes') || t(e).place === 'square'));
write('buildings', all.filter((e) => t(e).building));
write('water', all.filter((e) => t(e).waterway === 'river'));
const isPlace = (e) => t(e).name && (t(e).tourism || t(e).railway || t(e).station || t(e).amenity || t(e).historic || t(e).place);
write('places', [...[...tagged.values()].filter(isPlace), ...all.filter(isPlace).map((e) => ({ ...e,
  center: { lat: e.geometry.reduce((a, g) => a + g.lat, 0) / e.geometry.length, lon: e.geometry.reduce((a, g) => a + g.lon, 0) / e.geometry.length } }))]);
// shop fronts and street furniture you'd recognise walking past (pharmacy crosses, tabacchi, nasoni...)
const POI_KEYS = ['amenity', 'shop', 'railway', 'historic', 'tourism'];
const unnamedOk = (q) => /^(pharmacy|drinking_water|atm|bank|toilets|post_office)$/.test(q.amenity || '') ||
  /^(tobacco|supermarket)$/.test(q.shop || '') || q.railway === 'subway_entrance';
const isPoi = (e) => { const q = t(e); return POI_KEYS.some((k) => q[k]) && (q.name || unnamedOk(q)); };
const centre = (e) => ({ lat: e.geometry.reduce((a, g) => a + g.lat, 0) / e.geometry.length, lon: e.geometry.reduce((a, g) => a + g.lon, 0) / e.geometry.length });
write('pois', [...[...tagged.values()].filter(isPoi), ...all.filter(isPoi).map((e) => ({ type: 'way', id: e.id, tags: e.tags, center: centre(e) }))]);
console.log(`merged: ${nodes.size} nodes, ${ways.size} ways, ${tagged.size} tagged nodes`);
