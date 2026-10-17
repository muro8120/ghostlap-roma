// Ghostlap Roma: the TRAIN screen. The curriculum's staged plan for one learner on 12-hour shifts: what to do today (asked
// once a day, shift-aware), this week's micro-step and pearl, the stage card with its exit criteria read from your own games,
// the metrics grid, and the resources and pitfalls. Builds its own <section id="plan"> and <style id="plStyle"> (prefix .pl-),
// so index.html only needs the script tag. Needs window.Curriculum (curriculum.js) and window.__coach; uses __puzzles and
// __endgames when they are loaded. window.__plan: open(), close(), stage(), ctxToday(), plus the hooks the tests drive.
(function () {
  'use strict';
  const $ = (id) => document.getElementById(id);
  const C = window.Curriculum;
  if (!C) { console.error('plan.js needs curriculum.js'); return; }
  const coach = () => window.__coach || null;

  // ---------- store: per player, apart from the chess history ----------
  // { stage, startISO, days: { 'YYYY-MM-DD': ctx }, done: { 'YYYY-MM-DD': { blockId: n } }, attest: { metricId: bool },
  //   resources: { 'S0:0': bool }, advanced: [{ from, to, date, override }] }
  const KEY = 'ghostlap-train-v1';
  let store = {};
  try { const raw = JSON.parse(localStorage.getItem(KEY) || '{}'); if (raw && typeof raw === 'object') store = raw; } catch (e) { /* private mode: keep in memory */ }
  const persist = () => { try { localStorage.setItem(KEY, JSON.stringify(store)); } catch (e) {} };
  const who = () => (coach() && coach().player) || 'jesse';
  function mine() {
    const w = who(); let s = store[w];
    if (!s || typeof s !== 'object') s = store[w] = {};
    if (!C.stage(s.stage)) s.stage = 'S0';
    if (typeof s.startISO !== 'string') s.startISO = null;   // set the first time the screen opens: week 1 starts then
    for (const k of ['days', 'done', 'attest', 'resources']) if (!s[k] || typeof s[k] !== 'object') s[k] = {};
    if (!Array.isArray(s.advanced)) s.advanced = [];
    return s;
  }

  // ---------- days and weeks (local calendar dates, like the coach's day sheet) ----------
  const pad = (n) => String(n).padStart(2, '0');
  const ymd = (d) => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  const today = () => ymd(new Date());
  const fromYmd = (s) => { const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s); return m ? new Date(+m[1], +m[2] - 1, +m[3]) : new Date(s); };
  const fmtDay = (s) => { try { return fromYmd(s).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }); } catch (e) { return s; } };
  const weekIdx = () => { const s = mine(); return s.startISO ? C.weekIndex(s.startISO) : 0; };
  // the seven dates of the current plan week, counted from the day the plan was first opened
  function weekDays() {
    const s = mine(), a = s.startISO ? new Date(s.startISO) : new Date(), wi = weekIdx(), out = [];
    for (let i = 0; i < 7; i++) out.push(ymd(new Date(a.getFullYear(), a.getMonth(), a.getDate() + wi * 7 + i)));
    return out;
  }
  const doneThisWeek = (blockId) => { const d = mine().done; return weekDays().reduce((n, day) => n + ((d[day] || {})[blockId] | 0), 0); };

  // ---------- today's context: the plan's own answer first, then the coach's (its day sheet asks the same question) ----------
  const CTX = { morning: 'Off-day morning', shift: 'Shift day', post: 'After a shift' };
  let reask = false;   // "Change" shows the question again until it is answered
  function ctxNow() {
    if (reask) return undefined;
    const d = mine().days[today()]; if (CTX[d]) return d;
    const c = coach() && coach().ctxToday ? coach().ctxToday() : undefined;
    return CTX[c] ? c : undefined;   // the coach's null (Skip) is not an answer the plan can shape a day round
  }
  function setCtx(ctx) {
    if (!CTX[ctx]) return null;
    mine().days[today()] = ctx; reask = false; persist();
    if (coach() && coach().setCtx) coach().setCtx(ctx);   // one answer a day, shared with the chess screen
    if (on()) render();
    return ctx;
  }

  // ---------- blocks: what the app can observe for each, and what it opens ----------
  const kindOf = (b) => /long game/i.test(b.name) ? 'game' : /tactic|puzzle/i.test(b.name) ? 'puzzles' : /endgame/i.test(b.name) ? 'endgames'
    : /lesson|study|positional|repair/i.test(b.name) ? 'lesson' : 'manual';
  const ACT = { game: 'Long game', puzzles: 'Tactics', endgames: 'Endgames', lesson: 'Resources' };
  const BAND = { S0: [500, 799], S1: [800, 999], S2: [1000, 1199], S3: [1200, 1400], S4: [1200, 1400] };   // puzzle ratings, easy by design
  const WHEN = { off_day_morning: 'Off-day morning', off_day: 'Off day', shift_day: 'Shift day', any: 'Any day', as_needed: 'As needed' };
  const blocksOf = (stageId) => (C.stage(stageId) || {}).weekly_blocks || [];
  const blockOfKind = (kind) => blocksOf(mine().stage).find((b) => kindOf(b) === kind) || null;
  const canAct = (k) => k === 'game' ? !!(coach() && coach().newGame) : k === 'puzzles' ? !!window.__puzzles : k === 'endgames' ? !!window.__endgames : k === 'lesson';
  function tick(blockId, n) {
    const s = mine(), d = today();
    if (!s.done[d]) s.done[d] = {};
    s.done[d][blockId] = (s.done[d][blockId] | 0) + (n == null ? 1 : n | 0); persist();
    if (on()) render();
    return doneThisWeek(blockId);
  }
  const egTries = () => { try { const st = window.__endgames.stats(); return Object.keys(st.perPos || {}).reduce((n, k) => n + (st.perPos[k].tries | 0), 0); } catch (e) { return 0; } };
  function act(b) {
    const k = kindOf(b), st = mine().stage;
    if (k === 'game') {
      const o = { mode: 'train' }, c = ctxNow(); if (c) o.ctx = c;   // no answer yet: the coach's own sheet asks, and the plan reads it back
      hide(); coach().newGame(o);
    } else if (k === 'puzzles') {
      window.__puzzles.open({ band: BAND[st] || BAND.S0, minutes: b.duration_min, onDone: () => tick(b.id) });
    } else if (k === 'endgames') {
      const before = egTries(); hide();
      window.__endgames.open({ set: /^S[012]$/.test(st) ? st : 'all', onDone: () => { if (egTries() > before) tick(b.id); show(); } });
    } else if (k === 'lesson') {
      fold.add('res'); render();
      const el = $('plRes'); if (el && el.scrollIntoView) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }
  // the post-mortem debt: the oldest recorded game without one, opened in the coach's sheet, then back here
  function oldestDebt() { const h = (coach() && coach().history) || []; for (let i = h.length - 1; i >= 0; i--) if (h[i] && !h[i].practice && !h[i].pm) return h[i]; return null; }
  function payDebt() {
    const e = oldestDebt(); if (!e || !coach().postMortem) return null;
    hide();
    return coach().postMortem(e).then((v) => { show(); return v; });
  }

  // ---------- the stage: facts from the ledger, puzzles and endgames; the verdict; advancing ----------
  const stageNo = (id) => +String(id).slice(1);
  const stageTitle = (st) => 'Stage ' + stageNo(st.id) + ': ' + st.name.replace(':', ',');
  function facts() {
    const rows = (coach() && coach().ledger) || [];
    let pz = null, eg = null;
    try { pz = window.__puzzles ? window.__puzzles.stats() : null; } catch (e) {}
    try { eg = window.__endgames ? window.__endgames.stats() : null; } catch (e) {}
    return C.facts(rows, { puzzles: pz, endgames: eg, attest: mine().attest });
  }
  const evaluate = () => C.evaluate(mine().stage, facts());
  // from Stage 3 the engine's lines are shown in the review; before that the review stays narrow
  function applyLevel() { const c = coach(); if (c && c.setReviewLevel) c.setReviewLevel(stageNo(mine().stage) >= 3 ? 'full' : 'narrow'); }
  function attest(metric, yes) {
    if (!C.attested.includes(metric)) return null;
    mine().attest[metric] = !!yes; persist();
    if (on()) render();
    return !!yes;
  }
  let confirmAdv = false;   // "Advance anyway" asks once
  function advance(override) {
    const s = mine(), from = s.stage, to = C.next(from);
    if (!to) return null;
    if (!override) { const ev = evaluate(); if (!ev || !ev.met) return null; }
    s.stage = to; s.advanced.push({ from, to, date: new Date().toISOString(), override: !!override }); persist();
    confirmAdv = false; applyLevel();
    if (on()) render();
    return to;
  }

  // ---------- the screen, built here so index.html stays untouched (.pl- prefix throughout) ----------
  const CSS = `
  #plan { overflow-y: auto; overflow-x: hidden; -webkit-overflow-scrolling: touch; touch-action: pan-y; background: var(--bg);
    padding: calc(var(--st) + 10px) calc(var(--sr) + 16px) calc(var(--sb) + 28px) calc(var(--sl) + 16px); }
  #plan [hidden] { display: none !important; }
  #plan .wrap { overflow-wrap: anywhere; }
  .pl-card { gap: 10px; }
  .pl-q { font-size: 20px; font-weight: 800; line-height: 1.2; }
  .pl-pills { display: flex; flex-wrap: wrap; gap: 8px; }
  .pl-ctx { font-weight: 700; font-size: 15px; }
  .pl-ctx + .pill { padding: 7px 12px; }
  .pl-debt { display: flex; align-items: center; gap: 10px; background: var(--panel2); border-left: 4px solid var(--amber); border-radius: 10px; padding: 9px 11px; font-size: 14px; line-height: 1.35; }
  .pl-debt .btn { height: 38px; font-size: 14px; padding: 0 14px; flex: none; margin-left: auto; }
  .pl-block, .pl-crit, .pl-rrow, .pl-fold, .pl-adv { border-top: 1px solid var(--line); padding-top: 10px; }
  .pl-block { display: grid; gap: 4px; }
  .pl-top { display: flex; justify-content: space-between; align-items: baseline; gap: 10px; }
  .pl-name { font-weight: 700; font-size: 16px; min-width: 0; }
  .pl-meta, .pl-dim { color: var(--dim); font-size: 12px; line-height: 1.4; }
  .pl-txt { font-size: 14px; line-height: 1.45; }
  .pl-why { color: var(--amber); font-size: 13px; font-weight: 600; margin-top: 2px; }
  .pl-off .pl-name, .pl-off .pl-meta, .pl-off .pl-txt, .pl-off .pl-dots { opacity: .45; }
  .pl-dots { display: flex; gap: 4px; align-items: center; flex: none; }
  .pl-dots i { display: block; width: 9px; height: 9px; border-radius: 50%; border: 1.5px solid var(--line); }
  .pl-dots i.on { background: var(--green); border-color: var(--green); }
  .pl-act { display: flex; align-items: center; gap: 8px; margin-top: 6px; }
  .pl-act .btn { height: 42px; font-size: 15px; padding: 0 16px; flex: none; }
  .pl-act .pill { padding: 8px 12px; flex: none; }
  .pl-count { color: var(--dim); font-size: 12px; margin-left: auto; text-align: right; }
  .pl-step b { display: block; font-size: 12px; letter-spacing: .14em; text-transform: uppercase; color: var(--dim); margin-bottom: 4px; }
  .pl-step div { font-size: 15px; line-height: 1.45; }
  .pl-pearl { display: grid; gap: 4px; border-top: 1px solid var(--line); padding-top: 10px; }
  .pl-pearl .k, .pl-sub { color: var(--dim); font-size: 12px; letter-spacing: .14em; text-transform: uppercase; font-weight: 700; }
  .pl-ptext { font-size: 17px; line-height: 1.3; font-weight: 700; min-width: 0; }
  .pl-grade { display: inline-grid; place-items: center; min-width: 26px; height: 24px; padding: 0 7px; border-radius: 7px; font-size: 12px; font-weight: 800; border: 1px solid var(--line); color: var(--dim); background: var(--panel2); flex: none; }
  .pl-grade.gA { color: var(--green); border-color: rgba(61,214,140,.55); }
  .pl-grade.gB { color: var(--ghost); border-color: rgba(169,210,255,.5); }
  .pl-grade.gC { color: var(--amber); border-color: rgba(242,178,76,.55); }
  .pl-grade.gD { color: var(--red); border-color: rgba(255,90,95,.5); }
  .pl-legend { display: grid; gap: 6px; background: var(--panel2); border-radius: 10px; padding: 10px 11px; }
  .pl-list { display: grid; gap: 8px; padding-top: 8px; }
  .pl-li { display: grid; grid-template-columns: auto minmax(0, 1fr); gap: 8px; font-size: 14px; line-height: 1.4; align-items: start; }
  .pl-li.one { grid-template-columns: minmax(0, 1fr); }
  .pl-li b { font-weight: 700; }
  .pl-fold summary { list-style: none; cursor: pointer; display: flex; justify-content: space-between; align-items: center; min-height: 32px; color: var(--dim); font-size: 12px; letter-spacing: .14em; text-transform: uppercase; font-weight: 700; }
  .pl-fold summary::-webkit-details-marker { display: none; }
  .pl-fold summary::after { content: '+'; font-size: 20px; line-height: 1; color: var(--dim); }
  .pl-fold[open] summary::after { content: '\\2212'; }
  .pl-title { font-size: 20px; font-weight: 800; line-height: 1.2; }
  .pl-crit { display: grid; grid-template-columns: 20px minmax(0, 1fr) auto; gap: 8px; align-items: center; font-size: 14px; line-height: 1.4; }
  .pl-mark { font-weight: 800; text-align: center; font-size: 15px; }
  .pl-crit.met .pl-mark { color: var(--green); } .pl-crit.unmet .pl-mark { color: var(--amber); } .pl-crit.unknown .pl-mark { color: var(--dim); }
  .pl-src { color: var(--dim); font-size: 10px; letter-spacing: .12em; text-transform: uppercase; font-weight: 700; }
  .pl-crit .pill { padding: 7px 12px; }
  .pl-adv { display: grid; gap: 8px; }
  .pl-adv .pill { justify-self: start; }
  .pl-grid { display: grid; grid-template-columns: minmax(0, 1fr) auto auto; gap: 9px 10px; font-size: 13px; line-height: 1.35; align-items: baseline; }
  .pl-gh { color: var(--dim); font-size: 10px; letter-spacing: .14em; text-transform: uppercase; font-weight: 700; }
  .pl-gv { font-weight: 800; font-size: 15px; text-align: right; white-space: nowrap; }
  .pl-gt { color: var(--dim); text-align: right; max-width: 110px; }
  .pl-rrow { display: grid; grid-template-columns: 28px minmax(0, 1fr) auto; gap: 10px; align-items: center; min-height: 40px; font-size: 14px; line-height: 1.4; }
  .pl-tick { width: 26px; height: 26px; border-radius: 8px; border: 1px solid var(--line); background: var(--panel2); color: #07130c; font-weight: 800; font-size: 15px; }
  .pl-tick.on { background: var(--green); border-color: var(--green); }
  .pl-link { color: var(--ghost); font-size: 13px; text-decoration: none; padding: 8px 0 8px 8px; }
  #plan .chint { margin: 0; }
  `;
  const HTML = `<section id="plan" class="screen">
  <div class="wrap">
    <div class="cbar"><button class="back" id="plBack" aria-label="Back">&#8249;</button><h1>TRAIN</h1></div>
    <p class="chint" id="plIntro">The plan from the research, kept honest by your own games. A stage is left by meeting its exit criteria, not by time. Shift evenings are for easy repetition; long games and new material belong to off-day mornings.</p>
    <h2>Today</h2><div id="plToday"></div>
    <h2>This week</h2><div id="plWeek"></div>
    <h2>Stage</h2><div id="plStage"></div>
    <h2>Metrics</h2><div id="plMetrics"></div>
    <h2>Resources</h2><div id="plRes"></div>
  </div>
</section>`;
  const style = document.createElement('style'); style.id = 'plStyle'; style.textContent = CSS; document.head.appendChild(style);
  document.body.insertAdjacentHTML('beforeend', HTML);

  // ---------- rendering ----------
  const on = () => $('plan').classList.contains('on');
  const h = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
  const add = (p, ...kids) => { for (const k of kids) if (k) p.appendChild(typeof k === 'string' ? document.createTextNode(k) : k); return p; };
  const fold = new Set();   // which collapsed lists are open, kept across re-renders
  let legend = false;       // the evidence-grade legend, one tap on any badge
  function details(id, title, body) {
    const d = h('details', 'pl-fold'); d.id = 'pl-' + id; d.open = fold.has(id);
    add(d, h('summary', null, title), body);
    d.addEventListener('toggle', () => { if (d.open) fold.add(id); else fold.delete(id); });
    return d;
  }
  function badge(grade) {
    const g = String(grade || '?'), b = h('button', 'pl-grade g' + g[0], g);
    b.title = 'Evidence grade ' + g; b.setAttribute('aria-label', 'Evidence grade ' + g + ', tap for the legend');
    b.onclick = () => { legend = !legend; render(); };
    return b;
  }
  function legendBox() {
    const box = h('div', 'pl-legend'); box.id = 'plLegend';
    for (const g in C.grades) add(box, add(h('div', 'pl-li'), badge(g), h('span', null, C.grades[g])));
    box.appendChild(h('p', 'chint', (C.data.meta.notes || [])[0] || ''));
    return box;
  }
  function dots(n, f) {
    const d = h('span', 'pl-dots');
    for (let i = 0; i < Math.min(7, f); i++) d.appendChild(h('i', i < n ? 'on' : ''));
    return d;
  }
  const countText = (n, f) => f ? n + ' of ' + f + ' this week' : n ? n + ' this week' : 'As needed';

  function blockRow(b) {
    const k = kindOf(b), n = doneThisWeek(b.id), f = b.frequency_per_week | 0;
    const row = h('div', 'pl-block' + (b.today === false ? ' pl-off' : '')); row.dataset.block = b.id; row.dataset.kind = k;
    add(row, add(h('div', 'pl-top'), h('span', 'pl-name', b.name), dots(n, f)),
      h('div', 'pl-meta', [WHEN[b.when] || b.when, b.duration_min ? 'about ' + b.duration_min + ' min' : null, b.time_control || null].filter(Boolean).join(' · ')),
      h('div', 'pl-txt', b.content));
    if (b.today === false) { add(row, h('div', 'pl-why', b.why), b.research ? h('div', 'pl-dim', b.research) : null); return row; }
    const bar = h('div', 'pl-act'), can = canAct(k);
    if (can && ACT[k]) { const bt = h('button', 'btn' + (k === 'lesson' ? '' : ' primary'), ACT[k]); bt.dataset.act = k; bt.onclick = () => act(b); bar.appendChild(bt); }
    // a manual tick for what the app cannot see: lessons, the odd exercise, or a module that is not loaded
    if (k === 'lesson' || k === 'manual' || !can) { const d = h('button', 'pill', 'Done'); d.dataset.done = b.id; d.onclick = () => tick(b.id); bar.appendChild(d); }
    bar.appendChild(h('span', 'pl-count num', countText(n, f)));
    row.appendChild(bar);
    return row;
  }
  function renderToday() {
    const el = $('plToday'); el.innerHTML = '';
    const s = mine(), ctx = ctxNow(), card = h('div', 'cset pl-card');
    if (!ctx) {
      add(card, h('div', 'pl-q', 'What kind of day is it?'),
        h('p', 'chint', 'Asked once a day. The plan is built round your shifts: long games and new material in off-day mornings, easy repetition after a shift.'));
      const row = h('div', 'pl-pills'); row.id = 'plCtx';
      for (const k in CTX) { const b = h('button', 'pill', CTX[k]); b.dataset.ctx = k; b.onclick = () => setCtx(k); row.appendChild(b); }
      card.appendChild(row);
    } else {
      const row = h('div', 'srow'), ch = h('button', 'pill', 'Change'); ch.id = 'plCtxChange'; ch.onclick = () => { reask = true; render(); };
      add(card, add(row, h('span', 'k', 'Kind of day'), add(h('span', 'pl-pills'), h('span', 'pl-ctx', CTX[ctx]), ch)));
      if (ctx === 'post') card.appendChild(h('p', 'chint', 'After a shift the plan says easy repetition only. A long game now is allowed, but it is not training.'));
    }
    const debt = coach() && coach().pmDebt ? coach().pmDebt() : 0;
    if (debt > 0) {
      const d = h('div', 'pl-debt'); d.id = 'plDebt';
      const b = h('button', 'btn', 'Do the oldest'); b.id = 'plDebtGo'; b.onclick = payDebt;
      add(card, add(d, h('span', null, debt === 1 ? '1 game owes a post-mortem.' : debt + ' games owe a post-mortem.'), b));
    }
    for (const b of C.blocksFor(s.stage, ctx || null)) card.appendChild(blockRow(b));
    el.appendChild(card);
  }
  function renderWeek() {
    const el = $('plWeek'); el.innerHTML = '';
    const s = mine(), wi = weekIdx(), st = C.stage(s.stage), days = weekDays(), card = h('div', 'cset pl-card');
    const head = h('div', 'srow'); head.id = 'plWeekHead';
    add(card, add(head, h('span', 'k', 'Week ' + (wi + 1) + (st.duration_hint_weeks ? ' of about ' + st.duration_hint_weeks : '')), h('span', 'pl-dim', fmtDay(days[0]) + ' to ' + fmtDay(days[6]))));
    const ms = C.microStep(s.stage, wi);
    if (ms) {
      const m = h('div', 'pl-step'); m.id = 'plStep';
      add(m, h('b', null, 'This week’s step' + (ms.week ? ' (week ' + ms.week + ')' : '')), h('div', null, ms.task));
      if (ms.repeat) m.appendChild(h('p', 'chint', 'A repeat: the stage is not met yet, so its last weeks come round again.'));
      card.appendChild(m);
    }
    const p = C.pearlOfWeek(s.stage, wi);
    if (p) {
      const pe = h('div', 'pl-pearl'); pe.id = 'plPearl'; pe.dataset.id = p.id;
      add(pe, h('span', 'k', 'Pearl of the week'), add(h('div', 'pl-top'), h('span', 'pl-ptext', p.text), badge(p.grade)),
        h('div', 'pl-txt', 'Do: ' + p.action), h('div', 'pl-dim', p.mechanism + ' ' + p.source + '.'));
      card.appendChild(pe);
    }
    if (legend) card.appendChild(legendBox());
    const so = h('div', 'pl-list');
    for (const o of C.standingOrders) so.appendChild(add(h('div', 'pl-li'), badge(o.grade), h('span', null, o.text + (o.contested ? ' Contested.' : '') + (o.note ? ' ' + o.note + '.' : ''))));
    card.appendChild(details('so', 'Standing orders, every stage', so));
    el.appendChild(card);
  }
  const MARK = { met: '✓', unmet: '✕', unknown: '?' };
  const SRC = { ledger: 'games', puzzles: 'tactics', endgames: 'endgames' };
  function critRow(c) {
    const row = h('div', 'pl-crit ' + c.status); row.dataset.metric = c.metric; row.dataset.status = c.status;
    const body = h('div'); add(body, h('div', null, c.label), c.note ? h('div', 'pl-dim', c.note) : null);
    add(row, h('span', 'pl-mark', MARK[c.status] || '?'), body);
    if (c.source === 'self') {
      const t = h('button', 'pill' + (c.actual === true ? ' on' : ''), c.actual === true ? 'Yes' : 'Not yet'); t.dataset.attest = c.metric;
      t.onclick = () => attest(c.metric, c.actual !== true); row.appendChild(t);
    } else row.appendChild(h('span', 'pl-src', SRC[c.source] || ''));
    return row;
  }
  function renderStage() {
    const el = $('plStage'); el.innerHTML = '';
    const s = mine(), st = C.stage(s.stage), ev = evaluate(), card = h('div', 'cset pl-card');
    const t = h('div', 'pl-title', stageTitle(st)); t.id = 'plStageTitle';
    add(card, t, h('div', 'pl-txt', st.mechanism));
    const g = h('div', 'pl-list');
    for (const x of st.giants_to_copy || []) g.appendChild(add(h('div', 'pl-li one'), add(h('span'), h('b', null, x.name + ': '), x.lesson)));
    if ((st.giants_to_ignore || []).length) add(g, h('div', 'pl-sub', 'Ignore for now'), h('div', 'pl-txt', st.giants_to_ignore.join(' · ')));
    card.appendChild(details('giants', 'Giants to copy, and to ignore', g));
    const crit = h('div'); crit.id = 'plCrit';
    crit.appendChild(h('div', 'pl-sub', 'Exit criteria'));
    if (!ev.criteria.length) crit.appendChild(h('p', 'chint', 'No exit criteria here. From this stage on the plan is yours, with a coach.'));
    for (const c of ev.criteria) crit.appendChild(critRow(c));
    if (ev.criteria.some((c) => c.source === 'self')) crit.appendChild(h('p', 'chint', 'The toggles are on your word. Tick one when it is true at the board without you thinking about it, not when you would like it to be.'));
    card.appendChild(crit);
    const nx = C.next(s.stage);
    if (nx) {
      const adv = h('div', 'pl-adv'); adv.id = 'plAdvance';
      if (ev.met) { const b = h('button', 'btn primary', 'Advance to Stage ' + stageNo(nx)); b.id = 'plAdvGo'; b.onclick = () => advance(false); adv.appendChild(b); }
      else if (confirmAdv) {
        adv.appendChild(h('div', 'pl-txt', 'The exit criteria are not met. Advancing now is recorded as an override, and the plan will say so.'));
        const row = h('div', 'row2'), yes = h('button', 'btn', 'Advance anyway'), no = h('button', 'btn primary', 'Keep going');
        yes.id = 'plAdvYes'; yes.onclick = () => advance(true); no.id = 'plAdvNo'; no.onclick = () => { confirmAdv = false; render(); };
        adv.appendChild(add(row, yes, no));
      } else { const b = h('button', 'pill', 'Advance anyway'); b.id = 'plAdvAnyway'; b.onclick = () => { confirmAdv = true; render(); }; adv.appendChild(b); }
      card.appendChild(adv);
    }
    const last = s.advanced[s.advanced.length - 1];
    if (last && last.to === s.stage) { const p = h('p', 'chint', 'Entered ' + fmtDay(last.date.slice(0, 10)) + (last.override ? ' by override, with the criteria unmet.' : ' with every criterion met.')); p.id = 'plEntered'; card.appendChild(p); }
    el.appendChild(card);
  }
  // the metrics table's targets are strings like '>20' or '>=90 (easy), start medium'; read the plain ones as words
  function tgt(s) {
    const m = /^(>=|<=|>|<)?\s*(\d+(?:\.\d+)?)$/.exec(String(s || '').trim());
    if (!m) return s || '–';
    const op = m[1] || '', v = m[2];
    return op === '>' ? 'over ' + v : op === '>=' ? v + ' or more' : op === '<' ? 'under ' + v : op === '<=' ? v + ' or fewer' : v;
  }
  function renderMetrics() {
    const el = $('plMetrics'); el.innerHTML = '';
    const s = mine(), F = facts(), card = h('div', 'cset pl-card'), grid = h('div', 'pl-grid'); grid.id = 'plGrid';
    add(grid, h('span', 'pl-gh', 'Metric'), h('span', 'pl-gh', 'You'), h('span', 'pl-gh', 'Target'));
    for (const m of C.data.metrics || []) {
      if (m.id === 'study_slot_context') continue;   // too wide for a cell: shown as a line below
      const v = F[m.id], row = h('span', 'pl-gm', m.name); row.dataset.metric = m.id;
      const val = h('span', 'pl-gv num', v == null ? '–' : C.format(m.id, v)); val.dataset.metric = m.id;
      add(grid, row, val, h('span', 'pl-gt', tgt((m.targets || {})[s.stage] || (m.targets || {}).all)));
    }
    card.appendChild(grid);
    card.appendChild(h('p', 'chint', 'By kind of day, median first blunder: ' + C.format('study_slot_context', F.study_slot_context || {}) + '.'));
    const cl = h('p', 'chint'); cl.id = 'plClean';
    cl.textContent = 'Game numbers come from your last ' + F.window + ' clean games (no hints, nudges or take-backs, not Tutor): ' + F.games + ' so far. The post-mortem count takes every game: ' + F.all + '.';
    card.appendChild(cl);
    card.appendChild(h('p', 'chint', 'The research’s realistic outcome: ' + C.realism + ' Progress here is judged by these numbers, never by a number next to your name.'));
    el.appendChild(card);
  }
  // a way out to the resource when online: the two sites directly, videos through YouTube search, books through a web search
  function linkFor(text) {
    const q = text.replace(/\s*—\s*/g, ' ').replace(/\s*\(.*?\)\s*/g, ' ').trim();
    if (/lichess/i.test(text)) return 'https://lichess.org';
    if (/chessdojo/i.test(text)) return 'https://www.chessdojo.club';
    if (/youtube|speedrun|chessbrah/i.test(text)) return 'https://www.youtube.com/results?search_query=' + encodeURIComponent(q + ' chess');
    return 'https://duckduckgo.com/?q=' + encodeURIComponent(q + ' chess');
  }
  function renderRes() {
    const el = $('plRes'); el.innerHTML = '';
    const s = mine(), card = h('div', 'cset pl-card'), online = navigator.onLine !== false;
    const list = h('div'); list.id = 'plResList';
    for (const r of C.resources(s.stage)) {
      const done = !!s.resources[r.key], row = h('div', 'pl-rrow'), t = h('button', 'pl-tick' + (done ? ' on' : ''), done ? '✓' : '');
      t.dataset.res = r.key; t.setAttribute('aria-label', (done ? 'Done: ' : 'Not done: ') + r.text);
      t.onclick = () => { s.resources[r.key] = !s.resources[r.key]; persist(); render(); };
      add(row, t, h('span', null, r.text));
      if (online) { const a = document.createElement('a'); a.className = 'pl-link'; a.href = linkFor(r.text); a.target = '_blank'; a.rel = 'noopener'; a.textContent = 'Open'; row.appendChild(a); }
      else row.appendChild(h('span', 'pl-dim', 'offline'));
      list.appendChild(row);
    }
    add(card, list, h('p', 'chint', 'Tick what you have worked through. A lesson block is one of these, taken slowly in an off-day slot; the links open when the phone is online.'));
    const pf = h('div', 'pl-list');
    for (const p of C.pitfalls) pf.appendChild(add(h('div', 'pl-li one'), add(h('span'), h('b', null, p.name + '. '), p.text)));
    card.appendChild(details('pit', 'Pitfalls: the differential of common failures', pf));
    el.appendChild(card);
  }
  function render() { renderToday(); renderWeek(); renderStage(); renderMetrics(); renderRes(); }

  // ---------- showing and hiding ----------
  function hide() { $('plan').classList.remove('on'); }
  function show() {
    for (const el of document.querySelectorAll('.screen.on')) if (el.id !== 'plan') el.classList.remove('on');
    render(); $('plan').classList.add('on');
  }
  function open() {
    const s = mine();
    if (!s.startISO) { s.startISO = new Date().toISOString(); persist(); }   // week 1 starts the first time the plan is opened
    confirmAdv = false; applyLevel(); show(); $('plan').scrollTo(0, 0);
  }
  function close() { hide(); confirmAdv = false; reask = false; if (window.__hub) window.__hub.show(); }

  $('plBack').onclick = close;
  const c0 = coach();
  if (c0 && c0.on) {
    // a training game recorded today ticks the long-game block; any game may carry today's answer to the day question
    c0.on('game', (e) => {
      const s = mine();
      if (e && CTX[e.ctx] && !CTX[s.days[today()]]) { s.days[today()] = e.ctx; persist(); }
      const b = e && e.mode === 'train' ? blockOfKind('game') : null;
      if (b) tick(b.id); else if (on()) render();
    });
    c0.on('analysed', () => { if (on()) render(); });
    c0.on('pm', () => { if (on()) render(); });
    c0.on('player', () => { confirmAdv = false; reask = false; applyLevel(); if (on()) render(); });
  }
  window.addEventListener('online', () => { if (on()) render(); });
  window.addEventListener('offline', () => { if (on()) render(); });
  applyLevel();

  window.__plan = {
    open, close, show, render, tick, attest, advance, setCtx, payDebt, facts, evaluate,
    stage: () => mine().stage,
    ctxToday: () => ctxNow() || null,
    get week() { return weekIdx(); },
    get days() { return weekDays(); },
    get store() { return JSON.parse(JSON.stringify(mine())); },
    get player() { return who(); },
  };
})();
