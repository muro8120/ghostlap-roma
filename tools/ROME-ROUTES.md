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
   `HAIRPIN OVERLAP` lines are expected where a route doubles back (up to the Vatican Museums gate and
   back, round the obelisk in Piazza del Popolo). The game's track-follower stays on the right side
   of those (see `nearest()` in `core.js`).
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

## Turning circles

Where a route doubles back (the Vatican Museums gate, Piazza di Sant'Eustachio, Campo de' Fiori),
`core.js` puts a turning circle on the track. Inside it there are no walls; its edge is a soft round
wall; and turning round inside it counts, so the route carries on from the way out. Everywhere else
the walls are soft too: no bounce, one knock, then you slide along.

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

Each leg is the shortest walk on the street network. Sidewalk-only and private ways are dropped, and
unnamed paths cost extra so routes stay on streets with names. Streets already walked cost more, and
the last leg home keeps a little distance from the way out, so you learn a second way back. Passing
within about 25 m of a landmark counts as visiting it. Corners are smoothed (gaussian, 18 m), so the
route drifts at most about 7 m off the real street. These are walking routes, not driving directions.

## Testing without network

`node tools/make-test-osm.mjs && OSM_DIR=tools/osm-test node tools/build-rome.mjs --out /tmp/rome-test.js`,
then `ROME_JS=/tmp/rome-test.js node tools/e2e.js`. The synthetic map shows a red TEST MAP warning in
the menu. Never commit it as `rome.js`.
