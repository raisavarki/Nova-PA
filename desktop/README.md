# Nova: personal assistant for Windows

Nova is a desktop PA app. You can also put it on your desktop as an always-on-top animated companion that answers in speech bubbles. Both share the same brain and conversation.

## Run it from any drive (e.g. D:)
`start.bat` keeps everything inside the Nova folder, so nothing is written to C:: npm cache, Electron download, temp files, and your data (`data\` subfolder). The first time, your existing settings are copied over from `%APPDATA%\Nova Companion`. If C: is completely full, run `free-c-space.bat` once; Windows itself still needs a little room on C:.

## Run it
1. Install **Node.js 20+** (https://nodejs.org).
2. Double-click **`start.bat`** (needs ~600 MB free on that drive the first time). Run `start.bat debug` to keep a log window.
3. Go to **Settings → AI brain** and connect a **free** option, then click **Test connections**:
   - **Groq** (recommended): free key at console.groq.com/keys. Very fast, and also handles voice input.
   - **OpenRouter**: free key at openrouter.ai/keys. Nova auto-picks a `:free` model.
   - **Ollama**: free, runs on your PC, works offline. Install it from ollama.com, then click a model in Settings to download it (2–5 GB).
   - **Grok (xAI)**: paid key at console.x.ai — auto-picks a fast `grok-4-fast` model. (Note: *Grok* by xAI is a different service from *Groq* above.)
   - Gemini, Claude, OpenAI and any OpenAI-compatible endpoint (e.g. LM Studio) are still supported.

## The app (works fully without AI)
| Group | Sections |
|---|---|
| Plan | **Today** (agenda, tasks, habits, focus, shortcuts, command/search bar) · **Calendar** (events, month view, day agenda, event reminders) · **Reminders** (plain English, repeats, alarms, snooze) · **Tasks** (due dates, priority) |
| Productivity | **Focus** (Pomodoro timer, auto-breaks, weekly stats, stretch/water/eye-rest nudges with quiet hours) · **Habits** (daily targets, streaks, 7-day view) · **Routines** |
| Life | **People** (contacts, birthdays with reminders, call / WhatsApp / email) · **Money** (quick expense log, categories, monthly budget) · **Journal** (daily entries, mood timeline) |
| Tools | World clock · unit & currency converter · countdowns · stopwatch · password generator · calculator |
| Library | **Notes** · **Clipboard history** (searchable, pin, re-copy) · **Shortcuts** (one-click tiles for apps, sites, folders, files or Nova commands) |
| Assistant | **Chat** · **What I can do**. AI is optional and can be switched off in Settings |

The **command bar** on Today searches your tasks, events, reminders, notes, clipboard and shortcuts as you type. Enter runs a command; the result shows right there.

## Desktop companion
Turn it on with the **Nova on desktop** switch (sidebar), Settings, or the tray menu.
- **Click:** quick-ask bubble · **Double-click:** open the app · **Right-click:** quick panel · **Drag:** move it · **Drop** text/files on it
- Replies, reminders and alarms appear as speech bubbles. Click a bubble to open the chat.
- **When a reminder, alarm or event is due, Nova walks over to the middle of the screen, jumps and waves until you click Got it or Snooze, then walks back.** If the companion is off, it appears just for the reminder. You can turn this off in Settings → Desktop companion.
- Transparent areas let clicks through to the windows behind them.

## v7.4 — PA stays, developer is a category, plus a lot more
- **Developer mode no longer hides your personal features.** It's now an **added category**: all your PA sections stay, and a **Developer** group appears in the sidebar alongside them.
- **Clear data / reset** (Settings → Clear data): *Clear my data* wipes content (tasks, reminders, notes, events, habit history, money, journal, reading list, checklists…) but keeps settings, AI keys and the vault; *Full factory reset* wipes everything. Both ask you to type a word to confirm, and you can export a backup first. By voice: "clear all data", "factory reset".
- **Live Activity panel in Chat** — a side panel that shows what Nova is doing in the background, step by step ("Looking at your screen", "Searching YouTube for…", "Opening Notepad"), with timings and ✓/✗ when each finishes. Toggle it with the ⚡ button.

**New personal-assistant features**
- **Reading list** — save links to read later, tag them, open (auto-marks read). "read later <url>", "show reading list".
- **Checklists** — reusable lists you tick off and **reset** to run again (packing, release steps…). "new checklist Packing: passport, charger, meds".
- **Weekly review** — one click summarises your last 7 days: tasks done, focus hours, habit check-ins, water, spending, journal entries. "weekly review".

**New developer tools** (Developer → Text tab): text utilities (slugify, word/char/line count, sort/unique/dedupe/reverse/trim, case), a two-pane **diff** viewer, a persistent **scratchpad**, and **Markdown preview**.

**A livelier avatar**
- It now **roams the whole screen border** — bottom, sides and top — with eased, varied, curious pacing (pauses, look-arounds, cursor curiosity), so it feels alive rather than scripted.
- **More personality**: new idle acts (sniff, ponder, wiggle) and, in developer mode, dev-flavoured idling (typing, pondering, compiling, debugging) plus the dev skin.
- **Points at things**: ask "what's wrong on this screen?" (with AI on) and Nova looks, walks over to the spot, and **points at it**.

## v7.3: Developer edition — a focused workspace
Turning on **Developer mode** now *minimizes the personal app* and foregrounds developer tools. The sidebar collapses to a lean set — Today, Tasks, Reminders, Focus, Notes, Clipboard, Shortcuts, Developer, Chat, Settings — and hides the lifestyle/office sections (Habits, Money, Journal, People, Rewards, Calendar, Usage, Documents, Meetings, SAP, Automations, Widgets, Tools, Routines). Flip *Settings → Show all sections* to keep everything.

The **Developer** section is now a hub with tabs. Everything is offline unless noted.

**Secrets & keys** — hex / base64 / URL-token / API-key / HMAC secrets, memorable passphrases, and **ed25519 / RSA / EC key pairs** (PEM), all from your OS crypto. Say "generate hex secret", "new ed25519 keypair", "generate passphrase 6".

**🔒 API key vault** — store API keys and secrets **encrypted** on the machine (AES-256-GCM, scrypt), unlocked by one passphrase. Copying a secret auto-clears the clipboard after ~25 s. "lock vault" locks it.

**📱 QR codes** — generate a real, scannable QR for a URL, Wi-Fi string or any text, fully offline, and save it as SVG. "make a qr for https://…", or `WIFI:T:WPA;S:Net;P:pass;;`. (The generator is verified against a real decoder.)

**Run & watch** —
- **Run a command** in a repo and see the output ("run npm run build").
- **Command workflows** — save a named sequence of commands and run it here or by voice ("run workflow deploy"), in-app or in a real terminal.
- **File / folder watch** — Nova nudges you when a tracked path changes ("watch C:\Projects\app\dist").

**HTTP & ports** —
- **HTTP request runner** — method, URL, headers, body → status, timing, pretty JSON (great against localhost).
- **Listening ports** with PID + process name, and **free a port** / kill a PID ("list ports", "kill port 3000").
- **Dev/system info** — Electron/Chromium/Node/npm/git versions, OS, CPU/RAM, LAN IP ("dev info").

**Converters** — JSON → **TypeScript interface** or **ABAP structure**, .env ⇄ JSON, JSON ⇄ query-string, HTML entity encode/decode, colour **contrast (WCAG)** and **shade ramps**, and **mock/test data** (names, emails, UUIDs, user rows).

New dev avatar acts cover these too (type, commit, debug, ship). Command palette (**Ctrl+Shift+P**) reaches every tool.

## v7.2: Developer edition 👨‍💻
Flip **Developer mode** (Settings → Appearance & developer, say "developer mode on", or the command palette) and Nova turns into a coder's tool — same app, nothing lost.

- **Developer avatar skin** — dark "terminal" robot: green eyes + core, coder glasses, headset, a blinking `>_` prompt and faint binary code-rain. New animations: *type, commit, debug, ship*. It reacts to dev actions (taps away when you format JSON, commits when you run git status, launches a rocket when you open your editor).
- **Dark theme** — auto with developer mode, or force light/dark in Settings.
- **Dev toolbox (all offline, nothing leaves your machine)** — in the **Developer** section, or by voice/typing. Each works on the text box or your clipboard and copies the result:
  - `format json` / `minify json`
  - `decode jwt <token>` (header + payload + exp, never verifies a signature)
  - `base64 encode/decode`, `url encode/decode`
  - `sha256 of <text>` / `md5 <text>` (also sha1, sha512)
  - `uuid` (or `uuid x5`), `random password 24`
  - `epoch 1700000000` / `to epoch friday 5pm`
  - `cron 0 9 * * 1-5` → the next 5 run times
  - `camel case <text>` / `constant case <text>` (+ pascal, snake, kebab)
  - `hex to rgb #3D7EFF`, `number bases of 255`
  - `regex /\d+/ on <text>` → matches + capture groups
- **Snippet manager** — save code snippets and have Nova **type them into any app** ("insert snippet abap-sel") or copy them. Manage them in the Developer section.
- **Smart clipboard** — copy a JWT, JSON, base64, a URL or a hex colour and Nova offers the exact decode/format action (app toast + avatar bubble).
- **Command palette** — **Ctrl+Shift+P** anywhere: fuzzy-jump to any section, command or snippet.
- **Launcher** — "open vscode", "open terminal", "git status", "localhost:3000". Set your editor command and repo paths in the Developer section (the first repo is the default for Git/Terminal).

All of this is offline; the optional AI still layers on top for free-form help.

## v7.1: run it from a USB stick (portable)
Nova can run on any Windows 10/11 PC straight from a USB — no Node.js, no install, nothing left on the host.

**Build the USB (once, on a PC where Nova already runs):**
1. Run `start.bat` once so the Electron runtime is present.
2. Run **`make-usb.bat`** and point it at your USB (e.g. `E:` or `E:\Nova`). It assembles a self-contained `Nova.exe` + `resources\app` + your `data` folder.

**On any PC:** open the USB and double-click **`Nova.exe`** (or `Start Nova.bat`). Nova and the avatar come up; all settings, tasks and reminders live in the `data\` folder on the USB. Quit with **tray → Safe eject** before unplugging.

**Auto-launch on a PC you own (optional, honest):** Windows deliberately disables true USB autorun (it's how USB malware spreads), so no USB can run itself on an unknown machine. For computers *you* own you can install a tiny consent-based watcher — run `tools\Install auto-launch (this PC).bat` once on that PC. After that, plugging the USB in starts Nova within a few seconds. Remove it any time with `tools\Remove auto-launch (this PC).bat`. It's host-resident (keeps working after you unplug) and only ever starts the `Nova.exe` you put on the USB.

**Portable key security:** Windows' normal key encryption (DPAPI) only works on the PC that wrote it, so on the USB your AI keys are protected by a **PIN** instead (AES-256-GCM, set under Settings → Portable security). On a new PC Nova asks for the PIN once to unlock AI; skip it and the PA features still work. You can also choose "store without a PIN" (keys only lightly obfuscated — fine if the drive stays with you).

**What travels / what doesn't:** reminders, tasks, calendar, notes, habits, money, journal, the avatar, voice output, hotkeys and all offline commands work on any PC with internet for free AI (Groq/OpenRouter). Outlook sync needs Outlook on the host; the SAP launcher needs SAP GUI. On locked-down office PCs, IT policy can block running from USB or restrict PowerShell (which would disable mouse/keyboard control, screen-text OCR and offline voice — the rest still works). First run on each PC may show SmartScreen → **More info → Run anyway**.

## v7: works with any sentence, no AI needed
Type or say things the way you'd say them to a person. With AI switched off, Nova still handles them:

| You type | Nova does |
|---|---|
| remind me every hour to drink 1 glass of water · drink water every 2 hours · i want to drink water every 30 minutes | Repeating reminder (frequent repeats stay quiet during your quiet hours). The alert has a **💧 Drank it** button that logs the glass. |
| take medicine at 9 pm daily · every monday at 10 send weekly report · remind me on the last day of the month to file GST | Repeating reminder |
| call mom at 6 · in 20 min tell me to check the oven · after 2 hours remind me to stretch · set a reminder for 4 o'clock to join the call | Reminder |
| buy milk · pay electricity bill by friday · prepare MOM for Motherson call | Task (with a due date if you gave one) |
| team meeting tomorrow 10 to 11 · i have a dentist appointment on 28th at 4 pm | Calendar event |
| move my dentist appointment to friday · cancel my 3pm meeting | Moves or deletes the event (also works for reminders and tasks) |
| note to self: renew passport · save this idea: … | Note |
| had my water · log 3 glasses · done with BOE review · how much did i spend on food this month | Logs water / ticks off the task / filters spending |
| start a 25 minute focus session · i need to focus for an hour · take a 5 min break | Focus / break timer |
| i'm going for lunch · brb · i'm back · good night | Away mode (quiet, auto-ends), welcome-back summary, good-night recap |

- **Nothing gets lost:** if Nova really can't tell what you mean, it shows buttons: ✅ Add as task · 📝 Save as note · 🔔 Remind me in 1 hour · 🌅 Tomorrow 9 am · 🔎 Search my stuff · 🌐 Search the web.
- **Undo anything:** every add/change shows **↩ Undo** (or say "undo that").
- Every reply links to the right page (**Open Reminders ›**, **Open Tasks ›**…).

## v7: the avatar is connected to everything
- **Reacts to what you do in the app** (buttons, chat, voice): sips from a cup when you log water, cheers with confetti when you finish a task or habit, writes on a notepad for new tasks/notes/expenses, nods with a ✓ for reminders and events, rings a bell for alerts, waves a moon for good night.
- **Status pill** above its head: 🎯 focus countdown, ● REC while a meeting records, ✎ dictating, 📅 next meeting in 15 min, 🔕 DND, 🍱 away. Click it to open that page.
- **Auto outfits:** headphones during focus, a blinking red antenna while recording, sleepy eyes while you're away.
- **Quick panel has tabs** (right-click the avatar or `Alt+Shift+Q`): **Actions** · **Today** (schedule + tick off tasks + add a task) · **Habits** (progress bars with + buttons).
- **Drag & drop onto Nova:** drop text, a link or files on the avatar and choose Task / Note / Remind in 1h / Search / Open / Pin as shortcut.
- **Replies come to the avatar** when the app is in the background (hotkey voice commands, phone, automations).
- **Smart alert buttons:** water reminders get "💧 Drank it", reminders that match a task get "✅ Mark done", hourly reminders get "Stop".
- Switches for all of this: Settings → Desktop companion.

## v6 features
| Feature | Where | Say / do |
|---|---|---|
| **Outlook (this PC)**: calendar sync with Teams "Join" button, unread mail, email drafts (never sends) | Settings → Outlook | "sync outlook", "check my email", "draft an email to Vivek about …" |
| **SAP launcher** (SAP GUI's sapshcut.exe) | SAP page: add systems + favourites | "open VA01 in PRD", "sap SE38", "tcode /BRI/EXIM_MWR" |
| **Document finder**: searches inside PDF/Word/Excel/PowerPoint/text in chosen folders, offline | Documents page | "find file Motherson Annexure B", "find the BOE for invoice 4471" |
| **Grab text from screen** (Windows OCR, offline) | Alt+Shift+T, tray | "grab text from screen" |
| **Automations** (if this, then that): time, new file in folder, app starts / focused, battery low, Wi-Fi, clipboard pattern, startup, back at PC | Automations page (8 templates) | "run automation …" |
| **Downloads tidier** (moves only, undoable) | Tray, automations | "tidy my downloads", "undo tidy" |
| **Day planner + rollover** | Today → Day planner; Settings → Day planner | "plan my day", "plan tomorrow", "add plan to calendar" |
| **Usage dashboard + focus guard** (minimises distracting apps/sites during focus) | Usage page | "screen time", "app usage this week" |
| **Rewards**: XP, levels, outfits for Nova (glasses, cap, scarf, headphones, bow tie, shades, crown, sparkles…) | Rewards page | "my level", "wear the glasses" |
| **Nova visits your window**: walks over, climbs up and sits on the window you're using | Automatic (Normal/Playful), Settings button | "come here", "visit my window" |
| **Phone** (free ntfy app): reminders to phone, commands from phone | Settings → Phone | "send to my phone: …" |
| **Meeting notes**: records mic + computer audio, transcribes (Groq free / Windows offline), summary + action items → tasks | Meetings page | "record this meeting", "stop recording" |
| **Desktop widgets**: sticky note, task list, agenda, countdown, clock, water | Widgets page | "pin a sticky note on my desktop: …", "add tasks widget" |

## Everyday actions without AI
- **Quick actions:** right-click the desktop Nova (or press `Alt+Shift+Q`) for one-click 💧 water, 🔔 reminders with time chips (in 10 min, 1 hour, tonight 8 PM, tomorrow 9 AM, or pick a time), ⏱ timers, 🎯 focus, ✅ tasks, 📝 notes, 🎙 talk and 📸 screenshot.
- **Water:** `Alt+Shift+W` logs a glass from anywhere. You can also say "drink water", "had 2 glasses", "drank 500 ml", "how much water today", "set water goal to 10" or "remind me to drink water every hour".
- **Offline understanding:** many phrasings ("ping me in 10 minutes to…", "check the oven in 10 minutes", "put milk on my to-do list", "max volume") and typos ("remnd me tomorow at 5…") work without AI. If Nova isn't sure, it asks "Did you mean …?" with Yes/No buttons.

## Nova's personality
- **Wanders** along the bottom of the screen now and then, looks around, and sometimes hangs out in a new spot before walking home.
- **Curious moments:** looks around, tilts its head, stretches, yawns, dances, hops and peeks. It notices your cursor when it comes close (shows a "?" and waves) and gets happy (with hearts) if you hover over its head.
- **Away/back:** dozes off when your PC has been idle for 10 minutes, then says "Welcome back" with a short catch-up.
- **Thought bubbles:** occasional helpful nudges (next meeting, habits, tasks, countdowns, birthdays), at most every ~20–30 minutes.
- **Liveliness:** Calm / Normal / Playful, plus switches for each behaviour in Settings. **Do Not Disturb** (tray, Settings, or "do not disturb on") pauses all of this; reminders still come through. Nova also stays still during focus sessions.

## Doing several things at once
- `mute, open excel and set a 25 min timer` runs instantly on your PC, without calling the AI.
- `open notepad and write a leave note for Monday`: the AI plans the steps, acts, checks the screen, and continues.
- Requests run in parallel. Say **"stop"** to cancel everything that's running.

## Talking to Nova
Say **"Hey Nova"** (offline wake word), right-click the companion, press `Alt+Shift+V`, or click a mic button. Say **"start dictation"** to type by voice into any app.

## Files
```
src/main.js        windows (app + companion), tray, hotkeys, IPC
src/brain.js       concurrent request engine, AI agent loop, shared conversation, alerts
src/commands.js    instant intent parser + all actions (PC, reminders, tasks, notes, routines…)
src/when.js        natural-language dates ("every Monday at 9", "on 25 Dec", "tomorrow morning")
src/scheduler.js   reminders / alarms / timers with repeats
src/ai.js          Gemini / Claude / OpenAI streaming, vision, model auto-discovery, speech-to-text
src/ps.js          persistent PowerShell bridge (audio, mouse, keyboard, window focus)
src/wake.js        offline wake word · src/info.js weather, calculator, dates
src/renderer/app/        main app UI
src/renderer/companion/  desktop character + speech bubbles
src/renderer/shared/     avatar, voice/TTS, session logic
```
Your data (settings, reminders, tasks, notes, chat) lives in `%APPDATA%\Nova Companion\settings.json`. API keys are encrypted with Windows DPAPI.
