// Ghostlap Roma: the launcher. Pick the driving game or the chess coach.
(function () {
  'use strict';
  const $ = (id) => document.getElementById(id);
  const hub = $('hub');
  function show() { for (const id of ['menu', 'hud', 'chess', 'review']) { const el = $(id); if (el) el.classList.remove('on'); } hub.classList.add('on'); }
  function drive() { hub.classList.remove('on'); $('menu').classList.add('on'); $('menu').scrollTo(0, 0); }
  function chess() {
    if (!window.__coach) { alert('Chess is still loading. Try again in a moment.'); return; }
    hub.classList.remove('on'); window.__coach.open();
  }
  $('pickDrive').onclick = drive;
  $('pickChess').onclick = chess;
  $('toHub').onclick = show;
  // mirror the offline badge from the drive menu so the hub says when the whole app is cached
  const src = $('offline'), dst = $('hubOffline');
  new MutationObserver(() => { dst.textContent = src.textContent; dst.style.color = src.classList.contains('ok') ? 'var(--green)' : ''; }).observe(src, { childList: true, characterData: true, subtree: true });
  dst.textContent = src.textContent;
  // deep link: ?game=chess or ?game=drive opens that game straight away (used by the tests too)
  const g = new URLSearchParams(location.search).get('game');
  if (g === 'drive') drive(); else if (g === 'chess') setTimeout(chess, 0);
  window.__hub = { show, drive, chess };
})();
