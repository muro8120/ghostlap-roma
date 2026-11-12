// Ghostlap Roma: the SAFE OR NOT drill. Tactics trains finding a win; this trains the Stage 0 habit itself: before you let go
// of a move, their checks, captures and threats. Each card is a position and one move you are "about to play". Half the moves
// are real human blunders (the move that set up a lichess puzzle), half are safe moves in the same positions, checked by
// Stockfish when the set was built (tools/build-safety.mjs, safety-data.js). You call it, and if you call it unsafe you have to
// show the punishment: a right call for the wrong reason counts as a miss, and a safe move has no punishment to show.
// Builds its own <section> and <style> (prefix .sf-), like puzzles.js. Needs window.__coach (renderBoard, player) and
// window.Chess. window.__safety: open(opts), close(), stats(), plus test hooks call(unsafe), answer(from, to), next(), state.
(function () {
  'use strict';
  const $ = (id) => document.getElementById(id);
  const mv = (u) => ({ from: u.slice(0, 2), to: u.slice(2, 4), promotion: u[4] || undefined });
  const secs = (ms) => { const s = Math.round(ms / 1000); return s < 60 ? s + ' s' : Math.floor(s / 60) + ' min ' + (s % 60) + ' s'; };
  const median = (a) => { if (!a.length) return 0; const s = a.slice().sort((x, y) => x - y), m = s.length >> 1; return s.length % 2 ? s[m] : Math.round((s[m - 1] + s[m]) / 2); };
  const TARGET_MS = 20000;   // the curriculum's Stage 0 exit criterion: the safety check in under 20 seconds a move

  // ---------- the set: "id|fen|blunder|punishment line|safe|rating" rows, split once on first use ----------
  let SET = null;
  function set() {
    if (SET) return SET;
    SET = [];
    for (const row of String(window.SAFETY || '').split('\n')) {
      const f = row.split('|'); if (f.length !== 6) continue;
      SET.push({ id: f[0], fen: f[1], blunder: f[2], line: f[3].split(' '), safe: f[4], rating: +f[5] });
    }
    return SET;
  }

  // ---------- store: per player ----------
  const KEY = 'ghostlap-safety-v1';
  let store = {};
  try { const raw = JSON.parse(localStorage.getItem(KEY) || '{}'); if (raw && typeof raw === 'object') store = raw; } catch (e) { /* private mode: keep in memory */ }
  const persist = () => { try { localStorage.setItem(KEY, JSON.stringify(store)); } catch (e) {} };
  const who = () => (window.__coach && window.__coach.player) || 'jesse';
  function mine() {
    const w = who(); let s = store[w];
    if (!s || typeof s !== 'object') s = store[w] = {};
    if (!s.seen || typeof s.seen !== 'object') s.seen = {};
    if (!Array.isArray(s.log)) s.log = [];
    if (!Array.isArray(s.sessions)) s.sessions = [];
    return s;
  }

  const CSS = `
  #safety { overflow-y: auto; -webkit-overflow-scrolling: touch; touch-action: pan-y; background: var(--bg); overflow-x: hidden;
    padding: calc(var(--st) + 10px) calc(var(--sr) + 16px) calc(var(--sb) + 28px) calc(var(--sl) + 16px); --sq: calc(min(100vw - 32px, 52vh) / 8); }
  #safety [hidden] { display: none !important; }
  #safety .brow { justify-content: center; margin-top: 4px; }
  #safety .bar { margin-bottom: 4px; } #safety .bar b { transition: width .3s; }
  .sf-head { display: flex; justify-content: space-between; align-items: baseline; gap: 10px; margin: 8px 0; }
  .sf-q { font-size: 22px; font-weight: 800; color: var(--sfc, var(--text)); min-width: 0; }
  .sf-q[data-k=right] { --sfc: var(--green); } .sf-q[data-k=wrong] { --sfc: var(--amber); }
  .sf-pos { color: var(--dim); font-size: 12px; white-space: nowrap; }
  .sf-note[data-k=right] { border-left-color: var(--green); } .sf-note[data-k=wrong] { border-left-color: var(--amber); }
  .sf-call { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-top: 12px; }
  .sf-stats { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; margin: 14px 0 12px; }
  .sf-stats div { background: var(--panel); border: 1px solid var(--line); border-radius: 12px; padding: 10px 2px 8px; text-align: center; }
  .sf-stats b { display: block; font-size: 24px; font-weight: 800; } .sf-stats div:first-child b { color: var(--green); }
  .sf-stats small { font-size: 10px; letter-spacing: .1em; color: var(--dim); text-transform: uppercase; font-weight: 700; }
  .sf-line { background: var(--panel); border: 1px solid var(--line); border-left: 4px solid var(--amber); border-radius: 12px; padding: 10px 12px; font-size: 15px; line-height: 1.45; margin: 0 0 8px; }
  .sf-line.sf-ok { border-left-color: var(--green); }
  `;
  const HTML = `<section id="safety" class="screen">
  <div class="wrap">
    <div class="cbar"><button class="back" id="sfBack" aria-label="Back">&#8249;</button><h1>SAFE OR NOT</h1></div>
    <div class="opening" id="sfSub"></div>
    <div id="sfPlay">
      <div class="bar"><b id="sfBar" style="width:0"></b></div>
      <div class="sf-head"><div class="sf-q" id="sfQ"></div><div class="sf-pos" id="sfPos"></div></div>
      <div class="brow"><div class="board" id="sfBoard"></div></div>
      <div class="lnote sf-note" id="sfNote"></div>
      <div class="sf-call" id="sfCall"><button class="btn" id="sfSafe">Safe</button><button class="btn" id="sfUnsafe">Not safe</button></div>
      <div class="btns" style="margin-top:12px"><button class="btn primary" id="sfNext" hidden>Next</button></div>
    </div>
    <div id="sfSum" hidden>
      <div class="endT" id="sfSumT">Session done</div>
      <div class="sf-stats"><div><b id="sfRight"></b><small>Right</small></div><div><b id="sfMed"></b><small>Median call</small></div><div><b id="sfMissed"></b><small>Dangers missed</small></div></div>
      <div id="sfLines"></div>
      <p class="chint" id="sfSumMsg"></p>
      <div class="btns" style="margin-top:16px"><button class="btn primary" id="sfDone">Done</button></div>
    </div>
  </div>
</section>`;
  const style = document.createElement('style'); style.id = 'sfStyle'; style.textContent = CSS; document.head.appendChild(style);
  document.body.insertAdjacentHTML('beforeend', HTML);

  // ---------- a session ----------
  // phases: 'ask' (safe or not?), 'show' (you said unsafe: play their punishing move), 'done' (verdict and the line), 'end' (summary)
  let S = null, sel = null, targets = [];
  const shuffle = (a) => { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
  function open(opts) {
    opts = opts || {};
    if (!window.__coach || !window.Chess) return null;
    const count = Math.max(1, Math.round(+opts.count || 10)), top = +opts.top > 0 ? +opts.top : 1100, st = mine();
    const pool = set().filter((p) => p.rating <= top);
    const picks = shuffle(pool.filter((p) => !st.seen[p.id])).concat(shuffle(pool.filter((p) => st.seen[p.id]))).slice(0, count);
    // half unsafe, half safe (the odd one by a coin), in an order nobody can read; opts.unsafe (test hook) fixes each card
    const flags = picks.map((_, i) => i < Math.floor(picks.length / 2) + (picks.length % 2 && Math.random() < 0.5 ? 1 : 0)); shuffle(flags);
    const queue = shuffle(picks).map((p, i) => ({ p, unsafe: Array.isArray(opts.unsafe) ? !!opts.unsafe[i] : flags[i] }));
    S = { count, t0: Date.now(), queue, i: -1, done: [], item: null, summary: null, onDone: typeof opts.onDone === 'function' ? opts.onDone : null };
    for (const el of document.querySelectorAll('.screen.on')) el.classList.remove('on');
    $('sfSub').textContent = queue.length + ' moves · about ' + Math.max(3, Math.round(queue.length / 2)) + ' min · their checks, captures, threats';
    $('sfPlay').hidden = false; $('sfSum').hidden = true;
    $('safety').classList.add('on'); $('safety').scrollTo(0, 0);
    if (!queue.length) { finish(); return state(); }
    advance(); return state();
  }
  function advance() {
    sel = null; targets = []; S.i++;
    if (S.i >= S.queue.length) { finish(); return; }
    const q = S.queue[S.i], c = new Chess(q.p.fen), cand = q.unsafe ? q.p.blunder : q.p.safe;
    const t = new Chess(q.p.fen), m = t.move(mv(cand));
    S.item = { q, c, after: t, cand, san: m ? m.san : cand, you: c.turn(), phase: 'ask', t: Date.now(), ms: 0, said: null, right: null, tried: null, why: '' };
    draw();
  }
  // the punishment in SAN, numbered from the position after the blunder
  function lineSan(p) {
    const c = new Chess(p.fen); c.move(mv(p.blunder));
    const out = [];
    for (let i = 0; i < p.line.length; i++) {
      const f = c.fen().split(' '), white = f[1] === 'w', m = c.move(mv(p.line[i])); if (!m) break;
      out.push(white ? f[5] + '. ' + m.san : (i === 0 ? f[5] + '... ' : '') + m.san);
    }
    return out.join(' ');
  }
  const firstSan = (p) => { const c = new Chess(p.fen); c.move(mv(p.blunder)); const m = c.move(mv(p.line[0])); return m ? m.san : p.line[0]; };
  // the call. Safe ends the card at once. Not safe moves on to "show it": the candidate is played and you move for them.
  function call(unsafe) {
    const it = S && S.item; if (!it || it.phase !== 'ask') return null;
    it.ms = Date.now() - it.t; it.said = unsafe ? 'unsafe' : 'safe';
    if (!unsafe) { settle(!it.q.unsafe); return { said: 'safe', right: it.right }; }
    it.phase = 'show'; draw();
    return { said: 'unsafe' };
  }
  function tap(sq) {
    const it = S && S.item; if (!it || it.phase !== 'show') return;
    const t = sel && targets.find((x) => x.to === sq);
    if (t) { answer(sel, sq); return; }
    const p = it.after.get(sq);
    if (p && p.color === it.after.turn() && sq !== sel) { sel = sq; targets = it.after.moves({ square: sq, verbose: true }).map((m) => ({ to: m.to, capture: !!m.captured })); }
    else { sel = null; targets = []; }
    draw();
  }
  // their punishing move, one try. On an unsafe card it must be the first move of the line (or any mate); on a safe card
  // nothing wins, so whatever is shown is wrong.
  function answer(from, to) {
    const it = S && S.item; if (!it || it.phase !== 'show' || !from || !to) return null;
    const want = mv(it.q.p.line[0]);
    const t = new Chess(it.after.fen()), m = t.move({ from, to, promotion: from === want.from && to === want.to ? want.promotion : 'q' });
    sel = null; targets = [];
    if (!m) { draw(); return { legal: false }; }
    it.tried = m.san;
    settle(it.q.unsafe && ((from === want.from && to === want.to) || t.in_checkmate()));
    return { legal: true, right: it.right, san: m.san };
  }
  function settle(right) {
    const it = S.item, st = mine(), p = it.q.p;
    it.right = !!right; it.phase = 'done';
    st.seen[p.id] = 1;
    st.log.push({ id: p.id, unsafe: it.q.unsafe ? 1 : 0, said: it.said, right: it.right ? 1 : 0, ms: it.ms, date: new Date().toISOString() });
    if (st.log.length > 400) st.log.splice(0, st.log.length - 400);
    persist();
    S.done.push({ id: p.id, unsafe: it.q.unsafe, said: it.said, right: it.right, ms: it.ms });
    draw();
  }
  function next() { if (!S || !S.item || S.item.phase !== 'done') return null; advance(); return state(); }
  function finish() {
    const st = mine(), n = S.done.length, right = S.done.filter((d) => d.right).length;
    const medMs = median(S.done.map((d) => d.ms));
    const missed = S.done.filter((d) => d.unsafe && d.said === 'safe').length, alarms = S.done.filter((d) => !d.unsafe && d.said === 'unsafe').length;
    const reason = S.done.filter((d) => d.unsafe && d.said === 'unsafe' && !d.right).length;
    const sess = { date: new Date().toISOString(), n, right, medMs, missed, alarms };
    if (n) { st.sessions.push(sess); if (st.sessions.length > 500) st.sessions.splice(0, st.sessions.length - 500); persist(); }
    S.summary = sess; S.item = null; S.phase = 'end';
    $('sfPlay').hidden = true; $('sfSum').hidden = false;
    $('sfSumT').textContent = !n ? 'Nothing to play' : right === n ? 'All ' + n + ' right' : right + ' right of ' + n;
    $('sfRight').textContent = right + '/' + n; $('sfMed').textContent = n ? secs(medMs) : '–'; $('sfMissed').textContent = String(missed);
    const box = $('sfLines'); box.innerHTML = '';
    const say = (t, ok) => { const p = document.createElement('p'); p.className = 'sf-line' + (ok ? ' sf-ok' : ''); p.textContent = t; box.appendChild(p); };
    if (missed) say(missed + (missed === 1 ? ' losing move' : ' losing moves') + ' called safe. That is the hung piece in your games. Their checks first, then their captures, then their threats.', false);
    if (reason) say(reason + ' called unsafe for the wrong reason. A feeling is not a check: name their move.', false);
    if (alarms) say(alarms + (alarms === 1 ? ' safe move' : ' safe moves') + ' called unsafe. Seeing ghosts costs clock; if you cannot name their move, it is safe.', false);
    if (n && right === n) say(medMs <= TARGET_MS ? 'Every call right, inside the 20 seconds. This is what the habit looks like.' : 'Every call right. Accuracy first; the 20 seconds comes with repetition.', true);
    const s = stats();
    $('sfSumMsg').textContent = s.acc30 == null ? 'The plan reads your last 30 calls here once you have made 30. So far: ' + s.n + '.'
      : 'Last 30 calls: ' + s.acc30 + '% right, median ' + secs(s.medMs30) + '. The plan asks for the check to be habitual in under 20 seconds.';
    if (n && S.onDone) { try { S.onDone(sess); } catch (e) { console.error(e); } }
  }
  function draw() {
    const it = S && S.item; if (!it) return;
    const p = it.q.p, ph = it.phase, m = mv(it.cand), side = it.you === 'w' ? 'White' : 'Black';
    const R = window.__coach.renderBoard, flip = it.you === 'b';
    let k = '', head = '', note = '';
    if (ph === 'ask') {
      R($('sfBoard'), it.c, { flip, check: it.c.in_check(), arrow: { from: m.from, to: m.to }, busy: true });
      head = it.san + ': safe?';
      note = 'You are ' + side + ', about to play ' + it.san + '. Before you let go: their checks, their captures, their threats.';
    } else if (ph === 'show') {
      R($('sfBoard'), it.after, { flip, sel, targets, last: { from: m.from, to: m.to }, check: it.after.in_check(), onTap: tap });
      head = 'Show it'; note = it.san + ' is on the board. Play their move that punishes it. One try: tap their piece, then its square.';
    } else {
      const w = mv(p.line[0]);
      const o = { flip, last: { from: m.from, to: m.to }, check: it.after.in_check(), busy: true };
      if (it.q.unsafe) o.arrow = { from: w.from, to: w.to, cls: 'red' };
      R($('sfBoard'), it.after, o);
      k = it.right ? 'right' : 'wrong';
      if (it.q.unsafe) {
        const line = 'After ' + it.san + ': ' + lineSan(p) + '.';
        if (it.right) { head = 'Right: not safe'; note = line + ' Called in ' + secs(it.ms) + '.'; }
        else if (it.said === 'safe') { head = 'Not safe'; note = 'You called it safe. ' + line; }
        else { head = 'Right call, wrong reason'; note = 'You showed ' + it.tried + '. Their move was ' + firstSan(p) + '. ' + line + ' It counts as a miss: the check is naming their move.'; }
      } else if (it.right) { head = 'Right: safe'; note = it.san + ' loses nothing: the engine found no check, capture or threat that works against it. Called in ' + secs(it.ms) + '.'; }
      else { head = 'It was safe'; note = (it.tried ? 'You showed ' + it.tried + ', which wins nothing. ' : '') + it.san + ' was fine: the engine found nothing that works against it. If you cannot name their move, play yours.'; }
    }
    $('sfQ').dataset.k = $('sfNote').dataset.k = k; $('sfQ').textContent = head; $('sfNote').textContent = note;
    $('sfPos').textContent = (S.i + 1) + ' of ' + S.queue.length;
    $('sfBar').style.width = Math.round(S.done.length / Math.max(1, S.queue.length) * 100) + '%';
    $('sfCall').hidden = ph !== 'ask';
    const nb = $('sfNext'); nb.hidden = ph !== 'done'; nb.textContent = S.i + 1 >= S.queue.length ? 'Finish' : 'Next';
  }
  function close() {
    if (S && S.phase !== 'end' && S.done.length) {   // a session left half way still counts what was called
      const st = mine(), n = S.done.length;
      st.sessions.push({ date: new Date().toISOString(), n, right: S.done.filter((d) => d.right).length, medMs: median(S.done.map((d) => d.ms)), partial: true });
      persist();
    }
    const back = S && S.onBack; S = null; sel = null; targets = [];
    $('safety').classList.remove('on');
    if (typeof back === 'function') back(); else if (window.__hub) window.__hub.show();
  }
  // the last 30 calls: accuracy, the median time to call, and how many losing moves were called safe. null until there are 30.
  function stats() {
    const st = mine(), last = st.log.slice(-30), full = last.length >= 30;
    return { n: st.log.length, sessions: st.sessions.length,
      acc30: full ? Math.round(last.filter((r) => r.right).length / last.length * 100) : null,
      medMs30: full ? median(last.map((r) => r.ms)) : null,
      missed30: full ? last.filter((r) => r.unsafe && r.said === 'safe').length : null };
  }
  function state() {
    if (!S) return null;
    const it = S.item;
    return { phase: it ? it.phase : 'end', i: S.i, n: S.queue.length, done: S.done.slice(), summary: S.summary,
      item: it && { id: it.q.p.id, unsafe: it.q.unsafe, cand: it.cand, san: it.san, expect: it.q.p.line[0], right: it.right, said: it.said } };
  }

  $('sfBack').onclick = close; $('sfDone').onclick = close; $('sfNext').onclick = () => next();
  $('sfSafe').onclick = () => call(false); $('sfUnsafe').onclick = () => call(true);
  window.__safety = { open: (o) => { const r = open(o); if (S && o && typeof o.onBack === 'function') S.onBack = o.onBack; return r; }, close, stats, call, answer, next,
    get state() { return state(); }, get count() { return set().length; } };
})();
