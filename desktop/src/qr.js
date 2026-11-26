// Minimal, dependency-free QR Code encoder (byte mode, versions 1-10, error-correction level M).
// Enough for URLs, Wi-Fi strings, secrets and short vCards (~210 bytes). Returns a module matrix.
// Implemented from the ISO/IEC 18004 spec. If the payload is too long it throws.

// ---- Galois field GF(256) with primitive polynomial 0x11D
const EXP = new Array(256), LOG = new Array(256);
(function () { let x = 1; for (let i = 0; i < 255; i++) { EXP[i] = x; LOG[x] = i; x <<= 1; if (x & 0x100) x ^= 0x11D; } EXP[255] = EXP[0]; })();
const gmul = (a, b) => (a === 0 || b === 0) ? 0 : EXP[(LOG[a] + LOG[b]) % 255];

function rsGenerator(n) {
  let poly = [1];                                  // descending degree: poly[0] = coefficient of x^deg
  for (let i = 0; i < n; i++) {
    const next = new Array(poly.length + 1).fill(0);
    for (let j = 0; j < poly.length; j++) {
      next[j] ^= poly[j];                          // x * poly
      next[j + 1] ^= gmul(poly[j], EXP[i]);        // alpha^i * poly
    }
    poly = next;
  }
  return poly;                                     // length n+1, poly[0] === 1
}
function rsEncode(data, ecLen) {
  const gen = rsGenerator(ecLen);                  // standard polynomial long division
  const res = data.concat(new Array(ecLen).fill(0));
  for (let i = 0; i < data.length; i++) {
    const coef = res[i];
    if (coef !== 0) for (let j = 0; j < gen.length; j++) res[i + j] ^= gmul(gen[j], coef);
  }
  return res.slice(data.length);
}

// ---- per-version data: [dataCodewords, ecPerBlock, [g1Blocks,g1Data], [g2Blocks,g2Data], remainderBits, [alignment centers]]
const V = {
  1: [16, 10, [1, 16], null, 0, []],
  2: [28, 16, [1, 28], null, 7, [6, 18]],
  3: [44, 26, [1, 44], null, 7, [6, 22]],
  4: [64, 18, [2, 32], null, 7, [6, 26]],
  5: [86, 24, [2, 43], null, 7, [6, 30]],
  6: [108, 16, [4, 27], null, 7, [6, 34]],
  7: [124, 18, [4, 31], null, 0, [6, 22, 38]],
  8: [154, 22, [2, 38], [2, 39], 0, [6, 24, 42]],
  9: [182, 22, [3, 36], [2, 37], 0, [6, 26, 46]],
  10: [216, 26, [4, 43], [1, 44], 0, [6, 28, 50]]
};

function bytesOf(str) { return Array.from(Buffer.from(String(str), 'utf8')); }

function pickVersion(len) {
  for (let v = 1; v <= 10; v++) {
    const dataCW = V[v][0];
    const countBits = v < 10 ? 8 : 16;
    const cap = Math.floor((dataCW * 8 - 4 - countBits) / 8);
    if (len <= cap) return v;
  }
  return null;
}

function buildCodewords(bytes, v) {
  const [dataCW, , , , ] = V[v];
  const countBits = v < 10 ? 8 : 16;
  const bits = [];
  const push = (val, n) => { for (let i = n - 1; i >= 0; i--) bits.push((val >> i) & 1); };
  push(0b0100, 4);                 // byte mode
  push(bytes.length, countBits);
  for (const b of bytes) push(b, 8);
  const cap = dataCW * 8;
  for (let i = 0; i < 4 && bits.length < cap; i++) bits.push(0);   // terminator
  while (bits.length % 8 !== 0) bits.push(0);
  const codewords = [];
  for (let i = 0; i < bits.length; i += 8) { let b = 0; for (let j = 0; j < 8; j++) b = (b << 1) | bits[i + j]; codewords.push(b); }
  const pad = [0xEC, 0x11];
  for (let i = 0; codewords.length < dataCW; i++) codewords.push(pad[i % 2]);
  return codewords;
}

function interleave(codewords, v) {
  const [, ecLen, g1, g2] = V[v];
  const groups = [];
  let idx = 0;
  const add = (blocks, dataLen) => { for (let b = 0; b < blocks; b++) { const d = codewords.slice(idx, idx + dataLen); idx += dataLen; groups.push({ data: d, ec: rsEncode(d, ecLen) }); } };
  add(g1[0], g1[1]);
  if (g2) add(g2[0], g2[1]);
  const maxData = Math.max(...groups.map((g) => g.data.length));
  const out = [];
  for (let i = 0; i < maxData; i++) for (const g of groups) if (i < g.data.length) out.push(g.data[i]);
  for (let i = 0; i < ecLen; i++) for (const g of groups) out.push(g.ec[i]);
  return out;
}

// ---- matrix placement
function makeMatrix(v) { const n = 17 + 4 * v; const m = Array.from({ length: n }, () => new Array(n).fill(null)); return m; }
function placeFinder(m, r, c) {
  for (let i = -1; i <= 7; i++) for (let j = -1; j <= 7; j++) {
    const rr = r + i, cc = c + j; if (rr < 0 || cc < 0 || rr >= m.length || cc >= m.length) continue;
    const on = (i >= 0 && i <= 6 && (j === 0 || j === 6)) || (j >= 0 && j <= 6 && (i === 0 || i === 6)) || (i >= 2 && i <= 4 && j >= 2 && j <= 4);
    m[rr][cc] = on ? 1 : 0;
  }
}
function placeAlignment(m, v) {
  const centers = V[v][5]; if (!centers.length) return;
  for (const r of centers) for (const c of centers) {
    if ((r <= 8 && c <= 8) || (r <= 8 && c >= m.length - 9) || (r >= m.length - 9 && c <= 8)) continue;
    for (let i = -2; i <= 2; i++) for (let j = -2; j <= 2; j++) m[r + i][c + j] = (Math.max(Math.abs(i), Math.abs(j)) !== 1) ? 1 : 0;
  }
}
function reserveFormat(m) {
  const n = m.length;
  for (let i = 0; i <= 8; i++) { if (m[8][i] === null) m[8][i] = 2; if (m[i][8] === null) m[i][8] = 2; }
  for (let i = 0; i < 8; i++) { if (m[8][n - 1 - i] === null) m[8][n - 1 - i] = 2; if (m[n - 1 - i][8] === null) m[n - 1 - i][8] = 2; }
  m[n - 8][8] = 1; // dark module
}
function reserveVersion(m, v) {
  if (v < 7) return;
  const n = m.length;
  for (let i = 0; i < 18; i++) { const r = Math.floor(i / 3), c = i % 3 + n - 11; if (m[r][c] === null) m[r][c] = 2; if (m[c][r] === null) m[c][r] = 2; }
}
function placeTiming(m) { const n = m.length; for (let i = 8; i < n - 8; i++) { if (m[6][i] === null) m[6][i] = i % 2 === 0 ? 1 : 0; if (m[i][6] === null) m[i][6] = i % 2 === 0 ? 1 : 0; } }

function placeData(m, bits) {
  const n = m.length; let bi = 0, up = true;
  for (let col = n - 1; col > 0; col -= 2) {
    if (col === 6) col--;
    for (let k = 0; k < n; k++) {
      const row = up ? n - 1 - k : k;
      for (let c = 0; c < 2; c++) {
        const cc = col - c;
        if (m[row][cc] === null) { m[row][cc] = bi < bits.length ? bits[bi] : 0; bi++; }
      }
    }
    up = !up;
  }
}

const MASKS = [
  (r, c) => (r + c) % 2 === 0,
  (r, c) => r % 2 === 0,
  (r, c) => c % 3 === 0,
  (r, c) => (r + c) % 3 === 0,
  (r, c) => (Math.floor(r / 2) + Math.floor(c / 3)) % 2 === 0,
  (r, c) => (r * c) % 2 + (r * c) % 3 === 0,
  (r, c) => (((r * c) % 2) + ((r * c) % 3)) % 2 === 0,
  (r, c) => (((r + c) % 2) + ((r * c) % 3)) % 2 === 0
];
function applyMask(m, reserved, maskFn) {
  const out = m.map((row) => row.slice());
  for (let r = 0; r < m.length; r++) for (let c = 0; c < m.length; c++) if (!reserved[r][c] && maskFn(r, c)) out[r][c] ^= 1;
  return out;
}
function penalty(m) {
  const n = m.length; let p = 0;
  for (let r = 0; r < n; r++) { let run = 1; for (let c = 1; c < n; c++) { if (m[r][c] === m[r][c - 1]) { run++; if (run === 5) p += 3; else if (run > 5) p++; } else run = 1; } }
  for (let c = 0; c < n; c++) { let run = 1; for (let r = 1; r < n; r++) { if (m[r][c] === m[r - 1][c]) { run++; if (run === 5) p += 3; else if (run > 5) p++; } else run = 1; } }
  for (let r = 0; r < n - 1; r++) for (let c = 0; c < n - 1; c++) { const v = m[r][c]; if (v === m[r][c + 1] && v === m[r + 1][c] && v === m[r + 1][c + 1]) p += 3; }
  let dark = 0; for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) dark += m[r][c];
  const ratio = Math.abs(Math.round(dark * 100 / (n * n) / 5) * 5 - 50) / 5; p += ratio * 10;
  return p;
}

// BCH polynomial degree (position of highest set bit)
function bchDigit(d) { let n = 0; while (d !== 0) { n++; d >>>= 1; } return n; }
// BCH 15-bit format info (EC level M = 00)
function formatBits(maskIdx) {
  const G = 0b10100110111;
  const data = (0b00 << 3) | maskIdx;
  let d = data << 10;
  while (bchDigit(d) - bchDigit(G) >= 0) d ^= (G << (bchDigit(d) - bchDigit(G)));
  return ((data << 10) | d) ^ 0b101010000010010;
}
function placeFormat(m, maskIdx) {
  const n = m.length, f = formatBits(maskIdx);
  for (let i = 0; i < 15; i++) {
    const b = (f >> i) & 1;
    // vertical copy (left of / below the top-left finder, bottom-left)
    if (i < 6) m[i][8] = b;
    else if (i < 8) m[i + 1][8] = b;
    else m[n - 15 + i][8] = b;
    // horizontal copy (below top-left finder, top-right)
    if (i < 8) m[8][n - 1 - i] = b;
    else if (i === 8) m[8][7] = b;
    else m[8][14 - i] = b;
  }
  m[n - 8][8] = 1; // dark module
}
// BCH 18-bit version info (v7+)
function versionBits(v) { const G = 0b1111100100101; let d = v << 12; while (bchDigit(d) - bchDigit(G) >= 0) d ^= (G << (bchDigit(d) - bchDigit(G))); return (v << 12) | d; }
function placeVersion(m, v) {
  if (v < 7) return; const n = m.length, bits = versionBits(v);
  for (let i = 0; i < 18; i++) { const b = (bits >> i) & 1; const r = Math.floor(i / 3), c = i % 3; m[n - 11 + c][r] = b; m[r][n - 11 + c] = b; }
}

function encode(text, forceMask) {
  const bytes = bytesOf(text);
  const v = pickVersion(bytes.length);
  if (!v) throw new Error('Text is too long for an offline QR (max ~210 bytes). Shorten it.');
  const codewords = interleave(buildCodewords(bytes, v), v);
  const bits = [];
  for (const cw of codewords) for (let i = 7; i >= 0; i--) bits.push((cw >> i) & 1);
  for (let i = 0; i < V[v][4]; i++) bits.push(0);          // remainder bits

  const base = makeMatrix(v);
  placeFinder(base, 0, 0); placeFinder(base, 0, base.length - 7); placeFinder(base, base.length - 7, 0);
  // separators
  const n = base.length;
  for (let i = 0; i < 8; i++) { base[7][i] ??= 0; base[i][7] ??= 0; base[7][n - 1 - i] ??= 0; base[i][n - 8] ??= 0; base[n - 8][i] ??= 0; base[n - 1 - i][7] ??= 0; }
  placeAlignment(base, v);
  placeTiming(base);
  reserveFormat(base);
  reserveVersion(base, v);
  const reserved = base.map((row) => row.map((x) => x !== null));
  placeData(base, bits);

  let best = null, bestP = Infinity, bestMask = 0;
  for (let mi = 0; mi < 8; mi++) {
    if (forceMask != null && mi !== forceMask) continue;
    const masked = applyMask(base, reserved, MASKS[mi]);
    placeFormat(masked, mi); placeVersion(masked, v);
    const p = penalty(masked);
    if (p < bestP) { bestP = p; best = masked; bestMask = mi; }
  }
  return { matrix: best.map((row) => row.map((x) => x ? 1 : 0)), size: n, version: v, mask: bestMask, reserved };
}

// Render to an SVG string (quiet zone = 4 modules)
function svg(text, { scale = 6, margin = 4, dark = '#111', light = '#fff' } = {}) {
  const { matrix, size } = encode(text);
  const dim = (size + margin * 2) * scale;
  let rects = '';
  for (let r = 0; r < size; r++) for (let c = 0; c < size; c++) if (matrix[r][c]) rects += `<rect x="${(c + margin) * scale}" y="${(r + margin) * scale}" width="${scale}" height="${scale}"/>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${dim}" height="${dim}" viewBox="0 0 ${dim} ${dim}" shape-rendering="crispEdges"><rect width="${dim}" height="${dim}" fill="${light}"/><g fill="${dark}">${rects}</g></svg>`;
}

module.exports = { encode, svg, rsGenerator, rsEncode };
