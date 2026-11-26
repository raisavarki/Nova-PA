// SAP GUI launcher using SAP's own shortcut tool (sapshcut.exe). Opens a transaction on a chosen system.
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

const CANDIDATES = [
  'C:\\Program Files (x86)\\SAP\\FrontEnd\\SAPgui\\sapshcut.exe',
  'C:\\Program Files\\SAP\\FrontEnd\\SAPgui\\sapshcut.exe',
  'C:\\Program Files (x86)\\SAP\\FrontEnd\\SapGui\\sapshcut.exe',
  'C:\\Program Files\\SAP\\FrontEnd\\SAPGUI\\sapshcut.exe'
];
function findShcut(custom) {
  if (custom && fs.existsSync(custom)) return custom;
  return CANDIDATES.find((p) => { try { return fs.existsSync(p); } catch (e) { return false; } }) || null;
}

/**
 * system: { name, sysname (SAP Logon entry description) | sid, client, user, lang }
 * tcode: e.g. "VA01" or "/BRI/EXIM_MWR"
 */
function open(cfgSap, systemName, tcode) {
  const systems = (cfgSap && cfgSap.systems) || [];
  if (!systems.length) return { ok: false, error: 'Add your SAP system first (SAP page → Systems): name, SAP Logon entry and client.' };
  const sys = systemName ? systems.find((s) => s.name.toLowerCase() === String(systemName).toLowerCase()) : systems.find((s) => s.isDefault) || systems[0];
  if (!sys) return { ok: false, error: `No SAP system called "${systemName}". Known: ${systems.map((s) => s.name).join(', ')}.` };
  const exe = findShcut(cfgSap.shcutPath);
  if (!exe) return { ok: false, error: 'SAP GUI shortcut tool (sapshcut.exe) not found. Is SAP GUI installed? You can set its path on the SAP page.' };
  const code = String(tcode || '').trim().toUpperCase();
  const args = [];
  if (sys.sysname) args.push(`-sysname=${sys.sysname}`); else if (sys.sid) args.push(`-system=${sys.sid}`);
  if (sys.client) args.push(`-client=${sys.client}`);
  if (sys.user) args.push(`-user=${sys.user}`);
  args.push(`-language=${sys.lang || 'EN'}`);
  if (code) args.push(`-command=${/^\//.test(code) ? '/n' + code : code}`);
  args.push('-maxgui');
  try {
    const p = spawn(exe, args, { detached: true, stdio: 'ignore', windowsHide: false });
    p.on('error', () => {}); p.unref();
    return { ok: true, system: sys.name, tcode: code };
  } catch (e) { return { ok: false, error: e.message }; }
}

module.exports = { open, findShcut };
