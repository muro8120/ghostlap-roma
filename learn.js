// Ghostlap Roma: the Learn screen. Opening lessons with a step-through board, and Practice that hands over to the coach.
(function () {
  'use strict';
  const $ = (id) => document.getElementById(id);
  const L = window.LESSONS || [];
  let cur = null, ply = 0, fens = [];
  const KIND = { basics: 'Basics', w: 'With White', b: 'With Black' };

  function renderList() {
    const el = $('learnList'); el.innerHTML = '';
    const groups = { basics: [], w: [], b: [] };
    for (const l of L) groups[l.kind === 'basics' ? 'basics' : l.side].push(l);
    for (const k of ['basics', 'w', 'b']) {
      if (!groups[k].length) continue;
      const h = document.createElement('h2'); h.textContent = KIND[k]; el.appendChild(h);
      const wrap = document.createElement('div'); wrap.className = 'tracks';
      for (const l of groups[k]) {
        const b = document.createElement('button'); b.className = 'card lcard';
        b.innerHTML = '<span class="cap">' + (l.kind === 'basics' ? '&#127891;' : l.side === 'w' ? '&#9812;' : '&#9818;') + '</span><div><div class="t"></div><div class="b"></div></div><span class="go">&#8250;</span>';
        b.querySelector('.t').textContent = l.title + (l.eco ? ' · ' + l.eco : '');
        b.querySelector('.b').textContent = l.blurb;
        b.onclick = () => show(l.id);
        wrap.appendChild(b);
      }
      el.appendChild(wrap);
    }
  }
  function open() {
    for (const id of ['hub', 'menu', 'hud', 'chess', 'review', 'lesson']) { const e = $(id); if (e) e.classList.remove('on'); }
    renderList(); $('learn').classList.add('on'); $('learn').scrollTo(0, 0);
  }
  function close() { $('learn').classList.remove('on'); $('lesson').classList.remove('on'); if (window.__hub) window.__hub.show(); }
  function show(id) {
    cur = L.find((l) => l.id === id); if (!cur) return;
    const c = new Chess(); fens = [c.fen()];
    for (const s of cur.line) { c.move(s); fens.push(c.fen()); }
    $('lTitle').textContent = cur.title; $('lEco').textContent = cur.eco ? cur.eco + ' · ' + (cur.side === 'w' ? 'for White' : 'for Black') : 'Basics';
    $('lIdea').textContent = cur.idea;
    const fill = (elId, items) => { const u = $(elId); u.innerHTML = ''; for (const t of items || []) { const li = document.createElement('li'); li.textContent = t; u.appendChild(li); } };
    fill('lWant', cur.want); fill('lAvoid', cur.avoid); $('lThen').textContent = cur.then || '';
    $('lPractice').hidden = cur.kind !== 'opening';
    $('lPractice').textContent = 'Practice the ' + cur.title;
    $('learn').classList.remove('on'); $('lesson').classList.add('on'); $('lesson').scrollTo(0, 0);
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
  function practice() {
    if (!cur || !window.__coach || !window.__coach.practice) return;
    $('lesson').classList.remove('on'); $('learn').classList.remove('on');
    window.__coach.practice(cur);
  }
  $('learnBack').onclick = close;
  $('lessonBack').onclick = () => { $('lesson').classList.remove('on'); open(); };
  $('lPrev').onclick = () => seek(ply - 1);
  $('lNext').onclick = () => seek(ply + 1);
  $('lPractice').onclick = practice;
  const lb = $('lBoard'); lb.addEventListener('touchstart', (e) => e.preventDefault(), { passive: false });
  window.__learn = { open, close, show, seek, practice, get lesson() { return cur; }, get ply() { return ply; } };
})();
