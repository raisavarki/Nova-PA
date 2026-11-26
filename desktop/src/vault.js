// Encrypted API-key / secret vault. Passphrase-locked, AES-256-GCM + scrypt.
// Secrets are stored encrypted in settings (store.vault); the passphrase lives only in memory.
const crypto = require('crypto');

let key = null;                 // derived key while unlocked (in memory only)
let storeRef = null;

function init(store) { storeRef = store; }
function vault() { return storeRef.get().vault || null; }

function derive(pass, saltHex) { return crypto.scryptSync(String(pass), Buffer.from(saltHex, 'hex'), 32); }
function enc(k, s) { const iv = crypto.randomBytes(12); const c = crypto.createCipheriv('aes-256-gcm', k, iv); const ct = Buffer.concat([c.update(String(s), 'utf8'), c.final()]); return Buffer.concat([iv, c.getAuthTag(), ct]).toString('base64'); }
function dec(k, b) { const r = Buffer.from(b, 'base64'); const d = crypto.createDecipheriv('aes-256-gcm', k, r.slice(0, 12)); d.setAuthTag(r.slice(12, 28)); return Buffer.concat([d.update(r.slice(28)), d.final()]).toString('utf8'); }

function status() { const v = vault(); return { exists: !!(v && v.verifier), unlocked: !!key, count: v ? (v.items || []).length : 0 }; }

function create(pass) {
  if (String(pass).length < 4) return { ok: false, error: 'Use at least 4 characters.' };
  const salt = crypto.randomBytes(16).toString('hex');
  key = derive(pass, salt);
  storeRef.set({ vault: { salt, verifier: enc(key, 'vault-ok'), items: [] } });
  return { ok: true };
}
function unlock(pass) {
  const v = vault(); if (!v || !v.verifier) return { ok: false, error: 'No vault yet.' };
  try { const k = derive(pass, v.salt); if (dec(k, v.verifier) !== 'vault-ok') return { ok: false, error: 'Wrong passphrase.' }; key = k; return { ok: true }; }
  catch (e) { return { ok: false, error: 'Wrong passphrase.' }; }
}
function lock() { key = null; }

function list() {
  const v = vault(); if (!v) return [];
  return (v.items || []).map((it) => ({ id: it.id, name: it.name, note: it.note || '', created: it.created, hasValue: true }));
}
function add(name, value, note) {
  if (!key) return { ok: false, error: 'locked' };
  const v = vault(); const items = (v.items || []).slice();
  const existing = items.find((x) => x.name.toLowerCase() === String(name).toLowerCase());
  const item = { id: existing ? existing.id : ('v_' + crypto.randomBytes(5).toString('hex')), name: String(name).trim(), note: note || '', enc: enc(key, value), created: existing ? existing.created : Date.now() };
  storeRef.set({ vault: { ...v, items: existing ? items.map((x) => (x.id === existing.id ? item : x)) : items.concat([item]) } });
  return { ok: true, id: item.id };
}
function reveal(id) {
  if (!key) return { ok: false, error: 'locked' };
  const v = vault(); const it = (v.items || []).find((x) => x.id === id || x.name.toLowerCase() === String(id).toLowerCase());
  if (!it) return { ok: false, error: 'not found' };
  try { return { ok: true, name: it.name, value: dec(key, it.enc) }; } catch (e) { return { ok: false, error: 'decrypt failed' }; }
}
function remove(id) {
  const v = vault(); if (!v) return { ok: false };
  const it = (v.items || []).find((x) => x.id === id || x.name.toLowerCase() === String(id).toLowerCase());
  if (!it) return { ok: false, error: 'not found' };
  storeRef.set({ vault: { ...v, items: v.items.filter((x) => x.id !== it.id) } });
  return { ok: true, name: it.name };
}

module.exports = { init, status, create, unlock, lock, list, add, reveal, remove };
