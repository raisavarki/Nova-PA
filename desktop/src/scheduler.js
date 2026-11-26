// Reminder / alarm / timer engine. One 1-second tick survives sleep/resume and clock changes.
const EventEmitter = require('events');
const { nextOccurrence } = require('./when');

class Scheduler extends EventEmitter {
  init(store) {
    this.store = store;
    this.missedChecked = false;
    clearInterval(this.timer);
    this.timer = setInterval(() => this.tick(), 1000);
    setTimeout(() => this.tick(true), 2500);
  }

  list() { return this.store.get().reminders; }
  save(list) { this.store.set({ reminders: list }); }

  tick(startup = false) {
    const now = Date.now();
    const list = this.list();
    let changed = false;
    const fire = [];
    for (const r of list) {
      if (r.done || !r.at || r.at > now) continue;
      const late = now - r.at;
      if (r.repeat) {
        const frequent = r.repeat === 'hourly' || /^every:/.test(r.repeat);
        if (late < (frequent ? 120000 : 6 * 3600000) && !(frequent && this.isQuiet(now))) fire.push({ ...r, missed: startup && late > 60000 });
        r.at = nextOccurrence(r.at, r.repeat, now).getTime();
      } else {
        r.done = true; r.firedAt = now;
        if (late < 12 * 3600000) fire.push({ ...r, missed: startup && late > 60000 });
        else r.missed = true;
      }
      changed = true;
    }
    // Housekeeping: drop finished timers and old done reminders (keep 7 days for history)
    const keep = list.filter((r) => !(r.done && ((r.kind === 'timer' && now - (r.firedAt || 0) > 3600000) || now - (r.firedAt || r.at || 0) > 7 * 86400000)));
    if (keep.length !== list.length) changed = true;
    if (changed) this.save(keep);
    for (const r of fire) this.emit('fire', r);
    this.tickEvents(now, startup);
    this.tickBirthdays(now);
    this.tickRollover(now);
    const aw = this.store.get().away;
    if (aw && aw.until && now > aw.until) { this.store.set({ away: null, ...(aw.setDnd ? { dnd: false } : {}) }); this.emit('away-end', aw); }
    if (!this.store.get().dnd) this.tickWellbeing(now);
  }

  // Calendar events: notify `remindMin` minutes before start (once).
  tickEvents(now, startup) {
    const events = this.store.get().events || [];
    let changed = false;
    for (const e of events) {
      if (e.remindMin == null || e.remindMin < 0 || e.notifiedAt || !e.start) continue;
      const due = e.start - e.remindMin * 60000;
      if (now < due) continue;
      e.notifiedAt = now; changed = true;
      if (now - e.start > 30 * 60000) continue; // long past, don't nag
      const mins = Math.round((e.start - now) / 60000);
      const when = mins > 1 ? `in ${mins} min` : mins >= -1 ? 'now' : `started ${-mins} min ago`;
      this.emit('fire', { id: 'ev_' + e.id, kind: 'event', text: `${e.title} ${when}${e.location && !/^https?:/.test(e.location) ? ' · ' + e.location : ''}`, eventId: e.id, joinUrl: e.joinUrl || '', at: due, missed: startup && now - due > 60000 });
    }
    if (changed) this.store.set({ events });
  }

  // Unfinished tasks from earlier days roll over to today (once a day).
  tickRollover(now) {
    const s = this.store.get(), P = s.planner || {};
    const key = new Date(now).toDateString();
    if (P.rollover === false || P.lastRollover === key) return;
    const sod = new Date(now); sod.setHours(0, 0, 0, 0);
    let n = 0;
    const tasks = (s.tasks || []).map((t) => {
      if (t.done || !t.due || t.due >= +sod) return t;
      n++; const d = new Date(now); d.setHours(18, 0, 0, 0);
      return { ...t, due: +d, rolled: (t.rolled || 0) + 1 };
    });
    this.store.set({ planner: { lastRollover: key }, ...(n ? { tasks } : {}) });
    if (n) this.emit('rolled', n);
  }

  // Birthdays: remind at 9:00 on the day (once a year).
  tickBirthdays(now) {
    const d = new Date(now);
    if (d.getHours() < 9) return;
    const people = this.store.get().people || [];
    const mmdd = `${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    let changed = false;
    for (const p of people) {
      if (!p.birthday || p.notifiedYear === d.getFullYear()) continue;
      if (p.birthday.slice(-5) !== mmdd) continue;
      p.notifiedYear = d.getFullYear(); changed = true;
      const age = /^\d{4}-/.test(p.birthday) ? d.getFullYear() - +p.birthday.slice(0, 4) : null;
      this.emit('fire', { id: 'bd_' + p.id, kind: 'birthday', text: `🎂 It's ${p.name}'s birthday today${age && age < 120 ? ` (turning ${age})` : ''}! ${p.phone ? 'Call or message them?' : 'Send them a wish?'}`, personId: p.id, at: now });
    }
    if (changed) this.store.set({ people });
  }

  // Frequent repeats (hourly / every N min) stay silent during quiet hours (Settings → Wellbeing).
  isQuiet(now) {
    const w = this.store.get().wellbeing || {};
    const hm = (x) => { const [h, m] = String(x || '0:0').split(':').map(Number); return h * 60 + (m || 0); };
    const d = new Date(now), cur = d.getHours() * 60 + d.getMinutes(), qs = hm(w.quietStart || '22:00'), qe = hm(w.quietEnd || '08:00');
    return qs > qe ? (cur >= qs || cur < qe) : (cur >= qs && cur < qe);
  }

  // Gentle wellbeing nudges (outside quiet hours).
  tickWellbeing(now) {
    const w = this.store.get().wellbeing || {};
    if (!this.wb) this.wb = { stretch: now, water: now, eyes: now };
    const hm = (s) => { const [h, m] = String(s || '0:0').split(':').map(Number); return h * 60 + (m || 0); };
    const d = new Date(now), cur = d.getHours() * 60 + d.getMinutes();
    const qs = hm(w.quietStart), qe = hm(w.quietEnd);
    const quiet = qs > qe ? (cur >= qs || cur < qe) : (cur >= qs && cur < qe);
    const nudges = {
      stretch: ['🚶 Time for a short break: stand up and stretch for a minute.', w.stretchEvery || 60],
      water: ['💧 Water break! Have a glass of water.', w.waterEvery || 90],
      eyes: ['👀 Eye break: look at something 20 feet away for 20 seconds.', w.eyesEvery || 20]
    };
    for (const [k, [text, every]] of Object.entries(nudges)) {
      if (!w[k]) { this.wb[k] = now; continue; }
      if (now - this.wb[k] >= every * 60000) {
        this.wb[k] = now;
        if (!quiet && !(this.isFocusing && this.isFocusing() && k !== 'eyes')) this.emit('fire', { id: 'wb_' + k + now, kind: 'break', text, at: now, gentle: true });
      }
    }
  }

  add({ text, at, repeat = null, kind = 'reminder' }) {
    const r = { id: this.store.uid(kind[0]), text: String(text || '').trim() || (kind === 'alarm' ? 'Alarm' : 'Reminder'), at: +new Date(at), repeat, kind, created: Date.now(), done: false };
    this.save(this.list().concat([r]));
    return r;
  }
  remove(id) { this.save(this.list().filter((r) => r.id !== id)); }
  snooze(id, ms = 10 * 60000, fallback) {
    const list = this.list();
    const r = list.find((x) => x.id === id) || fallback;
    if (!r) return null;
    const s = { id: this.store.uid('z'), text: r.text, at: Date.now() + ms, repeat: null, kind: r.kind === 'timer' ? 'reminder' : r.kind, created: Date.now(), done: false, snoozed: true };
    this.save(list.concat([s]));
    return s;
  }
  upcoming(limit = 50) {
    return this.list().filter((r) => !r.done).sort((a, b) => a.at - b.at).slice(0, limit);
  }
}

module.exports = new Scheduler();
