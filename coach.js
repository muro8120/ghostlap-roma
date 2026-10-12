// Ghostlap Roma: the chess coach. Board, live move ratings, end-of-game sheet, post-game review, game history.
// Uses window.Chess (vendor/chess.js) and window.ChessEngine (engine.js) only. The hub calls window.__coach.open().
(function () {
  'use strict';
  const $ = (id) => document.getElementById(id);

  // ---------- saving --------------------------------------------------------
  const KEY = 'ghostlap-chess-v1';
  const THEMES = { night: ['#9aa7b8', '#4a5568'], wood: ['#f0d9b5', '#b58863'], modern: ['#eeeed2', '#769656'], mono: ['#d5d8de', '#6e7480'] };
  const VOICES = ['tough', 'kind', 'quiet'];
  const clampElo = (e) => Math.max(800, Math.min(2850, Math.round((+e || 1600) / 50) * 50));
  const DEF = (name, voice) => ({ name, elo: 1600, color: 'w', theme: 'night', mode: 'play', voice: voice || 'tough', games: [] });
  // two players share the phone: Jesse gets the coach, J gets the quiet version. Each has their own history and settings.
  let save = { player: 'jesse', players: { jesse: DEF('Jesse', 'tough'), j: DEF('J', 'quiet') } };
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) || 'null');
    if (raw && raw.players) save = raw;
    else if (raw) { const me = Object.assign(DEF('Jesse', 'tough'), raw); delete me.player; delete me.players; save.players.jesse = me; }   // v1 single-player save
  } catch (e) { /* private mode: keep in memory */ }
  for (const k of ['jesse', 'j']) {
    const q = save.players[k] = Object.assign(DEF(k === 'j' ? 'J' : 'Jesse', k === 'j' ? 'quiet' : 'tough'), save.players[k] || {});
    if (!Array.isArray(q.games)) q.games = [];
    if (!'wbr'.includes(q.color) || q.color.length !== 1) q.color = 'w';
    q.elo = clampElo(q.elo);
    if (!THEMES[q.theme]) q.theme = 'night';
    if (q.mode !== 'tutor') q.mode = 'play';
    if (!VOICES.includes(q.voice)) q.voice = 'tough';
  }
  if (!save.players[save.player]) save.player = 'jesse';
  const P = () => save.players[save.player];
  const voice = () => P().voice;
  function applyTheme() { document.documentElement.dataset.theme = P().theme; }
  applyTheme();
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
  // opening name: the longest prefix of the SAN list that the table knows (window.OPENINGS, from lichess, CC0)
  function openingOf(sans) {
    const T = window.OPENINGS; if (!T) return null;
    for (let n = Math.min(sans.length, 14); n >= 1; n--) { const hit = T[sans.slice(0, n).join(' ')]; if (hit) return { eco: hit[0], name: hit[1], plies: n }; }
    return null;
  }
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
    if (ln) parts.push('Engine line: ' + ln);
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
      b.children[2].textContent = ln.mate ? 'M' + Math.abs(ln.mate) : i === 0 ? 'best' : lossTxt(-d);
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
      g.think = { ev: multi, lines, threat: null, done: false }; renderTutor();
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
  function renderMoveList(el, list, cur, onTap, plain) {
    el.innerHTML = '';
    list.forEach((m, i) => {
      if (i % 2 === 0) { const n = document.createElement('span'); n.className = 'n'; n.textContent = (i / 2 + 1) + '.'; el.appendChild(n); }
      const s = document.createElement('span');
      s.className = 'm' + (m.label && !plain ? ' l-' + m.label : '') + (cur === i + 1 ? ' cur' : '');
      s.textContent = m.san + (plain ? '' : (SUFFIX[m.label] || ''));
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
    } else { sel = null; targets = []; }
    drawGame();
  }
  function showRate(r) {
    const el = $('rate');
    el.hidden = voice() === 'quiet';
    $('why').hidden = true; $('whyBtn').hidden = !r.why;
    el.dataset.label = r.label;
    $('rateLabel').textContent = cap(r.label);
    $('rateLoss').textContent = r.label === 'forced' ? '' : lossTxt(r.loss);
    $('rateJab').textContent = r.jab;
    el.classList.remove('in'); void el.offsetWidth; el.classList.add('in');
  }
  function rateIdle(text) {
    const el = $('rate'); el.dataset.label = ''; el.classList.remove('in'); el.hidden = voice() === 'quiet' || !text;
    $('why').hidden = true; $('whyBtn').hidden = true;
    $('rateLabel').textContent = 'Coach'; $('rateLoss').textContent = ''; $('rateJab').textContent = text;
  }
  const renderMoves = () => renderMoveList($('moveList'), game.moves, null, null, voice() === 'quiet');

  // ---------- game flow -----------------------------------------------------
  function newGame(opts) {
    opts = opts || {};
    if (!window.Chess) { rateIdle('chess.js failed to load.'); return null; }
    if (game && (state === 'playing' || state === 'thinking')) endGame('loss', 'resign', false);
    cancelAnalysis(); gen++;
    const col = opts.color || P().color, you = col === 'r' ? (Math.random() < .5 ? 'w' : 'b') : col;
    game = { id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6), date: new Date().toISOString(), elo: clampElo(opts.elo || P().elo), you,
      chess: new Chess(), moves: [], before: null, after: null, streak: 0, result: null, reason: null, entry: null, hints: 0, hint: null, tutor: (opts.tutor != null ? !!opts.tutor : P().mode === 'tutor'), think: null, pick: null, takebacks: 0, nudges: 0, sandbox: false, sandLeft: 2, readPly: -1, sand: null, practice: opts.practice || null };
    lastRating = null; sel = null; targets = []; review = null;
    sheet('chessEnd', false); $('review').classList.remove('on'); $('chess').classList.add('on');
    $('chessHome').hidden = true; $('chessGame').hidden = false;
    $('analyzeBtn').hidden = true; $('resignBtn').hidden = false;
    $('oppName').textContent = 'Engine · ' + game.elo;
    $('youName').textContent = 'You · ' + COLN[you];
    game.weak = patterns(P().games).items.map((it) => it.key);
    const focus = focusLine();
    rateIdle(voice() === 'quiet' ? '' : (game.tutor ? 'Tutor mode. I show you the options and what they are up to. You still have to choose.' : you === 'w' ? (voice() === 'kind' ? 'Your move. Take your time.' : 'Your move. I’m watching.') : (voice() === 'kind' ? 'You have black. The engine opens.' : 'Black. The engine opens; try to keep up.')) + (focus ? ' ' + focus : ''));
    $('why').hidden = true; $('whyBtn').hidden = true; $('nudgeRow').hidden = true; $('nudgeHint').hidden = true; $('nudgeBtn').hidden = false; board.classList.remove('sandbox');
    $('takeRow').hidden = true; $('tutor').hidden = !game.tutor; renderTutor();
    thinking(false); setEvalBar(evalBar, { cp: 0 }, you === 'b');
    renderMoves(); setState(you === 'w' ? 'playing' : 'thinking'); drawGame(); showOpening($('opening'), []); $('hintBtn').hidden = false;
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
    const played = uciOf(m), rec = { uci: played, san: m.san, label: null, loss: null, jab: null };
    g.moves.push(rec); sel = null; targets = []; showOpening($('opening'), g.moves.map((x) => x.san));
    const usedHint = g.hint && g.hint.ply === g.moves.length - 1 && g.hint.uci === played; g.hint = null;
    const thought = g.think; g.think = null; g.pick = null; renderTutor();
    g.sandbox = false; g.sandLeft = 2; g.sand = null; board.classList.remove('sandbox'); $('sandboxBtn').classList.remove('on'); $('nudgeRow').hidden = true; $('nudgeHint').hidden = true;
    setState('thinking'); thinking(c.game_over() ? false : 'rating…'); drawGame(); renderMoves(); renderTutor();
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
      rec.jab = coachLine(rating.label, { san: m.san, bestSan, loss: rating.loss, ply: g.moves.length, streak: g.streak, cpAfter: clampCp(after), color: g.you });
      rec.why = { fenBefore, fenAfter, played, best: before ? before.best : null, reply: after ? after.best : null, pv: before ? before.pv : [], label: rating.label, loss: rating.loss };
      if (usedHint) { rec.hinted = true; if (voice() === 'tough') rec.jab = HINTED[g.moves.length % HINTED.length]; }
      const pr = g.practice;
      if (pr && !pr.off) {
        const i = g.moves.length - 1, book = pr.line[i];
        if (book && played === book) rec.jab = 'Book move. ' + (pr.notes[i] || '') + (voice() === 'quiet' ? '' : ' ' + rec.jab);
        else { pr.off = true; rec.jab = 'Out of the ' + pr.title + ' line at move ' + Math.floor(i / 2 + 1) + '.' + (book ? ' The line goes ' + sanOf(fenBefore, book) + ': ' + (pr.notes[i] || '') : ' The lesson line is finished; from here it is your game.') + (voice() === 'quiet' ? '' : ' ' + rec.jab); }
        rec.book = !pr.off;
      }
      lastRating = { uci: played, san: m.san, label: rating.label, loss: rating.loss, jab: rec.jab, bestSan, ply: g.moves.length, why: rec.why };
      showRate(lastRating); if (pr) $('rate').hidden = false; renderMoves();
      if (c.game_over()) { thinking(false); gameOver(); return lastRating; }
      if (g.tutor && (rating.label === 'mistake' || rating.label === 'blunder' || rating.label === 'inaccuracy')) {
        // stop here: let them see it, and offer the take-back (which goes on the record)
        thinking(false); $('takeRow').hidden = false; $('rate').hidden = false;
        if (voice() === 'tough') $('rateJab').textContent += ' ' + TAKE_OFFER[g.moves.length % TAKE_OFFER.length];
        else $('rateJab').textContent = (voice() === 'quiet' ? cap(rating.label) + (rating.loss >= 5 ? ' (' + lossTxt(rating.loss) + ')' : '') + '. ' : '') + (bestSan && bestSan !== m.san ? bestSan + ' was better. ' : '') + 'Take it back?';
        try { $('rate').scrollIntoView({ block: 'nearest', behavior: 'smooth' }); } catch (x) {}
        const choice = await new Promise((res) => { g.pending = res; });
        $('takeRow').hidden = true;
        if (myGen !== gen) return false;
        if (choice === 'back') {
          c.undo(); g.moves.pop(); g.takebacks++; g.streak = Math.max(0, g.streak - 1);
          rec.label = null; lastRating = null;
          renderMoves(); showOpening($('opening'), g.moves.map((x) => x.san));
          rateIdle(voice() === 'tough' ? TAKE_LINES[g.takebacks % TAKE_LINES.length].replace('%s', bestSan || 'something else').replace('%n', g.takebacks) : voice() === 'kind' ? 'Taken back. Have another look' + (bestSan ? ', ' + bestSan + ' is worth considering.' : '.') : '');
          g.think = thought; g.pick = null; setState('playing'); renderTutor(); drawGame();
          return lastRating;
        }
      }
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
    if (g.pending) { const r = g.pending; g.pending = null; r('live'); } $('takeRow').hidden = true; g.think = null; renderTutor();
    if (eng) eng.stop();
    thinking(false); sel = null; targets = [];
    g.result = result; g.reason = reason;
    setState('over'); drawGame();
    if (g.moves.length >= 2) {
      g.entry = { id: g.id, date: g.date, elo: g.elo, you: g.you, result, reason, moves: g.moves.map((m) => m.uci), sans: g.moves.map((m) => m.san), hints: g.hints, nudges: g.nudges, tutor: g.tutor, takebacks: g.takebacks, practice: g.practice ? g.practice.title : null, report: null };
      P().games.unshift(g.entry); P().games = P().games.slice(0, 20); persist();
    }
    $('analyzeBtn').hidden = !g.entry; $('resignBtn').hidden = true; $('hintBtn').hidden = true; $('nudgeBtn').hidden = true; $('nudgeRow').hidden = true; $('nudgeHint').hidden = true; board.classList.remove('sandbox');
    renderHist();
    if (showSheet) {
      const k = reason === 'checkmate' ? (result === 'win' ? 'checkmateWin' : 'checkmateLoss') : reason;
      const t = (voice() === 'tough' ? END : KIND_END)[k] || (voice() === 'tough' ? END : KIND_END).resign;
      $('endTitle').textContent = t[0]; $('endMsg').textContent = t[1] + (g.moves.length ? ' ' + Math.ceil(g.moves.length / 2) + ' moves.' : '');
      $('endAnalyze').hidden = !g.entry;
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
  function coachLine(label, ctx) { return voice() === 'tough' ? (window.ChessEngine ? ChessEngine.jab(label, ctx) : '') : voice() === 'kind' ? kindLine(label, ctx) : ''; }
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
    if (state !== 'playing' || !game) return null;
    const g = game, myGen = gen, e = engine();
    if (!e) return null;
    if (g.hint && g.hint.ply === g.moves.length) return g.hint;
    thinking('asking…');
    try {
      let ev = await (g.before || Promise.resolve(null));
      if (myGen !== gen || state !== 'playing') return null;
      if (!ev || !ev.best) { ev = await e.evaluate(g.chess.fen(), { depth: 12 }); if (myGen !== gen || state !== 'playing') return null; }
      if (!ev || !ev.best) return null;
      g.hints++; g.hint = { ply: g.moves.length, uci: ev.best, san: sanOf(g.chess.fen(), ev.best) };
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
  function nudgeToggle() {
    if (state !== 'playing' || !game) return;
    const row = $('nudgeRow'); row.hidden = !row.hidden;
    $('sandboxBtn').textContent = 'Sandbox a move (' + game.sandLeft + ' left)'; $('sandboxBtn').disabled = game.sandLeft <= 0;
    $('nudgeHint').hidden = row.hidden; $('nudgeHint').textContent = 'Sandbox: tap a move to have it rated without playing it, no answer given, twice a turn. Read: the position in plain words, for both sides. Both count as assisted.';
  }
  function sandboxToggle() {
    if (state !== 'playing' || !game) return;
    game.sandbox = !game.sandbox && game.sandLeft > 0; sel = null; targets = [];
    board.classList.toggle('sandbox', game.sandbox); $('sandboxBtn').classList.toggle('on', game.sandbox);
    if (game.sandbox) rateIdle('Sandbox. Tap the move you are thinking of.'); else if (voice() !== 'quiet' && !lastRating) rateIdle('');
    drawGame();
  }
  async function sandboxMove(uci) {
    const g = game; if (!g || state !== 'playing' || g.sandLeft <= 0) return null;
    const c = g.chess, myGen = gen, e = engine();
    const t = new Chess(c.fen()); const m = t.move(mv(uci)); if (!m) return null;
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
    const g = game; if (!g || state !== 'playing') return null;
    const c = g.chess, myGen = gen, e = engine();
    thinking('reading…');
    try {
      const ev = await (g.before || Promise.resolve(null));
      if (myGen !== gen || state !== 'playing') return null;
      const th = g.think && g.think.threat ? g.think.threat : await threatOf(c, g.you, ev, e);
      if (myGen !== gen || state !== 'playing') return null;
      if (g.readPly !== g.moves.length) { g.nudges++; g.readPly = g.moves.length; }
      const lines = readBoard(c, g.you, ev, th);
      const el = $('rate'); el.hidden = false; el.dataset.label = 'forced'; el.classList.remove('in');
      $('rateLabel').textContent = 'The board, read plainly'; $('rateLoss').textContent = ''; $('rateJab').textContent = '';
      renderWhy($('why'), lines); $('whyBtn').hidden = true;
      thinking(false);
      return lines;
    } catch (err) { thinking(false); return null; }
  }
  // practice an opening from the Learn screen: the engine plays the book line as long as you do
  function practice(lesson) {
    if (!lesson || !lesson.line) return null;
    const c = new Chess(), line = [];
    for (const san of lesson.line) { const m = c.move(san); if (!m) break; line.push(uciOf(m)); }
    const g = newGame({ color: lesson.side || 'w', practice: { title: lesson.title, line, notes: lesson.notes || [], off: false } });
    if (g) { $('rate').hidden = false; rateIdle('Practice: the ' + lesson.title + '. Play the line you just stepped through; the engine answers from the book until you leave it.'); $('rate').hidden = false; }
    return g;
  }
  function resign() {
    if (game && (state === 'playing' || state === 'thinking')) endGame('loss', 'resign', true);
  }

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
        const add = (k) => { hits[k].n++; hits[k].loss += m.loss || 0; };
        if (m.hung) add('hung');
        const mateFor = (mt) => mt && ((g.you === 'w' && mt > 0) || (g.you === 'b' && mt < 0));
        if ((m.mateAfter && !mateFor(m.mateAfter)) || (mateFor(m.mateBefore) && m.label !== 'best' && m.label !== 'forced')) add('mate');
        if (!bad) continue;
        if (m.ply <= 20 && m.label !== 'inaccuracy') add('opening');
        if (m.pieces != null && m.pieces <= 6) add('endgame');
        if (m.san[0] === 'Q') add('queen');
        if (m.san.includes('x')) add('greedy');
        if (/\+$/.test(m.san)) add('check');
        if (run === 2) add('tilt');
      }
    }
    const items = Object.keys(PATTERNS).map((k) => ({ key: k, n: hits[k].n, loss: hits[k].loss })).filter((it) => it.n >= 2)
      .sort((a, b) => b.loss - a.loss).slice(0, 3).map((it) => ({ key: it.key, n: it.n, name: PATTERNS[it.key].name, text: PATTERNS[it.key].text(it.n, done.length), drill: PATTERNS[it.key].drill }));
    const recent = accs.slice(0, 3), older = accs.slice(3, 6), mean = (a) => a.length ? a.reduce((x, y) => x + y, 0) / a.length : null;
    return { games: done.length, items, acc: mean(recent), trend: older.length ? mean(recent) - mean(older) : null, badRate: total.moves ? total.bad / total.moves : 0 };
  }
  function focusLine() {
    const pt = patterns(P().games); if (!pt.items.length || voice() === 'quiet') return '';
    const it = pt.items[0];
    return (voice() === 'tough' ? 'Focus today: ' + it.name.toLowerCase() + '. ' : 'This game, watch for ' + it.name.toLowerCase() + '. ') + it.drill;
  }
  function renderPatterns() {
    const el = $('patterns'), pt = patterns(P().games); el.innerHTML = '';
    const h = document.createElement('div'); h.className = 'ph';
    if (!pt.games) { h.textContent = voice() === 'quiet' ? 'Analyse a few games and your recurring weak points show up here.' : 'Play and analyse a few games. Then I will tell you what keeps going wrong.'; el.appendChild(h); return; }
    h.innerHTML = '<b></b><span></span>';
    h.firstChild.textContent = pt.acc != null ? Math.round(pt.acc) + '% accuracy' : '';
    h.lastChild.textContent = (pt.trend != null ? (pt.trend >= 0 ? '▲ ' : '▼ ') + Math.abs(pt.trend).toFixed(0) + ' vs the three before · ' : '') + pt.games + ' analysed game' + (pt.games > 1 ? 's' : '') + (pt.games < 3 ? ' · early read' : '');
    el.appendChild(h);
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
      d.querySelector('small').textContent = fmtDate(g.date) + ' · ' + COLN[g.you][0] + ' · ' + g.reason + (g.practice ? ' · ' + g.practice : '') + (g.tutor ? ' · tutor' : '') + (g.takebacks ? ' · ' + g.takebacks + ' undo' : '') + (g.hints ? ' · ' + g.hints + ' hint' + (g.hints > 1 ? 's' : '') : '') + (g.nudges ? ' · ' + g.nudges + ' nudge' + (g.nudges > 1 ? 's' : '') : '');
      d.children[1].firstChild.textContent = g.elo; d.children[2].firstChild.textContent = acc;
      d.querySelector('.rv').onclick = () => openReview(g);
      el.appendChild(d);
    }
  }
  function renderSettings() {
    const tr = $('themeRow');
    if (!tr.children.length) for (const k of Object.keys(THEMES)) {
      const b = document.createElement('button'); b.dataset.theme = k; b.setAttribute('aria-label', k + ' board');
      const [l, d] = THEMES[k]; b.innerHTML = '<i style="background:' + l + '"></i><i style="background:' + d + '"></i><i style="background:' + d + '"></i><i style="background:' + l + '"></i>';
      b.onclick = () => { P().theme = k; persist(); applyTheme(); renderSettings(); };
      tr.appendChild(b);
    }
    for (const b of tr.children) b.classList.toggle('on', b.dataset.theme === P().theme);
    const pr = $('playerRow');
    if (!pr.children.length) for (const k of ['jesse', 'j']) { const b = document.createElement('button'); b.className = 'pill'; b.dataset.player = k; b.textContent = save.players[k].name; b.onclick = () => { if (save.player !== k) { save.player = k; persist(); applyTheme(); renderSettings(); renderHist(); } }; pr.appendChild(b); }
    for (const b of pr.children) b.classList.toggle('on', b.dataset.player === save.player);
    $('voiceBtn').textContent = { tough: 'Tough', kind: 'Kind', quiet: 'Quiet' }[voice()];
    $('voiceHint').textContent = { tough: 'Tough: every move judged, out loud, no mercy.', kind: 'Kind: the same facts, said nicely.', quiet: 'Quiet: nothing during the game. The review is still there afterwards.' }[voice()];
    renderPatterns();
    $('eloV').textContent = P().elo;
    $('colorBtn').textContent = COLN[P().color];
    $('modeBtn').textContent = P().mode === 'tutor' ? 'Tutor' : 'Play';
    $('modeHint').textContent = P().mode === 'tutor' ? 'Tutor: before each move you see your three best options with a reason, and what they would do if you passed. Bad moves can be taken back, and that goes on your record.' : 'Play: no help, every move rated, the coach says what it thinks.';
    $('eloMinus').disabled = P().elo <= 800; $('eloPlus').disabled = P().elo >= 2850;
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
      entry.report = rep; persist(); renderHist(); renderPatterns();
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
    $('rSummary').textContent = (rep.summary || '') + (r.entry.hints || r.entry.nudges ? '\nAssisted: ' + [r.entry.hints ? r.entry.hints + ' hint' + (r.entry.hints > 1 ? 's' : '') : '', r.entry.nudges ? r.entry.nudges + ' nudge' + (r.entry.nudges > 1 ? 's' : '') : ''].filter(Boolean).join(' and ') + '. The accuracy knows.' : '') + (r.entry.tutor ? '\nTutor game' + (r.entry.takebacks ? ', ' + r.entry.takebacks + ' take-back' + (r.entry.takebacks > 1 ? 's' : '') : '') + '. The moves you kept are the ones being judged.' : '');
    showOpening($('rOpening'), r.entry.sans || []);
    const cy = rep.counts[you], st = $('rStats'); st.innerHTML = '';
    for (const [v, k] of [[rep.accuracy[you] + '%', 'you'], [rep.accuracy[op] + '%', 'engine'], [cy.blunder, 'blunders'], [cy.mistake, 'mistakes'], [cy.inaccuracy, 'inacc.']]) {
      const d = document.createElement('div'); d.innerHTML = '<b class="num"></b><small></small>'; d.firstChild.textContent = v; d.lastChild.textContent = k; st.appendChild(d);
    }
    const w = $('rWorst'); w.innerHTML = '';
    const worst = (rep.worst || []).filter((m) => !GOOD[m.label]);   // only moments worth shouting about
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
        + (m.label !== 'forced' && m.loss >= 5 ? ' (' + lossTxt(m.loss) + ')' : '') + (m.best && m.best !== m.uci && m.bestSan && m.label !== 'best' && m.label !== 'forced' ? '. Best was ' + m.bestSan + '.' : '');
      $('rMoveJab').textContent = mine ? (voice() === 'tough' ? (m.jab || '') : kindLine(m.label, { san: m.san, bestSan: m.bestSan, loss: m.loss })) : (m.label === 'blunder' || m.label === 'mistake' ? (voice() === 'tough' ? 'The engine slipped. Did you notice?' : 'The engine made a mistake here.') : '');
      $('rWhyBtn').hidden = false; $('rWhy').hidden = true;
    } else { $('rMoveHead').textContent = 'Start position'; $('rMoveJab').textContent = 'Step through with Next, tap a move, or drag on the graph.'; $('rWhyBtn').hidden = true; $('rWhy').hidden = true; }
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
  $('eloMinus').onclick = () => { P().elo = clampElo(P().elo - 50); persist(); renderSettings(); };
  $('eloPlus').onclick = () => { P().elo = clampElo(P().elo + 50); persist(); renderSettings(); };
  $('colorBtn').onclick = () => { P().color = { w: 'b', b: 'r', r: 'w' }[P().color]; persist(); renderSettings(); };
  $('resignBtn').onclick = resign;
  $('hintBtn').onclick = hint;
  $('nudgeBtn').onclick = nudgeToggle;
  $('sandboxBtn').onclick = sandboxToggle;
  $('readBtn').onclick = readTheBoard;
  $('modeBtn').onclick = () => { P().mode = P().mode === 'tutor' ? 'play' : 'tutor'; persist(); renderSettings(); };
  $('voiceBtn').onclick = () => { P().voice = VOICES[(VOICES.indexOf(voice()) + 1) % VOICES.length]; persist(); renderSettings(); };
  $('whyBtn').onclick = () => { const w = $('why'); if (!w.hidden) { w.hidden = true; return; } if (lastRating && lastRating.why) renderWhy(w, whyText(lastRating.why)); };
  $('rWhyBtn').onclick = () => {
    const w = $('rWhy'); if (!w.hidden) { w.hidden = true; return; }
    const r = review; if (!r || !r.report || !r.ply) return;
    const m = r.report.moves[r.ply - 1];
    renderWhy(w, whyText({ fenBefore: r.fens[r.ply - 1], fenAfter: r.fens[r.ply], played: m.uci, best: m.best, reply: m.reply || (r.report.moves[r.ply] ? r.report.moves[r.ply].best : null), pv: m.pv || [], label: m.label, loss: m.loss }));
  };
  $('takeBack').onclick = () => { if (game && game.pending) { const r = game.pending; game.pending = null; r('back'); } };
  $('liveWith').onclick = () => { if (game && game.pending) { const r = game.pending; game.pending = null; r('live'); } };
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
    open, close, newGame, move: humanMove, resign, analyze, hint, openingOf, explain, sandbox: sandboxMove, readBoard: readTheBoard, practice, renderBoard, get theme() { return P().theme; },
    takeBack() { if (game && game.pending) { const r = game.pending; game.pending = null; r('back'); return true; } return false; },
    liveWith() { if (game && game.pending) { const r = game.pending; game.pending = null; r('live'); return true; } return false; },
    get think() { return game ? game.think : null; },
    get game() { return game; }, get state() { return state; }, get lastRating() { return lastRating; }, get history() { return P().games; },
    get player() { return save.player; }, setPlayer(k) { if (save.players[k]) { save.player = k; persist(); applyTheme(); renderSettings(); renderHist(); } return save.player; },
    setVoice(v) { if (VOICES.includes(v)) { P().voice = v; persist(); renderSettings(); } return voice(); }, patterns() { return patterns(P().games); }, whyText,
  };
})();
