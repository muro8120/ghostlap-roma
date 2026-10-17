// Ghostlap Roma: the chess curriculum. The staged plan (S0..S4), pearls with evidence grades, metrics and pitfalls from
// docs/chess/chess-curriculum.json, and the pure maths that turns ledger rows into exit-criteria verdicts.
// No DOM, no storage, no engine: window.CURRICULUM (the data) and window.Curriculum (the functions) in the browser,
// module.exports = { data, ...functions } under node, so `node tools/curriculum-test.js` can check every number.
(function (root) {
  'use strict';

  // ---------- the data ----------------------------------------------------------
  // A verbatim copy of docs/chess/chess-curriculum.json (JSON is a JS literal). Change the JSON, then paste it here:
  // tools/curriculum-test.js fails if the two ever differ, so the plan on screen is always the plan in the docs.
  const data = {
    "meta": {
      "title": "Chess learning curriculum — staged plan, pearls, metrics",
      "version": "0.1.0",
      "generated": "2026-10-17",
      "source_report": "Elite chess evolution and lessons.md",
      "evidence_grades": {
        "A": "Replicated controlled experiment (often cognitive science / motor learning, extrapolated to chess)",
        "B": "Large observational chess dataset, no randomisation",
        "C": "Consensus of named strong coaches/players",
        "D": "Single anecdote, self-report, or historical stereotype"
      },
      "notes": [
        "No chess training method has a randomised controlled trial behind it; grade all content accordingly.",
        "Stage progression is gated by exit_criteria measured in the learner's own reviewed games, not by rating alone."
      ]
    },

    "learner_profile_defaults": {
      "level": "beginner",
      "weekly_hours": [5, 7],
      "schedule_constraints": {
        "shift_days": "12h day shifts; evenings are low-yield for new-pattern encoding",
        "off_day_mornings": "highest-yield slot for long games and new material",
        "rule": "No new material or long games after a shift; easy repetition only"
      },
      "realistic_outcome": "1600–1800 in 2–3 years at 5–7 hr/week is a good outcome; 2000 is an outlier for adult starters."
    },

    "standing_orders": [
      {"id": "SO1", "text": "Every game gets a written post-mortem or it didn't count. Narrative first, then engine.", "grade": "B/A"},
      {"id": "SO2", "text": "Engine's job is narrow: which move lost material / where eval swung ≥1.5. No deeper lines until Stage 3.", "grade": "C"},
      {"id": "SO3", "text": "Time control slow enough to run your checklist: 15+10 minimum through Stage 2. Blitz is not training until Stage 3. Bullet is never training.", "grade": "C"},
      {"id": "SO4", "text": "Fix the recurring error until it stops recurring. One error type per week.", "grade": "A"},
      {"id": "SO5", "text": "Puzzles: mixed themes, slow, written full line, missing line = wrong.", "grade": "A/C"},
      {"id": "SO6", "text": "Openings = ideas to move 8–10. No memorised lines until Stage 3.", "grade": "C", "contested": true},
      {"id": "SO7", "text": "No new material after a shift. Shift evenings: 15 min easy tactics or a rewatched lesson.", "grade": "A/B"},
      {"id": "SO8", "text": "Never ask a chat LLM to read a position directly; ask it to explain engine output.", "grade": "C"},
      {"id": "SO9", "text": "Chess960 once a month as a diagnostic of internalised principles, not as a training diet.", "grade": "C", "note": "Claimed beginner benefit is unevidenced"},
      {"id": "SO10", "text": "Don't copy a GM's childhood. Use elite methods only at the stage tagged for them.", "grade": "C"}
    ],

    "stages": [
      {
        "id": "S0",
        "name": "Floor: move safety",
        "rating_band_online": [0, 800],
        "duration_hint_weeks": 8,
        "giants_to_copy": [
          {"name": "Morphy", "lesson": "Develop every piece, castle, open a central file before attacking; count tempi in open positions"},
          {"name": "Steinitz", "lesson": "Don't attack without a reason; keep the position closed if behind in development"},
          {"name": "Capablanca", "lesson": "When ahead, trade pieces and play the endgame"},
          {"name": "Botvinnik (method only)", "lesson": "Annotate every loss: find the move that hung material"}
        ],
        "giants_to_ignore": ["Tal", "AlphaZero themes", "Carlsen's grind", "Karpov's restriction", "Opening theory beyond principles", "Eval-bar watching"],
        "mechanism": "Games are decided by one-move material losses; opponents leave kings central and pieces undefended. You cannot yet verify compensation.",
        "entry_criteria": ["Knows the rules"],
        "exit_criteria": [
          {"metric": "hung_pieces_per_game", "op": "<=", "value": 1, "window_games": 10},
          {"metric": "first_blunder_move_median", "op": ">", "value": 20, "window_games": 10},
          {"metric": "safety_check_seconds", "op": "<", "value": 20},
          {"metric": "mate_KQ_seconds", "op": "<", "value": 30},
          {"metric": "mate_KR_seconds", "op": "<", "value": 30},
          {"metric": "KP_vs_K_win", "op": "==", "value": true},
          {"metric": "castled_by_move_10_pct", "op": ">=", "value": 90}
        ],
        "weekly_blocks": [
          {"id": "S0-B1", "name": "Long game + review", "when": "off_day_morning", "frequency_per_week": 2, "duration_min": 85, "time_control": "15+10", "content": "Play; write narrative (first material loss / what was threatened the move before / did I run the check); engine Game Review for that one question only"},
          {"id": "S0-B2", "name": "Lesson", "when": "off_day", "frequency_per_week": 1, "duration_min": 40, "content": "Bartholomew Chess Fundamentals; Chessbrah Building Habits rules"},
          {"id": "S0-B3", "name": "Easy tactics", "when": "shift_day", "frequency_per_week": 4, "duration_min": 15, "content": "Easy, mixed themes, slow, full line stated before moving"},
          {"id": "S0-B4", "name": "Endgame drill", "when": "any", "frequency_per_week": 1, "duration_min": 15, "content": "K+Q and K+R mates; K+P vs K opposition; vs engine until automatic"}
        ],
        "micro_steps": [
          {"week": 1, "task": "Set up account. Play 3 games at 15+10. After each, write 3 lines: first material loss / what was threatened the move before / did I check. Nothing else."},
          {"week": 2, "task": "Add the per-move mantra: his checks, captures, threats after my move. Time it. Target habitual by week 4."},
          {"week": 3, "task": "Add 'count before you capture': attackers vs defenders; what remains after the full sequence."},
          {"week": 4, "task": "K+Q and K+R mate drills to <30 s. First Chess960 game as a test of development principles."},
          {"week": 5, "task": "K+P vs K (opposition). Begin tagging each review with one error type."},
          {"week": 6, "task": "Pick most frequent error tag; it is the week's only study target."},
          {"week": 7, "task": "Introduce 'when ahead, trade pieces'. Review for compliance."},
          {"week": 8, "task": "Audit against exit criteria. If unmet, repeat weeks 5–8. Do not advance."}
        ],
        "resources": ["Bartholomew — Chess Fundamentals (YouTube)", "Chessbrah — Building Habits", "Heisman — A Guide to Chess Improvement", "Lichess or chess.com (Game Review)"]
      },
      {
        "id": "S1",
        "name": "Principles under pressure",
        "rating_band_online": [800, 1000],
        "giants_to_copy": [
          {"name": "Morphy / Steinitz", "lesson": "Continued"},
          {"name": "Lasker", "lesson": "In equal positions, pick the move that gives the opponent the most ways to go wrong"},
          {"name": "Capablanca", "lesson": "Every opening move serves a middlegame plan"}
        ],
        "giants_to_ignore": ["All dynamic/sacrificial play", "Nakamura's 1.b3 and anti-prep sidelines", "Opening theory"],
        "mechanism": "Safety habit exists; now make it hold under clock pressure and add a one-sentence plan per opening.",
        "entry_criteria": ["S0 exit"],
        "exit_criteria": [
          {"metric": "first_blunder_move_median", "op": ">", "value": 25, "window_games": 20},
          {"metric": "opening_plan_statable", "op": "==", "value": true, "note": "One opening per colour, plan to move 8–10 in one sentence"},
          {"metric": "rook_endgame_two_pawns_up_convert", "op": "==", "value": true},
          {"metric": "slow_puzzle_accuracy_pct", "op": ">=", "value": 85}
        ],
        "weekly_blocks": [
          {"id": "S1-B1", "name": "Long game + review", "when": "off_day_morning", "frequency_per_week": 2, "duration_min": 90, "time_control": "15+10 or 30+0", "content": "As S0; add 'what does he want next?' as third question"},
          {"id": "S1-B2", "name": "Lesson", "when": "off_day", "frequency_per_week": 1, "duration_min": 40, "content": "Naroditsky speedruns at your band; Heisman real-chess thought process"},
          {"id": "S1-B3", "name": "Easy tactics", "when": "shift_day", "frequency_per_week": 4, "duration_min": 15, "content": "Mixed, slow, written"},
          {"id": "S1-B4", "name": "Endgame drill", "when": "any", "frequency_per_week": 1, "duration_min": 15, "content": "Rook + pawns technique basics"}
        ],
        "micro_steps": [
          {"task": "Choose 1.e4 or 1.d4 and one reply to each as Black; learn the plan, not the line; stop deliberating."},
          {"task": "Start a one-page recurring-errors sheet; retire an entry only after 10 clean games."},
          {"task": "Monthly Chess960 diagnostic game."}
        ],
        "resources": ["Naroditsky speedruns", "Heisman — A Guide to Chess Improvement"]
      },
      {
        "id": "S2",
        "name": "Club: structure, endgames, honest annotation",
        "rating_band_online": [1000, 1600],
        "giants_to_copy": [
          {"name": "Capablanca", "lesson": "Planning from the opening; endgame technique; Chernev's move-by-move games"},
          {"name": "Tarrasch", "lesson": "Mobility rules as defaults: rooks behind passed pawns, don't block your own bishops"},
          {"name": "Botvinnik", "lesson": "Narrow repertoire studied as typical positions; annotations exposed to someone stronger"},
          {"name": "Steinitz", "lesson": "Weak pawns matter more as pieces come off; count pawn islands before trading"},
          {"name": "Lasker", "lesson": "Practical choice in equal positions"}
        ],
        "giants_to_ignore": ["Memorised lines past move 10", "Watson's rule independence", "Petrosian's exchange sacrifices", "Carlsen's provocative openings", "Freestyle as main diet"],
        "mechanism": "Opponents leave theory by move 8; middlegame plan and endings decide. Rules are training wheels until pattern recognition replaces them.",
        "entry_criteria": ["S1 exit"],
        "exit_criteria": [
          {"metric": "first_blunder_move_median", "op": ">", "value": 30, "window_games": 20},
          {"metric": "endgames_mastered_count", "op": ">=", "value": 20},
          {"metric": "annotated_long_games_pct", "op": "==", "value": 100},
          {"metric": "monthly_stronger_player_review", "op": "==", "value": true},
          {"metric": "slow_puzzle_accuracy_pct_easy", "op": ">=", "value": 90}
        ],
        "weekly_blocks": [
          {"id": "S2-B1", "name": "Long games", "when": "off_day_morning", "frequency_per_week": 2, "duration_min": 120, "time_control": "30+15 → 45+15", "content": "Kraai method: narrative first, test against moves on a board, engine last"},
          {"id": "S2-B2", "name": "Easy tactics, mass repetition", "when": "shift_day", "frequency_per_week": 5, "duration_min": 18, "content": "Aagaard: basic simple tactics, every line written, missing answer = wrong; mixed themes"},
          {"id": "S2-B3", "name": "Study block", "when": "off_day", "frequency_per_week": 1, "duration_min": 55, "content": "Rotate: Silman endgame band / Chernev Logical Chess / one annotated Capablanca game"},
          {"id": "S2-B4", "name": "Opening repair", "when": "as_needed", "frequency_per_week": 0, "duration_min": 20, "content": "Only for review-identified recurring problems; explorer: where does my line end, what's the middlegame?"}
        ],
        "micro_steps": [
          {"task": "Build the ~20-endgame list (Soltis/Heisman via Silman); drill one per week vs engine."},
          {"task": "Set a standing monthly review with a stronger player (club, Dojo cohort, or paid hour)."},
          {"task": "Apply 'what if I play the second move first?' to every candidate sequence."}
        ],
        "resources": ["Chernev — Logical Chess: Move by Move", "Silman — Complete Endgame Course (to your band only)", "ChessDojo program", "Kraai — How to analyze your own games"]
      },
      {
        "id": "S3",
        "name": "Strong club: calculation discipline and positional vocabulary",
        "rating_band_online": [1600, 2000],
        "giants_to_copy": [
          {"name": "Nimzowitsch / Petrosian", "lesson": "Prophylaxis as habit; blockade with knights; positional exchange sac when files are closed"},
          {"name": "Alekhine", "lesson": "Steer into positions with live options while keeping structure sound"},
          {"name": "Karpov", "lesson": "Remove counterplay first, then press"},
          {"name": "Fischer", "lesson": "Bishop-vs-knight judgment"},
          {"name": "Carlsen (mindset)", "lesson": "Mistakes are a consequence of tension; play on in equal positions; test 'theoretical draws'"},
          {"name": "Kotov", "lesson": "Candidate moves written out"}
        ],
        "giants_to_ignore": ["Tal", "AlphaZero h-pawn marches / early pawn sacs as defaults", "Nakamura's complication-avoidance as policy", "Carlsen's opening variety", "Thinking like an engine"],
        "mechanism": "Static compensation is now evaluable; dynamic long-term compensation still exceeds calculation. Written lines expose visualisation failures.",
        "entry_criteria": ["S2 exit"],
        "exit_criteria": [
          {"metric": "aagaard_three_questions_in_annotations", "op": "==", "value": true},
          {"metric": "candidate_moves_written", "op": "==", "value": true},
          {"metric": "static_imbalance_explained", "op": "==", "value": true},
          {"metric": "two_step_engine_rule_habitual", "op": "==", "value": true}
        ],
        "weekly_blocks": [
          {"id": "S3-B1", "name": "Long games", "when": "off_day_morning", "frequency_per_week": 2, "duration_min": 150, "time_control": "45+15 or OTB classical", "content": "Full written annotation"},
          {"id": "S3-B2", "name": "Medium/hard puzzles", "when": "any", "frequency_per_week": 3, "duration_min": 30, "content": "Written solutions; mixed"},
          {"id": "S3-B3", "name": "Positional study", "when": "off_day", "frequency_per_week": 1, "duration_min": 60, "content": "Silman Reassess Your Chess; Nimzowitsch My System Part 2+"},
          {"id": "S3-B4", "name": "Prophylaxis exercise", "when": "any", "frequency_per_week": 1, "duration_min": 20, "content": "Dvoretsky-style: find the opponent's best move, then prevent it"},
          {"id": "S3-B5", "name": "Serious blitz (optional)", "when": "any", "frequency_per_week": 1, "duration_min": 40, "content": "Reviewed; ≤20–30% of chess time"}
        ],
        "micro_steps": [
          {"task": "Adopt Aagaard's three questions on every critical position; show evidence in annotations."},
          {"task": "Force a written second candidate before committing (Einstellung countermeasure)."},
          {"task": "Optional Woodpecker cycle as commitment device; mechanism unproven."}
        ],
        "resources": ["Silman — How to Reassess Your Chess", "Nimzowitsch — My System", "Kotov", "Rowson — Seven Deadly Chess Sins", "de la Villa — 100 Endgames (1800+)"]
      },
      {
        "id": "S4",
        "name": "Expert+",
        "rating_band_online": [2000, null],
        "giants_to_copy": [
          {"name": "Dvoretsky", "lesson": "Set positions played both colours vs a stronger player; written solutions to hard studies; exhaustive own-game analysis"},
          {"name": "Kasparov", "lesson": "Record novelties; engine-check afterwards for sobering"},
          {"name": "AlphaZero (with understanding)", "lesson": "King mobility; rook-pawn pushes vs castled king only with stable centre; redeploy before being kicked"},
          {"name": "Sindarov 2026", "lesson": "Recognise more, calculate less; win on the clock"}
        ],
        "giants_to_ignore": [],
        "mechanism": "Ceiling work pays only now; coach-driven plan expected.",
        "entry_criteria": ["S3 exit"],
        "exit_criteria": [],
        "weekly_blocks": [],
        "micro_steps": [{"task": "Get a coach; make the plan yours."}],
        "resources": ["Aagaard — Grandmaster Preparation series", "Dvoretsky", "Sadler & Regan — Game Changer"]
      }
    ],

    "pearls": [
      {"id": "P01", "stage": ["S0","S1"], "theme": "safety", "text": "Hope chess is a hung piece with a story attached.", "mechanism": "Moving without checking the opponent's forcing replies.", "action": "After choosing a move: his checks, captures, threats — before releasing it.", "source": "Heisman", "grade": "C"},
      {"id": "P02", "stage": ["S0","S1"], "theme": "safety", "text": "Count before you capture.", "mechanism": "Material outcome depends on the whole exchange sequence, not the first capture.", "action": "Attackers vs defenders on the square; what remains after the sequence.", "source": "Coaching consensus", "grade": "C"},
      {"id": "P03", "stage": ["S0","S1","S2"], "theme": "metric", "text": "Your first blunder is the game.", "mechanism": "Under-1400: first ≥2-pawn blunder before move 17; over-1900: ~move 40.", "action": "Track move-of-first-blunder as your primary metric.", "source": "Sigman et al. 2010", "grade": "B"},
      {"id": "P04", "stage": ["S0","S1"], "theme": "safety", "text": "Undefended pieces are pending results — check them every move.", "mechanism": "Loose pieces are the most common target at low levels.", "action": "Scan both sides for undefended pieces each move.", "source": "Bartholomew", "grade": "C"},
      {"id": "P05", "stage": ["S0","S1"], "theme": "opening", "text": "An uncastled king is the chief complaint. Nothing elective until it's addressed.", "mechanism": "Central king + open lines = Morphy's attacking preconditions.", "action": "Castle by move 10 unless there is a concrete reason not to.", "source": "Coaching consensus", "grade": "C"},
      {"id": "P06", "stage": ["S0","S1"], "theme": "opening", "text": "Develop everything, then attack. Morphy didn't sacrifice until every piece was in.", "mechanism": "Attacks fail without superior force at the point of contact.", "action": "No attack until all minor pieces are developed and the king is safe.", "source": "Morphy / Kasparov", "grade": "C"},
      {"id": "P07", "stage": ["S0","S1","S2"], "theme": "strategy", "text": "Don't attack without a reason. If you can't name his error, you haven't earned the attack.", "mechanism": "Against correct defence an attack fails and the attacker ends up worse.", "action": "Name the concrete advantage before committing to an attack.", "source": "Steinitz via Hooper", "grade": "C"},
      {"id": "P08", "stage": ["S0","S1","S2"], "theme": "material", "text": "A pawn down with 'activity' is a pawn down.", "mechanism": "You cannot yet verify compensation.", "action": "Decline speculative sacrifices until Stage 3.", "source": "Coaching consensus", "grade": "C"},
      {"id": "P09", "stage": ["S0","S1","S2"], "theme": "technique", "text": "Ahead? Trade pieces, not pawns. Behind? Keep pieces on.", "mechanism": "Simplification converts material; complexity creates swindle chances.", "action": "Check material balance before every trade offer.", "source": "Capablanca", "grade": "C"},
      {"id": "P10", "stage": ["S0","S1","S2","S3"], "theme": "clock", "text": "A long think is a symptom of non-recognition, and it predicts a blunder.", "mechanism": "Longer think time correlates positively with blundering; it signals the position isn't in your library.", "action": "Staring >3 min → take the safest move and bank the clock.", "source": "Anderson & Kleinberg", "grade": "B"},
      {"id": "P11", "stage": ["S0","S1","S2"], "theme": "format", "text": "Slow enough to run the checklist, or the time control is the diagnosis.", "mechanism": "Safety habits need time to execute until automatic.", "action": "15+10 minimum through Stage 2.", "source": "Coaching consensus", "grade": "C"},
      {"id": "P12", "stage": ["S0","S1","S2"], "theme": "format", "text": "Blitz is a stress test, not a treatment. Bullet is television.", "mechanism": "Blitz reveals weaknesses but a beginner has no blunder-check reflex to lean on.", "action": "No blitz as training until Stage 3; bullet never.", "source": "Dojo / Heisman / Kraai (contested by Dlugy, Polgár, Naroditsky for stronger players)", "grade": "C"},
      {"id": "P13", "stage": ["S0","S1","S2","S3","S4"], "theme": "training", "text": "Review beats play ~5:1 per hour. A game without a post-mortem is a game you paid for and didn't get.", "mechanism": "Game review 4.41 vs games 0.86 rating pts/hr (observational, n=44k).", "action": "100% of long games reviewed.", "source": "Southwick et al. 2026", "grade": "B"},
      {"id": "P14", "stage": ["S0","S1","S2","S3","S4"], "theme": "training", "text": "Write the narrative before the engine.", "mechanism": "Error-location quality, not repetition count, predicts next-day performance.", "action": "Narrative → test against moves → engine last.", "source": "Kraai; Duke et al.", "grade": "C/A"},
      {"id": "P15", "stage": ["S0","S1"], "theme": "tools", "text": "At this level the engine answers one question: which move lost material. Close it after that.", "mechanism": "Deeper lines are noise until you can evaluate them.", "action": "Game Review for the blunder only.", "source": "Coaching consensus", "grade": "C"},
      {"id": "P16", "stage": ["S0","S1","S2","S3","S4"], "theme": "tools", "text": "Don't ask a chatbot to read a board. Ask it to explain what Stockfish said.", "mechanism": "LLMs hallucinate pieces and checks on direct PGN; work as translators over engine output.", "action": "LLM only downstream of engine/Maia output.", "source": "Independent builder report (Lichess blog)", "grade": "C"},
      {"id": "P17", "stage": ["S0","S1","S2","S3","S4"], "theme": "physiology", "text": "No new patterns after a 12-hour shift.", "mechanism": "One night of sleep deprivation cuts new-memory encoding ~40%.", "action": "Shift evenings = easy repetition only.", "source": "Walker 2008 (extrapolated)", "grade": "A"},
      {"id": "P18", "stage": ["S0","S1","S2","S3","S4"], "theme": "physiology", "text": "Morning brain plays slower and better. Long games live in off-day mornings.", "mechanism": "Fast-chess decisions get faster and less accurate through the day across chronotypes.", "action": "Schedule long games in off-day mornings.", "source": "Leone et al.", "grade": "B"},
      {"id": "P19", "stage": ["S0","S1","S2"], "theme": "opening", "text": "Openings: ideas, not lines.", "mechanism": "Opponents leave theory by move 8; mistakes happen in middlegame/endgame.", "action": "One-sentence plan per opening; no memorised lines until Stage 3.", "source": "2000+ player survey; Kraai (Hammer dissents)", "grade": "C"},
      {"id": "P20", "stage": ["S1","S2","S3"], "theme": "metric", "text": "Plateau ≠ ceiling.", "mechanism": "Rating follows a power law in games played; asymptote ~750–1,000 rated games.", "action": "Judge by error metrics, not rating, until ~750 rated games.", "source": "Howard", "grade": "B"},
      {"id": "P21", "stage": ["S2","S3"], "theme": "training", "text": "Themed puzzle sets feel good and teach worse. Mix the themes.", "mechanism": "Blocked practice: faster in-session gains, worse retention, overconfidence.", "action": "Random/mixed puzzle sets.", "source": "Lee & Simon 2004 (motor learning, extrapolated)", "grade": "A"},
      {"id": "P22", "stage": ["S2"], "theme": "training", "text": "Easy tactics, mass repetition, every line written, a missing line counts as wrong.", "mechanism": "Floor skills need automaticity, not difficulty.", "action": "Daily 15–20 min easy tactics, written.", "source": "Aagaard via Vasquez", "grade": "C"},
      {"id": "P23", "stage": ["S2"], "theme": "endgame", "text": "About 20 endgames carry you to 2000. Learn them cold and stop.", "mechanism": "Under-2000 games rarely need more; time is better spent elsewhere.", "action": "Build and drill the 20-endgame list; stop there.", "source": "Soltis via Heisman", "grade": "C"},
      {"id": "P24", "stage": ["S2","S3"], "theme": "calculation", "text": "What if I play the second move first?", "mechanism": "Move-order errors are the commonest calculation failure.", "action": "Move-order check on every sequence.", "source": "Naroditsky", "grade": "C"},
      {"id": "P25", "stage": ["S1","S2","S3"], "theme": "strategy", "text": "In equal positions, choose the move that gives him the most ways to go wrong.", "mechanism": "Nettlesomeness: inducing opponent errors even without the engine's first choice.", "action": "Prefer problem-posing moves over 'correct but easy' ones.", "source": "Lasker; Regan on Carlsen", "grade": "C/B"},
      {"id": "P26", "stage": ["S2","S3"], "theme": "structure", "text": "Weak pawns get weaker as pieces come off. Count pawn islands before you trade.", "mechanism": "Isolated/backward/doubled pawns become permanent endgame liabilities.", "action": "Structure check before every trade.", "source": "Steinitz", "grade": "C"},
      {"id": "P27", "stage": ["S2"], "theme": "strategy", "text": "Rooks behind passed pawns; don't block your own bishops. Rules are training wheels — ride them until they fall off on their own.", "mechanism": "Rules substitute for pattern recognition until it develops.", "action": "Apply Tarrasch defaults; note exceptions in review.", "source": "Tarrasch; Watson (on when to drop them)", "grade": "C"},
      {"id": "P28", "stage": ["S2","S3"], "theme": "opening", "text": "Where your opening course ends is where your study begins.", "mechanism": "The resulting middlegame, not the line, decides games.", "action": "Study typical middlegames of your repertoire.", "source": "Naroditsky", "grade": "C"},
      {"id": "P29", "stage": ["S2","S3"], "theme": "opening", "text": "Narrow repertoire, studied as typical positions, not as lines.", "mechanism": "Understanding structures you reach repeatedly beats one-time tricks.", "action": "3–4 openings per colour max.", "source": "Botvinnik", "grade": "C"},
      {"id": "P30", "stage": ["S0","S1","S2","S3","S4"], "theme": "training", "text": "Fix the error until it stops recurring. Don't collect errors; close them.", "mechanism": "Best practicers locate the exact error source and rehearse it until it stops.", "action": "One error type per week as study target.", "source": "Duke et al.", "grade": "A"},
      {"id": "P31", "stage": ["S2","S3","S4"], "theme": "training", "text": "Publish your annotations to someone stronger.", "mechanism": "External review finds mistakes self-review cannot.", "action": "Monthly review by a stronger player.", "source": "Botvinnik", "grade": "C"},
      {"id": "P32", "stage": ["S1","S2","S3"], "theme": "training", "text": "It's the study of the game, not the game.", "mechanism": "Tournament play added ΔR² = .006 over serious study.", "action": "Protect study time over play volume.", "source": "Burgoyne et al. 2019", "grade": "B"},
      {"id": "P33", "stage": ["S3","S4"], "theme": "strategy", "text": "Three questions: Where are the weaknesses? Which is my worst piece? What does he want?", "mechanism": "Attention scaffold for positional evaluation.", "action": "Run on every critical position.", "source": "Aagaard", "grade": "C"},
      {"id": "P34", "stage": ["S3","S4"], "theme": "strategy", "text": "Find his best move first; then make it impossible.", "mechanism": "Prophylaxis: deny the opponent's most useful plan before executing your own.", "action": "Weekly Dvoretsky-style exercise.", "source": "Nimzowitsch; Dvoretsky", "grade": "C"},
      {"id": "P35", "stage": ["S3","S4"], "theme": "strategy", "text": "Remove counterplay, then press.", "mechanism": "Opponent's need to do something generates the error.", "action": "Restriction before realisation.", "source": "Karpov", "grade": "C"},
      {"id": "P36", "stage": ["S3","S4"], "theme": "cognition", "text": "The familiar pattern captures your eyes while you believe you're searching.", "mechanism": "Einstellung: gaze stays on the familiar idea's squares despite intent to search.", "action": "Force a written second candidate before committing.", "source": "Bilalić, McLeod & Gobet", "grade": "A"},
      {"id": "P37", "stage": ["S3","S4"], "theme": "calculation", "text": "Write the lines. Visualisation fails silently; paper doesn't.", "mechanism": "Written lines expose where visualisation breaks.", "action": "Candidate moves written in long games.", "source": "Kotov", "grade": "C"},
      {"id": "P38", "stage": ["S3","S4"], "theme": "mindset", "text": "Mistakes are a consequence of tension. Keep the tension.", "mechanism": "Error rates rise with game length and complexity.", "action": "Play on in equal positions.", "source": "Carlsen", "grade": "C"},
      {"id": "P39", "stage": ["S3","S4"], "theme": "mindset", "text": "'Theoretical draw' is a claim. Test it.", "mechanism": "Human error rates in long technical positions are high.", "action": "Don't agree draws in playable positions.", "source": "Carlsen", "grade": "C"},
      {"id": "P40", "stage": ["S3","S4"], "theme": "material", "text": "A rook outranks a knight only when it has a file.", "mechanism": "Nominal vs real piece value depends on open lines and blockade squares.", "action": "Evaluate exchange sacs by file availability.", "source": "Petrosian", "grade": "C"},
      {"id": "P41", "stage": ["S3","S4"], "theme": "strategy", "text": "Steer toward positions whose difficulty you can handle.", "mechanism": "Position difficulty predicts blunders (73%) better than skill (55%) or time (53%).", "action": "Choose structures you know over objectively 'better' unknown ones.", "source": "Anderson & Kleinberg", "grade": "B"},
      {"id": "P42", "stage": ["S3","S4"], "theme": "tools", "text": "Borrow the engine's move orders and pawn-sac verdicts. Don't try to think like it.", "mechanism": "Engine 'ideas' beyond concrete verdicts don't transfer to human play.", "action": "Two-step rule: analyse without, then check.", "source": "Watson", "grade": "C"},
      {"id": "P43", "stage": ["S3"], "theme": "training", "text": "Woodpecker is a commitment device, not a mechanism.", "mechanism": "All evidence is self-reported; repetition risks memorising positions, not patterns.", "action": "Optional; don't expect the repetition itself to be the active ingredient.", "source": "Tikkanen/Smith; critiques", "grade": "C/D"},
      {"id": "P44", "stage": ["S4"], "theme": "tools", "text": "Predict, then check.", "mechanism": "Commitment before verification is the transferable solver-era study rule.", "action": "Commit to an evaluation before opening the engine.", "source": "Poker solver practice", "grade": "C"},
      {"id": "P45", "stage": ["S4"], "theme": "training", "text": "Play the set position with both colours against someone stronger.", "mechanism": "Forces understanding of both sides' plans.", "action": "Dvoretsky exercise.", "source": "Dvoretsky", "grade": "C"},
      {"id": "P46", "stage": ["S4"], "theme": "opening", "text": "Record the novelty; let the engine sober you afterwards.", "mechanism": "Human-first analysis, engine-second verification.", "action": "Kasparov's method.", "source": "Kasparov", "grade": "D"},
      {"id": "P47", "stage": ["S4"], "theme": "strategy", "text": "AlphaZero's ideas are earned, not borrowed.", "mechanism": "Long-term pawn sacs without understanding are dangerous.", "action": "H-pawn vs castled king only with a stable centre; redeploy before being kicked.", "source": "Regan/Sadler", "grade": "C"},
      {"id": "P48", "stage": ["S4"], "theme": "physiology", "text": "Fitness is hour-five stamina, not calories.", "mechanism": "6,000-kcal claim is a 1975 breathing-rate extrapolation; real lever is lapses in long games.", "action": "Conditioning for stamina and stress.", "source": "Kramnik on Carlsen; Strandberg debunk", "grade": "D/B"},
      {"id": "P49", "stage": ["S3","S4"], "theme": "clock", "text": "Recognise more, calculate less. The 2026 Candidates was won on the clock.", "mechanism": "Sindarov ~25 min ahead moves 17–40; Gukesh collapsed by calculating everything.", "action": "Build the library; trust recognition in known structures.", "source": "Chess Engine Lab Candidates data; Gajewski", "grade": "B"},
      {"id": "P50", "stage": ["S0","S1","S2","S3","S4"], "theme": "meta", "text": "Practice buys about a third. Starting late is real. Measure error rates, not titles.", "mechanism": "Deliberate practice ≈34% of rating variance; starting age β=−.15 after hours.", "action": "Goals in metrics table, not titles.", "source": "Hambrick 2014; Burgoyne 2019", "grade": "B"},
      {"id": "P51", "stage": ["S0","S1","S2","S3","S4"], "theme": "meta", "text": "No chess training method has a randomised trial behind it. Grade every piece of advice — including this document.", "mechanism": "All evidence is observational, retrospective or n-of-one.", "action": "Keep evidence grades visible in the app.", "source": "Report synthesis", "grade": "B"},
      {"id": "P52", "stage": ["S0","S1","S2","S3","S4"], "theme": "meta", "text": "Don't copy a GM's childhood.", "mechanism": "Elite methods are tagged by the level at which they transfer; early copying is Rowson's 'inappropriate copying'.", "action": "Filter pearls by current stage.", "source": "Rowson; Sloan", "grade": "C"}
    ],

    "metrics": [
      {"id": "first_blunder_move_median", "name": "Move of first ≥2-pawn blunder (median)", "how": "Game Review / eval graph", "targets": {"S0": ">20", "S1": ">25", "S2": ">30", "S3": ">35"}},
      {"id": "hung_pieces_per_game", "name": "One-move piece hangs per game", "how": "Count in review", "targets": {"S0": "<=1", "S1": "0", "S2": "0"}},
      {"id": "error_tag", "name": "Error-type tag", "how": "One of: hung_piece | missed_threat | bad_trade | wrong_plan | clock | endgame_technique", "targets": {"all": "Most frequent tag = this week's study target"}},
      {"id": "longest_think_seconds", "name": "Longest single-move think", "how": "Clock log", "targets": {"all": "Flag >180 s as non-recognition"}},
      {"id": "castled_by_move_10_pct", "name": "Castled by move 10 (%)", "how": "PGN", "targets": {"S0": ">=90", "S1": ">=90"}},
      {"id": "slow_puzzle_accuracy_pct", "name": "Slow, mixed, written puzzle accuracy (%)", "how": "Puzzle log", "targets": {"S1": ">=85", "S2": ">=90 (easy), start medium"}},
      {"id": "endgames_mastered_count", "name": "Endgames mastered (of ~20)", "how": "Checklist", "targets": {"S2": "20"}},
      {"id": "review_completed_pct", "name": "Long games with written review (%)", "how": "Y/N per game", "targets": {"all": "100"}},
      {"id": "study_slot_context", "name": "Study slot context", "how": "pre/post shift; hours slept", "targets": {"all": "Correlate with blunder metrics after 3 months"}}
    ],

    "pitfalls": [
      {"id": "PF1", "name": "Volume substitution", "text": "Playing 10 unreviewed games instead of 2 reviewed. >90% of adult time goes to play; it is the least efficient activity."},
      {"id": "PF2", "name": "Opening study as procrastination", "text": "Feels productive, decides nothing below 1600. Only to fix review-identified recurring problems."},
      {"id": "PF3", "name": "Puzzle rush / themed sets", "text": "Rewards memorised puzzles; speed puzzles ≈ games in efficiency."},
      {"id": "PF4", "name": "Eval-bar watching", "text": "Teaches what the engine thinks, not why you blundered."},
      {"id": "PF5", "name": "Copying early", "text": "Tal/AlphaZero/Carlsen ideas before you can survive being objectively worse."},
      {"id": "PF6", "name": "Post-shift grinding", "text": "Low encoding, high blunder rate, confidence damage."},
      {"id": "PF7", "name": "Tool-building as avoidance", "text": "The first 8 weeks need a board, a notebook and two games a week. Build the app once you have ~20 reviewed games of your own data."},
      {"id": "PF8", "name": "Expecting linear rating gain", "text": "Rating lags skill and follows a power law in games; judge by the metrics table."}
    ]
  };

  // ---------- small helpers ---------------------------------------------------
  const WINDOW = 10;              // default games window: S0's exit criteria are judged over the last 10
  const NO_BLUNDER = 60;          // a game with no two-pawn blunder counts as "first blunder at move 60" in the median
  const LONG_THINK_MS = 180000;   // P10: over 3 minutes on one move means you did not recognise the position
  const DAY = 86400000;
  const num = (v) => typeof v === 'number' && isFinite(v);
  const mean = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : null);
  const median = (a) => {
    if (!a.length) return null;
    const s = a.slice().sort((x, y) => x - y), h = s.length >> 1;
    return s.length % 2 ? s[h] : (s[h - 1] + s[h]) / 2;
  };
  const pct = (n, d) => (d ? (100 * n) / d : null);
  const whole = (x) => { const n = Math.floor(+x); return isFinite(n) && n > 0 ? n : 0; };   // week numbers: never negative
  const gcd = (a, b) => (b ? gcd(b, a % b) : a);
  const byId = (a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
  // truncate toward zero for display, so a value just short of a target never reads as the target itself
  const cut = (v, d) => { const f = Math.pow(10, d); return Math.trunc(v * f + (v < 0 ? -1e-9 : 1e-9)) / f; };
  // the most frequent key in a list of {key: n} counts; ties go to the key seen first (rows are newest first, so the recent one)
  function topOf(counts) {
    const tot = {}, order = [];
    for (const c of counts) for (const k in c) {
      if (!num(c[k]) || c[k] <= 0) continue;
      if (!(k in tot)) { tot[k] = 0; order.push(k); }
      tot[k] += c[k];
    }
    let best = null;
    for (const k of order) if (!best || tot[k] > best.n) best = { key: k, n: tot[k] };
    return best;
  }

  // ---------- stages, pearls, blocks ------------------------------------------
  const stages = data.stages;
  const stage = (id) => stages.find((s) => s.id === id) || null;
  const next = (id) => { const i = stages.findIndex((s) => s.id === id); return i >= 0 && i < stages.length - 1 ? stages[i + 1].id : null; };
  const pearl = (id) => data.pearls.find((p) => p.id === id) || null;
  // pearls({ stage: 'S0', theme: 'safety' }); a bare string is a stage id
  function pearls(opts) {
    const o = typeof opts === 'string' ? { stage: opts } : opts || {};
    return data.pearls.filter((p) => (!o.stage || p.stage.includes(o.stage)) && (!o.theme || p.theme === o.theme)).sort(byId);
  }
  // Walk the stage's pearls with a stride coprime to their count: every pearl comes up once per cycle, week 0 is the
  // lowest id (P01, "Hope chess", for S0), and neighbours in the list (often the same theme) are not shown back to back.
  function pearlOfWeek(stageId, weekIndex) {
    const pool = pearls({ stage: stageId }), n = pool.length;
    if (!n) return null;
    let k = Math.max(1, Math.round(n * 0.382));
    while (gcd(k, n) !== 1) k++;
    return pool[(whole(weekIndex) * k) % n];
  }

  // which block `when` values fit a day. After a shift only shift-day work (easy repetition) is on; the rest is shown, greyed.
  const WHEN = { morning: ['off_day_morning', 'off_day', 'any'], shift: ['shift_day', 'any'], post: ['shift_day'] };
  const P17 = pearl('P17');
  const POST_WHY = 'Not today: easy repetition only.';
  const POST_RESEARCH = P17 ? P17.text + ' ' + P17.mechanism + ' ' + P17.source + ', grade ' + P17.grade + '.' : '';
  function blocksFor(stageId, ctx) {
    const st = stage(stageId), list = (st && st.weekly_blocks) || [], ok = WHEN[ctx];
    const on = (b) => Object.assign({}, b, { today: true, why: null, research: null });
    if (!ok) return list.map(on);
    if (ctx !== 'post') return list.filter((b) => ok.includes(b.when)).map(on);
    return list.map((b) => (ok.includes(b.when) ? on(b) : Object.assign({}, b, { today: false, why: POST_WHY, research: POST_RESEARCH })));
  }

  // S0's steps are numbered weeks 1..8 and the last one says "if unmet, repeat weeks 5-8", so past week 8 we loop that
  // range (read from the text, not hard-coded). The other stages' steps are unnumbered and simply cycle.
  function microStep(stageId, weekIndex) {
    const st = stage(stageId), steps = (st && st.micro_steps) || [], w = whole(weekIndex);
    if (!steps.length) return null;
    if (!steps.some((s) => num(s.week))) return Object.assign({ repeat: false }, steps[w % steps.length]);
    const wk = w + 1, hit = steps.find((s) => s.week === wk);
    if (hit) return Object.assign({ repeat: false }, hit);
    const last = steps.reduce((a, s) => (num(s.week) && s.week > a.week ? s : a), steps[0]);
    if (wk < last.week) return null;   // a gap in the numbering: nothing set for that week
    const rep = /repeat weeks (\d+)\s*\D\s*(\d+)/i.exec(last.task);
    if (!rep) return Object.assign({ repeat: true }, last);
    const lo = +rep[1], span = +rep[2] - lo + 1, want = lo + ((wk - last.week - 1) % span);
    return Object.assign({ repeat: true }, steps.find((s) => s.week === want) || last);
  }

  // resources with the key the plan store ticks them by ('S0:0')
  const resources = (stageId) => { const st = stage(stageId); return st ? (st.resources || []).map((text, i) => ({ key: st.id + ':' + i, text })) : []; };

  // whole calendar weeks since the start, counted in local calendar days so a DST change (a 23- or 25-hour day) never
  // shifts the week. 'YYYY-MM-DD' strings are taken as that local date; anything else goes through Date.
  function dayNo(v) {
    if (v == null) return null;
    const m = typeof v === 'string' && /^(\d{4})-(\d{2})-(\d{2})$/.exec(v);
    if (m) return Date.UTC(+m[1], +m[2] - 1, +m[3]) / DAY;
    const d = v instanceof Date ? v : new Date(v);
    return isNaN(d.getTime()) ? null : Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / DAY;
  }
  function weekIndex(startISO, nowISO) {
    const a = dayNo(startISO), b = dayNo(nowISO == null ? new Date() : nowISO);
    return a == null || b == null || b < a ? 0 : Math.floor((b - a) / 7);
  }

  // ---------- metrics from the ledger ------------------------------------------
  // rows: __coach.ledger, newest first. Game metrics use the newest `window` clean rows (no hints, nudges, take-backs,
  // not tutor) because assisted games say nothing about your own move safety. The review metrics use the newest `window`
  // rows of any kind, because the post-mortem is owed for every game.
  function metrics(rows, opts) {
    const o = opts || {}, N = o.window > 0 ? Math.floor(o.window) : WINDOW, cleanOnly = o.cleanOnly !== false;
    const list = Array.isArray(rows) ? rows.filter((r) => r && typeof r === 'object') : [];
    const all = list.slice(0, N), win = (cleanOnly ? list.filter((r) => r.clean === true) : list).slice(0, N);
    const fbOf = (rs) => median(rs.map((r) => (num(r.firstBlunder) ? r.firstBlunder : NO_BLUNDER)));
    const hungOf = (rs) => mean(rs.filter((r) => num(r.hung)).map((r) => r.hung));
    const thinks = win.filter((r) => num(r.longestMs)).map((r) => r.longestMs);
    const withPm = all.filter((r) => r.pm != null);
    const accs = win.filter((r) => num(r.acc)).map((r) => r.acc);
    const by_ctx = {};
    for (const k of ['morning', 'shift', 'post', 'none']) {
      const rs = win.filter((r) => (r.ctx || 'none') === k);
      by_ctx[k] = { games: rs.length, first_blunder_move_median: fbOf(rs), hung_pieces_per_game: hungOf(rs) };
    }
    return {
      window: N, clean: cleanOnly,
      games: win.length,              // rows the game metrics were computed over
      all: all.length,                // rows the review metrics were computed over
      first_blunder_move_median: fbOf(win),
      hung_pieces_per_game: hungOf(win),
      castled_by_move_10_pct: pct(win.filter((r) => num(r.castled) && r.castled <= 10).length, win.length),
      longest_think_flags: thinks.filter((ms) => ms > LONG_THINK_MS).length,
      longest_think_seconds: thinks.length ? Math.round(Math.max.apply(null, thinks) / 1000) : null,
      review_completed_pct: pct(withPm.length, all.length),
      reviewed: withPm.length,
      pm_hit_pct: pct(withPm.filter((r) => r.pm.hit === true).length, withPm.length),   // how often you located your own error
      top_tag: topOf(win.map((r) => r.tags || {})),                                      // the coach's pattern tags
      top_pm_tag: topOf(all.map((r) => (r.pm && r.pm.tag && r.pm.tag !== 'none' ? { [r.pm.tag]: 1 } : {}))),   // your own tag
      acc_mean: mean(accs.slice(0, 3)),
      acc_trend: accs.length > 3 ? mean(accs.slice(0, 3)) - mean(accs.slice(3, 6)) : null,
      by_ctx,
    };
  }

  // ---------- facts: one flat object keyed by curriculum metric id --------------
  // where each metric comes from. 'self' = the learner says so with a toggle on the Train screen.
  const attested = ['safety_check_seconds', 'opening_plan_statable', 'monthly_stronger_player_review',
    'aagaard_three_questions_in_annotations', 'candidate_moves_written', 'static_imbalance_explained', 'two_step_engine_rule_habitual'];
  const sources = {
    first_blunder_move_median: 'ledger', hung_pieces_per_game: 'ledger', castled_by_move_10_pct: 'ledger',
    review_completed_pct: 'ledger', annotated_long_games_pct: 'ledger', longest_think_seconds: 'ledger',
    error_tag: 'ledger', study_slot_context: 'ledger',
    slow_puzzle_accuracy_pct: 'puzzles', slow_puzzle_accuracy_pct_easy: 'puzzles',
    mate_KQ_seconds: 'endgames', mate_KR_seconds: 'endgames', KP_vs_K_win: 'endgames',
    rook_endgame_two_pawns_up_convert: 'endgames', endgames_mastered_count: 'endgames',
  };
  for (const id of attested) sources[id] = 'self';
  // the metrics() key behind each ledger criterion, and which of them count every game rather than clean ones
  const LEDGER = { first_blunder_move_median: 'first_blunder_move_median', hung_pieces_per_game: 'hung_pieces_per_game',
    castled_by_move_10_pct: 'castled_by_move_10_pct', review_completed_pct: 'review_completed_pct', annotated_long_games_pct: 'review_completed_pct' };
  const REVIEW = { review_completed_pct: true, annotated_long_games_pct: true };
  // every window an exit criterion asks for (10 and 20 today), so facts() can answer each criterion over its own window
  const WINDOWS = Array.from(new Set(stages.flatMap((s) => (s.exit_criteria || []).map((c) => c.window_games)).filter(num)));
  const secs = (ms) => (num(ms) && ms > 0 ? ms / 1000 : null);
  const numOr = (v) => (num(v) ? v : null);

  // extra = { puzzles: __puzzles.stats(), endgames: __endgames.stats(), attest: { metricId: bool } }. A missing fact is
  // null, which evaluate() reports as 'unknown'. An endgame not yet won is null too (not yet shown), not false.
  function facts(rows, extra, opts) {
    const x = extra || {}, o = opts || {}, pz = x.puzzles || {}, eg = x.endgames || {}, at = x.attest || {};
    const base = o.window > 0 ? Math.floor(o.window) : WINDOW, m = metrics(rows, { window: base, cleanOnly: o.cleanOnly });
    const windows = { [base]: m };
    for (const n of WINDOWS) if (!windows[n]) windows[n] = metrics(rows, { window: n, cleanOnly: o.cleanOnly });
    const f = Object.assign({}, m, {
      windows,
      annotated_long_games_pct: m.review_completed_pct,
      error_tag: m.top_pm_tag ? m.top_pm_tag.key : null,
      study_slot_context: m.by_ctx,
      slow_puzzle_accuracy_pct: numOr(pz.acc30),
      // the puzzle set is easy by design, so acc30 stands in until the puzzles store reports an easy-band figure itself
      slow_puzzle_accuracy_pct_easy: num(pz.acc30Easy) ? pz.acc30Easy : numOr(pz.acc30),
      mate_KQ_seconds: secs(eg.KQ_ms_best),
      mate_KR_seconds: secs(eg.KR_ms_best),
      KP_vs_K_win: eg.KP_win === true || null,
      rook_endgame_two_pawns_up_convert: eg.rook2_convert === true || null,
      endgames_mastered_count: numOr(eg.mastered),
    });
    for (const id of attested) f[id] = typeof at[id] === 'boolean' ? at[id] : null;
    return f;
  }

  // ---------- evaluate a stage's exit criteria ------------------------------------
  const CTX = { morning: 'Off-day morning', shift: 'Shift day', post: 'After a shift', none: 'No day given' };
  const TAGS = { hung_piece: 'Hung piece', missed_threat: 'Missed threat', bad_trade: 'Bad trade', wrong_plan: 'Wrong plan',
    clock: 'Clock', endgame_technique: 'Endgame technique' };
  // how each metric reads in a sentence, and its unit: num, pct, s (seconds), tag, ctx
  const NAMES = {
    first_blunder_move_median: ['Median move of first two-pawn blunder', 'num'],
    hung_pieces_per_game: ['Pieces hung per game', 'num'],
    castled_by_move_10_pct: ['Castled by move 10', 'pct'],
    review_completed_pct: ['Games with a post-mortem', 'pct'],
    annotated_long_games_pct: ['Games with a written post-mortem', 'pct'],
    longest_think_seconds: ['Longest think on one move', 's'],
    error_tag: ['Your most frequent error tag', 'tag'],
    study_slot_context: ['Median first blunder by kind of day', 'ctx'],
    slow_puzzle_accuracy_pct: ['Slow puzzle accuracy', 'pct'],
    slow_puzzle_accuracy_pct_easy: ['Slow puzzle accuracy, easy puzzles', 'pct'],
    mate_KQ_seconds: ['Best K+Q mate', 's'],
    mate_KR_seconds: ['Best K+R mate', 's'],
    KP_vs_K_win: ['K+P vs K won with the opposition', 'num'],
    rook_endgame_two_pawns_up_convert: ['Rook endgame two pawns up, converted', 'num'],
    endgames_mastered_count: ['Endgames mastered', 'num'],
    safety_check_seconds: ['Safety check (their checks, captures, threats) habitual', 's'],
    opening_plan_statable: ['Can state one opening per colour and its plan to move 8-10 in a sentence', 'num'],
    monthly_stronger_player_review: ['A stronger player reviews your games every month', 'num'],
    aagaard_three_questions_in_annotations: ["Aagaard's three questions show in your annotations", 'num'],
    candidate_moves_written: ['Candidate moves written out in long games', 'num'],
    static_imbalance_explained: ['Static imbalances explained in your annotations', 'num'],
    two_step_engine_rule_habitual: ['Two-step engine rule habitual (analyse first, then check)', 'num'],
  };
  const NONE = { ledger: 'no games yet', puzzles: 'not enough puzzles yet', endgames: 'not done yet' };

  // a value as the Train screen shows it: 17, 0.45, 90%, 24 s, 3 min 40 s, yes, Hung piece
  function format(metric, v) {
    if (v == null) return '';
    const unit = (NAMES[metric] || [])[1] || 'num';
    if (typeof v === 'boolean') return v ? 'yes' : 'no';
    if (unit === 'tag') return TAGS[v] || String(v);
    if (unit === 'ctx') {
      return Object.keys(CTX).filter((k) => v[k] && v[k].games).map((k) => CTX[k] + ' ' + format('first_blunder_move_median',
        v[k].first_blunder_move_median) + ' (' + v[k].games + (v[k].games === 1 ? ' game)' : ' games)')).join(', ') || 'no games yet';
    }
    if (!num(v)) return String(v);
    if (unit === 'pct') return cut(v, 1) + '%';
    if (unit === 's') return v >= 60 ? Math.floor(v / 60) + ' min ' + Math.floor(v % 60) + ' s' : cut(v, 1) + ' s';
    return String(cut(v, 2));
  }
  function target(op, v, unit) {
    if (typeof v === 'boolean') return '';
    const t = unit === 'pct' ? v + '%' : unit === 's' ? v + ' s' : String(v);
    return op === '>' ? 'over ' + t : op === '>=' ? t + ' or more' : op === '<' ? 'under ' + t : op === '<=' ? t + ' or fewer' : t;
  }
  function compare(actual, op, value) {
    // a yes/no fact against a number is an attestation that the threshold holds ("under 20 s, habitual": yes)
    if (typeof actual === 'boolean') return typeof value === 'boolean' ? (op === '!=' ? actual !== value : actual === value) : actual;
    if (!num(actual) || !num(value)) return false;
    switch (op) {
      case '>': return actual > value;
      case '>=': return actual >= value;
      case '<': return actual < value;
      case '<=': return actual <= value;
      case '==': return actual === value;
      case '!=': return actual !== value;
      default: return false;
    }
  }
  function label(c, actual, src, win, n) {
    const nm = NAMES[c.metric] || [c.metric, 'num'], tgt = target(c.op, c.value, nm[1]);
    if (src === 'self') {
      const said = actual === true ? 'yes (you said so)' : actual === false ? 'not yet (you said so)' : 'not answered yet';
      return nm[0] + (tgt ? ', ' + tgt : '') + ': ' + said;
    }
    if (typeof c.value === 'boolean') return nm[0] + ': ' + (actual === true ? 'yes' : actual === false ? 'no' : 'not yet');
    let val = actual == null ? NONE[src] || 'unknown' : format(c.metric, actual), where = '';
    if (win) {
      const games = REVIEW[c.metric] || !win.clean ? 'games' : 'clean games';
      if (!n) val = 'no ' + games + ' yet';
      where = !isFinite(win.window) ? 'all ' + games : n && n < win.window ? n + ' of ' + win.window + ' ' + games + ' so far' : 'last ' + win.window + ' ' + games;
    } else if (src === 'puzzles') where = 'last 30 puzzles';
    return nm[0] + ': ' + val + ' (target ' + tgt + (where ? ', ' + where : '') + ')';
  }
  // one criterion -> { metric, op, value, window_games, actual, status, label, source, note, games, need }
  function judge(c, F) {
    const src = sources[c.metric] || null, w = c.window_games || null;
    let actual = F[c.metric], win = null, n = null;
    if (src === 'ledger' && F.windows) {
      win = F.windows[w || F.window] || null;
      if (win) { actual = win[LEDGER[c.metric]]; n = REVIEW[c.metric] ? win.all : win.games; }
    }
    if (actual === undefined) actual = null;
    // too few games for the window is not a verdict yet: three lucky games must not pass a ten-game criterion
    const short = win && isFinite(win.window) && n < win.window;
    const status = actual == null || (typeof actual !== 'boolean' && !num(actual)) || short ? 'unknown' : compare(actual, c.op, c.value) ? 'met' : 'unmet';
    return { metric: c.metric, op: c.op, value: c.value, window_games: w, actual, status, label: label(c, actual, src, win, n),
      source: src, note: c.note || null, games: n, need: win ? win.window : null };
  }
  // met only when every criterion is met; a stage with no exit criteria (S4) is never "met", there is nowhere to go
  function evaluate(stageId, f) {
    const st = stage(stageId);
    if (!st) return null;
    const criteria = (st.exit_criteria || []).map((c) => judge(c, f || {}));
    return { stage: st.id, met: criteria.length > 0 && criteria.every((c) => c.status === 'met'), criteria };
  }

  const api = {
    data, stages, stage, next, pearl, pearls, pearlOfWeek, metrics, facts, evaluate, weekIndex, blocksFor, microStep, resources,
    format, sources, attested,
    pitfalls: data.pitfalls, standingOrders: data.standing_orders, grades: data.meta.evidence_grades,
    realism: data.learner_profile_defaults.realistic_outcome,
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else { root.CURRICULUM = data; root.Curriculum = api; }
})(typeof self !== 'undefined' ? self : this);
