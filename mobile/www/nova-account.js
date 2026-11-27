/* Nova — accounts (Supabase Auth) + PIN + cross-device data.
   email+password = identity (Supabase Auth). PIN = daily unlock (hashed, stored
   in the account so the same PIN works on every device). Data lives in the
   user's own `profiles` row, protected by Row Level Security.

   Config is injected at build time by connect-supabase.bat into
   window.NOVA_SUPABASE = { url, anonKey }. If absent/placeholder, the app runs
   in local-only mode (no accounts).

   Works in the browser/PWA and in Electron (fetch + crypto.subtle). */
(function () {
  const C = (typeof window !== 'undefined' && window.NOVA_SUPABASE) || {};
  const configured = () => !!(C.url && C.anonKey && !/YOUR_|xxxx|PASTE/i.test(C.url + C.anonKey));
  const AUTH = () => C.url.replace(/\/+$/, '') + '/auth/v1';
  const REST = () => C.url.replace(/\/+$/, '') + '/rest/v1';
  const LS_S = 'nova-acct-session', LS_P = 'nova-acct-pin', LS_A = 'nova-acct-active';
  const WEEK = 7 * 24 * 3600 * 1000;

  const enc = new TextEncoder();
  const hex = (buf) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
  async function sha(salt, pin) { return hex(await crypto.subtle.digest('SHA-256', enc.encode(salt + '|' + pin))); }
  function rnd() { const a = new Uint8Array(16); crypto.getRandomValues(a); return hex(a); }

  const getSession = () => { try { return JSON.parse(localStorage.getItem(LS_S)); } catch (e) { return null; } };
  const setSession = (s) => s ? localStorage.setItem(LS_S, JSON.stringify(s)) : localStorage.removeItem(LS_S);
  const getPinRec = () => { try { return JSON.parse(localStorage.getItem(LS_P)); } catch (e) { return null; } };
  const setPinRec = (r) => r ? localStorage.setItem(LS_P, JSON.stringify(r)) : localStorage.removeItem(LS_P);
  const touch = () => localStorage.setItem(LS_A, String(Date.now()));
  const lastActive = () => +localStorage.getItem(LS_A) || 0;
  const inactiveTooLong = () => lastActive() && (Date.now() - lastActive()) > WEEK;

  function authHeaders(token) { return { apikey: C.anonKey, Authorization: 'Bearer ' + (token || C.anonKey), 'Content-Type': 'application/json' }; }

  async function post(path, body, base) {
    const r = await fetch((base || AUTH()) + path, { method: 'POST', headers: { apikey: C.anonKey, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error((j && (j.msg || j.error_description || j.message || j.error)) || ('HTTP ' + r.status));
    return j;
  }

  async function signUp(email, password) {
    const j = await post('/signup', { email, password });
    // if email confirmation is OFF, Supabase returns a session; else only a user
    if (j.access_token) { saveSession(j); return { ok: true, session: getSession() }; }
    // No session on the signup response. With confirmation OFF some projects still
    // don't return one — try an immediate sign-in. If THAT fails, email confirmation
    // really is required.
    try { await signIn(email, password); return { ok: true, session: getSession() }; }
    catch (e) { return { ok: true, confirm: true, error: String((e && e.message) || e) }; }
  }
  async function signIn(email, password) {
    const j = await post('/token?grant_type=password', { email, password });
    saveSession(j); return { ok: true, session: getSession() };
  }
  function saveSession(j) {
    const prev = getSession() || {};
    const u = j.user || {};
    // Keep uid/email/refresh_token across refreshes even if the refresh response omits them.
    setSession({ access_token: j.access_token, refresh_token: j.refresh_token || prev.refresh_token, expires_at: Date.now() + (j.expires_in || 3600) * 1000, uid: u.id || prev.uid, email: u.email || prev.email });
    touch();
  }
  async function refresh() {
    const s = getSession(); if (!s || !s.refresh_token) throw new Error('no session');
    const j = await post('/token?grant_type=refresh_token', { refresh_token: s.refresh_token });
    saveSession(j); return getSession();
  }
  async function token() {
    const s = getSession(); if (!s) throw new Error('not signed in');
    if (Date.now() > (s.expires_at - 60000)) { await refresh(); }
    return getSession().access_token;
  }
  async function signOut() {
    try { const s = getSession(); if (s) await fetch(AUTH() + '/logout', { method: 'POST', headers: authHeaders(s.access_token) }); } catch (e) {}
    setSession(null); setPinRec(null); localStorage.removeItem(LS_A);
  }

  // ---- profile row (id = auth uid): { pin_salt, pin_hash, data, updated_at } ----
  async function getProfile() {
    const t = await token(), s = getSession();
    const r = await fetch(REST() + `/profiles?id=eq.${s.uid}&select=*`, { headers: authHeaders(t) });
    if (!r.ok) throw new Error('profile read ' + r.status);
    const rows = await r.json(); return rows[0] || null;
  }
  async function upsertProfile(patch) {
    const t = await token(), s = getSession();
    const body = [{ id: s.uid, ...patch, updated_at: new Date().toISOString() }];
    const r = await fetch(REST() + '/profiles?on_conflict=id', { method: 'POST', headers: { ...authHeaders(t), Prefer: 'resolution=merge-duplicates,return=minimal' }, body: JSON.stringify(body) });
    if (!r.ok) throw new Error('profile write ' + r.status);
  }

  // The PIN length is embedded in the salt string (e.g. "6:ab12…") so cross-device
  // sign-in knows how many digits to ask for — no extra DB column needed.
  const parseLen = (saltStr) => { const m = /^(\d{1,2}):/.exec(saltStr || ''); return m ? +m[1] : 4; };
  async function setPin(pin) {
    const saltStr = pin.length + ':' + rnd();
    const h = await sha(saltStr, pin);
    // Cache locally FIRST, so this device can always unlock even if the cloud write
    // fails (table/RLS not set up yet, offline, etc.). The old order lost the PIN
    // entirely when the profile write threw — that was the "PIN not configured" bug.
    setPinRec({ salt: saltStr, hash: h, len: pin.length });
    try { await upsertProfile({ pin_salt: saltStr, pin_hash: h }); return { ok: true, synced: true }; }
    catch (e) { return { ok: true, synced: false, error: String((e && e.message) || e) }; }
  }
  // pull the account's PIN into the local cache (after sign-in on a new device)
  async function loadPin() {
    const p = await getProfile();
    if (p && p.pin_hash) { setPinRec({ salt: p.pin_salt, hash: p.pin_hash, len: parseLen(p.pin_salt) }); return true; }
    return false;
  }
  async function verifyPin(pin) {
    const rec = getPinRec(); if (!rec) return false;
    const ok = (await sha(rec.salt, pin)) === rec.hash;
    if (ok) touch();
    return ok;
  }
  const hasPinLocally = () => !!getPinRec();
  const pinLen = () => { const r = getPinRec(); return (r && r.len) || 4; };

  async function pullData() { const p = await getProfile(); return p ? p.data : null; }
  async function pushData(obj) { await upsertProfile({ data: obj }); touch(); }

  window.NovaAccount = {
    configured, signUp, signIn, signOut, refresh,
    session: getSession, isAuthed: () => !!getSession(), email: () => (getSession() || {}).email,
    needsReauth: inactiveTooLong, touch,
    setPin, loadPin, verifyPin, hasPinLocally, pinLen,
    pullData, pushData, getProfile
  };
})();
