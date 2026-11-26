/* Nova — Supabase cloud sync (end-to-end encrypted).
   Your data is AES-256 encrypted on-device with your pass-phrase BEFORE it is
   sent, so Supabase only ever stores ciphertext. Works in the browser/PWA and
   in Electron (both have fetch + crypto.subtle).

   Table expected (see SUPABASE-SETUP):
     nova_sync(id text primary key, app text, cipher text, rev int8, updated_at timestamptz)
   Row id = "<account>:<app>".

   Usage:
     NovaSync.configure({url, anonKey, account, app, pass});   // persists (pass stays local)
     await NovaSync.syncNow(getDb, applyDb);   // getDb()->object, applyDb(object)
*/
(function () {
  const LS = 'nova-sync-cfg';
  const enc = new TextEncoder(), dec = new TextDecoder();
  const b64 = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf)));
  const unb64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

  function getConfig() { try { return JSON.parse(localStorage.getItem(LS)) || null; } catch (e) { return null; } }
  function configure(cfg) {
    const prev = getConfig() || {};
    const next = { ...prev, ...cfg };
    localStorage.setItem(LS, JSON.stringify(next));
    return next;
  }
  function isOn() { const c = getConfig(); return !!(c && c.url && c.anonKey && c.account && c.pass); }
  function clear() { localStorage.removeItem(LS); }

  async function keyFrom(pass, salt) {
    const base = await crypto.subtle.importKey('raw', enc.encode(pass), 'PBKDF2', false, ['deriveKey']);
    return crypto.subtle.deriveKey({ name: 'PBKDF2', salt, iterations: 150000, hash: 'SHA-256' }, base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
  }
  async function encrypt(pass, obj) {
    const salt = crypto.getRandomValues(new Uint8Array(16)), iv = crypto.getRandomValues(new Uint8Array(12));
    const key = await keyFrom(pass, salt);
    const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, enc.encode(JSON.stringify(obj)));
    return 'v1.' + b64(salt) + '.' + b64(iv) + '.' + b64(ct);
  }
  async function decrypt(pass, cipher) {
    const p = String(cipher).split('.'); if (p[0] !== 'v1' || p.length !== 4) throw new Error('bad cipher');
    const key = await keyFrom(pass, unb64(p[1]));
    const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64(p[2]) }, key, unb64(p[3]));
    return JSON.parse(dec.decode(pt));
  }

  function rowId(c) { return `${c.account}:${c.app || 'app'}`; }
  function headers(c) { return { apikey: c.anonKey, Authorization: 'Bearer ' + c.anonKey, 'Content-Type': 'application/json' }; }
  async function remoteMeta(c) {
    const r = await fetch(`${c.url}/rest/v1/nova_sync?id=eq.${encodeURIComponent(rowId(c))}&select=rev,updated_at`, { headers: headers(c) });
    if (!r.ok) throw new Error('read failed (' + r.status + ')');
    const rows = await r.json(); return rows[0] || null;
  }
  async function pull() {
    const c = getConfig(); if (!c) throw new Error('not configured');
    const r = await fetch(`${c.url}/rest/v1/nova_sync?id=eq.${encodeURIComponent(rowId(c))}&select=*`, { headers: headers(c) });
    if (!r.ok) throw new Error('read failed (' + r.status + ')');
    const rows = await r.json(); if (!rows[0]) return null;
    return { rev: rows[0].rev, updated_at: rows[0].updated_at, data: await decrypt(c.pass, rows[0].cipher) };
  }
  async function push(dbObj, rev) {
    const c = getConfig(); if (!c) throw new Error('not configured');
    const cipher = await encrypt(c.pass, dbObj);
    const body = [{ id: rowId(c), app: c.app || 'app', cipher, rev, updated_at: new Date().toISOString() }];
    const r = await fetch(`${c.url}/rest/v1/nova_sync?on_conflict=id`, {
      method: 'POST', headers: { ...headers(c), Prefer: 'resolution=merge-duplicates,return=minimal' }, body: JSON.stringify(body)
    });
    if (!r.ok) throw new Error('write failed (' + r.status + ')');
    return rev;
  }

  // Full sync: newer side wins (by rev). getDb()->object, applyDb(object) applied when remote is newer.
  async function syncNow(getDb, applyDb) {
    const c = getConfig(); if (!isOn()) throw new Error('not configured');
    const localRev = +(c.rev || 0);
    let meta = null; try { meta = await remoteMeta(c); } catch (e) { /* table empty / first run */ }
    const remoteRev = meta ? +meta.rev : 0;
    if (remoteRev > localRev) {
      const got = await pull();
      if (got) { await applyDb(got.data); configure({ rev: got.rev }); return { action: 'pulled', rev: got.rev }; }
    }
    // push local as the next revision
    const db = await getDb();
    const newRev = Math.max(localRev, remoteRev) + 1;
    await push(db, newRev);
    configure({ rev: newRev });
    return { action: 'pushed', rev: newRev };
  }
  async function test() { const c = getConfig(); if (!c) throw new Error('not configured'); await remoteMeta(c); return true; }

  window.NovaSync = { configure, getConfig, isOn, clear, syncNow, pull, push, test, encrypt, decrypt };
})();
