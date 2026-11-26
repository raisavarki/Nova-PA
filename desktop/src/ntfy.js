// Phone companion through ntfy (free push notifications, no account). Install the "ntfy" app on your phone
// and subscribe to your topic. Nova pushes reminders there, and you can send commands back from the phone
// to the "<topic>-in" topic (e.g. "remind me at 5 to call Vivek", "add task buy milk").
const EventEmitter = require('events');

class Ntfy extends EventEmitter {
  init(store, run) {
    this.store = store; this.run = run;
    clearInterval(this.t); this.t = setInterval(() => this.poll(), 45000);
    setTimeout(() => this.poll(), 5000);
  }
  cfg() { return this.store.get().ntfy || {}; }
  base() { return String(this.cfg().server || 'https://ntfy.sh').replace(/\/+$/, ''); }
  async push(title, body, { tags = [], priority = 3, click } = {}) {
    const c = this.cfg();
    if (!c.enabled || !c.topic) return false;
    try {
      const ascii = /^[\x20-\x7E]*$/.test(title);
      const headers = { Title: ascii ? title : 'Nova', Tags: tags.join(','), Priority: String(priority) };
      if (click && /^[\x20-\x7E]*$/.test(click)) headers.Click = click;
      const r = await fetch(`${this.base()}/${encodeURIComponent(c.topic)}`, { method: 'POST', body: (ascii ? '' : title + '\n') + body, headers });
      return r.ok;
    } catch (e) { return false; }
  }
  async poll() {
    const c = this.cfg();
    if (!c.enabled || !c.topic || c.inbox === false) return;
    try {
      if (!this.startedAt) this.startedAt = Math.floor(Date.now() / 1000) - 5;
      const since = c.lastId || String(this.startedAt);
      const r = await fetch(`${this.base()}/${encodeURIComponent(c.topic + '-in')}/json?poll=1&since=${encodeURIComponent(since)}`);
      if (!r.ok) return;
      const lines = (await r.text()).split('\n').filter(Boolean);
      let last = c.lastId;
      for (const ln of lines) {
        let m; try { m = JSON.parse(ln); } catch (e) { continue; }
        if (m.event !== 'message' || !m.message) continue;
        last = m.id;
        if (c.lastId && m.id === c.lastId) continue;
        const res = await this.run(m.message.trim());
        await this.push('Nova', `> ${m.message.trim()}\n${(res && res.text) || 'Done.'}`, { tags: ['robot'] });
        this.emit('command', m.message, res);
      }
      if (last && last !== c.lastId) this.store.set({ ntfy: { lastId: last } });
    } catch (e) { /* offline */ }
  }
}
module.exports = new Ntfy();
