// Ghostlap Roma: the launcher. Pick the driving game, the chess coach, the lessons or the training plan.
(function () {
  'use strict';
  const $ = (id) => document.getElementById(id);
  const hub = $('hub');
  // every screen that can be open when someone heads back to the launcher, the injected ones (tactics, endgames, plan) included
  const SCREENS = ['menu', 'hud', 'chess', 'review', 'learn', 'lesson', 'drill', 'puzzles', 'safety', 'basics', 'endgames', 'plan'];
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
  // ---------- backup: every ghostlap-* key in localStorage as one JSON file, and back again ----------
  // The saves never leave the phone, and the home-screen app and the TestFlight app keep separate storage, so a file is the
  // only way to carry the ledger from one to the other. Restoring replaces everything and reloads.
  const BK = 'ghostlap-backup-v1';   // when the last file was saved (not part of the backup itself)
  const sheet = (id, on) => $(id).classList.toggle('on', on);
  function backupData() {
    const data = {};
    for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); if (k && k.startsWith('ghostlap-') && k !== BK) data[k] = localStorage.getItem(k); }
    return { app: 'ghostlap-roma', version: 1, date: new Date().toISOString(), data };
  }
  function backupWhen() {
    let t = null; try { t = localStorage.getItem(BK); } catch (e) {}
    $('backupWhen').textContent = t ? 'last saved ' + new Date(t).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) : 'never saved';
  }
  function backupSave() {
    const b = backupData(), text = JSON.stringify(b), name = 'ghostlap-backup-' + b.date.slice(0, 10) + '.json';
    const done = (how) => { try { localStorage.setItem(BK, b.date); } catch (e) {} backupWhen(); $('backupMsg').textContent = how === 'shared' ? 'Saved. Keep the file somewhere that is not this phone.' : 'Downloaded as ' + name + '. Keep it somewhere that is not this phone.'; return how; };
    const download = () => { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([text], { type: 'application/json' })); a.download = name; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 4000); return done('download'); };
    try {
      const file = new File([text], name, { type: 'application/json' });
      if (navigator.canShare && navigator.canShare({ files: [file] })) return navigator.share({ files: [file], title: 'Ghostlap backup' }).then(() => done('shared'), (e) => (e && e.name === 'AbortError' ? 'cancelled' : download()));
    } catch (e) { /* no File or share here: download instead */ }
    return Promise.resolve(download());
  }
  // returns what it did; `sure` skips the question (the tests)
  function backupRestore(text, sure) {
    let b = null; try { b = JSON.parse(text); } catch (e) {}
    if (!b || b.app !== 'ghostlap-roma' || !b.data || typeof b.data !== 'object') { $('backupMsg').textContent = 'That is not a Ghostlap backup file.'; return 'bad'; }
    const keys = Object.keys(b.data).filter((k) => k.startsWith('ghostlap-') && typeof b.data[k] === 'string');
    const when = new Date(b.date).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
    if (!sure && !confirm('Replace everything on this phone with the backup from ' + when + '? What is here now is lost.')) return 'cancelled';
    try {
      const old = []; for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); if (k && k.startsWith('ghostlap-') && k !== BK) old.push(k); }
      for (const k of old) localStorage.removeItem(k);
      for (const k of keys) localStorage.setItem(k, b.data[k]);
    } catch (e) { $('backupMsg').textContent = 'The phone would not store it: ' + (e && e.message || 'no storage here') + '.'; return 'failed'; }
    location.reload();
    return 'restored';
  }
  if ($('backupBtn')) {
    backupWhen();
    $('backupBtn').onclick = () => sheet('backupSheet', true); $('backupClose').onclick = () => sheet('backupSheet', false);
    $('backupSave').onclick = backupSave; $('backupLoad').onclick = () => $('backupFile').click();
    $('backupFile').onchange = (e) => { const f = e.target.files && e.target.files[0]; e.target.value = ''; if (!f) return; const r = new FileReader(); r.onload = () => backupRestore(String(r.result)); r.readAsText(f); };
  }
  window.__hub = { show, drive, chess, learn, train, backupData, backupRestore };
})();
