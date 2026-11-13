// Checks every board claim in the Stage 0 lessons (basics.js) against chess.js and Stockfish.
// node tools/basics-test.js [--no-engine]      (about half a minute with the engine)
// Each step's `verify` list says what the step asserts; this file recomputes it:
//   undefended {color}            the step's answer is exactly the side's pieces (N B R Q) that no own piece or pawn protects
//   undefended-sq {sq, color}     that one piece is unprotected
//   capturable {color}            the answer is exactly the side's pieces and pawns (not the king) the other side attacks
//   checks {n}                    the side to move has n checking moves
//   attackers {sq, color, n}      n pieces of that colour attack the square directly
//   mate / stalemate {move}       the move mates / stalemates
//   threat-mate {move}            with the move handed to the other side, that move is mate
//   mated-after {move, reply}     after move, reply is mate
//   best                          the engine's first choice is one of the step's answers            (depth 18)
//   best-is {move}                the engine's first choice is that move
//   eval {move, min}              after the move the mover stands at least min centipawns up
//   worse {move, by}              the move scores at least `by` centipawns below the engine's best
//   not-worse {move, than}        move scores no worse than `than`
//   only-win / only-draw          the answers win (draw) and every other legal move draws (loses)   (depth 30, K+P endings)
// Also: every fen is legal, every answer is a legal move or an occupied square, every arrow and mark is on the board.
const path = require('path');
const ROOT = path.join(__dirname, '..');
const { Chess } = require(path.join(ROOT, 'vendor/chess.js'));
const { LESSONS } = require(path.join(ROOT, 'basics.js'));
const NO_ENGINE = process.argv.includes('--no-engine');
const F = 'abcdefgh', mv = (u) => ({ from: u.slice(0, 2), to: u.slice(2, 4), promotion: u[4] });
let pass = 0, fail = 0;
const check = (name, ok, detail) => { if (ok) pass++; else { fail++; console.log('FAIL ' + name + (detail ? '  [' + detail + ']' : '')); } };

function grid(fen) { const b = new Chess(fen).board(), g = {}; for (let r = 0; r < 8; r++) for (let f = 0; f < 8; f++) if (b[r][f]) g[F[f] + (8 - r)] = b[r][f]; return g; }
function attackers(fen, sq, color) {   // direct attackers; a slider stops at the first piece in its way
  const g = grid(fen), out = [], tf = F.indexOf(sq[0]), tr = +sq[1];
  for (const s in g) {
    const p = g[s]; if (p.color !== color || s === sq) continue;
    const f = F.indexOf(s[0]), r = +s[1], df = tf - f, dr = tr - r, af = Math.abs(df), ar = Math.abs(dr); let ok = false;
    if (p.type === 'p') ok = af === 1 && dr === (color === 'w' ? 1 : -1);
    else if (p.type === 'n') ok = (af === 1 && ar === 2) || (af === 2 && ar === 1);
    else if (p.type === 'k') ok = af <= 1 && ar <= 1;
    else if ((p.type !== 'b' && (df === 0 || dr === 0)) || (p.type !== 'r' && af === ar)) {
      ok = true; const sf = Math.sign(df), sr = Math.sign(dr); let x = f + sf, y = r + sr;
      while (x !== tf || y !== tr) { if (g[F[x] + y]) { ok = false; break; } x += sf; y += sr; }
    }
    if (ok) out.push(s);
  }
  return out.sort();
}
const flipTurn = (fen) => { const f = fen.split(' '); f[1] = f[1] === 'w' ? 'b' : 'w'; f[3] = '-'; return f.join(' '); };
const same = (a, b) => a.slice().sort().join() === b.slice().sort().join();

function uci() {
  const argv = process.argv; process.argv = argv.slice(0, 2);
  let sf; try { sf = require(path.join(ROOT, 'vendor/stockfish-19-lite-single.js')); } finally { process.argv = argv; }
  const eng = sf(); let cb = null; eng.listener = (l) => { if (cb) cb(String(l)); };
  const send = (c) => setTimeout(() => eng.processCommand(c), 0);
  const until = (pred) => new Promise((res) => { cb = (l) => { if (pred(l)) res(l); }; });
  return {
    async ready() { send('uci'); await until((l) => l === 'uciok'); },
    // every legal move with its score from the mover's side, best first; a mate is +-(100000 - moves)
    async all(fen, depth) {
      const n = new Chess(fen).moves().length; if (!n) return [];
      send('ucinewgame'); send('setoption name MultiPV value ' + n); send('isready'); await until((l) => l === 'readyok');
      const lines = {};
      const done = new Promise((res) => { cb = (l) => {
        if (l.startsWith('bestmove')) return res();
        const sc = /\bscore (cp|mate) (-?\d+)/.exec(l), k = /\bmultipv (\d+)/.exec(l), pv = /\bpv (\S+)/.exec(l); if (!sc || !pv || /bound/.test(l)) return;
        lines[k ? +k[1] : 1] = { move: pv[1].slice(0, 4), v: sc[1] === 'cp' ? +sc[2] : (+sc[2] > 0 ? 100000 - +sc[2] : -100000 - +sc[2]) };
      }; });
      send('position fen ' + fen); send('go depth ' + depth); await done;
      return Object.keys(lines).map(Number).sort((a, b) => a - b).map((k) => lines[k]);
    },
  };
}

(async () => {
  const sf = NO_ENGINE ? null : uci(); if (sf) await sf.ready();
  const ids = new Set();
  for (const l of LESSONS) {
    check(l.id + ': id unique, title, blurb, pearl, end, next', !ids.has(l.id) && l.title && l.blurb && l.pearl && l.end && l.next && ['safety', 'endgames', 'tactics'].includes(l.next.go)); ids.add(l.id);
    check(l.id + ': 3 to 7 steps, the first one a show', l.steps.length >= 3 && l.steps.length <= 7 && l.steps[0].t === 'show');
    for (let i = 0; i < l.steps.length; i++) {
      const s = l.steps[i], tag = l.id + ' step ' + (i + 1) + ' (' + s.t + ')', c = new Chess();
      const okFen = c.validate_fen(s.fen).valid && c.load(s.fen);
      check(tag + ': legal fen, ask and text', !!okFen && !!s.ask && !!s.text, s.fen);
      if (!okFen) continue;
      const g = grid(s.fen), turn = c.turn(), onBoard = (q) => /^[a-h][1-8]$/.test(q);
      check(tag + ': marks and arrows on the board', (s.marks || []).every(onBoard) && (s.arrows || []).concat(s.after || []).every((a) => onBoard(a[0]) && onBoard(a[1])));
      if (s.t !== 'show') check(tag + ': has a why', !!s.why);
      if (s.t === 'tap') check(tag + ': answers are occupied squares', s.answer.length > 0 && s.answer.every((q) => g[q]));
      if (s.t === 'pick') check(tag + ': answer indexes an option', s.options.length >= 2 && s.answer >= 0 && s.answer < s.options.length);
      if (s.t === 'move') {
        check(tag + ': answers are legal moves', s.answer.length > 0 && s.answer.every((u) => new Chess(s.fen).move(mv(u))), s.answer.join());
        for (const u in s.wrong || {}) check(tag + ': the explained wrong move ' + u + ' is legal and not an answer', !!new Chess(s.fen).move(mv(u)) && !s.answer.includes(u));
      }
      let all = null;   // the engine's verdict on every move, fetched once per step when a claim needs it
      const deep = (s.verify || []).some((v) => /^only-/.test(v.k));
      const evalAll = async () => all || (all = await sf.all(s.fen, deep ? 30 : 18));
      const score = async (u) => { const a = await evalAll(), hit = a.find((x) => x.move === u.slice(0, 4)); return hit ? hit.v : null; };
      for (const v of s.verify || []) {
        const name = tag + ': ' + v.k + (v.move ? ' ' + v.move : '') + (v.sq ? ' ' + v.sq : '');
        if (v.k === 'undefended') { const u = Object.keys(g).filter((q) => g[q].color === v.color && 'nbrq'.includes(g[q].type) && !attackers(s.fen, q, v.color).length); check(name, same(u, s.answer), 'computed ' + u.sort().join()); }
        else if (v.k === 'undefended-sq') check(name, g[v.sq] && g[v.sq].color === v.color && !attackers(s.fen, v.sq, v.color).length);
        else if (v.k === 'capturable') { const o = v.color === 'w' ? 'b' : 'w', u = Object.keys(g).filter((q) => g[q].color === v.color && g[q].type !== 'k' && attackers(s.fen, q, o).length); check(name, same(u, s.answer), 'computed ' + u.sort().join()); }
        else if (v.k === 'checks') { const n = c.moves().filter((m) => /[+#]/.test(m)).length; check(name, n === v.n && (s.t !== 'pick' || /^(None|One|Two|Three|Four)$/.test(s.options[s.answer]) && ['None', 'One', 'Two', 'Three', 'Four'].indexOf(s.options[s.answer]) === n), 'computed ' + n); }
        else if (v.k === 'attackers') { const a = attackers(s.fen, v.sq, v.color); check(name + ' ' + v.color + ' = ' + v.n, a.length === v.n, 'computed ' + a.join()); }
        else if (v.k === 'mate') { const t = new Chess(s.fen); check(name, !!t.move(mv(v.move)) && t.in_checkmate()); }
        else if (v.k === 'stalemate') { const t = new Chess(s.fen); check(name, !!t.move(mv(v.move)) && t.in_stalemate()); }
        else if (v.k === 'threat-mate') { const t = new Chess(flipTurn(s.fen)); check(name, !!t.move(mv(v.move)) && t.in_checkmate()); }
        else if (v.k === 'mated-after') { const t = new Chess(s.fen); check(name, !!t.move(mv(v.move)) && !!t.move(mv(v.reply)) && t.in_checkmate()); }
        else if (!sf) continue;
        else if (v.k === 'best') { const a = await evalAll(); check(name, s.answer.some((u) => u.slice(0, 4) === a[0].move), 'engine: ' + a.slice(0, 3).map((x) => x.move + ' ' + x.v).join(', ')); }
        else if (v.k === 'best-is') { const a = await evalAll(); check(name, a[0].move === v.move, 'engine: ' + a.slice(0, 3).map((x) => x.move + ' ' + x.v).join(', ')); }
        else if (v.k === 'eval') { const x = await score(v.move); check(name + ' >= ' + v.min, x != null && x >= v.min, 'engine: ' + x); }
        else if (v.k === 'worse') { const a = await evalAll(), x = await score(v.move); check(name + ' by ' + v.by, x != null && a[0].v - x >= v.by, 'best ' + a[0].move + ' ' + a[0].v + ', it ' + x); }
        else if (v.k === 'not-worse') { const x = await score(v.move), y = await score(v.than); check(name + ' than ' + v.than, x != null && y != null && x >= y, x + ' vs ' + y); }
        else if (v.k === 'only-win') { const a = await evalAll(), ans = s.answer.map((u) => u.slice(0, 4)); check(name, a.every((x) => ans.includes(x.move) ? x.v > 500 : Math.abs(x.v) < 80), a.map((x) => x.move + ' ' + x.v).join(', ')); }
        else if (v.k === 'only-draw') { const a = await evalAll(), ans = s.answer.map((u) => u.slice(0, 4)); check(name, a.every((x) => ans.includes(x.move) ? Math.abs(x.v) < 80 : x.v < -500), a.map((x) => x.move + ' ' + x.v).join(', ')); }
        else check(name + ': unknown claim', false);
      }
    }
  }
  console.log((fail ? 'FAIL' : 'PASS') + ' basics-test: ' + pass + ' checks passed' + (fail ? ', ' + fail + ' FAILED' : '') + ' across ' + LESSONS.length + ' lessons' + (NO_ENGINE ? ' (engine claims skipped)' : ''));
  process.exit(fail ? 1 : 0);
})();
