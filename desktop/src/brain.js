// Nova's brain: shared by the main app and the desktop companion.
// Runs requests concurrently, plans compound commands, drives the AI agent loop,
// and keeps one shared conversation that every window renders.
const { screen, clipboard, desktopCapturer, Notification } = require('electron');
const store = require('./store');
const ps = require('./ps');
const commands = require('./commands');
const ai = require('./ai');
const scheduler = require('./scheduler');

let io = { broadcast: () => {}, windows: () => [], speaker: () => 'app', focusedNova: () => false, icon: null, showAlert: () => {}, pointAt: () => {} };
function init(hooks) { io = { ...io, ...hooks }; }
const send = (ev) => io.broadcast(ev);

// ------------------------------------------------------------ target window tracking
let target = null; // last real app window the user was in { hwnd, pid, proc, title }
function parseWinInfo(line) {
  const [h, pid, proc, ...rest] = String(line || '').trim().split('|');
  if (!h || h === '0') return null;
  return { hwnd: h, pid: +pid, proc, title: rest.join('|') };
}
function setTarget(line) { const t = parseWinInfo(line); if (t && t.pid !== process.pid) target = t; }
let pollBusy = false;
function pollForeground() {
  if (pollBusy || process.platform !== 'win32' || ps.current || ps.queue.length) return;
  pollBusy = true;
  ps.run('[NovaInput]::Fg()', 2000).then((out) => {
    const t = parseWinInfo(out);
    if (t && t.pid !== process.pid && t.title && t.title !== 'Program Manager') target = t;
    if (io.onForeground) io.onForeground(t && t.pid !== process.pid ? t : null);
  }).catch(() => {}).finally(() => { pollBusy = false; });
}
const describeTarget = () => (target ? `"${target.title || '(untitled)'}" (${target.proc})` : 'unknown');

// ------------------------------------------------------------ screen capture
let lastShot = null;
async function hideForCapture(hide) {
  for (const w of io.windows()) {
    if (!w || w.isDestroyed() || !w.isVisible()) continue;
    if (hide) { w.__op = w.getOpacity(); w.setOpacity(0); } else w.setOpacity(w.__op || 1);
  }
  if (hide) await new Promise((r) => setTimeout(r, 90));
}
async function captureForAI() {
  const cursor = screen.getCursorScreenPoint();
  const display = screen.getDisplayNearestPoint(cursor);
  const phys = { width: Math.round(display.size.width * display.scaleFactor), height: Math.round(display.size.height * display.scaleFactor) };
  await hideForCapture(true);
  let sources;
  try { sources = await desktopCapturer.getSources({ types: ['screen'], thumbnailSize: phys }); }
  finally { await hideForCapture(false); }
  const src = sources.find((s) => String(s.display_id) === String(display.id)) || sources[0];
  if (!src) throw new Error('Screen capture failed');
  let img = src.thumbnail;
  lastNative = img;
  if (img.getSize().width > 1568) img = img.resize({ width: 1568, quality: 'good' });
  const sz = img.getSize();
  lastShot = { b64: img.toJPEG(72).toString('base64'), w: sz.width, h: sz.height, display };
  return lastShot;
}
// Full-screen OCR — lets "what's on my screen" work even with no AI connected (offline Windows OCR).
let lastNative = null;
const ocr = require('./ocr');
async function ocrScreen() {
  if (!lastNative) await captureForAI();
  if (!lastNative) throw new Error('Screen capture failed');
  return ocr.ocrImage(ps, lastNative);
}
function toPhysical(p) { try { return screen.dipToScreenPoint ? screen.dipToScreenPoint(p) : p; } catch (e) { return p; } }
async function resolvePoint({ x, y, to, dx, dy, absolute }) {
  if (to) {
    const d = screen.getDisplayNearestPoint(screen.getCursorScreenPoint()).bounds;
    const m = 40;
    const X = { left: d.x + m, center: d.x + d.width / 2, right: d.x + d.width - m };
    const Y = { top: d.y + m, center: d.y + d.height / 2, bottom: d.y + d.height - m };
    const parts = to.split(' ');
    const h = parts.find((p) => X[p] != null && p !== 'center') || 'center';
    const v = parts.find((p) => Y[p] != null && p !== 'center') || 'center';
    const p = toPhysical({ x: Math.round(X[h]), y: Math.round(Y[v]) });
    return { x: Math.round(p.x), y: Math.round(p.y) };
  }
  if (dx != null || dy != null) {
    const [cx, cy] = (await ps.run('[NovaInput]::Pos()')).trim().split(',').map(Number);
    return { x: cx + (Number(dx) || 0), y: cy + (Number(dy) || 0) };
  }
  if (absolute || !lastShot) return { x: Math.round(Number(x)), y: Math.round(Number(y)) };
  const b = lastShot.display.bounds;
  const p = toPhysical({ x: Math.round(b.x + (Number(x) / lastShot.w) * b.width), y: Math.round(b.y + (Number(y) / lastShot.h) * b.height) });
  return { x: Math.round(p.x), y: Math.round(p.y) };
}
async function focusTarget() {
  if (!io.focusedNova()) return null;
  if (target) {
    const ok = (await ps.run(`[NovaInput]::Focus(${target.hwnd})`)).trim();
    await new Promise((r) => setTimeout(r, 90));
    if (/true/i.test(ok)) return target.proc;
  }
  for (const w of io.windows()) if (w && !w.isDestroyed() && w.isFocused()) w.blur();
  await new Promise((r) => setTimeout(r, 120));
  return target ? target.proc : null;
}
async function clickThrough(fn) {
  const ws = io.windows().filter((w) => w && !w.isDestroyed() && w.isVisible());
  ws.forEach((w) => w.setIgnoreMouseEvents(true));
  try { return await fn(); } finally { setTimeout(() => ws.forEach((w) => !w.isDestroyed() && w.setIgnoreMouseEvents(w.__ignore || false, w.__ignore ? { forward: true } : undefined)), 150); }
}

function onModelChange(p, m) {
  store.set({ models: { [p]: m } });
  send({ type: 'status', text: `switched ${p} model to ${m}` });
}

// ------------------------------------------------------------ context for actions
const focus = require('./focus');
let suppressedClip = '';
const stopwatch = {
  running: false, acc: 0, since: 0,
  start() { if (!this.running) { this.running = true; this.since = Date.now(); } },
  stop() { if (this.running) { this.acc += Date.now() - this.since; this.running = false; } },
  reset() { this.running = false; this.acc = 0; },
  elapsed() { return this.acc + (this.running ? Date.now() - this.since : 0); }
};
const ctx = {
  ps, store, scheduler, focus, focusTarget, stopwatch,
  suppressClip: (t) => { suppressedClip = t; }, clickThrough, resolvePoint, setTarget, hideForCapture,
  lastFired: null,
  runRoutine: (name) => runRoutine(name)
};

// ------------------------------------------------------------ conversation
let history = [];
function pushHistory(role, content) {
  history.push({ role, content: String(content || '').slice(0, 4000) });
  if (history.length > 16) history = history.slice(-16);
  while (history.length && history[0].role !== 'user') history.shift();
}
function addMessage(msg) {
  const m = { id: msg.id || store.uid('m'), t: Date.now(), ...msg };
  const list = store.get().messages.concat([m]).slice(-300);
  store.set({ messages: list });
  return m;
}
function clearConversation() { history = []; pendingConfirm = null; store.set({ messages: [] }); send({ type: 'cleared' }); }

// ------------------------------------------------------------ request handling
const YES = /^(yes|y|yeah|yep|yup|sure|ok|okay|do it|go ahead|confirm|haan|ha)\b/i;
const NO = /^(no|n|nope|cancel|don'?t|nah|never ?mind)\b/i;
const STOP = /^(stop|stop it|stop everything|cancel( that| everything)?|abort|be quiet|shut up|quiet|silence)$/i;
const SCREEN_HINT = /\b(screen|on my (screen|monitor)|what am i (looking at|seeing|doing)|look at (this|that|it|my)|see (this|that)|read (this|that|it)|this (page|window|error|code|email|mail|document|doc|file|table|sheet|screen|chart|image|message|dialog|popup|form|field|report|tab)|explain this|summari[sz]e this|translate this|fix this|what does this|help me with this|what('?s| is) this|click (on )?(the )?\w+|press the \w+ button|fill (in|out) (this|the)|where is the)\b/i;

let pendingConfirm = null;
const jobs = new Map(); // id -> AbortController
let seq = 0;

/** Entry point from any window. opts: { source:'app'|'companion', byVoice } */
async function handleInput(text, opts = {}) {
  text = String(text || '').trim();
  if (!text) return;
  const id = 'j' + (++seq) + Date.now().toString(36);
  const t0 = Date.now();
  const userMsg = addMessage({ role: 'user', text, meta: { source: opts.source, byVoice: !!opts.byVoice } });
  send({ type: 'message', msg: userMsg });
  send({ type: 'job', phase: 'start', id, text, at: t0 });

  if (STOP.test(text)) {
    for (const c of jobs.values()) c.abort();
    jobs.clear();
    pendingConfirm = null;
    send({ type: 'stop-speech' });
    return post(id, { text: 'Stopped.' }, t0, text, opts);
  }

  if (pendingConfirm) {
    const p = pendingConfirm; pendingConfirm = null;
    if (YES.test(text)) return post(id, p.run ? await run(p.run, { id, opts }) : await commands.runAction(p.name, p.args, ctx, true), t0, text, opts);
    if (NO.test(text)) return post(id, { text: 'Okay, cancelled.' }, t0, text, opts);
  }

  const ctl = new AbortController();
  jobs.set(id, ctl);
  send({ type: 'busy', count: jobs.size });
  try {
    const res = await run(text, { id, signal: ctl.signal, opts });
    if (ctl.signal.aborted) return;
    post(id, res, t0, text, opts);
  } catch (e) {
    if (!ctl.signal.aborted) post(id, { text: friendlyError(e), error: true, streamed: true }, t0, text, opts);
  } finally {
    jobs.delete(id);
    send({ type: 'busy', count: jobs.size });
  }
}

// Which app section shows the result of an action (for "Open ›" links in app + avatar).
const SECTION = { reading_add: 'reading', reading_list: 'reading', reading_read: 'reading', reading_delete: 'reading', checklist_create: 'checklists', checklist_list: 'checklists', checklist_reset: 'checklists', checklist_check: 'checklists', checklist_delete: 'checklists', weekly_review: 'review', dev_tool: 'developer', regex_test: 'developer', snippet_save: 'developer', snippet_insert: 'developer', snippet_list: 'developer', snippet_copy: 'developer', snippet_delete: 'developer', git_status: 'developer', qr_make: 'developer', gen_secret: 'developer', gen_keypair: 'developer', run_command: 'developer', ports_list: 'developer', kill_port: 'developer', kill_pid: 'developer', dev_info: 'developer', watch_add: 'developer', workflow_run: 'developer', dev_convert: 'developer', dev_mode: 'settings', reminder: 'reminders', reminder_list: 'reminders', reminder_delete: 'reminders', reminder_snooze: 'reminders', timer: 'reminders', task_add: 'tasks', task_done: 'tasks', task_list: 'tasks', task_delete: 'tasks', note_add: 'notes', notes_list: 'notes', event_add: 'calendar', event_delete: 'calendar', reschedule: 'calendar', agenda: 'calendar', expense_add: 'money', expense_summary: 'money', water_log: 'habits', water_status: 'habits', habit_log: 'habits', habit_add: 'habits', habit_list: 'habits', focus_start: 'focus', focus_status: 'focus', journal_add: 'journal', person_add: 'people', birthdays_upcoming: 'people', countdown_add: 'tools', doc_search: 'documents', usage_report: 'usage', rewards_status: 'rewards', plan_day: 'home', clipboard_history: 'clipboard', meeting_record: 'meetings', automation_run: 'automations', wellbeing_every: 'focus' };
const CREATES = /^(reminder|task_add|note_add|event_add|expense_add|journal_add|countdown_add|person_add|habit_add|reschedule|task_done|reading_add|checklist_create)$/;
// human-readable label for a running action (for the live activity panel)
function jobLabel(name, args) {
  args = args || {};
  const nm = (args.name || args.app || args.query || args.title || args.text || '').toString().slice(0, 40);
  const map = {
    open_app: `Opening ${nm || 'an app'}`, close_app: `Closing ${nm}`, open_url: `Opening ${(args.url || '').slice(0, 40)}`,
    web_search: `Searching ${args.site === 'youtube' ? 'YouTube' : 'the web'} for "${nm}"`, open_folder: `Opening ${args.folder || 'folder'}`,
    screen_look: 'Looking at your screen', point_at: 'Pointing at it', type_text: 'Typing…', press_keys: `Pressing ${args.keys || 'keys'}`,
    mouse_click: 'Clicking', focus_window: `Switching to ${args.title || 'a window'}`, screenshot: 'Taking a screenshot',
    run_command: `Running: ${(args.cmd || '').slice(0, 40)}`, http_request: `${args.method || 'GET'} ${(args.url || '').slice(0, 40)}`,
    volume_set: 'Setting volume', volume_change: 'Changing volume', mute: 'Muting', media: 'Media control',
    reminder: 'Setting a reminder', task_add: 'Adding a task', note_add: 'Saving a note', event_add: 'Adding an event',
    web_open: 'Opening a page', qr_make: 'Making a QR code', doc_search: `Searching your documents for "${nm}"`
  };
  return map[name] || (name.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()));
}
function decorate(name, r) {
  if (!r || r.error || r.confirm) return r;
  const out = { ...r };
  if (SECTION[name] && !out.section) out.section = SECTION[name];
  if (CREATES.test(name) && !out.choices) out.choices = [{ label: '↩ Undo', run: 'undo that' }];
  send({ type: 'activity', action: name, text: String(r.text || '').split('\n')[0].slice(0, 120), section: out.section || null });
  return out;
}

/** Core: local intent -> compound -> AI agent. Returns result object (does not post). */
async function run(text, { id, signal, opts = {}, quiet = false } = {}) {
  const cfg = store.get();
  const routineNames = cfg.routines.map((r) => r.name);
  const intent = commands.parse(text, cfg.assistantName, routineNames);
  if (intent) {
    if (!quiet) send({ type: 'state', state: 'working' });
    const r = await commands.runAction(intent.name, intent.args, ctx);
    if (r.run && r.run !== text) return run(r.run, { id, signal, opts, quiet });
    return quiet ? r : decorate(intent.name, r);
  }
  const multi = commands.parseCompound(text, cfg.assistantName, routineNames);
  if (multi) {
    if (!quiet) send({ type: 'state', state: 'working' });
    const out = [];
    let open, confirm;
    for (const it of multi) {
      if (signal && signal.aborted) break;
      const r = decorate(it.name, await commands.runAction(it.name, it.args, ctx));
      if (r.text) out.push(r.text);
      if (r.open) open = r.open;
      if (r.confirm) { confirm = r.confirm; break; }
    }
    return { text: out.join('\n'), open, confirm };
  }
  // Offline smart guess: typo-fixes ("remnd me tomorow at 5…") and keyword intents.
  const g = commands.guess(text, cfg.assistantName, routineNames);
  if (g && g.confidence === 'high' && g.intent) {
    const r = decorate(g.intent.name, await commands.runAction(g.intent.name, g.intent.args, ctx));
    return { ...r, text: r.text };
  }
  const aiOn = cfg.aiEnabled && ai.availableProviders(cfg).length;
  if (!aiOn) {
    // Universal offline understanding: dates/times -> reminder/event/task, to-do verbs -> task.
    const fb = commands.fallbackIntent(text, false);
    if (fb) {
      if (!quiet) send({ type: 'state', state: 'working' });
      const r = decorate(fb.name, await commands.runAction(fb.name, fb.args, ctx));
      const alt = commands.choicesFor(text).choices.filter((c) => !(fb.name === 'task_add' && /task/.test(c.label)) && !/web|tomorrow 9/.test(c.label)).slice(0, 3);
      return { ...r, choices: [{ label: '↩ Undo', run: 'undo that' }].concat(alt).slice(0, 3) };
    }
    if (g) return { text: `Did you mean "${g.cmd}"?`, confirm: { run: g.cmd }, choices: [{ label: '✅ Add as task', run: `add task ${text}` }, { label: '📝 Save as note', run: `note ${text}` }] };
  }
  return runAI(text, { id, signal, quiet, opts });
}

async function runAI(text, { id, signal, quiet, opts }) {
  const cfg = store.get();
  // "What's on my screen?" without a connected AI: read the screen text with offline Windows OCR.
  const noAI = !cfg.aiEnabled || !ai.availableProviders(cfg).length;
  if (noAI && cfg.screenContext !== 'never' && SCREEN_HINT.test(text) && /\b(screen|on my (screen|monitor)|what am i (looking at|seeing)|read (this|it|the screen)|this (screen|page|window|error))\b/i.test(text)) {
    send({ type: 'status', text: 'reading your screen…' });
    try {
      const txt = (await ocrScreen()).trim();
      if (txt) return { text: `Here's the text I can read on your screen:\n\n${txt.slice(0, 1800)}${txt.length > 1800 ? '\n\n…(trimmed)' : ''}\n\nConnect a free AI in Settings and I can also explain it, summarise it or point at what's wrong.`, section: null, settings: true };
      return { text: "I couldn't find readable text on your screen. If you want me to actually understand what's shown (images, layout, errors), connect a free AI in Settings — then I can see and explain it.", settings: true };
    } catch (e) {
      return { text: `I couldn't read your screen (${e.message}). On Windows this needs an OCR language pack (Settings → Time & language → Language). For full screen understanding, connect a free AI in Settings.`, settings: true };
    }
  }
  if (!cfg.aiEnabled) {
    const sug = commands.suggest(text);
    const found = await commands.runAction('search_all', { query: text.split(/\s+/).filter((w) => w.length > 3).slice(0, 3).join(' ') || text }, ctx);
    const hasFound = !found.error && found.text && !/^Nothing found/.test(found.text) && text.split(/\s+/).length <= 4;
    const ch = commands.choicesFor(text);
    return { text: [
      `I'm not sure what to do with "${ch.short}", so pick one and I'll keep it safe:`,
      hasFound ? 'Found in your stuff:\n' + found.text : '',
      sug.length ? 'Or did you mean: ' + sug.map((x) => `"${x}"`).join(', ') + '?' : ''
    ].filter(Boolean).join('\n'), choices: ch.choices.concat(sug.slice(0, 2).map((x) => ({ label: '▸ ' + x.replace(/…/g, '').trim(), run: x.replace(/\s*…\s*/g, ' ').trim() }))), settings: true };
  }
  if (!ai.availableProviders(cfg).length) {
    return { text: 'I can run PC commands, reminders, tasks and notes right away (try "help"). For questions and screen help, connect a free AI in Settings: a Groq or OpenRouter key (free, 2 minutes), or Ollama running on your PC.', settings: true };
  }
  let extra = '';
  if (/clipboard|copied/i.test(text)) extra = `\nUser's clipboard content:\n"""\n${clipboard.readText().slice(0, 12000) || '(empty)'}\n"""`;
  const open = cfg.tasks.filter((t) => !t.done).slice(0, 15).map((t) => `- ${t.text}${t.due ? ' (due ' + new Date(t.due).toLocaleString() + ')' : ''}`).join('\n');
  const rem = scheduler.upcoming(10).map((r) => `- ${r.text} @ ${new Date(r.at).toLocaleString()}${r.repeat ? ' (' + r.repeat + ')' : ''}`).join('\n');
  extra += `\nUser's open tasks:\n${open || '(none)'}\nUpcoming reminders:\n${rem || '(none)'}`;

  if (!quiet) { send({ type: 'state', state: 'thinking' }); send({ type: 'start', id, speaker: io.speaker(), byVoice: !!opts.byVoice, source: opts.source, appVisible: io.appVisible ? io.appVisible() : true }); }
  const activeWindow = describeTarget();
  let shot = null;
  lastShot = null;
  const wantShot = cfg.screenContext === 'always' || (cfg.screenContext !== 'never' && SCREEN_HINT.test(text));
  try {
    if (wantShot) { send({ type: 'status', text: 'looking at your screen…' }); shot = await captureForAI(); }
  } catch (e) { console.warn('capture failed', e.message); if (wantShot) extra += `\n(Note: I tried to capture the screen but it failed: ${e.message}. Tell the user you couldn't see their screen and suggest checking screen-recording permission.)`; }

  let prompt = text, allText = '', provider = null;
  const last = {}; const done = [];
  let first = true;
  for (let step = 0; step < 6; step++) {
    const r = await ai.chat(cfg, history, prompt, {
      signal, extraContext: extra, shot, activeWindow, onModelChange,
      onToken: (tok) => {
        if (quiet) return;
        if (first) { first = false; send({ type: 'state', state: 'speaking' }); }
        send({ type: 'token', id, text: tok });
      }
    });
    if (signal && signal.aborted) return { text: '' };
    provider = r.provider;
    if (r.text) { allText += (allText ? '\n' : '') + r.text; if (!quiet) send({ type: 'token', id, text: '\n' }); }
    let look = false;
    for (const a of r.actions) {
      if (signal && signal.aborted) break;
      if (a.name === 'screen_look') { look = true; send({ type: 'job-step', id, label: 'Looking at your screen' }); continue; }
      if (a.name === 'point_at') { send({ type: 'job-step', id, label: 'Walking over to point at it' }); try { const p = await resolvePoint({ x: Number(a.args.x), y: Number(a.args.y) }); if (io.pointAt) io.pointAt(p.x, p.y); } catch (e) {} done.push('point_at ' + JSON.stringify(a.args)); continue; }
      if (!quiet) send({ type: 'state', state: 'working' });
      send({ type: 'job-step', id, label: jobLabel(a.name, a.args) });
      const res = await commands.runAction(a.name, a.args, ctx);
      if (!res.error && !res.confirm && SECTION[a.name]) { last.section = SECTION[a.name]; send({ type: 'activity', action: a.name, text: String(res.text || '').split('\n')[0].slice(0, 120), section: SECTION[a.name] }); }
      done.push(`${a.name} ${JSON.stringify(a.args)} -> ${res.text || 'ok'}`);
      if (res.open) last.open = res.open;
      if (res.mode) last.mode = res.mode;
      if (res.confirm) { last.confirm = res.confirm; last.confirmText = res.text; break; }
      if (res.error) last.errorText = res.text;
      if (res.text && !res.silent && /^(briefing|reminder_list|task_list|notes_list|weather|system_info|battery|clipboard_read)$/.test(a.name)) last.info = (last.info ? last.info + '\n' : '') + res.text;
    }
    if (!look || last.confirm || last.errorText) break;
    if (!quiet) send({ type: 'state', state: 'thinking' });
    await new Promise((res) => setTimeout(res, 350));
    shot = await captureForAI();
    prompt = `Original request: "${text}"\nActions completed so far:\n${done.join('\n') || '(none)'}\nHere is the current screen. Continue with the next ACTION lines, or give a short final answer if it is done. Do not repeat completed actions.`;
  }
  const summary = done.length && !allText ? done.map((d) => d.split(' -> ')[1]).filter(Boolean).join(' ') : '';
  const out = { text: [allText, last.info].filter(Boolean).join('\n') || summary || 'Done.', provider, open: last.open, mode: last.mode, streamed: !quiet, section: last.section };
  if (last.confirm) { out.confirm = last.confirm; out.text = (allText ? allText + '\n' : '') + last.confirmText; }
  if (last.errorText) { out.text += '\n' + last.errorText; out.error = !allText; }
  return out;
}

function post(id, res, t0, userText, opts = {}) {
  send({ type: 'job', phase: 'done', id, ms: Date.now() - t0, ok: !res.error, label: String(res.text || 'Done').split('\n')[0].slice(0, 80), request: userText });
  if (res.confirm) pendingConfirm = res.confirm;
  if (res.reload) { history = []; send({ type: 'cleared' }); send({ type: 'data', keys: ['tasks', 'reminders', 'notes', 'events', 'habits', 'messages', 'reading', 'checklists', 'expenses', 'journal', 'countdowns', 'people', 'clipboard', 'snippets', 'workflows', 'watches', 'xp'] }); }
  pushHistory('user', userText);
  pushHistory('assistant', res.text || 'Done.');
  const msg = addMessage({ id, role: 'assistant', text: res.text || 'Done.', meta: { ms: Date.now() - t0, provider: res.provider || 'local', error: !!res.error, open: res.open, confirm: res.confirm, settings: res.settings, choices: res.choices, section: res.section, qr: res.qr, reload: res.reload } });
  send({ type: 'final', id, msg, appVisible: io.appVisible ? io.appVisible() : true, streamed: !!res.streamed, speak: res.speak, forceSpeak: !!res.forceSpeak, silent: !!res.silent, mode: res.mode, speaker: io.speaker(), byVoice: !!opts.byVoice, source: opts.source });
  send({ type: 'state', state: res.error ? 'error' : (jobs.size > 1 ? 'working' : 'idle') });
}

async function runRoutine(name) {
  const r = store.get().routines.find((x) => x.name.toLowerCase() === String(name).toLowerCase());
  if (!r) return { text: `No routine called "${name}".`, error: true };
  const out = [`▶ ${r.name}`];
  for (const stepText of r.steps) {
    const res = await run(stepText, { quiet: true });
    if (res.text) out.push(res.text);
    if (res.confirm) { out.push('(stopped: needs confirmation)'); break; }
  }
  return { text: out.join('\n') };
}

function friendlyError(e) {
  const m = String(e && e.message || e);
  if (/401|403|invalid.*key|API key/i.test(m)) return 'An AI key was rejected. Please check it in Settings.';
  if (/429|quota|rate|RESOURCE_EXHAUSTED/i.test(m)) return 'The AI provider is rate-limiting or out of quota. Try again shortly or add another provider.';
  if (/404|not found|model/i.test(m)) return 'The AI model name looks wrong or retired. Use "Find available models" in Settings.';
  if (/fetch failed|ENOTFOUND|network|ECONN|ETIMEDOUT/i.test(m)) return 'I can\'t reach the AI service. Check your internet connection.';
  return 'Something went wrong: ' + m.slice(0, 160);
}

// ------------------------------------------------------------ alerts (reminders firing)
scheduler.on('fire', (r) => {
  if (r.gentle && store.get().dnd) return; // Do Not Disturb: skip nudges, keep real reminders
  ctx.lastFired = r;
  const label = { alarm: '⏰ ', timer: '⏱ ', event: '📅 ', break: '', focus: '🎯 ', birthday: '' }[r.kind] ?? '🔔 ';
  const text = `${label}${r.missed ? '(missed) ' : ''}${r.text}${r.kind === 'timer' ? ': time\'s up!' : ''}`;
  const msg = addMessage({ role: 'alert', text, meta: { reminderId: r.id, kind: r.kind } });
  if (!r.gentle) try { new Notification({ title: { alarm: 'Alarm', event: 'Upcoming event', timer: 'Timer', focus: 'Focus' }[r.kind] || 'Nova reminder', body: r.kind === 'timer' ? r.text + ': time\'s up!' : r.text, icon: io.icon, silent: true }).show(); } catch (e) {}
  send({ type: 'alert', msg, kind: r.kind, reminder: r, speaker: io.speaker() });
  if (io.onAlert) io.onAlert(r);
  io.showAlert(r);
});

// ------------------------------------------------------------ dictation
async function dictate(text) {
  let t = String(text || '').trim();
  if (!t) return { ok: true };
  if (/^(stop|end|exit|cancel) (dictation|dictating|typing)\.?$/i.test(t)) return { ok: true, stop: true };
  const keyCmds = { 'new line': 'enter', 'next line': 'enter', 'press enter': 'enter', enter: 'enter', 'new paragraph': 'enter', tab: 'tab', 'next field': 'tab', backspace: 'backspace', 'delete that': 'ctrl+backspace', undo: 'ctrl+z', 'select all': 'ctrl+a' };
  const k = keyCmds[t.toLowerCase().replace(/[.!?,]+$/, '')];
  if (k) { const r = await commands.runAction('press_keys', { keys: k, times: /paragraph/i.test(t) ? 2 : 1 }, ctx); return { ok: !r.error, text: r.text }; }
  t = t.replace(/\s*\b(new line|next line)\b\s*/gi, '\n').replace(/\s*\bcomma\b/gi, ',').replace(/\s*\bfull stop\b|\s*\bperiod\b/gi, '.').replace(/\s*\bquestion mark\b/gi, '?');
  const r = await commands.runAction('type_text', { text: t + (/\n$/.test(t) ? '' : ' ') }, ctx);
  return { ok: !r.error, text: r.text };
}

/** Direct action from the app UI (buttons/forms). UI actions are pre-confirmed. */
async function uiAction(name, args) {
  const r = await commands.runAction(name, args, ctx, true);
  if (r && !r.error && /^(task_done|task_toggle|task_add|water_log|habit_log|note_add|reminder|event_add|expense_add|journal_add|focus_start|focus_stop|focus_break|reminder_snooze|reminder_delete|task_delete|person_add|countdown_add|outfit_set|timer|shortcut_add|dev_tool|snippet_save|snippet_insert|git_status|dev_mode|qr_make|gen_secret|gen_keypair|run_command|dev_info|watch_add|workflow_run)$/.test(name)) {
    if (name !== 'task_toggle' || (store.get().tasks.find((t) => t.id === (args || {}).id) || {}).done) send({ type: 'activity', action: name === 'task_toggle' ? 'task_done' : name, text: String(r.text || '').split('\n')[0].slice(0, 120), ui: true });
  }
  return r;
}

function takeSuppressedClip(t) { if (t && t === suppressedClip) { suppressedClip = ''; return true; } return false; }
module.exports = { getTarget: () => target, captureForAI, stopwatch, takeSuppressedClip, init, handleInput, run, dictate, uiAction, pollForeground, clearConversation, friendlyError, onModelChange, ctx };
