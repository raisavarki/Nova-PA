// Nova: main process. The app window is the hub; the desktop companion is an optional incarnation.
const { app, BrowserWindow, Tray, Menu, globalShortcut, ipcMain, screen, nativeImage, shell, powerMonitor, dialog } = require('electron');
const os = require('os');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const store = require('./store');
const ps = require('./ps');
const commands = require('./commands');
const ai = require('./ai');
const wake = require('./wake');
const scheduler = require('./scheduler');
const brain = require('./brain');
const focus = require('./focus');
const account = require('./account');
const { clipboard, session: eSession, desktopCapturer: eCapturer, Notification } = require('electron');
const outlook = require('./outlook');
const sap = require('./sap');
const docs = require('./docs');
const ocr = require('./ocr');
const automations = require('./automations');
const usage = require('./usage');
const rewards = require('./rewards');
const ntfy = require('./ntfy');
const widgets = require('./widgets');
const devtools = require('./devtools');
const devkit = require('./devkit');
const qr = require('./qr');
const vault = require('./vault');
const { exec, spawn: cpSpawn } = require('child_process');
const dns = require('os');

// Portable data: keep settings + Chromium caches next to the app (e.g. on D: or a USB) instead of C:\Users\…\AppData.
// Two ways in: start.bat sets NOVA_DATA_DIR, OR a USB build is detected by a marker file next to the executable.
let PORTABLE = false, PORTABLE_ROOT = null;
(function usePortableData() {
  let dir = process.env.NOVA_DATA_DIR || '';
  let root = dir ? path.dirname(dir) : '';
  let usb = false;
  if (process.env.NOVA_PORTABLE_DIR) {                 // explicit portable root (USB launcher sets this)
    root = process.env.NOVA_PORTABLE_DIR; dir = path.join(root, 'data'); usb = true;
  }
  if (!dir) {
    // USB / double-click build: look for a marker (or an existing data folder) beside Nova.exe.
    const exeDir = path.dirname(app.getPath('exe'));
    const cands = [exeDir, path.join(process.resourcesPath || exeDir, '..'), path.join(__dirname, '..')];
    for (const base of cands) {
      try {
        if (fs.existsSync(path.join(base, 'nova-portable.txt')) || fs.existsSync(path.join(base, 'data', 'settings.json'))) {
          root = base; dir = path.join(base, 'data'); usb = true; break;
        }
      } catch (e) {}
    }
  }
  if (!dir) return;
  try {
    fs.mkdirSync(dir, { recursive: true });
    const oldFile = path.join(app.getPath('appData'), 'Nova Companion', 'settings.json');
    const newFile = path.join(dir, 'settings.json');
    if (!usb && !fs.existsSync(newFile) && fs.existsSync(oldFile)) fs.copyFileSync(oldFile, newFile);
    app.setPath('userData', dir);
    app.setPath('crashDumps', path.join(dir, 'crashes'));
    // Keep Chromium's temp + caches on the same drive too (so nothing lands on the host C:).
    const cache = path.join(root || dir, '.cache');
    fs.mkdirSync(path.join(cache, 'tmp'), { recursive: true });
    app.setPath('temp', path.join(cache, 'tmp'));
    app.commandLine.appendSwitch('disk-cache-dir', path.join(cache, 'gpu'));
    PORTABLE = usb; PORTABLE_ROOT = root || dir;          // only a true USB build flips portable security on
    if (usb) process.env.NOVA_PORTABLE = '1';
  } catch (e) { console.warn('portable data dir failed, using AppData:', e.message); }
})();

if (!app.requestSingleInstanceLock()) { app.quit(); process.exit(0); }
app.setAppUserModelId('com.raisa.nova');
app.commandLine.appendSwitch('disable-renderer-backgrounding');

const ICON = path.join(__dirname, '..', 'assets', 'icon.png');
const COMP_W = 360, COMP_H = 440;
const STARTED_HIDDEN = process.argv.includes('--hidden');

let appWin = null, compWin = null, tray = null;
let compLayout = { h: 'right', v: 'bottom' };
let dragTimer = null, dragOffset = null, dragStart = null;

const avatarArea = () => (store.get().avatarSize || 84) + 56; // character + antenna + glow

// ------------------------------------------------------------ broadcast helpers
function wins() { return [appWin, compWin, ...(widgets.windows ? widgets.windows() : [])].filter((w) => w && !w.isDestroyed()); }
function broadcast(ev) { for (const w of wins()) w.webContents.send('nova:event', ev); }
function compVisible() { return !!(compWin && !compWin.isDestroyed() && compWin.isVisible()); }
function speaker() { return compVisible() ? 'companion' : 'app'; }

// ------------------------------------------------------------ main app window
function createAppWindow(show = true) {
  appWin = new BrowserWindow({
    width: 1120, height: 740, minWidth: 880, minHeight: 600, show: false, icon: ICON, title: 'Nova',
    backgroundColor: '#F6F1E9', titleBarStyle: 'hidden',
    titleBarOverlay: { color: '#F6F1E9', symbolColor: '#3D3929', height: 40 },
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, nodeIntegration: false, spellcheck: true, additionalArguments: ['--nova-role=app'] }
  });
  appWin.loadFile(path.join(__dirname, 'renderer', 'app', 'index.html'));
  appWin.webContents.setWindowOpenHandler(({ url }) => { if (/^https?:/.test(url)) shell.openExternal(url); return { action: 'deny' }; });
  appWin.once('ready-to-show', () => { if (show) appWin.show(); });
  appWin.on('close', (e) => { if (!app.isQuitting) { e.preventDefault(); appWin.hide(); } });
}
function showApp(section) {
  const fresh = !appWin || appWin.isDestroyed();
  if (fresh) createAppWindow(true);
  if (appWin.isMinimized()) appWin.restore();
  const wasHidden = fresh || !appWin.isVisible();
  appWin.show(); appWin.focus();
  // Tell the renderer the window was just brought up, so it can re-ask the PIN (lock on every open).
  if (wasHidden && !fresh) appWin.webContents.send('nova:event', { type: 'app-shown' });
  if (section) appWin.webContents.send('nova:event', { type: 'navigate', section });
}

// ------------------------------------------------------------ desktop companion
function defaultAvatarPos() {
  const wa = screen.getPrimaryDisplay().workArea;
  return { x: wa.x + wa.width - avatarArea() - 12, y: wa.y + wa.height - avatarArea() - 8 };
}
function clampAvatar(p) {
  const A = avatarArea();
  const wa = screen.getDisplayNearestPoint({ x: p.x + A / 2, y: p.y + A / 2 }).workArea;
  return { x: Math.round(Math.min(Math.max(p.x, wa.x), wa.x + wa.width - A)), y: Math.round(Math.min(Math.max(p.y, wa.y), wa.y + wa.height - A)) };
}
let walking = null; // active walk/attention/wander routine
let dragging = false;
function homeX() {
  const A = avatarArea();
  const pos = clampAvatar(store.get().companion.pos || defaultAvatarPos());
  return compLayout.h === 'right' ? pos.x + A - COMP_W : pos.x;
}
function placeCompanion() {
  if (!compWin || walking || dragging) return;
  const A = avatarArea();
  const pos = clampAvatar(store.get().companion.pos || defaultAvatarPos());
  const wa = screen.getDisplayNearestPoint({ x: pos.x + A / 2, y: pos.y + A / 2 }).workArea;
  compLayout = { h: pos.x + A / 2 > wa.x + wa.width / 2 ? 'right' : 'left', v: pos.y + A / 2 > wa.y + wa.height / 2 ? 'bottom' : 'top' };
  const x = compLayout.h === 'right' ? pos.x + A - COMP_W : pos.x;
  const y = compLayout.v === 'bottom' ? pos.y + A - COMP_H : pos.y;
  compWin.setBounds({ x, y, width: COMP_W, height: COMP_H });
  compWin.webContents.send('nova:event', { type: 'layout', layout: compLayout, size: store.get().avatarSize, area: A });
}
function createCompanion() {
  if (compWin && !compWin.isDestroyed()) { compWin.showInactive(); placeCompanion(); return; }
  compWin = new BrowserWindow({
    width: COMP_W, height: COMP_H, frame: false, transparent: true, resizable: false, maximizable: false, minimizable: false,
    fullscreenable: false, skipTaskbar: true, alwaysOnTop: true, hasShadow: false, focusable: true, show: false,
    backgroundColor: '#00000000', title: 'Nova companion',
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, nodeIntegration: false, backgroundThrottling: false, spellcheck: false, additionalArguments: ['--nova-role=companion'] }
  });
  compWin.__ignore = true;
  compWin.__rects = [];
  compWin.__forceInteractive = false;
  // Single-authority click-through: the window stays click-through and the main-process
  // cursor poll (below) flips it interactive only while the cursor is actually over the
  // avatar or a bubble. No `forward:true` — that re-posts mouse messages and is what made
  // the OS cursor flicker between windows.
  compWin.setIgnoreMouseEvents(true);
  compWin.setAlwaysOnTop(true, 'screen-saver');
  compWin.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  compWin.loadFile(path.join(__dirname, 'renderer', 'companion', 'index.html'));
  compWin.webContents.setWindowOpenHandler(({ url }) => { if (/^https?:/.test(url)) shell.openExternal(url); return { action: 'deny' }; });
  compWin.once('ready-to-show', () => { compWin.showInactive(); placeCompanion(); });
  compWin.on('close', (e) => { if (!app.isQuitting) { e.preventDefault(); setCompanion(false); } });
}
function setCompanion(on) {
  store.set({ companion: { enabled: !!on } });
  if (on) createCompanion();
  else if (compWin && !compWin.isDestroyed()) compWin.hide();
  broadcast({ type: 'companion', enabled: !!on });
  buildTrayMenu();
}
// Eye tracking + click-through authority, in one cheap poll (~25 fps).
// The renderer reports its interactive rectangles (avatar + bubbles) via `comp:rects`; here we
// decide, with a little hysteresis so edges don't chatter, whether the cursor is over one and
// flip the window interactive. This single owner is what removes the cursor flicker.
let lastCursor = '';
let compInteractive = false;
let compLeftAt = 0;
const COMP_HYST_MS = 170;
setInterval(() => {
  if (!compVisible()) { compInteractive = false; return; }
  const c = screen.getCursorScreenPoint();
  const b = compWin.getBounds();
  const lx = c.x - b.x, ly = c.y - b.y;
  const key = c.x + ',' + c.y;
  if (key !== lastCursor) { lastCursor = key; compWin.webContents.send('nova:event', { type: 'cursor', x: lx, y: ly }); }
  // Should the window catch the mouse right now?
  let inside = dragging || compWin.__forceInteractive;
  if (!inside) {
    const rects = compWin.__rects || [];
    for (const r of rects) { if (lx >= r.x && lx <= r.x + r.w && ly >= r.y && ly <= r.y + r.h) { inside = true; break; } }
  }
  const now = Date.now();
  if (inside) {
    compLeftAt = 0;
    if (!compInteractive) { compInteractive = true; compWin.__ignore = false; compWin.setIgnoreMouseEvents(false); }
  } else {
    if (!compLeftAt) compLeftAt = now;
    if (compInteractive && now - compLeftAt > COMP_HYST_MS) { compInteractive = false; compWin.__ignore = true; compWin.setIgnoreMouseEvents(true); }
  }
}, 40);
setInterval(() => { if (compVisible()) compWin.setAlwaysOnTop(true, 'screen-saver'); }, 15000);

// ------------------------------------------------------------ tray
function buildTrayMenu() {
  if (!tray) return;
  const on = store.get().companion.enabled;
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: 'Open Nova', click: () => showApp() },
    { label: on ? 'Hide desktop companion' : 'Show Nova on desktop', click: () => setCompanion(!on) },
    { label: 'Reset companion position', enabled: on, click: () => { store.set({ companion: { pos: null } }); placeCompanion(); } },
    { label: 'Do Not Disturb', type: 'checkbox', checked: !!store.get().dnd, click: (mi) => { store.set({ dnd: mi.checked }); broadcast({ type: 'settings' }); } },
    { type: 'separator' },
    { label: 'Grab text from screen (Alt+Shift+T)', click: () => grabText() },
    { label: 'Tidy Downloads', click: () => brain.uiAction('tidy_folder', { folder: 'downloads' }).then((r) => notifyOut('Downloads', r.text)) },
    { label: 'Settings', click: () => showApp('settings') },
    { type: 'separator' },
    ...(PORTABLE ? [{ label: 'Safe eject (quit & flush to USB)', click: () => { app.isQuitting = true; store.flush(); setTimeout(() => app.quit(), 150); } }] : []),
    { label: 'Quit Nova', click: () => { app.isQuitting = true; app.quit(); } }
  ]));
}
function createTray() {
  tray = new Tray(nativeImage.createFromPath(ICON).resize({ width: 16, height: 16 }));
  tray.setToolTip('Nova');
  tray.on('click', () => (appWin && appWin.isVisible() && appWin.isFocused() ? appWin.hide() : showApp()));
  buildTrayMenu();
}

// ------------------------------------------------------------ hotkeys
let activeHotkeys = { toggle: null, listen: null };
function registerHotkeys() {
  globalShortcut.unregisterAll();
  const hk = store.get().hotkeys;
  const tryReg = (list, fn) => {
    for (const acc of list.filter(Boolean)) {
      try { if (globalShortcut.register(acc, fn)) return acc; } catch (e) { /* invalid */ }
      console.warn('hotkey unavailable:', acc);
    }
    return null;
  };
  activeHotkeys = {
    toggle: tryReg([hk.toggle, 'Alt+Shift+N', 'Control+Alt+N', 'Control+Shift+Alt+N'], () => {
      if (compVisible()) broadcast({ type: 'quick-ask' }); else (appWin && appWin.isVisible() && appWin.isFocused() ? appWin.hide() : showApp());
    }),
    listen: tryReg([hk.listen, 'Alt+Shift+V', 'Control+Shift+Alt+V', 'Control+Alt+J'], () => {
      if (!compVisible()) showApp('chat');
      broadcast({ type: 'listen', target: speaker() });
    }),
    water: tryReg([hk.water, 'Alt+Shift+W'], async () => {
      const r = await brain.uiAction('water_log', { glasses: 1 });
      if (compVisible()) { sendComp({ type: 'thought', text: r.text, ttl: 4000 }); sendComp({ type: 'life', act: 'happy' }); }
      else { try { new (require('electron').Notification)({ title: 'Water logged', body: r.text, icon: ICON, silent: true }).show(); } catch (e) {} }
    }),
    ocr: tryReg([hk.ocr, 'Alt+Shift+T'], () => grabText()),
    quick: tryReg([hk.quick, 'Alt+Shift+Q'], () => {
      if (compVisible()) sendComp({ type: 'quick-panel' }); else showApp('home');
    })
  };
  broadcast({ type: 'hotkeys', hotkeys: activeHotkeys });
}

// ------------------------------------------------------------ wake word
let wakeKey = '';
function startWake() {
  const c = store.get();
  const key = `${c.voice.wakeWord}|${c.assistantName}|${c.voice.wakeSensitivity}`;
  if (key === wakeKey) return;
  wakeKey = key;
  if (c.voice.wakeWord) wake.start(c.assistantName, c.voice.wakeSensitivity || 0.72); else wake.stop();
}


// ------------------------------------------------------------ attention routine (walks over when a reminder fires)
function compReady() {
  return new Promise((res) => {
    if (compWin && !compWin.isDestroyed() && compWin.isVisible() && !compWin.webContents.isLoading()) return res();
    const t0 = Date.now();
    const iv = setInterval(() => { if ((compWin && compWin.isVisible() && !compWin.webContents.isLoading()) || Date.now() - t0 > 4000) { clearInterval(iv); setTimeout(res, 300); } }, 100);
  });
}
function walkTo(x, w, speed = 280) {
  return new Promise((resolve) => {
    if (!compWin || compWin.isDestroyed()) return resolve();
    const b = compWin.getBounds();
    const dir = x < b.x ? 'left' : 'right';
    if (Math.abs(x - b.x) < 4) return resolve();
    compWin.webContents.send('nova:event', { type: 'walk', dir });
    let cur = b.x, last = Date.now();
    const iv = setInterval(() => {
      if (!compWin || compWin.isDestroyed() || w.cancelled) { clearInterval(iv); if (compWin && !compWin.isDestroyed()) compWin.webContents.send('nova:event', { type: 'walk-stop' }); return resolve(); }
      const now = Date.now(), dt = (now - last) / 1000; last = now;
      const step = speed * dt * (dir === 'left' ? -1 : 1);
      cur += step;
      if ((dir === 'left' && cur <= x) || (dir === 'right' && cur >= x)) cur = x;
      compWin.setPosition(Math.round(cur), b.y);
      if (cur === x) { clearInterval(iv); compWin.webContents.send('nova:event', { type: 'walk-stop' }); resolve(); }
    }, 16);
  });
}
const sleep = (ms, w) => new Promise((r) => { const t0 = Date.now(); const iv = setInterval(() => { if (w.acked || w.cancelled || Date.now() - t0 >= ms) { clearInterval(iv); r(); } }, 100); });

async function attention(r) {
  const cfg = store.get();
  if (appWin && !appWin.isDestroyed() && !appWin.isFocused()) appWin.flashFrame(true);
  if (r.gentle || !cfg.companion.walkOnAlert) { if (!compVisible() && !(appWin && appWin.isVisible())) showApp('chat'); return; }
  if (walking && walking.kind === 'wander') { walking.cancelled = true; const t0 = Date.now(); while (walking && Date.now() - t0 < 3000) await new Promise((r) => setTimeout(r, 50)); }
  if (walking) { walking.extend = true; return; } // already over here; the new bubble just stacks
  const temp = !compVisible();
  if (temp) {
    createCompanion(); await compReady();
    if (compWin) compWin.webContents.send('nova:event', { type: 'alert', kind: r.kind, reminder: r, speaker: 'app', msg: {} });
  }
  if (!compWin) return;
  const w = walking = { kind: 'attention', acked: false, cancelled: false };
  const home = { ...compWin.getBounds(), x: homeX() };
  const wa = screen.getDisplayMatching(home).workArea;
  const A = avatarArea();
  const off = compLayout.h === 'right' ? COMP_W - A : 0;          // avatar's x inside the window
  const clampX = (avX) => Math.max(wa.x + 10, Math.min(wa.x + wa.width - A - 10, avX)) - off;
  const centerX = clampX(wa.x + wa.width / 2 - A / 2 + (compLayout.h === 'right' ? 140 : -140));
  await walkTo(centerX, w, 320);
  if (!w.cancelled) compWin.webContents.send('nova:event', { type: 'attention', reminder: r });
  const limit = r.kind === 'alarm' ? 5 * 60000 : 60000;
  const t0 = Date.now(); let side = 1;
  await sleep(3500, w);
  while (!w.acked && !w.cancelled && Date.now() - t0 < limit) {
    // pace a little and hop again to stay noticeable
    await walkTo(clampX(centerX + off + side * 110), w, 160); side *= -1;
    if (w.acked || w.cancelled) break;
    compWin.webContents.send('nova:event', { type: 'attention', reminder: r, again: true });
    await sleep(4000, w);
  }
  if (!w.cancelled) await walkTo(home.x, w, 320);
  walking = null;
  if (appWin && !appWin.isDestroyed()) appWin.flashFrame(false);
  if (temp && !store.get().companion.enabled && compWin && !compWin.isDestroyed()) compWin.hide();
  else placeCompanion();
}
function ackAttention() { if (walking) walking.acked = true; broadcast({ type: 'ack' }); }
ipcMain.on('nova:ack', ackAttention);


// ------------------------------------------------------------ life: curiosity, wandering, thoughts, away/back
const sendComp = (ev) => { if (compVisible()) compWin.webContents.send('nova:event', ev); };
const pick = (a) => a[Math.floor(Math.random() * a.length)];
let lastAct = Date.now(), lastWander = Date.now(), lastThought = Date.now(), awaySince = 0, sleeping = false;

// ---- free roaming across the whole screen border (both axes, organic pacing)
function roamWA() { const b = compWin.getBounds(); return screen.getDisplayMatching(b).workArea; }
function avatarScreenPos() { const b = compWin.getBounds(), A = avatarArea(); return { x: b.x + (compLayout.h === 'right' ? COMP_W - A : 0), y: b.y + (compLayout.v === 'bottom' ? COMP_H - A : 0) }; }
function winPosFor(avX, avY, layout) { const A = avatarArea(); return { x: Math.round(avX - (layout.h === 'right' ? COMP_W - A : 0)), y: Math.round(avY - (layout.v === 'bottom' ? COMP_H - A : 0)) }; }
function layoutForEdge(edge, wa) {
  // which way the speech bubbles should open (toward the screen interior)
  if (edge === 'left') return { h: 'left', v: 'bottom' };
  if (edge === 'right') return { h: 'right', v: 'bottom' };
  if (edge === 'top') return { h: 'right', v: 'top' };
  return { h: 'right', v: 'bottom' };
}
function edgeTarget(wa, edge) {
  const A = avatarArea(), m = 8;
  const rx = () => wa.x + m + Math.random() * (wa.width - A - 2 * m);
  const ry = () => wa.y + m + Math.random() * (wa.height - A - 2 * m);
  if (edge === 'top') return { avX: rx(), avY: wa.y + m, edge };
  if (edge === 'left') return { avX: wa.x + m, avY: ry(), edge };
  if (edge === 'right') return { avX: wa.x + wa.width - A - m, avY: ry(), edge };
  return { avX: rx(), avY: wa.y + wa.height - A - m, edge }; // bottom
}
// animate the avatar to a screen position (avX,avY = avatar's top-left), both axes, keeping it visually continuous
function moveTo(avX, avY, w, speed = 120) {
  return new Promise((resolve) => {
    if (!compWin || compWin.isDestroyed()) return resolve();
    const wa = roamWA();
    const A = avatarArea();
    avX = Math.max(wa.x, Math.min(wa.x + wa.width - A, avX));
    avY = Math.max(wa.y, Math.min(wa.y + wa.height - A, avY));
    const cx = avX + A / 2, cy = avY + A / 2;
    const layout = { h: cx < wa.x + wa.width / 2 ? 'left' : 'right', v: cy < wa.y + wa.height / 2 ? 'top' : 'bottom' };
    // if the bubble side flips, re-anchor the window so the avatar doesn't jump, then tell the renderer
    if (layout.h !== compLayout.h || layout.v !== compLayout.v) {
      const cur = avatarScreenPos(); compLayout = layout; const wp = winPosFor(cur.x, cur.y, layout);
      compWin.setBounds({ x: wp.x, y: wp.y, width: COMP_W, height: COMP_H });
      compWin.webContents.send('nova:event', { type: 'layout', layout: compLayout, size: store.get().avatarSize, area: A });
    }
    const target = winPosFor(avX, avY, compLayout);
    const start = compWin.getBounds();
    const dist = Math.hypot(target.x - start.x, target.y - start.y);
    if (dist < 3) return resolve();
    compWin.webContents.send('nova:event', { type: 'walk', dir: target.x < start.x ? 'left' : 'right' });
    let last = Date.now(), prog = 0;
    const iv = setInterval(() => {
      if (!compWin || compWin.isDestroyed() || (w && w.cancelled)) { clearInterval(iv); if (compWin && !compWin.isDestroyed()) compWin.webContents.send('nova:event', { type: 'walk-stop' }); return resolve(); }
      const now = Date.now(), dt = (now - last) / 1000; last = now;
      prog = Math.min(1, prog + (speed * dt) / dist);
      // ease-in-out so it accelerates and settles — feels alive, not linear
      const e = prog < 0.5 ? 2 * prog * prog : 1 - Math.pow(-2 * prog + 2, 2) / 2;
      compWin.setPosition(Math.round(start.x + (target.x - start.x) * e), Math.round(start.y + (target.y - start.y) * e));
      if (prog >= 1) { clearInterval(iv); compWin.webContents.send('nova:event', { type: 'walk-stop' }); resolve(); }
    }, 16);
  });
}
async function wander() {
  if (!compVisible() || walking || dragging) return;
  const w = walking = { kind: 'wander', acked: false, cancelled: false };
  try {
    const wa = roamWA();
    const cur = avatarScreenPos();
    // weighted edge choice — bottom most, but the sides and top are all fair game
    const edges = ['bottom', 'bottom', 'bottom', 'left', 'right', 'top', 'left', 'right'];
    const legs = 1 + (Math.random() < 0.65 ? 1 : 0) + (Math.random() < 0.3 ? 1 : 0);
    // sometimes it's just curious about the cursor
    if (Math.random() < 0.25) {
      const c = screen.getCursorScreenPoint(); const A = avatarArea();
      const nearY = Math.max(wa.y + 8, Math.min(wa.y + wa.height - A - 8, c.y - A / 2));
      const onEdge = c.x < wa.x + wa.width / 2 ? wa.x + 8 : wa.x + wa.width - A - 8;
      await moveTo(Math.abs(c.x - (wa.x + wa.width / 2)) > wa.width * 0.3 ? onEdge : c.x - A / 2, nearY, w, 150 + Math.random() * 60);
      if (!w.cancelled) { sendComp({ type: 'life', act: 'notice' }); await sleep(1800, w); sendComp({ type: 'life', act: 'tilt' }); await sleep(2500 + Math.random() * 2000, w); }
    } else {
      for (let i = 0; i < legs && !w.cancelled; i++) {
        const t = edgeTarget(wa, pick(edges));
        await moveTo(t.avX, t.avY, w, 85 + Math.random() * 60);
        if (w.cancelled) break;
        sendComp({ type: 'life', act: pick(store.get().devMode ? ['lookaround', 'ponder', 'type', 'tilt', 'sniff', 'debug'] : ['lookaround', 'lookaround', 'tilt', 'peek', 'stretch', 'sniff', 'ponder']) });
        await sleep(2200 + Math.random() * 3200, w);
        if (!w.cancelled && Math.random() < 0.4) { // a small shuffle in place
          await moveTo(t.avX + (Math.random() < 0.5 ? -1 : 1) * (40 + Math.random() * 120), t.avY, w, 70);
          if (!w.cancelled) { sendComp({ type: 'life', act: pick(['hop', 'lookaround', 'ponder']) }); await sleep(2200, w); }
        }
      }
    }
    // sometimes settle in and hang out where it ended up; otherwise amble back home
    if (!w.cancelled && Math.random() < 0.4) await sleep(45000 + Math.random() * 150000, w);
    else if (!w.cancelled && Math.random() < 0.6) { const home = store.get().companion.pos; if (home) await moveTo(clampAvatar(home).x, clampAvatar(home).y, w, 110); }
  } finally {
    walking = null;
    placeCompanion();
  }
}

// Walk over to a spot on screen and point at it (used when the AI finds something, e.g. an error).
async function pointAt(tx, ty) {
  const cfg = store.get();
  const temp = !compVisible();
  if (temp) { createCompanion(); await compReady(); }
  if (!compWin || compWin.isDestroyed()) return;
  if (walking) { walking.cancelled = true; const t0 = Date.now(); while (walking && Date.now() - t0 < 2000) await new Promise((r) => setTimeout(r, 40)); }
  const w = walking = { kind: 'point', cancelled: false, acked: false };
  try {
    const wa = screen.getDisplayNearestPoint({ x: tx, y: ty }).workArea;
    const A = avatarArea();
    let avX = tx - A - 12, dir = 'right';
    if (avX < wa.x + 10) { avX = tx + 12; dir = 'left'; }
    avX = Math.max(wa.x + 6, Math.min(wa.x + wa.width - A - 6, avX));
    const avY = Math.max(wa.y + 6, Math.min(wa.y + wa.height - A - 6, ty - A / 2));
    await moveTo(avX, avY, w, 300);
    if (w.cancelled) return;
    compWin.webContents.send('nova:event', { type: 'point', dir });
    await sleep(5500, w);
  } finally {
    walking = null;
    if (temp && !store.get().companion.enabled && compWin && !compWin.isDestroyed()) compWin.hide();
    else placeCompanion();
  }
}

// Visit the window you're working in: walk over, climb up, sit on its top edge for a while, then come home.
function climbTo(y, w, speed = 180) {
  return new Promise((resolve) => {
    if (!compWin || compWin.isDestroyed()) return resolve();
    const b = compWin.getBounds(); let cur = b.y, last = Date.now();
    const dir = y < b.y ? -1 : 1;
    compWin.webContents.send('nova:event', { type: 'walk', dir: 'right' });
    const iv = setInterval(() => {
      if (!compWin || compWin.isDestroyed() || w.cancelled) { clearInterval(iv); if (compWin && !compWin.isDestroyed()) compWin.webContents.send('nova:event', { type: 'walk-stop' }); return resolve(); }
      const now = Date.now(); cur += dir * speed * (now - last) / 1000; last = now;
      if ((dir < 0 && cur <= y) || (dir > 0 && cur >= y)) cur = y;
      compWin.setPosition(compWin.getBounds().x, Math.round(cur));
      if (cur === y) { clearInterval(iv); compWin.webContents.send('nova:event', { type: 'walk-stop' }); resolve(); }
    }, 16);
  });
}
async function perch() {
  if (!compVisible() || walking || dragging || process.platform !== 'win32') return false;
  const t = brain.getTarget();
  if (!t || !t.hwnd) return false;
  let r; try { r = (await ps.run(`[NovaInput]::Rect(${t.hwnd})`, 3000)).trim().split(',').map(Number); } catch (e) { return false; }
  if (r.length < 6 || r[4] || r[5]) return false; // maximised or minimised
  const toDip = (x, y) => { try { return screen.screenToDipPoint ? screen.screenToDipPoint({ x, y }) : { x, y }; } catch (e) { return { x, y }; } };
  const tl = toDip(r[0], r[1]), br = toDip(r[2], r[3]);
  const b0 = compWin.getBounds();
  const wa = screen.getDisplayMatching(b0).workArea;
  const A = avatarArea(), off = compLayout.h === 'right' ? COMP_W - A : 0, offY = compLayout.v === 'bottom' ? COMP_H - A : 0;
  if (br.x - tl.x < 360 || tl.y < wa.y + 230 || tl.y > wa.y + wa.height - 150 || tl.x > wa.x + wa.width - 100 || br.x < wa.x + 100) return false;
  const w = walking = { kind: 'wander', acked: false, cancelled: false };
  try {
    const avX = Math.max(tl.x + 30, Math.min(br.x - A - 30, tl.x + 60 + Math.random() * Math.max(10, br.x - tl.x - A - 120)));
    const winX = Math.round(avX - off);
    await walkTo(winX, w, 120);
    if (w.cancelled) return true;
    sendComp({ type: 'life', act: 'hop' });
    await sleep(600, w);
    const homeY = compWin.getBounds().y;
    await climbTo(Math.round(tl.y - A + 18 - offY), w, 240);
    if (!w.cancelled) {
      sendComp({ type: 'life', act: 'sit', ms: 60000 });
      if (Math.random() < 0.5) setTimeout(() => sendComp({ type: 'thought', text: pick(['Nice view from up here! 👀', `Ooh, what are we doing in ${t.proc}?`, 'Just keeping you company 😊', 'Comfy spot!']), ttl: 5000 }), 1500);
      await sleep(25000 + Math.random() * 35000, w);
    }
    sendComp({ type: 'life', act: 'wake' });
    await climbTo(homeY, w, 300);
    if (!w.cancelled) await walkTo(homeX(), w, 130);
  } finally { walking = null; placeCompanion(); }
  return true;
}

function thought() {
  const s = store.get(), now = Date.now(), h = new Date().getHours();
  const useful = [];
  const end = new Date(); end.setHours(23, 59, 59, 999);
  const ev = (s.events || []).filter((e) => !e.allDay && e.start > now && e.start - now < 75 * 60000).sort((a, b) => a.start - b.start)[0];
  if (ev) useful.push(`📅 ${ev.title} in ${Math.round((ev.start - now) / 60000)} min`);
  const rem = scheduler.upcoming(5).find((r) => r.at - now < 45 * 60000 && r.kind !== 'timer');
  if (rem) useful.push(`🔔 Coming up: ${rem.text} at ${new Date(rem.at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`);
  const k = commands.todayKey();
  for (const hb of s.habits || []) { const n = (hb.log || {})[k] || 0; if (n < (hb.target || 1) && h >= 10 && h <= 20) useful.push(`${hb.icon || '⭐'} ${hb.name}: ${n}/${hb.target || 1} so far today`); }
  const due = (s.tasks || []).filter((t) => !t.done && ((t.due && t.due <= +end) || t.priority === 'high'));
  if (due.length) useful.push(`✅ ${due.length} task${due.length > 1 ? 's' : ''} for today. Top: ${due[0].text}`);
  const cd = (s.countdowns || []).map((c) => ({ c, d: commands.daysUntil(c.date) })).filter((x) => x.d > 0 && x.d <= 14).sort((a, b) => a.d - b.d)[0];
  if (cd) useful.push(`⏳ ${cd.d} day${cd.d > 1 ? 's' : ''} to ${cd.c.title}`);
  const bd = (s.people || []).filter((p) => p.birthday).map((p) => ({ p, d: commands.daysUntilBirthday(p.birthday) })).filter((x) => x.d > 0 && x.d <= 7).sort((a, b) => a.d - b.d)[0];
  if (bd) useful.push(`🎂 ${bd.p.name}'s birthday in ${bd.d} day${bd.d > 1 ? 's' : ''}`);
  if (!focus.stats().todayMin && h >= 10 && h <= 17) useful.push('🎯 Fancy a 25-minute focus session? Click me and say "start focus".');
  const fun = ['Just stretching my circuits 🤖', "Hmm, what's over there? 👀", 'Everything under control ✨', 'Remember to blink 😉', 'I like this spot.', 'Beep boop. All good here!', 'Posture check! 🧘'];
  if (useful.length && Math.random() < 0.8) return pick(useful);
  return Math.random() < 0.5 ? pick(fun) : (useful[0] || null);
}

function welcomeBack(awayMs) {
  automations.onBack();
  const s = store.get();
  const left = (s.tasks || []).filter((t) => !t.done).length;
  const now = Date.now();
  const next = [...(s.events || []).filter((e) => e.start > now).map((e) => ({ at: e.start, t: e.title })), ...scheduler.upcoming(5).filter((r) => r.kind !== 'timer').map((r) => ({ at: r.at, t: r.text }))].sort((a, b) => a.at - b.at)[0];
  const bits = [`Welcome back${s.userName ? ', ' + s.userName : ''}! 👋`];
  if (next && next.at - now < 4 * 3600000) bits.push(`Next: ${next.t} at ${new Date(next.at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}.`);
  if (left) bits.push(`${left} task${left > 1 ? 's' : ''} open.`);
  sendComp({ type: 'life', act: 'wake' });
  setTimeout(() => { sendComp({ type: 'life', act: 'wave' }); sendComp({ type: 'thought', text: bits.join(' '), ttl: 9000 }); }, 600);
}

setInterval(() => {
  if (!compVisible() || walking || dragging) return;
  const s = store.get(); if (!s) return;
  const life = s.life || {};
  let idle = 0; try { idle = powerMonitor.getSystemIdleTime(); } catch (e) {}
  if (idle > 600) { if (!sleeping) { sleeping = true; awaySince = Date.now() - idle * 1000; sendComp({ type: 'life', act: 'sleep' }); } return; }
  if (sleeping && idle < 20) { sleeping = false; const away = Date.now() - awaySince; if (!s.dnd) welcomeBack(away); else sendComp({ type: 'life', act: 'wake' }); return; }
  if (sleeping) return;
  if (s.dnd || focus.isFocusing()) return;
  const mult = { calm: 0.45, normal: 1, playful: 2.2 }[life.liveliness || 'normal'] || 1;
  const now = Date.now();
  if (life.wander !== false && now - lastWander > 170000 / mult && Math.random() < 0.38 * mult) {
    lastWander = now; lastAct = now;
    if (Math.random() < 0.35) perch().then((ok) => { if (!ok) wander().catch(() => {}); }).catch(() => {}); else wander().catch(() => {});
    return;
  }
  if (life.curious !== false && now - lastAct > 70000 / mult && Math.random() < 0.4 * mult) {
    lastAct = now;
    const base = ['lookaround', 'tilt', 'stretch', 'yawn', 'hop', 'peek', 'sniff', 'ponder', 'wiggle', 'lookaround'];
    const dev = ['type', 'ponder', 'compile', 'debug', 'lookaround', 'tilt'];
    sendComp({ type: 'life', act: pick(s.devMode ? (Math.random() < 0.55 ? dev : base) : base) });
    return;
  }
  if (life.thoughts !== false && now - lastThought > (25 * 60000) / Math.min(mult, 1.6) && Math.random() < 0.35) { const t = thought(); if (t) { lastThought = now; sendComp({ type: 'thought', text: t }); } }
}, 15000);
ipcMain.on('comp:wander', () => wander().catch(() => {}));
ipcMain.on('comp:perch', () => perch().then((ok) => { if (!ok) sendComp({ type: 'thought', text: "I can't reach that window (it's maximised or too close to the top). Make it smaller and try again!", ttl: 5000 }); }).catch(() => {}));

// ------------------------------------------------------------ backup / restore
ipcMain.handle('nova:export', async () => {
  const r = await dialog.showSaveDialog(appWin, { title: 'Export Nova data', defaultPath: `nova-backup-${new Date().toISOString().slice(0, 10)}.json`, filters: [{ name: 'JSON', extensions: ['json'] }] });
  if (r.canceled || !r.filePath) return { ok: false };
  const d = JSON.parse(JSON.stringify(store.get()));
  d.keys = Object.fromEntries(Object.keys(d.keys || {}).map((k) => [k, ''])); // never export API keys
  fs.writeFileSync(r.filePath, JSON.stringify({ app: 'Nova', version: app.getVersion(), exported: new Date().toISOString(), data: d }, null, 2));
  return { ok: true, path: r.filePath };
});
ipcMain.handle('nova:import', async () => {
  const r = await dialog.showOpenDialog(appWin, { title: 'Import Nova backup', properties: ['openFile'], filters: [{ name: 'JSON', extensions: ['json'] }] });
  if (r.canceled || !r.filePaths[0]) return { ok: false };
  try {
    const j = JSON.parse(fs.readFileSync(r.filePaths[0], 'utf8'));
    const d = j.data || j;
    const keep = ['tasks', 'reminders', 'notes', 'routines', 'events', 'habits', 'shortcuts', 'people', 'expenses', 'journal', 'countdowns', 'clocks', 'focus', 'clipboard', 'messages'];
    const patch = {}; for (const k of keep) if (d[k] !== undefined) patch[k] = d[k];
    store.set(patch); store.flush();
    broadcast({ type: 'data', keys: keep }); broadcast({ type: 'settings' });
    return { ok: true, count: Object.keys(patch).length };
  } catch (e) { return { ok: false, error: e.message }; }
});
// ---- cloud sync (data object in/out; encryption happens in the renderer) ----
const SYNC_KEYS = ['tasks', 'reminders', 'notes', 'routines', 'events', 'habits', 'shortcuts', 'people', 'expenses', 'journal', 'countdowns', 'clocks', 'focus', 'clipboard', 'messages', 'reading', 'checklists'];
ipcMain.handle('nova:sync-export', () => {
  const d = store.get(); const out = {};
  for (const k of SYNC_KEYS) if (d[k] !== undefined) out[k] = d[k];
  return out;
});
ipcMain.handle('nova:sync-import', (e, data) => {
  try {
    const patch = {}; for (const k of SYNC_KEYS) if (data && data[k] !== undefined) patch[k] = data[k];
    if (!Object.keys(patch).length) return { ok: false };
    store.set(patch); store.flush();
    broadcast({ type: 'data', keys: SYNC_KEYS });
    return { ok: true };
  } catch (err) { return { ok: false, error: err.message }; }
});

// ------------------------------------------------------------ clipboard history watcher
let lastClip = '', lastClipHint = '';
setInterval(() => {
  try {
    if (!store.get() || !store.get().clipboardCapture) return;
    const t = clipboard.readText();
    if (!t || t === lastClip) return;
    lastClip = t;
    if (brain.takeSuppressedClip(t) || t.length > 20000 || !t.trim()) return;
    const list = (store.get().clipboard || []).filter((c) => c.text !== t);
    list.unshift({ id: store.uid('c'), text: t, t: Date.now(), pinned: false });
    const pinned = list.filter((c) => c.pinned), rest = list.filter((c) => !c.pinned).slice(0, 200);
    store.set({ clipboard: [...pinned, ...rest].sort((a, b) => b.t - a.t) });
    automations.onClipboard(t);
    if (store.get().devMode) { const hit = devtools.detectClip(t); if (hit && hit.run !== lastClipHint) { lastClipHint = hit.run; broadcast({ type: 'dev-clip', kind: hit.kind, label: hit.label, run: hit.run, speaker: speaker() }); } }
  } catch (e) { /* clipboard busy */ }
}, 1000);


// ------------------------------------------------------------ v6 feature wiring
function notifyOut(title, text) {
  if (compVisible()) sendComp({ type: 'thought', text, ttl: 7000 });
  else { try { new Notification({ title, body: String(text).slice(0, 240), icon: ICON, silent: true }).show(); } catch (e) {} }
  broadcast({ type: 'status', text: String(text).split('\n')[0] });
}
async function grabText() {
  try {
    const r = await ocr.grab(ps, brain.ctx.hideForCapture);
    if (!r) return null;
    if (r.error) { notifyOut('Grab text', '⚠️ ' + r.error); return r; }
    notifyOut('Text copied', r.text ? `📋 Copied ${r.text.length} characters:\n${r.text.slice(0, 160)}${r.text.length > 160 ? '…' : ''}` : "I couldn't find any text there.");
    broadcast({ type: 'ocr-result', text: r.text || '' });
    return r;
  } catch (e) { notifyOut('Grab text', '⚠️ ' + e.message); return { error: e.message }; }
}

// --- Outlook sync (local Outlook, no cloud)
let outlookTimer = null;
async function syncOutlook() {
  const c = store.get().outlook || {};
  if (!c.enabled || process.platform !== 'win32') return { ok: false, error: 'Outlook sync is off.' };
  try {
    const items = await outlook.agenda(ps, c.syncDays || 7);
    const old = store.get().events || [];
    const prev = new Map(old.filter((e) => e.source === 'outlook').map((e) => [e.id, e]));
    const mine = old.filter((e) => e.source !== 'outlook');
    const synced = items.map((e) => ({ id: 'ol_' + e.id, title: e.title || '(no subject)', start: e.start, end: e.end, allDay: !!e.allDay, location: e.location || '', joinUrl: e.joinUrl || '', organizer: e.organizer || '', source: 'outlook', remindMin: e.allDay ? null : 5, notifiedAt: (prev.get('ol_' + e.id) || {}).notifiedAt || null }));
    store.set({ events: mine.concat(synced), outlook: { lastSync: Date.now() } });
    return { ok: true, count: synced.length };
  } catch (e) { return { ok: false, error: /class not registered|80040154|ComObject/i.test(e.message) ? 'Outlook (desktop) not found on this PC.' : e.message }; }
}
function startOutlookSync() {
  clearInterval(outlookTimer);
  if ((store.get().outlook || {}).enabled) { syncOutlook(); outlookTimer = setInterval(syncOutlook, 15 * 60000); }
}

// --- extra actions available to commands / AI / automations
const A = commands.ACTIONS;
A.outlook_sync = async () => { const r = await syncOutlook(); return r.ok ? { text: `📅 Synced ${r.count} Outlook events.` } : { text: r.error, error: true }; };
A.outlook_unread = async () => {
  if (!(store.get().outlook || {}).enabled) return { text: 'Turn on Outlook in Settings → Outlook first.', error: true };
  try { const u = await outlook.unread(ps); return { text: `📬 ${u.count} unread email${u.count === 1 ? '' : 's'}${u.items.length ? ':\n' + u.items.map((m) => `• ${m.from}: ${m.subject}`).join('\n') : '.'}` }; }
  catch (e) { return { text: 'Could not read Outlook: ' + e.message, error: true }; }
};
A.email_draft = async ({ to, subject = '', body = '' }) => {
  const people = store.get().people || [];
  const p = people.find((x) => x.name.toLowerCase() === String(to || '').toLowerCase()) || people.find((x) => x.name.toLowerCase().includes(String(to || '').toLowerCase()));
  const addr = (p && p.email) || to;
  if ((store.get().outlook || {}).enabled && process.platform === 'win32') {
    try { await outlook.draft(ps, { to: addr, subject, body }); return { text: `✉️ Opened a draft to ${p ? p.name : to} in Outlook. Review and send when ready.` }; } catch (e) { /* fall back to mailto */ }
  }
  await shell.openExternal(`mailto:${encodeURIComponent(addr || '')}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`);
  return { text: `✉️ Opened a new email to ${p ? p.name : to}.` };
};
A.sap_open = async ({ tcode, system }) => {
  const r = sap.open(store.get().sap, system, tcode);
  return r.ok ? { text: `🟦 Opening ${r.tcode || 'SAP'} on ${r.system}…` } : { text: r.error, error: true };
};
A.doc_search = async ({ query }) => {
  const res = docs.search(query, 8);
  if (!(store.get().docFolders || []).length) return { text: 'Choose folders to search first: Documents page → Add folder.', error: true };
  if (!res.length) return { text: `No documents matching "${query}".${docs.busy ? ' (Still indexing…)' : ''}` };
  return { text: `📄 Found ${res.length}:\n` + res.map((r, i) => `${i + 1}. ${r.name}${r.snippet ? ' · ' + r.snippet.slice(0, 80) : ''}`).join('\n'), open: res[0].path, docs: res };
};
A.doc_index = async () => { docs.rebuild(store.get().docFolders || []).then((st) => broadcast({ type: 'docs', stats: st })); return { text: '🔎 Indexing your document folders in the background…' }; };
A.ocr_grab = async () => { setTimeout(grabText, 300); return { text: '✂️ Drag a box around the text you want to copy.', silent: true }; };
A.usage_report = async ({ scope = 'today' }) => {
  const rep = usage.report(7); const day = rep[rep.length - 1];
  const fmtD = (s) => (s >= 3600 ? `${Math.floor(s / 3600)}h ${Math.round((s % 3600) / 60)}m` : `${Math.round(s / 60)}m`);
  if (scope === 'week') { const tot = {}; rep.forEach((d) => Object.entries(d.apps).forEach(([k, v]) => (tot[k] = (tot[k] || 0) + v))); const top = Object.entries(tot).sort((a, b) => b[1] - a[1]).slice(0, 6); return { text: `🕒 Last 7 days: ` + top.map(([k, v]) => `${k} ${fmtD(v)}`).join(' · ') }; }
  const top = Object.entries(day.apps).sort((a, b) => b[1] - a[1]).slice(0, 6);
  return { text: top.length ? `🕒 Today (${fmtD(day.total)} active): ` + top.map(([k, v]) => `${k} ${fmtD(v)}`).join(' · ') : 'No usage recorded yet today.' };
};
A.rewards_status = async () => { const r = rewards.status(); return { text: `⭐ Level ${r.level} · ${r.into}/${r.need} XP to next level · ${r.today} XP today. Unlocked: ${r.unlocks.filter((u) => u.unlocked).map((u) => u.name).join(', ') || 'nothing yet (reach level 2 for glasses!)'}` }; };
A.outfit_set = async ({ slot, id }) => { store.set({ outfit: { [slot]: id || '' } }); broadcast({ type: 'outfit', outfit: store.get().outfit }); return { text: id ? 'Looking good! ✨' : 'Removed.', silent: true }; };
A.perch = async () => { setTimeout(() => ipcMain.emit('comp:perch'), 200); return { text: '🧗 Off to visit your window!', silent: true }; };
A.phone_push = async ({ text }) => { const ok = await ntfy.push('Nova', text || 'Hello from Nova 👋', { tags: ['robot'] }); return ok ? { text: '📱 Sent to your phone.' } : { text: 'Phone notifications are off or the topic is missing (Settings → Phone).', error: true }; };
A.widget_add = async ({ type = 'note', text }) => { widgets.add(type, { text }); return { text: `📌 Added a ${type} widget to your desktop.` }; };
A.automation_run = async ({ name }) => {
  const r = (store.get().automations || []).find((x) => x.name.toLowerCase() === String(name).toLowerCase()) || (store.get().automations || []).find((x) => x.name.toLowerCase().includes(String(name).toLowerCase()));
  if (!r) return { text: `No automation called "${name}".`, error: true };
  const e = await automations.fire(r, {}); return { text: `⚙️ Ran "${r.name}".${e.out ? '\n' + e.out : ''}` };
};
const baseSearch = A.search_all;
A.search_all = async (args, ctx) => {
  const r = await baseSearch(args, ctx);
  const d = docs.search(args.query, 4);
  if (!d.length) return r;
  const lines = d.map((x) => `📄 ${x.name}`).join('\n');
  return { ...r, text: (/^Nothing found/.test(r.text) ? '' : r.text + '\n') + lines, open: d[0].path };
};
A.meeting_record = async ({ on = true }) => { showApp('meetings'); broadcast({ type: on ? 'meeting-start' : 'meeting-stop' }); return { text: on ? '🎙 Starting meeting recording…' : 'Stopping the recording…', silent: true }; };
// developer command wrappers (so typed/voice commands reach the main-process handlers)
A.run_command = ({ cmd, cwd }) => X.run_command(cmd, cwd);
A.dev_info = () => X.dev_info();
A.ports_list = async () => { const list = await X.ports_list(); return { text: list.length ? list.map((p) => (p.raw ? p.raw : `:${p.port}  pid ${p.pid}${p.name ? '  ' + p.name : ''}`)).join('\n') : 'No listening TCP ports found.', section: 'developer' }; };
A.kill_port = ({ port }) => X.kill_port(port);
A.kill_pid = ({ pid }) => X.kill_pid(pid);
A.qr_make = ({ text }) => { if (!text) return { text: 'What should the QR encode?', error: true }; const r = X.qr_svg(text); return r.ok ? { text: `📱 QR code for: ${text}`, qr: r.svg, section: 'developer' } : { text: r.error, error: true }; };
A.gen_secret = ({ kind, arg }) => X.gen_secret(kind || 'hex', arg);
A.gen_keypair = ({ type }) => X.gen_keypair(type);
A.watch_add = ({ path: p }) => X.watch_add(p);
A.workflow_run = ({ name }) => X.workflow_run(name);
A.vault_lock = () => { const r = X.vault_lock(); return { text: '🔒 Vault locked.' }; };
A.open_terminal = ({ cwd }) => { const r = X.open_terminal_at(cwd); return r.ok ? { text: 'Opening a terminal.' } : { text: 'Could not open a terminal.', error: true }; };
A.dev_convert = ({ op, text, name }) => { const r = X.devkit(op, text, name); return (r && r.ok) ? { text: r.text, copied: !!r.text, section: 'developer' } : { text: (r && r.error) || 'Failed', error: true }; };


// --- meetings: transcribe chunks, summarise at the end (AI optional)
async function transcribeWav(b64) {
  let cloudErr = null;
  try { return { ok: true, text: await ai.transcribe(store.get(), b64, { onModelChange: brain.onModelChange }) }; } catch (e) { cloudErr = e.message; }
  try {
    const f = path.join(os.tmpdir(), `nova_${Date.now()}.wav`);
    fs.writeFileSync(f, Buffer.from(b64, 'base64'));
    const out = await ps.run(`Add-Type -AssemblyName System.Speech
$info = [System.Speech.Recognition.SpeechRecognitionEngine]::InstalledRecognizers() | Where-Object { $_.Culture.Name -like 'en*' } | Select-Object -First 1
if (-not $info) { throw 'NO_OFFLINE_ENGINE' }
$r = New-Object System.Speech.Recognition.SpeechRecognitionEngine($info)
$r.LoadGrammar((New-Object System.Speech.Recognition.DictationGrammar))
$r.SetInputToWaveFile('${f.replace(/'/g, "''")}')
$parts = @(); while ($true) { $res = $r.Recognize(); if (-not $res) { break }; $parts += $res.Text }
$r.Dispose(); $parts -join ' '`, 180000);
    fs.unlink(f, () => {});
    return { ok: true, text: out.trim(), offline: true };
  } catch (e) {
    if (cloudErr === 'NO_STT_KEYS') return { ok: false, error: 'Voice needs a free Groq key (Settings → AI brain), or Windows English speech recognition installed.', settings: true };
    return { ok: false, error: brain.friendlyError(new Error(cloudErr || e.message)) };
  }
}
function heuristicActions(text) {
  const sents = String(text).split(/(?<=[.!?])\s+/);
  return sents.filter((x) => /\b(action item|i will|i'll|we will|we'll|will send|will share|needs to|need to|follow up|by (monday|tuesday|wednesday|thursday|friday|tomorrow|eod|next week))\b/i.test(x)).slice(0, 12).map((x) => x.trim().slice(0, 160));
}
const X = {}; // generic IPC: window.nova.invoke(name, ...args)
X.meeting_start = (title) => { const m = { id: store.uid('mt'), title: title || `Meeting ${new Date().toLocaleString([], { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })}`, start: Date.now(), end: null, transcript: '', summary: '', actions: [], chunks: 0 }; store.set({ meetings: (store.get().meetings || []).concat([m]) }); return m; };
X.meeting_chunk = async (id, b64, idx) => {
  const r = await transcribeWav(b64);
  if (r.ok && r.text) store.set({ meetings: (store.get().meetings || []).map((m) => (m.id === id ? { ...m, transcript: (m.transcript ? m.transcript + '\n' : '') + r.text, chunks: (m.chunks || 0) + 1 } : m)) });
  return r;
};
X.meeting_finish = async (id) => {
  const m = (store.get().meetings || []).find((x) => x.id === id); if (!m) return null;
  let summary = '', actions = [];
  const cfg = store.get();
  if (m.transcript && cfg.aiEnabled && ai.availableProviders(cfg).length) {
    try {
      const r = await ai.chat({ ...cfg, notes: [] }, [], `Here is a meeting transcript. Reply in this exact format:\nSUMMARY: <3-6 short bullet points, one per line starting with "- ">\nACTIONS: <one action item per line starting with "- ", include owner and due date if mentioned; "- none" if none>\n\nTranscript:\n"""${m.transcript.slice(0, 24000)}"""`, {});
      const t = r.text || '';
      summary = (t.split(/ACTIONS:/i)[0] || '').replace(/^\s*SUMMARY:\s*/i, '').trim();
      actions = (t.split(/ACTIONS:/i)[1] || '').split('\n').map((x) => x.replace(/^\s*-\s*/, '').trim()).filter((x) => x && !/^none$/i.test(x));
    } catch (e) { summary = ''; }
  }
  if (!actions.length) actions = heuristicActions(m.transcript);
  const upd = { ...m, end: Date.now(), summary, actions };
  store.set({ meetings: (store.get().meetings || []).map((x) => (x.id === id ? upd : x)) });
  return upd;
};
X.meeting_tasks = async (id, list) => { let n = 0; for (const t of list || []) { await brain.uiAction('task_add', { text: t }); n++; } return n; };
X.meeting_note = async (id) => { const m = (store.get().meetings || []).find((x) => x.id === id); if (!m) return; await brain.uiAction('note_add', { text: `📝 ${m.title}\n${m.summary ? m.summary + '\n\n' : ''}${m.transcript}` }); return true; };
X.meeting_delete = (id) => store.set({ meetings: (store.get().meetings || []).filter((x) => x.id !== id) });
X.meeting_rename = (id, title) => store.set({ meetings: (store.get().meetings || []).map((x) => (x.id === id ? { ...x, title } : x)) });
// widgets
X.widget_add = (type, opts) => widgets.add(type, opts || {});
X.widget_update = (id, patch) => widgets.update(id, patch);
X.widget_remove = (id) => widgets.remove(id);
// documents
X.docs_stats = () => docs.stats();
X.docs_search = (q) => docs.search(q, 30);
X.docs_add_folder = async () => { const r = await dialog.showOpenDialog(appWin, { title: 'Choose a folder to search', properties: ['openDirectory', 'multiSelections'] }); if (r.canceled) return store.get().docFolders; const f = [...new Set([...(store.get().docFolders || []), ...r.filePaths])]; store.set({ docFolders: f }); docs.rebuild(f).then((st) => broadcast({ type: 'docs', stats: st })); return f; };
X.docs_remove_folder = (f) => { const list = (store.get().docFolders || []).filter((x) => x !== f); store.set({ docFolders: list }); docs.rebuild(list).then((st) => broadcast({ type: 'docs', stats: st })); return list; };
X.docs_reindex = () => { docs.rebuild(store.get().docFolders || []).then((st) => broadcast({ type: 'docs', stats: st })); return docs.stats(); };
X.show_in_folder = (p) => shell.showItemInFolder(p);
X.pick_folder = async () => { const r = await dialog.showOpenDialog(appWin, { properties: ['openDirectory'] }); return r.canceled ? '' : r.filePaths[0]; };
// automations
X.auto_triggers = () => require('./automations').TRIGGERS;
X.auto_save = (rule) => { const list = store.get().automations || []; const r = { enabled: true, ...rule, id: rule.id || store.uid('a') }; store.set({ automations: list.some((x) => x.id === r.id) ? list.map((x) => (x.id === r.id ? r : x)) : list.concat([r]) }); return r; };
X.auto_delete = (id) => store.set({ automations: (store.get().automations || []).filter((x) => x.id !== id) });
X.auto_toggle = (id, on) => store.set({ automations: (store.get().automations || []).map((x) => (x.id === id ? { ...x, enabled: on } : x)) });
X.auto_run = async (id) => { const r = (store.get().automations || []).find((x) => x.id === id); return r ? automations.fire(r, {}) : null; };
// usage, rewards, outlook, sap, ocr, phone, perch
X.usage_report = (days) => usage.report(days || 7);
X.rewards_status = () => rewards.status();
X.outfit_set = (slot, id) => { store.set({ outfit: { [slot]: id || '' } }); broadcast({ type: 'outfit', outfit: store.get().outfit }); return store.get().outfit; };
X.outlook_sync = () => syncOutlook();
X.sap_open = (system, tcode) => sap.open(store.get().sap, system, tcode);
X.sap_found = () => sap.findShcut((store.get().sap || {}).shcutPath);
X.ocr_grab = () => grabText();
X.ntfy_test = () => ntfy.push('Nova', 'Test notification from Nova 👋 Reminders will arrive here.', { tags: ['robot'] });
X.ntfy_topic = () => `nova-${Math.random().toString(36).slice(2, 8)}${Math.random().toString(36).slice(2, 8)}`;
X.perch = () => ipcMain.emit('comp:perch');
let recording = false;
X.rec_state = (on) => { recording = !!on; broadcast({ type: 'rec', on: recording }); return recording; };
X.sec_status = () => store.secStatus();
X.sec_unlock = (pin) => { const ok = store.unlock(pin); if (ok) broadcast({ type: 'settings' }); return { ok, status: store.secStatus() }; };
X.sec_setpin = (pin) => { const ok = store.setPin(pin); if (ok) broadcast({ type: 'settings' }); return { ok, status: store.secStatus() }; };
X.sec_plain = () => { const ok = store.usePlainKeys(); if (ok) broadcast({ type: 'settings' }); return { ok, status: store.secStatus() }; };
X.safe_eject = () => { app.isQuitting = true; store.flush(); setTimeout(() => app.quit(), 150); return { ok: true }; };
// ---------------------------------------------------------- developer: shell, workflows, watch, http, ports, info
const IS_WIN = process.platform === 'win32';
function runShell(cmd, cwd, timeout = 20000) {
  return new Promise((resolve) => {
    const opts = { cwd: cwd && fs.existsSync(cwd) ? cwd : undefined, timeout, windowsHide: true, maxBuffer: 1024 * 1024, shell: true };
    exec(cmd, opts, (err, stdout, stderr) => {
      const out = String(stdout || '') + (stderr ? '\n' + stderr : '');
      resolve({ ok: !err, code: err ? err.code || 1 : 0, text: out.trim().slice(0, 8000) || (err ? String(err.message).slice(0, 300) : '(no output)') });
    });
  });
}
X.run_command = async (cmd, cwd) => {
  if (!cmd || !String(cmd).trim()) return { text: 'Give me a command to run.', error: true };
  const dir = cwd || ((store.get().devPaths || {}).repos || [])[0] || '';
  const r = await runShell(String(cmd), dir);
  return { text: `$ ${cmd}\n${r.text}`, error: !r.ok, section: 'developer' };
};
X.open_terminal_at = (cwd) => { const dir = cwd || ((store.get().devPaths || {}).repos || [])[0] || process.env.USERPROFILE || process.env.HOME; try { if (IS_WIN) cpSpawn('wt.exe', ['-d', dir], { detached: true, stdio: 'ignore' }).unref(); else cpSpawn('x-terminal-emulator', [], { cwd: dir, detached: true, stdio: 'ignore' }).unref(); return { ok: true }; } catch (e) { try { cpSpawn('cmd.exe', ['/c', 'start', 'cmd'], { cwd: dir, detached: true, stdio: 'ignore' }).unref(); return { ok: true }; } catch (e2) { return { ok: false, error: e2.message }; } } };
// workflows
X.workflow_list = () => store.get().workflows || [];
X.workflow_save = (wf) => { const list = store.get().workflows || []; const id = wf.id || store.uid('wf'); const item = { id, name: wf.name, commands: wf.commands || [], cwd: wf.cwd || '' }; store.set({ workflows: list.some((w) => w.id === id) ? list.map((w) => (w.id === id ? item : w)) : list.concat([item]) }); return item; };
X.workflow_delete = (id) => { store.set({ workflows: (store.get().workflows || []).filter((w) => w.id !== id) }); return { ok: true }; };
X.workflow_run = async (id, inTerminal) => {
  const wf = (store.get().workflows || []).find((w) => w.id === id || w.name.toLowerCase() === String(id).toLowerCase());
  if (!wf) return { text: `No workflow "${id}".`, error: true };
  const cwd = wf.cwd || ((store.get().devPaths || {}).repos || [])[0] || '';
  if (inTerminal) { const joiner = IS_WIN ? ' && ' : ' && '; X.open_terminal_at(cwd); return { text: `Running "${wf.name}" in a terminal.`, silent: true }; }
  const out = [`▶ ${wf.name}`];
  for (const c of wf.commands) { const r = await runShell(c, cwd); out.push(`$ ${c}\n${r.text}`); if (!r.ok) { out.push('(stopped — command failed)'); break; } }
  return { text: out.join('\n\n'), section: 'developer' };
};
// file/folder watch
function sig(p) { try { const st = fs.statSync(p); if (st.isDirectory()) { const items = fs.readdirSync(p); let latest = st.mtimeMs; for (const n of items.slice(0, 2000)) { try { const s2 = fs.statSync(path.join(p, n)); if (s2.mtimeMs > latest) latest = s2.mtimeMs; } catch (e) {} } return `d:${items.length}:${Math.round(latest)}`; } return `f:${st.size}:${Math.round(st.mtimeMs)}`; } catch (e) { return 'missing'; } }
X.watch_add = (p) => { if (!p || !fs.existsSync(p)) return { text: 'That path does not exist on this PC.', error: true }; const list = store.get().watches || []; if (list.some((w) => w.path === p)) return { text: 'Already watching that.', error: true }; const w = { id: store.uid('wt'), path: p, sig: sig(p), enabled: true }; store.set({ watches: list.concat([w]) }); return { text: `👁 Watching ${path.basename(p)} for changes.`, section: 'developer' }; };
X.watch_list = () => store.get().watches || [];
X.watch_remove = (id) => { store.set({ watches: (store.get().watches || []).filter((w) => w.id !== id) }); return { ok: true }; };
setInterval(() => {
  const list = store.get().watches || []; if (!list.length) return; let changed = false;
  for (const w of list) { if (!w.enabled) continue; const cur = sig(w.path); if (cur !== w.sig) { w.sig = cur; changed = true; const name = path.basename(w.path); notifyOut('File watch', `${name} ${cur === 'missing' ? 'was removed' : 'changed'}`); broadcast({ type: 'dev-watch', path: w.path, name, state: cur === 'missing' ? 'removed' : 'changed' }); } }
  if (changed) store.set({ watches: list });
}, 5000);
// http request runner
X.http_request = async ({ method = 'GET', url, headers, body }) => {
  if (!url) return { ok: false, error: 'Enter a URL.' };
  const t0 = Date.now(); const ctrl = new AbortController(); const to = setTimeout(() => ctrl.abort(), 20000);
  try {
    const h = {}; if (headers) for (const line of String(headers).split('\n')) { const i = line.indexOf(':'); if (i > 0) h[line.slice(0, i).trim()] = line.slice(i + 1).trim(); }
    const res = await fetch(url, { method, headers: h, body: (method === 'GET' || method === 'HEAD') ? undefined : (body || undefined), signal: ctrl.signal });
    const text = await res.text(); let pretty = text;
    try { pretty = JSON.stringify(JSON.parse(text), null, 2); } catch (e) {}
    const hdrs = [...res.headers.entries()].map(([k, v]) => `${k}: ${v}`).join('\n');
    return { ok: true, status: res.status, statusText: res.statusText, ms: Date.now() - t0, headers: hdrs, body: pretty.slice(0, 20000) };
  } catch (e) { return { ok: false, error: /abort/i.test(e.message) ? 'Request timed out.' : e.message }; }
  finally { clearTimeout(to); }
};
// ports + processes
X.ports_list = async () => {
  if (IS_WIN) {
    const r = await runShell('netstat -ano -p TCP | findstr LISTENING', '', 8000);
    const rows = r.text.split('\n').map((l) => l.trim().split(/\s+/)).filter((p) => p.length >= 4).map((p) => ({ addr: p[1], pid: p[p.length - 1] }));
    const seen = {}; const out = [];
    for (const row of rows) { const port = (row.addr.split(':').pop()); if (seen[port + row.pid]) continue; seen[port + row.pid] = 1; out.push({ port, pid: row.pid, addr: row.addr }); }
    // resolve names
    const names = {}; const tl = await runShell('tasklist /fo csv /nh', '', 8000);
    for (const line of tl.text.split('\n')) { const m = line.match(/^"([^"]+)","(\d+)"/); if (m) names[m[2]] = m[1]; }
    return out.slice(0, 60).map((p) => ({ ...p, name: names[p.pid] || '' }));
  }
  const r = await runShell("ss -ltnp 2>/dev/null || netstat -ltnp 2>/dev/null", '', 8000);
  return r.text.split('\n').slice(1).filter(Boolean).slice(0, 60).map((l) => ({ raw: l.trim() }));
};
X.kill_pid = async (pid) => { const r = await runShell(IS_WIN ? `taskkill /PID ${parseInt(pid, 10)} /F` : `kill -9 ${parseInt(pid, 10)}`); return { text: r.text, error: !r.ok }; };
X.kill_port = async (port) => {
  const p = parseInt(port, 10); if (!p) return { text: 'Which port?', error: true };
  if (IS_WIN) { const r = await runShell(`for /f "tokens=5" %a in ('netstat -ano ^| findstr :${p} ^| findstr LISTENING') do taskkill /PID %a /F`); return { text: r.text || `Freed port ${p}.`, error: !r.ok }; }
  const r = await runShell(`fuser -k ${p}/tcp 2>/dev/null || (lsof -ti:${p} | xargs -r kill -9)`); return { text: r.text || `Freed port ${p}.`, error: !r.ok };
};
X.dev_info = async () => {
  const gv = await runShell('git --version', '', 4000); const nv = await runShell(IS_WIN ? 'node --version' : 'node --version', '', 4000); const npmv = await runShell(IS_WIN ? 'npm --version' : 'npm --version', '', 4000);
  const ip = (() => { const ifs = require('os').networkInterfaces(); for (const k of Object.keys(ifs)) for (const a of ifs[k]) if (a.family === 'IPv4' && !a.internal) return a.address; return 'n/a'; })();
  const os = require('os');
  return { text: [
    `Electron ${process.versions.electron} · Chromium ${process.versions.chrome} · Node (built-in) ${process.versions.node}`,
    `Node on PATH: ${nv.ok ? nv.text : 'not found'}   npm: ${npmv.ok ? npmv.text : 'n/a'}`,
    `${gv.ok ? gv.text : 'git not found'}`,
    `OS: ${os.type()} ${os.release()} · ${os.arch()} · ${os.cpus().length} CPU · ${(os.totalmem() / 1e9).toFixed(1)} GB RAM`,
    `Host: ${os.hostname()} · LAN IP: ${ip}`,
    `User home: ${os.homedir()}`
  ].join('\n'), section: 'developer' };
};
// secrets / keys / qr via devkit (pure)
X.gen_secret = (kind, arg) => {
  const k = { hex: () => devkit.hexSecret(+arg || 32), base64: () => devkit.b64Secret(+arg || 32), token: () => devkit.urlToken(+arg || 24), apikey: () => devkit.apiKey(arg || 'sk'), passphrase: () => devkit.passphrase(+arg || 5), hmac: () => devkit.hmacKey(+arg || 32) }[kind];
  if (!k) return { text: 'Kinds: hex, base64, token, apikey, passphrase, hmac.', error: true };
  const val = k(); clipboard.writeText(val); return { text: val, copied: true };
};
X.gen_keypair = (type) => { try { const kp = devkit.keypair(type); return { text: `# ${kp.type} key pair\n\n## Public key\n${kp.publicKey}\n## Private key (keep secret)\n${kp.privateKey}` }; } catch (e) { return { text: 'Key generation failed: ' + e.message, error: true }; } };
X.qr_svg = (text) => { try { return { ok: true, svg: qr.svg(String(text), { scale: 8 }) }; } catch (e) { return { ok: false, error: e.message }; } };
X.devkit = (op, a, b) => {
  const f = { json_ts: () => devkit.jsonToTS(a, b || 'Root'), json_abap: () => devkit.jsonToABAP(a, b || 'ty_root'), contrast: () => devkit.contrast(...String(a).split(/\s+/)), shades: () => devkit.shades(a), env_json: () => devkit.envToJson(a), json_env: () => devkit.jsonToEnv(a), query_json: () => devkit.queryToJson(a), json_query: () => devkit.jsonToQuery(a), html_enc: () => ({ ok: true, text: devkit.htmlEncode(a) }), html_dec: () => ({ ok: true, text: devkit.htmlDecode(a) }), mock: () => devkit.mock(a, +b || 5), mock_users: () => devkit.mockUsers(+a || 3), slug: () => ({ ok: true, text: devkit.slugify(a) }), stats: () => devkit.textStats(a), sort: () => devkit.sortLines(a), sort_u: () => devkit.sortLines(a, { unique: true }), sort_n: () => devkit.sortLines(a, { numeric: true }), dedupe: () => devkit.dedupeLines(a), reverse: () => devkit.reverseLines(a), trim: () => devkit.trimLines(a), md: () => devkit.mdToHtml(a) }[op];
  if (!f) return { ok: false, error: 'unknown devkit op' };
  const r = f(); if (r && r.ok && r.text) clipboard.writeText(r.text); return r;
};
// vault
X.scratch_get = () => store.get().scratchpad || '';
X.scratch_set = (t) => { store.set({ scratchpad: String(t || '').slice(0, 200000) }); return { ok: true }; };
X.text_diff = (a, b) => { const r = devtools.diffLines(a, b); return { ok: true, text: r.text, added: r.added, removed: r.removed }; };
X.vault_status = () => vault.status();
X.vault_create = (pass) => { const r = vault.create(pass); if (r.ok) broadcast({ type: 'data', keys: ['vault'] }); return { ...r, status: vault.status() }; };
X.vault_unlock = (pass) => { const r = vault.unlock(pass); return { ...r, status: vault.status() }; };
X.vault_lock = () => { vault.lock(); return vault.status(); };
X.vault_list = () => vault.list();
X.vault_add = (name, value, note) => { const r = vault.add(name, value, note); if (r.ok) broadcast({ type: 'data', keys: ['vault'] }); return r; };
X.vault_reveal = (id) => { const r = vault.reveal(id); if (r.ok) { clipboard.writeText(r.value); const prev = r.value; setTimeout(() => { if (clipboard.readText() === prev) clipboard.writeText(''); }, 25000); } return { ok: r.ok, name: r.name, error: r.error, copied: r.ok }; };
X.vault_remove = (id) => { const r = vault.remove(id); if (r.ok) broadcast({ type: 'data', keys: ['vault'] }); return r; };
X.reset = (scope) => { const r = store.reset(scope === 'all' ? 'all' : 'data'); brain.clearConversation && brain.clearConversation(); broadcast({ type: 'cleared' }); broadcast({ type: 'settings' }); return { ok: true, scope: r.scope }; };
X.plan_day = (commit, day) =>
X.plan_day = (commit, day) => brain.uiAction('plan_day', { commit: !!commit, day: day || 'today' });
ipcMain.handle('nova:x', async (_e, ch, ...args) => { if (!X[ch]) throw new Error('unknown ' + ch); return X[ch](...args); });

// ------------------------------------------------------------ IPC
function stateSnapshot() {
  const s = store.publicView();
  const { messages, tasks, notes, routines, reminders, events, habits, clipboard: clip, shortcuts, people, expenses, journal, countdowns, snippets, reading, checklists, ...settings } = s;
  return {
    settings, messages, tasks, notes, routines, events, habits, clipboard: clip, shortcuts, people, expenses, journal, countdowns, snippets, reading, checklists,
    stopwatch: { running: brain.stopwatch.running, elapsed: brain.stopwatch.elapsed(), at: Date.now() },
    rewards: rewards.status(), docs: docs.stats(),
    focusState: focus.state(), focusStats: focus.stats(),
    reminders: scheduler.upcoming(200),
    recent: reminders.filter((r) => r.done).slice(-20),
    status: { recording, portable: PORTABLE, sec: store.secStatus(), hotkeys: activeHotkeys, wake: wake.status, companion: s.companion.enabled, hasStt: !!(store.get().keys.groq || store.get().keys.gemini || store.get().keys.openai) }
  };
}
ipcMain.handle('nova:state', () => stateSnapshot());
ipcMain.handle('nova:apps', () => commands.appNames());
ipcMain.on('nova:input', (_e, text, opts) => brain.handleInput(text, opts || {}));
ipcMain.on('nova:confirm', (_e, yes, source) => brain.handleInput(yes ? 'yes' : 'no', { source }));
ipcMain.handle('nova:action', (_e, name, args) => brain.uiAction(name, args || {}));
ipcMain.handle('nova:dictate', (_e, text) => brain.dictate(text));
ipcMain.on('nova:clear-history', () => brain.clearConversation());
ipcMain.on('nova:open-app', (_e, section) => showApp(section));
ipcMain.on('nova:open-path', (_e, p) => (/^https?:|^mailto:|^tel:/i.test(p) ? shell.openExternal(p) : shell.openPath(p)));
ipcMain.on('nova:companion', (_e, on) => setCompanion(on));

ipcMain.handle('nova:transcribe', async (_e, b64) => transcribeWav(b64));

ipcMain.handle('nova:save-settings', (_e, patch) => {
  const cur = store.get();
  if (patch.keys) {
    const keys = { ...cur.keys };
    for (const [k, v] of Object.entries(patch.keys)) {
      if (v === '__clear__') keys[k] = '';
      else if (v && !String(v).startsWith('••••')) keys[k] = String(v).trim();
    }
    patch.keys = keys;
  }
  const compBefore = cur.companion.enabled;
  store.set(patch);
  store.flush();
  registerHotkeys();
  if (!PORTABLE) app.setLoginItemSettings({ openAtLogin: !!store.get().startAtLogin, args: ['--hidden'] });
  startWake();
  if (patch.outlook) startOutlookSync();
  if (patch.companion && patch.companion.enabled !== compBefore) setCompanion(patch.companion.enabled);
  else if (compVisible()) placeCompanion();
  broadcast({ type: 'settings' });
  return stateSnapshot();
});
const ALL_PROVIDERS = ['groq', 'grok', 'openrouter', 'ollama', 'gemini', 'anthropic', 'openai', 'custom'];
ipcMain.handle('nova:list-models', async () => {
  const cfg = store.get();
  const out = {};
  for (const p of ALL_PROVIDERS) {
    try { const ids = await ai.listModels(cfg, p); out[p] = { ids, best: ai.pickBest(p, ids) }; }
    catch (e) { out[p] = { ids: [], error: brain.friendlyError(e) }; }
  }
  return out;
});
ipcMain.handle('nova:test-providers', async () => {
  const cfg = store.get();
  const out = [];
  for (const p of ALL_PROVIDERS) {
    if (p === 'custom' && !(cfg.endpoints && cfg.endpoints.custom)) continue;
    if (p !== 'ollama' && p !== 'custom' && !cfg.keys[p]) { out.push({ provider: p, ok: false, msg: 'no key' }); continue; }
    const t0 = Date.now(), before = cfg.models[p];
    try {
      await ai.chat({ ...cfg, ollamaEnabled: true, providerOrder: [p] }, [], 'Reply with just: OK', { onModelChange: brain.onModelChange });
      const now = store.get().models[p];
      out.push({ provider: p, ok: true, msg: `${now} · ${Date.now() - t0} ms${now !== before ? ` (auto-switched from "${before}")` : ''}` });
    } catch (e) { out.push({ provider: p, ok: false, msg: `${brain.friendlyError(e)}  [${String(e.message).replace(/\s+/g, ' ').slice(0, 140)}]` }); }
  }
  return out;
});

// ---- Ollama (free local AI): status, model download with progress
ipcMain.handle('nova:ollama', async (_e, op, arg) => {
  const base = String((store.get().endpoints || {}).ollama || 'http://localhost:11434').replace(/\/+$/, '');
  if (op === 'download-page') { shell.openExternal('https://ollama.com/download'); return {}; }
  if (op === 'status') {
    try {
      const r = await fetch(base + '/api/tags', { signal: AbortSignal.timeout(2500) });
      const j = await r.json();
      return { running: true, models: (j.models || []).map((m) => ({ name: m.name, size: m.size })) };
    } catch (e) { return { running: false, models: [] }; }
  }
  if (op === 'pull') {
    try {
      const res = await fetch(base + '/api/pull', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name: arg, stream: true }) });
      if (!res.ok) throw new Error('HTTP ' + res.status + ' ' + (await res.text()).slice(0, 200));
      const reader = res.body.getReader(); const dec = new TextDecoder(); let buf = '', lastSent = 0;
      for (;;) {
        const { value, done } = await reader.read(); if (done) break;
        buf += dec.decode(value, { stream: true });
        let i;
        while ((i = buf.indexOf('\n')) >= 0) {
          const line = buf.slice(0, i).trim(); buf = buf.slice(i + 1);
          if (!line) continue;
          const j = JSON.parse(line);
          if (j.error) throw new Error(j.error);
          const pct = j.total ? Math.round((j.completed || 0) / j.total * 100) : null;
          if (Date.now() - lastSent > 250 || j.status === 'success') { lastSent = Date.now(); broadcast({ type: 'ollama-pull', model: arg, status: j.status, pct }); }
        }
      }
      store.set({ ollamaEnabled: true, models: { ollama: arg } });
      broadcast({ type: 'settings' });
      return { ok: true };
    } catch (e) {
      const msg = /fetch failed|ECONNREFUSED/i.test(e.message) ? 'Ollama is not running. Install/start it first.' : /space|disk/i.test(e.message) ? 'Not enough disk space for this model.' : e.message;
      broadcast({ type: 'ollama-pull', model: arg, status: 'error', error: msg });
      return { ok: false, error: msg };
    }
  }
  return {};
});

// ---- App lock: a PIN gate on the main app window (asked on every open). Separate from the
// portable AI-key vault PIN. Hashed with scrypt; only the salt+hash are stored.
ipcMain.handle('applock:status', () => ({ set: !!store.get().appLock }));
ipcMain.handle('applock:set', (_e, pin, oldPin) => {
  const cur = store.get().appLock;
  if (cur) { // changing/removing requires the current PIN
    const ok = crypto.scryptSync(String(oldPin || ''), Buffer.from(cur.salt, 'hex'), 32).toString('hex') === cur.hash;
    if (!ok) return { ok: false, error: 'wrong-pin' };
  }
  if (!pin) { store.set({ appLock: null }); return { ok: true, cleared: true }; }
  if (String(pin).length < 4) return { ok: false, error: 'too-short' };
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(String(pin), Buffer.from(salt, 'hex'), 32).toString('hex');
  store.set({ appLock: { salt, hash } });
  return { ok: true };
});
ipcMain.handle('applock:check', (_e, pin) => {
  const a = store.get().appLock;
  if (!a) return { ok: true };
  const hash = crypto.scryptSync(String(pin || ''), Buffer.from(a.salt, 'hex'), 32).toString('hex');
  return { ok: hash === a.hash };
});

// ---- Text-to-speech: ElevenLabs (natural voice) with the system voice as fallback.
// The key lives only in the main process; the renderer gets back audio bytes to play.
async function elevenSynth(text) {
  const cfg = store.get();
  const key = (cfg.keys && cfg.keys.elevenlabs) || '';
  const vt = cfg.voiceTts || {};
  if (vt.provider !== 'elevenlabs' || !key || !vt.elevenVoice) return { ok: false, fallback: true };
  const voice = encodeURIComponent(vt.elevenVoice);
  const model = vt.elevenModel || 'eleven_turbo_v2_5';
  const url = `https://api.elevenlabs.io/v1/text-to-speech/${voice}?output_format=mp3_44100_128`;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 20000);
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'xi-api-key': key, 'Content-Type': 'application/json', 'Accept': 'audio/mpeg' },
      body: JSON.stringify({ text: String(text).slice(0, 2500), model_id: model, voice_settings: { stability: 0.4, similarity_boost: 0.75, style: 0.2, use_speaker_boost: true } }),
      signal: ctrl.signal
    });
    if (!res.ok) { const t = await res.text().catch(() => ''); return { ok: false, error: `ElevenLabs ${res.status}: ${t.slice(0, 160)}`, fallback: res.status === 401 || res.status === 429 }; }
    const buf = Buffer.from(await res.arrayBuffer());
    return { ok: true, audio: buf.toString('base64'), mime: 'audio/mpeg' };
  } catch (e) {
    return { ok: false, error: String(e && e.message || e), fallback: true };
  } finally { clearTimeout(timer); }
}
// ---- Account (same login + PIN as the phone) + cross-device sync ----
const ACCT_SYNC_KEYS = ['tasks', 'reminders', 'notes', 'habits', 'reading', 'checklists', 'countdowns', 'expenses', 'journal'];
let lastRemoteDoc = null, applyingRemote = false, pushTimer = null, syncPollT = null;
function collectForSync() {
  const s = store.get();
  const out = {};
  for (const k of ACCT_SYNC_KEYS) out[k] = s[k] || [];
  // reminders: carry the phone's `alarm` flag, drop transient timers
  out.reminders = (s.reminders || []).filter((r) => r.kind !== 'timer').map((r) => ({ ...r, alarm: r.kind === 'alarm' }));
  return out;
}
function applyRemoteDoc(d) {
  const patch = {};
  for (const k of ACCT_SYNC_KEYS) if (Array.isArray(d[k])) patch[k] = d[k];
  // reminders from the phone may lack `kind` — the scheduler needs it
  if (Array.isArray(d.reminders)) patch.reminders = d.reminders.map((r) => ({ ...r, kind: r.kind || (r.alarm ? 'alarm' : 'reminder') }));
  applyingRemote = true;
  try { store.set(patch); store.set({ account: { ...(store.get().account || {}), syncAt: d._at || Date.now() } }); }
  finally { setTimeout(() => { applyingRemote = false; }, 50); }
}
async function acctPush() {
  if (!account.configured() || !account.isAuthed()) return;
  try {
    const at = Date.now();
    const doc = { ...(lastRemoteDoc || {}), ...collectForSync(), _at: at, _device: 'desktop' };
    lastRemoteDoc = doc;
    store.set({ account: { ...(store.get().account || {}), syncAt: at } });
    await account.push(doc);
  } catch (e) { /* offline / DB not set up — stays local */ }
}
async function acctPull() {
  if (!account.configured() || !account.isAuthed()) return;
  try {
    const d = await account.pull();
    if (!d || typeof d !== 'object') { acctPush(); return; } // nothing there yet → seed it
    lastRemoteDoc = d;
    const seen = (store.get().account || {}).syncAt || 0;
    if ((d._at || 0) > seen) applyRemoteDoc(d);
  } catch (e) {}
}
function startAccountSync() {
  clearInterval(syncPollT);
  syncPollT = setInterval(acctPull, 20000);
  setTimeout(acctPull, 1500);
}
// push shortly after any synced change (unless we're the one applying a remote doc)
store.events.on('change', (keys) => {
  if (applyingRemote) return;
  if (!keys.some((k) => ACCT_SYNC_KEYS.includes(k))) return;
  if (!account.configured() || !account.isAuthed()) return;
  clearTimeout(pushTimer); pushTimer = setTimeout(acctPush, 2500);
});

ipcMain.handle('account:status', () => account.status());
ipcMain.handle('account:set-config', (_e, url, anonKey) => { account.setConfig(url, anonKey); return account.status(); });
ipcMain.handle('account:signup', async (_e, email, pass) => { try { return await account.signUp(email, pass); } catch (e) { return { ok: false, error: String(e && e.message || e) }; } });
ipcMain.handle('account:signin', async (_e, email, pass) => { try { await account.signIn(email, pass); return { ok: true }; } catch (e) { return { ok: false, error: String(e && e.message || e) }; } });
ipcMain.handle('account:signout', async () => { await account.signOut(); lastRemoteDoc = null; return { ok: true }; });
ipcMain.handle('account:set-pin', async (_e, pin) => account.setPin(pin));
ipcMain.handle('account:check-pin', (_e, pin) => ({ ok: account.verifyPin(pin) }));
ipcMain.handle('account:load-pin', async () => { try { return { ok: await account.loadPin() }; } catch (e) { return { ok: false, error: String(e && e.message || e) }; } });
ipcMain.handle('account:sync-now', async () => { await acctPull(); await acctPush(); return { ok: true }; });

ipcMain.handle('tts:speak', (_e, text) => elevenSynth(text));
ipcMain.handle('tts:voices', async () => {
  const key = (store.get().keys && store.get().keys.elevenlabs) || '';
  if (!key) return { ok: false, error: 'no-key' };
  try {
    const res = await fetch('https://api.elevenlabs.io/v1/voices', { headers: { 'xi-api-key': key } });
    if (!res.ok) return { ok: false, error: `ElevenLabs ${res.status}` };
    const j = await res.json();
    return { ok: true, voices: (j.voices || []).map((v) => ({ id: v.voice_id, name: v.name, labels: v.labels || {}, preview: v.preview_url || '' })) };
  } catch (e) { return { ok: false, error: String(e && e.message || e) }; }
});

// companion window plumbing
// Renderer tells us which rectangles (avatar + visible bubbles) should catch the mouse.
ipcMain.on('comp:rects', (_e, rects) => { if (compWin) compWin.__rects = Array.isArray(rects) ? rects : []; });
// Legacy no-op (older renderer sent per-move hit flags; the cursor poll owns this now).
ipcMain.on('comp:hit', () => {});
// An input is open (quick-ask / panel): keep the window interactive and focused regardless of where the cursor is.
ipcMain.on('comp:focus', () => { if (compWin) { compWin.__forceInteractive = true; compWin.__ignore = false; compWin.setIgnoreMouseEvents(false); compInteractive = true; compWin.focus(); } });
ipcMain.on('comp:blur', () => { if (compWin) { compWin.__forceInteractive = false; compWin.blur(); } });
ipcMain.on('comp:drag-start', () => {
  dragging = true;
  if (walking) { walking.cancelled = true; }
  const c = screen.getCursorScreenPoint(), b = compWin.getBounds();
  dragOffset = { x: c.x - b.x, y: c.y - b.y }; dragStart = c;
  clearInterval(dragTimer);
  dragTimer = setInterval(() => { const p = screen.getCursorScreenPoint(); compWin.setPosition(p.x - dragOffset.x, p.y - dragOffset.y); }, 8);
});
ipcMain.handle('comp:drag-end', () => {
  clearInterval(dragTimer); dragTimer = null; dragging = false;
  const c = screen.getCursorScreenPoint();
  const moved = dragStart ? Math.hypot(c.x - dragStart.x, c.y - dragStart.y) > 4 : false;
  if (moved) {
    const b = compWin.getBounds(), A = avatarArea();
    const pos = { x: compLayout.h === 'right' ? b.x + COMP_W - A : b.x, y: compLayout.v === 'bottom' ? b.y + COMP_H - A : b.y };
    store.set({ companion: { pos: clampAvatar(pos) } });
    placeCompanion();
  }
  return moved;
});

// ------------------------------------------------------------ lifecycle
app.on('second-instance', () => showApp());

app.whenReady().then(() => {
  store.load();
  brain.init({
    broadcast, windows: wins, speaker, icon: ICON,
    appVisible: () => !!(appWin && !appWin.isDestroyed() && appWin.isVisible() && !appWin.isMinimized() && appWin.isFocused()),
    pointAt: (x, y) => pointAt(x, y).catch((e) => console.warn('pointAt', e.message)),
    focusedNova: () => wins().some((w) => w.isFocused()),
    showAlert: (r) => attention(r).catch((e) => console.warn('attention', e.message)),
    onForeground: (t) => { usage.sample(t); if (t) automations.onForeground(t.proc, t.title); },
    onAlert: (r) => { const n = store.get().ntfy || {}; if (n.enabled && (n.kinds || []).includes(r.kind)) ntfy.push({ alarm: 'Alarm', event: 'Coming up', birthday: 'Birthday', timer: 'Timer' }[r.kind] || 'Reminder', r.text, { tags: [r.kind === 'alarm' ? 'alarm_clock' : 'bell'], priority: r.kind === 'alarm' ? 5 : 4, click: r.joinUrl || undefined }); }
  });
  scheduler.init(store);
  account.init(store);
  startAccountSync();
  focus.init(store);
  brain.ctx.rewards = rewards;
  rewards.init(store);
  rewards.on('levelup', ({ level, unlocked }) => {
    const txt = `🎉 Level ${level}!${unlocked.length ? ' Unlocked: ' + unlocked.map((u) => u.name).join(', ') + ' (I put it on!)' : ''}`;
    broadcast({ type: 'outfit', outfit: store.get().outfit });
    broadcast({ type: 'levelup', level, unlocked, text: txt });
    if (compVisible()) { sendComp({ type: 'life', act: 'dance' }); sendComp({ type: 'thought', text: txt, ttl: 9000 }); }
  });
  focus.on('done', (d) => { if (d.phase === 'work') rewards.award(20, 'focus'); });
  usage.init(store, {
    idleSec: () => { try { return powerMonitor.getSystemIdleTime(); } catch (e) { return 0; } },
    minimize: (hwnd) => ps.run(`[NovaInput]::Minimize(${hwnd})`).catch(() => {}),
    isFocusing: () => focus.isFocusing(),
    notify: (t) => notifyOut('Focus', t)
  });
  vault.init(store);
  docs.init(app.getPath('userData'));
  if ((store.get().docFolders || []).length && Date.now() - (docs.stats().lastRun || 0) > 12 * 3600000) setTimeout(() => docs.rebuild(store.get().docFolders).then((st) => broadcast({ type: 'docs', stats: st })), 20000);
  docs.on('progress', (p) => broadcast({ type: 'docs-progress', progress: p }));
  widgets.init(store, ICON);
  ntfy.init(store, (text) => brain.run(text, { quiet: true }));
  automations.init({ store, ps, run: (text) => brain.run(text, { quiet: true }), getDownloads: () => app.getPath('downloads') });
  automations.on('fired', (rule, entry) => { if (rule.notify !== false && entry.out) notifyOut('Automation: ' + rule.name, `⚙️ ${rule.name}: ${entry.out.split('\n')[0]}`); });
  // loopback system audio for the meeting recorder
  try { eSession.defaultSession.setDisplayMediaRequestHandler((req, cb) => { eCapturer.getSources({ types: ['screen'] }).then((src) => cb({ video: src[0], audio: 'loopback' })).catch(() => cb({})); }); } catch (e) {}
  scheduler.isFocusing = () => focus.isFocusing();
  focus.on('state', (st) => broadcast({ type: 'focus', state: st, stats: focus.stats() }));
  scheduler.on('away-end', () => broadcast({ type: 'away-end' }));
  focus.on('done', (d) => scheduler.emit('fire', {
    id: 'focus_' + Date.now(), kind: 'focus', at: Date.now(),
    text: d.phase === 'work' ? `Focus session done${d.label ? ' (' + d.label + ')' : ''}! ${store.get().focus.autoBreak ? 'Break started, so stretch and look away from the screen.' : 'Time for a break.'}` : 'Break over. Ready for the next focus session?'
  }));
  store.events.on('change', (keys) => {
    const interesting = keys.filter((k) => ['meetings', 'automations', 'automationLog', 'xp', 'outfit', 'usage', 'docFolders', 'widgets', 'sap', 'outlook', 'ntfy', 'blocker', 'planner', 'tasks', 'reminders', 'notes', 'routines', 'events', 'habits', 'clipboard', 'shortcuts', 'focus', 'wellbeing', 'people', 'expenses', 'journal', 'countdowns', 'clocks', 'dnd', 'currency', 'budget', 'devMode', 'theme', 'snippets', 'devPaths', 'away', 'messages', 'reading', 'checklists', 'workflows', 'watches', 'vault', 'xp'].includes(k));
    if (keys.includes('dnd')) buildTrayMenu();
    if (interesting.length) broadcast({ type: 'data', keys: interesting });
  });
  const cfg = store.get();
  createAppWindow(!STARTED_HIDDEN && (cfg.openAppOnStart || !cfg.companion.enabled));
  if (cfg.companion.enabled) createCompanion();
  widgets.openAll();
  startOutlookSync();
  createTray();
  registerHotkeys();
  if (!PORTABLE) app.setLoginItemSettings({ openAtLogin: !!cfg.startAtLogin, args: ['--hidden'] });
  ps.start().then((ok) => {
    if (!ok) return;
    commands.indexApps(ps).then((n) => console.log(`[nova] indexed ${n} apps`));
    setInterval(brain.pollForeground, 700);
  });
  wake.on('wake', (line) => { console.log('[nova]', line); broadcast({ type: 'wake', target: speaker() }); });
  wake.on('status', (st) => { console.log('[nova] wake word:', st); broadcast({ type: 'wake-status', status: st }); });
  startWake();
  screen.on('display-metrics-changed', placeCompanion);
  screen.on('display-removed', placeCompanion);
});

app.on('window-all-closed', (e) => e.preventDefault());
app.on('before-quit', () => { app.isQuitting = true; store.flush(); });
app.on('will-quit', () => { globalShortcut.unregisterAll(); ps.stop(); wake.stop(); });
