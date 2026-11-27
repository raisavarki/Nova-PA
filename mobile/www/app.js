/* Nova Mobile — offline personal assistant (PWA). Data in localStorage. */
(() => {
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const uid = (p = 'x') => p + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  const todayKey = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const buzz = (ms = 12) => { try { navigator.vibrate && navigator.vibrate(ms); } catch (e) {} };

  // ---------- storage
  const KEY = 'nova-mobile-v1';
  const DEFAULTS = { tasks: [], reminders: [], notes: [], habits: [{ id: 'water', name: 'Water', icon: '💧', target: 8, log: {} }, { id: 'move', name: 'Move', icon: '🚶', target: 3, log: {} }], reading: [], checklists: [], countdowns: [], expenses: [], journal: [], settings: { name: '', assistantName: 'Nova', theme: 'auto', skin: 'cream', avatarOn: true, currency: '₹', units: 'metric', dateFmt: 'dmy', firstDay: 'mon',
    workStart: '09:00', workEnd: '18:00', waterTarget: 8, focusWork: 25, reminderStyle: 'standard', snoozeMin: 10,
    quietStart: '22:00', quietEnd: '07:00', voiceLang: 'en-IN', uiLang: 'en', goals: [], notifyOn: false, notified: false,
    onboarded: false, lock: null, autoLockMin: 5 }, focus: { work: 25, sessions: [] } };
  let db;
  function load() { try { db = { ...structuredClone(DEFAULTS), ...(JSON.parse(localStorage.getItem(KEY)) || {}) }; } catch (e) { db = structuredClone(DEFAULTS); } }
  let saveT, cloudT, lastSeenAt = 0;
  const saveLocal = () => { try { localStorage.setItem(KEY, JSON.stringify(db)); } catch (e) {} };
  function save() {
    clearTimeout(saveT); saveT = setTimeout(saveLocal, 120);
    clearTimeout(cloudT); cloudT = setTimeout(() => {
      try {
        if (window.NovaAccount && NovaAccount.configured() && NovaAccount.isAuthed()) { const at = Date.now(); lastSeenAt = Math.max(lastSeenAt, at); NovaAccount.pushData({ ...db, _at: at, _device: 'mobile' }).catch(() => {}); }
        else cloudSync(false);
      } catch (e) {}
    }, 2500);
  }
  // ---- live cross-device sync: pull newer data from the account and apply it ----
  async function acctPull() {
    if (!(window.NovaAccount && NovaAccount.configured() && NovaAccount.isAuthed())) return;
    try {
      const d = await NovaAccount.pullData();
      if (d && typeof d === 'object' && d._at && d._at > lastSeenAt) {
        lastSeenAt = d._at;
        const keep = db.settings && db.settings.lock; // never let sync change the local lock
        db = { ...structuredClone(DEFAULTS), ...d };
        delete db._at; delete db._device;
        if (keep) db.settings.lock = keep;
        saveLocal(); applyPersonalization(); render();
      }
    } catch (e) {}
  }
  let syncPollT = null;
  function startSyncPoll() { if (syncPollT) return; syncPollT = setInterval(acctPull, 20000); document.addEventListener('visibilitychange', () => { if (!document.hidden) acctPull(); }); }
  load();

  // ---------- avatar
  const bot = window.NovaAvatar.attach($('#bot'));
  bot.setState('idle');
  let bubbleT;
  function react(act, msg) {
    if (act) bot.play(act) || bot.setState('done');
    if (msg) { const b = $('#bubble'); b.innerHTML = esc(msg); b.classList.add('show'); clearTimeout(bubbleT); bubbleT = setTimeout(() => b.classList.remove('show'), 4200); }
  }
  function toast(msg) { const t = $('#toast'); t.textContent = msg; t.classList.add('show'); clearTimeout(t._t); t._t = setTimeout(() => t.classList.remove('show'), 2200); }
  // ---- ElevenLabs voice (per-device; key stays local, never synced to the account) ----
  const EL_KEY = 'nova-el';
  const elCfg = () => { try { return JSON.parse(localStorage.getItem(EL_KEY)) || {}; } catch (e) { return {}; } };
  const setElCfg = (c) => { try { localStorage.setItem(EL_KEY, JSON.stringify(c)); } catch (e) {} };
  let elAudio = null;
  function sysSpeak(t) { try { if (window.speechSynthesis) { speechSynthesis.cancel(); speechSynthesis.speak(new SpeechSynthesisUtterance(t)); } } catch (e) {} }
  async function speak(text) {
    const t = String(text || '').replace(/\s+/g, ' ').trim(); if (!t) return;
    const c = elCfg();
    if (c.on && c.key && c.voice) {
      try {
        const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(c.voice)}?output_format=mp3_44100_128`, {
          method: 'POST', headers: { 'xi-api-key': c.key, 'Content-Type': 'application/json', 'Accept': 'audio/mpeg' },
          body: JSON.stringify({ text: t.slice(0, 2500), model_id: c.model || 'eleven_turbo_v2_5', voice_settings: { stability: 0.4, similarity_boost: 0.75, style: 0.2, use_speaker_boost: true } })
        });
        if (res.ok) { const blob = await res.blob(); if (elAudio) { try { elAudio.pause(); } catch (e) {} } elAudio = new Audio(URL.createObjectURL(blob)); elAudio.play().catch(() => sysSpeak(t)); return; }
      } catch (e) {}
    }
    sysSpeak(t);
  }
  async function elLoadVoices(key) {
    const res = await fetch('https://api.elevenlabs.io/v1/voices', { headers: { 'xi-api-key': key } });
    if (!res.ok) return null;
    const j = await res.json();
    return (j.voices || []).map((v) => ({ id: v.voice_id, name: v.name + (v.labels && v.labels.accent ? ' · ' + v.labels.accent : '') }));
  }

  function copyText(s, okMsg, failMsg) {
    try { const p = navigator.clipboard && navigator.clipboard.writeText(s); if (p && p.then) { p.then(() => okMsg && toast(okMsg)).catch(() => failMsg && toast(failMsg)); return; } } catch (e) {}
    // fallback for older webviews
    try { const ta = document.createElement('textarea'); ta.value = s; ta.style.position = 'fixed'; ta.style.opacity = '0'; document.body.appendChild(ta); ta.select(); document.execCommand('copy'); ta.remove(); okMsg && toast(okMsg); } catch (e) { failMsg && toast(failMsg); }
  }

  // ---------- theme
  function applyTheme() {
    const t = db.settings.theme;
    let dark = t === 'dark' || (t === 'auto' && matchMedia('(prefers-color-scheme: dark)').matches);
    // 'sunset' = follow time of day (dark after the quiet-hours start, light after it ends)
    if (t === 'sunset') { const h = new Date().getHours(); const qs = +(db.settings.quietStart || '21:00').slice(0, 2); const qe = +(db.settings.quietEnd || '07:00').slice(0, 2); dark = qs < qe ? (h >= qs && h < qe) : (h >= qs || h < qe); }
    document.documentElement.classList.toggle('dark', dark);
  }
  matchMedia('(prefers-color-scheme: dark)').addEventListener('change', applyTheme);
  $('#btnTheme').onclick = () => { const o = ['auto', 'light', 'dark', 'sunset']; db.settings.theme = o[(o.indexOf(db.settings.theme) + 1) % o.length]; save(); applyTheme(); toast('Theme: ' + (db.settings.theme === 'sunset' ? 'follow time of day' : db.settings.theme)); };
  applyTheme();
  setInterval(() => { if (db.settings.theme === 'sunset') applyTheme(); }, 5 * 60000);
  $('#btnSearch') && ($('#btnSearch').onclick = () => openSearch());

  // ---------- simple natural-language time (for voice / quick add)
  function parseWhen(str) {
    let s = ' ' + String(str).toLowerCase() + ' ', at = null, m;
    const now = new Date();
    if ((m = s.match(/\bin\s+(\d+|an?|half an?)\s*(min|mins|minute|minutes|hour|hours|hr|hrs)\b/))) {
      const n = /^half/.test(m[1]) ? 0.5 : /^an?$/.test(m[1]) ? 1 : +m[1];
      at = new Date(now.getTime() + n * (/hour|hr/.test(m[2]) ? 3600000 : 60000)); s = s.replace(m[0], ' ');
    } else {
      let day = 0;
      if (/\btomorrow\b/.test(s)) { day = 1; s = s.replace(/\btomorrow\b/, ' '); }
      if ((m = s.match(/\b(?:at\s+)?(\d{1,2})(?::(\d{2}))?\s*(am|pm)?\b/))) {
        let h = +m[1]; const mi = +(m[2] || 0); const ap = m[3];
        if (ap === 'pm' && h < 12) h += 12; if (ap === 'am' && h === 12) h = 0;
        if (!ap && h <= 7) h += 12; // 1-7 => pm
        const d = new Date(now); d.setDate(d.getDate() + day); d.setHours(h, mi, 0, 0);
        if (d <= now && !day) d.setDate(d.getDate() + 1);
        at = d; s = s.replace(m[0], ' ');
      } else if (/\btonight\b/.test(s)) { const d = new Date(now); d.setHours(20, 0, 0, 0); if (d <= now) d.setDate(d.getDate() + 1); at = d; s = s.replace(/\btonight\b/, ' '); }
      else if (day) { const d = new Date(now); d.setDate(d.getDate() + 1); d.setHours(9, 0, 0, 0); at = d; }
    }
    let rest = s.replace(/\s+/g, ' ').replace(/^\s*(to|that|about|me|remind)\s+/g, '').trim();
    return { at, text: rest };
  }

  // ---------- reminders scheduling + notifications
  function ensureNotify() { if ('Notification' in window && Notification.permission === 'default') Notification.requestPermission().catch(() => {}); }
  function fireReminder(r) {
    buzz([200, 100, 200]);
    try { if ('Notification' in window && Notification.permission === 'granted') new Notification('🔔 ' + (r.alarm ? 'Alarm' : 'Reminder'), { body: r.text, tag: r.id, icon: 'icons/icon-192.png' }); } catch (e) {}
    showAlert(r);
  }
  function tickReminders() {
    const now = Date.now(); let changed = false;
    for (const r of db.reminders) {
      if (r.done || !r.at || r.at > now) continue;
      if (now - r.at < 24 * 3600000) fireReminder(r);
      if (r.repeat) { r.at = nextRepeat(r.at, r.repeat, now); } else { r.done = true; }
      changed = true;
    }
    if (changed) { save(); if (view === 'reminders' || view === 'today') render(); }
  }
  function nextRepeat(at, rep, now) { const d = new Date(at); let g = 0; while (d.getTime() <= now && g++ < 4000) { if (rep === 'hourly') d.setHours(d.getHours() + 1); else if (rep === 'daily') d.setDate(d.getDate() + 1); else if (rep === 'weekly') d.setDate(d.getDate() + 7); else if (rep === 'weekdays') { do { d.setDate(d.getDate() + 1); } while (d.getDay() === 0 || d.getDay() === 6); } else d.setDate(d.getDate() + 1); } return d.getTime(); }
  setInterval(tickReminders, 20000);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) tickReminders(); });

  function showAlert(r) {
    if ($('.alert-ov')) return;
    const ov = document.createElement('div'); ov.className = 'alert-ov';
    ov.innerHTML = `<div class="alert-card"><div class="ab" id="alertBot"></div><div class="muted small">${r.alarm ? 'ALARM' : 'REMINDER'}</div><h2>${esc(r.text)}</h2>
      <div class="chips" id="snzChips" style="justify-content:center">${[['10 min', 10], ['1 hour', 60], ['Tonight', 'night'], ['Tomorrow', 'tmr']].map(([l, v]) => `<button data-snz="${v}">${l}</button>`).join('')}</div>
      <div class="row"><button class="btn block" id="got">Got it</button></div></div>`;
    document.body.appendChild(ov);
    try { const ab = window.NovaAvatar.attach($('#alertBot')); ab.setState('attention'); } catch (e) {}
    if (elCfg().on) speak((r.alarm ? 'Alarm. ' : 'Reminder. ') + r.text);
    $('#got').onclick = () => { buzz(); ov.remove(); };
    $$('#snzChips button', ov).forEach((b) => (b.onclick = () => {
      const v = b.dataset.snz; let at;
      if (v === 'night') at = atToday(20); else if (v === 'tmr') at = atTomorrow(9); else at = Date.now() + (+v) * 60000;
      ov.remove(); db.reminders.push({ id: uid('r'), text: r.text, at, done: false }); save();
      if (typeof scheduleAllNotifications === 'function') scheduleAllNotifications();
      toast('Snoozed — ' + whenLabel(at));
    }));
  }

  // ---------- helpers
  const fmtTime = (t) => new Date(t).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  function whenLabel(at, repeat) {
    const d = new Date(at), now = new Date(), tm = new Date(); tm.setDate(tm.getDate() + 1);
    const reps = { hourly: 'Every hour', daily: 'Every day', weekdays: 'Weekdays', weekly: 'Weekly' };
    if (repeat) return `${reps[repeat] || repeat} · ${fmtTime(at)}`;
    if (d.toDateString() === now.toDateString()) return 'Today · ' + fmtTime(at);
    if (d.toDateString() === tm.toDateString()) return 'Tomorrow · ' + fmtTime(at);
    return d.toLocaleDateString([], { day: 'numeric', month: 'short' }) + ' · ' + fmtTime(at);
  }
  const money = (n) => (db.settings.currency || '₹') + Number(n).toLocaleString('en-IN', { maximumFractionDigits: 2 });

  // ================= views =================
  let view = 'today';
  function render() {
    const m = $('#main');
    ({ today: renderToday, tasks: renderTasks, reminders: renderReminders, habits: renderHabits, notes: renderNotes, reading: renderReading, checklists: renderChecklists, money: renderMoney, journal: renderJournal, review: renderReview, focus: renderFocus, insights: renderInsights, tools: renderTools, breathe: renderBreathe, more: renderMore }[view] || renderToday)(m);
  }
  function go(tab) { view = tab; $$('#tabs button').forEach((b) => b.classList.toggle('on', b.dataset.tab === tab)); $('#main').scrollTop = 0; render(); }

  // ---- Today
  function mring(pct, color, label, sub) {
    const r = 24, c = 2 * Math.PI * r, off = c * (1 - Math.max(0, Math.min(1, pct)));
    return `<svg viewBox="0 0 60 60" class="mw-ring"><circle cx="30" cy="30" r="${r}" class="mw-ring-bg"/><circle cx="30" cy="30" r="${r}" stroke="${color}" stroke-dasharray="${c.toFixed(1)}" stroke-dashoffset="${off.toFixed(1)}" class="mw-ring-fg"/><text x="30" y="31" class="mw-ring-n">${label}</text>${sub ? `<text x="30" y="41" class="mw-ring-s">${sub}</text>` : ''}</svg>`;
  }
  function renderToday(m) {
    const openTasks = db.tasks.filter((t) => !t.done);
    const tEnd = new Date(); tEnd.setHours(23, 59, 59, 999);
    const remToday = db.reminders.filter((r) => !r.done && r.at <= +tEnd);
    const water = db.habits.find((h) => h.id === 'water'); const wt = water ? water.target : 8; const wn = water ? (water.log[todayKey()] || 0) : 0;
    const dueToday = openTasks.filter((t) => t.due && t.due <= +tEnd);
    const agenda = [
      ...db.reminders.filter((r) => !r.done && r.at <= +tEnd).map((r) => ({ at: r.at, ic: r.alarm ? '⏰' : '🔔', t: r.text })),
      ...dueToday.map((t) => ({ at: t.due, ic: '✅', t: t.text }))
    ].sort((a, b) => a.at - b.at);
    const nextUp = db.reminders.filter((r) => !r.done && r.at >= Date.now()).sort((a, b) => a.at - b.at)[0];
    const relTime = (ts) => { const mi = Math.round((ts - Date.now()) / 60000); if (mi < 1) return 'now'; if (mi < 60) return `in ${mi}m`; if (mi < 1440) return `in ${Math.round(mi / 60)}h`; return new Date(ts).toLocaleDateString([], { weekday: 'short' }); };
    const topTask = openTasks[0];
    const RING = ['#FF375F', '#7AE582', '#44C0FF'];
    const habits = db.habits.slice(0, 3);
    const now = new Date();
    m.innerHTML = `
      ${installHint()}
      <div class="mwboard">
        <div class="mw mw-lg mw-next" data-go="reminders">
          <div class="mw-h"><span>UP NEXT</span>${nextUp ? `<span class="mw-rel">${relTime(nextUp.at)}</span>` : ''}</div>
          <div class="mw-next-body">${nextUp ? `<div class="mw-next-ic">${nextUp.alarm ? '⏰' : '🔔'}</div><div class="mw-next-t">${esc(nextUp.text)}</div><div class="mw-next-w">${new Date(nextUp.at).toLocaleString([], { weekday: 'short', hour: 'numeric', minute: '2-digit' })}</div>` : `<div class="mw-today"><b>${now.toLocaleDateString([], { weekday: 'long' })}</b> ${now.getDate()} ${now.toLocaleDateString([], { month: 'short' })}<div class="mw-clear">All caught up 🎉</div></div>`}</div>
        </div>
        <div class="mw mw-water" data-wplus="1"><div class="mw-h"><span>💧</span></div><div class="mw-ring-wrap">${mring(wt ? wn / wt : 0, '#44C0FF', `${wn}`, `/${wt}`)}</div></div>
        <div class="mw mw-tasks" data-go="tasks"><div class="mw-h"><span>✅ TASKS</span></div><div class="mw-big">${openTasks.length}</div><div class="mw-sub">${topTask ? esc(topTask.text.slice(0, 24)) : 'all done 🎉'}</div></div>
        <div class="mw mw-rings" data-go="habits"><div class="mw-h"><span>ACTIVITY</span></div><div class="mw-rings-row">${habits.map((h, i) => { const n = h.log[todayKey()] || 0, tg = h.target || 1; return `<div class="mw-rc">${mring(n / tg, RING[i % 3], `${n}`, h.icon || '')}</div>`; }).join('')}</div></div>
        <div class="mw mw-quick"><div class="mw-h"><span>QUICK ADD</span></div><div class="mw-q-row"><button data-qa="task"><span>✅</span></button><button data-qa="reminder"><span>🔔</span></button><button data-qa="note"><span>📝</span></button><button data-qa="voice"><span>🎙</span></button></div></div>
      </div>
      <div class="card"><div class="row" style="justify-content:space-between;margin-bottom:4px"><h3 style="margin:0">Today</h3><div class="row" style="gap:6px"><button class="btn ghost" id="briefBtn" style="padding:5px 12px">☀️ Brief</button><button class="btn ghost" id="shareBtn" style="padding:5px 12px">↗ Share</button></div></div>${agenda.length ? agenda.map((a) => `<div class="item"><div style="width:26px;text-align:center">${a.ic}</div><div class="tx"><div class="t">${esc(a.t)}</div><div class="s">${fmtTime(a.at)}</div></div></div>`).join('') : '<div class="empty">Nothing scheduled. Tap ＋ to add something.</div>'}</div>
      ${openTasks.length ? `<div class="card"><h3>Up next</h3>${openTasks.slice(0, 4).map((t) => taskRow(t)).join('')}</div>` : ''}
    `;
    $$('[data-go]', m).forEach((e) => (e.onclick = () => go(e.dataset.go)));
    $$('[data-wplus]', m).forEach((e) => (e.onclick = (ev) => { ev.stopPropagation(); logWater(1); }));
    $$('[data-qa]', m).forEach((b) => (b.onclick = () => { if (b.dataset.qa === 'voice') startDictation(); else openAdd(); }));
    $('#briefBtn') && ($('#briefBtn').onclick = () => { const t = briefText(); react('wave', t); speak(t); });
    $('#shareBtn') && ($('#shareBtn').onclick = () => shareToday());
    wireTaskRows(m);
  }

  // ---- Tasks
  function taskRow(t) {
    const subsN = (t.subs || []).length, subsDone = (t.subs || []).filter((s) => s.done).length;
    const repLbl = { daily: 'daily', weekdays: 'weekdays', weekly: 'weekly', monthly: 'monthly' };
    const meta = [t.due ? whenLabel(t.due) : '', subsN ? `☑ ${subsDone}/${subsN}` : '', t.repeat ? '🔁 ' + (repLbl[t.repeat] || t.repeat) : '', ...(t.tags || []).map((x) => '#' + x)].filter(Boolean).join('  ·  ');
    return `<div class="item ${t.done ? 'done' : ''}" data-id="${t.id}"><div class="chk ${t.done ? 'on' : ''}" data-chk="${t.id}">${t.done ? '✓' : ''}</div><div class="tx" data-edit="${t.id}"><div class="t ${t.priority === 'high' ? 'pri-high' : ''}">${t.pinned ? '📌 ' : ''}${t.priority === 'high' ? '❗ ' : ''}${esc(t.text)}</div>${meta ? `<div class="s">${esc(meta)}</div>` : ''}</div><span class="swipe-x">🗑</span></div>`;
  }
  function wireTaskRows(root) {
    $$('[data-chk]', root).forEach((c) => (c.onclick = (ev) => {
      ev.stopPropagation();
      const t = db.tasks.find((x) => x.id === c.dataset.chk); if (!t) return;
      t.done = !t.done; t.doneAt = t.done ? Date.now() : null;
      if (t.done && t.repeat) { const nd = nextOccurrence(t.due || Date.now(), t.repeat); db.tasks.push({ id: uid('t'), text: t.text, done: false, doneAt: null, due: nd, priority: t.priority, repeat: t.repeat, tags: (t.tags || []).slice(), subs: (t.subs || []).map((s) => ({ text: s.text, done: false })), pinned: t.pinned, created: Date.now() }); }
      save(); buzz(); if (t.done) react('cheer', t.repeat ? 'Done — next one is scheduled 🔁' : 'Nice — one down! ✅'); render();
    }));
    $$('[data-edit]', root).forEach((el) => (el.onclick = () => taskEditSheet(el.dataset.edit)));
    enableSwipe(root, (id) => { db.tasks = db.tasks.filter((x) => x.id !== id); save(); buzz(20); render(); }, 'tasks');
  }
  let taskTag = '';
  function renderTasks(m) {
    let open = db.tasks.filter((t) => !t.done), done = db.tasks.filter((t) => t.done);
    const order = { high: 0, normal: 1, low: 2 };
    const allTags = [...new Set(db.tasks.flatMap((t) => t.tags || []))];
    if (taskTag && !allTags.includes(taskTag)) taskTag = '';
    if (taskTag) open = open.filter((t) => (t.tags || []).includes(taskTag));
    open.sort((a, b) => ((b.pinned ? 1 : 0) - (a.pinned ? 1 : 0)) || (order[a.priority] - order[b.priority]) || ((a.due || 9e15) - (b.due || 9e15)));
    m.innerHTML = `<div class="sec-title">Tasks</div>
      <div class="card"><div class="row"><input id="qTask" placeholder="Add a task… ('every Monday', '#boe', 'urgent')"><button class="btn" id="qTaskAdd">Add</button></div></div>
      ${allTags.length ? `<div class="chips" id="tagChips"><button data-tag="" class="${taskTag ? '' : 'on'}">All</button>${allTags.map((t) => `<button data-tag="${esc(t)}" class="${taskTag === t ? 'on' : ''}">#${esc(t)}</button>`).join('')}</div>` : ''}
      <div class="card"><h3>To do (${open.length})</h3>${open.length ? open.map(taskRow).join('') : '<div class="empty">All clear 🎉</div>'}</div>
      ${done.length ? `<div class="card"><h3>Done</h3>${done.slice(-10).reverse().map(taskRow).join('')}<button class="btn ghost block" id="clrDone" style="margin-top:10px">Clear completed</button></div>` : ''}`;
    wireTaskRows(m);
    $$('#tagChips button', m).forEach((b) => (b.onclick = () => { taskTag = b.dataset.tag; render(); }));
    const add = () => { const v = $('#qTask').value.trim(); if (!v) return; addTask(v); $('#qTask').value = ''; render(); };
    $('#qTaskAdd').onclick = add; $('#qTask').addEventListener('keydown', (e) => { if (e.key === 'Enter') add(); });
    $('#clrDone') && ($('#clrDone').onclick = () => { db.tasks = db.tasks.filter((t) => !t.done); save(); render(); });
  }
  function addTask(v) {
    let due = null, priority = 'normal', text = v, repeat = null;
    if (/\b(urgent|asap|important|!)\b/i.test(v)) { priority = 'high'; text = text.replace(/\b(urgent|asap|important)\b/ig, '').trim(); }
    const rm = text.match(/\bevery\s+(weekdays?|day|week|month)\b|\b(daily|weekly|monthly)\b/i);
    if (rm) { const g = (rm[1] || rm[2] || '').toLowerCase(); repeat = /weekday/.test(g) ? 'weekdays' : /day|daily/.test(g) ? 'daily' : /week/.test(g) ? 'weekly' : 'monthly'; text = text.replace(rm[0], '').trim(); }
    const tags = []; text = text.replace(/#([a-z0-9_]+)/gi, (_, t) => { tags.push(t.toLowerCase()); return ''; }).replace(/\s{2,}/g, ' ').trim();
    const w = parseWhen(text); if (w.at && w.text) { due = +w.at; text = w.text; }
    db.tasks.push({ id: uid('t'), text: text.charAt(0).toUpperCase() + text.slice(1), done: false, due, priority, repeat, tags, subs: [], pinned: false, created: Date.now() });
    save(); react('write', 'Added to your tasks.'); buzz();
  }

  // ---- Reminders
  function renderReminders(m) {
    const list = db.reminders.filter((r) => !r.done).sort((a, b) => a.at - b.at);
    m.innerHTML = `<div class="sec-title">Reminders</div>
      <div class="card"><div class="field"><input id="rmText" placeholder="Remind me to…"></div>
        <div class="chips" id="rmChips">${['in 30 min', 'in 1 hour', 'Today 5 PM', 'Tonight 8 PM', 'Tomorrow 9 AM'].map((c, i) => `<button data-c="${i}">${c}</button>`).join('')}</div>
        <div class="row"><input type="datetime-local" id="rmAt"><button class="btn" id="rmAdd">Set</button></div>
        <div class="pill-row" id="rmRepeat">${['Once', 'Daily', 'Hourly', 'Weekdays', 'Weekly'].map((r, i) => `<button data-r="${['', 'daily', 'hourly', 'weekdays', 'weekly'][i]}" class="${i === 0 ? 'on' : ''}">${r}</button>`).join('')}</div>
      </div>
      <div class="card"><h3>Upcoming (${list.length})</h3>${list.length ? list.map((r) => `<div class="item" data-id="${r.id}"><div style="width:26px;text-align:center">${r.alarm ? '⏰' : '🔔'}</div><div class="tx"><div class="t">${esc(r.text)}</div><div class="s">${whenLabel(r.at, r.repeat)}</div></div><span class="swipe-x">🗑</span></div>`).join('') : '<div class="empty">No reminders set.</div>'}</div>`;
    let rep = '';
    const times = [() => Date.now() + 1800000, () => Date.now() + 3600000, () => atToday(17), () => atToday(20), () => atTomorrow(9)];
    $$('#rmChips button', m).forEach((b) => (b.onclick = () => { const t = $('#rmText').value.trim() || 'Reminder'; addReminder(t, times[+b.dataset.c](), rep); $('#rmText').value = ''; render(); }));
    $$('#rmRepeat button', m).forEach((b) => (b.onclick = () => { rep = b.dataset.r; $$('#rmRepeat button', m).forEach((x) => x.classList.toggle('on', x === b)); }));
    $('#rmAdd').onclick = () => { const t = $('#rmText').value.trim() || 'Reminder'; const v = $('#rmAt').value; if (!v) { toast('Pick a time'); return; } addReminder(t, +new Date(v), rep); $('#rmText').value = ''; render(); };
    enableSwipe(m, (id) => { db.reminders = db.reminders.filter((x) => x.id !== id); save(); render(); }, 'reminders');
  }
  const atToday = (h) => { const d = new Date(); d.setHours(h, 0, 0, 0); if (d <= new Date()) d.setDate(d.getDate() + 1); return +d; };
  const atTomorrow = (h) => { const d = new Date(); d.setDate(d.getDate() + 1); d.setHours(h, 0, 0, 0); return +d; };
  function addReminder(text, at, repeat) { ensureNotify(); db.reminders.push({ id: uid('r'), text, at, repeat: repeat || null, done: false }); save(); if (typeof scheduleAllNotifications === 'function') scheduleAllNotifications(); react('check', `Got it — ${whenLabel(at, repeat)}`); buzz(); }

  // ---- Habits
  function logWater(n) { const w = db.habits.find((h) => h.id === 'water'); const k = todayKey(); w.log[k] = Math.max(0, (w.log[k] || 0) + n); save(); buzz(); react('drink', w.log[k] >= w.target ? 'Goal reached! 🎉' : `${w.log[k]}/${w.target} glasses`); render(); }
  function renderHabits(m) {
    const k = todayKey();
    m.innerHTML = `<div class="sec-title">Habits</div>
      ${db.habits.map((h) => { const n = h.log[k] || 0; const pct = Math.min(100, n / h.target * 100); const st = streakOf(h); return `<div class="card"><div class="row"><div style="font-size:24px">${h.icon || '⭐'}</div><div style="flex:1" data-hedit="${h.id}"><div style="font-weight:600">${esc(h.name)}${st.cur ? ` <span class="streak">🔥 ${st.cur}</span>` : ''}</div><div class="bar" style="margin:6px 0 2px"><i style="width:${pct}%"></i></div><div class="s muted">${st.best ? `Best ${st.best} day${st.best > 1 ? 's' : ''}` : 'Tap to edit'}</div></div><div class="muted" style="width:46px;text-align:right">${n}/${h.target}</div><button class="btn" data-h="${h.id}">+</button></div></div>`; }).join('')}
      <button class="btn ghost block" id="addHabit">+ New habit</button>`;
    $$('[data-h]', m).forEach((b) => (b.onclick = () => { const h = db.habits.find((x) => x.id === b.dataset.h); if (h.id === 'water') return logWater(1); h.log[k] = (h.log[k] || 0) + 1; save(); buzz(); react('cheer'); render(); }));
    $$('[data-hedit]', m).forEach((el) => (el.onclick = () => habitEditSheet(el.dataset.hedit)));
    $('#addHabit').onclick = () => openSheet('New habit', `<div class="field"><label>Name</label><input id="shN" placeholder="e.g. Read 20 min"></div><div class="field"><label>Icon</label><input id="shI" placeholder="📚" maxlength="2"></div><div class="field"><label>Daily target</label><input id="shT" type="number" value="1"></div><button class="btn block" id="shGo">Add habit</button>`, () => { $('#shGo').onclick = () => { const n = $('#shN').value.trim(); if (!n) return; db.habits.push({ id: uid('h'), name: n, icon: $('#shI').value || '⭐', target: +$('#shT').value || 1, log: {} }); save(); closeSheet(); render(); }; });
  }

  // ---- Notes
  function renderNotes(m) {
    m.innerHTML = `<div class="sec-title">Notes</div>
      <div class="card"><div class="field"><textarea id="nText" rows="3" placeholder="Jot something down…"></textarea></div>
        <div class="chips" id="nTpl">${Object.keys(TEMPLATES).map((k) => `<button data-tpl="${esc(k)}">＋ ${esc(k)}</button>`).join('')}</div>
        <button class="btn block" id="nAdd">Save note</button></div>
      ${db.notes.slice().reverse().map((n) => `<div class="card" data-id="${n.id}"><div style="white-space:pre-wrap">${esc(n.text)}</div><div class="s muted" style="margin-top:8px;display:flex;justify-content:space-between"><span>${new Date(n.t).toLocaleDateString()}</span><button class="btn ghost" data-del="${n.id}" style="padding:4px 12px">Delete</button></div></div>`).join('') || '<div class="empty">No notes yet.</div>'}`;
    $$('#nTpl button', m).forEach((b) => (b.onclick = () => { const t = TEMPLATES[b.dataset.tpl]; const ta = $('#nText'); ta.value = (ta.value ? ta.value + '\n\n' : '') + t; ta.focus(); }));
    $('#nAdd').onclick = () => { const v = $('#nText').value.trim(); if (!v) return; db.notes.push({ id: uid('n'), text: v, t: Date.now() }); save(); react('write', 'Noted.'); render(); };
    $$('[data-del]', m).forEach((b) => (b.onclick = () => { db.notes = db.notes.filter((x) => x.id !== b.dataset.del); save(); render(); }));
  }

  // ---- Reading list
  function renderReading(m) {
    m.innerHTML = `<div class="sec-title">Reading list</div>
      <div class="card"><div class="row"><input id="rdU" placeholder="Paste a link…"><button class="btn" id="rdA">Save</button></div></div>
      ${db.reading.slice().reverse().map((r) => { let h = ''; try { h = new URL(r.url).hostname.replace(/^www\./, ''); } catch (e) {} return `<div class="item ${r.read ? 'done' : ''}" data-id="${r.id}"><div class="chk ${r.read ? 'on' : ''}" data-read="${r.id}">${r.read ? '✓' : ''}</div><div class="tx"><div class="t"><a href="${esc(r.url)}" target="_blank" rel="noopener">${esc(r.title)}</a></div><div class="s">${esc(h)}</div></div><span class="swipe-x">🗑</span></div>`; }).join('') || '<div class="empty">Nothing saved yet.</div>'}`;
    $('#rdA').onclick = () => { let u = $('#rdU').value.trim(); if (!u) return; if (!/^https?:/.test(u)) u = 'https://' + u; db.reading.push({ id: uid('rd'), url: u, title: u.replace(/^https?:\/\/(www\.)?/, '').slice(0, 50), read: false, t: Date.now() }); save(); react('write', 'Saved to read later.'); render(); };
    $$('[data-read]', m).forEach((c) => (c.onclick = () => { const r = db.reading.find((x) => x.id === c.dataset.read); r.read = !r.read; save(); buzz(); render(); }));
    enableSwipe(m, (id) => { db.reading = db.reading.filter((x) => x.id !== id); save(); render(); }, 'reading');
  }

  // ---- Checklists
  function renderChecklists(m) {
    m.innerHTML = `<div class="sec-title">Checklists</div>
      <div class="card"><div class="field"><input id="clN" placeholder="Checklist name (e.g. Packing)"></div><div class="field"><textarea id="clI" rows="2" placeholder="Items, comma separated: passport, charger, meds"></textarea></div><button class="btn block" id="clNew">Create</button></div>
      ${db.checklists.map((c) => { const done = c.items.filter((i) => i.done).length; return `<div class="card" data-id="${c.id}"><div class="row"><h3 style="flex:1;margin:0">${esc(c.name)}</h3><span class="muted small">${done}/${c.items.length}</span><button class="btn ghost" data-reset="${c.id}" style="padding:5px 12px">Reset</button><button class="btn ghost" data-del="${c.id}" style="padding:5px 10px">✕</button></div>${c.items.map((i, k) => `<div class="item"><div class="chk ${i.done ? 'on' : ''}" data-chk="${c.id}:${k}">${i.done ? '✓' : ''}</div><div class="tx"><div class="t ${i.done ? '' : ''}" style="${i.done ? 'text-decoration:line-through;color:var(--muted)' : ''}">${esc(i.text)}</div></div></div>`).join('')}<div class="row" style="margin-top:8px"><input data-add="${c.id}" placeholder="+ add item"></div></div>`; }).join('') || '<div class="empty">No checklists yet.</div>'}`;
    $('#clNew').onclick = () => { const n = $('#clN').value.trim(); if (!n) return; const items = $('#clI').value.split(/[,\n]/).map((x) => x.trim()).filter(Boolean).map((t) => ({ text: t, done: false })); db.checklists.push({ id: uid('cl'), name: n, items }); save(); react('write'); render(); };
    $$('[data-chk]', m).forEach((c) => (c.onclick = () => { const [id, k] = c.dataset.chk.split(':'); const cl = db.checklists.find((x) => x.id === id); cl.items[+k].done = !cl.items[+k].done; save(); buzz(); if (cl.items.every((i) => i.done)) react('cheer', cl.name + ' complete! 🎉'); render(); }));
    $$('[data-reset]', m).forEach((b) => (b.onclick = () => { const cl = db.checklists.find((x) => x.id === b.dataset.reset); cl.items.forEach((i) => (i.done = false)); save(); render(); }));
    $$('[data-del]', m).forEach((b) => (b.onclick = () => { db.checklists = db.checklists.filter((x) => x.id !== b.dataset.del); save(); render(); }));
    $$('[data-add]', m).forEach((inp) => (inp.onkeydown = (e) => { if (e.key === 'Enter' && inp.value.trim()) { const cl = db.checklists.find((x) => x.id === inp.dataset.add); cl.items.push({ text: inp.value.trim(), done: false }); save(); render(); } }));
  }

  // ---- Money
  function renderMoney(m) {
    const from = new Date(); const mFrom = +new Date(from.getFullYear(), from.getMonth(), 1);
    const monthExp = db.expenses.filter((e) => e.t >= mFrom);
    const total = monthExp.reduce((a, e) => a + e.amount, 0);
    m.innerHTML = `<div class="sec-title">Money</div>
      <div class="tile accent" style="margin-bottom:12px"><div class="n">${money(total)}</div><div class="l">spent this month</div></div>
      <div class="card"><div class="row"><input id="exA" type="number" inputmode="decimal" placeholder="Amount" style="max-width:120px"><input id="exN" placeholder="On what?"><button class="btn" id="exAdd">Log</button></div></div>
      <div class="card"><h3>Recent</h3>${monthExp.slice().reverse().slice(0, 15).map((e) => `<div class="item"><div class="tx"><div class="t">${esc(e.note || 'Expense')}</div><div class="s">${new Date(e.t).toLocaleDateString()}</div></div><div style="font-weight:700">${money(e.amount)}</div></div>`).join('') || '<div class="empty">No expenses this month.</div>'}</div>`;
    $('#exAdd').onclick = () => { const a = parseFloat($('#exA').value); if (!a) return; db.expenses.push({ id: uid('x'), amount: a, note: $('#exN').value.trim(), t: Date.now() }); save(); react('write', `Logged ${money(a)}`); render(); };
  }

  // ---- Journal
  function renderJournal(m) {
    m.innerHTML = `<div class="sec-title">Journal</div>
      <div class="card"><div class="field"><textarea id="jT" rows="3" placeholder="How was your day?"></textarea></div><div class="pill-row" id="jMood">${['😖', '😕', '😐', '🙂', '😄'].map((e, i) => `<button data-m="${i + 1}">${e}</button>`).join('')}</div><button class="btn block" id="jAdd" style="margin-top:10px">Save entry</button></div>
      ${db.journal.slice().reverse().map((j) => `<div class="card"><div class="row"><span style="font-size:20px">${['', '😖', '😕', '😐', '🙂', '😄'][j.mood] || ''}</span><span class="s muted" style="flex:1">${new Date(j.t).toLocaleString([], { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })}</span></div><div style="margin-top:6px;white-space:pre-wrap">${esc(j.text)}</div></div>`).join('') || '<div class="empty">No entries yet.</div>'}`;
    let mood = 0; $$('#jMood button', m).forEach((b) => (b.onclick = () => { mood = +b.dataset.m; $$('#jMood button', m).forEach((x) => x.classList.toggle('on', x === b)); }));
    $('#jAdd').onclick = () => { const v = $('#jT').value.trim(); if (!v && !mood) return; db.journal.push({ id: uid('j'), text: v, mood, t: Date.now() }); save(); react('happy', 'Saved.'); render(); };
  }

  // ---- Weekly review
  function renderReview(m) {
    const wk = Date.now() - 7 * 864e5;
    const done = db.tasks.filter((t) => t.done && t.doneAt >= wk).length;
    const focusMin = db.focus.sessions.filter((s) => s.at >= wk).reduce((a, s) => a + s.min, 0);
    const days = Array.from({ length: 7 }, (_, i) => todayKey(new Date(Date.now() - i * 864e5)));
    const water = db.habits.find((h) => h.id === 'water'); const waterN = water ? days.reduce((a, d) => a + (water.log[d] || 0), 0) : 0;
    const ticks = db.habits.reduce((a, h) => a + days.reduce((b, d) => b + ((h.log[d] || 0) >= h.target ? 1 : 0), 0), 0);
    const spent = db.expenses.filter((e) => e.t >= wk).reduce((a, e) => a + e.amount, 0);
    m.innerHTML = `<div class="sec-title">Weekly review</div><div class="card"><div style="font-size:15px;line-height:2.1">
      📅 <b>Your last 7 days</b><br>✅ ${done} tasks completed<br>🎯 ${Math.round(focusMin / 60 * 10) / 10} h focused<br>${ticks} habit check-ins · ${waterN} glasses of water<br>${spent ? '💸 ' + money(spent) + ' spent<br>' : ''}📓 ${db.journal.filter((j) => j.t >= wk).length} journal entries</div></div>`;
  }

  // ---- Focus (pomodoro with wake lock)
  let focusTimer = null, wakeLock = null, focusEnd = 0;
  function renderFocus(m) {
    const running = !!focusTimer;
    m.innerHTML = `<div class="sec-title">Focus</div>
      <div class="card" style="text-align:center">
        <div id="fClock" style="font-size:54px;font-weight:800;font-variant-numeric:tabular-nums">${running ? mmss(focusEnd - Date.now()) : (db.focus.work + ':00')}</div>
        <div class="pill-row" id="fMins" style="justify-content:center;margin:10px 0">${[15, 25, 45, 60].map((n) => `<button data-n="${n}" class="${n === db.focus.work ? 'on' : ''}">${n}m</button>`).join('')}</div>
        <button class="btn block" id="fGo">${running ? 'Stop' : 'Start focus'}</button>
        <div class="muted small" style="margin-top:8px">Screen stays awake during a session.</div>
      </div>
      <div class="card"><h3>This week</h3><div class="muted">${Math.round(db.focus.sessions.filter((s) => s.at > Date.now() - 7 * 864e5).reduce((a, s) => a + s.min, 0) / 60 * 10) / 10} hours focused</div></div>`;
    $$('#fMins button', m).forEach((b) => (b.onclick = () => { if (focusTimer) return; db.focus.work = +b.dataset.n; save(); render(); }));
    $('#fGo').onclick = () => (focusTimer ? stopFocus(false) : startFocus());
  }
  const mmss = (ms) => { const t = Math.max(0, Math.round(ms / 1000)); return Math.floor(t / 60) + ':' + String(t % 60).padStart(2, '0'); };
  async function startFocus() {
    focusEnd = Date.now() + db.focus.work * 60000;
    try { if ('wakeLock' in navigator) wakeLock = await navigator.wakeLock.request('screen'); } catch (e) {}
    bot.mode && bot.mode('focus', true);
    focusTimer = setInterval(() => { const left = focusEnd - Date.now(); if ($('#fClock')) $('#fClock').textContent = mmss(left); if (left <= 0) stopFocus(true); }, 500);
    react('happy', 'Focus on. You got this 🎯'); render();
  }
  function stopFocus(done) {
    clearInterval(focusTimer); focusTimer = null;
    if (wakeLock) { wakeLock.release().catch(() => {}); wakeLock = null; }
    bot.mode && bot.mode('focus', false);
    if (done) { db.focus.sessions.push({ at: Date.now(), min: db.focus.work }); save(); buzz([300, 150, 300]); react('cheer', 'Session done! Take a break ☕'); try { if (Notification.permission === 'granted') new Notification('🎯 Focus done', { body: 'Nice work — time for a break.' }); } catch (e) {} }
    render();
  }

  // =====================================================================
  //  NEW FEATURES (v1.5)
  // =====================================================================
  const todayStart = () => { const d = new Date(); d.setHours(0, 0, 0, 0); return +d; };

  // ---- Tools hub: calculator, converter, timer/stopwatch, password, world clock, countdowns, SAP codes
  function calc(s) {
    s = String(s).toLowerCase().replace(/,/g, '').trim();
    let m = s.match(/([\d.]+)\s*%\s*of\s*([\d.]+)/); if (m) return (+m[1] / 100) * (+m[2]);
    s = s.replace(/(\d+(?:\.\d+)?)\s*%/g, '($1/100)');
    if (!/^[-+*/(). \d]+$/.test(s)) return null;
    try { const r = Function('"use strict";return (' + s + ')')(); return (typeof r === 'number' && isFinite(r)) ? r : null; } catch (e) { return null; }
  }
  const CONV_U = { km: 1000, m: 1, mi: 1609.344, ft: 0.3048, cm: 0.01, in: 0.0254, kg: 1000, g: 1, lb: 453.592, oz: 28.3495 };
  const CONV_CUR = { usd: 83, inr: 1, eur: 90, gbp: 105, aed: 22.6, sgd: 61 }; // approx INR per unit
  const CONV_ALIAS = { miles: 'mi', mile: 'mi', kilometers: 'km', kilometer: 'km', kilometre: 'km', kilometres: 'km', kms: 'km', meters: 'm', metre: 'm', metres: 'm', meter: 'm', feet: 'ft', foot: 'ft', inch: 'in', inches: 'in', centimeter: 'cm', centimetre: 'cm', centimeters: 'cm', centimetres: 'cm', pounds: 'lb', pound: 'lb', lbs: 'lb', kilograms: 'kg', kilogram: 'kg', kgs: 'kg', grams: 'g', gram: 'g', ounce: 'oz', ounces: 'oz', celsius: 'c', centigrade: 'c', fahrenheit: 'f', dollars: 'usd', dollar: 'usd', rupees: 'inr', rupee: 'inr', rs: 'inr', euros: 'eur', euro: 'eur', pounds_sterling: 'gbp', dirham: 'aed', dirhams: 'aed' };
  function convert(s) {
    s = String(s).toLowerCase().replace(/,/g, '').replace(/°/g, '');
    const m = s.match(/(-?[\d.]+)\s*([a-z]+)\s*(?:to|in|into|=|->)\s*([a-z]+)/);
    if (!m) return null;
    let n = +m[1], a = CONV_ALIAS[m[2]] || m[2], b = CONV_ALIAS[m[3]] || m[3];
    if ((a === 'c' || a === 'f') && (b === 'c' || b === 'f')) { const v = a === b ? n : a === 'c' ? n * 9 / 5 + 32 : (n - 32) * 5 / 9; return { v, u: b.toUpperCase() }; }
    if (CONV_CUR[a] && CONV_CUR[b]) return { v: n * CONV_CUR[a] / CONV_CUR[b], u: b.toUpperCase(), approx: true };
    const len = ['km', 'm', 'mi', 'ft', 'cm', 'in'], wt = ['kg', 'g', 'lb', 'oz'];
    if (CONV_U[a] && CONV_U[b] && ((len.includes(a) && len.includes(b)) || (wt.includes(a) && wt.includes(b)))) return { v: n * CONV_U[a] / CONV_U[b], u: b };
    return null;
  }
  const fmtN = (n) => (Math.round(n * 10000) / 10000).toLocaleString('en-IN');
  function clockRow(tz) {
    const name = tz.split('/').pop().replace(/_/g, ' ');
    const t = new Date().toLocaleTimeString([], { timeZone: tz, hour: 'numeric', minute: '2-digit' });
    const d = new Date().toLocaleDateString([], { timeZone: tz, weekday: 'short' });
    return `<div class="item"><div class="tx"><div class="t">${esc(name)}</div><div class="s">${d}</div></div><div style="font-weight:700;font-variant-numeric:tabular-nums">${t}</div></div>`;
  }
  function cdRow(c) {
    const days = Math.ceil((c.date - todayStart()) / 864e5);
    return `<div class="item" data-id="${c.id}"><div class="tx"><div class="t">${esc(c.title)}</div><div class="s">${new Date(c.date).toLocaleDateString([], { day: 'numeric', month: 'short', year: 'numeric' })}</div></div><div style="text-align:right"><div style="font-weight:800;font-size:19px">${days}</div><div class="s muted">${days === 1 ? 'day' : 'days'}</div></div><span class="swipe-x">🗑</span></div>`;
  }
  let swT = null, swAcc = 0, swSince = 0;
  function renderTools(m) {
    const clocks = db.settings.worldClocks || ['Asia/Kolkata', 'Europe/London', 'America/New_York', 'Asia/Dubai'];
    const codes = db.settings.sapCodes || [];
    const cds = (db.countdowns || []).filter((c) => c.date >= todayStart()).sort((a, b) => a.date - b.date);
    m.innerHTML = `<div class="sec-title">Tools</div>
      <div class="card"><h3>🧮 Calculator</h3><div class="row"><input id="calcIn" placeholder="18% of 45000, (1200+350)*12"><button class="btn" id="calcGo">=</button></div><div id="calcOut" class="tool-out"></div></div>
      <div class="card"><h3>🔁 Converter</h3><div class="row"><input id="convIn" placeholder="10 km to miles, 100 usd to inr, 30 c to f"><button class="btn" id="convGo">Go</button></div><div id="convOut" class="tool-out"></div></div>
      <div class="card"><h3>⏱ Timer &amp; stopwatch</h3><div id="swClock" style="font-size:40px;font-weight:800;text-align:center;font-variant-numeric:tabular-nums">${swText()}</div><div class="row" style="justify-content:center;gap:8px;margin-top:6px"><button class="btn" id="swToggle">${swT ? 'Pause' : 'Start'}</button><button class="btn ghost" id="swReset">Reset</button></div><div class="pill-row" style="justify-content:center;margin-top:10px">${[1, 3, 5, 10, 25].map((n) => `<button data-tm="${n}">${n} min</button>`).join('')}</div><div class="muted small" style="text-align:center;margin-top:6px">Timers alert you even if you leave this screen.</div></div>
      <div class="card"><h3>🔑 Password</h3><div id="pwOut" class="tool-out" style="font-family:monospace;word-break:break-all;min-height:20px">Tap generate</div><div class="row" style="margin-top:8px"><input id="pwLen" type="number" value="16" min="6" max="64" style="max-width:90px"><button class="btn" id="pwGen">Generate &amp; copy</button></div></div>
      <div class="card"><h3>🕐 World clock</h3><div id="clockList">${clocks.map(clockRow).join('')}</div></div>
      <div class="card"><h3>⏳ Countdowns</h3><div class="row"><input id="cdT" placeholder="What? (e.g. SEZ go-live)"><input id="cdD" type="date" style="max-width:150px"></div><button class="btn block" id="cdAdd" style="margin-top:8px">Add countdown</button><div id="cdList" style="margin-top:10px">${cds.map(cdRow).join('') || '<div class="empty">No countdowns.</div>'}</div></div>
      <div class="card"><h3>💼 SAP quick codes</h3><div class="muted small" style="margin-bottom:8px">Save T-codes you use often — tap Copy.</div><div id="sapList">${codes.map((c, i) => `<div class="item"><div class="tx"><div class="t" style="font-family:monospace">${esc(c.code)}</div><div class="s">${esc(c.label || '')}</div></div><button class="btn ghost" data-cp="${i}" style="padding:5px 12px">Copy</button><button class="btn ghost" data-sx="${i}" style="padding:5px 10px">✕</button></div>`).join('') || '<div class="empty">None yet.</div>'}</div><div class="row" style="margin-top:8px"><input id="sapC" placeholder="T-code" style="font-family:monospace"><input id="sapL" placeholder="Label"><button class="btn" id="sapAdd">Add</button></div></div>`;
    // calculator
    const doCalc = () => { const r = calc($('#calcIn').value); $('#calcOut').textContent = r == null ? '—' : fmtN(r); };
    $('#calcGo').onclick = doCalc; $('#calcIn').addEventListener('keydown', (e) => e.key === 'Enter' && doCalc());
    $('#calcIn').addEventListener('input', doCalc);
    // converter
    const doConv = () => { const r = convert($('#convIn').value); $('#convOut').textContent = r == null ? '—' : `${fmtN(r.v)} ${r.u}${r.approx ? '  (approx)' : ''}`; };
    $('#convGo').onclick = doConv; $('#convIn').addEventListener('keydown', (e) => e.key === 'Enter' && doConv());
    $('#convIn').addEventListener('input', doConv);
    // stopwatch
    $('#swToggle').onclick = () => { if (swT) { swAcc += Date.now() - swSince; clearInterval(swT); swT = null; } else { swSince = Date.now(); swT = setInterval(() => { if ($('#swClock')) $('#swClock').textContent = swText(); }, 100); } $('#swToggle').textContent = swT ? 'Pause' : 'Start'; };
    $('#swReset').onclick = () => { clearInterval(swT); swT = null; swAcc = 0; if ($('#swClock')) $('#swClock').textContent = '0:00.0'; $('#swToggle').textContent = 'Start'; };
    $$('[data-tm]', m).forEach((b) => (b.onclick = () => { const n = +b.dataset.tm; addReminder(`⏱ ${n}-minute timer`, Date.now() + n * 60000, null); toast(`Timer set for ${n} min`); }));
    // password
    $('#pwGen').onclick = () => { const len = Math.max(6, Math.min(64, +$('#pwLen').value || 16)); const cs = 'abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789!@#$%&*?'; const a = new Uint32Array(len); crypto.getRandomValues(a); const pw = [...a].map((x) => cs[x % cs.length]).join(''); $('#pwOut').textContent = pw; copyText(pw, "Copied to clipboard"); };
    // countdowns
    $('#cdAdd').onclick = () => { const t = $('#cdT').value.trim(), d = $('#cdD').value; if (!t || !d) { toast('Add a name and date'); return; } (db.countdowns = db.countdowns || []).push({ id: uid('cd'), title: t, date: +new Date(d + 'T00:00:00') }); save(); react('write'); render(); };
    enableSwipe(m, (id) => { db.countdowns = (db.countdowns || []).filter((x) => x.id !== id); save(); render(); }, 'countdowns');
    // SAP codes
    $('#sapAdd').onclick = () => { const code = $('#sapC').value.trim(); if (!code) return; (db.settings.sapCodes = db.settings.sapCodes || []).push({ code, label: $('#sapL').value.trim() }); save(); render(); };
    $$('[data-cp]', m).forEach((b) => (b.onclick = () => { const c = (db.settings.sapCodes || [])[+b.dataset.cp]; if (c) { copyText(c.code, 'Copied ' + c.code); } }));
    $$('[data-sx]', m).forEach((b) => (b.onclick = () => { (db.settings.sapCodes || []).splice(+b.dataset.sx, 1); save(); render(); }));
  }
  const swText = () => { const ms = swAcc + (swT ? Date.now() - swSince : 0); const t = Math.floor(ms / 100); return `${Math.floor(t / 600)}:${String(Math.floor(t / 10) % 60).padStart(2, '0')}.${t % 10}`; };

  // ---- Breathe: 4-7-8 guided breathing
  let breatheT = null;
  function renderBreathe(m) {
    m.innerHTML = `<div class="sec-title">Breathe</div>
      <div class="card" style="text-align:center;padding:26px 16px">
        <div class="breathe-stage"><div class="breathe-orb" id="brOrb"></div><div class="breathe-label" id="brLabel">Ready</div></div>
        <div class="muted" id="brCount" style="margin:8px 0 14px;min-height:20px"></div>
        <button class="btn block" id="brGo">Start 4-7-8</button>
        <div class="muted small" style="margin-top:10px">Inhale 4s · hold 7s · exhale 8s. A calming reset in under two minutes.</div>
      </div>`;
    const orb = $('#brOrb'), label = $('#brLabel'), count = $('#brCount'), go = $('#brGo');
    const phases = [['Breathe in', 4, 'in'], ['Hold', 7, 'hold'], ['Breathe out', 8, 'out']];
    let pi = 0, left = 0, cycles = 0;
    const stop = () => { clearInterval(breatheT); breatheT = null; orb.className = 'breathe-orb'; label.textContent = 'Ready'; count.textContent = cycles ? `${cycles} cycle${cycles > 1 ? 's' : ''} done 🌿` : ''; go.textContent = 'Start 4-7-8'; };
    const tick = () => {
      if (left <= 0) {
        if (pi === 2) cycles++;
        pi = (pi + 1) % 3; const [txt, secs, cls] = phases[pi]; left = secs;
        label.textContent = txt; orb.className = 'breathe-orb ' + cls; buzz(14);
        if (cycles >= 4) { stop(); label.textContent = 'Well done 🌿'; return; }
      }
      count.textContent = left; left--;
    };
    go.onclick = () => { if (breatheT) return stop(); pi = -1; left = 0; cycles = 0; go.textContent = 'Stop'; tick(); breatheT = setInterval(tick, 1000); };
  }

  // ---- Global search across everything
  function openSearch() {
    const ov = document.createElement('div'); ov.className = 'search-ov'; ov.id = 'searchOv';
    ov.innerHTML = `<div class="search-top"><input id="sqIn" placeholder="Search tasks, reminders, notes…" autocomplete="off"><button class="btn ghost" id="sqX">Cancel</button></div><div id="sqResults" class="search-results"></div>`;
    document.body.appendChild(ov); requestAnimationFrame(() => ov.classList.add('show'));
    const inp = $('#sqIn', ov); setTimeout(() => inp.focus(), 60);
    const close = () => { ov.classList.remove('show'); setTimeout(() => ov.remove(), 200); };
    $('#sqX', ov).onclick = close;
    const run = () => {
      const q = inp.value.trim().toLowerCase();
      if (!q) { $('#sqResults', ov).innerHTML = '<div class="empty">Type to search across everything.</div>'; return; }
      const hit = (s) => String(s || '').toLowerCase().includes(q);
      const res = [];
      db.tasks.filter((t) => hit(t.text)).forEach((t) => res.push(['tasks', '✅', t.text, t.done ? 'done' : 'task']));
      db.reminders.filter((r) => hit(r.text)).forEach((r) => res.push(['reminders', r.alarm ? '⏰' : '🔔', r.text, whenLabel(r.at, r.repeat)]));
      db.notes.filter((n) => hit(n.text)).forEach((n) => res.push(['notes', '📝', n.text, 'note']));
      (db.reading || []).filter((r) => hit(r.title) || hit(r.url)).forEach((r) => res.push(['reading', '📖', r.title, 'link']));
      (db.journal || []).filter((j) => hit(j.text)).forEach((j) => res.push(['journal', '📓', j.text, new Date(j.t).toLocaleDateString()]));
      (db.expenses || []).filter((e) => hit(e.note)).forEach((e) => res.push(['money', '💸', e.note || 'Expense', money(e.amount)]));
      (db.countdowns || []).filter((c) => hit(c.title)).forEach((c) => res.push(['tools', '⏳', c.title, 'countdown']));
      $('#sqResults', ov).innerHTML = res.length ? res.slice(0, 40).map(([v, ic, t, s]) => `<div class="item sq-hit" data-v="${v}"><div style="width:26px;text-align:center">${ic}</div><div class="tx"><div class="t">${esc(String(t).slice(0, 80))}</div><div class="s">${esc(s)}</div></div></div>`).join('') : '<div class="empty">No matches.</div>';
      $$('.sq-hit', ov).forEach((el) => (el.onclick = () => { close(); go(el.dataset.v); }));
    };
    inp.addEventListener('input', run); run();
  }

  // ---- Daily brief + share
  function briefText() {
    const tEnd = new Date(); tEnd.setHours(23, 59, 59, 999);
    const open = db.tasks.filter((t) => !t.done);
    const due = open.filter((t) => t.due && t.due <= +tEnd);
    const rem = db.reminders.filter((r) => !r.done && r.at <= +tEnd && r.at >= Date.now());
    const w = db.habits.find((h) => h.id === 'water'); const wn = w ? (w.log[todayKey()] || 0) : 0, wt = w ? w.target : 8;
    const lines = [];
    lines.push(`${open.length} open task${open.length !== 1 ? 's' : ''}${due.length ? ` (${due.length} due today)` : ''}.`);
    lines.push(`${rem.length} reminder${rem.length !== 1 ? 's' : ''} left today.`);
    if (w) lines.push(`Water ${wn}/${wt}.`);
    if (due[0]) lines.push(`First up: ${due[0].text}.`);
    else if (open[0]) lines.push(`Top task: ${open[0].text}.`);
    return lines.join(' ');
  }
  function shareToday() {
    const tEnd = new Date(); tEnd.setHours(23, 59, 59, 999);
    const open = db.tasks.filter((t) => !t.done);
    const rem = db.reminders.filter((r) => !r.done && r.at <= +tEnd);
    const txt = [`Nova — ${new Date().toLocaleDateString([], { weekday: 'long', day: 'numeric', month: 'long' })}`, '',
      'Tasks:', ...(open.length ? open.map((t) => `• ${t.text}${t.due ? ' (' + whenLabel(t.due) + ')' : ''}`) : ['• (none)']),
      '', 'Reminders:', ...(rem.length ? rem.map((r) => `• ${r.text} — ${fmtTime(r.at)}`) : ['• (none)'])].join('\n');
    if (navigator.share) navigator.share({ title: 'My day', text: txt }).catch(() => {});
    else { copyText(txt, 'Copied your day to clipboard', 'Could not copy'); }
  }

  // ---- Habit streaks
  function streakOf(h) {
    let cur = 0, best = 0, run = 0;
    for (let i = 0; i < 400; i++) {
      const k = todayKey(new Date(Date.now() - i * 864e5));
      const met = (h.log[k] || 0) >= (h.target || 1);
      if (met) { run++; best = Math.max(best, run); if (i === cur) cur = run; }
      else { if (i === 0) { /* today not done yet — streak may still be yesterday's */ } run = 0; }
    }
    // recompute current from today backwards
    cur = 0; for (let i = 0; i < 400; i++) { const k = todayKey(new Date(Date.now() - i * 864e5)); if ((h.log[k] || 0) >= (h.target || 1)) cur++; else if (i > 0) break; else break; }
    return { cur, best };
  }

  // ---- Task templates
  const TEMPLATES = {
    'Meeting notes (MOM)': 'Meeting: \nDate: \nAttendees: \n\nAgenda:\n- \n\nDiscussion:\n- \n\nDecisions:\n- \n\nAction items (owner — due):\n- \n\nOpen points:\n- ',
    'Daily plan': 'Top 3 for today:\n1. \n2. \n3. \n\nMeetings:\n- \n\nNotes:\n- ',
    'Standup': 'Yesterday:\n- \n\nToday:\n- \n\nBlockers:\n- '
  };

  // ---- Task edit sheet (rename, reschedule, priority, pin, repeat, subtasks, delete)
  function taskEditSheet(id) {
    const t = db.tasks.find((x) => x.id === id); if (!t) return;
    const chip = (lbl, val, cur) => `<button data-due="${val}" class="${cur ? 'on' : ''}">${lbl}</button>`;
    openSheet('Edit task', `
      <div class="field"><label>Task</label><input id="teName" value="${esc(t.text)}"></div>
      <label class="muted small">When</label>
      <div class="chips" id="teDue">${chip('Today', 'today', false)}${chip('Tomorrow', 'tmr', false)}${chip('Next week', 'week', false)}${chip('No date', 'clear', !t.due)}</div>
      <label class="muted small">Priority</label>
      <div class="pill-row" id="tePri">${['low', 'normal', 'high'].map((p) => `<button data-pri="${p}" class="${(t.priority || 'normal') === p ? 'on' : ''}">${p[0].toUpperCase() + p.slice(1)}</button>`).join('')}</div>
      <label class="muted small">Repeat</label>
      <div class="pill-row" id="teRep">${[['', 'Once'], ['daily', 'Daily'], ['weekdays', 'Weekdays'], ['weekly', 'Weekly'], ['monthly', 'Monthly']].map(([v, l]) => `<button data-rep="${v}" class="${(t.repeat || '') === v ? 'on' : ''}">${l}</button>`).join('')}</div>
      <label class="muted small">Pin to top</label>
      <div class="pill-row"><button id="tePin" class="${t.pinned ? 'on' : ''}">${t.pinned ? '📌 Pinned' : '📌 Pin'}</button></div>
      <label class="muted small">Subtasks</label>
      <div id="teSubs">${(t.subs || []).map((s, k) => `<div class="item"><div class="chk ${s.done ? 'on' : ''}" data-sub="${k}">${s.done ? '✓' : ''}</div><div class="tx"><div class="t" style="${s.done ? 'text-decoration:line-through;color:var(--muted)' : ''}">${esc(s.text)}</div></div><button class="btn ghost" data-subx="${k}" style="padding:4px 10px">✕</button></div>`).join('')}</div>
      <div class="row"><input id="teSubAdd" placeholder="+ add subtask"></div>
      <div class="row" style="margin-top:14px;gap:8px"><button class="btn" id="teSave" style="flex:1">Save</button><button class="btn ghost" id="teDel">Delete</button></div>`, () => {
      let dueSel = t.due ? null : 'clear', pri = t.priority || 'normal', rep = t.repeat || '', pinned = !!t.pinned;
      const subs = (t.subs || []).slice();
      $$('#teDue button').forEach((b) => (b.onclick = () => { dueSel = b.dataset.due; $$('#teDue button').forEach((x) => x.classList.toggle('on', x === b)); }));
      $$('#tePri button').forEach((b) => (b.onclick = () => { pri = b.dataset.pri; $$('#tePri button').forEach((x) => x.classList.toggle('on', x === b)); }));
      $$('#teRep button').forEach((b) => (b.onclick = () => { rep = b.dataset.rep; $$('#teRep button').forEach((x) => x.classList.toggle('on', x === b)); }));
      $('#tePin').onclick = () => { pinned = !pinned; $('#tePin').classList.toggle('on', pinned); $('#tePin').textContent = pinned ? '📌 Pinned' : '📌 Pin'; };
      const rewireSubs = () => {
        $('#teSubs').innerHTML = subs.map((s, k) => `<div class="item"><div class="chk ${s.done ? 'on' : ''}" data-sub="${k}">${s.done ? '✓' : ''}</div><div class="tx"><div class="t" style="${s.done ? 'text-decoration:line-through;color:var(--muted)' : ''}">${esc(s.text)}</div></div><button class="btn ghost" data-subx="${k}" style="padding:4px 10px">✕</button></div>`).join('');
        $$('#teSubs [data-sub]').forEach((c) => (c.onclick = () => { subs[+c.dataset.sub].done = !subs[+c.dataset.sub].done; rewireSubs(); }));
        $$('#teSubs [data-subx]').forEach((b) => (b.onclick = () => { subs.splice(+b.dataset.subx, 1); rewireSubs(); }));
      };
      rewireSubs();
      $('#teSubAdd').addEventListener('keydown', (e) => { if (e.key === 'Enter' && e.target.value.trim()) { subs.push({ text: e.target.value.trim(), done: false }); e.target.value = ''; rewireSubs(); } });
      $('#teSave').onclick = () => {
        t.text = $('#teName').value.trim() || t.text;
        if (dueSel === 'clear') t.due = null; else if (dueSel === 'today') t.due = atDayHour(0, 18); else if (dueSel === 'tmr') t.due = atDayHour(1, 18); else if (dueSel === 'week') t.due = atDayHour(7, 18);
        t.priority = pri; t.repeat = rep || null; t.pinned = pinned; t.subs = subs;
        save(); closeSheet(); render();
      };
      $('#teDel').onclick = () => { db.tasks = db.tasks.filter((x) => x.id !== id); save(); closeSheet(); render(); };
    });
  }
  const atDayHour = (addDays, h) => { const d = new Date(); d.setDate(d.getDate() + addDays); d.setHours(h, 0, 0, 0); return +d; };
  function nextOccurrence(due, repeat) {
    const d = new Date(due || Date.now());
    if (repeat === 'daily') d.setDate(d.getDate() + 1);
    else if (repeat === 'weekly') d.setDate(d.getDate() + 7);
    else if (repeat === 'monthly') d.setMonth(d.getMonth() + 1);
    else if (repeat === 'weekdays') { do { d.setDate(d.getDate() + 1); } while (d.getDay() === 0 || d.getDay() === 6); }
    else return null;
    return +d;
  }
  function habitEditSheet(id) {
    const h = db.habits.find((x) => x.id === id); if (!h) return;
    openSheet('Edit habit', `<div class="field"><label>Name</label><input id="heN" value="${esc(h.name)}"></div>
      <div class="ob-two"><div class="field"><label>Icon</label><input id="heI" value="${esc(h.icon || '⭐')}" maxlength="2"></div><div class="field"><label>Daily target</label><input id="heT" type="number" min="1" value="${h.target || 1}"></div></div>
      <div class="row" style="gap:8px"><button class="btn" id="heSave" style="flex:1">Save</button>${h.id === 'water' ? '' : '<button class="btn ghost" id="heDel">Delete</button>'}</div>`, () => {
      $('#heSave').onclick = () => { h.name = $('#heN').value.trim() || h.name; h.icon = $('#heI').value || h.icon; h.target = +$('#heT').value || 1; save(); closeSheet(); render(); };
      $('#heDel') && ($('#heDel').onclick = () => { db.habits = db.habits.filter((x) => x.id !== id); save(); closeSheet(); render(); });
    });
  }

  // ---- More menu
  function renderMore(m) {
    const items = [['tools', '🧰', 'Tools'], ['breathe', '🫧', 'Breathe'], ['insights', '📊', 'Insights'], ['habits', '💧', 'Habits'], ['notes', '📝', 'Notes'], ['reading', '📖', 'Reading list'], ['checklists', '☑️', 'Checklists'], ['money', '💸', 'Money'], ['journal', '📓', 'Journal'], ['focus', '🎯', 'Focus'], ['review', '📅', 'Weekly review']];
    const acct = ACCT() && window.NovaAccount;
    const L = db.settings.lock;
    const hasPin = acct ? !!(window.NovaAccount.hasPinLocally && window.NovaAccount.hasPinLocally()) : !!L;
    const pinLenVal = acct ? (window.NovaAccount.pinLen ? window.NovaAccount.pinLen() : 4) : (L ? L.len : 4);
    m.innerHTML = `<div class="sec-title">More</div><div class="card" style="padding:4px 14px">${items.map(([v, i, l]) => `<div class="item" data-v="${v}"><div style="font-size:22px;width:30px">${i}</div><div class="tx"><div class="t">${l}</div></div><div class="muted">›</div></div>`).join('')}</div>
      <div class="card"><h3>🔒 Security</h3><div class="muted small" style="margin-bottom:10px">${hasPin ? `A ${pinLenVal}-digit PIN ${acct ? 'unlocks your account on every device.' : 'protects Nova.'}` : 'No PIN set — anyone with your phone can open Nova.'}</div>
        <div class="row" style="gap:8px;flex-wrap:wrap"><button class="btn ghost" id="secPin">${hasPin ? 'Change PIN' : 'Set a PIN'}</button>${(hasPin && !acct) ? '<button class="btn ghost" id="secOff">Turn off</button>' : ''}</div>
        ${hasPin ? `<div class="field" style="margin-top:12px"><label>Auto-lock after</label><select id="secAuto">${[[0, 'Immediately'], [1, '1 min'], [5, '5 min'], [15, '15 min'], [60, '1 hour']].map(([v, t]) => `<option value="${v}" ${(db.settings.autoLockMin || 5) === v ? 'selected' : ''}>${t}</option>`).join('')}</select></div>` : ''}</div>
      <div class="card"><h3>Your data</h3><div class="muted small" style="margin-bottom:10px">Everything stays on this device. Back it up, or move it to another phone/tablet.</div>
        <div class="row" style="gap:8px;flex-wrap:wrap"><button class="btn ghost" id="exp">Export file</button><button class="btn ghost" id="imp">Import file</button></div>
        <div class="muted small" style="margin:12px 0 6px"><b>Move to another device</b> — encrypted sync code:</div>
        <div class="row" style="gap:8px;flex-wrap:wrap"><button class="btn ghost" id="syncOut">Create sync code</button><button class="btn ghost" id="syncIn">Enter sync code</button></div></div>
      ${ACCT() ? `<div class="card"><h3>👤 Account</h3><div class="muted small" style="margin-bottom:10px">Signed in as <b>${esc((window.NovaAccount.email && NovaAccount.email()) || '—')}</b>. Your data syncs to every device you sign in on. PIN unlocks day-to-day.</div>
        <div class="row" style="gap:8px;flex-wrap:wrap"><button class="btn" id="acctSync">Sync now</button><button class="btn ghost" id="acctSwitch">Switch account</button></div></div>`
      : `<div class="card"><h3>☁️ Cloud sync (Supabase)</h3><div class="muted small" style="margin-bottom:10px">${window.NovaSync && NovaSync.isOn() ? 'Connected. Your data is end-to-end encrypted — Supabase only stores ciphertext.' : 'Keep this phone and your other devices in sync through your own Supabase project. End-to-end encrypted.'}</div>
        <div class="row" style="gap:8px;flex-wrap:wrap">${window.NovaSync && NovaSync.isOn() ? '<button class="btn" id="cloudNow">Sync now</button><button class="btn ghost" id="cloudCfg">Settings</button>' : '<button class="btn" id="cloudCfg">Set up</button>'}</div></div>`}
      <div class="card"><h3>🔊 Voice (ElevenLabs)</h3>
        <div class="muted small" style="margin-bottom:10px">Read the daily brief and reminders aloud in a natural voice. The key stays on this phone only (not synced).</div>
        <label class="row" style="justify-content:space-between;margin-bottom:10px"><span>Use ElevenLabs voice</span><input type="checkbox" id="elOn" ${elCfg().on ? 'checked' : ''}></label>
        <div class="field"><label>API key</label><input id="elKey" type="password" placeholder="sk_… or xi-…" value="${esc(elCfg().key || '')}"></div>
        <div class="field"><label>Voice</label><div class="row"><select id="elVoice" style="flex:1"><option value="">— load voices —</option></select><button class="btn ghost" id="elLoad">Load</button></div></div>
        <div class="field"><label>Model</label><select id="elModel"><option value="eleven_turbo_v2_5">Turbo v2.5 — fast</option><option value="eleven_multilingual_v2">Multilingual v2 — richest</option><option value="eleven_flash_v2_5">Flash v2.5 — fastest</option></select></div>
        <div class="muted small" id="elMsg" style="min-height:16px"></div>
        <div class="row" style="gap:8px"><button class="btn" id="elSave">Save</button><button class="btn ghost" id="elTest">Test voice</button></div>
      </div>
      <div class="card"><div class="field"><label>Your name</label><input id="stName" value="${esc(db.settings.name)}" placeholder="What should Nova call you?"></div><div class="field"><label>Currency symbol</label><input id="stCur" value="${esc(db.settings.currency)}" maxlength="3" style="max-width:100px"></div><button class="btn block" id="stSave">Save</button></div>
      <div class="muted small" style="text-align:center;padding:10px">Nova · v1.3 · private &amp; offline</div>`;
    $$('[data-v]', m).forEach((e) => (e.onclick = () => go(e.dataset.v)));
    $('#exp').onclick = exportData; $('#imp').onclick = importData;
    $('#secPin').onclick = () => changePinFlow();
    $('#secOff') && ($('#secOff').onclick = () => { db.settings.lock = null; save(); toast('PIN removed'); render(); });
    $('#secAuto') && ($('#secAuto').onchange = (e) => { db.settings.autoLockMin = +e.target.value; save(); });
    $('#syncOut').onclick = () => syncCreate();
    $('#syncIn').onclick = () => syncImport();
    $('#cloudCfg') && ($('#cloudCfg').onclick = () => cloudConfig());
    $('#cloudNow') && ($('#cloudNow').onclick = () => cloudSync(true));
    $('#acctSync') && ($('#acctSync').onclick = async () => { toast('Syncing…'); try { await window.NovaAccount.pushData(db); toast('Synced ☁️'); } catch (e) { toast('Sync failed'); } });
    $('#acctSwitch') && ($('#acctSwitch').onclick = () => { openSheet('Switch account?', `<p class="muted" style="margin-bottom:14px">This signs you out on this device. Your data stays safe in your account — sign back in any time.</p><button class="btn block" id="swGo">Sign out &amp; switch</button><button class="btn ghost block" id="swCancel" style="margin-top:8px">Cancel</button>`, () => { $('#swGo').onclick = async () => { await window.NovaAccount.signOut(); try { localStorage.removeItem(KEY); } catch (e) {} location.reload(); }; $('#swCancel').onclick = closeSheet; }); });
    $('#stSave').onclick = () => { db.settings.name = $('#stName').value.trim(); db.settings.currency = $('#stCur').value.trim() || '₹'; save(); greet(); toast('Saved'); };
    // ElevenLabs voice
    { const c = elCfg(); if (c.voice) { const o = document.createElement('option'); o.value = c.voice; o.textContent = c.voiceName || '(saved voice)'; o.selected = true; $('#elVoice', m).appendChild(o); } if (c.model) $('#elModel', m).value = c.model; }
    $('#elLoad', m) && ($('#elLoad', m).onclick = async () => {
      const key = $('#elKey', m).value.trim(); if (!key) { $('#elMsg', m).textContent = 'Enter your API key first.'; return; }
      $('#elMsg', m).textContent = 'Loading voices…';
      try { const vs = await elLoadVoices(key); if (!vs) { $('#elMsg', m).textContent = 'Could not load — check the key.'; return; }
        const cur = $('#elVoice', m).value || elCfg().voice || '';
        $('#elVoice', m).innerHTML = vs.map((v) => `<option value="${esc(v.id)}">${esc(v.name)}</option>`).join('');
        if (cur) $('#elVoice', m).value = cur;
        $('#elMsg', m).textContent = `${vs.length} voices loaded.`;
      } catch (e) { $('#elMsg', m).textContent = 'Could not load voices.'; }
    });
    $('#elSave', m) && ($('#elSave', m).onclick = () => {
      const sel = $('#elVoice', m); const voiceName = sel.options[sel.selectedIndex] ? sel.options[sel.selectedIndex].textContent : '';
      setElCfg({ on: $('#elOn', m).checked, key: $('#elKey', m).value.trim(), voice: sel.value, voiceName, model: $('#elModel', m).value });
      toast('Voice saved');
    });
    $('#elTest', m) && ($('#elTest', m).onclick = () => {
      const sel = $('#elVoice', m); setElCfg({ on: $('#elOn', m).checked, key: $('#elKey', m).value.trim(), voice: sel.value, voiceName: sel.options[sel.selectedIndex] ? sel.options[sel.selectedIndex].textContent : '', model: $('#elModel', m).value });
      $('#elMsg', m).textContent = 'Speaking…'; speak(`Hi ${db.settings.name || 'there'}, this is your Nova voice.`); setTimeout(() => $('#elMsg', m) && ($('#elMsg', m).textContent = ''), 2500);
    });
  }

  // ---- change / set PIN ----
  function changePinFlow() {
    const hasPin = ACCT() ? (window.NovaAccount.hasPinLocally && window.NovaAccount.hasPinLocally()) : !!db.settings.lock;
    openSheet(hasPin ? 'Change PIN' : 'Set a PIN', `
      <div class="ob-chips big" style="justify-content:center;margin-bottom:12px"><button class="ob-chip on" data-pl="4">4 digits</button><button class="ob-chip" data-pl="6">6 digits</button></div>
      <div class="field"><label>New PIN</label><input id="cpPin" inputmode="numeric" maxlength="4" style="text-align:center;letter-spacing:.5em;font-size:22px"></div>
      <div class="field"><label>Confirm</label><input id="cpPin2" inputmode="numeric" maxlength="4" style="text-align:center;letter-spacing:.5em;font-size:22px"></div>
      <div class="lock-err" id="cpErr"></div>
      <button class="btn block" id="cpSave">Save PIN</button>`, () => {
      let L = 4; $$('#sheetCard [data-pl]').forEach((b) => (b.onclick = () => { L = +b.dataset.pl; $$('#sheetCard [data-pl]').forEach((x) => x.classList.toggle('on', x === b)); $('#cpPin').maxLength = L; $('#cpPin2').maxLength = L; }));
      ['#cpPin', '#cpPin2'].forEach((id) => $(id).addEventListener('input', (e) => { e.target.value = e.target.value.replace(/\D/g, ''); }));
      $('#cpSave').onclick = async () => { const a = $('#cpPin').value, b = $('#cpPin2').value; if (a.length !== L) return $('#cpErr').textContent = `Enter a ${L}-digit PIN`; if (a !== b) return $('#cpErr').textContent = 'PINs don’t match'; if (ACCT() && window.NovaAccount) { const r = await window.NovaAccount.setPin(a); if (r && r.synced === false) toast('PIN set on this device (cloud sync off)'); else toast('PIN updated'); } else { await setPin(a); toast('PIN updated'); } closeSheet(); render(); };
    });
  }

  // ---- encrypted cross-device sync (passphrase-protected transfer code) ----
  async function deriveKey(pass, salt) {
    const base = await crypto.subtle.importKey('raw', new TextEncoder().encode(pass), 'PBKDF2', false, ['deriveKey']);
    return crypto.subtle.deriveKey({ name: 'PBKDF2', salt, iterations: 120000, hash: 'SHA-256' }, base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
  }
  const b64 = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf)));
  const unb64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
  function syncCreate() {
    openSheet('Create sync code', `<p class="muted" style="margin-bottom:12px">Pick a pass-phrase, then copy the code onto your other device (More → Enter sync code). Your data is encrypted — the code is useless without the phrase.</p>
      <div class="field"><label>Pass-phrase</label><input id="scPass" placeholder="e.g. a few words only you know"></div>
      <button class="btn block" id="scGo">Create code</button><div id="scOut" style="margin-top:12px"></div>`, () => {
      $('#scGo').onclick = async () => {
        const pass = $('#scPass').value.trim(); if (pass.length < 4) return toast('Use a longer phrase');
        const salt = crypto.getRandomValues(new Uint8Array(16)), iv = crypto.getRandomValues(new Uint8Array(12));
        const key = await deriveKey(pass, salt);
        const data = new TextEncoder().encode(JSON.stringify(db));
        const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, data);
        const code = 'NOVA1.' + b64(salt) + '.' + b64(iv) + '.' + b64(ct);
        $('#scOut').innerHTML = `<textarea readonly rows="4" style="font-size:11px;word-break:break-all" id="scCode">${code}</textarea><button class="btn block" id="scCopy" style="margin-top:8px">Copy code</button>`;
        $('#scCopy').onclick = () => { copyText(code, 'Copied — paste it on your other device'); };
      };
    });
  }
  function syncImport() {
    openSheet('Enter sync code', `<p class="muted" style="margin-bottom:12px">Paste the code from your other device and enter the same pass-phrase. This replaces the data on this device.</p>
      <div class="field"><label>Sync code</label><textarea id="siCode" rows="4" style="font-size:11px" placeholder="NOVA1…."></textarea></div>
      <div class="field"><label>Pass-phrase</label><input id="siPass"></div>
      <div class="lock-err" id="siErr"></div><button class="btn block" id="siGo">Restore on this device</button>`, () => {
      $('#siGo').onclick = async () => {
        try {
          const parts = $('#siCode').value.trim().split('.'); if (parts[0] !== 'NOVA1' || parts.length !== 4) throw 0;
          const key = await deriveKey($('#siPass').value, unb64(parts[1]));
          const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64(parts[2]) }, key, unb64(parts[3]));
          const incoming = JSON.parse(new TextDecoder().decode(pt));
          db = { ...structuredClone(DEFAULTS), ...incoming }; save(); closeSheet(); toast('Synced! Your data is here.'); applyPersonalization(); render();
        } catch (e) { $('#siErr').textContent = 'Could not read that — check the code and pass-phrase.'; }
      };
    });
  }

  // ---- Supabase cloud sync ----
  function cloudConfig() {
    const c = (window.NovaSync && NovaSync.getConfig()) || {};
    openSheet('Cloud sync (Supabase)', `<p class="muted" style="margin-bottom:12px">From your Supabase project: Settings → API. Use the <b>same</b> account name &amp; pass-phrase on every device. Your pass-phrase never leaves this device.</p>
      <div class="field"><label>Project URL</label><input id="cfUrl" placeholder="https://xxxx.supabase.co" value="${esc(c.url || '')}"></div>
      <div class="field"><label>Anon public key</label><input id="cfKey" placeholder="eyJhbGciOi…" value="${esc(c.anonKey || '')}"></div>
      <div class="field"><label>Account name (any word, same on all devices)</label><input id="cfAcc" placeholder="raisa-nova" value="${esc(c.account || '')}"></div>
      <div class="field"><label>Pass-phrase (encrypts your data)</label><input id="cfPass" placeholder="a few words only you know" value="${esc(c.pass || '')}"></div>
      <div class="lock-err" id="cfErr"></div>
      <button class="btn block" id="cfSave">Connect &amp; sync</button>
      ${c.url ? '<button class="btn ghost block" id="cfOff" style="margin-top:8px">Disconnect</button>' : ''}`, () => {
      $('#cfSave').onclick = async () => {
        const url = $('#cfUrl').value.trim().replace(/\/+$/, ''), anonKey = $('#cfKey').value.trim(), account = $('#cfAcc').value.trim().replace(/[^a-zA-Z0-9_-]/g, ''), pass = $('#cfPass').value;
        if (!url || !anonKey || !account || pass.length < 4) return $('#cfErr').textContent = 'Fill everything (pass-phrase ≥ 4 chars).';
        NovaSync.configure({ url, anonKey, account, app: 'mobile', pass });
        $('#cfErr').textContent = 'Connecting…';
        try { await NovaSync.test(); closeSheet(); toast('Connected ☁️'); cloudSync(true); render(); }
        catch (e) { $('#cfErr').textContent = 'Could not reach Supabase — check URL/key and that the table exists.'; }
      };
      $('#cfOff') && ($('#cfOff').onclick = () => { NovaSync.clear(); closeSheet(); toast('Disconnected'); render(); });
    });
  }
  let cloudBusy = false;
  async function cloudSync(manual) {
    if (!window.NovaSync || !NovaSync.isOn() || cloudBusy) return;
    cloudBusy = true; if (manual) toast('Syncing…');
    try {
      const r = await NovaSync.syncNow(() => db, (obj) => { db = { ...structuredClone(DEFAULTS), ...obj }; save(); applyPersonalization(); });
      if (manual) toast(r.action === 'pulled' ? 'Updated from cloud ☁️' : 'Synced to cloud ☁️');
      if (r.action === 'pulled') render();
    } catch (e) { if (manual) toast('Sync failed — check settings'); }
    cloudBusy = false;
  }

  // ---- Insights: simple charts from your own data ----
  function renderInsights(m) {
    const days = [...Array(7)].map((_, i) => { const d = new Date(); d.setDate(d.getDate() - (6 - i)); return d; });
    const dk = (d) => todayKey(d);
    const focusByDay = days.map((d) => db.focus.sessions.filter((s) => dk(new Date(s.at)) === dk(d)).reduce((a, s) => a + s.min, 0));
    const doneByDay = days.map((d) => db.tasks.filter((t) => t.done && t.doneAt && dk(new Date(t.doneAt)) === dk(d)).length);
    const water = db.habits.find((h) => h.id === 'water');
    const waterByDay = days.map((d) => water ? (water.log[dk(d)] || 0) : 0);
    const streak = (h) => { let s = 0; for (let i = 0; ; i++) { const d = new Date(); d.setDate(d.getDate() - i); const v = h.log[dk(d)] || 0; if (v >= (h.target || 1)) s++; else if (i > 0) break; else break; } return s; };
    const bar = (vals, color, fmt) => { const max = Math.max(1, ...vals); return `<div class="ins-bars">${vals.map((v, i) => `<div class="ins-bcol"><div class="ins-bwrap"><div class="ins-bar" style="height:${Math.round(v / max * 100)}%;background:${color}"></div></div><div class="ins-blbl">${'SMTWTFS'[days[i].getDay()]}</div><div class="ins-bval">${fmt ? fmt(v) : v || ''}</div></div>`).join('')}</div>`; };
    const totalFocus = Math.round(focusByDay.reduce((a, b) => a + b, 0) / 60 * 10) / 10;
    const totalDone = doneByDay.reduce((a, b) => a + b, 0);
    m.innerHTML = `<div class="sec-title">Insights</div>
      <div class="mwboard" style="grid-template-columns:1fr 1fr">
        <div class="mw mw-tasks"><div class="mw-h"><span>✅ DONE · 7d</span></div><div class="mw-big">${totalDone}</div><div class="mw-sub">tasks completed</div></div>
        <div class="mw mw-tasks"><div class="mw-h"><span>🎯 FOCUS · 7d</span></div><div class="mw-big">${totalFocus}<span style="font-size:18px">h</span></div><div class="mw-sub">time focused</div></div>
      </div>
      <div class="card"><h3>Focus (minutes / day)</h3>${bar(focusByDay, '#2E8B57', (v) => v || '')}</div>
      <div class="card"><h3>Tasks completed</h3>${bar(doneByDay, 'var(--accent)')}</div>
      <div class="card"><h3>💧 Water (glasses / day)</h3>${bar(waterByDay, '#44C0FF')}</div>
      <div class="card"><h3>Habit streaks 🔥</h3>${db.habits.map((h) => `<div class="item"><div style="width:30px;font-size:20px">${h.icon || '⭐'}</div><div class="tx"><div class="t">${esc(h.name)}</div></div><div class="muted"><b style="color:var(--accent-d)">${streak(h)}</b> day${streak(h) !== 1 ? 's' : ''}</div></div>`).join('') || '<div class="empty">Add habits to build streaks.</div>'}</div>`;
  }
  function exportData() { const blob = new Blob([JSON.stringify(db, null, 2)], { type: 'application/json' }); const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'nova-mobile-backup.json'; a.click(); toast('Backup downloaded'); }
  function importData() { const inp = document.createElement('input'); inp.type = 'file'; inp.accept = 'application/json'; inp.onchange = () => { const f = inp.files[0]; if (!f) return; const r = new FileReader(); r.onload = () => { try { db = { ...structuredClone(DEFAULTS), ...JSON.parse(r.result) }; save(); applyTheme(); greet(); render(); toast('Imported ✓'); } catch (e) { toast('Could not read that file'); } }; r.readAsText(f); }; inp.click(); }

  // ---- swipe to delete
  function enableSwipe(root, onDelete, v) {
    $$('.item[data-id]', root).forEach((el) => {
      let sx = 0, dx = 0, dragging = false;
      el.addEventListener('touchstart', (e) => { sx = e.touches[0].clientX; dragging = true; }, { passive: true });
      el.addEventListener('touchmove', (e) => { if (!dragging) return; dx = e.touches[0].clientX - sx; if (dx < 0) { el.style.transform = `translateX(${Math.max(dx, -90)}px)`; const x = el.querySelector('.swipe-x'); if (x) x.style.opacity = Math.min(1, -dx / 70); } }, { passive: true });
      el.addEventListener('touchend', () => { dragging = false; if (dx < -70) { buzz(20); onDelete(el.dataset.id); } else { el.style.transform = ''; const x = el.querySelector('.swipe-x'); if (x) x.style.opacity = 0; } dx = 0; });
    });
  }

  // ---- Add sheet (FAB)
  function openSheet(title, html, wire) {
    $('#sheetCard').innerHTML = `<div class="sheet-grip"></div><h2>${esc(title)}</h2>${html}`;
    $('#sheet').classList.add('show'); if (wire) wire();
  }
  function closeSheet() { $('#sheet').classList.remove('show'); }
  $('#sheet').addEventListener('click', (e) => { if (e.target.id === 'sheet') closeSheet(); });
  function openAdd() {
    buzz();
    openSheet('Add', `<div class="pill-row" style="margin-bottom:14px"><button class="on" data-k="task">✅ Task</button><button data-k="reminder">🔔 Reminder</button><button data-k="note">📝 Note</button><button data-k="expense">💸 Expense</button><button data-k="reading">📖 Link</button></div><div id="addForm"></div>`, () => {
      const forms = {
        task: `<div class="field"><input id="aV" placeholder="Task (e.g. call Vivek tomorrow 5pm)"></div><button class="btn block" id="aGo">Add task</button>`,
        reminder: `<div class="field"><input id="aV" placeholder="Remind me to…"></div><div class="pill-row" id="aChips">${['in 30 min', 'in 1 hour', 'Tonight 8', 'Tomorrow 9'].map((c, i) => `<button data-c="${i}">${c}</button>`).join('')}</div>`,
        note: `<div class="field"><textarea id="aV" rows="3" placeholder="Note…"></textarea></div><button class="btn block" id="aGo">Save note</button>`,
        expense: `<div class="field"><input id="aV" type="number" inputmode="decimal" placeholder="Amount"></div><div class="field"><input id="aN" placeholder="On what?"></div><button class="btn block" id="aGo">Log expense</button>`,
        reading: `<div class="field"><input id="aV" placeholder="Paste a link"></div><button class="btn block" id="aGo">Save link</button>`
      };
      let kind = 'task';
      const draw = () => {
        $('#addForm').innerHTML = forms[kind];
        const done = () => { closeSheet(); render(); };
        if (kind === 'reminder') { const times = [() => Date.now() + 1800000, () => Date.now() + 3600000, () => atToday(20), () => atTomorrow(9)]; $$('#aChips button').forEach((b) => (b.onclick = () => { addReminder($('#aV').value.trim() || 'Reminder', times[+b.dataset.c](), ''); done(); })); }
        else $('#aGo').onclick = () => { const v = $('#aV').value.trim(); if (!v && kind !== 'expense') return; if (kind === 'task') addTask(v); else if (kind === 'note') { db.notes.push({ id: uid('n'), text: v, t: Date.now() }); save(); react('write'); } else if (kind === 'expense') { const a = parseFloat(v); if (!a) return; db.expenses.push({ id: uid('x'), amount: a, note: $('#aN').value.trim(), t: Date.now() }); save(); react('write'); } else if (kind === 'reading') { let u = v; if (!/^https?:/.test(u)) u = 'https://' + u; db.reading.push({ id: uid('rd'), url: u, title: u.replace(/^https?:\/\/(www\.)?/, '').slice(0, 50), read: false, t: Date.now() }); save(); react('write'); } done(); };
        setTimeout(() => $('#aV') && $('#aV').focus(), 60);
      };
      $$('#sheetCard .pill-row button').forEach((b) => (b.onclick = () => { kind = b.dataset.k; $$('#sheetCard .pill-row button').forEach((x) => x.classList.toggle('on', x === b)); draw(); }));
      draw();
    });
  }

  // ================= voice / dictation =================
  // Uses the NATIVE speech recogniser inside the Android app (reliable, on-device),
  // and the browser Web Speech API when running as a PWA / in a browser. A live
  // overlay shows the words as you speak and lets you fix a mis-hear before saving.
  const LANGS = [['en-IN', 'English (India)'], ['en-US', 'English (US)'], ['en-GB', 'English (UK)'], ['hi-IN', 'Hindi']];
  let dict = null; // { stop(), cancel() } for the active session

  function capPlugin(name) {
    const C = window.Capacitor;
    return (C && C.isNativePlatform && C.isNativePlatform() && C.Plugins && C.Plugins[name]) ? C.Plugins[name] : null;
  }

  $('#btnVoice').onclick = () => startDictation();

  function startDictation() {
    buzz();
    const native = capPlugin('SpeechRecognition');
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!native && !SR) {
      toast('Voice typing isn’t available here — opening quick add.');
      openAdd();
      return;
    }
    openDictOverlay(native ? 'native' : 'web');
  }

  function openDictOverlay(mode) {
    const lang = db.settings.voiceLang || 'en-IN';
    const wrap = document.createElement('div');
    wrap.id = 'dict';
    wrap.className = 'dict';
    wrap.innerHTML = `
      <div class="dict-card">
        <button class="dict-x" aria-label="Close">✕</button>
        <div class="dict-mic"><span class="mic-ring"></span><span class="mic-ico">🎙</span></div>
        <div class="dict-status" id="dictStatus">Starting…</div>
        <div class="dict-live" id="dictLive"></div>
        <textarea id="dictText" class="dict-text" rows="3" placeholder="Your words appear here — edit if needed, then Add."></textarea>
        <div class="dict-lang"><label>Language</label>
          <select id="dictLang">${LANGS.map(([v, n]) => `<option value="${v}"${v === lang ? ' selected' : ''}>${n}</option>`).join('')}</select>
        </div>
        <div class="dict-actions">
          <button id="dictStop" class="btn ghost">Stop</button>
          <button id="dictUse" class="btn block">Add</button>
        </div>
        <div class="dict-hint">Try “remind me to call Vivek tomorrow 9am”, “note …”, or just say the task.</div>
      </div>`;
    document.body.appendChild(wrap);
    requestAnimationFrame(() => wrap.classList.add('show'));

    const ta = wrap.querySelector('#dictText');
    const live = wrap.querySelector('#dictLive');
    const statusEl = wrap.querySelector('#dictStatus');
    const micBox = wrap.querySelector('.dict-mic');
    let userEdited = false;
    ta.addEventListener('input', () => { userEdited = true; });

    const setStatus = (s) => { statusEl.textContent = s; };
    const setListening = (on) => { micBox.classList.toggle('on', on); wrap.querySelector('#dictStop').textContent = on ? 'Stop' : 'Restart'; };
    // show final text in the editable box, interim text in the faint live line
    const show = (finalText, interim) => {
      if (!userEdited) ta.value = finalText;
      live.textContent = interim || '';
      ta.scrollTop = ta.scrollHeight;
    };

    function close() {
      if (dict) { try { dict.cancel(); } catch (e) {} dict = null; }
      wrap.classList.remove('show');
      setTimeout(() => wrap.remove(), 200);
    }
    function commit() {
      const text = ta.value.trim();
      if (dict) { try { dict.cancel(); } catch (e) {} dict = null; }
      wrap.classList.remove('show');
      setTimeout(() => wrap.remove(), 200);
      if (text) handleVoice(text);
      else toast('Nothing to add');
    }

    wrap.querySelector('.dict-x').onclick = close;
    wrap.addEventListener('click', (e) => { if (e.target === wrap) close(); });
    wrap.querySelector('#dictUse').onclick = commit;
    const stopBtn = wrap.querySelector('#dictStop');
    stopBtn.onclick = () => {
      if (dict && dict.listening) { dict.stop(); }
      else { userEdited = false; restart(); }
    };
    wrap.querySelector('#dictLang').onchange = (e) => {
      db.settings.voiceLang = e.target.value; save();
      userEdited = false; restart();
    };

    const api = { setStatus, setListening, show, getLang: () => db.settings.voiceLang || 'en-IN' };
    function restart() { if (dict) { try { dict.cancel(); } catch (e) {} } dict = (mode === 'native' ? runNative : runWeb)(api); }
    restart();
  }

  // ---- browser Web Speech API (PWA / Chrome) ----
  function runWeb(ui) {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    const rec = new SR();
    rec.lang = ui.getLang();
    rec.continuous = true;
    rec.interimResults = true;
    rec.maxAlternatives = 1;
    let finalText = '';
    const ctrl = { listening: true, stop() { ctrl.listening = false; try { rec.stop(); } catch (e) {} }, cancel() { ctrl.listening = false; try { rec.abort(); } catch (e) {} } };
    rec.onstart = () => { ui.setStatus('Listening… speak now'); ui.setListening(true); };
    rec.onresult = (e) => {
      let interim = '';
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const r = e.results[i];
        if (r.isFinal) finalText = joinText(finalText, r[0].transcript);
        else interim += r[0].transcript;
      }
      ui.show(finalText, interim);
    };
    rec.onerror = (e) => {
      if (e.error === 'no-speech' || e.error === 'aborted') return; // auto-restart handles these
      if (e.error === 'not-allowed' || e.error === 'service-not-allowed') { ui.setStatus('Microphone blocked — allow mic access in settings.'); ctrl.listening = false; ui.setListening(false); }
      else ui.setStatus('Hmm, didn’t catch that — keep going.');
    };
    rec.onend = () => {
      if (ctrl.listening) { try { rec.start(); } catch (e) {} } // keep going until the user taps Stop
      else { ui.setStatus(finalText ? 'Done — edit if needed, then Add.' : 'Stopped. Tap Restart to try again.'); ui.setListening(false); }
    };
    try { rec.start(); } catch (e) { ui.setStatus('Could not start the mic.'); ctrl.listening = false; ui.setListening(false); }
    return ctrl;
  }

  // ---- native Android recogniser (@capacitor-community/speech-recognition) ----
  function runNative(ui) {
    const SRP = capPlugin('SpeechRecognition');
    const ctrl = { listening: true, _sub: null, async stop() { ctrl.listening = false; try { await SRP.stop(); } catch (e) {} ui.setListening(false); ui.setStatus('Done — edit if needed, then Add.'); if (ctrl._sub && ctrl._sub.remove) { try { ctrl._sub.remove(); } catch (e) {} } }, async cancel() { ctrl.listening = false; try { await SRP.stop(); } catch (e) {} if (ctrl._sub && ctrl._sub.remove) { try { ctrl._sub.remove(); } catch (e) {} } } };
    (async () => {
      try {
        if (SRP.requestPermissions) await SRP.requestPermissions();
        else if (SRP.requestPermission) await SRP.requestPermission();
      } catch (e) {}
      try {
        ctrl._sub = await SRP.addListener('partialResults', (data) => {
          const m = (data && data.matches && data.matches[0]) || '';
          if (m) ui.show(m, '');
        });
      } catch (e) {}
      try {
        ui.setStatus('Listening… speak now'); ui.setListening(true);
        // Some plugin versions resolve start() only when recognition finishes and return the final matches.
        const res = await SRP.start({ language: ui.getLang(), maxResults: 1, partialResults: true, popup: false });
        if (res && res.matches && res.matches[0]) ui.show(res.matches[0], '');
        if (ctrl.listening) { ctrl.listening = false; ui.setListening(false); ui.setStatus('Done — edit if needed, then Add.'); }
      } catch (e) {
        ctrl.listening = false; ui.setListening(false);
        ui.setStatus('Voice error: ' + ((e && e.message) || 'could not start'));
      }
    })();
    return ctrl;
  }

  // join a new final chunk onto the running transcript without duplicating spaces
  function joinText(prev, next) {
    const a = prev.trim(), b = String(next).trim();
    if (!a) return b;
    if (!b) return a;
    return a + (/[.,!?;:]$/.test(a) ? ' ' : ' ') + b;
  }

  function handleVoice(t) {
    const low = t.toLowerCase();
    if (/^(remind|reminder|alarm)/.test(low) || (/\b(in \d|tomorrow|tonight|at \d)/.test(low) && /remind/.test(low))) { const w = parseWhen(low.replace(/^remind me/, '')); if (w.at) { addReminder(w.text || t, +w.at, ''); go('reminders'); return; } }
    if (/^(add task|task|to-?do|i need to|i have to)/.test(low)) { addTask(t.replace(/^(add task|task|to-?do|i need to|i have to)\s*/i, '')); go('tasks'); return; }
    if (/^(note|remember)/.test(low)) { db.notes.push({ id: uid('n'), text: t.replace(/^(note|remember)( that)?[:,\s]*/i, ''), t: Date.now() }); save(); react('write', 'Noted.'); go('notes'); return; }
    const w = parseWhen(low); if (w.at) { addReminder(w.text || t, +w.at, ''); go('reminders'); return; }
    addTask(t); go('tasks'); // default: task
  }

  // ---- greeting
  function greet() {
    const h = new Date().getHours(); const part = h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
    $('#greetHi').textContent = `${part}${db.settings.name ? ', ' + db.settings.name : ''}`;
    const open = db.tasks.filter((t) => !t.done).length; const tEnd = new Date(); tEnd.setHours(23, 59, 59, 999);
    const rem = db.reminders.filter((r) => !r.done && r.at <= +tEnd).length;
    $('#greetSub').textContent = open || rem ? `${open} task${open !== 1 ? 's' : ''} · ${rem} reminder${rem !== 1 ? 's' : ''} today` : 'All clear today 🎉';
  }
  $('#bot').parentElement.onclick = () => { react('wave', pickTip()); buzz(); };
  function pickTip() { const tips = ['Tap ＋ to add anything fast.', 'Swipe a task left to delete it.', 'Try the 🎙 button to add by voice.', 'Long trips? Make a reusable checklist.', 'Drink some water? 💧']; return tips[Math.floor(Math.random() * tips.length)]; }

  // ---- install hint
  let deferredPrompt = null;
  window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); deferredPrompt = e; });
  function isStandalone() { return matchMedia('(display-mode: standalone)').matches || window.navigator.standalone; }
  function installHint() {
    if (isStandalone() || db.settings.notified) return '';
    const iOS = /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    return `<div class="install-hint" id="instHint">${deferredPrompt ? '📲 <b>Install Nova</b> for a full-screen app. <button class="btn" id="instBtn" style="margin-top:8px">Install</button>' : iOS ? '📲 <b>Add to Home Screen:</b> tap the Share button, then “Add to Home Screen”.' : '📲 Add Nova to your home screen from the browser menu for the full app.'}<br><button class="btn ghost" id="instDismiss" style="margin-top:8px;padding:6px 12px">Dismiss</button></div>`;
  }
  document.addEventListener('click', (e) => {
    if (e.target.id === 'instBtn' && deferredPrompt) { deferredPrompt.prompt(); deferredPrompt = null; }
    if (e.target.id === 'instDismiss') { db.settings.notified = true; save(); render(); }
  });

  // ---- tabs
  $$('#tabs button').forEach((b) => (b.onclick = () => { if (b.dataset.tab === 'add') return openAdd(); buzz(8); go(b.dataset.tab); }));

  // ---- boot (gated by onboarding + PIN lock)
  function startApp() {
    applyPersonalization();
    ensureNotify();
    greet(); go('today'); tickReminders();
    scheduleAllNotifications();
    handleShared();
    setTimeout(() => { try { cloudSync(false); } catch (e) {} }, 1500);
  }
  // "Share to Nova": text/links shared from other apps arrive as URL params
  function handleShared() {
    try {
      const p = new URLSearchParams(location.search);
      const shared = [p.get('text'), p.get('url'), p.get('title')].filter(Boolean).join(' ').trim();
      if (!shared) return;
      history.replaceState(null, '', location.pathname);
      openSheet('Shared to Nova', `<div class="field"><textarea id="shV" rows="3">${esc(shared)}</textarea></div>
        <div class="row" style="gap:8px"><button class="btn" id="shTask">✅ Task</button><button class="btn ghost" id="shNote">📝 Note</button><button class="btn ghost" id="shRem">🔔 Remind 1h</button></div>`, () => {
        const val = () => $('#shV').value.trim();
        $('#shTask').onclick = () => { if (val()) addTask(val()); closeSheet(); go('tasks'); };
        $('#shNote').onclick = () => { if (val()) { db.notes.push({ id: uid('n'), text: val(), t: Date.now() }); save(); } closeSheet(); go('notes'); };
        $('#shRem').onclick = () => { if (val()) addReminder(val(), Date.now() + 3600000, null); closeSheet(); go('reminders'); };
      });
    } catch (e) {}
  }
  async function boot() {
    if (ACCT()) return bootAccount();
    if (!db.settings.onboarded) { runOnboarding(startApp); return; }
    if (db.settings.lock) { showLock(startApp); return; }
    startApp();
  }
  boot();
  setInterval(greet, 60000);
  // auto-lock after inactivity
  let hiddenAt = 0;
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) { hiddenAt = Date.now(); return; }
    if (!hiddenAt || (Date.now() - hiddenAt) <= (db.settings.autoLockMin || 5) * 60000) return;
    if (document.getElementById('lockOv') || document.getElementById('authOv')) return; // already locked
    if (ACCT() && window.NovaAccount && window.NovaAccount.hasPinLocally()) {
      const A = window.NovaAccount;
      showLock(() => A.touch(), { verify: (p) => A.verifyPin(p), len: (A.pinLen && A.pinLen()) || 4, forgotLabel: 'Use email & password', onForgot: () => { A.signOut(); const ov = $('#lockOv'); if (ov) ov.remove(); showAuth(); } });
    } else if (db.settings.lock) showLock(() => {});
  });
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});

  // ====================================================================
  //  Personalization, PIN lock, and the 15-step sign-up
  // ====================================================================
  function applyPersonalization() {
    const s = db.settings;
    applyTheme();
    if (s.skin && bot.skin) bot.skin(s.skin);
    if (bot.el) bot.el.style.display = s.avatarOn === false ? 'none' : '';
    const w = db.habits.find((h) => h.id === 'water'); if (w && s.waterTarget) w.target = s.waterTarget;
    if (s.focusWork) db.focus.work = s.focusWork;
    $('#greetHi') && greet();
  }

  // ---- PIN hashing (SHA-256 + random salt; never store the PIN itself) ----
  async function hashPin(pin, salt) {
    const data = new TextEncoder().encode(salt + '|' + pin);
    const h = await crypto.subtle.digest('SHA-256', data);
    return [...new Uint8Array(h)].map((b) => b.toString(16).padStart(2, '0')).join('');
  }
  function randSalt() { const a = new Uint8Array(16); crypto.getRandomValues(a); return [...a].map((b) => b.toString(16).padStart(2, '0')).join(''); }
  async function setPin(pin) { const salt = randSalt(); const hash = await hashPin(pin, salt); db.settings.lock = { salt, hash, len: pin.length }; save(); }
  async function checkPin(pin) { const l = db.settings.lock; if (!l) return true; return (await hashPin(pin, l.salt)) === l.hash; }

  // ---- Lock screen: numeric keypad, PIN entry ----
  function showLock(onOk, opts) {
    opts = opts || {};
    const verify = opts.verify || checkPin;
    const len = opts.len || (db.settings.lock && db.settings.lock.len) || 4;
    const ov = document.createElement('div'); ov.className = 'lock-ov'; ov.id = 'lockOv';
    const keys = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', '⌫'];
    ov.innerHTML = `<div class="lock-card">
      <div class="lock-bot" id="lockBot"></div>
      <div class="lock-title">${opts.title || ('Welcome back' + (db.settings.name ? ', ' + esc(db.settings.name) : ''))}</div>
      <div class="lock-sub">${opts.sub || ('Enter your ' + len + '-digit PIN')}</div>
      <div class="lock-dots" id="lockDots">${Array.from({ length: len }).map(() => '<span></span>').join('')}</div>
      <div class="lock-err" id="lockErr"></div>
      <div class="lock-pad">${keys.map((k) => k === '' ? '<span></span>' : `<button data-k="${k}">${k}</button>`).join('')}</div>
      <button class="lock-forgot" id="lockForgot">${opts.forgotLabel || 'Forgot PIN?'}</button></div>`;
    document.body.appendChild(ov);
    requestAnimationFrame(() => ov.classList.add('show'));
    try { window.NovaAvatar.attach($('#lockBot', ov)); } catch (e) {}
    let entry = '', busy = false;
    const dots = $$('#lockDots span', ov);
    const draw = () => dots.forEach((d, i) => d.classList.toggle('on', i < entry.length));
    const fail = (msg) => { const c = ov.querySelector('.lock-card'); c.classList.add('shake'); $('#lockErr', ov).textContent = msg || 'Wrong PIN — try again'; buzz(30); setTimeout(() => c.classList.remove('shake'), 400); entry = ''; draw(); };
    ov.querySelectorAll('[data-k]').forEach((b) => (b.onclick = async () => {
      if (busy) return; buzz(6);
      if (b.dataset.k === '⌫') { entry = entry.slice(0, -1); draw(); return; }
      if (entry.length >= len) return;
      entry += b.dataset.k; draw();
      if (entry.length === len) {
        busy = true;
        try { if (await verify(entry)) { ov.classList.remove('show'); setTimeout(() => ov.remove(), 220); onOk && onOk(); } else fail(); }
        catch (e) { fail('Something went wrong'); }
        busy = false;
      }
    }));
    $('#lockForgot', ov).onclick = opts.onForgot || (() => {
      openSheet('Forgot PIN?', `<p class="muted" style="margin-bottom:14px">There’s no email to reset with — your data lives only on this device. You can reset the PIN, but this clears Nova and starts fresh. Export a backup first from More → Backup if you want to keep your data.</p><button class="btn block" id="fpReset" style="background:#C24E3A">Reset Nova &amp; start over</button><button class="btn ghost block" id="fpCancel" style="margin-top:8px">Cancel</button>`, () => {
        $('#fpReset').onclick = () => { localStorage.removeItem(KEY); location.reload(); };
        $('#fpCancel').onclick = closeSheet;
      });
    });
  }

  // ====================================================================
  //  ACCOUNT MODE (Supabase Auth) — email+password identity, PIN to unlock
  // ====================================================================
  function ACCT() { return !!(window.NovaAccount && NovaAccount.configured()); }

  async function bootAccount() {
    const A = window.NovaAccount;
    if (!A.isAuthed()) return showAuth();
    if (A.needsReauth()) return showReauth();
    if (!A.hasPinLocally()) { try { await A.loadPin(); } catch (e) {} }
    // Signed in but no PIN anywhere (new device, or an earlier PIN write failed):
    // send them to set one instead of a lock they could never pass.
    if (!A.hasPinLocally()) return runOnboarding(async () => { await startAppAccount(); }, { account: true, skipToPin: true });
    return showAccountLock();
  }
  async function pullAndApply() {
    try { const d = await window.NovaAccount.pullData(); if (d && typeof d === 'object') { lastSeenAt = Math.max(lastSeenAt, d._at || 0); const keep = db.settings && db.settings.lock; db = { ...structuredClone(DEFAULTS), ...d }; delete db._at; delete db._device; if (keep) db.settings.lock = keep; saveLocal(); applyPersonalization(); } } catch (e) {}
  }
  function startAppAccount() { window.NovaAccount.touch(); pullAndApply().then(() => { startApp(); startSyncPoll(); }); }

  function showAccountLock() {
    const A = window.NovaAccount;
    showLock(() => startAppAccount(), {
      verify: (pin) => A.verifyPin(pin),
      len: (A.pinLen && A.pinLen()) || 4,
      forgotLabel: 'Use email & password',
      onForgot: () => { A.signOut(); const ov = $('#lockOv'); if (ov) ov.remove(); showAuth(); }
    });
  }
  function showReauth() {
    const A = window.NovaAccount, email = A.email() || '';
    authOverlay('reauth', email);
  }
  function showAuth() { authOverlay('in'); }

  // email + password overlay (modes: 'in' = sign in, 'up' = create, 'reauth')
  function authOverlay(mode, presetEmail) {
    const A = window.NovaAccount;
    const ov = document.createElement('div'); ov.className = 'lock-ov auth-ov show'; ov.id = 'authOv';
    const draw = () => {
      const isUp = mode === 'up', isRe = mode === 'reauth';
      ov.innerHTML = `<div class="auth-card">
        <div class="auth-bot" id="authBot"></div>
        <h2 class="auth-title">${isUp ? 'Create your account' : isRe ? 'Welcome back' : 'Sign in to Nova'}</h2>
        <p class="auth-sub">${isUp ? 'Email & password identify your account. You’ll use a PIN day-to-day.' : isRe ? 'It’s been a while — confirm your password to continue.' : 'Use the email & password you signed up with.'}</p>
        <div class="field"><label>Email</label><input id="auEmail" type="email" inputmode="email" autocomplete="email" placeholder="you@example.com" value="${esc(presetEmail || '')}" ${isRe ? 'readonly' : ''}></div>
        <div class="field"><label>Password</label><input id="auPass" type="password" autocomplete="${isUp ? 'new-password' : 'current-password'}" placeholder="${isUp ? 'at least 6 characters' : 'your password'}"></div>
        <div class="lock-err" id="auErr"></div>
        <button class="btn block" id="auGo">${isUp ? 'Create account' : isRe ? 'Continue' : 'Sign in'}</button>
        ${isRe ? `<button class="btn ghost block" id="auSwitch" style="margin-top:8px">Use a different account</button>`
               : `<div class="auth-switch">${isUp ? 'Already have an account?' : 'New here?'} <button id="auToggle">${isUp ? 'Sign in' : 'Create one'}</button></div>`}
      </div>`;
      try { const c = window.NovaAvatar.attach($('#authBot', ov)); c.play && c.play('wave'); } catch (e) {}
      $('#auToggle', ov) && ($('#auToggle', ov).onclick = () => { mode = isUp ? 'in' : 'up'; draw(); });
      $('#auSwitch', ov) && ($('#auSwitch', ov).onclick = async () => { await A.signOut(); mode = 'in'; presetEmail = ''; draw(); });
      $('#auGo', ov).onclick = go;
      setTimeout(() => { const f = $('#auEmail', ov); if (f && !f.readOnly) f.focus(); else $('#auPass', ov).focus(); }, 80);
    };
    async function go() {
      const email = $('#auEmail', ov).value.trim(), pass = $('#auPass', ov).value;
      const err = $('#auErr', ov);
      if (!/.+@.+\..+/.test(email)) return err.textContent = 'Enter a valid email.';
      if (pass.length < 6) return err.textContent = 'Password must be at least 6 characters.';
      err.textContent = 'Please wait…';
      try {
        if (mode === 'up') {
          const r = await A.signUp(email, pass);
          if (r.confirm) { err.textContent = ''; ov.querySelector('.auth-card').innerHTML = `<div class="auth-bot" id="cb"></div><h2 class="auth-title">Check your email</h2><p class="auth-sub">We sent a confirmation link to <b>${esc(email)}</b>. Tap it, then come back and sign in.</p><button class="btn block" id="cbOk">Back to sign in</button>`; try{window.NovaAvatar.attach($('#cb',ov));}catch(e){} $('#cbOk',ov).onclick=()=>{mode='in';draw();}; return; }
          // signed up & logged in → set PIN + preferences
          ov.remove();
          runOnboarding(async () => { await startAppAccount(); }, { account: true });
          return;
        }
        // sign in / reauth
        await A.signIn(email, pass);
        err.textContent = 'Loading your account…';
        // A failed profile read must NOT block sign-in — you're already authenticated.
        let hasPin = false;
        try { hasPin = await A.loadPin(); } catch (e2) { hasPin = A.hasPinLocally(); }
        ov.remove();
        if (hasPin || A.hasPinLocally()) showAccountLock();
        else runOnboarding(async () => { await startAppAccount(); }, { account: true, skipToPin: true });
      } catch (e) {
        const msg = String((e && e.message) || e);
        err.textContent = /not confirmed|email.*confirm|confirm.*email/i.test(msg)
          ? 'Please confirm your email first (check your inbox), then sign in. Tip: in Supabase you can turn email confirmation off.'
          : /invalid|credential|password|grant/i.test(msg)
          ? 'Email or password is incorrect.'
          : 'Couldn’t connect. Check your internet and that the Supabase database is set up. (' + msg + ')';
      }
    }
    document.body.appendChild(ov); draw();
  }

  // ---- Background notifications (native APK fires these even when closed) ----
  function capLN() { const C = window.Capacitor; return (C && C.isNativePlatform && C.isNativePlatform() && C.Plugins && C.Plugins.LocalNotifications) ? C.Plugins.LocalNotifications : null; }
  function hashId(s) { let h = 0; for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0; return Math.abs(h) % 2147483000 + 1; }
  async function scheduleAllNotifications() {
    const LN = capLN(); if (!LN) return; // web falls back to the in-app tick
    try {
      if (LN.requestPermissions) await LN.requestPermissions();
      const pend = db.reminders.filter((r) => !r.done && r.at > Date.now());
      await LN.schedule({ notifications: pend.slice(0, 60).map((r) => ({ id: hashId(r.id), title: db.settings.assistantName || 'Nova', body: r.text, schedule: { at: new Date(r.at) } })) });
    } catch (e) {}
  }

  // ====================================================================
  //  15-step personalized sign-up
  // ====================================================================
  function runOnboarding(onDone, obOpts) {
    obOpts = obOpts || {};
    const d = structuredClone(db.settings);
    d.goals = d.goals && d.goals.length ? d.goals : [];
    const chosenHabits = new Set(['water']);
    let pin = '', pin2 = '';
    let i = 0;

    const GOALS = [['tasks', '✅', 'Tasks & to-dos'], ['reminders', '🔔', 'Reminders'], ['habits', '🔁', 'Build habits'], ['focus', '🎯', 'Focus time'], ['notes', '📝', 'Quick notes'], ['money', '💸', 'Track spending'], ['journal', '📔', 'Journaling'], ['reading', '📖', 'Reading list']];
    const HABITS = [['water', '💧', 'Water'], ['move', '🚶', 'Move'], ['read', '📖', 'Read'], ['meditate', '🧘', 'Meditate'], ['sleep', '😴', 'Sleep'], ['gym', '🏋️', 'Exercise'], ['journal', '📔', 'Journal'], ['study', '📚', 'Study']];
    const SKINS = [['cream', 'Cream'], ['mint', 'Mint'], ['berry', 'Berry'], ['sky', 'Sky']];

    let steps = [
      { title: 'Welcome to Nova 👋', sub: 'Your private assistant — everything stays on this device. Let’s set it up in a minute.',
        body: () => `<div class="ob-hero" id="obHero"></div><div class="field"><label>First, what’s your name?</label><input id="obV" placeholder="Your name" value="${esc(d.name || '')}" autocomplete="off"></div>`,
        after: (r) => { try { const c = window.NovaAvatar.attach($('#obHero', r)); c.play && c.play('wave'); } catch (e) {} setTimeout(() => $('#obV', r) && $('#obV', r).focus(), 80); },
        collect: (r) => { d.name = $('#obV', r).value.trim(); } },
      { title: 'What should I call myself?', sub: 'Your assistant’s name — keep Nova or pick your own.',
        body: () => `<div class="field"><input id="obV" value="${esc(d.assistantName || 'Nova')}"></div><div class="chips">${['Nova', 'Jarvis', 'Pixel', 'Sunny'].map((n) => `<button data-n="${n}">${n}</button>`).join('')}</div>`,
        after: (r) => $$('[data-n]', r).forEach((b) => (b.onclick = () => { $('#obV', r).value = b.dataset.n; })),
        collect: (r) => { d.assistantName = $('#obV', r).value.trim() || 'Nova'; } },
      { title: `Nice to meet you${''}!`, sub: 'What do you want help with? Pick a few — you can change this later.',
        body: () => `<div class="ob-grid">${GOALS.map(([k, i2, l]) => `<button class="ob-pick ${d.goals.includes(k) ? 'on' : ''}" data-g="${k}"><span>${i2}</span>${l}</button>`).join('')}</div>`,
        after: (r) => $$('[data-g]', r).forEach((b) => (b.onclick = () => { b.classList.toggle('on'); })),
        collect: (r) => { d.goals = $$('[data-g].on', r).map((b) => b.dataset.g); } },
      { title: 'Your typical day', sub: 'So reminders and the planner respect your hours.',
        body: () => `<div class="ob-two"><div class="field"><label>Day starts</label><input id="obS" type="time" value="${d.workStart}"></div><div class="field"><label>Day ends</label><input id="obE" type="time" value="${d.workEnd}"></div></div>`,
        collect: (r) => { d.workStart = $('#obS', r).value || '09:00'; d.workEnd = $('#obE', r).value || '18:00'; } },
      { title: 'Habits to track', sub: 'Little daily streaks. Water’s on by default.',
        body: () => `<div class="ob-grid">${HABITS.map(([k, i2, l]) => `<button class="ob-pick ${chosenHabits.has(k) ? 'on' : ''}" data-h="${k}"><span>${i2}</span>${l}</button>`).join('')}</div>`,
        after: (r) => $$('[data-h]', r).forEach((b) => (b.onclick = () => { b.classList.toggle('on'); })),
        collect: (r) => { chosenHabits.clear(); $$('[data-h].on', r).forEach((b) => chosenHabits.add(b.dataset.h)); } },
      { title: 'Water goal 💧', sub: 'How many glasses a day feels right?',
        body: () => `<div class="ob-stepper"><button data-w="-1">–</button><div class="ob-num" id="obW">${d.waterTarget}</div><button data-w="1">+</button></div><div class="muted" style="text-align:center">glasses / day</div>`,
        after: (r) => $$('[data-w]', r).forEach((b) => (b.onclick = () => { d.waterTarget = Math.max(1, Math.min(20, d.waterTarget + +b.dataset.w)); $('#obW', r).textContent = d.waterTarget; })),
        collect: () => {} },
      { title: 'Focus sessions 🎯', sub: 'Your default focus length.',
        body: () => `<div class="ob-chips big">${[15, 25, 50].map((n) => `<button class="ob-chip ${d.focusWork === n ? 'on' : ''}" data-f="${n}">${n} min</button>`).join('')}</div>`,
        after: (r) => $$('[data-f]', r).forEach((b) => (b.onclick = () => { d.focusWork = +b.dataset.f; $$('[data-f]', r).forEach((x) => x.classList.toggle('on', x === b)); })),
        collect: () => {} },
      { title: 'Reminder style 🔔', sub: 'How should nudges feel?',
        body: () => `<div class="ob-list">${[['gentle', 'Gentle', 'One quiet nudge'], ['standard', 'Standard', 'A clear reminder'], ['persistent', 'Persistent', 'Nudges until you act']].map(([k, t, s]) => `<button class="ob-row ${d.reminderStyle === k ? 'on' : ''}" data-r="${k}"><b>${t}</b><span>${s}</span></button>`).join('')}</div>`,
        after: (r) => $$('[data-r]', r).forEach((b) => (b.onclick = () => { d.reminderStyle = b.dataset.r; $$('[data-r]', r).forEach((x) => x.classList.toggle('on', x === b)); })),
        collect: () => {} },
      { title: 'Pick a look', sub: 'Light, dark, or match your phone.',
        body: () => `<div class="ob-chips big">${[['auto', 'Auto'], ['light', 'Light'], ['dark', 'Dark']].map(([k, t]) => `<button class="ob-chip ${d.theme === k ? 'on' : ''}" data-t="${k}">${t}</button>`).join('')}</div>`,
        after: (r) => $$('[data-t]', r).forEach((b) => (b.onclick = () => { d.theme = b.dataset.t; document.documentElement.classList.toggle('dark', d.theme === 'dark' || (d.theme === 'auto' && matchMedia('(prefers-color-scheme: dark)').matches)); $$('[data-t]', r).forEach((x) => x.classList.toggle('on', x === b)); })),
        collect: () => {} },
      { title: 'Dress up your helper', sub: 'Nova’s colour. Tap to preview.',
        body: () => `<div class="ob-skinrow"><div class="ob-skinbot" id="obSkinBot"></div><div class="ob-chips">${SKINS.map(([k, t]) => `<button class="ob-chip ${d.skin === k ? 'on' : ''}" data-s="${k}">${t}</button>`).join('')}</div></div>`,
        after: (r) => { let c; try { c = window.NovaAvatar.attach($('#obSkinBot', r)); c.skin(d.skin); } catch (e) {} $$('[data-s]', r).forEach((b) => (b.onclick = () => { d.skin = b.dataset.s; c && c.skin(d.skin); c && c.play && c.play('spin'); $$('[data-s]', r).forEach((x) => x.classList.toggle('on', x === b)); })); },
        collect: () => {} },
      { title: 'Desktop-style helper', sub: 'Want the little avatar on your Today screen?',
        body: () => `<div class="ob-list">${[['yes', 'Yes, show my helper', true], ['no', 'No, keep it minimal', false]].map(([k, t, v]) => `<button class="ob-row ${d.avatarOn === v ? 'on' : ''}" data-a="${k}"><b>${t}</b></button>`).join('')}</div>`,
        after: (r) => $$('[data-a]', r).forEach((b) => (b.onclick = () => { d.avatarOn = b.dataset.a === 'yes'; $$('[data-a]', r).forEach((x) => x.classList.toggle('on', x === b)); })),
        collect: () => {} },
      { title: 'Quiet hours 🌙', sub: 'No nudges during this window.',
        body: () => `<div class="ob-two"><div class="field"><label>From</label><input id="obQs" type="time" value="${d.quietStart}"></div><div class="field"><label>To</label><input id="obQe" type="time" value="${d.quietEnd}"></div></div>`,
        collect: (r) => { d.quietStart = $('#obQs', r).value || '22:00'; d.quietEnd = $('#obQe', r).value || '07:00'; } },
      { title: 'Language & units', sub: 'For voice, currency and dates.',
        body: () => `<div class="field"><label>Voice / language</label><select id="obL">${[['en-IN', 'English (India)'], ['en-US', 'English (US)'], ['en-GB', 'English (UK)'], ['hi-IN', 'Hindi']].map(([v, n]) => `<option value="${v}" ${d.voiceLang === v ? 'selected' : ''}>${n}</option>`).join('')}</select></div>
          <div class="ob-two"><div class="field"><label>Currency</label><input id="obC" value="${esc(d.currency)}" maxlength="3"></div><div class="field"><label>Units</label><select id="obU"><option value="metric" ${d.units === 'metric' ? 'selected' : ''}>Metric</option><option value="imperial" ${d.units === 'imperial' ? 'selected' : ''}>Imperial</option></select></div></div>`,
        collect: (r) => { d.voiceLang = $('#obL', r).value; d.currency = $('#obC', r).value.trim() || '₹'; d.units = $('#obU', r).value; } },
      { title: 'Never miss a reminder', sub: 'Let Nova send notifications so reminders reach you even when the app is closed.',
        body: () => `<div class="ob-hero2">🔔</div><button class="btn block" id="obNotify">Enable notifications</button><div class="muted" id="obNotifyMsg" style="text-align:center;margin-top:8px">You can change this later.</div>`,
        after: (r) => { $('#obNotify', r).onclick = async () => { d.notifyOn = await askNotify(); $('#obNotifyMsg', r).textContent = d.notifyOn ? '✓ Notifications on' : 'Not enabled — reminders still show while the app is open.'; }; },
        collect: () => {} },
      { pin: true, title: 'Secure with a PIN 🔒', sub: obOpts.account ? 'Set the PIN you’ll use to unlock Nova on any device.' : 'No passwords or email — just a PIN to open Nova. Choose a length.',
        body: () => `<div class="ob-chips big" style="justify-content:center"><button class="ob-chip ${(d.lock ? d.lock.len : 4) === 4 ? 'on' : ''}" data-pl="4">4 digits</button><button class="ob-chip ${(d.lock && d.lock.len) === 6 ? 'on' : ''}" data-pl="6">6 digits</button></div>
          <div class="field"><label>Choose PIN</label><input id="obPin" inputmode="numeric" maxlength="6" placeholder="••••" autocomplete="off" style="text-align:center;letter-spacing:.5em;font-size:22px"></div>
          <div class="field"><label>Confirm PIN</label><input id="obPin2" inputmode="numeric" maxlength="6" placeholder="••••" autocomplete="off" style="text-align:center;letter-spacing:.5em;font-size:22px"></div>
          <div class="lock-err" id="obPinErr"></div>`,
        after: (r) => { let L = (d.lock && d.lock.len) || 4; const setL = (n) => { L = n; $$('[data-pl]', r).forEach((x) => x.classList.toggle('on', +x.dataset.pl === n)); $('#obPin', r).maxLength = n; $('#obPin2', r).maxLength = n; }; $$('[data-pl]', r).forEach((b) => (b.onclick = () => setL(+b.dataset.pl))); ['#obPin', '#obPin2'].forEach((id) => $(id, r).addEventListener('input', (e) => { e.target.value = e.target.value.replace(/\D/g, ''); })); r.__pinLen = () => L; },
        collect: (r) => { pin = $('#obPin', r).value; pin2 = $('#obPin2', r).value; r.__len = r.__pinLen(); },
        validate: (r) => { const L = r.__pinLen(); if (pin.length !== L) return `Enter a ${L}-digit PIN`; if (pin !== pin2) return 'PINs don’t match'; return ''; } }
    ];
    // Signing in on a new device (or re-setting a PIN): just ask for the PIN, don't
    // re-run the whole 15-step personalization (that also used to clobber synced data).
    if (obOpts.skipToPin) steps = steps.filter((s) => s.pin);

    const ov = document.createElement('div'); ov.className = 'ob-ov'; document.body.appendChild(ov);
    requestAnimationFrame(() => ov.classList.add('show'));

    function draw() {
      const s = steps[i];
      ov.innerHTML = `<div class="ob-card">
        <div class="ob-top"><div class="ob-prog"><i style="width:${(i) / steps.length * 100}%"></i></div><div class="ob-count">${i + 1} / ${steps.length}</div></div>
        <div class="ob-scroll"><h2 class="ob-title">${s.title}</h2><p class="ob-sub">${s.sub}</p><div class="ob-body" id="obBody">${s.body()}</div></div>
        <div class="ob-nav">${i > 0 ? '<button class="btn ghost" id="obBack">Back</button>' : '<span></span>'}<button class="btn" id="obNext">${i === steps.length - 1 ? 'Finish' : 'Continue'}</button></div>
      </div>`;
      const card = ov.querySelector('.ob-card');
      if (s.after) s.after(card);
      $('#obBack') && ($('#obBack').onclick = () => { if (s.collect) s.collect(card); i--; draw(); });
      $('#obNext').onclick = () => {
        if (s.collect) s.collect(card);
        if (s.validate) { const err = s.validate(card); if (err) { const e = $('#obPinErr', card); if (e) { e.textContent = err; } else toast(err); return; } }
        if (i === steps.length - 1) return finish(card);
        i++; draw();
      };
    }
    async function finish(card) {
      // skipToPin: set the PIN only, then open the app (data comes from the account).
      if (obOpts.skipToPin) {
        let warn = '';
        if (pin && window.NovaAccount) { try { const r = await window.NovaAccount.setPin(pin); if (r && r.synced === false) warn = r.error; } catch (e) { warn = String(e.message || e); } }
        ov.querySelector('.ob-card').innerHTML = `<div class="ob-done"><div class="ob-donebot" id="obDoneBot"></div><h2>You’re in! 🎉</h2><p class="ob-sub">${warn ? 'PIN set on this device. Cross-device sync needs the database set up.' : 'Unlock Nova with your PIN from now on.'}</p><button class="btn block" id="obGo">Open Nova</button></div>`;
        try { const c = window.NovaAvatar.attach($('#obDoneBot')); c.play && c.play('celebrate'); } catch (e) {}
        $('#obGo').onclick = () => { ov.classList.remove('show'); setTimeout(() => ov.remove(), 220); onDone && onDone(); };
        return;
      }
      // habits
      const base = { water: ['💧', 8], move: ['🚶', 3], read: ['📖', 1], meditate: ['🧘', 1], sleep: ['😴', 8], gym: ['🏋️', 1], journal: ['📔', 1], study: ['📚', 1] };
      db.habits = [...chosenHabits].map((k) => { const ex = db.habits.find((h) => h.id === k); return ex || { id: k, name: k[0].toUpperCase() + k.slice(1), icon: base[k] ? base[k][0] : '⭐', target: base[k] ? base[k][1] : 1, log: {} }; });
      const w = db.habits.find((h) => h.id === 'water'); if (w) w.target = d.waterTarget;
      d.onboarded = true; d.notified = true;
      if (obOpts.account) d.lock = null; // account mode: PIN lives in the Supabase account, not locally
      Object.assign(db.settings, d);
      db.focus.work = d.focusWork;
      let syncWarn = '';
      if (pin) { if (obOpts.account && window.NovaAccount) { try { const r = await window.NovaAccount.setPin(pin); if (r && r.synced === false) syncWarn = r.error || 'sync off'; } catch (e) { syncWarn = String(e.message || e); } } else { await setPin(pin); } }
      save();
      if (obOpts.account && window.NovaAccount) { try { await window.NovaAccount.pushData(db); } catch (e) { syncWarn = syncWarn || String(e.message || e); } }
      const privacyLine = obOpts.account
        ? (syncWarn
            ? `${esc(d.assistantName)} is ready and your PIN works on this device. Cross-device sync isn’t active yet — finish the Supabase database setup to sync everywhere.`
            : `${esc(d.assistantName)} is ready. Sign in on any device with your email, then unlock with your PIN.`)
        : `${esc(d.assistantName)} is ready. Everything you add stays private on this device.`;
      ov.querySelector('.ob-card').innerHTML = `<div class="ob-done"><div class="ob-donebot" id="obDoneBot"></div><h2>All set${d.name ? ', ' + esc(d.name) : ''}! 🎉</h2><p class="ob-sub">${privacyLine}</p><button class="btn block" id="obGo">Open Nova</button></div>`;
      try { const c = window.NovaAvatar.attach($('#obDoneBot')); c.skin(d.skin); c.play && c.play('celebrate'); } catch (e) {}
      $('#obGo').onclick = () => { ov.classList.remove('show'); setTimeout(() => ov.remove(), 220); onDone && onDone(); };
    }
    draw();
  }

  function askNotify() {
    return new Promise((res) => {
      const LN = capLN();
      if (LN && LN.requestPermissions) { LN.requestPermissions().then((p) => res(!!(p && (p.display === 'granted' || p.granted)))).catch(() => res(false)); return; }
      if (!('Notification' in window)) return res(false);
      Notification.requestPermission().then((p) => res(p === 'granted')).catch(() => res(false));
    });
  }
})();
