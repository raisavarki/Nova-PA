// Nova main app.
(() => {
  const { md, esc, when, dueLabel, fmtTime, greeting, tts, sound } = window.NovaCore;
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  let S = null; // state snapshot
  let section = 'home';

  // ---------------------------------------------------------- avatars
  const brand = window.NovaAvatar.attach($('#brandBot'));
  const hero = window.NovaAvatar.attach($('#homeBot'));
  const MINI = `<svg viewBox="0 0 40 44"><rect x="4" y="4" width="32" height="30" rx="14" fill="#F4E7D4" stroke="#DCC5A6"/><rect x="8.5" y="10" width="23" height="17" rx="8" fill="#2E2925"/><ellipse cx="15.5" cy="18" rx="2.6" ry="3.3" fill="#FFAA6B"/><ellipse cx="24.5" cy="18" rx="2.6" ry="3.3" fill="#FFAA6B"/><path d="M17.5 23 Q20 24.6 22.5 23" stroke="#FFAA6B" stroke-width="1.4" fill="none" stroke-linecap="round"/><circle cx="20" cy="2.6" r="2.4" fill="#E9803F"/><rect x="13" y="35" width="14" height="8" rx="4" fill="#F1E1CB" stroke="#DCC5A6"/></svg>`;
  document.addEventListener('mousemove', (e) => {
    const r = $('#homeBot').getBoundingClientRect();
    if (section === 'home' && r.width) hero.look((e.clientX - (r.left + r.width / 2)) / 500, (e.clientY - (r.top + r.height * 0.42)) / 400);
  });

  // ---------------------------------------------------------- navigation
  function go(sec) {
    section = sec;
    $$('#nav button').forEach((b) => b.classList.toggle('active', b.dataset.sec === sec));
    $$('.sec').forEach((s) => s.classList.toggle('active', s.id === 'sec-' + sec));
    if (sec === 'chat') { setTimeout(() => { $('#input').focus(); scrollChat(); }, 30); }
    if (sec === 'developer') { initDevTools(); renderSnippets(); initHub(); }
    if (sec === 'reading') renderReading();
    if (sec === 'checklists') renderChecklists();
    if (sec === 'review') renderReview();
    if (sec === 'settings') fillSettings();
    if (sec === 'calendar') renderCalendar();
    if (sec === 'focus') renderFocus();
    if (sec === 'shortcuts') loadApps();
    if (sec === 'tools') renderTools();
    if (sec === 'usage') renderUsage();
    if (sec === 'documents') renderDocsMeta();
    if (sec === 'meetings') renderMeetings();
    if (sec === 'sap') renderSap();
    if (sec === 'automations') renderAutomations();
    if (sec === 'widgets') renderWidgets();
    if (sec === 'rewards') renderRewards();
  }
  $$('#nav button').forEach((b) => (b.onclick = () => go(b.dataset.sec)));
  $$('[data-go]').forEach((b) => (b.onclick = () => go(b.dataset.go)));

  // ---------------------------------------------------------- state
  async function refresh(keys) {
    S = await window.nova.state();
    session.setSettings(S.settings);
    $('#brandName').textContent = S.settings.assistantName || 'Nova';
    $('#compToggle').checked = !!S.status.companion;
    renderCounts(); renderHome();
    if (!keys || keys.includes('reminders')) renderReminders();
    if (!keys || keys.includes('tasks')) renderTasks();
    if (!keys || keys.includes('notes')) renderNotes();
    if (!keys || keys.includes('routines')) renderRoutines();
    if (!keys || keys.some((k) => ['events', 'reminders', 'tasks'].includes(k))) renderCalendar();
    if (!keys || keys.includes('habits')) renderHabits();
    if (!keys || keys.includes('clipboard')) renderClipboard();
    if (!keys || keys.includes('shortcuts')) renderShortcuts();
    if (!keys || keys.includes('focus') || keys.includes('wellbeing')) renderFocus();
    if (!keys || keys.includes('people')) renderPeople();
    if (!keys || keys.some((k) => ['expenses', 'currency', 'budget'].includes(k))) renderMoney();
    if (!keys || keys.includes('journal')) renderJournal();
    if (!keys || keys.some((k) => ['countdowns', 'clocks'].includes(k))) renderTools();
    if (keys && keys.includes('dnd')) fillSettings();
    if (!keys || keys.includes('meetings')) section === 'meetings' && renderMeetings();
    if (!keys || keys.some((k) => ['automations', 'automationLog'].includes(k))) section === 'automations' && renderAutomations();
    if (!keys || keys.includes('widgets')) section === 'widgets' && renderWidgets();
    if (!keys || keys.includes('docFolders')) section === 'documents' && renderDocsMeta();
    if (!keys || keys.includes('sap')) section === 'sap' && renderSap();
    if (!keys || keys.some((k) => ['xp', 'outfit'].includes(k))) { if (section === 'rewards') renderRewards(); applyOutfit(S.settings.outfit); }
    if (keys && keys.includes('usage') && section === 'usage') renderUsage();
    renderSideStatus(); renderAiBits(); applyDev();
    if (!keys || keys.includes('snippets')) renderSnippets();
    if (keys && keys.includes('messages')) renderChat();
    if (!keys || keys.includes('reading')) section === 'reading' && renderReading();
    if (!keys || keys.includes('checklists')) section === 'checklists' && renderChecklists();
    if (section === 'developer' && (!keys || keys.some((k) => ['vault', 'workflows', 'watches'].includes(k)))) { hubInit && renderVault(); hubInit && renderWorkflows(); hubInit && renderWatches(); }
  }
  function renderAiBits() {
    const on = !!S.settings.aiEnabled;
    $('#aiCard').classList.toggle('show', !on && !S.settings.aiSetupDismissed);
    $('#aiPill').textContent = on ? 'AI on' : 'AI off · commands only';
  }
  function renderCounts() {
    const end = new Date(); end.setHours(23, 59, 59, 999);
    const remToday = S.reminders.filter((r) => r.at <= end && r.kind !== 'timer').length;
    $('#cntRem').textContent = remToday || '';
    $('#cntTask').textContent = S.tasks.filter((t) => !t.done).length || '';
    const evToday = (S.events || []).filter((e) => e.start <= end && e.end >= Date.now()).length;
    $('#cntCal').textContent = evToday || '';
    const k = dayKey(new Date());
    const left = (S.habits || []).filter((h) => ((h.log || {})[k] || 0) < (h.target || 1)).length;
    $('#cntHab').textContent = left || '';
  }
  const dayKey = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  function renderSideStatus() {
    const st = S.status, hk = st.hotkeys || {};
    const lines = [];
    if (hk.listen) lines.push(`🎙 Talk: ${hk.listen.replace(/Control/g, 'Ctrl')}`);
    if (st.wake === 'listening') lines.push(`👂 Say "Hey ${esc(S.settings.assistantName)}"`);
    else if (st.wake && st.wake !== 'off') lines.push(`Wake word: ${esc(st.wake)}`);
    $('#sideStatus').innerHTML = lines.join('<br>');
  }

  // ---------------------------------------------------------- HOME
  function renderHome() {
    $('#greet').textContent = greeting(S.settings.userName);
    $('#todayLine').textContent = new Date().toLocaleDateString([], { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
    // agenda: events + reminders today
    const end = new Date(); end.setHours(23, 59, 59, 999);
    const items = [];
    (S.events || []).filter((e) => e.end >= Date.now() && e.start <= +end).forEach((e) => items.push({ at: e.start, ico: '📅', t: e.title, w: e.allDay ? 'All day' : fmtTime(e.start) }));
    S.reminders.filter((r) => r.at <= +end).forEach((r) => items.push({ at: r.at, ico: r.kind === 'alarm' ? '⏰' : r.kind === 'timer' ? '⏱' : '🔔', t: r.text, w: fmtTime(r.at) }));
    items.sort((a, b) => a.at - b.at);
    const nextUp = S.reminders.filter((r) => r.at > +end).slice(0, Math.max(0, 4 - items.length));
    $('#homeAgenda').innerHTML = (items.length || nextUp.length) ? items.map((i) => `<div class="mini"><div class="ico">${i.ico}</div><div class="t">${esc(i.t)}</div><div class="w">${i.w}</div></div>`).join('') + nextUp.map((r) => `<div class="mini" style="opacity:.75"><div class="ico">🔔</div><div class="t">${esc(r.text)}</div><div class="w">${when(r.at, r.repeat)}</div></div>`).join('') : '<div class="empty">Nothing scheduled. Try "add event team sync tomorrow 3 to 4 pm".</div>';
    const open = sortTasks(S.tasks.filter((t) => !t.done)).slice(0, 6);
    $('#homeTasks').innerHTML = open.length ? open.map((t) => `<div class="mini"><div class="chk" data-tid="${t.id}"></div><div class="t">${esc(t.text)}</div>${t.due ? `<div class="w">${dueLabel(t.due)}</div>` : ''}</div>`).join('') : '<div class="empty">No open tasks 🎉</div>';
    $$('#homeTasks .chk').forEach((c) => (c.onclick = () => { c.classList.add('on'); setTimeout(() => window.nova.action('task_toggle', { id: c.dataset.tid }), 250); }));
    const k = dayKey(new Date());
    $('#homeHabits').innerHTML = (S.habits || []).length ? S.habits.map((h) => { const n = (h.log || {})[k] || 0, tg = h.target || 1; return `<div class="mini" data-hlog="${h.id}" style="cursor:pointer" title="Click to log"><div class="ico">${esc(h.icon || '⭐')}</div><div class="t">${esc(h.name)}</div><div class="hbar"><i style="width:${Math.min(100, n / tg * 100)}%"></i></div><div class="w">${n}/${tg}</div></div>`; }).join('') : '<div class="empty">No habits yet.</div>';
    $$('#homeHabits [data-hlog]').forEach((el) => (el.onclick = () => window.nova.action('habit_log', { id: el.dataset.hlog })));
    $('#homeShortcuts').innerHTML = (S.shortcuts || []).slice(0, 12).map((x) => `<div class="tile" data-sc="${x.id}"><div class="ti">${scIcon(x)}</div><div class="tn">${esc(x.name)}</div></div>`).join('') || '<div class="empty">Add your favourite apps, sites and folders in Shortcuts.</div>';
    $$('#homeShortcuts [data-sc]').forEach((el) => (el.onclick = () => runShortcut(el.dataset.sc)));
    renderHomeFocus();
    renderHomeExtras();
    const wh = (S.habits || []).find((h) => /water|hydrat|drink/i.test(h.name));
    const wb = $('#homeChips [data-cmd="log water"]');
    if (wb) wb.textContent = `💧 +1 water (${wh ? (wh.log || {})[k] || 0 : 0}/${wh ? wh.target || 8 : 8})`;
  }
  const daysTo = (ts) => { const n = new Date(); n.setHours(0, 0, 0, 0); return Math.round((ts - n) / 864e5); };
  function bdDays(b) { const [mo, d] = b.slice(-5).split('-').map(Number); const n = new Date(); n.setHours(0, 0, 0, 0); let x = new Date(n.getFullYear(), mo - 1, d); if (x < n) x = new Date(n.getFullYear() + 1, mo - 1, d); return Math.round((x - n) / 864e5); }
  const bdLabel = (b) => { const [mo, d] = b.slice(-5).split('-').map(Number); return new Date(2000, mo - 1, d).toLocaleDateString([], { day: 'numeric', month: 'short' }); };
  const cityName = (tz) => tz.split('/').pop().replace(/_/g, ' ');
  function clockText(tz) { const n = new Date(); return { t: n.toLocaleTimeString([], { timeZone: tz, hour: 'numeric', minute: '2-digit' }), d: n.toLocaleDateString([], { timeZone: tz, weekday: 'short' }) }; }
  function renderHomeExtras() {
    const cds = (S.countdowns || []).filter((c) => daysTo(c.date) >= 0).sort((a, b) => a.date - b.date).slice(0, 4);
    $('#homeCd').innerHTML = cds.length ? cds.map((c) => `<div class="mini"><div class="ico">⏳</div><div class="t">${esc(c.title)}</div><div class="w"><b>${daysTo(c.date) || 'Today!'}</b>${daysTo(c.date) ? ' days' : ''}</div></div>`).join('') : '<div class="empty">Say "countdown to Diwali on 8 Nov".</div>';
    const bds = (S.people || []).filter((p) => p.birthday).map((p) => ({ p, d: bdDays(p.birthday) })).sort((a, b) => a.d - b.d).slice(0, 4);
    $('#homeBd').innerHTML = bds.length ? bds.map((x) => `<div class="mini"><div class="ico">🎂</div><div class="t">${esc(x.p.name)}</div><div class="w ${x.d <= 7 ? 'bd-soon' : ''}">${x.d === 0 ? 'Today!' : x.d === 1 ? 'Tomorrow' : bdLabel(x.p.birthday) + ' · ' + x.d + 'd'}</div></div>`).join('') : '<div class="empty">Add birthdays in People.</div>';
    $('#homeClocks').innerHTML = (S.settings.clocks || []).slice(0, 4).map((tz) => { const c = clockText(tz); return `<div class="mini"><div class="ico">🕐</div><div class="t">${esc(cityName(tz))}</div><div class="w"><b>${c.t}</b> ${c.d}</div></div>`; }).join('') || '<div class="empty">Add cities in Tools.</div>';
  }
  function renderHomeFocus() {
    const st = S.focusState || { phase: 'idle' }, stats = S.focusStats || { todayMin: 0 };
    if (st.phase === 'idle') $('#homeFocus').innerHTML = `<div class="focus-pill" data-go2="focus"><div class="muted small">Focused today</div><div class="big">${stats.todayMin} min</div></div>`;
    else { const left = st.paused ? st.remaining : st.endsAt - Date.now(); $('#homeFocus').innerHTML = `<div class="focus-pill" data-go2="focus"><div class="muted small">${st.phase === 'work' ? '🎯 Focusing' : '☕ Break'}${st.paused ? ' (paused)' : ''}</div><div class="big">${mmss(left)}</div></div>`; }
    const fp = $('#homeFocus .focus-pill'); if (fp) fp.onclick = () => go('focus');
  }
  const mmss = (ms) => { const t = Math.max(0, Math.round(ms / 1000)); return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`; };
  async function loadWeather() {
    try { const r = await window.nova.action('weather', {}); $('#weatherLine').textContent = r.error ? '' : '🌤 ' + r.text; } catch (e) {}
  }
  // Command / search bar: Enter runs a command (result shows inline); typing searches your stuff.
  let homeJob = false, resSel = -1, resItems = [];
  const homeSubmit = () => {
    if (resSel >= 0 && resItems[resSel]) { resItems[resSel].go(); hideResults(); return; }
    const v = $('#homeAsk').value.trim(); if (!v) return;
    $('#homeAsk').value = ''; hideResults();
    homeJob = true; $('#cmdOut').classList.add('show'); $('#cmdOut').innerHTML = '<span class="muted">Working…</span>';
    session.submit(v);
  };
  $('#homeSend').onclick = homeSubmit;
  $('#homeAsk').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); homeSubmit(); }
    else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); if (!resItems.length) return; resSel = (resSel + (e.key === 'ArrowDown' ? 1 : -1) + resItems.length) % resItems.length; $$('#cmdResults .res').forEach((r, i) => r.classList.toggle('sel', i === resSel)); }
    else if (e.key === 'Escape') hideResults();
  });
  $('#homeAsk').addEventListener('input', () => liveSearch($('#homeAsk').value));
  $('#homeAsk').addEventListener('blur', () => setTimeout(hideResults, 200));
  function hideResults() { $('#cmdResults').classList.remove('show'); resItems = []; resSel = -1; }
  function liveSearch(q) {
    q = q.trim().toLowerCase();
    if (q.length < 2 || !S) return hideResults();
    const hit = (t) => String(t || '').toLowerCase().includes(q);
    const groups = [];
    const add = (name, list) => { if (list.length) groups.push([name, list]); };
    add('Shortcuts', (S.shortcuts || []).filter((x) => hit(x.name)).slice(0, 3).map((x) => ({ ico: scIcon(x), t: x.name, k: 'open', go: () => runShortcut(x.id) })));
    add('Tasks', S.tasks.filter((x) => hit(x.text)).slice(0, 4).map((x) => ({ ico: x.done ? '✓' : '☐', t: x.text, k: x.due ? dueLabel(x.due) : 'task', go: () => go('tasks') })));
    add('Events', (S.events || []).filter((x) => hit(x.title) || hit(x.location)).slice(0, 3).map((x) => ({ ico: '📅', t: x.title, k: when(x.start), go: () => { calSel = new Date(x.start); calMonth = new Date(x.start); go('calendar'); } })));
    add('Reminders', S.reminders.filter((x) => hit(x.text)).slice(0, 3).map((x) => ({ ico: '🔔', t: x.text, k: when(x.at, x.repeat), go: () => go('reminders') })));
    add('Notes', S.notes.filter((x) => hit(x.text)).slice(-3).reverse().map((x) => ({ ico: '📝', t: x.text.split('\n')[0], k: 'note', go: () => { $('#noteSearch').value = q; renderNotes(); go('notes'); } })));
    add('Clipboard', (S.clipboard || []).filter((x) => hit(x.text)).slice(0, 3).map((x) => ({ ico: '📋', t: x.text.replace(/\s+/g, ' '), k: 'copy', go: () => window.nova.action('clipboard_copy', { id: x.id }).then(() => toast('Clipboard', 'Copied.')) })));
    resItems = groups.flatMap(([, l]) => l); resSel = -1;
    if (!resItems.length) return hideResults();
    let i = 0;
    $('#cmdResults').innerHTML = groups.map(([n, l]) => `<div class="res-h">${n}</div>` + l.map((r) => `<div class="res" data-i="${i++}"><span>${esc(r.ico)}</span><span class="t">${esc(r.t)}</span><span class="k">${esc(r.k)}</span></div>`).join('')).join('') + '<div class="res-h">Press Enter to run as a command</div>';
    $$('#cmdResults .res').forEach((el) => (el.onmousedown = (e) => { e.preventDefault(); resItems[+el.dataset.i].go(); hideResults(); }));
    $('#cmdResults').classList.add('show');
  }
  $('#aiSetup').onclick = () => { go('settings'); setTimeout(() => $('#s_ai').scrollIntoView({ behavior: 'smooth', block: 'center' }), 100); };
  $('#aiDismiss').onclick = async () => { S = await window.nova.saveSettings({ aiSetupDismissed: true }); renderAiBits(); };
  $('#homeMic').onclick = () => { go('chat'); session.toggleListen(); };
  $$('#homeChips button').forEach((b) => (b.onclick = () => { homeJob = true; $('#cmdOut').classList.add('show'); $('#cmdOut').innerHTML = '<span class="muted">Working…</span>'; session.submit(b.dataset.cmd); }));
  $$('#chatChips button').forEach((b) => (b.onclick = () => { session.submit(b.dataset.cmd); go('chat'); }));
  $('#homeTaskAdd').addEventListener('keydown', async (e) => {
    if (e.key !== 'Enter' || !e.target.value.trim()) return;
    const r = await window.nova.action('task_add', { text: e.target.value.trim() }); e.target.value = ''; toast('Task', r.text);
  });

  // ---------------------------------------------------------- CHAT
  const live = new Map();
  function scrollChat() { const m = $('#messages'); m.scrollTop = m.scrollHeight; }
  function msgEl(m) {
    const el = document.createElement('div');
    const meta = m.meta || {};
    if (m.role === 'user') { el.className = 'msg user'; el.innerHTML = `<div class="bub">${md(m.text)}</div>`; }
    else if (m.role === 'alert') { el.className = 'msg alert'; el.innerHTML = `<div class="bub">${md(m.text)}<span class="meta">${fmtTime(m.t)}</span></div>`; }
    else {
      el.className = 'msg bot' + (meta.error ? ' err' : '');
      el.innerHTML = `<div class="av">${MINI}</div><div class="bub">${md(m.text)}<span class="meta">${fmtTime(m.t)}${meta.ms != null ? ' · ' + meta.ms + ' ms' : ''}${meta.provider ? ' · ' + esc(meta.provider) : ''}</span></div>`;
    }
    return el;
  }
  function addRow(el, buttons) {
    const row = document.createElement('div'); row.className = 'row';
    for (const [label, cls, fn] of buttons) { const b = document.createElement('button'); b.textContent = label; b.className = cls || ''; b.onclick = () => { fn(row); }; row.appendChild(b); }
    (el.querySelector('.bub') || el).appendChild(row);
  }
  const SEC_NAME = { developer: 'Developer', reading: 'Reading list', checklists: 'Checklists', review: 'Weekly review', reminders: 'Reminders', tasks: 'Tasks', notes: 'Notes', calendar: 'Calendar', money: 'Money', habits: 'Habits', focus: 'Focus', journal: 'Journal', people: 'People', tools: 'Tools', documents: 'Documents', usage: 'Usage', rewards: 'Rewards', clipboard: 'Clipboard', meetings: 'Meetings', automations: 'Automations', shortcuts: 'Shortcuts' };
  function choiceRow(choices, onPick) {
    const row = document.createElement('div'); row.className = 'row choices';
    for (const c of (choices || []).slice(0, 8)) { const b = document.createElement('button'); b.textContent = c.label; b.className = 'ghost'; b.onclick = () => { row.remove(); onPick && onPick(); window.nova.input(c.run, { choice: true }); }; row.appendChild(b); }
    return row;
  }
  function secLink(section) { if (!section || !SEC_NAME[section]) return null; const b = document.createElement('button'); b.className = 'link'; b.textContent = `Open ${SEC_NAME[section]} ›`; b.onclick = () => go(section); return b; }
  function appendMsg(m, final) {
    const el = msgEl(m);
    $('#messages').appendChild(el);
    const meta = m.meta || {};
    if (final) {
      if (meta.confirm) addRow(el, [['Yes', 'primary', (row) => { row.remove(); window.nova.confirm(true); }], ['No', '', (row) => { row.remove(); window.nova.confirm(false); }]]);
      if (meta.open) addRow(el, [['Open file', 'primary', () => window.nova.openPath(meta.open)]]);
      if (meta.settings && !meta.choices) addRow(el, [['Open settings', 'primary', () => go('settings')]]);
      if (meta.qr) { const d = document.createElement('div'); d.className = 'qr-msg'; d.innerHTML = meta.qr; (el.querySelector('.bub') || el).appendChild(d); }
      if (meta.choices) (el.querySelector('.bub') || el).appendChild(choiceRow(meta.choices));
      const sl = secLink(meta.section); if (sl) (el.querySelector('.bub') || el).appendChild(sl);
    }
    while ($('#messages').children.length > 300) $('#messages').firstChild.remove();
    scrollChat();
    return el;
  }
  function renderChat() {
    $('#messages').innerHTML = '';
    if (!S.messages.length) {
      const el = document.createElement('div'); el.className = 'msg bot';
      el.innerHTML = `<div class="av">${MINI}</div><div class="bub">${esc(greeting(S.settings.userName))}! I can manage reminders, tasks and notes, control your PC, see your screen, type for you and answer questions, several at once. Try <b>"mute, open Excel and set a 25 min timer"</b> or <b>"remind me every Monday at 9 to send the MOOWR report"</b>.</div>`;
      $('#messages').appendChild(el);
    }
    S.messages.slice(-120).forEach((m) => appendMsg(m, false));
  }
  $('#composer').addEventListener('submit', (e) => { e.preventDefault(); const v = $('#input').value; $('#input').value = ''; autosize(); session.submit(v); });
  $('#input').addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); $('#composer').requestSubmit(); } });
  const autosize = () => { const i = $('#input'); i.style.height = 'auto'; i.style.height = Math.min(160, i.scrollHeight) + 'px'; };
  $('#input').addEventListener('input', autosize);
  $('#chatMic').onclick = () => session.toggleListen();
  $('#btnClear').onclick = () => window.nova.clearHistory();

  // ---------------------------------------------------------- session
  const session = window.NovaSession.create({
    role: 'app',
    render: {
      message(m) { appendMsg(m, false); S && S.messages.push(m); },
      start(id) { const el = appendMsg({ role: 'assistant', text: '', t: Date.now() }, false); el.querySelector('.bub').classList.add('typing'); el.querySelector('.meta').remove(); live.set(id, { el, text: '' }); },
      token(id, t) { const l = live.get(id); if (!l) return; l.text += t; l.el.querySelector('.bub').innerHTML = md(l.text.replace(/\n+$/, '')); scrollChat(); if (homeJob) $('#cmdOut').innerHTML = md(l.text); },
      final(ev) {
        const l = live.get(ev.id);
        if (l) { l.el.remove(); live.delete(ev.id); }
        appendMsg(ev.msg, true);
        if (S) S.messages.push(ev.msg);
        if (homeJob && ev.source === 'app') {
          homeJob = false;
          $('#cmdOut').innerHTML = md(ev.msg.text) + ' <button class="link" id="cmdMore">Open in chat ›</button>';
          $('#cmdMore').onclick = () => go('chat');
          const meta = ev.msg.meta || {};
          if (meta.confirm) { const row = document.createElement('div'); row.className = 'row'; row.style.marginTop = '8px'; row.innerHTML = '<button class="primary">Yes</button> <button class="ghost">No</button>'; row.children[0].onclick = () => { row.remove(); homeJob = true; window.nova.confirm(true); }; row.children[1].onclick = () => { row.remove(); window.nova.confirm(false); }; $('#cmdOut').appendChild(row); }
          if (meta.qr) { const d = document.createElement('div'); d.className = 'qr-msg'; d.innerHTML = meta.qr; $('#cmdOut').appendChild(d); }
          if (meta.choices) $('#cmdOut').appendChild(choiceRow(meta.choices, () => { homeJob = true; }));
          const sl = secLink(meta.section); if (sl) { sl.style.marginLeft = '8px'; $('#cmdOut').appendChild(sl); }
          if (meta.settings && !S.settings.aiEnabled && !meta.choices) { const b = document.createElement('button'); b.className = 'ghost'; b.style.marginLeft = '8px'; b.textContent = 'Set up free AI'; b.onclick = () => $('#aiSetup').click(); $('#cmdOut').appendChild(b); }
        }
        renderHome();
      },
      alert(ev) {
        appendMsg(ev.msg, false);
        const r = ev.reminder;
        const isWater = /\b(water|drink|hydrat|glass)/i.test(r.text) && r.kind !== 'event';
        const nw = (x) => String(x || '').toLowerCase().replace(/[^a-z0-9 ]/g, ' ').split(/\s+/).filter((w) => w.length > 2);
        const tk = (S.tasks || []).find((t) => { if (t.done) return false; const A = nw(t.text), B = new Set(nw(r.text)); const h = A.filter((w) => B.has(w)).length; return A.length && (h / A.length >= 0.6 || h >= 3); });
        toast({ alarm: 'Alarm', timer: 'Timer', event: 'Coming up', break: 'Break time', focus: 'Focus' }[r.kind] || 'Reminder', r.text, [
          ...(isWater ? [['💧 Drank it', 'primary', () => { window.nova.action('water_log', { glasses: 1 }); window.nova.ack(); }]] : tk ? [['✅ Mark done', 'primary', () => { window.nova.action('task_done', { id: tk.id }); window.nova.ack(); }]] : []),
          ...(r.joinUrl ? [['Join meeting', 'primary', () => { window.nova.openPath(r.joinUrl); window.nova.ack(); }]] : []),
          ...(r.gentle || r.kind === 'focus' ? [] : [[r.repeat ? 'Later' : 'Snooze 10m', '', () => { window.nova.action('reminder_snooze', { id: r.id, minutes: r.repeat ? 15 : 10 }); window.nova.ack(); }]]),
          ...(r.repeat && /^(hourly|every:)/.test(r.repeat) ? [['Stop', '', () => { window.nova.action('reminder_delete', { id: r.id }); window.nova.ack(); }]] : []),
          [r.gentle ? 'OK' : 'Got it', 'primary', () => window.nova.ack()]
        ], r.kind === 'alarm' ? 0 : r.gentle ? 12000 : 30000);
      },
      state(s) { hero.setState(s); brand.setState(s); },
      speaking(on) { hero.setState(on ? 'speaking' : 'idle'); },
      listening(on, dict) {
        $$('.mic').forEach((m) => m.classList.toggle('rec', on));
        hero.setState(on ? 'listening' : 'idle'); brand.setState(on ? 'listening' : 'idle');
        $('#tbStatus').textContent = on ? (dict ? 'Dictating… say "stop dictation"' : 'Listening…') : '';
      },
      level(v) { hero.level(v); brand.level(v); },
      status(t) { $('#tbStatus').textContent = t; setTimeout(() => { if ($('#tbStatus').textContent === t) $('#tbStatus').textContent = ''; }, 4000); },
      dictated(text) { const el = appendMsg({ role: 'user', text: '📝 ' + text, t: Date.now() }, false); el.style.opacity = .7; },
      notice(text) { $('#tbStatus').textContent = text; setTimeout(() => ($('#tbStatus').textContent = ''), 3000); },
      error(text, needSettings) { const el = appendMsg({ role: 'assistant', text, t: Date.now(), meta: { error: true } }, false); if (needSettings) addRow(el, [['Open settings', 'primary', () => go('settings')]]); },
      wake() { if (section !== 'chat') go('chat'); },
      event(ev) {
        if (ev.type === 'data') refresh(ev.keys);
        else if (ev.type === 'navigate') go(ev.section);
        else if (ev.type === 'busy') { $('#chatBusy').textContent = ev.count > 1 ? `${ev.count} tasks running` : ev.count === 1 ? 'working…' : ''; }
        else if (ev.type === 'job') { if (ev.phase === 'start') actStart(ev); else actDone(ev); }
        else if (ev.type === 'job-step') actStep(ev);
        else if (ev.type === 'cleared') { S.messages = []; renderChat(); }
        else if (ev.type === 'companion') { $('#compToggle').checked = ev.enabled; if (S) S.status.companion = ev.enabled; }
        else if (ev.type === 'settings') refresh();
        else if (ev.type === 'focus') { S.focusState = ev.state; S.focusStats = ev.stats; renderFocus(); renderHomeFocus(); }
        else if (ev.type === 'ack') $$('.toast').forEach((t) => t.remove());
        else if (ev.type === 'outfit') applyOutfit(ev.outfit);
        else if (ev.type === 'activity') { const a = { water_log: 'drink', task_done: 'cheer', task_toggle: 'cheer', habit_log: 'cheer', task_add: 'write', note_add: 'write', journal_add: 'write', expense_add: 'write', reminder: 'check', event_add: 'check', reschedule: 'check', timer: 'check', undo_last: 'tilt' }[ev.action]; if (a && hero) hero.play(a); }
        else if (ev.type === 'focus' && hero && hero.mode) hero.mode('focus', ev.state && ev.state.phase === 'work');
        else if (ev.type === 'dev-clip') toast('Clipboard', ev.label.replace(/^\S+\s/, '') + ' from your clipboard?', [[ev.label, 'primary', () => window.nova.input(ev.run)]], 8000);
        else if (ev.type === 'levelup') { toast('Level up!', ev.text); hero.play('dance'); }
        else if (ev.type === 'docs-progress') { if (section === 'documents') { $('#dBar').classList.add('show'); $('#dBar div').style.width = (ev.progress.total ? ev.progress.done / ev.progress.total * 100 : 100) + '%'; $('#dStats').textContent = `Indexing… ${ev.progress.done}/${ev.progress.total}`; } }
        else if (ev.type === 'docs') { S.docs = ev.stats; $('#dBar').classList.remove('show'); if (section === 'documents') { renderDocsMeta(ev.stats); runDocSearch(); } }
        else if (ev.type === 'meeting-start') { go('meetings'); if (!window.NovaRecorder.recording) startMeeting(); }
        else if (ev.type === 'meeting-stop') { if (window.NovaRecorder.recording) stopMeeting(); }
        else if (ev.type === 'ocr-result' && ev.text) toast('Text copied', ev.text.slice(0, 200));
        else if (ev.type === 'wake-status' || ev.type === 'hotkeys') window.nova.state().then((st) => { S.status = st.status; renderSideStatus(); });
      }
    }
  });
  $('#compToggle').onchange = (e) => window.nova.setCompanion(e.target.checked);

  // ---------------------------------------------------------- toasts
  function toast(title, text, buttons = [], ttl = 6000) {
    const t = document.createElement('div'); t.className = 'toast';
    t.innerHTML = `<div class="title">${esc(title)}</div><div>${md(text)}</div>`;
    if (buttons.length) {
      const row = document.createElement('div'); row.className = 'row';
      for (const [l, c, fn] of buttons) { const b = document.createElement('button'); b.textContent = l; b.className = c; b.onclick = () => { fn(); t.remove(); }; row.appendChild(b); }
      t.appendChild(row);
    }
    $('#toasts').appendChild(t);
    if (ttl) setTimeout(() => t.remove(), ttl);
  }

  // ---------------------------------------------------------- REMINDERS
  function renderReminders() {
    const list = S.reminders;
    const now = new Date(), endToday = new Date(); endToday.setHours(23, 59, 59, 999);
    const endTom = new Date(endToday); endTom.setDate(endTom.getDate() + 1);
    const groups = [
      ['Today', list.filter((r) => !r.repeat && r.at <= endToday)],
      ['Tomorrow', list.filter((r) => !r.repeat && r.at > endToday && r.at <= endTom)],
      ['Later', list.filter((r) => !r.repeat && r.at > endTom)],
      ['Repeating', list.filter((r) => r.repeat)]
    ];
    let html = '';
    for (const [name, items] of groups) {
      if (!items.length) continue;
      html += `<div class="group-h">${name}</div>` + items.map((r) => `
        <div class="item"><div class="ico">${r.kind === 'alarm' ? '⏰' : r.kind === 'timer' ? '⏱' : '🔔'}</div>
          <div class="main"><div class="t">${esc(r.text)}</div><div class="w">${when(r.at, r.repeat)}${r.repeat ? ` <span class="tag">next ${when(r.at)}</span>` : ''}</div></div>
          <div class="acts"><button data-del="${r.id}">Delete</button></div></div>`).join('');
    }
    const recent = (S.recent || []).slice().reverse().slice(0, 8);
    if (recent.length) html += `<div class="group-h">Recently done</div>` + recent.map((r) => `
        <div class="item done"><div class="ico">✓</div><div class="main"><div class="t">${esc(r.text)}</div><div class="w">${when(r.firedAt || r.at)}</div></div>
          <div class="acts"><button data-again="${r.id}">Remind again in 10 min</button></div></div>`).join('');
    $('#remList').innerHTML = html || '<div class="empty" style="padding:30px 4px">No reminders yet. Type one above in plain English.</div>';
    $$('#remList [data-del]').forEach((b) => (b.onclick = () => window.nova.action('reminder_delete', { id: b.dataset.del })));
    $$('#remList [data-again]').forEach((b) => (b.onclick = async () => { const r = (S.recent || []).find((x) => x.id === b.dataset.again); await window.nova.action('reminder', { text: r.text, inMs: 600000 }); toast('Reminder', 'Snoozed 10 minutes.'); }));
  }
  async function addRemNatural() {
    const v = $('#remText').value.trim(); if (!v) return;
    const r = await window.nova.action('reminder', { text: v });
    if (!r.error) $('#remText').value = '';
    toast(r.error ? 'Need a time' : 'Reminder', r.text);
  }
  $('#remAdd').onclick = addRemNatural;
  $('#remText').addEventListener('keydown', (e) => { if (e.key === 'Enter') addRemNatural(); });
  $('#remAdd2').onclick = async () => {
    const what = $('#remWhat').value.trim(), at = $('#remWhen').value;
    if (!at) return toast('Reminder', 'Pick a date and time.');
    const r = await window.nova.action('reminder', { text: what || ($('#remKind').value === 'alarm' ? 'Alarm' : 'Reminder'), at: new Date(at).toISOString(), repeat: $('#remRepeat').value || null, alarm: $('#remKind').value === 'alarm' });
    toast('Reminder', r.text); if (!r.error) { $('#remWhat').value = ''; }
  };

  // ---------------------------------------------------------- TASKS
  let taskFilter = 'open';
  const PR = { high: 0, normal: 1, low: 2 };
  const sortTasks = (a) => a.slice().sort((x, y) => (PR[x.priority] - PR[y.priority]) || ((x.due || 9e15) - (y.due || 9e15)) || (x.created - y.created));
  function renderTasks() {
    const end = new Date(); end.setHours(23, 59, 59, 999);
    let list = S.tasks;
    if (taskFilter === 'open') list = sortTasks(list.filter((t) => !t.done));
    else if (taskFilter === 'today') list = sortTasks(list.filter((t) => !t.done && ((t.due && t.due <= end) || t.priority === 'high')));
    else list = list.filter((t) => t.done).sort((a, b) => (b.doneAt || 0) - (a.doneAt || 0));
    $('#taskList').innerHTML = list.length ? list.map((t) => {
      const dl = dueLabel(t.due);
      const cls = dl === 'Overdue' ? 'over' : dl === 'Today' ? 'today' : '';
      return `<div class="item ${t.done ? 'done' : ''}"><div class="chk ${t.done ? 'on' : ''}" data-tog="${t.id}"></div>
        <div class="main"><div class="t">${esc(t.text)}</div><div class="w">${dl ? `<span class="tag ${cls}">${dl}${t.due && new Date(t.due).getHours() !== 9 ? ' ' + fmtTime(t.due) : ''}</span>` : ''}<span class="tag ${t.priority === 'high' ? 'high' : ''}" data-pri="${t.id}" title="Click to change priority">${t.priority}</span></div></div>
        <div class="acts"><button data-tdel="${t.id}">Delete</button></div></div>`;
    }).join('') : `<div class="empty" style="padding:30px 4px">${taskFilter === 'done' ? 'Nothing completed yet.' : 'All clear! Add a task above or say "add task …".'}</div>`;
    $$('#taskList [data-tog]').forEach((c) => (c.onclick = () => { c.classList.toggle('on'); setTimeout(() => window.nova.action('task_toggle', { id: c.dataset.tog }), 200); }));
    $$('#taskList [data-tdel]').forEach((b) => (b.onclick = () => window.nova.action('task_delete', { id: b.dataset.tdel })));
    $$('#taskList [data-pri]').forEach((b) => (b.onclick = () => {
      const t = S.tasks.find((x) => x.id === b.dataset.pri); const next = { normal: 'high', high: 'low', low: 'normal' }[t.priority];
      window.nova.action('task_update', { id: t.id, patch: { priority: next } });
    }));
  }
  $$('#taskFilter button').forEach((b) => (b.onclick = () => { taskFilter = b.dataset.f; $$('#taskFilter button').forEach((x) => x.classList.toggle('on', x === b)); renderTasks(); }));
  async function addTask() {
    const v = $('#taskText').value.trim(); if (!v) return;
    const r = await window.nova.action('task_add', { text: v, priority: $('#taskPri').value === 'normal' ? undefined : $('#taskPri').value });
    $('#taskText').value = ''; toast('Task', r.text);
  }
  $('#taskAdd').onclick = addTask;
  $('#taskText').addEventListener('keydown', (e) => { if (e.key === 'Enter') addTask(); });
  $('#taskClear').onclick = () => window.nova.action('tasks_clear_done', {});

  // ---------------------------------------------------------- NOTES
  function renderNotes() {
    const q = $('#noteSearch').value.trim().toLowerCase();
    const list = S.notes.filter((n) => !q || n.text.toLowerCase().includes(q)).slice().reverse();
    $('#noteGrid').innerHTML = list.length ? list.map((n) => `<div class="note">${md(n.text)}<div class="w"><span>${new Date(n.t).toLocaleDateString([], { day: 'numeric', month: 'short' })} · ${fmtTime(n.t)}</span><span><button data-copy="${n.id}">Copy</button><button data-ndel="${n.id}">Delete</button></span></div></div>`).join('') : `<div class="empty" style="padding:20px 4px">${q ? 'No matching notes.' : 'No notes yet. Say "note …" or type above.'}</div>`;
    $$('#noteGrid [data-ndel]').forEach((b) => (b.onclick = () => window.nova.action('note_delete', { id: b.dataset.ndel })));
    $$('#noteGrid [data-copy]').forEach((b) => (b.onclick = () => { navigator.clipboard.writeText(S.notes.find((n) => n.id === b.dataset.copy).text); b.textContent = 'Copied'; }));
  }
  const addNote = async () => { const v = $('#noteText').value.trim(); if (!v) return; await window.nova.action('note_add', { text: v }); $('#noteText').value = ''; };
  $('#noteAdd').onclick = addNote;
  $('#noteText').addEventListener('keydown', (e) => { if (e.key === 'Enter' && e.ctrlKey) addNote(); });
  $('#noteSearch').addEventListener('input', renderNotes);

  // ---------------------------------------------------------- ROUTINES
  let editing = null;
  function renderRoutines() {
    $('#routineList').innerHTML = S.routines.map((r) => editing === r.id ? `
      <div class="routine"><input data-rname value="${esc(r.name)}" placeholder="Routine name (what you'll say)">
        <textarea data-rsteps rows="6" placeholder="One step per line">${esc(r.steps.join('\n'))}</textarea>
        <div class="acts"><button class="primary" data-rsave="${r.id}">Save</button><button class="ghost" data-rcancel>Cancel</button><button class="ghost" data-rdel="${r.id}" style="margin-left:auto">Delete</button></div></div>` : `
      <div class="routine"><div class="name">${esc(r.name)}</div><ol>${r.steps.map((s) => `<li>${esc(s)}</li>`).join('')}</ol>
        <div class="acts"><button class="primary" data-rrun="${esc(r.name)}">▶ Run</button><button class="ghost" data-redit="${r.id}">Edit</button></div></div>`).join('');
    $$('[data-rrun]').forEach((b) => (b.onclick = () => { session.submit(b.dataset.rrun); go('chat'); }));
    $$('[data-redit]').forEach((b) => (b.onclick = () => { editing = b.dataset.redit; renderRoutines(); }));
    $$('[data-rcancel]').forEach((b) => (b.onclick = () => { if (editing && editing.startsWith('new_')) S.routines = S.routines.filter((r) => r.id !== editing); editing = null; renderRoutines(); }));
    $$('[data-rdel]').forEach((b) => (b.onclick = () => { editing = null; window.nova.action('routine_delete', { id: b.dataset.rdel }); }));
    $$('[data-rsave]').forEach((b) => (b.onclick = async () => {
      const card = b.closest('.routine');
      const id = b.dataset.rsave.startsWith('new_') ? undefined : b.dataset.rsave;
      editing = null;
      await window.nova.action('routine_save', { routine: { id, name: $('[data-rname]', card).value, steps: $('[data-rsteps]', card).value.split('\n') } });
    }));
  }
  $('#routineNew').onclick = () => { const id = 'new_' + Date.now(); S.routines.push({ id, name: '', steps: [] }); editing = id; renderRoutines(); };

  // ---------------------------------------------------------- SKILLS
  const SKILLS = [
    ['📅', 'Calendar', ['add event team sync tomorrow 3 to 4 pm @ Teams', "what's on my calendar this week", 'what do I have tomorrow', 'cancel meeting team sync']],
    ['🎯', 'Focus & breaks', ['start focus 25 min on BOE review', 'pause focus', 'take a break', 'how much did I focus today', 'turn on water reminders']],
    ['🔁', 'Habits', ['log water', 'did stretch', 'add habit read 20 minutes', 'show habits']],
    ['📋', 'Clipboard & shortcuts', ['show clipboard history', 'add shortcut SAP for sap logon', 'open SAP', 'find BOE']],
    ['🟦', 'SAP launcher', ['open VA01 in PRD', 'sap SE38', 'tcode /BRI/EXIM_MWR']],
    ['📄', 'Document finder', ['find file Motherson Annexure B', 'find the BOE for invoice 4471', 'search my documents for ICEGATE']],
    ['✂️', 'Grab text from screen', ['grab text from screen', 'Alt+Shift+T anywhere']],
    ['📧', 'Outlook (on this PC)', ['sync outlook', 'check my email', 'draft an email to Vivek about Havells CR estimate']],
    ['⚙️', 'Automations & tidy', ['tidy my downloads', 'undo tidy', 'run automation BOE PDFs → monthly folder']],
    ['🗓', 'Day planner', ['plan my day', 'plan tomorrow', 'add plan to calendar']],
    ['🕒', 'Usage & focus guard', ['screen time', 'app usage this week']],
    ['⭐', 'Rewards & outfits', ['my level', 'wear the glasses', 'put on headphones', 'take off the cap']],
    ['🧗', 'Nova explores', ['come here', 'visit my window']],
    ['📱', 'Phone', ['send to my phone: leave at 6']],
    ['📌', 'Widgets', ['pin a sticky note on my desktop: call bank', 'add tasks widget', 'add a countdown widget']],
    ['🎙', 'Meeting notes', ['record this meeting', 'stop recording']],
    ['💧', 'Water (no AI needed)', ['drink water', 'had 2 glasses of water', 'drank 500 ml water', 'how much water today', 'set water goal to 10', 'remind me to drink water every hour', 'undo water']],
    ['⚡', 'Quick actions', ['right-click the desktop Nova for one-click water, reminders, timers, focus, tasks and notes', 'Alt+Shift+W logs a glass of water from anywhere', 'Alt+Shift+Q opens quick actions']],
    ['🧠', 'Understands typos & variations offline', ['remnd me tomorow at 5 to call vivek', 'ping me in 10 minutes to check the oven', 'check the oven in 10 minutes', 'put buy milk on my todo list', 'max volume']],
    ['👥', 'People & birthdays', ["Vivek's birthday is 12 March", 'add contact Arya phone 9876543210', 'call Vivek', 'email Vivek', 'upcoming birthdays']],
    ['💸', 'Money', ['spent 250 on lunch', 'add expense 1200 cab to airport', 'how much did I spend this month', 'how much have I spent today']],
    ['📔', 'Journal', ['journal: shipped the SEZ demo today', 'mood 4']],
    ['🧰', 'Tools', ['time in London', '10 km to miles', '100 usd to inr', 'countdown to SEZ go-live on 15 Jan', 'how many days until 25 Dec', 'generate a password', 'start stopwatch', 'do not disturb on', 'read my clipboard aloud']],
    ['🔔', 'Reminders & alarms', ['remind me tomorrow at 9 to call the client', 'remind me every weekday at 9:45 to join standup', 'set an alarm for 6:30 am', 'show reminders', 'snooze 15 min']],
    ['✅', 'Tasks', ['add task send Havells CR estimate by Friday urgent', 'show my tasks', 'mark Havells estimate done', 'what do I need to do today']],
    ['📝', 'Notes', ['note BOE mapping needs CLIN field', 'search notes for BOE', 'show notes']],
    ['☀️', 'Routines & briefing', ['start my day', 'focus mode', 'brief me']],
    ['⚡', 'Several things at once', ['mute, open excel and set a 25 min timer', 'open notepad and write a leave note for Monday', 'lock and turn volume to 20']],
    ['👀', 'Screen awareness', ["what's on my screen?", 'explain this error', 'summarize this page', 'click the Save button']],
    ['🖱️', 'Mouse & keyboard', ['type Dear team, please find attached', 'press ctrl+s', 'press tab 3 times', 'scroll down', 'switch to outlook']],
    ['🎙', 'Voice', ['start dictation', 'say "Hey Nova" (wake word)', 'stop']],
    ['💻', 'PC control', ['open sap logon', 'close chrome', 'volume 40', 'next song', 'screenshot', 'minimize all', 'lock']],
    ['🌦', 'Info', ['weather tomorrow', "what's the date", 'what year is it', '15% of 2400', 'battery', 'system info']],
    ['🌐', 'Web', ['search SAP RAP tutorial', 'youtube lofi', 'open github.com']],
    ['🧠', 'Ask anything (optional AI)', ['draft a polite follow-up email to Vivek', 'summarize my clipboard', 'explain MOOWR in 3 lines']]
  ];
  $('#skills').innerHTML = SKILLS.map(([i, t, ex]) => `<div class="card skill"><h4>${i} ${t}</h4><div class="ex">${ex.map((e) => `<button>${esc(e)}</button>`).join('')}</div></div>`).join('');
  $$('#skills .ex button').forEach((b) => (b.onclick = () => { if (/^say |right-click|Alt\+Shift/.test(b.textContent)) return; session.submit(b.textContent); go('chat'); }));


  // ---------------------------------------------------------- CALENDAR
  let calMonth = new Date(), calSel = new Date();
  function itemsForDay(d) {
    const a = new Date(d); a.setHours(0, 0, 0, 0); const b = new Date(a); b.setHours(23, 59, 59, 999);
    const out = [];
    (S.events || []).filter((e) => e.start <= +b && e.end >= +a).forEach((e) => out.push({ type: 'e', at: e.allDay ? +a : e.start, title: e.title, sub: e.allDay ? 'All day' : `${fmtTime(e.start)}–${fmtTime(e.end)}`, loc: e.location, id: e.id }));
    S.reminders.filter((r) => r.at >= +a && r.at <= +b).forEach((r) => out.push({ type: 'r', at: r.at, title: r.text, sub: fmtTime(r.at) + (r.repeat ? ' · repeats' : ''), id: r.id, kind: r.kind }));
    S.tasks.filter((t) => !t.done && t.due && t.due >= +a && t.due <= +b).forEach((t) => out.push({ type: 't', at: t.due, title: t.text, sub: 'Task due', id: t.id }));
    return out.sort((x, y) => x.at - y.at);
  }
  function renderCalendar() {
    if (!S) return;
    const m = new Date(calMonth.getFullYear(), calMonth.getMonth(), 1);
    $('#calTitle').textContent = m.toLocaleDateString([], { month: 'long', year: 'numeric' });
    const start = new Date(m); start.setDate(1 - ((m.getDay() + 6) % 7));
    const today = new Date().toDateString(), sel = calSel.toDateString();
    let html = '';
    for (let i = 0; i < 42; i++) {
      const d = new Date(start); d.setDate(start.getDate() + i);
      const its = itemsForDay(d);
      html += `<div class="cal-day ${d.getMonth() !== m.getMonth() ? 'other' : ''} ${d.toDateString() === today ? 'today' : ''} ${d.toDateString() === sel ? 'sel' : ''}" data-d="${+d}"><span class="dn">${d.getDate()}</span>${its.slice(0, 3).map((x) => `<div class="ev ${x.type === 'r' ? 'r' : x.type === 't' ? 't' : ''}">${esc(x.title)}</div>`).join('')}${its.length > 3 ? `<div class="more">+${its.length - 3} more</div>` : ''}</div>`;
    }
    $('#calGrid').innerHTML = html;
    $$('#calGrid .cal-day').forEach((el) => (el.onclick = () => { calSel = new Date(+el.dataset.d); renderCalendar(); }));
    const its = itemsForDay(calSel);
    $('#dayTitle').textContent = calSel.toDateString() === today ? 'Today' : calSel.toLocaleDateString([], { weekday: 'long', day: 'numeric', month: 'long' });
    $('#dayList').innerHTML = its.length ? its.map((x) => `<div class="agenda-item"><div class="tm">${x.type === 'e' ? (x.sub === 'All day' ? 'All day' : fmtTime(x.at)) : fmtTime(x.at)}</div><div class="bd"><div>${x.type === 'e' ? '📅' : x.type === 't' ? '✅' : x.kind === 'alarm' ? '⏰' : '🔔'} ${esc(x.title)}</div><div class="w">${esc(x.sub)}${x.loc ? ' · ' + esc(x.loc) : ''}</div></div>${x.type === 'e' ? `<button data-edel="${x.id}" title="Delete">✕</button>` : ''}</div>`).join('') : '<div class="empty">Nothing on this day. Add an event above.</div>';
    $$('#dayList [data-edel]').forEach((b) => (b.onclick = () => window.nova.action('event_delete', { id: b.dataset.edel })));
  }
  $('#calPrev').onclick = () => { calMonth = new Date(calMonth.getFullYear(), calMonth.getMonth() - 1, 1); renderCalendar(); };
  $('#calNext').onclick = () => { calMonth = new Date(calMonth.getFullYear(), calMonth.getMonth() + 1, 1); renderCalendar(); };
  $('#calToday').onclick = () => { calMonth = new Date(); calSel = new Date(); renderCalendar(); };
  async function addEvent() {
    const v = $('#evText').value.trim(); if (!v) return;
    let text = v;
    // if the text has no date words, use the selected calendar day
    if (!/(today|tomorrow|tonight|mon|tue|wed|thu|fri|sat|sun|jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec|\d{1,2}\/\d{1,2}|next|every|\bin \d)/i.test(v) && calSel.toDateString() !== new Date().toDateString()) text = `${v} on ${calSel.getDate()}/${calSel.getMonth() + 1}/${calSel.getFullYear()}`;
    const rm = +$('#evRemind').value;
    const r = await window.nova.action('event_add', { title: text, remindMin: rm < 0 ? -1 : rm });
    toast(r.error ? 'Event' : 'Added', r.text); if (!r.error) $('#evText').value = '';
  }
  $('#evAdd').onclick = addEvent;
  $('#evText').addEventListener('keydown', (e) => { if (e.key === 'Enter') addEvent(); });

  // ---------------------------------------------------------- FOCUS
  let fMin = 25;
  function renderFocus() {
    if (!S) return;
    const st = S.focusState || { phase: 'idle' }, stats = S.focusStats || { week: [], todayMin: 0, todayCount: 0 };
    const total = (st.minutes || fMin) * 60000;
    const left = st.phase === 'idle' ? fMin * 60000 : st.paused ? st.remaining : Math.max(0, st.endsAt - Date.now());
    $('#fTime').textContent = mmss(left);
    $('#fPhase').textContent = st.phase === 'idle' ? 'Ready' : `${st.phase === 'work' ? 'Focusing' : st.long ? 'Long break' : 'Break'}${st.paused ? ' · paused' : ''}${st.label ? ' · ' + st.label : ''}`;
    const fg = $('#ringFg'); fg.classList.toggle('brk', st.phase === 'break');
    fg.style.strokeDashoffset = st.phase === 'idle' ? 540.35 : 540.35 * (left / total);
    $('#fStart').style.display = st.phase === 'idle' ? '' : 'none';
    $('#fPause').style.display = st.phase === 'idle' ? 'none' : ''; $('#fPause').textContent = st.paused ? 'Resume' : 'Pause';
    $('#fStop').style.display = st.phase === 'idle' ? 'none' : '';
    $('#fAuto').checked = S.settings.focus ? S.settings.focus.autoBreak !== false : true;
    $('#cntFocus').textContent = st.phase === 'work' ? '●' : '';
    const max = Math.max(30, ...stats.week.map((w) => w.minutes));
    $('#fBars').innerHTML = stats.week.map((w, i) => `<div class="bar-col ${i === 6 ? 'today' : ''}"><span class="v">${w.minutes || ''}</span><div class="b" style="height:${(w.minutes / max) * 100}%"></div><span class="l">${w.day}</span></div>`).join('');
    $('#fToday').textContent = `Today: ${stats.todayMin} min · ${stats.todayCount} session${stats.todayCount === 1 ? '' : 's'}`;
    const wb = S.settings.wellbeing || {};
    ['Stretch', 'Water', 'Eyes'].forEach((k) => { const key = k.toLowerCase(); $('#wb' + k).checked = !!wb[key]; if (document.activeElement !== $('#wb' + k + 'Every')) $('#wb' + k + 'Every').value = wb[key + 'Every'] || ''; });
    if (document.activeElement !== $('#wbQs')) $('#wbQs').value = wb.quietStart || '22:00';
    if (document.activeElement !== $('#wbQe')) $('#wbQe').value = wb.quietEnd || '08:00';
  }
  setInterval(() => { if (S && S.focusState && S.focusState.phase !== 'idle' && !S.focusState.paused) { if (section === 'focus') renderFocus(); if (section === 'home') renderHomeFocus(); } }, 1000);
  $$('.f-presets button').forEach((b) => (b.onclick = () => { fMin = +b.dataset.min; $$('.f-presets button').forEach((x) => x.classList.toggle('on', x === b)); renderFocus(); }));
  $('#fStart').onclick = () => window.nova.action('focus_start', { minutes: fMin, label: $('#fLabel').value.trim() });
  $('#fPause').onclick = () => window.nova.action('focus_pause', {});
  $('#fStop').onclick = () => window.nova.action('focus_stop', {});
  $('#fBreak').onclick = () => window.nova.action('focus_break', {});
  $('#fAuto').onchange = (e) => window.nova.saveSettings({ focus: { autoBreak: e.target.checked } }).then((st) => (S = st));
  const saveWb = () => window.nova.saveSettings({ wellbeing: {
    stretch: $('#wbStretch').checked, water: $('#wbWater').checked, eyes: $('#wbEyes').checked,
    stretchEvery: +$('#wbStretchEvery').value || 60, waterEvery: +$('#wbWaterEvery').value || 90, eyesEvery: +$('#wbEyesEvery').value || 20,
    quietStart: $('#wbQs').value || '22:00', quietEnd: $('#wbQe').value || '08:00' } }).then((st) => { S = st; toast('Wellbeing', 'Saved.'); });
  ['#wbStretch', '#wbWater', '#wbEyes', '#wbStretchEvery', '#wbWaterEvery', '#wbEyesEvery', '#wbQs', '#wbQe'].forEach((id) => ($(id).onchange = saveWb));

  // ---------------------------------------------------------- HABITS
  function streak(h) { let n = 0; const d = new Date(); if (!(((h.log || {})[dayKey(d)] || 0) >= (h.target || 1))) d.setDate(d.getDate() - 1); while (((h.log || {})[dayKey(d)] || 0) >= (h.target || 1)) { n++; d.setDate(d.getDate() - 1); } return n; }
  function renderHabits() {
    const k = dayKey(new Date());
    $('#habList').innerHTML = (S.habits || []).map((h) => {
      const n = (h.log || {})[k] || 0, tg = h.target || 1, st = streak(h);
      let week = '';
      for (let i = 6; i >= 0; i--) { const d = new Date(); d.setDate(d.getDate() - i); const v = (h.log || {})[dayKey(d)] || 0; week += `<span class="${v >= tg ? 'full' : v > 0 ? 'part' : ''}" title="${d.toLocaleDateString([], { weekday: 'short' })}: ${v}/${tg}"></span>`; }
      return `<div class="habit ${n >= tg ? 'done' : ''}"><div class="hi">${esc(h.icon || '⭐')}</div><div class="hm"><div class="hn">${esc(h.name)}</div><div class="hs">${st ? `🔥 ${st}-day streak · ` : ''}${tg}× a day</div></div><div class="week">${week}</div><div class="cnt"><button data-hm="${h.id}">−</button><b>${n}/${tg}</b><button class="plus" data-hp="${h.id}">+</button></div><button class="del" data-hd="${h.id}" title="Delete">✕</button></div>`;
    }).join('') || '<div class="empty">No habits yet. Add one above.</div>';
    $$('[data-hp]').forEach((b) => (b.onclick = () => window.nova.action('habit_log', { id: b.dataset.hp, delta: 1 })));
    $$('[data-hm]').forEach((b) => (b.onclick = () => window.nova.action('habit_log', { id: b.dataset.hm, delta: -1 })));
    $$('[data-hd]').forEach((b) => (b.onclick = () => window.nova.action('habit_delete', { id: b.dataset.hd })));
  }
  $('#habAdd').onclick = async () => { const n = $('#habName').value.trim(); if (!n) return; await window.nova.action('habit_add', { name: n, icon: $('#habIcon').value.trim() || '⭐', target: +$('#habTarget').value || 1 }); $('#habName').value = ''; };
  $('#habName').addEventListener('keydown', (e) => { if (e.key === 'Enter') $('#habAdd').click(); });

  // ---------------------------------------------------------- CLIPBOARD
  function renderClipboard() {
    const q = $('#clipSearch').value.trim().toLowerCase();
    const list = (S.clipboard || []).filter((c) => !q || c.text.toLowerCase().includes(q)).sort((a, b) => (b.pinned - a.pinned) || (b.t - a.t));
    $('#clipOn').checked = S.settings.clipboardCapture !== false;
    $('#clipList').innerHTML = list.length ? list.slice(0, 200).map((c) => `<div class="clip ${c.pinned ? 'pinned' : ''}" data-cc="${c.id}" title="Click to copy"><div class="ct">${esc(c.text)}</div><div><div class="cw">${fmtTime(c.t)}${new Date(c.t).toDateString() !== new Date().toDateString() ? ' · ' + new Date(c.t).toLocaleDateString([], { day: 'numeric', month: 'short' }) : ''}</div><div class="ca"><button data-cp="${c.id}" title="Pin">${c.pinned ? '★' : '☆'}</button><button data-cd="${c.id}" title="Remove">✕</button></div></div></div>`).join('') : `<div class="empty" style="padding:24px 4px">${q ? 'No matches.' : 'Copy some text anywhere and it will appear here.'}</div>`;
    $$('#clipList [data-cc]').forEach((el) => (el.onclick = (e) => { if (e.target.closest('button')) return; window.nova.action('clipboard_copy', { id: el.dataset.cc }).then(() => toast('Clipboard', 'Copied. Paste it anywhere.')); }));
    $$('#clipList [data-cp]').forEach((b) => (b.onclick = () => window.nova.action('clipboard_pin', { id: b.dataset.cp })));
    $$('#clipList [data-cd]').forEach((b) => (b.onclick = () => window.nova.action('clipboard_delete', { id: b.dataset.cd })));
  }
  $('#clipSearch').addEventListener('input', renderClipboard);
  $('#clipClear').onclick = () => window.nova.action('clipboard_clear', {});
  $('#clipOn').onchange = (e) => window.nova.saveSettings({ clipboardCapture: e.target.checked }).then((st) => (S = st));

  // ---------------------------------------------------------- SHORTCUTS
  function scIcon(x) { return { app: '🧩', url: '🌐', folder: '📁', file: '📄', command: '⚡' }[x.kind] || '⭐'; }
  async function runShortcut(id) { const r = await window.nova.action('shortcut_open', { id }); if (r.run) session.submit(r.run); else if (r.error) toast('Shortcut', r.text); }
  function renderShortcuts() {
    $('#scGrid').innerHTML = (S.shortcuts || []).map((x) => `<div class="tile" data-sc="${x.id}"><button class="x" data-scd="${x.id}" title="Remove">✕</button><div class="ti">${scIcon(x)}</div><div class="tn">${esc(x.name)}</div><div class="tt">${esc(x.target)}</div></div>`).join('') || '<div class="empty">No shortcuts yet.</div>';
    $$('#scGrid [data-sc]').forEach((el) => (el.onclick = (e) => { if (e.target.closest('.x')) return; runShortcut(el.dataset.sc); }));
    $$('#scGrid [data-scd]').forEach((b) => (b.onclick = () => window.nova.action('shortcut_delete', { id: b.dataset.scd })));
    renderHome();
  }
  let appsLoaded = false;
  async function loadApps() { if (appsLoaded) return; const names = await window.nova.apps().catch(() => []); if (names.length) { appsLoaded = true; $('#dl_apps').innerHTML = names.map((n) => `<option value="${esc(n)}">`).join(''); } }
  $('#scAdd').onclick = async () => {
    const target = $('#scTarget').value.trim(); if (!target) return;
    const r = await window.nova.action('shortcut_add', { name: $('#scName').value.trim() || target, target, kind: $('#scKind').value || undefined });
    toast('Shortcut', r.text); $('#scName').value = ''; $('#scTarget').value = '';
  };


  // ---------------------------------------------------------- PEOPLE
  const COLORS = ['#D9773F', '#5E8C61', '#7B6FC0', '#C98A2B', '#3F8FB0', '#C24E3A', '#8A6E4B'];
  const colorFor = (n) => COLORS[[...n].reduce((a, c) => a + c.charCodeAt(0), 0) % COLORS.length];
  function renderPeople() {
    const q = $('#pSearch').value.trim().toLowerCase();
    const list = (S.people || []).filter((p) => !q || [p.name, p.company, p.email, p.phone, p.notes].join(' ').toLowerCase().includes(q)).sort((a, b) => a.name.localeCompare(b.name));
    $('#pList').innerHTML = list.length ? list.map((p) => {
      const d = p.birthday ? bdDays(p.birthday) : null;
      return `<div class="person"><div class="avatar-i" style="background:${colorFor(p.name)}">${esc(p.name.split(/\s+/).map((w) => w[0]).slice(0, 2).join('').toUpperCase())}</div>
        <div style="min-width:0;flex:1"><div class="pn">${esc(p.name)}</div><div class="pm">${[p.company && esc(p.company), p.phone && '📞 ' + esc(p.phone), p.email && '✉️ ' + esc(p.email), p.birthday && `🎂 <span class="${d <= 7 ? 'bd-soon' : ''}">${bdLabel(p.birthday)}${d === 0 ? ' · today!' : d <= 30 ? ' · in ' + d + 'd' : ''}</span>`].filter(Boolean).join('<br>')}</div>
        <div class="pa">${p.phone ? `<button data-call="${p.id}">Call</button><button data-wa="${p.id}">WhatsApp</button>` : ''}${p.email ? `<button data-mail="${p.id}">Email</button>` : ''}<button data-pedit="${p.id}">Edit</button></div></div>
        <button class="del" data-pdel="${p.id}" title="Remove">✕</button></div>`;
    }).join('') : `<div class="empty" style="padding:20px 4px">${q ? 'No matches.' : 'No people yet. Add someone above.'}</div>`;
    const contact = (id, how) => window.nova.action('person_contact', { query: S.people.find((p) => p.id === id).name, how }).then((r) => toast('People', r.text));
    $$('[data-call]').forEach((b) => (b.onclick = () => contact(b.dataset.call, 'call')));
    $$('[data-wa]').forEach((b) => (b.onclick = () => contact(b.dataset.wa, 'whatsapp')));
    $$('[data-mail]').forEach((b) => (b.onclick = () => contact(b.dataset.mail, 'email')));
    $$('[data-pdel]').forEach((b) => (b.onclick = () => window.nova.action('person_delete', { id: b.dataset.pdel })));
    $$('[data-pedit]').forEach((b) => (b.onclick = () => {
      const p = S.people.find((x) => x.id === b.dataset.pedit);
      $('#pName').value = p.name; $('#pPhone').value = p.phone || ''; $('#pEmail').value = p.email || ''; $('#pBday').value = p.birthday ? bdLabel(p.birthday) : ''; $('#pCompany').value = p.company || '';
      $('#pAdd').textContent = 'Save'; $('#pName').focus();
    }));
  }
  $('#pSearch').addEventListener('input', renderPeople);
  $('#pAdd').onclick = async () => {
    const name = $('#pName').value.trim(); if (!name) return;
    const r = await window.nova.action('person_add', { name, phone: $('#pPhone').value.trim(), email: $('#pEmail').value.trim(), birthday: $('#pBday').value.trim(), company: $('#pCompany').value.trim() });
    toast('People', r.text);
    if (!r.error) { ['#pName', '#pPhone', '#pEmail', '#pBday', '#pCompany'].forEach((i) => ($(i).value = '')); $('#pAdd').textContent = 'Add'; }
  };

  // ---------------------------------------------------------- MONEY
  const money = (n) => (S.settings.currency || '₹') + Number(n).toLocaleString('en-IN', { maximumFractionDigits: 2 });
  function renderMoney() {
    const ex = (S.expenses || []).slice().sort((a, b) => b.t - a.t);
    const now = new Date(), mStart = +new Date(now.getFullYear(), now.getMonth(), 1), dStart = +new Date(now.getFullYear(), now.getMonth(), now.getDate()), wStart = dStart - 6 * 864e5;
    const sum = (f) => ex.filter(f).reduce((a, e) => a + e.amount, 0);
    const month = sum((e) => e.t >= mStart), today = sum((e) => e.t >= dStart), week = sum((e) => e.t >= wStart);
    const budget = +S.settings.budget || 0;
    $('#mMonth').textContent = money(month); $('#mToday').textContent = money(today); $('#mWeek').textContent = `Last 7 days: ${money(week)}`;
    const pct = budget ? Math.min(100, month / budget * 100) : 0;
    $('#mMeter').style.width = (budget ? pct : 0) + '%'; $('#mMeter').classList.toggle('over', budget && month > budget);
    $('#mBudgetLine').textContent = budget ? `${Math.round(month / budget * 100)}% of ${money(budget)} · ${month > budget ? money(month - budget) + ' over' : money(budget - month) + ' left'}` : 'Set a monthly budget (top right) to track it.';
    const byCat = {}; ex.filter((e) => e.t >= mStart).forEach((e) => (byCat[e.category] = (byCat[e.category] || 0) + e.amount));
    const cats = Object.entries(byCat).sort((a, b) => b[1] - a[1]); const max = cats.length ? cats[0][1] : 1;
    $('#mCats').innerHTML = cats.length ? cats.slice(0, 7).map(([c, v]) => `<div class="cat"><span>${esc(c)}</span><div class="cb"><i style="width:${v / max * 100}%"></i></div><span class="cv">${money(v)}</span></div>`).join('') : '<div class="empty">No spending this month.</div>';
    $('#mList').innerHTML = ex.length ? ex.slice(0, 60).map((e) => `<div class="item"><div class="ico">💸</div><div class="main"><div class="t">${esc(e.note || e.category)}</div><div class="w"><span class="tag">${esc(e.category)}</span>${new Date(e.t).toLocaleDateString([], { day: 'numeric', month: 'short' })} · ${fmtTime(e.t)}</div></div><div class="amt">${money(e.amount)}</div><div class="acts"><button data-xdel="${e.id}">Delete</button></div></div>`).join('') : '<div class="empty" style="padding:20px 4px">No expenses yet. Try "250 lunch" above, or say "spent 250 on lunch".</div>';
    $$('[data-xdel]').forEach((b) => (b.onclick = () => window.nova.action('expense_delete', { id: b.dataset.xdel })));
    if (document.activeElement !== $('#mBudget')) $('#mBudget').value = budget || '';
    if (document.activeElement !== $('#mCur')) $('#mCur').value = S.settings.currency || '₹';
  }
  async function addExpense() {
    const v = $('#mText').value.trim(); if (!v) return;
    const m = v.match(/^(?:rs\.?|₹)?\s*([\d,]+(?:\.\d+)?)\s*(.*)$/i) || v.match(/^(.*?)\s+(?:rs\.?|₹)?\s*([\d,]+(?:\.\d+)?)$/i);
    if (!m) return toast('Money', 'Start with the amount, e.g. "250 lunch".');
    const amount = /^\d/.test(m[1].replace(/,/g, '')) ? m[1] : m[2], note = /^\d/.test(m[1].replace(/,/g, '')) ? m[2] : m[1];
    const r = await window.nova.action('expense_add', { amount, note }); toast('Money', r.text); if (!r.error) $('#mText').value = '';
  }
  $('#mAdd').onclick = addExpense;
  $('#mText').addEventListener('keydown', (e) => { if (e.key === 'Enter') addExpense(); });
  $('#mBudget').onchange = () => window.nova.saveSettings({ budget: +$('#mBudget').value || 0 }).then((st) => { S = st; renderMoney(); });
  $('#mCur').onchange = () => window.nova.saveSettings({ currency: $('#mCur').value.trim() || '₹' }).then((st) => { S = st; renderMoney(); });

  // ---------------------------------------------------------- JOURNAL
  const MOODS = ['😞', '😕', '😐', '🙂', '😄'];
  let jMood = null;
  $$('#jMoods button').forEach((b) => (b.onclick = () => { jMood = jMood === +b.dataset.m ? null : +b.dataset.m; $$('#jMoods button').forEach((x) => x.classList.toggle('on', +x.dataset.m === jMood)); }));
  function renderJournal() {
    const list = (S.journal || []).slice().sort((a, b) => b.t - a.t);
    let strip = '';
    for (let i = 13; i >= 0; i--) {
      const d = new Date(); d.setDate(d.getDate() - i); const k = d.toDateString();
      const ms = list.filter((j) => j.mood && new Date(j.t).toDateString() === k).map((j) => j.mood);
      const avg = ms.length ? Math.round(ms.reduce((a, b) => a + b, 0) / ms.length) : null;
      strip += `<div title="${d.toDateString()}">${avg ? MOODS[avg - 1] : '·'}<span>${d.toLocaleDateString([], { weekday: 'narrow' })}</span></div>`;
    }
    $('#jStrip').innerHTML = strip;
    $('#jList').innerHTML = list.length ? list.slice(0, 100).map((j) => `<div class="jentry"><div class="jd"><b>${new Date(j.t).toLocaleDateString([], { weekday: 'long', day: 'numeric', month: 'short' })}</b>${fmtTime(j.t)}${j.mood ? ' · ' + MOODS[j.mood - 1] : ''}</div>${j.text ? `<div class="jt">${md(j.text)}</div>` : ''}<button class="del" data-jdel="${j.id}">✕</button></div>`).join('') : '<div class="empty" style="padding:20px 4px">No entries yet. Write your first one above, or say "journal: …".</div>';
    $$('[data-jdel]').forEach((b) => (b.onclick = () => window.nova.action('journal_delete', { id: b.dataset.jdel })));
  }
  const addJournal = async () => { const t = $('#jText').value.trim(); if (!t && !jMood) return; const r = await window.nova.action('journal_add', { text: t, mood: jMood }); toast('Journal', r.text); $('#jText').value = ''; jMood = null; $$('#jMoods button').forEach((x) => x.classList.remove('on')); };
  $('#jAdd').onclick = addJournal;
  $('#jText').addEventListener('keydown', (e) => { if (e.key === 'Enter' && e.ctrlKey) addJournal(); });

  // ---------------------------------------------------------- TOOLS
  const CITY = { tokyo: 'Asia/Tokyo', toronto: 'America/Toronto', london: 'Europe/London', 'new york': 'America/New_York', dubai: 'Asia/Dubai', singapore: 'Asia/Singapore', sydney: 'Australia/Sydney', paris: 'Europe/Paris', berlin: 'Europe/Berlin', 'los angeles': 'America/Los_Angeles', 'san francisco': 'America/Los_Angeles', chicago: 'America/Chicago', 'hong kong': 'Asia/Hong_Kong', shanghai: 'Asia/Shanghai', mumbai: 'Asia/Kolkata', india: 'Asia/Kolkata', riyadh: 'Asia/Riyadh', doha: 'Asia/Qatar', frankfurt: 'Europe/Berlin', amsterdam: 'Europe/Amsterdam', seoul: 'Asia/Seoul', bangkok: 'Asia/Bangkok', jakarta: 'Asia/Jakarta', 'kuala lumpur': 'Asia/Kuala_Lumpur', johannesburg: 'Africa/Johannesburg', utc: 'UTC' };
  function renderTools() {
    if (!S) return;
    $('#tClocks').innerHTML = (S.settings.clocks || []).map((tz, i) => { const c = clockText(tz); return `<div class="clock"><button class="x" data-ck="${i}">✕</button><div class="ct">${c.t}</div><div class="cn">${esc(cityName(tz))} · ${c.d}</div></div>`; }).join('');
    $$('[data-ck]').forEach((b) => (b.onclick = () => { const cl = S.settings.clocks.filter((_, i) => i !== +b.dataset.ck); window.nova.saveSettings({ clocks: cl }).then((st) => { S = st; renderTools(); renderHomeExtras(); }); }));
    const cds = (S.countdowns || []).slice().sort((a, b) => a.date - b.date);
    $('#tCds').innerHTML = cds.length ? cds.map((c) => `<div class="mini"><div class="ico">⏳</div><div class="t">${esc(c.title)}</div><div class="w">${daysTo(c.date) < 0 ? 'passed' : daysTo(c.date) === 0 ? 'Today!' : daysTo(c.date) + ' days'}</div><button class="link" data-cdd="${c.id}">✕</button></div>`).join('') : '<div class="empty">No countdowns yet.</div>';
    $$('[data-cdd]').forEach((b) => (b.onclick = () => window.nova.action('countdown_delete', { id: b.dataset.cdd })));
  }
  setInterval(() => { if (!S) return; if (section === 'tools') renderTools(); if (section === 'home') renderHomeExtras(); }, 30000);
  $('#tClockBtn').onclick = () => {
    const v = $('#tClockAdd').value.trim(); if (!v) return;
    let tz = CITY[v.toLowerCase()];
    if (!tz) { try { Intl.DateTimeFormat('en', { timeZone: v }); tz = v; } catch (e) {} }
    if (!tz) { const guess = Intl.supportedValuesOf ? Intl.supportedValuesOf('timeZone').find((z) => z.toLowerCase().includes(v.toLowerCase().replace(/\s+/g, '_'))) : null; tz = guess; }
    if (!tz) return toast('World clock', `I don't know "${v}". Try a major city.`);
    window.nova.saveSettings({ clocks: [...(S.settings.clocks || []), tz] }).then((st) => { S = st; $('#tClockAdd').value = ''; renderTools(); renderHomeExtras(); });
  };
  $('#tClockAdd').addEventListener('keydown', (e) => { if (e.key === 'Enter') $('#tClockBtn').click(); });
  const runTool = async (inp, out, wrap) => { const v = $(inp).value.trim(); if (!v) return; const r = await window.nova.action(wrap.name, wrap.args(v)); $(out).textContent = r.text; };
  $('#tConvBtn').onclick = async () => {
    const v = $('#tConv').value.trim().toLowerCase(); const m = v.match(/^([\d,.]+)\s*([a-z°$₹/]+(?:\s?[a-z]+)?)\s+(?:to|in|into)\s+([a-z°$₹/]+(?:\s?[a-z]+)?)$/);
    if (!m) return ($('#tConvOut').textContent = 'Format: 10 km to miles');
    const r = await window.nova.action('convert', { amount: +m[1].replace(/,/g, ''), from: m[2].trim(), to: m[3].trim() }); $('#tConvOut').textContent = r.text;
  };
  $('#tConv').addEventListener('keydown', (e) => { if (e.key === 'Enter') $('#tConvBtn').click(); });
  $('#tCalcBtn').onclick = () => runTool('#tCalc', '#tCalcOut', { name: 'calc', args: (v) => ({ expr: v }) });
  $('#tCalc').addEventListener('keydown', (e) => { if (e.key === 'Enter') $('#tCalcBtn').click(); });
  $('#tCdAdd').onclick = async () => { const t = $('#tCdTitle').value.trim(), d = $('#tCdDate').value; if (!t || !d) return toast('Countdown', 'Add a title and a date.'); const r = await window.nova.action('countdown_add', { title: t, date: d }); toast('Countdown', r.text); $('#tCdTitle').value = ''; };
  $('#tPwLen').oninput = () => ($('#tPwLenV').textContent = $('#tPwLen').value);
  $('#tPwGen').onclick = async () => { const r = await window.nova.action('password_gen', { length: +$('#tPwLen').value }); $('#tPw').textContent = r.text.split('\n').pop(); toast('Password', 'Copied to clipboard.'); };
  // stopwatch (local display, synced with main)
  let sw = { running: false, base: 0, since: 0 };
  const swFmt = (ms) => { const t = Math.floor(ms / 100); const s = Math.floor(t / 10); return `${Math.floor(s / 3600) ? Math.floor(s / 3600) + ':' : ''}${Math.floor(s / 60) % 60}:${String(s % 60).padStart(2, '0')}.${t % 10}`; };
  const swNow = () => sw.base + (sw.running ? Date.now() - sw.since : 0);
  setInterval(() => { if (section === 'tools') $('#tSw').textContent = swFmt(swNow()); }, 100);
  $('#tSwStart').onclick = async () => {
    await window.nova.action('stopwatch', { op: sw.running ? 'stop' : 'start' });
    if (sw.running) { sw.base = swNow(); sw.running = false; } else { sw.since = Date.now(); sw.running = true; }
    $('#tSwStart').textContent = sw.running ? 'Stop' : 'Start';
  };
  $('#tSwReset').onclick = async () => { await window.nova.action('stopwatch', { op: 'reset' }); sw = { running: false, base: 0, since: 0 }; $('#tSwStart').textContent = 'Start'; $('#tSw').textContent = swFmt(0); };
  function syncStopwatch() { const st = S && S.stopwatch; if (!st) return; sw = { running: st.running, base: st.running ? 0 : st.elapsed, since: st.running ? st.at - st.elapsed : 0 }; $('#tSwStart').textContent = sw.running ? 'Stop' : 'Start'; }


  const X = (ch, ...a) => window.nova.invoke(ch, ...a);
  const dur = (sec) => (sec >= 3600 ? `${Math.floor(sec / 3600)}h ${Math.round((sec % 3600) / 60)}m` : `${Math.max(0, Math.round(sec / 60))}m`);

  // ---------------------------------------------------------- DAY PLANNER (Today)
  async function planDay(day) {
    $('#planOut').innerHTML = '<span class="muted">Planning…</span>';
    const r = await X('plan_day', false, day);
    if (!r.plan) { $('#planOut').textContent = r.text; $('#planCommit').style.display = 'none'; return; }
    $('#planOut').innerHTML = r.plan.map((p) => `<div class="plan-line"><b>${fmtTime(p.start)} – ${fmtTime(p.end)}</b><span>${esc(p.title)}</span></div>`).join('') + (r.text.match(/\(\+\d+ more.*\)/) ? `<div class="muted small" style="margin-top:6px">${esc(r.text.match(/\(\+\d+ more.*\)/)[0])}</div>` : '');
    $('#planCommit').style.display = ''; $('#planCommit').dataset.day = day;
  }
  $('#planBtn').onclick = () => planDay('today');
  $('#planTomBtn').onclick = () => planDay('tomorrow');
  $('#planCommit').onclick = async () => { const r = await X('plan_day', true, $('#planCommit').dataset.day || 'today'); toast('Planner', r.text.split('\n')[0]); $('#planCommit').style.display = 'none'; };

  // ---------------------------------------------------------- USAGE
  let uDays = 1;
  async function renderUsage() {
    const rep = await X('usage_report', 7);
    const span = rep.slice(-uDays);
    const tot = {}; span.forEach((d) => Object.entries(d.apps).forEach(([k, v]) => (tot[k] = (tot[k] || 0) + v)));
    const total = Object.values(tot).reduce((a, b) => a + b, 0);
    $('#uTotal').textContent = dur(total);
    $('#uSub').textContent = uDays === 1 ? 'today, while active' : `last 7 days · avg ${dur(total / 7)}/day`;
    const list = Object.entries(tot).sort((a, b) => b[1] - a[1]); const max = list.length ? list[0][1] : 1;
    $('#uApps').innerHTML = list.length ? list.slice(0, 10).map(([k, v]) => `<div class="cat app"><span>${esc(k)}</span><div class="cb"><i style="width:${v / max * 100}%"></i></div><span class="cv">${dur(v)}</span></div>`).join('') : '<div class="empty">Nothing recorded yet. Nova starts counting as you use your PC.</div>';
    const mx = Math.max(1800, ...rep.map((d) => d.total));
    $('#uBars').innerHTML = rep.map((d, i) => `<div class="bar-col ${i === 6 ? 'today' : ''}"><span class="v">${d.total ? dur(d.total) : ''}</span><div class="b" style="height:${d.total / mx * 100}%"></div><span class="l">${d.label}</span></div>`).join('');
    const b = S.settings.blocker || {};
    $('#bOn').checked = b.enabled !== false;
    if (document.activeElement !== $('#bTitles')) $('#bTitles').value = (b.titles || []).join(', ');
    if (document.activeElement !== $('#bApps')) $('#bApps').value = (b.apps || []).join(', ');
  }
  $$('#uScope button').forEach((b) => (b.onclick = () => { uDays = +b.dataset.v; $$('#uScope button').forEach((x) => x.classList.toggle('on', x === b)); renderUsage(); }));
  $('#bSave').onclick = async () => { S = await window.nova.saveSettings({ blocker: { enabled: $('#bOn').checked, titles: $('#bTitles').value.split(',').map((x) => x.trim()).filter(Boolean), apps: $('#bApps').value.split(',').map((x) => x.trim()).filter(Boolean) } }); toast('Focus guard', 'Saved.'); };
  $('#bOn').onchange = () => $('#bSave').click();

  // ---------------------------------------------------------- DOCUMENTS
  const hl = (text, q) => { let h = esc(text); for (const w of q.toLowerCase().split(/\s+/).filter((x) => x.length > 1)) h = h.replace(new RegExp('(' + w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + ')', 'ig'), '<mark>$1</mark>'); return h; };
  const docIcon = (n) => ({ pdf: '📕', docx: '📘', xlsx: '📗', pptx: '📙', csv: '📗', txt: '📄', md: '📄' }[n.split('.').pop().toLowerCase()] || '📄');
  function renderDocsMeta(st) {
    st = st || S.docs || { files: 0 };
    $('#dStats').textContent = st.busy ? `Indexing… ${st.progress.done}/${st.progress.total}` : `${st.files} files indexed${st.lastRun ? ' · ' + when(st.lastRun) : ''}`;
    $('#dFolders').innerHTML = (S.settings.docFolders || []).map((f) => `<button class="folder" title="Click to remove">📁 ${esc(f)} ✕</button>`).join('') || '<span class="muted small">No folders yet. Add the folders where you keep BOEs, invoices, specs…</span>';
    $$('#dFolders .folder').forEach((b, i) => (b.onclick = async () => { await X('docs_remove_folder', S.settings.docFolders[i]); refresh(['docFolders']); }));
  }
  let dT = null;
  $('#dQuery').addEventListener('input', () => { clearTimeout(dT); dT = setTimeout(runDocSearch, 200); });
  async function runDocSearch() {
    const q = $('#dQuery').value.trim();
    if (q.length < 2) { $('#dResults').innerHTML = ''; return; }
    const res = await X('docs_search', q);
    $('#dResults').innerHTML = res.length ? res.map((r, i) => `<div class="doc"><div class="di">${docIcon(r.name)}</div><div style="min-width:0;flex:1"><div class="dn" data-open="${i}">${hl(r.name, q)}</div><div class="dp">${esc(r.path)} · ${new Date(r.modified).toLocaleDateString([], { day: 'numeric', month: 'short', year: 'numeric' })}</div>${r.snippet ? `<div class="ds">${hl(r.snippet, q)}</div>` : ''}</div><div class="da"><button data-open="${i}">Open</button><button data-folder="${i}">Show in folder</button></div></div>`).join('') : '<div class="empty" style="padding:16px 4px">No matching files.</div>';
    $$('#dResults [data-open]').forEach((b) => (b.onclick = () => window.nova.openPath(res[+b.dataset.open].path)));
    $$('#dResults [data-folder]').forEach((b) => (b.onclick = () => X('show_in_folder', res[+b.dataset.folder].path)));
  }
  $('#dAdd').onclick = async () => { await X('docs_add_folder'); refresh(['docFolders']); };
  $('#dReindex').onclick = async () => { renderDocsMeta(await X('docs_reindex')); };

  // ---------------------------------------------------------- MEETINGS
  let meetId = null, meetTimer = null;
  const mmss2 = (ms) => { const t = Math.floor(ms / 1000); return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`; };
  async function startMeeting() {
    if (window.NovaRecorder.recording) return stopMeeting();
    const m = await X('meeting_start', $('#mTitle').value.trim());
    meetId = m.id; $('#mLive').textContent = '';
    try {
      const r = await window.NovaRecorder.start({
        system: $('#mSys').checked,
        onLevel: (l) => ($('#mLevel').style.width = Math.round(l * 100) + '%'),
        onChunk: async (b64, idx) => {
          $('#mState').textContent = `Transcribing part ${idx + 1}…`;
          const res = await X('meeting_chunk', meetId, b64, idx);
          if (res.ok && res.text) $('#mLive').textContent += (res.text + '\n');
          else if (!res.ok) $('#mLive').textContent += `⚠️ ${res.error}\n`;
          if (window.NovaRecorder.recording) $('#mState').textContent = 'Recording…';
        }
      });
      X('rec_state', true);
      $('#mDot').classList.add('on'); $('#mStart').textContent = '■ Stop & summarise'; $('#mLevelWrap').classList.add('on');
      $('#mState').textContent = r.system ? 'Recording mic + computer audio…' : 'Recording microphone…';
      meetTimer = setInterval(() => ($('#mTime').textContent = mmss2(window.NovaRecorder.elapsed)), 500);
    } catch (e) { toast('Meeting', 'Microphone not available: ' + e.message); X('meeting_delete', meetId); meetId = null; }
  }
  async function stopMeeting() {
    X('rec_state', false);
    clearInterval(meetTimer); $('#mDot').classList.remove('on'); $('#mLevelWrap').classList.remove('on');
    $('#mState').textContent = 'Finishing transcript…'; $('#mStart').disabled = true;
    await window.NovaRecorder.stop();
    await new Promise((r) => setTimeout(r, 1500));
    $('#mState').textContent = 'Summarising…';
    await X('meeting_finish', meetId);
    $('#mStart').disabled = false; $('#mStart').textContent = '● Start recording'; $('#mState').textContent = 'Saved ✓'; $('#mTime').textContent = '0:00';
    meetId = null; refresh(['meetings']);
  }
  $('#mStart').onclick = startMeeting;
  function renderMeetings() {
    const list = (S.settings.meetings || []).slice().sort((a, b) => b.start - a.start);
    $('#mList').innerHTML = list.map((m) => `<div class="meet"><div class="mh"><b>${esc(m.title)}</b><span class="muted small">${new Date(m.start).toLocaleString([], { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })}${m.end ? ' · ' + Math.round((m.end - m.start) / 60000) + ' min' : ' · recording'}</span><button data-mnote="${m.id}">Save as note</button><button data-mdel="${m.id}">Delete</button></div>
      ${m.summary ? `<div class="tx" style="background:#FFF8F2">${md(m.summary)}</div>` : ''}
      ${(m.actions || []).length ? `<div class="acts-list" style="margin-top:8px"><div class="muted small">Action items</div>${m.actions.map((a, i) => `<label><input type="checkbox" data-ma="${m.id}" data-i="${i}" checked> ${esc(a)}</label>`).join('')}<button class="ghost" data-mtasks="${m.id}" style="margin-top:6px">Add checked as tasks</button></div>` : ''}
      <details><summary>Transcript (${(m.transcript || '').split(/\s+/).filter(Boolean).length} words)</summary><div class="tx">${esc(m.transcript || '(empty)')}</div></details></div>`).join('') || '<div class="empty">No meetings recorded yet.</div>';
    $$('[data-mdel]').forEach((b) => (b.onclick = () => X('meeting_delete', b.dataset.mdel)));
    $$('[data-mnote]').forEach((b) => (b.onclick = async () => { await X('meeting_note', b.dataset.mnote); toast('Meeting', 'Saved to Notes.'); }));
    $$('[data-mtasks]').forEach((b) => (b.onclick = async () => {
      const m = S.settings.meetings.find((x) => x.id === b.dataset.mtasks);
      const picked = $$(`[data-ma="${m.id}"]`).filter((c) => c.checked).map((c) => m.actions[+c.dataset.i]);
      const n = await X('meeting_tasks', m.id, picked); toast('Meeting', `Added ${n} task${n === 1 ? '' : 's'}.`);
    }));
  }

  // ---------------------------------------------------------- SAP
  async function renderSap() {
    const sp = S.settings.sap || { systems: [], favorites: [] };
    $('#sapSys').innerHTML = (sp.systems || []).map((x) => `<option value="${esc(x.name)}">${esc(x.name)}</option>`).join('') || '<option value="">No systems yet</option>';
    $('#sapSystems').innerHTML = (sp.systems || []).map((x, i) => `<div class="item"><div class="ico">🟦</div><div class="main"><div class="t">${esc(x.name)}</div><div class="w">${esc(x.sysname || x.sid || '')} · client ${esc(x.client || '-')}${x.user ? ' · ' + esc(x.user) : ''}</div></div><div class="acts"><button data-ssdel="${i}">Remove</button></div></div>`).join('') || '<div class="empty">Add a system below (use the exact entry name from SAP Logon).</div>';
    $('#sapFav').innerHTML = (sp.favorites || []).map((f, i) => `<div class="tile" data-fav="${i}"><button class="x" data-favdel="${i}">✕</button><div class="ti">🟦</div><div><div class="tn">${esc(f.tcode)}</div><div class="tt">${esc(f.label || '')}</div></div></div>`).join('') || '<div class="empty">No favourites yet.</div>';
    if (document.activeElement !== $('#sapPath')) $('#sapPath').value = sp.shcutPath || '';
    const found = await X('sap_found'); $('#sapFound').textContent = found ? '✓ SAP GUI found' : '⚠️ SAP GUI shortcut tool not found';
    const save = (patch) => window.nova.saveSettings({ sap: { ...sp, ...patch } }).then((st) => { S = st; renderSap(); });
    $$('[data-ssdel]').forEach((b) => (b.onclick = () => save({ systems: sp.systems.filter((_, i) => i !== +b.dataset.ssdel) })));
    $$('[data-favdel]').forEach((b) => (b.onclick = (e) => { e.stopPropagation(); save({ favorites: sp.favorites.filter((_, i) => i !== +b.dataset.favdel) }); }));
    $$('[data-fav]').forEach((t) => (t.onclick = () => sapOpen(sp.favorites[+t.dataset.fav].tcode)));
    $('#ssAdd').onclick = () => { const name = $('#ssName').value.trim(); if (!name) return; save({ systems: [...(sp.systems || []), { name, sysname: $('#ssEntry').value.trim(), client: $('#ssClient').value.trim(), user: $('#ssUser').value.trim(), lang: 'EN' }] }); ['#ssName', '#ssEntry', '#ssClient', '#ssUser'].forEach((i) => ($(i).value = '')); };
    $('#sapFavAdd').onclick = () => { const tcode = $('#sapFavT').value.trim().toUpperCase(); if (!tcode) return; save({ favorites: [...(sp.favorites || []), { tcode, label: $('#sapFavN').value.trim() }] }); $('#sapFavT').value = ''; $('#sapFavN').value = ''; };
    $('#sapPath').onchange = () => save({ shcutPath: $('#sapPath').value.trim() });
  }
  async function sapOpen(tcode) { const r = await X('sap_open', $('#sapSys').value, tcode); toast('SAP', r.ok ? `Opening ${r.tcode || 'SAP'} on ${r.system}…` : r.error); }
  $('#sapGo').onclick = () => sapOpen($('#sapT').value.trim());
  $('#sapT').addEventListener('keydown', (e) => { if (e.key === 'Enter') $('#sapGo').click(); });

  // ---------------------------------------------------------- AUTOMATIONS
  const TRIG = { time: '⏰ At a time of day', file_added: '📂 When a file appears in a folder', app_start: '🚀 When an app starts', app_focus: '🪟 When I switch to an app', battery_low: '🔋 When battery drops below', wifi: '📶 When I connect to Wi-Fi', clipboard: '📋 When I copy text matching', startup: '▶️ When Nova starts', back: '👋 When I come back to my PC' };
  const TEMPLATES = [
    { name: 'BOE PDFs → monthly folder', trigger: { type: 'file_added', folder: 'downloads', pattern: '*boe*.pdf; *bill*of*entry*.pdf' }, actions: ['move to D:\\BOE\\{month}', 'notify Filed {filename}'] },
    { name: 'Teams opens → focus mode', trigger: { type: 'app_start', app: 'teams' }, actions: ['pause', 'do not disturb on'] },
    { name: 'Weekday morning briefing', trigger: { type: 'time', at: '09:15', days: [1, 2, 3, 4, 5] }, actions: ['briefing', 'plan my day'] },
    { name: 'Tidy Downloads every evening', trigger: { type: 'time', at: '18:30', days: [1, 2, 3, 4, 5] }, actions: ['tidy my downloads'] },
    { name: 'Battery low → save power', trigger: { type: 'battery_low', below: 20 }, actions: ['brightness 40', 'notify Battery low: plug in soon 🔌'] },
    { name: 'Office Wi-Fi → open work apps', trigger: { type: 'wifi', ssid: 'Office-WiFi' }, actions: ['open outlook', 'open teams'] },
    { name: 'Copied a BOE number → note it', trigger: { type: 'clipboard', pattern: '/\\b\\d{7}\\b/' }, actions: ['note Copied BOE/number: {clip}'] },
    { name: 'Welcome back → show agenda', trigger: { type: 'back' }, actions: ["what's on my calendar today"] }
  ];
  const trigText = (t) => ({ time: () => `At ${t.at}${t.days && t.days.length && t.days.length < 7 ? ' on ' + t.days.map((d) => 'SMTWTFS'[d]).join('') : ' every day'}`, file_added: () => `New file in ${t.folder || 'Downloads'} matching ${t.pattern || '*'}`, app_start: () => `When ${t.app} starts`, app_focus: () => `When I switch to ${t.app}`, battery_low: () => `Battery below ${t.below || 20}%`, wifi: () => `On Wi-Fi ${t.ssid || '(any)'}`, clipboard: () => `When I copy "${t.pattern}"`, startup: () => 'When Nova starts', back: () => 'When I come back' }[t.type] || (() => t.type))();
  function renderAutomations() {
    const list = S.settings.automations || [];
    $('#aTemplates').innerHTML = TEMPLATES.map((t, i) => `<button data-tpl="${i}">${esc(t.name)}</button>`).join('');
    $$('[data-tpl]').forEach((b) => (b.onclick = () => openEditor({ ...JSON.parse(JSON.stringify(TEMPLATES[+b.dataset.tpl])) })));
    $('#aList').innerHTML = list.map((r) => `<div class="auto ${r.enabled === false ? 'off' : ''}"><div class="ai">${(TRIG[r.trigger.type] || '⚙️').split(' ')[0]}</div><div style="min-width:0"><div class="an">${esc(r.name)}</div><div class="aw">${esc(trigText(r.trigger))} → ${esc((r.actions || []).join(' · '))}</div><div class="aw">${r.lastRun ? 'Last run ' + when(r.lastRun) : 'Not run yet'}</div></div><div class="aa"><button data-arun="${r.id}">Run now</button><button data-aedit="${r.id}">Edit</button><button data-adel="${r.id}">Delete</button><label class="swl"><input type="checkbox" data-aon="${r.id}" ${r.enabled !== false ? 'checked' : ''}><span class="switch"></span></label></div></div>`).join('') || '<div class="empty">No automations yet. Pick a template above or create your own.</div>';
    $$('[data-arun]').forEach((b) => (b.onclick = async () => { const e = await X('auto_run', b.dataset.arun); toast('Automation', e && e.out ? e.out : 'Done.'); }));
    $$('[data-aedit]').forEach((b) => (b.onclick = () => openEditor(JSON.parse(JSON.stringify(list.find((x) => x.id === b.dataset.aedit))))));
    $$('[data-adel]').forEach((b) => (b.onclick = () => X('auto_delete', b.dataset.adel)));
    $$('[data-aon]').forEach((c) => (c.onchange = () => X('auto_toggle', c.dataset.aon, c.checked)));
    const log = (S.settings.automationLog || []).slice().reverse().slice(0, 12);
    $('#aLog').innerHTML = log.map((e) => `<div class="item"><div class="ico">⚙️</div><div class="main"><div class="t">${esc(e.name)}</div><div class="w">${when(e.t)} · ${esc((e.out || 'done').split('\n')[0]).slice(0, 140)}</div></div></div>`).join('') || '<div class="empty">Nothing has run yet.</div>';
  }
  function openEditor(rule) {
    rule = rule || { name: '', trigger: { type: 'time', at: '09:00', days: [1, 2, 3, 4, 5] }, actions: [] };
    const t = rule.trigger;
    const ed = $('#aEditor'); ed.style.display = '';
    const params = {
      time: `<label class="lbl">Time</label><input id="atAt" type="time" value="${esc(t.at || '09:00')}"><div class="days">${'Sun Mon Tue Wed Thu Fri Sat'.split(' ').map((d, i) => `<label><input type="checkbox" data-day="${i}" ${(t.days || [0, 1, 2, 3, 4, 5, 6]).includes(i) ? 'checked' : ''}>${d}</label>`).join('')}</div>`,
      file_added: `<label class="lbl">Folder</label><div class="krow"><input id="atFolder" value="${esc(t.folder || 'downloads')}"><button class="ghost" id="atPick">Browse</button></div><label class="lbl">File name pattern <span class="muted">(e.g. *.pdf; *boe*)</span></label><input id="atPattern" value="${esc(t.pattern || '*')}">`,
      app_start: `<label class="lbl">App (process name, e.g. teams, excel, saplogon)</label><input id="atApp" value="${esc(t.app || '')}">`,
      app_focus: `<label class="lbl">App or window title contains</label><input id="atApp" value="${esc(t.app || '')}">`,
      battery_low: `<label class="lbl">Below (%)</label><input id="atBelow" type="number" value="${esc(t.below || 20)}">`,
      wifi: `<label class="lbl">Network name (blank = any)</label><input id="atSsid" value="${esc(t.ssid || '')}">`,
      clipboard: `<label class="lbl">Text contains (or /regex/)</label><input id="atPattern" value="${esc(t.pattern || '')}">`,
      startup: '<p class="muted small">Runs once each time Nova starts.</p>', back: '<p class="muted small">Runs when you return after 10+ minutes away.</p>'
    };
    ed.innerHTML = `<h3>${rule.id ? 'Edit' : 'New'} automation</h3><div class="a-form"><div><label class="lbl">Name</label><input id="aName" value="${esc(rule.name)}"><label class="lbl">When</label><select id="aType">${Object.entries(TRIG).map(([k, v]) => `<option value="${k}" ${k === t.type ? 'selected' : ''}>${v}</option>`).join('')}</select><div id="aParams">${params[t.type] || ''}</div></div>
      <div><label class="lbl">Then do (one per line: anything you'd say to Nova)</label><textarea id="aActions" rows="7" placeholder="move to D:\\BOE\\{month}\nnotify Filed {filename}\nvolume 20\nopen outlook">${esc((rule.actions || []).join('\n'))}</textarea>
      <div class="muted small">File actions: <code>move to …</code> <code>copy to …</code> <code>rename to …</code>. Placeholders: <code>{filename}</code> <code>{month}</code> <code>{date}</code> <code>{year}</code> <code>{clip}</code> <code>{app}</code>. <code>notify …</code> shows a bubble.</div></div></div>
      <div class="btnrow"><button class="primary" id="aSave">Save</button><button class="ghost" id="aCancel">Cancel</button></div>`;
    $('#aType').onchange = () => { $('#aParams').innerHTML = params[$('#aType').value] || ''; wirePick(); };
    const wirePick = () => { const b = $('#atPick'); if (b) b.onclick = async () => { const f = await X('pick_folder'); if (f) $('#atFolder').value = f; }; };
    wirePick();
    $('#aCancel').onclick = () => { ed.style.display = 'none'; };
    $('#aSave').onclick = async () => {
      const type = $('#aType').value, tr = { type };
      if (type === 'time') { tr.at = $('#atAt').value || '09:00'; tr.days = $$('[data-day]').filter((c) => c.checked).map((c) => +c.dataset.day); }
      if (type === 'file_added') { tr.folder = $('#atFolder').value.trim() || 'downloads'; tr.pattern = $('#atPattern').value.trim() || '*'; }
      if (type === 'app_start' || type === 'app_focus') tr.app = $('#atApp').value.trim();
      if (type === 'battery_low') tr.below = +$('#atBelow').value || 20;
      if (type === 'wifi') tr.ssid = $('#atSsid').value.trim();
      if (type === 'clipboard') tr.pattern = $('#atPattern').value.trim();
      const actions = $('#aActions').value.split('\n').map((x) => x.trim()).filter(Boolean);
      if (!actions.length) return toast('Automation', 'Add at least one action.');
      await X('auto_save', { ...rule, name: $('#aName').value.trim() || TRIG[type].replace(/^\S+\s/, ''), trigger: tr, actions });
      ed.style.display = 'none'; toast('Automation', 'Saved.');
    };
    ed.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
  $('#aNew').onclick = () => openEditor(null);

  // ---------------------------------------------------------- WIDGETS
  const WTYPES = [['note', '🗒', 'Sticky note'], ['tasks', '✅', 'Task list'], ['agenda', '📅', "Today's agenda"], ['countdown', '⏳', 'Countdown'], ['clock', '🕐', 'Clock'], ['water', '💧', 'Water tracker']];

  // ---- Apple-style glanceable widget board (reads live from your data) ----
  function ringSVG(pct, color, label, sub) {
    const r = 26, c = 2 * Math.PI * r, off = c * (1 - Math.max(0, Math.min(1, pct)));
    return `<svg viewBox="0 0 64 64" class="wg-ring"><circle cx="32" cy="32" r="${r}" class="wg-ring-bg"/><circle cx="32" cy="32" r="${r}" stroke="${color}" stroke-dasharray="${c.toFixed(1)}" stroke-dashoffset="${off.toFixed(1)}" class="wg-ring-fg"/><text x="32" y="33" class="wg-ring-n">${label}</text>${sub ? `<text x="32" y="44" class="wg-ring-s">${sub}</text>` : ''}</svg>`;
  }
  function renderWidgets() {
    renderWBoard();
    $('#wTypes').innerHTML = WTYPES.map(([k, i, n]) => `<div class="tile wtype" data-wadd="${k}"><div class="ti">${i}</div><div class="tn">${n}</div><div class="tt">Pop to desktop</div></div>`).join('');
    $$('[data-wadd]').forEach((t) => (t.onclick = async () => { await X('widget_add', t.dataset.wadd, {}); toast('Widgets', 'Added to your desktop.'); }));
    const list = S.settings.widgets || [];
    $('#wList').innerHTML = list.map((w) => `<div class="item"><div class="ico">${(WTYPES.find((x) => x[0] === w.type) || ['', '📌'])[1]}</div><div class="main"><div class="t">${esc((WTYPES.find((x) => x[0] === w.type) || ['', '', w.type])[2])}</div><div class="w">${w.text ? esc(w.text.slice(0, 60)) : ''}${w.onTop ? ' · pinned on top' : ''}</div></div><div class="acts"><button data-wdel="${w.id}">Remove</button></div></div>`).join('') || '<div class="empty">No widgets yet.</div>';
    $$('[data-wdel]').forEach((b) => (b.onclick = () => X('widget_remove', b.dataset.wdel)));
  }

  let wWeather = null;
  function renderWBoard() {
    const board = $('#wBoard'); if (!board) return;
    const now = new Date(), end = new Date(); end.setHours(23, 59, 59, 999);
    const k = dayKey(now);
    const fdate = now.toLocaleDateString([], { weekday: 'long' });
    const dnum = now.getDate(), mon = now.toLocaleDateString([], { month: 'long' });

    // agenda: upcoming reminders + today's events, soonest first
    const ag = [];
    (S.reminders || []).filter((r) => r.at >= +now && r.kind !== 'timer').forEach((r) => ag.push({ at: r.at, ico: r.kind === 'alarm' ? '⏰' : '🔔', t: r.text }));
    (S.events || []).filter((e) => e.end >= +now && e.start <= +end).forEach((e) => ag.push({ at: e.start, ico: '📅', t: e.title, allDay: e.allDay }));
    ag.sort((a, b) => a.at - b.at);
    const nextUp = ag[0];
    const relTime = (ts) => { const m = Math.round((ts - Date.now()) / 60000); if (m < 1) return 'now'; if (m < 60) return `in ${m}m`; if (m < 1440) return `in ${Math.round(m / 60)}h`; return new Date(ts).toLocaleDateString([], { weekday: 'short' }); };

    const openTasks = (S.tasks || []).filter((t) => !t.done);
    const topTask = sortTasks(openTasks)[0];
    const wh = (S.habits || []).find((h) => /water|hydrat|drink/i.test(h.name));
    const wn = wh ? ((wh.log || {})[k] || 0) : 0, wt = wh ? (wh.target || 8) : 8;
    const habits = (S.habits || []).slice(0, 3);
    const cds = (S.countdowns || []).filter((c) => daysTo(c.date) >= 0).sort((a, b) => a.date - b.date);
    const nc = cds[0];
    const note = (S.notes || [])[S.notes ? S.notes.length - 1 : -1];
    const fs = S.focusState || { phase: 'idle' };
    const focusing = fs.phase && fs.phase !== 'idle';
    const RING = ['#FF375F', '#7AE582', '#44C0FF'];

    const tiles = [];
    // TODAY — large
    tiles.push(`<div class="wg w-lg wg-today" data-go="calendar">
      <div class="wg-date"><span class="wg-dow">${esc(fdate)}</span><span class="wg-dnum">${dnum}</span><span class="wg-mon">${esc(mon)}</span></div>
      <div class="wg-agenda">${ag.slice(0, 4).map((i) => `<div class="wg-ag"><span class="wg-ag-i">${i.ico}</span><span class="wg-ag-t">${esc(i.t)}</span><span class="wg-ag-w">${i.allDay ? 'all day' : fmtTime(i.at)}</span></div>`).join('') || '<div class="wg-empty">Nothing scheduled — enjoy the calm ✨</div>'}</div></div>`);

    // UP NEXT — medium accent
    tiles.push(`<div class="wg w-md wg-next" data-go="reminders">
      <div class="wg-h"><span>UP NEXT</span>${nextUp ? `<span class="wg-rel">${relTime(nextUp.at)}</span>` : ''}</div>
      <div class="wg-next-body">${nextUp ? `<div class="wg-next-ico">${nextUp.ico}</div><div class="wg-next-t">${esc(nextUp.t)}</div><div class="wg-next-w">${nextUp.allDay ? 'all day' : new Date(nextUp.at).toLocaleString([], { weekday: 'short', hour: 'numeric', minute: '2-digit' })}</div>` : '<div class="wg-allclear">All caught up 🎉</div>'}</div></div>`);

    // HABITS rings — medium
    tiles.push(`<div class="wg w-md wg-rings" data-go="habits">
      <div class="wg-h"><span>ACTIVITY</span></div>
      <div class="wg-rings-row">${habits.length ? habits.map((h, i) => { const n = (h.log || {})[k] || 0, tg = h.target || 1; return `<div class="wg-ring-cell">${ringSVG(n / tg, RING[i % 3], `${n}`, h.icon || '')}<div class="wg-ring-lbl">${esc(h.name)}</div></div>`; }).join('') : '<div class="wg-empty">Add habits to see your rings.</div>'}</div></div>`);

    // WATER — small
    tiles.push(`<div class="wg w-sm wg-water" data-wlog="1">
      <div class="wg-h"><span>💧 WATER</span></div>
      <div class="wg-water-ring">${ringSVG(wt ? wn / wt : 0, '#44C0FF', `${wn}`, `/${wt}`)}</div>
      <div class="wg-sub">tap to add a glass</div></div>`);

    // FOCUS — small
    tiles.push(`<div class="wg w-sm wg-focus ${focusing ? 'on' : ''}" data-focus="1">
      <div class="wg-h"><span>🎯 FOCUS</span></div>
      <div class="wg-focus-big">${focusing ? mmssLeft(fs) : '25:00'}</div>
      <div class="wg-sub">${focusing ? (fs.phase === 'work' ? 'stay with it' : 'on a break') : 'tap to start'}</div></div>`);

    // TASKS — small
    tiles.push(`<div class="wg w-sm wg-tasks" data-go="tasks">
      <div class="wg-h"><span>✅ TASKS</span></div>
      <div class="wg-big">${openTasks.length}</div>
      <div class="wg-sub">${topTask ? esc(topTask.text.slice(0, 34)) : 'all done 🎉'}</div></div>`);

    // COUNTDOWN — small
    if (nc) tiles.push(`<div class="wg w-sm wg-count" data-go="countdowns">
      <div class="wg-h"><span>⏳ COUNTDOWN</span></div>
      <div class="wg-big">${daysTo(nc.date)}</div>
      <div class="wg-sub">days · ${esc((nc.title || nc.name || '').slice(0, 24))}</div></div>`);

    // WEATHER — small (lazy)
    tiles.push(`<div class="wg w-sm wg-weather" id="wgWeather" data-go="home">
      <div class="wg-h"><span>🌤 WEATHER</span></div>
      <div class="wg-weather-body">${wWeather ? esc(wWeather) : '<span class="wg-sub">loading…</span>'}</div></div>`);

    // QUICK ACTIONS — medium
    tiles.push(`<div class="wg w-md wg-quick">
      <div class="wg-h"><span>QUICK ADD</span></div>
      <div class="wg-quick-row">
        <button data-qa="task"><span>✅</span>Task</button>
        <button data-qa="remind"><span>🔔</span>Remind</button>
        <button data-qa="note"><span>📝</span>Note</button>
        <button data-qa="focus"><span>🎯</span>Focus</button></div></div>`);

    // NOTE — medium
    tiles.push(`<div class="wg w-md wg-note" data-go="notes">
      <div class="wg-h"><span>🗒 LATEST NOTE</span></div>
      <div class="wg-note-body">${note ? esc(note.text.slice(0, 160)) : '<span class="wg-sub">No notes yet — jot something down.</span>'}</div></div>`);

    board.innerHTML = tiles.join('');
    // wiring
    board.querySelectorAll('[data-go]').forEach((el) => (el.onclick = () => go(el.dataset.go)));
    board.querySelectorAll('[data-wlog]').forEach((el) => (el.onclick = async (e) => { e.stopPropagation(); await X('water_log', '', { glasses: 1 }); renderWBoard(); }));
    board.querySelectorAll('[data-focus]').forEach((el) => (el.onclick = (e) => { e.stopPropagation(); go('focus'); }));
    const qa = { task: () => go('tasks'), remind: () => go('reminders'), note: () => go('notes'), focus: () => go('focus') };
    board.querySelectorAll('[data-qa]').forEach((b) => (b.onclick = (e) => { e.stopPropagation(); (qa[b.dataset.qa] || (() => {}))(); }));
    // lazy weather
    if (!wWeather) window.nova.action('weather', {}).then((r) => { if (!r.error) { wWeather = r.text.replace(/^🌤?\s*/, ''); const el = $('#wgWeather .wg-weather-body'); if (el) el.textContent = wWeather; } }).catch(() => {});
  }
  function mmssLeft(fs) { const ms = Math.max(0, (fs.endsAt || 0) - Date.now()); const t = Math.round(ms / 1000); return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`; }
  $('#wRefresh') && ($('#wRefresh').onclick = () => { wWeather = null; renderWBoard(); });

  // ---------------------------------------------------------- REWARDS
  const rewBot = window.NovaAvatar.attach($('#rewBot'));
  function applyOutfit(o) { [hero, brand, rewBot].forEach((b) => b.setOutfit(o || {})); }
  async function renderRewards() {
    const r = await X('rewards_status');
    $('#rLevel').textContent = r.level; $('#rMeter').style.width = Math.round(r.into / r.need * 100) + '%';
    $('#rNext').textContent = `${r.into}/${r.need} XP to level ${r.level + 1} · ${r.total} XP total`;
    $('#rToday').textContent = `Today: +${r.today} XP`;
    $('#rItems').innerHTML = r.unlocks.map((u) => `<div class="tile wear ${u.unlocked ? '' : 'locked'} ${r.outfit[u.slot] === u.id ? 'on' : ''}" data-slot="${u.slot}" data-id="${u.id}" title="${u.unlocked ? (r.outfit[u.slot] === u.id ? 'Click to take off' : 'Click to wear') : 'Unlocks at level ' + u.level}"><div class="ti">${u.name.split(' ').pop()}</div><div><div class="tn">${esc(u.name.replace(/\s\S+$/, ''))}</div><div class="tt">${u.unlocked ? (r.outfit[u.slot] === u.id ? 'Wearing' : 'Unlocked') : '🔒 Level ' + u.level}</div></div></div>`).join('');
    $$('#rItems .wear').forEach((t) => (t.onclick = async () => { if (t.classList.contains('locked')) return; const cur = r.outfit[t.dataset.slot] === t.dataset.id; applyOutfit(await X('outfit_set', t.dataset.slot, cur ? '' : t.dataset.id)); renderRewards(); }));
    $('#rLog').innerHTML = r.log.map((l) => `<div class="mini"><div class="ico">⭐</div><div class="t">+${l.p} · ${esc(l.r)}</div><div class="w">${fmtTime(l.t)}</div></div>`).join('') || '<div class="empty">Log water, finish tasks or focus to earn XP.</div>';
    rewBot.setOutfit(r.outfit); rewBot.setState('done');
  }

  // ---------------------------------------------------------- SETTINGS
  const NAMES = { anthropic: 'Claude', gemini: 'Gemini', openai: 'OpenAI', groq: 'Groq', grok: 'Grok (xAI)', openrouter: 'OpenRouter', ollama: 'Ollama (local)', custom: 'Custom endpoint' };
  const KEYED = ['groq', 'openrouter', 'gemini', 'anthropic', 'openai', 'grok', 'custom'];
  const MODELS = ['groq', 'openrouter', 'ollama', 'custom', 'gemini', 'anthropic', 'openai', 'grok', 'groqStt', 'openaiStt'];
  let order = [], clears = new Set();
  function fillSettings() {
    if (!S) return;
    const s = S.settings;
    order = [...s.providerOrder];
    $('#s_comp').checked = !!s.companion.enabled; $('#s_walk').checked = s.companion.walkOnAlert !== false;
    const life = s.life || {};
    $$('#s_live button').forEach((b) => b.classList.toggle('on', b.dataset.v === (life.liveliness || 'normal')));
    const ol = s.outlook || {}; $('#olOn').checked = !!ol.enabled; $('#olStatus').textContent = ol.lastSync ? 'Last sync ' + when(ol.lastSync) : '';
    const nf = s.ntfy || {}; $('#nfOn').checked = !!nf.enabled; $('#nfTopic').value = nf.topic || ''; $('#nfInbox').checked = nf.inbox !== false; $('#nfIn').textContent = (nf.topic || 'your-topic') + '-in';
    const pl = s.planner || {}; $('#plStart').value = pl.start || '09:30'; $('#plEnd').value = pl.end || '18:30'; $('#plLunch').value = pl.lunch || '13:00-14:00'; $('#plBlock').value = pl.block || 45; $('#plRoll').checked = pl.rollover !== false;
    $('#s_wander').checked = life.wander !== false; $('#s_curious').checked = life.curious !== false; $('#s_thoughts').checked = life.thoughts !== false; $('#s_dnd').checked = !!s.dnd;
    $('#s_react').checked = life.reactions !== false; $('#s_echo').checked = life.echo !== false; $('#s_pill').checked = life.pill !== false;
    $('#s_dev').checked = !!s.devMode; $('#s_theme').value = s.theme || 'auto';
    const dp = s.devPaths || {}; $('#dvEditor') && ($('#dvEditor').value = dp.editor || ''); $('#dvRepos') && ($('#dvRepos').value = (dp.repos || []).join('\n'));
    $('#s_ai').checked = !!s.aiEnabled; $('#aiBody').classList.toggle('off', !s.aiEnabled); $('#s_openApp').checked = s.openAppOnStart !== false; $('#s_login').checked = !!s.startAtLogin;
    $('#s_size').value = s.avatarSize; $('#sizeVal').textContent = s.avatarSize + 'px';
    const PH = { anthropic: 'sk-ant-…', gemini: 'AIza…', openai: 'sk-…', groq: 'gsk_…', grok: 'xai-…', openrouter: 'sk-or-…', custom: 'key (if needed)' };
    for (const p of KEYED) { $('#k_' + p).value = ''; $('#k_' + p).placeholder = s.keys[p] || PH[p]; }
    for (const m of MODELS) $('#m_' + m).value = s.models[m] || '';
    $('#e_custom').value = (s.endpoints && s.endpoints.custom) || '';
    $('#s_ollama').checked = !!s.ollamaEnabled;
    checkOllama();
    $('#s_speak').checked = s.voice.speak; $('#s_rate').value = s.voice.rate; $('#rateVal').textContent = s.voice.rate + '×';
    $('#s_wake').checked = s.voice.wakeWord; $('#s_wakeS').value = s.voice.wakeSensitivity; $('#wakeVal').textContent = s.voice.wakeSensitivity;
    $('#s_follow').checked = s.voice.followUp; $('#s_screen').value = s.screenContext || 'auto'; $('#s_city').value = s.city || '';
    $('#s_name').value = s.assistantName; $('#s_user').value = s.userName; $('#s_hkT').value = s.hotkeys.toggle; $('#s_hkL').value = s.hotkeys.listen;
    $$('.nm').forEach((e) => (e.textContent = s.assistantName));
    $('#wakeStatus').textContent = 'Wake word status: ' + (S.status.wake || 'off');
    const hk = S.status.hotkeys || {};
    $('#hkActive').textContent = `Active now: open/hide ${hk.toggle || 'none'} · talk ${hk.listen || 'none'} · log water ${hk.water || 'none'} · quick actions ${hk.quick || 'none'}. If a hotkey is taken by another app, Nova uses a fallback.`;
    renderOrder(); fillVoices(); renderPortable();
  }
  function renderOrder() {
    $('#order').innerHTML = '';
    order.forEach((p, i) => {
      const li = document.createElement('li');
      const st = p === 'ollama' ? (S.settings.ollamaEnabled ? 'on' : 'off') : p === 'custom' ? ((S.settings.endpoints || {}).custom ? 'set' : 'not set') : (S.settings.keys[p] ? 'key set' : 'no key');
      li.innerHTML = `<span>${i + 1}. ${NAMES[p]} <span class="muted small">${st}</span></span><span></span>`;
      [['↑', -1], ['↓', 1]].forEach(([t, d]) => {
        const b = document.createElement('button'); b.textContent = t; b.disabled = (d < 0 && i === 0) || (d > 0 && i === order.length - 1);
        b.onclick = () => { const j = i + d; [order[i], order[j]] = [order[j], order[i]]; renderOrder(); };
        li.lastChild.appendChild(b);
      });
      $('#order').appendChild(li);
    });
  }
  function fillVoices() {
    const vs = tts.voices();
    $('#s_voice').innerHTML = '<option value="">Auto (best English voice)</option>' + vs.map((v) => `<option value="${esc(v.name)}">${esc(v.name)} (${v.lang})</option>`).join('');
    $('#s_voice').value = S.settings.voice.voiceName || '';
  }
  speechSynthesis.addEventListener('voiceschanged', () => S && fillVoices());
  function collect() {
    const keys = {};
    for (const p of KEYED) { const v = $('#k_' + p).value.trim(); if (clears.has(p)) keys[p] = '__clear__'; else if (v) keys[p] = v; }
    const models = {}; for (const m of MODELS) models[m] = $('#m_' + m).value.trim();
    return {
      keys, providerOrder: order, models,
      endpoints: { ollama: (S.settings.endpoints || {}).ollama || 'http://localhost:11434', custom: $('#e_custom').value.trim() },
      ollamaEnabled: $('#s_ollama').checked,
      voice: { speak: $('#s_speak').checked, voiceName: $('#s_voice').value, rate: +$('#s_rate').value, wakeWord: $('#s_wake').checked, wakeSensitivity: +$('#s_wakeS').value, followUp: $('#s_follow').checked },
      screenContext: $('#s_screen').value, city: $('#s_city').value.trim(),
      assistantName: $('#s_name').value.trim() || 'Nova', userName: $('#s_user').value.trim(),
      hotkeys: { toggle: $('#s_hkT').value.trim(), listen: $('#s_hkL').value.trim() },
      avatarSize: +$('#s_size').value, startAtLogin: $('#s_login').checked, openAppOnStart: $('#s_openApp').checked,
      companion: { enabled: $('#s_comp').checked, walkOnAlert: $('#s_walk').checked },
      life: { liveliness: ($('#s_live button.on') || {}).dataset ? $('#s_live button.on').dataset.v : 'normal', wander: $('#s_wander').checked, curious: $('#s_curious').checked, thoughts: $('#s_thoughts').checked, reactions: $('#s_react').checked, echo: $('#s_echo').checked, pill: $('#s_pill').checked },
      dnd: $('#s_dnd').checked,
      devMode: $('#s_dev').checked, theme: $('#s_theme').value,
      outlook: { enabled: $('#olOn').checked },
      ntfy: { enabled: $('#nfOn').checked, topic: $('#nfTopic').value.trim(), inbox: $('#nfInbox').checked },
      planner: { start: $('#plStart').value || '09:30', end: $('#plEnd').value || '18:30', lunch: $('#plLunch').value.trim() || '13:00-14:00', block: +$('#plBlock').value || 45, rollover: $('#plRoll').checked },
      aiEnabled: $('#s_ai').checked || KEYED.some((p) => $('#k_' + p).value.trim() && !S.settings.keys[p]) || ($('#s_ollama').checked && !S.settings.ollamaEnabled)
    };
  }
  async function save() {
    S = await window.nova.saveSettings(collect());
    clears.clear(); session.setSettings(S.settings); fillSettings(); renderSideStatus();
    $('#saved').style.opacity = 1; setTimeout(() => ($('#saved').style.opacity = 0), 1500);
  }
  $('#btnSave').onclick = save;
  $$('#s_live button').forEach((b) => (b.onclick = () => { $$('#s_live button').forEach((x) => x.classList.toggle('on', x === b)); save(); }));
  ['#s_wander', '#s_curious', '#s_thoughts', '#s_dnd', '#s_react', '#s_echo', '#s_pill'].forEach((id) => ($(id).onchange = save));
  $('#btnPerch').onclick = () => { X('perch'); toast('Nova', 'Climbing up to visit your window 🧗'); };
  $('#olSync').onclick = async () => { await save(); $('#olStatus').textContent = 'Syncing…'; const r = await X('outlook_sync'); $('#olStatus').textContent = r.ok ? `Synced ${r.count} events ✓` : r.error; };
  $('#olOn').onchange = save;
  $('#nfGen').onclick = async () => { $('#nfTopic').value = await X('ntfy_topic'); $('#nfIn').textContent = $('#nfTopic').value + '-in'; };
  $('#nfTest').onclick = async () => { await save(); const ok = await X('ntfy_test'); toast('Phone', ok ? 'Sent! Check the ntfy app on your phone.' : 'Could not send. Is it switched on with a topic?'); };
  $('#btnWanderNow').onclick = () => { window.nova.wander(); toast('Nova', 'Off for a little stroll 🚶'); };
  $('#btnExport').onclick = async () => { const r = await window.nova.exportData(); if (r.ok) toast('Backup', 'Saved to ' + r.path); };
  $('#btnImport').onclick = async () => { const r = await window.nova.importData(); if (r.ok) { toast('Backup', 'Restored your data.'); refresh(); } else if (r.error) toast('Backup', 'Import failed: ' + r.error); };

  // ---- Supabase cloud sync (desktop) ----
  function cloudRefreshUI() {
    const on = window.NovaSync && NovaSync.isOn();
    const c = (window.NovaSync && NovaSync.getConfig()) || {};
    if ($('#cfUrl')) { $('#cfUrl').value = c.url || ''; $('#cfKey').value = c.anonKey || ''; $('#cfAcc').value = c.account || ''; $('#cfPass').value = c.pass || ''; }
    if ($('#cfNow')) $('#cfNow').style.display = on ? '' : 'none';
    if ($('#cfOff')) $('#cfOff').style.display = on ? '' : 'none';
    if ($('#cloudStatus')) $('#cloudStatus').textContent = on ? 'Connected. Encrypted end-to-end — Supabase only stores ciphertext. Use the same account & pass-phrase on your phone.' : 'Keep this computer and your phone in sync through your own Supabase project. Your data is end-to-end encrypted — Supabase only ever stores ciphertext.';
  }
  let cloudBusy = false;
  async function cloudSync(manual) {
    if (!window.NovaSync || !NovaSync.isOn() || cloudBusy) return;
    cloudBusy = true;
    try {
      const r = await NovaSync.syncNow(() => window.nova.syncExport(), async (obj) => { await window.nova.syncImport(obj); await refresh(); });
      if (manual) toast('Cloud sync', r.action === 'pulled' ? 'Updated from the cloud ☁️' : 'Synced to the cloud ☁️');
    } catch (e) { if (manual) toast('Cloud sync', 'Sync failed — check your settings.'); }
    cloudBusy = false;
  }
  if ($('#cfSave')) {
    cloudRefreshUI();
    $('#cfSave').onclick = async () => {
      const url = $('#cfUrl').value.trim().replace(/\/+$/, ''), anonKey = $('#cfKey').value.trim(), account = $('#cfAcc').value.trim().replace(/[^a-zA-Z0-9_-]/g, ''), pass = $('#cfPass').value;
      if (!url || !anonKey || !account || pass.length < 4) { $('#cfErr').textContent = 'Fill everything (pass-phrase ≥ 4 characters).'; return; }
      NovaSync.configure({ url, anonKey, account, app: 'desktop', pass });
      $('#cfErr').textContent = 'Connecting…';
      try { await NovaSync.test(); $('#cfErr').textContent = ''; cloudRefreshUI(); toast('Cloud sync', 'Connected ☁️'); cloudSync(true); }
      catch (e) { $('#cfErr').textContent = 'Could not reach Supabase — check the URL/key and that the nova_sync table exists.'; }
    };
    $('#cfNow').onclick = () => cloudSync(true);
    $('#cfOff').onclick = () => { NovaSync.clear(); cloudRefreshUI(); toast('Cloud sync', 'Disconnected.'); };
    // auto-sync on launch
    setTimeout(() => { try { cloudSync(false); } catch (e) {} }, 2500);
  }
  $('#dzExport') && ($('#dzExport').onclick = async () => { const r = await window.nova.exportData(); if (r.ok) toast('Backup', 'Saved to ' + r.path); });
  function confirmReset(scope) {
    const label = scope === 'all' ? 'FULL RESET — wipe ALL data, settings and AI keys' : 'Clear all your data (settings and keys are kept)';
    const word = scope === 'all' ? 'RESET' : 'CLEAR';
    toast('Are you sure?', `${label}. Type <b>${word}</b> to confirm.`, [], 0);
    const t = $$('.toast');
    const el = t[t.length - 1];
    const inp = document.createElement('input'); inp.placeholder = `Type ${word}`; inp.style.cssText = 'margin-top:8px;width:100%;padding:7px 9px;border:1px solid var(--line);border-radius:8px;background:var(--panel-2);color:var(--text)';
    const row = document.createElement('div'); row.className = 'row'; row.style.marginTop = '8px';
    const doBtn = document.createElement('button'); doBtn.textContent = scope === 'all' ? 'Full reset' : 'Clear data'; doBtn.className = 'warn'; doBtn.disabled = true;
    const cancel = document.createElement('button'); cancel.textContent = 'Cancel'; cancel.className = 'ghost';
    inp.oninput = () => (doBtn.disabled = inp.value.trim().toUpperCase() !== word);
    cancel.onclick = () => el.remove();
    doBtn.onclick = async () => { el.remove(); const r = await X('reset', scope); if (r.ok) { await refresh(); renderChat(); go('home'); toast('Done', scope === 'all' ? 'Nova is back to a fresh install.' : 'Your data was cleared.'); } };
    row.appendChild(doBtn); row.appendChild(cancel); el.appendChild(inp); el.appendChild(row); setTimeout(() => inp.focus(), 50);
  }
  $('#dzClear') && ($('#dzClear').onclick = () => confirmReset('data'));
  $('#dzReset') && ($('#dzReset').onclick = () => confirmReset('all'));
  $('#s_ai').onchange = (e) => $('#aiBody').classList.toggle('off', !e.target.checked);
  $('#s_dev') && ($('#s_dev').onchange = save); $('#s_theme') && ($('#s_theme').onchange = save);
  $$('[data-clear]').forEach((b) => (b.onclick = () => { clears.add(b.dataset.clear); $('#k_' + b.dataset.clear).placeholder = 'will be cleared on Save'; }));
  $('#s_size').oninput = () => ($('#sizeVal').textContent = $('#s_size').value + 'px');
  $('#s_rate').oninput = () => ($('#rateVal').textContent = $('#s_rate').value + '×');
  $('#s_wakeS').oninput = () => ($('#wakeVal').textContent = $('#s_wakeS').value);
  $('#btnVoice').onclick = () => { tts.setConfig({ voiceName: $('#s_voice').value, rate: +$('#s_rate').value }); tts.stop(); tts.say(`Hi ${$('#s_user').value || 'there'}, I'm ${$('#s_name').value || 'Nova'}. Ready when you are.`); };
  $('#btnTest').onclick = async () => {
    await save(); $('#testOut').textContent = 'Testing…';
    const r = await window.nova.testProviders(); await refresh(); fillSettings();
    $('#testOut').textContent = r.map((x) => `${x.ok ? '✅' : x.msg === 'no key' ? '⚪' : '❌'} ${NAMES[x.provider]}: ${x.msg}`).join('\n');
  };
  $('#btnModels').onclick = async () => {
    $('#testOut').textContent = 'Asking providers…';
    const r = await window.nova.listModels(); const lines = []; let changed = false;
    for (const p of ['groq', 'openrouter', 'ollama', 'custom', 'gemini', 'anthropic', 'openai', 'grok']) {
      const x = r[p] || { ids: [] };
      $('#dl_' + p).innerHTML = x.ids.map((id) => `<option value="${esc(id)}">`).join('');
      if (p === 'ollama' ? !S.settings.ollamaEnabled : p === 'custom' ? !(S.settings.endpoints || {}).custom : !S.settings.keys[p]) continue;
      if (x.error) { lines.push(`${NAMES[p]}: ${x.error}`); continue; }
      const cur = $('#m_' + p).value.trim();
      if (x.best && !x.ids.includes(cur)) { $('#m_' + p).value = x.best; changed = true; lines.push(`${NAMES[p]}: "${cur}" isn't available → using ${x.best}`); }
      else lines.push(`${NAMES[p]}: ${x.ids.length} models${cur ? ` · "${cur}" ✓` : x.best ? ` · will use ${x.best}` : ''}`);
    }
    $('#testOut').textContent = lines.join('\n') || 'Add a key first.';
    if (changed) await save();
  };

  // ---------------------------------------------------------- Ollama
  async function checkOllama() {
    const st = await window.nova.ollama('status');
    if (!st.running) {
      $('#olStatus').innerHTML = 'Not running. Install Ollama (free), open it once, then download a model below. Needs 2–5 GB of disk space.';
      $('#olModels').innerHTML = '';
      return st;
    }
    const cur = $('#m_ollama').value.trim();
    $('#olStatus').textContent = st.models.length ? `Running ✓ · ${st.models.length} model${st.models.length > 1 ? 's' : ''} installed. Click one to use it:` : 'Running ✓ · no models yet. Download one below:';
    $('#olModels').innerHTML = st.models.map((m) => `<span class="tag ${m.name === cur ? 'on' : ''}" data-olm="${esc(m.name)}">${esc(m.name)} · ${(m.size / 1e9).toFixed(1)} GB</span>`).join('');
    $$('#olModels [data-olm]').forEach((t) => (t.onclick = async () => { $('#m_ollama').value = t.dataset.olm; $('#s_ollama').checked = true; await save(); }));
    return st;
  }
  $('#olInstall').onclick = (e) => { e.preventDefault(); window.nova.ollama('download-page'); };
  $$('[data-pull]').forEach((b) => (b.onclick = async () => {
    const st = await checkOllama();
    if (!st.running) { toast('Ollama', 'Install and start Ollama first. Opening the download page.'); window.nova.ollama('download-page'); return; }
    $('#olBar').classList.add('show'); $('#olPullMsg').textContent = `Downloading ${b.dataset.pull}…`;
    $$('[data-pull]').forEach((x) => (x.disabled = true));
    const r = await window.nova.ollama('pull', b.dataset.pull);
    $$('[data-pull]').forEach((x) => (x.disabled = false));
    $('#olBar').classList.remove('show');
    $('#olPullMsg').textContent = r.ok ? `${b.dataset.pull} ready ✓, and Ollama is turned on.` : 'Download failed: ' + r.error;
    if (r.ok) { await refresh(); fillSettings(); }
  }));
  window.nova.on((ev) => {
    if (ev.type !== 'ollama-pull') return;
    if (ev.pct != null) $('#olBar div').style.width = ev.pct + '%';
    if (ev.status && ev.status !== 'error') $('#olPullMsg').textContent = `${ev.model}: ${ev.status}${ev.pct != null ? ' · ' + ev.pct + '%' : ''}`;
  });

  // ---------------------------------------------------------- keyboard
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') session.stopAll();
    if (e.ctrlKey && e.key.toLowerCase() === 'k') { e.preventDefault(); go('chat'); }
  });

  // ---------------------------------------------------------- portable security (USB)
  function renderPortable() {
    const st = (S.status && S.status.sec) || {};
    const card = $('#portCard'); if (!card) return;
    card.style.display = st.portable ? '' : 'none';
    if (!st.portable) return;
    $('#portState').textContent = st.hasPin ? (st.locked ? '🔒 Keys are locked. Enter your PIN to use AI on this PC.' : '🔓 Keys unlocked for this session. A PIN is protecting them.') : st.plain ? '⚠️ Keys are stored without a PIN (lightly obfuscated on the USB).' : 'No PIN set yet. Your AI keys are only obfuscated on the USB.';
  }
  const portBot = $('#portBot');
  $('#portSetPin') && ($('#portSetPin').onclick = async () => {
    const pin = $('#portPin').value.trim();
    if (pin.length < 4) return toast('PIN', 'Use at least 4 characters.');
    const r = await X('sec_setpin', pin);
    $('#portPin').value = '';
    if (r.ok) { await refresh(); fillSettings(); toast('Portable security', 'PIN set. Your AI keys are now encrypted on the USB.'); }
    else toast('PIN', 'Could not set the PIN. If keys are locked, unlock first.');
  });
  $('#portPlain') && ($('#portPlain').onclick = async () => {
    const r = await X('sec_plain'); if (r.ok) { await refresh(); fillSettings(); toast('Portable security', 'Keys will be stored without a PIN.'); }
  });
  $('#portEject') && ($('#portEject').onclick = async () => { toast('Nova', 'Saving and quitting — you can unplug once the window closes.'); await X('safe_eject'); });

  // ---------------------------------------------------------- unlock overlay (shown when keys are locked)
  let lockBotMade = false;
  function maybeLock() {
    const st = (S.status && S.status.sec) || {};
    const ov = $('#lockOverlay'); if (!ov) return;
    if (st.portable && st.locked) {
      if (!lockBotMade) { try { const b = window.NovaAvatar.attach($('#lockBot')); b.setState('idle'); lockBotMade = true; } catch (e) {} }
      ov.style.display = ''; setTimeout(() => $('#lockPin').focus(), 50);
    } else ov.style.display = 'none';
  }
  async function doUnlock() {
    const pin = $('#lockPin').value.trim(); if (!pin) return;
    const r = await X('sec_unlock', pin);
    if (r.ok) { $('#lockPin').value = ''; $('#lockErr').textContent = ''; await refresh(); $('#lockOverlay').style.display = 'none'; toast('Nova', 'AI unlocked. Welcome back!'); }
    else { $('#lockErr').textContent = 'Wrong PIN — try again.'; $('#lockPin').select(); }
  }
  $('#lockGo') && ($('#lockGo').onclick = doUnlock);
  $('#lockPin') && $('#lockPin').addEventListener('keydown', (e) => { if (e.key === 'Enter') doUnlock(); });
  $('#lockSkip') && ($('#lockSkip').onclick = () => { $('#lockOverlay').style.display = 'none'; });

  // ---------------------------------------------------------- developer mode (skin + theme + section)
  const allBots = () => [brand, hero, rewBot].filter(Boolean);
  function applyDev() {
    const s = S.settings, dev = !!s.devMode;
    const dark = s.theme === 'dark' || (s.theme !== 'light' && dev);
    document.documentElement.classList.toggle('dark', dark);
    document.documentElement.classList.toggle('dev', dev);
    allBots().forEach((b) => b.devSkin && b.devSkin(dev));
    // Developer is an ADDED category — the personal/PA sections always stay.
    const nav = $('#navDev'); if (nav) nav.style.display = dev ? '' : 'none';
    const head = $('#navDevHead'); if (head) head.style.display = dev ? '' : 'none';
    if (!dev && section === 'developer') go('home');
  }

  // ---- Dev toolbox UI
  const DT = [
    ['Format JSON', 'json_format'], ['Minify', 'json_minify'], ['Base64 →', 'b64_encode'], ['→ Base64', 'b64_decode'],
    ['URL enc', 'url_encode'], ['URL dec', 'url_decode'], ['Decode JWT', 'jwt'], ['Hashes', 'hash'],
    ['UUID', 'uuid'], ['Case', 'case'], ['Epoch', 'epoch'], ['Cron next', 'cron'], ['Bases', 'bases'], ['Hex→RGB', 'hex2rgb'], ['Random', 'random'], ['Regex…', 'regex']
  ];
  function initDevTools() {
    const host = $('#dtTools'); if (!host || host.__init) return; host.__init = true;
    for (const [label, op] of DT) { const b = document.createElement('button'); b.textContent = label; b.className = 'ghost'; b.onclick = () => runDevTool(op); host.appendChild(b); }
    $('#dtReGo').onclick = async () => {
      const r = await X_action('regex_test', { pattern: $('#dtRe').value, flags: $('#dtReFlags').value, text: $('#dtIn').value.trim() || undefined });
      $('#dtOut').textContent = (r && r.text) || ''; $('#dtMsg').textContent = '';
    };
    $('#dtCopy').onclick = () => { navigator.clipboard && navigator.clipboard.writeText($('#dtOut').textContent); $('#dtMsg').textContent = 'Copied ✓'; setTimeout(() => ($('#dtMsg').textContent = ''), 1500); };
  }
  async function runDevTool(op) {
    $('#dtRegexRow').style.display = op === 'regex' ? 'flex' : 'none';
    if (op === 'regex') { $('#dtRe').focus(); return; }
    const text = $('#dtIn').value.trim();
    const r = await X_action('dev_tool', { op, text: text || undefined });
    $('#dtOut').textContent = (r && r.text) || '';
    $('#dtMsg').textContent = r && r.copied ? 'Result copied to clipboard ✓' : r && r.error ? '' : '';
  }
  const X_action = (name, args) => window.nova.action(name, args);

  // ---- Snippets UI
  function renderSnippets() {
    const host = $('#snList'); if (!host) return;
    const q = ($('#snSearch') && $('#snSearch').value || '').toLowerCase();
    let list = (S.snippets || S.settings.snippets || []);
    if (q) list = list.filter((x) => (x.name + ' ' + x.text).toLowerCase().includes(q));
    host.innerHTML = list.length ? list.map((x) => `<div class="sn" data-id="${x.id}"><div class="sn-h"><b>${esc(x.name)}</b>${x.lang ? `<span class="tag">${esc(x.lang)}</span>` : ''}<span class="sn-btns"><button data-ins="${x.id}">Insert</button><button data-cp="${x.id}">Copy</button><button data-del="${x.id}">✕</button></span></div><pre>${esc(x.text.slice(0, 400))}</pre></div>`).join('') : '<div class="empty">No snippets yet.</div>';
    host.querySelectorAll('[data-ins]').forEach((b) => (b.onclick = () => X_action('snippet_insert', { id: b.dataset.ins }).then((r) => toast('Snippet', r.text))));
    host.querySelectorAll('[data-cp]').forEach((b) => (b.onclick = () => X_action('snippet_copy', { id: b.dataset.cp }).then(() => toast('Snippet', 'Copied ✓'))));
    host.querySelectorAll('[data-del]').forEach((b) => (b.onclick = () => X_action('snippet_delete', { id: b.dataset.del }).then(() => refresh(['snippets']))));
  }
  $('#snSave') && ($('#snSave').onclick = async () => {
    const name = $('#snName').value.trim(), text = $('#snText').value, lang = $('#snLang').value.trim();
    if (!name || !text.trim()) return toast('Snippet', 'Give it a name and some code.');
    const r = await X_action('snippet_save', { name, text, lang });
    $('#snName').value = $('#snText').value = $('#snLang').value = ''; toast('Snippet', r.text); refresh(['snippets']);
  });
  $('#snSearch') && ($('#snSearch').oninput = renderSnippets);

  // ---- Launcher UI
  $('#lnCode') && ($('#lnCode').onclick = () => X_action('open_editor', {}).then((r) => ($('#lnOut').textContent = r.text)));
  $('#lnTerm') && ($('#lnTerm').onclick = () => X_action('open_terminal', {}).then((r) => ($('#lnOut').textContent = r.text)));
  $('#lnGit') && ($('#lnGit').onclick = () => { $('#lnOut').textContent = 'Running git…'; X_action('git_status', {}).then((r) => ($('#lnOut').textContent = r.text)); });
  $('#lnPortGo') && ($('#lnPortGo').onclick = () => X_action('open_localhost', { port: $('#lnPort').value }).then((r) => ($('#lnOut').textContent = r.text)));
  $('#dvSave') && ($('#dvSave').onclick = async () => {
    const repos = $('#dvRepos').value.split('\n').map((x) => x.trim()).filter(Boolean);
    S = await window.nova.saveSettings({ devPaths: { editor: $('#dvEditor').value.trim(), terminal: '', repos } });
    toast('Developer', 'Launcher settings saved.');
  });

  // text utilities
  const TX = [['slug', 'slug'], ['stats', 'stats'], ['sort', 'sort'], ['sort unique', 'sort_u'], ['sort numeric', 'sort_n'], ['dedupe', 'dedupe'], ['reverse', 'reverse'], ['trim', 'trim'], ['UPPER', 'upper'], ['lower', 'lower']];
  function buildText() {
    const host = $('#txTools'); if (!host) return;
    for (const [label, op] of TX) { const b = document.createElement('button'); b.textContent = label; b.className = 'ghost'; b.onclick = async () => {
      const v = $('#txIn').value;
      if (op === 'upper') return void ($('#txOut').textContent = v.toUpperCase());
      if (op === 'lower') return void ($('#txOut').textContent = v.toLowerCase());
      const r = await X('devkit', op, v); $('#txOut').textContent = (r && (r.text || r.error)) || ''; }; host.appendChild(b); }
  }
  function wireDiff() {
    $('#dfGo').onclick = async () => { const r = await X('text_diff', $('#dfA').value, $('#dfB').value); $('#dfOut').textContent = r.text || '(identical)'; $('#dfMsg').textContent = `+${r.added} −${r.removed}`; };
  }
  // scratchpad (autosave)
  let spTimer = null;
  async function wireScratch() {
    const el = $('#spIn'); if (!el) return;
    el.value = await X('scratch_get');
    el.oninput = () => { clearTimeout(spTimer); $('#spMsg').textContent = 'saving…'; spTimer = setTimeout(async () => { await X('scratch_set', el.value); $('#spMsg').textContent = 'saved ✓'; setTimeout(() => ($('#spMsg').textContent = ''), 1200); }, 500); };
  }
  function wireMarkdown() {
    const render = async () => { const r = await X('devkit', 'md', $('#mdIn').value); $('#mdOut').innerHTML = (r && r.text) || ''; };
    $('#mdIn') && ($('#mdIn').oninput = render);
  }

  // ---- Command palette (Ctrl+Shift+P)
  const PALETTE = [
    ['Format JSON', () => { go('developer'); setTimeout(() => runDevTool('json_format'), 60); }],
    ['Decode JWT', () => { go('developer'); setTimeout(() => runDevTool('jwt'), 60); }],
    ['New UUID', () => window.nova.input('uuid')],
    ['Hashes of clipboard', () => window.nova.input('hash')],
    ['Cron next runs…', () => go('developer')],
    ['Open VS Code', () => window.nova.input('open vscode')],
    ['Open terminal', () => window.nova.input('open terminal')],
    ['Git status', () => window.nova.input('git status')],
    ['Make QR code…', () => { go('developer'); setTimeout(() => showDTab('qr'), 60); }],
    ['Generate secret / key…', () => { go('developer'); setTimeout(() => showDTab('secrets'), 60); }],
    ['Open key vault', () => { go('developer'); setTimeout(() => showDTab('vault'), 60); }],
    ['Run a command…', () => { go('developer'); setTimeout(() => showDTab('run'), 60); }],
    ['HTTP request…', () => { go('developer'); setTimeout(() => showDTab('api'), 60); }],
    ['Listening ports', () => window.nova.input('list ports')],
    ['Dev / system info', () => window.nova.input('dev info')],
    ['Insert snippet…', () => go('developer')],
    ['Toggle developer mode', () => window.nova.input('developer mode')],
    ['Start focus 25 min', () => window.nova.input('start focus 25 min')],
    ['New reminder…', () => go('reminders')],
    ['Screenshot', () => window.nova.input('screenshot')]
  ];
  const SECTIONS = ['home', 'calendar', 'reminders', 'tasks', 'focus', 'habits', 'routines', 'usage', 'documents', 'meetings', 'sap', 'automations', 'widgets', 'developer', 'people', 'money', 'journal', 'rewards', 'notes', 'clipboard', 'shortcuts', 'tools', 'chat', 'settings'];
  function openPalette() {
    if ($('#palette')) return closePalette();
    const ov = document.createElement('div'); ov.id = 'palette'; ov.className = 'palette-ov';
    ov.innerHTML = `<div class="palette"><input id="palIn" placeholder="Type a command or section…" autocomplete="off"><div id="palList" class="pal-list"></div></div>`;
    document.body.appendChild(ov);
    ov.onclick = (e) => { if (e.target === ov) closePalette(); };
    const items = PALETTE.map(([label, fn]) => ({ label, fn })).concat(SECTIONS.map((sec) => ({ label: 'Go to ' + (SEC_NAME[sec] || sec.charAt(0).toUpperCase() + sec.slice(1)), fn: () => go(sec) }))).concat((S.snippets || []).map((sn) => ({ label: 'Insert snippet: ' + sn.name, fn: () => window.nova.action('snippet_insert', { id: sn.id }) })));
    let sel = 0;
    const draw = (q) => {
      const f = items.filter((it) => it.label.toLowerCase().includes(q.toLowerCase())).slice(0, 10);
      sel = Math.min(sel, Math.max(0, f.length - 1));
      $('#palList').innerHTML = f.map((it, i) => `<div class="pal-it${i === sel ? ' on' : ''}" data-i="${i}">${esc(it.label)}</div>`).join('') || '<div class="pal-it muted">No match</div>';
      $('#palList').querySelectorAll('[data-i]').forEach((el) => (el.onclick = () => { closePalette(); f[+el.dataset.i].fn(); }));
      ov.__f = f;
    };
    const inp = $('#palIn');
    inp.oninput = () => draw(inp.value);
    inp.onkeydown = (e) => {
      const f = ov.__f || [];
      if (e.key === 'ArrowDown') { sel = Math.min(sel + 1, f.length - 1); draw(inp.value); e.preventDefault(); }
      else if (e.key === 'ArrowUp') { sel = Math.max(sel - 1, 0); draw(inp.value); e.preventDefault(); }
      else if (e.key === 'Enter') { if (f[sel]) { closePalette(); f[sel].fn(); } }
      else if (e.key === 'Escape') closePalette();
    };
    draw(''); setTimeout(() => inp.focus(), 30);
  }
  function closePalette() { const ov = $('#palette'); if (ov) ov.remove(); }
  document.addEventListener('keydown', (e) => { if (e.shiftKey && (e.ctrlKey || e.metaKey) && (e.key === 'P' || e.key === 'p')) { e.preventDefault(); openPalette(); } });


  // ---------------------------------------------------------- Developer hub (tabs + new tools)
  let hubInit = false;
  function initHub() {
    if (!$('#dTabs')) return;
    if (!hubInit) {
      hubInit = true;
      $$('#dTabs button').forEach((b) => (b.onclick = () => showDTab(b.dataset.dtab)));
      buildConverters(); buildSecrets(); wireQR(); wireVault(); wireRun(); wireWorkflows(); wireWatch(); wireHttp(); wirePorts(); buildText(); wireDiff(); wireScratch(); wireMarkdown();
    }
    renderVault(); renderWorkflows(); renderWatches();
  }
  function showDTab(tab) {
    $$('#dTabs button').forEach((b) => b.classList.toggle('on', b.dataset.dtab === tab));
    $$('#sec-developer .dpane').forEach((p) => (p.style.display = p.dataset.dtab === tab ? '' : 'none'));
  }
  // converters
  const CV = [['JSON → TS', 'json_ts'], ['JSON → ABAP', 'json_abap'], ['.env → JSON', 'env_json'], ['JSON → .env', 'json_env'], ['query → JSON', 'query_json'], ['JSON → query', 'json_query'], ['HTML encode', 'html_enc'], ['HTML decode', 'html_dec']];
  function buildConverters() {
    const host = $('#cvTools'); if (!host) return;
    for (const [label, op] of CV) { const b = document.createElement('button'); b.textContent = label; b.className = 'ghost'; b.onclick = async () => { const r = await X('devkit', op, $('#cvIn').value, $('#cvName').value.trim() || undefined); $('#cvOut').textContent = (r && (r.text || r.error)) || ''; }; host.appendChild(b); }
  }
  // secrets & keys
  const SK = [['Hex secret', 'hex'], ['Base64 secret', 'base64'], ['URL token', 'token'], ['API key', 'apikey'], ['HMAC key', 'hmac'], ['Passphrase', 'passphrase'], ['ed25519 keypair', 'kp:ed25519'], ['RSA keypair', 'kp:rsa'], ['EC keypair', 'kp:ec']];
  function buildSecrets() {
    const host = $('#skTools'); if (!host) return;
    for (const [label, kind] of SK) { const b = document.createElement('button'); b.textContent = label; b.className = 'ghost'; b.onclick = async () => {
      let r; if (kind.startsWith('kp:')) r = await X('gen_keypair', kind.slice(3)); else r = await X('gen_secret', kind, $('#skLen').value.trim() || undefined);
      $('#skOut').textContent = (r && r.text) || ''; }; host.appendChild(b); }
  }
  // QR
  function wireQR() {
    const go = async () => { const t = $('#qrIn').value.trim(); if (!t) return; const r = await X('qr_svg', t); if (r.ok) { $('#qrOut').innerHTML = r.svg; $('#qrSave').style.display = ''; $('#qrSave').__svg = r.svg; } else $('#qrOut').innerHTML = '<span class="muted">' + esc(r.error) + '</span>'; };
    $('#qrGo').onclick = go; $('#qrIn').addEventListener('keydown', (e) => { if (e.key === 'Enter') go(); });
    $('#qrSave').onclick = () => { const blob = new Blob([$('#qrSave').__svg], { type: 'image/svg+xml' }); const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'qr.svg'; a.click(); };
  }
  // vault
  async function renderVault() {
    const st = await X('vault_status');
    $('#vaultLocked').style.display = st.unlocked ? 'none' : '';
    $('#vaultOpen').style.display = st.unlocked ? '' : 'none';
    $('#vaultMsg').textContent = st.exists ? 'Enter your passphrase to unlock your secrets.' : 'Store API keys and secrets encrypted on this machine (AES-256). Set a passphrase to create the vault.';
    $('#vaultGo').textContent = st.exists ? 'Unlock' : 'Create vault';
    if (st.unlocked) { const items = await X('vault_list'); $('#vaultList').innerHTML = items.length ? items.map((it) => `<div class="sn"><div class="sn-h"><b>${esc(it.name)}</b>${it.note ? `<span class="tag">${esc(it.note)}</span>` : ''}<span class="sn-btns"><button data-rev="${it.id}">Copy</button><button data-del="${it.id}">✕</button></span></div></div>`).join('') : '<div class="empty">No secrets yet.</div>';
      $('#vaultList').querySelectorAll('[data-rev]').forEach((b) => (b.onclick = () => X('vault_reveal', b.dataset.rev).then((r) => toast('Vault', r.ok ? `Copied ${r.name} (clipboard clears in 25s)` : r.error))));
      $('#vaultList').querySelectorAll('[data-del]').forEach((b) => (b.onclick = () => X('vault_remove', b.dataset.del).then(renderVault))); }
  }
  function wireVault() {
    $('#vaultGo').onclick = async () => { const p = $('#vaultPass').value; if (!p) return; const st = await X('vault_status'); const r = st.exists ? await X('vault_unlock', p) : await X('vault_create', p); $('#vaultPass').value = ''; if (!r.ok) return toast('Vault', r.error || 'Failed'); renderVault(); };
    $('#vaultPass').addEventListener('keydown', (e) => { if (e.key === 'Enter') $('#vaultGo').click(); });
    $('#vaultAdd').onclick = async () => { const n = $('#vaultName').value.trim(), v = $('#vaultVal').value; if (!n || !v) return toast('Vault', 'Name and value needed.'); const r = await X('vault_add', n, v, $('#vaultNote').value.trim()); if (r.ok) { $('#vaultName').value = $('#vaultVal').value = $('#vaultNote').value = ''; renderVault(); toast('Vault', 'Saved (encrypted).'); } else toast('Vault', r.error); };
    $('#vaultLock').onclick = () => X('vault_lock').then(renderVault);
  }
  // run command
  function wireRun() {
    const go = async () => { const c = $('#rcCmd').value.trim(); if (!c) return; $('#rcOut').textContent = 'Running…'; const r = await X('run_command', c, $('#rcCwd').value.trim() || undefined); $('#rcOut').textContent = r.text || ''; };
    $('#rcGo').onclick = go; $('#rcCmd').addEventListener('keydown', (e) => { if (e.key === 'Enter') go(); });
  }
  // workflows
  async function renderWorkflows() {
    const list = await X('workflow_list'); const host = $('#wfList'); if (!host) return;
    host.innerHTML = list.length ? list.map((w) => `<div class="sn"><div class="sn-h"><b>${esc(w.name)}</b><span class="muted small">${w.commands.length} cmd${w.commands.length !== 1 ? 's' : ''}</span><span class="sn-btns"><button data-run="${w.id}">Run</button><button data-term="${w.id}">Terminal</button><button data-del="${w.id}">✕</button></span></div><pre>${esc(w.commands.join('\n'))}</pre></div>`).join('') : '<div class="empty">No workflows yet.</div>';
    host.querySelectorAll('[data-run]').forEach((b) => (b.onclick = async () => { $('#wfOut').textContent = 'Running…'; const r = await X('workflow_run', b.dataset.run, false); $('#wfOut').textContent = r.text || ''; }));
    host.querySelectorAll('[data-term]').forEach((b) => (b.onclick = () => X('workflow_run', b.dataset.term, true)));
    host.querySelectorAll('[data-del]').forEach((b) => (b.onclick = () => X('workflow_delete', b.dataset.del).then(renderWorkflows)));
  }
  function wireWorkflows() {
    $('#wfSave').onclick = async () => { const name = $('#wfName').value.trim(); const cmds = $('#wfCmds').value.split('\n').map((x) => x.trim()).filter(Boolean); if (!name || !cmds.length) return toast('Workflow', 'Name and at least one command.'); await X('workflow_save', { name, commands: cmds, cwd: $('#wfCwd').value.trim() }); $('#wfName').value = $('#wfCmds').value = $('#wfCwd').value = ''; renderWorkflows(); toast('Workflow', 'Saved.'); };
  }
  // watch
  async function renderWatches() {
    const list = await X('watch_list'); const host = $('#wtList'); if (!host) return;
    host.innerHTML = list.length ? list.map((w) => `<div class="sn"><div class="sn-h"><b>${esc(w.path)}</b><span class="sn-btns"><button data-del="${w.id}">Stop</button></span></div></div>`).join('') : '<div class="empty">Nothing watched.</div>';
    host.querySelectorAll('[data-del]').forEach((b) => (b.onclick = () => X('watch_remove', b.dataset.del).then(renderWatches)));
  }
  function wireWatch() { $('#wtAdd').onclick = async () => { const p = $('#wtPath').value.trim(); if (!p) return; const r = await X('watch_add', p); toast('Watch', r.text); if (!r.error) { $('#wtPath').value = ''; renderWatches(); } }; }
  // http
  function wireHttp() {
    $('#hGo').onclick = async () => { const url = $('#hUrl').value.trim(); if (!url) return; $('#hStatus').textContent = 'Sending…'; $('#hOut').textContent = ''; const r = await X('http_request', { method: $('#hMethod').value, url, headers: $('#hHeaders').value, body: $('#hBody').value }); if (r.ok) { $('#hStatus').textContent = `${r.status} ${r.statusText} · ${r.ms} ms`; $('#hOut').textContent = (r.headers ? r.headers + '\n\n' : '') + r.body; } else { $('#hStatus').textContent = ''; $('#hOut').textContent = '⚠️ ' + r.error; } };
  }
  // ports + info
  function wirePorts() {
    $('#ptList').onclick = async () => { $('#ptOut').textContent = 'Scanning…'; const r = await X('ports_list'); $('#ptOut').textContent = r.text || ''; };
    $('#ptInfo').onclick = async () => { $('#ptOut').textContent = '…'; const r = await X('dev_info'); $('#ptOut').textContent = r.text || ''; };
    $('#ptKillGo').onclick = async () => { const p = $('#ptKill').value.trim(); if (!p) return; const r = await X('kill_port', p); $('#ptOut').textContent = r.text || ''; };
  }

  // ---------------------------------------------------------- reading list
  let rdFilter = 'unread';
  function renderReading() {
    const host = $('#rdList'); if (!host) return;
    let list = (S.reading || []).slice().reverse();
    if (rdFilter === 'unread') list = list.filter((x) => !x.read); else if (rdFilter === 'read') list = list.filter((x) => x.read);
    host.innerHTML = list.length ? list.map((x) => { let host2 = ''; try { host2 = new URL(x.url).hostname.replace(/^www\./, ''); } catch (e) {} return `<div class="rd-it${x.read ? ' read' : ''}"><a href="#" data-open="${x.id}" title="${esc(x.url)}">${esc(x.title)}</a><span class="host">${esc(host2)}</span><button data-read="${x.id}">${x.read ? 'Unread' : 'Read'}</button><button data-del="${x.id}">✕</button></div>`; }).join('') : `<div class="empty">${rdFilter === 'read' ? 'Nothing read yet.' : rdFilter === 'unread' ? 'Nothing to read — all caught up 🎉' : 'No saved links.'}</div>`;
    host.querySelectorAll('[data-open]').forEach((a) => (a.onclick = (e) => { e.preventDefault(); window.nova.action('reading_open', { id: a.dataset.open }); setTimeout(() => refresh(['reading']), 200); }));
    host.querySelectorAll('[data-read]').forEach((b) => (b.onclick = () => { const it = (S.reading || []).find((x) => x.id === b.dataset.read); window.nova.action('reading_read', { id: b.dataset.read, read: !(it && it.read) }).then(() => refresh(['reading'])); }));
    host.querySelectorAll('[data-del]').forEach((b) => (b.onclick = () => window.nova.action('reading_delete', { id: b.dataset.del }).then(() => refresh(['reading']))));
  }
  $('#rdAdd') && ($('#rdAdd').onclick = async () => { const u = $('#rdUrl').value.trim(); if (!u) return; const r = await window.nova.action('reading_add', { url: u, title: $('#rdTitle').value.trim() }); $('#rdUrl').value = $('#rdTitle').value = ''; toast('Reading list', r.text); refresh(['reading']); });
  $('#rdUrl') && $('#rdUrl').addEventListener('keydown', (e) => { if (e.key === 'Enter') $('#rdAdd').click(); });
  $$('#rdFilter button').forEach((b) => (b.onclick = () => { rdFilter = b.dataset.rf; $$('#rdFilter button').forEach((x) => x.classList.toggle('on', x === b)); renderReading(); }));

  // ---------------------------------------------------------- checklists
  function renderChecklists() {
    const host = $('#clList'); if (!host) return;
    const list = S.checklists || [];
    host.innerHTML = list.length ? list.map((c) => { const done = c.items.filter((i) => i.done).length; return `<div class="card cl-card" data-cl="${c.id}"><div class="cl-head"><h3>${esc(c.name)}</h3><span class="prog">${done}/${c.items.length}</span><button class="ghost" data-reset="${c.id}">Reset</button><button class="ghost warn" data-del="${c.id}">✕</button></div><div class="cl-items">${c.items.map((i, k) => `<label class="cl-item${i.done ? ' done' : ''}"><input type="checkbox" data-chk="${c.id}:${k}"${i.done ? ' checked' : ''}><span>${esc(i.text)}</span></label>`).join('')}</div><div class="cl-add"><input placeholder="+ add item" data-add="${c.id}"></div></div>`; }).join('') : '<div class="card"><div class="empty">No checklists yet. Create one above (e.g. Packing: passport, charger, meds).</div></div>';
    host.querySelectorAll('[data-chk]').forEach((cb) => (cb.onchange = () => { const [id, k] = cb.dataset.chk.split(':'); const c = (S.checklists || []).find((x) => x.id === id); if (!c) return; window.nova.action('checklist_check', { name: c.name, item: c.items[+k].text, done: cb.checked }).then(() => refresh(['checklists'])); }));
    host.querySelectorAll('[data-reset]').forEach((b) => (b.onclick = () => { const c = (S.checklists || []).find((x) => x.id === b.dataset.reset); window.nova.action('checklist_reset', { name: c.name }).then(() => refresh(['checklists'])); }));
    host.querySelectorAll('[data-del]').forEach((b) => (b.onclick = () => { const c = (S.checklists || []).find((x) => x.id === b.dataset.del); window.nova.action('checklist_delete', { name: c.name }).then(() => refresh(['checklists'])); }));
    host.querySelectorAll('[data-add]').forEach((inp) => (inp.onkeydown = (e) => { if (e.key === 'Enter' && inp.value.trim()) { const c = (S.checklists || []).find((x) => x.id === inp.dataset.add); const items = c.items.map((i) => i.text).concat([inp.value.trim()]); window.nova.action('checklist_create', { name: c.name, items }).then(() => refresh(['checklists'])); } }));
  }
  $('#clNew') && ($('#clNew').onclick = async () => { const name = $('#clName').value.trim(); if (!name) return; const items = $('#clItems').value.split(/[,;\n]/).map((x) => x.trim()).filter(Boolean); await window.nova.action('checklist_create', { name, items }); $('#clName').value = $('#clItems').value = ''; refresh(['checklists']); });

  // ---------------------------------------------------------- weekly review
  async function renderReview() { const r = await window.nova.action('weekly_review', {}); $('#rvBody') && ($('#rvBody').textContent = r.text || ''); }
  $('#rvRefresh') && ($('#rvRefresh').onclick = renderReview);

  // ---------------------------------------------------------- live activity panel
  const activeJobs = new Map(); const doneJobs = [];
  let actAuto = false;
  function actStart(ev) { activeJobs.set(ev.id, { id: ev.id, text: ev.text, step: 'Starting…', at: ev.at }); if (!$('#activityPanel').classList.contains('show') && !actUserHidden) { $('#activityPanel').classList.add('show'); actAuto = true; } renderActivity(); }
  function actStep(ev) { const j = activeJobs.get(ev.id); if (j) { j.step = ev.label; renderActivity(); } }
  function actDone(ev) { activeJobs.delete(ev.id); doneJobs.unshift({ text: ev.request, label: ev.label, ok: ev.ok, ms: ev.ms }); while (doneJobs.length > 8) doneJobs.pop(); if (!activeJobs.size && actAuto) { actAuto = false; } renderActivity(); }
  function renderActivity() {
    const run = $('#actRunning'), done = $('#actDone'); if (!run) return;
    $('#actCount').textContent = activeJobs.size ? activeJobs.size + ' running' : '';
    run.innerHTML = [...activeJobs.values()].map((j) => `<div class="act-job"><div class="req">${esc(j.text)}</div><div class="step"><span class="spin"></span>${esc(j.step)}</div></div>`).join('') || (activeJobs.size ? '' : '<div class="muted small" style="margin:6px 0">Nothing running right now.</div>');
    $('#actDivider').style.display = doneJobs.length ? '' : 'none';
    done.innerHTML = doneJobs.map((j) => `<div class="act-job done${j.ok ? '' : ' err'}"><div class="req">${esc(j.text || j.label)}</div><div class="step"><span class="tick">${j.ok ? '✓' : '✕'}</span>${esc(j.label)}<span class="ms">${j.ms != null ? j.ms + ' ms' : ''}</span></div></div>`).join('');
  }
  let actUserHidden = false;
  $('#actShow') && ($('#actShow').onclick = () => { actUserHidden = false; $('#activityPanel').classList.add('show'); renderActivity(); });
  $('#actHide') && ($('#actHide').onclick = () => { actUserHidden = true; actAuto = false; $('#activityPanel').classList.remove('show'); });

  // ---------------------------------------------------------- first-run tour
  function maybeTour() {
    let done = true; try { done = !!localStorage.getItem('nova-toured'); } catch (e) {}
    if (done) return;
    const steps = [
      { emoji: '👋', title: 'Welcome to Nova', body: 'Your private, offline personal assistant. Tasks, reminders, habits, focus and notes — all on this device, nothing in the cloud.' },
      { emoji: '⌨️', title: 'Just type what you need', body: 'Use the search bar on Today like a command line: “remind me at 5 to call Vivek”, “add task review BOE”, “log water”. Nova understands plain English.' },
      { emoji: '🧩', title: 'Glanceable widgets', body: 'Open Widgets for an at-a-glance board — up next, activity rings, focus, water and quick-add. You can also pop any card onto your desktop.' },
      { emoji: '🙂', title: 'Meet your helper', body: 'Turn on “Nova on desktop” to get a little avatar companion. Right-click it for quick actions, or tap 🤫 Quiet before a meeting.' }
    ];
    let i = 0;
    const ov = document.createElement('div'); ov.className = 'tour-ov';
    document.body.appendChild(ov);
    const draw = () => {
      const s = steps[i];
      ov.innerHTML = `<div class="tour-card">
        <div class="tour-emoji">${s.emoji}</div>
        <h2>${esc(s.title)}</h2>
        <p>${esc(s.body)}</p>
        <div class="tour-dots">${steps.map((_, j) => `<span class="${j === i ? 'on' : ''}"></span>`).join('')}</div>
        <div class="tour-actions">
          <button class="link" id="tourSkip">Skip</button>
          <button class="primary" id="tourNext">${i === steps.length - 1 ? 'Get started' : 'Next'}</button>
        </div></div>`;
      ov.querySelector('#tourSkip').onclick = finish;
      ov.querySelector('#tourNext').onclick = () => { if (i === steps.length - 1) finish(); else { i++; draw(); } };
    };
    function finish() { try { localStorage.setItem('nova-toured', '1'); } catch (e) {} ov.classList.remove('show'); setTimeout(() => ov.remove(), 220); }
    draw(); requestAnimationFrame(() => ov.classList.add('show'));
  }

  // ---------------------------------------------------------- boot
  refresh().then(() => { renderChat(); loadWeather(); syncStopwatch(); applyOutfit(S.settings.outfit); maybeLock(); maybeTour(); });
  setInterval(loadWeather, 30 * 60000);
  setInterval(() => S && (renderHome(), renderCounts(), section === 'reminders' && renderReminders()), 60000);
})();
