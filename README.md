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
- **Camera:** three views, picked with the *Camera* pill on the drive menu or pause sheet (tap to cycle; the choice is saved).
  *Chase* (the default) is a 2.5D view from behind and above the car: the same 2D race drawn with real perspective by
  three.js, with the OpenStreetMap footprints round the route extruded into buildings (3 to 6 storeys, churches and monuments
  taller and floodlit, lit windows), street lamps, the car's headlight and the night vignette. Streets get kerbs and paved
  pavements, with parked cars, plane trees or bollards where the building line opens up, and parapets on the bridges; the
  circuits are lit all the way round, lined with trees, with the city on the horizon. The ghost is pale blue glass. *Follow* is the flat top-down
  view with the car's heading up the screen, and *North-up* the fixed map view. In every view the left thumb turns the car left
  on screen, and the minimap stays north-up, with the car as an arrow. A phone without WebGL gets Follow instead of Chase.
  In Chase the map labels thin out to what you can read: at most six, nearest first, faded with distance, never overlapping,
  kept off the car and the road, and never repeating the street at the top; the gold stars always show.
- **Quality:** the *Quality* pill next to Camera (drive menu and pause sheet, saved) sets how much the Chase view draws.
  *High* is the full scene: pixel ratio up to 2, buildings up to 1100 units either side of the route, four street lamps that
  really light the road, the full fog distance. *Low* draws at 1x (in every view), builds buildings only 40% as far out, keeps
  one real lamp light plus the headlight, pulls the fog (and in town the far plane) in, halves the parked cars, trees and
  bollards, and uses plain windows; on a phone that starts on Low there is no MSAA either. *Auto* (the default) starts on
  High and, if a race runs under about 45 fps for 3 seconds, drops to Low for the rest of the session (never back up mid-way),
  saying "Lowered graphics to keep it smooth" the first time it ever happens. Lights, pixel ratio, fog and windows change at
  once; the buildings and furniture are rebuilt at the next race (or straight away from the pause sheet when that takes
  under about 300 ms). The old automatic resolution drop still works on High and Auto.
- **Frame rate:** *Show fps* on the pause sheet (off by default, saved) puts a small readout under the lap counter: the
  frame rate averaged over the last second and the render scale, e.g. "58 fps · 2.0x", plus the draw calls in Chase. Labels
  keep clear of it.
- **Offline:** a service worker caches everything, so after one online visit it runs in airplane mode.

## Chess coach

- **Opponent:** Stockfish 19 Lite (WASM, single thread) running in a Web Worker, so it works in airplane mode. Strength is
  adjustable from 800 to 2850; the coach always analyses at full strength whatever you play against.
- **Every move gets a verdict.** After each of your moves the strip under the board shows the label (best, great, good,
  inaccuracy, mistake, blunder), how many pawns it cost against the engine's best line, and one line from the coach.
  The eval bar next to the board tracks who is winning.
- **Postgame analysis:** accuracy for both sides, counts of blunders, mistakes and inaccuracies, an eval graph you can
  scrub, a replay board with the engine's best move drawn as an arrow, the three worst moments, and a lesson for next game.
- **Feedback cards:** at the top of every review (old games too), at most three short cards: *What went well* (a run of
  strong moves, or the move that made them pay for a mistake), *The one thing* (the costliest moment in plain English,
  named after your pattern when it is one) and *Next game* (one instruction, the pattern's drill when there is one). Tap a
  card to jump the replay board to that move with αβ open. *Drill this* makes that pattern the pre-game focus for the next
  three games; it shows on the chess home until then. Every voice gets the cards, in neutral wording.
- **Two players:** Jesse and J, picked on the chess home. Each has their own history, settings and coach voice.
- **Coach voice:** Tough (the default: every move judged out loud), Kind (same facts, said nicely) or Quiet (nothing
  during the game at all, no strip, no labels, no colours; the review is still there afterwards with neutral wording).
  J starts on Kind; a choice already saved on the phone is kept.
- **αβ (why?):** after any rated move, and on any move in the review, the αβ button explains it in plain words: what your
  move did, what the best move did instead, what the opponent can do now, the cost in pawns, and the engine's line.
- **Your patterns:** across your analysed games the coach tracks what keeps going wrong (hanging pieces, mate blindness,
  early trouble, endgame slips, queen adventures, greedy captures, pointless checks, tilt) and shows the top three with a
  drill each, plus your accuracy trend. Before each game the coach names the one to watch, and in Tutor mode options
  that repeat a known pattern are flagged in red.
- **Escalation:** each player has a running count of how many analysed games in a row a pattern has been the costliest
  one (a game without it resets the count). At three, *The one thing* says so ("Third game running: hanging pieces"), the
  pre-game focus gets firmer ("Same thing three games running. This game, before every move: what of mine is
  undefended?", the same calm wording in every voice), and a red Tutor option that repeats it gets a line saying why.
- **Find my level:** a player who has not been calibrated (new, or with fewer than three analysed games) sees a *Find
  your level* card on the chess home: three games starting at 1000. After each one (analysed straight away) the strength
  moves +250 for a win, +100 for a draw, −200 for a loss, and ±100 more for accuracy above 80 or below 55, within 800 to
  2850. After game 3 the result, rounded to 50, becomes the player's engine strength. Progress is saved, so you can stop
  between games ("Game 2 of 3"); a game you walk away from does not count. Level-check games are normal rated games and
  show as *level check* in the history. *Skip* hides the card.
- **Tutor mode (think ahead):** switch Mode to Tutor on the chess home. Before each of your moves the coach shows your
  three best options with a plain-English reason for each (tap one to see it on the board), and what the opponent would
  do if you passed, drawn as a red arrow when it is a real threat. After an inaccuracy or worse the game stops and offers a
  take-back. Take-backs are counted and go on your record; the review says so.
- **Openings:** the opening's ECO code and name show as you play and in the review, from the lichess openings table.
- **Hint:** the coach will show you the best move if you ask, but the game is marked *assisted* in your history and the
  coach is not gracious about it.
- **Assist budget:** every game starts with a budget of assist points: a hint costs 3, a tutor take-back 2, a nudge 1.
  The budget is 10 until you have three analysed games, then it drops to 8, 6 and 4 as your *unassisted* accuracy
  (hinted moves excluded) over the last five analysed games passes 60, 70 and 80 percent. It is a soft cap: when a hint
  no longer fits, the Hint button offers a nudge instead; when nothing fits, the help greys out and the game goes on.
  The patterns card shows the current budget and how many points you have been using per game. Practice in Learn has no
  budget and never counts towards it.
- **Nudge:** the gentler option. *Sandbox a move* rates a move you are considering without playing it and without saying
  what is better, twice a turn. *Read the board* describes the position plainly for both sides: material, the engine's
  view, development, kings, centre, hanging pieces, the opponent's idea, and each side's priority. Both count as nudges
  in your history, separately from hints.
- **Board themes:** Stone (the default), Night, Wood, Modern and Mono, chosen per player. The first four use the cburnett SVG piece set;
  Stone is a pale, low-contrast board with its own abstract stone piece set (speckled white, graphite black), one bold
  cue per piece (cross-cut king, crowned queen, notched rook, slit bishop, bitten knight, bud pawn), a mint glow on the
  selected square and legal moves, and the piece's name shown under the board for a second when you pick it up. Chess
  only; the racer keeps its look.
- **History:** your last 20 games and their reports are kept on the phone. Promotion is always to a queen.
- Credits: [Stockfish](https://stockfishchess.org) (GPL-3.0, `vendor/STOCKFISH-LICENSE.txt`) via
  [stockfish.js](https://github.com/nmrugg/stockfish.js); [chess.js](https://github.com/jhlywa/chess.js) (BSD-2-Clause); [three.js](https://threejs.org) r184 for the chase camera (MIT, `vendor/three/LICENSE`); piece set by Colin M.L. Burnett (GPLv2+, from lichess,
  `vendor/pieces/`); the Stone pieces in `vendor/pieces-stone/` are original drawings for this app; opening names from [lichess-org/chess-openings](https://github.com/lichess-org/chess-openings) (CC0).

## Learn

The third card on the launcher. Nineteen lessons: three on basics (opening principles, what to do when you leave the book,
how to read a position) and sixteen openings, each opening taught from both sides. With White: Italian, Ruy Lopez,
Queen's Gambit and London, plus the Open Sicilian (English Attack), the Advance French, the Advance Caro-Kann (Short
Variation) and the Classical King's Indian (Bayonet). With Black: Sicilian (Najdorf), French, Caro-Kann and King's Indian,
plus the Two Knights against the Italian, the Morphy Defence (Chigorin) against the Ruy Lopez, the Slav against the
Queen's Gambit, and ...c5, ...Bd6 against the London. The White and Black lists run in the same order, so each opening
sits at the same place in both. Each lesson has the idea in a paragraph, a line you step through on a board with a note
per move, what you want, what to avoid, and what to do next.
Lesson text lives in `lessons.js`; the screen is `learn.js`. `node tools/engine-test.js`
replays every lesson line through Stockfish at depth 12 and 14 (the live and review depths) and fails if any move rates a
mistake or blunder; inaccuracies are printed as warnings (`--lessons` runs just that check, about a minute and a half).

- **Practice** (openings only) is a strict tutor for learning the line, not a game. There is no assist budget, no Hint,
  Nudge or Resign; a **Back to lesson** button takes you back. Think ahead is always on whatever your Mode setting, and the
  book move is tagged **Book** among the options (added with its lesson note if the engine did not list it). The engine
  plays the book replies and each of your book moves is confirmed with its note. Play anything else and the game stops
  before the engine answers: *Not the line. The line goes Nf3: ...* with **Take it back** (free, nothing counted) or
  **Play on anyway**, which drops the line and leaves you in free play against the engine at your Elo, still with Think
  ahead and free take-backs. Each deviation counts as a correction. When the line is played out a sheet says *Line done*
  with your corrections, and offers **Play on**, **Again** or **Back to lesson**. The coach speaks in the kind voice
  throughout, and practice games are never saved: no history, patterns, accuracy or budget stats.
- **Drills** (openings only, for whichever side the lesson is) are for getting the line into memory. Each sits under
  Practice with a one-line status. *From memory* is Practice with Think ahead off and no note until you have played the
  move: a book move is confirmed with its note, a wrong one stops you and shows the right move and its note. At the end
  of the line it scores moves right first time out of your moves in the line, plus slips (*8/10 right first time. 2
  slips.*), and keeps best, last, tries and date. *Position cards* needs no engine: every position in the line where it
  is your move, flipped for Black, with the last move highlighted and *Your move?*. Tap a piece, then its square (or
  *Show me*). Right shows the note and moves on; wrong draws the move as an arrow with its note and brings the card back
  two cards later. Cards live in Leitner boxes: a first answer that is right moves a card up a box, a wrong one drops it
  to box 1; box 1 comes back every session, box 2 every other session, box 3 every fourth (sessions with nothing due are
  skipped). A session ends when every due card has been answered right once, with a summary of cards seen, first-try
  rate and how many are in box 3. Drill progress is stored per player (whoever is picked on the chess home) and lesson
  under `ghostlap-learn-v1`, apart from the chess history, and the Learn list shows a small ring per opening once a drill has been done.

## Install on iPhone

1. Open the GitHub Pages URL in **Safari**.
2. Tap **Share → Add to Home Screen**.
3. Open it **from the home-screen icon once while still online**. iOS keeps a separate cache for home-screen apps.
4. Wait until the launcher shows **✓ Ready offline**. Then turn on airplane mode and open it again to confirm.

Your times and ghosts are stored on the phone (localStorage). Nothing is sent anywhere.

## Native app (TestFlight)

The same files also ship as a native iOS app through [Capacitor](https://capacitorjs.com): `npm run build:www` copies the
app into `www/`, `npx cap sync ios` puts it into the Xcode project in `ios/`, and Xcode archives and uploads it to
TestFlight. The step-by-step for the Mac is in [TESTFLIGHT.md](TESTFLIGHT.md). The native app needs no service worker
(the files are inside the app), so its launcher says **✓ Ready** instead of **✓ Ready offline**.

## Files

- `index.html`: layout and styles (launcher, drive menu, race HUD, chess, review)
- `hub.js`: the launcher (Drive or Chess)
- `engine.js`: Stockfish worker wrapper, move rating, coach lines, postgame analysis (runs under node too: `node tools/engine-test.js`,
  which drives the vendored engine and also checks every lesson line)
- `coach.js`: chess board, live rating strip, nudge, tutor, end sheet, review screen and feedback cards, patterns and escalation, level check, game history
- `lessons.js`, `learn.js`: opening lessons, the Learn screen and its drills
- `openings.js`: ECO opening table (generated from the lichess TSVs, lines up to 14 plies)
- `vendor/`: chess.js, the Stockfish lite WASM engine, the piece SVGs, and three.js (`vendor/three/`, the ES module build, loaded by `chase.js`)
- `core.js`: tracks, car physics, lap timing, ghost recording (no DOM, so it runs under node)
- `game.js`: rendering, input, menus, sound, saving, offline status
- `chase.js`: the Chase camera, a three.js renderer for the same world (a module; `window.Chase`: `init`, `build`, `render`, `snap`, `toScreen`, `resize`, `setQuality`, `rebuild`, `dispose`, `info`)
- `rome.js`: generated map and routes (`tools/build-rome.mjs`)
- `sw.js`: offline cache. Bump `CACHE` when you change any file (the engine wasm is about 1.8 MB, cached once).
- `tools/`: OSM fetch and build scripts, synthetic test map, headless test (`tools/e2e.js`)
- `package.json`, `capacitor.config.json`, `ios/`, `tools/build-www.mjs`: the native iOS wrapper (see TESTFLIGHT.md)

