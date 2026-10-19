# Rome routes from the NYX

`rome.js` holds the real-street routes and the surrounding map. It's built from OpenStreetMap data
(© OpenStreetMap contributors, ODbL); the credit is shown in the menu.

## Rebuild or refresh

1. Download the raw data into `tools/osm/` (git-ignored, about 60 MB):
   - `node tools/fetch-osmapi.mjs`: main OSM API, 16 tiles, about a minute. Needs `api.openstreetmap.org`. This is what's used now.
   - or `bash tools/fetch-osm.sh` / `node tools/fetch-osm-tiles.mjs`: Overpass. These were too overloaded to use on 2 Oct 2026.
2. `node tools/build-rome.mjs`. This writes `rome.js` and prints a report per route. Check that:
   - every `stop ... -> node` line snapped within about 40 m, and there are no `!! route passes N m from` lines;
   - `max smoothing drift` stays under about 12 m.
   `HAIRPIN OVERLAP` lines are expected where a route comes back close to itself (round the obelisk in
   Piazza del Popolo, the two sides of a block). The game's track-follower stays on the right side of
   those (see `nearest()` in `core.js`). A `no way on from ... without turning back` line means a stop
   has no other way out within `TURN` metres; the route then turns back there (only Piazza del Popolo,
   where it goes round the obelisk, so it does not matter).
   The e2e test fails if any route turns round on itself.
3. `node /path/to/preview` isn't in the repo. To eyeball routes, run the game, or render `rome.js` routes
   over `ROME.streets` with a canvas.
4. `ROME_JS=$PWD/rome.js node tools/e2e.js`. Every line should PASS.
5. Bump `CACHE` in `sw.js`, commit `rome.js`, push `main`. Then open the app online once and reopen it.

## Jesse's places (Andiamo)

`PICKS` in `build-rome.mjs` holds the eight places from his "Rome from the NYX" page in the Andiamo trip
project: Sant'Eustachio, Forno Campo de' Fiori, Roscioli, Cul de Sac, Gelateria del Teatro, Enoteca
Costantini, Da Oio, and Trapizzino Testaccio. Each is matched by name (and house number where needed)
in the OSM data. They show as gold stars on the map, and the nearest two get direction signs at the
screen edge, next to the hotel's and the next stop's. The `r-picks` route visits the five in the
centre. The fetch includes a strip south to Via dei Giubbonari and a patch of Testaccio for these.

## No turning round

Routes used to turn round where a stop was at the end of a street (the Vatican Museums gate,
Piazza di Sant'Eustachio, Campo de' Fiori), and `core.js` put a turning circle there. That felt wrong
in the game, so since Oct 2026 the way out of a stop may not use the last `TURN` metres (150) of the
way in: the route carries on round the block and meets the way in further back. The Vatican route
now goes on along Viale Vaticano and back down a parallel street, and leaves Ottaviano round a block
to the north (4.47 km to 5.57 km); the picks route goes round the block at Sant'Eustachio and at
Campo de' Fiori (4.46 km to 4.66 km). The other three routes did not change. A best time and ghost
saved on a route that has since changed are dropped when the game loads (the ghost would stray off
the new road); runs on unchanged routes are kept.

The walls are soft everywhere: no bounce, one knock, then you slide along.

## How routes are made

Stops are found in the data by name, never by typed coordinates:
- NYX Hotel: the `tourism=hotel` node
- Vatican Museums: Porta Musei Vaticani
- St Peter's Square: Obelisco Vaticano
- Piazza del Popolo: Obelisco Flaminio
- Spanish Steps: Fontana della Barcaccia
- Pantheon: Obelisco Macuteo in Piazza della Rotonda
- Trevi: Piazza di Trevi
- metro stations and Piazza Cavour: by name

Each leg is the shortest walk on the street network that does not turn round at the stop it leaves (above). Sidewalk-only and private ways are dropped, and
unnamed paths cost extra so routes stay on streets with names. Streets already walked cost more, and
the last leg home keeps a little distance from the way out, so you learn a second way back. Passing
within about 25 m of a landmark counts as visiting it. Corners are smoothed (gaussian, 18 m), so the
route drifts at most about 7 m off the real street. These are walking routes, not driving directions.

## Testing without network

`node tools/make-test-osm.mjs && OSM_DIR=tools/osm-test node tools/build-rome.mjs --out /tmp/rome-test.js`,
then `ROME_JS=/tmp/rome-test.js node tools/e2e.js`. The synthetic map shows a red TEST MAP warning in
the menu. Never commit it as `rome.js`.
