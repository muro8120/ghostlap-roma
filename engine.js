// Ghostlap Roma: chess engine wrapper (Stockfish 19 Lite WASM) and the tough coach's verdicts.
// Runs in the browser (window.ChessEngine, worker transport) and under node (module.exports,
// caller-supplied transport) so the pure helpers and the engine plumbing can be unit tested.
(function (root) {
  'use strict';

  const NODE = typeof window === 'undefined';
  const ChessLib = () => (NODE ? require(require('path').join(__dirname, 'vendor/chess.js')).Chess : root.Chess);
  const START = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
  const MATE_CP = 10000;   // cp reported for a mate score (clamp to ±2000 for display maths)
  const CLAMP = 2000;
  const EVAL_CAP = 4000;   // ms safety cap on evaluate so a phone never hangs on a deep search
  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
  const cl = (v) => clamp(v || 0, -CLAMP, CLAMP);

  // ---------- transport ---------------------------------------------------------
  function workerTransport() {
    const w = new Worker('vendor/stockfish-19-lite-single.js');
    let cb = null;
    w.onmessage = (e) => { if (cb) cb(typeof e.data === 'string' ? e.data : String(e.data)); };
    return { send: (c) => w.postMessage(c), onLine: (f) => { cb = f; }, terminate: () => w.terminate() };
  }

  // ---------- engine ---------------------------------------------------------------
  function create(opts) {
    opts = opts || {};
    const tr = opts.transport || workerTransport();
    let elo = opts.elo || 1600, applied = null, multipv = 1, dead = false;
    let cur = null;                 // the running search: { resolve, lines:{}, depth }
    const readyQ = [];              // resolvers waiting for readyok, in order
    let uciokRes = null;
    let q = Promise.resolve();      // every search goes through here, one at a time

    const send = (c) => { if (!dead) tr.send(c); };
    const sync = () => new Promise((res) => { readyQ.push(res); send('isready'); });
    const run = (fn) => { const p = q.then(fn); q = p.catch(() => {}); return p; };

    tr.onLine((line) => {
      if (line.startsWith('info ')) { if (cur) parseInfo(line, cur); return; }
      if (line.startsWith('bestmove')) {
        const s = cur; cur = null;
        if (s) s.resolve(line.split(/\s+/)[1] || '(none)');
        return;
      }
      if (line === 'readyok') { const r = readyQ.shift(); if (r) r(); return; }
      if (line === 'uciok' && uciokRes) { uciokRes(); uciokRes = null; }
    });

    const readyP = new Promise((res) => { uciokRes = res; })
      .then(() => { send('ucinewgame'); return sync(); });
    send('uci');

    // Which strength settings the engine currently holds: 'play' (user elo) or 'full'.
    function setMode(mode) {
      if (applied === mode) return Promise.resolve();
      if (mode === 'full') {
        send('setoption name UCI_LimitStrength value false');
        send('setoption name Skill Level value 20');
      } else if (elo >= 1320) {
        send('setoption name Skill Level value 20');
        send('setoption name UCI_LimitStrength value true');
        send('setoption name UCI_Elo value ' + Math.min(3190, Math.round(elo)));
      } else {
        send('setoption name UCI_LimitStrength value false');
        send('setoption name Skill Level value ' + clamp(Math.round(((elo - 800) / 519) * 6), 0, 6));
      }
      applied = mode;
      return sync();
    }
    function setMultiPV(n) {
      if (n === multipv) return Promise.resolve();
      multipv = n;
      send('setoption name MultiPV value ' + n);
      return sync();
    }
    // Send `go ...` for fen and resolve with the bestmove string once the search ends.
    function search(fen, go, lines) {
      return new Promise((resolve) => {
        cur = { resolve, lines: lines || {}, depth: 0 };
        send('position fen ' + fen);
        send(go);
      });
    }

    const eng = {
      ready: () => readyP,
      setStrength(e) {
        e = clamp(Math.round(e) || 1600, 800, 3190);
        if (e === elo) return;
        elo = e;
        if (applied === 'play') applied = null;
      },
      play(fen) {
        return run(async () => {
          await readyP;
          await setMode('play');
          const k = (clamp(elo, 800, 3190) - 800) / (3190 - 800);
          const ms = Math.round(150 + 750 * k), depth = Math.min(14, 4 + Math.floor(elo / 300));
          const mv = await search(fen || START, 'go movetime ' + ms + ' depth ' + depth);
          return { move: mv === '(none)' ? null : mv };
        });
      },
      evaluate(fen, o) {
        o = o || {};
        const depth = o.depth || 12, mpv = o.multipv || 1;
        fen = fen || START;
        return run(async () => {
          await readyP;
          const term = terminal(fen);
          if (term) return term;
          await setMode('full');
          await setMultiPV(mpv);
          const s = {};
          const mv = await search(fen, 'go depth ' + depth + ' movetime ' + EVAL_CAP, s);
          if (mv === '(none)') return terminal(fen) || { cp: 0, mate: null, best: null, pv: [], lines: [], depth: 0 };
          const white = fen.split(' ')[1] !== 'b';
          const lines = Object.keys(s).map(Number).sort((a, b) => a - b).map((k) => toWhite(s[k], white));
          const top = lines[0] || { cp: 0, mate: null, pv: [mv], depth: 0 };
          return { cp: top.cp, mate: top.mate, best: mv, pv: top.pv.length ? top.pv : [mv], lines, depth: top.depth };
        });
      },
      stop() { if (cur) send('stop'); },
      terminate() {
        dead = true;
        if (cur) { const s = cur; cur = null; s.resolve('(none)'); }
        try { tr.terminate(); } catch (e) {}
      },
      get elo() { return elo; },
    };
    return eng;
  }

  // Keep the deepest line per multipv (bound lines only if nothing better is known).
  function parseInfo(line, s) {
    const d = /\bdepth (\d+)/.exec(line), sc = /\bscore (cp|mate) (-?\d+)/.exec(line);
    if (!d || !sc) return;
    const bound = /\b(lower|upper)bound\b/.test(line);
    const k = +((/\bmultipv (\d+)/.exec(line) || [0, 1])[1]), depth = +d[1];
    const prev = s.lines[k];
    if (prev && (prev.depth > depth || (prev.depth === depth && bound))) return;
    const pv = (/\bpv (.+)$/.exec(line) || [0, ''])[1].trim();
    s.lines[k] = { depth, kind: sc[1], v: +sc[2], pv: pv ? pv.split(/\s+/) : [] };
  }
  function toWhite(l, white) {
    const sgn = white ? 1 : -1;
    if (l.kind === 'mate') {
      const m = l.v * sgn;
      return { cp: m === 0 ? -sgn * MATE_CP : (m > 0 ? MATE_CP : -MATE_CP), mate: m, pv: l.pv, depth: l.depth };
    }
    return { cp: l.v * sgn, mate: null, pv: l.pv, depth: l.depth };
  }
  // Checkmate / stalemate need no search: mate 0 against the side to move, or a dead 0.
  function terminal(fen) {
    const Chess = ChessLib();
    if (!Chess) return null;
    const c = new Chess(fen);
    if (c.in_checkmate()) return { cp: c.turn() === 'w' ? -CLAMP : CLAMP, mate: 0, best: null, pv: [], lines: [], depth: 0 };
    if (c.in_stalemate() || c.insufficient_material()) return { cp: 0, mate: null, best: null, pv: [], lines: [], depth: 0 };
    return null;
  }

  // ---------- pure helpers --------------------------------------------------------
  function label(loss) {
    return loss <= 5 ? 'best' : loss <= 20 ? 'great' : loss <= 50 ? 'good' : loss <= 100 ? 'inaccuracy' : loss <= 250 ? 'mistake' : 'blunder';
  }
  const BAD = { inaccuracy: 1, mistake: 1, blunder: 1 };

  function rate(r) {
    const sgn = r.color === 'w' ? 1 : -1;
    const gain = (cl(r.cpAfter) - cl(r.cpBefore)) * sgn;
    const loss = Math.max(0, -gain);
    const mine = (m) => m != null && m !== 0 && Math.sign(m) === sgn;      // mover is mating
    const theirs = (m) => m != null && m !== 0 && Math.sign(m) === -sgn;   // mover is getting mated
    let lab;
    if (r.onlyMove) lab = 'forced';
    else if (r.played && r.best && r.played === r.best) lab = 'best';
    else if (mine(r.mateBefore) && !mine(r.mateAfter)) lab = 'blunder';
    else if (theirs(r.mateAfter) && !theirs(r.mateBefore)) lab = 'blunder';
    else lab = label(loss);
    return { loss, label: lab };
  }

  // chess.com-like: each loss (cp) becomes a win-probability drop from a level game, then
  // 103.17 * exp(-0.04354 * drop) - 3.17, clamped 0..100, averaged.
  function accuracy(losses) {
    if (!losses || !losses.length) return 100;
    let sum = 0;
    for (const l of losses) {
      const drop = 50 * (2 / (1 + Math.exp(-0.00368208 * Math.max(0, cl(l)))) - 1);
      sum += clamp(103.17 * Math.exp(-0.04354 * drop) - 3.17, 0, 100);
    }
    return Math.round((sum / losses.length) * 10) / 10;
  }

  // ---------- the coach ---------------------------------------------------------------
  const P = (c) => ((c.loss || 0) / 100).toFixed(1);
  const S = (c) => c.san || 'that';
  const B = (c) => c.bestSan || 'the obvious move';
  const JABS = {
    best: [
      () => 'Correct. Don\'t let it go to your head.',
      (c) => S(c) + '. Fine. That is what the position asked for, nothing more.',
      () => 'Yes. The engine agrees with you, which should worry the engine.',
      () => 'Right move. Make a habit of it and we can skip the rest of these talks.',
      (c) => S(c) + ' was the move. Enjoy the feeling, it rarely lasts.',
      () => 'Accurate. I will note the date.',
      () => 'Best move. Even a stopped clock, and so on.',
      () => 'No complaints. Write that down, it will not happen often.',
    ],
    great: [
      (c) => 'Nearly. ' + B(c) + ' was a shade better, but I will allow it.',
      (c) => S(c) + '. Good enough. Not perfect, which is different.',
      () => 'A strong move. Strong, not best. Keep the distinction in mind.',
      (c) => 'Close. ' + B(c) + ' was crisper. You are within rounding error of competent.',
      () => 'Solid. Nobody will frame it, but nobody will laugh either.',
      (c) => S(c) + ' holds up. ' + B(c) + ' would have held up better.',
      () => 'Acceptable. The engine shrugged, which from it is praise.',
    ],
    good: [
      (c) => 'Playable. ' + B(c) + ' was the real move and it was not hiding.',
      (c) => S(c) + ' gives away ' + P(c) + '. Small change, but it adds up, like your other habits.',
      () => 'Fine. Not a plan, just a move. We will talk about the difference one day.',
      (c) => 'You saw a move. You did not see ' + B(c) + '. There is a gap there.',
      () => 'Decent. The kind of move that loses nothing and wins nothing. A draw offer in disguise.',
      (c) => S(c) + '. Reasonable. ' + B(c) + ' was sitting right there, mind you.',
      () => 'I have seen worse. From you, mostly.',
    ],
    inaccuracy: [
      (c) => 'Playable. Not what I would have played. ' + B(c) + ' was sitting right there.',
      (c) => S(c) + ' drops ' + P(c) + '. You did not calculate, you hoped.',
      (c) => 'An inaccuracy. ' + B(c) + ' kept everything together. ' + S(c) + ' loosens the knot.',
      () => 'That is a move made with the hand, not the head.',
      (c) => 'Minus ' + P(c) + '. Not fatal. Not good. Somewhere in the middle, like the move.',
      (c) => 'Why ' + S(c) + '? Think about it. I will wait. ' + B(c) + ' was better.',
      () => 'Sloppy. The position wanted precision and got a shrug.',
      (c) => 'You are drifting. ' + B(c) + ' was the move, and you did not even look at it.',
    ],
    mistake: [
      (c) => 'A mistake. ' + S(c) + ' hands over ' + P(c) + ' for nothing I can see.',
      (c) => B(c) + ' was the move. ' + S(c) + ' was the move you played. These are not the same.',
      (c) => 'Minus ' + P(c) + '. That is not an accident, that is a decision. A poor one.',
      (c) => 'What did ' + S(c) + ' threaten? Nothing. What did it allow? Plenty.',
      () => 'The position was fine. Was. Past tense.',
      (c) => 'You had ' + B(c) + '. You chose ' + S(c) + '. I would like to hear the reasoning, briefly.',
      () => 'A mistake. The engine did not flinch, but I did.',
      (c) => 'That costs ' + P(c) + ' pawns. Your opponent did not have to earn them.',
    ],
    blunder: [
      (c) => 'You just handed over ' + P(c) + ' for nothing. I hope it was worth the view.',
      (c) => S(c) + '?? A blunder. ' + B(c) + ' was there, and it was not subtle.',
      (c) => 'Minus ' + P(c) + '. One move. That is how long a good position lasts around you.',
      (c) => 'Do you check what your opponent can do before you move? ' + S(c) + ' says no.',
      () => 'A blunder. The clean kind, with no excuse attached.',
      (c) => 'Everything you built, gone with ' + S(c) + '. ' + B(c) + ' was the move. It still is, in a way.',
      () => 'I would call that a gift, but gifts are usually wanted.',
      (c) => S(c) + '. I looked for the idea. There is no idea.',
      (c) => 'That is ' + P(c) + ' pawns out of the window. Next time, look out of the window first.',
    ],
    mated: [
      (c) => S(c) + '?? That allows mate. ' + B(c) + ' kept the king alive, which is usually the aim.',
      () => 'You walked into a forced mate. The checks were there to be counted and you did not count them.',
      (c) => 'Mate is coming and ' + S(c) + ' invited it in. Look at every check before you move. Every one.',
      (c) => 'That loses by force. ' + B(c) + ' was the only way to stay in the game.',
      () => 'A mating net, and you tied it yourself. The king does not defend itself.',
      (c) => S(c) + '. Your opponent now has a forced mate, and they did not have to work for it.',
      () => 'The position is over. Not lost, over. Next time, ask what their queen does after your move.',
    ],
    forced: [
      () => 'Forced. Even you could not get that wrong. Well, you could, but you did not.',
      () => 'The only move. Congratulations on finding the one legal idea.',
      () => 'Forced. No credit, no blame. The position played itself.',
      () => 'One move available. You played it. We move on.',
      () => 'Forced. Do not mistake this for a decision.',
      () => 'The only legal move. I would hold the applause.',
    ],
    streak: [
      (c) => 'That is ' + c.streak + ' poor moves in a row. This is no longer bad luck, it is a style.',
      (c) => c.streak + ' in a row. Stop. Breathe. Look at their last move before you play yours.',
      (c) => 'Another one. ' + c.streak + ' running. At this point I am just taking notes for the post-mortem.',
      (c) => c.streak + ' bad moves on the trot. The position is not the problem here.',
      (c) => 'A streak of ' + c.streak + '. Your opponent is not winning this game, you are losing it.',
      (c) => c.streak + ' in a row. Slow down. The clock is not your enemy, you are.',
    ],
  };
  function jab(lab, ctx) {
    ctx = ctx || {};
    const ply = ctx.ply || 0;
    const sgn = ctx.color === 'b' ? -1 : 1;
    const mated = lab === 'blunder' && ctx.cpAfter != null && ctx.cpAfter * sgn <= -(MATE_CP - 500);
    const pool = (BAD[lab] && (ctx.streak || 0) >= 3) ? JABS.streak : mated ? JABS.mated : (JABS[lab] || JABS.good);
    return pool[ply % pool.length](ctx);
  }

  const ENDS = {
    win: {
      checkmate: ['Checkmate. You found it. I was starting to wonder.', 'You won. Try not to read too much into it.', 'Mate. Well, the engine let you. Still counts, apparently.', 'A win. Look at the accuracy before you celebrate.'],
      resign: ['It resigned. Generous of it.', 'A win by resignation. The engine had better things to do.', 'You won. The engine saw enough. So did I, and not all of it was good.'],
      any: ['A win. Enjoy it. The review is less flattering.', 'You won. Note the word "won" and not "played well".', 'Victory. Grudgingly noted.', 'Fine. You won. The blunders are still in the report.'],
    },
    loss: {
      checkmate: ['Checkmate. You walked into it with your eyes open.', 'Mated. The king was asking for help three moves ago and you ignored it.', 'Checkmate. Not a surprise, just a conclusion.', 'That is mate. You will want to see where it started. It started early.'],
      resign: ['You resigned. Honest, at least.', 'Resigned. The position agreed with you.', 'You gave up. The position had given up on you a while before.', 'A resignation. Let us look at the moves that made it necessary.'],
      any: ['You lost. We both saw it coming.', 'A loss. The review will explain why, in detail you will not enjoy.', 'Lost. The engine did not play well, you just played worse.', 'You lost. Blame the opening, if it helps. It was not the opening.'],
    },
    draw: {
      stalemate: ['Stalemate. You had a win and you tripped over the finish line.', 'A stalemate. Count the legal moves next time. All of them.', 'Drawn by stalemate. That was a full point, and you dropped half of it on the floor.'],
      repetition: ['Draw by repetition. Neither of you had a plan, so you shared the point.', 'Repetition. A draw agreed by exhaustion.', 'Three times the same position. Once would have done.'],
      material: ['Draw. Nobody has enough left to lose with.', 'Insufficient material. The game ran out before either of you did anything.'],
      fifty: ['Fifty moves without a point. Fifty.', 'A draw by the fifty-move rule. That is a long time to not win.'],
      any: ['A draw. Half a point, half an effort.', 'Draw. Not a loss. Not a win either, before you ask.', 'Drawn. The least interesting result, earned fairly.'],
    },
  };
  function endLine(result, reason, ctx) {
    const r = ENDS[result] || ENDS.draw;
    const pool = r[reason] || r.any;
    const seed = (ctx && (ctx.ply || ctx.moves || 0)) | 0;
    return pool[seed % pool.length];
  }

  // ---------- post-game analysis ---------------------------------------------------------
  const uciMove = (u) => ({ from: u.slice(0, 2), to: u.slice(2, 4), promotion: u.length > 4 ? u[4] : undefined });
  const empty = () => ({ best: 0, great: 0, good: 0, inaccuracy: 0, mistake: 0, blunder: 0, forced: 0 });

  async function analyze(eng, moves, opts) {
    opts = opts || {};
    const depth = opts.depth || 14, human = opts.color || 'w', sig = opts.signal;
    const Chess = ChessLib();
    const chess = new Chess();
    const fens = [chess.fen()], sans = [], legal = [];
    for (const u of moves) {
      const m = chess.move(uciMove(u));
      if (!m) break;
      sans.push(m.san); legal.push(u); fens.push(chess.fen());
    }
    const n = fens.length, evals = [];
    for (let i = 0; i < n; i++) {
      if (sig && sig.cancelled) return null;
      if (opts.onProgress) opts.onProgress(i, n);
      evals.push(await eng.evaluate(fens[i], { depth }));
    }
    if (sig && sig.cancelled) return null;
    if (opts.onProgress) opts.onProgress(n, n);

    const out = [], counts = { w: empty(), b: empty() }, losses = { w: [], b: [] }, streak = { w: 0, b: 0 };
    const scratch = new Chess();
    for (let i = 0; i < legal.length; i++) {
      const color = i % 2 === 0 ? 'w' : 'b', ev0 = evals[i], ev1 = evals[i + 1];
      scratch.load(fens[i]);
      const nLegal = scratch.moves().length;
      let bestSan = null;
      if (ev0.best) { const bm = scratch.move(uciMove(ev0.best)); if (bm) { bestSan = bm.san; scratch.undo(); } }
      const r = rate({ cpBefore: ev0.cp, cpAfter: ev1.cp, color, played: legal[i], best: ev0.best, mateBefore: ev0.mate, mateAfter: ev1.mate, onlyMove: nLegal === 1 });
      streak[color] = BAD[r.label] ? streak[color] + 1 : 0;
      const e = {
        ply: i + 1, color, uci: legal[i], san: sans[i], cpBefore: ev0.cp, cpAfter: ev1.cp, mateBefore: ev0.mate, mateAfter: ev1.mate,
        best: ev0.best, bestSan, loss: r.loss, label: r.label,
        reply: ev1.best || null, pv: (ev0.pv || []).slice(0, 8),                 // engine's best reply, and the line it expected
        pieces: (fens[i].split(' ')[0].match(/[nbrqNBRQ]/g) || []).length,      // non-pawn, non-king pieces on the board: endgame detection
      };
      e.jab = jab(r.label, { san: e.san, bestSan, loss: r.loss, ply: e.ply, streak: streak[color], cpAfter: ev1.cp, color });
      // did the engine's best reply simply take a piece we left hanging?
      e.hung = null;
      if (ev1.best) {
        scratch.load(fens[i + 1]);
        const t = scratch.get(ev1.best.slice(2, 4));
        if (t && t.color === color && t.type !== 'p' && t.type !== 'k') e.hung = t.type;
      }
      counts[color][r.label]++;
      losses[color].push(r.loss);
      out.push(e);
    }
    const mine = out.filter((e) => e.color === human);
    const worst = mine.filter((e) => e.loss > 0).sort((a, b) => b.loss - a.loss).slice(0, 3);
    const acc = { w: accuracy(losses.w), b: accuracy(losses.b) };
    const report = {
      accuracy: acc, counts, moves: out, evals: evals.map((e) => cl(e.cp)), worst,
      lesson: lesson(mine, fens, human), summary: summary(mine, acc[human], counts[human], fens, human),
    };
    return report;
  }

  function summary(mine, acc, c, fens, human) {
    const Chess = ChessLib(), last = new Chess(fens[fens.length - 1]);
    const mated = last.in_checkmate() ? (last.turn() === human ? 'loss' : 'win') : null;
    const bad = c.blunder + c.mistake;
    let l1 = mated === 'win' ? 'You won. ' : mated === 'loss' ? 'Mated. ' : '';
    l1 += 'Accuracy ' + Math.round(acc) + '%. ' + plural(c.blunder, 'blunder') + ', ' + plural(c.mistake, 'mistake') + ', ' + plural(c.inaccuracy, 'inaccuracy', 'inaccuracies') + '.';
    const w = mine.slice().sort((a, b) => b.loss - a.loss)[0];
    let l2;
    if (!mine.length) l2 = 'You did not move. Hard to judge, easy to criticise.';
    else if (bad === 0 && acc >= 90) l2 = 'Clean. Suspiciously clean. Do it again and I might believe it.';
    else if (bad === 0) l2 = 'No real blunders, just a slow leak of small ones. Death by a thousand shrugs.';
    else if (w) l2 = 'Worst moment: ' + moveNo(w) + ' ' + w.san + (w.label === 'blunder' ? '??' : '?') + ' (' + lossTxt(w) + '). ' + (w.bestSan ? w.bestSan + ' was the move.' : 'Anything else was better.');
    return l1 + '\n' + l2;
  }
  const allowsMate = (e) => e.mateAfter != null && e.mateAfter !== 0 && Math.sign(e.mateAfter) === (e.color === 'w' ? -1 : 1);
  const lossTxt = (e) => (allowsMate(e) ? 'mate' : '−' + P(e));
  const plural = (n, s, p) => n + ' ' + (n === 1 ? s : (p || s + 's'));
  const moveNo = (e) => Math.ceil(e.ply / 2) + (e.color === 'w' ? '.' : '...');

  // One paragraph: find the dominant failure pattern in the human's moves and say what to do about it.
  function lesson(mine, fens, human) {
    const Chess = ChessLib();
    const bad = mine.filter((e) => BAD[e.label]);
    const big = mine.filter((e) => e.label === 'blunder' || e.label === 'mistake');
    if (!mine.length) return 'No moves of yours to judge. Play a game and come back.';
    if (!bad.length) return 'Nothing to tear apart this time. Every move was within fifty centipawns of the engine, which makes you either very good or very lucky. Next game, same thing, and then we will talk about style.';
    const sgn = human === 'w' ? 1 : -1;
    const sum = (a) => a.reduce((t, e) => t + e.loss, 0);
    const phase = (e) => {
      const f = fens[e.ply - 1].split(' ')[0], pieces = (f.match(/[nbrqNBRQ]/g) || []).length;
      return e.ply <= 20 ? 'opening' : pieces <= 6 ? 'endgame' : 'middlegame';
    };
    const pats = [];
    // 1. hanging pieces: the engine's reply just takes what you left en prise
    const hung = big.filter((e) => e.hung);
    if (hung.length) pats.push({ score: sum(hung) * 1.3, text: hung.length + ' of your ' + big.length + ' worst moves left a piece hanging (' + hung.slice(0, 3).map((e) => moveNo(e) + ' ' + e.san).join(', ') + '). You are not losing on strategy, you are losing on arithmetic. Before every move, touch each of your pieces in your head and ask: is it defended, and what attacks it after this move lands? That one habit is worth more than any opening you will ever learn.' });
    // 2. allowed a forced mate
    const mates = mine.filter((e) => e.mateAfter != null && e.mateAfter !== 0 && Math.sign(e.mateAfter) === -sgn && !(e.mateBefore != null && e.mateBefore !== 0 && Math.sign(e.mateBefore) === -sgn));
    if (mates.length) pats.push({ score: sum(mates) * 1.2 + 400, text: 'You allowed a forced mate ' + (mates.length === 1 ? 'with ' + moveNo(mates[0]) + ' ' + mates[0].san : mates.length + ' times') + '. A mate threat is not a surprise, it is a queen or a rook pointed at your king with nothing in the way. Before you move, look at every check your opponent has and follow each one for two moves. If the answer is "I cannot stop it", the move you were about to play is wrong.' });
    // 3. captures that lost material
    const caps = big.filter((e) => e.san.includes('x'));
    if (caps.length >= 2 || (caps.length && caps.length >= big.length / 2)) pats.push({ score: sum(caps) * 1.1, text: caps.length + ' of your worst moves were captures (' + caps.slice(0, 3).map((e) => moveNo(e) + ' ' + e.san).join(', ') + '). You take because you can, not because you should, and the recapture is where it goes wrong. Count the exchange to the end before you start it: attackers, defenders, and what the square looks like when the dust settles. If the count is not clearly in your favour, do not take.' });
    // 4. queen wandering
    const queen = big.filter((e) => e.san[0] === 'Q');
    if (queen.length >= 2) pats.push({ score: sum(queen), text: 'Your queen cost you the game: ' + queen.length + ' of your worst moves were queen moves (' + queen.slice(0, 3).map((e) => moveNo(e) + ' ' + e.san).join(', ') + '). An early, busy queen is a target, not a weapon, and every tempo your opponent gains kicking it around is a tempo of development you never get back. Next game, the queen stays home until the minor pieces are out and the king is castled.' });
    // 5. blunders in a row (tilt)
    let run = [], best = [];
    for (const e of mine) { run = BAD[e.label] ? run.concat(e) : []; if (run.length > best.length) best = run; }
    if (best.length >= 3) pats.push({ score: sum(best) * 0.7, text: 'Your worst stretch was ' + best.length + ' bad moves in a row (from ' + moveNo(best[0]) + ' ' + best[0].san + '). One mistake is chess; three in a row is tilt. When you drop material, stop, and play the next move as if the game were starting from that position. The score does not matter, the next move does. Next game, after any blunder, take a deliberate ten seconds before you touch a piece.' });
    // 6. phase
    const byPhase = { opening: sum(bad.filter((e) => phase(e) === 'opening')), middlegame: sum(bad.filter((e) => phase(e) === 'middlegame')), endgame: sum(bad.filter((e) => phase(e) === 'endgame')) };
    const top = Object.keys(byPhase).sort((a, b) => byPhase[b] - byPhase[a])[0];
    const PH = {
      opening: 'Most of your damage was done in the opening, within the first ten moves. That is the one phase where you do not have to think, you have to remember. Pick one opening for White and one defence for Black, play them every game, and learn the first eight moves and why each one is played. Develop a piece per move, castle, and do not move the same piece twice before move ten.',
      middlegame: 'The opening was fine; the middlegame is where the points leaked. That is a calculation problem, not a knowledge problem. Next game, before each move, name every capture and every check your opponent has in reply, out loud if you must, and only then pick your move. Three candidate moves, then choose. Not one.',
      endgame: 'You held it until the endgame and then gave it away. Endgames are not about ideas, they are about counting: king activity, passed pawns, and the square of the pawn. Next game, when the queens come off, bring the king to the centre first and count every pawn race to the end before you commit to it.',
    };
    pats.push({ score: byPhase[top] * (big.length ? 0.8 : 1), text: PH[top] });
    pats.sort((a, b) => b.score - a.score);
    const w = mine.slice().sort((a, b) => b.loss - a.loss)[0];
    const head = big.length ? 'You made ' + plural(big.filter((e) => e.label === 'blunder').length, 'blunder') + ' and ' + plural(big.filter((e) => e.label === 'mistake').length, 'mistake') + ', the worst being ' + moveNo(w) + ' ' + w.san + ' (' + lossTxt(w) + ').'
      : 'No single disaster, just ' + plural(bad.length, 'inaccuracy', 'inaccuracies') + ' that added up.';
    return head + ' ' + pats[0].text;
  }

  const api = { create, rate, label, jab, endLine, accuracy, analyze, parseInfo, MATE_CP, CLAMP };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.ChessEngine = api;
})(typeof self !== 'undefined' ? self : this);
