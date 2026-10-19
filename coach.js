// Ghostlap Roma: the chess coach. Board, live move ratings, end-of-game sheet, post-game review, game history.
// Uses window.Chess (vendor/chess.js) and window.ChessEngine (engine.js) only. The hub calls window.__coach.open().
(function () {
  'use strict';
  const $ = (id) => document.getElementById(id);

  // ---------- saving --------------------------------------------------------
  const KEY = 'ghostlap-chess-v1';
  // board templates, in picker order: [name, light square, dark square] for the swatch. The looks themselves are in index.html.
  // Stone, Dark and Wire share the Stone pieces and the Stone cues (mint selection, the piece named under the board); Classic is
  // the traditional board with the cburnett pieces and the amber ring.
  const THEMES = { stone: ['Stone', '#e6e2da', '#cdc8bf'], classic: ['Classic', '#f0d9b5', '#b58863'], dark: ['Dark', '#4b5568', '#2e3544'],
    wire: ['Wire', '#f4f1e8', 'repeating-linear-gradient(135deg, rgba(29,36,51,.22) 0 1px, transparent 1px 4px) #ebe7dc'] };
  const OLD_THEMES = { wood: 'classic' };   // the five themes before the templates: Wood lives on as Classic, Night, Modern and Mono go to Stone
  const VOICES = ['tough', 'kind', 'quiet'];
  const MODES = ['play', 'tutor', 'train'];   // Train: a training game. Nothing from the engine during play (the research: no live verdicts, narrative before engine)
  const clampElo = (e) => Math.max(800, Math.min(2850, Math.round((+e || 1600) / 50) * 50));
  const DEF = (name, voice) => ({ name, elo: 1600, color: 'w', theme: 'stone', mode: 'play', voice: voice || 'tough', games: [], focus: null, calib: null, ledger: [], reviewLevel: 'narrow', day: null });
  // two players share the phone: Jesse gets the coach, J gets the kind version. Each has their own history and settings.
  let save = { player: 'jesse', players: { jesse: DEF('Jesse', 'tough'), j: DEF('J', 'kind') } };
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) || 'null');
    if (raw && raw.players) save = raw;
    else if (raw) { const me = Object.assign(DEF('Jesse', 'tough'), raw); delete me.player; delete me.players; save.players.jesse = me; }   // v1 single-player save
  } catch (e) { /* private mode: keep in memory */ }
  for (const k of ['jesse', 'j']) {
    const q = save.players[k] = Object.assign(DEF(k === 'j' ? 'J' : 'Jesse', k === 'j' ? 'kind' : 'tough'), save.players[k] || {});
    if (!Array.isArray(q.games)) q.games = [];
    if (typeof q.calibrated !== 'boolean') q.calibrated = q.games.filter((g) => g.report && g.report.moves).length >= 3;   // 3+ analysed games: calibrated at their current elo
    if (q.focus && !(q.focus.left > 0)) q.focus = null;
    if (q.calib && !Array.isArray(q.calib.games)) q.calib = null;
    if (!'wbr'.includes(q.color) || q.color.length !== 1) q.color = 'w';
    q.elo = clampElo(q.elo);
    if (OLD_THEMES[q.theme]) q.theme = OLD_THEMES[q.theme];
    if (!THEMES[q.theme]) q.theme = 'stone';
    if (!MODES.includes(q.mode)) q.mode = 'play';
    if (!Array.isArray(q.ledger)) q.ledger = [];               // one compact row per analysed game, kept forever (games themselves are capped at 20)
    if (q.reviewLevel !== 'full') q.reviewLevel = 'narrow';    // narrow until plan.js raises it at Stage 3
    if (!(q.day && typeof q.day.date === 'string')) q.day = null;
    q.games.forEach(upgradeEntry);
    if (!VOICES.includes(q.voice)) q.voice = 'tough';
  }
  if (!save.stoneDefault) { for (const k in save.players) if (save.players[k].theme === 'night') save.players[k].theme = 'stone'; save.stoneDefault = true; }   // Stone became the default: profiles still on the old default move over once
  if (!save.players[save.player]) save.player = 'jesse';
  const P = () => save.players[save.player];
  const voice = () => P().voice;
  const stoneish = () => P().theme !== 'classic';   // the Stone templates (Stone, Dark, Wire) name the piece you pick up
  const narrow = () => P().reviewLevel !== 'full';   // the engine's job before Stage 3: where material went, where the eval swung. No lines.
  function applyTheme() { document.documentElement.dataset.theme = P().theme; }
  applyTheme();
  function persist() { try { localStorage.setItem(KEY, JSON.stringify(save)); } catch (e) {} }
  // entries from before Train mode: derive the mode, fill the new fields with nulls, compute clean (no tutor, no hints, nudges or take-backs)
  function isClean(g) { return g.mode !== 'tutor' && !g.hints && !g.nudges && !g.takebacks; }
  function upgradeEntry(g) {
    if (!g.mode) g.mode = g.tutor ? 'tutor' : 'play';
    if (g.ctx === undefined) g.ctx = null;
    if (g.times === undefined) g.times = null;
    if (g.pm === undefined) g.pm = null;
    if (g.variant === undefined) g.variant = null;   // '960' for a Chess960 diagnostic (its start fen in g.fen), null for a normal game
    if (g.slept === undefined) g.slept = null;       // hours slept, from the Train screen's day card; null when not given
    g.clean = isClean(g);
    return g;
  }
  const ownerOf = (entry) => Object.keys(save.players).map((k) => save.players[k]).find((p) => p.games.includes(entry)) || P();
  // ---------- events: a tiny emitter for plan.js, puzzles.js and endgames.js. 'game' (recorded), 'analysed' (report + ledger row), 'pm', 'mode', 'player' ----------
  const subs = {};
  function on(ev, fn) { if (typeof fn === 'function') (subs[ev] = subs[ev] || []).push(fn); return fn; }
  function off(ev, fn) { if (subs[ev]) subs[ev] = subs[ev].filter((f) => f !== fn); }
  function emit(ev, data) { for (const f of (subs[ev] || []).slice()) { try { f(data); } catch (e) { console.error(e); } } }

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
  const LONG = 180000;   // a think over three minutes: you did not recognise the position (the research's P10). Nothing is enforced.
  const mmss = (ms) => { const s = Math.max(0, Math.round(ms / 1000)); return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0'); };
  const fmtMs = (ms) => { const s = Math.round(ms / 1000), m = Math.floor(s / 60); return (m ? m + ' min ' : '') + (s % 60) + ' s'; };
  function sanOf(fen, uci) { try { const c = new Chess(fen); const m = c.move(mv(uci)); return m ? m.san : uci; } catch (e) { return uci; } }
  function fmtDate(iso) { try { return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }); } catch (e) { return ''; } }
  function sheet(id, on) { $(id).classList.toggle('on', on); }
  // opening name: the longest prefix of the SAN list that the table knows (window.OPENINGS, from lichess, CC0)
  function openingOf(sans) {
    const T = window.OPENINGS; if (!T) return null;
    for (let n = Math.min(sans.length, 14); n >= 1; n--) { const hit = T[sans.slice(0, n).join(' ')]; if (hit) return { eco: hit[0], name: hit[1], plies: n }; }
    return null;
  }
  // Chess960: Scharnagl's numbering, 0..959, all reachable. Bishops on opposite colours, the king between the rooks, Black mirrored,
  // pawns normal. Castling is deliberately off (the fen says '-'): the engine and chess.js then play it as a plain position.
  const KRN = ['NNRKR', 'NRNKR', 'NRKNR', 'NRKRN', 'RNNKR', 'RNKNR', 'RNKRN', 'RKNNR', 'RKNRN', 'RKRNN'];
  function rank960(n) {
    n = Number.isInteger(n) && n >= 0 && n < 960 ? n : Math.floor(Math.random() * 960);
    const r = Array(8).fill(''); let k = n;
    r[2 * (k % 4) + 1] = 'B'; k = Math.floor(k / 4);   // the light-squared bishop: b, d, f or h
    r[2 * (k % 4)] = 'B'; k = Math.floor(k / 4);       // the dark-squared one: a, c, e or g
    const free = () => r.map((p, i) => (p ? -1 : i)).filter((i) => i >= 0);
    r[free()[k % 6]] = 'Q'; k = Math.floor(k / 6);     // the queen on one of the six empty squares
    const rest = KRN[k], sq = free(); for (let i = 0; i < 5; i++) r[sq[i]] = rest[i];   // knights, rooks and king fill the rest in order
    return r.join('');
  }
  const fen960 = (n) => { const w = rank960(n); return w.toLowerCase() + '/pppppppp/8/8/8/8/PPPPPPPP/' + w + ' w - - 0 1'; };
  function showOpening(el, sans) {
    const o = openingOf(sans);
    el.innerHTML = ''; if (!o) { el.textContent = sans.length ? '' : ''; return o; }
    const b = document.createElement('b'); b.textContent = o.name; el.appendChild(b);
    el.appendChild(document.createTextNode(' · ' + o.eco + (o.plies < sans.length ? ' · out of book' : '')));
    return o;
  }

  // ---------- board (one renderer for the game board and the replay board) ----
  // opts: { flip, sel, targets:[{to,capture}], last:{from,to}, check, arrow:{from,to,cls?}, arrows:[...], onTap(sq) }
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
      pc.className = 'pc' + (p ? ' svg c' + p.color + ' t' + p.type : '');   // c = colour, t = type ('b' alone would mean both black and bishop)
      d.children[1].textContent = col === 0 ? r + 1 : '';
      d.children[2].textContent = row === 7 ? FILES[f] : '';
      d.className = 'sq ' + ((r + f) % 2 ? 'l' : 'd') + (o.sel === sq ? ' sel' : '') + (tg[sq] ? ' ' + tg[sq] : '')
        + (o.last && (o.last.from === sq || o.last.to === sq) ? ' last' : '') + (chk === sq ? ' chk' : '');
    }
    const svg = el._svg; let html = '';
    for (const a of (o.arrows || []).concat(o.arrow ? [o.arrow] : [])) {
      const pt = (s) => { const f = FILES.indexOf(s[0]), r = +s[1] - 1; return o.flip ? [7 - f + .5, r + .5] : [f + .5, 7 - r + .5]; };
      const [x1, y1] = pt(a.from), [x2, y2] = pt(a.to);
      const dx = x2 - x1, dy = y2 - y1, L = Math.hypot(dx, dy) || 1, ux = dx / L, uy = dy / L, px = -uy, py = ux;
      const hl = .5, hw = .32, bx = x2 - ux * hl, by = y2 - uy * hl, cls = a.cls ? ' class="' + a.cls + '"' : '';
      html += '<line' + cls + ' x1="' + x1 + '" y1="' + y1 + '" x2="' + (bx + ux * .05) + '" y2="' + (by + uy * .05) + '"/>'
        + '<polygon' + cls + ' points="' + x2 + ',' + y2 + ' ' + (bx + px * hw) + ',' + (by + py * hw) + ' ' + (bx - px * hw) + ',' + (by - py * hw) + '"/>';
    }
    svg.innerHTML = html;
  }
  // ---------- tutor: plain-English reasons for a move, and the opponent's idea ----------
  const PIECE = { p: 'pawn', n: 'knight', b: 'bishop', r: 'rook', q: 'queen', k: 'king' };
  const VAL = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 };
  function attackedBy(c, sq, color) {   // does `color` attack square sq in position c? (via a scratch position with that side to move)
    try {
      const f = c.fen().split(' '); f[1] = color; f[3] = '-';
      const t = new Chess(f.join(' '));
      return t.moves({ verbose: true }).some((m) => m.to === sq);
    } catch (e) { return false; }
  }
  // what a move does, in one short clause. c = position BEFORE the move (not mutated).
  function explain(c, uci) { return explainFull(c, uci).text; }
  function explainFull(c, uci) {
    const t = new Chess(c.fen()); const m = t.move(mv(uci)); if (!m) return { text: '', flags: [] };
    const notes = [], flags = [];
    if (t.in_checkmate()) return { text: 'Checkmate.', flags };
    if (m.flags.includes('k') || m.flags.includes('q')) notes.push('Castles: king safe, rook in play.');
    if (m.promotion) notes.push('Promotes.');
    if (m.captured) {
      const defended = attackedBy(t, m.to, t.turn());
      const gain = VAL[m.captured] - (defended ? VAL[m.piece] : 0);
      notes.push('Takes the ' + PIECE[m.captured] + ' on ' + m.to + (defended ? (gain > 0 ? ', wins material' : gain < 0 ? ', but it is defended' : ', a trade') : ' for free'));
      if (defended && gain < 0) flags.push('greedy');
    }
    if (t.in_check()) { notes.push('Check.'); flags.push('check'); }
    // threats created: what the moved piece can take next, and whether it is safe where it lands
    const next = (function () { try { const f = t.fen().split(' '); f[1] = m.color; f[3] = '-'; return new Chess(f.join(' ')).moves({ square: m.to, verbose: true }).filter((x) => x.captured); } catch (e) { return []; } })();
    const hanging = attackedBy(t, m.to, t.turn()) && !attackedBy(t, m.to, m.color);
    const big = next.filter((x) => VAL[x.captured] > VAL[m.piece] || !attackedBy(t, x.to, t.turn())).sort((a, b) => VAL[b.captured] - VAL[a.captured]);
    if (big.length >= 2 && !m.captured) notes.push('Forks the ' + PIECE[big[0].captured] + ' and the ' + PIECE[big[1].captured] + '.');
    else if (big.length === 1 && !m.captured) notes.push('Attacks the ' + PIECE[big[0].captured] + ' on ' + big[0].to + '.');
    if (hanging) { notes.push('The ' + PIECE[m.piece] + ' can be taken there.'); flags.push('hung'); }
    if (m.piece === 'q' && m.from[1] === (m.color === 'w' ? '1' : '8')) flags.push('queen');
    if (!notes.length) {
      const home = m.color === 'w' ? '1' : '8';
      if ((m.piece === 'n' || m.piece === 'b') && m.from[1] === home) notes.push('Develops the ' + PIECE[m.piece] + '.');
      else if (m.piece === 'p' && 'd4 e4 d5 e5'.includes(m.to)) notes.push('Takes space in the centre.');
      else if (m.piece === 'p') notes.push('Pawn move. Pawns do not come back.');
      else if (m.piece === 'k') notes.push('King move. Make sure it needs to.');
      else if (m.piece === 'q' && m.from[1] === home) notes.push('Brings the queen out early. It will get chased.');
      else notes.push('Improves the ' + PIECE[m.piece] + '.');
    }
    return { text: notes.join(' '), flags };
  }
  // the engine's expected line in SAN with move numbers, from a position
  function lineSan(fen, pv, max) {
    try {
      const c = new Chess(fen), out = []; let n = 0;
      for (const u of (pv || []).slice(0, max || 8)) {
        const ply = c.history().length, white = c.turn() === 'w';
        const m = c.move(mv(u)); if (!m) break;
        out.push((white ? Math.floor(ply / 2) + 1 + '. ' : n === 0 ? Math.floor(ply / 2) + 1 + '... ' : '') + m.san); n++;
      }
      return out.join(' ');
    } catch (e) { return ''; }
  }
  // the αβ panel: why a move was good, neutral or bad, in plain words plus the engine's line
  function whyText(o) {   // o = { fenBefore, fenAfter, played, best, reply, pv, label, loss }
    const parts = [];
    const b = new Chess(o.fenBefore), a = new Chess(o.fenAfter);
    const ps = sanOf(o.fenBefore, o.played);
    parts.push('You played ' + ps + '. ' + (explain(b, o.played) || 'Nothing dramatic.'));
    if (o.best && o.best !== o.played) parts.push('Best was ' + sanOf(o.fenBefore, o.best) + '. ' + (explain(b, o.best) || ''));
    else if (o.best) parts.push('That was the engine\u2019s choice too.');
    if (o.reply && !a.game_over()) parts.push('Now they can play ' + sanOf(o.fenAfter, o.reply) + '. ' + (explain(a, o.reply) || ''));
    if (o.loss >= 5) parts.push('Cost: ' + (o.loss / 100).toFixed(1) + ' pawns against the best line.');
    const ln = lineSan(o.fenBefore, o.pv, 8);
    if (ln && !narrow()) parts.push('Engine line: ' + ln);   // the narrow review keeps the line for Stage 3
    return parts;
  }
  function renderWhy(el, parts) {
    el.innerHTML = '';
    for (const t of parts) { const d = document.createElement('div'); d.textContent = t; el.appendChild(d); }
    el.hidden = !parts.length;
  }
  // the position with the other side to move: what would they do if you passed?
  function passFen(c) {
    if (c.in_check()) return null;
    const f = c.fen().split(' '); f[1] = f[1] === 'w' ? 'b' : 'w'; f[3] = '-';
    try { const t = new Chess(f.join(' ')); if (!t.moves().length) return null; return t.fen(); } catch (e) { return null; }
  }
  // what the opponent would do with a free move: { uci, san, calm, cp, text } or null
  async function threatOf(c, you, ev, e) {
    const pf = passFen(c);
    if (!pf) return c.in_check() ? { uci: null, san: '', calm: false, cp: 999, text: 'You are in check. Everything else can wait.' } : null;
    const tv = await e.evaluate(pf, { depth: 10 });
    if (!tv || !tv.best) return null;
    const opp = you === 'w' ? 'b' : 'w', swing = opp === 'w' ? clampCp(tv) - clampCp(ev) : clampCp(ev) - clampCp(tv);
    const san = sanOf(pf, tv.best), why = explain(new Chess(pf), tv.best);
    const calm = swing < 60 && !tv.mate;
    return { uci: tv.best, san, calm, cp: swing, text: (calm ? 'Nothing sharp. Given a free move they would play ' + san + '. ' : 'If you pass, they play ' + san + '. ') + why };
  }
  // ---------- read the board: an objective description for both sides, and each side's priority ----------
  const START = { n: ['b1', 'g1', 'b8', 'g8'], b: ['c1', 'f1', 'c8', 'f8'] };
  function material(c) {
    const m = { w: 0, b: 0 }, pcs = { w: {}, b: {} };
    for (const row of c.board()) for (const p of row) if (p && p.type !== 'k') { m[p.color] += VAL[p.type]; pcs[p.color][p.type] = (pcs[p.color][p.type] || 0) + 1; }
    return { m, pcs };
  }
  const WORDS = { 1: 'a pawn', 2: 'two pawns', 3: 'a minor piece', 4: 'a piece and a pawn', 5: 'a rook', 6: 'a rook and a pawn', 9: 'a queen' };
  function hangingOf(c, color) {
    const out = [], opp = color === 'w' ? 'b' : 'w';
    for (const row of c.board()) for (const p of row) if (p && p.color === color && p.type !== 'k' && p.type !== 'p') {
      const sq = p.square; if (attackedBy(c, sq, opp) && !attackedBy(c, sq, color)) out.push({ type: p.type, sq });
    }
    return out.sort((a, b) => VAL[b.type] - VAL[a.type]);
  }
  function kingState(c, color) {
    const k = (function () { for (const row of c.board()) for (const p of row) if (p && p.type === 'k' && p.color === color) return p.square; })();
    const f = k[0], r = k[1], home = color === 'w' ? '1' : '8';
    const castled = r === home && (f === 'g' || f === 'c' || f === 'b' || f === 'h');
    const centre = r === home && (f === 'e' || f === 'd');
    const fi = FILES.indexOf(f), shieldRank = color === 'w' ? +r + 1 : +r - 1, shield2 = color === 'w' ? +r + 2 : +r - 2;
    let shield = 0;
    for (const df of [-1, 0, 1]) { const ff = FILES[fi + df]; if (!ff) continue; for (const rr of [shieldRank, shield2]) { const p = c.get(ff + rr); if (p && p.type === 'p' && p.color === color) { shield++; break; } } }
    return { sq: k, castled, centre, shield };
  }
  function developed(c, color) {
    let out = 0, total = 0;
    for (const t of ['n', 'b']) for (const sq of START[t]) { if ((color === 'w') !== (sq[1] === '1')) continue; total++; const p = c.get(sq); if (!(p && p.type === t && p.color === color)) out++; }
    return { out, total };
  }
  function readBoard(c, you, ev, threat) {
    const opp = you === 'w' ? 'b' : 'w', YOU = 'You', THEM = 'They';
    const { m } = material(c), diff = m[you] - m[opp], lines = [];
    const amount = (d) => WORDS[Math.abs(d)] || Math.abs(d) + ' points';
    lines.push('Material: ' + (diff === 0 ? 'even.' : diff > 0 ? 'you are up ' + amount(diff) + '.' : 'you are down ' + amount(diff) + '.'));
    if (ev) {
      const cp = clampCp(ev), mine = you === 'w' ? cp : -cp;
      const word = ev.mate ? (((ev.mate > 0) === (you === 'w')) ? 'you have a forced mate' : 'they have a forced mate') : Math.abs(mine) < 40 ? 'even' : Math.abs(mine) < 120 ? (mine > 0 ? 'slightly better for you' : 'slightly better for them') : Math.abs(mine) < 300 ? (mine > 0 ? 'clearly better for you' : 'clearly better for them') : (mine > 0 ? 'winning for you' : 'winning for them');
      lines.push('Engine: ' + word + (ev.mate ? '.' : ' (' + pawns(cp) + ').'));
    }
    const dy = developed(c, you), dt = developed(c, opp);
    lines.push('Development: you have ' + dy.out + ' of ' + dy.total + ' minor pieces out, they have ' + dt.out + ' of ' + dt.total + '.');
    const ky = kingState(c, you), kt = kingState(c, opp);
    const kw = (k, who) => who + (k.castled ? ' castled, ' + (k.shield >= 2 ? 'pawn shield intact' : 'pawn shield thin') : k.centre ? ' still in the centre' : ' king on ' + k.sq) + '.';
    lines.push('Kings: ' + kw(ky, 'your king') + ' ' + kw(kt, 'Their king').replace('Their king', 'their king').replace(/^their/, 'Their'));
    const cen = (col) => ['d4', 'e4', 'd5', 'e5'].filter((sq) => { const p = c.get(sq); return p && p.type === 'p' && p.color === col; });
    const cy = cen(you), ct = cen(opp);
    lines.push('Centre: ' + (cy.length || ct.length ? 'your pawns on ' + (cy.join(', ') || 'none') + ', theirs on ' + (ct.join(', ') || 'none') + '.' : 'nobody has claimed it yet.'));
    const hy = hangingOf(c, you), ht = hangingOf(c, opp);
    if (hy.length) lines.push('Hanging (yours): ' + hy.map((h) => PIECE[h.type] + ' on ' + h.sq).join(', ') + '.');
    if (ht.length) lines.push('Hanging (theirs): ' + ht.map((h) => PIECE[h.type] + ' on ' + h.sq).join(', ') + '.');
    if (threat) lines.push('Their idea: ' + threat.text);
    // priorities
    const pri = (side) => {
      const me = side === you, k = me ? ky : kt, d = me ? dy : dt, dother = me ? dt : dy, h = me ? hy : ht, md = me ? diff : -diff;
      if (me && c.in_check()) return 'get out of check, and look at what the check was for.';
      if (h.length) return 'save the ' + PIECE[h[0].type] + ' on ' + h[0].sq + ' before anything else.';
      if (me && threat && !threat.calm) return 'answer the threat (' + threat.san + ') first.';
      if (k.centre && d.out >= 2) return 'castle. The king is in the centre with pieces coming off.';
      if (d.out < d.total && d.out <= dother.out) return 'develop: knights and bishops out, nothing fancy yet.';
      if (md >= 3) return 'trade pieces and simplify; the extra material wins the endgame.';
      if (md <= -3) return 'keep pieces on and look for tactics; trades only help the side ahead.';
      if (k.castled && k.shield < 2) return 'repair or cover the king; the pawn shield is thin.';
      return 'improve the worst-placed piece and look for a pawn break in the centre.';
    };
    lines.push('Your priority: ' + pri(you));
    lines.push('Their priority: ' + pri(opp));
    return lines;
  }
  function renderTutor() {
    const g = game, el = $('tutor');
    if (!g || !g.tutor || state !== 'playing') { el.hidden = true; return; }
    el.hidden = false;
    const opts = $('tutorOpts'); opts.innerHTML = '';
    const T = g.think;
    $('tutorStat').textContent = !T ? 'looking…' : T.done ? (T.lines.length + ' options · tap one to see it') : 'looking…';
    if (!T) { $('tutorThreat').hidden = true; return; }
    const c = g.chess, cur = clampCp(T.ev);
    T.lines.forEach((ln, i) => {
      const warn = (ln.flags || []).find((f) => (g.weak || []).includes(f));
      const b = document.createElement('button'); b.className = 'opt' + (i === 0 ? ' first' : '') + (g.pick === ln.uci ? ' on' : '') + (warn ? ' warn' : '');
      const d = g.you === 'w' ? clampCp(ln) - cur : cur - clampCp(ln);
      b.innerHTML = '<b></b><span></span><i class="num"></i>';
      b.children[0].textContent = ln.san; b.children[1].textContent = (warn ? 'Your pattern: ' + PATTERNS[warn].name.toLowerCase() + '. ' : '') + ln.note;
      b.children[2].textContent = (ln.book ? 'Book' + (ln.cp == null && !ln.mate ? '' : ' · ') : '') + (ln.cp == null && !ln.mate ? '' : ln.mate ? 'M' + Math.abs(ln.mate) : i === 0 ? 'best' : lossTxt(-d));
      if (ln.book) b.classList.add('book');
      const sn = warn ? (g.streaks || {})[warn] || 0 : 0;
      if (sn >= 3 && WARN_WHY[warn]) { const s = document.createElement('small'); s.className = 'ow'; s.textContent = WARN_WHY[warn](sn); b.appendChild(s); }
      b.onclick = () => { g.pick = g.pick === ln.uci ? null : ln.uci; sel = g.pick ? ln.uci.slice(0, 2) : null;
        targets = sel ? c.moves({ square: sel, verbose: true }).map((m) => ({ to: m.to, capture: !!m.captured, promotion: !!m.promotion })) : []; drawGame(); renderTutor(); };
      opts.appendChild(b);
    });
    const th = $('tutorThreat');
    if (T.threat) { th.hidden = false; th.className = 'threat' + (T.threat.cp === 0 ? ' calm' : ''); th.innerHTML = '<b></b><span></span>';
      th.firstChild.textContent = T.threat.calm ? 'THEIR IDEA' : 'THEIR THREAT'; th.lastChild.textContent = T.threat.text; }
    else th.hidden = true;
  }
  // tutor pre-think: three candidate moves with reasons, and the opponent's idea if you passed
  async function think(myGen) {
    const g = game, e = engine(), c = g.chess;
    g.think = null; g.pick = null; renderTutor();
    try {
      const ev = await g.before;                                   // depth-12 single line (already running)
      if (myGen !== gen || !ev) return;
      const multi = await e.evaluate(c.fen(), { depth: 12, multipv: 3 });
      if (myGen !== gen) return;
      const lines = (multi.lines || []).filter((l) => l.pv && l.pv[0]).slice(0, 3).map((l) => { const ex = explainFull(c, l.pv[0]); return { uci: l.pv[0], san: sanOf(c.fen(), l.pv[0]), cp: l.cp, mate: l.mate, note: ex.text, flags: ex.flags }; });
      const pr = g.practice, bi = g.moves.length, bk = pr && !pr.off && !pr.done ? pr.line[bi] : null;   // practice: tag the book move, or add it
      if (bk) { const hit = lines.find((l) => l.uci === bk); if (hit) hit.book = true; else lines.push({ uci: bk, san: sanOf(c.fen(), bk), cp: null, mate: null, note: pr.notes[bi] || explain(c, bk), flags: [], book: true }); }
      g.think ={ ev: multi, lines, threat: null, done: false }; renderTutor();
      const th = await threatOf(c, g.you, multi, e);
      if (myGen !== gen || !g.think) return;
      g.think.threat = th;
      g.think.done = true; renderTutor(); drawGame();
    } catch (err) { if (myGen === gen) { g.think = { ev: null, lines: [], threat: null, done: true }; renderTutor(); } }
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
  function renderMoveList(el, list, cur, onTap, plain, times) {   // times: ms per ply, marks a long think with a clock
    el.innerHTML = '';
    list.forEach((m, i) => {
      if (i % 2 === 0) { const n = document.createElement('span'); n.className = 'n'; n.textContent = (i / 2 + 1) + '.'; el.appendChild(n); }
      const s = document.createElement('span');
      const slow = times && times[i] > LONG;
      s.className = 'm' + (m.label && !plain ? ' l-' + m.label : '') + (cur === i + 1 ? ' cur' : '') + (slow ? ' lt' : '');
      s.textContent = m.san + (plain ? '' : (SUFFIX[m.label] || ''));
      if (slow) s.title = fmtMs(times[i]) + ' on this move';
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
    if (s === 'playing' && game) game.t0 = Date.now();   // the think clock runs from "your move" to humanMove
    board.classList.toggle('busy', s !== 'playing');
    watchThink();
  }
  // the live long-think line, Train games only: once three minutes have gone on the current move, one plain line on the strip, once per move.
  // One interval, keyed to the game and the gen counter, so a finished or replaced game never gets it. The next move brings the hint back.
  let thinkTimer = null;
  function watchThink() {
    if (thinkTimer) { clearInterval(thinkTimer); thinkTimer = null; }
    const g = game, myGen = gen;
    if (!g || !g.train || g.drill || state !== 'playing') return;
    if (g.longSaid) { g.longSaid = false; const f = focusLine(); rateIdle((g.variant ? VAR_960 : TRAIN_HINT) + (f ? ' ' + f : '')); }
    thinkTimer = setInterval(() => {
      if (game !== g || myGen !== gen || state !== 'playing') { clearInterval(thinkTimer); thinkTimer = null; return; }
      if (g.longSaid || !(g.t0 && Date.now() - g.t0 >= LONG)) return;
      g.longSaid = true; rateIdle(LONG_NUDGE); clearInterval(thinkTimer); thinkTimer = null;
    }, 1000);
  }
  function thinking(v) {
    const el = $('thinking');
    el.textContent = v === true ? 'thinking…' : v || '';
    el.classList.toggle('on', v === true);
  }
  function drawGame() {
    if (!game) return;
    const c = game.chess, last = game.moves.length ? game.moves[game.moves.length - 1] : null;
    renderBoard(board, c, { flip: game.you === 'b', sel, targets, last: last && mv(last.uci), check: c.in_check(), onTap: tap, busy: state !== 'playing',
      arrow: game.hint && game.hint.ply === game.moves.length ? mv(game.hint.uci) : null,
      arrows: (game.sand && game.sand.ply === game.moves.length ? [Object.assign(mv(game.sand.uci), { cls: 'sand' })] : []).concat(game.tutor && state === 'playing' && game.think ? [].concat(game.pick ? [Object.assign(mv(game.pick), { cls: 'ghost' })] : [],
        game.think.threat && game.think.threat.uci && !game.think.threat.calm ? [Object.assign(mv(game.think.threat.uci), { cls: 'red' })] : []) : []) });
    $('turnTxt').textContent = state === 'playing' ? (c.in_check() ? 'check: your move' : 'your move') : state === 'over' ? 'game over' : '';
  }
  function tap(sq) {
    if (state !== 'playing' || !game) return;
    const c = game.chess, t = sel && targets.find((t) => t.to === sq);
    if (t) { const u = sel + sq + (t.promotion ? 'q' : ''); if (game.sandbox) sandboxMove(u); else humanMove(u); return; }
    const p = c.get(sq);
    if (p && p.color === game.you && c.turn() === game.you && sq !== sel) {
      sel = sq;
      targets = c.moves({ square: sq, verbose: true }).map((m) => ({ to: m.to, capture: !!m.captured, promotion: !!m.promotion }));
      if (stoneish()) { const n = $('youName').parentNode; n.dataset.pc = cap(PIECE[p.type]); clearTimeout(n._pt); n._pt = setTimeout(() => delete n.dataset.pc, 1200); }   // Stone templates: name the piece
    } else { sel = null; targets = []; }
    drawGame();
  }
  const hush = () => voice() === 'quiet' && !(game && game.practice);   // practice always talks, in the tutor's voice
  const silent = () => !!(game && (game.train || game.drill));         // Train and drills: rated silently, nothing shown during play
  function showRate(r) {
    if (silent()) return;
    const el = $('rate');
    el.hidden = hush();
    $('why').hidden = true; $('whyBtn').hidden = !r.why;
    el.dataset.label = r.tag || r.label;
    $('rateLabel').textContent = r.tag === 'book' ? 'Book' : r.tag === 'slip' ? 'Off the line' : cap(r.label);
    $('rateLoss').textContent = r.label === 'forced' || r.tag === 'book' ? '' : lossTxt(r.loss);
    $('rateJab').textContent = r.jab;
    el.classList.remove('in'); void el.offsetWidth; el.classList.add('in');
  }
  function rateIdle(text) {
    const el = $('rate'); el.dataset.label = ''; el.classList.remove('in'); el.hidden = hush() || !text;
    $('why').hidden = true; $('whyBtn').hidden = true;
    $('rateLabel').textContent = 'Coach'; $('rateLoss').textContent = ''; $('rateJab').textContent = text;
  }
  const renderMoves = () => renderMoveList($('moveList'), game.moves, null, null, voice() === 'quiet' || silent());

  // ---------- game flow -----------------------------------------------------
  function newGame(opts) {
    opts = opts || {};
    if (!window.Chess) { rateIdle('chess.js failed to load.'); return null; }
    // the day context, once a calendar day per player: ask first, then come back here with the answer. ctx given, practice and drills skip the sheet.
    if (opts.ctx === undefined && !opts.practice && !opts.drill && ctxToday() === undefined) { askCtx(opts); return null; }
    const variant = opts.variant === '960' && !opts.drill && !opts.practice ? '960' : null;   // the monthly diagnostic: a random back rank, no castling
    if (variant && !opts.fen) opts = Object.assign({}, opts, { fen: fen960() });
    let c0 = null;
    try { if (opts.fen && !new Chess().validate_fen(opts.fen).valid) return null; c0 = new Chess(opts.fen || undefined); } catch (e) { return null; }   // chess.js loads an empty board from a bad fen
    if (game && (state === 'playing' || state === 'thinking')) endGame('loss', 'resign', false);
    cancelAnalysis(); gen++; calibTick();
    const drill = opts.drill || null, col = opts.color || P().color, you = col === 'r' ? (Math.random() < .5 ? 'w' : 'b') : col;
    const calib = !!opts.calib && !P().calibrated;
    if (calib && !P().calib) { P().calib = { games: [] }; persist(); }
    if (CTX[opts.ctx] && ctxToday() === undefined) setCtx(opts.ctx);   // plan.js asked for us: remember it for the day
    const ctx = opts.ctx !== undefined ? (CTX[opts.ctx] ? opts.ctx : null) : (ctxToday() || null);
    // the mode: a level check or a drill is a plain game, practice takes its tutor flag, otherwise the saved mode (opts.mode overrides for this game only)
    const mode = MODES.includes(opts.mode) ? opts.mode : calib || drill ? 'play' : opts.tutor != null ? (opts.tutor ? 'tutor' : 'play') : P().mode;
    const train = mode === 'train', bare = train || !!drill;   // bare: no help of any kind, nothing from the engine on screen
    game = { id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6), date: new Date().toISOString(), elo: clampElo(calib ? calibElo(P()) : drill ? 2850 : opts.elo || P().elo), you, calib, mode, ctx, train, drill, t0: 0,
      variant, fen: variant ? c0.fen() : null, slept: sleptToday(), longSaid: false,   // slept: hours slept today, from the Train screen; longSaid: the long-think line, once per move
      chess: c0, moves: [], before: null, after: null, streak: 0, result: null, reason: null, entry: null, hints: 0, hint: null, tutor: mode === 'tutor', think: null, pick: null, takebacks: 0, nudges: 0, sandbox: false, sandLeft: 2, readPly: -1, sand: null, practice: opts.practice || null, budget: assistBudget(P().games).budget, used: 0, hinted: [] };
    lastRating = null; sel = null; targets = []; review = null;
    sheet('chessEnd', false); sheet('lineDone', false); sheet('ctxSheet', false); $('review').classList.remove('on'); $('chess').classList.add('on');
    $('chessHome').hidden = true; $('chessGame').hidden = false;
    $('analyzeBtn').hidden = true; $('resignBtn').hidden = false; $('playRow').hidden = !!game.practice; $('playRow').classList.toggle('one', bare); $('lessonBtn').hidden = !game.practice; $('slipRow').hidden = true;
    $('hintBtn').hidden = !!game.practice || bare; $('nudgeBtn').hidden = bare; evalBar.parentNode.hidden = bare; $('opening').hidden = !!drill || !!variant;   // no opening names from a random back rank
    $('oppName').textContent = drill ? '0:00' : 'Engine · ' + game.elo + (calib ? ' · level check ' + (P().calib.games.length + 1) + ' of 3' : '');
    $('youName').textContent = 'You · ' + COLN[you];
    const fi = focusInfo();
    game.streaks = streaksOf(P().games); game.focus = fi && fi.chosen ? fi.key : null;
    game.weak = patterns(P().games).items.map((it) => it.key).concat(fi ? [fi.key] : []);
    const focus = focusLine();
    rateIdle(drill ? drill.title + '. ' + (drill.goal === 'draw' ? 'Hold the draw.' : 'Win it.') + (drill.targetMs ? ' Target ' + mmss(drill.targetMs) + '.' : '') + ' Full-strength engine, clock running.'
      : variant ? VAR_960 + (focus ? ' ' + focus : '')
      : train ? TRAIN_HINT + (focus ? ' ' + focus : '')
      : voice() === 'quiet' ? '' : (calib ? 'Level check, game ' + (P().calib.games.length + 1) + ' of 3. Just play your normal game. ' : '') + (game.tutor ? 'Tutor mode. I show you the options and what they are up to. You still have to choose.' : you === 'w' ? (voice() === 'kind' ? 'Your move. Take your time.' : 'Your move. I’m watching.') : (voice() === 'kind' ? 'You have black. The engine opens.' : 'Black. The engine opens; try to keep up.')) + (focus ? ' ' + focus : ''));
    $('why').hidden = true; $('whyBtn').hidden = true; $('nudgeRow').hidden = true; $('nudgeHint').hidden = true; board.classList.remove('sandbox'); renderAssist();
    $('takeRow').hidden = true; $('tutor').hidden = !game.tutor; renderTutor();
    thinking(false); setEvalBar(evalBar, { cp: 0 }, you === 'b');
    const first = c0.turn() === you;   // a drill fen may have the engine to move
    renderMoves(); setState(first ? 'playing' : 'thinking'); drawGame(); showOpening($('opening'), []);
    $('chess').scrollTo(0, 0);
    const myGen = gen, e = engine();
    if (!e) { thinking('engine unavailable'); return game; }
    engReady.then(() => {
      if (myGen !== gen) return;
      e.setStrength(game.elo);
      if (game.drill) startDrillClock(game);
      if (!first) setTimeout(() => { if (myGen === gen) engineMove(myGen); }, 500);
      else preEval(myGen);
    });
    return game;
  }
  // evaluate the position the human is looking at (depth 12) while they think: this is evalBefore for the rating
  function preEval(myGen) {
    const g = game, e = engine();
    if (!e || g.drill) { g.before = Promise.resolve(null); return; }   // drills are not rated: the engine's time goes on its own moves
    g.before = e.evaluate(g.chess.fen(), { depth: 12 }).then((ev) => { if (myGen === gen && !g.train) setEvalBar(evalBar, ev, g.you === 'b'); return ev; }).catch(() => null);
    if (g.tutor) think(myGen);
  }
  // the human's move: the same path for a board tap and for __coach.move(uci)
  async function humanMove(uci) {
    if (state !== 'playing' || !game) return false;
    const g = game, c = g.chess, myGen = gen;
    if (c.turn() !== g.you) return false;
    const onlyMove = c.moves().length === 1, fenBefore = c.fen();
    const m = c.move(mv(uci));
    if (!m) return false;
    const played = uciOf(m), rec = { uci: played, san: m.san, label: null, loss: null, jab: null, ms: g.t0 ? Date.now() - g.t0 : null };   // ms: your think on this move
    g.t0 = 0;
    g.moves.push(rec); sel = null; targets = []; showOpening($('opening'), g.moves.map((x) => x.san));
    const usedHint = g.hint && g.hint.ply === g.moves.length - 1 && g.hint.uci === played; g.hint = null;
    const thought = g.think; g.think = null; g.pick = null; renderTutor();
    g.sandbox = false; g.sandLeft = 2; g.sand = null; board.classList.remove('sandbox'); $('sandboxBtn').classList.remove('on'); $('nudgeRow').hidden = true; $('nudgeHint').hidden = true;
    setState('thinking'); thinking(c.game_over() || silent() ? false : 'rating…'); drawGame(); renderMoves(); renderTutor();
    const fenAfter = c.fen();
    try {
      const e = engine();
      const before = await (g.before || Promise.resolve(null));
      if (myGen !== gen) return false;
      let rating, after = null;
      if (c.in_checkmate()) rating = { loss: 0, label: 'best' };
      else {
        after = c.game_over() || !e || g.drill ? { cp: 0, mate: null, best: null } : await e.evaluate(fenAfter, { depth: 12 });
        if (myGen !== gen) return false;
        g.after = after;
        rating = before ? ChessEngine.rate({ cpBefore: clampCp(before), cpAfter: clampCp(after), color: g.you, played, best: before.best,
          mateBefore: before.mate, mateAfter: after.mate, onlyMove }) : { loss: 0, label: onlyMove ? 'forced' : 'good' };
        if (!silent()) setEvalBar(evalBar, after, g.you === 'b');
      }
      const bestSan = before && before.best ? sanOf(fenBefore, before.best) : '';
      const streak0 = g.streak; g.streak = GOOD[rating.label] ? 0 : g.streak + 1;
      rec.label = rating.label; rec.loss = rating.loss; rec.best = before ? before.best : null; rec.bestSan = bestSan;
      rec.jab = coachLine(rating.label, { san: m.san, bestSan, loss: rating.loss, ply: g.moves.length, streak: g.streak, cpAfter: clampCp(after), color: g.you });
      rec.why = { fenBefore, fenAfter, played, best: before ? before.best : null, reply: after ? after.best : null, pv: before ? before.pv : [], label: rating.label, loss: rating.loss };
      if (usedHint) { rec.hinted = true; g.hinted.push(g.moves.length); if (voice() === 'tough') rec.jab = HINTED[g.moves.length % HINTED.length]; }
      // practice: strict line. A book move gets its note; anything else stops before the engine answers.
      const pr = g.practice, onLine = pr && !pr.off && !pr.done, bi = g.moves.length - 1, book = onLine ? pr.line[bi] : null, bookSan = book ? sanOf(fenBefore, book) : '';
      const tag = !book ? null : played === book ? 'book' : 'slip';
      if (tag === 'book') { rec.book = true; rec.jab = 'Book move. ' + (pr.notes[bi] || ''); }
      else if (tag === 'slip') { pr.slips++; pr.missed[bi] = 1; rec.jab = 'Not the line. The line goes ' + bookSan + ': ' + (pr.notes[bi] || ''); }
      lastRating = { uci: played, san: m.san, label: rating.label, loss: rating.loss, jab: rec.jab, bestSan, ply: g.moves.length, why: rec.why, tag };
      showRate(lastRating); renderMoves();
      if (tag === 'slip') {
        thinking(false); $('slipRow').hidden = false; g.prompt = 'slip';
        try { $('rate').scrollIntoView({ block: 'nearest', behavior: 'smooth' }); } catch (x) {}
        const choice = await new Promise((res) => { g.pending = res; });
        $('slipRow').hidden = true; g.prompt = null;
        if (myGen !== gen) return false;
        if (choice === 'back') {   // free: no counters, no record
          c.undo(); g.moves.pop(); g.streak = streak0; rec.label = null; lastRating = null;
          renderMoves(); showOpening($('opening'), g.moves.map((x) => x.san));
          rateIdle('Back on the ' + pr.title + '. The move here is ' + bookSan + (g.tutor ? '; it is marked Book in Think ahead.' : '. Play it from memory.'));
          g.think = thought; g.pick = null; setState('playing'); renderTutor(); drawGame();
          return lastRating;
        }
        pr.off = true;
        $('rateJab').textContent = 'Off the line at move ' + Math.floor(bi / 2 + 1) + '. From here it is free play against the engine at ' + g.elo + (g.tutor ? ', with Think ahead still on.' : '. The drill is not scored.');
      }
      if (c.game_over()) { thinking(false); gameOver(); return lastRating; }
      if (g.tutor && !tag && (rating.label === 'mistake' || rating.label === 'blunder' || rating.label === 'inaccuracy') && (pr || g.used + COST.takeback <= g.budget)) {
        // stop here: let them see it, and offer the take-back (which goes on the record, except in practice where it is free)
        const tv = pr ? 'kind' : voice();
        thinking(false); $('takeRow').hidden = false; $('rate').hidden = false; g.prompt = 'take';
        if (tv === 'tough') $('rateJab').textContent += ' ' + TAKE_OFFER[g.moves.length % TAKE_OFFER.length];
        else $('rateJab').textContent = (tv === 'quiet' ? cap(rating.label) + (rating.loss >= 5 ? ' (' + lossTxt(rating.loss) + ')' : '') + '. ' : '') + (bestSan && bestSan !== m.san ? bestSan + ' was better. ' : '') + 'Take it back?';
        try { $('rate').scrollIntoView({ block: 'nearest', behavior: 'smooth' }); } catch (x) {}
        const choice = await new Promise((res) => { g.pending = res; });
        $('takeRow').hidden = true; g.prompt = null;
        if (myGen !== gen) return false;
        if (choice === 'back') {
          c.undo(); g.moves.pop(); if (!pr) { g.takebacks++; g.used += COST.takeback; renderAssist(); } g.streak = Math.max(0, g.streak - 1);
          rec.label = null; lastRating = null;
          renderMoves(); showOpening($('opening'), g.moves.map((x) => x.san));
          rateIdle(tv === 'tough' ? TAKE_LINES[g.takebacks % TAKE_LINES.length].replace('%s', bestSan || 'something else').replace('%n', g.takebacks) : tv === 'kind' ? 'Taken back. Have another look' + (bestSan ? ', ' + bestSan + ' is worth considering.' : '.') : '');
          g.think = thought; g.pick = null; setState('playing'); renderTutor(); drawGame();
          return lastRating;
        }
      }
      if (tag === 'book' && g.moves.length >= pr.line.length) { await lineDone(); if (myGen !== gen) return lastRating; }
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
    const pr = g.practice;
    if (pr && !pr.off && pr.line[g.moves.length] && g.moves.every((x, i) => x.uci === pr.line[i])) m = c.move(mv(pr.line[g.moves.length]));
    if (!m && e) {
      await engReady; e.setStrength(g.elo);
      const r = await e.play(c.fen());
      if (myGen !== gen) return;
      if (r && r.move) m = c.move(mv(r.move));
    }
    if (!m) { const ms = c.moves({ verbose: true }); if (ms.length) m = c.move(ms[Math.floor(Math.random() * ms.length)]); }
    if (!m) return;
    g.moves.push({ uci: uciOf(m), san: m.san, label: null, loss: null });
    thinking(false); showOpening($('opening'), g.moves.map((x) => x.san));
    if (c.game_over()) { setState('over'); drawGame(); renderMoves(); gameOver(); return; }
    if (pr && !pr.off && !pr.done && g.moves.length >= pr.line.length) { drawGame(); renderMoves(); await lineDone(); if (myGen !== gen) return; }
    setState('playing'); drawGame(); renderMoves();
    preEval(myGen);
  }
  // the lesson line is played out: stop and offer to play on, go again, or go back to the lesson
  const slipTxt = (pr) => pr.slips ? 'You needed ' + pr.slips + ' correction' + (pr.slips > 1 ? 's' : '') + '.' : 'No corrections. Clean.';
  const drillScore = (pr, you) => { const of = pr.line.filter((x, i) => i % 2 === (you === 'w' ? 0 : 1)).length; return { id: pr.id, drill: pr.drill, first: of - Object.keys(pr.missed).length, of, slips: pr.slips }; };
  function lineDone() {
    const g = game, pr = g.practice; pr.done = true; g.prompt = 'done';
    thinking(false);
    const sc = pr.drill ? drillScore(pr, g.you) : null, extra = sc && pr.opts.onDone ? pr.opts.onDone(sc) : '';
    $('lineDone').querySelector('h3').textContent = pr.drill ? 'FROM MEMORY' : 'PRACTICE';
    $('ldTitle').textContent = 'Line done: the ' + pr.title;
    $('ldMsg').textContent = sc ? sc.first + '/' + sc.of + ' right first time. ' + (sc.slips ? sc.slips + ' slip' + (sc.slips > 1 ? 's' : '') + '.' : 'No slips.') + (extra ? ' ' + extra : '') : slipTxt(pr);
    sheet('lineDone', true);
    return new Promise((res) => { g.pending = res; }).then((v) => {
      sheet('lineDone', false); g.prompt = null;
      if (game === g && v === 'on') rateIdle('Line done. ' + slipTxt(pr) + ' From here the engine plays its own moves at ' + g.elo + '.' + (g.tutor ? ' Think ahead stays on; nothing is recorded.' : ' Nothing is recorded.'));
      return v;
    });
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
    if (g.drill && g.drill.timer) { clearInterval(g.drill.timer); g.drill.timer = null; }
    if (g.pending) { const r = g.pending; g.pending = null; r('live'); } $('takeRow').hidden = true; $('slipRow').hidden = true; sheet('lineDone', false); g.prompt = null; g.think = null; renderTutor();
    if (eng) eng.stop();
    thinking(false); sel = null; targets = [];
    g.result = result; g.reason = reason;
    setState('over'); drawGame();
    if (g.moves.length >= 2 && !g.practice && !g.drill) {   // practice and drills are never recorded (old entries may still carry a practice title)
      g.entry = { id: g.id, date: g.date, elo: g.elo, you: g.you, result, reason, moves: g.moves.map((m) => m.uci), sans: g.moves.map((m) => m.san), hints: g.hints, nudges: g.nudges, tutor: g.tutor, takebacks: g.takebacks, practice: g.practice ? g.practice.title : null, assist: { used: g.used, budget: g.budget }, hinted: g.hinted.slice(), report: null,
        mode: g.mode, ctx: g.ctx, times: g.moves.map((m) => m.ms == null ? null : m.ms), pm: null,   // times: ms per ply, null on the engine's; pm: the post-mortem, owed before the review
        variant: g.variant, slept: g.slept };
      if (g.variant) g.entry.fen = g.fen;   // the start position, so the review, the cards and the PGN can replay a random back rank
      g.entry.clean = isClean(g.entry);
      // a level-check game counts when it is played out or resigned, not when you walk away from it
      if (g.calib && showSheet && P().calib && P().calib.games.length < 3) { g.entry.calib = true; P().calib.games.push({ id: g.id, result, acc: null }); }
      if (P().focus && g.focus === P().focus.key && --P().focus.left <= 0) P().focus = null;
      P().games.unshift(g.entry); P().games = P().games.slice(0, 20); persist();
      emit('game', g.entry);
    }
    $('analyzeBtn').hidden = !g.entry; $('resignBtn').hidden = true; $('hintBtn').hidden = true; $('nudgeBtn').hidden = true; $('nudgeRow').hidden = true; $('nudgeHint').hidden = true; board.classList.remove('sandbox');
    renderHist();
    if (showSheet) {
      if (g.drill) { drillDone(g, result, reason); return; }
      $('chessEnd').querySelector('h3').textContent = 'GAME OVER';
      const k = reason === 'checkmate' ? (result === 'win' ? 'checkmateWin' : 'checkmateLoss') : reason;
      const T = voice() === 'tough' && !g.practice ? END : KIND_END, t = T[k] || T.resign;
      g.endText = t[1] + (g.moves.length ? ' ' + Math.ceil(g.moves.length / 2) + ' moves.' : '') + (g.practice ? ' ' + slipTxt(g.practice) + ' Practice games are not recorded.' : '');
      if (g.entry && g.entry.calib) runAnalysis(g.entry);   // level checks are analysed straight away: accuracy moves the next game's strength
      $('endTitle').textContent = t[0]; $('endMsg').textContent = g.endText + (g.entry && g.entry.calib ? calibNote() : '');
      $('endAnalyze').hidden = !g.entry;
      const more = g.calib && P().calib && P().calib.games.length < 3;
      $('endNew').textContent = g.practice ? 'Again' : more ? 'Game ' + (P().calib.games.length + 1) + ' of 3' : 'New game'; $('endHome').textContent = g.practice ? 'Back to lesson' : 'Home';
      sheet('chessEnd', true);
    }
  }
  const HINT_LINES = [
    'Fine. %s. I’ll remember that you asked.',
    '%s. You could have found that. We both know it.',
    'The move is %s. That one goes in your file.',
    '%s. Don’t make a habit of this.',
    'Try %s. And try thinking next time, it’s free.',
    '%s, obviously. Shall I move it for you as well?',
  ];
  // the kind voice: same facts, no edge. The quiet voice shows nothing during play.
  function kindLine(label, ctx) {
    const better = ctx.bestSan && ctx.bestSan !== ctx.san ? ctx.bestSan + ' was ' + (label === 'inaccuracy' ? 'a bit better' : 'better') + (ctx.loss >= 5 ? ' (' + lossTxt(ctx.loss) + ')' : '') + '.' : '';
    return { best: 'Best move. Well done.', great: 'Very good. ' + better, good: 'Fine. ' + better, forced: 'The only move, and you found it.',
      inaccuracy: 'Slightly loose. ' + better, mistake: 'That one costs something. ' + better, blunder: 'Ouch. ' + better + ' Have a look at why with αβ.' }[label] || '';
  }
  function coachLine(label, ctx) { if (game && game.practice) return kindLine(label, ctx); return voice() === 'tough' ?(window.ChessEngine ? ChessEngine.jab(label, ctx) : '') : voice() === 'kind' ? kindLine(label, ctx) : ''; }
  const KIND_END = {
    checkmateLoss: ['Checkmate. You lost.', 'The engine found a mate. The review shows where it started.'],
    checkmateWin: ['Checkmate. You won!', 'You beat the engine. Have a look at the review and enjoy it.'],
    stalemate: ['Draw.', 'Stalemate. Close one.'], repetition: ['Draw.', 'Repetition. A fair result.'], material: ['Draw.', 'Not enough material left to win.'],
    '50 moves': ['Draw.', 'Fifty moves without progress.'], resign: ['Resigned.', 'No shame in it. Try again when you are ready.'],
  };
  const TAKE_OFFER = ['Take it back if you must. It counts.', 'You can undo that. I will remember.', 'Take-back is right there. So is your dignity.', 'Undo it, or own it.'];
  const TAKE_LINES = [
    'Taken back. Try %s this time, or at least something with a plan.',
    'Fine. Again. %s was sitting there the whole time.',
    'Take-back number %n. The engine is keeping count. So am I.',
    'Undone. Look at their threat first, then at %s.',
  ];
  const HINTED = [
    'Yes, that was the move. It was also my move. You get half credit, rounded down.',
    'Played as told. Obedience is not the same as understanding.',
    'Correct, and you know why it’s correct? Neither do I, I only told you what.',
    'That’s the one I gave you. I’ll score it. I won’t respect it.',
  ];
  // the coach shows the best move, then holds it against you (the game is marked assisted)
  async function hint() {
    if (state !== 'playing' || !game || game.practice || silent()) return null;
    const g = game, myGen = gen, e = engine();
    if (!e) return null;
    if (g.hint && g.hint.ply === g.moves.length) return g.hint;
    if (g.used + COST.hint > g.budget) {
      if (g.used + COST.sandbox <= g.budget) { $('nudgeRow').hidden = false; nudgeNote('Not enough budget for a hint. A nudge is still on the table.'); return { degraded: true }; }
      budgetGone(); return null;
    }
    thinking('asking…');
    try {
      let ev = await (g.before || Promise.resolve(null));
      if (myGen !== gen || state !== 'playing') return null;
      if (!ev || !ev.best) { ev = await e.evaluate(g.chess.fen(), { depth: 12 }); if (myGen !== gen || state !== 'playing') return null; }
      if (!ev || !ev.best) return null;
      g.hints++; g.used += COST.hint; renderAssist(); g.hint = { ply: g.moves.length, uci: ev.best, san: sanOf(g.chess.fen(), ev.best) };
      const el = $('rate'); el.dataset.label = 'forced'; el.classList.remove('in');
      $('rateLabel').textContent = 'Hint ' + g.hints; $('rateLoss').textContent = ''; el.hidden = false; $('why').hidden = true; $('whyBtn').hidden = true;
      $('rateJab').textContent = voice() === 'tough' ? HINT_LINES[g.hints % HINT_LINES.length].replace('%s', g.hint.san) : 'Try ' + g.hint.san + '. ' + explain(g.chess, ev.best);
      thinking(false); drawGame();
      return g.hint;
    } catch (err) { thinking(false); return null; }
  }
  // ---------- nudge: a sandbox rating without the answer, or an objective read of the board ----------
  const SAND_LINES = {
    tough: { best: 'That one works. Play it before you talk yourself out of it.', great: 'Close to best. You will not get a better offer from me.', good: 'Playable. Not inspired, but playable.', forced: 'It is the only move. The sandbox was not needed.',
      inaccuracy: 'Loose. Something better exists, and no, I am not telling you what.', mistake: 'That costs you. Look again before you commit.', blunder: 'No. Absolutely not. Find out why before you touch the board.' },
    kind: { best: 'That is the best move here.', great: 'Very good option.', good: 'Fine, a reasonable move.', forced: 'It is the only legal move.', inaccuracy: 'A little loose. Have another look.', mistake: 'That one costs something. Look for what it allows.', blunder: 'That loses material or worse. Try something else.' },
  };
  function nudgeNote(text) { $('nudgeHint').hidden = false; $('nudgeHint').textContent = text; $('sandboxBtn').textContent = 'Sandbox a move (' + game.sandLeft + ' left)'; $('sandboxBtn').disabled = game.sandLeft <= 0; }
  function nudgeToggle() {
    if (state !== 'playing' || !game || game.practice || silent()) return;
    if (game.used + COST.sandbox > game.budget) { budgetGone(); return; }
    const row = $('nudgeRow'); row.hidden = !row.hidden;
    $('nudgeHint').hidden = row.hidden;
    if (!row.hidden) nudgeNote('Sandbox: tap a move to have it rated without playing it, no answer given, twice a turn. Read: the position in plain words, for both sides. Each costs 1 from the budget.');
  }
  function sandboxToggle() {
    if (state !== 'playing' || !game || game.practice || silent()) return;
    if (!game.sandbox && game.used + COST.sandbox > game.budget) { budgetGone(); return; }
    game.sandbox = !game.sandbox && game.sandLeft > 0; sel = null; targets = [];
    board.classList.toggle('sandbox', game.sandbox); $('sandboxBtn').classList.toggle('on', game.sandbox);
    if (game.sandbox) rateIdle('Sandbox. Tap the move you are thinking of.'); else if (voice() !== 'quiet' && !lastRating) rateIdle('');
    drawGame();
  }
  async function sandboxMove(uci) {
    const g = game; if (!g || state !== 'playing' || g.practice || silent() || g.sandLeft <= 0) return null;
    const c = g.chess, myGen = gen, e = engine();
    const t = new Chess(c.fen()); const m = t.move(mv(uci)); if (!m) return null;
    if (!spend('sandbox')) { budgetGone(); g.sandbox = false; board.classList.remove('sandbox'); return null; }
    sel = null; targets = []; g.sandLeft--; g.nudges++; g.sand = { uci, ply: g.moves.length }; drawGame();
    thinking('sandbox…');
    try {
      const before = await (g.before || Promise.resolve(null));
      if (myGen !== gen || state !== 'playing') return null;
      const after = t.in_checkmate() ? { cp: g.you === 'w' ? 2000 : -2000, mate: 0 } : t.game_over() ? { cp: 0, mate: null } : await e.evaluate(t.fen(), { depth: 12 });
      if (myGen !== gen || state !== 'playing') return null;
      const r = before ? ChessEngine.rate({ cpBefore: clampCp(before), cpAfter: clampCp(after), color: g.you, played: uci, best: before.best, mateBefore: before.mate, mateAfter: after.mate, onlyMove: c.moves().length === 1 }) : { loss: 0, label: 'good' };
      const el = $('rate'); el.hidden = false; el.dataset.label = r.label; el.classList.remove('in'); void el.offsetWidth; el.classList.add('in');
      $('rateLabel').textContent = 'Sandbox · ' + cap(r.label); $('rateLoss').textContent = r.label === 'forced' ? '' : lossTxt(r.loss);
      $('rateJab').textContent = m.san + ': ' + (SAND_LINES[voice() === 'tough' ? 'tough' : 'kind'][r.label] || '') + (g.sandLeft ? '' : ' That was your last sandbox this turn.');
      $('why').hidden = true; $('whyBtn').hidden = true;
      thinking(false); g.sandbox = false; board.classList.remove('sandbox'); $('sandboxBtn').classList.remove('on');
      $('sandboxBtn').textContent = 'Sandbox a move (' + g.sandLeft + ' left)'; $('sandboxBtn').disabled = g.sandLeft <= 0;
      return { uci, san: m.san, label: r.label, loss: r.loss };
    } catch (err) { thinking(false); return null; }
  }
  async function readTheBoard() {
    const g = game; if (!g || state !== 'playing' || g.practice || silent()) return null;
    if (g.readPly !== g.moves.length && g.used + COST.read > g.budget) { budgetGone(); return null; }
    const c = g.chess, myGen = gen, e = engine();
    thinking('reading…');
    try {
      const ev = await (g.before || Promise.resolve(null));
      if (myGen !== gen || state !== 'playing') return null;
      const th = g.think && g.think.threat ? g.think.threat : await threatOf(c, g.you, ev, e);
      if (myGen !== gen || state !== 'playing') return null;
      if (g.readPly !== g.moves.length) { if (!spend('read')) { budgetGone(); thinking(false); return null; } g.nudges++; g.readPly = g.moves.length; }
      const lines = readBoard(c, g.you, ev, th);
      const el = $('rate'); el.hidden = false; el.dataset.label = 'forced'; el.classList.remove('in');
      $('rateLabel').textContent = 'The board, read plainly'; $('rateLoss').textContent = ''; $('rateJab').textContent = '';
      renderWhy($('why'), lines); $('whyBtn').hidden = true;
      thinking(false);
      return lines;
    } catch (err) { thinking(false); return null; }
  }
  // practice an opening from the Learn screen: a strict tutor. No budget, Think ahead always on, the engine plays the book
  // line, a move off the line stops for a free take-back. Never recorded.
  // opts.drill 'memory': the same, with Think ahead off; notes only after the move; scored, and opts.onDone(score) stores it.
  function practice(lesson, opts) {
    if (!lesson || !lesson.line) return null;
    opts = opts || {}; const drill = opts.drill === 'memory' ? 'memory' : null;
    const c = new Chess(), line = [];
    for (const san of lesson.line) { const m = c.move(san); if (!m) break; line.push(uciOf(m)); }
    const g = newGame({ color: lesson.side || 'w', tutor: !drill, practice: { id: lesson.id, lesson, opts, drill, title: lesson.title, line, notes: lesson.notes || [], off: false, done: false, slips: 0, missed: {} } });
    if (g) rateIdle(drill ? 'From memory: the ' + lesson.title + '. No Think ahead, and each note only once you have played the move. A wrong move stops you and shows the line.' : 'Practice: the ' + lesson.title + '. Play the line you just stepped through; the book move is marked in Think ahead. Leave the line and I stop you.');
    return g;
  }
  function practiceState() {
    const g = game, pr = g && g.practice; if (!pr) return null;
    return { id: pr.id, title: pr.title, drill: pr.drill, score: pr.drill ? drillScore(pr, g.you) : null, onLine: !pr.off && !pr.done, off: pr.off, done: pr.done, slips: pr.slips, ply: g.moves.length, length: pr.line.length, prompt: g.prompt || null, over: state === 'over' };
  }
  function again() { const pr = game && game.practice; return pr ? practice(pr.lesson, pr.opts) : null; }
  function backToLesson() {
    const pr = game && game.practice;
    cancelAnalysis();
    if (game && (state === 'playing' || state === 'thinking')) endGame('loss', 'resign', false);
    gen++; if (eng) eng.stop();
    sheet('chessEnd', false); sheet('lineDone', false); $('chess').classList.remove('on'); $('review').classList.remove('on');
    $('chessHome').hidden = false; $('chessGame').hidden = true; setState('home');
    if (pr && window.__learn) window.__learn.show(pr.id); else if (window.__hub) window.__hub.show();
  }
  const answer = (v) => { if (game && game.pending) { const r = game.pending; game.pending = null; r(v); return true; } return false; };
  function resign() {
    if (game && (state === 'playing' || state === 'thinking')) endGame('loss', 'resign', true);
  }

  // ---------- drills: a set position against the full-strength engine, timed, never recorded (endgames.js calls this) ----------
  const DRILL_WHY = { checkmate: 'checkmate', stalemate: 'stalemate', repetition: 'repetition', material: 'insufficient material', '50 moves': 'fifty moves', resign: 'resigned' };
  // opts: { fen, you, title, goal: 'win'|'draw', targetMs, onDone({ result, ms, plies, metGoal }), onBack }. Either side may be to move in the fen.
  function drill(opts) {
    opts = opts || {}; if (!opts.fen) return null;
    const you = opts.you === 'b' ? 'b' : 'w';
    return newGame({ color: you, fen: opts.fen, ctx: null, drill: { opts, title: opts.title || 'Drill', goal: opts.goal === 'draw' ? 'draw' : 'win', targetMs: opts.targetMs > 0 ? opts.targetMs : null, onDone: opts.onDone, onBack: opts.onBack, t0: Date.now(), timer: null } });
  }
  // the clock starts once the engine is up (a cold start is not the learner's time) and ticks where the opponent's name goes
  function startDrillClock(g) {
    const d = g.drill; d.t0 = Date.now();
    d.timer = setInterval(() => { if (game !== g || state === 'over') { clearInterval(d.timer); d.timer = null; return; } $('oppName').textContent = mmss(Date.now() - d.t0); }, 250);
  }
  function drillDone(g, result, reason) {
    const d = g.drill, ms = Date.now() - d.t0, metGoal = d.goal === 'draw' ? result !== 'loss' : result === 'win', n = Math.ceil(g.moves.length / 2);
    $('chessEnd').querySelector('h3').textContent = 'DRILL';
    $('endTitle').textContent = reason === 'checkmate' ? (result === 'win' ? 'Checkmate.' : 'Mated.') : result === 'draw' ? (metGoal ? 'Draw held.' : 'Draw.') : reason === 'resign' ? 'Resigned.' : 'Lost.';
    $('endMsg').textContent = d.title + ': ' + (DRILL_WHY[reason] || reason) + ' after ' + n + ' move' + (n === 1 ? '' : 's') + ' in ' + mmss(ms) + '.' + (d.targetMs ? ' Target ' + mmss(d.targetMs) + (ms <= d.targetMs ? ': made it.' : ': over.') : '') + ' Drills are not recorded.';
    $('endAnalyze').hidden = true; $('endNew').textContent = 'Again'; $('endHome').textContent = 'Back';
    sheet('chessEnd', true);
    if (typeof d.onDone === 'function') { try { d.onDone({ result, ms, plies: g.moves.length, metGoal }); } catch (e) { console.error(e); } }
  }
  function drillBack() {
    const d = game && game.drill; sheet('chessEnd', false);
    if (game && game.drill && (state === 'playing' || state === 'thinking')) { cancelAnalysis(); endGame('loss', 'resign', false); }   // walked away mid-drill: no sheet, no onDone, nothing recorded
    gen++; if (eng) eng.stop();
    if (!(d && typeof d.onBack === 'function')) { goHome(); return; }
    $('chess').classList.remove('on'); $('chessHome').hidden = false; $('chessGame').hidden = true; setState('home');
    d.onBack();
  }

  // ---------- the day context: off-day morning, shift day, after a shift. Asked once a calendar day per player, stored on every game ----------
  const CTX = { morning: 'Off-day morning', shift: 'Shift day', post: 'After a shift' };
  const today = () => { const d = new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); };
  function ctxToday() { const d = P().day; return d && d.date === today() ? d.ctx : undefined; }   // undefined: not asked today. null: skipped.
  function sleptToday() { const d = P().day; return d && d.date === today() && typeof d.slept === 'number' ? d.slept : null; }   // hours slept, from the Train screen's day card; null when not given
  // slept: a number sets it, null clears it, undefined (the chess screen's own sheet) keeps today's answer
  function setCtx(ctx, slept) { P().day = { date: today(), ctx: CTX[ctx] ? ctx : null, slept: slept === undefined ? sleptToday() : typeof slept === 'number' && isFinite(slept) ? slept : null }; persist(); return P().day.ctx; }
  let ctxPending = null;   // the newGame opts waiting on the sheet
  function askCtx(opts) { ctxPending = opts; sheet('chessEnd', false); $('chess').classList.add('on'); sheet('ctxSheet', true); }
  function pickCtx(ctx) { setCtx(ctx); sheet('ctxSheet', false); const o = ctxPending; ctxPending = null; if (o) newGame(Object.assign({}, o, { ctx: P().day.ctx })); }
  const TRAIN_HINT = 'Training game. No engine during play. Afterwards: your post-mortem first, then the review.';
  const VAR_960 = 'Chess960 diagnostic. No castling in this variant here. Develop every piece, connect the rooks, keep the king safe.';
  const LONG_NUDGE = 'Three minutes on this move. A long think means you do not recognise the position: take the safest move you can see and bank the clock.';

  // ---------- post-mortem: four taps before any engine. The learner's own account comes first (narrative before engine); the sheet is not coach chatter, so every voice gets it ----------
  const PM_Q = ['Where did you first lose material?', 'What was threatened the move before?', 'Did you run the check (their checks, captures, threats) before that move?', 'Tag it'];
  const PM_THREAT = [['undefended', 'Undefended piece'], ['check', 'A check'], ['fork', 'Fork or double attack'], ['pin', 'Pin or skewer'], ['pawn', 'A pawn push or trap'], ['none', 'Nothing I saw']];
  const PM_CHECKED = [['yes', 'Yes'], ['no', 'No'], ['unsure', 'Not sure']];
  const PM_TAG = [['hung_piece', 'Hung piece'], ['missed_threat', 'Missed threat'], ['bad_trade', 'Bad trade'], ['wrong_plan', 'Wrong plan'], ['clock', 'Clock'], ['endgame_technique', 'Endgame technique'], ['none', 'None']];
  let pm = null;   // the open sheet: { entry, step, ply (0 = nowhere), threat, checked, tag, fens, resolve, wasOn }
  function fensOf(moves, fen) { const c = new Chess(fen || undefined), out = [c.fen()]; for (const u of moves) { if (!c.move(mv(u))) break; out.push(c.fen()); } return out; }   // fen: a Chess960 start
  // resolves with the saved pm, or null when dismissed. Does not open the review; a game without a report is analysed in the background so its ledger row lands.
  function postMortem(entry) {
    if (!entry || entry.practice || !Array.isArray(entry.moves)) return Promise.resolve(null);
    if (pm) pmClose(null);
    return new Promise((res) => {
      pm = { entry, step: 0, ply: null, threat: null, checked: null, tag: null, fens: fensOf(entry.moves, entry.fen), resolve: res, wasOn: $('chess').classList.contains('on') };
      $('chess').classList.add('on');   // the sheet lives in the chess screen; plan.js may call from its own
      $('pmNote').value = '';
      const el = $('pmMoves'); el.innerHTML = '';
      const none = document.createElement('button'); none.className = 'pill'; none.textContent = 'Nowhere'; none.dataset.ply = '0'; none.onclick = () => { pm.ply = 0; renderPm(); }; el.appendChild(none);
      (entry.sans || []).forEach((san, i) => {
        const ply = i + 1; if ((ply % 2 === 1) !== (entry.you === 'w')) return;   // your moves only
        const b = document.createElement('button'); b.className = 'pill'; b.textContent = Math.ceil(ply / 2) + '. ' + san; b.dataset.ply = ply; b.onclick = () => { pm.ply = ply; renderPm(); }; el.appendChild(b);
      });
      renderPm(); sheet('pmSheet', true);
    });
  }
  function pmPills(el, list, cur, pick) {
    if (!el.children.length) for (const [v, label] of list) { const b = document.createElement('button'); b.className = 'pill'; b.dataset.v = v; b.textContent = label; b.onclick = () => pick(v); el.appendChild(b); }
    for (const b of el.children) b.classList.toggle('on', b.dataset.v === cur);
  }
  function renderPm() {
    if (!pm) return;
    const s = pm.step, picked = [pm.ply, pm.threat, pm.checked, pm.tag][s];
    $('pmQ').textContent = PM_Q[s]; $('pmStepN').textContent = (s + 1) + ' of 4';
    ['pmStep1', 'pmThreat', 'pmChecked', 'pmStep4'].forEach((id, i) => { $(id).hidden = i !== s; });
    for (const b of $('pmMoves').children) b.classList.toggle('on', +b.dataset.ply === pm.ply);
    // the board shows the position after the move you picked (the final position until you pick one, or for "nowhere")
    const at = pm.ply ? Math.min(pm.ply, pm.fens.length - 1) : pm.fens.length - 1, c = new Chess(pm.fens[at]);
    renderBoard($('pmBoard'), c, { flip: pm.entry.you === 'b', last: pm.ply ? mv(pm.entry.moves[pm.ply - 1]) : null, check: c.in_check() });
    pmPills($('pmThreat'), PM_THREAT, pm.threat, (v) => { pm.threat = v; renderPm(); });
    pmPills($('pmChecked'), PM_CHECKED, pm.checked, (v) => { pm.checked = v; renderPm(); });
    pmPills($('pmTags'), PM_TAG, pm.tag, (v) => { pm.tag = v; renderPm(); });
    $('pmBack').disabled = s === 0; $('pmNext').disabled = picked == null; $('pmNext').textContent = s === 3 ? 'Save' : 'Next';
  }
  function pmNext() {
    if (!pm) return;
    if (pm.step < 3) { pm.step++; renderPm(); return; }
    const e = pm.entry;
    e.pm = { ply: pm.ply, threat: pm.threat, checked: pm.checked, tag: pm.tag, note: ($('pmNote').value || '').trim().slice(0, 200), at: new Date().toISOString() };
    const owner = ownerOf(e);
    if (e.report) putLedger(owner, e);   // analysed before the post-mortem (an older game): the row learns your call
    persist(); renderHist(); emit('pm', e);
    if (!e.report && !analysis) runAnalysis(e);   // not analysed yet: the review (or plan.js) picks this up
    pmClose(e.pm);
  }
  function pmClose(v) { const q = pm; pm = null; sheet('pmSheet', false); if (q && !q.wasOn) $('chess').classList.remove('on'); if (q) q.resolve(v); }
  // the gate: a recorded game is reviewed only after its post-mortem, old games included. Dismissing it brings the end sheet back.
  function gate(entry) {
    if (!entry || entry.pm || entry.practice) return Promise.resolve(true);
    const endOn = $('chessEnd').classList.contains('on'); sheet('chessEnd', false);
    return postMortem(entry).then((v) => { if (!v && endOn) sheet('chessEnd', true); return !!v; });
  }
  const pmDebt = () => P().games.filter((g) => !g.practice && !g.pm).length;

  // ---------- ledger: one compact row per analysed game, newest first, never pruned (curriculum.js measures the exit criteria from these) ----------
  // did the learner locate the loss? Within a move either side of the engine's first 2-pawn swing. "Nowhere" is right only when there was none.
  function pmHit(ply, firstBlunder) { if (!ply) return firstBlunder == null; return firstBlunder != null && Math.abs(firstBlunder - Math.ceil(ply / 2)) <= 1; }
  function ledgerRow(g) {
    const rep = g.report; if (!rep || !rep.moves) return null;
    const mine = rep.moves.filter((m) => m.color === g.you), fb = mine.find((m) => m.loss >= 200), firstBlunder = fb ? Math.ceil(fb.ply / 2) : null;
    const ci = (g.sans || []).findIndex((s, i) => /^O-O/.test(s) && (i % 2 === 0) === (g.you === 'w'));
    const ts = Array.isArray(g.times) ? g.times.filter((t) => typeof t === 'number') : [];
    const h = hitsOf(g), tags = {}; for (const k of PRI) tags[k] = h[k] ? h[k].n : 0;
    const cnt = (rep.counts && rep.counts[g.you]) || {};
    return { id: g.id, date: g.date, mode: g.mode || (g.tutor ? 'tutor' : 'play'), ctx: g.ctx || null, you: g.you, result: g.result, elo: g.elo, clean: isClean(g),
      variant: g.variant === '960' ? '960' : null, slept: typeof g.slept === 'number' ? g.slept : null,   // curriculum.js keeps 960 games out of the castling metric and buckets games by sleep
      plies: rep.moves.length, myMoves: mine.length, acc: rep.accuracy ? rep.accuracy[g.you] : null, firstBlunder, hung: mine.filter((m) => m.hung).length,
      castled: ci >= 0 ? Math.ceil((ci + 1) / 2) : null, longestMs: ts.length ? Math.max.apply(null, ts) : null, meanMs: ts.length ? Math.round(ts.reduce((a, b) => a + b, 0) / ts.length) : null,
      blunders: cnt.blunder || 0, mistakes: cnt.mistake || 0, inaccuracies: cnt.inaccuracy || 0, endgame: mine.some((m) => m.pieces != null && m.pieces <= 6), tags,
      pm: g.pm ? { ply: g.pm.ply, tag: g.pm.tag, checked: g.pm.checked, threat: g.pm.threat, hit: pmHit(g.pm.ply, firstBlunder) } : null };
  }
  // replace the row for this id (re-analysis, or a post-mortem saved after the analysis), newest first
  function putLedger(p, g) {
    const row = ledgerRow(g); if (!row) return null;
    p.ledger = p.ledger.filter((r) => r.id !== row.id).concat(row).sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
    return row;
  }
  function backfillLedger(p) { let n = 0; for (const g of p.games) if (g.report && g.report.moves && !p.ledger.some((r) => r.id === g.id)) { putLedger(p, g); n++; } return n; }

  // ---------- patterns: what keeps going wrong, across the analysed games ----------
  const BADL = { inaccuracy: 1, mistake: 1, blunder: 1 };
  const PATTERNS = {
    hung: { name: 'Hanging pieces', text: (n, g) => n + ' times in ' + g + ' games you left a piece where it could simply be taken.', drill: 'Before you move, ask: after this lands, what of mine is undefended?' },
    mate: { name: 'Mate blindness', text: (n, g) => n + ' times you walked into a forced mate, or missed one you had.', drill: 'Every move, look at every check on the board, theirs and yours.' },
    opening: { name: 'Early trouble', text: (n, g) => n + ' mistakes in the first ten moves across ' + g + ' games.', drill: 'Knights and bishops out, castle, then start thinking. Nothing clever before move ten.' },
    endgame: { name: 'Endgame slips', text: (n, g) => n + ' mistakes with few pieces left, where one error decides it.', drill: 'In endgames, count. King to the centre, push the passed pawn, check every king move.' },
    queen: { name: 'Queen adventures', text: (n, g) => n + ' queen moves that cost material or tempo.', drill: 'Leave the queen home until the minor pieces are out. She gets chased, and you lose moves.' },
    greedy: { name: 'Greedy captures', text: (n, g) => n + ' captures that lost the exchange or walked into a recapture.', drill: 'Before taking: what takes back, and what does that leave?' },
    check: { name: 'Pointless checks', text: (n, g) => n + ' checks that achieved nothing and cost time.', drill: 'A check is only good if the king ends up worse. Otherwise it is a wasted move.' },
    tilt: { name: 'Tilt', text: (n, g) => n + ' runs of two or more bad moves in a row.', drill: 'After a mistake, slow down. The next move is where games are actually lost.' },
  };
  // the firmer version, once a pattern has led three games running. Same Kind wording for every voice.
  const FIRM = {
    hung: 'before every move: what of mine is undefended?', mate: 'before every move: what checks do they have?',
    opening: 'knights and bishops out and castle before anything else.', endgame: 'once the pieces come off, slow down and count every pawn race.',
    queen: 'the queen stays home until your knights and bishops are out.', greedy: 'before every capture: what takes back?',
    check: 'only give check when you can say what it wins.', tilt: 'after any mistake, take ten seconds before the next move.',
  };
  const WARN_WHY = {
    hung: (n) => 'This leaves the piece where it can be taken, the same slip as your last ' + numw(n) + ' games.',
    greedy: (n) => 'This capture can be taken back for more than it wins, like in your last ' + numw(n) + ' games.',
    check: (n) => 'A check that wins nothing, like the ones in your last ' + numw(n) + ' games.',
    queen: (n) => 'The queen comes out early again. It has cost you in your last ' + numw(n) + ' games.',
  };
  const PRI = ['mate', 'hung', 'greedy', 'queen', 'opening', 'endgame', 'check', 'tilt'];
  const NUMW = ['no', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten'];
  const ORD = ['', 'First', 'Second', 'Third', 'Fourth', 'Fifth', 'Sixth', 'Seventh', 'Eighth', 'Ninth', 'Tenth'];
  const numw = (n) => NUMW[n] || String(n), ord = (n) => ORD[n] || n + 'th';
  const mateFor = (mt, you) => mt && ((you === 'w' && mt > 0) || (you === 'b' && mt < 0));
  // which patterns one of your moves belongs to (run = bad moves in a row, this one included)
  function tagsOf(m, you, run) {
    const t = [];
    if (m.hung) t.push('hung');
    if ((m.mateAfter && !mateFor(m.mateAfter, you)) || (mateFor(m.mateBefore, you) && m.label !== 'best' && m.label !== 'forced')) t.push('mate');
    if (!BADL[m.label]) return t;
    if (m.ply <= 20 && m.label !== 'inaccuracy') t.push('opening');
    if (m.pieces != null && m.pieces <= 6) t.push('endgame');
    if (m.san[0] === 'Q') t.push('queen');
    if (m.san.includes('x')) t.push('greedy');
    if (/\+$/.test(m.san)) t.push('check');
    if (run === 2) t.push('tilt');
    return t;
  }
  function hitsOf(g) {
    const h = {}; let run = 0;
    for (const m of g.report.moves) {
      if (m.color !== g.you) continue;
      run = BADL[m.label] ? run + 1 : 0;
      for (const k of tagsOf(m, g.you, run)) { h[k] = h[k] || { n: 0, loss: 0 }; h[k].n++; h[k].loss += m.loss || 0; }
    }
    return h;
  }
  // per pattern: how many analysed games running it has been the costliest one. A game without it resets it.
  function streaksOf(games) {
    const s = {};
    for (const g of games.filter((x) => x.report && x.report.moves).reverse()) {
      const h = hitsOf(g), top = PRI.filter((k) => h[k] && h[k].loss > 0).sort((a, b) => h[b].loss - h[a].loss)[0];
      for (const k of PRI) s[k] = k === top ? (s[k] || 0) + 1 : h[k] ? s[k] || 0 : 0;
    }
    return s;
  }
  // the pattern for the next game: a drill you picked (three games), else one running three games or more, else the top pattern
  function focusInfo() {
    const p = P(), st = streaksOf(p.games);
    if (p.focus && p.focus.left > 0 && PATTERNS[p.focus.key]) return { key: p.focus.key, chosen: true, left: p.focus.left, streak: st[p.focus.key] || 0 };
    const hot = PRI.filter((k) => st[k] >= 3).sort((a, b) => st[b] - st[a])[0], top = patterns(p.games).items[0];
    const key = hot || (top && top.key);
    return key ? { key, chosen: false, left: 0, streak: st[key] || 0 } : null;
  }
  function focusLine(force) {
    const f = focusInfo(); if (!f || (voice() === 'quiet' && !force)) return '';
    const name = PATTERNS[f.key].name.toLowerCase();
    if (f.streak >= 3) return 'Same thing ' + numw(f.streak) + ' games running. This game, ' + FIRM[f.key];
    return (f.chosen ? 'Your drill: ' + name + '. ' : voice() === 'tough' ? 'Focus today: ' + name + '. ' : 'This game, watch for ' + name + '. ') + PATTERNS[f.key].drill;
  }
  function setFocus(key) { if (PATTERNS[key]) { P().focus = { key, left: 3 }; persist(); } return P().focus; }

  // ---------- feedback cards: what went well, the one thing, next game. Pure: the report (and the games before it) in, cards out ----------
  const amt = (cp) => cp >= 800 ? 'about a queen' : cp >= 450 ? 'about a rook' : cp >= 250 ? 'about a piece' : cp >= 130 ? 'more than a pawn' : cp >= 70 ? 'about a pawn' : 'a little';
  function cards(entry, games) {
    const rep = entry && entry.report; if (!rep || !rep.moves) return [];
    games = games || P().games;
    const i = games.findIndex((g) => g === entry || (entry.id && g.id === entry.id));
    const chain = i >= 0 ? games.slice(i) : [entry].concat(games);   // this game and the ones before it
    const items = patterns(chain).items.map((it) => it.key), st = streaksOf(chain), you = entry.you, sgn = you === 'w' ? 1 : -1, ev = rep.evals || [];
    const ref = (m) => moveNo(m.ply) + m.san, out = [], runAt = {};
    let run = [], long = [], top = null, gain = 0, bad = 0;
    for (const m of rep.moves) {
      if (m.color !== you) continue;
      bad = BADL[m.label] ? bad + 1 : 0; runAt[m.ply] = bad;
      run = m.label === 'best' || m.label === 'great' ? run.concat(m) : []; if (run.length > long.length) long = run;
      const prev = rep.moves[m.ply - 2];   // their move just before: did you make them pay for it?
      if (GOOD[m.label] && prev && BADL[prev.label] && ev[m.ply] != null && ev[m.ply - 2] != null && sgn * (ev[m.ply] - ev[m.ply - 2]) > gain) { gain = sgn * (ev[m.ply] - ev[m.ply - 2]); top = m; }
    }
    const mine = rep.moves.filter((m) => m.color === you);
    const paid = (m) => ({ m, text: ref(m) + ' made them pay for their mistake and won ' + amt(gain) + '.' });
    const pick = mine.find((m) => m.label === 'best' && m.ply > 8) || mine.find((m) => m.label === 'best' || m.label === 'great');
    const good = gain >= 150 ? paid(top)
      : long.length >= 3 ? { m: long[0], text: 'Moves ' + Math.ceil(long[0].ply / 2) + ' to ' + Math.ceil(long[long.length - 1].ply / 2) + ': ' + numw(long.length) + ' strong moves in a row, right with the engine.' }
      : top && gain >= 60 ? paid(top)
      : pick ? { m: pick, text: ref(pick) + (pick.label === 'best' ? ' was exactly the engine’s choice.' : ' was close to the engine’s choice.') } : null;
    if (good) out.push({ kind: 'good', title: 'What went well', head: null, text: good.text, ply: good.m.ply, ref: ref(good.m), pattern: null });
    const worst = mine.filter((m) => BADL[m.label] && m.loss > 0).sort((a, b) => b.loss - a.loss)[0];
    if (!worst) {
      const loose = mine.filter((m) => m.loss > 0).sort((a, b) => b.loss - a.loss)[0];
      if (loose) out.push({ kind: 'one', title: 'The one thing', head: null, text: 'No real mistakes this game. Your loosest move was ' + ref(loose) + ', and it cost only ' + amt(loose.loss) + '.', ply: loose.ply, ref: ref(loose), pattern: null });
      out.push({ kind: 'next', title: 'Next game', head: null, text: 'Same again: knights and bishops out, castle, and check every capture before you move.', ply: good ? good.m.ply : loose ? loose.ply : 0, ref: '', pattern: null });
      return out;
    }
    const rank = (k) => (st[k] >= 3 ? -100 - st[k] : 0) + (items.includes(k) ? items.indexOf(k) : 10 + PRI.indexOf(k));
    const k = tagsOf(worst, you, runAt[worst.ply]).sort((a, b) => rank(a) - rank(b))[0] || null, n = k ? st[k] || 0 : 0;
    const w = ref(worst), cost = amt(worst.loss), better = worst.bestSan && worst.best !== worst.uci ? ' ' + worst.bestSan + ' was the better move.' : '';
    const ONE = {
      hung: w + ' left your ' + (PIECE[worst.hung] || 'piece') + ' where it could simply be taken.',
      mate: mateFor(worst.mateAfter, you === 'w' ? 'b' : 'w') ? w + ' let them force checkmate.' : 'You had a forced mate, and ' + w + ' let it slip.',
      greedy: w + ' grabbed material, but the recapture cost you ' + cost + '.', queen: w + ' moved the queen, and it cost you ' + cost + '.',
      opening: w + ' came early in the game and cost you ' + cost + '.', endgame: 'With few pieces left, ' + w + ' cost you ' + cost + '.',
      check: w + ' gave a check that led nowhere and cost you ' + cost + '.', tilt: w + ' came straight after another slip and cost you ' + cost + '.',
    };
    const head = !k ? null : n >= 3 ? ord(n) + ' game running: ' + PATTERNS[k].name.toLowerCase() : items.includes(k) ? 'Your pattern: ' + PATTERNS[k].name.toLowerCase() : PATTERNS[k].name;
    out.push({ kind: 'one', title: 'The one thing', head, text: (k ? ONE[k] : w + ' cost you ' + cost + '.') + better, ply: worst.ply, ref: w, pattern: k, streak: n });
    let next = k ? (n >= 3 ? 'Next game, ' + FIRM[k] : PATTERNS[k].drill) : null;
    if (!next) {
      let rs = '';
      try { if (worst.reply && entry.moves) { const c = new Chess(entry.fen || undefined); for (const u of entry.moves.slice(0, worst.ply)) c.move(mv(u)); rs = sanOf(c.fen(), worst.reply); } } catch (e) {}
      next = rs ? 'Before every move, ask what they can do next. After ' + w + ' they had ' + rs + '.' : 'Before every move, compare it with one other option.' + (worst.bestSan ? ' At move ' + Math.ceil(worst.ply / 2) + ' that was ' + worst.bestSan + '.' : '');
    }
    out.push({ kind: 'next', title: 'Next game', head: null, text: next, ply: worst.ply, ref: w, pattern: k });
    return out;
  }

  // ---------- find my level: three games from 1000. Win +250, draw +100, loss −200, and ±100 for accuracy over 80 or under 55 ----------
  const CAL = { win: 250, draw: 100, loss: -200 };
  function calibElo(p) {
    let e = 1000;
    for (const r of ((p || P()).calib || { games: [] }).games) e = Math.max(800, Math.min(2850, e + (CAL[r.result] || 0) + (r.acc == null ? 0 : r.acc > 80 ? 100 : r.acc < 55 ? -100 : 0)));
    return e;
  }
  function calibNote() {
    const c = P().calib; if (!c || !c.games.length) return '';
    const n = c.games.length, last = c.games[n - 1];
    return n >= 3 ? ' Level check done. Working out your level…' : ' Level check: game ' + n + ' of 3 done.' + (last.acc == null && analysis ? ' Analysing…' : ' Next game at ' + calibElo() + '.');
  }
  // after a level-check game is analysed (or on the way home): fill in accuracy, and after game 3 set the level
  function calibTick() {
    const p = P(), c = p.calib; if (!c || p.calibrated) return;
    for (const r of c.games) if (r.acc == null) { const e = p.games.find((g) => g.id === r.id); if (e && e.report) r.acc = e.report.accuracy[e.you]; }
    persist();
    if (c.games.length < 3) { if (game && game.calib && game.endText && $('chessEnd').classList.contains('on')) $('endMsg').textContent = game.endText + calibNote(); renderCalib(); return; }
    if (analysis && analysis.entry && analysis.entry.calib) return;   // game 3 is still being analysed
    p.elo = clampElo(calibElo(p)); p.calibrated = true; p.calib = null; persist();
    $('calibTitle').textContent = 'Your level: ~' + p.elo;
    $('calibMsg').textContent = 'The engine will play at that strength. You can change it in settings.';
    sheet('chessEnd', false); sheet('calibDone', true); renderSettings();
  }
  function renderCalib() {
    const p = P(), el = $('calibCard'); el.hidden = p.calibrated;
    if (p.calibrated) return;
    const n = p.calib ? p.calib.games.length : 0;
    $('calibHead').textContent = n ? 'Find your level · Game ' + Math.min(3, n + 1) + ' of 3' : 'Find your level: three quick games';
    $('calibTxt').textContent = n >= 3 ? 'Working out your level from the last game…' : n ? 'Next game at ' + calibElo(p) + '. A win moves it up, a loss moves it down.' : 'The engine starts at 1000 and adjusts after each game. Then it plays at your level.';
    $('calibGo').textContent = 'Play game ' + Math.min(3, n + 1); $('calibGo').disabled = n >= 3;
  }
  function renderFocus() {
    const f = focusInfo(), el = $('focusBox'), txt = f && (f.chosen || voice() !== 'quiet') ? focusLine(true) : '';
    el.hidden = !txt; if (!txt) return;
    el.children[0].textContent = f.chosen ? 'Your drill · ' + f.left + ' game' + (f.left > 1 ? 's' : '') + ' left' : 'Next game';
    el.children[1].textContent = txt; el.children[2].hidden = !f.chosen;
  }
  function patterns(games) {
    const done = games.filter((g) => g.report && g.report.moves);
    const hits = {}, total = { moves: 0, bad: 0 }, accs = [];
    for (const k in PATTERNS) hits[k] = { n: 0, loss: 0 };
    for (const g of done) {
      accs.push(g.report.accuracy[g.you]);
      let run = 0;
      for (const m of g.report.moves) {
        if (m.color !== g.you) continue;
        total.moves++;
        const bad = !!BADL[m.label]; if (bad) total.bad++;
        run = bad ? run + 1 : 0;
        for (const k of tagsOf(m, g.you, run)) { hits[k].n++; hits[k].loss += m.loss || 0; }
      }
    }
    const items = Object.keys(PATTERNS).map((k) => ({ key: k, n: hits[k].n, loss: hits[k].loss })).filter((it) => it.n >= 2)
      .sort((a, b) => b.loss - a.loss).slice(0, 3).map((it) => ({ key: it.key, n: it.n, name: PATTERNS[it.key].name, text: PATTERNS[it.key].text(it.n, done.length), drill: PATTERNS[it.key].drill }));
    const recent = accs.slice(0, 3), older = accs.slice(3, 6), mean = (a) => a.length ? a.reduce((x, y) => x + y, 0) / a.length : null;
    return { games: done.length, items, acc: mean(recent), trend: older.length ? mean(recent) - mean(older) : null, badRate: total.moves ? total.bad / total.moves : 0 };
  }
  // ---------- assist budget: hints cost 3, take-backs 2, nudges 1. The budget shrinks as your unassisted accuracy rises. ----------
  const COST = { hint: 3, takeback: 2, sandbox: 1, read: 1 };
  function unassistedAcc(entry) {
    if (!entry.report || !entry.report.moves) return null;
    const hinted = new Set(entry.hinted || []);
    const losses = entry.report.moves.filter((m) => m.color === entry.you && !hinted.has(m.ply)).map((m) => m.loss || 0);
    return losses.length && window.ChessEngine ? ChessEngine.accuracy(losses) : null;
  }
  function assistBudget(games) {
    const accs = games.map(unassistedAcc).filter((a) => a != null).slice(0, 5);
    const acc = accs.length ? accs.reduce((x, y) => x + y, 0) / accs.length : null;
    const budget = accs.length < 3 || acc < 60 ? 10 : acc < 70 ? 8 : acc < 80 ? 6 : 4;     // generous, floor of 4, never zero
    const used = games.filter((g) => g.assist).slice(0, 6).map((g) => g.assist.used);
    const mean = (a) => a.length ? a.reduce((x, y) => x + y, 0) / a.length : null;
    return { budget, acc, games: accs.length, recent: mean(used.slice(0, 3)), older: mean(used.slice(3, 6)) };
  }
  // spend from this game's budget; false means it is gone (the soft cap: the game goes on, the help does not)
  function spend(kind) {
    const g = game; if (!g || g.practice) return false;
    if (g.used + COST[kind] > g.budget) return false;
    g.used += COST[kind]; renderAssist(); return true;
  }
  function renderAssist() {
    const g = game, el = $('assistLine'); if (!g || g.practice || silent()) { el.hidden = true; return; }
    el.hidden = false;
    const left = g.budget - g.used;
    el.textContent = left > 0 ? 'Assist budget: ' + left + ' of ' + g.budget + ' left (hint 3, take-back 2, nudge 1).' : 'Assist budget spent. This one is yours.';
    $('hintBtn').disabled = left < 1; $('nudgeBtn').disabled = left < 1;
  }
  function budgetGone() {
    rateIdle(voice() === 'tough' ? 'Budget’s gone. This one is yours, and I am watching.' : voice() === 'kind' ? 'No more help this game. You have got this.' : '');
    $('rate').hidden = voice() === 'quiet';
  }
  function renderPatterns() {
    const el = $('patterns'), pt = patterns(P().games); el.innerHTML = '';
    const h = document.createElement('div'); h.className = 'ph';
    if (!pt.games) { h.textContent = voice() === 'quiet' ? 'Analyse a few games and your recurring weak points show up here.' : 'Play and analyse a few games. Then I will tell you what keeps going wrong.'; el.appendChild(h); return; }
    h.innerHTML = '<b></b><span></span>';
    h.firstChild.textContent = pt.acc != null ? Math.round(pt.acc) + '% accuracy' : '';
    h.lastChild.textContent = (pt.trend != null ? (pt.trend >= 0 ? '▲ ' : '▼ ') + Math.abs(pt.trend).toFixed(0) + ' vs the three before · ' : '') + pt.games + ' analysed game' + (pt.games > 1 ? 's' : '') + (pt.games < 3 ? ' · early read' : '');
    el.appendChild(h);
    const ab = assistBudget(P().games), al = document.createElement('div'); al.className = 'ph';
    al.innerHTML = '<b></b><span></span>'; al.firstChild.textContent = 'Assist budget ' + ab.budget;
    al.lastChild.textContent = (ab.acc != null ? Math.round(ab.acc) + '% unassisted over the last ' + ab.games + ' · ' : '') + (ab.recent != null ? 'using ' + ab.recent.toFixed(1) + ' a game' + (ab.older != null ? (ab.recent <= ab.older ? ' ▼ ' : ' ▲ ') + 'from ' + ab.older.toFixed(1) : '') : 'drops to 8, 6, then 4 as your unassisted accuracy passes 60, 70, 80');
    el.appendChild(al);
    if (!pt.items.length) { const p = document.createElement('p'); p.className = 'chint'; p.textContent = pt.games < 3 ? 'Nothing repeating yet. A few more games and it will.' : 'No pattern stands out. The mistakes are spread around, which is its own kind of answer.'; el.appendChild(p); return; }
    for (const it of pt.items) {
      const d = document.createElement('div'); d.className = 'pat';
      d.innerHTML = '<b></b><span></span><i></i>';
      d.children[0].textContent = it.name; d.children[1].textContent = it.text; d.children[2].textContent = it.drill;
      el.appendChild(d);
    }
  }

  // ---------- history -------------------------------------------------------
  function renderHist() {
    const el = $('chessHist'); el.innerHTML = '';
    if (!P().games.length) { const p = document.createElement('p'); p.className = 'chint'; p.textContent = 'No games yet. The engine is waiting.'; el.appendChild(p); return; }
    for (const g of P().games) {
      const d = document.createElement('div'); d.className = 'hcard';
      const acc = g.report && g.report.accuracy ? g.report.accuracy[g.you] + '%' : '—';
      d.innerHTML = '<div><b class="res"></b><small></small></div><div class="num"><span></span><small>elo</small></div><div class="num"><span></span><small>acc</small></div><button class="pill rv">Review</button>';
      const b = d.querySelector('.res'); b.textContent = RES[g.result] || '?'; b.classList.add(g.result);
      d.querySelector('small').textContent = fmtDate(g.date) + ' · ' + COLN[g.you][0] + ' · ' + g.reason + (g.calib ? ' · level check' : '') + (g.practice ?' · ' + g.practice : '') + (g.tutor ? ' · tutor' : '') + (g.mode === 'train' ? ' · train' : '') + (g.variant === '960' ? ' · 960' : '') + (!g.pm && !g.practice ? ' · post-mortem due' : '') + (g.takebacks ? ' · ' + g.takebacks + ' undo' : '') + (g.hints ? ' · ' + g.hints + ' hint' + (g.hints > 1 ? 's' : '') : '') + (g.nudges ? ' · ' + g.nudges + ' nudge' + (g.nudges > 1 ? 's' : '') : '') + (g.assist && g.assist.used ? ' · assist ' + g.assist.used + '/' + g.assist.budget : '');
      d.children[1].firstChild.textContent = g.elo; d.children[2].firstChild.textContent = acc;
      d.querySelector('.rv').onclick = () => gate(g).then((ok) => ok && openReview(g));
      el.appendChild(d);
    }
  }
  function renderSettings() {
    const tr = $('themeRow');
    if (!tr.children.length) for (const k of Object.keys(THEMES)) {
      const b = document.createElement('button'); b.dataset.theme = k; b.setAttribute('aria-label', k + ' board');
      const [name, l, d] = THEMES[k], sq = (c) => '<i style="background:' + c + '"></i>';
      b.innerHTML = '<span class="sw">' + sq(l) + sq(d) + sq(d) + sq(l) + '</span>'; b.appendChild(document.createTextNode(name));
      b.onclick = () => { P().theme = k; persist(); applyTheme(); renderSettings(); };
      tr.appendChild(b);
    }
    for (const b of tr.children) b.classList.toggle('on', b.dataset.theme === P().theme);
    const pr = $('playerRow');
    if (!pr.children.length) for (const k of ['jesse', 'j']) { const b = document.createElement('button'); b.className = 'pill'; b.dataset.player = k; b.textContent = save.players[k].name; b.onclick = () => setPlayer(k); pr.appendChild(b); }
    for (const b of pr.children) b.classList.toggle('on', b.dataset.player === save.player);
    $('voiceBtn').textContent = { tough: 'Tough', kind: 'Kind', quiet: 'Quiet' }[voice()];
    $('voiceHint').textContent = { tough: 'Tough: every move judged, out loud, no mercy.', kind: 'Kind: the same facts, said nicely.', quiet: 'Quiet: nothing during the game. The review is still there afterwards.' }[voice()];
    renderPatterns(); renderCalib(); renderFocus();
    $('eloV').textContent = P().elo;
    $('colorBtn').textContent = COLN[P().color];
    $('modeBtn').textContent = { play: 'Play', tutor: 'Tutor', train: 'Train' }[P().mode];
    $('modeHint').textContent = { tutor: 'Tutor: before each move you see your three best options with a reason, and what they would do if you passed. Bad moves can be taken back, and that goes on your record.', play: 'Play: no help, every move rated, the coach says what it thinks.',
      train: 'Train: a training game. No ratings, eval bar, hints or nudges while you play; the engine stays at your strength. Afterwards your post-mortem first, then the review.' }[P().mode];
    $('eloMinus').disabled = P().elo <= 800; $('eloPlus').disabled = P().elo >= 2850;
  }

  // ---------- review --------------------------------------------------------
  function openReview(entry) {
    const busy = analysis && analysis.entry === entry;   // already analysing this one in the background (level check): just watch it
    if (!busy) cancelAnalysis();
    review = { entry, moves: entry.moves, you: entry.you, report: entry.report, ply: 0, fens: null };
    setState('review');
    sheet('chessEnd', false); $('chess').classList.remove('on'); $('review').classList.add('on'); $('review').scrollTo(0, 0);
    $('rBody').hidden = !entry.report; $('rProgress').hidden = !!entry.report;
    if (entry.report) { renderReview(); return Promise.resolve(entry.report); }
    if (busy) { $('rProgress').textContent = 'Analysing…'; return analysis.promise; }
    return runAnalysis(entry);
  }
  function runAnalysis(entry) {
    const p = doAnalysis(entry).then((rep) => { if (entry.calib && rep) calibTick(); return rep; });
    if (analysis && analysis.entry === entry) analysis.promise = p;
    return p;
  }
  async function doAnalysis(entry) {
    const e = engine();
    if (!e) { $('rProgress').textContent = 'Engine unavailable.'; return null; }
    const sig = { cancelled: false }; analysis = { signal: sig, entry };
    $('rProgress').textContent = 'Analysing 0/' + entry.moves.length + '…';
    try {
      await engReady;
      const rep = await ChessEngine.analyze(e, entry.moves, { depth: 14, color: entry.you, signal: sig, fen: entry.fen || null,   // fen: a Chess960 start
        onProgress: (i, n) => { if (!sig.cancelled) $('rProgress').textContent = 'Analysing ' + i + '/' + n + '…'; } });
      if (sig.cancelled || !rep) return null;
      entry.report = rep; upgradeEntry(entry); putLedger(ownerOf(entry), entry); persist(); renderHist(); renderPatterns(); renderFocus();
      if (review && review.entry === entry) { review.report = rep; $('rBody').hidden = false; $('rProgress').hidden = true; renderReview(); }
      emit('analysed', entry);
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
    const c = new Chess(r.entry.fen || undefined); r.fens = [c.fen()];
    for (const u of r.moves) { c.move(mv(u)); r.fens.push(c.fen()); }
    $('rSummary').textContent = (rep.summary || '') + (r.entry.hints || r.entry.nudges ? '\nAssisted: ' + [r.entry.hints ? r.entry.hints + ' hint' + (r.entry.hints > 1 ? 's' : '') : '', r.entry.nudges ? r.entry.nudges + ' nudge' + (r.entry.nudges > 1 ? 's' : '') : ''].filter(Boolean).join(' and ') + '. The accuracy knows.' : '') + (r.entry.assist && r.entry.assist.used ? ' Assist budget used: ' + r.entry.assist.used + ' of ' + r.entry.assist.budget + '.' + (unassistedAcc(r.entry) != null && (r.entry.hinted || []).length ? ' Accuracy without the hinted moves: ' + unassistedAcc(r.entry) + '%.' : '') : '') + (r.entry.tutor ? '\nTutor game' + (r.entry.takebacks ? ', ' + r.entry.takebacks + ' take-back' + (r.entry.takebacks > 1 ? 's' : '') : '') + '. The moves you kept are the ones being judged.' : '') + (r.entry.mode === 'train' ? '\nTraining game: nothing from the engine during play.' : '') + (r.entry.variant === '960' ? '\nChess960 diagnostic, no castling.' : '');
    $('rOpening').hidden = r.entry.variant === '960'; showOpening($('rOpening'), r.entry.variant === '960' ? [] : r.entry.sans || []);   // a random back rank has no opening name
    $('rShare').textContent = 'Share';
    const cy = rep.counts[you], st = $('rStats'); st.innerHTML = '';
    for (const [v, k] of [[rep.accuracy[you] + '%', 'you'], [rep.accuracy[op] + '%', 'engine'], [cy.blunder, 'blunders'], [cy.mistake, 'mistakes'], [cy.inaccuracy, 'inacc.']]) {
      const d = document.createElement('div'); d.innerHTML = '<b class="num"></b><small></small>'; d.firstChild.textContent = v; d.lastChild.textContent = k; st.appendChild(d);
    }
    const w = $('rWorst'); w.innerHTML = '';
    const worst = (rep.worst || []).filter((m) => !GOOD[m.label]).slice(0, narrow() ? 1 : 3);   // only moments worth shouting about; narrow: just the one
    $('rNarrow').hidden = !narrow();
    if (!worst.length) { const p = document.createElement('p'); p.className = 'chint'; p.textContent = 'Nothing worth shouting about. Suspicious.'; w.appendChild(p); }
    for (const m of worst) {
      const b = document.createElement('button'); b.className = 'wm l-' + m.label;
      b.innerHTML = '<b></b><span></span><i class="num"></i>';
      b.children[0].textContent = moveNo(m.ply) + m.san + (SUFFIX[m.label] || '');
      b.children[1].textContent = cap(m.label) + (m.bestSan && m.best !== m.uci ? ' · best ' + m.bestSan : '');
      b.children[2].textContent = lossTxt(m.loss);
      b.onclick = () => seek(m.ply);
      w.appendChild(b);
    }
    $('rLesson').textContent = rep.lesson || '';
    seek(0); drawGraph(); renderCards();
  }
  // the three cards above the review: tap one to jump the replay board there and open αβ; "Drill this" makes it the next three games' focus
  function renderCards() {
    const el = $('rCards'), r = review; el.innerHTML = ''; if (!r) return;
    const call = callCard(r.entry), cs = (call ? [call] : []).concat(cards(r.entry)); el.hidden = !cs.length;
    for (const c of cs) {
      const d = document.createElement('div'); d.className = 'rcard k-' + c.kind; d.setAttribute('role', 'button'); d.tabIndex = 0;
      d.innerHTML = '<div class="kt"><span></span><small></small></div>' + (c.head ? '<b></b>' : '') + '<p></p>';
      d.querySelector('.kt span').textContent = c.title; d.querySelector('.kt small').textContent = c.ref || '';
      if (c.head) d.querySelector('b').textContent = c.head;
      d.querySelector('p').textContent = c.text;
      d.onclick = () => { seek(c.ply || 0); if (c.ply) showWhy(); try { $('rBoard').scrollIntoView({ block: 'start', behavior: 'smooth' }); } catch (x) {} };
      if (c.pattern && c.kind !== 'good') {
        const f = P().focus, on = !!(f && f.key === c.pattern), bt = document.createElement('button');
        bt.className = 'pill drill' + (on ? ' on' : ''); bt.textContent = on ? 'Drilling: next ' + numw(f.left) + ' game' + (f.left > 1 ? 's' : '') : 'Drill this';
        bt.onclick = (e) => { e.stopPropagation(); setFocus(c.pattern); renderCards(); };
        d.appendChild(bt);
      }
      el.appendChild(d);
    }
  }
  // your call vs the engine: where you said material went, against the engine's first two-pawn swing. Two sentences, no more.
  function callCard(entry) {
    const p = entry.pm, rep = entry.report; if (!p || !rep || !rep.moves) return null;
    const fb = rep.moves.filter((m) => m.color === entry.you).find((m) => m.loss >= 200);
    const said = p.ply ? 'move ' + Math.ceil(p.ply / 2) + ' (' + ((entry.sans || [])[p.ply - 1] || '?') + ')' : 'nowhere';
    let text;
    if (!fb) text = 'You said ' + said + '. ' + (p.ply ? 'The engine saw no two-pawn swing: nothing was lost outright.' : 'The engine agrees: no two-pawn swing.');
    else {
      const d = Math.ceil(fb.ply / 2) - Math.ceil(p.ply / 2), n = Math.abs(d);
      text = 'You said ' + said + '. The engine’s first big swing was move ' + Math.ceil(fb.ply / 2) + ' (' + fb.san + (SUFFIX[fb.label] || '') + ').'
        + (!p.ply ? ' It was there to find.' : d === 0 ? ' Same move.' : ' ' + cap(numw(n)) + ' move' + (n > 1 ? 's' : '') + (d < 0 ? ' earlier' : ' later') + ' than you thought.');
    }
    return { kind: 'call', title: 'Your call vs the engine', head: null, text, ply: fb ? fb.ply : p.ply, ref: fb ? moveNo(fb.ply) + fb.san : '', pattern: null };
  }
  // ---------- share: the game as PGN with the post-mortem as a comment on the move you named, and the engine's verdict at the end ----------
  const pgnLabel = (list, v) => { const hit = list.find((x) => x[0] === v); return hit ? hit[1][0].toLowerCase() + hit[1].slice(1) : v || 'none'; };   // "Nothing I saw" mid-sentence
  const pgnDate = (iso) => { const d = new Date(iso); return isNaN(d) ? '????.??.??' : d.getFullYear() + '.' + String(d.getMonth() + 1).padStart(2, '0') + '.' + String(d.getDate()).padStart(2, '0'); };
  function pgnOf(entry) {
    if (!entry || !Array.isArray(entry.sans)) return '';
    const you = entry.you, rep = entry.report, name = ownerOf(entry).name, eng = 'Engine ' + entry.elo;
    const result = entry.result === 'draw' ? '1/2-1/2' : (entry.result === 'win') === (you === 'w') ? '1-0' : '0-1';
    const head = [['Event', entry.mode === 'train' ? 'Ghostlap training game' : 'Ghostlap game'], ['Site', 'Ghostlap Roma'], ['Date', pgnDate(entry.date)], ['Round', '-'],
      ['White', you === 'w' ? name : eng], ['Black', you === 'b' ? name : eng], ['Result', result]];
    if (entry.variant === '960') head.push(['Variant', 'Chess960 (no castling)'], ['SetUp', '1'], ['FEN', entry.fen || '']);
    const esc = (s) => String(s).replace(/[\\"]/g, '\\$&');
    const cmt = (s) => '{ ' + String(s).replace(/[{}]/g, '') + ' }';
    const p = entry.pm, toks = [];   // one token per move, its comment attached, so a move and its post-mortem stay on one line
    entry.sans.forEach((san, i) => {
      toks.push((i % 2 === 0 ? (i / 2 + 1) + '. ' : '') + san + (p && p.ply === i + 1 ? ' ' + cmt('Post-mortem: first material loss here. Threat: ' + pgnLabel(PM_THREAT, p.threat) + '. Ran the check: ' + pgnLabel(PM_CHECKED, p.checked) + '. Tag: ' + pgnLabel(PM_TAG, p.tag) + '.' + (p.note ? ' ' + p.note : '')) : ''));
    });
    const end = [];
    if (p && p.ply === 0) end.push('Post-mortem: no material loss named' + (p.tag && p.tag !== 'none' ? ', tag ' + pgnLabel(PM_TAG, p.tag) : '') + '.' + (p.note ? ' ' + p.note : ''));
    if (rep && rep.moves) {
      const c = rep.counts && rep.counts[you] || {}, fb = rep.moves.filter((m) => m.color === you).find((m) => m.loss >= 200);
      end.push('Engine: accuracy ' + rep.accuracy[you] + '% (engine ' + rep.accuracy[you === 'w' ? 'b' : 'w'] + '%). ' + (c.blunder || 0) + ' blunder' + (c.blunder === 1 ? '' : 's') + ', ' + (c.mistake || 0) + ' mistake' + (c.mistake === 1 ? '' : 's') + ', ' + (c.inaccuracy || 0) + ' inaccurac' + (c.inaccuracy === 1 ? 'y' : 'ies') + '. '
        + (fb ? 'First two-pawn swing: ' + moveNo(fb.ply).trim() + ' ' + fb.san + (fb.bestSan && fb.best !== fb.uci ? ' (best ' + fb.bestSan + ')' : '') + '.' : 'No two-pawn swing.'));
    } else end.push('Not analysed yet.');
    toks.push(cmt(end.join(' ')) + ' ' + result);
    const lines = []; let cur = '';   // export format wraps at 80 columns where a token fits; a long comment takes its own line
    for (const t of toks) { if (cur && cur.length + 1 + t.length > 80) { lines.push(cur); cur = t; } else cur = cur ? cur + ' ' + t : t; }
    if (cur) lines.push(cur);
    return head.map(([k, v]) => '[' + k + ' "' + esc(v) + '"]').join('\n') + '\n\n' + lines.join('\n') + '\n';
  }
  // the share sheet on iPhone, else the clipboard ("Copied" for two seconds), else a selectable textarea
  function share() {
    const r = review; if (!r || !r.entry) return Promise.resolve(null);
    const pgn = pgnOf(r.entry), btn = $('rShare'), title = 'Ghostlap game, ' + fmtDate(r.entry.date);
    const copied = () => { btn.textContent = 'Copied'; clearTimeout(btn._t); btn._t = setTimeout(() => { btn.textContent = 'Share'; }, 2000); return 'copied'; };
    const showText = () => { $('pgnText').value = pgn; sheet('pgnSheet', true); return 'sheet'; };
    const copy = () => navigator.clipboard && navigator.clipboard.writeText ? navigator.clipboard.writeText(pgn).then(copied, showText) : Promise.resolve(showText());
    if (navigator.share) return navigator.share({ title, text: pgn }).then(() => 'shared', (e) => (e && e.name === 'AbortError' ? 'cancelled' : copy()));
    return copy();
  }
  function showWhy() {
    const r = review; if (!r || !r.report || !r.ply) return;
    const m = r.report.moves[r.ply - 1];
    renderWhy($('rWhy'), whyText({ fenBefore: r.fens[r.ply - 1], fenAfter: r.fens[r.ply], played: m.uci, best: m.best, reply: m.reply || (r.report.moves[r.ply] ? r.report.moves[r.ply].best : null), pv: m.pv || [], label: m.label, loss: m.loss }));
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
        + (m.label !== 'forced' && m.loss >= 5 ? ' (' + lossTxt(m.loss) + ')' : '') + (m.best && m.best !== m.uci && m.bestSan && m.label !== 'best' && m.label !== 'forced' ? '. Best was ' + m.bestSan + '.' : '');
      $('rMoveJab').textContent = mine ? (voice() === 'tough' ? (m.jab || '') : kindLine(m.label, { san: m.san, bestSan: m.bestSan, loss: m.loss })) : (m.label === 'blunder' || m.label === 'mistake' ? (voice() === 'tough' ? 'The engine slipped. Did you notice?' : 'The engine made a mistake here.') : '');
      $('rWhyBtn').hidden = false; $('rWhy').hidden = true;
      const ms = mine && r.entry.times ? r.entry.times[r.ply - 1] : null;   // a long think, in plain words (nothing is enforced)
      $('rThink').hidden = !(ms > LONG); if (ms > LONG) $('rThink').textContent = fmtMs(ms) + ' on this move: a long think means you did not recognise the position.';
    } else { $('rMoveHead').textContent = 'Start position'; $('rMoveJab').textContent = 'Step through with Next, tap a move, or drag on the graph.'; $('rWhyBtn').hidden = true; $('rWhy').hidden = true; $('rThink').hidden = true; }
    renderMoveList($('rMoveList'), rep.moves, r.ply, seek, false, r.entry.times);
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
    review = null; sel = null; targets = []; calibTick();
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
  function analyze() {   // the post-mortem first, then the engine
    const entry = review && review.entry ? review.entry : game && game.entry;
    if (!entry) return Promise.resolve(null);
    if (review && review.entry === entry && review.report) return Promise.resolve(review.report);
    return gate(entry).then((ok) => ok ? openReview(entry) : null);
  }
  function setPlayer(k) { if (save.players[k] && save.player !== k) { save.player = k; persist(); applyTheme(); renderSettings(); renderHist(); emit('player', k); } return save.player; }
  function setMode(m) { if (MODES.includes(m) && P().mode !== m) { P().mode = m; persist(); renderSettings(); emit('mode', m); } return P().mode; }
  function setReviewLevel(v) { if ((v === 'narrow' || v === 'full') && P().reviewLevel !== v) { P().reviewLevel = v; persist(); if (state === 'review' && review && review.report) renderReview(); } return P().reviewLevel; }

  // ---------- wiring --------------------------------------------------------
  // the top-left back follows where the game came from: a drill goes back to Endgames and a Learn practice game to its lesson
  // (both unrecorded), the same as the end sheet's Back; anything else leaves for the launcher
  $('chessBack').onclick = () => !$('chessGame').hidden && game && game.drill ? drillBack() : !$('chessGame').hidden && game && game.practice ? backToLesson() : close();
  $('reviewBack').onclick = () => { cancelAnalysis(); goHome(); };
  $('newGame').onclick = () => newGame();
  $('eloMinus').onclick = () => { P().elo = clampElo(P().elo - 50); persist(); renderSettings(); };
  $('eloPlus').onclick = () => { P().elo = clampElo(P().elo + 50); persist(); renderSettings(); };
  $('colorBtn').onclick = () => { P().color = { w: 'b', b: 'r', r: 'w' }[P().color]; persist(); renderSettings(); };
  $('resignBtn').onclick = resign;
  $('hintBtn').onclick = hint;
  $('nudgeBtn').onclick = nudgeToggle;
  $('sandboxBtn').onclick = sandboxToggle;
  $('readBtn').onclick = readTheBoard;
  $('modeBtn').onclick = () => setMode(MODES[(MODES.indexOf(P().mode) + 1) % MODES.length]);   // Play -> Tutor -> Train
  $('voiceBtn').onclick = () => { P().voice = VOICES[(VOICES.indexOf(voice()) + 1) % VOICES.length]; persist(); renderSettings(); };
  $('whyBtn').onclick = () => { const w = $('why'); if (!w.hidden) { w.hidden = true; return; } if (lastRating && lastRating.why) renderWhy(w, whyText(lastRating.why)); };
  $('rWhyBtn').onclick = () => { const w = $('rWhy'); if (!w.hidden) { w.hidden = true; return; } showWhy(); };
  $('rShare').onclick = share;
  $('pgnClose').onclick = () => sheet('pgnSheet', false);
  $('takeBack').onclick = () => { if (game && game.pending) { const r = game.pending; game.pending = null; r('back'); } };
  $('liveWith').onclick = () => { if (game && game.pending) { const r = game.pending; game.pending = null; r('live'); } };
  $('analyzeBtn').onclick = analyze;
  $('endAnalyze').onclick = analyze;
  $('endNew').onclick = () => game && game.practice ? again() : game && game.drill ? drill(game.drill.opts) : newGame(game && game.calib && P().calib && P().calib.games.length < 3 ? { calib: true } : undefined);
  $('calibGo').onclick = () => newGame({ calib: true });
  $('calibSkip').onclick = () => { P().calibrated = true; P().calib = null; persist(); renderSettings(); };
  $('calibOk').onclick = () => { sheet('calibDone', false); if (state === 'over') goHome(); };
  $('focusClear').onclick = () => { P().focus = null; persist(); renderSettings(); };
  $('endHome').onclick = () => game && game.practice ? backToLesson() : game && game.drill ? drillBack() : goHome();
  for (const b of $('ctxSheet').querySelectorAll('[data-ctx]')) b.onclick = () => pickCtx(b.dataset.ctx);
  $('ctxSkip').onclick = () => pickCtx(null);
  $('pmBack').onclick = () => { if (pm && pm.step > 0) { pm.step--; renderPm(); } };
  $('pmNext').onclick = pmNext;
  $('pmLater').onclick = () => pmClose(null);
  $('slipBack').onclick = () => answer('back');
  $('slipOn').onclick = () => answer('on');
  $('ldOn').onclick = () => answer('on');
  $('ldAgain').onclick = again;
  $('ldLesson').onclick = backToLesson;
  $('lessonBtn').onclick = backToLesson;
  $('rPrev').onclick = () => seek(review ? review.ply - 1 : 0);
  $('rNext').onclick = () => seek(review ? review.ply + 1 : 0);
  const gr = $('evalGraph');
  gr.addEventListener('touchstart', (e) => e.preventDefault(), { passive: false });
  gr.addEventListener('pointerdown', (e) => { e.preventDefault(); gr._drag = true; try { gr.setPointerCapture(e.pointerId); } catch (x) {} graphSeek(e); });
  gr.addEventListener('pointermove', (e) => { if (gr._drag) graphSeek(e); });
  for (const ev of ['pointerup', 'pointercancel']) gr.addEventListener(ev, () => { gr._drag = false; });
  window.addEventListener('resize', () => { if (state === 'review') drawGraph(); });
  if (Object.keys(save.players).reduce((n, k) => n + backfillLedger(save.players[k]), 0)) persist();   // games analysed before the ledger existed get their rows
  renderSettings(); renderHist();

  // test hook
  window.__coach = {
    open, close, newGame, move: humanMove, resign, analyze, hint, openingOf, explain, sandbox: sandboxMove, readBoard: readTheBoard, practice, renderBoard, get theme() { return P().theme; },
    takeBack() { if (game && game.pending) { const r = game.pending; game.pending = null; r('back'); return true; } return false; },
    liveWith() { if (game && game.pending) { const r = game.pending; game.pending = null; r('live'); return true; } return false; },
    get think() { return game ? game.think : null; },
    practiceState, playOn() { return answer('on'); }, again, backToLesson,
    get game() { return game; }, get state() { return state; }, get lastRating() { return lastRating; }, get history() { return P().games; },
    budget() { return assistBudget(P().games); }, get player() { return save.player; }, setPlayer,
    // training: the ledger, post-mortems, Train mode, the review level, day context, drills, events
    get ledger() { return P().ledger.slice(); }, pmDebt, postMortem, drill, on, off, ctxToday, setCtx, sleptToday, pgnOf, share, fen960,
    get mode() { return P().mode; }, setMode, get reviewLevel() { return P().reviewLevel; }, setReviewLevel,
    get pm() { return pm ? { id: pm.entry.id, step: pm.step, ply: pm.ply, threat: pm.threat, checked: pm.checked, tag: pm.tag } : null; }, ledgerRow, isClean,
    setVoice(v) { if (VOICES.includes(v)) { P().voice = v; persist(); renderSettings(); } return voice(); }, patterns() { return patterns(P().games); }, whyText,
    cards, focusLine: () => focusLine(true), streaks() { return streaksOf(P().games); }, setFocus, get focus() { return P().focus; },
    get calib() { return { calibrated: P().calibrated, elo: P().elo, next: calibElo(), progress: P().calib }; }, startCalib: () => newGame({ calib: true }),
  };
})();
