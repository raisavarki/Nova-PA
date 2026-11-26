// Shared conversation/voice controller used by both the app and the desktop companion.
(() => {
  const { tts, sound, voice } = window.NovaCore;

  function create({ role, render }) {
    let settings = null;
    let dictating = false;
    const speakIds = new Set();
    const r = (k, ...a) => render[k] && render[k](...a);

    tts.onState((on) => r('speaking', on));

    function setSettings(s) {
      settings = s;
      tts.setConfig({ voiceName: s.voice.voiceName, rate: s.voice.rate });
    }
    const wantSpeech = (isAi, byVoice) => settings && settings.voice.speak && (byVoice || isAi);

    function submit(text, byVoice = false) {
      text = String(text || '').trim();
      if (!text) return;
      tts.stop();
      window.nova.input(text, { byVoice });
    }

    async function startListen(opts = {}) {
      if (voice.listening()) return;
      let wav;
      try {
        wav = await voice.listen({ noSpeechMs: opts.noSpeechMs || 7000, onLevel: (l) => r('level', l), onState: (on) => r('listening', on, dictating) });
      } catch (e) { r('error', 'Microphone not available: ' + e.message); return; }
      if (!wav) {
        if (dictating) { dictating = false; r('notice', 'Dictation stopped (silence).'); }
        return;
      }
      r('state', 'thinking');
      const res = await window.nova.transcribe(wav).catch((e) => ({ ok: false, error: e.message }));
      if (!res.ok) { dictating = false; r('error', 'Voice: ' + res.error, res.settings); r('state', 'error'); return; }
      const text = (res.text || '').trim();
      if (!text) { r('state', 'idle'); r('notice', "Didn't catch that.", true); if (dictating) startListen({ noSpeechMs: 15000 }); return; }
      if (dictating) {
        const d = await window.nova.dictate(text);
        if (d.stop) { dictating = false; r('notice', 'Dictation off.'); r('state', 'done'); return; }
        r('dictated', text); r('state', 'idle');
        return startListen({ noSpeechMs: 15000 });
      }
      submit(text, true);
    }
    function toggleListen() {
      if (voice.listening()) return voice.stop(true);
      if (dictating) { dictating = false; r('notice', 'Dictation off.'); return; }
      startListen({});
    }

    window.nova.on((ev) => {
      switch (ev.type) {
        case 'message': r('message', ev.msg); break;
        case 'state': r('state', tts.speaking() && ev.state === 'idle' ? 'speaking' : ev.state); break;
        case 'status': r('status', ev.text); break;
        case 'start':
          r('start', ev.id, ev);
          if (ev.speaker === role && wantSpeech(true, ev.byVoice)) speakIds.add(ev.id);
          break;
        case 'token':
          r('token', ev.id, ev.text);
          if (speakIds.has(ev.id)) tts.feed(ev.text);
          break;
        case 'final': {
          r('final', ev);
          if (ev.speaker === role) {
            if (ev.streamed) { if (speakIds.has(ev.id)) { tts.flush(); if (ev.msg.meta && ev.msg.meta.confirm) tts.say('Please confirm.'); } }
            else if (ev.forceSpeak) { const chunks = String(ev.speak || '').match(/[^.!?\n]+[.!?\n]*/g) || []; chunks.forEach((c) => tts.say(c)); }
            else if (wantSpeech(false, ev.byVoice) && !ev.silent) tts.say(ev.speak || ev.msg.text);
          }
          speakIds.delete(ev.id);
          if (ev.source === role) {
            if (ev.mode === 'dictation') { dictating = true; tts.afterSpeech(() => startListen({ noSpeechMs: 15000 })); }
            else if (ev.mode === 'normal') dictating = false;
            else if (ev.byVoice && settings && settings.voice.followUp && !dictating) tts.afterSpeech(() => !voice.listening() && startListen({ noSpeechMs: 5000 }));
          }
          break;
        }
        case 'alert':
          r('alert', ev);
          if (ev.speaker === role) {
            if (ev.kind === 'alarm') sound.alarmStart(); else if (ev.reminder.gentle) sound.blip(); else sound.chime();
            if (settings && settings.voice.speak && !ev.reminder.gentle) setTimeout(() => tts.say((ev.kind === 'event' ? 'Coming up: ' : ev.kind === 'focus' ? '' : 'Reminder: ') + ev.reminder.text), 900);
          }
          break;
        case 'stop-speech': tts.stop(); sound.alarmStop(); break;
        case 'ack': sound.alarmStop(); r('ack'); break;
        case 'listen': if (ev.target === role) toggleListen(); break;
        case 'wake':
          if (ev.target === role && !voice.listening() && !tts.speaking()) { r('wake'); sound.blip(); startListen({ noSpeechMs: 6000 }); }
          break;
        default: r('event', ev);
      }
    });

    return {
      submit, toggleListen, startListen, setSettings,
      stopAll: () => { tts.stop(); sound.alarmStop(); if (voice.listening()) { dictating = false; voice.stop(false); } },
      get dictating() { return dictating; }
    };
  }

  window.NovaSession = { create };
})();
