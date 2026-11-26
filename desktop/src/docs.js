// Local document finder: indexes text inside PDF, Word, Excel, PowerPoint, text/CSV files in chosen folders.
// Everything stays on the PC (index file lives in Nova's data folder). No external libraries.
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const EventEmitter = require('events');

const EXT = new Set(['.pdf', '.docx', '.xlsx', '.pptx', '.txt', '.csv', '.md', '.json', '.xml', '.log', '.html', '.htm', '.eml']);
const MAX_TEXT = 60000, MAX_FILE = 40 * 1024 * 1024, MAX_FILES = 25000;
const SKIP_DIRS = /^(node_modules|\.git|\$recycle\.bin|system volume information|appdata|\.cache|windows|program files.*)$/i;

// ---------------------------------------------------------- ZIP (docx/xlsx/pptx)
function unzipEntries(buf, want) {
  const out = {};
  let eocd = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 65557); i--) if (buf.readUInt32LE(i) === 0x06054b50) { eocd = i; break; }
  if (eocd < 0) return out;
  const count = buf.readUInt16LE(eocd + 10);
  let p = buf.readUInt32LE(eocd + 16);
  for (let n = 0; n < count && p + 46 <= buf.length; n++) {
    if (buf.readUInt32LE(p) !== 0x02014b50) break;
    const method = buf.readUInt16LE(p + 10), csize = buf.readUInt32LE(p + 20);
    const nlen = buf.readUInt16LE(p + 28), xlen = buf.readUInt16LE(p + 30), clen = buf.readUInt16LE(p + 32), loff = buf.readUInt32LE(p + 42);
    const name = buf.slice(p + 46, p + 46 + nlen).toString('utf8');
    p += 46 + nlen + xlen + clen;
    if (!want(name)) continue;
    const lnlen = buf.readUInt16LE(loff + 26), lxlen = buf.readUInt16LE(loff + 28);
    const data = buf.slice(loff + 30 + lnlen + lxlen, loff + 30 + lnlen + lxlen + csize);
    try { out[name] = method === 8 ? zlib.inflateRawSync(data) : method === 0 ? data : null; } catch (e) { /* skip */ }
  }
  return out;
}
const xmlText = (x) => String(x).replace(/<w:tab\/>|<a:tab\/>/g, ' ').replace(/<\/(w:p|a:p|row|si)>/g, '\n').replace(/<[^>]+>/g, ' ')
  .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&#(\d+);/g, (m, c) => String.fromCharCode(+c)).replace(/[ \t]+/g, ' ');
function officeText(buf, ext) {
  const files = unzipEntries(buf, (n) =>
    (ext === '.docx' && /^word\/(document|header\d*|footer\d*|footnotes)\.xml$/.test(n)) ||
    (ext === '.xlsx' && (/^xl\/sharedStrings\.xml$/.test(n) || /^xl\/worksheets\/sheet\d+\.xml$/.test(n))) ||
    (ext === '.pptx' && /^ppt\/slides\/slide\d+\.xml$/.test(n)));
  let t = '';
  for (const [name, data] of Object.entries(files)) {
    if (!data) continue;
    let x = data.toString('utf8');
    if (ext === '.xlsx' && /worksheets/.test(name)) x = (x.match(/<v>[^<]*<\/v>|<t[^>]*>[^<]*<\/t>/g) || []).join(' '); // numbers + inline strings
    t += xmlText(x) + '\n';
    if (t.length > MAX_TEXT) break;
  }
  return t;
}

// ---------------------------------------------------------- PDF (text-based PDFs; scanned PDFs have no text layer)
function pdfText(buf) {
  const s = buf.toString('latin1');
  let out = '';
  const re = /<<([\s\S]{0,600}?)>>\s*stream\r?\n/g;
  let m;
  while ((m = re.exec(s)) && out.length < MAX_TEXT) {
    const dict = m[1];
    const start = m.index + m[0].length;
    const lenM = dict.match(/\/Length\s+(\d+)(?!\s+\d+\s+R)/);
    let end = lenM ? start + +lenM[1] : s.indexOf('endstream', start);
    if (end < start || end > s.length) end = s.indexOf('endstream', start);
    if (end < 0) break;
    if (/\/Subtype\s*\/Image|\/Type\s*\/XObject[\s\S]*\/Image|\/FontFile/.test(dict)) { re.lastIndex = end; continue; }
    let data = buf.slice(start, end);
    if (/\/ASCII85Decode|\/A85/.test(dict)) { try { data = a85(data.toString('latin1')); } catch (e) { re.lastIndex = end; continue; } }
    if (/\/ASCIIHexDecode|\/AHx/.test(dict)) { data = Buffer.from(data.toString('latin1').replace(/[^0-9a-fA-F]/g, ''), 'hex'); }
    if (/\/FlateDecode/.test(dict)) { try { data = zlib.inflateSync(data); } catch (e) { try { data = zlib.inflateRawSync(data.slice(2)); } catch (e2) { re.lastIndex = end; continue; } } }
    else if (/\/(DCTDecode|JPXDecode|CCITTFaxDecode|JBIG2Decode|LZWDecode|RunLengthDecode)/.test(dict)) { re.lastIndex = end; continue; }
    out += contentText(data.toString('latin1'));
    re.lastIndex = end;
  }
  return out;
}
function a85(str) {
  const s = str.replace(/\s+/g, '').replace(/^<~/, '').replace(/~>.*$/, '');
  const out = [];
  let i = 0;
  while (i < s.length) {
    if (s[i] === 'z') { out.push(0, 0, 0, 0); i++; continue; }
    const chunk = s.slice(i, i + 5); i += 5;
    const pad = 5 - chunk.length;
    let v = 0;
    for (const ch of (chunk + 'uuuu').slice(0, 5)) v = v * 85 + (ch.charCodeAt(0) - 33);
    const bytes = [(v >>> 24) & 255, (v >>> 16) & 255, (v >>> 8) & 255, v & 255];
    out.push(...bytes.slice(0, 4 - pad));
  }
  return Buffer.from(out);
}
function pdfStr(raw) {
  return raw.replace(/\\([nrtbf()\\]|[0-7]{1,3})/g, (mm, c) => ({ n: '\n', r: '', t: ' ', b: '', f: '', '(': '(', ')': ')', '\\': '\\' }[c] ?? String.fromCharCode(parseInt(c, 8))));
}
function contentText(c) {
  if (!/\b(Tj|TJ|')\b/.test(c)) return '';
  let t = '';
  const re = /\((?:\\.|[^\\)])*\)\s*(?:Tj|')|\[((?:\((?:\\.|[^\\)])*\)|<[0-9a-fA-F\s]*>|[^\]])*)\]\s*TJ|<([0-9a-fA-F\s]+)>\s*Tj|(T\*|Td|TD|ET)\b/g;
  let m;
  while ((m = re.exec(c))) {
    if (m[3]) { t += /ET|T\*|TD/.test(m[3]) ? '\n' : ' '; continue; }
    if (m[2]) { t += hexStr(m[2]); continue; }
    if (m[1] != null) {
      for (const part of m[1].match(/\((?:\\.|[^\\)])*\)|<[0-9a-fA-F\s]*>|-?\d+(?:\.\d+)?/g) || []) {
        if (part[0] === '(') t += pdfStr(part.slice(1, -1));
        else if (part[0] === '<') t += hexStr(part.slice(1, -1));
        else if (+part < -200) t += ' ';
      }
      continue;
    }
    const s = m[0].match(/^\(((?:\\.|[^\\)])*)\)/);
    if (s) t += pdfStr(s[1]);
  }
  return t.replace(/[^\x20-\x7E\n -ɏ]/g, ' ').replace(/[ ]{2,}/g, ' ');
}
function hexStr(h) {
  h = h.replace(/\s+/g, '');
  if (h.length % 4 === 0 && /^00/.test(h)) { let o = ''; for (let i = 0; i < h.length; i += 4) o += String.fromCharCode(parseInt(h.substr(i, 4), 16)); return o; }
  let o = ''; for (let i = 0; i < h.length; i += 2) o += String.fromCharCode(parseInt(h.substr(i, 2), 16)); return o;
}

function extract(file) {
  const ext = path.extname(file).toLowerCase();
  const st = fs.statSync(file);
  if (st.size > MAX_FILE) return '';
  const buf = fs.readFileSync(file);
  if (ext === '.pdf') return pdfText(buf).slice(0, MAX_TEXT);
  if (ext === '.docx' || ext === '.xlsx' || ext === '.pptx') return officeText(buf, ext).slice(0, MAX_TEXT);
  let t = buf.toString('utf8');
  if (ext === '.html' || ext === '.htm' || ext === '.xml') t = xmlText(t);
  return t.slice(0, MAX_TEXT);
}

// ---------------------------------------------------------- index
const SYN = { boe: 'bill of entry', sb: 'shipping bill', inv: 'invoice', po: 'purchase order', bl: 'bill of lading', awb: 'airway bill', coo: 'certificate of origin', moowr: 'manufacture and other operations in warehouse' };
class DocIndex extends EventEmitter {
  constructor() { super(); this.docs = new Map(); this.file = null; this.busy = false; this.progress = { done: 0, total: 0 }; }
  init(dataDir) {
    this.file = path.join(dataDir, 'doc-index.json');
    try { const j = JSON.parse(fs.readFileSync(this.file, 'utf8')); for (const d of j.docs || []) this.docs.set(d.p, d); } catch (e) {}
  }
  save() { try { fs.writeFileSync(this.file, JSON.stringify({ v: 1, docs: [...this.docs.values()] })); } catch (e) { console.warn('index save', e.message); } }
  stats() { return { files: this.docs.size, busy: this.busy, progress: this.progress, lastRun: this.lastRun || null }; }

  async rebuild(folders) {
    if (this.busy) return this.stats();
    this.busy = true;
    const list = [];
    const walk = (dir, depth) => {
      if (depth > 12 || list.length >= MAX_FILES) return;
      let ents; try { ents = fs.readdirSync(dir, { withFileTypes: true }); } catch (e) { return; }
      for (const e of ents) {
        const p = path.join(dir, e.name);
        if (e.isDirectory()) { if (!SKIP_DIRS.test(e.name) && !e.name.startsWith('.')) walk(p, depth + 1); }
        else if (EXT.has(path.extname(e.name).toLowerCase()) && !e.name.startsWith('~$')) list.push(p);
      }
    };
    for (const f of folders || []) walk(f, 0);
    this.progress = { done: 0, total: list.length };
    const seen = new Set(list);
    for (const k of [...this.docs.keys()]) if (!seen.has(k) || !(folders || []).some((f) => k.startsWith(f))) this.docs.delete(k);
    for (const p of list) {
      try {
        const st = fs.statSync(p);
        const old = this.docs.get(p);
        if (!old || old.m !== +st.mtime || old.s !== st.size) {
          let text = '';
          try { text = extract(p); } catch (e) {}
          this.docs.set(p, { p, n: path.basename(p), m: +st.mtime, s: st.size, t: text.replace(/\s+/g, ' ').trim() });
        }
      } catch (e) {}
      this.progress.done++;
      if (this.progress.done % 25 === 0) { this.emit('progress', this.progress); await new Promise((r) => setImmediate(r)); }
    }
    this.save();
    this.busy = false; this.lastRun = Date.now();
    this.emit('progress', this.progress);
    return this.stats();
  }

  search(query, limit = 20) {
    const q = String(query || '').toLowerCase().trim();
    if (!q) return [];
    const terms = q.split(/\s+/).filter((w) => w.length > 1);
    const res = [];
    for (const d of this.docs.values()) {
      const name = d.n.toLowerCase(), text = (d.t || '').toLowerCase();
      let score = 0, hits = 0;
      for (const w of terms) {
        const alt = SYN[w];
        const inName = name.includes(w) || (alt && name.includes(alt)), inText = text.includes(w) || (alt && text.includes(alt));
        if (inName || inText) hits++;
        if (inName) score += 6;
        if (inText) score += Math.min(5, text.split(w).length - 1);
      }
      if (!hits || hits < Math.ceil(terms.length * 0.6)) continue;
      if (name.includes(q)) score += 10;
      if (text.includes(q)) score += 8;
      score += hits * 3 + Math.max(0, 3 - (Date.now() - d.m) / (30 * 864e5)); // fresher files a bit higher
      let snippet = '';
      const i = text.indexOf(terms.find((w) => text.includes(w)) || '\u0000');
      if (i >= 0) snippet = (i > 60 ? '…' : '') + d.t.slice(Math.max(0, i - 60), i + 140).trim() + '…';
      res.push({ path: d.p, name: d.n, modified: d.m, size: d.s, score, snippet });
    }
    return res.sort((a, b) => b.score - a.score).slice(0, limit);
  }
}

module.exports = new DocIndex();
module.exports.extract = extract;
module.exports._test = { officeText, pdfText, unzipEntries };
