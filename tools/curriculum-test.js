// Unit test for curriculum.js: the data against docs/chess/chess-curriculum.json, and the pure maths over synthetic
// ledger rows (medians, percentages, windows, clean games, exit-criteria verdicts, day blocks, weeks, pearls, facts).
// Usage: node tools/curriculum-test.js   (no engine, no browser; a second or so)
'use strict';
// Week counting must survive DST, so the zone is pinned before any Date is made (node re-reads TZ when it changes).
process.env.TZ = 'America/New_York';
const assert = require('assert');
const path = require('path');
const fs = require('fs');
const vm = require('vm');
const ROOT = path.join(__dirname, '..');
const C = require(path.join(ROOT, 'curriculum.js'));
const JSON_PATH = path.join(ROOT, 'docs/chess/chess-curriculum.json');

let checks = 0, groups = 0;
const fails = [];
const eq = (a, b, m) => { checks++; assert.deepStrictEqual(a, b, m); };
const ok = (v, m) => { checks++; assert.ok(v, m); };
const near = (a, b, m) => { checks++; assert.ok(typeof a === 'number' && Math.abs(a - b) < 1e-9, (m || '') + ': ' + a + ' vs ' + b); };
function group(name, fn) {
  groups++;
  try { fn(); } catch (e) { fails.push(name + ': ' + (e && e.message ? e.message.split('\n')[0] : e)); }
}

// ---------- synthetic ledger rows (schema of the build contract), newest first ----------
let seq = 0;
const row = (o) => Object.assign({
  id: 'g' + ++seq, date: '2026-10-01T09:00:00.000Z', mode: 'train', ctx: 'morning', you: 'w', result: 'loss', elo: 1200,
  clean: true, plies: 80, myMoves: 40, acc: 70, firstBlunder: null, hung: 0, castled: 8, longestMs: 60000, meanMs: 20000,
  blunders: 0, mistakes: 1, inaccuracies: 2, endgame: false, tags: {}, pm: null,
}, o);
const rows = (n, o) => Array.from({ length: n }, (_, i) => row(typeof o === 'function' ? o(i) : o));
const pm = (hit, tag) => ({ ply: 21, tag: tag || 'hung_piece', checked: 'no', threat: 'undefended', hit });
const status = (ev) => Object.fromEntries(ev.criteria.map((c) => [c.metric, c.status]));
const crit = (ev, id) => ev.criteria.find((c) => c.metric === id);

// ---------- the data is the JSON, faithfully ----------
group('data round trip', () => {
  const src = JSON.parse(fs.readFileSync(JSON_PATH, 'utf8'));
  eq(C.data, src, 'curriculum.js data differs from docs/chess/chess-curriculum.json');
  eq(C.stages, src.stages);
  eq(C.pitfalls, src.pitfalls);
  eq(C.standingOrders, src.standing_orders);
  eq(C.grades, src.meta.evidence_grades);
  eq(C.realism, src.learner_profile_defaults.realistic_outcome);
});
group('browser load', () => {
  // no module object: the UMD branch must hang the data and the functions on self (window)
  const box = {}; box.self = box;
  vm.runInNewContext(fs.readFileSync(path.join(ROOT, 'curriculum.js'), 'utf8'), box);
  eq(JSON.stringify(box.CURRICULUM), JSON.stringify(C.data));
  ok(typeof box.Curriculum.evaluate === 'function' && typeof box.Curriculum.facts === 'function', 'window.Curriculum functions');
  eq(box.Curriculum.stage('S0').name, 'Floor: move safety');
});
group('data integrity', () => {
  const D = C.data, ids = D.stages.map((s) => s.id), GRADES = Object.keys(D.meta.evidence_grades);
  eq(ids, ['S0', 'S1', 'S2', 'S3', 'S4']);
  for (const id of ids) eq(C.stage(id).id, id);
  eq(C.stage('S9'), null);
  const pids = D.pearls.map((p) => p.id);
  eq(pids, Array.from({ length: pids.length }, (_, i) => 'P' + String(i + 1).padStart(2, '0')), 'pearl ids P01.. in order, no gaps');
  eq(pids.length, 52);
  for (const p of D.pearls) {
    ok(p.stage.length && p.stage.every((s) => ids.includes(s)), p.id + ' stage ids');
    ok(p.grade.split('/').every((g) => GRADES.includes(g)), p.id + ' grade ' + p.grade);
    ok(p.text && p.mechanism && p.action && p.source && p.theme, p.id + ' fields');
  }
  const OPS = ['>', '>=', '<', '<=', '=='], WHENS = ['off_day_morning', 'off_day', 'shift_day', 'any', 'as_needed'];
  const exitIds = new Set();
  for (const s of D.stages) {
    for (const c of s.exit_criteria) {
      exitIds.add(c.metric);
      ok(OPS.includes(c.op), s.id + ' ' + c.metric + ' op ' + c.op);
      ok(['ledger', 'puzzles', 'endgames', 'self'].includes(C.sources[c.metric]), s.id + ' exit metric without a facts mapping: ' + c.metric);
    }
    for (const b of s.weekly_blocks) {
      ok(WHENS.includes(b.when), b.id + ' when ' + b.when);
      ok(b.id.startsWith(s.id + '-'), b.id + ' prefix');
    }
  }
  for (const id of C.attested) ok(exitIds.has(id), 'self-attested id not used by any exit criterion: ' + id);
  for (const m of D.metrics) ok(C.sources[m.id], 'metrics table id without a facts mapping: ' + m.id);
  for (const so of D.standing_orders) ok(so.grade.split('/').every((g) => GRADES.includes(g)), so.id + ' grade');
  eq(C.next('S0'), 'S1'); eq(C.next('S3'), 'S4'); eq(C.next('S4'), null);
});
group('every criterion resolves from facts', () => {
  // a learner with everything recorded: no criterion may be left unknown, and no label may leak a raw value
  const full = C.facts(rows(20, () => ({ pm: pm(true), firstBlunder: 41 })), {
    puzzles: { acc30: 92, acc30Easy: 95 },
    endgames: { KQ_ms_best: 21000, KR_ms_best: 26000, KP_win: true, rook2_convert: true, mastered: 20 },
    attest: Object.fromEntries(C.attested.map((id) => [id, true])),
  });
  for (const m of C.data.metrics) ok(full[m.id] !== undefined && full[m.id] !== null, 'facts has no value for ' + m.id);
  for (const s of C.stages) {
    const ev = C.evaluate(s.id, full);
    for (const c of ev.criteria) {
      ok(full[c.metric] !== undefined && full[c.metric] !== null, 'facts has no value for ' + c.metric);
      ok(c.status === 'met', s.id + ' ' + c.metric + ' ' + c.status);
      ok(!/undefined|NaN|null/.test(c.label) && !c.label.startsWith(c.metric), 'label for ' + c.metric + ': ' + c.label);
    }
    eq(ev.met, s.exit_criteria.length > 0, s.id + ' met');
  }
  // and with nothing recorded, every criterion is unknown, never unmet
  for (const s of C.stages) for (const c of C.evaluate(s.id, C.facts([], {})).criteria) eq(c.status, 'unknown', s.id + ' ' + c.metric);
  for (const s of C.stages) for (const c of C.evaluate(s.id, {}).criteria) eq(c.status, 'unknown', s.id + ' ' + c.metric + ' (bare facts)');
});

// ---------- metrics maths ----------
group('median and means', () => {
  // null firstBlunder = no two-pawn blunder that game = counts as move 60
  eq(C.metrics(rows(5, (i) => ({ firstBlunder: [12, null, 25, 17, 30][i] }))).first_blunder_move_median, 25);
  eq(C.metrics(rows(4, (i) => ({ firstBlunder: [12, null, 25, 17][i] }))).first_blunder_move_median, 21);   // (17+25)/2
  eq(C.metrics(rows(3, () => ({ firstBlunder: null }))).first_blunder_move_median, 60);
  const none = C.metrics([]);
  eq([none.games, none.first_blunder_move_median, none.hung_pieces_per_game, none.castled_by_move_10_pct, none.review_completed_pct,
    none.pm_hit_pct, none.top_tag, none.acc_mean, none.acc_trend, none.longest_think_seconds, none.longest_think_flags],
  [0, null, null, null, null, null, null, null, null, null, 0]);
  eq(C.metrics(null).games, 0);
  eq(C.metrics(rows(4, (i) => ({ hung: [0, 1, 2, 1][i] }))).hung_pieces_per_game, 1);
  near(C.metrics(rows(3, (i) => ({ hung: [0, 0, 1][i] }))).hung_pieces_per_game, 1 / 3);
  const accs = C.metrics(rows(7, (i) => ({ acc: [80, 70, 60, 50, 40, 30, 20][i] })));
  eq(accs.acc_mean, 70); eq(accs.acc_trend, 30);              // latest three vs the three before
  eq(C.metrics(rows(3, (i) => ({ acc: [80, 70, 60][i] }))).acc_trend, null);
});
group('percentages and counts', () => {
  const m = C.metrics(rows(4, (i) => ({
    castled: [8, 10, 11, null][i], longestMs: [180000, 180001, null, 200000][i],
    pm: [pm(true), pm(false), null, pm(true)][i], tags: [{ hung: 2, mate: 1 }, { mate: 2 }, { hung: 1 }, {}][i],
  })));
  eq(m.castled_by_move_10_pct, 50);                            // 8 and 10 count, 11 and never do not
  eq(m.longest_think_flags, 2);                                // over 3 minutes, not at it
  eq(m.longest_think_seconds, 200);
  eq(m.review_completed_pct, 75); eq(m.reviewed, 3);
  near(m.pm_hit_pct, 200 / 3);
  eq(m.top_tag, { key: 'hung', n: 3 });
  // a tie goes to the tag seen in the newer game
  eq(C.metrics(rows(2, (i) => ({ tags: [{ queen: 1 }, { check: 1 }][i] }))).top_tag, { key: 'queen', n: 1 });
  const t = C.metrics(rows(4, (i) => ({ pm: [pm(true, 'missed_threat'), pm(true, 'none'), pm(true, 'hung_piece'), pm(true, 'hung_piece')][i] })));
  eq(t.top_pm_tag, { key: 'hung_piece', n: 2 });              // 'none' is not an error type
  eq(C.metrics(rows(3, () => ({ castled: 9 }))).castled_by_move_10_pct, 100);
  const ctx = C.metrics(rows(4, (i) => ({ ctx: ['morning', 'post', 'post', null][i], firstBlunder: [30, 10, 14, 20][i] }))).by_ctx;
  eq(ctx.post, { games: 2, first_blunder_move_median: 12, hung_pieces_per_game: 0 });
  eq(ctx.morning.games, 1); eq(ctx.none.first_blunder_move_median, 20); eq(ctx.shift.games, 0);
});
group('windows', () => {
  // 15 clean games, newest first: the newest 10 have no blunder, the oldest 5 blunder at move 5
  const r = rows(15, (i) => ({ firstBlunder: i < 10 ? null : 5, pm: i < 6 ? pm(true) : null }));
  const d = C.metrics(r);
  eq(d.window, 10); eq(d.games, 10); eq(d.first_blunder_move_median, 60);
  eq(d.review_completed_pct, 60);
  const w20 = C.metrics(r, { window: 20 });
  eq(w20.games, 15); eq(w20.first_blunder_move_median, 60);   // 10 x 60 and 5 x 5: middle value is 60
  eq(C.metrics(r, { window: 14 }).first_blunder_move_median, 60);
  eq(C.metrics(r, { window: 4 }).games, 4);
  const w12 = C.metrics(r, { window: 12 });
  eq(w12.first_blunder_move_median, 60);
  eq(C.metrics(r, { window: 15 }).games, 15);
  eq(C.metrics(rows(6, (i) => ({ firstBlunder: i < 3 ? null : 5 })), { window: 6 }).first_blunder_move_median, 32.5);
  eq(C.metrics(r, { window: Infinity }).games, 15);
  eq(C.metrics(r, { window: 0 }).window, 10);                  // nonsense falls back to the default
  eq(C.metrics(r, { window: -3 }).games, 10);
});
group('cleanOnly', () => {
  // newest first: assisted (blundered move 5, reviewed), clean 30, assisted 3, clean 40, then a row with no clean flag
  const r = [row({ clean: false, firstBlunder: 5, pm: pm(true) }), row({ firstBlunder: 30 }), row({ clean: false, firstBlunder: 3 }),
    row({ firstBlunder: 40 }), row({ clean: undefined, firstBlunder: 1 })];
  const m = C.metrics(r);
  eq(m.games, 2); eq(m.first_blunder_move_median, 35);
  eq(m.all, 5); eq(m.review_completed_pct, 20);               // the review counts every game, assisted or not
  const a = C.metrics(r, { cleanOnly: false });
  eq(a.games, 5); eq(a.first_blunder_move_median, 5);
  // the window is counted in clean games: 12 assisted games in front do not push the clean ones out
  const many = rows(12, { clean: false, firstBlunder: 2 }).concat(rows(10, { firstBlunder: 25 }));
  eq(C.metrics(many).games, 10); eq(C.metrics(many).first_blunder_move_median, 25);
  eq(C.metrics(many).all, 10); eq(C.metrics(many).review_completed_pct, 0);
});

// ---------- facts ----------
group('facts merging', () => {
  const r = rows(20, (i) => ({ firstBlunder: i < 10 ? 30 : 10, pm: i < 10 ? pm(i % 2 === 0, 'missed_threat') : null, ctx: i % 2 ? 'shift' : 'morning' }));
  const f = C.facts(r, {
    puzzles: { sessions: 3, acc30: 86.7, last: { n: 10 } },
    endgames: { KQ_ms_best: 24500, KR_ms_best: null, KP_win: false, rook2_convert: true, mastered: 7, total: 20 },
    attest: { opening_plan_statable: true, safety_check_seconds: false, candidate_moves_written: 'yes', hung_pieces_per_game: true },
  });
  const m = C.metrics(r);
  for (const k of Object.keys(m)) eq(f[k], m[k], 'metrics key ' + k);
  eq(Object.keys(f.windows).sort(), ['10', '20']);
  eq(f.windows['10'], m); eq(f.windows['20'], C.metrics(r, { window: 20 }));
  eq(f.annotated_long_games_pct, f.review_completed_pct);
  eq(f.review_completed_pct, 100);
  eq(f.error_tag, 'missed_threat');
  eq(f.study_slot_context, m.by_ctx);
  eq(f.slow_puzzle_accuracy_pct, 86.7);
  eq(f.slow_puzzle_accuracy_pct_easy, 86.7);                   // no easy-band figure: the (easy) set's acc30
  eq(C.facts([], { puzzles: { acc30: 80, acc30Easy: 91 } }).slow_puzzle_accuracy_pct_easy, 91);
  eq(C.facts([], { puzzles: { acc30: null } }).slow_puzzle_accuracy_pct, null);
  eq(f.mate_KQ_seconds, 24.5); eq(f.mate_KR_seconds, null);
  eq(f.KP_vs_K_win, null);                                     // not yet won = not yet shown, not a failure
  eq(f.rook_endgame_two_pawns_up_convert, true);
  eq(f.endgames_mastered_count, 7);
  eq(f.opening_plan_statable, true); eq(f.safety_check_seconds, false);
  eq(f.candidate_moves_written, null);                         // only real booleans count as an answer
  eq(f.monthly_stronger_player_review, null);
  eq(f.hung_pieces_per_game, m.hung_pieces_per_game);          // attest cannot overwrite a measured metric
  const bare = C.facts();
  eq(bare.games, 0); eq(bare.mate_KQ_seconds, null); eq(bare.safety_check_seconds, null);
  eq(C.facts(r, {}, { window: 5 }).games, 5);
  ok(C.facts(r, {}, { window: 5 }).windows['20'], 'criterion windows still computed');
});

// ---------- evaluate ----------
const S0_FB = [15, 17, 18, 19, 22, 16, 14, 40, null, 12];      // sorted 12 14 15 16 17 18 19 22 40 60: median 17.5
group('evaluate S0 mixed', () => {
  const r = rows(10, (i) => ({ firstBlunder: S0_FB[i], hung: i % 2, castled: i === 3 ? 14 : 7 }));
  const f = C.facts(r, { endgames: { KQ_ms_best: 24000, KR_ms_best: null, KP_win: true } });
  const ev = C.evaluate('S0', f);
  eq(ev.stage, 'S0'); eq(ev.met, false);
  eq(status(ev), {
    hung_pieces_per_game: 'met', first_blunder_move_median: 'unmet', safety_check_seconds: 'unknown', mate_KQ_seconds: 'met',
    mate_KR_seconds: 'unknown', KP_vs_K_win: 'met', castled_by_move_10_pct: 'met',
  });
  const fb = crit(ev, 'first_blunder_move_median');
  eq([fb.op, fb.value, fb.window_games, fb.actual, fb.games, fb.need, fb.source], ['>', 20, 10, 17.5, 10, 10, 'ledger']);
  eq(fb.label, 'Median move of first two-pawn blunder: 17.5 (target over 20, last 10 clean games)');
  eq(crit(ev, 'hung_pieces_per_game').label, 'Pieces hung per game: 0.5 (target 1 or fewer, last 10 clean games)');
  eq(crit(ev, 'castled_by_move_10_pct').label, 'Castled by move 10: 90% (target 90% or more, last 10 clean games)');
  eq(crit(ev, 'mate_KQ_seconds').label, 'Best K+Q mate: 24 s (target under 30 s)');
  eq(crit(ev, 'mate_KR_seconds').label, 'Best K+R mate: not done yet (target under 30 s)');
  eq(crit(ev, 'KP_vs_K_win').label, 'K+P vs K won with the opposition: yes');
  eq(crit(ev, 'safety_check_seconds').label, 'Safety check (their checks, captures, threats) habitual, under 20 s: not answered yet');
  eq(crit(ev, 'safety_check_seconds').source, 'self');
  // the same games with the gaps filled: one more criterion each way
  const f2 = Object.assign({}, f, { safety_check_seconds: false, mate_KR_seconds: 31 });
  eq(status(C.evaluate('S0', f2)).safety_check_seconds, 'unmet');
  eq(status(C.evaluate('S0', f2)).mate_KR_seconds, 'unmet');
  eq(crit(C.evaluate('S0', f2), 'safety_check_seconds').label, 'Safety check (their checks, captures, threats) habitual, under 20 s: not yet (you said so)');
  // a learner who has it all: met
  const good = rows(10, (i) => ({ firstBlunder: [25, null, 22, 30, 21, 40, null, 19, 24, 33][i], hung: i < 8 ? 1 : 0, castled: i === 0 ? null : 9 }));
  const ev3 = C.evaluate('S0', C.facts(good, {
    endgames: { KQ_ms_best: 18000, KR_ms_best: 29900, KP_win: true }, attest: { safety_check_seconds: true },
  }));
  eq(ev3.met, true, JSON.stringify(status(ev3)));
  eq(crit(ev3, 'first_blunder_move_median').actual, 27.5);
  eq(crit(ev3, 'hung_pieces_per_game').actual, 0.8);
  eq(crit(ev3, 'mate_KR_seconds').label, 'Best K+R mate: 29.9 s (target under 30 s)');
});
group('evaluate thresholds', () => {
  // exactly on a '<=' / '>=' line passes, exactly on a '>' / '<' line does not
  const s = (st, f) => status(C.evaluate(st, f));
  eq(s('S0', { hung_pieces_per_game: 1 }).hung_pieces_per_game, 'met');
  eq(s('S0', { hung_pieces_per_game: 1.05 }).hung_pieces_per_game, 'unmet');
  eq(s('S0', { first_blunder_move_median: 20 }).first_blunder_move_median, 'unmet');
  eq(s('S0', { first_blunder_move_median: 20.5 }).first_blunder_move_median, 'met');
  eq(s('S0', { mate_KQ_seconds: 30 }).mate_KQ_seconds, 'unmet');
  eq(s('S0', { castled_by_move_10_pct: 90 }).castled_by_move_10_pct, 'met');
  eq(s('S0', { castled_by_move_10_pct: 89.99 }).castled_by_move_10_pct, 'unmet');
  eq(s('S0', { safety_check_seconds: true }).safety_check_seconds, 'met');   // attested: "under 20 s, habitual"
  eq(s('S0', { KP_vs_K_win: false }).KP_vs_K_win, 'unmet');
  eq(s('S0', { KP_vs_K_win: 'yes' }).KP_vs_K_win, 'unknown');
  eq(s('S1', { slow_puzzle_accuracy_pct: 85 }).slow_puzzle_accuracy_pct, 'met');
  eq(s('S1', { slow_puzzle_accuracy_pct: 84.9 }).slow_puzzle_accuracy_pct, 'unmet');
  eq(s('S1', { slow_puzzle_accuracy_pct: null }).slow_puzzle_accuracy_pct, 'unknown');
  eq(s('S1', { opening_plan_statable: true }).opening_plan_statable, 'met');
  eq(crit(C.evaluate('S1', {}), 'opening_plan_statable').note, 'One opening per colour, plan to move 8–10 in one sentence');
  eq(s('S2', { endgames_mastered_count: 20 }).endgames_mastered_count, 'met');
  eq(s('S2', { endgames_mastered_count: 19 }).endgames_mastered_count, 'unmet');
  eq(crit(C.evaluate('S1', { slow_puzzle_accuracy_pct: 86.7 }), 'slow_puzzle_accuracy_pct').label,
    'Slow puzzle accuracy: 86.7% (target 85% or more, last 30 puzzles)');
  eq(crit(C.evaluate('S2', { endgames_mastered_count: 12 }), 'endgames_mastered_count').label, 'Endgames mastered: 12 (target 20 or more)');
});
group('evaluate windows and sample size', () => {
  // S1 judges the first blunder over 20 games: newest 10 at move 30, older 10 at move 10 -> median 20 over 20, 30 over 10
  const r = rows(20, (i) => ({ firstBlunder: i < 10 ? 30 : 10 }));
  const f = C.facts(r, {});
  eq(f.first_blunder_move_median, 30);
  const s1 = crit(C.evaluate('S1', f), 'first_blunder_move_median');
  eq([s1.actual, s1.status, s1.need], [20, 'unmet', 20]);
  eq(s1.label, 'Median move of first two-pawn blunder: 20 (target over 25, last 20 clean games)');
  eq(status(C.evaluate('S0', f)).first_blunder_move_median, 'met');
  // four perfect games are not ten: no verdict yet, and the label says how far along
  const few = C.evaluate('S0', C.facts(rows(4, { firstBlunder: null, hung: 0, castled: 5 }), {}));
  eq(status(few).hung_pieces_per_game, 'unknown');
  eq(status(few).castled_by_move_10_pct, 'unknown');
  eq(crit(few, 'first_blunder_move_median').label, 'Median move of first two-pawn blunder: 60 (target over 20, 4 of 10 clean games so far)');
  eq(crit(C.evaluate('S0', C.facts([], {})), 'hung_pieces_per_game').label, 'Pieces hung per game: no clean games yet (target 1 or fewer, last 10 clean games)');
  // S2: every game in the window needs its post-mortem, assisted games included
  const reviewed = (k) => C.facts(rows(10, (i) => ({ clean: i % 3 !== 0, pm: i < k ? pm(true) : null })), {});
  eq(status(C.evaluate('S2', reviewed(10))).annotated_long_games_pct, 'met');
  eq(status(C.evaluate('S2', reviewed(9))).annotated_long_games_pct, 'unmet');
  eq(crit(C.evaluate('S2', reviewed(9)), 'annotated_long_games_pct').label, 'Games with a written post-mortem: 90% (target 100%, last 10 games)');
  // other stages and nonsense
  eq(C.evaluate('S4', f), { stage: 'S4', met: false, criteria: [] });
  eq(C.evaluate('S7', f), null);
  eq(C.evaluate('S3', {}).criteria.map((c) => c.source), ['self', 'self', 'self', 'self']);
  eq(C.evaluate('S3', Object.fromEntries(C.attested.map((id) => [id, true]))).met, true);
});

// ---------- the week ----------
group('blocksFor', () => {
  const ids = (st, ctx) => C.blocksFor(st, ctx).map((b) => b.id);
  eq(ids('S0', 'morning'), ['S0-B1', 'S0-B2', 'S0-B4']);
  eq(ids('S0', 'shift'), ['S0-B3', 'S0-B4']);
  eq(ids('S0', null), ['S0-B1', 'S0-B2', 'S0-B3', 'S0-B4']);
  eq(ids('S0', 'nonsense'), ['S0-B1', 'S0-B2', 'S0-B3', 'S0-B4']);
  ok(C.blocksFor('S0', null).every((b) => b.today === true));
  const post = C.blocksFor('S0', 'post');
  eq(post.map((b) => [b.id, b.today]), [['S0-B1', false], ['S0-B2', false], ['S0-B3', true], ['S0-B4', false]]);
  ok(post.filter((b) => !b.today).every((b) => b.why === 'Not today: easy repetition only.' && /sleep deprivation/.test(b.research) && /grade A/.test(b.research)));
  eq(post[2].why, null);
  eq(ids('S2', 'morning'), ['S2-B1', 'S2-B3']);                 // opening repair is as-needed, never scheduled
  eq(ids('S3', 'shift'), ['S3-B2', 'S3-B4', 'S3-B5']);
  ok(C.blocksFor('S3', 'post').every((b) => !b.today), 'S3 has no shift-day block');
  eq(C.blocksFor('S4', 'morning'), []); eq(C.blocksFor('S9', null), []);
  eq(post[0].name, 'Long game + review'); eq(post[0].duration_min, 85);
  ok(!('today' in C.stage('S0').weekly_blocks[0]), 'blocksFor must not write into the data');
});
group('weekIndex across DST', () => {
  // the zone took: midnight EDT is hour 0 locally
  eq(new Date('2026-03-09T00:00:00-04:00').getHours(), 0);
  const naive = (a, b) => Math.floor((new Date(b) - new Date(a)) / (7 * 864e5));
  // spring forward, 8 March 2026: the week is an hour short, a millisecond count would still say week 0
  eq(naive('2026-03-02T00:00:00-05:00', '2026-03-09T00:00:00-04:00'), 0);
  eq(C.weekIndex('2026-03-02T00:00:00-05:00', '2026-03-09T00:00:00-04:00'), 1);
  eq(C.weekIndex('2026-03-02T09:00:00-05:00', '2026-03-09T08:30:00-04:00'), 1);
  eq(C.weekIndex('2026-03-02T09:00:00-05:00', '2026-03-08T23:59:00-04:00'), 0);
  // fall back, 1 November 2026: a 25-hour day
  eq(naive('2026-10-26T23:30:00-04:00', '2026-11-02T00:10:00-05:00'), 0);
  eq(C.weekIndex('2026-10-26T23:30:00-04:00', '2026-11-02T00:10:00-05:00'), 1);
  eq(C.weekIndex('2026-10-26T23:30:00-04:00', '2026-11-01T23:30:00-05:00'), 0);
  // the same instants stored as UTC ISO strings, the way toISOString() saves them
  eq(C.weekIndex('2026-03-02T05:00:00.000Z', '2026-03-09T04:00:00.000Z'), 1);
  // date-only keys are calendar dates
  eq(C.weekIndex('2026-03-02', '2026-03-08'), 0);
  eq(C.weekIndex('2026-03-02', '2026-03-09'), 1);
  eq(C.weekIndex('2026-03-02', '2026-03-16'), 2);
  eq(C.weekIndex('2026-01-05', '2026-12-28'), 51);
  eq(C.weekIndex('2026-03-09', '2026-03-02'), 0);              // before the start: week 0, never negative
  eq(C.weekIndex('garbage', '2026-03-02'), 0); eq(C.weekIndex(null, '2026-03-02'), 0);
  eq(C.weekIndex(new Date(2026, 2, 2, 12), new Date(2026, 2, 23, 1)), 3);
  ok(C.weekIndex('2026-01-01') >= 0, 'now by default');
  // and in Rome (DST 29 March 2026)
  process.env.TZ = 'Europe/Rome';
  eq(new Date('2026-03-30T00:15:00+02:00').getHours(), 0);
  eq(naive('2026-03-23T00:30:00+01:00', '2026-03-30T00:15:00+02:00'), 0);
  eq(C.weekIndex('2026-03-23T00:30:00+01:00', '2026-03-30T00:15:00+02:00'), 1);
  process.env.TZ = 'America/New_York';
});
group('microStep', () => {
  const t = (st, w) => { const m = C.microStep(st, w); return m && [m.week, m.repeat]; };
  eq(C.microStep('S0', 0).task, C.stage('S0').micro_steps[0].task);
  eq(t('S0', 0), [1, false]); eq(t('S0', 7), [8, false]);
  // past week 8: "If unmet, repeat weeks 5–8"
  eq([8, 9, 10, 11, 12, 13].map((w) => t('S0', w)), [[5, true], [6, true], [7, true], [8, true], [5, true], [6, true]]);
  eq(t('S0', -2), [1, false]); eq(t('S0', 'x'), [1, false]);
  const s1 = C.stage('S1').micro_steps;
  eq([0, 1, 2, 3, 4].map((w) => C.microStep('S1', w).task), [s1[0].task, s1[1].task, s1[2].task, s1[0].task, s1[1].task]);
  eq(C.microStep('S4', 9).task, 'Get a coach; make the plan yours.');
  eq(C.microStep('S9', 0), null);
  ok(!('repeat' in C.stage('S0').micro_steps[0]), 'microStep must not write into the data');
});

// ---------- pearls ----------
group('pearls', () => {
  eq(C.pearls().length, 52);
  eq(C.pearls({}).map((p) => p.id), C.data.pearls.map((p) => p.id));
  const want = C.data.pearls.filter((p) => p.stage.includes('S2') && p.theme === 'opening').map((p) => p.id);
  eq(C.pearls({ stage: 'S2', theme: 'opening' }).map((p) => p.id), want);
  eq(want, ['P19', 'P28', 'P29']);
  eq(C.pearls('S4').map((p) => p.id), C.pearls({ stage: 'S4' }).map((p) => p.id));
  ok(C.pearls({ theme: 'safety' }).every((p) => p.theme === 'safety'));
  eq(C.pearls({ stage: 'S9' }), []);
  eq(C.pearl('P10').source, 'Anderson & Kleinberg'); eq(C.pearl('P99'), null);
});
group('pearlOfWeek', () => {
  for (const st of ['S0', 'S1', 'S2', 'S3', 'S4']) {
    const pool = C.pearls({ stage: st }).map((p) => p.id), n = pool.length, seen = [];
    for (let w = 0; w < n; w++) {
      const p = C.pearlOfWeek(st, w);
      eq(p, C.pearlOfWeek(st, w), 'deterministic');
      ok(p.stage.includes(st), st + ' week ' + w + ' got ' + p.id);
      seen.push(p.id);
    }
    eq(seen.slice().sort(), pool, st + ': every pearl once per cycle');
    eq(C.pearlOfWeek(st, n).id, C.pearlOfWeek(st, 0).id, st + ': cycle repeats');
    eq(C.pearlOfWeek(st, 0).id, pool[0]);
    if (n > 2) ok(seen[1] !== pool[1], st + ': neighbours are not shown back to back');
  }
  eq(C.pearlOfWeek('S0', 0).id, 'P01');
  eq(C.pearlOfWeek('S0', -1).id, 'P01');
  eq(C.pearlOfWeek('S9', 0), null);
});

// ---------- the rest ----------
group('resources, format', () => {
  eq(C.resources('S0').map((r) => r.key), ['S0:0', 'S0:1', 'S0:2', 'S0:3']);
  eq(C.resources('S0')[0].text, 'Bartholomew — Chess Fundamentals (YouTube)');
  eq(C.resources('S9'), []);
  eq(C.format('castled_by_move_10_pct', 89.99), '89.9%');
  eq(C.format('castled_by_move_10_pct', 90), '90%');
  eq(C.format('mate_KQ_seconds', 220), '3 min 40 s');
  eq(C.format('mate_KQ_seconds', 24.5), '24.5 s');
  eq(C.format('hung_pieces_per_game', 0.45), '0.45');
  eq(C.format('hung_pieces_per_game', 1 / 3), '0.33');
  eq(C.format('error_tag', 'hung_piece'), 'Hung piece');
  eq(C.format('KP_vs_K_win', true), 'yes');
  eq(C.format('hung_pieces_per_game', null), '');
  eq(C.format('study_slot_context', C.metrics(rows(3, (i) => ({ ctx: ['post', 'post', 'morning'][i], firstBlunder: [10, 14, 30][i] }))).by_ctx),
    'Off-day morning 30 (1 game), After a shift 12 (2 games)');
});

if (fails.length) {
  for (const f of fails) console.log('FAIL ' + f);
  console.log('curriculum-test: ' + fails.length + ' group(s) failed, ' + checks + ' checks run');
  process.exit(1);
}
console.log('PASS curriculum-test: ' + checks + ' checks in ' + groups + ' groups (data, metrics, facts, evaluate, week, pearls)');
