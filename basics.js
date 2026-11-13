// Ghostlap Roma: the STAGE 0 lessons, "Move safety". Six short lessons you do rather than read: each is a handful of steps on a
// board (look, tap squares, play a move, pick an answer), about five minutes, no engine needed on the phone. They are the plan's
// Stage 0 lesson block in the app itself: undefended pieces, the safety check, counting a capture, trading when ahead, the two
// basic mates and the opposition. The opening lessons (lessons.js) step through a line; these ask a question at every step.
// Every board claim here is checked by `node tools/basics-test.js`: the tap answers are recomputed from the position, and the
// moves and verdicts are put to Stockfish. Change a position and run it.
// Builds its own <section> and <style> (prefix .bs-). Needs window.__coach (renderBoard, player) and window.Chess.
// window.__basics: list(), open(id, opts), close(), done(id), plus test hooks tap(sq), check(), pick(i), move(from, to), next(), state.
(function () {
  'use strict';
  // Step kinds: show (read, Next) · tap (toggle squares, Check) · move (play it) · pick (choose a line of text).
  // you: whose side is at the bottom. verify: what tools/basics-test.js checks (see the test for the vocabulary).
  const LESSONS = [
    {
      id: 'loose', title: 'Undefended pieces', mins: 5, blurb: 'A piece nothing protects is a result waiting to happen. Learn to see them.',
      pearl: 'Undefended pieces are pending results: check them every move.',
      steps: [
        { t: 'show', fen: 'r1bqk1nr/pppp1ppp/2n5/2b1p3/2B1P3/5N2/PPPP1PPP/RNBQK2R w KQkq - 4 4', marks: ['c4', 'c5'],
          ask: 'Loose pieces drop off',
          text: 'Move 4 of an ordinary game. Both bishops are undefended: no piece or pawn of their own side protects them. Nothing is wrong yet. But almost every tactic at your level is a double attack, and a double attack needs a target that cannot be defended in time. Undefended pieces are those targets. Strong players keep a running list of them, for both sides, on every move.' },
        { t: 'tap', fen: 'r1b4r/p1kp3p/2p2p2/2B5/2P2n2/8/P1B2PPP/R4RK1 w - - 3 21', you: 'w', answer: ['c2', 'c5'], verify: [{ k: 'undefended', color: 'w' }],
          ask: 'Tap White\'s undefended pieces',
          text: 'You are White. Tap every White piece that nothing protects (knights, bishops, rooks, queen; leave the pawns and the king). Then Check.',
          why: 'Both bishops. The rooks protect each other along the back rank; nothing touches c2 or c5. Two loose pieces is two chances for one enemy move to hit both.' },
        { t: 'tap', fen: 'r1b4r/p1kp3p/2p2p2/2B5/2P2n2/8/P1B2PPP/R4RK1 w - - 3 21', you: 'w', answer: ['a8', 'f4', 'h8'], verify: [{ k: 'undefended', color: 'b' }],
          ask: 'Now Black\'s',
          text: 'Same position. Tap every Black piece that nothing protects. Their loose pieces are your targets.',
          why: 'The knight on f4 and both rooks: the bishop on c8 stands between the rooks, so they do not protect each other. Three targets. This is the list you want in your head before you look for a move.' },
        { t: 'move', fen: '4r1k1/p5b1/1p2rp2/3p2pp/3Pn3/2P4P/PP1N1PPB/R3R1K1 b - - 1 25', you: 'b', answer: ['e4d2'], verify: [{ k: 'best' }, { k: 'undefended-sq', sq: 'd2', color: 'w' }],
          ask: 'Take what is loose',
          text: 'You are Black. White has just put a knight on d2. Run the list: which White piece is undefended? Play the move.',
          why: 'Nxd2. Nothing protected the knight, so it is simply gone: a free piece. Do take free pieces; just look once to see that they are free.',
          bad: 'Look for the White piece that nothing protects, and take it.' },
        { t: 'move', fen: '2k4r/Q1p3p1/p1prpp1p/8/5P2/2P3P1/P1P4P/2K5 w - - 2 27', you: 'w', answer: ['a7a8'], verify: [{ k: 'best' }, { k: 'undefended-sq', sq: 'h8', color: 'b' }],
          ask: 'One move, two targets',
          text: 'You are White. The rook on h8 is undefended, but you cannot take it yet. Find the move that attacks the king and the rook at once.',
          why: 'Qa8+. The king must move, and then Qxh8 takes the rook. A check that also hits a loose piece: this is the pattern behind most games decided below 1400.',
          bad: 'A check the king must answer, on a square that also looks at h8.' },
      ],
      end: 'From now on, before you look for a move: whose pieces are loose? Yours first.',
      next: { label: 'Tactics', go: 'tactics' },
    },
    {
      id: 'cct', title: 'Checks, captures, threats', mins: 5, blurb: 'The safety check: three questions about their reply, before you let go of the piece.',
      pearl: 'Hope chess is a hung piece with a story attached.',
      steps: [
        { t: 'show', fen: '5k1r/p1R3pp/2p5/5p2/2P5/5n2/PP3PKP/8 b - - 1 28', you: 'b', arrows: [['f3', 'e5']],
          ask: 'Three questions, in this order',
          text: 'Hope chess is playing a move and hoping. The cure is a routine. You have chosen a move; before you play it, picture it on the board and ask what they can do: 1. Their checks. 2. Their captures. 3. Their threats. In that order, because that is the order of how forcing they are. You are Black here, your knight is attacked, and you like the look of Ne5. On the next card Ne5 is on the board. Run the routine.' },
        { t: 'pick', fen: '5k1r/p1R3pp/2p5/4np2/2P5/8/PP3PKP/8 w - - 2 29', you: 'b', options: ['None', 'One', 'Two', 'Three'], answer: 2, verify: [{ k: 'checks', n: 2 }, { k: 'eval', move: 'c7c8', min: 300 }],
          ask: 'Their checks: how many?', after: [['c7', 'c8', 'red']],
          text: 'You are Black and Ne5 is on the board. Question 1: how many different checks does White have?',
          why: 'Two: Rc8+ and Rf7+. Now look at each. Rf7+ just loses the rook to the knight. But Rc8+ makes the king step aside, and then Rxh8 takes your rook. Ne5 loses a rook, and question 1 found it in ten seconds.' },
        { t: 'tap', fen: '3br3/1p3pkp/pnr3p1/n1B5/P3P1N1/2P2P2/4B1PP/1R1R2K1 b - - 0 26', you: 'w', answer: ['a4', 'c5', 'e4'], verify: [{ k: 'capturable', color: 'w' }, { k: 'eval', move: 'c6c5', min: 200 }],
          ask: 'Their captures: tap what they can take', after: [['c6', 'c5', 'red']],
          text: 'You are White and you have just played Bxc5, taking a knight. Question 2: tap every White piece or pawn that Black can capture on the next move.',
          why: 'Three captures to look at. Rxe4 takes a pawn that f3 protects. Nxa4 takes a pawn. Rxc5 takes the bishop, and nothing protects it: you took a knight and gave back a bishop. Every capture gets looked at, biggest first.' },
        { t: 'pick', fen: 'r4rk1/pp2bppp/2pqp3/8/6n1/2NP4/PPP1BPPP/R2Q1RK1 w - - 0 1', you: 'w', options: ['Qxh2, checkmate', 'Nxf2, winning a pawn', 'Nothing. It is a wasted move'], answer: 0, verify: [{ k: 'threat-mate', move: 'd6h2' }],
          ask: 'Their threats: what does ...Ng4 want?', after: [['d6', 'h2', 'red']],
          text: 'You are White. Black has just played ...Ng4. No check, no capture. Question 3 is for their last move too: if you did nothing, what would they play next?',
          why: 'Qxh2 mate. The queen looks down the diagonal at h2 and the knight now protects that square, so the king could not take. A quiet move with a loud idea: "what does that move want?" is how you hear it.' },
        { t: 'move', fen: 'r4rk1/pp2bppp/2pqp3/8/6n1/2NP4/PPP1BPPP/R2Q1RK1 w - - 0 1', you: 'w', answer: ['e2g4'], verify: [{ k: 'best' }, { k: 'eval', move: 'e2g4', min: 200 }, { k: 'mated-after', move: 'h2h3', reply: 'd6h2' }, { k: 'eval', move: 'g2g3', min: -100 }],
          ask: 'Stop the mate',
          text: 'Same position. There are three ways to meet a threat: take the attacker, block the line, or defend the square. One of them wins a piece here. Play it.',
          why: 'Bxg4. The knight was the piece holding the mate together, and it was undefended. Taking the attacker is the first thing to look for. (g3 blocks the diagonal and also holds, but wins nothing.)',
          wrong: { h2h3: 'h3 attacks the knight but does not stop Qh2 mate: the knight still protects h2.' },
          bad: 'Which of their two attackers can you simply take?' },
      ],
      end: 'Their checks, their captures, their threats, before every move. Slow at first; the plan wants it under 20 seconds, and Safe or not is the drill for exactly that.',
      next: { label: 'Safe or not', go: 'safety' },
    },
    {
      id: 'count', title: 'Count before you capture', mins: 5, blurb: 'Attackers against defenders, and what is left on the board afterwards.',
      pearl: 'Count before you capture.',
      steps: [
        { t: 'show', fen: '5rk1/pp3pp1/2n4p/4p3/8/5N1P/PP3PP1/4R1K1 w - - 0 1', you: 'w', marks: ['e5'], arrows: [['f3', 'e5'], ['e1', 'e5'], ['c6', 'e5', 'red']],
          ask: 'A capture is a sum',
          text: 'Whether you can take something is arithmetic, not courage. Count your pieces that attack the square, count their pieces that defend it. With more attackers than defenders you usually win it; with the same number or fewer you usually lose something. Then one more look: what is left when the taking stops. Here the pawn on e5 is attacked twice (knight, rook) and defended once (knight).' },
        { t: 'move', fen: '5rk1/pp3pp1/2n4p/4p3/8/5N1P/PP3PP1/4R1K1 w - - 0 1', you: 'w', answer: ['f3e5'], verify: [{ k: 'attackers', sq: 'e5', color: 'w', n: 2 }, { k: 'attackers', sq: 'e5', color: 'b', n: 1 }, { k: 'best' }, { k: 'worse', move: 'e1e5', by: 150 }],
          ask: 'Two against one: take it',
          text: 'You are White. Two attackers, one defender. Take the pawn, and think about which piece goes first.',
          why: 'Nxe5 Nxe5 Rxe5: knight for knight, and a pawn in your pocket. The cheapest piece goes first. Lead with the rook instead and it is rook for knight and pawn: the count was right and the order lost material.',
          wrong: { e1e5: 'The count is right but the order is wrong: Rxe5 Nxe5 Nxe5 gives a rook for a knight and a pawn. Cheapest piece first.' },
          bad: 'Take on e5, cheapest piece first.' },
        { t: 'pick', fen: '5rk1/pp3pp1/2nb3p/4p3/8/1B3N1P/PP3PP1/4R1K1 w - - 0 1', you: 'w', options: ['Yes: take with the knight', 'Yes: take with the rook', 'No: it is defended as often as it is attacked'], answer: 2,
          verify: [{ k: 'attackers', sq: 'e5', color: 'w', n: 2 }, { k: 'attackers', sq: 'e5', color: 'b', n: 2 }, { k: 'worse', move: 'f3e5', by: 150 }, { k: 'worse', move: 'e1e5', by: 150 }],
          ask: 'Now can you take on e5?',
          text: 'You are White. One thing has changed: Black has a bishop on d6. Count again.',
          why: 'Two attackers, two defenders. Nxe5 Nxe5 Rxe5 Bxe5 and you have given a knight and a rook for a knight and a pawn. Equal numbers means the defender takes last. Leave it.' },
        { t: 'move', fen: '5rk1/pp3pp1/2nb3p/4p3/8/5N1P/PBP2PP1/4R1K1 w - - 0 1', you: 'w', answer: ['f3e5'], verify: [{ k: 'attackers', sq: 'e5', color: 'w', n: 3 }, { k: 'attackers', sq: 'e5', color: 'b', n: 2 }, { k: 'best' }, { k: 'worse', move: 'e1e5', by: 150 }, { k: 'worse', move: 'b2e5', by: 150 }],
          ask: 'Three against two',
          text: 'You are White. Your bishop now sits on b2, looking down the long diagonal. Count both sides, then decide.',
          why: 'Three attackers (knight, bishop, rook), two defenders. Nxe5 Nxe5 Bxe5 Bxe5 Rxe5: two minor pieces each, and the pawn is yours. The rook goes last because it is worth the most; if it ever had to be taken, you would want it to be the last capture of the lot.',
          wrong: { e1e5: 'Right count, wrong order. The rook is your most valuable attacker: it goes last.', b2e5: 'Bishop first is two pawns worse by the engine. Lead with the knight, and keep the bishop bearing on e5 from a distance.' },
          bad: 'Count: three attackers, two defenders. Cheapest first.' },
      ],
      end: 'Before any capture: how many of mine, how many of theirs, cheapest first, and what is left when it stops.',
      next: { label: 'Tactics', go: 'tactics' },
    },
    {
      id: 'trade', title: 'Ahead? Trade pieces', mins: 4, blurb: 'Capablanca\'s rule for winning a won game: pieces off, pawns on.',
      pearl: 'Ahead? Trade pieces, not pawns. Behind? Keep pieces on.',
      steps: [
        { t: 'show', fen: '6k1/2p2pp1/3q1n1p/8/3Q4/5N1P/5PP1/3R2K1 w - - 0 1', you: 'w', marks: ['d1'],
          ask: 'A rook up is not yet a win',
          text: 'White is a rook up. That wins, but only if nothing goes wrong, and the pieces that can make things go wrong are Black\'s: the queen above all. Every pair of pieces you trade leaves your extra rook a bigger share of what is on the board, and takes away a piece that could have forked, pinned or mated you. Trade pieces, not pawns: you will need your pawns to make a new queen.' },
        { t: 'pick', fen: '6k1/2p2pp1/3q1n1p/8/3Q4/5N1P/5PP1/3R2K1 w - - 0 1', you: 'w', options: ['Qxd6: trade the queens', 'Qh4: keep the queens and go for the king'], answer: 0, verify: [{ k: 'best-is', move: 'd4d6' }, { k: 'eval', move: 'd4d6', min: 400 }],
          ask: 'You are a rook up. Which?', after: [['d4', 'd6']],
          text: 'You are White, a rook ahead. The queens face each other.',
          why: 'Qxd6. After cxd6 Rxd6 you are a rook up with no queens on the board: nothing left that can hurt you, and a pawn won as well. Attacking is for when you need to win material. You already have it.' },
        { t: 'pick', fen: '6k1/5pp1/3q3p/8/3Q4/5N1P/5PP1/6K1 b - - 0 1', you: 'b', options: ['Qxd4: trade the queens', 'Qc6: keep the queens on'], answer: 1, verify: [{ k: 'not-worse', move: 'd6c6', than: 'd6d4' }],
          ask: 'You are a knight down. Which?',
          text: 'You are Black, a knight behind, and White offers the queens. The rule runs backwards for the side that is losing.',
          why: 'Keep them on. A knight down with queens, White can still walk into a check, a fork or a perpetual. A knight down without queens is a lesson in technique, with you as the example. When you are behind, your pieces are your chances.' },
      ],
      end: 'Ahead: trade pieces, keep pawns, head for the endgame. Behind: keep pieces on and make them work.',
      next: { label: 'Endgames', go: 'endgames' },
    },
    {
      id: 'mates', title: 'The two basic mates', mins: 5, blurb: 'King and queen, king and rook: the box, the edge, and the one trap.',
      pearl: 'An extra queen or rook is only a win if you can deliver the mate.',
      steps: [
        { t: 'show', fen: '8/8/8/4k3/8/8/2Q5/K7 w - - 0 1', you: 'w', marks: ['d3'], arrows: [['c2', 'd3']],
          ask: 'King and queen: the box',
          text: 'A lone king cannot be mated in the middle of the board; it has to be driven to an edge. With the queen, do it without checks: put her a knight\'s move away from their king. From there she fences it into a box, and each time it moves she follows at the same knight\'s distance, so the box shrinks. Here Qd3 is a knight\'s move from the king on e5. When the king is on the edge, stop moving the queen and bring your king.' },
        { t: 'move', fen: 'k7/8/1K6/8/8/8/8/2Q5 w - - 0 1', you: 'w', mate: true, answer: ['c1c8'], verify: [{ k: 'mate', move: 'c1c8' }, { k: 'stalemate', move: 'c1c7' }],
          ask: 'Mate in one',
          text: 'You are White. Their king is in the corner and yours has arrived. Finish it. Careful: one natural-looking queen move here throws the win away.',
          why: 'Qc8 mate (Qc7 looks tighter and is stalemate: the king is not in check and has no move, so the game is drawn). The trap in this ending is always the same: before every queen move, check that their king still has a square, until you are giving mate.',
          wrong: { c1c7: 'Stalemate. Their king is not in check and has no legal move: a draw, with a queen extra. Always leave a square until the move is mate.' },
          bad: 'A check on the back rank, with your king covering a7 and b7.' },
        { t: 'show', fen: '8/8/8/8/3k4/8/8/R3K3 w - - 0 1', you: 'w', marks: ['a3'], arrows: [['a1', 'a3']],
          ask: 'King and rook: the fence and the face-off',
          text: 'The rook cannot do it alone, so the king does half the work. The rook draws a line their king cannot cross (Ra3 here shuts it into the top five ranks). Your king walks up to face theirs. When the two kings stand directly opposite each other with one square between, the rook checks along the line and their king has to step back a rank. Repeat until the edge. If the kings are not opposite, make a waiting move with the rook along its line.' },
        { t: 'move', fen: 'k7/7R/2K5/8/8/8/8/8 w - - 0 1', you: 'w', answer: ['c6b6'], verify: [{ k: 'best-is', move: 'c6b6' }],
          ask: 'Set up the face-off',
          text: 'You are White. Their king is on the edge, the rook holds the seventh rank. A check now lets the king out; make the move that forces mate next turn.',
          why: 'Kb6. Their only move is Kb8, straight into the face-off, and then Rh8 is mate. In this ending the king moves are the hard ones; the rook just holds the line.',
          wrong: { h7h8: 'A check too early: Ka7 and the king is out of the corner. Bring your king first.' },
          bad: 'A king move. Leave them one square, the one opposite your king.' },
        { t: 'move', fen: '1k6/8/1K6/8/8/8/8/7R w - - 0 1', you: 'w', mate: true, answer: ['h1h8'], verify: [{ k: 'mate', move: 'h1h8' }],
          ask: 'Kings opposite: mate',
          text: 'You are White. The kings face each other. Play the mate.',
          why: 'Rh8 mate. Your king takes away a7, b7 and c7; the rook takes the back rank. That picture, kings opposite and rook on the edge, is the whole ending.',
          bad: 'The rook, to the rank their king is on.' },
      ],
      end: 'The plan wants both mates in under 30 seconds against the engine. Knowing is not the same as doing it on a clock: go and drill them.',
      next: { label: 'Endgames', go: 'endgames' },
    },
    {
      id: 'opposition', title: 'The opposition', mins: 5, blurb: 'King and pawn against king: who has to give way decides win or draw.',
      pearl: 'In king and pawn endings the king goes first, the pawn follows.',
      steps: [
        { t: 'show', fen: '8/8/4k3/8/4K3/4P3/8/8 b - - 0 1', you: 'w', marks: ['e5'],
          ask: 'Whoever must move, loses ground',
          text: 'The kings stand opposite each other with one square between. Neither can step forward. Whoever has to move must step aside and let the other king past: the side that does NOT have to move "has the opposition". Here it is Black to move, so White has it: Black steps aside, White\'s king goes forward on the other side, and the pawn follows it home. The same position with White to move is a draw.' },
        { t: 'move', fen: '8/4k3/8/3K4/8/4P3/8/8 w - - 0 1', you: 'w', answer: ['d5e5'], verify: [{ k: 'only-win' }],
          ask: 'Take the opposition',
          text: 'You are White. Exactly one move wins; every other move draws. Put your king opposite theirs, so that they are the one who must move.',
          why: 'Ke5. Kings opposite, Black to move: Black must step aside and your king advances on the other side. Pushing the pawn instead is the classic mistake: the pawn needs the king in front of it, clearing the way.',
          wrong: { e3e4: 'e4 draws. The pawn went first and now your king has no square in front of it to fight for. King first.' },
          bad: 'A king move, to the square directly opposite their king.' },
        { t: 'move', fen: '8/8/4k3/8/3K4/8/4P3/8 w - - 0 1', you: 'w', answer: ['d4e4'], verify: [{ k: 'only-win' }],
          ask: 'Again, from further back',
          text: 'You are White. Same idea, one rank lower. One move wins.',
          why: 'Ke4. Opposite their king, and it is their move. Your king leads; the pawn stays back so that later it has a spare move if you ever need to hand the move over.',
          wrong: { e2e4: 'e4 draws: Black takes the opposition with Kd6 and you cannot get past.' },
          bad: 'Opposite their king, one square between.' },
        { t: 'move', fen: '8/8/4k3/8/3KP3/8/8/8 b - - 0 1', you: 'b', answer: ['e6d6'], verify: [{ k: 'only-draw' }],
          ask: 'Now hold the draw',
          text: 'You are Black, and it cuts both ways. Exactly one move draws; every other move loses. Take the opposition yourself.',
          why: 'Kd6. Now White is the one who must give way, and the king cannot get in front of its pawn. Keep doing that, step straight back when the pawn checks you, and the game ends in stalemate or the pawn is lost. Half of all pawn endings are saved this way.',
          bad: 'Face their king: directly opposite, one square between.' },
      ],
      end: 'King in front of the pawn, take the opposition, and count who has to move. The Endgames screen has these to play out against the engine, win and draw.',
      next: { label: 'Endgames', go: 'endgames' },
    },
  ];
  if (typeof module !== 'undefined' && module.exports) { module.exports = { LESSONS }; return; }   // node: the test reads the data
  window.FLOOR_LESSONS = LESSONS;

  const $ = (id) => document.getElementById(id);
  const mv = (u) => ({ from: u.slice(0, 2), to: u.slice(2, 4), promotion: u[4] || undefined });
  const KEY = 'ghostlap-basics-v1';
  let store = {};
  try { const raw = JSON.parse(localStorage.getItem(KEY) || '{}'); if (raw && typeof raw === 'object') store = raw; } catch (e) { /* private mode */ }
  const persist = () => { try { localStorage.setItem(KEY, JSON.stringify(store)); } catch (e) {} };
  const who = () => (window.__coach && window.__coach.player) || 'jesse';
  const mine = () => { const w = who(); if (!store[w] || typeof store[w] !== 'object') store[w] = {}; return store[w]; };
  const done = (id) => mine()[id] || null;   // { n, best, of, date }

  const CSS = `
  #basics { overflow-y: auto; -webkit-overflow-scrolling: touch; touch-action: pan-y; background: var(--bg); overflow-x: hidden;
    padding: calc(var(--st) + 10px) calc(var(--sr) + 16px) calc(var(--sb) + 28px) calc(var(--sl) + 16px); --sq: calc(min(100vw - 32px, 46vh) / 8); }
  #basics [hidden] { display: none !important; }
  #basics .brow { justify-content: center; margin-top: 4px; }
  #basics .bar { margin-bottom: 4px; } #basics .bar b { transition: width .3s; }
  .bs-head { display: flex; justify-content: space-between; align-items: baseline; gap: 10px; margin: 8px 0; }
  .bs-q { font-size: 21px; font-weight: 800; line-height: 1.2; color: var(--bsc, var(--text)); min-width: 0; }
  .bs-q[data-k=right] { --bsc: var(--green); } .bs-q[data-k=wrong] { --bsc: var(--amber); }
  .bs-pos { color: var(--dim); font-size: 12px; white-space: nowrap; }
  .bs-note { font-size: 15px; line-height: 1.5; }
  .bs-note[data-k=right] { border-left-color: var(--green); } .bs-note[data-k=wrong] { border-left-color: var(--amber); }
  .bs-opts { display: grid; gap: 8px; margin-top: 12px; }
  .bs-opts .btn { height: auto; min-height: 46px; padding: 10px 14px; font-size: 15px; line-height: 1.3; text-align: left; justify-content: flex-start; white-space: normal; }
  .bs-opts .btn.ok { border-color: var(--green); color: var(--green); } .bs-opts .btn.no { border-color: var(--amber); color: var(--amber); }
  #basics .board .sq.bs-mark { box-shadow: inset 0 0 0 3px var(--amber); }
  #basics .board .sq.bs-pick { box-shadow: inset 0 0 0 4px var(--ghost); }
  #basics .board .sq.bs-ok { box-shadow: inset 0 0 0 4px var(--green); }
  #basics .board .sq.bs-miss { box-shadow: inset 0 0 0 4px var(--amber); }
  #basics .board .sq.bs-bad { box-shadow: inset 0 0 0 4px var(--red); }
  .bs-end { background: var(--panel); border: 1px solid var(--line); border-left: 4px solid var(--green); border-radius: 12px; padding: 12px 14px; font-size: 16px; line-height: 1.45; margin: 12px 0; }
  .bs-pearl { color: var(--dim); font-size: 13px; line-height: 1.4; margin: 0 0 12px; }
  .bs-tick { color: var(--green); font-weight: 800; margin-left: 6px; }
  `;
  const HTML = `<section id="basics" class="screen">
  <div class="wrap">
    <div class="cbar"><button class="back" id="bsBack" aria-label="Back">&#8249;</button><h1 id="bsTitle">LESSON</h1></div>
    <div id="bsPlay">
      <div class="bar"><b id="bsBar" style="width:0"></b></div>
      <div class="bs-head"><div class="bs-q" id="bsQ"></div><div class="bs-pos" id="bsPos"></div></div>
      <div class="brow"><div class="board" id="bsBoard"></div></div>
      <div class="lnote bs-note" id="bsNote"></div>
      <div class="bs-opts" id="bsOpts" hidden></div>
      <div class="btns" style="margin-top:12px"><button class="btn primary" id="bsGo">Next</button></div>
    </div>
    <div id="bsSum" hidden>
      <div class="endT" id="bsSumT">Lesson done</div>
      <div class="bs-end" id="bsEnd"></div>
      <p class="bs-pearl" id="bsPearl"></p>
      <div class="btns"><button class="btn primary" id="bsNextGo"></button></div>
      <div class="btns"><button class="btn" id="bsAgain">Again</button><button class="btn" id="bsDone">Back to the lessons</button></div>
    </div>
  </div>
</section>`;
  const style = document.createElement('style'); style.id = 'bsStyle'; style.textContent = CSS; document.head.appendChild(style);
  document.body.insertAdjacentHTML('beforeend', HTML);

  // S: the lesson being played. Per step: st.phase 'ask' | 'done'; st.right (first try); taps (a Set), tries, sel/targets for a move
  let S = null;
  function open(id, opts) {
    const l = LESSONS.find((x) => x.id === id); if (!l || !window.__coach || !window.Chess) return null;
    S = { l, i: -1, first: 0, asked: 0, st: null, onBack: opts && typeof opts.onBack === 'function' ? opts.onBack : null };
    for (const el of document.querySelectorAll('.screen.on')) el.classList.remove('on');
    $('bsTitle').textContent = l.title.toUpperCase();
    $('bsPlay').hidden = false; $('bsSum').hidden = true;
    $('basics').classList.add('on'); $('basics').scrollTo(0, 0);
    advance(); return state();
  }
  function advance() {
    S.i++;
    if (S.i >= S.l.steps.length) { finish(); return; }
    const s = S.l.steps[S.i];
    S.st = { s, c: new Chess(s.fen), phase: s.t === 'show' ? 'done' : 'ask', right: null, taps: new Set(), tries: 0, sel: null, targets: [], said: '', picked: null, played: null };
    draw();
  }
  function settle(right) {
    const st = S.st; if (st.phase === 'done') return;
    st.phase = 'done'; if (st.right === null) st.right = !!right;
    S.asked++; if (st.right) S.first++;
    draw();
  }
  // tap: toggle squares, then Check. One go: the answer is shown either way.
  function tap(sq) {
    const st = S && S.st; if (!st || st.phase !== 'ask') return;
    if (st.s.t === 'tap') { if (st.taps.has(sq)) st.taps.delete(sq); else if (st.c.get(sq)) st.taps.add(sq); draw(); return; }
    if (st.s.t !== 'move') return;
    const t = st.sel && st.targets.find((x) => x.to === sq);
    if (t) { move(st.sel, sq); return; }
    const p = st.c.get(sq);
    if (p && p.color === st.c.turn() && sq !== st.sel) { st.sel = sq; st.targets = st.c.moves({ square: sq, verbose: true }).map((m) => ({ to: m.to, capture: !!m.captured })); }
    else { st.sel = null; st.targets = []; }
    draw();
  }
  function check() {
    const st = S && S.st; if (!st || st.phase !== 'ask' || st.s.t !== 'tap') return null;
    const want = st.s.answer, ok = want.length === st.taps.size && want.every((q) => st.taps.has(q));
    settle(ok); return { right: ok };
  }
  function pick(i) {
    const st = S && S.st; if (!st || st.phase !== 'ask' || st.s.t !== 'pick') return null;
    st.picked = i; settle(i === st.s.answer); return { right: i === st.s.answer };
  }
  // a move: right ends the step; wrong says why (a specific line where the lesson has one) and you try again; the third miss shows it
  function move(from, to) {
    const st = S && S.st; if (!st || st.phase !== 'ask' || st.s.t !== 'move') return null;
    const t = new Chess(st.c.fen()), m = t.move({ from, to, promotion: 'q' });
    st.sel = null; st.targets = [];
    if (!m) { draw(); return { legal: false }; }
    const u = from + to, ok = st.s.answer.some((a) => a.slice(0, 4) === u) || (st.s.mate && t.in_checkmate());
    if (ok) { st.played = u; st.c = t; settle(true); return { legal: true, right: true, san: m.san }; }
    st.tries++; if (st.right === null) st.right = false;
    st.said = m.san + ': ' + ((st.s.wrong && st.s.wrong[u]) || 'not that one. ' + (st.s.bad || 'Look again.'));
    if (st.tries >= 3) { settle(false); return { legal: true, right: false, san: m.san, shown: true }; }
    draw(); return { legal: true, right: false, san: m.san };
  }
  function next() { const st = S && S.st; if (!st || st.phase !== 'done') return null; advance(); return state(); }
  function finish() {
    const l = S.l, rec = mine()[l.id] || (mine()[l.id] = { n: 0, best: 0, of: S.asked });
    rec.n++; rec.of = S.asked; rec.best = Math.max(rec.best | 0, S.first); rec.last = S.first; rec.date = new Date().toISOString(); persist();
    S.st = null; S.ended = true;
    $('bsPlay').hidden = true; $('bsSum').hidden = false;
    $('bsSumT').textContent = S.first === S.asked ? 'All ' + S.asked + ' right first time' : S.first + ' of ' + S.asked + ' right first time';
    $('bsEnd').textContent = l.end; $('bsPearl').textContent = 'The pearl: ' + l.pearl;
    const nb = $('bsNextGo'); nb.textContent = l.next.label; nb.hidden = !goable(l.next.go);
  }
  const goable = (k) => k === 'safety' ? !!window.__safety : k === 'endgames' ? !!window.__endgames : k === 'tactics' ? !!window.__puzzles : false;
  function go() {
    const k = S && S.l.next.go; if (!goable(k)) return;
    $('basics').classList.remove('on'); S = null;
    if (k === 'safety') window.__safety.open({});
    else if (k === 'endgames') window.__endgames.open({ set: 'S0' });
    else window.__puzzles.open({ band: [500, 799], count: 10, minutes: 15 });
  }
  function draw() {
    const st = S && S.st; if (!st) return;
    const s = st.s, ph = st.phase, flip = (s.you || st.c.turn()) === 'b', R = window.__coach.renderBoard;
    const o = { flip, check: st.c.in_check(), busy: ph === 'done' || s.t === 'pick' || s.t === 'show', onTap: ph === 'ask' && (s.t === 'tap' || s.t === 'move') ? tap : null };
    const arrows = [];
    if (s.t === 'show') for (const a of s.arrows || []) arrows.push({ from: a[0], to: a[1], cls: a[2] || '' });
    if (ph === 'done' && s.t !== 'show') for (const a of s.after || []) arrows.push({ from: a[0], to: a[1], cls: a[2] || '' });
    if (s.t === 'move') {
      o.sel = st.sel; o.targets = st.targets;
      if (ph === 'done') { const a = mv(st.played || s.answer[0]); if (st.played) o.last = { from: a.from, to: a.to }; else arrows.push({ from: a.from, to: a.to }); }
    }
    if (arrows.length) o.arrows = arrows;
    R($('bsBoard'), st.c, o);
    // square marks on top of the renderer's own classes
    const cls = {};
    if (s.t === 'show') for (const q of s.marks || []) cls[q] = 'bs-mark';
    if (s.t === 'tap') {
      if (ph === 'ask') for (const q of st.taps) cls[q] = 'bs-pick';
      else { for (const q of s.answer) cls[q] = st.taps.has(q) ? 'bs-ok' : 'bs-miss'; for (const q of st.taps) if (!s.answer.includes(q)) cls[q] = 'bs-bad'; }
    }
    for (const d of $('bsBoard').querySelectorAll('.sq')) if (cls[d.dataset.sq]) d.classList.add(cls[d.dataset.sq]);
    let k = '', note = s.text;
    if (ph === 'done' && s.t !== 'show') {
      k = st.right ? 'right' : 'wrong';
      const lead = s.t === 'tap' && !st.right ? 'Green you found, amber you missed, red was not one. ' : s.t === 'move' && !st.played ? 'The move is shown. ' : '';
      note = lead + s.why;
    } else if (s.t === 'move' && st.said) { k = 'wrong'; note = st.said; }
    $('bsQ').dataset.k = $('bsNote').dataset.k = k;
    $('bsQ').textContent = ph === 'done' && s.t !== 'show' ? (st.right ? 'Right' : s.t === 'move' && st.played ? 'Got there' : 'Not quite') : s.ask;
    $('bsNote').textContent = note;
    $('bsPos').textContent = (S.i + 1) + ' of ' + S.l.steps.length;
    $('bsBar').style.width = Math.round(S.i / S.l.steps.length * 100) + '%';
    const ob = $('bsOpts'); ob.hidden = s.t !== 'pick'; ob.innerHTML = '';
    if (s.t === 'pick') s.options.forEach((t, i) => {
      const b = document.createElement('button'); b.className = 'btn' + (ph === 'done' ? (i === s.answer ? ' ok' : i === st.picked ? ' no' : '') : ''); b.textContent = t; b.disabled = ph === 'done'; b.dataset.opt = i;
      b.onclick = () => pick(i); ob.appendChild(b);
    });
    const gb = $('bsGo');
    gb.hidden = ph === 'ask' && s.t !== 'tap';
    gb.textContent = ph === 'ask' ? 'Check' : S.i + 1 >= S.l.steps.length ? 'Finish' : 'Next';
  }
  function close() {
    const back = S && S.onBack; S = null;
    $('basics').classList.remove('on');
    if (typeof back === 'function') back(); else if (window.__learn) window.__learn.open(); else if (window.__hub) window.__hub.show();
  }
  function state() {
    if (!S) return null;
    const st = S.st;
    return { id: S.l.id, i: S.i, n: S.l.steps.length, first: S.first, asked: S.asked, ended: !!S.ended,
      step: st && { t: st.s.t, phase: st.phase, right: st.right, answer: st.s.answer, taps: [...st.taps], tries: st.tries } };
  }
  $('bsBack').onclick = close; $('bsDone').onclick = close; $('bsNextGo').onclick = go;
  $('bsAgain').onclick = () => { const id = S && S.l.id, ob = S && S.onBack; if (id) open(id, { onBack: ob }); };
  $('bsGo').onclick = () => { const st = S && S.st; if (st && st.phase === 'ask' && st.s.t === 'tap') check(); else next(); };
  window.__basics = { list: () => LESSONS.map((l) => ({ id: l.id, title: l.title, blurb: l.blurb, mins: l.mins, steps: l.steps.length, done: done(l.id) })),
    open, close, done, tap, check, pick, move, next, go, get state() { return state(); } };
})();
