// Nova's character: a soft cream robot with a dark face screen, glowing orange eyes,
// antenna, little arms and a heart-core. States: idle, listening, thinking, working, speaking, done, error, sleep.
(() => {
  const SVG = `
<svg class="nova-bot" viewBox="0 0 200 220" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
  <defs>
    <radialGradient id="nb-shell" cx="38%" cy="28%" r="80%">
      <stop offset="0" stop-color="#FFFBF4"/><stop offset=".55" stop-color="#F4E7D4"/><stop offset="1" stop-color="#E2CCAE"/>
    </radialGradient>
    <linearGradient id="nb-screen" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#3B342D"/><stop offset="1" stop-color="#211D19"/>
    </linearGradient>
    <radialGradient id="nb-eye" cx="45%" cy="40%" r="65%">
      <stop offset="0" stop-color="#FFE3C7"/><stop offset=".45" stop-color="#FFAA6B"/><stop offset="1" stop-color="#E9773A"/>
    </radialGradient>
    <radialGradient id="nb-core" cx="50%" cy="45%" r="60%">
      <stop offset="0" stop-color="#FFD9B8"/><stop offset=".6" stop-color="#E9803F"/><stop offset="1" stop-color="#C45F28"/>
    </radialGradient>
    <linearGradient id="nb-rainbow" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#FF8A65"/><stop offset=".25" stop-color="#FFD54F"/><stop offset=".5" stop-color="#81C784"/><stop offset=".75" stop-color="#64B5F6"/><stop offset="1" stop-color="#BA68C8"/></linearGradient>
    <filter id="nb-glow" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="3" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
    <filter id="nb-soft" x="-20%" y="-20%" width="140%" height="140%"><feDropShadow dx="0" dy="3" stdDeviation="3" flood-color="#7A5530" flood-opacity=".22"/></filter>
  </defs>

  <ellipse class="nb-shadow" cx="100" cy="210" rx="44" ry="6.5"/>

  <g class="nb-float">
    <g class="acc acc-aura-sparkles"><path d="M30 60 l3 8 8 3 -8 3 -3 8 -3 -8 -8 -3 8 -3z"/><path d="M168 96 l2 6 6 2 -6 2 -2 6 -2 -6 -6 -2 6 -2z"/><path d="M40 170 l2 5 5 2 -5 2 -2 5 -2 -5 -5 -2 5 -2z"/><path d="M160 180 l2.5 6 6 2.5 -6 2.5 -2.5 6 -2.5 -6 -6 -2.5 6 -2.5z"/></g>
    <g class="acc acc-aura-rainbow"><ellipse cx="100" cy="112" rx="88" ry="98" fill="none" stroke="url(#nb-rainbow)" stroke-width="5" opacity=".55"/></g>
    <!-- thinking dots -->
    <g class="nb-think"><circle cx="150" cy="30" r="4"/><circle cx="163" cy="18" r="5.5"/><circle cx="178" cy="6" r="7"/></g>
    <!-- sleep z -->
    <text class="nb-z" x="148" y="34">z</text>

    <g class="nb-feet">
      <ellipse class="nb-foot nb-foot-l" cx="87" cy="198" rx="10" ry="6"/>
      <ellipse class="nb-foot nb-foot-r" cx="113" cy="198" rx="10" ry="6"/>
    </g>
    <g class="nb-excl"><text x="150" y="40">!</text></g>
    <g class="nb-q"><text x="148" y="42">?</text></g>
    <g class="nb-hearts"><path class="nb-heart h1" d="M150 40 c-4 -6 -12 -2 -8 5 l8 8 l8 -8 c4 -7 -4 -11 -8 -5z"/><path class="nb-heart h2" d="M44 54 c-3 -4 -9 -1 -6 4 l6 6 l6 -6 c3 -5 -3 -8 -6 -4z"/></g>
    <g class="nb-arms">
      <g class="nb-arm nb-arm-l"><ellipse cx="58" cy="168" rx="9" ry="15" transform="rotate(25 58 168)"/></g>
      <g class="nb-arm nb-arm-r"><ellipse cx="142" cy="168" rx="9" ry="15" transform="rotate(-25 142 168)"/></g>
    </g>

    <!-- props (shown by acts / auto modes) -->
    <g class="nb-prop nb-pad"><rect x="20" y="128" width="30" height="38" rx="4" fill="#FFFCF7" stroke="#DCC5A6" stroke-width="1.5" transform="rotate(-10 35 147)"/><path d="M25 140 L44 137 M26 147 L45 144 M27 154 L40 152" stroke="#D9773F" stroke-width="2" stroke-linecap="round" class="nb-scribble"/><g class="nb-pencil"><rect x="44" y="120" width="5" height="26" rx="2" fill="#F2C14E" transform="rotate(30 46 133)"/></g></g>
    <g class="nb-prop nb-confetti"><rect x="40" y="40" width="6" height="10" fill="#E9803F"/><rect x="160" y="34" width="6" height="10" fill="#81C784"/><rect x="30" y="100" width="6" height="10" fill="#64B5F6"/><rect x="170" y="90" width="6" height="10" fill="#F2C14E"/><rect x="60" y="20" width="6" height="10" fill="#BA68C8"/><rect x="140" y="14" width="6" height="10" fill="#F07A6A"/><circle cx="100" cy="8" r="4" fill="#F2C14E"/><circle cx="24" cy="70" r="3.5" fill="#E9803F"/><circle cx="178" cy="62" r="3.5" fill="#64B5F6"/></g>
    <g class="nb-prop nb-checkmark"><circle cx="160" cy="40" r="15" fill="#6FAF7A"/><path d="M152 40 L158 46 L169 34" fill="none" stroke="#fff" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/></g>
    <g class="nb-prop nb-bell"><path d="M150 26 Q150 12 162 12 Q174 12 174 26 L176 38 L148 38 Z" fill="#F2C14E" stroke="#C9962B" stroke-width="1.5"/><circle cx="162" cy="41" r="3.5" fill="#C9962B"/></g>
    <g class="nb-prop nb-moon"><path d="M168 18 A16 16 0 1 0 180 44 A12 12 0 1 1 168 18 Z" fill="#F2C14E"/></g>
    <g class="nb-prop nb-recdot"><circle cx="104" cy="16" r="9" fill="#E05A47"/></g>
    <g class="nb-point-arrow"><path d="M150 168 l34 0 M176 160 l10 8 -10 8" fill="none" stroke="#E9803F" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/></g>
    <!-- extra feature props -->
    <g class="nb-zen"><circle cx="100" cy="112" r="92" fill="none" stroke="url(#nb-rainbow)" stroke-width="3" opacity=".5"/><circle cx="100" cy="112" r="78" fill="none" stroke="#E9803F" stroke-width="1.5" stroke-dasharray="2 7" opacity=".4"/></g>
    <g class="nb-ohm"><text x="100" y="20">☁</text></g>
    <g class="nb-sneeze"><path d="M150 96 l9 -3 M152 104 l9 0 M150 112 l9 3" stroke="#Bcdcff" stroke-width="2.5" stroke-linecap="round" fill="none"/><circle cx="164" cy="96" r="2" fill="#Cfeaff"/><circle cx="168" cy="104" r="2.5" fill="#Cfeaff"/><circle cx="164" cy="112" r="2" fill="#Cfeaff"/></g>
    <g class="nb-cold"><path d="M40 70 q-6 6 0 12 M44 150 q-6 6 0 12" stroke="#9Fc8e8" stroke-width="2.5" stroke-linecap="round" fill="none"/></g>
    <g class="nb-juggle"><circle class="jb jb1" cx="100" cy="150" r="6" fill="url(#nb-core)"/><circle class="jb jb2" cx="100" cy="150" r="6" fill="url(#nb-core)"/><circle class="jb jb3" cx="100" cy="150" r="6" fill="url(#nb-core)"/></g>
    <g class="nb-spark2"><path d="M150 150 l3 8 8 3 -8 3 -3 8 -3 -8 -8 -3 8 -3z"/><path d="M176 128 l2.2 6 6 2.2 -6 2.2 -2.2 6 -2.2 -6 -6 -2.2 6 -2.2z"/><path d="M182 168 l1.8 5 5 1.8 -5 1.8 -1.8 5 -1.8 -5 -5 -1.8 5 -1.8z"/></g>
    <!-- developer skin overlays (shown only under .dev) -->
    <g class="nb-dev">
      <g class="nb-rain">
        <text x="40" y="44">1</text><text x="150" y="40">0</text><text x="28" y="92">0</text><text x="172" y="96">1</text>
        <text x="60" y="26">1</text><text x="138" y="22">0</text><text x="20" y="150">1</text><text x="178" y="150">0</text>
      </g>
      <text class="nb-prompt" x="66" y="104">&gt;</text>
      <rect class="nb-caret" x="78" y="95.5" width="7" height="11"/>
    </g>
    <!-- dev act props -->
    <g class="nb-prop nb-rocket"><g transform="translate(150 150)"><path d="M0 -14 C7 -8 7 4 0 12 C-7 4 -7 -8 0 -14 Z" fill="#E9803F" stroke="#B85F2C" stroke-width="1.2"/><circle cx="0" cy="-3" r="3" fill="#2A2620"/><path d="M-6 6 L-10 14 L-3 10 Z M6 6 L10 14 L3 10 Z" fill="#C9692F"/><path class="nb-flame" d="M-3 12 Q0 24 3 12 Z" fill="#F2C14E"/></g></g>
    <g class="nb-prop nb-bug"><g transform="translate(150 44)"><ellipse cx="0" cy="0" rx="9" ry="11" fill="#6FAF7A" stroke="#3F7a4c" stroke-width="1.2"/><path d="M-9 -4 L-15 -8 M9 -4 L15 -8 M-10 0 L-16 0 M10 0 L16 0 M-9 4 L-15 8 M9 4 L15 8" stroke="#3F7a4c" stroke-width="1.6"/><path d="M0 -11 L0 11" stroke="#2f5c39" stroke-width="1.2"/><circle cx="-3" cy="-6" r="1.4" fill="#fff"/><circle cx="3" cy="-6" r="1.4" fill="#fff"/></g></g>
    <g class="nb-prop nb-branch"><g transform="translate(152 42)" fill="none" stroke="#7CE38B" stroke-width="2.4"><circle cx="-6" cy="-8" r="3"/><circle cx="-6" cy="8" r="3"/><circle cx="8" cy="-4" r="3"/><path d="M-6 -5 L-6 5 M-6 -5 Q-6 -4 8 -4"/></g></g>
    <!-- body -->
    <rect class="nb-body" x="66" y="138" width="68" height="56" rx="26" fill="url(#nb-shell)" filter="url(#nb-soft)"/>
    <g class="nb-core-wrap">
      <circle class="nb-core-ring" cx="100" cy="166" r="12"/>
      <circle class="nb-core" cx="100" cy="166" r="7.5" fill="url(#nb-core)" filter="url(#nb-glow)"/>
    </g>

    <g class="acc acc-neck-scarf"><path d="M66 136 Q100 150 134 136 L136 146 Q100 160 64 146 Z" fill="#D9773F"/><path d="M70 139 L72 149 M84 143 L85 153 M100 145 L100 155 M116 143 L115 153 M130 139 L128 149" stroke="#F6C7A4" stroke-width="2"/><path d="M118 148 L126 176 L114 178 L110 150 Z" fill="#C9692F"/></g>
    <g class="acc acc-neck-bowtie"><path d="M100 146 L84 137 L84 155 Z M100 146 L116 137 L116 155 Z" fill="#D9773F" stroke="#B85F2C" stroke-width="1.5"/><circle cx="100" cy="146" r="4" fill="#B85F2C"/></g>
    <g class="nb-head">
      <!-- antenna -->
      <path class="nb-stem" d="M100 42 C100 34 104 28 104 20"/>
      <circle class="nb-tip" cx="104" cy="16" r="7" filter="url(#nb-glow)"/>
      <!-- ear pods -->
      <rect class="nb-ear" x="34" y="78" width="16" height="40" rx="8"/>
      <rect class="nb-ear" x="150" y="78" width="16" height="40" rx="8"/>
      <!-- shell -->
      <rect class="nb-shell" x="44" y="38" width="112" height="104" rx="46" fill="url(#nb-shell)" filter="url(#nb-soft)"/>
      <path class="nb-shine" d="M66 56 C76 46 98 43 114 45" />
      <!-- face screen -->
      <rect class="nb-screen" x="58" y="60" width="84" height="62" rx="27" fill="url(#nb-screen)"/>
      <g class="nb-face">
        <g class="nb-eyes">
          <g class="nb-eye nb-eye-l"><ellipse cx="83" cy="88" rx="8.5" ry="11" fill="url(#nb-eye)" filter="url(#nb-glow)"/><circle class="nb-glint" cx="86" cy="83.5" r="2.6"/></g>
          <g class="nb-eye nb-eye-r"><ellipse cx="117" cy="88" rx="8.5" ry="11" fill="url(#nb-eye)" filter="url(#nb-glow)"/><circle class="nb-glint" cx="120" cy="83.5" r="2.6"/></g>
        </g>
        <g class="nb-happy"><path d="M75 90 Q83 80 91 90"/><path d="M109 90 Q117 80 125 90"/></g>
        <g class="nb-closed"><path d="M75 89 Q83 94 91 89"/><path d="M109 89 Q117 94 125 89"/></g>
        <g class="nb-x"><path d="M77 83 L89 95 M89 83 L77 95"/><path d="M111 83 L123 95 M123 83 L111 95"/></g>
        <g class="nb-eye-hearts"><path d="M83 82 c-4 -5 -11 -1 -7 4 l7 8 l7 -8 c4 -5 -3 -9 -7 -4z"/><path d="M117 82 c-4 -5 -11 -1 -7 4 l7 8 l7 -8 c4 -5 -3 -9 -7 -4z"/></g>
        <path class="nb-mouth" d="M93 106 Q100 111 107 106"/>
        <ellipse class="nb-talk" cx="100" cy="107" rx="6" ry="3.5"/>
        <g class="nb-bars"><rect x="85" y="103" width="4" height="8" rx="2"/><rect x="92" y="101" width="4" height="12" rx="2"/><rect x="99" y="99" width="4" height="16" rx="2"/><rect x="106" y="101" width="4" height="12" rx="2"/><rect x="113" y="103" width="4" height="8" rx="2"/></g>
        <circle class="nb-cheek" cx="68" cy="106" r="5"/><circle class="nb-cheek" cx="132" cy="106" r="5"/>
      </g>
      <g class="acc acc-eyes-glasses"><circle cx="83" cy="88" r="14" fill="rgba(255,255,255,.07)" stroke="#E9C9A6" stroke-width="3"/><circle cx="117" cy="88" r="14" fill="rgba(255,255,255,.07)" stroke="#E9C9A6" stroke-width="3"/><path d="M97 87 Q100 84 103 87" stroke="#E9C9A6" stroke-width="3" fill="none"/></g>
      <g class="acc acc-eyes-shades"><rect x="66" y="78" width="32" height="20" rx="8" fill="#14110F"/><rect x="102" y="78" width="32" height="20" rx="8" fill="#14110F"/><path d="M98 84 L102 84" stroke="#14110F" stroke-width="4"/><path d="M71 83 L80 83 M107 83 L116 83" stroke="#FFAA6B" stroke-width="2" stroke-linecap="round" opacity=".8"/></g>
      <g class="acc acc-hat-cap"><path d="M52 66 Q54 26 100 24 Q146 26 148 66 Q100 52 52 66 Z" fill="#D9773F" stroke="#B85F2C" stroke-width="1.5"/><path d="M140 60 Q172 58 180 70 Q160 72 142 68 Z" fill="#C9692F"/><circle cx="100" cy="25" r="5" fill="#B85F2C"/></g>
      <g class="acc acc-hat-headphones"><path d="M40 98 Q38 22 100 20 Q162 22 160 98" fill="none" stroke="#3B342D" stroke-width="8" stroke-linecap="round"/><rect x="28" y="76" width="22" height="44" rx="10" fill="#3B342D"/><rect x="150" y="76" width="22" height="44" rx="10" fill="#3B342D"/><rect x="33" y="84" width="12" height="28" rx="6" fill="#E9803F"/><rect x="155" y="84" width="12" height="28" rx="6" fill="#E9803F"/></g>
      <g class="acc acc-hat-crown"><path d="M70 46 L74 22 L86 36 L100 16 L114 36 L126 22 L130 46 Z" fill="#F2C14E" stroke="#C9962B" stroke-width="2" stroke-linejoin="round"/><circle cx="100" cy="34" r="3.5" fill="#E9803F"/><circle cx="82" cy="40" r="2.5" fill="#E9803F"/><circle cx="118" cy="40" r="2.5" fill="#E9803F"/></g>
      <g class="acc acc-hat-flower"><g transform="translate(138 46)"><circle cx="0" cy="-9" r="7" fill="#FFB3A7"/><circle cx="8.5" cy="-3" r="7" fill="#FFB3A7"/><circle cx="5.5" cy="7" r="7" fill="#FFB3A7"/><circle cx="-5.5" cy="7" r="7" fill="#FFB3A7"/><circle cx="-8.5" cy="-3" r="7" fill="#FFB3A7"/><circle cx="0" cy="0" r="5.5" fill="#F2C14E"/></g></g>
    </g>
    <g class="nb-prop nb-cup"><path d="M146 120 L170 120 L167 146 Q158 151 149 146 Z" fill="#FFFCF7" stroke="#DCC5A6" stroke-width="1.5"/><path d="M148 126 L168 126 L166 143 Q158 147 150 143 Z" fill="#7FB8E6"/><path d="M170 126 Q179 128 177 136 Q175 142 168 140" fill="none" stroke="#DCC5A6" stroke-width="2.5"/><path class="nb-steam" d="M152 114 Q155 108 152 102 M160 114 Q163 108 160 102" fill="none" stroke="#C9B9A4" stroke-width="2" stroke-linecap="round"/></g>

    <!-- helper pointing arm: a real little arm with a hand + extended finger (shown on act-point) -->
    <g class="nb-point-arm nb-point-arm-r"><g class="nb-pa-inner">
      <path class="nb-pa-sleeve" d="M120 149 C148 143 171 147 183 157 C189 162 189 171 183 176 C171 185 148 184 120 179 C112 177 112 151 120 149 Z"/>
      <path class="nb-pa-thumb" d="M180 154 c7 -4 12 -1 10 4 c-2 4 -7 3 -11 1 Z"/>
      <circle class="nb-pa-hand" cx="186" cy="167" r="11"/>
      <path class="nb-pa-finger" d="M192 161.5 L209 164 c3.4 .5 3.4 5.5 0 6 L192 173 Z"/>
      <path class="nb-pa-cuff" d="M123 151 q-5 15 0 27" fill="none"/>
      <g class="nb-pa-spark"><path d="M214 167 l2.3 4.8 4.8 2.3 -4.8 2.3 -2.3 4.8 -2.3 -4.8 -4.8 -2.3 4.8 -2.3z"/></g>
    </g></g>
  </g>
</svg>`;

  function attach(host) {
    host.innerHTML = SVG;
    const svg = host.querySelector('svg');
    const eyes = svg.querySelector('.nb-eyes');
    const head = svg.querySelector('.nb-head');
    const bars = [...svg.querySelectorAll('.nb-bars rect')];
    let state = 'idle', idleTimer = null, locked = false;

    function setState(s) {
      if (s === state) return;
      if ((state === 'walking' || state === 'attention') && s !== 'walking' && s !== 'attention' && locked) return;
      svg.classList.remove('st-' + state);
      state = s;
      svg.classList.add('st-' + s);
      clearTimeout(idleTimer);
      if (s === 'done' || s === 'error') idleTimer = setTimeout(() => setState('idle'), 1800);
      if (s === 'idle') idleTimer = setTimeout(() => setState('sleep'), 10 * 60000);
    }
    // dx, dy in -1..1
    function look(dx, dy) {
      const x = Math.max(-1, Math.min(1, dx)), y = Math.max(-1, Math.min(1, dy));
      eyes.style.transform = `translate(${x * 6}px, ${y * 4.5}px)`;
      head.style.transform = `rotate(${x * 4}deg)`;
      if (state === 'sleep') setState('idle');
    }
    function level(v) {
      const base = [0.5, 0.75, 1, 0.75, 0.5];
      bars.forEach((b, i) => { b.style.transform = `scaleY(${0.35 + v * 1.6 * base[i] + Math.random() * 0.15})`; });
    }
    // one-shot idle/curious animations layered on top of idle/sleep
    let actTimer = null, curAct = null;
    const ACT_MS = { lookaround: 2600, tilt: 2400, stretch: 2200, yawn: 2600, hop: 900, peek: 2600, dance: 3200, notice: 2200, happy: 2400, wave: 2000, drink: 2800, cheer: 2600, write: 2400, check: 1800, ring: 1800, nod: 1400, goodnight: 3000, type: 2200, commit: 2200, debug: 2400, ship: 2400, compile: 2400, sniff: 2400, ponder: 2800, point: 4000, wiggle: 1600, blink2: 900,
      // ---- new feature acts ----
      laugh: 2400, blush: 2600, spin: 1400, backflip: 1400, shrug: 2000, facepalm: 2400, heart: 2800, sneeze: 1800, shiver: 2600, juggle: 3000, meditate: 4200, thumbsup: 2000, magic: 2600, peekaboo: 2400, highfive: 1800, wink: 1200, purr: 3000, celebrate: 2800 };
    function play(act, ms) {
      if (!['idle', 'sleep', 'done', 'speaking'].includes(state) || locked) return false;
      if (act === 'sleep') { setState('sleep'); return true; }
      if (act === 'wake') { setState('idle'); return true; }
      if (state === 'sleep' && act !== 'notice' && act !== 'happy' && act !== 'wave') return false;
      if (state === 'sleep') setState('idle');
      if (curAct) svg.classList.remove('act-' + curAct);
      clearTimeout(actTimer);
      void svg.getBoundingClientRect(); // restart CSS animation
      curAct = act; svg.classList.add('act-' + act);
      actTimer = setTimeout(() => { svg.classList.remove('act-' + act); curAct = null; }, ms || ACT_MS[act] || 2500);
      return true;
    }
    // walking/attention take priority over chat states until released
    function lock(on) { locked = on; }
    function face(dir) { svg.classList.toggle('face-left', dir === 'left'); }
    svg.classList.add('st-idle');
    setState('idle');
    // persistent modes driven by the app: focus (headphones), rec (red antenna), dnd (moon), away (sleepy)
    function mode(name, on) { svg.classList.toggle('m-' + name, !!on); }
    function devSkin(on) { svg.classList.toggle('dev', !!on); }
    const pointArm = svg.querySelector('.nb-point-arm-r');
    function point(dir, ms) {
      const left = dir === 'left';
      svg.classList.toggle('face-left', left);
      // Mirror the arm with an SVG transform attribute (reliable in user space, unlike a CSS transform on <g>).
      if (pointArm) { if (left) pointArm.setAttribute('transform', 'translate(200,0) scale(-1,1)'); else pointArm.removeAttribute('transform'); }
      clearTimeout(actTimer);
      if (curAct) svg.classList.remove('act-' + curAct);
      void svg.getBoundingClientRect();
      curAct = 'point'; svg.classList.add('act-point');
      actTimer = setTimeout(() => { svg.classList.remove('act-point'); if (pointArm) pointArm.removeAttribute('transform'); curAct = null; }, ms || 4000);
    }
    function setOutfit(o) {
      [...svg.classList].filter((c) => c.startsWith('w-')).forEach((c) => svg.classList.remove(c));
      for (const [slot, id] of Object.entries(o || {})) if (id) svg.classList.add(`w-${slot}-${id}`);
    }
    // colour skin: cream (default), mint, berry, sky
    const SKINS = ['cream', 'mint', 'berry', 'sky'];
    function skin(name) {
      SKINS.forEach((s) => svg.classList.remove('skin-' + s));
      if (name && name !== 'cream') svg.classList.add('skin-' + name);
      return name || 'cream';
    }
    // a quick cheeky wink (not a full act, can fire over most states)
    function wink() {
      svg.classList.add('act-wink');
      clearTimeout(actTimer); curAct = 'wink';
      actTimer = setTimeout(() => { svg.classList.remove('act-wink'); curAct = null; }, ACT_MS.wink);
    }

    // ---- liveliness: natural blinking + the odd idle flourish, so every avatar feels alive ----
    const reduceMotion = () => { try { return matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (e) { return false; } };
    function blink() {
      if (locked || curAct || reduceMotion()) return;
      if (state !== 'idle' && state !== 'speaking' && state !== 'done') return;
      if (document.hidden) return;
      svg.classList.add('act-blink');
      setTimeout(() => svg.classList.remove('act-blink'), 220);
    }
    const IDLE_FLOURISH = ['lookaround', 'tilt', 'wiggle', 'nod', 'peek', 'blink2'];
    let alive = [];
    function scheduleBlink() { const t = setTimeout(() => { if (Math.random() < 0.8) blink(); if (Math.random() < 0.12) setTimeout(blink, 200); scheduleBlink(); }, 3200 + Math.random() * 4200); alive.push(t); }
    function scheduleFlourish() {
      const t = setTimeout(() => {
        if (!locked && !curAct && state === 'idle' && !document.hidden && !reduceMotion() && Math.random() < 0.5) {
          const a = IDLE_FLOURISH[Math.floor(Math.random() * IDLE_FLOURISH.length)];
          if (a === 'blink2') blink(); else play(a);
        }
        scheduleFlourish();
      }, 24000 + Math.random() * 30000);
      alive.push(t);
    }
    scheduleBlink(); scheduleFlourish();
    function stopAlive() { alive.forEach(clearTimeout); alive = []; }

    return { mode, devSkin, point, setOutfit, skin, wink, blink, setState, look, level, lock, face, play, stopAlive, get state() { return state; }, get act() { return curAct; }, el: svg, SKINS };
  }

  window.NovaAvatar = { attach, SVG };
})();
