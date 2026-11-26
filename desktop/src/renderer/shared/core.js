// Shared renderer helpers: markdown-lite, time formatting, TTS (sentence streaming), voice capture with VAD.
(() => {
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const md = (s) => esc(s)
    .replace(/`([^`\n]+)`/g, '<code>$1</code>')
    .replace(/\*\*([^*\n]+)\*\*/g, '<b>$1</b>')
    .replace(/^#{1,4}\s*(.+)$/gm, '<b>$1</b>')
    .replace(/(https?:\/\/[^\s<]+)/g, '<a href="$1" target="_blank">$1</a>');

  function sameDay(a, b) { return a.toDateString() === b.toDateString(); }
  function fmtTime(d) { return new Date(d).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }); }
  function when(at, repeat) {
    if (!at) return '';
    const d = new Date(at), now = new Date(), tm = new Date(); tm.setDate(tm.getDate() + 1);
    const t = fmtTime(d);
    const reps = { daily: 'Every day', weekdays: 'Weekdays', weekly: 'Every ' + d.toLocaleDateString([], { weekday: 'long' }), monthly: 'Monthly · ' + d.getDate(), yearly: 'Every year', hourly: 'Every hour' };
    const iv = /^every:(\d+)$/.exec(String(repeat || ''));
    if (iv) return `Every ${+iv[1] % 60 === 0 ? (+iv[1] / 60) + ' h' : iv[1] + ' min'} · next ${t}`;
    if (repeat === 'lastday') return `Last day of month · ${t}`;
    if (repeat) return `${reps[repeat] || repeat} · ${t}`;
    if (sameDay(d, now)) return `Today · ${t}`;
    if (sameDay(d, tm)) return `Tomorrow · ${t}`;
    if (d - now < 6 * 864e5 && d > now) return `${d.toLocaleDateString([], { weekday: 'long' })} · ${t}`;
    return `${d.toLocaleDateString([], { day: 'numeric', month: 'short', year: d.getFullYear() !== now.getFullYear() ? 'numeric' : undefined })} · ${t}`;
  }
  function dueLabel(due) {
    if (!due) return '';
    const d = new Date(due), now = new Date(), tm = new Date(); tm.setDate(tm.getDate() + 1);
    if (d < now && !sameDay(d, now)) return 'Overdue';
    if (sameDay(d, now)) return 'Today';
    if (sameDay(d, tm)) return 'Tomorrow';
    return d.toLocaleDateString([], { weekday: 'short', day: 'numeric', month: 'short' });
  }
  function greeting(name) {
    const h = new Date().getHours();
    return `${h < 5 ? 'Working late' : h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening'}${name ? ', ' + name : ''}`;
  }

  // ------------------------------------------------------------ TTS
  let voices = [];
  const loadVoices = () => { voices = speechSynthesis.getVoices(); };
  loadVoices(); speechSynthesis.onvoiceschanged = loadVoices;
  let cfg = { speak: true, voiceName: '', rate: 1.05 };
  let buf = '';
  let onSpeakState = () => {};
  const speaking = () => speechSynthesis.speaking || speechSynthesis.pending;
  function pickVoice() {
    return (cfg.voiceName && voices.find((v) => v.name === cfg.voiceName)) ||
      voices.find((v) => /natural/i.test(v.name) && /^en/i.test(v.lang)) ||
      voices.find((v) => /(aria|jenny|zira|heera|neerja)/i.test(v.name)) ||
      voices.find((v) => /^en/i.test(v.lang)) || null;
  }
  function clean(t) { return String(t).replace(/https?:\/\/\S+/g, 'link').replace(/[`*#•_>❗☐✅🔔⏰⏱▶🌤📝🎉]/gu, '').replace(/\s+/g, ' ').trim(); }
  function say(text) {
    const t = clean(text); if (!t) return;
    const u = new SpeechSynthesisUtterance(t.slice(0, 700));
    const v = pickVoice(); if (v) u.voice = v;
    u.rate = cfg.rate || 1.05;
    u.onstart = () => onSpeakState(true);
    u.onend = () => { if (!speaking()) onSpeakState(false); };
    speechSynthesis.speak(u);
  }
  function feed(tok) {
    buf += tok;
    let m;
    while ((m = buf.match(/^([\s\S]*?[.!?](?:\s|$)|[\s\S]*?\n)/)) && m[0].trim()) {
      if (m[0].length < 12 && buf.length < 40 && !/\n/.test(m[0])) break;
      say(m[0]); buf = buf.slice(m[0].length);
    }
  }
  function flush() { if (buf.trim()) say(buf); buf = ''; }
  function stop() { buf = ''; speechSynthesis.cancel(); onSpeakState(false); }
  function afterSpeech(fn) {
    const t0 = Date.now();
    const tick = () => { if (speaking() && Date.now() - t0 < 60000) return setTimeout(tick, 150); setTimeout(fn, 250); };
    setTimeout(tick, 200);
  }

  // ------------------------------------------------------------ sounds
  function tone(freqs, gap = 0.18, dur = 0.5, vol = 0.22) {
    try {
      const ac = new AudioContext(), t = ac.currentTime;
      freqs.forEach((f, i) => {
        const o = ac.createOscillator(), g = ac.createGain();
        o.type = 'sine'; o.frequency.value = f;
        g.gain.setValueAtTime(0.0001, t + i * gap);
        g.gain.exponentialRampToValueAtTime(vol, t + i * gap + 0.02);
        g.gain.exponentialRampToValueAtTime(0.0001, t + i * gap + dur);
        o.connect(g).connect(ac.destination); o.start(t + i * gap); o.stop(t + i * gap + dur + 0.05);
      });
      setTimeout(() => ac.close(), (freqs.length * gap + dur) * 1000 + 300);
    } catch (e) {}
  }
  const chime = () => tone([784, 1175]);
  const blip = () => tone([880], 0, 0.15, 0.15);
  let alarmTimer = null;
  function alarmStart() { alarmStop(); let n = 0; const ring = () => { tone([988, 784, 988, 784], 0.16, 0.14, 0.28); if (++n < 30) alarmTimer = setTimeout(ring, 1800); }; ring(); }
  function alarmStop() { clearTimeout(alarmTimer); alarmTimer = null; }

  // ------------------------------------------------------------ voice capture (16 kHz WAV + VAD)
  let rec = null;
  async function listen({ noSpeechMs = 7000, onLevel, onState } = {}) {
    if (rec) return null;
    stop();
    const stream = await navigator.mediaDevices.getUserMedia({ audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
    const ac = new AudioContext({ sampleRate: 16000 });
    const src = ac.createMediaStreamSource(stream);
    const proc = ac.createScriptProcessor(2048, 1, 1);
    return new Promise((resolve) => {
      const r = rec = { stream, ac, proc, chunks: [], heard: false, lastVoice: performance.now(), started: performance.now(), resolve };
      onState && onState(true);
      proc.onaudioprocess = (e) => {
        if (rec !== r) return;
        const d = e.inputBuffer.getChannelData(0);
        r.chunks.push(new Float32Array(d));
        let sum = 0; for (let i = 0; i < d.length; i++) sum += d[i] * d[i];
        const rms = Math.sqrt(sum / d.length);
        onLevel && onLevel(Math.min(1, rms * 12));
        const now = performance.now();
        if (rms > 0.018) { r.heard = true; r.lastVoice = now; }
        if (r.heard && now - r.lastVoice > 1100) end(true);
        else if (!r.heard && now - r.started > noSpeechMs) end(false);
        else if (now - r.started > 25000) end(true);
      };
      r.end = end;
      function end(use) {
        if (rec !== r) return;
        rec = null;
        try { proc.disconnect(); stream.getTracks().forEach((t) => t.stop()); } catch (e) {}
        const rate = ac.sampleRate; ac.close();
        onState && onState(false);
        resolve(use && r.heard ? encodeWav(r.chunks, rate) : null);
      }
      src.connect(proc); proc.connect(ac.destination);
    });
  }
  function stopListening(use = true) { if (rec) rec.end(use); }
  const listening = () => !!rec;
  function encodeWav(chunks, rate) {
    const len = chunks.reduce((n, c) => n + c.length, 0);
    const b = new ArrayBuffer(44 + len * 2), v = new DataView(b);
    const w = (o, s) => { for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)); };
    w(0, 'RIFF'); v.setUint32(4, 36 + len * 2, true); w(8, 'WAVE'); w(12, 'fmt ');
    v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
    v.setUint32(24, rate, true); v.setUint32(28, rate * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true);
    w(36, 'data'); v.setUint32(40, len * 2, true);
    let o = 44;
    for (const c of chunks) for (let i = 0; i < c.length; i++, o += 2) { const s = Math.max(-1, Math.min(1, c[i])); v.setInt16(o, s < 0 ? s * 0x8000 : s * 0x7fff, true); }
    const bytes = new Uint8Array(b); let bin = '';
    for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
    return btoa(bin);
  }

  window.NovaCore = {
    esc, md, when, dueLabel, fmtTime, greeting,
    tts: { say, feed, flush, stop, speaking, afterSpeech, setConfig: (c) => (cfg = { ...cfg, ...c }), onState: (fn) => (onSpeakState = fn), voices: () => speechSynthesis.getVoices() },
    sound: { chime, blip, alarmStart, alarmStop },
    voice: { listen, stop: stopListening, listening }
  };
})();
