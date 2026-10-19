# Ghostlap Roma

Two games in one offline iPhone app, and a chess training programme. Pick one of the four cards on the launcher (~~Two~~ Four
ways to lose an evening; you are probably here because something else needs doing):

- **Drive:** a small top-down night racer set in Rome. Race three laps, and your best run comes back as a ghost to beat.
- **Chess:** play Stockfish with a coach who rates every move you make and then takes the whole game apart.
- **Learn:** opening lessons taught from both sides, with drills.
- **Train:** the staged learning plan built from the research in `docs/chess/`: what to do today, the week's pearl, your
  stage and its exit criteria measured from your own games, tactics and endgame drills.

- **Circuits:** Circo Massimo, Colosseo, Lungotevere, Via Appia Antica. A bronze unlocks the next one.
- **Rome from the NYX** (`rome.js`, see `tools/ROME-ROUTES.md`): real-street round trips from the hotel on Via Cicerone to the
  Vatican, Piazza del Popolo and the Spanish Steps, the Pantheon and Trevi, plus a Prati loop. The street you're on shows at the top,
  with a minimap, landmark labels, and the list of streets you drove at the finish. Direction signs at the screen edge point
  to the hotel, the next stop and the nearest of your Andiamo places (gold stars). Map data © OpenStreetMap contributors (ODbL).
- **Garage:** Cinquecento, Maranello 12, Modena GT, San Cesario, Sant'Agata. These are homages named after towns, not brands.
  The garage shows the chosen car turning on a dark plinth in 3D, lit as in the race (a phone without WebGL gets the
  top view); it only draws while it is on screen. In the 3D view each has its own low-poly body (the tall round Cinquecento with its white roof, the long-bonnet
  Maranello, the longer-roofed Modena, the cab-forward San Cesario and the Sant'Agata wedge, both with a wing): wheels
  that roll and steer, a body that leans in the corners and dips under braking, brake lights and a reverse light.
- **Controls:** hold the left or right half of the screen to steer. Gas is automatic. Both thumbs brake; keep holding to reverse.
- **Camera:** four views, picked with the *Camera* pill on the drive menu or pause sheet (tap to cycle Chase, Bonnet,
  Follow, North-up; the choice is saved).
  *Chase* (the default) is a 3D view from behind and above the car: the same race drawn with real perspective by
  three.js, with the OpenStreetMap footprints round the route extruded into buildings (3 to 6 storeys, churches and monuments
  taller and floodlit, lit windows), street lamps, the car's headlight and the night vignette. Streets get kerbs and paved
  pavements, with parked cars, plane trees or bollards where the building line opens up, and parapets on the bridges. The
  road has a slight crown with the markings painted on it (a white dashed centre line in town), patches of older and
  newer asphalt and manhole covers, and the nearest street lamps shine back off the wet asphalt as long streaks (on the road only); hard braking and slides
  leave tyre marks and smoke, a wall scrape smokes, and a knock on a wall gives the camera a small shake. The
  circuits are lit all the way round, lined with trees, with the city on the horizon. The ghost is pale blue glass. The lens
  widens a little with speed and the camera falls back a touch, and it leans a degree or two into a corner. *Bonnet* is
  the same 3D world from just above the bonnet, looking down the road: rigid on the car, so it rolls and dips with the
  body; the bonnet is a curved strip at the bottom of the screen, the headlight's glare right under the lens is left
  out so the road stays readable, and the signs sit just above the bonnet. *Follow* is the flat top-down
  view with the car's heading up the screen, and *North-up* the fixed map view. In every view the left thumb turns the car left
  on screen, and the minimap stays north-up, with the car as an arrow. A phone without WebGL gets Follow instead of Chase
  or Bonnet. How the race was turned 3D, and what stays 2D, is in [docs/drive/3d-conversion.md](docs/drive/3d-conversion.md).
  In Chase and Bonnet the map labels thin out to what you can read: at most six, nearest first, faded with distance, never overlapping,
  kept off the car and the road, and never repeating the street at the top; the gold stars always show.
- **Quality:** the *Quality* pill next to Camera (drive menu and pause sheet, saved) sets how much the Chase view draws.
  *High* is the full scene: pixel ratio up to 2, buildings up to 1100 units either side of the route, four street lamps that
  really light the road, the full fog distance. *Low* draws at 1x (in every view), builds buildings only 40% as far out, keeps
  one real lamp light plus the headlight, pulls the fog (and in town the far plane) in, halves the parked cars, trees and
  bollards, and uses plain windows and plain asphalt (no patches or manholes, the crown shaded in more strongly so it
  still reads), keeps 400 tyre marks instead of 1200, no
  tyre smoke and no lamp reflections; on a phone that starts on Low there is no MSAA either. *Auto* (the default) starts on
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
- **Train mode:** the third setting on the Mode button (Play, Tutor, Train). A training game has nothing from the engine
  while you play: no verdict strip, no labels or colours in the move list, no eval bar, no αβ, no Hint, no Nudge; only
  Resign. The engine still plays at your saved strength, and the coach still rates every move silently so the review
  afterwards is complete. The strip just says *Training game. No engine during play. Afterwards: your post-mortem first,
  then the review.* Training games are always *clean* (no tutor, hints, nudges or take-backs), which is what the Train
  screen's metrics count; the history marks them *train*.
- **Post-mortem:** before any recorded game is analysed, old ones included, you answer four questions by tapping, with no
  engine in sight: where you first lost material (your moves on a strip, each shown on a small board, or *Nowhere*), what
  was threatened the move before, whether you ran the check (their checks, captures, threats), and a tag (hung piece,
  missed threat, bad trade, wrong plan, clock, endgame technique, none) with an optional one-line note. Save, and the
  analysis runs as before; *Later* puts it off and the game stays listed as *post-mortem due*. The review then opens with
  *Your call vs the engine*: where you said it went wrong against the engine's first two-pawn swing, in two sentences.
  Below Stage 3 the review is *narrow*: the eval graph, the best-move arrow and the cards stay, but the engine's lines are
  hidden in αβ and only the single worst moment is listed; the Train screen opens the full review from Stage 3.
- **The day, think time and the ledger:** the first game of each day asks what kind of day it is (off-day morning, shift
  day, after a shift, or skip), once a day per player, and the answer is stored on every game that day; after a shift it
  reminds you that a long game is allowed but is not training. Every move you make is timed (nothing is enforced); a think
  over three minutes gets a small clock in the review's move list and a plain line on the move, since a long think means
  you did not recognise the position. Alongside the last 20 full games, a compact ledger row per analysed game is kept
  forever (mode, day, result, accuracy, first blunder move, hung pieces, when you castled, longest and mean think, counts,
  pattern tags, your post-mortem and whether it hit the engine's move); games analysed before the ledger existed get rows
  on first load. The Train screen's exit criteria are measured from it.
- **Drills:** the Endgames screen starts set positions against the engine at full strength (2850), your side chosen,
  either side to move. A clock in the opponent's slot runs from the moment the engine is ready; there are no hints,
  nudges, ratings or opening names, just Resign. The coach card says the goal and target, the position's technique in a
  line or two and its one trap (*Trap: stalemate. Leave the king a square until your king arrives.*), three lines at most,
  and nothing else is said during the attempt. The drill ends at mate, stalemate, draw by rule or resignation, says how
  long it took against the target, and offers *Again* (same position) or *Back*. Under the result comes one honest line,
  found by the engine in the background (the sheet never waits; about four seconds at most on the lite engine): the first
  of your moves that cost two moves or more against the fastest mate or let the win go, the move that took the last
  square in a stalemate, or the move that lost the draw, with the engine's move named (*Move 1, Qc7: that took their
  king's last square, stalemate. Qa7# kept the win (mate in 1).*). Tap it and the board and the move list go to that
  move, yours drawn in red and the engine's in amber; *Back to the result* returns. With nothing wrong it says so and names
  your best time. The top-left back button during a drill returns to Endgames (and during a Learn practice game to the
  lesson), as *Back* does. Drills are never recorded: no history, patterns, accuracy, budget or ledger, and a drill you
  walk away from is not a try.
- **Long think, live:** in a training game, three minutes into one move the strip says so, once per move: *Three minutes
  on this move. A long think means you do not recognise the position: take the safest move you can see and bank the
  clock.* Nothing is enforced and it never appears in Play or Tutor; the next move brings the training line back.
- **Share:** the review's *Share* pill hands the game out as PGN: the usual tags plus *Site "Ghostlap Roma"*, you and
  *Engine 1200* by colour, the moves in SAN with your post-mortem as a comment on the move you named (threat, whether you
  ran the check, tag, your note) and the engine's verdict at the end (accuracy, counts, its first two-pawn swing); a
  Chess960 game carries its start position. On iPhone it opens the share sheet; otherwise it copies to the clipboard
  (*Copied*) or shows the text to select. This is how a game reaches a stronger player for the monthly review.
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
- **Board templates:** four, chosen per player from the swatches on the chess home, and followed by every board in the
  app (game, review, post-mortem, lesson, drill cards, Tactics, Endgames). Chess only; the racer keeps its look. Themes
  saved before the templates move over: Wood becomes Classic; Night, Modern and Mono become Stone.
  - *Stone* (the default): a pale, low-contrast board with the app's own abstract stone piece set (speckled white,
    graphite black), one bold cue per piece (cross-cut king, crowned queen, notched rook, slit bishop, bitten knight, bud
    pawn), a mint glow on the selected square and legal moves, and the piece's name shown under the board for a second
    when you pick it up.
  - *Classic*: the tournament look, buff and brown squares with the cburnett pieces, an amber ring on the selection and
    dark dots for the moves.
  - *Dark*: the Stone pieces on deep slate squares that sit in the app's dark UI; the graphite pieces get a pale rim so
    they never sink into a dark square, and the last move is ringed in amber (a fill would go brown on slate). Mint glow
    and the piece name as in Stone.
  - *Wire*: a drafting sheet. Paper squares ruled with hairlines, the dark ones hatched, and a line-art copy of the Stone
    pieces: White is a hollow ink outline, Black a solid ink silhouette with a paper hairline inside its edge (the printed
    diagram convention, so the sides read at a glance even on the small post-mortem board). Thin mint outlines instead
    of the glow, and the piece name as in Stone.
- **History:** your last 20 games and their reports are kept on the phone. Promotion is always to a queen.
- Credits: [Stockfish](https://stockfishchess.org) (GPL-3.0, `vendor/STOCKFISH-LICENSE.txt`) via
  [stockfish.js](https://github.com/nmrugg/stockfish.js); [chess.js](https://github.com/jhlywa/chess.js) (BSD-2-Clause); [three.js](https://threejs.org) r184 for the chase camera (MIT, `vendor/three/LICENSE`); piece set by Colin M.L. Burnett (GPLv2+, from lichess,
  `vendor/pieces/`, the Classic board); the Stone pieces in `vendor/pieces-stone/` are original drawings for this app, and the Wire pieces in
  `vendor/pieces-stone-wire/` are line-art derivatives of them (`node tools/build-wire-pieces.mjs`); opening names from [lichess-org/chess-openings](https://github.com/lichess-org/chess-openings) (CC0).

## Train

The fourth card on the launcher, and the point of the chess half of the app: the learning plan from the research
(`docs/chess/chess-learning-plan.md`), kept honest by your own games. It is staged (S0 to S4), gated by exit criteria
measured in your own games rather than by a rating, and every pearl carries its evidence grade. It is built for an adult
beginner on 12-hour shifts, so the first thing it asks each day is what kind of day it is: off-day morning, shift day, or
after a shift. The answer is shared with the chess screen (asked once a day, per player, between the two). Off-day mornings
get the long game and new material; shift days get easy tactics and a drill; after a shift the long game and the lesson are
greyed out with the reason and the evidence behind it, because new patterns do not stick on no sleep. A long game then is
still allowed from the Chess card, but the plan does not count it as training. Nothing is sent anywhere, and the engine
strength is never called your rating.

- **Today** lists this stage's blocks for that kind of day, each with one button: *Long game* starts a training game
  (Train mode: no verdicts, no eval bar, no hints, your post-mortem before the engine), *Tactics* opens a slow, mixed
  puzzle session in the stage's easy band for the block's minutes, *Endgames* opens the stage's drills, *Resources* takes
  you to the reading list. Small dots count the block against its weekly frequency: a training game counts when it is
  recorded, a tactics session when it finishes, an endgame block when a drill was actually played; lessons and anything
  the app cannot see get a plain *Done* tick. When games are waiting for their post-mortem the card says so ("3 games owe
  a post-mortem") with a button that opens the oldest.
- **This week** shows the week number since you first opened the plan, the week's micro-step (Stage 0 has eight; if the
  stage is not met by week 8 its last four come round again), and the pearl of the week with its action and its evidence
  grade in a badge. Tap any grade for the legend: A is a replicated experiment, B a large chess dataset, C the consensus
  of strong coaches, D an anecdote. The ten standing orders sit folded underneath, graded the same way.
- **Stage** is the card that decides when you move on. It names the stage and its mechanism, folds away the giants to copy
  and to ignore, and lists the exit criteria with a mark each: met, unmet, or unknown when there is not enough data yet
  (ten clean games are needed before a ten-game criterion says anything). Next to every criterion is your actual value and
  the target, read from the ledger of your analysed games, the tactics log and the endgame drills. A few criteria cannot
  be measured by an app (the safety check being habitual, a stronger player reviewing your games monthly) and are toggles
  on your word, with a note saying so. When every criterion is met, *Advance to Stage 1* appears. Otherwise there is a
  smaller *Advance anyway* that asks first and records the override, and the card says it was entered by override. From
  Stage 3 the review shows the engine's lines; before that it stays narrow (where material went, where the eval swung).
- **Metrics** is the curriculum's table: median move of your first two-pawn blunder, pieces hung per game, your most
  frequent error tag, longest single think, castled by move 10, slow puzzle accuracy, endgames mastered, games with a
  post-mortem, each against the stage's target, plus the first-blunder figure split by kind of day. Only clean games
  count towards the game numbers (no hints, nudges or take-backs, not Tutor) and the card says how many that is; the
  post-mortem figure counts every game. The research's realistic outcome is printed under the table, and progress is
  judged by these numbers, never by a number next to your name.
- **Monthly diagnostic:** This week carries the standing order's Chess960 game. *Play it* starts a training game from a
  random back rank (bishops on opposite colours, king between the rooks, Black mirrored) with castling switched off, so it
  tests whether your development habits survive a strange start. The game is recorded like any training game, marked
  *960* in the history, has no opening name, and is kept out of the castled-by-move-10 figure (it counts for everything
  else); the line reads *Done this month* with the date once one is played, per calendar month.
- **Hours slept:** once the kind of day is answered the day card offers *Slept*: under 6, 6, 7 or 8+, optional and unset
  by default. The answer is stored with the day, stamped on every game that day and its ledger row, and the Metrics card
  adds a by-sleep line (median first blunder and hung pieces for under 6, 6 to 7, 8 or more) as soon as a game has one:
  the curriculum's "study slot context" without a form to fill.
- **Resources** is the stage's reading and watching list with a tick per item and a link out when the phone is online,
  and the pitfalls ("the differential of common failures") folded beneath.

Everything is per player and lives on the phone under `ghostlap-train-v1` (stage, start date, the day answers, the weekly
ticks, the self-attested toggles, the resource ticks and every advance). The Learn screen labels its opening drills
*Stage 3 material* until you get there; they still work. `node tools/plan-e2e.js` drives the screen in headless Chromium
at iPhone width, including one real training game against the engine. The pieces underneath:


- **Curriculum** (`curriculum.js`): the staged plan from `docs/chess/chess-curriculum.json`, copied word for word. That is
  stages S0 to S4 with their exit criteria, weekly blocks and micro-steps, 52 pearls each with its source and evidence
  grade (A to D), the metrics table, the standing orders and the pitfalls. It also holds the arithmetic that turns your own
  games into verdicts. Only clean games count: no hints, nudges or take-backs, not Tutor. Over the last ten of them (twenty
  from Stage 1) it takes the median move of your first two-pawn blunder (a game without one counts as move 60), pieces hung
  per game, how often you castled by move 10, and long thinks over three minutes. Over every game it takes how often you
  wrote the post-mortem and how often you found your own mistake. It adds your best mate times and endgames won from the
  drills, puzzle accuracy, and the habits you vouch for yourself. Each exit criterion then reads met, not yet, or unknown,
  with a plain sentence such as *Median move of first two-pawn blunder: 17 (target over 20, last 10 clean games)*. Missing
  data is unknown, never a fail, and too few games is no verdict yet. It also picks the blocks that fit the day (after a
  shift, easy repetition only), the week's micro-step and pearl, and counts weeks in calendar days so a clock change never
  moves them. No DOM, no storage, no engine: `node tools/curriculum-test.js` checks the maths on synthetic games and fails
  if the data drifts from the JSON or an exit criterion names a metric nothing measures.
- **Tactics** (`puzzles.js`): slow puzzles, mixed themes, and the whole line. About 3,500 puzzles from the lichess puzzle
  database (CC0) ship with the app in `puzzles-data.js`. They are rated 500 to 1400, well rated and much played, two to six
  moves each, in four bands, with no single theme above a fifth of a band. `node tools/build-puzzles.mjs
  <lichess_db_puzzle.csv.zst>` rebuilds the file from the download and gives the same set every time. The board turns so
  your side is at the bottom. Their move plays first, highlighted: *They played Nf3. Your move. Play the whole line.* A pill
  under the board (*‹ Before Nf3*) flips to the position before their move and back, as often as you like, without
  counting as a hint or touching the score; a tap on the board while looking at it flips back first. Tap a
  piece, then its square. A right move is confirmed quietly and their reply follows. A wrong move, or *I don't see it*,
  loses the puzzle and draws the right move as an arrow, but you still play out the rest of the line so you see the whole
  pattern. There are no hints, and the themes and rating only show once the line is over. Before the set puzzles come your
  own mistakes: every move in an analysed game that cost a pawn and a half or more becomes a card (*From your game on Oct 3,
  move 14. You played Nxe5 there.*), with one move to find. Cards live in Leitner boxes like Learn's position cards: box 1
  every session, box 2 every other, box 3 every fourth. The end of a session shows how many you got right, the mean time,
  and a plain line: under 85% says *Slow down. Accuracy before speed.*, and a mean under 15 seconds says *That was fast.
  The research says slow, written, whole line. Speed is not the goal here.* Progress is stored per player under
  `ghostlap-puzzles-v1`. `node tools/puzzles-test.js` replays every puzzle through chess.js and checks the bands and the
  theme cap.
- **Endgames** (`endgames.js`): thirty-two set positions you play out against the engine at full strength, with a clock
  running and no help. Stage 0 is the floor of the plan: three queen mates and three rook mates, each with a 30-second
  target, three king-and-pawn wins that need the opposition, plus one where you hold the draw with the lone king, because
  the opposition cuts both ways. Stage 1 is two rook endings two pawns up. Stage 2 is "the twenty": Lucena, Philidor, the
  rule of the square, outside and protected passed pawns, the pawn breakthrough, the rook-pawn corner, Réti, queen against
  a pawn on the seventh (a centre pawn wins; a bishop or rook pawn draws), perpetual check, bishop and pawn, knight and
  pawn, the two-bishops mate, rook against bishop and against knight, opposite-coloured bishops, and rook against pawn
  both ways. Each card says whether the goal is to win or to draw, which side you play, and the technique in one line, with
  a Board button to look first. Play hands the position to the coach. A win is played to mate; a draw is held until the
  game is drawn. Every finished run is recorded per player under `ghostlap-endgames-v1`: best time, tries, wins. A position
  is mastered when the goal is met twice, under the target where there is one. The plan reads the mate times, the K+P and
  rook-ending results, and the count of the twenty mastered. `node tools/endgames-test.js` checks every position with
  Stockfish at depth 20 and fails if it disagrees: a win must be a mate or at least +5 for your side, the K+Q and K+R mates
  must show a forced mate, and a draw must be within half a pawn.
- **Research** (`docs/chess/`): the report the plan was written from (*Elite chess evolution and lessons*), the learning plan
  as a problem-based assessment and plan, and the curriculum JSON the app reads. No chess training method has a randomised
  trial behind it; the grades say which claims are load-bearing.

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
- `coach.js`: chess board, live rating strip, nudge, tutor, end sheet, review screen and feedback cards, patterns and escalation, level check, game history, Train mode, the day sheet, the post-mortem gate, the ledger, drills and the coach events
- `lessons.js`, `learn.js`: opening lessons, the Learn screen and its drills
- `curriculum.js`: the chess curriculum (stages, pearls, metrics) and the exit-criteria maths over the coach's ledger (runs under node too: `node tools/curriculum-test.js`)
- `plan.js`: the Train screen
- `puzzles.js`, `puzzles-data.js`: the Tactics screen and its lichess puzzle set (`tools/build-puzzles.mjs`, `node tools/puzzles-test.js`)
- `endgames.js`: the Endgames catalogue and drill screen (`node tools/endgames-test.js`)
- `openings.js`: ECO opening table (generated from the lichess TSVs, lines up to 14 plies)
- `vendor/`: chess.js, the Stockfish lite WASM engine, the piece SVGs (`pieces/` cburnett for Classic, `pieces-stone/` for Stone and Dark,
  `pieces-stone-wire/` for Wire, generated from the Stone set by `tools/build-wire-pieces.mjs`), and three.js (`vendor/three/`, the ES module build, loaded by `chase.js`)
- `core.js`: tracks, car physics, lap timing, ghost recording (no DOM, so it runs under node)
- `game.js`: rendering, input, menus, sound, saving, offline status
- `chase.js`: the Chase camera, a three.js renderer for the same world (a module; `window.Chase`: `init`, `build`, `render`, `snap`, `toScreen`, `resize`, `setQuality`, `rebuild`, `dispose`, `info`, and for the two 3D cameras `setView`, `view`, `yaw`, `carRect`, and `garage` for the garage turntable)
- `chase-cars.js`: the cars in 3D (bodies from a side profile per style, rolling and steering wheels, body roll and pitch, lights), imported by `chase.js`
- `rome.js`: generated map and routes (`tools/build-rome.mjs`)
- `sw.js`: offline cache. Bump `CACHE` when you change any file (the engine wasm is about 1.8 MB, cached once).
- `docs/chess/`: the research report, the learning plan and the curriculum JSON behind Train
- `docs/drive/3d-conversion.md`: how the race became 3D: what stays 2D, what changed, the draw-call budget per quality level
- `tools/`: OSM fetch and build scripts, synthetic test map, headless tests (`tools/e2e.js`, `tools/chess-e2e.js`, `tools/themes-e2e.js` (the four board templates on every board, with screenshots), `tools/puzzles-e2e.js`, `tools/endgames-e2e.js`, `tools/plan-e2e.js`)
- `package.json`, `capacitor.config.json`, `ios/`, `tools/build-www.mjs`: the native iOS wrapper (see TESTFLIGHT.md)

