// Desktop companion: Nova's character with speech bubbles. Shares the brain/conversation with the app.
(() => {
  const { md, esc, sound } = window.NovaCore;
  const $ = (s) => document.querySelector(s);
  const body = document.body, stack = $('#stack'), avatarEl = $('#avatar'), busyEl = $('#busy');
  const bot = window.NovaAvatar.attach($('#bot'));
  // remember Nova's chosen colour skin (feature: colour skins)
  try { const sk = localStorage.getItem('nova-skin'); if (sk) bot.skin(sk); } catch (e) {}
  const setSkin = (name) => { bot.skin(name); try { localStorage.setItem('nova-skin', name); } catch (e) {} };
  let layout = { h: 'right', v: 'bottom' };
  let settings = null;
  const live = new Map(); // job id -> bubble

  // ---------------------------------------------------------- click-through hit testing
  let hitOn = false;
  const setHit = (v) => { if (v !== hitOn) { hitOn = v; window.nova.hit(v); } };
  document.addEventListener('mousemove', (e) => setHit(!!(e.target.closest && e.target.closest('.hit, .bubble'))));
  document.addEventListener('mouseleave', () => { if (!dragging) setHit(false); });

  // ---------------------------------------------------------- bubbles
  function addBubble(cls, html, { ttl = 0, onClick, keep = false } = {}) {
    const b = document.createElement('div');
    b.className = 'bubble ' + cls;
    b.innerHTML = html;
    if (layout.v === 'top') stack.prepend(b); else stack.appendChild(b);
    const all = [...stack.children].filter((x) => !x.classList.contains('ask') && !x.classList.contains('panel') && !x.classList.contains('out'));
    while (all.length > 3) removeBubble(layout.v === 'top' ? all.pop() : all.shift());
    if (onClick) b.addEventListener('click', (e) => { if (!e.target.closest('button, input')) onClick(e); });
    if (ttl) armTtl(b, ttl);
    b.__keep = keep;
    return b;
  }
  function armTtl(b, ttl) {
    clearTimeout(b.__t);
    b.__t = setTimeout(function check() { if (b.matches(':hover')) { b.__t = setTimeout(check, 1500); return; } removeBubble(b); }, ttl);
  }
  function removeBubble(b) {
    if (!b || !b.parentNode || b.classList.contains('out')) return;
    b.classList.add('out');
    setTimeout(() => { b.remove(); if (!stack.querySelector('.bubble:hover')) setHit(false); }, 200);
  }
  const ttlFor = (text) => Math.min(30000, Math.max(6000, String(text).length * 70));
  function clip(text, n = 320) {
    const t = String(text || '');
    return t.length > n ? md(t.slice(0, n)) + '… <span class="more">Open in Nova ›</span>' : md(t);
  }
  const openChat = () => window.nova.openApp('chat');
  function addRow(b, buttons) {
    const row = document.createElement('div'); row.className = 'row';
    for (const [label, cls, fn] of buttons) {
      const btn = document.createElement('button'); btn.className = cls || ''; btn.textContent = label;
      btn.onclick = (e) => { e.stopPropagation(); fn(btn, row); };
      row.appendChild(btn);
    }
    b.appendChild(row);
  }

  const SECTION_NAME = { developer: 'Developer', reading: 'Reading list', checklists: 'Checklists', review: 'Weekly review', reminders: 'Reminders', tasks: 'Tasks', notes: 'Notes', calendar: 'Calendar', money: 'Money', habits: 'Habits', focus: 'Focus', journal: 'Journal', people: 'People', tools: 'Tools', documents: 'Documents', usage: 'Usage', rewards: 'Rewards', home: 'Today', clipboard: 'Clipboard', meetings: 'Meetings', automations: 'Automations' };
  // Choice buttons (from the brain or from drops). Each choice is {label, run} (a normal command) or {label, fn}.
  function addChoices(b, choices) {
    if (!choices || !choices.length) return;
    const row = document.createElement('div'); row.className = 'row wrap';
    for (const c of choices.slice(0, 6)) {
      const btn = document.createElement('button'); btn.textContent = c.label; if (c.primary) btn.className = 'primary';
      btn.onclick = (e) => { e.stopPropagation(); row.remove(); if (c.fn) c.fn(); else if (c.run) window.nova.input(c.run, { choice: true }); armTtl(b, 2500); };
      row.appendChild(btn);
    }
    b.appendChild(row);
  }
  function addSectionLink(b, section) {
    if (!section || !SECTION_NAME[section]) return;
    const a = document.createElement('button'); a.className = 'linkish open-sec'; a.textContent = `Open ${SECTION_NAME[section]} ›`;
    a.onclick = (e) => { e.stopPropagation(); window.nova.openApp(section); };
    b.appendChild(a);
  }
  let lastSelf = 0;
  const nact = (name, args) => { lastSelf = Date.now(); return window.nova.action(name, args); }; // actions started from the avatar itself
  function applyDev() { const dev = !!(settings && settings.devMode); bot.devSkin && bot.devSkin(dev); document.body.classList.toggle('dev', dev); }
  const echoOn = () => !settings || !settings.life || settings.life.echo !== false;

  // ---------------------------------------------------------- quick ask
  let askEl = null;
  function openAsk() {
    if (askEl) { askEl.querySelector('input').focus(); return; }
    askEl = addBubble('ask', `
      <input placeholder="Ask ${esc((settings && settings.assistantName) || 'Nova')} anything…" />
      <button class="mic" title="Talk"><svg viewBox="0 0 24 24" width="16" height="16"><path fill="currentColor" d="M12 14a3 3 0 0 0 3-3V5a3 3 0 1 0-6 0v6a3 3 0 0 0 3 3Zm5-3a5 5 0 0 1-10 0H5a7 7 0 0 0 6 6.92V21h2v-3.08A7 7 0 0 0 19 11h-2Z"/></svg></button>
      <button class="send" title="Send"><svg viewBox="0 0 24 24" width="16" height="16"><path fill="currentColor" d="M3.4 20.4 21 12 3.4 3.6 3.4 10l12.6 2-12.6 2z"/></svg></button>`);
    const inp = askEl.querySelector('input');
    const go = () => { const v = inp.value.trim(); if (!v) return; inp.value = ''; session.submit(v); closeAsk(); };
    askEl.querySelector('.send').onclick = go;
    askEl.querySelector('.mic').onclick = () => session.toggleListen();
    inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') go(); if (e.key === 'Escape') closeAsk(); });
    window.nova.focusMe();
    setTimeout(() => inp.focus(), 40);
  }
  function closeAsk() { if (askEl) { removeBubble(askEl); askEl = null; window.nova.blurMe(); } }

  // ---------------------------------------------------------- session (voice + speech)
  const session = window.NovaSession.create({
    role: 'companion',
    render: {
      message(msg) {
        if (msg.role === 'user' && msg.meta && msg.meta.source === 'companion' && msg.meta.byVoice) addBubble('user', '🎙 ' + esc(msg.text), { ttl: 6000 });
      },
      start(id, ev) {
        if (ev.source !== 'companion' && !(ev.appVisible === false && echoOn())) return;
        const b = addBubble('reply typing', '<div class="body"></div>', { onClick: openChat });
        b.__text = ''; live.set(id, b);
      },
      token(id, text) {
        const b = live.get(id); if (!b) return;
        b.__text += text;
        b.querySelector('.body').innerHTML = clip(b.__text);
      },
      final(ev) {
        if (ev.source !== 'companion' && !live.has(ev.id) && !(ev.appVisible === false && echoOn() && !ev.silent)) return;
        const m = ev.msg, meta = m.meta || {};
        let b = live.get(ev.id);
        if (b) { b.classList.remove('typing'); b.querySelector('.body').innerHTML = clip(m.text); live.delete(ev.id); }
        else b = addBubble('reply', `<div class="body">${clip(m.text)}</div>`, { onClick: openChat });
        if (meta.error) b.classList.add('err');
        if (meta.confirm) addRow(b, [['Yes', 'primary', (btn, row) => { row.remove(); window.nova.confirm(true); }], ['No', '', (btn, row) => { row.remove(); window.nova.confirm(false); }]]);
        else armTtl(b, ttlFor(m.text));
        if (meta.open) addRow(b, [['Open', 'primary', () => window.nova.openPath(meta.open)]]);
        if (meta.settings && !meta.choices) addRow(b, [['Open settings', 'primary', () => window.nova.openApp('settings')]]);
        if (meta.choices) { addChoices(b, meta.choices); armTtl(b, Math.max(ttlFor(m.text), 20000)); }
        addSectionLink(b, meta.section);
      },
      alert(ev) {
        const r = ev.reminder;
        const title = { alarm: 'Alarm', timer: 'Timer', event: 'Coming up', break: 'Break time', focus: 'Focus' }[r.kind] || 'Reminder';
        const b = addBubble('alert' + (r.gentle ? ' gentle' : ''), `<div class="title">${title}</div><div>${esc(r.text)}</div>`, { onClick: () => window.nova.openApp(r.kind === 'event' ? 'calendar' : r.kind === 'focus' ? 'focus' : 'reminders') });
        const btns = [];
        const isWater = /\b(water|drink|hydrat|glass)/i.test(r.text) && r.kind !== 'event';
        const task = (cache.tasks || []).find((t) => !t.done && simil(t.text, r.text));
        if (isWater) btns.push(['💧 Drank it', 'primary', async () => { window.nova.ack(); removeBubble(b); const res = await nact('water_log', { glasses: 1 }); showResult(res, 'habits'); }]);
        else if (task) btns.push(['✅ Mark done', 'primary', async () => { window.nova.ack(); removeBubble(b); const res = await nact('task_done', { id: task.id }); showResult(res, 'tasks'); }]);
        if (r.kind === 'reminder' || r.kind === 'alarm' || r.kind === 'timer' || r.kind === 'event') btns.push([r.repeat ? 'Later' : 'Snooze 10m', '', () => { nact('reminder_snooze', { id: r.id, minutes: r.repeat ? 15 : 10 }); window.nova.ack(); removeBubble(b); }]);
        if (r.repeat && /^(hourly|every:)/.test(r.repeat)) btns.push(['Stop', '', () => { nact('reminder_delete', { id: r.id }); window.nova.ack(); removeBubble(b); showResult({ text: 'Okay, I\'ve stopped that repeating reminder.' }); }]);
        if (r.joinUrl) btns.unshift(['Join meeting', 'primary', () => { window.nova.openPath(r.joinUrl); window.nova.ack(); removeBubble(b); }]);
        btns.push([r.gentle ? 'Done' : 'Got it', r.joinUrl || isWater || task ? '' : 'primary', () => { window.nova.ack(); removeBubble(b); }]);
        addRow(b, btns);
        alertBubbles.add(b);
        if (r.gentle) armTtl(b, 30000); else if (r.kind !== 'alarm') armTtl(b, 120000);
        if (!r.gentle) { bot.setState('done'); setTimeout(() => bot.play('ring'), 300); }
      },
      ack() { for (const b of alertBubbles) removeBubble(b); alertBubbles.clear(); bot.lock(false); bot.setState('done'); },
      state(s) { bot.setState(s === 'idle' && window.NovaCore.tts.speaking() ? 'speaking' : s); },
      speaking(on) { bot.setState(on ? 'speaking' : 'idle'); },
      listening(on, dict) {
        pillState.dictating = on && !!dict; renderPill();
        bot.setState(on ? 'listening' : 'idle');
        const mic = askEl && askEl.querySelector('.mic'); if (mic) mic.classList.toggle('rec', on);
        if (on && !askEl) { listenHint = addBubble('hint', dict ? 'Dictating… say "stop dictation" to finish' : 'Listening…'); }
        if (!on && listenHint) { removeBubble(listenHint); listenHint = null; }
      },
      level(v) { bot.level(v); },
      dictated(text) { addBubble('user', '📝 ' + esc(text), { ttl: 4000 }); },
      notice(text) { addBubble('hint', esc(text), { ttl: 3500 }); },
      error(text, needSettings) {
        const b = addBubble('reply err', `<div class="body">${esc(text)}</div>`, { ttl: 9000 });
        if (needSettings) addRow(b, [['Open settings', 'primary', () => window.nova.openApp('settings')]]);
      },
      wake() { addBubble('hint', 'Yes? I\'m listening…', { ttl: 2500 }); },
      event(ev) {
        if (ev.type === 'layout') applyLayout(ev);
        else if (ev.type === 'cursor') lookAt(ev.x, ev.y);
        else if (ev.type === 'quick-ask') openAsk();
        else if (ev.type === 'quick-panel') openPanel();
        else if (ev.type === 'life') bot.play(ev.act, ev.ms);
        else if (ev.type === 'outfit') bot.setOutfit(ev.outfit);
        else if (ev.type === 'thought') { if (!isQuiet() && !stack.querySelector('.bubble.alert, .bubble.ask')) addBubble('thought', esc(ev.text), { ttl: ev.ttl || 7000, onClick: () => window.nova.openApp('home') }); }
        else if (ev.type === 'point') { bot.lock(false); bot.face(ev.dir); bot.setState('idle'); if (bot.point) bot.point(ev.dir, 5500); /* Nova points with its arm now — no bubble */ }
        else if (ev.type === 'walk') { bot.lock(false); bot.face(ev.dir); bot.setState('walking'); bot.lock(true); }
        else if (ev.type === 'walk-stop') { bot.lock(false); bot.face('right'); bot.setState('idle'); }
        else if (ev.type === 'attention') { bot.lock(false); bot.face('right'); bot.setState('attention'); bot.lock(true); if (!ev.again) sound.blip(); }
        else if (ev.type === 'busy') { busyEl.textContent = ev.count; busyEl.classList.toggle('show', ev.count > 1); }
        else if (ev.type === 'settings') loadSettings();
        else if (ev.type === 'activity') react(ev);
        else if (ev.type === 'focus') { pillState.focus = ev.state; bot.mode('focus', ev.state && ev.state.phase === 'work'); renderPill(); }
        else if (ev.type === 'dev-watch') addBubble('alert gentle', `<div class="title">File watch</div><div>${esc(ev.name)} ${esc(ev.state)}</div>`, { ttl: 9000, onClick: () => window.nova.openApp('developer') });
        else if (ev.type === 'rec') { pillState.rec = ev.on; bot.mode('rec', ev.on); renderPill(); if (ev.on) addBubble('hint', '🎙 Recording the meeting. I\'ll summarise it when you stop.', { ttl: 4000 }); }
        else if (ev.type === 'dev-clip') { const b = addBubble('reply', `<div class="title-s">Clipboard</div><div class="body">${esc(ev.label)}?</div>`, { ttl: 9000 }); addChoices(b, [{ label: ev.label, primary: true, run: ev.run }]); }
        else if (ev.type === 'away-end') { addBubble('thought', 'Still away? I turned Do Not Disturb back off. Say "I\'m back" any time.', { ttl: 8000 }); }
        else if (ev.type === 'data') { if ((ev.keys || []).some((k) => /^(events|tasks|habits|reminders|dnd|away|devMode|theme|snippets|outfit)$/.test(k))) refreshCache(); }
      }
    }
  });
  let listenHint = null;
  const alertBubbles = new Set();

  function applyLayout(ev) {
    layout = ev.layout;
    body.classList.remove('h-left', 'h-right', 'v-top', 'v-bottom');
    body.classList.add('h-' + layout.h, 'v-' + layout.v);
    document.documentElement.style.setProperty('--area', ev.area + 'px');
  }
  let lastNotice = 0, petStart = 0, lastPet = 0;
  function lookAt(x, y) {
    const r = avatarEl.getBoundingClientRect();
    const cx = r.left + r.width / 2, cy = r.top + r.height * 0.42;
    if (!bot.act) bot.look((x - cx) / 420, (y - cy) / 320);
    const now = Date.now(), dist = Math.hypot(x - cx, y - cy);
    // curiosity: notice the cursor coming close
    if (dist < 140 && dist > r.width * 0.45 && now - lastNotice > 45000 && bot.state === 'idle' && !bot.act && !isQuiet() && !reduceMotion()) {
      lastNotice = now; bot.play('notice'); setTimeout(() => bot.play('wave'), 2200);
    }
    // petting: stroke the head for a moment → Nova purrs (and sometimes swoons)
    const onHead = x > r.left + r.width * 0.2 && x < r.right - r.width * 0.2 && y > r.top && y < r.top + r.height * 0.55;
    if (onHead && !dragging) {
      if (!petStart) petStart = now;
      else if (now - petStart > 1000 && now - lastPet > 9000) {
        lastPet = now; petStart = 0; petCount++;
        bot.play(petCount % 3 === 0 ? 'heart' : petCount % 3 === 1 ? 'purr' : 'blush');
      }
    } else petStart = 0;
  }
  let petCount = 0;

  // ---------------------------------------------------------- ambient "moods": little idle behaviours by time of day
  const MOODS = {
    morning: ['stretch', 'yawn', 'wave', 'lookaround'],   // 5–11
    midday: ['lookaround', 'tilt', 'wiggle', 'hop', 'happy'], // 11–17
    evening: ['happy', 'nod', 'tilt', 'wink', 'blush'],   // 17–22
    night: ['yawn', 'goodnight', 'sniff', 'ponder']       // 22–5
  };
  function timeBand() { const h = new Date().getHours(); return h < 5 ? 'night' : h < 11 ? 'morning' : h < 17 ? 'midday' : h < 22 ? 'evening' : 'night'; }
  const reduceMotion = () => { try { return matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (e) { return false; } };
  function ambientMood() {
    if (document.hidden || isQuiet() || reduceMotion()) return;
    if (settings && settings.life && settings.life.reactions === false) return;
    if (bot.state !== 'idle' && bot.state !== 'sleep' || bot.act || dragging) return;
    if (stack.querySelector('.bubble.alert, .bubble.ask, .bubble.panel')) return;
    const pool = MOODS[timeBand()];
    const act = pool[Math.floor(Math.random() * pool.length)];
    if (act === 'wink' && bot.wink) bot.wink(); else bot.play(act);
  }
  setInterval(() => { if (Math.random() < 0.6) ambientMood(); }, 85000); // a gentle flourish every ~1–2 min

  // ---- Quiet / meeting mode: hush the avatar so it never interrupts a call or screen-share ----
  let quietUntil = 0;
  try { quietUntil = +localStorage.getItem('nova-quiet-until') || 0; } catch (e) {}
  function isQuiet() { return Date.now() < quietUntil; }
  function setQuiet(ms) {
    quietUntil = ms ? Date.now() + ms : 0;
    try { localStorage.setItem('nova-quiet-until', String(quietUntil)); } catch (e) {}
    body.classList.toggle('quiet', isQuiet());
    if (isQuiet()) { bot.setState('idle'); bot.mode('dnd', true); }
    else bot.mode('dnd', !!(settings && settings.dnd && !settings.away));
  }
  body.classList.toggle('quiet', isQuiet());
  if (isQuiet()) bot.mode('dnd', true);
  // auto-detect a likely meeting: camera or mic in use → go quiet for a bit (best-effort, permission-free)
  async function meetingWatch() {
    if (!navigator.mediaDevices || !navigator.mediaDevices.enumerateDevices) return;
    try {
      const devs = await navigator.mediaDevices.enumerateDevices();
      const liveCam = devs.some((d) => d.kind === 'videoinput' && d.label); // label populated ⇒ in use by someone
      if (liveCam && !isQuiet()) { setQuiet(30 * 60000); addBubble('hint', '🤫 Looks like you’re on a call — I’ll stay quiet. Tap me to chat.', { ttl: 5000 }); }
    } catch (e) {}
  }
  setInterval(meetingWatch, 60000);


  // ---------------------------------------------------------- quick actions (no typing, no AI)
  let panelEl = null;
  function closePanel() { if (panelEl) { removeBubble(panelEl); panelEl = null; window.nova.blurMe(); } }
  function showResult(r, section) {
    const b = addBubble('reply' + (r && r.error ? ' err' : ''), `<div class="body">${md((r && r.text) || 'Done.')}</div>`, { ttl: 5000, onClick: () => window.nova.openApp(section || 'home') });
    addSectionLink(b, section);
    if (r && r.error) bot.setState('error');
  }

  // ---------------------------------------------------------- app ↔ avatar: reactions to everything Nova does
  const REACT = {
    water_log: 'drink', water_status: 'drink', task_done: 'cheer', task_toggle: 'cheer', habit_log: 'cheer', focus_stop: 'happy',
    task_add: 'write', note_add: 'write', journal_add: 'write', expense_add: 'write', person_add: 'write', countdown_add: 'write',
    reminder: 'check', event_add: 'check', reschedule: 'check', timer: 'check', reminder_snooze: 'nod', reminder_delete: 'nod', event_delete: 'nod', task_delete: 'nod',
    undo_last: 'tilt', focus_start: 'happy', focus_break: 'stretch', outfit_set: 'happy', away: 'wave', plan_day: 'write', briefing: 'wave', greet: 'wave',
    tidy_folder: 'happy', screenshot: 'notice', doc_search: 'lookaround', search_all: 'lookaround', weather: 'lookaround', rewards_status: 'celebrate',
    dev_tool: 'type', regex_test: 'type', snippet_save: 'write', snippet_insert: 'type', snippet_copy: 'write', git_status: 'commit', open_editor: 'ship', open_terminal: 'type', dev_mode: 'magic', qr_make: 'happy', gen_secret: 'write', gen_keypair: 'write', run_command: 'type', ports_list: 'lookaround', dev_info: 'lookaround', watch_add: 'notice', workflow_run: 'ship', dev_convert: 'write'
  };
  let lastReact = 0;
  function react(ev) {
    if (settings && settings.life && settings.life.reactions === false) return;
    const now = Date.now();
    let act = REACT[ev.action];
    if (ev.action === 'greet' && /night/i.test(ev.text)) act = 'goodnight';
    if (ev.action === 'water_log' && /goal reached/i.test(ev.text)) act = 'celebrate';
    if ((ev.action === 'task_done' || ev.action === 'task_toggle') && /all .*done|cleared|inbox zero|nothing left/i.test(ev.text || '')) act = 'celebrate';
    if (ev.action === 'away' && /welcome back/i.test(ev.text)) act = 'happy';
    if (!act || now - lastReact < 500) return;
    lastReact = now;
    setTimeout(() => { if (!bot.play(act)) setTimeout(() => bot.play(act), 900); }, 150);
    // app buttons don't produce a chat reply, so echo a short line on the avatar
    if (ev.ui && echoOn() && Date.now() - lastSelf > 2500 && !stack.querySelector('.bubble.panel, .bubble.ask')) {
      const t = String(ev.text || '').replace(/[*_`]/g, '');
      if (t && t.length < 140) addBubble('hint', esc(t), { ttl: 3200, onClick: () => window.nova.openApp(ev.section || 'home') });
    }
  }

  // ---------------------------------------------------------- live cache (tasks, events, habits) for panel / pill / alerts
  const cache = { tasks: [], events: [], habits: [], reminders: [] };
  async function refreshCache() {
    try {
      const st = await window.nova.state();
      Object.assign(cache, { tasks: st.tasks || [], events: st.events || [], habits: st.habits || [], reminders: st.reminders || [] });
      settings = st.settings;
      pillState.focus = st.focusState; pillState.rec = !!(st.status && st.status.recording);
      bot.mode('focus', st.focusState && st.focusState.phase === 'work'); bot.mode('rec', pillState.rec);
      bot.mode('dnd', !!settings.dnd && !settings.away); bot.mode('away', !!settings.away);
      applyDev(); renderPill();
      if (panelEl && panelEl.__tab && panelEl.__tab !== 'actions') renderTab(panelEl.__tab);
    } catch (e) {}
  }
  const norm = (x) => String(x || '').toLowerCase().replace(/[^a-z0-9 ]/g, ' ').split(/\s+/).filter((w) => w.length > 2);
  function simil(a, b) { const A = norm(a), B = new Set(norm(b)); if (!A.length || !B.size) return false; const hit = A.filter((w) => B.has(w)).length; return hit / A.length >= 0.6 || hit >= 3; }

  // ---------------------------------------------------------- status pill above the avatar
  const pillState = { focus: null, rec: false, dictating: false };
  const pillEl = document.createElement('div'); pillEl.id = 'pill'; pillEl.className = 'hit'; avatarEl.appendChild(pillEl);
  pillEl.addEventListener('pointerdown', (e) => e.stopPropagation());
  pillEl.addEventListener('click', (e) => { e.stopPropagation(); if (pillEl.__sec) window.nova.openApp(pillEl.__sec); });
  const mmss = (ms) => { const t = Math.max(0, Math.round(ms / 1000)); return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`; };
  function renderPill() {
    if (settings && settings.life && settings.life.pill === false) { pillEl.className = 'hit'; body.classList.remove('pill-on'); return; }
    const now = Date.now(), f = pillState.focus;
    let txt = '', cls = '', sec = '';
    if (pillState.rec) { txt = '● REC'; cls = 'rec'; sec = 'meetings'; }
    else if (pillState.dictating) { txt = '✎ Dictating'; cls = 'dict'; }
    else if (f && f.phase !== 'idle') { const left = f.paused ? f.remaining : f.endsAt - now; txt = `${f.phase === 'work' ? '🎯' : '☕'} ${mmss(left)}${f.paused ? ' ⏸' : ''}`; cls = f.phase === 'work' ? 'focus' : 'brk'; sec = 'focus'; }
    else if (settings && settings.away) { txt = `🍱 ${settings.away.reason || 'away'}`; cls = 'dnd'; }
    else {
      const ev = (cache.events || []).filter((e) => !e.allDay && e.start > now - 5 * 60000 && e.start - now < 15 * 60000).sort((a, b) => a.start - b.start)[0];
      if (ev) { const m = Math.round((ev.start - now) / 60000); txt = `📅 ${m > 0 ? 'in ' + m + 'm' : 'now'} · ${ev.title.slice(0, 16)}`; cls = 'soon'; sec = 'calendar'; }
      else if (settings && settings.dnd) { txt = '🔕 DND'; cls = 'dnd'; sec = 'settings'; }
    }
    pillEl.textContent = txt; pillEl.className = 'hit' + (txt ? ' show ' + cls : ''); pillEl.__sec = sec; body.classList.toggle('pill-on', !!txt);
  }
  setInterval(renderPill, 1000);
  setInterval(refreshCache, 60000);
  async function act(name, args) { const r = await nact(name, args); showResult(r); return r; }
  function chipRow(chips, onPick) {
    return `<div class="chips-q">${chips.map((c, i) => `<button data-ci="${i}">${esc(c[0])}</button>`).join('')}</div>`;
  }
  function wireChips(el, chips, onPick) { el.querySelectorAll('[data-ci]').forEach((b) => (b.onclick = (e) => { e.stopPropagation(); onPick(chips[+b.dataset.ci]); })); }
  function form(title, html, wire) {
    closePanel();
    panelEl = addBubble('panel', `<div class="ptitle">${title}<button class="px" title="Close">✕</button></div>${html}`);
    panelEl.querySelector('.px').onclick = closePanel;
    wire(panelEl);
    window.nova.focusMe();
    const inp = panelEl.querySelector('input'); if (inp) setTimeout(() => inp.focus(), 40);
  }
  async function openPanel() {
    if (panelEl) return closePanel();
    closeAsk();
    const st = await window.nova.state();
    const wh = (st.habits || []).find((h) => /water|hydrat|drink/i.test(h.name));
    const k = (() => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; })();
    const wn = wh ? ((wh.log || {})[k] || 0) : 0, wt = wh ? wh.target || 8 : 8;
    const focusing = st.focusState && st.focusState.phase !== 'idle';
    const items = [
      ['💧', `Water ${wn}/${wt}`, 'water'], ['🔔', 'Remind me', 'remind'], ['⏱', 'Timer', 'timer'], ['🎯', focusing ? 'Stop focus' : 'Focus', 'focus'],
      ['✅', 'Add task', 'task'], ['📝', 'Note', 'note'], ['🎙', 'Talk', 'talk'], [isQuiet() ? '🔔' : '🤫', isQuiet() ? 'Un-quiet' : 'Quiet 1h', 'quiet']
    ];
    Object.assign(cache, { tasks: st.tasks || [], events: st.events || [], habits: st.habits || [], reminders: st.reminders || [] });
    panelEl = addBubble('panel', `<div class="ptabs"><button data-tab="actions" class="on">Actions</button><button data-tab="today">Today</button><button data-tab="habits">Habits</button><button data-tab="tricks">Tricks</button><button class="px" title="Close">✕</button></div><div class="tabbody"><div class="qgrid">${items.map(([i, l, k2]) => `<button data-q="${k2}"><span>${i}</span>${esc(l)}</button>`).join('')}</div></div><div class="pfoot"><button class="linkish" data-q="app">Open Nova ›</button><button class="linkish" data-q="ask">Type a command ›</button></div>`);
    panelEl.__tab = 'actions'; panelEl.__actions = panelEl.querySelector('.tabbody').innerHTML;
    panelEl.querySelector('.px').onclick = closePanel;
    panelEl.querySelectorAll('[data-tab]').forEach((t) => (t.onclick = (e) => { e.stopPropagation(); renderTab(t.dataset.tab); }));
    window.nova.focusMe();
    wireActions();
  }
  function renderTab(tab) {
    if (!panelEl) return;
    panelEl.__tab = tab;
    panelEl.querySelectorAll('[data-tab]').forEach((t) => t.classList.toggle('on', t.dataset.tab === tab));
    const body = panelEl.querySelector('.tabbody');
    const foot = panelEl.querySelector('.pfoot [data-q="app"]');
    if (tab === 'actions') { body.innerHTML = panelEl.__actions; foot.textContent = 'Open Nova ›'; foot.dataset.sec = 'home'; wireActions(); return; }
    if (tab === 'tricks') {
      const tricks = [
        ['👋', 'Wave', 'wave'], ['😄', 'Laugh', 'laugh'], ['💃', 'Dance', 'dance'], ['🤸', 'Backflip', 'backflip'],
        ['🌀', 'Spin', 'spin'], ['🤹', 'Juggle', 'juggle'], ['✨', 'Magic', 'magic'], ['🖐', 'High-five', 'highfive'],
        ['👍', 'Nice!', 'thumbsup'], ['😍', 'Love', 'heart'], ['🤷', 'Shrug', 'shrug'], ['😉', 'Wink', 'wink'],
        ['🧘', 'Meditate', 'meditate'], ['🤧', 'Sneeze', 'sneeze'], ['🥶', 'Shiver', 'shiver'], ['🎉', 'Celebrate', 'celebrate']
      ];
      const skins = [['Cream', 'cream'], ['Mint', 'mint'], ['Berry', 'berry'], ['Sky', 'sky']];
      const cur = (() => { try { return localStorage.getItem('nova-skin') || 'cream'; } catch (e) { return 'cream'; } })();
      body.innerHTML = `<div class="qgrid tricks">${tricks.map(([i, l, a]) => `<button data-trick="${a}"><span>${i}</span>${esc(l)}</button>`).join('')}</div>
        <div class="sub">Colour</div><div class="skins">${skins.map(([l, s]) => `<button data-skin="${s}" class="${s === cur ? 'on' : ''}">${esc(l)}</button>`).join('')}</div>`;
      body.querySelectorAll('[data-trick]').forEach((b) => (b.onclick = (e) => {
        e.stopPropagation();
        const a = b.dataset.trick;
        if (a === 'wink' && bot.wink) bot.wink(); else { bot.setState('idle'); bot.play(a); }
      }));
      body.querySelectorAll('[data-skin]').forEach((b) => (b.onclick = (e) => {
        e.stopPropagation(); setSkin(b.dataset.skin);
        body.querySelectorAll('[data-skin]').forEach((x) => x.classList.toggle('on', x === b));
        bot.setState('idle'); bot.play('happy');
      }));
      foot.textContent = 'Open Nova ›'; foot.dataset.sec = 'home';
      return;
    }
    const now = new Date(), end = new Date(); end.setHours(23, 59, 59, 999);
    const fmt = (ts) => new Date(ts).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
    if (tab === 'today') {
      const items = [];
      (cache.events || []).filter((e) => e.end >= +now && e.start <= +end).forEach((e) => items.push({ at: e.start, html: `<div class="li"><span class="ic">📅</span><span class="tx">${esc(e.title)}</span><span class="wh">${e.allDay ? 'all day' : fmt(e.start)}</span></div>` }));
      (cache.reminders || []).filter((r) => r.at <= +end && r.kind !== 'timer').slice(0, 6).forEach((r) => items.push({ at: r.at, html: `<div class="li"><span class="ic">${r.kind === 'alarm' ? '⏰' : '🔔'}</span><span class="tx">${esc(r.text)}</span><span class="wh">${fmt(r.at)}</span></div>` }));
      items.sort((a, b) => a.at - b.at);
      const order = { high: 0, normal: 1, low: 2 };
      const tasks = (cache.tasks || []).filter((t) => !t.done).sort((a, b) => (order[a.priority] - order[b.priority]) || ((a.due || 9e15) - (b.due || 9e15))).slice(0, 7);
      body.innerHTML = `<div class="sub">Schedule</div>${items.slice(0, 6).map((i) => i.html).join('') || '<div class="empty">Nothing else today 🎉</div>'}
        <div class="sub">Tasks</div>${tasks.map((t) => `<label class="li task"><input type="checkbox" data-task="${t.id}"><span class="tx">${t.priority === 'high' ? '❗' : ''}${esc(t.text)}</span>${t.due ? `<span class="wh">${new Date(t.due) <= end ? fmt(t.due) : new Date(t.due).toLocaleDateString([], { day: 'numeric', month: 'short' })}</span>` : ''}</label>`).join('') || '<div class="empty">No open tasks</div>'}
        <div class="addline"><input placeholder="+ Add a task (press Enter)"></div>`;
      body.querySelectorAll('[data-task]').forEach((c) => (c.onchange = async () => { c.closest('.li').classList.add('doneli'); const r = await nact('task_toggle', { id: c.dataset.task }); setTimeout(refreshCache, 400); if (r.error) showResult(r); }));
      const inp = body.querySelector('.addline input');
      inp.addEventListener('keydown', async (e) => { if (e.key === 'Enter' && inp.value.trim()) { const v = inp.value.trim(); inp.value = ''; await nact('task_add', { text: v }); setTimeout(refreshCache, 300); } });
      foot.textContent = 'Open Tasks ›'; foot.dataset.sec = 'tasks';
    } else if (tab === 'habits') {
      const k = (() => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; })();
      const hs = cache.habits || [];
      body.innerHTML = hs.length ? hs.map((h) => { const n = (h.log || {})[k] || 0, tg = h.target || 1, pct = Math.min(100, Math.round(n / tg * 100)); return `<div class="li hb"><span class="ic">${esc(h.icon || '⭐')}</span><span class="tx">${esc(h.name)}<span class="bar"><i style="width:${pct}%"></i></span></span><span class="wh">${n}/${tg}</span><button class="plus" data-hab="${h.id}" title="Log one">+</button></div>`; }).join('') : '<div class="empty">No habits yet. Try "add habit read 20 minutes".</div>';
      body.querySelectorAll('[data-hab]').forEach((b) => (b.onclick = async (e) => {
        e.stopPropagation(); const h = hs.find((x) => x.id === b.dataset.hab);
        const r = /water|hydrat|drink/i.test(h.name) ? await nact('water_log', { glasses: 1 }) : await nact('habit_log', { id: h.id });
        if (r.error) showResult(r); setTimeout(refreshCache, 300);
      }));
      foot.textContent = 'Open Habits ›'; foot.dataset.sec = 'habits';
    }
  }
  function wireActions() {
    const st = { focusState: pillState.focus };
    const focusing = st.focusState && st.focusState.phase !== 'idle';
    panelEl.querySelectorAll('[data-q]').forEach((b) => (b.onclick = async (e) => {
      e.stopPropagation();
      const q = b.dataset.q;
      if (q === 'water') { closePanel(); const r = await nact('water_log', { glasses: 1 }); showResult(r, 'habits'); }
      else if (q === 'remind') remindForm();
      else if (q === 'timer') { const chips = [['5 min', 5], ['10 min', 10], ['15 min', 15], ['25 min', 25], ['45 min', 45], ['1 hour', 60]]; form('⏱ Timer', `<input placeholder="Label (optional)">${chipRow(chips)}`, (el) => wireChips(el, chips, (c) => { const label = el.querySelector('input').value.trim(); closePanel(); act('timer', { ms: c[1] * 60000, label }); })); }
      else if (q === 'focus') {
        if (focusing) { closePanel(); act('focus_stop', {}); }
        else { const chips = [['15 min', 15], ['25 min', 25], ['45 min', 45], ['60 min', 60]]; form('🎯 Focus session', `<input placeholder="What are you working on? (optional)">${chipRow(chips)}`, (el) => wireChips(el, chips, (c) => { const label = el.querySelector('input').value.trim(); closePanel(); act('focus_start', { minutes: c[1], label }); })); }
      }
      else if (q === 'task') taskForm();
      else if (q === 'note') form('📝 Quick note', `<input placeholder="Type your note and press Enter">`, (el) => { const i = el.querySelector('input'); i.addEventListener('keydown', (ev) => { if (ev.key === 'Enter' && i.value.trim()) { const v = i.value.trim(); closePanel(); act('note_add', { text: v }); } if (ev.key === 'Escape') closePanel(); }); });
      else if (q === 'talk') { closePanel(); session.toggleListen(); }
      else if (q === 'shot') { closePanel(); setTimeout(() => window.nova.input('screenshot'), 250); }
      else if (q === 'quiet') { const on = !isQuiet(); setQuiet(on ? 3600000 : 0); closePanel(); showResult({ text: on ? '🤫 Quiet for an hour — I’ll hold notifications and stay still. Tap me if you need me.' : '🔔 Back to normal.' }); }
      else if (q === 'app') { const sec = b.dataset.sec || 'home'; closePanel(); window.nova.openApp(sec); }
      else if (q === 'ask') { closePanel(); openAsk(); }
    }));
  }
  function remindForm() {
    const at = (h, m, addDay) => { const d = new Date(); if (addDay) d.setDate(d.getDate() + 1); d.setHours(h, m, 0, 0); if (!addDay && d <= new Date()) d.setDate(d.getDate() + 1); return d.toISOString(); };
    const chips = [['in 10 min', { inMs: 600000 }], ['in 30 min', { inMs: 1800000 }], ['in 1 hour', { inMs: 3600000 }], ['Today 5 PM', { at: at(17, 0) }], ['Tonight 8 PM', { at: at(20, 0) }], ['Tomorrow 9 AM', { at: at(9, 0, true) }]];
    form('🔔 Remind me', `<input placeholder="What should I remind you about?">${chipRow(chips)}<div class="prow"><input type="datetime-local" class="dt"><button class="primary" data-set>Set</button></div>`, (el) => {
      const what = () => el.querySelector('input').value.trim() || 'Reminder';
      wireChips(el, chips, (c) => { const t = what(); closePanel(); act('reminder', { text: t, ...c[1] }); });
      el.querySelector('[data-set]').onclick = (e) => { e.stopPropagation(); const v = el.querySelector('.dt').value; if (!v) return; const t = what(); closePanel(); act('reminder', { text: t, at: new Date(v).toISOString() }); };
      el.querySelector('input').addEventListener('keydown', (ev) => { if (ev.key === 'Enter') { const v = ev.target.value.trim(); if (v) { closePanel(); window.nova.input('remind me ' + (/^to\b/i.test(v) ? '' : 'to ') + v); } } });
    });
  }
  function taskForm() {
    const day = (n) => { const d = new Date(); d.setDate(d.getDate() + n); d.setHours(18, 0, 0, 0); return d.toISOString(); };
    const fri = (() => { const d = new Date(); d.setDate(d.getDate() + ((5 - d.getDay() + 7) % 7 || 7)); d.setHours(18, 0, 0, 0); return d.toISOString(); })();
    const chips = [['Today', day(0)], ['Tomorrow', day(1)], ['By Friday', fri], ['No date', null], ['❗ Urgent today', 'urgent']];
    form('✅ Add task', `<input placeholder="What needs doing?">${chipRow(chips)}`, (el) => {
      wireChips(el, chips, (c) => { const t = el.querySelector('input').value.trim(); if (!t) return el.querySelector('input').focus(); closePanel(); act('task_add', c[1] === 'urgent' ? { text: t, due: day(0), priority: 'high' } : { text: t, due: c[1] || undefined }); });
      el.querySelector('input').addEventListener('keydown', (ev) => { if (ev.key === 'Enter' && ev.target.value.trim()) { const t = ev.target.value.trim(); closePanel(); act('task_add', { text: t }); } });
    });
  }

  // ---------------------------------------------------------- avatar interactions
  let dragging = false, clickTimer = null;
  avatarEl.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return;
    dragging = true;
    avatarEl.setPointerCapture(e.pointerId);
    window.nova.dragStart();
  });
  avatarEl.addEventListener('pointerup', async () => {
    if (!dragging) return;
    dragging = false;
    const moved = await window.nova.dragEnd();
    if (moved) return;
    if (bot.state === 'attention' || bot.state === 'walking' && alertBubbles.size) { window.nova.ack(); return; }
    if (window.NovaCore.tts.speaking()) { session.stopAll(); bot.setState('idle'); return; }
    if (clickTimer) { clearTimeout(clickTimer); clickTimer = null; window.nova.openApp('chat'); return; } // double-click
    clickTimer = setTimeout(() => { clickTimer = null; askEl ? closeAsk() : openAsk(); }, 230);
  });
  avatarEl.addEventListener('contextmenu', (e) => { e.preventDefault(); openPanel(); }); // right-click = quick actions
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') { session.stopAll(); closeAsk(); closePanel(); } });

  // ---------------------------------------------------------- drag & drop onto the avatar (text, links, files)
  let dropHint = null;
  const isDrag = (e) => e.dataTransfer && [...(e.dataTransfer.types || [])].some((t) => /files|text\/plain|text\/uri-list/i.test(t));
  avatarEl.addEventListener('dragenter', (e) => { if (!isDrag(e)) return; e.preventDefault(); setHit(true); avatarEl.classList.add('drop'); bot.play('notice'); if (!dropHint) dropHint = addBubble('hint', 'Drop it on me 📥', { ttl: 4000 }); });
  avatarEl.addEventListener('dragover', (e) => { if (!isDrag(e)) return; e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; });
  avatarEl.addEventListener('dragleave', (e) => { if (avatarEl.contains(e.relatedTarget)) return; avatarEl.classList.remove('drop'); if (dropHint) { removeBubble(dropHint); dropHint = null; } setHit(false); });
  avatarEl.addEventListener('drop', (e) => {
    e.preventDefault(); avatarEl.classList.remove('drop'); if (dropHint) { removeBubble(dropHint); dropHint = null; }
    const files = [...(e.dataTransfer.files || [])].map((f) => ({ name: f.name, path: window.nova.pathForFile(f) })).filter((f) => f.path);
    const text = (e.dataTransfer.getData('text/plain') || e.dataTransfer.getData('text/uri-list') || '').trim();
    bot.play('happy');
    if (files.length) return onDropFiles(files);
    if (text) return onDropText(text);
  });
  function onDropText(text) {
    const one = text.replace(/\s+/g, ' ').trim(), short = one.length > 90 ? one.slice(0, 87) + '…' : one;
    const url = /^https?:\/\/\S+$/i.test(one) ? one : '';
    const b = addBubble('reply', `<div class="title-s">📥 Got it</div><div class="body">${esc(short)}</div>`, { ttl: 30000 });
    const done = (r, sec) => { removeBubble(b); showResult(r, sec); };
    const ch = url ? [
      { label: '🌐 Open', fn: () => { removeBubble(b); window.nova.openPath(url); } },
      { label: '⭐ Save as shortcut', fn: async () => done(await nact('shortcut_add', { name: (url.replace(/^https?:\/\/(www\.)?/, '').split(/[/?#]/)[0]).slice(0, 40), target: url }), 'shortcuts') },
      { label: '✅ Read later (task)', fn: async () => done(await nact('task_add', { text: 'Read ' + url }), 'tasks') },
      { label: '📝 Note', fn: async () => done(await nact('note_add', { text: url }), 'notes') }
    ] : [
      { label: '✅ Task', primary: true, fn: async () => done(await nact('task_add', { text: one.slice(0, 200) }), 'tasks') },
      { label: '📝 Note', fn: async () => done(await nact('note_add', { text }), 'notes') },
      { label: '🔔 Remind in 1h', fn: async () => done(await nact('reminder', { text: one.slice(0, 200), inMs: 3600000 }), 'reminders') },
      { label: '🔎 Search', fn: () => { removeBubble(b); window.nova.input('look for ' + one.slice(0, 80), { choice: true }); } },
      { label: '💬 Ask about it', fn: () => { removeBubble(b); window.nova.input((settings && settings.aiEnabled ? 'Explain this: ' : 'note ') + text.slice(0, 4000)); } }
    ];
    addChoices(b, ch);
  }
  function onDropFiles(files) {
    const list = files.slice(0, 5), names = list.map((f) => f.name).join(', ');
    const b = addBubble('reply', `<div class="title-s">📥 ${list.length === 1 ? 'File' : list.length + ' files'}</div><div class="body">${esc(names.length > 90 ? names.slice(0, 87) + '…' : names)}</div>`, { ttl: 30000 });
    const done = (r, sec) => { removeBubble(b); showResult(r, sec); };
    addChoices(b, [
      { label: '📂 Open', fn: () => { removeBubble(b); list.forEach((f) => window.nova.openPath(f.path)); } },
      { label: '⭐ Pin as shortcut', fn: async () => { let r; for (const f of list) r = await nact('shortcut_add', { name: f.name.replace(/\.[^.]+$/, ''), target: f.path }); done(r, 'shortcuts'); } },
      { label: '✅ Review task', fn: async () => { let r; for (const f of list) r = await nact('task_add', { text: 'Review ' + f.name }); done(r, 'tasks'); } },
      { label: '📝 Note paths', fn: async () => done(await nact('note_add', { text: list.map((f) => '📎 ' + f.path).join('\n') }), 'notes') },
      { label: '🔔 Remind me 1h', fn: async () => done(await nact('reminder', { text: 'Look at ' + names.slice(0, 120), inMs: 3600000 }), 'reminders') }
    ]);
  }

  async function loadSettings() {
    const st = await window.nova.state();
    settings = st.settings;
    session.setSettings(settings);
    bot.setOutfit(settings.outfit || {});
    applyDev();
  }
  loadSettings().then(refreshCache).then(() => new Promise((r) => setTimeout(r, 700))).then(() => {
    if (alertBubbles.size) return; // spawned for a reminder: skip the greeting
    const h = new Date().getHours();
    const hi = h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
    addBubble('reply', `${hi}${settings.userName ? ', ' + esc(settings.userName) : ''}! Click me to ask · right-click for quick actions (water, reminders, timers…).`, { ttl: 7000, onClick: openAsk });
    bot.setState('done');
  });
})();
