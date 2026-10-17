// Ghostlap Roma: the TACTICS screen. Slow, mixed-theme puzzles from the lichess set (puzzles-data.js), the whole line, plus
// "own-game cards": the positions where you went wrong in your analysed games, one move to find, in Leitner boxes like learn.js.
// Builds its own <section> and <style> (prefix .pz-), so index.html only needs the script tag. Needs window.__coach (renderBoard,
// history, player) and window.Chess. window.__puzzles: open(opts), close(), stats(), plus test hooks answer(from, to), next(),
// giveUp() and the state getter.
(function () {
  'use strict';
  const $ = (id) => document.getElementById(id);
  const FILES = 'abcdefgh';
  const mv = (u) => ({ from: u.slice(0, 2), to: u.slice(2, 4), promotion: u[4] || undefined });
  const uciOf = (m) => m.from + m.to + (m.promotion || '');
  const fmtDate = (iso) => { try { return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }); } catch (e) { return ''; } };
  const secs = (ms) => { const s = Math.round(ms / 1000); return s < 60 ? s + ' s' : Math.floor(s / 60) + ' min ' + (s % 60) + ' s'; };
  const moveNo = (ply) => Math.floor((ply - 1) / 2) + 1 + (ply % 2 ? '. ' : '... ');
  // the research lines for the end sheet (slow, written, whole line; accuracy before speed)
  const SLOW = 'Slow down. Accuracy before speed.';
  const FAST = 'That was fast. The research says slow, written, whole line. Speed is not the goal here.';
  const THEME = { mateIn2: 'mate in 2', mateIn3: 'mate in 3', mateIn4: 'mate in 4', mateIn5: 'mate in 5', hangingPiece: 'hanging piece', backRankMate: 'back-rank mate',
    discoveredAttack: 'discovered attack', discoveredCheck: 'discovered check', doubleCheck: 'double check', trappedPiece: 'trapped piece', xRayAttack: 'x-ray',
    capturingDefender: 'capture the defender', quietMove: 'quiet move', advancedPawn: 'advanced pawn', defensiveMove: 'defensive move', kingsideAttack: 'kingside attack',
    queensideAttack: 'queenside attack', exposedKing: 'exposed king', attackingF2F7: 'f2/f7', underPromotion: 'underpromotion', enPassant: 'en passant',
    collinearMove: 'collinear move', rookEndgame: 'rook endgame', pawnEndgame: 'pawn endgame', queenEndgame: 'queen endgame', bishopEndgame: 'bishop endgame',
    knightEndgame: 'knight endgame', queenRookEndgame: 'queen and rook endgame', crushing: 'crushing', advantage: 'advantage' };
  const themeName = (t) => THEME[t] || t.replace(/Mate$/, ' mate').replace(/([a-z])([A-Z])/g, '$1 $2').toLowerCase();

  // ---------- the set: "id|fen|moves|rating|themes" rows, split once on first use ----------
  let SET = null;
  function set() {
    if (SET) return SET;
    SET = [];
    for (const row of String(window.PUZZLES || '').split('\n')) {
      const f = row.split('|'); if (f.length !== 5) continue;
      SET.push({ id: f[0], fen: f[1], moves: f[2].split(' '), rating: +f[3], themes: f[4].split(' ') });
    }
    return SET;
  }

  // ---------- store: per player, apart from the chess history ----------
  const KEY = 'ghostlap-puzzles-v1';
  let store = {};
  try { const raw = JSON.parse(localStorage.getItem(KEY) || '{}'); if (raw && typeof raw === 'object') store = raw; } catch (e) { /* private mode: keep in memory */ }
  const persist = () => { try { localStorage.setItem(KEY, JSON.stringify(store)); } catch (e) {} };
  const who = () => (window.__coach && window.__coach.player) || 'jesse';
  function mine() {
    const w = who(); let s = store[w];
    if (!s || typeof s !== 'object') s = store[w] = {};
    if (!Array.isArray(s.sessions)) s.sessions = [];
    if (!s.seen || typeof s.seen !== 'object') s.seen = {};
    if (!s.own || typeof s.own !== 'object') s.own = {};
    if (!Array.isArray(s.log)) s.log = [];
    if (!(s.ownS >= 0)) s.ownS = 0;   // the own-card session counter for the Leitner schedule (learn.js keeps the same per lesson)
    return s;
  }

  // ---------- own-game cards: every move of yours that lost 1.5 pawns or more, from the analysed games ----------
  // The card keeps its own fen/best, so it outlives the game dropping out of the 20-game history.
  function syncOwn() {
    const st = mine(), hist = (window.__coach && window.__coach.history) || [];
    let added = 0;
    for (const e of hist) {
      if (!e || !e.report || !Array.isArray(e.report.moves) || !Array.isArray(e.moves) || !e.id) continue;
      for (const r of e.report.moves) {
        if (!r || r.color !== e.you || !(r.loss >= 150) || !r.best || r.best === r.uci) continue;
        const key = e.id + ':' + r.ply; if (st.own[key]) continue;
        try {
          const c = new Chess();
          for (let i = 0; i < r.ply - 1; i++) if (!c.move(mv(e.moves[i]))) throw new Error('replay');
          if (c.turn() !== e.you) continue;
          const t = new Chess(c.fen()), b = t.move(mv(r.best)); if (!b) continue;
          const last = r.ply > 1 ? e.moves[r.ply - 2] : null;
          st.own[key] = { box: 1, last: null, fen: c.fen(), best: r.best, san: b.san, played: r.san || '', gameId: e.id, ply: r.ply, date: e.date || null, prev: last };
          added++;
        } catch (x) { /* a game that does not replay gives no card */ }
      }
    }
    if (added) persist();
    return added;
  }
  // Leitner, the same boxes and schedule as learn.js: box 1 every session, box 2 every other, box 3 every fourth. One
  // difference: learn.js skips a session with nothing due, but a tactics session always has set puzzles in it, so here every
  // session counts; otherwise a lone box-3 card would come back every time.
  const isDue = (b, s) => b <= 1 || (b === 2 && s % 2 === 0) || (b >= 3 && s % 4 === 0);
  function ownPlan() {
    const st = mine(), s = st.ownS;
    return { s, due: Object.keys(st.own).filter((k) => isDue(st.own[k].box || 1, s)) };
  }

  // ---------- the screen, built from here so index.html stays untouched ----------
  const CSS = `
  #puzzles { overflow-y: auto; -webkit-overflow-scrolling: touch; touch-action: pan-y; background: var(--bg); overflow-x: hidden;
    padding: calc(var(--st) + 10px) calc(var(--sr) + 16px) calc(var(--sb) + 28px) calc(var(--sl) + 16px); --sq: calc(min(100vw - 32px, 52vh) / 8);
    --sqL: #9aa7b8; --sqD: #4a5568; --crL: #2b3340; --crD: #c7d0dc; }
  [data-theme="wood"] #puzzles { --sqL: #f0d9b5; --sqD: #b58863; --crL: #7a5a3a; --crD: #f0d9b5; }
  [data-theme="modern"] #puzzles { --sqL: #eeeed2; --sqD: #769656; --crL: #6b7a4a; --crD: #eeeed2; }
  [data-theme="mono"] #puzzles { --sqL: #d5d8de; --sqD: #6e7480; --crL: #4a505c; --crD: #e4e7ec; }
  [data-theme="stone"] #puzzles { --sqL: #e6e2da; --sqD: #cdc8bf; --crL: #8f897f; --crD: #f6f3ee; --mint: 72,196,140; }
  #puzzles [hidden] { display: none !important; }
  #puzzles .brow { justify-content: center; margin-top: 4px; }
  #puzzles .bar { margin-bottom: 4px; } #puzzles .bar b { transition: width .3s; }
  .pz-head { display: flex; justify-content: space-between; align-items: baseline; gap: 10px; margin: 8px 0; }
  .pz-q { font-size: 22px; font-weight: 800; color: var(--pzc, var(--text)); min-width: 0; }
  .pz-q[data-k=right] { --pzc: var(--green); } .pz-q[data-k=wrong] { --pzc: var(--amber); }
  .pz-pos { color: var(--dim); font-size: 12px; white-space: nowrap; }
  .pz-note[data-k=right] { border-left-color: var(--green); } .pz-note[data-k=wrong] { border-left-color: var(--amber); } .pz-note[data-k=own] { border-left-color: var(--ghost); }
  .pz-tags { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 10px; }
  .pz-tag { font-size: 12px; font-weight: 700; color: var(--dim); background: var(--panel2); border: 1px solid var(--line); border-radius: 999px; padding: 3px 10px; }
  .pz-tag.pz-r { color: var(--text); border-color: rgba(242,178,76,.5); }
  .pz-tag.pz-own { color: var(--ghost); border-color: rgba(169,210,255,.45); }
  .pz-stats { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; margin: 14px 0 12px; }
  .pz-stats div { background: var(--panel); border: 1px solid var(--line); border-radius: 12px; padding: 10px 2px 8px; text-align: center; }
  .pz-stats b { display: block; font-size: 24px; font-weight: 800; } .pz-stats div:first-child b { color: var(--green); }
  .pz-stats small { font-size: 10px; letter-spacing: .1em; color: var(--dim); text-transform: uppercase; font-weight: 700; }
  .pz-line { background: var(--panel); border: 1px solid var(--line); border-left: 4px solid var(--amber); border-radius: 12px; padding: 10px 12px; font-size: 15px; line-height: 1.45; margin: 0 0 8px; }
  .pz-line.pz-ok { border-left-color: var(--green); }
  `;
  const HTML = `<section id="puzzles" class="screen">
  <div class="wrap">
    <div class="cbar"><button class="back" id="pzBack" aria-label="Back">&#8249;</button><h1>TACTICS</h1></div>
    <div class="opening" id="pzSub"></div>
    <div id="pzPlay">
      <div class="bar"><b id="pzBar" style="width:0"></b></div>
      <div class="pz-head"><div class="pz-q" id="pzQ">Your move</div><div class="pz-pos" id="pzPos"></div></div>
      <div class="brow"><div class="board" id="pzBoard"></div></div>
      <div class="lnote pz-note" id="pzNote"></div>
      <div class="pz-tags" id="pzTags" hidden></div>
      <div class="btns" style="margin-top:12px"><button class="btn" id="pzNext">I don't see it</button></div>
    </div>
    <div id="pzSum" hidden>
      <div class="endT" id="pzSumT">Session done</div>
      <div class="pz-stats"><div><b id="pzRight"></b><small>Right</small></div><div><b id="pzMean"></b><small>Mean time</small></div><div><b id="pzOwn"></b><small>Own cards</small></div></div>
      <div id="pzLines"></div>
      <p class="chint" id="pzSumMsg"></p>
      <div class="btns" style="margin-top:16px"><button class="btn primary" id="pzDone">Done</button></div>
    </div>
  </div>
</section>`;
  const style = document.createElement('style'); style.id = 'pzStyle'; style.textContent = CSS; document.head.appendChild(style);
  document.body.insertAdjacentHTML('beforeend', HTML);

  // ---------- a session ----------
  // S.queue: items { kind: 'own'|'set', id, fen, line (uci[], solver moves at odd indexes for 'set'), ... }
  // phases: 'intro' (their first move about to show), 'move' (your turn), 'reply' (their answer about to show), 'done' (line over), 'end' (summary)
  let S = null, sel = null, targets = [], timer = 0;
  function open(opts) {
    opts = opts || {};
    if (!window.__coach || !window.Chess) return null;
    clearTimeout(timer);
    const band = Array.isArray(opts.band) && opts.band.length === 2 ? [+opts.band[0], +opts.band[1]] : [500, 999];
    const count = Math.max(1, Math.round(+opts.count || 10)), minutes = +opts.minutes > 0 ? +opts.minutes : 15;
    syncOwn();
    const st = mine(), plan = ownPlan();
    // due own cards first (lowest box, then oldest game), at most half the session so it stays a mix with the set
    const ownKeys = plan.due.sort((a, b) => (st.own[a].box || 1) - (st.own[b].box || 1) || String(st.own[a].date).localeCompare(String(st.own[b].date)) || st.own[a].ply - st.own[b].ply)
      .slice(0, Math.ceil(count / 2));
    st.ownS = plan.s + 1; persist();
    const queue = ownKeys.map((k) => { const c = st.own[k]; return { kind: 'own', id: 'own:' + k, key: k, fen: c.fen, line: [c.best], san: c.san, played: c.played, ply: c.ply, date: c.date, prev: c.prev, box: c.box || 1 }; });
    for (const p of pickSet(band, count - queue.length, st)) queue.push({ kind: 'set', id: p.id, fen: p.fen, line: p.moves, rating: p.rating, themes: p.themes });
    S = { band, count, minutes, t0: Date.now(), queue, i: -1, done: [], onDone: typeof opts.onDone === 'function' ? opts.onDone : null, item: null, summary: null };
    for (const el of document.querySelectorAll('.screen.on')) el.classList.remove('on');
    $('pzSub').textContent = 'Rated ' + band[0] + '–' + band[1] + ' · ' + queue.length + ' puzzles · about ' + minutes + ' min';
    $('pzPlay').hidden = false; $('pzSum').hidden = true;
    $('puzzles').classList.add('on'); $('puzzles').scrollTo(0, 0);
    if (!queue.length) { finish(); return state(); }
    advance(); return state();
  }
  // unseen set puzzles in the band, shuffled, no two with the same main theme in a row; seen ones only when the band runs out
  function pickSet(band, n, st) {
    if (n <= 0) return [];
    const inBand = set().filter((p) => p.rating >= band[0] && p.rating <= band[1]);
    const shuffle = (a) => { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
    const pool = shuffle(inBand.filter((p) => !st.seen[p.id])).concat(shuffle(inBand.filter((p) => st.seen[p.id])));
    const out = [];
    while (out.length < n && pool.length) {
      const prev = out.length ? out[out.length - 1].themes[0] : null;
      let j = pool.findIndex((p) => p.themes[0] !== prev); if (j < 0) j = 0;
      out.push(pool.splice(j, 1)[0]);
    }
    return out;
  }
  function advance() {
    clearTimeout(timer); sel = null; targets = [];
    S.i++;
    const over = S.i >= S.queue.length || (S.done.length && Date.now() - S.t0 >= S.minutes * 60000);
    if (over) { finish(); return; }
    const q = S.queue[S.i], c = new Chess(q.fen);
    // set puzzles: the fen is before THEIR move, so the solver is the other side; own cards: the fen is before YOUR move
    S.item = { q, c, k: 0, right: true, shown: null, wrong: null, last: q.kind === 'own' && q.prev ? { from: q.prev.slice(0, 2), to: q.prev.slice(2, 4) } : null,
      you: q.kind === 'own' ? c.turn() : (c.turn() === 'w' ? 'b' : 'w'), t: 0, ms: 0, say: '', theirs: '' };
    if (q.kind === 'set') { S.item.phase = 'intro'; draw(); timer = setTimeout(() => theirMove(true), 700); }
    else { S.item.phase = 'move'; S.item.t = Date.now(); draw(); }
  }
  // the opponent's move from the line: the first one (lichess semantics: moves[0] is theirs) or a reply after yours
  function theirMove(first) {
    const it = S && S.item; if (!it || (it.phase !== 'intro' && it.phase !== 'reply')) return;
    const m = it.c.move(mv(it.q.line[it.k])); if (!m) { it.phase = 'done'; draw(); return; }
    it.k++; it.last = { from: m.from, to: m.to }; it.theirs = m.san; it.phase = 'move';
    if (first) it.t = Date.now();
    draw();
  }
  const expect = () => { const it = S && S.item; return it && it.phase === 'move' ? it.q.line[it.k] : null; };
  function tap(sq) {
    const it = S && S.item; if (!it || it.phase !== 'move') return;
    const t = sel && targets.find((x) => x.to === sq);
    if (t) { answer(sel, sq); return; }
    const p = it.c.get(sq);
    if (p && p.color === it.c.turn() && sq !== sel) { sel = sq; targets = it.c.moves({ square: sq, verbose: true }).map((m) => ({ to: m.to, capture: !!m.captured })); }
    else { sel = null; targets = []; }
    draw();
  }
  // a tap pair (or the test hook). Right: play it, then their reply. Wrong: the puzzle is lost, the right move is drawn,
  // and you still play it and the rest of the line, so the whole pattern is seen. A mate that is not the book move counts too.
  function answer(from, to) {
    const it = S && S.item; if (!it || it.phase !== 'move' || !from || !to) return null;
    const want = it.q.line[it.k], w = mv(want);
    const promo = from === w.from && to === w.to ? w.promotion : 'q';
    const t = new Chess(it.c.fen()), m = t.move({ from, to, promotion: promo });
    sel = null; targets = [];
    if (!m) { draw(); return { legal: false }; }
    const ok = uciOf(m) === want || (from === w.from && to === w.to) || t.in_checkmate();
    if (!ok) {
      if (it.right) { it.right = false; ownBox(it, false); }
      it.wrong = m.san; it.tried = { from: m.from, to: m.to, cls: 'red' }; it.shown = { from: w.from, to: w.to };
      it.say = 'Not that. The move is ' + sanOf(it.c, want) + '.';
      draw(); return { legal: true, ok: false, san: m.san, expect: want };
    }
    it.c.move({ from, to, promotion: promo }); it.k++; it.last = { from, to }; it.shown = null; it.wrong = null; it.tried = null;
    it.say = 'Right: ' + m.san + '.';
    if (it.c.in_checkmate() || it.k >= it.q.line.length) { lineDone(); return { legal: true, ok: true, san: m.san, done: true }; }
    it.phase = 'reply'; draw();
    timer = setTimeout(() => theirMove(false), 650);
    return { legal: true, ok: true, san: m.san };
  }
  const sanOf = (c, u) => { try { const t = new Chess(c.fen()), m = t.move(mv(u)); return m ? m.san : u; } catch (e) { return u; } };
  // "I don't see it": a missing move counts as wrong; the arrow shows it and you play it
  function giveUp() {
    const it = S && S.item; if (!it || it.phase !== 'move' || it.shown) return null;
    const want = it.q.line[it.k], w = mv(want);
    if (it.right) { it.right = false; ownBox(it, false); }
    it.shown = { from: w.from, to: w.to }; it.wrong = null; it.tried = null; it.say = 'The move is ' + sanOf(it.c, want) + '. Play it.';
    draw(); return { expect: want };
  }
  function ownBox(it, ok) {   // the first answer to an own card moves its box: right up one, wrong to box 1
    if (it.q.kind !== 'own' || it.boxed) return;
    it.boxed = true;
    const c = mine().own[it.q.key]; if (!c) return;
    c.box = ok ? Math.min(3, (c.box || 1) + 1) : 1; c.last = new Date().toISOString(); persist();
  }
  function lineDone() {
    const it = S.item, st = mine();
    if (it.right) ownBox(it, true);
    it.ms = Date.now() - it.t; it.phase = 'done';
    const rec = { id: it.q.id, right: it.right, ms: it.ms, date: new Date().toISOString() };
    if (it.q.kind === 'set') { rec.r = it.q.rating; st.seen[it.q.id] = 1; } else rec.own = 1;
    st.log.push(rec); if (st.log.length > 300) st.log.splice(0, st.log.length - 300);
    persist();
    S.done.push({ id: it.q.id, kind: it.q.kind, right: it.right, ms: it.ms });
    draw();
  }
  function next() {
    if (!S || !S.item || S.item.phase !== 'done') return null;
    advance(); return state();
  }
  function finish() {
    clearTimeout(timer);
    const st = mine(), n = S.done.length, right = S.done.filter((d) => d.right).length;
    const meanMs = n ? Math.round(S.done.reduce((a, d) => a + d.ms, 0) / n) : 0;
    const lines = [];
    if (n && right / n < 0.85) lines.push(SLOW);
    if (n && meanMs < 15000) lines.push(FAST);
    const sess = { date: new Date().toISOString(), band: S.band, n, right, meanMs, ids: S.done.map((d) => d.id) };
    if (n) { st.sessions.push(sess); if (st.sessions.length > 500) st.sessions.splice(0, st.sessions.length - 500); persist(); }
    const own = S.done.filter((d) => d.kind === 'own');
    S.summary = Object.assign({}, sess, { own: own.length, ownRight: own.filter((d) => d.right).length, lines });
    S.item = null; S.phase = 'end';
    $('pzPlay').hidden = true; $('pzSum').hidden = false;
    $('pzSumT').textContent = !n ? 'Nothing to play' : right === n ? 'All ' + n + ' right' : right + ' right of ' + n;
    $('pzRight').textContent = right + '/' + n; $('pzMean').textContent = n ? secs(meanMs) : '–';
    $('pzOwn').textContent = own.length ? S.summary.ownRight + '/' + own.length : '0';
    const box = $('pzLines'); box.innerHTML = '';
    const say = (t, ok) => { const p = document.createElement('p'); p.className = 'pz-line' + (ok ? ' pz-ok' : ''); p.textContent = t; box.appendChild(p); };
    if (!n) say('No puzzles in this band. Try another band.', false);
    else if (!lines.length) say('Accurate and unhurried. That is the way to do it.', true);
    for (const l of lines) say(l, false);
    const keys = Object.keys(st.own);
    $('pzSumMsg').textContent = keys.length ? 'Own-game cards: ' + keys.length + ', ' + keys.filter((k) => st.own[k].box >= 3).length + ' in box 3. Box 1 comes back every session, box 2 every other, box 3 every fourth.'
      : 'Own-game cards come from your analysed games: every move that cost 1.5 pawns or more becomes a card.';
    if (n && S.onDone) { try { S.onDone(S.summary); } catch (e) { console.error(e); } }
  }
  function draw() {
    const it = S && S.item; if (!it) return;
    const q = it.q, ph = it.phase, c = it.c, side = it.you === 'w' ? 'White' : 'Black';
    const arrows = [];   // your try in red, the right move in amber
    if (it.shown && it.tried) arrows.push(it.tried);
    if (it.shown) arrows.push({ from: it.shown.from, to: it.shown.to });
    window.__coach.renderBoard($('pzBoard'), c, { flip: it.you === 'b', sel, targets, last: it.last, check: c.in_check(), arrows, onTap: ph === 'move' ? tap : null, busy: ph !== 'move' });
    const Q = $('pzQ'), N = $('pzNote'), done = S.done.length;
    $('pzPos').textContent = (q.kind === 'own' ? 'Your game · box ' + q.box : 'Puzzle') + ' · ' + (S.i + 1) + ' of ' + S.queue.length;
    $('pzBar').style.width = Math.round(done / Math.max(1, S.queue.length) * 100) + '%';
    let k = '', head = '', note = '';
    if (ph === 'intro') { head = 'Watch their move'; note = side + ' to play after their move.'; }
    else if (ph === 'move') {
      if (it.shown) { k = 'wrong'; head = it.wrong ? 'Not that one' : 'Play the arrow'; note = (it.wrong ? 'You tried ' + it.wrong + '. ' : '') + it.say + ' Then play out the rest of the line.'; }
      else if (q.kind === 'own') {
        k = 'own'; head = 'Find the move';
        note = 'From your game' + (q.date ? ' on ' + fmtDate(q.date) : '') + ', move ' + moveNo(q.ply).trim() + ' ' + side + '. You played ' + q.played + ' there. One move to find. Tap a piece, then its square.';
      } else if (it.k <= 1) { head = 'Your move'; note = 'They played ' + it.theirs + '. Your move. Play the whole line.'; }
      else { k = it.right ? 'right' : 'wrong'; head = 'Your move'; note = it.say + ' They answered ' + it.theirs + '. Keep going.'; }
    } else if (ph === 'reply') { k = it.right ? 'right' : 'wrong'; head = it.right ? 'Right' : 'Good'; note = it.say + ' Their answer…'; }
    else if (ph === 'done') {
      k = it.right ? 'right' : 'wrong'; head = it.right ? 'Solved' : 'Seen, not solved';
      if (q.kind === 'own') note = (it.right ? 'Right: ' + q.san + ', the engine\'s move.' : 'The engine\'s move was ' + q.san + '. You played ' + q.played + ' in the game.') + ' The card is in box ' + ((mine().own[q.key] || {}).box || 1) + ' now.';
      else note = it.right ? 'The whole line, no slip. ' + secs(it.ms) + '.' : 'A slip in the line counts as wrong. You saw the whole pattern, which is the point. ' + secs(it.ms) + '.';
    }
    Q.dataset.k = N.dataset.k = k; Q.textContent = head; N.textContent = note;
    // themes and rating only after the line is over: no clue before solving
    const tags = $('pzTags'); tags.hidden = ph !== 'done'; tags.innerHTML = '';
    if (ph === 'done') {
      const add = (t, cls) => { const s = document.createElement('span'); s.className = 'pz-tag' + (cls ? ' ' + cls : ''); s.textContent = t; tags.appendChild(s); };
      if (q.kind === 'set') { add('Rated ' + q.rating, 'pz-r'); for (const t of q.themes) add(themeName(t)); }
      else add('Your game', 'pz-own');
    }
    const nb = $('pzNext');
    nb.hidden = ph === 'intro' || ph === 'reply' || (ph === 'move' && !!it.shown);
    nb.textContent = ph === 'done' ? (S.i + 1 >= S.queue.length || Date.now() - S.t0 >= S.minutes * 60000 ? 'Finish' : 'Next puzzle') : 'I don\'t see it';
    nb.className = 'btn' + (ph === 'done' ? ' primary' : '');
  }
  function close() {
    clearTimeout(timer);
    // a session left half way still counts what was played
    if (S && S.phase !== 'end' && S.done.length) {
      const st = mine(), n = S.done.length;
      st.sessions.push({ date: new Date().toISOString(), band: S.band, n, right: S.done.filter((d) => d.right).length, meanMs: Math.round(S.done.reduce((a, d) => a + d.ms, 0) / n), ids: S.done.map((d) => d.id), partial: true });
      persist();
    }
    S = null; sel = null; targets = [];
    $('puzzles').classList.remove('on');
    if (window.__hub) window.__hub.show();
  }
  function stats() {
    syncOwn();
    const st = mine(), last = st.sessions[st.sessions.length - 1] || null;
    const pct = (rows) => rows.length < 10 ? null : Math.round(rows.filter((r) => r.right).length / rows.length * 100);
    const setLog = st.log.filter((r) => !r.own);
    const keys = Object.keys(st.own), plan = ownPlan();
    return {
      sessions: st.sessions.length,
      last: last && { date: last.date, n: last.n, right: last.right, meanMs: last.meanMs },
      acc30: pct(setLog.slice(-30)),                                   // set puzzles only: own cards are engine-level, they would skew it
      acc30Easy: pct(setLog.filter((r) => r.r < 1000).slice(-30)),     // the easy band (under 1000), for the curriculum's slow_puzzle_accuracy_pct_easy
      ownCards: { total: keys.length, due: plan.due.length, box3: keys.filter((k) => st.own[k].box >= 3).length },
    };
  }
  function state() {
    if (!S) return null;
    const it = S.item;
    return { phase: it ? it.phase : 'end', i: S.i, n: S.queue.length, band: S.band, done: S.done.slice(), summary: S.summary,
      item: it && { kind: it.q.kind, id: it.q.id, fen: it.c.fen(), you: it.you, right: it.right, step: it.k, line: it.q.line.slice(), expect: expect(), shown: it.shown, rating: it.q.rating || null } };
  }

  $('pzBack').onclick = close; $('pzDone').onclick = close;
  $('pzNext').onclick = () => { const it = S && S.item; if (!it) return; if (it.phase === 'done') next(); else giveUp(); };
  window.__puzzles = { open, close, stats, answer, next, giveUp, sync: syncOwn, get state() { return state(); }, get count() { return set().length; } };
})();
