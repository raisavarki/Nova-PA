// "If this, then that" automations. Triggers watch time, folders, apps, battery, Wi-Fi, clipboard;
// actions are ordinary Nova commands (run offline) or file operations on the triggering file.
const EventEmitter = require('events');
const fs = require('fs');
const path = require('path');

const TRIGGERS = {
  time: 'At a time of day',
  file_added: 'When a file appears in a folder',
  app_start: 'When an app starts',
  app_focus: 'When I switch to an app',
  battery_low: 'When battery drops below',
  wifi: 'When I connect to a Wi-Fi network',
  clipboard: 'When I copy text matching',
  startup: 'When Nova starts',
  back: 'When I come back to my PC'
};

function globToRe(g) {
  const s = String(g || '*').trim();
  if (/^\/.+\/[a-z]*$/i.test(s)) { const m = s.match(/^\/(.+)\/([a-z]*)$/i); return new RegExp(m[1], m[2] || 'i'); }
  const parts = s.split(/[;,]\s*/).filter(Boolean).map((p) => p.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*').replace(/\?/g, '.'));
  return new RegExp('^(' + parts.join('|') + ')$', 'i');
}
function uniquePath(dir, name) {
  let p = path.join(dir, name), i = 1;
  const ext = path.extname(name), base = path.basename(name, ext);
  while (fs.existsSync(p)) p = path.join(dir, `${base} (${i++})${ext}`);
  return p;
}
function moveFile(src, destDir, copy) {
  fs.mkdirSync(destDir, { recursive: true });
  const dest = uniquePath(destDir, path.basename(src));
  if (copy) { fs.copyFileSync(src, dest); return dest; }
  try { fs.renameSync(src, dest); } catch (e) { if (e.code === 'EXDEV') { fs.copyFileSync(src, dest); fs.unlinkSync(src); } else throw e; }
  return dest;
}
function fill(str, v) {
  const d = new Date();
  const map = {
    file: v.file || '', filename: v.file ? path.basename(v.file) : '', folder: v.file ? path.dirname(v.file) : '', app: v.app || '', clip: v.clip || '', ssid: v.ssid || '',
    date: d.toISOString().slice(0, 10), year: String(d.getFullYear()), month: d.toLocaleDateString('en', { month: 'short' }) + '-' + d.getFullYear(), monthnum: String(d.getMonth() + 1).padStart(2, '0'), day: String(d.getDate()).padStart(2, '0')
  };
  return String(str).replace(/\{(\w+)\}/g, (m, k) => (k in map ? map[k] : m));
}

class Automations extends EventEmitter {
  init({ store, run, ps, getDownloads }) {
    this.store = store; this.run = run; this.ps = ps; this.getDownloads = getDownloads;
    this.watchers = new Map(); this.fired = {}; this.procs = null; this.batteryLow = false; this.ssid = undefined;
    this.syncWatchers();
    clearInterval(this.t1); this.t1 = setInterval(() => this.tickTime(), 20000);
    clearInterval(this.t2); this.t2 = setInterval(() => this.tickSlow(), 30000);
    store.events.on('change', (keys) => { if (keys.includes('automations')) this.syncWatchers(); });
    setTimeout(() => this.fireType('startup', {}), 8000);
  }
  rules() { return (this.store.get().automations || []).filter((r) => r.enabled !== false); }

  // ---- triggers
  tickTime() {
    const d = new Date(), hm = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`, key = d.toDateString() + hm;
    for (const r of this.rules().filter((x) => x.trigger.type === 'time')) {
      const days = r.trigger.days && r.trigger.days.length ? r.trigger.days : [0, 1, 2, 3, 4, 5, 6];
      if (r.trigger.at === hm && days.includes(d.getDay()) && this.fired[r.id] !== key) { this.fired[r.id] = key; this.fire(r, {}); }
    }
  }
  async tickSlow() {
    const rs = this.rules();
    if (process.platform !== 'win32') return;
    if (rs.some((r) => r.trigger.type === 'app_start')) {
      try {
        const out = await this.ps.run('(Get-Process | Where-Object { $_.MainWindowHandle -ne 0 } | Select-Object -ExpandProperty ProcessName -Unique) -join "|"', 8000);
        const now = new Set(out.trim().toLowerCase().split('|').filter(Boolean));
        if (this.procs) for (const p of now) if (!this.procs.has(p)) this.fireType('app_start', { app: p }, (r) => p.includes(String(r.trigger.app || '').toLowerCase().replace(/\.exe$/, '')));
        this.procs = now;
      } catch (e) {}
    }
    if (rs.some((r) => r.trigger.type === 'battery_low') && (this.batTick = (this.batTick || 0) + 1) % 4 === 1) {
      try {
        const lvl = parseInt((await this.ps.run('(Get-CimInstance Win32_Battery | Select-Object -First 1).EstimatedChargeRemaining', 8000)).trim(), 10);
        if (!isNaN(lvl)) {
          for (const r of rs.filter((x) => x.trigger.type === 'battery_low')) {
            const th = +r.trigger.below || 20;
            if (lvl <= th && !this.fired[r.id + 'b']) { this.fired[r.id + 'b'] = true; this.fire(r, { battery: lvl }); }
            if (lvl > th + 5) this.fired[r.id + 'b'] = false;
          }
        }
      } catch (e) {}
    }
    if (rs.some((r) => r.trigger.type === 'wifi') && (this.wifiTick = (this.wifiTick || 0) + 1) % 2 === 1) {
      try {
        const out = await this.ps.run("(netsh wlan show interfaces) -match '^\\s+SSID\\s+:' | ForEach-Object { ($_ -split ':', 2)[1].Trim() } | Select-Object -First 1", 8000);
        const ssid = out.trim();
        if (this.ssid !== undefined && ssid && ssid !== this.ssid) this.fireType('wifi', { ssid }, (r) => !r.trigger.ssid || ssid.toLowerCase() === String(r.trigger.ssid).toLowerCase());
        this.ssid = ssid;
      } catch (e) {}
    }
  }
  onForeground(proc, title) {
    if (proc === this.lastFg) return; this.lastFg = proc;
    this.fireType('app_focus', { app: proc }, (r) => { const a = String(r.trigger.app || '').toLowerCase(); return a && (String(proc).toLowerCase().includes(a) || String(title).toLowerCase().includes(a)); }, 60000);
  }
  onClipboard(text) {
    this.fireType('clipboard', { clip: text }, (r) => { try { return globToRe(r.trigger.pattern.startsWith('/') ? r.trigger.pattern : '*' + r.trigger.pattern + '*').test(text); } catch (e) { return false; } }, 5000);
  }
  onBack() { this.fireType('back', {}); }

  syncWatchers() {
    const want = new Map();
    for (const r of this.rules().filter((x) => x.trigger.type === 'file_added')) {
      const folder = this.resolveFolder(r.trigger.folder);
      if (folder) want.set(folder, true);
    }
    for (const [f, w] of this.watchers) if (!want.has(f)) { try { w.close(); } catch (e) {} this.watchers.delete(f); }
    for (const f of want.keys()) {
      if (this.watchers.has(f)) continue;
      try {
        const seen = new Set(fs.readdirSync(f));
        const w = fs.watch(f, (ev, name) => { if (name && !seen.has(name)) this.onFile(f, name, seen); });
        this.watchers.set(f, w);
      } catch (e) { console.warn('watch failed', f, e.message); }
    }
  }
  resolveFolder(f) {
    const s = String(f || '').trim();
    if (!s || /^downloads$/i.test(s)) return this.getDownloads();
    return s;
  }
  onFile(folder, name, seen) {
    if (/\.(crdownload|part|tmp|partial|download)$/i.test(name) || name.startsWith('~$')) return;
    const p = path.join(folder, name);
    let last = -1, tries = 0;
    const check = () => {
      let st; try { st = fs.statSync(p); } catch (e) { return; }
      if (!st.isFile()) { seen.add(name); return; }
      if (st.size !== last || tries < 1) { last = st.size; tries++; if (tries < 40) setTimeout(check, 1500); return; }
      seen.add(name);
      for (const r of this.rules().filter((x) => x.trigger.type === 'file_added' && this.resolveFolder(x.trigger.folder) === folder)) {
        if (globToRe(r.trigger.pattern || '*').test(name)) this.fire(r, { file: p });
      }
    };
    setTimeout(check, 800);
  }

  fireType(type, vars, filter, cooldown) {
    for (const r of this.rules().filter((x) => x.trigger.type === type && (!filter || filter(x)))) {
      if (cooldown && Date.now() - (this.fired[r.id + 'cd'] || 0) < cooldown) continue;
      this.fired[r.id + 'cd'] = Date.now();
      this.fire(r, vars);
    }
  }

  // ---- actions
  async fire(rule, vars) {
    const out = [];
    let file = vars.file;
    for (const raw of rule.actions || []) {
      const a = fill(raw, { ...vars, file });
      let m;
      try {
        if ((m = a.match(/^(move|copy) (?:it |file |this file )?(?:to|into) (.+)$/i)) && file) {
          const dest = moveFile(file, m[2].trim().replace(/^"|"$/g, ''), /copy/i.test(m[1]));
          out.push(`${/copy/i.test(m[1]) ? 'Copied' : 'Moved'} ${path.basename(file)} → ${path.dirname(dest)}`);
          if (!/copy/i.test(m[1])) file = dest;
        } else if ((m = a.match(/^rename (?:it |file )?to (.+)$/i)) && file) {
          const dest = uniquePath(path.dirname(file), m[1].trim()); fs.renameSync(file, dest); file = dest; out.push(`Renamed to ${path.basename(dest)}`);
        } else if (/^notify (.+)$/i.test(a)) {
          out.push(a.replace(/^notify\s+/i, ''));
        } else if (a.trim()) {
          const r = await this.run(a);
          if (r && r.text) out.push(r.text);
        }
      } catch (e) { out.push(`⚠️ ${a}: ${e.message}`); }
    }
    const entry = { t: Date.now(), id: rule.id, name: rule.name, out: out.join('\n') };
    const log = (this.store.get().automationLog || []).concat([entry]).slice(-100);
    this.store.set({ automationLog: log, automations: (this.store.get().automations || []).map((r) => (r.id === rule.id ? { ...r, lastRun: entry.t } : r)) });
    this.emit('fired', rule, entry);
    return entry;
  }
}

module.exports = new Automations();
module.exports.TRIGGERS = TRIGGERS;
module.exports._test = { globToRe, fill, moveFile };
