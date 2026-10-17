// Ghostlap Roma: the launcher. Pick the driving game, the chess coach, the lessons or the training plan.
(function () {
  'use strict';
  const $ = (id) => document.getElementById(id);
  const hub = $('hub');
  // every screen that can be open when someone heads back to the launcher, the injected ones (tactics, endgames, plan) included
  const SCREENS = ['menu', 'hud', 'chess', 'review', 'learn', 'lesson', 'drill', 'puzzles', 'endgames', 'plan'];
  const hideAll = () => { for (const id of SCREENS) { const el = $(id); if (el) el.classList.remove('on'); } };
  function show() { hideAll(); hub.classList.add('on'); }
  const leave = () => { hideAll(); hub.classList.remove('on'); };   // whatever was open, one screen at a time
  function learn() { if (!window.__learn) return; leave(); window.__learn.open(); }
  function train() {
    if (!window.__plan) { alert('The plan is still loading. Try again in a moment.'); return; }
    leave(); window.__plan.open();
  }
  function drive() { leave(); $('menu').classList.add('on'); $('menu').scrollTo(0, 0); }
  function chess() {
    if (!window.__coach) { alert('Chess is still loading. Try again in a moment.'); return; }
    leave(); window.__coach.open();
  }
  $('pickDrive').onclick = drive;
  $('pickChess').onclick = chess;
  $('pickLearn').onclick = learn;
  if ($('pickTrain')) $('pickTrain').onclick = train;
  $('toHub').onclick = show;
  // mirror the offline badge from the drive menu so the hub says when the whole app is cached
  const src = $('offline'), dst = $('hubOffline');
  // native iOS app (Capacitor): everything is bundled in the app, so it is always ready, no cache to wait for
  if (window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform()) {
    src.textContent = '✓ Ready'; src.classList.add('ok');
  }
  new MutationObserver(() => { dst.textContent = src.textContent; dst.style.color = src.classList.contains('ok') ? 'var(--green)' : ''; }).observe(src, { childList: true, characterData: true, subtree: true });
  dst.textContent = src.textContent;
  // deep link: ?game=chess, drive, learn or train opens that screen straight away (used by the tests too)
  const g = new URLSearchParams(location.search).get('game');
  if (g === 'drive') drive(); else if (g === 'chess') setTimeout(chess, 0); else if (g === 'learn') setTimeout(learn, 0); else if (g === 'train') setTimeout(train, 0);
  window.__hub = { show, drive, chess, learn, train };
})();
