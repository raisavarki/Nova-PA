(() => {
  const q = new URLSearchParams(location.search);
  const id = q.get('id'), type = q.get('type');
  const $ = (s) => document.querySelector(s);
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const fmt = (t) => new Date(t).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  let S = null, W = null, saveT = null;
  const TITLES = { note: 'Sticky note', tasks: 'Tasks', countdown: 'Countdown', agenda: 'Today', clock: 'Clock', water: 'Water', focus: 'Focus', meeting: 'Next up' };
  const COLORS = ['peach', 'yellow', 'mint', 'lavender', 'sky', 'cream'];

  async function load() {
    S = await window.nova.state();
    W = (S.settings.widgets || []).find((w) => w.id === id) || { id, type, color: 'peach' };
    $('#card').className = 'card ' + (W.color || 'peach');
    $('#pin').classList.toggle('on', !!W.onTop);
    render();
  }
  const dayKey = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  function render() {
    $('#title').textContent = TITLES[type] || 'Widget';
    $('#colors').innerHTML = COLORS.map((c) => `<span class="${c}" data-c="${c}" title="${c}"></span>`).join('');
    document.querySelectorAll('[data-c]').forEach((el) => (el.onclick = () => { W.color = el.dataset.c; $('#card').className = 'card ' + W.color; window.nova.invoke('widget_update', id, { color: W.color }); }));
    const m = $('#main');
    if (type === 'note') {
      if (!m.querySelector('textarea')) {
        m.innerHTML = '<textarea placeholder="Type a note…"></textarea>';
        const ta = m.querySelector('textarea'); ta.value = W.text || '';
        ta.addEventListener('input', () => { clearTimeout(saveT); saveT = setTimeout(() => window.nova.invoke('widget_update', id, { text: ta.value }), 500); });
      }
    } else if (type === 'tasks') {
      const open = S.tasks.filter((t) => !t.done).sort((a, b) => ({ high: 0, normal: 1, low: 2 }[a.priority] - { high: 0, normal: 1, low: 2 }[b.priority]) || ((a.due || 9e15) - (b.due || 9e15))).slice(0, 30);
      m.innerHTML = (open.length ? open.map((t) => `<div class="row"><span class="chk" data-t="${t.id}"></span><span>${t.priority === 'high' ? '❗ ' : ''}${esc(t.text)}</span></div>`).join('') : '<p class="muted">All clear 🎉</p>') + '<input class="add" placeholder="+ add a task">';
      m.querySelectorAll('[data-t]').forEach((c) => (c.onclick = () => { c.classList.add('on'); setTimeout(() => window.nova.action('task_toggle', { id: c.dataset.t }), 250); }));
      const inp = m.querySelector('.add'); inp.onkeydown = (e) => { if (e.key === 'Enter' && inp.value.trim()) { window.nova.action('task_add', { text: inp.value.trim() }); inp.value = ''; } };
    } else if (type === 'countdown') {
      const list = (S.countdowns || []).filter((c) => c.date >= new Date().setHours(0, 0, 0, 0)).sort((a, b) => a.date - b.date);
      const c = list.find((x) => x.id === W.refId) || list[0];
      if (!c) { m.innerHTML = '<p class="muted center">Add a countdown in Nova → Tools.</p>'; return; }
      const d = Math.round((c.date - new Date().setHours(0, 0, 0, 0)) / 864e5);
      $('#title').textContent = 'Countdown';
      m.innerHTML = `<div class="big">${d}</div><div class="center muted">${d === 1 ? 'day' : 'days'} to</div><div class="center" style="font-weight:600;margin-top:2px">${esc(c.title)}</div>`;
    } else if (type === 'agenda') {
      const end = new Date(); end.setHours(23, 59, 59, 999);
      const items = [];
      (S.events || []).filter((e) => e.end >= Date.now() && e.start <= +end).forEach((e) => items.push({ at: e.start, t: e.title, w: e.allDay ? 'All day' : fmt(e.start), i: '📅' }));
      (S.reminders || []).filter((r) => r.at <= +end).forEach((r) => items.push({ at: r.at, t: r.text, w: fmt(r.at), i: r.kind === 'alarm' ? '⏰' : '🔔' }));
      items.sort((a, b) => a.at - b.at);
      $('#title').textContent = new Date().toLocaleDateString([], { weekday: 'long', day: 'numeric', month: 'short' });
      m.innerHTML = items.length ? items.map((x) => `<div class="row"><span>${x.i}</span><span style="flex:1">${esc(x.t)}</span><span class="muted">${x.w}</span></div>`).join('') : '<p class="muted">Nothing else today 🎉</p>';
    } else if (type === 'clock') {
      const n = new Date();
      m.innerHTML = `<div class="tm">${fmt(n)}</div><div class="center muted">${n.toLocaleDateString([], { weekday: 'long', day: 'numeric', month: 'long' })}</div><div class="clocks">${(S.settings.clocks || []).slice(0, 4).map((tz) => `<span>${esc(tz.split('/').pop().replace(/_/g, ' '))}</span><b style="text-align:right">${n.toLocaleTimeString([], { timeZone: tz, hour: 'numeric', minute: '2-digit' })}</b>`).join('')}</div>`;
    } else if (type === 'water') {
      const h = (S.habits || []).find((x) => /water|hydrat|drink/i.test(x.name));
      const n = h ? (h.log || {})[dayKey()] || 0 : 0, tg = h ? h.target || 8 : 8;
      m.innerHTML = `<div class="tm">💧 ${n}/${tg}</div><div class="bar"><i style="width:${Math.min(100, n / tg * 100)}%"></i></div><div class="center"><button class="btn" id="w1">+1 glass</button></div>`;
      $('#w1').onclick = () => window.nova.action('water_log', { glasses: 1 });
    } else if (type === 'focus') {
      const f = S.focusState || {};
      const running = f.phase && f.phase !== 'idle';
      const mmss = (ms) => { const t = Math.max(0, Math.round(ms / 1000)); return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`; };
      const left = running ? (f.paused ? f.remaining : f.endsAt - Date.now()) : 25 * 60000;
      $('#title').textContent = running ? (f.phase === 'work' ? 'Focusing' : 'On a break') : 'Focus';
      m.innerHTML = `<div class="ring-wrap"><div class="tm" style="font-size:40px">${mmss(left)}</div><div class="center muted">${running ? (f.paused ? 'paused' : f.phase === 'work' ? 'stay with it' : 'breathe') : 'ready'}</div></div>
        <div class="center" style="margin-top:8px">${running
          ? `<button class="btn" id="fStop">Stop</button>`
          : `<button class="btn" id="f25">25 min</button> <button class="btn ghost" id="f45">45</button>`}</div>`;
      if (running) $('#fStop').onclick = () => window.nova.action('focus_stop', {});
      else { $('#f25').onclick = () => window.nova.action('focus_start', { minutes: 25 }); $('#f45').onclick = () => window.nova.action('focus_start', { minutes: 45 }); }
    } else if (type === 'meeting') {
      const now = Date.now();
      const next = (S.events || []).filter((e) => !e.allDay && e.end >= now).sort((a, b) => a.start - b.start)[0];
      if (!next) { m.innerHTML = '<p class="muted center" style="margin-top:14px">No more meetings today 🎉</p>'; return; }
      const mins = Math.round((next.start - now) / 60000);
      const when = mins <= 0 ? 'now' : mins < 60 ? `in ${mins} min` : `at ${fmt(next.start)}`;
      $('#title').textContent = 'Next up';
      m.innerHTML = `<div class="center" style="color:var(--accent);font-weight:700;font-size:13px;margin-top:2px">${when}</div>
        <div class="center" style="font-size:17px;font-weight:600;margin:4px 0 2px;line-height:1.3">${esc(next.title)}</div>
        <div class="center muted">${fmt(next.start)}${next.end ? '–' + fmt(next.end) : ''}${next.location ? ' · ' + esc(next.location) : ''}</div>
        ${next.joinUrl ? `<div class="center" style="margin-top:10px"><button class="btn" id="mjoin">Join</button></div>` : ''}`;
      if (next.joinUrl) $('#mjoin').onclick = () => window.nova.openPath(next.joinUrl);
    }
  }
  $('#close').onclick = () => window.nova.invoke('widget_remove', id);
  $('#pin').onclick = () => { W.onTop = !W.onTop; $('#pin').classList.toggle('on', W.onTop); window.nova.invoke('widget_update', id, { onTop: W.onTop }); };
  window.nova.on((ev) => { if ((ev.type === 'data' || ev.type === 'focus') && type !== 'note') load(); });
  setInterval(() => { if (type === 'focus') render(); }, 1000);
  setInterval(() => { if (type === 'clock' || type === 'agenda' || type === 'countdown' || type === 'meeting') render(); }, 30000);
  load();
})();
