// Ghostlap Roma: the chess coach. Board, live move ratings, end-of-game sheet, post-game review, game history.
// Uses window.Chess (vendor/chess.js) and window.ChessEngine (engine.js) only. The hub calls window.__coach.open().
(function () {
  'use strict';
  const $ = (id) => document.getElementById(id);

  // ---------- saving --------------------------------------------------------
  const KEY = 'ghostlap-chess-v1';
  let save = { elo: 1600, color: 'w', games: [] };
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) save = Object.assign(save, JSON.parse(raw));
  } catch (e) { /* private mode: keep in memory */ }
  if (!Array.isArray(save.games)) save.games = [];
  if (!'wbr'.includes(save.color) || save.color.length !== 1) save.color = 'w';
  const clampElo = (e) => Math.max(800, Math.min(2850, Math.round((+e || 1600) / 50) * 50));
  save.elo = clampElo(save.elo);
  function persist() { try { localStorage.setItem(KEY, JSON.stringify(save)); } catch (e) {} }

  // ---------- helpers -------------------------------------------------------
  const GLYPH = { k: '♚', q: '♛', r: '♜', b: '♝', n: '♞', p: '♟' };
  const FILES = 'abcdefgh';
  const GOOD = { best: 1, great: 1, good: 1, forced: 1 };
  const SUFFIX = { inaccuracy: '?!', mistake: '?', blunder: '??' };
  const COLN = { w: 'White', b: 'Black', r: 'Random' };
  const RES = { win: 'WIN', loss: 'LOSS', draw: 'DRAW' };
  const uciOf = (m) => m.from + m.to + (m.promotion || '');
  const mv = (u) => ({ from: u.slice(0, 2), to: u.slice(2, 4), promotion: u[4] || undefined });
  const cap = (s) => s ? s[0].toUpperCase() + s.slice(1) : '';
  const clampCp = (e) => !e ? 0 : e.mate ? (e.mate > 0 ? 2000 : -2000) : Math.max(-2000, Math.min(2000, e.cp || 0));
  const pawns = (cp) => (cp > 0 ? '+' : cp < 0 ? '−' : '') + (Math.abs(cp) / 100).toFixed(1);
  const lossTxt = (loss) => loss >= 5 ? '−' + (loss / 100).toFixed(1) : '0.0';
  const moveNo = (ply) => Math.floor((ply - 1) / 2) + 1 + (ply % 2 ? '. ' : '... ');
  function sanOf(fen, uci) { try { const c = new Chess(fen); const m = c.move(mv(uci)); return m ? m.san : uci; } catch (e) { return uci; } }
  function fmtDate(iso) { try { return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }); } catch (e) { return ''; } }
  function sheet(id, on) { $(id).classList.toggle('on', on); }

  // ---------- board (one renderer for the game board and the replay board) ----
  // opts: { flip, sel, targets:[{to,capture}], last:{from,to}, check, arrow:{from,to}, onTap(sq) }
  function renderBoard(el, chess, o) {
    o = o || {};
    if (!el._built) {
      el._built = true; el.innerHTML = '';
      for (let i = 0; i < 64; i++) {
        const d = document.createElement('div'); d.className = 'sq';
        d.innerHTML = '<span class="pc"></span><b class="cr"></b><b class="cf"></b>';
        el.appendChild(d);
      }
      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      svg.setAttribute('viewBox', '0 0 8 8'); svg.setAttribute('class', 'arrow'); el.appendChild(svg); el._svg = svg;
      // stop iOS double-tap zoom / scroll from a board tap; keep the race canvas out of it
      el.addEventListener('touchstart', (e) => e.preventDefault(), { passive: false });
      el.addEventListener('pointerdown', (e) => {
        e.preventDefault(); e.stopPropagation();
        if (!el._tap) return;
        const sq = e.target.closest ? e.target.closest('.sq') : null;
        if (sq && sq.dataset.sq) el._tap(sq.dataset.sq);
      });
    }
    el._tap = o.onTap || null;
    el.classList.toggle('busy', !!o.busy);
    const tg = {}; for (const t of (o.targets || [])) tg[t.to] = t.capture ? 'cap' : 'tgt';
    let chk = null;
    if (o.check) {
      const b = chess.board(), side = chess.turn();
      for (let r = 0; r < 8 && !chk; r++) for (let f = 0; f < 8; f++) { const p = b[r][f]; if (p && p.type === 'k' && p.color === side) { chk = FILES[f] + (8 - r); break; } }
    }
    const kids = el.children;
    for (let i = 0; i < 64; i++) {
      const row = i >> 3, col = i & 7;
      const r = o.flip ? row : 7 - row, f = o.flip ? 7 - col : col;   // r: 0 = rank 1
      const sq = FILES[f] + (r + 1), d = kids[i];
      d.dataset.sq = sq;
      const p = chess.get(sq), pc = d.firstChild;
      pc.textContent = p ? GLYPH[p.type] : '';
      pc.className = 'pc' + (p ? ' ' + p.color : '');
      d.children[1].textContent = col === 0 ? r + 1 : '';
      d.children[2].textContent = row === 7 ? FILES[f] : '';
      d.className = 'sq ' + ((r + f) % 2 ? 'l' : 'd') + (o.sel === sq ? ' sel' : '') + (tg[sq] ? ' ' + tg[sq] : '')
        + (o.last && (o.last.from === sq || o.last.to === sq) ? ' last' : '') + (chk === sq ? ' chk' : '');
    }
    const svg = el._svg; svg.innerHTML = '';
    if (o.arrow) {
      const pt = (s) => { const f = FILES.indexOf(s[0]), r = +s[1] - 1; return o.flip ? [7 - f + .5, r + .5] : [f + .5, 7 - r + .5]; };
      const [x1, y1] = pt(o.arrow.from), [x2, y2] = pt(o.arrow.to);
      const dx = x2 - x1, dy = y2 - y1, L = Math.hypot(dx, dy) || 1, ux = dx / L, uy = dy / L, px = -uy, py = ux;
      const hl = .5, hw = .32, bx = x2 - ux * hl, by = y2 - uy * hl;
      svg.innerHTML = '<line x1="' + x1 + '" y1="' + y1 + '" x2="' + (bx + ux * .05) + '" y2="' + (by + uy * .05) + '"/>'
        + '<polygon points="' + x2 + ',' + y2 + ' ' + (bx + px * hw) + ',' + (by + py * hw) + ' ' + (bx - px * hw) + ',' + (by - py * hw) + '"/>';
    }
  }
  // eval bar: white's share grows from the human's side (bottom), text beside it
  function setEvalBar(el, ev, flip) {
    el.classList.toggle('flip', !!flip);
    const cp = ev ? (ev.mate ? (ev.mate > 0 ? 2000 : -2000) : (ev.cp || 0)) : 0;
    const pct = ev && ev.mate ? (ev.mate > 0 ? 100 : 0) : 50 + 50 * Math.tanh(cp / 400);
    el.firstElementChild.style.height = pct.toFixed(1) + '%';
    const t = el.nextElementSibling;
    if (t) t.textContent = ev && ev.mate ? 'M' + Math.abs(ev.mate) : pawns(Math.max(-2000, Math.min(2000, cp)));
  }
  // move list: "1. e4 e5 2. Nf3 ..." with each rated move coloured by its label
  function renderMoveList(el, list, cur, onTap) {
    el.innerHTML = '';
    list.forEach((m, i) => {
      if (i % 2 === 0) { const n = document.createElement('span'); n.className = 'n'; n.textContent = (i / 2 + 1) + '.'; el.appendChild(n); }
      const s = document.createElement('span');
      s.className = 'm' + (m.label ? ' l-' + m.label : '') + (cur === i + 1 ? ' cur' : '');
      s.textContent = m.san + (SUFFIX[m.label] || '');
      if (onTap) s.onclick = () => onTap(i + 1);
      el.appendChild(s);
    });
    if (!list.length) { const n = document.createElement('span'); n.className = 'n'; n.textContent = cur == null ? 'No moves yet.' : 'Start'; el.appendChild(n); }
    const c = el.querySelector('.cur');
    if (c && c.scrollIntoView && el.classList.contains('cap')) el.scrollTop = Math.max(0, c.offsetTop - el.clientHeight / 2);
    else if (el.classList.contains('cap')) el.scrollTop = el.scrollHeight;
  }

  // ---------- engine --------------------------------------------------------
  let eng = null, engReady = null;
  function engine() {
    if (!eng && window.ChessEngine) { eng = ChessEngine.create(); engReady = eng.ready(); }
    return eng;
  }

  // ---------- state ---------------------------------------------------------
  let state = 'home';            // 'home' | 'playing' | 'thinking' | 'over' | 'review'
  let game = null, review = null, analysis = null, lastRating = null;
  let sel = null, targets = [], gen = 0;   // gen: bumped whenever async engine results must be dropped
  const board = $('board'), evalBar = $('evalBar');

  function setState(s) {
    state = s;
    board.classList.toggle('busy', s !== 'playing');
  }
  function thinking(v) {
    const el = $('thinking');
    el.textContent = v === true ? 'thinking…' : v || '';
    el.classList.toggle('on', v === true);
  }
  function drawGame() {
    if (!game) return;
    const c = game.chess, last = game.moves.length ? game.moves[game.moves.length - 1] : null;
    renderBoard(board, c, { flip: game.you === 'b', sel, targets, last: last && mv(last.uci), check: c.in_check(), onTap: tap, busy: state !== 'playing' });
    $('turnTxt').textContent = state === 'playing' ? (c.in_check() ? 'check: your move' : 'your move') : state === 'over' ? 'game over' : '';
  }
  function tap(sq) {
    if (state !== 'playing' || !game) return;
    const c = game.chess, t = sel && targets.find((t) => t.to === sq);
    if (t) { humanMove(sel + sq + (t.promotion ? 'q' : '')); return; }
    const p = c.get(sq);
    if (p && p.color === game.you && c.turn() === game.you && sq !== sel) {
      sel = sq;
      targets = c.moves({ square: sq, verbose: true }).map((m) => ({ to: m.to, capture: !!m.captured, promotion: !!m.promotion }));
    } else { sel = null; targets = []; }
    drawGame();
  }
  function showRate(r) {
    const el = $('rate');
    el.dataset.label = r.label;
    $('rateLabel').textContent = cap(r.label);
    $('rateLoss').textContent = r.label === 'forced' ? '' : lossTxt(r.loss);
    $('rateJab').textContent = r.jab;
    el.classList.remove('in'); void el.offsetWidth; el.classList.add('in');
  }
  function rateIdle(text) {
    const el = $('rate'); el.dataset.label = ''; el.classList.remove('in');
    $('rateLabel').textContent = 'Coach'; $('rateLoss').textContent = ''; $('rateJab').textContent = text;
  }
  const renderMoves = () => renderMoveList($('moveList'), game.moves, null, null);

  // ---------- game flow -----------------------------------------------------
  function newGame(opts) {
    opts = opts || {};
    if (!window.Chess) { rateIdle('chess.js failed to load.'); return null; }
    if (game && (state === 'playing' || state === 'thinking')) endGame('loss', 'resign', false);
    cancelAnalysis(); gen++;
    const col = opts.color || save.color, you = col === 'r' ? (Math.random() < .5 ? 'w' : 'b') : col;
    game = { id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6), date: new Date().toISOString(), elo: clampElo(opts.elo || save.elo), you,
      chess: new Chess(), moves: [], before: null, after: null, streak: 0, result: null, reason: null, entry: null };
    lastRating = null; sel = null; targets = []; review = null;
    sheet('chessEnd', false); $('review').classList.remove('on'); $('chess').classList.add('on');
    $('chessHome').hidden = true; $('chessGame').hidden = false;
    $('analyzeBtn').hidden = true; $('resignBtn').hidden = false;
    $('oppName').textContent = 'Engine · ' + game.elo;
    $('youName').textContent = 'You · ' + COLN[you];
    rateIdle(you === 'w' ? 'Your move. I’m watching.' : 'Black. The engine opens; try to keep up.');
    thinking(false); setEvalBar(evalBar, { cp: 0 }, you === 'b');
    renderMoves(); setState(you === 'w' ? 'playing' : 'thinking'); drawGame();
    $('chess').scrollTo(0, 0);
    const myGen = gen, e = engine();
    if (!e) { thinking('engine unavailable'); return game; }
    engReady.then(() => {
      if (myGen !== gen) return;
      e.setStrength(game.elo);
      if (you === 'b') setTimeout(() => { if (myGen === gen) engineMove(myGen); }, 500);
      else preEval(myGen);
    });
    return game;
  }
  // evaluate the position the human is looking at (depth 12) while they think: this is evalBefore for the rating
  function preEval(myGen) {
    const g = game, e = engine();
    if (!e) { g.before = Promise.resolve(null); return; }
    g.before = e.evaluate(g.chess.fen(), { depth: 12 }).then((ev) => { if (myGen === gen) setEvalBar(evalBar, ev, g.you === 'b'); return ev; }).catch(() => null);
  }
  // the human's move: the same path for a board tap and for __coach.move(uci)
  async function humanMove(uci) {
    if (state !== 'playing' || !game) return false;
    const g = game, c = g.chess, myGen = gen;
    if (c.turn() !== g.you) return false;
    const onlyMove = c.moves().length === 1, fenBefore = c.fen();
    const m = c.move(mv(uci));
    if (!m) return false;
    const played = uciOf(m), rec = { uci: played, san: m.san, label: null, loss: null, jab: null };
    g.moves.push(rec); sel = null; targets = [];
    setState('thinking'); thinking(c.game_over() ? false : 'rating…'); drawGame(); renderMoves();
    const fenAfter = c.fen();
    try {
      const e = engine();
      const before = await (g.before || Promise.resolve(null));
      if (myGen !== gen) return false;
      let rating, after = null;
      if (c.in_checkmate()) rating = { loss: 0, label: 'best' };
      else {
        after = c.game_over() || !e ? { cp: 0, mate: null, best: null } : await e.evaluate(fenAfter, { depth: 12 });
        if (myGen !== gen) return false;
        g.after = after;
        rating = before ? ChessEngine.rate({ cpBefore: clampCp(before), cpAfter: clampCp(after), color: g.you, played, best: before.best,
          mateBefore: before.mate, mateAfter: after.mate, onlyMove }) : { loss: 0, label: onlyMove ? 'forced' : 'good' };
        setEvalBar(evalBar, after, g.you === 'b');
      }
      const bestSan = before && before.best ? sanOf(fenBefore, before.best) : '';
      g.streak = GOOD[rating.label] ? 0 : g.streak + 1;
      rec.label = rating.label; rec.loss = rating.loss; rec.best = before ? before.best : null; rec.bestSan = bestSan;
      rec.jab = window.ChessEngine ? ChessEngine.jab(rating.label, { san: m.san, bestSan, loss: rating.loss, ply: g.moves.length, streak: g.streak, cpAfter: clampCp(after), color: g.you }) : '';
      lastRating = { uci: played, san: m.san, label: rating.label, loss: rating.loss, jab: rec.jab, bestSan, ply: g.moves.length };
      showRate(lastRating); renderMoves();
      if (c.game_over()) { thinking(false); gameOver(); return lastRating; }
      await engineMove(myGen);
      return lastRating;
    } catch (err) {
      if (myGen === gen) { thinking('engine error'); setState('playing'); drawGame(); }
      return false;
    }
  }
  async function engineMove(myGen) {
    const g = game, c = g.chess, e = engine();
    thinking(true); setState('thinking'); drawGame();
    let m = null;
    if (e) {
      await engReady; e.setStrength(g.elo);
      const r = await e.play(c.fen());
      if (myGen !== gen) return;
      if (r && r.move) m = c.move(mv(r.move));
    }
    if (!m) { const ms = c.moves({ verbose: true }); if (ms.length) m = c.move(ms[Math.floor(Math.random() * ms.length)]); }
    if (!m) return;
    g.moves.push({ uci: uciOf(m), san: m.san, label: null, loss: null });
    thinking(false);
    if (c.game_over()) { setState('over'); drawGame(); renderMoves(); gameOver(); return; }
    setState('playing'); drawGame(); renderMoves();
    preEval(myGen);
  }
  function gameOver() {
    const c = game.chess; let result = 'draw', reason = 'draw';
    if (c.in_checkmate()) { result = c.turn() === game.you ? 'loss' : 'win'; reason = 'checkmate'; }
    else if (c.in_stalemate()) reason = 'stalemate';
    else if (c.in_threefold_repetition()) reason = 'repetition';
    else if (c.insufficient_material()) reason = 'material';
    else reason = '50 moves';
    endGame(result, reason, true);
  }
  const END = {
    checkmateLoss: ['CHECKMATE. You lost.', 'Mated. The engine didn’t even need to try.'],
    checkmateWin: ['You won.', 'Checkmate. Enjoy it. It won’t happen often.'],
    stalemate: ['Draw.', 'Stalemate. There was a win in there and you walked past it.'],
    repetition: ['Draw.', 'Repetition. Neither of you wanted to commit. One of you had an excuse.'],
    material: ['Draw.', 'Insufficient material. Nothing left to lose with.'],
    '50 moves': ['Draw.', 'Fifty moves of nothing. Impressive, in a way.'],
    resign: ['Resigned.', 'You quit. The engine accepts, without respect.'],
  };
  function endGame(result, reason, showSheet) {
    const g = game; gen++;
    if (eng) eng.stop();
    thinking(false); sel = null; targets = [];
    g.result = result; g.reason = reason;
    setState('over'); drawGame();
    if (g.moves.length >= 2) {
      g.entry = { id: g.id, date: g.date, elo: g.elo, you: g.you, result, reason, moves: g.moves.map((m) => m.uci), sans: g.moves.map((m) => m.san), report: null };
      save.games.unshift(g.entry); save.games = save.games.slice(0, 20); persist();
    }
    $('analyzeBtn').hidden = !g.entry; $('resignBtn').hidden = true;
    renderHist();
    if (showSheet) {
      const k = reason === 'checkmate' ? (result === 'win' ? 'checkmateWin' : 'checkmateLoss') : reason;
      const t = END[k] || END.resign;
      $('endTitle').textContent = t[0]; $('endMsg').textContent = t[1] + (g.moves.length ? ' ' + Math.ceil(g.moves.length / 2) + ' moves.' : '');
      $('endAnalyze').hidden = !g.entry;
      sheet('chessEnd', true);
    }
  }
  function resign() {
    if (game && (state === 'playing' || state === 'thinking')) endGame('loss', 'resign', true);
  }

  // ---------- history -------------------------------------------------------
  function renderHist() {
    const el = $('chessHist'); el.innerHTML = '';
    if (!save.games.length) { const p = document.createElement('p'); p.className = 'chint'; p.textContent = 'No games yet. The engine is waiting.'; el.appendChild(p); return; }
    for (const g of save.games) {
      const d = document.createElement('div'); d.className = 'hcard';
      const acc = g.report && g.report.accuracy ? g.report.accuracy[g.you] + '%' : '—';
      d.innerHTML = '<div><b class="res"></b><small></small></div><div class="num"><span></span><small>elo</small></div><div class="num"><span></span><small>acc</small></div><button class="pill rv">Review</button>';
      const b = d.querySelector('.res'); b.textContent = RES[g.result] || '?'; b.classList.add(g.result);
      d.querySelector('small').textContent = fmtDate(g.date) + ' · ' + COLN[g.you] + ' · ' + g.reason;
      d.children[1].firstChild.textContent = g.elo; d.children[2].firstChild.textContent = acc;
      d.querySelector('.rv').onclick = () => openReview(g);
      el.appendChild(d);
    }
  }
  function renderSettings() {
    $('eloV').textContent = save.elo;
    $('colorBtn').textContent = COLN[save.color];
    $('eloMinus').disabled = save.elo <= 800; $('eloPlus').disabled = save.elo >= 2850;
  }

  // ---------- review --------------------------------------------------------
  function openReview(entry) {
    cancelAnalysis();
    review = { entry, moves: entry.moves, you: entry.you, report: entry.report, ply: 0, fens: null };
    setState('review');
    sheet('chessEnd', false); $('chess').classList.remove('on'); $('review').classList.add('on'); $('review').scrollTo(0, 0);
    $('rBody').hidden = !entry.report; $('rProgress').hidden = !!entry.report;
    if (entry.report) { renderReview(); return Promise.resolve(entry.report); }
    return runAnalysis(entry);
  }
  async function runAnalysis(entry) {
    const e = engine();
    if (!e) { $('rProgress').textContent = 'Engine unavailable.'; return null; }
    const sig = { cancelled: false }; analysis = { signal: sig };
    $('rProgress').textContent = 'Analysing 0/' + entry.moves.length + '…';
    try {
      await engReady;
      const rep = await ChessEngine.analyze(e, entry.moves, { depth: 14, color: entry.you, signal: sig,
        onProgress: (i, n) => { if (!sig.cancelled) $('rProgress').textContent = 'Analysing ' + i + '/' + n + '…'; } });
      if (sig.cancelled || !rep) return null;
      entry.report = rep; persist(); renderHist();
      if (review && review.entry === entry) { review.report = rep; $('rBody').hidden = false; $('rProgress').hidden = true; renderReview(); }
      return rep;
    } catch (err) {
      if (!sig.cancelled) $('rProgress').textContent = 'Analysis failed: ' + ((err && err.message) || err);
      return null;
    } finally { if (analysis && analysis.signal === sig) analysis = null; }
  }
  function cancelAnalysis() {
    if (!analysis) return;
    analysis.signal.cancelled = true; analysis = null;
    if (eng) eng.stop();
  }
  function renderReview() {
    const r = review, rep = r.report, you = r.you, op = you === 'w' ? 'b' : 'w';
    const c = new Chess(); r.fens = [c.fen()];
    for (const u of r.moves) { c.move(mv(u)); r.fens.push(c.fen()); }
    $('rSummary').textContent = rep.summary || '';
    const cy = rep.counts[you], st = $('rStats'); st.innerHTML = '';
    for (const [v, k] of [[rep.accuracy[you] + '%', 'you'], [rep.accuracy[op] + '%', 'engine'], [cy.blunder, 'blunders'], [cy.mistake, 'mistakes'], [cy.inaccuracy, 'inacc.']]) {
      const d = document.createElement('div'); d.innerHTML = '<b class="num"></b><small></small>'; d.firstChild.textContent = v; d.lastChild.textContent = k; st.appendChild(d);
    }
    const w = $('rWorst'); w.innerHTML = '';
    if (!rep.worst.length) { const p = document.createElement('p'); p.className = 'chint'; p.textContent = 'Nothing worth shouting about. Suspicious.'; w.appendChild(p); }
    for (const m of rep.worst) {
      const b = document.createElement('button'); b.className = 'wm l-' + m.label;
      b.innerHTML = '<b></b><span></span><i class="num"></i>';
      b.children[0].textContent = moveNo(m.ply) + m.san + (SUFFIX[m.label] || '');
      b.children[1].textContent = cap(m.label) + (m.bestSan ? ' · best ' + m.bestSan : '');
      b.children[2].textContent = lossTxt(m.loss);
      b.onclick = () => seek(m.ply);
      w.appendChild(b);
    }
    $('rLesson').textContent = rep.lesson || '';
    seek(0); drawGraph();
  }
  function seek(ply) {
    const r = review; if (!r || !r.report || !r.fens) return;
    const rep = r.report, n = r.moves.length;
    r.ply = Math.max(0, Math.min(n, ply));
    const c = new Chess(r.fens[r.ply]), m = r.ply ? rep.moves[r.ply - 1] : null;
    const arrow = m && m.best && m.best !== m.uci ? mv(m.best) : null;
    renderBoard($('rBoard'), c, { flip: r.you === 'b', last: m && mv(m.uci), check: c.in_check(), arrow });
    const mate = r.ply ? m.mateAfter : (rep.moves[0] ? rep.moves[0].mateBefore : null);
    setEvalBar($('rEvalBar'), { cp: rep.evals[r.ply], mate }, r.you === 'b');
    $('rPos').textContent = r.ply ? moveNo(r.ply) + m.san : 'Start';
    $('rPrev').disabled = r.ply === 0; $('rNext').disabled = r.ply >= n;
    const mvEl = $('rMove');
    mvEl.dataset.label = m ? m.label : '';
    if (m) {
      const mine = m.color === r.you;
      $('rMoveHead').textContent = moveNo(r.ply) + m.san + (SUFFIX[m.label] || '') + ' · ' + cap(m.label)
        + (m.label !== 'forced' && m.loss >= 5 ? ' (' + lossTxt(m.loss) + ')' : '') + (m.best && m.best !== m.uci && m.bestSan ? '. Best was ' + m.bestSan + '.' : '');
      $('rMoveJab').textContent = mine ? (m.jab || '') : (m.label === 'blunder' || m.label === 'mistake' ? 'The engine slipped. Did you notice?' : '');
    } else { $('rMoveHead').textContent = 'Start position'; $('rMoveJab').textContent = 'Step through with Next, tap a move, or drag on the graph.'; }
    renderMoveList($('rMoveList'), rep.moves, r.ply, seek);
    drawGraph();
  }
  // eval graph: white advantage up, clamped to ±8 pawns, red dots on your blunders, amber cursor; tap/drag seeks
  function drawGraph() {
    const cv = $('evalGraph'), r = review; if (!r || !r.report || !cv.clientWidth) return;
    const W = cv.clientWidth, H = cv.clientHeight || 110, dpr = window.devicePixelRatio || 1;
    if (cv.width !== Math.round(W * dpr) || cv.height !== Math.round(H * dpr)) { cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr); }
    const x = cv.getContext('2d'); x.setTransform(dpr, 0, 0, dpr, 0, 0);
    const ev = r.report.evals, n = Math.max(1, ev.length - 1);
    const X = (i) => i / n * W, Y = (cp) => H / 2 - Math.max(-800, Math.min(800, cp)) / 800 * (H / 2 - 5);
    x.fillStyle = '#1c212c'; x.fillRect(0, 0, W, H);
    x.beginPath(); x.moveTo(0, H);
    for (let i = 0; i < ev.length; i++) x.lineTo(X(i), Y(ev[i]));
    x.lineTo(W, H); x.closePath(); x.fillStyle = '#e6e3dc'; x.fill();
    x.strokeStyle = 'rgba(139,147,161,.7)'; x.lineWidth = 1; x.beginPath(); x.moveTo(0, H / 2 + .5); x.lineTo(W, H / 2 + .5); x.stroke();
    x.strokeStyle = '#f2b24c'; x.lineWidth = 2; x.beginPath(); x.moveTo(X(r.ply) + .5, 0); x.lineTo(X(r.ply) + .5, H); x.stroke();
    for (const m of r.report.moves) if (m.color === r.you && m.label === 'blunder') {
      x.fillStyle = '#ff5a5f'; x.strokeStyle = '#0b0d12'; x.lineWidth = 1.5;
      x.beginPath(); x.arc(X(m.ply), Y(ev[m.ply]), 4.5, 0, 7); x.fill(); x.stroke();
    }
  }
  function graphSeek(e) {
    const cv = $('evalGraph'), r = review; if (!r || !r.report) return;
    const b = cv.getBoundingClientRect(), n = r.moves.length;
    seek(Math.round((e.clientX - b.left) / b.width * n));
  }

  // ---------- navigation ----------------------------------------------------
  function goHome() {
    review = null; sel = null; targets = [];
    $('chessHome').hidden = false; $('chessGame').hidden = true;
    renderSettings(); renderHist();
    $('review').classList.remove('on'); sheet('chessEnd', false); $('chess').classList.add('on'); $('chess').scrollTo(0, 0);
    setState('home');
  }
  function open() {
    cancelAnalysis(); sheet('chessEnd', false); $('review').classList.remove('on');
    if (game && (state === 'playing' || state === 'thinking')) { $('chessHome').hidden = true; $('chessGame').hidden = false; $('chess').classList.add('on'); drawGame(); }
    else goHome();
  }
  function close() {
    cancelAnalysis();
    if (game && (state === 'playing' || state === 'thinking')) endGame('loss', 'resign', false);
    gen++; if (eng) eng.stop();
    review = null; sheet('chessEnd', false); $('chess').classList.remove('on'); $('review').classList.remove('on');
    $('chessHome').hidden = false; $('chessGame').hidden = true; renderSettings(); renderHist();
    setState('home');
    if (window.__hub && typeof window.__hub.show === 'function') window.__hub.show();
  }
  function analyze() {
    if (review && review.entry) return review.report ? Promise.resolve(review.report) : openReview(review.entry);
    if (!game || !game.entry) return Promise.resolve(null);
    return openReview(game.entry);
  }

  // ---------- wiring --------------------------------------------------------
  $('chessBack').onclick = close;
  $('reviewBack').onclick = () => { cancelAnalysis(); goHome(); };
  $('newGame').onclick = () => newGame();
  $('eloMinus').onclick = () => { save.elo = clampElo(save.elo - 50); persist(); renderSettings(); };
  $('eloPlus').onclick = () => { save.elo = clampElo(save.elo + 50); persist(); renderSettings(); };
  $('colorBtn').onclick = () => { save.color = { w: 'b', b: 'r', r: 'w' }[save.color]; persist(); renderSettings(); };
  $('resignBtn').onclick = resign;
  $('analyzeBtn').onclick = analyze;
  $('endAnalyze').onclick = analyze;
  $('endNew').onclick = () => newGame();
  $('endHome').onclick = goHome;
  $('rPrev').onclick = () => seek(review ? review.ply - 1 : 0);
  $('rNext').onclick = () => seek(review ? review.ply + 1 : 0);
  const gr = $('evalGraph');
  gr.addEventListener('touchstart', (e) => e.preventDefault(), { passive: false });
  gr.addEventListener('pointerdown', (e) => { e.preventDefault(); gr._drag = true; try { gr.setPointerCapture(e.pointerId); } catch (x) {} graphSeek(e); });
  gr.addEventListener('pointermove', (e) => { if (gr._drag) graphSeek(e); });
  for (const ev of ['pointerup', 'pointercancel']) gr.addEventListener(ev, () => { gr._drag = false; });
  window.addEventListener('resize', () => { if (state === 'review') drawGraph(); });
  renderSettings(); renderHist();

  // test hook
  window.__coach = {
    open, close, newGame, move: humanMove, resign, analyze,
    get game() { return game; }, get state() { return state; }, get lastRating() { return lastRating; }, get history() { return save.games; },
  };
})();
