// "Nova Intelligence": Claude / Gemini / OpenAI behind one interface,
// streaming tokens, ordered fallback, and an ACTION protocol so the AI can drive the PC.
const os = require('os');
const { ACTION_SPEC } = require('./commands');

function systemPrompt(cfg, extra, env = {}) {
  const notes = (cfg.notes || []).slice(-10).map((n) => `- ${n.text}`).join('\n') || '(none)';
  return `You are ${cfg.assistantName}, a fast, warm desktop assistant living as an avatar on ${cfg.userName}'s Windows PC.
Now: ${new Date().toString()}. Host: ${os.hostname()}.
Active window (what the user was working in): ${env.activeWindow || 'unknown'}.${env.shot ? `\nA screenshot of the user's screen is attached (${env.shot.w}x${env.shot.h} px).` : ''}

STYLE: Be brief. 1-3 short sentences unless asked for detail. Plain text, no markdown headings. Your replies may be spoken aloud.

COMPUTER CONTROL: If the user wants something done on the PC, reply with one or more lines exactly like:
ACTION: {"name":"<action>","args":{...}}
then optionally ONE short line for the user. Actions run in order. Do not invent actions. Available actions:
${ACTION_SPEC}
If a request needs no PC action, just answer normally (never output ACTION then).
SCREEN: If the user refers to "this", "here", their screen, or something visible, and no screenshot is attached, output ACTION screen_look first.
POINTING: When the user asks what's wrong/where something is on screen and a screenshot is attached, find it and output ACTION point_at with its pixel x,y (in the attached screenshot's coordinates) so the avatar walks over and points at it, then briefly say what it is.
For multi-step UI tasks: act, then use screen_look to check the result, then continue. Keep steps minimal.
For data entry: focus_window first if needed, then type_text / press_keys (Tab between fields).

User's saved notes:
${notes}
${extra || ''}`;
}

// ---- SSE reader shared by all providers
async function* sse(res) {
  const reader = res.body.getReader();
  const dec = new TextDecoder();
  let buf = '';
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    let i;
    while ((i = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, i).trim();
      buf = buf.slice(i + 1);
      if (!line.startsWith('data:')) continue;
      const data = line.slice(5).trim();
      if (data === '[DONE]') return;
      try { yield JSON.parse(data); } catch (e) { /* partial / keepalive */ }
    }
  }
}

async function check(res, who) {
  if (res.ok) return;
  let msg = '';
  try { msg = (await res.text()).slice(0, 300); } catch (e) {}
  const err = new Error(`${who} ${res.status}: ${msg}`);
  err.status = res.status;
  const ra = res.headers && res.headers.get && (res.headers.get('retry-after') || res.headers.get('x-ratelimit-reset-requests'));
  if (ra) err.retryAfter = /^\d+(\.\d+)?$/.test(ra) ? parseFloat(ra) : /(\d+(?:\.\d+)?)s/.test(ra) ? parseFloat(ra.match(/(\d+(?:\.\d+)?)s/)[1]) : null;
  throw err;
}


// ---- OpenAI-compatible providers (OpenAI, Groq, OpenRouter, local Ollama, any custom endpoint)
const LABEL = { anthropic: 'Claude', gemini: 'Gemini', openai: 'OpenAI', groq: 'Groq', grok: 'Grok (xAI)', openrouter: 'OpenRouter', ollama: 'Ollama', custom: 'Custom' };
function compatBase(p, cfg) {
  const ep = (cfg && cfg.endpoints) || {};
  if (p === 'openai') return 'https://api.openai.com/v1';
  if (p === 'groq') return 'https://api.groq.com/openai/v1';
  if (p === 'grok') return 'https://api.x.ai/v1';
  if (p === 'openrouter') return 'https://openrouter.ai/api/v1';
  if (p === 'ollama') return String(ep.ollama || 'http://localhost:11434').replace(/\/+$/, '') + '/v1';
  if (p === 'custom') return String(ep.custom || '').replace(/\/+$/, '');
  return '';
}
function compatHeaders(p, key) {
  const h = { 'content-type': 'application/json' };
  if (key) h.authorization = `Bearer ${key}`;
  if (p === 'openrouter') { h['HTTP-Referer'] = 'https://nova.local'; h['X-Title'] = 'Nova Desktop Assistant'; }
  return h;
}
async function* compatStream(p, { key, model, system, messages: raw, signal, cfg }) {
  const messages = raw.map((m) => (m.image
    ? { role: m.role, content: [{ type: 'text', text: m.content }, { type: 'image_url', image_url: { url: 'data:image/jpeg;base64,' + m.image } }] }
    : { role: m.role, content: m.content }));
  const base = compatBase(p, cfg);
  if (!base) throw new Error(`${LABEL[p]}: no endpoint URL set`);
  let res;
  try {
    res = await fetch(base + '/chat/completions', {
      method: 'POST', signal, headers: compatHeaders(p, key),
      body: JSON.stringify({ model, stream: true, temperature: 0.6, max_tokens: 1500, messages: [{ role: 'system', content: system }, ...messages] })
    });
  } catch (e) {
    if (p === 'ollama') throw new Error('Ollama is not running (start the Ollama app, or install it from ollama.com)');
    throw e;
  }
  await check(res, LABEL[p]);
  for await (const ev of sse(res)) {
    if (ev.error) throw new Error(`${LABEL[p]}: ${ev.error.message || JSON.stringify(ev.error)}`);
    const t = ev.choices && ev.choices[0] && ev.choices[0].delta && ev.choices[0].delta.content;
    if (t) yield t;
  }
}

const PROVIDERS = {
  async *anthropic({ key, model, system, messages: raw, signal }) {
    const messages = raw.map((m) => (m.image
      ? { role: m.role, content: [{ type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: m.image } }, { type: 'text', text: m.content }] }
      : { role: m.role, content: m.content }));
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST', signal,
      headers: { 'content-type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({ model, max_tokens: 1500, stream: true, system, messages })
    });
    await check(res, 'Claude');
    for await (const ev of sse(res)) {
      if (ev.type === 'content_block_delta' && ev.delta && ev.delta.text) yield ev.delta.text;
      if (ev.type === 'error') throw new Error('Claude: ' + (ev.error && ev.error.message));
    }
  },

  openai: (o) => compatStream('openai', o),
  groq: (o) => compatStream('groq', o),
  grok: (o) => compatStream('grok', o),
  openrouter: (o) => compatStream('openrouter', o),
  ollama: (o) => compatStream('ollama', o),
  custom: (o) => compatStream('custom', o),

  async *gemini({ key, model, system, messages, signal }) {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:streamGenerateContent?alt=sse`;
    const res = await fetch(url, {
      method: 'POST', signal,
      headers: { 'content-type': 'application/json', 'x-goog-api-key': key },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: system }] },
        contents: messages.map((m) => ({ role: m.role === 'assistant' ? 'model' : 'user', parts: m.image ? [{ inline_data: { mime_type: 'image/jpeg', data: m.image } }, { text: m.content }] : [{ text: m.content }] })),
        generationConfig: { maxOutputTokens: 1500, temperature: 0.6, ...(/flash/i.test(model) && /2\.5/.test(model) ? { thinkingConfig: { thinkingBudget: 0 } } : {}) }
      })
    });
    await check(res, 'Gemini');
    for await (const ev of sse(res)) {
      const parts = ev.candidates && ev.candidates[0] && ev.candidates[0].content && ev.candidates[0].content.parts;
      if (parts) for (const p of parts) if (p.text) yield p.text;
    }
  }
};


// ---- Model discovery: ask each provider which models this key can use, and auto-pick a good fast one.
async function listModels(cfg, p) {
  const key = cfg.keys[p];
  if (!key && !NO_KEY.has(p)) return [];
  if (p === 'gemini') {
    const out = [];
    let page = '';
    for (let i = 0; i < 5; i++) {
      const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?pageSize=1000${page ? '&pageToken=' + page : ''}`, { headers: { 'x-goog-api-key': key } });
      await check(res, 'Gemini');
      const j = await res.json();
      for (const m of j.models || []) {
        if ((m.supportedGenerationMethods || []).includes('generateContent')) out.push(m.name.replace(/^models\//, ''));
      }
      if (!j.nextPageToken) break;
      page = j.nextPageToken;
    }
    return out;
  }
  if (p === 'anthropic') {
    const res = await fetch('https://api.anthropic.com/v1/models?limit=1000', { headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01' } });
    await check(res, 'Claude');
    return ((await res.json()).data || []).map((m) => m.id);
  }
  if (['openai', 'groq', 'grok', 'openrouter', 'ollama', 'custom'].includes(p)) {
    const base = compatBase(p, cfg);
    if (!base) return [];
    let res;
    try { res = await fetch(base + '/models', { headers: compatHeaders(p, key) }); }
    catch (e) { if (p === 'ollama') throw new Error('Ollama is not running'); throw e; }
    await check(res, LABEL[p]);
    const data = (await res.json()).data || [];
    return data.sort((a, b) => (b.created || 0) - (a.created || 0)).map((m) => m.id);
  }
  return [];
}

const verNum = (id) => { const m = String(id).match(/(\d+(?:\.\d+)?)/); return m ? parseFloat(m[1]) : 0; };
function pickBest(p, ids) {
  if (!ids || !ids.length) return null;
  if (p === 'gemini') {
    const bad = /lite|image|tts|live|audio|embedding|native|computer|robotics|thinking|exp|learnlm|gemma|aqa|vision/i;
    const score = (id) => verNum(id) * 10 - (/preview/i.test(id) ? 12 : 0) - (/-\d{3,}$|-\d{2}-\d{4}$/.test(id) ? 0.5 : 0) + (/latest/i.test(id) ? -1 : 0);
    const flash = ids.filter((id) => /^gemini/i.test(id) && /flash/i.test(id) && !bad.test(id)).sort((a, b) => score(b) - score(a));
    if (flash.length) return flash[0];
    const any = ids.filter((id) => /^gemini/i.test(id) && !bad.test(id)).sort((a, b) => score(b) - score(a));
    return any[0] || ids[0];
  }
  if (p === 'anthropic') {
    const haiku = ids.filter((id) => /haiku/i.test(id));
    return haiku[0] || ids.find((id) => /sonnet/i.test(id)) || ids[0];
  }
  const prefer = (list, prefs) => { for (const re of prefs) { const hit = list.find((id) => re.test(id)); if (hit) return hit; } return list[0] || null; };
  if (p === 'groq') {
    const chat = ids.filter((id) => !/whisper|guard|tts|playai|distil|embed|compound|orpheus|safeguard/i.test(id));
    return prefer(chat, [/llama-4-scout/i, /llama-3\.3-70b/i, /gpt-oss-120b/i, /qwen.*32b/i, /llama-3\.1-8b-instant/i, /llama/i]);
  }
  if (p === 'grok') {
    // xAI: prefer a fast, low-cost, vision-capable chat model.
    const chat = ids.filter((id) => !/image|embed|tts|whisper|guard/i.test(id));
    return prefer(chat, [/grok-4-fast/i, /grok-3-mini/i, /grok-4/i, /grok-3-fast/i, /grok-3/i, /grok-2-vision/i, /grok-2/i, /grok/i]);
  }
  if (p === 'openrouter') {
    const free = ids.filter((id) => /:free$/.test(id));
    return prefer(free, [/llama-4-scout/i, /llama-4-maverick/i, /gemini.*flash/i, /llama-3\.3-70b/i, /qwen.*(vl|72b|32b)/i, /deepseek-chat|deepseek-v3/i, /mistral-small/i, /gemma-3/i, /./]);
  }
  if (p === 'ollama' || p === 'custom') {
    return prefer(ids.filter((id) => !/embed/i.test(id)), [/gemma3/i, /qwen2\.5vl|qwen2\.5-vl|qwen3/i, /llama3\.2-vision|llava/i, /llama3/i, /qwen/i, /mistral|phi/i, /./]);
  }
  if (p === 'openai') {
    const chat = ids.filter((id) => /^gpt-/.test(id) && !/audio|realtime|search|transcribe|tts|image|instruct|codex|nano/i.test(id));
    return chat.find((id) => /mini$/.test(id)) || chat.find((id) => /mini/.test(id)) || chat[0] || null;
  }
  return null;
}
const isModelError = (e) => /\b404\b|not found|is not supported|does not exist|model_not_found|invalid model|unknown model/i.test(String(e && e.message));
async function autoFixModel(cfg, p) {
  const ids = await listModels(cfg, p);
  const best = pickBest(p, ids);
  return best && best !== cfg.models[p] ? best : null;
}

const NO_KEY = new Set(['ollama', 'custom']);
function availableProviders(cfg) {
  return cfg.providerOrder.filter((p) => PROVIDERS[p] && (cfg.keys[p] || (p === 'ollama' && cfg.ollamaEnabled) || (p === 'custom' && cfg.endpoints && cfg.endpoints.custom)));
}
const isImageError = (e) => /image|vision|multimodal|image_url|content.*array|does not support|unsupported content|400/i.test(String(e && e.message));

/**
 * Stream a reply. onToken(text) gets only user-visible text (ACTION lines are hidden).
 * Resolves { text, actions:[{name,args}], provider }.
 */
async function chat(cfg, history, userText, { onToken, signal, extraContext, shot, activeWindow, onModelChange } = {}) {
  const providers = availableProviders(cfg);
  if (!providers.length) throw new Error('NO_KEYS');
  const system = systemPrompt(cfg, extraContext, { shot, activeWindow });
  const messages = [...history.map((h) => ({ role: h.role, content: h.content })), { role: 'user', content: userText, image: shot ? shot.b64 : null }];

  let lastErr;
  for (const p of providers) {
   let noImage = false, fixedModel = false, retried429 = false;
   if (!cfg.models[p]) { try { const m = await autoFixModel(cfg, p); if (m) { cfg.models[p] = m; onModelChange && onModelChange(p, m); } } catch (e) { lastErr = e; continue; } }
   for (let attempt = 0; attempt < 4; attempt++) {
    let full = '', shown = 0, gotAny = false;
    const msgs = noImage ? messages.map((m) => (m.image ? { role: m.role, content: m.content + '\n(Note: a screenshot was taken but this model cannot see images.)' } : m)) : messages;
    // Groq: route screenshot requests to its vision-capable model
    let model = cfg.models[p];
    if (p === 'groq' && shot && !noImage && !/scout|maverick|vision|llava|vl\b/i.test(model)) model = cfg.models.groqVision || 'meta-llama/llama-4-scout-17b-16e-instruct';
    try {
      for await (const tok of PROVIDERS[p]({ key: cfg.keys[p], model, system, messages: msgs, signal, cfg })) {
        gotAny = true;
        full += tok;
        // Hold back text while it might be an ACTION line; stream everything else immediately.
        const visible = visibleText(full, false);
        if (visible.length > shown) { onToken && onToken(visible.slice(shown)); shown = visible.length; }
      }
      const visible = visibleText(full, true);
      if (visible.length > shown) onToken && onToken(visible.slice(shown));
      return { text: visible.trim(), actions: extractActions(full), provider: p };
    } catch (e) {
      if (signal && signal.aborted) throw e;
      lastErr = e;
      if (gotAny) throw e; // don't double-answer after partial output
      // Free-tier rate limit: wait briefly once, then fall through to the next provider.
      if (e.status === 429 && !retried429 && (e.retryAfter == null || e.retryAfter <= 8)) { retried429 = true; await new Promise((r) => setTimeout(r, Math.max(1, e.retryAfter || 2) * 1000)); continue; }
      // Model can't take images (or the vision model is unavailable): retry without the screenshot.
      if (!noImage && shot && (isImageError(e) || (p === 'groq' && model !== cfg.models[p]))) { noImage = true; continue; }
      // Wrong / retired model name: discover a working one for this key and retry once.
      if (!fixedModel && isModelError(e)) {
        fixedModel = true;
        try {
          const fixed = await autoFixModel(cfg, p);
          if (fixed) {
            console.warn(`[ai] ${p} model "${cfg.models[p]}" unavailable, switching to "${fixed}"`);
            cfg.models[p] = fixed;
            onModelChange && onModelChange(p, fixed);
            continue;
          }
        } catch (e2) { /* fall through to next provider */ }
      }
      console.warn(`[ai] ${p} failed, trying next:`, e.message);
      break;
    }
   }
  }
  throw lastErr;
}

// Remove ACTION lines. While streaming (final=false), withhold a trailing partial line
// that could still turn into "ACTION:".
function visibleText(full, final) {
  const lines = full.split('\n');
  const tail = final ? null : lines.pop();
  let out = lines.filter((l) => !/^\s*ACTION\s*:/i.test(l)).join('\n');
  if (tail != null) {
    const tt = tail.trimStart();
    const couldBeAction = 'ACTION:'.startsWith(tt.toUpperCase().slice(0, 7)) || /^ACTION\s*:/i.test(tt);
    if (!couldBeAction) out += (lines.length ? '\n' : '') + tail;
  }
  return out.replace(/^\n+/, '');
}

function extractActions(full) {
  const acts = [];
  for (const line of full.split('\n')) {
    const m = line.match(/^\s*ACTION\s*:\s*(\{.*\})\s*$/i);
    if (!m) continue;
    try { const o = JSON.parse(m[1]); if (o && o.name) acts.push({ name: o.name, args: o.args || {} }); } catch (e) {}
  }
  return acts;
}

// ---- Speech to text. Audio arrives as 16 kHz mono WAV (base64) from the renderer.
async function transcribe(cfg, wavB64, { onModelChange } = {}) {
  const order = ['groq', 'gemini', 'openai'].filter((p) => cfg.keys[p]);
  if (!order.length) throw new Error('NO_STT_KEYS');
  let lastErr;
  for (let i = 0; i < order.length; i++) {
    const p = order[i];
    try {
      if (p === 'openai' || p === 'groq') {
        const fd = new FormData();
        fd.append('file', new Blob([Buffer.from(wavB64, 'base64')], { type: 'audio/wav' }), 'speech.wav');
        fd.append('model', p === 'groq' ? (cfg.models.groqStt || 'whisper-large-v3-turbo') : (cfg.models.openaiStt || 'whisper-1'));
        if (p === 'groq') { fd.append('language', 'en'); fd.append('prompt', 'SAP, BOE, MOOWR, SEZ, EPCG, OptiEXIM, Vivek, Raisa'); }
        const res = await fetch(compatBase(p, cfg) + '/audio/transcriptions', {
          method: 'POST', headers: { authorization: `Bearer ${cfg.keys[p]}` }, body: fd
        });
        await check(res, p === 'groq' ? 'Groq Whisper' : 'Whisper');
        return ((await res.json()).text || '').trim();
      }
      const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(cfg.models.gemini)}:generateContent`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-goog-api-key': cfg.keys.gemini },
        body: JSON.stringify({
          contents: [{ role: 'user', parts: [
            { inline_data: { mime_type: 'audio/wav', data: wavB64 } },
            { text: 'Transcribe this speech exactly (English, may include Indian names or SAP terms). Output only the transcript, nothing else. If there is no speech, output nothing.' }
          ] }],
          generationConfig: { temperature: 0, ...(/flash/i.test(cfg.models.gemini) && /2\.5/.test(cfg.models.gemini) ? { thinkingConfig: { thinkingBudget: 0 } } : {}) }
        })
      });
      await check(res, 'Gemini STT');
      const j = await res.json();
      const parts = (j.candidates && j.candidates[0] && j.candidates[0].content && j.candidates[0].content.parts) || [];
      return parts.map((x) => x.text || '').join('').trim();
    } catch (e) {
      lastErr = e;
      if (p === 'gemini' && isModelError(e) && !transcribe._healed) {
        transcribe._healed = true;
        try {
          const fixed = await autoFixModel(cfg, 'gemini');
          if (fixed) { cfg.models.gemini = fixed; onModelChange && onModelChange('gemini', fixed); i--; continue; }
        } catch (e2) {}
      }
    }
  }
  throw lastErr;
}

module.exports = { LABEL, compatBase, chat, transcribe, availableProviders, visibleText, extractActions, listModels, pickBest, autoFixModel };
