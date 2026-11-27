// Nova developer kit — offline, dependency-free generators and converters.
const crypto = require('crypto');

// ---------- secret / key generation
function hexSecret(bytes = 32) { return crypto.randomBytes(Math.max(1, Math.min(256, bytes))).toString('hex'); }
function b64Secret(bytes = 32) { return crypto.randomBytes(Math.max(1, Math.min(256, bytes))).toString('base64'); }
function urlToken(bytes = 24) { return crypto.randomBytes(Math.max(1, Math.min(256, bytes))).toString('base64url'); }
function apiKey(prefix = 'sk') { return `${prefix}_${crypto.randomBytes(24).toString('base64url')}`; }
function hmacKey(bytes = 32) { return crypto.randomBytes(bytes).toString('base64'); }

const WORDS = ('able acid aged army atom aunt back bake bald band bank bare barn base bath bead beam bean bear beat beef bell belt bend best bike bind bird bite blue boat body boil bold bolt bone book boot born boss both bowl brae bran brew brow buck bulk bull bump burn bush busy cafe cage cake calm camp cane cape card care cart case cash cast cave cell chat chef chip city clam claw clay clip club coal coat code coin cold come cook cool cord core corn cost crew crop cube cure curl dark dart dash data date dawn deal dear debt deck deep deer desk dial dice diet dirt dish dock dome door dose dove down draw drip drop drum dual duck duke dusk dust duty each earn east easy edge else envy epic even ever evil exam exit face fact fade fair fall fame farm fast fate fear feat feed feel fern feud file fill film find fine fire firm fish fist five flag flat flaw flax flea fled flee flew flex flip flow foam foil fold folk font food fool foot ford fork form fort foul four fram free frog from fuel full fund fury fuse gain gala game gang gaze gear gene gift girl give glad glen glow glue goal goat gold golf gone good gown grab gram gray grew grid grim grin grip grit grow gulf gull guru gush gust hack hail hair half hall halt hand hang harm hawk haze head heal heap hear heat heed heel help herb herd here hero hide high hill hint hire hive hold hole holy home hood hook hope horn hose host hour huge hull hump hunt hurl hurt hush hymn icon idea idle inch iris iron isle item java jazz jest jive join joke jolt july jump june junk jury just keen keep kelp kept kick kill kind king kiss kite kiwi knee knew knit knob knot know lace lack lady lake lamb lamp land lane last late lawn lazy lead leaf leak lean leap left lend lens lest liar life lift like lime limp line link lion list live load loaf loan lock loft logo lone long look loom loop lord lose loss lost loud love luck lump lung lure lush lute mace maid mail main make male mall malt mane many mark mars mash mask mass mast mate math maze meal mean meat meek meet melt memo mend menu mere mesh mild mile milk mill mind mine mint mist mode mold mole monk mood moon more moss most moth move much muse must mute myth name navy near neat neck need nest news next nice nick nine node none noon norm nose note noun oath obey okay omen omit once only onto open oral oval oven over owel pace pack page pail pain pair pale palm park part past path peak pear peat peck peel peer pelt perk pest pick pier pike pile pill pine pink pint pipe plan play plea plot plow plug plum plus poem poet pole poll pond pool poor pope pork port pose post pour pray prey prim prod prom prop pull pulp pump punk pure push quit race rack raft rage raid rail rain rake rank rant rare rash rate rave read real reap rear reed reef reel rely rend rent rest rice rich ride rift ring riot ripe rise risk road roam roar robe rock rode role roll roof rook room root rope rose ruby rude ruin rule rush rust sage said sail sake sale salt same sand sane sash save scan scar seal seam seat seed seek seem seen self sell send sent sept shed shin ship shoe shop shot show shut side sift sigh sign silk sill silo sing sink sire site size skid skin skip slab slam slap slat sled slid slim slip slit slot slow slug smug snap snip snow soak soap soar sock soda soft soil sold sole solo some song sons soon sort soul soup sour spin spot spur stag star stay stem step stew stir stop stub stud such suit sulk sumo sung sunk sure surf swap swim swum sync tack tale talk tall tame tank tape task taut teak teal team tear teen tell tend tent term test text than that thaw them then they thin this thou thud thug thus tick tide tidy tied tier tile till tilt time tiny tire toad toil told toll tomb tone tool toot tore torn toss tour town trap tray tree trek trim trio trip trot true tube tuck tuna tune turf turn tusk twin twit type ugly undo unit upon urge used user vain vale vane vary vase vast veal veil vein vent verb very vest veto vial vibe vice view vine visa void volt vote wade waft wage wail wait wake walk wall wand want ward ware warm warn warp wart wary wash wasp wave wavy waxy weak wear weed week weep weld well went wept were west what when whim whip whir whiz whom wick wide wife wild will wilt wind wine wing wink wipe wire wise wish wisp with woke wolf wood wool word wore work worm worn wove wrap wren wrot yard yarn yawn yeah year yell yoga yolk yore your zeal zero zinc zone zoom').split(' ');
function passphrase(words = 5, sep = '-') { const out = []; const b = crypto.randomBytes(words * 2); for (let i = 0; i < words; i++) out.push(WORDS[(b[i * 2] << 8 | b[i * 2 + 1]) % WORDS.length]); return out.join(sep) + '-' + (crypto.randomBytes(1)[0] % 90 + 10); }

function keypair(type = 'ed25519') {
  const t = /rsa/i.test(type) ? 'rsa' : /ec|p256|prime/i.test(type) ? 'ec' : 'ed25519';
  const opts = t === 'rsa' ? { modulusLength: 2048 } : t === 'ec' ? { namedCurve: 'prime256v1' } : {};
  const { publicKey, privateKey } = crypto.generateKeyPairSync(t, { ...opts, publicKeyEncoding: { type: 'spki', format: 'pem' }, privateKeyEncoding: { type: 'pkcs8', format: 'pem' } });
  return { type: t, publicKey, privateKey };
}

// ---------- JSON -> types (TypeScript interface + ABAP structure)
function tsType(v) {
  if (v === null) return 'any';
  if (Array.isArray(v)) return (v.length ? tsType(v[0]) : 'any') + '[]';
  switch (typeof v) { case 'number': return Number.isInteger(v) ? 'number' : 'number'; case 'boolean': return 'boolean'; case 'object': return 'object'; default: return 'string'; }
}
function jsonToTS(json, name = 'Root') {
  let obj; try { obj = typeof json === 'string' ? JSON.parse(json) : json; } catch (e) { return { ok: false, error: 'Invalid JSON' }; }
  const lines = [], seen = {};
  function emit(o, nm) {
    if (seen[nm]) return; seen[nm] = true;
    const src = Array.isArray(o) ? (o[0] || {}) : o;
    const body = [`export interface ${nm} {`];
    for (const [k, v] of Object.entries(src || {})) {
      if (v && typeof v === 'object' && !Array.isArray(v)) { const sub = cap(k); body.push(`  ${k}: ${sub};`); emit(v, sub); }
      else if (Array.isArray(v) && v[0] && typeof v[0] === 'object') { const sub = cap(singular(k)); body.push(`  ${k}: ${sub}[];`); emit(v[0], sub); }
      else body.push(`  ${k}: ${tsType(v)};`);
    }
    body.push('}'); lines.unshift(body.join('\n'));
  }
  emit(obj, cap(name));
  return { ok: true, text: lines.join('\n\n') };
}
function abapType(k, v) {
  if (typeof v === 'number') return Number.isInteger(v) ? 'i' : 'p LENGTH 15 DECIMALS 2';
  if (typeof v === 'boolean') return 'abap_bool';
  return `string`;
}
function jsonToABAP(json, name = 'ty_root') {
  let obj; try { obj = typeof json === 'string' ? JSON.parse(json) : json; } catch (e) { return { ok: false, error: 'Invalid JSON' }; }
  const src = Array.isArray(obj) ? (obj[0] || {}) : obj;
  const lines = [`TYPES: BEGIN OF ${name},`];
  const width = Math.max(...Object.keys(src).map((k) => k.length), 4);
  for (const [k, v] of Object.entries(src)) {
    if (v && typeof v === 'object') lines.push(`         ${k.padEnd(width)} TYPE REF TO data,   " nested ${Array.isArray(v) ? 'table' : 'structure'} — model separately`);
    else lines.push(`         ${k.padEnd(width)} TYPE ${abapType(k, v)},`);
  }
  lines.push(`       END OF ${name}.`);
  return { ok: true, text: lines.join('\n') };
}
const cap = (s) => String(s).replace(/[^a-z0-9]/gi, ' ').replace(/\s+(.)/g, (m, c) => c.toUpperCase()).replace(/^./, (c) => c.toUpperCase()).replace(/\s/g, '') || 'Item';
const singular = (s) => String(s).replace(/ies$/, 'y').replace(/s$/, '');

// ---------- colour tools
function parseHex(hex) { const h = String(hex).replace('#', '').trim(); const v = h.length === 3 ? h.split('').map((c) => c + c).join('') : h; if (!/^[0-9a-f]{6}$/i.test(v)) return null; return [0, 2, 4].map((i) => parseInt(v.slice(i, i + 2), 16)); }
const toHex = (rgb) => '#' + rgb.map((x) => Math.max(0, Math.min(255, Math.round(x))).toString(16).padStart(2, '0')).join('').toUpperCase();
function lum([r, g, b]) { const a = [r, g, b].map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }); return 0.2126 * a[0] + 0.7152 * a[1] + 0.0722 * a[2]; }
function contrast(hex1, hex2) {
  const a = parseHex(hex1), b = parseHex(hex2); if (!a || !b) return { ok: false, error: 'Use two hex colours, e.g. #111 #fff' };
  const l1 = lum(a), l2 = lum(b); const ratio = (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
  const r = Math.round(ratio * 100) / 100;
  return { ok: true, ratio: r, text: `Contrast ${r}:1\nNormal text  AA ${r >= 4.5 ? '✓' : '✗'}  AAA ${r >= 7 ? '✓' : '✗'}\nLarge text   AA ${r >= 3 ? '✓' : '✗'}  AAA ${r >= 4.5 ? '✓' : '✗'}` };
}
function shades(hex) {
  const rgb = parseHex(hex); if (!rgb) return { ok: false, error: 'Use a hex colour like #3D7EFF' };
  const mix = (t) => rgb.map((c) => t < 0 ? c * (1 + t) : c + (255 - c) * t);
  const steps = [-0.6, -0.4, -0.2, 0, 0.2, 0.4, 0.6];
  return { ok: true, text: steps.map((t) => `${t === 0 ? '→ ' : '  '}${toHex(mix(t))}`).join('\n'), swatches: steps.map((t) => toHex(mix(t))) };
}

// ---------- converters
function envToJson(txt) {
  const o = {};
  for (const line of String(txt).split('\n')) { const m = line.match(/^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/); if (m) o[m[1]] = m[2].replace(/^["']|["']$/g, ''); }
  return { ok: true, text: JSON.stringify(o, null, 2) };
}
function jsonToEnv(json) { let o; try { o = typeof json === 'string' ? JSON.parse(json) : json; } catch (e) { return { ok: false, error: 'Invalid JSON' }; } return { ok: true, text: Object.entries(o).map(([k, v]) => `${k.toUpperCase().replace(/[^A-Z0-9]+/g, '_')}=${typeof v === 'object' ? JSON.stringify(v) : v}`).join('\n') }; }
function queryToJson(q) { const o = {}; new URLSearchParams(String(q).replace(/^\?/, '')).forEach((v, k) => { o[k] = v; }); return { ok: true, text: JSON.stringify(o, null, 2) }; }
function jsonToQuery(json) { let o; try { o = typeof json === 'string' ? JSON.parse(json) : json; } catch (e) { return { ok: false, error: 'Invalid JSON' }; } return { ok: true, text: new URLSearchParams(o).toString() }; }
const htmlEntities = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
function htmlEncode(s) { return String(s).replace(/[&<>"']/g, (c) => htmlEntities[c]); }
function htmlDecode(s) { return String(s).replace(/&(amp|lt|gt|quot|#39|#x27);/g, (m, e) => ({ amp: '&', lt: '<', gt: '>', quot: '"', '#39': "'", '#x27': "'" }[e])); }

// ---------- mock / test data
const FIRST = 'Aarav Vivaan Aditya Raisa Ananya Diya Isha Kiara Aryan Neha Rohan Priya Sana Dev Maya Ved Anika Kabir Zara Arjun'.split(' ');
const LAST = 'Sharma Patel Nair Varki Iyer Menon Rao Gupta Shah Reddy Das Bose Khan Pillai Jain Sinha Verma Kaur Mehta Joshi'.split(' ');
const rand = (n) => crypto.randomBytes(1)[0] % n;
const pick = (a) => a[rand(a.length)];
function mock(kind, n = 5) {
  n = Math.max(1, Math.min(100, n));
  const gen = {
    name: () => `${pick(FIRST)} ${pick(LAST)}`,
    email: () => `${pick(FIRST).toLowerCase()}.${pick(LAST).toLowerCase()}@example.com`,
    uuid: () => crypto.randomUUID(),
    phone: () => '+91 ' + (6 + rand(4)) + Array.from({ length: 9 }, () => rand(10)).join(''),
    int: () => rand(10000),
    bool: () => rand(2) === 0 ? 'true' : 'false',
    date: () => new Date(Date.now() - rand(365) * 864e5).toISOString().slice(0, 10)
  };
  const g = gen[kind]; if (!g) return { ok: false, error: 'Unknown kind (name, email, uuid, phone, int, bool, date, user)' };
  return { ok: true, text: Array.from({ length: n }, g).join('\n') };
}
function mockUsers(n = 3) {
  n = Math.max(1, Math.min(50, n));
  const rows = Array.from({ length: n }, () => { const f = pick(FIRST), l = pick(LAST); return { id: crypto.randomUUID(), name: `${f} ${l}`, email: `${f.toLowerCase()}.${l.toLowerCase()}@example.com`, active: rand(2) === 0 }; });
  return { ok: true, text: JSON.stringify(rows, null, 2) };
}

module.exports = {
  hexSecret, b64Secret, urlToken, apiKey, hmacKey, passphrase, keypair,
  jsonToTS, jsonToABAP, contrast, shades, parseHex, toHex,
  envToJson, jsonToEnv, queryToJson, jsonToQuery, htmlEncode, htmlDecode,
  mock, mockUsers
};

// ---------- text utilities
function slugify(s) { return String(s).toLowerCase().normalize('NFKD').replace(/[^\w\s-]/g, '').trim().replace(/[\s_]+/g, '-').replace(/-+/g, '-'); }
function textStats(s) {
  const t = String(s); const words = (t.trim().match(/\S+/g) || []).length; const lines = t ? t.split('\n').length : 0;
  return { ok: true, text: `chars: ${t.length}\nwords: ${words}\nlines: ${lines}\nchars (no spaces): ${t.replace(/\s/g, '').length}` };
}
function sortLines(s, { unique = false, numeric = false, desc = false } = {}) {
  let a = String(s).split('\n');
  a.sort((x, y) => numeric ? (parseFloat(x) || 0) - (parseFloat(y) || 0) : x.localeCompare(y));
  if (desc) a.reverse();
  if (unique) { const seen = new Set(), out = []; for (const l of a) { if (!seen.has(l)) { seen.add(l); out.push(l); } } a = out; }
  return { ok: true, text: a.join('\n') };
}
function dedupeLines(s) { const seen = new Set(), out = []; for (const l of String(s).split('\n')) { if (!seen.has(l)) { seen.add(l); out.push(l); } } return { ok: true, text: out.join('\n') }; }
function reverseLines(s) { return { ok: true, text: String(s).split('\n').reverse().join('\n') }; }
function trimLines(s) { return { ok: true, text: String(s).split('\n').map((l) => l.replace(/\s+$/, '')).join('\n').replace(/\n{3,}/g, '\n\n').trim() }; }

// ---------- markdown -> safe HTML (small subset)
function mdToHtml(src) {
  const esc = (x) => x.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const lines = String(src).split('\n'); let out = [], inCode = false, inList = false, codeBuf = [];
  const inline = (t) => esc(t)
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/(^|[^*])\*([^*]+)\*/g, '$1<em>$2</em>')
    .replace(/\[([^\]]+)\]\((https?:\/\/[^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');
  for (const raw of lines) {
    if (/^```/.test(raw)) { if (inCode) { out.push('<pre><code>' + esc(codeBuf.join('\n')) + '</code></pre>'); codeBuf = []; inCode = false; } else inCode = true; continue; }
    if (inCode) { codeBuf.push(raw); continue; }
    const h = raw.match(/^(#{1,6})\s+(.*)$/);
    if (h) { if (inList) { out.push('</ul>'); inList = false; } out.push(`<h${h[1].length}>${inline(h[2])}</h${h[1].length}>`); continue; }
    const li = raw.match(/^\s*[-*+]\s+(.*)$/);
    if (li) { if (!inList) { out.push('<ul>'); inList = true; } out.push('<li>' + inline(li[1]) + '</li>'); continue; }
    if (inList) { out.push('</ul>'); inList = false; }
    if (!raw.trim()) { out.push(''); continue; }
    out.push('<p>' + inline(raw) + '</p>');
  }
  if (inCode) out.push('<pre><code>' + esc(codeBuf.join('\n')) + '</code></pre>');
  if (inList) out.push('</ul>');
  return { ok: true, text: out.join('\n') };
}
module.exports.slugify = slugify;
module.exports.textStats = textStats;
module.exports.sortLines = sortLines;
module.exports.dedupeLines = dedupeLines;
module.exports.reverseLines = reverseLines;
module.exports.trimLines = trimLines;
module.exports.mdToHtml = mdToHtml;
