// Local command engine: instant intent parsing (no AI) + action executors.
// The AI layer calls the same executors through runAction().
const { shell, clipboard, desktopCapturer, screen, app } = require('electron');
const { spawn } = require('child_process');
const os = require('os');
const fs = require('fs');
const path = require('path');
const info = require('./info');
const dev = require('./devtools');
const { parseWhen, describeWhen } = require('./when');

// ---------------------------------------------------------------- helpers
const psq = (s) => String(s).replace(/['\u2018\u2019\u201A\u201B]/g, (q) => q + q); // escape for single-quoted PS strings
const pct = (n) => Math.max(0, Math.min(100, Math.round(Number(n))));

function startCmd(target) {
  return new Promise((resolve) => {
    const p = spawn('cmd.exe', ['/d', '/s', '/c', `start "" ${target}`], {
      windowsHide: true, windowsVerbatimArguments: true, detached: true, stdio: 'ignore'
    });
    p.on('error', () => resolve(false));
    p.on('exit', (code) => resolve(code === 0));
    p.unref();
  });
}
function spawnDetached(cmd, args) {
  const p = spawn(cmd, args, { windowsHide: true, detached: true, stdio: 'ignore' });
  p.on('error', () => {});
  p.unref();
}

const UNIT_MS = { s: 1000, m: 60000, h: 3600000 };
function unitMs(u) {
  u = (u || 'm').toLowerCase();
  if (u.startsWith('h')) return UNIT_MS.h;
  if (u.startsWith('s')) return UNIT_MS.s;
  return UNIT_MS.m;
}
function fmtDuration(ms) {
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s} second${s === 1 ? '' : 's'}`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m} minute${m === 1 ? '' : 's'}`;
  const h = Math.floor(m / 60), r = m % 60;
  return `${h} hour${h === 1 ? '' : 's'}${r ? ` ${r} min` : ''}`;
}
function fmtTime(d) { return d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }); }

// "4", "4:30", "4.30 pm", "16:45" -> next Date in the future
function parseClock(str) {
  const m = String(str).trim().toLowerCase().match(/^(\d{1,2})(?:[:.](\d{2}))?\s*(am|pm)?$/);
  if (!m) return null;
  let h = +m[1]; const min = +(m[2] || 0); const ap = m[3];
  if (h > 23 || min > 59) return null;
  if (ap === 'pm' && h < 12) h += 12;
  if (ap === 'am' && h === 12) h = 0;
  const now = new Date();
  const d = new Date(now); d.setHours(h, min, 0, 0);
  if (!ap && h < 12 && d <= now) { const pm = new Date(d); pm.setHours(h + 12); if (pm > now) return pm; }
  if (d <= now) d.setDate(d.getDate() + 1);
  return d;
}

// ------------------------------------------------------------ app index
const APP_ALIASES = {
  notepad: 'notepad', calculator: 'calc', calc: 'calc', paint: 'mspaint',
  'command prompt': 'cmd', cmd: 'cmd', powershell: 'powershell', terminal: 'wt',
  'file explorer': 'explorer', explorer: 'explorer', 'my computer': 'explorer', 'this pc': 'explorer',
  'task manager': 'taskmgr', 'control panel': 'control', settings: 'ms-settings:',
  'snipping tool': 'snippingtool', 'registry editor': 'regedit',
  chrome: 'chrome', 'google chrome': 'chrome', edge: 'msedge', 'microsoft edge': 'msedge', firefox: 'firefox',
  'vs code': 'code', vscode: 'code', 'visual studio code': 'code',
  word: 'winword', 'ms word': 'winword', excel: 'excel', 'ms excel': 'excel',
  powerpoint: 'powerpnt', ppt: 'powerpnt', outlook: 'outlook', onenote: 'onenote',
  teams: 'ms-teams:', 'microsoft teams': 'ms-teams:', spotify: 'spotify:', whatsapp: 'whatsapp:',
  'sap logon': 'saplogon', 'sap gui': 'saplogon', sap: 'saplogon'
};
const BUILTIN = new Set(['notepad', 'calc', 'mspaint', 'cmd', 'powershell', 'wt', 'explorer', 'taskmgr', 'control', 'snippingtool', 'regedit']);
const PROCESS_ALIASES = {
  word: 'winword', excel: 'excel', powerpoint: 'powerpnt', ppt: 'powerpnt', edge: 'msedge',
  'microsoft edge': 'msedge', 'vs code': 'code', vscode: 'code', 'visual studio code': 'code',
  teams: 'teams', 'microsoft teams': 'teams', 'google chrome': 'chrome', 'sap logon': 'saplogon',
  'sap gui': 'saplogon', sap: 'saplogon', calculator: 'calculator', 'task manager': 'taskmgr'
};

let startApps = []; // [{Name, AppID}]
async function indexApps(ps) {
  try {
    const out = await ps.run('Get-StartApps | Select-Object Name, AppID | ConvertTo-Json -Compress', 20000);
    const arr = JSON.parse(out || '[]');
    startApps = (Array.isArray(arr) ? arr : [arr]).filter((a) => a && a.Name && a.AppID);
  } catch (e) { console.error('app index failed:', e.message); }
  return startApps.length;
}
function findStartApp(name) {
  const q = name.toLowerCase().trim();
  const words = q.split(/\s+/);
  let best = null, bestScore = 0;
  for (const a of startApps) {
    const n = a.Name.toLowerCase();
    let s = 0;
    if (n === q) s = 100;
    else if (n.startsWith(q)) s = 85;
    else if (words.every((w) => n.includes(w))) s = 65;
    else continue;
    s -= Math.min(15, (n.length - q.length) / 4); // prefer shorter names
    if (/uninstall|readme|help|documentation|release notes/.test(n)) s -= 40;
    if (s > bestScore) { bestScore = s; best = a; }
  }
  return bestScore >= 50 ? best : null;
}


// ------------------------------------------------------------- keyboard
const VK = {
  ctrl: 0x11, control: 0x11, shift: 0x10, alt: 0x12, win: 0x5B, windows: 0x5B, cmd: 0x5B,
  enter: 0x0D, return: 0x0D, tab: 0x09, esc: 0x1B, escape: 0x1B, backspace: 0x08, delete: 0x2E, del: 0x2E,
  insert: 0x2D, space: 0x20, spacebar: 0x20, up: 0x26, down: 0x28, left: 0x25, right: 0x27,
  home: 0x24, end: 0x23, pageup: 0x21, pagedown: 0x22, pgup: 0x21, pgdn: 0x22, capslock: 0x14,
  printscreen: 0x2C, menu: 0x5D, apps: 0x5D
};
for (let i = 1; i <= 12; i++) VK['f' + i] = 0x6F + i;
function parseKeys(str) {
  const parts = String(str).toLowerCase().replace(/\s*\+\s*|\s+plus\s+|-(?=\w)/g, '+').replace(/\s+/g, '+')
    .replace(/page\+up/, 'pageup').replace(/page\+down/, 'pagedown').replace(/caps\+lock/, 'capslock').replace(/print\+screen/, 'printscreen')
    .split('+').filter(Boolean);
  const vks = [];
  for (const k of parts) {
    if (VK[k] != null) vks.push(VK[k]);
    else if (/^[a-z0-9]$/.test(k)) vks.push(k.toUpperCase().charCodeAt(0));
    else return null;
  }
  return vks.length ? vks : null;
}
const SHORTCUTS = {
  'select all': 'ctrl+a', copy: 'ctrl+c', 'copy that': 'ctrl+c', 'copy this': 'ctrl+c', paste: 'ctrl+v', 'paste it': 'ctrl+v', cut: 'ctrl+x',
  undo: 'ctrl+z', redo: 'ctrl+y', save: 'ctrl+s', 'save it': 'ctrl+s', 'save file': 'ctrl+s', 'save as': 'ctrl+shift+s', find: 'ctrl+f', print: 'ctrl+p',
  'new tab': 'ctrl+t', 'close tab': 'ctrl+w', 'reopen tab': 'ctrl+shift+t', 'next tab': 'ctrl+tab', 'previous tab': 'ctrl+shift+tab',
  refresh: 'f5', reload: 'f5', 'go back': 'alt+left', 'go forward': 'alt+right', 'new line': 'enter', 'hit enter': 'enter', enter: 'enter',
  'next field': 'tab', 'previous field': 'shift+tab', escape: 'esc', 'switch window': 'alt+tab', 'close window': 'alt+f4',
  'zoom in': 'ctrl+plus', 'zoom out': 'ctrl+minus', 'bold': 'ctrl+b', 'italic': 'ctrl+i', 'underline': 'ctrl+u', 'run dialog': 'win+r',
  'scroll to top': 'ctrl+home', 'scroll to bottom': 'ctrl+end', 'go to top': 'ctrl+home', 'go to bottom': 'ctrl+end', 'delete that': 'backspace'
};
VK.plus = 0xBB; VK.minus = 0xBD;

function bestMatch(list, query, get) {
  const q = String(query || '').toLowerCase().replace(/^(the|my|a)\s+/, '').trim();
  if (!q) return list.length === 1 ? list[0] : null;
  let best = null, score = 0;
  for (const item of list) {
    const t = get(item).toLowerCase();
    let sc = 0;
    if (t === q) sc = 100; else if (t.includes(q)) sc = 80; else if (q.includes(t)) sc = 70;
    else { const w = q.split(/\s+/).filter((x) => x.length > 2); const hits = w.filter((x) => t.includes(x)).length; sc = w.length ? (hits / w.length) * 60 : 0; }
    if (sc > score) { score = sc; best = item; }
  }
  return score >= 40 ? best : null;
}


function todayKey(d = new Date()) { const x = new Date(d); return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`; }
function habitStreak(h) {
  let n = 0; const d = new Date();
  if (!((h.log || {})[todayKey(d)] >= (h.target || 1))) d.setDate(d.getDate() - 1); // today not done yet doesn't break streak
  while ((h.log || {})[todayKey(d)] >= (h.target || 1)) { n++; d.setDate(d.getDate() - 1); }
  return n;
}
// "team sync tomorrow 3 to 4 pm @ Teams" -> {title, start, end, location, allDay}
function parseEvent(text) {
  let s = ' ' + String(text || '') + ' ', m, endTime = null, durMs = null, location = '', allDay = false;
  if ((m = s.match(/\s@\s*([^@]+?)\s*$/)) || (m = s.match(/\s(?:at|in)\s+((?:the\s+)?[A-Z][\w&'.-]*(?:\s+[A-Z0-9][\w&'.-]*){0,4})\s*$/))) { location = m[1].trim(); s = s.replace(m[0], ' '); }
  if ((m = s.match(/\s(\d{1,2}(?:[:.]\d{2})?)\s*(am|pm)?\s*(?:-|–|to|until|till)\s*(\d{1,2}(?:[:.]\d{2})?)\s*(am|pm)?(?=\s)/i))) {
    const ap1 = m[2] || m[4] || '';
    s = s.replace(m[0], ` at ${m[1]}${ap1 ? ' ' + ap1 : ''} `);
    endTime = { t: m[3], ap: m[4] || m[2] || '' };
  }
  if ((m = s.match(/\sfor\s+(\d+(?:\.\d+)?|an?|half an?)\s*(hours?|hrs?|h|minutes?|mins?|m)\b/i))) {
    const n = /^half/i.test(m[1]) ? 0.5 : /^an?$/i.test(m[1]) ? 1 : parseFloat(m[1]);
    durMs = n * (/^h/i.test(m[2]) ? 3600000 : 60000); s = s.replace(m[0], ' ');
  }
  if ((m = s.match(/\s(all[\s-]day)\b/i))) { allDay = true; s = s.replace(m[0], ' '); }
  const w = parseWhen(s);
  if (!w.at) return { title: w.rest };
  let start = +w.at, end = null;
  if (allDay || !w.hasTime && !endTime) { const d = new Date(start); d.setHours(0, 0, 0, 0); start = +d; end = start + 864e5 - 1; allDay = true; }
  else if (endTime) {
    const [hh, mm] = endTime.t.split(/[:.]/).map(Number);
    const e = new Date(start); let h = hh;
    if (/p/i.test(endTime.ap) && h < 12) h += 12; if (/a/i.test(endTime.ap) && h === 12) h = 0;
    if (!endTime.ap && h < new Date(start).getHours() && h + 12 <= 23) h += 12;
    e.setHours(h, mm || 0, 0, 0); end = +e; if (end <= start) end += 864e5;
  } else if (durMs) end = start + durMs;
  let title = w.rest.replace(/^\s*(an?|the)\s+/i, '').replace(/\s+(on|at|from)$/i, '').trim();
  if (/^(event|appointment)$/i.test(title)) title = '';
  return { title, start, end, location, allDay };
}


// Find an upcoming event by title, or by time ("3pm", "tomorrow 10").
function findEvent(evs, query) {
  const up = (evs || []).filter((e) => e.end >= Date.now() - 3600000);
  const q = String(query || '').trim();
  const w = parseWhen(/^\d/.test(q) ? 'at ' + q : q);
  if (w.found && w.at && (w.hasTime || !w.rest)) {
    const at = +w.at;
    const dated = /\b(today|tomorrow|tonight|mon|tue|wed|thu|fri|sat|sun|\d{1,2}(st|nd|rd|th)|jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec|next)/i.test(q);
    const tod = (ts) => { const d = new Date(ts); return d.getHours() * 60 + d.getMinutes(); };
    const near = up.filter((e) => (w.hasTime ? (dated ? Math.abs(e.start - at) < 46 * 60000 : Math.abs(tod(e.start) - tod(at)) < 31) : new Date(e.start).toDateString() === new Date(at).toDateString()));
    const byTitle = w.rest ? bestMatch(near, w.rest, (e) => e.title) : null;
    if (byTitle || near.length) return byTitle || near.sort((a, b) => a.start - b.start)[0];
  }
  return bestMatch(up, q, (e) => e.title);
}

const MONTHS = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, sept: 9, oct: 10, nov: 11, dec: 12 };
function normBirthday(str) {
  const s = String(str).toLowerCase().trim(); let m, d, mo, y;
  if ((m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/))) { y = m[1]; mo = +m[2]; d = +m[3]; }
  else if ((m = s.match(/^(\d{1,2})(?:st|nd|rd|th)?(?:\s+of)?\s+([a-z]{3,9})\.?(?:,?\s+(\d{4}))?$/))) { d = +m[1]; mo = MONTHS[m[2].slice(0, 4) === 'sept' ? 'sept' : m[2].slice(0, 3)]; y = m[3]; }
  else if ((m = s.match(/^([a-z]{3,9})\.?\s+(\d{1,2})(?:st|nd|rd|th)?(?:,?\s+(\d{4}))?$/))) { mo = MONTHS[m[1].slice(0, 3)]; d = +m[2]; y = m[3]; }
  else if ((m = s.match(/^(\d{1,2})[/-](\d{1,2})(?:[/-](\d{2,4}))?$/))) { d = +m[1]; mo = +m[2]; y = m[3] && (m[3].length === 2 ? '19' + m[3] : m[3]); }
  if (!mo || !d || mo > 12 || d > 31) return null;
  const mmdd = `${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
  return y ? `${y}-${mmdd}` : mmdd;
}
function fmtBirthday(b) { const [mo, d] = b.slice(-5).split('-').map(Number); return new Date(2000, mo - 1, d).toLocaleDateString([], { day: 'numeric', month: 'long' }); }
function daysUntilBirthday(b) {
  const [mo, d] = b.slice(-5).split('-').map(Number); const now = new Date(); now.setHours(0, 0, 0, 0);
  let n = new Date(now.getFullYear(), mo - 1, d); if (n < now) n = new Date(now.getFullYear() + 1, mo - 1, d);
  return Math.round((n - now) / 864e5);
}
function daysUntil(ts) { const now = new Date(); now.setHours(0, 0, 0, 0); return Math.round((ts - now) / 864e5); }
const CATS = { Food: /lunch|dinner|breakfast|food|snack|coffee|tea|restaurant|swiggy|zomato|meal|groceries|grocery/i, Travel: /cab|uber|ola|taxi|auto|fuel|petrol|diesel|flight|train|bus|metro|travel|parking|toll/i, Shopping: /amazon|flipkart|shopping|clothes|shoes|gift/i, Bills: /bill|electricity|internet|wifi|rent|recharge|phone|emi|insurance|subscription|netflix/i, Health: /medicine|doctor|pharmacy|hospital|gym|health/i, Fun: /movie|game|party|outing|fun/i };
function guessCategory(text) { const t = String(text || ''); for (const [c, re] of Object.entries(CATS)) if (re.test(t)) return c; const w = t.trim().split(/\s+/)[0]; return w ? w.charAt(0).toUpperCase() + w.slice(1).toLowerCase() : 'Other'; }
function monthTotal(list) { const now = new Date(); const from = +new Date(now.getFullYear(), now.getMonth(), 1); return (list || []).filter((e) => e.t >= from).reduce((a, e) => a + e.amount, 0); }
function fmtMoney(n) { return Number(n).toLocaleString('en-IN', { maximumFractionDigits: 2 }); }

// --------------------------------------------------------------- actions
// Each returns { text, open?, confirm? }. needsConfirm actions ask Yes/No first.
const ACTIONS = {
  async open_app({ name }, ctx) {
    const raw = String(name || '').trim().replace(/^(the|my)\s+/i, '').replace(/\s+(app|application|program|shortcut)$/i, '');
    const sc = (ctx.store.get().shortcuts || []).find((x) => x.name.toLowerCase() === raw.toLowerCase());
    if (sc) return ACTIONS.shortcut_open({ id: sc.id }, ctx);
    const key = raw.toLowerCase();
    const alias = APP_ALIASES[key];
    if (alias && (BUILTIN.has(alias) || alias.endsWith(':'))) {
      if (alias.endsWith(':')) await shell.openExternal(alias); else await startCmd(alias);
      return { text: `Opening ${raw}.` };
    }
    const hit = findStartApp(key);
    if (hit) { spawnDetached('explorer.exe', [`shell:AppsFolder\\${hit.AppID}`]); return { text: `Opening ${hit.Name}.` }; }
    if (alias) { const ok = await startCmd(alias); if (ok) return { text: `Opening ${raw}.` }; }
    if (/^[\w.\- ]+$/.test(raw)) {
      const ok = await startCmd(`"${raw.replace(/"/g, '')}"`);
      if (ok) return { text: `Opening ${raw}.` };
    }
    return { text: `I couldn't find an app called "${raw}". Try the name as it appears in the Start menu.`, error: true };
  },

  async close_app({ name }, ctx) {
    const raw = String(name || '').trim().replace(/^(the|my)\s+/i, '').replace(/\s+(app|application|window)$/i, '');
    const proc = (PROCESS_ALIASES[raw.toLowerCase()] || raw).replace(/[^\w.\- ]/g, '').replace(/\.exe$/i, '');
    if (proc.length < 3) return { text: 'Please give me the full app name to close.', error: true };
    const script = `
$n='${psq(proc)}'
$self=${process.pid}
$skip=@('explorer','dwm','csrss','winlogon','system','svchost','lsass','services')
$p = Get-Process | Where-Object { $_.ProcessName -like "*$n*" -and $_.Id -ne $self -and $skip -notcontains $_.ProcessName.ToLower() -and $_.ProcessName -notmatch 'nova companion|electron' }
if (-not $p) { $p = Get-Process | Where-Object { $_.MainWindowTitle -like "*$n*" -and $_.Id -ne $self -and $_.ProcessName -notmatch 'nova companion|electron' } }
if (-not $p) { 'NONE' } else { $p | ForEach-Object { [void]$_.CloseMainWindow() }; ($p | Select-Object -ExpandProperty ProcessName -Unique) -join ', ' }`;
    const out = (await ctx.ps.run(script)).trim();
    if (out === 'NONE' || !out) return { text: `${raw} doesn't seem to be running.` };
    return { text: `Closing ${out}. Apps with unsaved work may ask you first.` };
  },

  async open_url({ url }) {
    let u = String(url || '').trim();
    if (!/^https?:\/\//i.test(u)) u = 'https://' + u;
    await shell.openExternal(u);
    return { text: `Opening ${u.replace(/^https?:\/\//, '')}.` };
  },

  async web_search({ query, site }) {
    const q = encodeURIComponent(String(query || '').trim());
    const url = site === 'youtube' ? `https://www.youtube.com/results?search_query=${q}` : `https://www.google.com/search?q=${q}`;
    await shell.openExternal(url);
    return { text: site === 'youtube' ? `Searching YouTube for "${query}".` : `Searching for "${query}".` };
  },

  async open_folder({ folder }) {
    const map = { downloads: 'downloads', download: 'downloads', documents: 'documents', document: 'documents', desktop: 'desktop', pictures: 'pictures', picture: 'pictures', music: 'music', videos: 'videos', video: 'videos', home: 'home' };
    const f = String(folder || '').trim();
    const key = map[f.toLowerCase()];
    const p = key ? app.getPath(key) : f.replace(/^["']|["']$/g, '');
    if (!key && !fs.existsSync(p)) return { text: `That folder doesn't exist: ${p}`, error: true };
    const err = await shell.openPath(p);
    return err ? { text: `Couldn't open it: ${err}`, error: true } : { text: `Opening ${key || p}.` };
  },

  async volume_set({ level }, ctx) {
    const v = pct(level);
    await ctx.ps.run(`[NovaAudio]::SetMute($false); [NovaAudio]::Set(${v / 100})`);
    return { text: `Volume set to ${v}%.` };
  },
  async volume_change({ delta }, ctx) {
    const d = Number(delta) || 10;
    const out = await ctx.ps.run(`[NovaAudio]::SetMute($false); [NovaAudio]::Set([NovaAudio]::Get() + ${d / 100}); [math]::Round([NovaAudio]::Get() * 100)`);
    return { text: `Volume ${d > 0 ? 'up' : 'down'} to ${out.trim()}%.` };
  },
  async mute({ on = true }, ctx) {
    const flag = on !== false && on !== 'false';
    await ctx.ps.run(`[NovaAudio]::SetMute($${flag})`);
    return { text: flag ? 'Muted.' : 'Unmuted.' };
  },
  async media({ key }, ctx) {
    const vk = { playpause: '0xB3', next: '0xB0', previous: '0xB1', stop: '0xB2' }[key] || '0xB3';
    await ctx.ps.run(`[NovaKeys]::Tap(${vk})`);
    return { text: { next: 'Next track.', previous: 'Previous track.', stop: 'Stopped.' }[key] || 'Play/pause.' };
  },
  async brightness({ level, delta }, ctx) {
    try {
      const cur = level == null ? `(Get-CimInstance -Namespace root/WMI -ClassName WmiMonitorBrightness | Select-Object -First 1).CurrentBrightness` : '0';
      const target = level != null ? pct(level) : `[math]::Max(0,[math]::Min(100, ${cur} + ${Number(delta) || 15}))`;
      const out = await ctx.ps.run(`$t = ${target}; $m = Get-CimInstance -Namespace root/WMI -ClassName WmiMonitorBrightnessMethods | Select-Object -First 1; Invoke-CimMethod -InputObject $m -MethodName WmiSetBrightness -Arguments @{Timeout=1; Brightness=[byte]$t} | Out-Null; $t`);
      return { text: `Brightness set to ${out.trim()}%.` };
    } catch (e) {
      return { text: 'Brightness control only works on built-in laptop screens, not external monitors.', error: true };
    }
  },
  async minimize_all(_, ctx) {
    await ctx.ps.run('(New-Object -ComObject Shell.Application).MinimizeAll()');
    return { text: 'Minimized everything.' };
  },
  async lock() {
    spawnDetached('rundll32.exe', ['user32.dll,LockWorkStation']);
    return { text: 'Locking your PC.' };
  },
  async sleep(_, ctx) {
    setTimeout(() => ctx.ps.run("Add-Type -AssemblyName System.Windows.Forms; [void][System.Windows.Forms.Application]::SetSuspendState('Suspend', $false, $false)").catch(() => {}), 1200);
    return { text: 'Going to sleep. Good night!' };
  },
  async shutdown() { spawnDetached('shutdown.exe', ['/s', '/t', '10']); return { text: 'Shutting down in 10 seconds. Say "cancel shutdown" to stop it.' }; },
  async restart() { spawnDetached('shutdown.exe', ['/r', '/t', '10']); return { text: 'Restarting in 10 seconds. Say "cancel shutdown" to stop it.' }; },
  async cancel_shutdown() { spawnDetached('shutdown.exe', ['/a']); return { text: 'Cancelled.' }; },
  async empty_recycle_bin(_, ctx) {
    await ctx.ps.run("Clear-RecycleBin -Force -ErrorAction SilentlyContinue; 'ok'", 30000);
    return { text: 'Recycle bin emptied.' };
  },

  async screenshot(_, ctx) {
    await ctx.hideForCapture(true);
    try {
      const displays = screen.getAllDisplays();
      const maxW = Math.max(...displays.map((d) => d.size.width * d.scaleFactor));
      const maxH = Math.max(...displays.map((d) => d.size.height * d.scaleFactor));
      const sources = await desktopCapturer.getSources({ types: ['screen'], thumbnailSize: { width: maxW, height: maxH } });
      const dir = path.join(app.getPath('pictures'), 'Nova');
      fs.mkdirSync(dir, { recursive: true });
      const stamp = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 15).replace(/(\d{8})(\d{6})/, '$1_$2');
      const files = sources.map((s, i) => {
        const f = path.join(dir, `Screenshot_${stamp}${sources.length > 1 ? '_' + (i + 1) : ''}.png`);
        fs.writeFileSync(f, s.thumbnail.toPNG());
        return f;
      });
      clipboard.writeImage(sources[0].thumbnail);
      return { text: `Screenshot saved to Pictures\\Nova and copied to the clipboard.`, open: files[0] };
    } finally { await ctx.hideForCapture(false); }
  },

  // ---------- timers, reminders, alarms
  async timer({ ms, label }, ctx) {
    const d = Math.max(1000, Number(ms) || 60000);
    if (label) label = label.charAt(0).toUpperCase() + label.slice(1);
    ctx.scheduler.add({ text: label ? `${label} (${fmtDuration(d)} timer)` : `${fmtDuration(d)} timer`, at: Date.now() + d, kind: 'timer' });
    return { text: `Timer set for ${fmtDuration(d)}${label ? ` (${label})` : ''}.` };
  },
  async timer_cancel(_, ctx) {
    const timers = ctx.scheduler.upcoming().filter((r) => r.kind === 'timer');
    if (!timers.length) return { text: 'No timers running.' };
    timers.forEach((t) => ctx.scheduler.remove(t.id));
    return { text: `Cancelled ${timers.length} timer${timers.length > 1 ? 's' : ''}.` };
  },
  async reminder({ text, when, at, inMs, repeat, alarm }, ctx) {
    let date = null, rep = repeat || null, body = String(text || '').trim();
    if (inMs) date = new Date(Date.now() + Number(inMs));
    else if (at && /^\d{4}-\d{2}-\d{2}/.test(at)) date = new Date(at);
    else if (at || when) {
      const r = parseWhen(`${when || ''} ${at ? 'at ' + at : ''}`);
      date = r.at; rep = rep || r.repeat;
    }
    if (!date && body) { const r = parseWhen(body); if (r.at) { date = r.at; rep = rep || r.repeat; body = r.rest; } }
    if (!date || isNaN(date)) return { text: 'When should I remind you? e.g. "remind me tomorrow at 4:30 to call Vivek".', error: true };
    const kind = alarm ? 'alarm' : 'reminder';
    const r = ctx.scheduler.add({ text: body || (alarm ? 'Alarm' : 'Reminder'), at: date, repeat: rep, kind });
    return { text: alarm ? `⏰ Alarm set for ${describeWhen(r.at, r.repeat)}.` : `Got it. I'll remind you ${describeWhen(r.at, r.repeat)}: ${r.text}` };
  },
  async reminder_list({ scope }, ctx) {
    let list = ctx.scheduler.upcoming();
    if (scope === 'today') { const end = new Date(); end.setHours(23, 59, 59, 999); list = list.filter((r) => r.at <= end); }
    if (!list.length) return { text: scope === 'today' ? 'Nothing scheduled for the rest of today.' : 'You have no upcoming reminders.' };
    return { text: list.slice(0, 12).map((r) => `• ${r.kind === 'alarm' ? '⏰ ' : r.kind === 'timer' ? '⏱ ' : ''}${r.text}: ${describeWhen(r.at, r.repeat)}`).join('\n'), speak: `You have ${list.length} upcoming reminder${list.length > 1 ? 's' : ''}. Next: ${list[0].text}, ${describeWhen(list[0].at, list[0].repeat)}.` };
  },
  async reminder_delete({ id, query, all }, ctx) {
    const list = ctx.scheduler.upcoming(500);
    if (all) { list.forEach((r) => ctx.scheduler.remove(r.id)); return { text: `Deleted ${list.length} reminders.` }; }
    const hit = id ? list.find((r) => r.id === id) : bestMatch(list, query, (r) => r.text);
    if (!hit) return { text: `I couldn't find a reminder matching "${query}".`, error: true };
    ctx.scheduler.remove(hit.id);
    return { text: `Deleted reminder: ${hit.text}` };
  },
  async reminder_snooze({ id, minutes = 10 }, ctx) {
    const s = ctx.scheduler.snooze(id || ctx.lastFired && ctx.lastFired.id, Number(minutes) * 60000, ctx.lastFired);
    return s ? { text: `Snoozed for ${minutes} minutes.` } : { text: 'Nothing to snooze.', error: true };
  },

  // ---------- tasks
  async task_add({ text, due, priority }, ctx) {
    let body = String(text || '').trim(), dueAt = null;
    let pr = priority || 'normal';
    if (/\b(urgent|asap|high priority|important)\b/i.test(body)) { pr = 'high'; body = body.replace(/\s*\b(urgent|asap|high priority|important)\b\s*/gi, ' ').trim(); }
    if (/\blow priority\b/i.test(body)) { pr = 'low'; body = body.replace(/\s*\blow priority\b\s*/gi, ' ').trim(); }
    if (due) { const r = /^\d{4}-\d{2}-\d{2}/.test(due) ? { at: new Date(due) } : parseWhen(due); dueAt = r.at ? +r.at : null; }
    else { const r = parseWhen(body); if (r.at) { dueAt = +r.at; body = r.rest.replace(/\s+(by|due)$/i, ''); } }
    if (!body) return { text: 'What is the task?', error: true };
    const task = { id: ctx.store.uid('t'), text: body.charAt(0).toUpperCase() + body.slice(1), due: dueAt, priority: pr, done: false, created: Date.now() };
    ctx.store.set({ tasks: ctx.store.get().tasks.concat([task]) });
    return { text: `Added task: ${task.text}${dueAt ? ` (due ${describeWhen(dueAt)})` : ''}${pr === 'high' ? ' ❗' : ''}` };
  },
  async task_list({ scope }, ctx) {
    let open = ctx.store.get().tasks.filter((t) => !t.done);
    if (scope === 'today') { const end = new Date(); end.setHours(23, 59, 59, 999); open = open.filter((t) => t.due && t.due <= end || t.priority === 'high'); }
    if (!open.length) return { text: scope === 'today' ? 'Nothing due today. 🎉' : 'Your task list is empty. 🎉' };
    const order = { high: 0, normal: 1, low: 2 };
    open.sort((a, b) => (order[a.priority] - order[b.priority]) || ((a.due || 9e15) - (b.due || 9e15)));
    return { text: open.slice(0, 15).map((t) => `${t.priority === 'high' ? '❗' : '☐'} ${t.text}${t.due ? ` · ${describeWhen(t.due)}` : ''}`).join('\n'), speak: `You have ${open.length} open task${open.length > 1 ? 's' : ''}. Top one: ${open[0].text}.` };
  },
  async task_done({ id, query }, ctx) {
    const tasks = ctx.store.get().tasks;
    const hit = id ? tasks.find((t) => t.id === id) : bestMatch(tasks.filter((t) => !t.done), query, (t) => t.text);
    if (!hit && !id && bestMatch(ctx.store.get().habits || [], query, (h) => h.name)) return ACTIONS.habit_log({ query }, ctx);
    if (!hit) return { text: `I couldn't find an open task matching "${query}".`, error: true };
    ctx.store.set({ tasks: tasks.map((t) => (t.id === hit.id ? { ...t, done: true, doneAt: Date.now() } : t)) });
    const left = tasks.filter((t) => !t.done && t.id !== hit.id).length;
    return { text: `✅ Done: ${hit.text}. ${left ? `${left} left.` : 'All clear!'}` };
  },
  async task_toggle({ id }, ctx) {
    const tasks = ctx.store.get().tasks.map((t) => (t.id === id ? { ...t, done: !t.done, doneAt: t.done ? null : Date.now() } : t));
    ctx.store.set({ tasks });
    return { text: 'Updated.', silent: true };
  },
  async task_update({ id, patch }, ctx) {
    ctx.store.set({ tasks: ctx.store.get().tasks.map((t) => (t.id === id ? { ...t, ...patch } : t)) });
    return { text: 'Updated.', silent: true };
  },
  async task_delete({ id, query }, ctx) {
    const tasks = ctx.store.get().tasks;
    const hit = id ? tasks.find((t) => t.id === id) : bestMatch(tasks, query, (t) => t.text);
    if (!hit) return { text: `I couldn't find a task matching "${query}".`, error: true };
    ctx.store.set({ tasks: tasks.filter((t) => t.id !== hit.id) });
    return { text: `Deleted task: ${hit.text}` };
  },
  async tasks_clear_done(_, ctx) {
    const tasks = ctx.store.get().tasks;
    const n = tasks.filter((t) => t.done).length;
    ctx.store.set({ tasks: tasks.filter((t) => !t.done) });
    return { text: `Cleared ${n} completed task${n === 1 ? '' : 's'}.` };
  },

  // ---------- notes
  async note_add({ text }, ctx) {
    const notes = ctx.store.get().notes.concat([{ id: ctx.store.uid('n'), t: Date.now(), text: String(text).trim() }]);
    ctx.store.set({ notes });
    return { text: `Noted. You have ${notes.length} note${notes.length === 1 ? '' : 's'}.` };
  },
  async notes_list({ query }, ctx) {
    let notes = ctx.store.get().notes;
    if (query) notes = notes.filter((n) => n.text.toLowerCase().includes(String(query).toLowerCase()));
    if (!notes.length) return { text: query ? `No notes about "${query}".` : 'You have no notes yet.' };
    return { text: notes.slice(-15).map((n) => `• ${n.text}`).join('\n'), speak: `You have ${notes.length} note${notes.length > 1 ? 's' : ''}.` };
  },
  async note_delete({ id, query }, ctx) {
    const notes = ctx.store.get().notes;
    const hit = id ? notes.find((n) => n.id === id) : bestMatch(notes, query, (n) => n.text);
    if (!hit) return { text: `No note matching "${query}".`, error: true };
    ctx.store.set({ notes: notes.filter((n) => n.id !== hit.id) });
    return { text: `Deleted note: ${hit.text.slice(0, 60)}` };
  },
  async notes_clear(_, ctx) { ctx.store.set({ notes: [] }); return { text: 'All notes cleared.' }; },

  // ---------- routines & briefing
  async routine_run({ name }, ctx) { return ctx.runRoutine(name); },
  async routine_save({ routine }, ctx) {
    const list = ctx.store.get().routines;
    const r = { id: routine.id || ctx.store.uid('r'), name: String(routine.name || 'My routine').trim(), steps: (routine.steps || []).map((x) => String(x).trim()).filter(Boolean) };
    ctx.store.set({ routines: list.some((x) => x.id === r.id) ? list.map((x) => (x.id === r.id ? r : x)) : list.concat([r]) });
    return { text: `Saved routine "${r.name}".` };
  },
  async routine_delete({ id }, ctx) { ctx.store.set({ routines: ctx.store.get().routines.filter((r) => r.id !== id) }); return { text: 'Routine deleted.' }; },
  async briefing(_, ctx) {
    const s = ctx.store.get();
    const now = new Date();
    const h = now.getHours();
    const part = h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
    const lines = [`${part}, ${s.userName || 'there'}! It's ${now.toLocaleDateString([], { weekday: 'long', day: 'numeric', month: 'long' })}, ${fmtTime(now)}.`];
    try { lines.push('🌤 ' + await info.weather({}, s.city)); } catch (e) { /* offline */ }
    const end = new Date(); end.setHours(23, 59, 59, 999);
    const evs = (s.events || []).filter((e) => e.start >= Date.now() - 3600000 && e.start <= end).sort((a, b) => a.start - b.start);
    lines.push(evs.length ? `📅 ${evs.map((e) => `${e.allDay ? 'All day' : fmtTime(new Date(e.start))} ${e.title}`).join(', ')}.` : '📅 No more events today.');
    const rem = ctx.scheduler.upcoming().filter((r) => r.at <= end && r.kind !== 'timer');
    lines.push(rem.length ? `🔔 Reminders: ${rem.map((r) => `${r.text} (${fmtTime(new Date(r.at))})`).join(', ')}.` : '🔔 No more reminders today.');
    const hk = todayKey();
    const hab = (s.habits || []).map((h) => `${h.icon || '•'} ${h.name} ${(h.log && h.log[hk]) || 0}/${h.target || 1}`);
    if (hab.length) lines.push(`🔁 Habits: ${hab.join(' · ')}`);
    const open = s.tasks.filter((t) => !t.done);
    const due = open.filter((t) => t.due && t.due <= end);
    const high = open.filter((t) => t.priority === 'high' && !due.includes(t));
    if (open.length) lines.push(`✅ ${open.length} open task${open.length > 1 ? 's' : ''}${due.length ? `, due today: ${due.map((t) => t.text).join(', ')}` : ''}${high.length ? `. Priority: ${high.map((t) => t.text).join(', ')}` : ''}.`);
    else lines.push('✅ No open tasks.');
    return { text: lines.join('\n') };
  },

  async clipboard_read() {
    const t = clipboard.readText().trim();
    if (!t) return { text: 'Your clipboard has no text.' };
    return { text: t.length > 800 ? t.slice(0, 800) + '…' : t, speak: t.length > 300 ? 'Here is what is on your clipboard.' : t };
  },

  async time() { return { text: `It's ${fmtTime(new Date())}.` }; },
  async date() { return { text: `Today is ${new Date().toLocaleDateString([], { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}.` }; },
  async battery(_, ctx) {
    const out = (await ctx.ps.run("$b = Get-CimInstance Win32_Battery | Select-Object -First 1; if ($b) { \"$($b.EstimatedChargeRemaining)|$($b.BatteryStatus)\" } else { 'NONE' }")).trim();
    if (out === 'NONE') return { text: 'No battery found. You are on desktop power.' };
    const [lvl, st] = out.split('|');
    return { text: `Battery is at ${lvl}%${st === '2' ? ', charging' : ''}.` };
  },
  async system_info() {
    const sample = () => os.cpus().map((c) => c.times);
    const a = sample(); await new Promise((r) => setTimeout(r, 250)); const b = sample();
    let idle = 0, total = 0;
    b.forEach((t, i) => {
      const p = a[i];
      const tt = Object.keys(t).reduce((s, k) => s + (t[k] - p[k]), 0);
      total += tt; idle += t.idle - p.idle;
    });
    const cpu = total ? Math.round(100 * (1 - idle / total)) : 0;
    const used = os.totalmem() - os.freemem();
    const gb = (n) => (n / 1073741824).toFixed(1);
    const up = os.uptime();
    return { text: `CPU ${cpu}% · RAM ${gb(used)} / ${gb(os.totalmem())} GB (${Math.round(100 * used / os.totalmem())}%) · Up ${Math.floor(up / 3600)}h ${Math.floor((up % 3600) / 60)}m` };
  },


  // ---------- mouse & keyboard (ctx.input* helpers live in main.js)
  async mouse_move({ x, y, to, dx, dy }, ctx) {
    const p = await ctx.resolvePoint({ x, y, to, dx, dy });
    await ctx.ps.run(`[NovaInput]::MoveTo(${p.x}, ${p.y})`);
    return { text: 'Moved the mouse.' };
  },
  async mouse_click({ x, y, button = 'left', double = false, count }, ctx) {
    const n = count || (double ? 2 : 1);
    const b = ['left', 'right', 'middle'].includes(button) ? button : 'left';
    await ctx.clickThrough(async () => {
      if (x != null && y != null) { const p = await ctx.resolvePoint({ x, y }); await ctx.ps.run(`[NovaInput]::MoveTo(${p.x}, ${p.y}); Start-Sleep -Milliseconds 40`); }
      await ctx.ps.run(`[NovaInput]::Click('${b}', ${Math.min(3, n)})`);
    });
    return { text: `${n === 2 ? 'Double-clicked' : b === 'right' ? 'Right-clicked' : 'Clicked'}.` };
  },
  async drag({ x1, y1, x2, y2 }, ctx) {
    const a = await ctx.resolvePoint({ x: x1, y: y1 }), b = await ctx.resolvePoint({ x: x2, y: y2 });
    await ctx.clickThrough(() => ctx.ps.run(`[NovaInput]::Drag(${a.x}, ${a.y}, ${b.x}, ${b.y})`));
    return { text: 'Dragged.' };
  },
  async scroll({ amount = 5, direction, horizontal = false }, ctx) {
    let n = Number(amount) || 5;
    if (direction === 'up' || direction === 'left') n = -Math.abs(n);
    if (direction === 'down' || direction === 'right') n = Math.abs(n);
    await ctx.focusTarget();
    await ctx.ps.run(`[NovaInput]::Scroll(${-n}, $${!!horizontal})`); // positive wheel = up
    return { text: `Scrolled ${n < 0 ? (horizontal ? 'left' : 'up') : (horizontal ? 'right' : 'down')}.` };
  },
  async type_text({ text }, ctx) {
    const t = String(text == null ? '' : text);
    if (!t) return { text: 'Nothing to type.', error: true };
    const win = await ctx.focusTarget();
    await ctx.ps.run(`[NovaInput]::Type('${psq(t)}')`, 30000);
    return { text: `Typed ${t.length > 40 ? t.length + ' characters' : `"${t}"`}${win ? ` into ${win}` : ''}.`, silent: true };
  },
  async press_keys({ keys, times = 1 }, ctx) {
    const vks = parseKeys(keys);
    if (!vks) return { text: `I don't know the key "${keys}".`, error: true };
    await ctx.focusTarget();
    const n = Math.max(1, Math.min(50, Number(times) || 1));
    await ctx.ps.run(`1..${n} | ForEach-Object { [NovaInput]::Combo(@(${vks.join(',')})); Start-Sleep -Milliseconds 25 }`);
    return { text: `Pressed ${keys}${n > 1 ? ` ×${n}` : ''}.`, silent: true };
  },
  async focus_window({ title }, ctx) {
    const raw = String(title || '').trim().replace(/^(the|my)\s+/i, '').replace(/\s+(window|app)$/i, '');
    const name = PROCESS_ALIASES[raw.toLowerCase()] || raw;
    const out = (await ctx.ps.run(`[NovaInput]::FocusMatch('${psq(name)}', ${process.pid})`)).trim();
    if (!out) return { text: `I couldn't find an open window for "${raw}".`, error: true };
    ctx.setTarget(out);
    return { text: `Switched to ${out.split('|')[3] || raw}.` };
  },
  async wait({ ms = 800 }) { await new Promise((r) => setTimeout(r, Math.min(10000, Number(ms) || 800))); return { text: '', silent: true }; },
  async dictation({ on = true }) {
    return { text: on ? 'Dictation on. Everything you say will be typed. Say "new line" for Enter, "stop dictation" to finish.' : 'Dictation off.', mode: on ? 'dictation' : 'normal' };
  },

  // ---------- quick facts
  async weather({ city, day }, ctx) {
    try { return { text: await info.weather({ city, day }, ctx.store.get().city) }; }
    catch (e) { return { text: e.name === 'AbortError' ? 'The weather service timed out.' : String(e.message), error: true }; }
  },
  async calc({ expr }) {
    const v = info.calc(expr);
    if (v == null) return { text: `I couldn't calculate "${expr}".`, error: true };
    return { text: `${String(expr).trim()} = ${v.toLocaleString('en-IN', { maximumFractionDigits: 6 })}` };
  },
  async year() { return { text: `It's ${new Date().getFullYear()}.` }; },
  async month() { return { text: `It's ${new Date().toLocaleDateString([], { month: 'long', year: 'numeric' })}.` }; },
  async day() { return { text: `Today is ${new Date().toLocaleDateString([], { weekday: 'long' })}.` }; },
  async week() { return { text: `It's week ${info.isoWeek()} of ${new Date().getFullYear()}.` }; },
  async ip() { const ip = info.localIp(); return { text: ip ? `Your local IP address is ${ip}.` : 'You don\'t seem to be connected to a network.' }; },
  async greet({ kind }, ctx) {
    const s = ctx.store.get();
    const h = new Date().getHours();
    const part = h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
    const replies = {
      hello: `${part}, ${s.userName || 'there'}! What can I do for you?`,
      thanks: 'Anytime! 😊'.replace(' 😊', ''),
      who: `I'm ${s.assistantName}, your desktop assistant. I can control your PC, see your screen, type for you and answer questions. Say "help" for ideas.`,
      how: 'All systems running smoothly. How can I help?',
      bye: 'See you soon! I\'ll be right here.',
      night: (() => {
        const tm = new Date(); tm.setDate(tm.getDate() + 1); tm.setHours(0, 0, 0, 0); const te = +tm + 864e5;
        const open = (s.tasks || []).filter((t) => !t.done).length;
        const first = (s.events || []).filter((e) => e.start >= +tm && e.start < te && !e.allDay).sort((a, b) => a.start - b.start)[0];
        return `Good night${s.userName ? ', ' + s.userName : ''}! 🌙 ${open ? `${open} task${open > 1 ? 's' : ''} waiting for tomorrow` : 'Your task list is clear'}${first ? `, and your first event is ${first.title} at ${fmtTime(new Date(first.start))}` : ''}. Rest well.`;
      })()
    };
    return { text: replies[kind] || replies.hello };
  },


  // ---------- calendar events
  async event_add({ title, when, start, end, allDay, location, remindMin, notes }, ctx) {
    let st = start ? +new Date(start) : null, en = end ? +new Date(end) : null, ttl = String(title || '').trim(), loc = location || '';
    if (!st) {
      const p = parseEvent(when ? `${ttl} ${when}` : ttl);
      if (!p.start) return { text: 'When is it? e.g. "add event team sync tomorrow 3 to 4 pm".', error: true };
      st = p.start; en = p.end; ttl = p.title || ttl; loc = loc || p.location; allDay = allDay != null ? allDay : p.allDay;
    }
    if (!en) en = st + 60 * 60000;
    const ev = { id: ctx.store.uid('e'), title: ttl ? ttl.charAt(0).toUpperCase() + ttl.slice(1) : 'Event', start: st, end: en, allDay: !!allDay, location: loc, notes: notes || '', remindMin: remindMin == null ? (allDay ? null : 10) : Number(remindMin), notifiedAt: null, created: Date.now() };
    ctx.store.set({ events: (ctx.store.get().events || []).concat([ev]) });
    return { text: `📅 Added "${ev.title}" ${ev.allDay ? describeWhen(st).replace(/ at .*/, '') + ' (all day)' : `${describeWhen(st)}–${fmtTime(new Date(en))}`}${loc ? ' · ' + loc : ''}${ev.remindMin != null ? `. I'll remind you ${ev.remindMin} min before.` : ''}` };
  },
  async event_list({ scope = 'today' }, ctx) { return ACTIONS.agenda({ scope }, ctx); },
  async event_delete({ id, query }, ctx) {
    const evs = ctx.store.get().events || [];
    const hit = id ? evs.find((e) => e.id === id) : findEvent(evs, query);
    if (!hit) return { text: `No upcoming event matching "${query}".`, error: true };
    ctx.store.set({ events: evs.filter((e) => e.id !== hit.id) });
    return { text: `Deleted event: ${hit.title}` };
  },
  // "move my dentist appointment to friday" — events first, then reminders, then tasks.
  async reschedule({ query, when }, ctx) {
    const s = ctx.store.get(); const q = String(query || '').replace(/\s+(meeting|event|appointment|appt|reminder|task)$/i, '');
    const w = parseWhen(when); if (!w.at) return { text: `When should I move it to? e.g. "move ${q} to Friday 3 pm".`, error: true };
    const keepTime = (oldTs) => { const d = new Date(w.at); if (!w.hasTime) { const o = new Date(oldTs); d.setHours(o.getHours(), o.getMinutes(), 0, 0); } return +d; };
    const ev = findEvent(s.events || [], q);
    if (ev) {
      const start = ev.allDay ? +new Date(new Date(w.at).setHours(0, 0, 0, 0)) : keepTime(ev.start), end = start + (ev.end - ev.start);
      ctx.store.set({ events: s.events.map((e) => (e.id === ev.id ? { ...e, start, end, notifiedAt: null } : e)) });
      return { text: `📅 Moved "${ev.title}" to ${ev.allDay ? describeWhen(start).replace(/ at .*/, '') : describeWhen(start)}.` };
    }
    const rem = bestMatch(ctx.scheduler.upcoming(300).filter((r) => r.kind !== 'timer'), q, (r) => r.text);
    if (rem) { const at = keepTime(rem.at); ctx.scheduler.save(ctx.scheduler.list().map((r) => (r.id === rem.id ? { ...r, at } : r))); return { text: `🔔 Moved "${rem.text}" to ${describeWhen(at, rem.repeat)}.` }; }
    const task = bestMatch((s.tasks || []).filter((t) => !t.done), q, (t) => t.text);
    if (task) { const due = task.due ? keepTime(task.due) : +w.at; ctx.store.set({ tasks: s.tasks.map((t) => (t.id === task.id ? { ...t, due } : t)) }); return { text: `✅ "${task.text}" is now due ${describeWhen(due)}.` }; }
    return { text: `I couldn't find an event, reminder or task matching "${q}".`, error: true };
  },
  // "going for lunch" / "brb" / "i'm back"
  async away({ reason = 'away', minutes = 15, back }, ctx) {
    const s = ctx.store.get();
    if (back) {
      const a = s.away; if (!a) return { text: `Welcome back${s.userName ? ', ' + s.userName : ''}! 👋` };
      ctx.store.set({ away: null, ...(a.setDnd ? { dnd: false } : {}) });
      const missed = (s.messages || []).filter((m) => m.role === 'alert' && m.t >= a.since).length;
      return { text: `Welcome back! 👋 You were away ${Math.max(1, Math.round((Date.now() - a.since) / 60000))} min.${missed ? ` ${missed} alert${missed > 1 ? 's' : ''} came in while you were gone.` : ' Nothing came in.'}` };
    }
    const m = Math.max(5, Math.min(240, Number(minutes) || 15));
    ctx.store.set({ away: { reason, since: Date.now(), until: Date.now() + m * 60000, setDnd: !s.dnd }, dnd: true });
    const nice = { lunch: 'Enjoy your lunch! 🍱', dinner: 'Enjoy dinner! 🍽', breakfast: 'Enjoy breakfast! 🥐', coffee: 'Enjoy your coffee! ☕', tea: 'Enjoy your tea! 🍵', chai: 'Enjoy your chai! 🍵', walk: 'Enjoy the walk! 🚶', gym: 'Have a great workout! 💪', nap: 'Sleep well! 😴', meeting: 'Good luck in the meeting!', call: 'Good luck on the call!' }[reason.replace(/^a /, '')] || 'See you in a bit!';
    return { text: `${nice} I'll stay quiet for ~${m} min (reminders still come through). Say "I'm back" when you return.` };
  },
  async event_update({ id, patch }, ctx) {
    ctx.store.set({ events: (ctx.store.get().events || []).map((e) => (e.id === id ? { ...e, ...patch, notifiedAt: patch.start ? null : e.notifiedAt } : e)) });
    return { text: 'Event updated.', silent: true };
  },
  async agenda({ scope = 'today' }, ctx) {
    const s = ctx.store.get();
    const from = new Date(); const to = new Date(); to.setHours(23, 59, 59, 999);
    if (scope === 'tomorrow') { from.setDate(from.getDate() + 1); from.setHours(0, 0, 0, 0); to.setDate(to.getDate() + 1); }
    if (scope === 'week') to.setDate(to.getDate() + 7);
    const items = [];
    for (const e of s.events || []) if (e.end >= +from && e.start <= +to) items.push({ at: e.start, line: `📅 ${e.allDay ? 'All day' : fmtTime(new Date(e.start))} ${e.title}${e.location ? ' · ' + e.location : ''}`, day: e.start });
    for (const r of ctx.scheduler.upcoming(300)) if (r.at >= +from && r.at <= +to && r.kind !== 'timer') items.push({ at: r.at, line: `${r.kind === 'alarm' ? '⏰' : '🔔'} ${fmtTime(new Date(r.at))} ${r.text}`, day: r.at });
    for (const t of s.tasks) if (!t.done && t.due && t.due >= +from - 864e5 * 30 && t.due <= +to) items.push({ at: t.due, line: `✅ ${t.due < Date.now() ? 'Overdue: ' : 'Due: '}${t.text}`, day: t.due });
    items.sort((a, b) => a.at - b.at);
    const label = scope === 'tomorrow' ? 'tomorrow' : scope === 'week' ? 'in the next 7 days' : 'for the rest of today';
    if (!items.length) return { text: `Nothing ${label}. 🎉` };
    let out = [], lastDay = '';
    for (const it of items) {
      const d = new Date(it.day).toLocaleDateString([], { weekday: 'long', day: 'numeric', month: 'short' });
      if (scope === 'week' && d !== lastDay) { out.push(`— ${d}`); lastDay = d; }
      out.push(it.line);
    }
    return { text: out.join('\n'), speak: `You have ${items.length} thing${items.length > 1 ? 's' : ''} ${label}. First: ${items[0].line.replace(/^\S+\s/, '')}.` };
  },

  // ---------- habits
  async habit_log({ id, query, delta = 1 }, ctx) {
    const habits = ctx.store.get().habits || [];
    const h = id ? habits.find((x) => x.id === id) : bestMatch(habits, query, (x) => x.name);
    if (!h) return { text: `No habit called "${query}". Add it in Habits (or say "add habit ${query}").`, error: true };
    const k = todayKey();
    const log = { ...(h.log || {}) };
    log[k] = Math.max(0, (log[k] || 0) + Number(delta || 1));
    ctx.store.set({ habits: habits.map((x) => (x.id === h.id ? { ...x, log } : x)) });
    const n = log[k], tgt = h.target || 1;
    return { text: `${h.icon || '✓'} ${h.name}: ${n}/${tgt} today${n >= tgt ? ', goal reached! 🎉' : ''}${habitStreak({ ...h, log }) > 1 ? ` · ${habitStreak({ ...h, log })}-day streak` : ''}` };
  },
  async habit_add({ name, icon, target = 1 }, ctx) {
    const nm = String(name || '').trim(); if (!nm) return { text: 'What habit?', error: true };
    const h = { id: ctx.store.uid('h'), name: nm.charAt(0).toUpperCase() + nm.slice(1), icon: icon || '⭐', target: Math.max(1, Number(target) || 1), log: {}, created: Date.now() };
    ctx.store.set({ habits: (ctx.store.get().habits || []).concat([h]) });
    return { text: `Added habit: ${h.icon} ${h.name} (${h.target}× a day).` };
  },
  async habit_update({ id, patch }, ctx) { ctx.store.set({ habits: (ctx.store.get().habits || []).map((h) => (h.id === id ? { ...h, ...patch } : h)) }); return { text: 'Updated.', silent: true }; },
  async habit_delete({ id }, ctx) { ctx.store.set({ habits: (ctx.store.get().habits || []).filter((h) => h.id !== id) }); return { text: 'Habit removed.' }; },
  async habit_list(_, ctx) {
    const hs = ctx.store.get().habits || []; const k = todayKey();
    if (!hs.length) return { text: 'No habits yet. Say "add habit read 20 minutes".' };
    return { text: hs.map((h) => `${h.icon || '•'} ${h.name}: ${(h.log && h.log[k]) || 0}/${h.target || 1}${habitStreak(h) ? ` · 🔥 ${habitStreak(h)}` : ''}`).join('\n') };
  },

  // ---------- focus / pomodoro
  async focus_start({ minutes, label }, ctx) {
    const st = ctx.focus.start({ minutes, label });
    return { text: `🎯 Focus started: ${st.minutes} min${st.label ? ' on ' + st.label : ''}. I'll tell you when it's break time.` };
  },
  async focus_stop(_, ctx) { const was = ctx.focus.stop(); return { text: was.phase === 'idle' ? 'No focus session running.' : 'Focus session stopped.' }; },
  async focus_pause(_, ctx) { const st = ctx.focus.state(); if (st.paused) { ctx.focus.resume(); return { text: 'Focus resumed.' }; } ctx.focus.pause(); return { text: 'Focus paused.' }; },
  async focus_break({ long }, ctx) { const st = ctx.focus.startBreak(!!long); return { text: `☕ ${st.minutes}-minute break started.` }; },
  async focus_status(_, ctx) {
    const st = ctx.focus.state(), stats = ctx.focus.stats();
    const left = st.phase === 'idle' ? '' : `${st.phase === 'work' ? 'Focusing' : 'On a break'}${st.paused ? ' (paused)' : ''}: ${Math.ceil(((st.paused ? st.remaining : st.endsAt - Date.now())) / 60000)} min left. `;
    return { text: `${left}Today: ${stats.todayMin} focused minutes, ${stats.todayCount} session${stats.todayCount === 1 ? '' : 's'}.` };
  },

  // ---------- clipboard history
  async clipboard_history({ query }, ctx) {
    let list = ctx.store.get().clipboard || [];
    if (query) list = list.filter((c) => c.text.toLowerCase().includes(String(query).toLowerCase()));
    if (!list.length) return { text: query ? `Nothing in clipboard history matching "${query}".` : 'Clipboard history is empty.' };
    return { text: list.slice(0, 8).map((c, i) => `${i + 1}. ${c.text.replace(/\s+/g, ' ').slice(0, 90)}`).join('\n') + '\n(Open Clipboard in the app to copy any of these again.)', speak: `You have ${list.length} items in clipboard history.` };
  },
  async clipboard_copy({ id, index }, ctx) {
    const list = ctx.store.get().clipboard || [];
    const c = id ? list.find((x) => x.id === id) : list[(Number(index) || 1) - 1];
    if (!c) return { text: 'Not found in clipboard history.', error: true };
    ctx.suppressClip && ctx.suppressClip(c.text);
    clipboard.writeText(c.text);
    return { text: 'Copied to clipboard.', silent: true };
  },
  async clipboard_pin({ id }, ctx) { ctx.store.set({ clipboard: (ctx.store.get().clipboard || []).map((c) => (c.id === id ? { ...c, pinned: !c.pinned } : c)) }); return { text: 'Updated.', silent: true }; },
  async clipboard_delete({ id }, ctx) { ctx.store.set({ clipboard: (ctx.store.get().clipboard || []).filter((c) => c.id !== id) }); return { text: 'Removed.', silent: true }; },
  async clipboard_clear(_, ctx) { ctx.store.set({ clipboard: (ctx.store.get().clipboard || []).filter((c) => c.pinned) }); return { text: 'Clipboard history cleared (pinned items kept).' }; },

  // ---------- shortcuts (launcher tiles)
  async shortcut_open({ id, name }, ctx) {
    const list = ctx.store.get().shortcuts || [];
    const sc = id ? list.find((x) => x.id === id) : bestMatch(list, name, (x) => x.name);
    if (!sc) return { text: `No shortcut called "${name}".`, error: true };
    const t = String(sc.target || '').trim();
    if (sc.kind === 'url' || /^https?:\/\//i.test(t)) return ACTIONS.open_url({ url: t }, ctx);
    if (sc.kind === 'folder' || sc.kind === 'file' || /^[a-z]:\\|^\\\\/i.test(t) || ['downloads', 'documents', 'desktop', 'pictures', 'music', 'videos', 'home'].includes(t.toLowerCase())) return ACTIONS.open_folder({ folder: t }, ctx);
    if (sc.kind === 'command') return { text: `Running "${sc.name}".`, run: t };
    return ACTIONS.open_app({ name: t }, { ...ctx, store: { get: () => ({ ...ctx.store.get(), shortcuts: [] }) } });
  },
  async shortcut_add({ name, target, kind }, ctx) {
    const t = String(target || '').trim(); if (!t) return { text: 'What should it open?', error: true };
    const k = kind || (/^https?:\/\//i.test(t) || /^[\w-]+(\.[\w-]+)+(\/.*)?$/.test(t) ? 'url' : /^[a-z]:\\|^\\\\/i.test(t) ? (/\.\w{2,5}$/.test(t) ? 'file' : 'folder') : 'app');
    const sc = { id: ctx.store.uid('s'), name: String(name || t).trim(), target: k === 'url' && !/^https?:/i.test(t) ? 'https://' + t : t, kind: k };
    ctx.store.set({ shortcuts: (ctx.store.get().shortcuts || []).concat([sc]) });
    return { text: `Added shortcut "${sc.name}". Say "open ${sc.name}" any time.` };
  },
  async shortcut_delete({ id }, ctx) { ctx.store.set({ shortcuts: (ctx.store.get().shortcuts || []).filter((x) => x.id !== id) }); return { text: 'Shortcut removed.', silent: true }; },

  // ---------- wellbeing nudges
  async wellbeing_set({ key, on }, ctx) {
    const map = { water: 'water', stretch: 'stretch', break: 'stretch', breaks: 'stretch', eye: 'eyes', eyes: 'eyes' };
    const k = map[String(key).toLowerCase()] || 'stretch';
    ctx.store.set({ wellbeing: { [k]: !!on } });
    const w = ctx.store.get().wellbeing;
    return { text: on ? `Okay, I'll nudge you about ${k === 'eyes' ? 'eye rest' : k} every ${w[k + 'Every']} minutes.` : `${k === 'eyes' ? 'Eye-rest' : k.charAt(0).toUpperCase() + k.slice(1)} nudges off.` };
  },

  // ---------- local search across everything
  async search_all({ query }, ctx) {
    const q = String(query || '').toLowerCase().trim();
    if (!q) return { text: 'Search for what?', error: true };
    const s = ctx.store.get();
    const hit = (t) => String(t || '').toLowerCase().includes(q);
    const out = [];
    s.tasks.filter((t) => hit(t.text)).slice(0, 4).forEach((t) => out.push(`✅ ${t.done ? '(done) ' : ''}${t.text}`));
    (s.events || []).filter((e) => hit(e.title) || hit(e.location)).slice(0, 4).forEach((e) => out.push(`📅 ${e.title} · ${describeWhen(e.start)}`));
    ctx.scheduler.upcoming(300).filter((r) => hit(r.text)).slice(0, 4).forEach((r) => out.push(`🔔 ${r.text} · ${describeWhen(r.at, r.repeat)}`));
    s.notes.filter((n) => hit(n.text)).slice(-4).forEach((n) => out.push(`📝 ${n.text.slice(0, 100)}`));
    (s.clipboard || []).filter((c) => hit(c.text)).slice(0, 3).forEach((c) => out.push(`📋 ${c.text.replace(/\s+/g, ' ').slice(0, 90)}`));
    (s.shortcuts || []).filter((c) => hit(c.name)).slice(0, 3).forEach((c) => out.push(`⭐ Shortcut: ${c.name}`));
    return { text: out.length ? out.join('\n') : `Nothing found for "${query}".` };
  },


  // ---------- people & birthdays
  async person_add({ name, phone, email, company, birthday, notes }, ctx) {
    const nm = String(name || '').trim(); if (!nm) return { text: 'Who should I add?', error: true };
    const people = ctx.store.get().people || [];
    const ex = people.find((p) => p.name.toLowerCase() === nm.toLowerCase());
    const bd = birthday ? normBirthday(birthday) : undefined;
    if (birthday && !bd) return { text: `I couldn't read the date "${birthday}". Try "12 March".`, error: true };
    const patch = Object.fromEntries(Object.entries({ phone, email, company, notes, birthday: bd }).filter(([, v]) => v));
    if (ex) { ctx.store.set({ people: people.map((p) => (p.id === ex.id ? { ...p, ...patch, notifiedYear: bd ? null : p.notifiedYear } : p)) }); return { text: `Updated ${ex.name}${bd ? `: birthday ${fmtBirthday(bd)} 🎂 (I'll remind you on the day)` : ''}.` }; }
    const p = { id: ctx.store.uid('p'), name: nm.replace(/\b\w/g, (c) => c.toUpperCase()), ...patch, created: Date.now() };
    ctx.store.set({ people: people.concat([p]) });
    return { text: `Added ${p.name} to People${bd ? `, birthday ${fmtBirthday(bd)} 🎂` : ''}.` };
  },
  async person_update({ id, patch }, ctx) {
    if (patch && patch.birthday) patch.birthday = normBirthday(patch.birthday) || patch.birthday;
    ctx.store.set({ people: (ctx.store.get().people || []).map((p) => (p.id === id ? { ...p, ...patch } : p)) }); return { text: 'Updated.', silent: true };
  },
  async person_delete({ id }, ctx) { ctx.store.set({ people: (ctx.store.get().people || []).filter((p) => p.id !== id) }); return { text: 'Removed.', silent: true }; },
  async person_info({ query, field }, ctx) {
    const p = bestMatch(ctx.store.get().people || [], query, (x) => x.name);
    if (!p) return { text: `I don't have "${query}" in People. Say "add contact ${query} phone …".`, error: true };
    if (field === 'birthday') return { text: p.birthday ? `${p.name}'s birthday is ${fmtBirthday(p.birthday)} (${daysUntilBirthday(p.birthday)} days away).` : `I don't know ${p.name}'s birthday yet.` };
    if (field === 'phone') return { text: p.phone ? `${p.name}: ${p.phone}` : `No phone number for ${p.name}.` };
    if (field === 'email') return { text: p.email ? `${p.name}: ${p.email}` : `No email for ${p.name}.` };
    return { text: [p.name, p.company, p.phone && '📞 ' + p.phone, p.email && '✉️ ' + p.email, p.birthday && '🎂 ' + fmtBirthday(p.birthday), p.notes].filter(Boolean).join('\n') };
  },
  async person_contact({ query, how }, ctx) {
    const p = bestMatch(ctx.store.get().people || [], query, (x) => x.name);
    if (!p) return { text: `I don't have "${query}" in People yet.`, error: true };
    if (how === 'email') { if (!p.email) return { text: `No email saved for ${p.name}.`, error: true }; await shell.openExternal('mailto:' + p.email); return { text: `Opening a new email to ${p.name}.` }; }
    if (!p.phone) return { text: `No phone number saved for ${p.name}.`, error: true };
    if (how === 'whatsapp') { await shell.openExternal('https://wa.me/' + p.phone.replace(/[^\d]/g, '')); return { text: `Opening WhatsApp chat with ${p.name}.` }; }
    await shell.openExternal('tel:' + p.phone.replace(/[^\d+]/g, '')); return { text: `Calling ${p.name} (${p.phone}) with your phone app.` };
  },
  async birthdays_upcoming({ days = 60 }, ctx) {
    const list = (ctx.store.get().people || []).filter((p) => p.birthday).map((p) => ({ p, d: daysUntilBirthday(p.birthday) })).filter((x) => x.d <= days).sort((a, b) => a.d - b.d);
    if (!list.length) return { text: `No birthdays in the next ${days} days.` };
    return { text: list.map((x) => `🎂 ${x.p.name}: ${fmtBirthday(x.p.birthday)} (${x.d === 0 ? 'today!' : x.d === 1 ? 'tomorrow' : 'in ' + x.d + ' days'})`).join('\n') };
  },

  // ---------- money
  async expense_add({ amount, category, note }, ctx) {
    const amt = Number(String(amount).replace(/[^\d.]/g, ''));
    if (!amt) return { text: 'How much was it?', error: true };
    const cat = guessCategory(category || note || '');
    const e = { id: ctx.store.uid('x'), amount: amt, category: cat, note: String(note || category || '').trim(), t: Date.now() };
    ctx.store.set({ expenses: (ctx.store.get().expenses || []).concat([e]) });
    const s = ctx.store.get(), cur = s.currency || '₹';
    const month = monthTotal(s.expenses);
    return { text: `💸 Logged ${cur}${fmtMoney(amt)} · ${cat}${e.note && e.note.toLowerCase() !== cat.toLowerCase() ? ' (' + e.note + ')' : ''}. This month: ${cur}${fmtMoney(month)}${s.budget ? ` of ${cur}${fmtMoney(s.budget)} budget` : ''}.` };
  },
  async expense_summary({ scope = 'month', category }, ctx) {
    const s = ctx.store.get(), cur = s.currency || '₹';
    if (category) {
      const now0 = new Date(); let from0 = new Date(now0.getFullYear(), now0.getMonth(), 1);
      if (scope === 'today') from0 = new Date(now0.getFullYear(), now0.getMonth(), now0.getDate());
      if (scope === 'week') { from0 = new Date(now0); from0.setDate(now0.getDate() - 6); from0.setHours(0, 0, 0, 0); }
      const cat = guessCategory(category), q = String(category).toLowerCase();
      const hits = (s.expenses || []).filter((e) => e.t >= +from0 && (e.category === cat || String(e.note || '').toLowerCase().includes(q) || e.category.toLowerCase() === q));
      const tot = hits.reduce((a, e) => a + e.amount, 0);
      const span = scope === 'today' ? 'today' : scope === 'week' ? 'in the last 7 days' : 'this month';
      return { text: hits.length ? `Spent ${cur}${fmtMoney(tot)} on ${category} ${span} (${hits.length} item${hits.length > 1 ? 's' : ''}).` : `Nothing spent on ${category} ${span}.` };
    }
    const now = new Date(); let from = new Date(now.getFullYear(), now.getMonth(), 1);
    if (scope === 'today') from = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    if (scope === 'week') { from = new Date(now); from.setDate(now.getDate() - 6); from.setHours(0, 0, 0, 0); }
    const list = (s.expenses || []).filter((e) => e.t >= +from);
    if (!list.length) return { text: `No expenses ${scope === 'today' ? 'today' : scope === 'week' ? 'in the last 7 days' : 'this month'}.` };
    const total = list.reduce((a, e) => a + e.amount, 0);
    const byCat = {}; list.forEach((e) => (byCat[e.category] = (byCat[e.category] || 0) + e.amount));
    const top = Object.entries(byCat).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([c, v]) => `${c} ${cur}${fmtMoney(v)}`).join(' · ');
    return { text: `Spent ${cur}${fmtMoney(total)} ${scope === 'today' ? 'today' : scope === 'week' ? 'in the last 7 days' : 'this month'} (${list.length} items).\n${top}${scope === 'month' && s.budget ? `\nBudget: ${Math.round(total / s.budget * 100)}% used, ${cur}${fmtMoney(Math.max(0, s.budget - total))} left.` : ''}` };
  },
  async expense_delete({ id }, ctx) { ctx.store.set({ expenses: (ctx.store.get().expenses || []).filter((e) => e.id !== id) }); return { text: 'Removed.', silent: true }; },

  // ---------- journal
  async journal_add({ text, mood }, ctx) {
    const t = String(text || '').trim(); if (!t && !mood) return { text: 'What would you like to write?', error: true };
    const j = { id: ctx.store.uid('j'), t: Date.now(), text: t, mood: mood ? Math.max(1, Math.min(5, Number(mood))) : null };
    ctx.store.set({ journal: (ctx.store.get().journal || []).concat([j]) });
    return { text: `📔 Saved to your journal${j.mood ? ' · mood ' + ['😞', '😕', '😐', '🙂', '😄'][j.mood - 1] : ''}.` };
  },
  async journal_delete({ id }, ctx) { ctx.store.set({ journal: (ctx.store.get().journal || []).filter((j) => j.id !== id) }); return { text: 'Removed.', silent: true }; },

  // ---------- tools
  async countdown_add({ title, date }, ctx) {
    let d = date ? (/^\d{4}-\d{2}-\d{2}/.test(date) ? new Date(date) : parseWhen(date).at) : null;
    let ttl = String(title || '').trim();
    if (!d) { const w = parseWhen(ttl); d = w.at; ttl = w.rest; }
    if (!d) return { text: 'Countdown to when? e.g. "countdown to SEZ go-live on 15 Jan".', error: true };
    d = new Date(d); d.setHours(0, 0, 0, 0);
    const c = { id: ctx.store.uid('k'), title: ttl.replace(/^(to|for|until)\s+/i, '') || 'Countdown', date: +d };
    ctx.store.set({ countdowns: (ctx.store.get().countdowns || []).concat([c]) });
    return { text: `⏳ ${c.title}: ${daysUntil(c.date)} days to go (${d.toLocaleDateString([], { day: 'numeric', month: 'short', year: 'numeric' })}).` };
  },
  async countdown_list(_, ctx) {
    const list = (ctx.store.get().countdowns || []).filter((c) => daysUntil(c.date) >= 0).sort((a, b) => a.date - b.date);
    if (!list.length) return { text: 'No countdowns. Try "countdown to Diwali on 8 Nov".' };
    return { text: list.map((c) => `⏳ ${c.title}: ${daysUntil(c.date) === 0 ? 'today!' : daysUntil(c.date) + ' days'}`).join('\n') };
  },
  async days_until({ query }, ctx) {
    const c = bestMatch(ctx.store.get().countdowns || [], query, (x) => x.title);
    if (c) return { text: `${c.title}: ${daysUntil(c.date)} days to go.` };
    const w = parseWhen(query);
    if (w.at) { const d = new Date(w.at); d.setHours(0, 0, 0, 0); return { text: `${daysUntil(+d)} days until ${d.toLocaleDateString([], { weekday: 'long', day: 'numeric', month: 'long' })}.` }; }
    return { text: `I don't know when "${query}" is. Add it: "countdown to ${query} on <date>".`, error: true };
  },
  async countdown_delete({ id }, ctx) { ctx.store.set({ countdowns: (ctx.store.get().countdowns || []).filter((c) => c.id !== id) }); return { text: 'Removed.', silent: true }; },
  async time_in({ place }) {
    const r = info.timeIn(place);
    return r ? { text: `🕐 ${String(place).replace(/\b\w/g, (c) => c.toUpperCase())}: ${r.text}` } : { text: `I don't know the time zone for "${place}". Try a big city name.`, error: true };
  },
  async convert({ amount, from, to }) {
    const n = Number(amount);
    const fc = info.currencyCode(from), tc = info.currencyCode(to);
    const u = info.convertUnits(n, from, to);
    if (u) return { text: `${n} ${from} = ${u.value.toLocaleString('en-IN')} ${u.unit}` };
    if (fc && tc) {
      try { const r = await info.convertCurrency(n, fc, tc); return { text: `💱 ${n.toLocaleString('en-IN')} ${fc} = ${r.value.toLocaleString('en-IN')} ${tc} (rate ${r.rate.toFixed(4)})` }; }
      catch (e) { return { text: e.message, error: true }; }
    }
    return { text: `I can't convert ${from} to ${to}.`, error: true };
  },
  async password_gen({ length = 16 }, ctx) {
    const pw = info.password(Math.max(8, Math.min(64, Number(length) || 16)));
    ctx.suppressClip && ctx.suppressClip(pw);
    clipboard.writeText(pw);
    return { text: `🔐 New password copied to your clipboard (${pw.length} characters, not saved in history):\n${pw}`, speak: 'I generated a strong password and copied it to your clipboard.' };
  },
  async stopwatch({ op = 'start' }, ctx) {
    const sw = ctx.stopwatch;
    const fmt = (ms) => { const s = Math.floor(ms / 1000); return `${Math.floor(s / 3600) ? Math.floor(s / 3600) + 'h ' : ''}${Math.floor(s / 60) % 60}m ${s % 60}s`; };
    if (op === 'start') { if (sw.running) return { text: `Stopwatch already running: ${fmt(sw.elapsed())}.` }; sw.start(); return { text: '⏱ Stopwatch started.' }; }
    if (op === 'stop') { if (!sw.running) return { text: `Stopwatch isn't running (last: ${fmt(sw.elapsed())}).` }; sw.stop(); return { text: `⏱ Stopped at ${fmt(sw.elapsed())}.` }; }
    if (op === 'reset') { sw.reset(); return { text: 'Stopwatch reset.' }; }
    return { text: `⏱ ${fmt(sw.elapsed())}${sw.running ? ' (running)' : ''}` };
  },
  async dnd({ on = true }, ctx) {
    ctx.store.set({ dnd: !!on });
    return { text: on ? '🔕 Do Not Disturb on: no wandering, thought bubbles or break nudges. Reminders and alarms still come through.' : '🔔 Do Not Disturb off.' };
  },
  async read_aloud(_, ctx) {
    const t = clipboard.readText().trim();
    if (!t) return { text: 'Your clipboard has no text to read.' };
    return { text: `Reading ${t.length > 60 ? t.length + ' characters' : '"' + t + '"'} aloud…`, speak: t.slice(0, 4000), forceSpeak: true };
  },


  // ---------- water (works with or without a "Drink water" habit; creates one if missing)
  async water_log({ glasses = 1 }, ctx) {
    const habits = ctx.store.get().habits || [];
    let h = habits.find((x) => /water|hydrat|drink/i.test(x.name));
    if (!h) { h = { id: ctx.store.uid('h'), name: 'Drink water', icon: '💧', target: 8, log: {}, created: Date.now() }; ctx.store.set({ habits: habits.concat([h]) }); }
    const k = todayKey();
    const cur = ctx.store.get().habits.find((x) => x.id === h.id);
    const log = { ...(cur.log || {}) };
    log[k] = Math.max(0, (log[k] || 0) + Number(glasses));
    ctx.store.set({ habits: ctx.store.get().habits.map((x) => (x.id === h.id ? { ...x, log } : x)) });
    const n = log[k], tg = cur.target || 8;
    const cups = '💧'.repeat(Math.min(n, 12));
    if (glasses < 0) return { text: `Removed ${-glasses}. Water today: ${n}/${tg}.` };
    return { text: `${cups || '💧'} ${n}/${tg} glasses today${n >= tg ? ', goal reached! 🎉' : n === tg - 1 ? ', one more to go!' : ''}` };
  },
  async water_status(_, ctx) {
    const h = (ctx.store.get().habits || []).find((x) => /water|hydrat|drink/i.test(x.name));
    const n = h ? ((h.log || {})[todayKey()] || 0) : 0, tg = h ? h.target || 8 : 8;
    return { text: `💧 ${n}/${tg} glasses of water today${n >= tg ? '. Great job! 🎉' : `. ${tg - n} to go.`}` };
  },
  async water_goal({ target }, ctx) {
    const t = Math.max(1, Math.min(30, Number(target) || 8));
    const habits = ctx.store.get().habits || [];
    const h = habits.find((x) => /water|hydrat|drink/i.test(x.name));
    if (h) ctx.store.set({ habits: habits.map((x) => (x.id === h.id ? { ...x, target: t } : x)) });
    else ctx.store.set({ habits: habits.concat([{ id: ctx.store.uid('h'), name: 'Drink water', icon: '💧', target: t, log: {}, created: Date.now() }]) });
    return { text: `💧 Daily water goal set to ${t} glasses.` };
  },
  async wellbeing_every({ key, minutes }, ctx) {
    const k = { water: 'water', stretch: 'stretch', eyes: 'eyes' }[key] || 'water';
    const m = Math.max(10, Math.min(240, Number(minutes) || 60));
    ctx.store.set({ wellbeing: { [k]: true, [k + 'Every']: m } });
    return { text: `Okay! I'll remind you to ${k === 'water' ? 'drink water' : k === 'eyes' ? 'rest your eyes' : 'stretch'} every ${m >= 60 && m % 60 === 0 ? (m / 60 === 1 ? 'hour' : m / 60 + ' hours') : m + ' minutes'} (outside quiet hours).` };
  },


  // ---------- downloads / folder tidier (moves only, never deletes; undoable)
  async tidy_folder({ folder = 'downloads', dryRun = false }, ctx) {
    const dir = path.resolve(/^downloads$/i.test(folder) ? app.getPath('downloads') : folder);
    const os = require('os');
    if (dir === path.resolve(os.homedir()) || dir === path.parse(dir).root || /\\(windows|program files[^\\]*)$/i.test(dir)) return { text: `For safety I won't reorganise ${dir}. Point me at a specific folder like Downloads.`, error: true };
    const CAT = { PDFs: /\.pdf$/i, Documents: /\.(docx?|odt|rtf|txt|md|pages)$/i, Spreadsheets: /\.(xlsx?|xlsm|csv|ods|numbers)$/i, Presentations: /\.(pptx?|odp|key)$/i,
      Images: /\.(png|jpe?g|gif|bmp|webp|svg|heic|tiff?|ico)$/i, Videos: /\.(mp4|mkv|mov|avi|wmv|webm|m4v)$/i, Audio: /\.(mp3|wav|m4a|aac|flac|ogg|wma)$/i,
      Archives: /\.(zip|rar|7z|tar|gz|bz2|xz|iso)$/i, Installers: /\.(exe|msi|msix|appx|dmg|apk|bat|cmd)$/i, Code: /\.(js|ts|py|java|abap|sql|json|xml|html|css|ps1|sh|yml|yaml)$/i };
    let ents; try { ents = fs.readdirSync(dir, { withFileTypes: true }); } catch (e) { return { text: `Can't open ${dir}.`, error: true }; }
    const moves = [], counts = {};
    const now = Date.now();
    for (const e of ents) {
      if (!e.isFile() || /\.(crdownload|part|tmp|partial)$/i.test(e.name) || e.name.startsWith('~$') || e.name.startsWith('.') || /^(desktop\.ini|thumbs\.db)$/i.test(e.name)) continue;
      const p = path.join(dir, e.name);
      let st; try { st = fs.statSync(p); } catch (x) { continue; }
      if (now - st.mtimeMs < 120000) continue; // probably still downloading / just saved
      let cat = Object.keys(CAT).find((c) => CAT[c].test(e.name)) || 'Other';
      if (cat === 'Installers' && now - st.mtimeMs > 30 * 864e5) cat = path.join('Installers', 'Old (safe to delete)');
      counts[cat] = (counts[cat] || 0) + 1;
      if (!dryRun) {
        const destDir = path.join(dir, cat);
        fs.mkdirSync(destDir, { recursive: true });
        let dest = path.join(destDir, e.name), i = 1;
        const ext = path.extname(e.name), base = path.basename(e.name, ext);
        while (fs.existsSync(dest)) dest = path.join(destDir, `${base} (${i++})${ext}`);
        try { fs.renameSync(p, dest); moves.push({ from: p, to: dest }); } catch (x) {}
      }
    }
    const total = Object.values(counts).reduce((a, b) => a + b, 0);
    if (!total) return { text: '🧹 Nothing to tidy. Your Downloads folder is already neat.' };
    if (!dryRun) ctx.store.set({ tidyUndo: moves });
    const summary = Object.entries(counts).sort((a, b) => b[1] - a[1]).map(([c, n]) => `${c.replace(/\\/g, ' › ')} ${n}`).join(' · ');
    return { text: `🧹 ${dryRun ? 'Would sort' : 'Sorted'} ${total} file${total > 1 ? 's' : ''} in ${path.basename(dir)}: ${summary}${dryRun ? '' : '.\nSay "undo tidy" to put them back.'}` };
  },
  async tidy_undo(_, ctx) {
    const moves = ctx.store.get().tidyUndo || [];
    if (!moves.length) return { text: 'Nothing to undo.' };
    let n = 0;
    for (const m of moves.slice().reverse()) { try { if (fs.existsSync(m.to) && !fs.existsSync(m.from)) { fs.renameSync(m.to, m.from); n++; } } catch (e) {} }
    ctx.store.set({ tidyUndo: [] });
    for (const d of new Set(moves.map((m) => path.dirname(m.to)))) { try { if (!fs.readdirSync(d).length) fs.rmdirSync(d); const up = path.dirname(d); if (/Installers$/.test(up) && !fs.readdirSync(up).length) fs.rmdirSync(up); } catch (e) {} }
    return { text: `↩️ Put ${n} file${n === 1 ? '' : 's'} back where they were.` };
  },

  // ---------- smart day planner (fits open tasks into free time between meetings)
  async plan_day({ commit = false, day = 'today' }, ctx) {
    const s = ctx.store.get(), P = s.planner || {};
    const base = new Date(); if (day === 'tomorrow') base.setDate(base.getDate() + 1);
    const at = (hm) => { const [h, m] = String(hm).split(':').map(Number); const d = new Date(base); d.setHours(h, m || 0, 0, 0); return +d; };
    let dayStart = at(P.start || '09:30'); const dayEnd = at(P.end || '18:30');
    if (day === 'today') dayStart = Math.max(dayStart, Math.ceil(Date.now() / (15 * 60000)) * 15 * 60000);
    if (dayStart >= dayEnd) return { text: 'Your workday is over. Try "plan tomorrow".' };
    const busy = [];
    const [l1, l2] = String(P.lunch || '13:00-14:00').split('-');
    if (l1 && l2) busy.push([at(l1), at(l2), 'Lunch']);
    for (const e of s.events || []) if (!e.allDay && e.source !== 'plan' && e.end > dayStart && e.start < dayEnd) busy.push([e.start, e.end, e.title]);
    busy.sort((a, b) => a[0] - b[0]);
    const free = []; let cur = dayStart;
    for (const [b0, b1] of busy) { if (b0 > cur) free.push([cur, Math.min(b0, dayEnd)]); cur = Math.max(cur, b1); }
    if (cur < dayEnd) free.push([cur, dayEnd]);
    const endOfDay = (() => { const d = new Date(base); d.setHours(23, 59, 59, 999); return +d; })();
    const PR = { high: 0, normal: 1, low: 2 };
    const tasks = s.tasks.filter((t) => !t.done).sort((a, b) => ((a.due && a.due <= endOfDay ? 0 : 1) - (b.due && b.due <= endOfDay ? 0 : 1)) || (PR[a.priority] - PR[b.priority]) || ((a.due || 9e15) - (b.due || 9e15)));
    const est = (t) => { const m = String(t.text).match(/\((\d+(?:\.\d+)?)\s*(h|hr|hrs|hours?|m|min|mins|minutes?)\)/i); if (t.estimate) return t.estimate; if (m) return Math.round(+m[1] * (/^h/i.test(m[2]) ? 60 : 1)); return P.block || 45; };
    const plan = []; let fi = 0, pos = free.length ? free[0][0] : 0;
    for (const t of tasks) {
      const dur = est(t) * 60000;
      while (fi < free.length && free[fi][1] - Math.max(pos, free[fi][0]) < Math.min(dur, 25 * 60000)) { fi++; pos = fi < free.length ? free[fi][0] : 0; }
      if (fi >= free.length) break;
      const st = Math.max(pos, free[fi][0]); const en = Math.min(st + dur, free[fi][1]);
      plan.push({ start: st, end: en, task: t }); pos = en + 5 * 60000;
    }
    if (!plan.length) return { text: tasks.length ? "No free time left today for your tasks. Want me to plan tomorrow instead? Say \"plan tomorrow\"." : 'No open tasks to plan. 🎉' };
    if (commit) {
      const dayKey = new Date(base).toDateString();
      const kept = (s.events || []).filter((e) => !(e.source === 'plan' && new Date(e.start).toDateString() === dayKey));
      const blocks = plan.map((p) => ({ id: ctx.store.uid('e'), title: '🧱 ' + p.task.text, start: p.start, end: p.end, allDay: false, location: '', notes: '', remindMin: 0, notifiedAt: null, source: 'plan', taskId: p.task.id, created: Date.now() }));
      ctx.store.set({ events: kept.concat(blocks) });
    }
    const left = tasks.length - plan.length;
    return { text: `🗓 ${commit ? 'Added to your calendar' : 'Plan for ' + day}:\n` + plan.map((p) => `${fmtTime(new Date(p.start))}–${fmtTime(new Date(p.end))}  ${p.task.priority === 'high' ? '❗' : '•'} ${p.task.text}`).join('\n') + (left > 0 ? `\n(+${left} more task${left > 1 ? 's' : ''} didn't fit)` : '') + (commit ? '' : '\nSay "add plan to calendar" to block the time.'), plan: plan.map((p) => ({ start: p.start, end: p.end, title: p.task.text, id: p.task.id })) };
  },

  // ---------- developer toolbox (offline). Many act on the given text, else the clipboard.
  async dev_tool({ op, text, copy = true, algo, mode }, ctx) {
    const src = (text != null && String(text).length) ? String(text) : clipboard.readText();
    const need = () => (src && src.trim()) ? null : { text: 'Give me some text, or copy it first — then try again.', error: true };
    let r, out, title = '';
    switch (op) {
      case 'json_format': if (need()) return need(); r = dev.jsonFormat(src); title = 'Formatted JSON'; break;
      case 'json_minify': if (need()) return need(); r = dev.jsonMinify(src); title = 'Minified JSON'; break;
      case 'b64_encode': if (need()) return need(); r = { ok: true, text: dev.b64encode(src) }; title = 'Base64'; break;
      case 'b64_decode': if (need()) return need(); r = dev.b64decode(src); title = 'Decoded base64'; break;
      case 'url_encode': if (need()) return need(); r = { ok: true, text: dev.urlEncode(src) }; title = 'URL-encoded'; break;
      case 'url_decode': if (need()) return need(); r = dev.urlDecode(src); title = 'URL-decoded'; break;
      case 'jwt': { if (need()) return need(); const j = dev.jwtDecode(src); if (!j.ok) return { text: j.error, error: true }; out = `Header:\n${JSON.stringify(j.header, null, 2)}\n\nPayload:\n${JSON.stringify(j.payload, null, 2)}${j.expires ? '\n\nexp → ' + j.expires : ''}${j.issued ? '\niat → ' + j.issued : ''}`; return { text: '🔑 JWT (not verified):\n' + out }; }
      case 'hash': { if (need()) return need(); if (algo && algo !== 'hash') { const h = dev.hash(algo, src); if (!h.ok) return { text: h.error, error: true }; clipboard.writeText(h.text); return { text: `${algo}: ${h.text}`, copied: true }; } out = dev.hashAll(src); clipboard.writeText(dev.hash('sha256', src).text); return { text: out, copied: true }; }
      case 'case': { if (need()) return need(); if (mode) { const c = dev.caseConvert(src, mode); clipboard.writeText(c); return { text: c, copied: true }; } out = dev.caseAll(src); return { text: out }; }
      case 'bases': if (need()) return need(); r = dev.numberBases(src.trim()); title = 'Number bases'; break;
      case 'uuid': out = dev.uuids(text && /^\d+$/.test(String(text)) ? +text : 1); return { text: out, copy: out };
      case 'random': { const n = (text && /^\d+$/.test(String(text))) ? +text : 24; out = dev.randomString(n); return { text: out, copy: out }; }
      case 'epoch': { const t = String(text || '').trim(); if (/^\d{9,13}$/.test(t)) { r = dev.epochToDate(t); } else if (!t) { r = dev.dateToEpoch(); } else { const w = parseWhen(t); r = w.at ? dev.dateToEpoch(w.at.toISOString()) : dev.dateToEpoch(t); } title = 'Time'; break; }
      case 'hex2rgb': if (need()) return need(); r = dev.hexToRgb(src.trim()); title = 'Colour'; break;
      case 'cron': { const t = String(text || src || '').trim(); r = dev.cronExplain(t); title = 'Cron'; break; }
      default: return { text: 'Unknown dev tool.', error: true };
    }
    if (!r.ok) return { text: r.error, error: true };
    const res = { text: (title ? '' : '') + r.text };
    if (copy && r.text && r.text.length < 8000) { clipboard.writeText(r.text); res.text = r.text; res.copied = true; }
    return res;
  },
  async regex_test({ pattern, flags = '', text }, ctx) {
    const src = (text != null && String(text).length) ? String(text) : clipboard.readText();
    const r = dev.regexTest(pattern, flags, src);
    if (!r.ok) return { text: r.error, error: true };
    if (!r.count) return { text: `No matches for /${pattern}/${flags} in ${text ? 'that text' : 'the clipboard'}.` };
    const lines = r.matches.slice(0, 20).map((m, i) => `${i + 1}. "${m.match}"${m.groups.length ? ' → [' + m.groups.join(', ') + ']' : ''} @${m.index}`);
    return { text: `${r.count} match${r.count > 1 ? 'es' : ''}:\n` + lines.join('\n') };
  },

  // ---------- snippets
  async snippet_save({ name, text, lang }, ctx) {
    const nm = String(name || '').trim(); let body = String(text || '');
    if (!nm) return { text: 'Give the snippet a name: "save snippet <name>: <code>".', error: true };
    if (!body) { body = clipboard.readText(); if (!body) return { text: `Copy the code first, then "save snippet ${nm}".`, error: true }; }
    const list = ctx.store.get().snippets || [];
    const existing = list.find((x) => x.name.toLowerCase() === nm.toLowerCase());
    const snip = { id: existing ? existing.id : ctx.store.uid('sn'), name: nm, lang: lang || '', text: body, tags: [], created: existing ? existing.created : Date.now() };
    ctx.store.set({ snippets: existing ? list.map((x) => (x.id === existing.id ? snip : x)) : list.concat([snip]) });
    return { text: `💾 Saved snippet "${nm}" (${body.split('\n').length} line${body.split('\n').length > 1 ? 's' : ''}). Say "insert snippet ${nm}" to type it into any app.`, section: 'developer' };
  },
  async snippet_list({ query }, ctx) {
    let list = ctx.store.get().snippets || [];
    if (query) list = list.filter((s) => (s.name + ' ' + s.text).toLowerCase().includes(String(query).toLowerCase()));
    if (!list.length) return { text: query ? `No snippets matching "${query}".` : 'No snippets yet. Save one with "save snippet <name>: <code>".' };
    return { text: list.slice(0, 20).map((s) => `• ${s.name}${s.lang ? ' (' + s.lang + ')' : ''} — ${s.text.replace(/\s+/g, ' ').slice(0, 48)}…`).join('\n') };
  },
  async snippet_insert({ name, id }, ctx) {
    const list = ctx.store.get().snippets || [];
    const hit = id ? list.find((s) => s.id === id) : bestMatch(list, name, (s) => s.name);
    if (!hit) return { text: `No snippet matching "${name}".`, error: true };
    clipboard.writeText(hit.text);
    let r; try { r = await ACTIONS.type_text({ text: hit.text }, ctx); } catch (e) { r = { error: true, text: e.message }; }
    return (r && r.error) ? { text: `📋 Copied "${hit.name}" to the clipboard — paste it where you need it.`, copied: true } : { text: `⌨️ Typed snippet "${hit.name}" into the active window.` };
  },
  async snippet_copy({ name, id }, ctx) {
    const list = ctx.store.get().snippets || [];
    const hit = id ? list.find((s) => s.id === id) : bestMatch(list, name, (s) => s.name);
    if (!hit) return { text: `No snippet matching "${name}".`, error: true };
    clipboard.writeText(hit.text);
    return { text: `📋 Copied snippet "${hit.name}".`, copied: true };
  },
  async snippet_delete({ name, id }, ctx) {
    const list = ctx.store.get().snippets || [];
    const hit = id ? list.find((s) => s.id === id) : bestMatch(list, name, (s) => s.name);
    if (!hit) return { text: `No snippet matching "${name}".`, error: true };
    ctx.store.set({ snippets: list.filter((s) => s.id !== hit.id) });
    return { text: `Deleted snippet "${hit.name}".`, section: 'developer' };
  },

  // ---------- developer mode + launcher
  async dev_mode({ on }, ctx) {
    const next = on == null ? !ctx.store.get().devMode : !!on;
    ctx.store.set({ devMode: next });
    return { text: next ? '👨‍💻 Developer mode on. Dark theme, the dev avatar and the Developer tools are ready — try "format json", "decode jwt", "uuid", or "cron 0 9 * * 1-5".' : 'Developer mode off. Back to the everyday Nova.', dev: next };
  },
  async open_editor({ path: target }, ctx) {
    const d = ctx.store.get().devPaths || {};
    const arg = target || '.';
    for (const cmd of [d.editor, 'code', 'code-insiders'].filter(Boolean)) {
      try { spawnDetached(cmd, [arg]); return { text: `Opening ${arg} in ${cmd === d.editor ? 'your editor' : cmd}.` }; } catch (e) {}
    }
    try { await shell.openPath(arg); return { text: `Opening ${arg}.` }; } catch (e) { return { text: 'Could not find VS Code. Set your editor in Developer settings.', error: true }; }
  },
  async open_terminal({ path: target }, ctx) {
    const cwd = target || (ctx.store.get().devPaths || {}).repos && (ctx.store.get().devPaths.repos[0] || '') || os.homedir();
    try { spawnDetached('wt.exe', ['-d', cwd]); return { text: 'Opening Windows Terminal.' }; }
    catch (e) { try { spawn('cmd.exe', ['/c', 'start', 'cmd'], { cwd, detached: true, stdio: 'ignore' }).unref(); return { text: 'Opening a terminal.' }; } catch (e2) { return { text: 'Could not open a terminal.', error: true }; } }
  },
  async open_localhost({ port, path: p }, ctx) {
    const n = parseInt(port, 10) || 3000;
    await shell.openExternal(`http://localhost:${n}${p || ''}`);
    return { text: `Opening localhost:${n}.` };
  },
  async git_status({ path: target }, ctx) {
    const d = ctx.store.get().devPaths || {};
    const cwd = target || (d.repos && d.repos[0]) || process.cwd();
    return await new Promise((resolve) => {
      let out = '';
      try {
        const g = spawn('git', ['-C', cwd, 'status', '-sb'], { windowsHide: true });
        g.stdout.on('data', (b) => (out += b)); g.stderr.on('data', (b) => (out += b));
        g.on('error', () => resolve({ text: 'Git not found, or that folder is not a repo. Set a repo in Developer settings.', error: true }));
        g.on('close', () => {
          const lines = out.trim().split('\n');
          const branch = (lines[0] || '').replace(/^## /, '');
          const changes = lines.slice(1).filter(Boolean);
          resolve({ text: `🌿 ${branch}\n${changes.length ? changes.slice(0, 15).join('\n') : 'working tree clean ✓'}`, section: 'developer' });
        });
      } catch (e) { resolve({ text: 'Could not run git.', error: true }); }
    });
  },

  // ---------- reading list
  async reading_add({ url, title, tags }, ctx) {
    let u = String(url || '').trim(); if (!u) return { text: 'Give me a link to save.', error: true };
    if (!/^https?:\/\//i.test(u)) u = 'https://' + u;
    const list = ctx.store.get().reading || [];
    if (list.some((x) => x.url === u)) return { text: 'That link is already on your reading list.' };
    const item = { id: ctx.store.uid('rd'), url: u, title: String(title || '').trim() || u.replace(/^https?:\/\/(www\.)?/, '').slice(0, 60), tags: (tags || []).filter(Boolean), read: false, added: Date.now() };
    ctx.store.set({ reading: list.concat([item]) });
    return { text: `📖 Saved to reading list: ${item.title}`, section: 'reading' };
  },
  async reading_list({ filter }, ctx) {
    let list = (ctx.store.get().reading || []).filter((x) => filter === 'read' ? x.read : filter === 'unread' ? !x.read : true);
    if (!list.length) return { text: filter === 'unread' ? 'Nothing left to read — nice! 🎉' : 'Your reading list is empty.' };
    return { text: list.slice(-20).reverse().map((x) => `${x.read ? '✓' : '•'} ${x.title}${x.tags && x.tags.length ? ' [' + x.tags.join(', ') + ']' : ''}`).join('\n'), section: 'reading' };
  },
  async reading_open({ id, query }, ctx) {
    const list = ctx.store.get().reading || [];
    const hit = id ? list.find((x) => x.id === id) : bestMatch(list, query, (x) => x.title + ' ' + x.url);
    if (!hit) return { text: `No saved link matching "${query}".`, error: true };
    await shell.openExternal(hit.url);
    ctx.store.set({ reading: list.map((x) => (x.id === hit.id ? { ...x, read: true } : x)) });
    return { text: `Opening ${hit.title}.` };
  },
  async reading_read({ id, query, read = true }, ctx) {
    const list = ctx.store.get().reading || [];
    const hit = id ? list.find((x) => x.id === id) : bestMatch(list, query, (x) => x.title);
    if (!hit) return { text: `No link matching "${query}".`, error: true };
    ctx.store.set({ reading: list.map((x) => (x.id === hit.id ? { ...x, read: !!read } : x)) });
    return { text: `${read ? '✓ Marked read' : 'Marked unread'}: ${hit.title}`, section: 'reading' };
  },
  async reading_delete({ id, query }, ctx) {
    const list = ctx.store.get().reading || [];
    const hit = id ? list.find((x) => x.id === id) : bestMatch(list, query, (x) => x.title);
    if (!hit) return { text: `No link matching "${query}".`, error: true };
    ctx.store.set({ reading: list.filter((x) => x.id !== hit.id) });
    return { text: `Removed: ${hit.title}`, section: 'reading' };
  },

  // ---------- checklists (reusable)
  async checklist_create({ name, items }, ctx) {
    const nm = String(name || '').trim(); if (!nm) return { text: 'Name the checklist.', error: true };
    const list = ctx.store.get().checklists || [];
    const its = (items || []).map((t) => ({ text: String(t).trim(), done: false })).filter((x) => x.text);
    const existing = list.find((c) => c.name.toLowerCase() === nm.toLowerCase());
    const cl = { id: existing ? existing.id : ctx.store.uid('cl'), name: nm, items: its.length ? its : (existing ? existing.items : []), created: existing ? existing.created : Date.now() };
    ctx.store.set({ checklists: existing ? list.map((c) => (c.id === existing.id ? cl : c)) : list.concat([cl]) });
    return { text: `✅ Checklist "${nm}" saved (${cl.items.length} item${cl.items.length === 1 ? '' : 's'}).`, section: 'checklists' };
  },
  async checklist_list({ name }, ctx) {
    const list = ctx.store.get().checklists || [];
    if (name) { const c = bestMatch(list, name, (x) => x.name); if (!c) return { text: `No checklist "${name}".`, error: true }; const done = c.items.filter((i) => i.done).length; return { text: `${c.name} (${done}/${c.items.length})\n` + c.items.map((i) => `${i.done ? '☑' : '☐'} ${i.text}`).join('\n'), section: 'checklists' }; }
    if (!list.length) return { text: 'No checklists yet. Try: "new checklist Packing: passport, charger, meds".' };
    return { text: list.map((c) => `• ${c.name} (${c.items.filter((i) => i.done).length}/${c.items.length})`).join('\n'), section: 'checklists' };
  },
  async checklist_reset({ name }, ctx) {
    const list = ctx.store.get().checklists || []; const c = bestMatch(list, name, (x) => x.name);
    if (!c) return { text: `No checklist "${name}".`, error: true };
    ctx.store.set({ checklists: list.map((x) => (x.id === c.id ? { ...x, items: x.items.map((i) => ({ ...i, done: false })) } : x)) });
    return { text: `🔄 Reset "${c.name}" — all ${c.items.length} items unchecked, ready for a fresh run.`, section: 'checklists' };
  },
  async checklist_check({ name, item, done = true }, ctx) {
    const list = ctx.store.get().checklists || []; const c = bestMatch(list, name, (x) => x.name);
    if (!c) return { text: `No checklist "${name}".`, error: true };
    const idx = c.items.findIndex((i) => i.text.toLowerCase().includes(String(item || '').toLowerCase()));
    if (idx < 0) return { text: `No item matching "${item}" in ${c.name}.`, error: true };
    const items = c.items.map((i, k) => (k === idx ? { ...i, done: !!done } : i));
    ctx.store.set({ checklists: list.map((x) => (x.id === c.id ? { ...x, items } : x)) });
    const left = items.filter((i) => !i.done).length;
    return { text: `${done ? '☑' : '☐'} ${c.items[idx].text} — ${left ? left + ' left in ' + c.name : c.name + ' complete! 🎉'}`, section: 'checklists' };
  },
  async checklist_delete({ name }, ctx) {
    const list = ctx.store.get().checklists || []; const c = bestMatch(list, name, (x) => x.name);
    if (!c) return { text: `No checklist "${name}".`, error: true };
    ctx.store.set({ checklists: list.filter((x) => x.id !== c.id) });
    return { text: `Deleted checklist "${c.name}".`, section: 'checklists' };
  },

  // ---------- weekly review (from your own data)
  async weekly_review(_, ctx) {
    const s = ctx.store.get();
    const now = Date.now(), weekAgo = now - 7 * 864e5;
    const doneTasks = (s.tasks || []).filter((t) => t.done && t.doneAt && t.doneAt >= weekAgo);
    const openTasks = (s.tasks || []).filter((t) => !t.done);
    const focusMin = ((s.focus && s.focus.sessions) || []).filter((x) => x.end >= weekAgo).reduce((a, x) => a + (x.minutes || 0), 0);
    const days = Array.from({ length: 7 }, (_, i) => todayKey(new Date(now - i * 864e5)));
    const water = (s.habits || []).find((h) => /water|hydrat/i.test(h.name));
    const waterTotal = water ? days.reduce((a, d) => a + ((water.log || {})[d] || 0), 0) : 0;
    const habitTicks = (s.habits || []).reduce((a, h) => a + days.reduce((b, d) => b + ((h.log || {})[d] >= (h.target || 1) ? 1 : 0), 0), 0);
    const spent = (s.expenses || []).filter((e) => e.t >= weekAgo).reduce((a, e) => a + e.amount, 0);
    const cur = s.currency || '₹';
    const journalN = (s.journal || []).filter((j) => j.t >= weekAgo).length;
    const lines = [
      '📅 Your week in review',
      `✅ ${doneTasks.length} task${doneTasks.length === 1 ? '' : 's'} completed${openTasks.length ? ` · ${openTasks.length} still open` : ''}`,
      `🎯 ${Math.round(focusMin / 60 * 10) / 10} h focused`,
      `${habitTicks} habit check-in${habitTicks === 1 ? '' : 's'}${water ? ` · ${waterTotal} glasses of water` : ''}`,
      spent ? `💸 ${cur}${fmtMoney(spent)} spent` : '',
      journalN ? `📓 ${journalN} journal entr${journalN === 1 ? 'y' : 'ies'}` : '',
      doneTasks.length ? '\nFinished: ' + doneTasks.slice(0, 6).map((t) => t.text).join(', ') : ''
    ].filter(Boolean);
    return { text: lines.join('\n'), section: 'review' };
  },

  async reset_data({ scope = 'data' }, ctx) {
    const r = ctx.store.reset(scope);
    return { text: scope === 'all' ? '🧹 Full reset done — Nova is back to a fresh install (data, settings and keys cleared).' : '🧹 Cleared your data (tasks, reminders, notes, events, habits history, expenses, journal and more). Settings, AI keys and the vault were kept.', reload: true, silent: false };
  },

  async help() {
    return { text: [
      'Just type it the way you would say it. Try:',
      '• remind me every hour to drink water / take medicine at 9 pm daily',
      '• buy milk tomorrow / team meeting friday 10 to 11 / move it to monday',
      '• had my water / done with BOE review / undo that',
      "• i'm going for lunch / i'm back / good night",
      '• open excel / close chrome',
      '• volume 40 / mute / next song',
      '• search SAP RAP tutorial / youtube lofi',
      '• timer 10 min / remind me at 4:30 to call Vivek',
      '• note check BOE mapping / show notes',
      '• screenshot / lock / minimize all',
      '• weather / weather tomorrow in Pune / 15% of 2400',
      "• what's on my screen? / explain this error",
      '• click / scroll down / click the Save button',
      '• type Hello team / press ctrl+s / switch to excel',
      '• start dictation (types what you say)',
      '• say "Hey Nova" anytime (wake word)',
      '• developer mode on → dev tools: format json, decode jwt, uuid, cron 0 9 * * 1-5, insert snippet',
      '• battery / system info / time / year',
      '• or just ask me anything (AI)'
    ].join('\n') };
  }
};

const NEEDS_CONFIRM = {
  sleep: 'Put the PC to sleep?',
  shutdown: 'Shut down the PC?',
  restart: 'Restart the PC?',
  empty_recycle_bin: 'Permanently empty the recycle bin?',
  notes_clear: 'Delete all your notes?',
  reminder_delete_all: 'Delete all reminders?',
  reset_data: 'Clear ALL your data (tasks, reminders, notes, events, habits, money, journal…)? Settings and AI keys are kept. This cannot be undone.',
  reset_all: 'FULL factory reset — wipe ALL data, settings AND AI keys? This cannot be undone.'
};

// Undo support: snapshot the store keys an action touches, then revert only what it added/changed.
const UNDO_KEYS = { task_add: ['tasks'], task_done: ['tasks'], task_delete: ['tasks'], task_toggle: ['tasks'], note_add: ['notes'], note_delete: ['notes'], reminder: ['reminders'], reminder_delete: ['reminders'], timer: ['reminders'], event_add: ['events'], event_delete: ['events'], expense_add: ['expenses'], water_log: ['habits'], habit_log: ['habits'], habit_add: ['habits'], journal_add: ['journal'], countdown_add: ['countdowns'], person_add: ['people'], reschedule: ['events', 'reminders', 'tasks'], away: ['away', 'dnd'], dnd: ['dnd'], wellbeing_every: ['wellbeing'], water_goal: ['habits'], shortcut_add: ['shortcuts'] };
const undoStack = [];
function snapshot(keys, store) { const s = store.get(); const o = {}; for (const k of keys) o[k] = JSON.parse(JSON.stringify(s[k] === undefined ? null : s[k])); return o; }
function undoLast(ctx) {
  const u = undoStack.pop();
  if (!u) return { text: 'Nothing to undo.' };
  const cur = ctx.store.get(), patch = {};
  for (const [k, before] of Object.entries(u.before)) {
    const now = cur[k], after = u.after[k];
    if (Array.isArray(before) && Array.isArray(now)) {
      const bIds = new Map(before.map((x) => [x.id, x])), aIds = new Map((after || []).map((x) => [x.id, x]));
      let list = now.filter((x) => !(aIds.has(x.id) && !bIds.has(x.id)));          // drop what the action added
      list = list.map((x) => (bIds.has(x.id) && JSON.stringify(aIds.get(x.id)) !== JSON.stringify(bIds.get(x.id)) ? bIds.get(x.id) : x)); // restore changed
      for (const b of before) if (!aIds.has(b.id) && !list.some((x) => x.id === b.id)) list.push(b); // restore deleted
      patch[k] = list;
    } else patch[k] = before;
  }
  // plain-object keys must be replaced, not merged
  for (const k of Object.keys(patch)) if (patch[k] && !Array.isArray(patch[k]) && typeof patch[k] === 'object') { ctx.store.set({ [k]: null }); }
  ctx.store.set(patch);
  return { text: `↩ Undone: ${u.label}` };
}

async function runAction(name, args, ctx, confirmed = false) {
  if (name === 'undo_last') return undoLast(ctx);
  const fn = ACTIONS[name];
  if (!fn) return { text: `Unknown action: ${name}`, error: true };
  const ck = name === 'reminder_delete' && args && args.all ? 'reminder_delete_all' : (name === 'reset_data' && args && args.scope === 'all') ? 'reset_all' : name;
  if (NEEDS_CONFIRM[ck] && !confirmed) return { text: NEEDS_CONFIRM[ck], confirm: { name, args: args || {} } };
  try {
    const before = name === 'task_toggle' && args ? ((ctx.store.get().tasks || []).find((t) => t.id === args.id) || {}).done : null;
    const uk = UNDO_KEYS[name] && !(args && args.noUndo) ? snapshot(UNDO_KEYS[name], ctx.store) : null;
    const res = await fn(args || {}, ctx);
    if (uk && res && !res.error && !res.confirm) { undoStack.push({ name, label: String(res.text || name).split('\n')[0].slice(0, 80), before: uk, after: snapshot(UNDO_KEYS[name], ctx.store), t: Date.now() }); if (undoStack.length > 30) undoStack.shift(); }
    if (res && !res.error && ctx.rewards) {
      let pts = 0, why = '';
      if (name === 'water_log' && (args.glasses || 1) > 0) { pts = 2 * (args.glasses || 1); why = 'water'; }
      else if (name === 'habit_log' && (args.delta == null || args.delta > 0)) { pts = /goal reached/.test(res.text) ? 13 : 3; why = 'habit'; }
      else if (name === 'task_done') { pts = 10; why = 'task'; }
      else if (name === 'task_toggle' && before === false) { pts = 10; why = 'task'; }
      else if (name === 'journal_add') { pts = 5; why = 'journal'; }
      else if (name === 'event_add' || name === 'reminder' || name === 'task_add') { pts = 1; why = 'planning'; }
      if (pts) ctx.rewards.award(pts, why);
    }
    return res;
  }
  catch (e) { return { text: `That didn't work: ${e.message}`, error: true }; }
}

// ---------------------------------------------------------- intent parser
const UNIT = '(s|secs?|seconds?|m|mins?|minutes?|h|hrs?|hours?)';

// Rewrite common phrasings into forms the parser knows (all offline).
function rewrite(x) {
  let r = String(x || '').trim().replace(/\s+/g, ' ');
  const rules = [
    [/^(?:can you |could you |please |pls |plz )+/i, ''],
    [/^whats\b/i, "what's"], [/^wheres\b/i, "where's"], [/^hows\b/i, "how's"], [/^im\b/i, "i'm"],
    [/^(?:in|after) (\d+|an?|one|two|three|four|five|ten|fifteen|twenty|thirty|half an?) (seconds?|secs?|minutes?|mins?|hours?|hrs?|days?) (?:please )?(?:remind|tell|ping|nudge|alert) me (?:to |that |about )?(.+)$/i, 'remind me to $3 in $1 $2'],
    [/^(every .+?|each .+?|daily|hourly|weekly|monthly)(?:,)? (?:please )?(?:remind|tell|ping|nudge) me (?:to |that |about )?(.+)$/i, 'remind me to $2 $1'],
    [/^(?:ping|nudge|alert|notify|buzz|tell) me(?=\s+(?:to|at|in|on|about|when|tomorrow|tonight|every|after|that|before)\b)/i, 'remind me'],
    [/^note to self[:,\s-]+/i, 'note '],
    [/^(?:save|add|log|capture|jot) (?:this |an |my |a )?(?:new )?idea[:,\s-]+/i, 'note 💡 '],
    [/^idea[:,-]\s*/i, 'note 💡 '],
    [/^(?:make|turn) (?:it|the (?:sound|volume|music)) (quieter|softer|lower|down)(?: a bit| a little)?$/i, 'volume down'],
    [/^(?:make|turn) (?:it|the (?:sound|volume|music)) (louder|higher|up)(?: a bit| a little)?$/i, 'volume up'],
    [/^(?:take|start|have) a (\d+)[ -]?(?:min|mins|minute|minutes) break$/i, 'timer $1 min for Break'],
    [/^(?:anything|what'?s|what is|is anything|is there anything) (?:due|pending|left)(?: for)? today\??$|^what do i have due today$/i, 'what do i need to do today'],
    [/^(?:what'?s|what is|anything|show(?: me)?) (?:still )?(?:pending|left|open|due)\??$/i, 'show my tasks'],
    [/^(?:show|list|find|read)(?: me)? (?:all )?(?:my |the )?notes (?:about|on|for|with|regarding|mentioning) (.+)$/i, 'search notes for $1'],
    [/^(?:set|create|make|add) (?:a |an )?reminder (?:to|for|about)\b/i, 'remind me to'],
    [/^remember to (.+?)(\s+(?:at|in|on|tomorrow|tonight|today|every|next)\b.*)$/i, 'remind me to $1$2'],
    [/^don'?t let me forget (?:to )?/i, 'remind me to '],
    [/^(?:set|start|create|make) (?:a |an )?timer (?:of|for) /i, 'timer '],
    [/^(?:make|write|save|create|add) (?:a )?note(?: that)?[:,]?\s+/i, 'note '],
    [/^write (?:this |that )?down[:,]?\s+/i, 'note '],
    [/^(?:put|add) (.+?) (?:on|in|to) (?:my )?(?:to-?do|task|tasks) ?(?:list)?$/i, 'add task $1'],
    [/^i (?:need|have|got) to (.+?\b(?:by|before|tomorrow|today|tonight|on|next|this)\b.*)$/i, 'add task $1'],
    [/^(?:max(?:imum)?|full) volume$|^volume (?:to )?max(?:imum)?$/i, 'volume 100'],
    [/^(?:half volume|volume (?:to )?half)$/i, 'volume 50'],
    [/^(?:min(?:imum)? volume|volume (?:to )?min(?:imum)?)$/i, 'volume 5'],
    [/^(?:pomodoro|deep work|focus time|focus session)$/i, 'start focus'],
    [/^(?:i'?m|im) (?:going )?(?:on a |taking a )?break$/i, 'take a break'],
    [/^(?:show|open|go to) (?:my )?(?:to[- ]?do(?: list)?|todos)$/i, 'show my tasks'],
    [/^(?:what'?s|what is) (?:on )?my (?:to[- ]?do(?: list)?|tasks?)(?: today)?$/i, 'show my tasks'],
    [/^(?:meeting|call|sync|catch ?up|lunch) with (.+?\b(?:at|on|tomorrow|today|tonight|next|from)\b.*)$/i, 'add event meeting with $1'],
    [/^(?!remind|set|alarm|timer|wake|focus|start|take a)(.{3,60}?) in (\d+|an?|half an?) (minutes?|mins?|hours?|hrs?)$/i, 'remind me to $1 in $2 $3']
  ];
  for (const [re, to] of rules) if (re.test(r)) { r = r.replace(re, to); }
  return r;
}

function parse(input, assistantName = 'nova', routineNames = []) {
  const raw = rewrite(String(input || '').trim());
  const nm = String(assistantName || 'nova').toLowerCase().replace(/[^a-z0-9 ]/g, '') || 'nova';
  const strip = (x) => x
    .replace(new RegExp(`^(hey |hi |ok |okay )?(${nm}|nova)[,\\s]*`, 'i'), '')
    .replace(/^(please |can you |could you |would you |will you )+/i, '')
    .replace(/\s+(please|for me)$/i, '')
    .trim();
  const original = strip(raw).replace(/[!?]+$/, '').trim();   // case preserved (for typing)
  let t = strip(raw.toLowerCase()).replace(/\s+now$/, '').replace(/[.!?]+$/, '').trim();
  if (!t) return raw ? { name: 'greet', args: { kind: 'hello' } } : null;
  let m;

  // ---- compound requests ("open notepad and type hello") -> AI plans the steps
  if (/\b(and|then)\s+(then\s+)?(type|write|search|press|click|open|go to|send|close|save|play|enter|fill|paste|copy|select|switch)\b/.test(t)) return null;

  // ---- greetings / identity
  if (/^(hi|hello|hey|hii+|good (morning|afternoon|evening)|namaste)( there)?$/.test(t)) return { name: 'greet', args: { kind: 'hello' } };
  if (/^(thanks|thank you|thank you so much|thx|great thanks|awesome|perfect|cool)$/.test(t)) return { name: 'greet', args: { kind: 'thanks' } };
  if (/^(who are you|what('?s| is) your name|what are you)$/.test(t)) return { name: 'greet', args: { kind: 'who' } };
  if (/^(how are you|how'?s it going|how are you doing)$/.test(t)) return { name: 'greet', args: { kind: 'how' } };
  if (/^(good ?night|gn|nighty? night|bye|goodbye|good bye|see (?:you|ya)(?: later| tomorrow)?|i'?m (?:done|logging off|signing off|leaving) for (?:the day|today)|logging off|signing off|calling it a day)$/.test(t)) return { name: 'greet', args: { kind: /night|day|tomorrow|logging|signing|leaving/.test(t) ? 'night' : 'bye' } };
  if ((m = t.match(/^(?:i'?m |i am )?(?:going (?:for|to)|heading (?:for|to|out for)|off (?:for|to)|stepping out for|taking|grabbing|out for|gone for)(?: a| my| some)? (lunch|dinner|breakfast|coffee|tea|chai|a walk|walk|break|meeting|call|nap|smoke|gym|prayer|shower)$/)) || (m = t.match(/^(brb|be right back|back in (\d+) ?(?:min|mins|minutes)|afk|stepping out|going out|stepping away)$/))) {
    const why = m[1] || 'away'; const mins = m[2] ? +m[2] : /lunch|dinner|gym|meeting/.test(why) ? 60 : /walk|nap|shower|prayer/.test(why) ? 30 : 15;
    return { name: 'away', args: { reason: /^(brb|be right back|afk|back in|stepping|going out)/.test(why) ? 'away' : why.replace(/^a /, ''), minutes: mins } };
  }
  if (/^(i'?m back|back|i am back|im back again|i'?m here)$/.test(t)) return { name: 'away', args: { back: true } };

  // briefing / routines
  if (/^(brief me|briefing|daily briefing|morning briefing|my briefing|what does my day look like|how does my day look|what'?s my day like|summari[sz]e my day)$/.test(t)) return { name: 'briefing' };
  if ((m = t.match(/^(?:run|start|do|begin|activate)\s+(?:the\s+|my\s+)?(.+?)(?:\s+routine)?$/)) && routineNames.some((n) => n.toLowerCase() === m[1] || n.toLowerCase() === 'start ' + m[1])) {
    return { name: 'routine_run', args: { name: routineNames.find((n) => n.toLowerCase() === m[1] || n.toLowerCase() === 'start ' + m[1]) } };
  }
  if (routineNames.some((n) => n.toLowerCase() === t)) return { name: 'routine_run', args: { name: routineNames.find((n) => n.toLowerCase() === t) } };

  // ---- water (no AI needed): "drink water", "had 2 glasses", "500 ml water", "water +1", "how much water today"
  if (/\bwater\b|\bhydrat/.test(t)) {
    if ((m = t.match(/water reminders? every (\d+|an?|one|two)?\s*(hours?|hrs?|minutes?|mins?|m|h)\b/))) {
      const n = /^(an?|one)$/.test(m[1] || 'a') || !m[1] ? 1 : { two: 2, three: 3 }[m[1]] || +m[1];
      return { name: 'wellbeing_every', args: { key: 'water', minutes: /^h/.test(m[2]) ? n * 60 : n } };
    }
    if ((m = t.match(/(?:set )?(?:my )?(?:daily )?water (?:goal|target) (?:to |of |is )?(\d+)/)) || (m = t.match(/^(?:i want to )?drink (\d+) glasses (?:of water )?(?:a|per|every) day$/))) return { name: 'water_goal', args: { target: +m[1] } };
    if (/how much water|water (status|today|count|progress|so far)|how many glasses/.test(t)) return { name: 'water_status' };
    if (/^(undo|remove|minus|delete|subtract|-)\s*(a |one |1 )?(glass of )?water$|^undo water$|^water -1$/.test(t)) return { name: 'water_log', args: { glasses: -1 } };
    const isLog = /^(?:i\s+)?(?:just\s+)?(?:drank|drink|drinking|had|have had|finished|log|logged|add|track|\+)?\s*(?:my\s+)?(?:a|one|another|\d+(?:\.\d+)?|two|three|four|half a|a full)?\s*(?:glass(?:es)?|cups?|bottles?|mugs?|ml|millilit(?:re|er)s?|lit(?:re|er)s?|l|sips?)?\s*(?:of\s+)?water(?:\s*(?:\+\s*\d+|\+|done|now|again))?$/.test(t) || /^water\s*\+?\s*\d*$/.test(t) || /^(drink|log|track) (my )?water$/.test(t);
    if (isLog) {
      let g = 1; let mm;
      if ((mm = t.match(/(\d+(?:\.\d+)?)\s*(ml|millilit)/))) g = Math.max(1, Math.round(+mm[1] / 250));
      else if ((mm = t.match(/(\d+(?:\.\d+)?)\s*(l\b|lit)/))) g = Math.max(1, Math.round(+mm[1] * 4));
      else if ((mm = t.match(/(\d+)\s*bottles?/))) g = +mm[1] * 2;
      else if (/\bbottle\b/.test(t)) g = 2;
      else if ((mm = t.match(/(\d+)\s*(glass|cup|mug)/))) g = +mm[1];
      else if ((mm = t.match(/water\s*\+\s*(\d+)/))) g = +mm[1];
      else if ((mm = t.match(/\b(two|three|four)\b/))) g = { two: 2, three: 3, four: 4 }[mm[1]];
      return { name: 'water_log', args: { glasses: g } };
    }
  }

  if ((m = t.match(/^(?:i\s+)?(?:just\s+)?(?:log|logged|add|had|drank|drink|finished)\s+(\d+|a|one|two|three|four|another)\s+(?:more\s+)?(?:glass|glasses|cups?|bottles?)$/))) {
    const n = { a: 1, one: 1, another: 1, two: 2, three: 3, four: 4 }[m[1]] || +m[1];
    return { name: 'water_log', args: { glasses: /bottle/.test(t) ? n * 2 : n } };
  }

  // ---- dictation / typing / keys (case-preserving text)
  if (/^(start|begin|enable|turn on) (dictation|dictating|typing mode)$|^dictation( mode)?( on)?$|^type what i say$/.test(t)) return { name: 'dictation', args: { on: true } };
  if (/^(stop|end|disable|turn off) (dictation|dictating|typing mode)$|^dictation off$/.test(t)) return { name: 'dictation', args: { on: false } };
  if ((m = original.match(/^(?:type|type in|type out|enter text)[:\s]+([\s\S]+)$/i))) return { name: 'type_text', args: { text: m[1].replace(/^["']|["']$/g, '') } };
  if ((m = t.match(/^(?:press|hit|tap)\s+(?:the\s+)?(.+?)(?:\s+key)?(?:\s+(\d+|two|three|four|five)\s+times|\s+(twice))?$/))) {
    const words = { two: 2, three: 3, four: 4, five: 5 };
    const times = m[3] ? 2 : m[2] ? (words[m[2]] || +m[2]) : 1;
    if (parseKeys(m[1])) return { name: 'press_keys', args: { keys: m[1], times } };
  }
  if (/^(undo (that|it|last|the last (one|thing|change)|what you (just )?did)|revert that|nova undo|take that back|scratch that)$/.test(t)) return { name: 'undo_last' };
  if (SHORTCUTS[t]) return { name: 'press_keys', args: { keys: SHORTCUTS[t] } };
  if ((m = t.match(/^(?:switch to|focus(?: on)?|bring up|go to)\s+(?:the\s+)?(.+?)(?:\s+window)?$/)) && !/\.[a-z]{2,}(\/|$)/.test(m[1]) && !/^(sleep|desktop|downloads?|documents?|pictures?|music|videos?|top|bottom)$/.test(m[1]) && !/^(for\s+)?\d+\s*(m|min|mins|minutes?|hours?)\b/.test(m[1])) return { name: 'focus_window', args: { title: m[1] } };

  // ---- mouse
  if ((m = t.match(/^(left |right |middle |double |double-)?click( here| it| that)?$/))) {
    const k = (m[1] || '').trim();
    return { name: 'mouse_click', args: { button: k === 'right' ? 'right' : k === 'middle' ? 'middle' : 'left', double: k.startsWith('double') } };
  }
  if ((m = t.match(/^scroll\s*(up|down|left|right)?(?:\s+(?:by\s+)?(\d+)(?:\s+times)?|\s+(a lot|a little|a bit|more))?$/))) {
    const amt = m[2] ? +m[2] : m[3] === 'a lot' ? 15 : /little|bit/.test(m[3] || '') ? 2 : 5;
    const dir = m[1] || 'down';
    return { name: 'scroll', args: { amount: amt, direction: dir, horizontal: dir === 'left' || dir === 'right' } };
  }
  if ((m = t.match(/^(?:move|put) (?:the )?(?:mouse|cursor|pointer) (?:to )?(?:the )?(center|centre|middle|top left|top right|bottom left|bottom right|top|bottom|left|right)(?: of (?:the )?screen)?$/))) return { name: 'mouse_move', args: { to: m[1].replace('centre', 'center').replace('middle', 'center') } };
  if ((m = t.match(/^(?:move|nudge) (?:the )?(?:mouse|cursor|pointer) (up|down|left|right)(?: by)?(?: (\d+))?(?: pixels?| px)?$/))) {
    const n = +(m[2] || 100); const d = m[1];
    return { name: 'mouse_move', args: { dx: d === 'left' ? -n : d === 'right' ? n : 0, dy: d === 'up' ? -n : d === 'down' ? n : 0 } };
  }
  if ((m = t.match(/^(?:move|put) (?:the )?(?:mouse|cursor|pointer) to (\d+)[,\s]+(\d+)$/))) return { name: 'mouse_move', args: { x: +m[1], y: +m[2], absolute: true } };

  // ---- quick facts
  if (/^(what('?s| is) the )?(weather|temperature|forecast)|^(is it|will it) (going to )?rain|^how('?s| is) the weather|^(how hot|how cold) is it/.test(t)) {
    const cm = t.match(/\b(?:in|at|for) ([a-z][a-z .'-]+?)(?: (?:today|tomorrow|now|right now))?$/);
    const city = cm && !/^(today|tomorrow|the morning|the evening)$/.test(cm[1]) ? cm[1] : '';
    return { name: 'weather', args: { city, day: /tomorrow/.test(t) ? 'tomorrow' : 'today' } };
  }
  if (/^(what(?:'?s| is)?(?: the)? |which )?year( is it| is this)?( now| today)?$|^current year$/.test(t)) return { name: 'year' };
  if (/^(what(?:'?s| is)?(?: the)? |which )?month( is it| is this)?( now)?$|^current month$/.test(t)) return { name: 'month' };
  if (/^(what(?:'?s| is)?(?: the)? )?(day|weekday)( is it)?( today)?$|^what day of the week is it$/.test(t)) return { name: 'day' };
  if (/^(what(?:'?s| is)?(?: the)? |which )?week( number| no)?( is it| is this)?( now| today)?$|^current week$/.test(t)) return { name: 'week' };
  if (/^(what('?s| is) )?my (local )?ip( address)?$/.test(t)) return { name: 'ip' };
  if ((m = t.match(/^(?:what(?:'s| is)|calculate|compute|calc|how much is)\s+(.+)$/)) && info.calc(m[1]) != null) return { name: 'calc', args: { expr: m[1] } };
  if (/^[\d\s.,()+\-*/x×÷^%]+(of\s*[\d.]+)?$/.test(t) && /\d\s*[+\-*/x×÷^%]/.test(t) && info.calc(t) != null) return { name: 'calc', args: { expr: t } };

  if (/^(help|what can you do|commands)$/.test(t)) return { name: 'help' };
  if (/^(cancel|abort|stop) (the )?(shut ?down|restart|reboot)$/.test(t)) return { name: 'cancel_shutdown' };

  // time / date / info
  if (/^(what('?s| is) the time|what time is it|time|current time|tell me the time)$/.test(t)) return { name: 'time' };
  if (/^(what('?s| is) (the |today'?s )?date|what day is (it|today)|today'?s date|date)$/.test(t)) return { name: 'date' };
  if (/^(what'?s |what is |check |show )?(my |the )?battery( level| status| percentage)?$/.test(t) || /^how much battery/.test(t)) return { name: 'battery' };
  if (/^(show |check |what'?s |what is )?(my |the )?(system (info|status|stats)|cpu( usage)?|ram( usage)?|memory usage|uptime|pc (status|health))$/.test(t)) return { name: 'system_info' };

  // volume
  if ((m = t.match(/^(?:set |change |turn )?(?:the )?(?:volume|sound)(?: level)? (?:to |at )?(\d{1,3})\s*(?:%|percent)?$/)) || (m = t.match(/^volume (\d{1,3})$/))) return { name: 'volume_set', args: { level: +m[1] } };
  if ((m = t.match(/^(?:turn (?:the )?(?:volume|sound|it) up|(?:volume|sound) up|louder|increase (?:the )?(?:volume|sound))(?: by (\d{1,3}))?/))) return { name: 'volume_change', args: { delta: +(m[1] || 10) } };
  if ((m = t.match(/^(?:turn (?:the )?(?:volume|sound|it) down|(?:volume|sound) down|quieter|softer|decrease (?:the )?(?:volume|sound)|lower (?:the )?(?:volume|sound))(?: by (\d{1,3}))?/))) return { name: 'volume_change', args: { delta: -(m[1] || 10) } };
  if (/^unmute( (the )?(sound|volume|audio|pc|computer))?$/.test(t)) return { name: 'mute', args: { on: false } };
  if (/^(mute|silence)( (the )?(sound|volume|audio|pc|computer|everything))?$/.test(t)) return { name: 'mute', args: { on: true } };

  // media
  if (/^(play|pause|resume|play\/pause|toggle music)( (the )?(music|song|media|video))?$/.test(t) || /^stop (the )?(music|song)$/.test(t)) return { name: 'media', args: { key: 'playpause' } };
  if (/^(next|skip)( (the )?(song|track))?$/.test(t)) return { name: 'media', args: { key: 'next' } };
  if (/^(previous|prev|last|go back)( (the )?(song|track))$/.test(t) || /^previous$/.test(t)) return { name: 'media', args: { key: 'previous' } };

  // brightness
  if ((m = t.match(/^(?:set |change )?(?:the )?(?:screen )?brightness (?:to |at )?(\d{1,3})\s*(?:%|percent)?$/))) return { name: 'brightness', args: { level: +m[1] } };
  if (/^(increase (the )?brightness|brightness up|brighter|turn (the )?brightness up)$/.test(t)) return { name: 'brightness', args: { delta: 15 } };
  if (/^(decrease (the )?brightness|lower (the )?brightness|brightness down|dimmer|dim (the )?screen|turn (the )?brightness down)$/.test(t)) return { name: 'brightness', args: { delta: -15 } };

  // power
  if (/^lock( (the |my )?(screen|computer|pc|laptop|system))?$/.test(t)) return { name: 'lock' };
  if (/^(sleep|go to sleep|sleep mode|put (the |my )?(pc|computer|laptop) to sleep)$/.test(t)) return { name: 'sleep' };
  if (/^(shut ?down|power off|turn off)( (the |my )?(pc|computer|laptop|system))?$/.test(t)) return { name: 'shutdown' };
  if (/^(restart|reboot)( (the |my )?(pc|computer|laptop|system))?$/.test(t)) return { name: 'restart' };
  if (/^(minimi[sz]e (all|everything|all windows)|show (the )?desktop)$/.test(t)) return { name: 'minimize_all' };
  if (/^(take (a )?)?(screenshot|screen shot|screen capture)$|^capture (the |my )?screen$/.test(t)) return { name: 'screenshot' };
  if (/^(empty|clear) (the )?(recycle bin|trash|bin)$/.test(t)) return { name: 'empty_recycle_bin' };

  // timers
  if ((m = t.match(new RegExp(`^(?:set |start )?(?:a )?timer (?:for )?(\\d+)\\s*${UNIT}(?: (?:for|called|named) (.+))?$`))) ||
      (m = t.match(new RegExp(`^(?:set |start )?(?:a )?(\\d+)[\\s-]*${UNIT} timer(?: (?:for|called|named) (.+))?$`)))) {
    return { name: 'timer', args: { ms: +m[1] * unitMs(m[2]), label: m[3] || '' } };
  }
  if (/^(cancel|stop|delete|clear) (the |my |all )?timers?$/.test(t)) return { name: 'timer_cancel' };

  // alarms: "set an alarm for 6:30", "wake me up at 7 tomorrow", "alarm at 6 am every weekday"
  if ((m = original.match(/^(?:set (?:an |a |my )?alarm|alarm|wake me(?: up)?)\s*(?:for|at)?\s+(.+)$/i))) {
    let ws = /^\d/.test(m[1].trim()) ? 'at ' + m[1].trim() : m[1];
    // alarms default to morning: "alarm 6" = 6 am
    ws = ws.replace(/\b(at\s+)(\d{1,2}(?:[:.]\d{2})?)(?!\s*(?:am|pm|a\.m|p\.m|[:.\d]))/i, (x, a, b) => (+b.split(/[:.]/)[0] < 12 ? `${a}${b} am` : x));
    const w = parseWhen(ws);
    if (w.at) return { name: 'reminder', args: { text: w.rest && !/^(up)?$/i.test(w.rest) ? w.rest : 'Alarm', at: w.at.toISOString(), repeat: w.repeat, alarm: true } };
  }

  // reminders — full natural language dates ("every Monday at 9", "on 25 Dec", "tomorrow morning")
  if (/^(remind me|set (a )?reminder|add (a )?reminder|reminder|create (a )?reminder|don'?t let me forget)\b/.test(t)) {
    let rest = original.replace(/^(remind me|set (a )?reminder|add (a )?reminder|create (a )?reminder|reminder|don'?t let me forget)\s*(?:(?:to|about|that|for)\b|:)?\s*/i, '');
    const w = parseWhen(rest);
    const text = (w.found ? w.rest : rest).replace(/^\s*(to|about|that)\s+/i, '').replace(/[.!?]+$/, '').trim() || 'Reminder';
    if (!w.at) return { name: 'reminder', args: { text } }; // will ask "when?"
    return { name: 'reminder', args: { text, at: w.at.toISOString(), repeat: w.repeat } };
  }
  if (/^what do i have (today|tomorrow|this week)$/.test(t)) return { name: 'agenda', args: { scope: /tomorrow/.test(t) ? 'tomorrow' : /week/.test(t) ? 'week' : 'today' } };
  if (/^(show|list|what are|view|read)( me)? (all )?(my |the )?(upcoming )?reminders$|^reminders$|^(my )?alarms$/.test(t)) {
    return { name: 'reminder_list', args: { scope: '' } };
  }
  if (/^(delete|cancel|remove|clear) (all )?(my |the )?(reminders|alarms)$/.test(t)) return { name: 'reminder_delete', args: { all: true } };
  if ((m = t.match(/^(?:delete|cancel|remove) (?:the |my )?(?:reminder|alarm)(?: (?:about|for|to|called))? (.+)$/))) return { name: 'reminder_delete', args: { query: m[1] } };
  if ((m = t.match(/^snooze(?: (?:it|that|for))?(?: (?:for )?(\d+)\s*(?:m|min|mins|minutes?))?$/))) return { name: 'reminder_snooze', args: { minutes: +(m[1] || 10) } };

  // ---- v6: work, automation, fun, reach
  if (/^(sync|refresh|update) (my )?(outlook|calendar from outlook|outlook calendar|meetings from outlook)$/.test(t)) return { name: 'outlook_sync' };
  if (/^(check|show|read|any|do i have)( my)? (new |unread )?(emails?|mails?|inbox)( today)?$|^(unread emails?|new emails?)$/.test(t)) return { name: 'outlook_unread' };
  if ((m = original.match(/^(?:draft|write|compose|send)\s+(?:an?\s+)?(?:e-?mail|mail)\s+to\s+(.+?)(?:\s+(?:about|regarding|re|subject)[:\s]+(.+))?$/i))) return { name: 'email_draft', args: { to: m[1].trim(), subject: (m[2] || '').trim() } };
  if ((m = t.match(/^(?:open|run|start|launch)?\s*(?:sap\s+)?(?:t-?code|transaction)\s+(\/?[a-z0-9_/]{2,30})(?:\s+(?:in|on)\s+([a-z0-9]{2,12}))?$/)) ||
      (m = t.match(/^sap\s+(\/?[a-z0-9_/]{2,30})(?:\s+(?:in|on)\s+([a-z0-9]{2,12}))?$/)) ||
      (m = t.match(/^(?:open|run|start)\s+(\/[a-z0-9_]+\/[a-z0-9_]+|[a-z]{2,4}\d{2,3}n?)(?:\s+(?:in|on)\s+([a-z0-9]{2,12}))?$/))) return { name: 'sap_open', args: { tcode: m[1], system: m[2] || '' } };
  if (/^(open )?sap( gui)?$/.test(t)) return { name: 'sap_open', args: { tcode: '' } };
  if ((m = t.match(/^(?:find|search for|look for|locate|where is)\s+(?:the\s+|my\s+|a\s+)?(?:file|files|document|documents|doc|docs|pdf|pdfs|excel|sheet|word file|ppt|presentation)\s+(?:for\s+|about\s+|named\s+|called\s+|with\s+)?(.+)$/)) || (m = t.match(/^search (?:my )?(?:documents|files|docs|pdfs) (?:for )?(.+)$/))) return { name: 'doc_search', args: { query: m[1] } };
  if (/^(re-?index|index|scan|update) (my )?(documents|files|docs|document index)$/.test(t)) return { name: 'doc_index' };
  if (/^(grab|copy|read|extract|get) (the )?text (from|on|off) (the |my )?screen$|^(grab text|ocr|screen text|text grab|copy text from screen)$/.test(t)) return { name: 'ocr_grab' };
  if ((m = t.match(/^run (?:the )?automation (.+)$/))) return { name: 'automation_run', args: { name: m[1] } };
  if (/^(tidy|clean ?up|organi[sz]e|sort)( up)? (my |the )?downloads?( folder)?$|^tidy downloads$/.test(t)) return { name: 'tidy_folder', args: { folder: 'downloads' } };
  if (/^undo (the )?(tidy|clean ?up|sorting|organi[sz]ing)$/.test(t)) return { name: 'tidy_undo' };
  if (/^(plan|schedule|organi[sz]e) (my )?(day|today|tasks today)$|^plan my tasks$|^what should i (do|work on) (today|next)$/.test(t)) return { name: 'plan_day', args: { day: 'today' } };
  if (/^plan (my )?tomorrow$|^plan tomorrow$/.test(t)) return { name: 'plan_day', args: { day: 'tomorrow' } };
  if (/^(add|put) (the |my )?plan (to|in|on) (my )?calendar$|^block (time|my calendar) for (my )?tasks$/.test(t)) return { name: 'plan_day', args: { commit: true, day: 'today' } };
  if (/^(screen time|app usage|usage|my usage|computer usage|how long have i been working|time spent)( today| this week)?$|^how much time (did i spend|have i spent) on (my )?(computer|pc|apps)( today| this week)?$/.test(t)) return { name: 'usage_report', args: { scope: /week/.test(t) ? 'week' : 'today' } };
  if (/^(my |what'?s my |show my )?(level|xp|points|rewards|score)$/.test(t)) return { name: 'rewards_status' };
  if ((m = t.match(/^(?:wear|put on|try on)\s+(?:the |your |a )?(glasses|shades|sunglasses|cap|hat|headphones|crown|flower|scarf|bow ?tie|sparkles|rainbow)$/))) {
    const item = m[1].replace(/sunglasses/, 'shades').replace(/^hat$/, 'cap').replace(/bow ?tie/, 'bowtie');
    const slot = { glasses: 'eyes', shades: 'eyes', cap: 'hat', headphones: 'hat', crown: 'hat', flower: 'hat', scarf: 'neck', bowtie: 'neck', sparkles: 'aura', rainbow: 'aura' }[item];
    return { name: 'outfit_set', args: { slot, id: item } };
  }
  if ((m = t.match(/^(?:take off|remove)\s+(?:the |your )?(glasses|shades|cap|hat|headphones|crown|flower|scarf|bow ?tie|sparkles|rainbow|outfit|everything)$/))) {
    const slot = { glasses: 'eyes', shades: 'eyes', cap: 'hat', hat: 'hat', headphones: 'hat', crown: 'hat', flower: 'hat', scarf: 'neck', bowtie: 'neck', 'bow tie': 'neck', sparkles: 'aura', rainbow: 'aura' }[m[1]];
    return { name: 'outfit_set', args: { slot: slot || 'hat', id: '' } };
  }
  if (/^(come here|come sit|visit my window|sit on (my |the )?window|climb (up|on my window)|go sit on (my )?window)$/.test(t)) return { name: 'perch' };
  if ((m = original.match(/^(?:send|push)\s+(?:this\s+|it\s+)?to\s+my\s+phone[:\s]+(.+)$/i)) || (m = original.match(/^(?:notify|text|ping)\s+my\s+phone[:\s]+(.+)$/i))) return { name: 'phone_push', args: { text: m[1] } };
  if ((m = original.match(/^pin\s+(?:a\s+)?(?:sticky\s+)?note\s+(?:on|to)\s+(?:my\s+|the\s+)?desktop[:\s]*(.*)$/i))) return { name: 'widget_add', args: { type: 'note', text: m[1] } };
  if ((m = t.match(/^(?:add|create|pin|show)\s+(?:a\s+|the\s+)?(tasks?|countdown|agenda|clock|water|sticky note|note)\s+widget(?:\s+(?:on|to)\s+(?:my\s+)?desktop)?$/))) return { name: 'widget_add', args: { type: m[1].replace(/^task$/, 'tasks').replace('sticky note', 'note') } };
  if (/^(record|start recording|transcribe)( this| the| my)? (meeting|call)$|^start (meeting notes|recording)$|^meeting notes$/.test(t)) return { name: 'meeting_record', args: { on: true } };
  if (/^stop (the )?(meeting )?(recording|meeting notes)$/.test(t)) return { name: 'meeting_record', args: { on: false } };

  // people & birthdays
  if ((m = original.match(/^(.+?)'s birthday is (?:on )?(.+)$/i)) || (m = original.match(/^(?:add|save|set) (?:a )?birthday (?:for )?(.+?) (?:on|is|as) (.+)$/i))) return { name: 'person_add', args: { name: m[1].replace(/^my\s+/i, ''), birthday: m[2].replace(/[.!]$/, '') } };
  if ((m = original.match(/^(?:add|save|new) (?:a )?(?:contact|person)\s+(.+)$/i))) {
    let rest = m[1]; const a = {};
    const ph = rest.match(/(?:phone|mobile|number|ph)[:\s]*([+\d][\d\s-]{6,})/i); if (ph) { a.phone = ph[1].trim(); rest = rest.replace(ph[0], ''); }
    const em = rest.match(/(?:email|mail)?[:\s]*([\w.+-]+@[\w-]+\.[\w.]+)/i); if (em) { a.email = em[1]; rest = rest.replace(em[0], ''); }
    const bd = rest.match(/birthday[:\s]*(?:on\s+)?(.+)$/i); if (bd) { a.birthday = bd[1].trim(); rest = rest.replace(bd[0], ''); }
    const ph2 = !a.phone && rest.match(/([+]?\d[\d\s-]{8,})/); if (ph2) { a.phone = ph2[1].trim(); rest = rest.replace(ph2[0], ''); }
    a.name = rest.replace(/\b(with|and|phone|email)\b/gi, ' ').replace(/[,]/g, ' ').replace(/\s+/g, ' ').trim();
    return { name: 'person_add', args: a };
  }
  if ((m = t.match(/^when is (.+?)'s birthday$/))) return { name: 'person_info', args: { query: m[1], field: 'birthday' } };
  if ((m = t.match(/^what'?s (.+?)'s (phone|number|phone number|email|mail|email address)$/))) return { name: 'person_info', args: { query: m[1], field: /mail/.test(m[2]) ? 'email' : 'phone' } };
  if (/^(upcoming|show|any|list)( upcoming)? birthdays( coming up| this month| soon)?$|^whose birthday is (it )?(coming up|soon|today)$/.test(t)) return { name: 'birthdays_upcoming', args: { days: /today/.test(t) ? 0 : 60 } };
  if ((m = t.match(/^(call|phone|ring|email|mail|whatsapp|message) (.+)$/)) && !/\b(me|it|this|that)\b/.test(m[2]) && !parseWhen(m[2]).found && !/\b(back|about|regarding|re)\b/.test(m[2])) {
    const how = /mail/.test(m[1]) ? 'email' : /whatsapp|message/.test(m[1]) ? 'whatsapp' : 'call';
    return { name: 'person_contact', args: { query: m[2], how } };
  }

  // money
  if ((m = t.match(/^(?:i\s+)?(?:spent|paid)\s+(?:rs\.?\s*|₹\s*|inr\s*)?([\d,]+(?:\.\d+)?)\s*(?:rs|rupees|inr)?\s*(?:on|for|at)?\s*(.*)$/)) ||
      (m = t.match(/^(?:add|log)\s+(?:an?\s+)?expense\s+(?:of\s+)?(?:rs\.?\s*|₹\s*)?([\d,]+(?:\.\d+)?)\s*(?:rs|rupees)?\s*(?:on|for)?\s*(.*)$/))) return { name: 'expense_add', args: { amount: m[1], note: m[2] } };
  if ((m = t.match(/^(?:how much (?:did|have) i spen[dt]|what did i spend|show (?:my )?(?:spending|expenses)) on (.+?)( today| this week| this month| so far)?$/))) return { name: 'expense_summary', args: { category: m[1], scope: /today/.test(m[2] || '') ? 'today' : /week/.test(m[2] || '') ? 'week' : 'month' } };
  if (/^(how much (did|have) i spen[dt]|my (spending|expenses)|show (my )?expenses|expenses|spending)( today| this week| this month| so far)?$/.test(t)) return { name: 'expense_summary', args: { scope: /today/.test(t) ? 'today' : /week/.test(t) ? 'week' : 'month' } };

  // journal
  if ((m = original.match(/^(?:journal|dear diary|diary|journal entry)[:,\s-]+(.+)$/i))) return { name: 'journal_add', args: { text: m[1] } };
  if ((m = t.match(/^(?:log |my )?mood(?: is)?[:\s]+(\d)(?:\/5)?$/))) return { name: 'journal_add', args: { text: '', mood: +m[1] } };

  // ---- developer toolbox (offline). "op on <text>" works too; otherwise acts on the clipboard.
  {
    const devVerb = /\b(json|jwt|base64|b64|url ?encode|url ?decode|uuid|guid|hash|md5|sha1|sha256|sha512|epoch|unix ?time|timestamp|cron|regex|snippets?|camel|pascal|snake|kebab|constant ?case|screaming|hex ?to ?rgb|rgb ?to ?hex|random (?:string|token|password)|base ?convert|bases?)\b/i;
    const clip = () => '';
    const tail = (re) => { const mm = original.match(re); return mm ? (mm[1] || '').trim() : null; };
    let dm;
    if (devVerb.test(t) || /^(uuid|guid|jwt|cron)\b/.test(t)) {
      if ((dm = t.match(/^(?:pretty ?print|format|prettify|beautify|indent)\s+(?:the\s+)?json\b/)) || /^json\s+format$/.test(t)) return { name: 'dev_tool', args: { op: 'json_format', text: tail(/\bjson\s*[:\-]?\s*([\s\S]+)$/i) } };
      if (/^(?:minif(?:y)?|compact|compress)\s+(?:the\s+)?json\b|^json\s+minify$/.test(t)) return { name: 'dev_tool', args: { op: 'json_minify', text: tail(/\bjson\s*[:\-]?\s*([\s\S]+)$/i) } };
      if ((dm = t.match(/^(?:decode|parse|read|inspect)\s+(?:the\s+)?(?:jwt|token)\b/)) || /^jwt\b/.test(t)) return { name: 'dev_tool', args: { op: 'jwt', text: tail(/\b(?:jwt|token)\s*[:\-]?\s*([\s\S]+)$/i) } };
      if (/^(?:base64|b64)\s+decode\b|^decode\s+(?:base64|b64)\b/.test(t)) return { name: 'dev_tool', args: { op: 'b64_decode', text: tail(/(?:base64|b64)\s*[:\-]?\s*([\s\S]+)$/i) } };
      if (/^(?:base64|b64)\s+encode\b|^encode\s+(?:base64|b64)\b/.test(t)) return { name: 'dev_tool', args: { op: 'b64_encode', text: tail(/encode(?:\s+(?:base64|b64))?\s*[:\-]?\s*([\s\S]+)$/i) } };
      if (/^url\s*decode\b|^decode\s+url\b/.test(t)) return { name: 'dev_tool', args: { op: 'url_decode', text: tail(/url\s*decode\s*[:\-]?\s*([\s\S]+)$/i) } };
      if (/^url\s*encode\b|^encode\s+url\b/.test(t)) return { name: 'dev_tool', args: { op: 'url_encode', text: tail(/url\s*encode\s*[:\-]?\s*([\s\S]+)$/i) } };
      if ((dm = t.match(/^(?:generate\s+|new\s+|give me\s+(?:a\s+)?)?(?:uuid|guid)(?:\s+(?:x\s*)?(\d+))?$/))) return { name: 'dev_tool', args: { op: 'uuid', text: dm[1] || '' } };
      if ((dm = original.match(/^(?:(md5|sha1|sha256|sha512)|hash)(?:\s+(?:of|for))?\s*[:\-]?\s*([\s\S]+)$/i))) return { name: 'dev_tool', args: { op: 'hash', text: dm[2].trim(), algo: (dm[1] || 'sha256').toLowerCase() } };
      if ((dm = original.match(/^(?:epoch|unix ?time(?:stamp)?|timestamp)\s*[:\-]?\s*([\s\S]+)?$/i))) return { name: 'dev_tool', args: { op: 'epoch', text: (dm[1] || '').trim() } };
      if ((dm = original.match(/^(?:to\s+)?(?:epoch|unix|timestamp)\s+(?:of\s+|for\s+)?([\s\S]+)$/i))) return { name: 'dev_tool', args: { op: 'epoch', text: dm[1].trim() } };
      if ((dm = original.match(/^(?:explain\s+)?cron\s+(.+)$/i)) || (dm = original.match(/^(?:next runs?(?:\s+for)?)\s+(.+)$/i))) return { name: 'dev_tool', args: { op: 'cron', text: dm[1].trim() } };
      if ((dm = original.match(/^(camel|pascal|snake|kebab|constant|screaming|title|dot)\s*case\s*[:\-]?\s*([\s\S]+)$/i)) || (dm = original.match(/^(?:to|convert to)\s+(camel|pascal|snake|kebab|constant)\s*case\s+([\s\S]+)$/i))) return { name: 'dev_tool', args: { op: 'case', text: dm[2].trim(), mode: dm[1].toLowerCase() } };
      if ((dm = original.match(/^(?:hex\s*to\s*rgb|hex2rgb)\s*[:\-]?\s*(#?[0-9a-f]{3,8})/i))) return { name: 'dev_tool', args: { op: 'hex2rgb', text: dm[1] } };
      if ((dm = t.match(/^(?:number\s+)?bases?\s+(?:of\s+)?([0-9a-fx]+)$/)) || (dm = t.match(/^(?:what is\s+)?(0x[0-9a-f]+|0b[01]+|\d+)\s+in\s+(?:hex|binary|bases)$/))) return { name: 'dev_tool', args: { op: 'bases', text: dm[1] } };
      if ((dm = t.match(/^(?:generate\s+|new\s+|give me\s+(?:a\s+)?)?random\s+(?:string|token|password)(?:\s+(?:of\s+)?(\d+))?$/))) return { name: 'dev_tool', args: { op: 'random', text: dm[1] || '' } };
      if ((dm = original.match(/^(?:test\s+)?regex\s+\/?([^\/]+?)\/?([a-z]*)\s+(?:on|against|in)\s+([\s\S]+)$/i))) return { name: 'regex_test', args: { pattern: dm[1], flags: dm[2], text: dm[3] } };
      // snippets
      if ((dm = original.match(/^(?:save|add|new|create)\s+snippet\s+(?:called\s+|named\s+)?([^:]+?)\s*[:\-]\s*([\s\S]+)$/i))) return { name: 'snippet_save', args: { name: dm[1].trim(), text: dm[2] } };
      if ((dm = original.match(/^(?:save|add)\s+(?:this\s+(?:as\s+)?)?snippet(?:\s+(?:called|named|as))?\s+(.+)$/i))) return { name: 'snippet_save', args: { name: dm[1].trim() } };
      if ((dm = original.match(/^(?:insert|paste|type|use)\s+snippet\s+(.+)$/i))) return { name: 'snippet_insert', args: { name: dm[1].trim() } };
      if ((dm = original.match(/^(?:copy)\s+snippet\s+(.+)$/i))) return { name: 'snippet_copy', args: { name: dm[1].trim() } };
      if ((dm = original.match(/^(?:delete|remove)\s+snippet\s+(.+)$/i))) return { name: 'snippet_delete', args: { name: dm[1].trim() } };
      if ((dm = t.match(/^(?:find|search)\s+snippets?\s+(?:for\s+)?(.+)$/))) return { name: 'snippet_list', args: { query: dm[1] } };
      if (/^(?:show|list|my)?\s*snippets$/.test(t)) return { name: 'snippet_list' };
    }
  }
  // developer mode + launcher
  if (/^(?:turn |switch )?(?:developer|dev|coding|coder)\s*mode(?:\s+(on|off))?$|^(?:go|switch to)\s+(?:dev|developer)\s*mode$/.test(t)) { const mm = t.match(/\b(on|off)\b/); return { name: 'dev_mode', args: { on: mm ? mm[1] === 'on' : null } }; }
  if (/^(?:exit|leave|stop|disable)\s+(?:developer|dev)\s*mode$/.test(t)) return { name: 'dev_mode', args: { on: false } };
  if ((m = t.match(/^(?:open\s+)?(?:vs ?code|vscode|editor|code)(?:\s+(?:here|this(?: folder)?|\.|current))?$/))) return { name: 'open_editor', args: {} };
  if ((m = original.match(/^(?:open\s+)?(?:vs ?code|vscode|editor|code)\s+(.+)$/i))) return { name: 'open_editor', args: { path: m[1].trim() } };
  if (/^(?:open\s+(?:a\s+)?)?(?:terminal|shell|command prompt|cmd|powershell|windows terminal)$/.test(t)) return { name: 'open_terminal', args: {} };
  if ((m = t.match(/^(?:open\s+)?localhost(?::|\s+)(\d{2,5})(\/\S*)?$/))) return { name: 'open_localhost', args: { port: m[1], path: m[2] || '' } };
  if (/^(?:git\s*status|git\s*st|repo\s*status|what(?:'s| is)\s+(?:my\s+)?git\s*status)$/.test(t)) return { name: 'git_status', args: {} };
  // developer: qr, secrets, keys, info, ports, run command, watch, workflow, vault
  if ((m = original.match(/^(?:make|create|generate|show|give me)\s+(?:a\s+)?qr(?:\s*code)?\s+(?:for|of|with)?\s*[:\-]?\s*(.+)$/i)) || (m = original.match(/^qr\s+(.+)$/i))) return { name: 'qr_make', args: { text: m[1].trim() } };
  if ((m = t.match(/^(?:generate|create|make|new|give me)\s+(?:a\s+)?(?:(hex|base64|url|token|api ?key|passphrase|hmac|strong)\s+)?secret(?:\s+(\d+))?$/))) { const k = (m[1] || 'hex').replace('api key', 'apikey').replace('api', 'apikey').replace('url', 'token').replace('strong', 'hex'); return { name: 'gen_secret', args: { kind: k, arg: m[2] } }; }
  if ((m = t.match(/^(?:generate|create|make|new)\s+(?:an?\s+)?(?:(ed25519|rsa|ec|ecdsa|p256)\s+)?(?:key\s*pair|keypair|ssh key)$/))) return { name: 'gen_keypair', args: { type: m[1] || 'ed25519' } };
  if ((m = t.match(/^(?:generate|make|new)\s+(?:a\s+)?passphrase(?:\s+(\d+))?$/))) return { name: 'gen_secret', args: { kind: 'passphrase', arg: m[1] } };
  if (/^(?:dev\s*info|developer\s*info|system\s*info\s+for\s+dev|environment\s*info|what(?:'s| is)\s+my\s+(?:node|dev)\s+(?:version|setup))$/.test(t)) return { name: 'dev_info' };
  if (/^(?:list\s+)?(?:listening\s+)?ports$|^what(?:'s| is)\s+(?:running\s+)?on\s+my\s+ports$|^(?:show|list)\s+(?:open\s+)?ports$/.test(t)) return { name: 'ports_list' };
  if ((m = t.match(/^(?:kill|free|stop|close)\s+(?:the\s+)?port\s+(\d{2,5})$/))) return { name: 'kill_port', args: { port: m[1] } };
  if ((m = t.match(/^(?:kill|stop)\s+(?:pid|process)\s+(\d+)$/))) return { name: 'kill_pid', args: { pid: m[1] } };
  if ((m = original.match(/^(?:run|exec(?:ute)?|\$)\s+(?:command\s+)?[`"']?(.+?)[`"']?$/i)) && /^(npm|node|git|yarn|pnpm|python|pip|docker|cf|mvn|gradle|dotnet|ng|vue|cargo|go|make|ls|dir|cd|echo|curl|type|cat|grep|abapgit)\b/i.test(m[1])) return { name: 'run_command', args: { cmd: m[1] } };
  if ((m = original.match(/^(?:watch|track|monitor)\s+(?:the\s+)?(?:file|folder|path|directory)?\s*[:\-]?\s*(.+)$/i)) && /[\\/]/.test(m[1])) return { name: 'watch_add', args: { path: m[1].trim().replace(/^["']|["']$/g, '') } };
  if ((m = original.match(/^(?:run|start|exec(?:ute)?)\s+(?:the\s+)?workflow\s+(.+)$/i))) return { name: 'workflow_run', args: { name: m[1].trim() } };
  if (/^(?:lock\s+(?:the\s+)?vault|lock\s+my\s+secrets)$/.test(t)) return { name: 'vault_lock' };
  if (/^(?:full(?:y)?\s+reset|factory\s+reset|reset\s+everything|wipe\s+everything|reset\s+nova\s+completely)$/.test(t)) return { name: 'reset_data', args: { scope: 'all' } };
  if (/^(?:clear|wipe|reset|erase|delete)\s+(?:all\s+)?(?:my\s+)?(?:data|database|everything)$|^reset\s+(?:nova|the app)$|^start\s+(?:over|fresh)$|^clean\s+slate$/.test(t)) return { name: 'reset_data', args: { scope: 'data' } };
  if ((m = original.match(/^(?:json\s+to\s+(?:ts|typescript)|generate\s+(?:ts|typescript)\s+(?:interface|types?))\s*[:\-]?\s*([\s\S]+)$/i))) return { name: 'dev_convert', args: { op: 'json_ts', text: m[1] } };
  if ((m = original.match(/^(?:json\s+to\s+abap|generate\s+abap\s+(?:structure|types?))\s*[:\-]?\s*([\s\S]+)$/i))) return { name: 'dev_convert', args: { op: 'json_abap', text: m[1] } };
  if ((m = original.match(/^(?:contrast(?:\s+(?:of|between))?)\s+(#?[0-9a-f]{3,6}\s+#?[0-9a-f]{3,6})$/i))) return { name: 'dev_convert', args: { op: 'contrast', text: m[1] } };
  if ((m = original.match(/^shades?\s+(?:of\s+)?(#?[0-9a-f]{3,6})$/i))) return { name: 'dev_convert', args: { op: 'shades', text: m[1] } };
  if ((m = t.match(/^mock\s+(name|email|uuid|phone|int|bool|date|users?)(?:\s+(\d+))?$/))) return { name: 'dev_convert', args: { op: /user/.test(m[1]) ? 'mock_users' : 'mock', text: /user/.test(m[1]) ? (m[2] || '3') : m[1], name: m[2] } };


  // reading list
  if ((m = original.match(/^(?:add|save|read later|bookmark)\s+(?:to\s+)?(?:reading list\s+|reading\s+)?(https?:\/\/\S+|www\.\S+|\S+\.[a-z]{2,}\/\S*)(?:\s+(?:as|titled|title)\s+(.+))?$/i)) || (m = original.match(/^(?:read later|save to reading list)\s*[:\-]?\s*(https?:\/\/\S+|\S+\.[a-z]{2,}\S*)(?:\s+(.+))?$/i))) return { name: 'reading_add', args: { url: m[1], title: m[2] } };
  if (/^(?:show|open|my|view)?\s*reading list$|^what(?:'s| is)\s+(?:on\s+)?my reading list$|^what do i have to read$/.test(t)) return { name: 'reading_list', args: { filter: 'unread' } };
  if ((m = t.match(/^(?:open|read)\s+(?:the\s+)?(?:article|link)\s+(?:about\s+)?(.+?)(?:\s+from reading list)?$/))) return { name: 'reading_open', args: { query: m[1] } };
  if ((m = t.match(/^(?:mark|flag)\s+(.+?)\s+(?:as\s+)?read$/))) return { name: 'reading_read', args: { query: m[1], read: true } };

  // checklists
  if ((m = original.match(/^(?:new|create|add|make)\s+checklist\s+([^:]+?)\s*[:\-]\s*(.+)$/i))) return { name: 'checklist_create', args: { name: m[1].trim(), items: m[2].split(/\s*[,;]\s*|\s+and\s+/).map((x) => x.trim()).filter(Boolean) } };
  if ((m = original.match(/^(?:new|create|add|make)\s+(?:a\s+)?checklist\s+(?:called\s+|named\s+)?(.+)$/i))) return { name: 'checklist_create', args: { name: m[1].trim(), items: [] } };
  if (/^(?:show|list|my)?\s*checklists$/.test(t)) return { name: 'checklist_list' };
  if ((m = t.match(/^(?:show|open|view)\s+(?:the\s+)?(.+?)\s+checklist$/)) || (m = t.match(/^checklist\s+(.+)$/))) return { name: 'checklist_list', args: { name: m[1] } };
  if ((m = t.match(/^(?:reset|restart|start)\s+(?:the\s+)?(.+?)\s+checklist$/))) return { name: 'checklist_reset', args: { name: m[1] } };
  if ((m = t.match(/^(?:check|tick|mark)\s+(?:off\s+)?(.+?)\s+(?:in|on|from)\s+(?:the\s+)?(.+?)(?:\s+checklist)?$/))) return { name: 'checklist_check', args: { item: m[1], name: m[2] } };

  // weekly review
  if (/^(?:weekly review|my week|week in review|review my week|how was my week|weekly summary)$/.test(t)) return { name: 'weekly_review' };

  // tools
  if ((m = original.match(/^(?:add |set |start |create )?(?:a )?countdown (?:to|for|until)\s+(.+)$/i))) return { name: 'countdown_add', args: { title: m[1] } };
  if (/^(show |my )?countdowns$/.test(t)) return { name: 'countdown_list' };
  if ((m = t.match(/^how many days (?:until|till|to|left (?:until|for|to))\s+(.+)$/)) || (m = t.match(/^days (?:until|till|to)\s+(.+)$/))) return { name: 'days_until', args: { query: m[1] } };
  if ((m = t.match(/^(?:what(?:'s| is) the )?time(?: is it)? in (.+)$|^what time is it in (.+)$/))) return { name: 'time_in', args: { place: m[1] || m[2] } };
  if ((m = t.match(/^(?:convert\s+)?([\d,.]+)\s*([a-z°$₹/]{1,12}(?:\s?[a-z]{1,5})?)\s+(?:to|in|into)\s+([a-z°$₹/]{1,12}(?:\s?[a-z]{1,5})?)$/))) {
    const from = m[2].trim(), to = m[3].trim();
    if (info.convertUnits(1, from, to) || (info.currencyCode(from) && info.currencyCode(to))) return { name: 'convert', args: { amount: +m[1].replace(/,/g, ''), from, to } };
  }
  if ((m = t.match(/^(?:generate|create|make|give me|new)\s+(?:a\s+)?(?:strong\s+|random\s+|secure\s+)?password(?:\s+of)?(?:\s+(\d+)(?:\s+(?:characters|chars|letters))?)?$/))) return { name: 'password_gen', args: { length: m[1] ? +m[1] : 16 } };
  if ((m = t.match(/^(start|stop|reset|pause) (?:the )?stopwatch$/))) return { name: 'stopwatch', args: { op: m[1] === 'pause' ? 'stop' : m[1] } };
  if (/^(stopwatch|how long has the stopwatch been running|stopwatch time)$/.test(t)) return { name: 'stopwatch', args: { op: 'status' } };
  if ((m = t.match(/^(?:turn |switch )?(?:do not disturb|dnd|quiet mode|focus quiet)(?: mode)?(?: (on|off))?$|^(?:turn|switch) (on|off) (?:do not disturb|dnd|quiet mode)$/))) return { name: 'dnd', args: { on: (m[1] || m[2] || 'on') === 'on' } };
  if (/^(read|speak) (my |the )?clipboard( aloud| out loud)?$|^read (this|it) (aloud|out loud)$/.test(t) && /aloud|out loud|speak/.test(t)) return { name: 'read_aloud' };

  // calendar / agenda
  if ((m = original.match(/^(?:add|create|schedule|new|book|put)\s+(?:an?\s+|the\s+)?(?:event|meeting|appointment|call|calendar event)\b[:\s]*(.*)$/i)) ||
      (m = original.match(/^(?:schedule)\s+(.+)$/i))) {
    return { name: 'event_add', args: { title: m[1] } };
  }
  if (/^(what'?s|what is|show|show me|read)? ?(on )?(my |the )?(calendar|agenda|schedule|events|day|plan)( for)? ?(today|tomorrow|this week|next 7 days|week)?$/.test(t) && /(calendar|agenda|schedule|events|plan)/.test(t)) {
    return { name: 'agenda', args: { scope: /tomorrow/.test(t) ? 'tomorrow' : /week|7 days/.test(t) ? 'week' : 'today' } };
  }
  if ((m = t.match(/^(?:cancel|delete|remove) (?:the |my )?(?:event|meeting|appointment) (?:called |about |with )?(.+)$/))) return { name: 'event_delete', args: { query: m[1] } };
  if ((m = t.match(/^(?:cancel|delete|remove|drop) (?:the |my |today'?s |tomorrow'?s )?(.+?) (?:meeting|event|appointment|appt|call|sync|session)$/))) return { name: 'event_delete', args: { query: m[1] } };
  if ((m = original.match(/^(?:move|reschedule|shift|push|postpone|change|prepone|bring forward)\s+(?:the\s+|my\s+)?(.+?)\s+(?:to|till|until|for)\s+(.+)$/i)) && parseWhen(m[2]).found) return { name: 'reschedule', args: { query: m[1].replace(/\s+(?:reminder|task|meeting|event|appointment)$/i, (x) => x), when: m[2] } };

  // focus / pomodoro
  if ((m = t.match(/^(?:start|begin|let'?s|start a|begin a)\s+(?:a\s+)?(?:focus|pomodoro|deep work)(?:\s+session)?(?:\s+(?:for\s+)?(\d+)\s*(?:m|min|mins|minutes?))?(?:\s+(?:on|for)\s+(.+))?$/)) ||
      (m = t.match(/^(?:focus|pomodoro)\s+(?:for\s+)?(\d+)\s*(?:m|min|mins|minutes?)(?:\s+(?:on|for)\s+(.+))?$/))) {
    return { name: 'focus_start', args: { minutes: m[1] ? +m[1] : undefined, label: m[2] || '' } };
  }
  if ((m = t.match(/^(?:start|begin|do|let'?s do)\s+(?:a\s+|an\s+)?(\d+|an?|one)[\s-]*(m|min|mins|minutes?|hours?|hrs?|h)\s+(?:of\s+)?(?:focus|pomodoro|deep work|focused work)(?:\s+session)?(?:\s+(?:on|for)\s+(.+))?$/)) ||
      (m = t.match(/^(?:i\s+)?(?:need|want|have|got)\s+to\s+(?:focus|concentrate|do (?:some )?deep work)(?:\s+for)?\s+(\d+|an?|one)\s*(m|min|mins|minutes?|hours?|hrs?|h)(?:\s+(?:on|for)\s+(.+))?$/)) ||
      (m = t.match(/^(?:let me|time to|help me)\s+focus(?:\s+for)?\s+(\d+|an?|one)\s*(m|min|mins|minutes?|hours?|hrs?|h)(?:\s+(?:on|for)\s+(.+))?$/))) {
    const n = /^(an?|one)$/.test(m[1]) ? 1 : +m[1];
    return { name: 'focus_start', args: { minutes: /^h/.test(m[2]) ? n * 60 : n, label: m[3] || '' } };
  }
  if ((m = t.match(/^(?:i\s+)?(?:need|want|have)\s+to\s+(?:focus|concentrate)(?:\s+(?:on\s+)?(.+))?$/))) return { name: 'focus_start', args: { label: m[1] || '' } };
  if (/^(stop|end|cancel|finish) (the )?(focus|pomodoro|deep work)( session)?$/.test(t)) return { name: 'focus_stop' };
  if (/^(pause|resume) (the )?(focus|pomodoro|timer session)( session)?$/.test(t)) return { name: 'focus_pause' };
  if (/^(take a|start a|start my) (long )?break$/.test(t)) return { name: 'focus_break', args: { long: /long/.test(t) } };
  if (/^(focus status|how much (focus )?time (is )?left|how long (is )?left|focus stats|how much did i focus( today)?)$/.test(t)) return { name: 'focus_status' };

  // habits
  if ((m = t.match(/^(?:add|create|new|track)\s+(?:a\s+)?habit\s+(.+?)(?:\s+(\d+)\s*(?:x|times)(?:\s+(?:a|per)\s+day)?)?$/))) return { name: 'habit_add', args: { name: m[1], target: m[2] ? +m[2] : 1 } };
  if (/^(show|list|my|what are my)( me)? (my )?habits$|^habits$/.test(t)) return { name: 'habit_list' };
  if ((m = t.match(/^(?:log|logged|did|track|tick off|i did|i drank|drank|had|done)\s+(?:my\s+|a glass of\s+|some\s+|a\s+)?(.+?)(?:\s+habit)?$/)) && !/^(it|that|this)$|^(you|we|they|he|she|it|that|this|i|with|the .+ task)\b/.test(m[1])) return { name: 'habit_log', args: { query: m[1] } };

  // clipboard history
  if (/^(show|open|my)? ?(the )?clipboard history$|^clipboard history$|^what did i copy( recently)?$/.test(t)) return { name: 'clipboard_history' };
  if (/^(clear|delete|wipe) (my |the )?clipboard history$/.test(t)) return { name: 'clipboard_clear' };
  if ((m = t.match(/^copy (?:item |number )?(\d+) from (?:clipboard )?history$/))) return { name: 'clipboard_copy', args: { index: +m[1] } };

  // shortcuts
  if ((m = original.match(/^add (?:a )?shortcut (?:called |named )?(.+?) (?:for|to|=)\s+(.+)$/i))) return { name: 'shortcut_add', args: { name: m[1], target: m[2] } };

  // wellbeing
  if ((m = t.match(/^(turn on|enable|start|turn off|disable|stop) (?:the )?(water|stretch|break|breaks|eye|eyes)(?: rest)? (?:reminders|breaks|nudges|alerts)$/))) return { name: 'wellbeing_set', args: { key: m[2], on: /on|enable|start/.test(m[1]) } };

  if ((m = t.match(/^(?:find|search for|look for|locate|where is|where'?s|open)\s+(?:the\s+|my\s+|a\s+|that\s+)?(.*\b(?:boe|bill of entry|bills of entry|invoice|shipping bill|sb|annexure|contract|agreement|purchase order|po|quotation|quote|statement|certificate|policy|license|licence|bond|lut|challan|packing list|bl|bill of lading|receipt|pdf|spreadsheet|deck)\b.*)$/)) && m[1].split(' ').length >= 2) return { name: 'doc_search', args: { query: m[1] } };
  // local search across my stuff
  if ((m = t.match(/^(?:find|look for|search my (?:stuff|things|data|notes and tasks) for)\s+(.+)$/))) return { name: 'search_all', args: { query: m[1] } };

  // tasks / to-dos
  if ((m = original.match(/^(?:add|create|new)\s+(?:a\s+)?(?:task|to-?do)[:\s]+(.+)$/i)) || (m = original.match(/^to-?do[:\s]+(.+)$/i)) ||
      (m = original.match(/^add\s+(.+?)\s+to\s+(?:my\s+)?(?:to-?do|task)s?(?:\s+list)?$/i))) {
    return { name: 'task_add', args: { text: m[1] } };
  }
  if (/^(show|list|read|what are|view|open)( me)? (all )?(my |the )?(tasks|to-?dos|to-?do list|task list)$|^(tasks|to-?dos)$|^what('?s| is) on my (list|to-?do list)$|^what do i (need|have) to do( today)?$/.test(t)) {
    return { name: 'task_list', args: { scope: /today/.test(t) ? 'today' : '' } };
  }
  if ((m = t.match(/^(?:mark|tick|check off|complete|finish|finished|done with|i (?:finished|completed|did))\s+(?:the\s+)?(?:task\s+)?(.+?)(?:\s+(?:as\s+)?(?:done|complete|completed|finished))?$/))) return { name: 'task_done', args: { query: m[1] } };
  if ((m = t.match(/^(?:delete|remove) (?:the )?task (.+)$/))) return { name: 'task_delete', args: { query: m[1] } };
  if (/^(clear|remove|delete) (all )?(completed|done|finished) tasks$/.test(t)) return { name: 'tasks_clear_done' };

  // notes
  if ((m = original.match(/^(?:hey nova[,\s]*)?(?:please\s+)?(?:take a note|make a note|note down|jot down|note|remember that|remember)[:\s,-]+(.+)$/i))) return { name: 'note_add', args: { text: m[1].trim() } };
  if (/^(show|list|read|open|what are|view)( me)? (all )?(my |the )?notes$/.test(t) || t === 'notes') return { name: 'notes_list' };
  if ((m = t.match(/^(?:find|search) (?:my )?notes? (?:for |about )?(.+)$/))) return { name: 'notes_list', args: { query: m[1] } };
  if ((m = t.match(/^(?:delete|remove) (?:the )?note (?:about )?(.+)$/))) return { name: 'note_delete', args: { query: m[1] } };
  if (/^(clear|delete|remove) (all )?(my |the )?notes$/.test(t)) return { name: 'notes_clear' };

  // clipboard (plain read only; "summarize my clipboard" goes to AI)
  if (/^(read|show|what'?s in|what is in|what'?s on|what is on) (my |the )?clipboard$/.test(t)) return { name: 'clipboard_read' };

  // folders
  if ((m = t.match(/^(?:open|show|go to) (?:my |the )?(downloads?|documents?|desktop|pictures?|music|videos?|home)(?: folder)?$/))) return { name: 'open_folder', args: { folder: m[1] } };
  if ((m = original.match(/^(?:open|show|go to)\s+(?:folder\s+)?("?[a-zA-Z]:\\[^"]*"?|\\\\[^"]+)$/i))) return { name: 'open_folder', args: { folder: m[1] } };

  // web
  if ((m = t.match(/^(?:search youtube for|youtube|play (.+?) on youtube)\s*(.*)$/))) {
    const q = (m[1] || m[2] || '').trim();
    if (q) return { name: 'web_search', args: { query: q, site: 'youtube' } };
  }
  if ((m = t.match(/^(?:google|search(?: the web)?(?: for)?|look up|search google for)\s+(.+)$/))) return { name: 'web_search', args: { query: m[1] } };
  if ((m = t.match(/^(?:open|go to|visit|browse)\s+((?:https?:\/\/)?(?:[\w-]+\.)+[a-z]{2,}(?:\/\S*)?)$/))) return { name: 'open_url', args: { url: m[1] } };

  // apps
  if ((m = t.match(/^(?:close|quit|exit|kill)\s+(.+)$/))) return { name: 'close_app', args: { name: m[1] } };
  if ((m = t.match(/^(?:open|launch|start|run)\s+(.+)$/)) && !parseWhen(m[1]).found) return { name: 'open_app', args: { name: m[1] } };

  return fallbackIntent(original, true); // confident time-based cases only; brain tries the loose version when AI is off
}

// ---- Universal offline understanding: anything with a date/time becomes a reminder, event or task;
// anything that starts like a to-do becomes a task. Everything else returns null (-> choices).
const EVENT_NOUN = /\b(meeting|meet ?up|appointment|appt|interview|stand-?up|sync|demo|presentation|webinar|workshop|conference|class|lecture|session|party|wedding|flight|dinner with|lunch with|breakfast with|coffee with|call with|catch ?up|review meeting|doctor|dentist|checkup|check-up|visit|exam|hearing|ceremony|concert|match|game night|offsite|training)\b/i;
const TASK_VERB = /^(buy|get|pick up|pickup|collect|order|pay|transfer|deposit|recharge|renew|file|submit|send|email|mail|post|share|upload|download|print|scan|sign|apply|register|book|reserve|cancel|return|fix|repair|clean|wash|tidy|organi[sz]e|prepare|prep|draft|write|finish|complete|review|check|verify|update|follow up|follow-up|reply|respond|ask|tell|inform|remind|call back|text|message|ping|meet|visit|plan|research|read|study|learn|practice|practise|test|deploy|install|backup|back up|configure|setup|set up|create|make|design|cook|water the|feed|walk the|take out|bring|carry|drop off|drop|refill|charge|clear|sort|archive|close|raise|approve|reconcile|invoice|bill|quote|estimate)\b/i;
const QUESTIONY = /^(what|why|how|who|whom|whose|which|when|where|is|are|was|were|do|does|did|can|could|would|should|will|tell me|explain|summari[sz]e|translate|describe|write me|write a (?:poem|story|song|essay|joke)|give me|show me|compare|analy[sz]e)\b/i;
function fallbackIntent(original, strict = false) {
  let x = String(original || '').trim().replace(/[.!?]+$/, '');
  if (!x || x.length > 220) return null;
  if (QUESTIONY.test(x) || /\?\s*$/.test(original) || /\b(you|your|yourself)\b/i.test(x)) return null;
  x = x.replace(/^(?:i\s+(?:have|'ve got|got|need|want|should|must|gotta|ought)\s+to\s+|i\s+(?:need|want)\s+|(?:need|have|got|want)\s+to\s+|gotta\s+|i\s+must\s+|i\s+should\s+|don'?t\s+forget\s+(?:to\s+)?|remember\s+to\s+|make sure (?:i|to)\s+|let'?s\s+)/i, '');
  const ev = x.replace(/^(?:i\s+have|i'?ve\s+got|i\s+got|there'?s|there\s+is|we\s+have|got)\s+(?:a|an|the|my|our)?\s*/i, '');
  const w = parseWhen(x);
  if (w.found && w.at) {
    if (!w.repeat && EVENT_NOUN.test(ev) && !/^(call|ring|phone)\b/i.test(ev)) return { name: 'event_add', args: { title: ev } };
    const rest = (w.rest || '').replace(/^(?:to|about|that)\s+/i, '').replace(/\s+(?:by|due|before|on|at)$/i, '').trim();
    if (!rest || rest.split(/\s+/).length > 30) return null;
    if (w.repeat || w.hasTime) {
      if (strict && !w.repeat && rest.split(/\s+/).length > 8) return null;
      return { name: 'reminder', args: { text: rest, at: w.at.toISOString(), repeat: w.repeat } };
    }
    if (strict && !TASK_VERB.test(x)) return null;
    return { name: 'task_add', args: { text: x } };              // date only ("buy milk tomorrow", "pay bill by friday")
  }
  if (strict && !/^(buy|pay|renew|submit|book|pick up|order|recharge|file)\b/i.test(x)) return null;
  if (TASK_VERB.test(x) && x.split(/\s+/).length >= 2 && x.split(/\s+/).length <= 14 && !/\?$/.test(original) && !/\b(you|your)\b/i.test(x)) return { name: 'task_add', args: { text: x } };
  return null;
}

// Buttons offered when nothing matched (works with AI off). Each runs an ordinary command.
function choicesFor(text) {
  const t = String(text || '').trim().replace(/[.!?]+$/, '');
  const short = t.length > 60 ? t.slice(0, 57) + '…' : t;
  const c = [
    { label: '✅ Add as task', run: `add task ${t}` },
    { label: '📝 Save as note', run: `note ${t}` },
    { label: '🔔 Remind me in 1 hour', run: `remind me in 1 hour to ${t}` },
    { label: '🌅 Remind me tomorrow 9 am', run: `remind me tomorrow at 9 am to ${t}` }
  ];
  if (t.split(/\s+/).length <= 6) c.push({ label: '🔎 Search my stuff', run: `look for ${t}` });
  c.push({ label: '🌐 Search the web', run: `google ${t}` });
  return { short, choices: c };
}

// "mute, open excel and set a 25 min timer" -> several instant local intents (no AI round-trip).
const TEXTY = new Set(['email_draft', 'doc_search', 'phone_push', 'widget_add', 'sap_open', 'water_goal', 'person_add', 'expense_add', 'journal_add', 'countdown_add', 'type_text', 'note_add', 'web_search', 'reminder', 'task_add', 'open_url', 'greet', 'calc', 'notes_list', 'event_add', 'search_all', 'shortcut_add', 'habit_add']);
function parseCompound(input, assistantName, routineNames) {
  const parts = String(input).split(/\s*(?:,|;|\band then\b|\bthen\b|\band\b|\balso\b|&)\s*/i).map((x) => x.trim()).filter(Boolean);
  if (parts.length < 2 || parts.length > 8) return null;
  const intents = parts.map((p) => parse(p, assistantName, routineNames));
  if (intents.some((i) => !i || TEXTY.has(i.name))) return null;
  return intents;
}

// When AI is off: suggest the closest known commands for an unrecognised phrase.
const EXAMPLES = [
  'remind me tomorrow at 9 to …', 'set an alarm for 6:30 am', 'show reminders', 'add task … by Friday', 'show my tasks', 'mark … done',
  'add event … tomorrow 3 to 4 pm', "what's on my calendar this week", 'start focus 25 min', 'take a break', 'log water', 'show habits',
  'note …', 'show notes', 'find …', 'show clipboard history', 'open …', 'close …', 'volume 40', 'mute', 'next song', 'screenshot', 'lock',
  'minimize all', 'weather tomorrow', "what's the date", '15% of 2400', 'start my day', 'focus mode', 'type …', 'press ctrl+s', 'start dictation',
  'spent 250 on lunch', 'how much did I spend this month', "Vivek's birthday is 12 March", 'call …', 'journal: …', 'countdown to … on …', 'time in London', '10 km to miles', '100 usd to inr', 'generate a password', 'start stopwatch', 'do not disturb on',
  'search … on google', 'youtube …', 'timer 10 min', 'brief me', 'battery', 'system info', 'turn on water reminders'
];
function suggest(text, n = 3) {
  const words = String(text).toLowerCase().split(/\W+/).filter((w) => w.length > 2);
  return EXAMPLES.map((e) => ({ e, s: words.filter((w) => e.includes(w)).length })).filter((x) => x.s > 0).sort((a, b) => b.s - a.s).slice(0, n).map((x) => x.e);
}


// ---- Offline "smart guess": typo-fix + keyword intent scoring (no AI)
const VOCAB = ['remind', 'reminder', 'reminders', 'alarm', 'alarms', 'timer', 'water', 'drink', 'drank', 'glass', 'glasses', 'task', 'tasks', 'note', 'notes', 'volume', 'mute', 'unmute',
  'screenshot', 'weather', 'calendar', 'event', 'events', 'meeting', 'focus', 'break', 'habit', 'habits', 'open', 'close', 'lock', 'shutdown', 'restart', 'minimize', 'tomorrow', 'today',
  'tonight', 'minutes', 'minute', 'hours', 'hour', 'seconds', 'show', 'delete', 'cancel', 'snooze', 'birthday', 'spent', 'expense', 'expenses', 'journal', 'countdown', 'stopwatch',
  'password', 'clipboard', 'shortcut', 'search', 'youtube', 'google', 'battery', 'brightness', 'schedule', 'agenda', 'pomodoro', 'routine', 'morning', 'evening', 'every', 'monday',
  'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday', 'january', 'february', 'march', 'april', 'june', 'july', 'august', 'september', 'october', 'november', 'december',
  'next', 'previous', 'song', 'music', 'pause', 'play', 'stretch', 'notepad', 'excel', 'outlook', 'chrome', 'teams', 'calculator', 'settings', 'downloads', 'documents', 'desktop',
  'remember', 'tasks', 'complete', 'done', 'mark', 'add', 'start', 'stop', 'set', 'what', 'time', 'date', 'week', 'month', 'year', 'quiet', 'disturb', 'contact', 'call', 'email'];
function lev(a, b) {
  if (Math.abs(a.length - b.length) > 2) return 9;
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++) d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1), i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1] ? d[i - 2][j - 2] + 1 : 99);
  return d[a.length][b.length];
}
function fixTypos(text) {
  let fixes = 0;
  const out = String(text).split(/(\s+)/).map((w) => {
    const lw = w.toLowerCase();
    if (!/^[a-z]{4,}$/.test(lw) || VOCAB.includes(lw)) return w;
    let best = null, bd = 9;
    for (const v of VOCAB) { const dd = lev(lw, v); if (dd < bd) { bd = dd; best = v; } }
    if (best && (bd === 1 || (bd === 2 && lw.length >= 7))) { fixes++; return best; }
    return w;
  });
  return { text: out.join(''), fixes };
}
const KEYWORD_INTENTS = [
  { kw: ['task', 'tasks', 'todo', 'to-do', 'todos', 'pending'], cmd: 'show my tasks' },
  { kw: ['reminder', 'reminders', 'alarms'], cmd: 'show reminders' },
  { kw: ['notes'], cmd: 'show notes' },
  { kw: ['calendar', 'agenda', 'schedule', 'meeting', 'meetings', 'events', 'plan'], cmd: "what's on my calendar today" },
  { kw: ['focus', 'pomodoro', 'concentrate', 'productive'], cmd: 'start focus 25 min' },
  { kw: ['habit', 'habits', 'streak', 'streaks'], cmd: 'show habits' },
  { kw: ['spend', 'spent', 'money', 'expenses', 'budget', 'spending'], cmd: 'how much did I spend this month' },
  { kw: ['weather', 'rain', 'raining', 'temperature', 'forecast', 'umbrella', 'hot', 'cold'], cmd: 'weather' },
  { kw: ['birthday', 'birthdays'], cmd: 'upcoming birthdays' },
  { kw: ['screenshot', 'capture'], cmd: 'screenshot' },
  { kw: ['clipboard', 'copied'], cmd: 'show clipboard history' },
  { kw: ['countdown', 'countdowns'], cmd: 'show countdowns' },
  { kw: ['battery', 'charge', 'charging'], cmd: 'battery' },
  { kw: ['briefing', 'summary', 'overview'], cmd: 'brief me' },
  { kw: ['help', 'commands', 'features'], cmd: 'help' }
];
function guess(input, assistantName, routineNames) {
  const fx = fixTypos(input);
  if (fx.fixes) {
    const it = parse(fx.text, assistantName, routineNames) || null;
    if (it) return { confidence: fx.fixes <= 2 ? 'high' : 'medium', cmd: fx.text, intent: it };
    const multi = parseCompound(fx.text, assistantName, routineNames);
    if (multi) return { confidence: 'medium', cmd: fx.text };
  }
  const words = [...new Set((fx.text + ' ' + input).toLowerCase().split(/[^a-z-]+/).filter(Boolean))];
  if (words.length > 12) return null;
  const scored = KEYWORD_INTENTS.map((k) => ({ k, s: words.filter((w) => k.kw.includes(w)).length })).filter((x) => x.s > 0).sort((a, b) => b.s - a.s);
  if (scored.length && (scored.length === 1 || scored[0].s > scored[1].s)) return { confidence: 'medium', cmd: scored[0].k.cmd };
  return null;
}

// Description given to the AI so it can drive the same actions.
const ACTION_SPEC = `
open_app {name}            | close_app {name}
open_url {url}             | web_search {query, site?:"youtube"}
open_folder {folder}       (downloads|documents|desktop|pictures|music|videos|absolute path)
volume_set {level:0-100}   | volume_change {delta:-100..100} | mute {on:true|false}
media {key:"playpause"|"next"|"previous"}
point_at {x, y}            (walk the avatar over and point at this pixel on the screenshot — use it to show WHERE something is, e.g. an error)
brightness {level?} or {delta?}
minimize_all {} | lock {} | sleep {} | shutdown {} | restart {} | cancel_shutdown {}
screenshot {} | empty_recycle_bin {}
timer {ms, label?} | timer_cancel {}
reminder {text, at?: ISO datetime "2026-11-22T16:30", when?: natural language like "every monday at 9", repeat?: daily|weekdays|weekly|monthly|yearly|hourly|every:N (every N minutes)|lastday, alarm?: true}
reminder_list {scope?:"today"} | reminder_delete {query} | reminder_snooze {minutes}
reschedule {query, when} (move an event/reminder/task) | away {reason, minutes} | undo_last {}
task_add {text, due?: ISO or natural language, priority?: high|normal|low} | task_list {scope?:"today"} | task_done {query} | task_delete {query}
note_add {text} | notes_list {query?} | note_delete {query} | clipboard_read {}
briefing {} | routine_run {name} | agenda {scope?:"today"|"tomorrow"|"week"}
event_add {title, start?: ISO, end?: ISO, when?: natural language like "tomorrow 3 to 4 pm", location?, allDay?, remindMin?} | event_delete {query}
habit_log {query} | habit_add {name, target?} | habit_list {}
focus_start {minutes?, label?} | focus_stop {} | focus_pause {} | focus_break {long?} | focus_status {}
clipboard_history {query?} | shortcut_open {name} | search_all {query}
wellbeing_set {key:"water"|"stretch"|"eyes", on:true|false}
outlook_sync {} | outlook_unread {} | email_draft {to, subject?, body?}   (opens a draft; never sends)
sap_open {tcode, system?} | doc_search {query} | doc_index {} | ocr_grab {}
tidy_folder {folder?:"downloads"} | tidy_undo {} | plan_day {day?:"today"|"tomorrow", commit?:true}
usage_report {scope?:"today"|"week"} | rewards_status {} | outfit_set {slot:"hat"|"eyes"|"neck"|"aura", id} | perch {}
automation_run {name} | phone_push {text} | widget_add {type:"note"|"tasks"|"countdown"|"agenda"|"clock"|"water", text?} | meeting_record {on}
water_log {glasses} | water_status {} | water_goal {target} | wellbeing_every {key, minutes}
person_add {name, phone?, email?, birthday?: "12 March"} | person_info {query, field?} | person_contact {query, how:"call"|"email"|"whatsapp"} | birthdays_upcoming {}
expense_add {amount, note} | expense_summary {scope?:"today"|"week"|"month"} | journal_add {text, mood?:1-5}
countdown_add {title, date} | days_until {query} | time_in {place} | convert {amount, from, to} | password_gen {length?} | stopwatch {op:"start"|"stop"|"reset"|"status"} | dnd {on} | read_aloud {}
time {} | date {} | year {} | battery {} | system_info {} | weather {city?, day?:"today"|"tomorrow"} | calc {expr}
focus_window {title}         (bring an open app/window to the front, e.g. "excel", "chrome", part of a title)
type_text {text}             (types into the focused window; use \n for Enter, \t for Tab)
press_keys {keys, times?}    (e.g. "ctrl+s", "enter", "tab", "alt+tab", "ctrl+shift+t", "f5")
mouse_click {x?, y?, button?:"left"|"right"|"middle", double?}   (no x/y = click where the cursor is)
mouse_move {x, y} | drag {x1, y1, x2, y2} | scroll {direction:"up"|"down", amount?}
wait {ms}                    (pause, e.g. after opening an app before typing)
screen_look {}               (take a fresh screenshot; you will see it and can continue)
dictation {on:true|false}
Coordinates (x, y) are PIXELS IN THE MOST RECENT SCREENSHOT you were shown. Only click on things you can actually see.`;

function appNames() { return startApps.map((a) => a.Name).sort(); }
module.exports = { fallbackIntent, choicesFor, guess, fixTypos, rewrite, normBirthday, daysUntilBirthday, daysUntil, guessCategory, appNames, suggest, parseEvent, todayKey, habitStreak, parse, parseCompound, runAction, indexApps, ACTIONS, ACTION_SPEC, parseClock, parseKeys };
