// Nova Developer toolbox — pure, offline helpers. No Electron, no network.
// Every function returns a plain object/string so commands.js and the UI can share it.
const crypto = require('crypto');

// ---------- JSON
function jsonFormat(text, indent = 2) {
  try { return { ok: true, text: JSON.stringify(JSON.parse(text), null, indent) }; }
  catch (e) { return { ok: false, error: friendlyJson(text, e) }; }
}
function jsonMinify(text) {
  try { return { ok: true, text: JSON.stringify(JSON.parse(text)) }; }
  catch (e) { return { ok: false, error: friendlyJson(text, e) }; }
}
function friendlyJson(text, e) {
  const m = /position (\d+)/.exec(e.message);
  if (m) { const pos = +m[1]; const line = text.slice(0, pos).split('\n').length; return `Invalid JSON near line ${line}: ${e.message}`; }
  return 'Invalid JSON: ' + e.message;
}

// ---------- encoders
function b64encode(s) { return Buffer.from(String(s), 'utf8').toString('base64'); }
function b64decode(s) {
  try { const out = Buffer.from(String(s).trim(), 'base64').toString('utf8'); return { ok: true, text: out }; }
  catch (e) { return { ok: false, error: 'Not valid base64' }; }
}
function urlEncode(s) { return encodeURIComponent(String(s)); }
function urlDecode(s) { try { return { ok: true, text: decodeURIComponent(String(s).replace(/\+/g, ' ')) }; } catch (e) { return { ok: false, error: 'Not valid URL-encoded text' }; } }

// ---------- JWT (decode only — never verifies a signature)
function jwtDecode(token) {
  const parts = String(token).trim().replace(/^Bearer\s+/i, '').split('.');
  if (parts.length < 2) return { ok: false, error: 'Not a JWT (expected header.payload.signature)' };
  const seg = (s) => { try { return JSON.parse(Buffer.from(s.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8')); } catch (e) { return null; } };
  const header = seg(parts[0]), payload = seg(parts[1]);
  if (!payload) return { ok: false, error: 'Could not decode the JWT payload' };
  const out = { ok: true, header, payload, signature: parts[2] || '' };
  if (payload.exp) out.expires = new Date(payload.exp * 1000).toISOString() + (payload.exp * 1000 < Date.now() ? ' (EXPIRED)' : '');
  if (payload.iat) out.issued = new Date(payload.iat * 1000).toISOString();
  return out;
}

// ---------- hashes
function hash(algo, text) {
  const a = String(algo).toLowerCase().replace(/[^a-z0-9]/g, '');
  const map = { md5: 'md5', sha1: 'sha1', sha256: 'sha256', sha512: 'sha512' };
  if (!map[a]) return { ok: false, error: 'Unknown hash (use md5, sha1, sha256, sha512)' };
  return { ok: true, text: crypto.createHash(map[a]).update(String(text), 'utf8').digest('hex') };
}
function hashAll(text) {
  return ['md5', 'sha1', 'sha256'].map((a) => `${a}: ${hash(a, text).text}`).join('\n');
}

// ---------- ids
function uuid() { return crypto.randomUUID(); }
function uuids(n = 5) { return Array.from({ length: Math.min(50, Math.max(1, n)) }, () => crypto.randomUUID()).join('\n'); }
function randomString(len = 24, { symbols = true } = {}) {
  const base = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';
  const sym = '!@#$%^&*-_=+?';
  const pool = base + (symbols ? sym : '');
  const bytes = crypto.randomBytes(len);
  let out = '';
  for (let i = 0; i < len; i++) out += pool[bytes[i] % pool.length];
  return out;
}

// ---------- time
function epochToDate(n) {
  let ms = Number(n);
  if (!isFinite(ms)) return { ok: false, error: 'Not a number' };
  if (String(Math.trunc(ms)).length <= 11) ms *= 1000;      // seconds -> ms
  const d = new Date(ms);
  if (isNaN(d)) return { ok: false, error: 'Out of range' };
  return { ok: true, text: `${d.toISOString()}\nLocal: ${d.toString()}` };
}
function dateToEpoch(str) {
  const d = str ? new Date(str) : new Date();
  if (isNaN(d)) return { ok: false, error: 'Could not parse that date' };
  return { ok: true, text: `seconds: ${Math.floor(d.getTime() / 1000)}\nmillis:  ${d.getTime()}` };
}

// ---------- case convert
function words(s) {
  return String(s).replace(/([a-z0-9])([A-Z])/g, '$1 $2').replace(/[_\-./]+/g, ' ').replace(/\s+/g, ' ').trim().split(' ').filter(Boolean);
}
function caseConvert(s, mode) {
  const w = words(s); if (!w.length) return '';
  const cap = (x) => x.charAt(0).toUpperCase() + x.slice(1).toLowerCase();
  switch (mode) {
    case 'camel': return w.map((x, i) => (i ? cap(x) : x.toLowerCase())).join('');
    case 'pascal': return w.map(cap).join('');
    case 'snake': return w.map((x) => x.toLowerCase()).join('_');
    case 'constant': return w.map((x) => x.toUpperCase()).join('_');
    case 'kebab': return w.map((x) => x.toLowerCase()).join('-');
    case 'dot': return w.map((x) => x.toLowerCase()).join('.');
    case 'title': return w.map(cap).join(' ');
    case 'sentence': return cap(w.join(' '));
    case 'upper': return String(s).toUpperCase();
    case 'lower': return String(s).toLowerCase();
    default: return w.join(' ');
  }
}
function caseAll(s) {
  return ['camel', 'pascal', 'snake', 'constant', 'kebab'].map((m) => `${m.padEnd(9)} ${caseConvert(s, m)}`).join('\n');
}

// ---------- regex tester
function regexTest(pattern, flags, text) {
  let re;
  try { re = new RegExp(pattern, (flags || '').includes('g') ? flags : (flags || '') + 'g'); }
  catch (e) { return { ok: false, error: 'Bad regex: ' + e.message }; }
  const matches = [];
  let m, guard = 0;
  while ((m = re.exec(String(text))) && guard++ < 1000) {
    matches.push({ match: m[0], index: m.index, groups: m.slice(1) });
    if (m.index === re.lastIndex) re.lastIndex++;
  }
  return { ok: true, count: matches.length, matches };
}

// ---------- base / radix
function baseConvert(value, from, to) {
  const n = parseInt(String(value).trim().replace(/^0x/i, '').replace(/^0b/i, ''), from);
  if (isNaN(n)) return { ok: false, error: 'Not a valid base-' + from + ' number' };
  return { ok: true, text: n.toString(to).toUpperCase(), dec: n };
}
function numberBases(value, from = 10) {
  const n = parseInt(String(value).trim().replace(/^0x/i, m => '').replace(/^0b/, ''), from);
  if (isNaN(n)) return { ok: false, error: 'Not a valid number' };
  return { ok: true, text: `dec: ${n}\nhex: 0x${n.toString(16).toUpperCase()}\nbin: 0b${n.toString(2)}\noct: 0o${n.toString(8)}` };
}

// ---------- colour
function hexToRgb(hex) {
  const h = String(hex).trim().replace('#', '');
  const v = h.length === 3 ? h.split('').map((c) => c + c).join('') : h;
  if (!/^[0-9a-f]{6}$/i.test(v)) return { ok: false, error: 'Use a hex colour like #3D7EFF' };
  const r = parseInt(v.slice(0, 2), 16), g = parseInt(v.slice(2, 4), 16), b = parseInt(v.slice(4, 6), 16);
  return { ok: true, text: `rgb(${r}, ${g}, ${b})`, r, g, b };
}
function rgbToHex(r, g, b) {
  const c = (x) => Math.max(0, Math.min(255, Math.round(x))).toString(16).padStart(2, '0');
  return { ok: true, text: '#' + (c(r) + c(g) + c(b)).toUpperCase() };
}

// ---------- diff (line-level LCS)
function diffLines(a, b) {
  const A = String(a).split('\n'), B = String(b).split('\n');
  const dp = Array.from({ length: A.length + 1 }, () => new Array(B.length + 1).fill(0));
  for (let i = A.length - 1; i >= 0; i--) for (let j = B.length - 1; j >= 0; j--)
    dp[i][j] = A[i] === B[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
  const out = []; let i = 0, j = 0, added = 0, removed = 0;
  while (i < A.length && j < B.length) {
    if (A[i] === B[j]) { out.push('  ' + A[i]); i++; j++; }
    else if (dp[i + 1][j] >= dp[i][j + 1]) { out.push('- ' + A[i]); removed++; i++; }
    else { out.push('+ ' + B[j]); added++; j++; }
  }
  while (i < A.length) { out.push('- ' + A[i++]); removed++; }
  while (j < B.length) { out.push('+ ' + B[j++]); added++; }
  return { text: out.join('\n'), added, removed };
}

// ---------- cron ("next N runs" for a 5-field expression)
function cronParse(expr) {
  const f = String(expr).trim().split(/\s+/);
  if (f.length !== 5) return null;
  const ranges = [[0, 59], [0, 23], [1, 31], [1, 12], [0, 6]];
  const field = (spec, [lo, hi], i) => {
    const set = new Set();
    for (const part of spec.split(',')) {
      let step = 1, body = part;
      const sl = part.split('/'); if (sl.length === 2) { body = sl[0]; step = parseInt(sl[1], 10) || 1; }
      let a = lo, b = hi;
      if (body !== '*') { const r = body.split('-'); a = norm(r[0], i); b = r.length === 2 ? norm(r[1], i) : a; }
      if (isNaN(a) || isNaN(b)) return null;
      for (let v = a; v <= b; v += step) set.add(i === 4 && v === 7 ? 0 : v);
    }
    return set;
  };
  const MON = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 };
  const DOW = { sun: 0, mon: 1, tue: 2, wed: 3, thu: 4, fri: 5, sat: 6 };
  function norm(x, i) { const s = String(x).toLowerCase(); if (i === 3 && MON[s]) return MON[s]; if (i === 4 && DOW[s] != null) return DOW[s]; return parseInt(x, 10); }
  const sets = ranges.map((r, i) => field(f[i], r, i));
  if (sets.some((s) => !s || !s.size)) return null;
  return { min: sets[0], hour: sets[1], dom: sets[2], mon: sets[3], dow: sets[4], domStar: f[2] === '*', dowStar: f[4] === '*' };
}
function cronNext(expr, n = 5, from = new Date()) {
  const c = cronParse(expr);
  if (!c) return { ok: false, error: 'Expected 5 fields: minute hour day-of-month month day-of-week' };
  const out = [];
  const d = new Date(from.getTime()); d.setSeconds(0, 0); d.setMinutes(d.getMinutes() + 1);
  for (let guard = 0; guard < 366 * 24 * 60 && out.length < n; guard++) {
    const domOk = c.dom.has(d.getDate()), dowOk = c.dow.has(d.getDay());
    const dayOk = (c.domStar || c.dowStar) ? (domOk && dowOk) : (domOk || dowOk);   // Vixie-cron OR rule
    if (c.min.has(d.getMinutes()) && c.hour.has(d.getHours()) && c.mon.has(d.getMonth() + 1) && dayOk) out.push(new Date(d));
    d.setMinutes(d.getMinutes() + 1);
  }
  return { ok: true, runs: out, text: out.map((x) => x.toString().replace(/ GMT.*/, '')).join('\n') || 'No runs in the next year' };
}
function cronExplain(expr) {
  const r = cronNext(expr, 5);
  if (!r.ok) return r;
  return { ok: true, text: 'Next runs:\n' + r.text };
}


// ---------- clipboard content detector (for dev-mode smart suggestions)
function detectClip(text) {
  const t = String(text || '').trim();
  if (!t || t.length > 20000) return null;
  if (/^(?:Bearer\s+)?[A-Za-z0-9_-]{6,}\.[A-Za-z0-9_-]{6,}\.[A-Za-z0-9_-]*$/.test(t) && jwtDecode(t).ok) return { kind: 'jwt', label: '🔑 Decode JWT', run: 'decode jwt' };
  if (/^[\[{]/.test(t) && jsonFormat(t).ok && t.length > 2) return { kind: 'json', label: '{ } Format JSON', run: 'format json' };
  if (/%[0-9a-f]{2}/i.test(t) && !/\s/.test(t)) return { kind: 'url', label: '🔗 Decode URL', run: 'url decode' };
  if (/^#?[0-9a-f]{6}$/i.test(t) || /^#?[0-9a-f]{3}$/i.test(t)) return { kind: 'color', label: '🎨 Hex → RGB', run: 'hex to rgb ' + t };
  if (/^\d{10}$|^\d{13}$/.test(t)) return { kind: 'epoch', label: '🕐 Epoch → date', run: 'epoch ' + t };
  if (/^[A-Za-z0-9+/]{16,}={0,2}$/.test(t) && t.length % 4 === 0) { const d = b64decode(t); if (d.ok && /^[\x09\x0a\x0d\x20-\x7e]+$/.test(d.text)) return { kind: 'b64', label: '📦 Decode base64', run: 'decode base64' }; }
  return null;
}

module.exports = {
  jsonFormat, jsonMinify, b64encode, b64decode, urlEncode, urlDecode, jwtDecode,
  hash, hashAll, uuid, uuids, randomString, epochToDate, dateToEpoch,
  caseConvert, caseAll, regexTest, baseConvert, numberBases, hexToRgb, rgbToHex,
  diffLines, cronNext, cronExplain, cronParse, detectClip
};
