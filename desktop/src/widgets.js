// Desktop widgets: sticky notes, task list, countdown, agenda, clock. Small frameless windows that live on the desktop.
const { BrowserWindow, screen } = require('electron');
const path = require('path');

const SIZES = { note: [240, 220], tasks: [280, 320], countdown: [220, 150], agenda: [290, 300], clock: [260, 170], water: [200, 170], focus: [230, 190], meeting: [300, 160] };

class Widgets {
  init(store, icon) { this.store = store; this.icon = icon; this.wins = new Map(); }
  list() { return this.store.get().widgets || []; }
  save(list) { this.store.set({ widgets: list }); }
  openAll() { for (const w of this.list()) this.open(w); }
  add(type, opts = {}) {
    const [w, h] = SIZES[type] || [260, 220];
    const wa = screen.getPrimaryDisplay().workArea;
    const n = this.list().length;
    const wd = { id: this.store.uid('w'), type, x: wa.x + 40 + (n % 5) * 30, y: wa.y + 40 + (n % 5) * 30, w, h, onTop: false, color: opts.color || 'peach', text: opts.text || '', refId: opts.refId || '' };
    this.save(this.list().concat([wd]));
    this.open(wd);
    return wd;
  }
  update(id, patch) {
    this.save(this.list().map((w) => (w.id === id ? { ...w, ...patch } : w)));
    const win = this.wins.get(id);
    if (win && !win.isDestroyed() && patch.onTop !== undefined) win.setAlwaysOnTop(!!patch.onTop, 'floating');
  }
  remove(id) {
    this.save(this.list().filter((w) => w.id !== id));
    const win = this.wins.get(id); this.wins.delete(id);
    if (win && !win.isDestroyed()) win.destroy();
  }
  get(id) { return this.list().find((w) => w.id === id); }
  open(wd) {
    if (this.wins.has(wd.id) && !this.wins.get(wd.id).isDestroyed()) { this.wins.get(wd.id).show(); return; }
    const win = new BrowserWindow({
      x: wd.x, y: wd.y, width: wd.w, height: wd.h, minWidth: 160, minHeight: 110, frame: false, transparent: true, resizable: true,
      skipTaskbar: true, alwaysOnTop: !!wd.onTop, show: false, hasShadow: false, title: 'Nova widget', icon: this.icon, backgroundColor: '#00000000',
      webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, nodeIntegration: false, additionalArguments: ['--nova-role=widget'] }
    });
    win.loadFile(path.join(__dirname, 'renderer', 'widget', 'index.html'), { query: { id: wd.id, type: wd.type } });
    win.once('ready-to-show', () => win.showInactive());
    let t = null;
    const persist = () => { clearTimeout(t); t = setTimeout(() => { if (win.isDestroyed()) return; const b = win.getBounds(); this.save(this.list().map((w) => (w.id === wd.id ? { ...w, x: b.x, y: b.y, w: b.width, h: b.height } : w))); }, 400); };
    win.on('move', persist); win.on('resize', persist);
    this.wins.set(wd.id, win);
  }
  broadcast(ev) { for (const w of this.wins.values()) if (!w.isDestroyed()) w.webContents.send('nova:event', ev); }
  windows() { return [...this.wins.values()].filter((w) => !w.isDestroyed()); }
}
module.exports = new Widgets();
