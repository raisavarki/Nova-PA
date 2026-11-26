// Meeting recorder: mic + (optional) system audio, 16 kHz mono, sent to Nova in ~3-minute chunks for transcription.
(() => {
  let st = null;
  const CHUNK_SEC = 180;
  function wav(chunks, rate) {
    const len = chunks.reduce((n, c) => n + c.length, 0);
    const b = new ArrayBuffer(44 + len * 2), v = new DataView(b);
    const w = (o, s) => { for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)); };
    w(0, 'RIFF'); v.setUint32(4, 36 + len * 2, true); w(8, 'WAVE'); w(12, 'fmt '); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
    v.setUint32(24, rate, true); v.setUint32(28, rate * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true); w(36, 'data'); v.setUint32(40, len * 2, true);
    let o = 44; for (const c of chunks) for (let i = 0; i < c.length; i++, o += 2) { const s = Math.max(-1, Math.min(1, c[i])); v.setInt16(o, s < 0 ? s * 0x8000 : s * 0x7fff, true); }
    const bytes = new Uint8Array(b); let bin = ''; for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
    return btoa(bin);
  }
  async function start({ system = true, onLevel, onChunk } = {}) {
    if (st) return;
    const ac = new AudioContext({ sampleRate: 16000 });
    const mix = ac.createGain();
    const streams = [];
    const mic = await navigator.mediaDevices.getUserMedia({ audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true } });
    streams.push(mic); ac.createMediaStreamSource(mic).connect(mix);
    let sysOk = false;
    if (system) {
      try {
        const d = await navigator.mediaDevices.getDisplayMedia({ audio: true, video: true });
        d.getVideoTracks().forEach((t) => t.stop());
        if (d.getAudioTracks().length) { streams.push(d); ac.createMediaStreamSource(new MediaStream(d.getAudioTracks())).connect(mix); sysOk = true; }
      } catch (e) { console.warn('system audio unavailable', e.message); }
    }
    const proc = ac.createScriptProcessor(4096, 1, 1);
    mix.connect(proc); proc.connect(ac.destination);
    st = { ac, proc, streams, chunks: [], samples: 0, index: 0, started: Date.now(), onChunk, sysOk };
    proc.onaudioprocess = (e) => {
      const d = e.inputBuffer.getChannelData(0);
      st.chunks.push(new Float32Array(d)); st.samples += d.length;
      if (onLevel) { let s = 0; for (let i = 0; i < d.length; i += 8) s += d[i] * d[i]; onLevel(Math.min(1, Math.sqrt(s / (d.length / 8)) * 10)); }
      if (st.samples >= CHUNK_SEC * 16000) flush();
    };
    return { system: sysOk };
  }
  function flush() {
    if (!st || !st.chunks.length) return;
    const data = wav(st.chunks, st.ac.sampleRate);
    const idx = st.index++;
    st.chunks = []; st.samples = 0;
    st.onChunk && st.onChunk(data, idx);
  }
  async function stop() {
    if (!st) return null;
    flush();
    const s = st; st = null;
    try { s.proc.disconnect(); s.streams.forEach((x) => x.getTracks().forEach((t) => t.stop())); await s.ac.close(); } catch (e) {}
    return { seconds: Math.round((Date.now() - s.started) / 1000), chunks: s.index };
  }
  window.NovaRecorder = { start, stop, get recording() { return !!st; }, get elapsed() { return st ? Date.now() - st.started : 0; } };
})();
