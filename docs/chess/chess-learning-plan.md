# Chess learning plan — scaffold and pearls

Built from *Elite chess evolution and lessons* (Oct 2026). Format mirrors a problem-based A/P: Assessment → standing orders → staged "rotations" with entry/exit criteria → pearls → metrics → pitfalls. Evidence grades on every pearl, because almost nothing in chess training has been tested in a controlled trial and you should know which claims are load-bearing.

**Evidence grades used here**
- **A** — replicated controlled experiment (usually from cognitive science or motor learning, extrapolated to chess)
- **B** — large observational dataset in chess itself (no randomisation)
- **C** — consensus of named strong coaches/players
- **D** — single anecdote, self-report, or historical stereotype

---

## 1. Assessment

- **Patient:** adult beginner (<1000 online, presumed), physician, 12-hour day shifts, ~5–7 hr/week available, strong learner, builder tendencies.
- **What decides games at this level:** one-move material losses. Under-1400 players commit their first ≥2-pawn blunder before move 17 on average; over-1900 not until ~move 40 (B). Nothing else matters until that number moves.
- **Dominant mechanism of skill:** stored perceptual patterns that select what to calculate — not calculation depth (A). Experts search *less*, more selectively. The library is built by review of your own errors and by lessons, not by volume of play.
- **Efficiency data (B, observational, chess.com, n=44k):** per hour, lessons 5.2 and game review 4.4 rating pts vs games 0.9 and speed puzzles 0.7. For sub-1000s the gap is wider (lessons 5–18/hr vs games ~1/hr). Translation: the thing that feels like training (playing) is the least efficient; the thing that feels like homework (review) is the most.
- **Constraints specific to you**
  - Post-12-hour-shift evenings: new-pattern encoding drops ~40% under sleep deprivation (A); fast-chess decisions get faster and worse through the day (B). Evenings after shifts = easy repetition only, never new material or long games.
  - Off-day mornings = the only high-yield slot for long games and new material. Protect them.
  - Starting age penalises peak rating even after controlling for hours (B). Practice explains ~34% of rating variance (B). Set goals in error rates and first-blunder move number, not in titles.
- **Realistic trajectory (B, US rating records):** +200 after age 25 is common (>1,000 cases); +500 happens (~200 cases); adult 2200 after 30 is a handful per year; after 40 essentially nil since 2020. A 5–7 hr/week adult reaching 1600–1800 in 2–3 years is a good outcome. 2000 is an outlier. Plan for the former; don't anchor on the latter.

---

## 2. Standing orders (apply at every stage)

1. **Every game gets a written post-mortem or it didn't count.** Narrative first (what I thought was happening, where it went wrong), *then* engine. (B for efficiency; A for error-handling mechanism from Duke's piano study.)
2. **Engine's job is narrow:** which move lost material / where did eval swing ≥1.5. Do not read engine lines past the mistake until Stage 3. (C)
3. **Time control slow enough to run your checklist.** 15+10 minimum through Stage 2. Blitz is entertainment, not training, until Stage 3. Bullet is never training. (C)
4. **Fix the recurring error until it stops recurring.** One error type per week. Don't collect errors; close them. (A, extrapolated from Duke)
5. **Mixed puzzle themes, slow, written answer, missing line = wrong.** Blocked/themed sets feel better and retain worse (A, motor learning). (Aagaard, C)
6. **Openings = ideas to move ~8–10.** No memorised lines until Stage 3, and then only to understand where your line ends and what middlegame results. (C — contested; Hammer dissents on motivation grounds.)
7. **No new material after a shift.** Shift evenings: 15 min easy tactics or a rewatched lesson. Off-day mornings: long game + review + new material. (A/B)
8. **Never ask a chat LLM to read a position.** Ask it to explain what Stockfish/Maia said. Direct position analysis hallucinates pieces. (C, builder report)
9. **Chess960 once a month as a diagnostic**, not a diet. If your development principles survive a random start, they're internalised. (Claim that 960 helps beginners: asserted by many, evidenced by none.)
10. **Don't copy a GM's childhood.** Every elite method below is tagged by the level at which it transfers. Copying early = Rowson's sin of "inappropriate copying." (C)

---

## 3. Staged curriculum ("rotations")

Progression is gated by **exit criteria**, not by time or rating alone. Rating lags skill; the criteria are things you can measure in your own reviewed games.

### Stage 0 — Floor: move safety (weeks 1–8)

- **Giants to copy:** Morphy (develop everything, *then* attack), Steinitz (no attack without a reason; keep it closed if behind in development), Capablanca (ahead → trade pieces → endgame), Botvinnik's *method* only (annotate every loss).
- **Ignore:** Tal, AlphaZero, Carlsen's grind, Karpov's squeeze, any opening beyond principles, eval-bar watching.
- **Why:** opponents here leave kings in the centre and pieces undefended. Morphy's preconditions for attack are exactly what punishes that. You cannot yet verify compensation, so a pawn down with "activity" is just a pawn down.
- **Entry:** knows the rules.
- **Exit (all required, over your last 10 reviewed games):**
  - ≤1 one-move piece hang per game, median first ≥2-pawn blunder after move 20
  - Safety check runs in <20 s per move without conscious effort
  - Can force mate with K+Q and K+R against a lone king in <30 s each; can win K+P vs K from a winning position (opposition)
  - Castled by move 10 in ≥90% of games; all minor pieces developed before any pawn grab
- **Weekly template (~5–6 hr):**
  | Block | When | Duration | Content |
  |---|---|---|---|
  | Long game + review | Off-day mornings ×2 | 45 min game (15+10) + 30 min written review + 10 min engine | Narrative → "where did I first lose material / what did he threaten the move before / did I run the check?" → Game Review for that one question only |
  | Lesson | Off-day ×1 | 30–45 min | Bartholomew *Chess Fundamentals* (undefended pieces, coordination, endgame basics); Chessbrah *Building Habits* rules (castle ASAP, don't hang/do take free pieces, king active in endgame) |
  | Easy tactics | Shift days ×4 | 15 min | Lichess/chess.com puzzles, *slow*, rating set low (easy), write/say the full line before moving; mixed themes |
  | Endgame drill | ×1 | 15 min | K+Q, K+R mates; K+P vs K; drill against the engine until automatic |
- **Micro-steps, first 8 weeks**
  - Wk 1: account set up; 3 games 15+10; after each, write 3 lines (first material loss / what was threatened the move before / did I check). Nothing else.
  - Wk 2: add the mantra on every move — *checks, captures, threats* (theirs, after my move). Time it. Goal: habitual by Wk 4.
  - Wk 3: add "count before you capture" (attackers vs defenders on the square; what's left on the board after the sequence).
  - Wk 4: K+Q and K+R mate drills to <30 s. First Chess960 game as a test — did development principles hold?
  - Wk 5: K+P vs K (opposition). Start tagging each review with one error type (hung piece / missed his threat / bad trade / wrong plan).
  - Wk 6: pick your single most frequent error tag; that is the week's only study target.
  - Wk 7: introduce "when ahead, trade pieces." Review for whether you did.
  - Wk 8: audit against exit criteria. If not met, repeat Wks 5–8 — do not advance.

### Stage 1 — Principles under pressure (to ~1000)

- **Giants to copy:** Morphy/Steinitz continued; Lasker's practical rule (in equal positions, pick the move that gives him the most ways to go wrong); Capablanca's "every opening move serves a middlegame plan."
- **Ignore:** still everything dynamic/sacrificial; Nakamura's 1.b3 and anti-prep sidelines.
- **Entry:** Stage 0 exit.
- **Exit:**
  - Median first ≥2-pawn blunder after move 25 (last 20 games)
  - One opening per colour played as a *plan* to move 8–10 (can state in one sentence what each side wants)
  - Can convert K+R+pawns vs K+R when two pawns up without engine help
  - Puzzle accuracy ≥85% on slow, easy mixed sets
- **Weekly template:** same as Stage 0; move to 30+0 or 15+10 → 30+0 for one of the two long games; lesson block shifts to Naroditsky speedruns (watch at your rating band) and Heisman's "real chess" thought process.
- **Micro-steps:** choose 1.e4 or 1.d4 (either; pick one and stop deliberating) + one reply to each of 1.e4/1.d4 as Black; learn the *plan*, not the line. Add "what does he want to do next?" as a third question in the safety check. Start a one-page "my recurring errors" sheet; retire an entry only when it hasn't appeared in 10 games.

### Stage 2 — Club: structure, endgames, honest annotation (~1000–1600)

- **Giants to copy:** Capablanca (planning from the opening, endgame technique — Chernev's move-by-move Capablanca games), Tarrasch's mobility rules as *defaults* (rooks behind passed pawns, don't block your own bishops), Botvinnik (narrow repertoire studied as typical positions; annotations shown to someone stronger), Steinitz (weak pawns matter more as pieces come off — count pawn islands before trading), Lasker.
- **Ignore:** memorised lines past move 10; Watson's "rule independence" (you need the rules until pattern recognition replaces them); Petrosian's exchange sacs; Carlsen's provocative openings; Freestyle as a main diet.
- **Entry:** Stage 1 exit.
- **Exit:**
  - Median first ≥2-pawn blunder after move 30
  - ~20 specific endgames cold (Soltis/Heisman list via Silman's *Endgame Course*, read only to your band and stop)
  - Written annotation of every long game, at least one per month reviewed by a stronger player or coach
  - Can state the pawn-structure plan in your main openings' typical middlegames
  - Easy tactics ≥90% slow accuracy; begin medium puzzles
- **Weekly template (~6–7 hr):**
  | Block | When | Duration | Content |
  |---|---|---|---|
  | Long games | Off-day mornings ×2 | 30+15 → 45+15; 30–45 min written review each | Kraai method: write your narrative, then test it against the moves with a board; engine last |
  | Easy tactics, mass repetition | Shift days ×4–5 | 15–20 min | Aagaard: basic simple tactics, every line written, missing answer = wrong; mixed themes |
  | Study block | Off-day ×1 | 45–60 min | Alternate: Silman endgame band ↔ Chernev *Logical Chess* ↔ one annotated Capablanca game |
  | Opening repair | Only when review shows a recurring problem | 20 min | Lichess opening explorer: where does my line end, what's the typical middlegame? |
- **Micro-steps:** build the 20-endgame list and drill one per week vs engine; set up a standing monthly review with a stronger player (club, Dojo cohort, or paid hour); start Naroditsky's question — "what if I play the second move first?" — on every candidate sequence.

### Stage 3 — Strong club: calculation discipline and positional vocabulary (~1600–2000)

- **Giants to copy:** Nimzowitsch/Petrosian (prophylaxis as a habit; blockade advanced pawns with knights; positional exchange sac when files are closed), Alekhine (steer toward live options while keeping structure sound), Karpov (remove counterplay first, then press), Fischer (bishop-vs-knight judgment), Carlsen's *mindset* ("mistakes are a consequence of tension" — play on in equal positions; treat "theoretical draw" as a claim to test), Kotov (candidate moves written out).
- **Ignore:** Tal (complications that relied on opponents who couldn't refute them), AlphaZero h-pawn marches and early pawn sacs as defaults, Nakamura's complication-avoidance as policy, Carlsen's opening variety, trying to "think like an engine."
- **Entry:** Stage 2 exit.
- **Exit:**
  - Aagaard's three questions (weaknesses? worst piece? what does he intend?) run on every critical position; evidence in your annotations
  - Candidate moves written in long games; visualisation errors identified and tracked
  - Can explain compensation for a static imbalance (rook vs knight+pawn, bishop pair, isolated pawn) in your own games
  - Two-step engine rule habitual: analyse without, then check
- **Weekly template:** long games 45+15 or OTB classical; Silman *Reassess Your Chess* (designed 1400–2100); medium/hard puzzles with written solutions; one Dvoretsky-style exercise/week (find the opponent's best move, then prevent it); blitz now defensible as *serious* training if reviewed (Dlugy/Naroditsky), ≤20–30% of chess time. Woodpecker optional as a commitment device — know that its specific mechanism is unproven and it risks memorising positions, not patterns.

### Stage 4 — Expert+ (2000+)

- **Methods:** Dvoretsky school (set positions played both colours vs a stronger player; written solutions to hard studies; exhaustive own-game analysis), Kasparov's novelty-recording + engine sobering, Aagaard *Calculation*, AlphaZero themes adopted *with understanding* (king mobility, rook-pawn pushes vs castled king only with a stable centre, move a piece before it's kicked), physical conditioning for stamina (hour five lapses, not calories).
- **Clock as skill:** Sindarov won the 2026 Candidates sitting ~25 min ahead from move 17–40; Gukesh collapsed by calculating everything. Recognise more, calculate less. This is the same finding as Sigman's at the bottom.
- Not planned in detail; if you reach it, you'll have a coach and the plan will be yours.

---

## 4. Pearls

Short enough to recall at the board; each with mechanism, the action it implies, the stage it applies to, and an evidence grade. Caveat up front: Hendriks' critique is that maxims are post-hoc stories and moves actually come from pattern familiarity. The AlphaZero concept-probing work (McGrath et al.) shows the classical concepts are real regularities of the game, so maxims are legitimate *attention scaffolds* — but only if each one is tied to a concrete check, not recited as a slogan. Every pearl below has an action for that reason.

### Floor / safety (Stage 0–1)
1. **Hope chess is a hung piece with a story attached.** *Mechanism:* moving without checking the reply. *Action:* after choosing a move, ask "his checks, captures, threats?" before releasing it. (Heisman, C)
2. **Count before you capture.** *Action:* attackers vs defenders on the square; what remains after the whole sequence. (C)
3. **Your first blunder is the game.** Under-1400: before move 17; over-1900: ~move 40. *Action:* track "move of first ≥2-pawn blunder"; it is your primary metric. (Sigman, B)
4. **Undefended pieces are pending results — check them every move.** (Bartholomew, C)
5. **An uncastled king is the chief complaint. Nothing elective until it's addressed.** (C)
6. **Develop everything, then attack. Morphy didn't sacrifice until every piece was in.** (History, C/D)
7. **Don't attack without a reason. If you can't name his error, you haven't earned the attack.** (Steinitz via Hooper, C)
8. **A pawn down with "activity" is a pawn down.** You cannot yet verify compensation. (C)
9. **Ahead? Trade pieces, not pawns. Behind? Keep pieces on.** (Capablanca, C)
10. **A long think is a symptom of non-recognition, and it predicts a blunder.** *Action:* staring >3 min → you don't know this position; take the safest move and bank the clock. (Anderson & Kleinberg, B)
11. **Slow enough to run the checklist, or the time control is the diagnosis.** 15+10 minimum. (C)
12. **Blitz is a stress test, not a treatment. Bullet is television.** (C)
13. **Review beats play ~5:1 per hour. A game without a post-mortem is a game you paid for and didn't get.** (Southwick 2026, B)
14. **Write the narrative before the engine.** The error you locate yourself is the one you stop making. (Kraai, C; Duke, A)
15. **At this level the engine answers one question: which move lost material. Close it after that.** (C)
16. **Don't ask a chatbot to read a board. Ask it to explain what Stockfish said.** (C)
17. **No new patterns after a 12-hour shift.** Encoding falls ~40% sleep-deprived. Shift evenings = easy reps only. (Walker, A — extrapolated)
18. **Morning brain plays slower and better. Long games live in off-day mornings.** (B)
19. **Openings: ideas, not lines.** "I reached 2200 with the openings I learned at 1200." (2000+ survey, C)
20. **Plateau ≠ ceiling.** Rating follows a power law in games played, asymptote ~750–1,000 rated games. (Howard, B)

### Club (Stage 2)
21. **Themed puzzle sets feel good and teach worse. Mix the themes.** Blocked practice → in-session gains, poor retention, overconfidence. (Lee & Simon, A — motor learning)
22. **Easy tactics, mass repetition, every line written, a missing line counts as wrong.** (Aagaard, C)
23. **About 20 endgames carry you to 2000. Learn them cold and stop.** (Soltis/Heisman, C)
24. **"What if I play the second move first?"** Move-order check on every sequence. (Naroditsky, C)
25. **In equal positions, choose the move that gives him the most ways to go wrong.** Carlsen's nettlesomeness is Lasker's rule with better technique. (Lasker, C; Regan, B)
26. **Weak pawns get weaker as pieces come off. Count pawn islands before you trade.** (Steinitz, C)
27. **Rooks behind passed pawns; don't block your own bishops. Rules are training wheels — ride them until they fall off on their own.** (Tarrasch, C)
28. **Where your opening course ends is where your study begins.** (Naroditsky, C)
29. **Narrow repertoire, studied as typical positions, not as lines.** (Botvinnik, C)
30. **Fix the error until it stops recurring. Don't collect errors; close them.** (Duke, A)
31. **Publish your annotations to someone stronger.** Botvinnik did it so others could find his mistakes. (C)
32. **It's the study of the game, not the game.** Tournament play added almost nothing over serious study (ΔR² = .006). (Burgoyne, B)

### Strong club (Stage 3)
33. **Three questions: Where are the weaknesses? Which is my worst piece? What does he want?** (Aagaard, C)
34. **Find his best move first; then make it impossible.** Prophylaxis as a habit. (Nimzowitsch/Dvoretsky, C)
35. **Remove counterplay, then press.** (Karpov, C)
36. **The familiar pattern captures your eyes while you believe you're searching.** *Action:* force a written second candidate before committing. (Bilalić Einstellung, A)
37. **Write the lines. Visualisation fails silently; paper doesn't.** (Kotov, C)
38. **Mistakes are a consequence of tension. Keep the tension.** (Carlsen, C)
39. **"Theoretical draw" is a claim. Test it.** (Carlsen, C)
40. **A rook outranks a knight only when it has a file.** (Petrosian, C)
41. **Steer toward positions whose difficulty you can handle.** Position difficulty predicts blunders better than skill or time. (Anderson & Kleinberg, B)
42. **Borrow the engine's move orders and pawn-sac verdicts. Don't try to think like it.** (Watson, C)
43. **Woodpecker is a commitment device, not a mechanism.** (C/D — all evidence self-reported)

### Expert+ (Stage 4)
44. **Predict, then check.** Analyse without the engine, commit to an evaluation, then look. (Poker solver practice, C)
45. **Play the set position with both colours against someone stronger.** (Dvoretsky, C)
46. **Record the novelty; let the engine sober you afterwards.** (Kasparov, D)
47. **AlphaZero's ideas are earned, not borrowed.** H-pawn vs a castled king only with a stable centre; redeploy a piece before it's kicked; "if I sacrifice pawns I don't understand, that is dangerous." (Regan/Sadler, C)
48. **Fitness is hour-five stamina, not calories.** The 6,000-kcal claim is a 1975 breathing-rate extrapolation. (Kramnik on Carlsen, D; debunk, B)
49. **Recognise more, calculate less. The 2026 Candidates was won on the clock.** (B)

### Meta (all stages)
50. **Practice buys about a third. Starting late is real. Measure error rates, not titles.** (Hambrick; Burgoyne, B)
51. **No chess training method has a randomised trial behind it. Grade every piece of advice — including this document.** (B, absence of evidence)
52. **Don't copy a GM's childhood.** (Rowson; Sloan, C)

---

## 5. Metrics to log (per reviewed game)

| Metric | How | Target by stage |
|---|---|---|
| Move of first ≥2-pawn blunder | Game Review / eval graph | S0: >20 · S1: >25 · S2: >30 · S3: >35 |
| Hung pieces per game (one-move) | Count in review | S0: ≤1 · S1+: 0 |
| Error-type tag | One of: hung piece / missed threat / bad trade / wrong plan / clock / endgame technique | Most frequent tag = this week's study target |
| Time on longest single move | Clock log | Flag >3 min (non-recognition) |
| Castled by move | PGN | ≥90% by move 10 (S0–1) |
| Slow puzzle accuracy (mixed, written) | Puzzle log | S0: — · S1: ≥85% · S2: ≥90% easy, start medium |
| Endgames mastered | Checklist of ~20 | S2 exit: all 20 |
| Review completed | Y/N | 100% of long games |
| Study slot quality | Pre/post-shift, hours slept | Correlate with blunder metrics after 3 months |

---

## 6. Pitfalls (differential of common failures)

- **Volume substitution:** playing 10 unreviewed games instead of 2 reviewed. The data say this is the dominant adult failure mode (>90% of time goes to play).
- **Opening study as procrastination:** feels productive, decides nothing at <1600. Permitted only to fix a recurring, review-identified problem.
- **Puzzle rush / themed sets:** rewards memorised puzzles; the 2026 data show speed puzzles ≈ games in efficiency.
- **Eval-bar watching:** teaches you what the engine thinks, not why you blundered.
- **Copying early:** Tal/AlphaZero/Carlsen ideas before you can survive being objectively worse.
- **Post-shift grinding:** low encoding, high blunder rate, confidence damage.
- **Tool-building as avoidance:** the first 8 weeks need a board, a notebook, and two games a week. The app is a second project — build it from the JSON once you have 20 reviewed games of your own data to feed it.
- **Expecting linear rating gain:** rating lags skill and follows a power law in games; judge yourself by the metrics table, not the number.

---

## 7. Resources by stage (named in the research)

- **S0–1:** John Bartholomew *Chess Fundamentals* (YouTube); Chessbrah *Building Habits*; Dan Heisman *A Guide to Chess Improvement*; Naroditsky speedruns at your band; Lichess (free: puzzles, studies, explorer) or chess.com (Game Review was the most efficient measured activity).
- **S2:** Chernev *Logical Chess: Move by Move*; Silman *Complete Endgame Course* (read to your band only); ChessDojo program (level-banded, classical-only, annotation-centred); Jesse Kraai on annotating your own games.
- **S3:** Silman *How to Reassess Your Chess* (1400–2100); Nimzowitsch *My System* (Part 2 onward; Part 1 restates Steinitz); Kotov; Dvoretsky-style exercise sets; Rowson *Seven Deadly Chess Sins*; de la Villa *100 Endgames* (really 1800+).
- **S4:** Aagaard *Grandmaster Preparation* series (explicitly 2000+); Dvoretsky; Sadler & Regan *Game Changer*.
- **Contrarian reading for any stage:** Hendriks *Move First, Think Later* — read it to keep the pearls honest.
