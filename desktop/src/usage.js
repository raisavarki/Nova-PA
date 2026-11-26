// App-usage tracking (from the foreground window Nova already watches) + focus-time distraction blocker.
const EventEmitter = require('events');
const NAMES = {
  excel: 'Excel', winword: 'Word', powerpnt: 'PowerPoint', outlook: 'Outlook', olk: 'Outlook', onenote: 'OneNote', teams: 'Teams', 'ms-teams': 'Teams',
  chrome: 'Chrome', msedge: 'Edge', firefox: 'Firefox', brave: 'Brave', code: 'VS Code', saplogon: 'SAP Logon', saplgpad: 'SAP Logon', sapgui: 'SAP GUI',
  eclipse: 'Eclipse', explorer: 'File Explorer', notepad: 'Notepad', 'notepad++': 'Notepad++', acrord32: 'Acrobat', acrobat: 'Acrobat', whatsapp: 'WhatsApp',
  slack: 'Slack', zoom: 'Zoom', spotify: 'Spotify', postman: 'Postman', windowsterminal: 'Terminal', cmd: 'Command Prompt', powershell: 'PowerShell', 'nova companion': 'Nova', electron: 'Nova'
};
const friendly = (p) => NAMES[String(p || '').toLowerCase()] || (p ? p.charAt(0).toUpperCase() + p.slice(1) : 'Other');

class Usage extends EventEmitter {
  init(store, { idleSec, minimize, isFocusing, notify }) {
    this.store = store; this.idleSec = idleSec; this.minimize = minimize; this.isFocusing = isFocusing; this.notify = notify;
    this.acc = {}; this.last = null; this.lastBlock = 0;
    clearInterval(this.t); this.t = setInterval(() => this.flush(), 60000);
  }
  dayKey(d = new Date()) { return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; }
  // called ~every 700 ms with the foreground window
  sample(win) {
    const now = Date.now();
    if (this.last && win) {
      const dt = Math.min(5, (now - this.last.t) / 1000);
      if (this.idleSec() < 120) { const k = friendly(this.last.proc); this.acc[k] = (this.acc[k] || 0) + dt; }
    }
    this.last = win ? { t: now, proc: win.proc, title: win.title, hwnd: win.hwnd } : null;
    if (win) this.block(win);
  }
  block(win) {
    const b = this.store.get().blocker || {};
    if (!b.enabled || !this.isFocusing()) return;
    const t = String(win.title || '').toLowerCase(), p = String(win.proc || '').toLowerCase();
    const hitTitle = (b.titles || []).find((k) => k && t.includes(String(k).toLowerCase()));
    const hitApp = (b.apps || []).find((k) => k && p.includes(String(k).toLowerCase().replace(/\.exe$/, '')));
    if (!hitTitle && !hitApp) return;
    if (Date.now() - this.lastBlock < 8000) return;
    this.lastBlock = Date.now();
    this.minimize(win.hwnd);
    this.notify(`🎯 You're in a focus session, so I tucked away ${hitTitle ? '"' + hitTitle + '"' : friendly(win.proc)}. Back to it!`);
  }
  flush() {
    if (!Object.keys(this.acc).length) return;
    const k = this.dayKey();
    const usage = { ...(this.store.get().usage || {}) };
    const day = { ...(usage[k] || {}) };
    for (const [app, sec] of Object.entries(this.acc)) day[app] = Math.round((day[app] || 0) + sec);
    usage[k] = day;
    const keys = Object.keys(usage).sort(); while (keys.length > 60) delete usage[keys.shift()];
    this.acc = {};
    this.store.set({ usage });
  }
  report(days = 7) {
    this.flush();
    const usage = this.store.get().usage || {};
    const out = [];
    for (let i = days - 1; i >= 0; i--) {
      const d = new Date(); d.setDate(d.getDate() - i);
      const k = this.dayKey(d); const apps = usage[k] || {};
      out.push({ day: k, label: d.toLocaleDateString([], { weekday: 'short' }), total: Object.values(apps).reduce((a, b) => a + b, 0), apps });
    }
    return out;
  }
}
module.exports = new Usage();
module.exports.friendly = friendly;
