// Ghostlap Roma: the Learn screen. Opening lessons with a step-through board, Practice that hands over to the coach, and two
// drills: From memory (the coach's practice without Think ahead, scored) and Position cards (Leitner boxes, no engine).
(function () {
  'use strict';
  const $ = (id) => document.getElementById(id);
  const L = window.LESSONS || [];
  let cur = null, ply = 0, fens = [];
  const KIND = { basics: 'Basics', w: 'With White', b: 'With Black' };
  // the plan's standing order: openings are ideas until Stage 3, so the drills are labelled, not locked (read at call time: plan.js loads after this file)
  const below3 = () => !!(window.__plan && window.__plan.stage && window.__plan.stage() < 'S3');
  const STAGE3 = 'Openings are ideas to move 8-10 until Stage 3. The idea paragraph and the plan are for now.';
  const fmtDate = (iso) => { try { return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }); } catch (e) { return ''; } };

  // ---------- drill progress: per player and lesson, on the phone, apart from the chess history ----------
  const KEY = 'ghostlap-learn-v1';
  let store = {};
  try { const raw = JSON.parse(localStorage.getItem(KEY) || '{}'); if (raw && typeof raw === 'object') store = raw; } catch (e) { /* private mode: keep in memory */ }
  const persist = () => { try { localStorage.setItem(KEY, JSON.stringify(store)); } catch (e) {} };
  // one record per chess player (Jesse, J), whoever is selected on the chess home, read at call time
  const who = () => (window.__coach && window.__coach.player) || 'jesse';
  const mine = () => { const w = who(); if (!store[w] || typeof store[w] !== 'object') store[w] = {}; return store[w]; };
  const got = (id) => (store[who()] || {})[id] || {};
  const prog = (id) => mine()[id] || (mine()[id] = {});
  // every position in the line where it is the lesson side's move; a card's key changes if the line does
  function cardsOf(l) {
    const out = [], c = new Chess(), me = l.side === 'b' ? 1 : 0; let last = null;
    for (let i = 0; i < l.line.length; i++) {
      const fen = c.fen(), m = c.move(l.line[i]); if (!m) break;
      if (i % 2 === me) out.push({ i, key: i + ':' + m.san, fen, last, from: m.from, to: m.to, san: m.san, note: (l.notes || [])[i] || '' });
      last = { from: m.from, to: m.to };
    }
    return out;
  }
  // Leitner: box 1 every session, box 2 every other, box 3 every fourth. Sessions with nothing due are skipped.
  const boxOf = (st, key) => (st && st.box && st.box[key]) || 1;
  const isDue = (b, s) => b <= 1 || (b === 2 && s % 2 === 0) || (b >= 3 && s % 4 === 0);
  function plan(l) {
    const st = got(l.id).cards, cards = cardsOf(l), s0 = (st && st.sessions) || 0;
    for (let s = s0; s < s0 + 4; s++) { const due = cards.filter((k) => isDue(boxOf(st, k.key), s)); if (due.length) return { s, due, cards, st }; }
    return { s: s0, due: cards, cards, st };
  }
  function mastery(l) {   // 0..1 across the drills done, null if none
    const g = got(l.id), parts = [];
    if (g.mem && g.mem.best) parts.push(g.mem.best.first / Math.max(1, g.mem.best.of));
    if (g.cards && g.cards.sessions) { const cs = cardsOf(l); parts.push(cs.reduce((a, k) => a + boxOf(g.cards, k.key) - 1, 0) / Math.max(1, 2 * cs.length)); }
    return parts.length ? parts.reduce((a, b) => a + b, 0) / parts.length : null;
  }
  function memDone(sc) {   // the coach calls this when a From memory run reaches the end of the line
    const m = prog(sc.id).mem || (prog(sc.id).mem = { tries: 0 }), last = { first: sc.first, of: sc.of, slips: sc.slips };
    const best = !m.best || m.best.of !== last.of || last.first > m.best.first || (last.first === m.best.first && last.slips < m.best.slips);
    m.tries++; m.last = last; m.date = new Date().toISOString(); if (best) m.best = last; persist();
    return m.tries < 2 ? '' : best ? 'A new best.' : 'Your best is ' + m.best.first + '/' + m.best.of + '.';
  }
  function drillStatus(l) {
    const g = got(l.id), m = g.mem, p = plan(l), learned = p.cards.filter((k) => boxOf(p.st, k.key) >= 3).length;
    $('lMemStat').textContent = m && m.tries ? 'Best ' + m.best.first + '/' + m.best.of + ' · ' + m.tries + (m.tries > 1 ? ' tries' : ' try') + ' · last ' + m.last.first + '/' + m.last.of + ', ' + fmtDate(m.date)
      : 'The line with no Think ahead and no notes until you move. Scored.';
    $('lCardsStat').textContent = p.cards.length + ' cards, ' + p.due.length + ' due' + (learned ? ' · ' + learned + ' learned' : '') + (g.cards && g.cards.last ? ' · last ' + fmtDate(g.cards.last.date) : '');
  }

  function renderList() {
    const el = $('learnList'); el.innerHTML = '';
    const groups = { basics: [], w: [], b: [] };
    for (const l of L) groups[l.kind === 'basics' ? 'basics' : l.side].push(l);
    for (const k of ['basics', 'w', 'b']) {
      if (!groups[k].length) continue;
      const h = document.createElement('h2'); h.textContent = KIND[k]; el.appendChild(h);
      if (k === 'w' && below3()) { const n = document.createElement('p'); n.className = 'chint'; n.id = 'learnStage'; n.style.margin = '-4px 0 10px'; n.textContent = 'The drills (From memory, Position cards) are Stage 3 material. ' + STAGE3; el.appendChild(n); }
      const wrap = document.createElement('div'); wrap.className = 'tracks';
      for (const l of groups[k]) {
        const b = document.createElement('button'); b.className = 'card lcard';
        b.innerHTML = '<span class="cap">' + (l.kind === 'basics' ? '&#127891;' : l.side === 'w' ? '&#9812;' : '&#9818;') + '</span><div><div class="t"></div><div class="b"></div></div><span class="go">&#8250;</span>';
        b.querySelector('.t').textContent = l.title + (l.eco ? ' · ' + l.eco : '');
        b.querySelector('.b').textContent = l.blurb;
        const ms = l.kind === 'opening' ? mastery(l) : null;
        if (ms != null) { const i = document.createElement('i'); i.className = 'lprog'; i.style.setProperty('--p', Math.round(ms * 100) + '%'); i.title = 'Drills: ' + Math.round(ms * 100) + '%'; b.querySelector('.t').appendChild(i); }
        b.onclick = () => show(l.id);
        wrap.appendChild(b);
      }
      el.appendChild(wrap);
    }
  }
  function open() {
    for (const id of ['hub', 'menu', 'hud', 'chess', 'review', 'lesson', 'drill']) { const e = $(id); if (e) e.classList.remove('on'); }
    renderList(); $('learn').classList.add('on'); $('learn').scrollTo(0, 0);
  }
  function close() { for (const id of ['learn', 'lesson', 'drill']) $(id).classList.remove('on'); if (window.__hub) window.__hub.show(); }
  function show(id) {
    cur = L.find((l) => l.id === id); if (!cur) return;
    const c = new Chess(); fens = [c.fen()];
    for (const s of cur.line) { c.move(s); fens.push(c.fen()); }
    $('lTitle').textContent = cur.title; $('lEco').textContent = cur.eco ? cur.eco + ' · ' + (cur.side === 'w' ? 'for White' : 'for Black') : 'Basics';
    $('lIdea').textContent = cur.idea;
    const fill = (elId, items) => { const u = $(elId); u.innerHTML = ''; for (const t of items || []) { const li = document.createElement('li'); li.textContent = t; u.appendChild(li); } };
    fill('lWant', cur.want); fill('lAvoid', cur.avoid); $('lThen').textContent = cur.then || '';
    $('lPractice').hidden = $('lDrills').hidden = cur.kind !== 'opening';
    $('lPractice').textContent = 'Practice the ' + cur.title;
    if (cur.kind === 'opening') drillStatus(cur);
    $('lDrillStage').hidden = !(cur.kind === 'opening' && below3());
    $('learn').classList.remove('on'); $('drill').classList.remove('on'); $('lesson').classList.add('on'); $('lesson').scrollTo(0, 0);
    seek(0);
  }
  function seek(n) {
    if (!cur) return;
    ply = Math.max(0, Math.min(cur.line.length, n));
    const c = new Chess(fens[ply]);
    const last = ply ? (function () { const t = new Chess(fens[ply - 1]); const m = t.move(cur.line[ply - 1]); return m ? { from: m.from, to: m.to } : null; })() : null;
    if (window.__coach && window.__coach.renderBoard) window.__coach.renderBoard($('lBoard'), c, { flip: cur.side === 'b', last, check: c.in_check() });
    const moveNo = ply ? Math.floor((ply - 1) / 2) + 1 + (ply % 2 ? '. ' : '... ') + cur.line[ply - 1] : 'Start';
    $('lPos').textContent = moveNo + ' · ' + ply + '/' + cur.line.length;
    $('lNote').textContent = ply ? cur.notes[ply - 1] : 'Tap Next to step through the line. Each move has a note.';
    $('lPrev').disabled = ply === 0; $('lNext').disabled = ply >= cur.line.length;
    const ml = $('lMoves'); ml.innerHTML = '';
    cur.line.forEach((s, i) => {
      if (i % 2 === 0) { const n = document.createElement('span'); n.className = 'n'; n.textContent = (i / 2 + 1) + '.'; ml.appendChild(n); }
      const sp = document.createElement('span'); sp.className = 'm' + (i + 1 === ply ? ' cur' : ''); sp.textContent = s; sp.onclick = () => seek(i + 1); ml.appendChild(sp);
    });
  }
  function practice(drill) {
    if (!cur || !window.__coach || !window.__coach.practice) return;
    $('lesson').classList.remove('on'); $('learn').classList.remove('on');
    window.__coach.practice(cur, drill === 'memory' ? { drill: 'memory', onDone: memDone } : undefined);
  }

  // ---------- position cards: the position before each of your moves, "your move?", two taps to answer ----------
  let D = null, sel = null, targets = [], timer = 0;
  function startCards() {
    if (!cur || cur.kind !== 'opening' || !window.__coach) return null;
    const p = plan(cur), st = prog(cur.id).cards || (prog(cur.id).cards = { sessions: 0, box: {} });
    st.sessions = p.s + 1; st.box = st.box || {}; persist();
    D = { id: cur.id, lesson: cur, session: p.s, total: p.cards.length, queue: p.due.slice().sort((a, b) => boxOf(st, a.key) - boxOf(st, b.key) || a.i - b.i),
      seen: p.due.length, first: 0, tried: {}, card: null, phase: 'ask', wrong: null };
    $('dLesson').textContent = cur.title + ' · ' + (cur.side === 'b' ? 'for Black' : 'for White');
    $('dPlay').hidden = false; $('dSum').hidden = true;
    $('lesson').classList.remove('on'); $('drill').classList.add('on'); $('drill').scrollTo(0, 0);
    ask(); return drillState();
  }
  function ask() {
    clearTimeout(timer); sel = null; targets = [];
    if (!D.queue.length) { finish(); return; }
    D.card = D.queue[0]; D.phase = 'ask'; D.wrong = null; drawCard();
  }
  function drawCard() {
    const k = D.card, ph = D.phase, c = new Chess(k.fen), side = c.turn() === 'w' ? 'White' : 'Black', st = got(D.id).cards;
    if (ph === 'right') c.move(k.san);
    window.__coach.renderBoard($('dBoard'), c, { flip: D.lesson.side === 'b', sel, targets, last: ph === 'right' ? { from: k.from, to: k.to } : k.last, check: c.in_check(),
      arrow: ph === 'wrong' ? { from: k.from, to: k.to } : null, onTap: ph === 'ask' ? tap : null });
    const done = D.seen - D.queue.length;
    $('dPos').textContent = 'Card ' + Math.min(D.seen, done + (ph === 'right' ? 0 : 1)) + ' of ' + D.seen + ' · box ' + boxOf(st, k.key) + (ph === 'ask' && k.key in D.tried ? ' · again' : '');
    $('dBar').style.width = Math.round(done / Math.max(1, D.seen) * 100) + '%';
    const q = $('dQ'), n = $('dNote');
    q.dataset.label = n.dataset.label = ph === 'right' ? 'book' : ph === 'wrong' ? 'slip' : '';
    q.textContent = ph === 'ask' ? 'Your move?' : ph === 'right' ? 'Right: ' + k.san : 'The move is ' + k.san;
    n.textContent = ph === 'ask' ? 'Move ' + (Math.floor(k.i / 2) + 1) + ', ' + side + ' to play' + (k.last ? ' after ' + D.lesson.line[k.i - 1] : '') + '. Tap a piece, then its square.'
      : ph === 'right' ? k.note : (D.wrong ? 'You played ' + D.wrong + '. ' : '') + k.note;
    const nb = $('dNext'); nb.textContent = ph === 'ask' ? 'Show me' : D.queue.length ? 'Next card' : 'Finish'; nb.className = 'btn' + (ph === 'ask' ? '' : ' primary');
  }
  function tap(sq) {
    if (!D || D.phase !== 'ask') return;
    const c = new Chess(D.card.fen), t = sel && targets.find((x) => x.to === sq);
    if (t) { answer(sel, sq); return; }
    const p = c.get(sq);
    if (p && p.color === c.turn() && sq !== sel) { sel = sq; targets = c.moves({ square: sq, verbose: true }).map((m) => ({ to: m.to, capture: !!m.captured })); }
    else { sel = null; targets = []; }
    drawCard();
  }
  // the first answer to a card in a session moves its box: right goes up one, wrong (or Show me) drops to box 1.
  // A miss comes back two cards later; the session ends when every due card has been answered right once.
  function answer(from, to) {
    if (!D || D.phase !== 'ask') return null;
    const k = D.card, c = new Chess(k.fen), m = from && to ? c.move({ from, to, promotion: 'q' }) : null;
    sel = null; targets = [];
    if (from && to && !m) { drawCard(); return { legal: false }; }
    const ok = !!m && m.san === k.san, st = prog(D.id).cards;
    if (!(k.key in D.tried)) { D.tried[k.key] = ok; if (ok) D.first++; st.box[k.key] = ok ? Math.min(3, boxOf(st, k.key) + 1) : 1; persist(); }
    D.queue.shift();
    if (ok) { D.phase = 'right'; timer = setTimeout(() => { if (D && D.phase === 'right' && D.card === k) next(); }, Math.min(4500, 1400 + k.note.length * 22)); }
    else { D.phase = 'wrong'; D.wrong = m ? m.san : null; D.queue.splice(Math.min(2, D.queue.length), 0, k); }
    drawCard();
    return { legal: true, ok, san: m ? m.san : null, answer: k.san, box: st.box[k.key] };
  }
  function next() { if (!D || (D.phase !== 'right' && D.phase !== 'wrong')) return null; ask(); return drillState(); }
  function finish() {
    const st = prog(D.id).cards, cs = cardsOf(D.lesson), n = [0, 0, 0, 0];
    for (const k of cs) n[boxOf(st, k.key)]++;
    D.phase = 'done'; D.card = null; st.last = { seen: D.seen, first: D.first, date: new Date().toISOString() }; persist();
    $('dPlay').hidden = true; $('dSum').hidden = false;
    $('dSeen').textContent = D.seen; $('dFirst').textContent = Math.round(D.first / Math.max(1, D.seen) * 100) + '%'; $('dLearned').textContent = n[3] + '/' + cs.length;
    $('dSumT').textContent = D.first === D.seen ? 'Clean session' : 'Session done';
    $('dSumMsg').textContent = D.first + ' of ' + D.seen + ' right first try. Box 1: ' + n[1] + ' · box 2: ' + n[2] + ' · box 3: ' + n[3] + '. Box 1 comes back every session, box 2 every other, box 3 every fourth.';
  }
  function closeDrill() { clearTimeout(timer); const id = D ? D.id : cur && cur.id; D = null; $('drill').classList.remove('on'); if (id) show(id); }
  const drillState = () => D && { id: D.id, phase: D.phase, session: D.session, seen: D.seen, first: D.first, total: D.total, queue: D.queue.map((k) => k.i), wrong: D.wrong,
    card: D.card && { i: D.card.i, fen: D.card.fen, from: D.card.from, to: D.card.to, san: D.card.san, box: boxOf(got(D.id).cards, D.card.key) } };

  // the drills' stage label on the lesson screen, created here so index.html stays as it is
  { const n = document.createElement('p'); n.className = 'chint'; n.id = 'lDrillStage'; n.hidden = true; n.textContent = 'Stage 3 material. ' + STAGE3; $('lDrills').prepend(n); }
  $('learnBack').onclick = close;
  $('lessonBack').onclick = () => { $('lesson').classList.remove('on'); open(); };
  $('lPrev').onclick = () => seek(ply - 1);
  $('lNext').onclick = () => seek(ply + 1);
  $('lPractice').onclick = () => practice();
  $('lMem').onclick = () => practice('memory');
  $('lCards').onclick = startCards;
  $('drillBack').onclick = closeDrill; $('dDone').onclick = closeDrill;
  $('dNext').onclick = () => { if (D && D.phase === 'ask') answer(null, null); else next(); };
  const lb = $('lBoard'); lb.addEventListener('touchstart', (e) => e.preventDefault(), { passive: false });
  window.__learn = { open, close, show, seek, practice, memory: () => practice('memory'), cards: startCards, answer, next, closeDrill, get drill() { return drillState(); },
    progress(id) { return JSON.parse(JSON.stringify(got(id || (cur && cur.id) || ''))); },
    due(id) { const l = L.find((x) => x.id === id); if (!l || l.kind !== 'opening') return null; const p = plan(l); return { session: p.s, due: p.due.length, cards: p.cards.length }; },
    get player() { return who(); }, get lesson() { return cur; }, get ply() { return ply; } };
})();
