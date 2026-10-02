# Rome routes from the NYX: how to finish

The game side and the map pipeline are done and tested on a synthetic street grid. What's missing is
the real OpenStreetMap data. The session that built this couldn't reach `overpass-api.de`, which was
blocked by the environment's network policy.

## Finish it (about 10 minutes, needs network access to overpass-api.de)

1. `bash tools/fetch-osm.sh`. This writes raw Overpass JSON to `tools/osm/` (git-ignored).
2. `node tools/build-rome.mjs`. This writes `rome.js` and prints a report per route. Check that:
   - every `stop ... -> node` line snapped within about 60 m of the named place
     (Musei Vaticani, Piazza San Pietro, Piazza del Popolo, Piazza di Spagna, Pantheon, Fontana di Trevi,
     Lepanto, Piazza Cavour, plus the NYX hotel itself);
   - no route prints `SIDE-BY-SIDE OVERLAP` (crossings are fine, since they're real intersections);
   - `max smoothing drift` stays under about 12 m and the km figures are plausible
     (Vatican ~3–4, Popolo/Spagna ~4–5, Pantheon/Trevi ~5–6 round trip, Prati loop ~1.5–2.5).
   If a stop fails to match, the script lists what it did find, so adjust the matcher in `STOPS`.
3. `ROME_JS=$PWD/rome.js node tools/e2e.js`. Every line should PASS. Screenshots go to `/tmp/ghostlap-shots`.
   Look at a mid-route screenshot: the streets should be Prati's real grid, with labels.
4. Make sure `rome.js` does **not** say `"synthetic":true`. Bump `CACHE` in `sw.js`, commit `rome.js`, merge to `main`.
   GitHub Pages redeploys. On the phone, open the app once online, then reopen it to pick up the update.

## Testing without network

`node tools/make-test-osm.mjs && OSM_DIR=tools/osm-test node tools/build-rome.mjs --out /tmp/rome-test.js`
then `ROME_JS=/tmp/rome-test.js node tools/e2e.js`. The synthetic map shows a red **TEST MAP** warning
in the menu. Never commit its output as `rome.js`.

## How routes are made

Each route is a list of stops. Each leg is the shortest walking path on OSM's street network
(sidewalk-only and private ways are dropped). Later legs are pushed off streets already used, so
the way back is different. Corners are smoothed (gaussian, 18 m) so they're drivable. Each route is
checked for side-by-side overlaps. Medal times come from the same test drivers as the circuits.
These are walking routes, not driving directions.
