// Natural-language date/time parsing for reminders, alarms and task due dates.
// parseWhen("call Vivek tomorrow at 4:30 pm") -> { at: Date, repeat: null, rest: "call Vivek", found: true }

const DOW = { sunday: 0, sun: 0, monday: 1, mon: 1, tuesday: 2, tue: 2, tues: 2, wednesday: 3, wed: 3, thursday: 4, thu: 4, thur: 4, thurs: 4, friday: 5, fri: 5, saturday: 6, sat: 6 };
const MON = { january: 0, jan: 0, february: 1, feb: 1, march: 2, mar: 2, april: 3, apr: 3, may: 4, june: 5, jun: 5, july: 6, jul: 6, august: 7, aug: 7, september: 8, sep: 8, sept: 8, october: 9, oct: 9, november: 10, nov: 10, december: 11, dec: 11 };
const UNIT = { s: 1000, sec: 1000, secs: 1000, second: 1000, seconds: 1000, m: 60000, min: 60000, mins: 60000, minute: 60000, minutes: 60000, h: 3600000, hr: 3600000, hrs: 3600000, hour: 3600000, hours: 3600000, d: 86400000, day: 86400000, days: 86400000, week: 604800000, weeks: 604800000 };
const DOW_RE = '(sunday|sun|monday|mon|tuesday|tues|tue|wednesday|wed|thursday|thurs|thur|thu|friday|fri|saturday|sat)';
const MON_RE = '(january|jan|february|feb|march|mar|april|apr|may|june|jun|july|jul|august|aug|september|sept|sep|october|oct|november|nov|december|dec)';
const NUMWORD = { a: 1, an: 1, one: 1, two: 2, three: 3, four: 4, five: 5, ten: 10, fifteen: 15, twenty: 20, thirty: 30, half: 0.5 };

function nextOccurrence(at, repeat, now = Date.now()) {
  const d = new Date(at);
  if (!repeat) return d;
  let guard = 0;
  while (d.getTime() <= now && guard++ < 5000) step(d, repeat);
  return d;
}
function intervalMin(repeat) { const m = /^every:(\d+)$/.exec(String(repeat || '')); return m ? +m[1] : 0; }
function step(d, repeat) {
  const iv = intervalMin(repeat);
  if (iv) { d.setTime(d.getTime() + iv * 60000); return d; }
  switch (repeat) {
    case 'hourly': d.setHours(d.getHours() + 1); break;
    case 'lastday': d.setDate(1); d.setMonth(d.getMonth() + 2); d.setDate(0); break;
    case 'daily': d.setDate(d.getDate() + 1); break;
    case 'weekdays': do { d.setDate(d.getDate() + 1); } while (d.getDay() === 0 || d.getDay() === 6); break;
    case 'weekly': d.setDate(d.getDate() + 7); break;
    case 'monthly': d.setMonth(d.getMonth() + 1); break;
    case 'yearly': d.setFullYear(d.getFullYear() + 1); break;
    default: d.setDate(d.getDate() + 1);
  }
  return d;
}

function parseWhen(input, now = new Date()) {
  let s = ' ' + String(input || '').replace(/\b(\d{1,2})\s*o['’]?\s?clock\b/gi, 'at $1').replace(/\bat\s+at\b/gi, 'at') + ' ';
  let m;
  let date = null;          // Date (day only)
  let time = null;          // {h, min, ampm}
  let repeat = null;
  let inMs = null;
  let found = false;
  const cut = (mm) => { s = s.replace(mm[0], ' '); found = true; };

  // relative: in 10 minutes / in 2 hours / in half an hour / after 5 min
  if ((m = s.match(/\s(?:in|after)\s+(\d+(?:\.\d+)?|an?|one|two|three|four|five|ten|fifteen|twenty|thirty|half an?)\s*(seconds?|secs?|s|minutes?|mins?|m|hours?|hrs?|h|days?|d|weeks?)\b/i))) {
    const nRaw = m[1].toLowerCase();
    const n = /^half/.test(nRaw) ? 0.5 : NUMWORD[nRaw] != null ? NUMWORD[nRaw] : parseFloat(nRaw);
    inMs = n * UNIT[m[2].toLowerCase()];
    cut(m);
  }

  // recurrence
  if ((m = s.match(/\s(?:every|each)\s+(\d+|two|three|four|five|ten|fifteen|twenty|thirty|half an?)\s*(minutes?|mins?|m|hours?|hrs?|h)\b/i))) {
    const nRaw = m[1].toLowerCase(); const n = /^half/.test(nRaw) ? 0.5 : NUMWORD[nRaw] != null ? NUMWORD[nRaw] : +nRaw;
    const mins = Math.round(n * (/^h/i.test(m[2]) ? 60 : 1));
    repeat = mins === 60 ? 'hourly' : 'every:' + Math.max(5, mins); cut(m);
  }
  else if ((m = s.match(/\s(?:on\s+)?(?:every\s+|each\s+)?(?:the\s+)?(?:last day of (?:the |every |each )?month|month[- ]end|end of (?:the |every )?month)\b/i))) {
    const d = new Date(now.getFullYear(), now.getMonth() + 1, 0); if (d < startOfDay(now)) d.setMonth(d.getMonth() + 2, 0);
    date = d; if (/every|each/i.test(m[0])) repeat = 'lastday'; cut(m);
  }
  else if ((m = s.match(/\s(every\s*day|everyday|daily|each day)\b/i))) { repeat = 'daily'; cut(m); }
  else if ((m = s.match(/\s(every\s*weekday|weekdays|on weekdays|every working day|mon(?:day)?\s*(?:to|-)\s*fri(?:day)?)\b/i))) { repeat = 'weekdays'; cut(m); }
  else if ((m = s.match(new RegExp(`\\s(?:every|each)\\s+${DOW_RE}\\b`, 'i')))) { repeat = 'weekly'; date = nextDow(now, DOW[m[1].toLowerCase()], true); cut(m); }
  else if ((m = s.match(/\s(every\s*week|weekly)\b/i))) { repeat = 'weekly'; cut(m); }
  else if ((m = s.match(/\s(every\s*month|monthly)\b/i))) { repeat = 'monthly'; cut(m); }
  else if ((m = s.match(/\s(every\s*year|yearly|annually)\b/i))) { repeat = 'yearly'; cut(m); }
  else if ((m = s.match(/\s(every\s*hour|hourly)\b/i))) { repeat = 'hourly'; cut(m); }
  else if ((m = s.match(/\severy\s+(morning|evening|night)\b/i))) { repeat = 'daily'; time = { h: { morning: 9, evening: 18, night: 21 }[m[1].toLowerCase()], min: 0 }; cut(m); }

  // time of day
  if ((m = s.match(/\s(?:at|@|by|around)?\s*(\d{1,2})(?:[:.](\d{2}))?\s*(am|pm|a\.m\.|p\.m\.)(?=\W)/i)) ||
      (m = s.match(/\s(?:at|@|by|around)\s+(\d{1,2})(?:[:.](\d{2}))?(?=\s|$|[,.!?])/i)) ||
      (m = s.match(/\s(\d{1,2})[:.](\d{2})(?=\s|$|[,.!?])/))) {
    const h = +m[1], mi = +(m[2] || 0);
    if (h <= 23 && mi <= 59) { time = { h, min: mi, ampm: m[3] ? m[3][0].toLowerCase() : null }; cut(m); }
  }
  if (!time && (m = s.match(/\s(?:at\s+)?(noon|midday|midnight)\b/i))) { time = { h: /mid(night)/i.test(m[1]) ? 0 : 12, min: 0, ampm: null, exact: true }; cut(m); }

  // day words
  if ((m = s.match(/\s(day after tomorrow)\b/i))) { date = addDays(now, 2); cut(m); }
  else if ((m = s.match(/\s(tomorrow|tmrw|tmr)(?:\s+(morning|afternoon|evening|night))?\b/i))) {
    date = addDays(now, 1); cut(m);
    if (m[2] && !time) time = partOfDay(m[2]);
  }
  else if ((m = s.match(/\s(tonight)\b/i))) { date = addDays(now, 0); if (!time) time = { h: 20, min: 0 }; else if (time.h < 12 && !time.ampm) time.h += 12; cut(m); }
  else if ((m = s.match(/\s(?:this|in the)\s+(morning|afternoon|evening)\b/i))) {
    if (!time) time = partOfDay(m[1]); else if (!time.ampm && time.h < 12 && !/morning/i.test(m[1])) time.h += 12;
    date = addDays(now, /morning/i.test(m[1]) && now.getHours() >= 12 ? 1 : 0); cut(m);
  }
  else if ((m = s.match(/\s(today)\b/i))) { date = addDays(now, 0); cut(m); }
  else if ((m = s.match(new RegExp(`\\s(?:on\\s+|this\\s+|next\\s+|coming\\s+|by\\s+)?${DOW_RE}\\b`, 'i')))) {
    const next = /next/i.test(m[0]);
    date = nextDow(now, DOW[m[1].toLowerCase()], !next);
    if (next && date - now < 7 * 86400000 && date.getDay() !== now.getDay()) { /* "next friday" = the coming friday */ }
    cut(m);
  }
  else if ((m = s.match(new RegExp(`\\s(?:on\\s+|by\\s+)?(\\d{1,2})(?:st|nd|rd|th)?(?:\\s+of)?\\s+${MON_RE}(?:\\s+(\\d{4}))?\\b`, 'i')))) {
    date = makeDate(now, +m[1], MON[m[2].toLowerCase()], m[3]); cut(m);
  }
  else if ((m = s.match(new RegExp(`\\s(?:on\\s+|by\\s+)?${MON_RE}\\s+(\\d{1,2})(?:st|nd|rd|th)?(?:,?\\s+(\\d{4}))?\\b`, 'i')))) {
    date = makeDate(now, +m[2], MON[m[1].toLowerCase()], m[3]); cut(m);
  }
  else if ((m = s.match(/\s(?:on\s+|by\s+)?(\d{1,2})[/-](\d{1,2})(?:[/-](\d{2,4}))?(?=\s)/))) {
    date = makeDate(now, +m[1], +m[2] - 1, m[3]); cut(m); // DD/MM (India)
  }
  else if ((m = s.match(/\s(?:on\s+the\s+|the\s+|on\s+|by\s+(?:the\s+)?)(\d{1,2})(?:st|nd|rd|th)\b/i))) {
    const d = new Date(now); d.setDate(+m[1]); if (d < startOfDay(now)) d.setMonth(d.getMonth() + 1);
    date = d; cut(m);
  }
  else if ((m = s.match(/\s(next week)\b/i))) { date = nextDow(now, 1, false); cut(m); }

  const rest = s.replace(/\s+/g, ' ').replace(/^\s*(to|about|that|for)\s+/i, '').replace(/\s+(to|on|at|by|for)\s*$/i, '').trim();

  if (inMs != null) return { at: new Date(now.getTime() + inMs), repeat, rest, found: true, hasTime: true };
  if (!found) return { at: null, repeat: null, rest: String(input || '').trim(), found: false };

  let at;
  if (date) {
    at = new Date(date);
    const t = time ? resolveTime(time, at, now, true) : { h: 9, min: 0 };
    at.setHours(t.h, t.min, 0, 0);
    if (!repeat && at <= now && sameDay(at, now) && !time) at.setHours(now.getHours() + 1, 0, 0, 0);
  } else if (time) {
    at = new Date(now);
    const t = resolveTime(time, at, now, false);
    at.setHours(t.h, t.min, 0, 0);
    if (at <= now) at.setDate(at.getDate() + 1);
  } else if (repeat) {
    at = new Date(now);
    if (repeat === 'hourly') at.setHours(at.getHours() + 1, 0, 0, 0);
    else if (intervalMin(repeat)) { at = new Date(now.getTime() + intervalMin(repeat) * 60000); at.setSeconds(0, 0); }
    else { at.setHours(9, 0, 0, 0); if (repeat === 'weekdays') while (at.getDay() === 0 || at.getDay() === 6) at.setDate(at.getDate() + 1); }
  }
  if (repeat && at) {
    if (repeat === 'weekdays') while (at.getDay() === 0 || at.getDay() === 6) at.setDate(at.getDate() + 1);
    if (at <= now) at = nextOccurrence(at, repeat, now.getTime());
  }
  return { at, repeat, rest, found: true, hasTime: !!time };
}

function resolveTime(t, day, now, dayGiven) {
  let h = t.h;
  if (t.ampm === 'p' && h < 12) h += 12;
  if (t.ampm === 'a' && h === 12) h = 0;
  if (!t.ampm && !t.exact && h >= 1 && h <= 7) h += 12;           // "at 4" -> 4 pm (office hours)
  if (!t.ampm && !t.exact && !dayGiven && h < 12) {                 // "at 9" when it's already past 9 am -> 9 pm if still today
    const am = new Date(now); am.setHours(h, t.min, 0, 0);
    const pm = new Date(now); pm.setHours(h + 12, t.min, 0, 0);
    if (am <= now && pm > now) h += 12;
  }
  return { h, min: t.min };
}
function partOfDay(p) { return { morning: { h: 9, min: 0 }, afternoon: { h: 14, min: 0 }, evening: { h: 18, min: 0 }, night: { h: 21, min: 0 } }[p.toLowerCase()]; }
function addDays(d, n) { const x = startOfDay(d); x.setDate(x.getDate() + n); return x; }
function startOfDay(d) { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; }
function sameDay(a, b) { return a.toDateString() === b.toDateString(); }
function nextDow(now, dow, allowToday) {
  const d = startOfDay(now);
  let diff = (dow - d.getDay() + 7) % 7;
  if (diff === 0 && !allowToday) diff = 7;
  d.setDate(d.getDate() + diff);
  return d;
}
function makeDate(now, day, month, year) {
  let y = year ? (+year < 100 ? 2000 + +year : +year) : now.getFullYear();
  const d = new Date(y, month, day);
  if (!year && d < startOfDay(now)) d.setFullYear(y + 1);
  return d;
}

function describeWhen(at, repeat) {
  if (!at) return '';
  const d = new Date(at), now = new Date();
  const time = d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  const tomorrow = addDays(now, 1);
  let day;
  if (sameDay(d, now)) day = 'today';
  else if (sameDay(d, tomorrow)) day = 'tomorrow';
  else if (d - now < 6 * 86400000) day = d.toLocaleDateString([], { weekday: 'long' });
  else day = d.toLocaleDateString([], { weekday: 'short', day: 'numeric', month: 'short' });
  const rep = { daily: 'every day', weekdays: 'every weekday', weekly: `every ${d.toLocaleDateString([], { weekday: 'long' })}`, monthly: `monthly on the ${d.getDate()}${['th', 'st', 'nd', 'rd'][(d.getDate() % 10 > 3 || [11, 12, 13].includes(d.getDate() % 100)) ? 0 : d.getDate() % 10]}`, yearly: 'every year', hourly: 'every hour' }[repeat];
  if (repeat === 'hourly') return `every hour (next ${time})`;
  if (intervalMin(repeat)) { const iv = intervalMin(repeat); return `every ${iv % 60 === 0 ? iv / 60 + ' hours' : iv + ' minutes'} (next ${time})`; }
  if (repeat === 'lastday') return `on the last day of every month at ${time}`;
  return rep ? `${rep} at ${time}` : `${day} at ${time}`;
}

module.exports = { parseWhen, nextOccurrence, describeWhen, step, intervalMin };
