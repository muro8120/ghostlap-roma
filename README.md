# Ghostlap Roma

Two games in one offline iPhone app. Pick one on the launcher:

- **Drive:** a small top-down night racer set in Rome. Race three laps, and your best run comes back as a ghost to beat.
- **Chess:** play Stockfish with a coach who rates every move you make and then takes the whole game apart.

- **Circuits:** Circo Massimo, Colosseo, Lungotevere, Via Appia Antica. A bronze unlocks the next one.
- **Rome from the NYX** (`rome.js`, see `tools/ROME-ROUTES.md`): real-street round trips from the hotel on Via Cicerone to the
  Vatican, Piazza del Popolo and the Spanish Steps, the Pantheon and Trevi, plus a Prati loop. The street you're on shows at the top,
  with a minimap, landmark labels, and the list of streets you drove at the finish. Direction signs at the screen edge point
  to the hotel, the next stop and the nearest of your Andiamo places (gold stars). Map data © OpenStreetMap contributors (ODbL).
- **Garage:** Cinquecento, Maranello 12, Modena GT, San Cesario, Sant'Agata. These are homages named after towns, not brands.
- **Controls:** hold the left or right half of the screen to steer. Gas is automatic. Both thumbs brake; keep holding to reverse.
- **Offline:** a service worker caches everything, so after one online visit it runs in airplane mode.

## Chess coach

- **Opponent:** Stockfish 19 Lite (WASM, single thread) running in a Web Worker, so it works in airplane mode. Strength is
  adjustable from 800 to 2850; the coach always analyses at full strength whatever you play against.
- **Every move gets a verdict.** After each of your moves the strip under the board shows the label (best, great, good,
  inaccuracy, mistake, blunder), how many pawns it cost against the engine's best line, and one line from the coach.
  The eval bar next to the board tracks who is winning.
- **Postgame analysis:** accuracy for both sides, counts of blunders, mistakes and inaccuracies, an eval graph you can
  scrub, a replay board with the engine's best move drawn as an arrow, the three worst moments, and a lesson for next game.
- **Two players:** Jesse and J, picked on the chess home. Each has their own history, settings and coach voice.
- **Coach voice:** Tough (the default: every move judged out loud), Kind (same facts, said nicely) or Quiet (nothing
  during the game at all, no strip, no labels, no colours; the review is still there afterwards with neutral wording).
  J starts on Quiet.
- **αβ (why?):** after any rated move, and on any move in the review, the αβ button explains it in plain words: what your
  move did, what the best move did instead, what the opponent can do now, the cost in pawns, and the engine's line.
- **Your patterns:** across your analysed games the coach tracks what keeps going wrong (hanging pieces, mate blindness,
  early trouble, endgame slips, queen adventures, greedy captures, pointless checks, tilt) and shows the top three with a
  drill each, plus your accuracy trend. Before each game the coach names the one to watch, and in Tutor mode options
  that repeat a known pattern are flagged in red.
- **Tutor mode (think ahead):** switch Mode to Tutor on the chess home. Before each of your moves the coach shows your
  three best options with a plain-English reason for each (tap one to see it on the board), and what the opponent would
  do if you passed, drawn as a red arrow when it is a real threat. After an inaccuracy or worse the game stops and offers a
  take-back. Take-backs are counted and go on your record; the review says so.
- **Openings:** the opening's ECO code and name show as you play and in the review, from the lichess openings table.
- **Hint:** the coach will show you the best move if you ask, but the game is marked *assisted* in your history and the
  coach is not gracious about it.
- **Board themes:** Night, Wood, Modern and Mono, with the cburnett SVG piece set. Chess only; the racer keeps its look.
- **History:** your last 20 games and their reports are kept on the phone. Promotion is always to a queen.
- Credits: [Stockfish](https://stockfishchess.org) (GPL-3.0, `vendor/STOCKFISH-LICENSE.txt`) via
  [stockfish.js](https://github.com/nmrugg/stockfish.js); [chess.js](https://github.com/jhlywa/chess.js) (BSD-2-Clause); piece set by Colin M.L. Burnett (GPLv2+, from lichess,
  `vendor/pieces/`); opening names from [lichess-org/chess-openings](https://github.com/lichess-org/chess-openings) (CC0).

## Install on iPhone

1. Open the GitHub Pages URL in **Safari**.
2. Tap **Share → Add to Home Screen**.
3. Open it **from the home-screen icon once while still online**. iOS keeps a separate cache for home-screen apps.
4. Wait until the launcher shows **✓ Ready offline**. Then turn on airplane mode and open it again to confirm.

Your times and ghosts are stored on the phone (localStorage). Nothing is sent anywhere.

## Files

- `index.html`: layout and styles (launcher, drive menu, race HUD, chess, review)
- `hub.js`: the launcher (Drive or Chess)
- `engine.js`: Stockfish worker wrapper, move rating, coach lines, postgame analysis (runs under node too: `node tools/engine-test.js`)
- `coach.js`: chess board, live rating strip, end sheet, review screen, game history
- `openings.js`: ECO opening table (generated from the lichess TSVs, lines up to 14 plies)
- `vendor/`: chess.js, the Stockfish lite WASM engine, and the piece SVGs
- `core.js`: tracks, car physics, lap timing, ghost recording (no DOM, so it runs under node)
- `game.js`: rendering, input, menus, sound, saving, offline status
- `rome.js`: generated map and routes (`tools/build-rome.mjs`)
- `sw.js`: offline cache. Bump `CACHE` when you change any file (the engine wasm is about 1.8 MB, cached once).
- `tools/`: OSM fetch and build scripts, synthetic test map, headless test (`tools/e2e.js`)

