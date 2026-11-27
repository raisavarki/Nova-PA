# Nova v8.5 — 20 new features

## Phone (all 20, verified)
1. Global search — one tap in the top bar finds anything across tasks,
   reminders, notes, links, journal, money and countdowns.
2. Calculator (Tools) — "18% of 45000", "(1200+350)*12".
3. Converter (Tools) — "10 km to miles", "100 usd to inr", "30 c to f".
4. Timer & stopwatch (Tools) — presets that alert you even off-screen.
5. Password generator (Tools) — strong password, one-tap copy.
6. World clock (Tools) — Kolkata, London, New York, Dubai.
7. Countdowns (Tools) — days to go-lives, deadlines.
8. SAP quick codes (Tools) — save your T-codes, tap to copy.
9. Breathe — a 4-7-8 guided breathing reset.
10. Daily brief — "Brief" on Today sums up your day (and can read it aloud).
11. Share your day — send today's tasks + reminders as text.
12. Recurring tasks — add "every Monday"/"daily"/"monthly"; completing one
    schedules the next automatically (🔁).
13. Pin tasks — keep important ones at the top (📌).
14. Tags — write #boe, #moowr in a task; filter by tag chips.
15. Task edit sheet — tap a task to rename, reschedule, set priority,
    repeat, pin, add subtasks, or delete.
16. Subtasks — break a task into steps with their own checkboxes.
17. Reminder snooze presets — 10 min / 1 hour / tonight / tomorrow.
18. Habit streaks — 🔥 current streak + best streak; edit or delete habits.
19. Note templates — Meeting notes (MOM), Daily plan, Standup.
20. Auto theme — a "follow time of day" theme that goes dark in the evening.

## Computer (exe)
Most of these already exist on the desktop (world clock, converter,
calculator, password generator, countdowns, SAP launcher, global search,
weekly review, snippets/templates, habit streaks, auto theme). New on the
desktop to match the phone:
- 🫧 Breathe (4-7-8) — in Focus → Breaks & wellbeing.
- 📌 Pin tasks to the top — a Pin button on each task.

I can port the deeper task features (recurring, tags, subtasks, task-edit
sheet) to the desktop next — they touch its command pipeline, so they want
their own careful pass.

All phone features were verified end-to-end in a browser with no errors
(including recurring auto-regeneration, countdown/SAP add, calculator and
converter results, search, breathing, and the task-edit sheet).
