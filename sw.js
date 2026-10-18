// Ghostlap Roma service worker: cache everything on install, serve from cache first,
// so the game opens in airplane mode once it has been opened online one time.
const CACHE = 'ghostlap-roma-v14';
const ASSETS = ['./', 'index.html', 'core.js', 'game.js', 'hub.js', 'engine.js', 'coach.js', 'vendor/chess.js',
  'vendor/stockfish-19-lite-single.js', 'vendor/stockfish-19-lite-single.wasm', 'openings.js', 'lessons.js', 'learn.js', 'curriculum.js', 'puzzles-data.js', 'puzzles.js', 'endgames.js', 'plan.js',
  'chase.js', 'chase-cars.js', 'vendor/three/three.module.min.js', 'vendor/three/three.core.min.js',
  'vendor/pieces/wK.svg', 'vendor/pieces/wQ.svg', 'vendor/pieces/wR.svg', 'vendor/pieces/wB.svg', 'vendor/pieces/wN.svg', 'vendor/pieces/wP.svg', 'vendor/pieces/bK.svg', 'vendor/pieces/bQ.svg', 'vendor/pieces/bR.svg', 'vendor/pieces/bB.svg', 'vendor/pieces/bN.svg', 'vendor/pieces/bP.svg',
  'vendor/pieces-stone/wK.svg', 'vendor/pieces-stone/wQ.svg', 'vendor/pieces-stone/wR.svg', 'vendor/pieces-stone/wB.svg', 'vendor/pieces-stone/wN.svg', 'vendor/pieces-stone/wP.svg', 'vendor/pieces-stone/bK.svg', 'vendor/pieces-stone/bQ.svg', 'vendor/pieces-stone/bR.svg', 'vendor/pieces-stone/bB.svg', 'vendor/pieces-stone/bN.svg', 'vendor/pieces-stone/bP.svg',
  'vendor/pieces-stone-wire/wK.svg', 'vendor/pieces-stone-wire/wQ.svg', 'vendor/pieces-stone-wire/wR.svg', 'vendor/pieces-stone-wire/wB.svg', 'vendor/pieces-stone-wire/wN.svg', 'vendor/pieces-stone-wire/wP.svg', 'vendor/pieces-stone-wire/bK.svg', 'vendor/pieces-stone-wire/bQ.svg', 'vendor/pieces-stone-wire/bR.svg', 'vendor/pieces-stone-wire/bB.svg', 'vendor/pieces-stone-wire/bN.svg', 'vendor/pieces-stone-wire/bP.svg', 'manifest.webmanifest', 'icon-180.png', 'icon-192.png', 'icon-512.png'];
const OPTIONAL = ['rome.js']; // the real-street map; the game still works without it

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE)
    .then((c) => c.addAll(ASSETS).then(() => Promise.all(OPTIONAL.map((a) => c.add(a).catch(() => {})))))
    .then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== location.origin) return;
  e.respondWith(
    caches.match(req, { ignoreSearch: true }).then((hit) => {
      if (hit) return hit;
      if (req.mode === 'navigate') return caches.match('index.html').then((r) => r || fetch(req));
      return fetch(req).then((res) => {
        if (res.ok) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(req, copy)); }
        return res;
      });
    })
  );
});
