// Settings + notes + reminders persisted as JSON in %APPDATA%/Nova Companion.
// API keys are encrypted with Electron safeStorage (Windows DPAPI).
const { app, safeStorage } = require('electron');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const EventEmitter = require('events');
const events = new EventEmitter();

const CONFIG_VERSION = 8;
const DEFAULTS = {
  configVersion: CONFIG_VERSION,
  providerOrder: ['groq', 'openrouter', 'ollama', 'grok', 'gemini', 'anthropic', 'openai', 'custom'],
  endpoints: { ollama: 'http://localhost:11434', custom: '' },
  ollamaEnabled: false,
  models: {
    anthropic: 'claude-haiku-4-5',
    openai: 'gpt-4o-mini',
    gemini: 'gemini-2.5-flash',
    openaiStt: 'whisper-1',
    groq: 'llama-3.3-70b-versatile',
    grok: '',         // auto-picks a fast xAI model
    groqStt: 'whisper-large-v3-turbo',
    groqVision: 'meta-llama/llama-4-scout-17b-16e-instruct',
    openrouter: '',  // auto-picks a free model
    ollama: '',      // auto-picks an installed model
    custom: ''
  },
  keys: { anthropic: '', openai: '', gemini: '', groq: '', grok: '', openrouter: '', custom: '', elevenlabs: '' }, // stored encrypted on disk
  sec: null,       // portable key protection: { salt, verifier } (PIN) or { plain: true }
  appLock: null,   // app-open PIN gate: { salt, hash } — asked every time the window is opened
  account: null,   // Supabase account: { session, pin, lastActive, syncAt } — same login/PIN as the phone
  accountCfg: null, // { url, anonKey } — Supabase project (or baked src/supabase-config.json)
  voiceTts: { provider: 'system', elevenVoice: '', elevenModel: 'eleven_turbo_v2_5' }, // 'system' | 'elevenlabs' (key lives in keys.elevenlabs)
  devMode: false,  // developer edition: dev avatar skin, dark theme option, dev tools/commands
  devShowAll: false, // keep all personal sections visible in dev mode
  theme: 'auto',   // 'auto' | 'light' | 'dark'
  snippets: [],    // {id, name, lang, text, tags, created}
  devPaths: { editor: '', terminal: '', repos: [] }, // dev launcher config
  workflows: [],   // {id, name, commands:[...], cwd}
  watches: [],     // {id, path, sig, enabled} — file/folder change tracker
  vault: null,     // encrypted secret vault {salt, verifier, items:[{id,name,note,enc,created}]}
  reading: [],     // reading list {id, url, title, tags:[], read, added}
  checklists: [],  // reusable checklists {id, name, items:[{text,done}], template}
  scratchpad: '', // developer scratch buffer
  voice: { speak: true, voiceName: '', rate: 1.05, wakeWord: true, wakeSensitivity: 0.72, followUp: true },
  hotkeys: { toggle: 'Alt+Shift+N', listen: 'Alt+Shift+V', water: 'Alt+Shift+W', quick: 'Alt+Shift+Q', ocr: 'Alt+Shift+T' },
  screenContext: 'auto', // auto | always | never
  city: '',              // weather location; empty = auto-detect from IP
  avatarSize: 84,
  startAtLogin: false,
  assistantName: 'Nova',
  userName: 'Raisa',
  position: null, // {x, y} of collapsed avatar window
  notes: [],      // {id, t, text}
  reminders: [],  // {id, text, at, repeat, kind:'reminder'|'alarm'|'timer', created, done, firedAt}
  tasks: [],      // {id, text, due, priority:'high'|'normal'|'low', done, created, doneAt}
  messages: [],   // shared chat history {id, role, text, t, meta}
  routines: [
    { id: 'r_start', name: 'Start my day', steps: ['briefing'] },
    { id: 'r_focus', name: 'Focus mode', steps: ['minimize all', 'mute', 'timer 25 min called focus session'] },
    { id: 'r_end', name: 'End my day', steps: ['show my tasks', 'show reminders'] }
  ],
  companion: { enabled: true, walkOnAlert: true },
  openAppOnStart: true,
  aiEnabled: false,        // AI is optional; turned on automatically when a key/Ollama is connected
  aiSetupDismissed: false,
  events: [],      // {id, title, start, end, allDay, location, notes, remindMin, notifiedAt}
  habits: [        // {id, name, icon, target, log: {'YYYY-MM-DD': count}, created}
    { id: 'h_water', name: 'Drink water', icon: '💧', target: 8, log: {}, created: 0 },
    { id: 'h_move', name: 'Stretch / walk', icon: '🚶', target: 3, log: {}, created: 0 }
  ],
  focus: { work: 25, short: 5, long: 15, autoBreak: true, sessions: [] }, // sessions: {start, end, minutes, label}
  clipboard: [],   // {id, text, t, pinned}
  clipboardCapture: true,
  shortcuts: [     // {id, name, target, kind}
    { id: 's_outlook', name: 'Outlook', target: 'outlook', kind: 'app' },
    { id: 's_teams', name: 'Teams', target: 'teams', kind: 'app' },
    { id: 's_dl', name: 'Downloads', target: 'downloads', kind: 'folder' }
  ],
  people: [],      // {id, name, phone, email, company, birthday:'MM-DD'|'YYYY-MM-DD', notes, notifiedYear}
  expenses: [],    // {id, amount, category, note, t}
  currency: '₹',
  budget: 0,       // monthly budget (0 = none)
  journal: [],     // {id, t, text, mood:1-5}
  countdowns: [],  // {id, title, date}
  clocks: ['Europe/London', 'America/New_York', 'Asia/Dubai', 'Asia/Singapore'],
  dnd: false,
  away: null,
  // v6 features
  automations: [],      // {id, name, enabled, trigger:{type,...}, actions:[string], lastRun}
  automationLog: [],
  tidyUndo: [],         // last tidy moves [{from, to}]
  planner: { start: '09:30', end: '18:30', lunch: '13:00-14:00', block: 45, rollover: true, lastRollover: '' },
  usage: {},            // {'YYYY-MM-DD': {procName: seconds}}
  blocker: { enabled: true, titles: ['youtube', 'instagram', 'facebook', 'netflix', 'reddit', 'twitter', 'x.com', 'hotstar', 'primevideo'], apps: [] },
  xp: { total: 0, day: '', today: 0, log: [] },
  outfit: { hat: '', eyes: '', neck: '', aura: '' },
  ntfy: { enabled: false, topic: '', server: 'https://ntfy.sh', kinds: ['reminder', 'alarm', 'event', 'birthday', 'timer'], inbox: true, lastId: '' },
  widgets: [],          // {id, type:'note'|'tasks'|'countdown'|'agenda'|'clock', x, y, w, h, onTop, color, text, refId}
  meetings: [],         // {id, title, start, end, transcript, summary, actions:[...] }
  docFolders: [],       // folders to index for the document finder
  outlook: { enabled: false, syncDays: 7, lastSync: 0 },
  sap: { systems: [], shcutPath: '', favorites: [] },
  life: { liveliness: 'normal', wander: true, thoughts: true, curious: true, reactions: true, echo: true, pill: true },
  wellbeing: { stretch: false, stretchEvery: 60, water: false, waterEvery: 90, eyes: false, eyesEvery: 20, quietStart: '22:00', quietEnd: '08:00' }
};

let file;
let data;
let portable = false;          // running from USB / portable folder
let portableKey = null;        // derived AES key once the PIN is unlocked (in memory only)
let rawKeys = {};              // on-disk (still-encrypted) key blobs, so a locked session can keep them

// Portable key protection (machine-independent, unlike Windows DPAPI which only decrypts on the PC that wrote it).
function deriveKey(pin, saltHex) { return crypto.scryptSync(String(pin), Buffer.from(saltHex, 'hex'), 32); }
function encWith(key, s) {
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv('aes-256-gcm', key, iv);
  const ct = Buffer.concat([c.update(String(s), 'utf8'), c.final()]);
  return 'pen:' + Buffer.concat([iv, c.getAuthTag(), ct]).toString('base64');
}
function decWith(key, s) {
  const r = Buffer.from(s.slice(4), 'base64');
  const d = crypto.createDecipheriv('aes-256-gcm', key, r.slice(0, 12));
  d.setAuthTag(r.slice(12, 28));
  return Buffer.concat([d.update(r.slice(28)), d.final()]).toString('utf8');
}

function enc(s) {
  if (!s) return '';
  if (portable) {
    if (portableKey) return encWith(portableKey, s);
    return 'raw:' + Buffer.from(s).toString('base64');   // no PIN set (or "store without PIN"): obfuscated only
  }
  if (safeStorage.isEncryptionAvailable()) return 'enc:' + safeStorage.encryptString(s).toString('base64');
  return 'raw:' + Buffer.from(s).toString('base64');
}
function dec(s) {
  if (!s) return '';
  try {
    if (s.startsWith('pen:')) return portableKey ? decWith(portableKey, s) : '';   // locked until the PIN is entered
    if (s.startsWith('enc:')) return safeStorage.isEncryptionAvailable() ? safeStorage.decryptString(Buffer.from(s.slice(4), 'base64')) : '';
    if (s.startsWith('raw:')) return Buffer.from(s.slice(4), 'base64').toString();
  } catch (e) { /* corrupt, wrong PIN, or different user */ }
  return '';
}

// ---- PIN / unlock API (portable mode)
function hasPin() { return !!(data && data.sec && data.sec.verifier); }
function isLocked() { return portable && hasPin() && !portableKey; }
function secStatus() { return { portable, hasPin: hasPin(), locked: isLocked(), plain: !!(data && data.sec && data.sec.plain) }; }
function unlock(pin) {
  if (!hasPin()) return false;
  try {
    const key = deriveKey(pin, data.sec.salt);
    if (decWith(key, data.sec.verifier) !== 'nova-ok') return false;
    portableKey = key;
  } catch (e) { return false; }
  for (const p of Object.keys(data.keys)) data.keys[p] = rawKeys[p] ? dec(rawKeys[p]) : '';
  events.emit('change', ['keys']);
  return true;
}
function setPin(pin) {
  if (!portable) return false;                 // PIN only matters for portable key files
  if (isLocked()) return false;                // must unlock with the old PIN first
  const salt = crypto.randomBytes(16).toString('hex');
  portableKey = deriveKey(pin, salt);
  data.sec = { salt, verifier: encWith(portableKey, 'nova-ok') };
  flush(); rawKeys = snapshotRawKeys();
  events.emit('change', ['sec', 'keys']);
  return true;
}
function usePlainKeys() {                        // "store without a PIN" (obfuscated on the USB)
  if (!portable || isLocked()) return false;
  portableKey = null; data.sec = { plain: true };
  flush(); rawKeys = snapshotRawKeys();
  events.emit('change', ['sec', 'keys']);
  return true;
}
function snapshotRawKeys() {
  const o = {};
  for (const p of Object.keys(data.keys)) o[p] = data.keys[p] ? enc(data.keys[p]) : (isLocked() && rawKeys[p] ? rawKeys[p] : '');
  return o;
}

function deepMerge(base, over) {
  const out = Array.isArray(base) ? [...base] : { ...base };
  for (const k of Object.keys(over || {})) {
    const v = over[k];
    if (v && typeof v === 'object' && !Array.isArray(v) && base[k] && typeof base[k] === 'object' && !Array.isArray(base[k])) {
      out[k] = deepMerge(base[k], v);
    } else out[k] = v;
  }
  return out;
}

function load() {
  portable = process.env.NOVA_PORTABLE === '1';
  file = path.join(app.getPath('userData'), 'settings.json');
  let disk = {};
  try { disk = JSON.parse(fs.readFileSync(file, 'utf8')); } catch (e) { /* first run */ }
  data = deepMerge(DEFAULTS, disk);
  rawKeys = { ...(disk.keys || {}) };
  // v1 -> v2: old default hotkeys clashed with other apps / Excel paste special
  if ((disk.configVersion || 1) < 2) {
    if (data.hotkeys.toggle === 'Control+Alt+Space') data.hotkeys.toggle = DEFAULTS.hotkeys.toggle;
    if (data.hotkeys.listen === 'Control+Alt+V') data.hotkeys.listen = DEFAULTS.hotkeys.listen;
  }
  if ((disk.configVersion || 1) < 3) {
    data.notes = (data.notes || []).map((n, i) => ({ id: n.id || `n_${n.t || Date.now()}_${i}`, t: n.t || Date.now(), text: n.text }));
    data.reminders = (data.reminders || []).map((r) => ({ kind: 'reminder', repeat: null, created: Date.now(), done: false, ...r, text: String(r.text || '').replace(/^Reminder:\s*/, '') }));
  }
  if ((disk.configVersion || 1) < 4) {
    // put the new free providers first, keep the user's relative order for the rest
    const rest = (data.providerOrder || []).filter((p) => !['groq', 'openrouter', 'ollama', 'custom'].includes(p));
    data.providerOrder = ['groq', 'openrouter', 'ollama', ...rest, 'custom'];
  }
  if ((disk.configVersion || 1) < 5) {
    // keep AI on for people who already connected one
    const k = data.keys || {};
    data.aiEnabled = !!(k.groq || k.openrouter || k.gemini || k.anthropic || k.openai || data.ollamaEnabled);
  }
  if ((disk.configVersion || 1) < 8 && Array.isArray(data.providerOrder) && !data.providerOrder.includes('grok')) {
    const i = data.providerOrder.indexOf('ollama');
    data.providerOrder.splice(i >= 0 ? i + 1 : data.providerOrder.length, 0, 'grok');   // add xAI Grok for existing users
  }
  data.configVersion = CONFIG_VERSION;
  for (const p of Object.keys(data.keys)) data.keys[p] = dec(data.keys[p]);
  return data;
}

let saveTimer = null;
function save() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(flush, 150);
}
function flush() {
  const copy = JSON.parse(JSON.stringify(data));
  for (const p of Object.keys(copy.keys)) {
    if (data.keys[p]) copy.keys[p] = enc(data.keys[p]);
    else if (isLocked() && rawKeys[p]) copy.keys[p] = rawKeys[p];   // keep locked key blobs we can't read this session
    else copy.keys[p] = '';
  }
  try {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file + '.tmp', JSON.stringify(copy, null, 2));
    fs.renameSync(file + '.tmp', file);
  } catch (e) { console.error('save failed', e); }
}

// Clear data. scope 'data' wipes your content (tasks, reminders, notes, etc.) but keeps
// settings, AI keys and the vault. scope 'all' is a full factory reset (also clears keys + vault).
const CONTENT_KEYS = ['notes', 'reminders', 'tasks', 'messages', 'events', 'clipboard', 'people', 'expenses', 'journal', 'countdowns', 'meetings', 'usage', 'snippets', 'workflows', 'watches', 'reading', 'checklists', 'automationLog', 'tidyUndo'];
function reset(scope = 'data') {
  const fresh = JSON.parse(JSON.stringify(DEFAULTS));
  if (scope === 'all') {
    const dir = file; data = fresh; data.configVersion = CONFIG_VERSION; rawKeys = {};
    flush(); events.emit('change', Object.keys(data)); return { scope: 'all' };
  }
  for (const k of CONTENT_KEYS) data[k] = JSON.parse(JSON.stringify(fresh[k]));
  // reset habit logs but keep the habit definitions, and reset rewards/xp + planner cursor
  data.habits = (data.habits || []).map((h) => ({ ...h, log: {} }));
  data.xp = JSON.parse(JSON.stringify(fresh.xp));
  data.planner = { ...data.planner, lastRollover: '' };
  data.away = null;
  save();
  events.emit('change', [...CONTENT_KEYS, 'habits', 'xp', 'planner', 'away']);
  return { scope: 'data' };
}
function get() { return data; }
function set(patch) { data = deepMerge(data, patch); save(); events.emit('change', Object.keys(patch)); return data; }
const uid = (p = 'x') => `${p}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

// Settings sent to renderer never include raw keys, only whether they exist.
function publicView() {
  const v = JSON.parse(JSON.stringify(data));
  for (const p of Object.keys(v.keys)) v.keys[p] = v.keys[p] ? '••••' + v.keys[p].slice(-4) : '';
  return v;
}

module.exports = { load, get, set, save, flush, publicView, events, uid, reset, secStatus, unlock, setPin, usePlainKeys, isPortable: () => portable };
