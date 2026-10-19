// Ghostlap Roma: endgame drills. A catalogue of set positions (the curriculum's Stage 0 mates and opposition, Stage 1 rook
// endings two pawns up, Stage 2's "about twenty" club endgames), each played out against the engine at full strength through
// __coach.drill, with best time, tries and a mastered tick per position, per player.
// Every position is checked by the real engine at depth 20 in tools/endgames-test.js (wins: mate or +5; draws: within ±0.5).
// Under node (require('../endgames.js')) only the catalogue and the pure store maths are exported; no DOM is touched.
(function () {
  'use strict';

  // ---------- the catalogue ------------------------------------------------------------------------------------------------
  // { id, set, kind, title, fen, you, goal, targetMs, note }. kind groups the Stage 0/1 positions the curriculum measures:
  // KQ and KR (mate times), KP (K+P vs K), R2 (rook ending two pawns up). Castling and en passant are always '-'.
  const KQR_MS = 30000;   // the curriculum's Stage 0 exit criterion: mate with K+Q and with K+R in under 30 seconds
  const P = (id, set, kind, title, fen, you, goal, note, targetMs) => ({ id, set, kind, title, fen, you, goal, targetMs: targetMs || null, note });
  const CAT = [
    // Stage 0: the mates, and the opposition in both directions
    P('kq-corner', 'S0', 'KQ', 'Queen mate: queen in the corner', '8/8/8/4k3/8/8/8/K6Q w - - 0 1', 'w', 'win',
      'Keep the queen a knight\'s jump from their king to shrink its box, walk your king up, mate on the edge; count their moves so you never stalemate.', KQR_MS),
    P('kq-far', 'S0', 'KQ', 'Queen mate: kings far apart', 'Q6K/8/8/8/3k4/8/8/8 w - - 0 1', 'w', 'win',
      'The queen cannot mate alone: herd their king to an edge with quiet queen moves, then bring your king all the way over before you mate.', KQR_MS),
    P('kq-black', 'S0', 'KQ', 'Queen mate with Black', '8/8/8/8/4K3/8/8/q6k b - - 0 1', 'b', 'win',
      'Same method from the other side: shrink the box, king up, mate on the edge, and look for stalemate before every queen move.', KQR_MS),
    P('kr-opp', 'S0', 'KR', 'Rook mate: kings face to face', '8/4k3/8/4K3/8/8/8/R7 w - - 0 1', 'w', 'win',
      'When the kings face each other, a rook check pushes their king back a rank; when they do not, make a waiting rook move.', KQR_MS),
    P('kr-centre', 'S0', 'KR', 'Rook mate: from the middle', '8/8/2k5/8/2K5/8/8/7R w - - 0 1', 'w', 'win',
      'Cut the king off with the rook, bring your king up, and give check only when the kings face each other.', KQR_MS),
    P('kr-black', 'S0', 'KR', 'Rook mate with Black', 'r7/8/6k1/8/6K1/8/8/8 b - - 0 1', 'b', 'win',
      'Rook cuts, king approaches, check only in opposition; if their king attacks the rook, move it to the far side of the board.', KQR_MS),
    P('kp-tempo', 'S0', 'KP', 'King and pawn: the spare pawn move', '8/8/3k4/8/3K4/8/3P4/8 w - - 0 1', 'w', 'win',
      'Two squares in front of your pawn you win whoever moves: if their king faces yours, a pawn step (d3) hands them the move, then go round them.'),
    P('kp-keep', 'S0', 'KP', 'King and pawn: keep the opposition', '8/8/8/4k3/8/4K3/4P3/8 b - - 0 1', 'w', 'win',
      'You have the opposition: when their king steps aside, step forward on the other side and face it again; push only with your king in front.'),
    P('kp-sixth', 'S0', 'KP', 'King and pawn: king on the sixth', '6k1/8/6K1/6P1/8/8/8/8 w - - 0 1', 'w', 'win',
      'Your king on the sixth in front of the pawn always wins: step beside their king first, then push; an early push lets them reach stalemate.'),
    P('kp-hold', 'S0', 'KP', 'Lone king: hold the draw', '8/8/8/4k3/8/4K3/4P3/8 w - - 0 1', 'b', 'draw',
      'The opposition cuts both ways: stay in front of the pawn, face their king whenever it steps up, and when pushed to the back rank stand right in front of the pawn.'),
    // Stage 1: rook endings two pawns up, against best defence
    P('r2-connected', 'S1', 'R2', 'Rook ending: two connected passers', '6k1/2R3pp/8/8/PP6/6K1/r5PP/8 w - - 0 1', 'w', 'win',
      'Push the connected pawns side by side, keep your rook active on the seventh or behind them, and bring your king over when the checks start.'),
    P('r2-outside', 'S1', 'R2', 'Rook ending: outside passers', '3r4/5pkp/6p1/8/P7/1P4P1/5P1P/2R3K1 w - - 0 1', 'w', 'win',
      'Rook behind the passed pawns, king safe from back-rank checks, and trade rooks whenever you can: a pawn ending two pawns up wins itself.'),
    // Stage 2: the "about twenty" (Soltis via Heisman, Silman's bands), each a win or a draw for your side
    P('lucena', 'S2', null, 'Lucena: build a bridge', '1K1k4/1P6/8/8/8/8/r7/2R5 w - - 0 1', 'w', 'win',
      'Check their king one more file away, put your rook on the fourth rank, then walk your king out and block the last check with the rook.'),
    P('philidor', 'S2', null, 'Philidor: the third-rank defence', '4k3/R7/7r/3KP3/8/8/8/8 w - - 0 1', 'b', 'draw',
      'Keep your rook on your third rank so their king cannot come forward; once the pawn steps onto it, swing the rook to the back and check from behind.'),
    P('square', 'S2', null, 'Rule of the square', '8/8/5k2/8/P7/8/8/7K w - - 0 1', 'w', 'win',
      'Draw the square from the pawn to its queening rank: if their king cannot step inside it, just push and count every move.'),
    P('outside', 'S2', null, 'Outside passed pawn', '8/6pp/4k3/8/P3K3/8/6PP/8 w - - 0 1', 'w', 'win',
      'Push the far pawn to drag their king away, then march your king to the other wing and eat what is left behind.'),
    P('protected', 'S2', null, 'Protected passed pawn', '8/8/8/2Pk2p1/1P6/4K3/8/8 w - - 0 1', 'w', 'win',
      'Their king cannot take a protected passer and must stay near it, so your king is free: go and win their pawn, then come back.'),
    P('breakthrough', 'S2', null, 'Pawn breakthrough', '8/ppp4k/8/PPP5/8/8/8/6K1 w - - 0 1', 'w', 'win',
      'Push the middle pawn (b6!); whichever pawn takes it, push the one beside it and one of yours runs through to queen.'),
    P('rook-pawn', 'S2', null, 'Rook pawn: the corner draws', 'k7/8/1K6/P7/8/8/8/8 b - - 0 1', 'b', 'draw',
      'Against a rook pawn get into the corner in front of it and shuffle; their king can only stalemate you or let you out.'),
    P('reti', 'S2', null, 'Réti: chase two hares', '7K/8/k1P5/7p/8/8/8/8 w - - 0 1', 'w', 'draw',
      'Walk your king down the diagonal (Kg7, Kf6, Ke5): each step chases their pawn and heads for yours, and they cannot stop both.'),
    P('q-centre', 'S2', null, 'Queen vs pawn on the seventh: centre pawn', 'K6Q/8/8/8/8/8/3pk3/8 w - - 0 1', 'w', 'win',
      'Check or pin until their king has to stand in front of the pawn, use that free move to bring your king one step closer, and repeat.'),
    P('q-bishop', 'S2', null, 'Queen vs bishop pawn: the stalemate trick', 'K7/8/8/8/8/7Q/1kp5/8 w - - 0 1', 'b', 'draw',
      'Their king is far away: when the queen drives you in front of the pawn, go to the corner instead (Ka1), because taking the pawn is stalemate.'),
    P('q-rook', 'S2', null, 'Queen vs rook pawn: into the corner', 'K7/7Q/8/8/8/8/pk6/8 w - - 0 1', 'b', 'draw',
      'Keep your king next to the pawn and step into the corner in front of it when checked; with no move left you are stalemated.'),
    P('perpetual', 'S2', null, 'Perpetual check', '6k1/5pp1/8/8/8/8/rr3PPP/4Q1K1 w - - 0 1', 'w', 'draw',
      'Two rooks down with mate coming, so do not try to win: check, check, check (Qe8+, Qe4+) until the position repeats three times.'),
    P('bishop-pawn', 'S2', null, 'Bishop and pawn vs king', '8/8/4k3/8/3PK3/8/8/5B2 w - - 0 1', 'w', 'win',
      'Escort the pawn with your king and let the bishop cover the squares in front of it; with a rook pawn, check the bishop covers the corner first.'),
    P('knight-pawn', 'S2', null, 'Knight and pawn vs king', '8/8/3k4/8/3P4/3K4/8/6N1 w - - 0 1', 'w', 'win',
      'Lead with your king as in king and pawn endings and bring the knight up to guard the pawn, so the king is free to clear the way.'),
    P('two-bishops', 'S2', null, 'Two bishops mate', '8/8/6k1/4K3/8/8/8/2B2B2 w - - 0 1', 'w', 'win',
      'Put the bishops side by side as a wall, push their king to an edge and then into a corner with your king close, and watch for stalemate.'),
    P('rook-bishop', 'S2', null, 'Rook vs bishop: the safe corner', '6bk/R7/5K2/8/8/8/8/8 w - - 0 1', 'b', 'draw',
      'Hide your king in the corner your bishop does not cover, so the bishop can block checks beside it; in the other corner you get mated.'),
    P('opposite-bishops', 'S2', null, 'Opposite bishops: the fortress', '8/2b5/6k1/6P1/5PK1/8/4B3/8 b - - 0 1', 'b', 'draw',
      'Block the pawns with your king on the squares your bishop cannot reach and let the bishop watch the other pawn; do not chase, just stop them.'),
    P('rook-v-pawn', 'S2', null, 'Rook vs pawn: bring the king back', '8/8/2K5/8/2pk4/8/8/R7 w - - 0 1', 'w', 'win',
      'The rook slows the pawn down while your king walks straight back towards it; take the pawn only when it cannot cost you the rook.'),
    P('pawn-v-rook', 'S2', null, 'Rook vs pawn: run with the king', '8/8/5K2/8/2pk4/8/8/R7 w - - 0 1', 'b', 'draw',
      'Their king is far off: push the pawn with your king beside it, not in front, and if the rook blocks, step round it.'),
    P('rook-knight', 'S2', null, 'Rook vs knight: stay together', '8/8/8/8/8/3kn3/8/R3K3 w - - 0 1', 'b', 'draw',
      'Keep the knight right next to your king, away from the edge if you can; a knight that wanders off gets trapped.'),
  ];
  // the coach card for each drill: the technique in a line or two and the one trap, short enough for three lines on an iPhone
  // (the card notes above are the full version). tools/endgames-test.js checks every position has both.
  const COACH = {
    'kq-corner': ["Queen a knight's jump from their king shrinks its box; king up, mate on the edge.", 'stalemate. Leave the king a square until your king arrives.'],
    'kq-far': ['Herd their king to an edge with quiet queen moves, then bring your king over.', 'stalemate. Leave the king a square until your king arrives.'],
    'kq-black': ['Same method with Black: shrink the box with the queen, king up, mate on the edge.', 'stalemate. Leave the king a square until your king arrives.'],
    'kr-opp': ['Kings face to face: a rook check drives theirs back. Not facing: make a waiting rook move.', 'checking when the kings do not face each other.'],
    'kr-centre': ['Cut their king off with the rook, bring yours up, check only when the kings face each other.', 'letting their king reach the rook: keep it far away.'],
    'kr-black': ['Rook cuts the board, your king walks up, check only when the kings face each other.', 'a rook beside their king: swing it to the far side.'],
    'kp-tempo': ['Kings face to face two squares ahead of the pawn: d3 hands them the move, then go round.', 'pushing the pawn before your king leads it.'],
    'kp-keep': ['When their king steps aside, step forward on the other side and face it again.', 'pushing while their king still faces yours.'],
    'kp-sixth': ['Your king on the sixth in front of the pawn wins: step beside their king first, then push.', 'an early push lets their king reach stalemate.'],
    'kp-hold': ['Stay in front of the pawn and face their king every time it steps up.', 'stepping aside: their king walks round you.'],
    'r2-connected': ['Pawns side by side, rook on the seventh or behind them, king over when the checks start.', 'one pawn alone: their rook picks it off.'],
    'r2-outside': ['Rook behind the passed pawns; trade rooks whenever you can, the pawn ending wins.', 'a back-rank mate: give your king a square first.'],
    'lucena': ['Check their king a file away, rook to the fourth rank, walk out, block the last check.', 'leaving the shelter before their king is cut off.'],
    'philidor': ['Rook on your third rank keeps their king out; once the pawn steps up, check from behind.', 'going passive on the back rank too early.'],
    'square': ['Draw the square from the pawn to its queening rank; if their king is outside it, just push.', 'a king move instead of the push: count first.'],
    'outside': ['Push the far pawn to drag their king away, then march your king to the other wing.', 'trading the outside pawn: it is your decoy.'],
    'protected': ['Their king has to watch your protected passer, so your king is free: go and win a pawn.', 'pushing the passer so it is no longer protected.'],
    'breakthrough': ['b6! Whichever pawn takes, push the one beside it, and one of yours runs through.', 'starting with a6 or c6: those do not break through.'],
    'rook-pawn': ['Get into the corner in front of the pawn and shuffle; they can only stalemate you or let you out.', 'leaving the corner: their king shuts you out.'],
    'reti': ['King down the diagonal (Kg7, Kf6, Ke5): each step chases their pawn and heads for yours.', 'chasing straight down the file: a tempo short.'],
    'q-centre': ['Check or pin until their king stands in front of the pawn, then bring your king a step closer.', 'loosening the grip for one move: the pawn queens.'],
    'q-bishop': ['Driven in front of the pawn? Go to the corner instead (Ka1): taking the pawn is stalemate.', 'stepping in front of the pawn with the corner free.'],
    'q-rook': ['Keep your king next to the pawn; when checked, step into the corner in front of it.', 'drifting away from the pawn: the queen wins it.'],
    'perpetual': ['Do not try to win: check, check, check (Qe8+, Qe4+) until the position repeats three times.', 'any move that is not a check: mate follows.'],
    'bishop-pawn': ['Escort the pawn with your king; the bishop covers the squares in front of it.', 'leaving the pawn alone for their king to take.'],
    'knight-pawn': ['Lead with your king as in king and pawn endings, and bring the knight up to guard the pawn.', 'a loose pawn while the knight is far away.'],
    'two-bishops': ['Bishops side by side as a wall: drive their king to an edge, then a corner, king close.', 'stalemate in the corner: count their moves.'],
    'rook-bishop': ['Hide in the corner your bishop does not cover, so the bishop can block checks beside it.', 'the other corner: there you get mated.'],
    'opposite-bishops': ['Blockade with your king on squares your bishop cannot reach; the bishop watches the other pawn.', 'chasing pawns: just stop them.'],
    'rook-v-pawn': ['The rook slows the pawn while your king walks straight back towards it.', 'grabbing the pawn when it costs you the rook.'],
    'pawn-v-rook': ['Push with your king beside the pawn, not in front of it; if the rook blocks, step round it.', 'your king in front of your own pawn.'],
    'rook-knight': ['Keep the knight right next to your king, away from the edge.', 'a knight that wanders off gets trapped.'],
  };
  for (const p of CAT) { const k = COACH[p.id] || []; p.cue = k[0] || null; p.trap = k[1] || null; }
  const SETS = {
    S0: { name: 'Stage 0 · Mates and the opposition', blurb: 'The floor of the plan: mate with king and queen and with king and rook in under 30 seconds, and win king and pawn against king.' },
    S1: { name: 'Stage 1 · Rook endings, two pawns up', blurb: 'Being two pawns up is only worth something if you can turn it into a queen against the best defence.' },
    S2: { name: 'Stage 2 · The twenty', blurb: 'About twenty endgames carry a club player a long way (Soltis, via Heisman). Learn them cold, then stop.' },
  };

  // ---------- pure store maths (also run under node by tools/endgames-test.js) ----------------------------------------------
  // A position's record: { best (ms, fastest run that met the goal), tries, wins (runs that met the goal), ok (goal met under
  // the target, or simply met when there is no target), last (ISO date of the last try), lastResult, mastered }.
  // Mastered = the goal met twice, each time under the target where one is set. It never goes back to false.
  function record(rec, pos, r, now) {
    rec = rec && typeof rec === 'object' ? rec : {};
    const out = { best: rec.best == null ? null : rec.best, tries: rec.tries | 0, wins: rec.wins | 0, ok: rec.ok | 0, last: rec.last || null, lastResult: rec.lastResult || null, mastered: !!rec.mastered };
    const ms = Math.max(0, Math.round(+r.ms || 0)), met = !!r.metGoal;
    out.tries++; out.last = now || new Date().toISOString();
    out.lastResult = { result: r.result || null, ms, plies: r.plies == null ? null : r.plies, met };
    if (met) {
      out.wins++;
      if (out.best == null || ms < out.best) out.best = ms;
      if (!pos.targetMs || ms < pos.targetMs) out.ok++;
    }
    out.mastered = out.mastered || out.ok >= 2;
    return out;
  }
  // stats() per the contract. KP_win and rook2_convert need every position of their group mastered: the plan asks for these
  // drills "until automatic", and one lucky win against the engine is not that.
  function statsOf(posMap) {
    const pm = posMap || {}, get = (id) => pm[id] || {};
    const of = (pred) => CAT.filter(pred);
    const bestOf = (kind) => { const t = of((p) => p.kind === kind).map((p) => get(p.id).best).filter((v) => v != null); return t.length ? Math.min.apply(null, t) : null; };
    const allMastered = (list) => list.length > 0 && list.every((p) => !!get(p.id).mastered);
    const s2 = of((p) => p.set === 'S2');
    return {
      KQ_ms_best: bestOf('KQ'),
      KR_ms_best: bestOf('KR'),
      KP_win: allMastered(of((p) => p.kind === 'KP' && p.goal === 'win')),
      rook2_convert: allMastered(of((p) => p.kind === 'R2')),
      mastered: s2.filter((p) => !!get(p.id).mastered).length,
      total: s2.length,
      perPos: JSON.parse(JSON.stringify(pm)),
    };
  }
  const fmt = (ms) => { if (ms == null) return '–'; const s = Math.round(ms / 1000); return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0'); };

  if (typeof module !== 'undefined' && module.exports) { module.exports = { catalogue: CAT, sets: SETS, record, statsOf, fmt, KQR_MS }; return; }

  // ---------- browser: store, screen, drills ---------------------------------------------------------------------------------
  const $ = (id) => document.getElementById(id);
  const KEY = 'ghostlap-endgames-v1';
  let store = {};
  try { const raw = JSON.parse(localStorage.getItem(KEY) || '{}'); if (raw && typeof raw === 'object') store = raw; } catch (e) { /* private mode: keep in memory */ }
  const persist = () => { try { localStorage.setItem(KEY, JSON.stringify(store)); } catch (e) {} };
  const who = () => (window.__coach && window.__coach.player) || 'jesse';
  const posMap = () => ((store[who()] || {}).pos) || {};
  const byId = (id) => CAT.find((p) => p.id === id);

  // the screen and its styles, created here so index.html stays untouched (.eg- prefix throughout)
  const CSS = `
  #endgames { overflow-y: auto; -webkit-overflow-scrolling: touch; touch-action: pan-y; background: var(--bg);
    padding: calc(var(--st) + 10px) calc(var(--sr) + 16px) calc(var(--sb) + 28px) calc(var(--sl) + 16px); --sq: calc(min(100vw - 72px, 300px) / 8); }   /* square colours, pieces and marks come from the board template on <html> (index.html) */
  #endgames [hidden] { display: none !important; }
  .eg-sets { display: flex; flex-wrap: wrap; gap: 8px; margin: 2px 0 12px; }
  .eg-sum { margin-bottom: 4px; }
  .eg-sum .srow { min-height: 30px; } .eg-sum b { font-weight: 700; font-size: 15px; }
  .eg-sum b.ok { color: var(--green); }
  .eg-blurb { margin: -2px 0 10px; }
  .eg-list { display: grid; gap: 10px; }
  .eg-pos { background: var(--panel); border: 1px solid var(--line); border-left: 4px solid var(--line); border-radius: 14px; padding: 10px 12px 11px; display: grid; gap: 4px; }
  .eg-pos.done { border-left-color: var(--green); }
  .eg-top { display: flex; align-items: baseline; gap: 8px; }
  .eg-t { font-weight: 700; font-size: 16px; flex: 1; min-width: 0; }
  .eg-goal { font-size: 11px; letter-spacing: .12em; text-transform: uppercase; font-weight: 800; padding: 2px 8px; border-radius: 999px; border: 1px solid var(--line); white-space: nowrap; }
  .eg-goal.win { color: var(--amber); border-color: rgba(242,178,76,.5); } .eg-goal.draw { color: var(--ghost); border-color: rgba(169,210,255,.45); }
  .eg-sub { color: var(--dim); font-size: 12px; }
  .eg-note { margin: 2px 0 0; font-size: 14px; line-height: 1.4; color: var(--text); }
  .eg-row { display: flex; align-items: center; gap: 8px; margin-top: 6px; }
  .eg-stat { flex: 1; min-width: 0; color: var(--dim); font-size: 12px; line-height: 1.35; }
  .eg-stat .eg-tick { color: var(--green); font-weight: 800; }
  .eg-row .pill { padding: 8px 12px; }
  .eg-row .btn { height: 40px; padding: 0 18px; font-size: 15px; flex: none; }
  .eg-brow { display: flex; justify-content: center; margin-top: 8px; }
  .eg-warn { color: var(--amber); }
  `;
  document.head.appendChild(Object.assign(document.createElement('style'), { textContent: CSS }));
  document.body.insertAdjacentHTML('beforeend', `
<section id="endgames" class="screen">
  <div class="wrap">
    <div class="cbar"><button class="back" id="egBack" aria-label="Back">&#8249;</button><h1>ENDGAMES</h1></div>
    <p class="chint">Set positions you play out against the engine at full strength, with a clock running. A win is played to mate; a draw means you hold it until the game is drawn. Mastered means the goal met twice, under the target time where there is one.</p>
    <div class="eg-sets" id="egSets"></div>
    <div class="cset eg-sum" id="egSum"></div>
    <p class="chint eg-warn" id="egNoDrill" hidden>Drills need the coach to be loaded. Try again in a moment.</p>
    <div id="egList"></div>
  </div>
</section>`);

  let filter = 'all', doneCb = null, peek = null;
  const FILTERS = [['all', 'All'], ['S0', 'Stage 0'], ['S1', 'Stage 1'], ['S2', 'Stage 2']];
  const sideName = (c) => (c === 'w' ? 'White' : 'Black');
  function statusLine(p, rec) {
    if (!rec || !rec.tries) return p.targetMs ? 'Not tried yet. Target ' + fmt(p.targetMs) + '.' : 'Not tried yet.';
    const bits = [];
    if (rec.best != null) bits.push('Best ' + fmt(rec.best));
    bits.push(rec.tries + (rec.tries === 1 ? ' try' : ' tries'));
    bits.push(rec.wins + ' ' + (p.goal === 'win' ? (rec.wins === 1 ? 'win' : 'wins') : 'held'));
    if (p.targetMs && !rec.mastered) bits.push(Math.min(2, rec.ok) + '/2 under ' + fmt(p.targetMs));
    return bits.join(' · ');
  }
  function renderSummary() {
    const s = statsOf(posMap()), el = $('egSum');
    const row = (k, v, ok) => '<div class="srow"><span class="k">' + k + '</span><b class="num' + (ok ? ' ok' : '') + '">' + v + '</b></div>';
    el.innerHTML = row('Queen mate, best', fmt(s.KQ_ms_best), s.KQ_ms_best != null && s.KQ_ms_best < KQR_MS)
      + row('Rook mate, best', fmt(s.KR_ms_best), s.KR_ms_best != null && s.KR_ms_best < KQR_MS)
      + row('K+P vs K', s.KP_win ? 'Mastered' : 'Not yet', s.KP_win)
      + row('Rook ending, two up', s.rook2_convert ? 'Mastered' : 'Not yet', s.rook2_convert)
      + row('The twenty', s.mastered + ' / ' + s.total, s.mastered >= s.total);
  }
  function render() {
    const sets = $('egSets'); sets.innerHTML = '';
    for (const [k, label] of FILTERS) {
      const b = document.createElement('button'); b.className = 'pill' + (filter === k ? ' on' : ''); b.textContent = label; b.dataset.set = k;
      b.onclick = () => { filter = k; peek = null; render(); }; sets.appendChild(b);
    }
    renderSummary();
    const can = !!(window.__coach && window.__coach.drill);
    $('egNoDrill').hidden = can;
    const list = $('egList'), pm = posMap(); list.innerHTML = '';
    for (const set of ['S0', 'S1', 'S2']) {
      if (filter !== 'all' && filter !== set) continue;
      const items = CAT.filter((p) => p.set === set);
      const h = document.createElement('h2'); h.textContent = SETS[set].name; list.appendChild(h);
      const bl = document.createElement('p'); bl.className = 'chint eg-blurb'; bl.textContent = SETS[set].blurb; list.appendChild(bl);
      const wrap = document.createElement('div'); wrap.className = 'eg-list';
      for (const p of items) {
        const rec = pm[p.id], card = document.createElement('div');
        card.className = 'eg-pos' + (rec && rec.mastered ? ' done' : ''); card.dataset.id = p.id;
        const toMove = p.fen.split(' ')[1];
        card.innerHTML = '<div class="eg-top"><span class="eg-t"></span><span class="eg-goal"></span></div><div class="eg-sub"></div><p class="eg-note"></p>'
          + '<div class="eg-row"><span class="eg-stat"></span><button class="pill eg-look">Board</button><button class="btn primary eg-play">Play</button></div>';
        card.querySelector('.eg-t').textContent = p.title;
        const g = card.querySelector('.eg-goal'); g.textContent = p.goal === 'win' ? 'Win' : 'Draw'; g.classList.add(p.goal);
        card.querySelector('.eg-sub').textContent = 'You play ' + sideName(p.you) + ' · ' + (toMove === p.you ? 'your move' : sideName(toMove) + ' moves first') + (p.targetMs ? ' · target ' + fmt(p.targetMs) : '');
        card.querySelector('.eg-note').textContent = p.note;
        const st = card.querySelector('.eg-stat'); st.textContent = statusLine(p, rec);
        if (rec && rec.mastered) { const t = document.createElement('span'); t.className = 'eg-tick'; t.textContent = ' ✓ mastered'; st.appendChild(t); }
        const play = card.querySelector('.eg-play'); play.disabled = !can; play.onclick = () => drill(p.id);
        card.querySelector('.eg-look').onclick = () => { peek = peek === p.id ? null : p.id; drawPeek(); };
        wrap.appendChild(card);
      }
      list.appendChild(wrap);
    }
    drawPeek();
  }
  // one small preview board at a time, under the card that asked for it, oriented for the side you play
  function drawPeek() {
    const old = document.querySelector('#egList .eg-brow'); if (old) old.remove();
    for (const b of document.querySelectorAll('#egList .eg-look')) b.classList.toggle('on', b.closest('.eg-pos').dataset.id === peek);
    const p = peek && byId(peek), card = p && document.querySelector('#egList .eg-pos[data-id="' + p.id + '"]');
    if (!card || !window.__coach || !window.__coach.renderBoard) return;
    const row = document.createElement('div'); row.className = 'eg-brow';
    const bd = document.createElement('div'); bd.className = 'board'; row.appendChild(bd); card.appendChild(row);
    const c = new Chess(p.fen);
    window.__coach.renderBoard(bd, c, { flip: p.you === 'b', check: c.in_check() });
  }

  function hideOthers() { for (const el of document.querySelectorAll('.screen.on')) if (el.id !== 'endgames') el.classList.remove('on'); }
  function show() { hideOthers(); render(); $('endgames').classList.add('on'); }
  function open(opts) {
    opts = opts || {};
    filter = ['S0', 'S1', 'S2'].includes(opts.set) ? opts.set : 'all';
    doneCb = typeof opts.onDone === 'function' ? opts.onDone : null;
    peek = null; show(); $('endgames').scrollTo(0, 0);
  }
  function close() {
    $('endgames').classList.remove('on');
    const cb = doneCb; doneCb = null;
    if (cb) cb(statsOf(posMap())); else if (window.__hub) window.__hub.show();
  }
  // Play: hand the position to the coach. Every finished run (Again included) comes back through onDone; Back returns here
  // with the card scrolled into view.
  function drill(id) {
    const p = byId(id); if (!p || !window.__coach || !window.__coach.drill) return false;
    const player = who();
    $('endgames').classList.remove('on');
    window.__coach.drill({ fen: p.fen, you: p.you, title: p.title, goal: p.goal, targetMs: p.targetMs, cue: p.cue, trap: p.trap,
      onDone: (r) => done(p, player, r || {}),
      onBack: () => { show(); const el = document.querySelector('#egList .eg-pos[data-id="' + p.id + '"]'); if (el && el.scrollIntoView) el.scrollIntoView({ block: 'center' }); } });
    return true;
  }
  function done(p, player, r) {
    const s = store[player] && typeof store[player] === 'object' ? store[player] : (store[player] = {});
    if (!s.pos || typeof s.pos !== 'object') s.pos = {};
    s.pos[p.id] = record(s.pos[p.id], p, r);
    persist();
    if ($('endgames').classList.contains('on')) render();
    return s.pos[p.id];   // the coach's drill review names the best time from it
  }

  $('egBack').onclick = close;
  if (window.__coach && window.__coach.on) window.__coach.on('player', () => { if ($('endgames').classList.contains('on')) render(); });
  window.__endgames = { open, close, stats: () => statsOf(posMap()), drill, catalogue: CAT,
    get player() { return who(); }, get filter() { return filter; } };
})();
