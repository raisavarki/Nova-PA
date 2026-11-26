// Pomodoro / focus engine (main process). Emits 'state' on changes and 'done' when a phase ends.
const EventEmitter = require('events');

class Focus extends EventEmitter {
  init(store) {
    this.store = store;
    this.s = { phase: 'idle', label: '', endsAt: 0, startedAt: 0, minutes: 0, cycle: 0, paused: false, remaining: 0 };
    clearInterval(this.t);
    this.t = setInterval(() => this.tick(), 1000);
  }
  state() { return { ...this.s, now: Date.now() }; }
  cfg() { return this.store.get().focus || { work: 25, short: 5, long: 15, autoBreak: true, sessions: [] }; }
  emitState() { this.emit('state', this.state()); }
  isFocusing() { return this.s.phase === 'work' && !this.s.paused; }

  start({ minutes, label } = {}) {
    const m = Math.max(1, Math.min(240, Number(minutes) || this.cfg().work || 25));
    this.s = { phase: 'work', label: String(label || '').trim(), minutes: m, startedAt: Date.now(), endsAt: Date.now() + m * 60000, cycle: this.s.phase === 'break' ? this.s.cycle : this.s.cycle, paused: false, remaining: 0 };
    this.emitState();
    return this.s;
  }
  startBreak(long) {
    const c = this.cfg();
    const m = long ? c.long || 15 : c.short || 5;
    this.s = { ...this.s, phase: 'break', minutes: m, startedAt: Date.now(), endsAt: Date.now() + m * 60000, paused: false, remaining: 0, long: !!long };
    this.emitState();
    return this.s;
  }
  pause() {
    if (this.s.phase === 'idle' || this.s.paused) return this.s;
    this.s.paused = true; this.s.remaining = Math.max(0, this.s.endsAt - Date.now());
    this.emitState(); return this.s;
  }
  resume() {
    if (!this.s.paused) return this.s;
    this.s.paused = false; this.s.endsAt = Date.now() + this.s.remaining;
    this.emitState(); return this.s;
  }
  stop() {
    const was = this.s;
    if (was.phase === 'work') {
      const mins = Math.round((Date.now() - was.startedAt - (was.paused ? 0 : 0)) / 60000);
      if (mins >= 1) this.record(was.startedAt, Date.now(), mins, was.label, false);
    }
    this.s = { phase: 'idle', label: '', endsAt: 0, startedAt: 0, minutes: 0, cycle: 0, paused: false, remaining: 0 };
    this.emitState();
    return was;
  }
  record(start, end, minutes, label, completed) {
    const f = this.cfg();
    const sessions = (f.sessions || []).concat([{ start, end, minutes, label, completed }]).slice(-1000);
    this.store.set({ focus: { sessions } });
  }
  tick() {
    if (this.s.phase === 'idle' || this.s.paused || Date.now() < this.s.endsAt) return;
    const done = { ...this.s };
    if (done.phase === 'work') {
      this.record(done.startedAt, Date.now(), done.minutes, done.label, true);
      this.s.cycle = (this.s.cycle || 0) + 1;
      if (this.cfg().autoBreak) this.startBreak(this.s.cycle % 4 === 0);
      else { this.s = { ...this.s, phase: 'idle', endsAt: 0 }; this.emitState(); }
    } else {
      this.s = { ...this.s, phase: 'idle', endsAt: 0 };
      this.emitState();
    }
    this.emit('done', done);
  }
  stats() {
    const sessions = (this.cfg().sessions || []);
    const day = (t) => new Date(t).toDateString();
    const today = new Date().toDateString();
    const todayMin = sessions.filter((x) => day(x.start) === today).reduce((a, x) => a + x.minutes, 0);
    const week = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date(); d.setDate(d.getDate() - i);
      const k = d.toDateString();
      week.push({ day: d.toLocaleDateString([], { weekday: 'short' }), minutes: sessions.filter((x) => day(x.start) === k).reduce((a, x) => a + x.minutes, 0) });
    }
    return { todayMin, todayCount: sessions.filter((x) => day(x.start) === today && x.completed).length, week, total: sessions.length };
  }
}

module.exports = new Focus();
