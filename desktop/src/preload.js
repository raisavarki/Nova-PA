const { contextBridge, ipcRenderer, webUtils } = require('electron');

const roleArg = process.argv.find((a) => a.startsWith('--nova-role='));
const role = roleArg ? roleArg.split('=')[1] : 'app';

contextBridge.exposeInMainWorld('nova', {
  role,
  state: () => ipcRenderer.invoke('nova:state'),
  input: (text, opts) => ipcRenderer.send('nova:input', text, { source: role, ...(opts || {}) }),
  confirm: (yes) => ipcRenderer.send('nova:confirm', yes, role),
  action: (name, args) => ipcRenderer.invoke('nova:action', name, args),
  transcribe: (b64) => ipcRenderer.invoke('nova:transcribe', b64),
  dictate: (text) => ipcRenderer.invoke('nova:dictate', text),
  clearHistory: () => ipcRenderer.send('nova:clear-history'),
  openApp: (section) => ipcRenderer.send('nova:open-app', section),
  openPath: (p) => ipcRenderer.send('nova:open-path', p),
  setCompanion: (on) => ipcRenderer.send('nova:companion', on),
  saveSettings: (patch) => ipcRenderer.invoke('nova:save-settings', patch),
  testProviders: () => ipcRenderer.invoke('nova:test-providers'),
  listModels: () => ipcRenderer.invoke('nova:list-models'),
  ollama: (op, arg) => ipcRenderer.invoke('nova:ollama', op, arg),
  apps: () => ipcRenderer.invoke('nova:apps'),
  ack: () => ipcRenderer.send('nova:ack'),
  exportData: () => ipcRenderer.invoke('nova:export'),
  importData: () => ipcRenderer.invoke('nova:import'),
  syncExport: () => ipcRenderer.invoke('nova:sync-export'),
  syncImport: (data) => ipcRenderer.invoke('nova:sync-import', data),
  wander: () => ipcRenderer.send('comp:wander'),
  ocrRect: (r) => ipcRenderer.send('ocr:rect', r),
  pathForFile: (f) => { try { return webUtils.getPathForFile(f); } catch (e) { return ''; } },
  invoke: (ch, ...a) => ipcRenderer.invoke('nova:x', ch, ...a),
  // companion window only
  hit: (on) => ipcRenderer.send('comp:hit', on),
  focusMe: () => ipcRenderer.send('comp:focus'),
  blurMe: () => ipcRenderer.send('comp:blur'),
  dragStart: () => ipcRenderer.send('comp:drag-start'),
  dragEnd: () => ipcRenderer.invoke('comp:drag-end'),
  on: (fn) => ipcRenderer.on('nova:event', (_e, ev) => fn(ev))
});
