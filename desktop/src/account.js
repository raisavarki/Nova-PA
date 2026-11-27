/* Nova desktop — accounts (Supabase Auth) + PIN + cross-device sync.
   Runs in the MAIN process (the renderer can't reach Supabase: CSP blocks it
   and file:// has no crypto.subtle). Mirrors the phone's nova-account.js EXACTLY
   so the same email/password and the same PIN work across phone and computer.

   Config (Supabase url + anon key) comes from, in order:
     1) store.accountCfg  (set in Settings)
     2) src/supabase-config.json  (written by setup-nova.bat, baked into the build)
*/
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

let store = null;
const WEEK = 7 * 24 * 3600 * 1000;

function cfg() {
  const s = store.get().accountCfg;
  if (s && s.url && s.anonKey) return s;
  try {
    const f = path.join(__dirname, 'supabase-config.json');
    if (fs.existsSync(f)) { const j = JSON.parse(fs.readFileSync(f, 'utf8')); if (j.url && j.anonKey && !/YOUR_|PASTE|xxxx/i.test(j.url + j.anonKey)) return j; }
  } catch (e) {}
  return null;
}
const configured = () => !!cfg();
const AUTH = () => cfg().url.replace(/\/+$/, '') + '/auth/v1';
const REST = () => cfg().url.replace(/\/+$/, '') + '/rest/v1';

// ---- local persistence (in the encrypted-on-disk store) ----
const acct = () => store.get().account || {};
const setAcct = (patch) => store.set({ account: { ...acct(), ...patch } });
const getSession = () => acct().session || null;
const setSession = (s) => setAcct({ session: s || null });
const getPinRec = () => acct().pin || null;
const setPinRec = (r) => setAcct({ pin: r || null });
const touch = () => setAcct({ lastActive: Date.now() });
const lastActive = () => acct().lastActive || 0;
const inactiveTooLong = () => lastActive() && (Date.now() - lastActive()) > WEEK;

// ---- crypto (identical to the phone) ----
const sha = (salt, pin) => crypto.createHash('sha256').update(salt + '|' + pin).digest('hex');
const rnd = () => crypto.randomBytes(16).toString('hex');
const parseLen = (saltStr) => { const m = /^(\d{1,2}):/.exec(saltStr || ''); return m ? +m[1] : 4; };

function headers(token) { const c = cfg(); return { apikey: c.anonKey, Authorization: 'Bearer ' + (token || c.anonKey), 'Content-Type': 'application/json' }; }
async function post(pathname, body, base) {
  const c = cfg();
  const r = await fetch((base || AUTH()) + pathname, { method: 'POST', headers: { apikey: c.anonKey, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error((j && (j.msg || j.error_description || j.message || j.error)) || ('HTTP ' + r.status));
  return j;
}
function saveSession(j) {
  const prev = getSession() || {};
  const u = j.user || {};
  setSession({ access_token: j.access_token, refresh_token: j.refresh_token || prev.refresh_token, expires_at: Date.now() + (j.expires_in || 3600) * 1000, uid: u.id || prev.uid, email: u.email || prev.email });
  touch();
}

async function signUp(email, password) {
  const j = await post('/signup', { email, password });
  if (j.access_token) { saveSession(j); return { ok: true }; }
  try { await signIn(email, password); return { ok: true }; }
  catch (e) { return { ok: true, confirm: true, error: String(e && e.message || e) }; }
}
async function signIn(email, password) {
  const j = await post('/token?grant_type=password', { email, password });
  saveSession(j); return { ok: true };
}
async function refresh() {
  const s = getSession(); if (!s || !s.refresh_token) throw new Error('no session');
  const j = await post('/token?grant_type=refresh_token', { refresh_token: s.refresh_token });
  saveSession(j); return getSession();
}
async function token() {
  const s = getSession(); if (!s) throw new Error('not signed in');
  if (Date.now() > (s.expires_at - 60000)) await refresh();
  return getSession().access_token;
}
async function signOut() {
  try { const s = getSession(); if (s) await fetch(AUTH() + '/logout', { method: 'POST', headers: headers(s.access_token) }); } catch (e) {}
  setAcct({ session: null, pin: null, lastActive: 0 });
}

// ---- profile row (id = auth uid) ----
async function getProfile() {
  const t = await token(), s = getSession();
  const r = await fetch(REST() + `/profiles?id=eq.${s.uid}&select=*`, { headers: headers(t) });
  if (!r.ok) throw new Error('profile read ' + r.status);
  const rows = await r.json(); return rows[0] || null;
}
async function upsertProfile(patch) {
  const t = await token(), s = getSession();
  const body = [{ id: s.uid, ...patch, updated_at: new Date().toISOString() }];
  const r = await fetch(REST() + '/profiles?on_conflict=id', { method: 'POST', headers: { ...headers(t), Prefer: 'resolution=merge-duplicates,return=minimal' }, body: JSON.stringify(body) });
  if (!r.ok) throw new Error('profile write ' + r.status);
}

async function setPin(pin) {
  const saltStr = String(pin).length + ':' + rnd();
  const h = sha(saltStr, pin);
  setPinRec({ salt: saltStr, hash: h, len: String(pin).length }); // local-first
  try { await upsertProfile({ pin_salt: saltStr, pin_hash: h }); return { ok: true, synced: true }; }
  catch (e) { return { ok: true, synced: false, error: String(e && e.message || e) }; }
}
async function loadPin() {
  const p = await getProfile();
  if (p && p.pin_hash) { setPinRec({ salt: p.pin_salt, hash: p.pin_hash, len: parseLen(p.pin_salt) }); return true; }
  return false;
}
function verifyPin(pin) {
  const rec = getPinRec(); if (!rec) return false;
  const ok = sha(rec.salt, pin) === rec.hash;
  if (ok) touch();
  return ok;
}
const hasPinLocally = () => !!getPinRec();
const pinLen = () => { const r = getPinRec(); return (r && r.len) || 4; };

async function pull() { const p = await getProfile(); return p ? p.data : null; }
async function push(data) { await upsertProfile({ data }); touch(); }

function status() {
  const s = getSession();
  return { configured: configured(), authed: !!s, email: s ? s.email : '', hasPin: hasPinLocally(), pinLen: pinLen(), needsReauth: inactiveTooLong() };
}

module.exports = {
  init: (st) => { store = st; },
  configured, status,
  signUp, signIn, signOut, refresh, touch,
  isAuthed: () => !!getSession(),
  setPin, loadPin, verifyPin, hasPinLocally, pinLen,
  pull, push, getProfile, setConfig: (url, anonKey) => store.set({ accountCfg: url ? { url, anonKey } : null })
};
