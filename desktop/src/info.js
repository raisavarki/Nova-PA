// Instant answers: weather (Open-Meteo, free, no key), calculator, calendar facts, IP.
const os = require('os');

const WMO = {
  0: 'clear sky', 1: 'mainly clear', 2: 'partly cloudy', 3: 'overcast', 45: 'foggy', 48: 'freezing fog',
  51: 'light drizzle', 53: 'drizzle', 55: 'heavy drizzle', 56: 'freezing drizzle', 57: 'freezing drizzle',
  61: 'light rain', 63: 'rain', 65: 'heavy rain', 66: 'freezing rain', 67: 'freezing rain',
  71: 'light snow', 73: 'snow', 75: 'heavy snow', 77: 'snow grains',
  80: 'light showers', 81: 'showers', 82: 'heavy showers', 85: 'snow showers', 86: 'heavy snow showers',
  95: 'thunderstorm', 96: 'thunderstorm with hail', 99: 'severe thunderstorm with hail'
};

async function getJson(url, ms = 6000) {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), ms);
  try {
    const r = await fetch(url, { signal: ctl.signal, headers: { 'user-agent': 'NovaCompanion/2' } });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    return await r.json();
  } finally { clearTimeout(t); }
}

let ipLoc = null, ipLocAt = 0;
async function locate(city) {
  if (city) {
    const g = await getJson(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(city)}&count=1&language=en&format=json`);
    const r = g.results && g.results[0];
    if (!r) throw new Error(`I couldn't find a place called "${city}".`);
    return { lat: r.latitude, lon: r.longitude, name: [r.name, r.admin1, r.country_code].filter(Boolean).join(', ') };
  }
  if (ipLoc && Date.now() - ipLocAt < 6 * 3600000) return ipLoc;
  const tries = [
    async () => { const j = await getJson('https://ipapi.co/json/'); return { lat: j.latitude, lon: j.longitude, name: [j.city, j.region].filter(Boolean).join(', ') }; },
    async () => { const j = await getJson('https://get.geojs.io/v1/ip/geo.json'); return { lat: +j.latitude, lon: +j.longitude, name: [j.city, j.region].filter(Boolean).join(', ') }; },
    async () => { const j = await getJson('https://ipwho.is/'); return { lat: j.latitude, lon: j.longitude, name: [j.city, j.region].filter(Boolean).join(', ') }; }
  ];
  for (const f of tries) {
    try { const l = await f(); if (l.lat != null && !isNaN(l.lat)) { ipLoc = l; ipLocAt = Date.now(); return l; } } catch (e) {}
  }
  throw new Error('I couldn\'t detect your location. Set your city in Settings → General.');
}

async function weather({ city, day = 'today' } = {}, defaultCity = '') {
  const loc = await locate(city || defaultCity);
  const w = await getJson(`https://api.open-meteo.com/v1/forecast?latitude=${loc.lat}&longitude=${loc.lon}` +
    '&current=temperature_2m,apparent_temperature,relative_humidity_2m,weather_code,wind_speed_10m' +
    '&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max&timezone=auto&forecast_days=3');
  const where = loc.name || 'your area';
  if (day === 'tomorrow') {
    const d = w.daily;
    return `Tomorrow in ${where}: ${WMO[d.weather_code[1]] || 'mixed'}, ${Math.round(d.temperature_2m_min[1])}–${Math.round(d.temperature_2m_max[1])}°C, ${d.precipitation_probability_max[1] ?? 0}% chance of rain.`;
  }
  const c = w.current, d = w.daily;
  return `${where}: ${Math.round(c.temperature_2m)}°C, ${WMO[c.weather_code] || 'mixed'} (feels ${Math.round(c.apparent_temperature)}°C), humidity ${c.relative_humidity_2m}%, wind ${Math.round(c.wind_speed_10m)} km/h. Today ${Math.round(d.temperature_2m_min[0])}–${Math.round(d.temperature_2m_max[0])}°C, ${d.precipitation_probability_max[0] ?? 0}% chance of rain.`;
}

// Safe calculator: only digits/operators survive validation before evaluation.
function calc(expr) {
  let e = String(expr).toLowerCase()
    .replace(/,/g, '')
    .replace(/(\d+(?:\.\d+)?)\s*%\s*of\s*(\d+(?:\.\d+)?)/g, '($1/100*$2)')
    .replace(/(\d+(?:\.\d+)?)\s*percent of\s*(\d+(?:\.\d+)?)/g, '($1/100*$2)')
    .replace(/square root of\s*(\d+(?:\.\d+)?)|sqrt\s*\(?\s*(\d+(?:\.\d+)?)\s*\)?/g, (m, a, b) => `Math.sqrt(${a || b})`)
    .replace(/(\d)\s*x\s*(?=\d)/g, '$1*').replace(/\bplus\b/g, '+').replace(/\bminus\b/g, '-').replace(/\b(times|multiplied by|into|x)\b/g, '*')
    .replace(/\b(divided by|by|over)\b/g, '/').replace(/\bto the power of\b|\^/g, '**').replace(/×/g, '*').replace(/÷/g, '/')
    .replace(/\s+/g, '');
  const check = e.replace(/Math\.sqrt/g, '');
  if (!/^[\d+\-*/().]+$/.test(check) || !/\d/.test(check) || !/[+\-*/(]|Math/.test(e)) return null;
  try {
    // eslint-disable-next-line no-new-func
    const v = Function(`"use strict";return (${e})`)();
    if (typeof v !== 'number' || !isFinite(v)) return null;
    return Math.round(v * 1e8) / 1e8;
  } catch (err) { return null; }
}

function isoWeek(d = new Date()) {
  const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const day = t.getUTCDay() || 7;
  t.setUTCDate(t.getUTCDate() + 4 - day);
  const y0 = new Date(Date.UTC(t.getUTCFullYear(), 0, 1));
  return Math.ceil(((t - y0) / 86400000 + 1) / 7);
}

function localIp() {
  for (const list of Object.values(os.networkInterfaces())) {
    for (const n of list || []) if (n.family === 'IPv4' && !n.internal && !/^169\.254/.test(n.address)) return n.address;
  }
  return null;
}


// ---- World clock (offline, Intl)
const CITY_TZ = {
  london: 'Europe/London', uk: 'Europe/London', paris: 'Europe/Paris', berlin: 'Europe/Berlin', frankfurt: 'Europe/Berlin', amsterdam: 'Europe/Amsterdam',
  zurich: 'Europe/Zurich', madrid: 'Europe/Madrid', rome: 'Europe/Rome', moscow: 'Europe/Moscow', istanbul: 'Europe/Istanbul',
  dubai: 'Asia/Dubai', 'abu dhabi': 'Asia/Dubai', uae: 'Asia/Dubai', riyadh: 'Asia/Riyadh', doha: 'Asia/Qatar', muscat: 'Asia/Muscat',
  india: 'Asia/Kolkata', kolkata: 'Asia/Kolkata', mumbai: 'Asia/Kolkata', delhi: 'Asia/Kolkata', bangalore: 'Asia/Kolkata', bengaluru: 'Asia/Kolkata', kochi: 'Asia/Kolkata', chennai: 'Asia/Kolkata', ist: 'Asia/Kolkata',
  singapore: 'Asia/Singapore', 'kuala lumpur': 'Asia/Kuala_Lumpur', bangkok: 'Asia/Bangkok', jakarta: 'Asia/Jakarta', 'hong kong': 'Asia/Hong_Kong',
  shanghai: 'Asia/Shanghai', beijing: 'Asia/Shanghai', china: 'Asia/Shanghai', tokyo: 'Asia/Tokyo', japan: 'Asia/Tokyo', seoul: 'Asia/Seoul', manila: 'Asia/Manila',
  sydney: 'Australia/Sydney', melbourne: 'Australia/Melbourne', perth: 'Australia/Perth', auckland: 'Pacific/Auckland',
  'new york': 'America/New_York', nyc: 'America/New_York', boston: 'America/New_York', toronto: 'America/Toronto', chicago: 'America/Chicago', houston: 'America/Chicago',
  denver: 'America/Denver', 'los angeles': 'America/Los_Angeles', la: 'America/Los_Angeles', 'san francisco': 'America/Los_Angeles', seattle: 'America/Los_Angeles',
  'sao paulo': 'America/Sao_Paulo', 'mexico city': 'America/Mexico_City', johannesburg: 'Africa/Johannesburg', nairobi: 'Africa/Nairobi', cairo: 'Africa/Cairo', lagos: 'Africa/Lagos',
  dhaka: 'Asia/Dhaka', karachi: 'Asia/Karachi', colombo: 'Asia/Colombo', kathmandu: 'Asia/Kathmandu', utc: 'UTC', gmt: 'UTC'
};
function tzFor(place) {
  const p = String(place || '').toLowerCase().replace(/[^a-z ]/g, '').trim();
  if (CITY_TZ[p]) return CITY_TZ[p];
  try { Intl.DateTimeFormat('en', { timeZone: place }); return place; } catch (e) { return null; }
}
function timeIn(place) {
  const tz = tzFor(place);
  if (!tz) return null;
  const now = new Date();
  const t = now.toLocaleTimeString('en-IN', { timeZone: tz, hour: 'numeric', minute: '2-digit' });
  const day = now.toLocaleDateString('en-IN', { timeZone: tz, weekday: 'long' });
  const localDay = now.toLocaleDateString('en-IN', { weekday: 'long' });
  const off = (() => { const a = new Date(now.toLocaleString('en-US', { timeZone: tz })), b = new Date(now.toLocaleString('en-US')); const h = Math.round((a - b) / 360000) / 10; return h === 0 ? 'same as you' : `${h > 0 ? '+' : ''}${h}h from you`; })();
  return { tz, text: `${t}${day !== localDay ? ' (' + day + ')' : ''} · ${off}` };
}

// ---- Unit conversion (offline)
const UNITS = {
  length: { m: 1, meter: 1, meters: 1, metre: 1, km: 1000, kilometer: 1000, kilometers: 1000, cm: 0.01, mm: 0.001, mi: 1609.344, mile: 1609.344, miles: 1609.344, ft: 0.3048, foot: 0.3048, feet: 0.3048, in: 0.0254, inch: 0.0254, inches: 0.0254, yd: 0.9144, yard: 0.9144, yards: 0.9144 },
  mass: { kg: 1, kilo: 1, kilos: 1, kilogram: 1, kilograms: 1, g: 0.001, gram: 0.001, grams: 0.001, mg: 1e-6, lb: 0.45359237, lbs: 0.45359237, pound: 0.45359237, pounds: 0.45359237, oz: 0.028349523, ounce: 0.028349523, ounces: 0.028349523, ton: 1000, tonne: 1000, tonnes: 1000, mt: 1000 },
  volume: { l: 1, liter: 1, liters: 1, litre: 1, litres: 1, ml: 0.001, gal: 3.785411784, gallon: 3.785411784, gallons: 3.785411784, cup: 0.2365882, cups: 0.2365882 },
  data: { b: 1, byte: 1, bytes: 1, kb: 1024, mb: 1048576, gb: 1073741824, tb: 1099511627776 },
  speed: { kmh: 1, kph: 1, 'km/h': 1, mph: 1.609344, 'm/s': 3.6, mps: 3.6, knots: 1.852, knot: 1.852 },
  area: { sqm: 1, 'sq m': 1, m2: 1, sqft: 0.09290304, 'sq ft': 0.09290304, acre: 4046.8564224, acres: 4046.8564224, hectare: 10000, hectares: 10000, ha: 10000, sqkm: 1e6 }
};
const TEMP = { c: 'c', celsius: 'c', '°c': 'c', f: 'f', fahrenheit: 'f', '°f': 'f', k: 'k', kelvin: 'k' };
function convertUnits(n, from, to) {
  from = from.toLowerCase(); to = to.toLowerCase();
  if (TEMP[from] && TEMP[to]) {
    const a = TEMP[from], b = TEMP[to];
    const c = a === 'c' ? n : a === 'f' ? (n - 32) * 5 / 9 : n - 273.15;
    const out = b === 'c' ? c : b === 'f' ? c * 9 / 5 + 32 : c + 273.15;
    return { value: Math.round(out * 100) / 100, unit: '°' + b.toUpperCase() };
  }
  for (const grp of Object.values(UNITS)) if (grp[from] && grp[to]) return { value: Math.round((n * grp[from] / grp[to]) * 10000) / 10000, unit: to };
  return null;
}
let fxCache = { base: null, at: 0, rates: null };
async function convertCurrency(n, from, to) {
  from = from.toUpperCase(); to = to.toUpperCase();
  if (!(fxCache.base === from && Date.now() - fxCache.at < 6 * 3600000)) {
    let rates = null;
    try { const j = await getJson(`https://open.er-api.com/v6/latest/${from}`); if (j && j.rates) rates = j.rates; } catch (e) {}
    if (!rates) { try { const j = await getJson(`https://api.frankfurter.app/latest?from=${from}`); if (j && j.rates) { rates = j.rates; rates[from] = 1; } } catch (e) {} }
    if (!rates) throw new Error("Couldn't fetch exchange rates (offline?).");
    fxCache = { base: from, at: Date.now(), rates };
  }
  const r = fxCache.rates[to];
  if (!r) throw new Error(`Unknown currency ${to}.`);
  return { value: Math.round(n * r * 100) / 100, rate: r };
}
const CUR = { usd: 'USD', dollar: 'USD', dollars: 'USD', '$': 'USD', inr: 'INR', rupee: 'INR', rupees: 'INR', rs: 'INR', '₹': 'INR', eur: 'EUR', euro: 'EUR', euros: 'EUR', gbp: 'GBP', pound: 'GBP', pounds: 'GBP', aed: 'AED', dirham: 'AED', dirhams: 'AED', sgd: 'SGD', jpy: 'JPY', yen: 'JPY', cny: 'CNY', yuan: 'CNY', aud: 'AUD', cad: 'CAD', chf: 'CHF', sar: 'SAR', qar: 'QAR', myr: 'MYR', thb: 'THB', krw: 'KRW', zar: 'ZAR', nzd: 'NZD', hkd: 'HKD', bdt: 'BDT', lkr: 'LKR', npr: 'NPR' };
function currencyCode(x) { const k = String(x || '').toLowerCase(); return CUR[k] || (/^[a-z]{3}$/i.test(k) && !UNITS.length[k] && !UNITS.mass[k] ? k.toUpperCase() : null); }

function password(len = 16) {
  const sets = ['ABCDEFGHJKLMNPQRSTUVWXYZ', 'abcdefghijkmnopqrstuvwxyz', '23456789', '!@#$%^&*-_=+?'];
  const all = sets.join('');
  const crypto = require('crypto');
  const pick = (s) => s[crypto.randomInt(s.length)];
  const out = sets.map(pick);
  while (out.length < len) out.push(pick(all));
  for (let i = out.length - 1; i > 0; i--) { const j = crypto.randomInt(i + 1); [out[i], out[j]] = [out[j], out[i]]; }
  return out.join('');
}

module.exports = { weather, calc, isoWeek, localIp, timeIn, tzFor, convertUnits, convertCurrency, currencyCode, password, CITY_TZ };
