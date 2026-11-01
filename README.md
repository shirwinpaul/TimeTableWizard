# Timetable Wizard 🧙‍♂️📅

**Clash-free school & college timetables in seconds, not weeks.**

Enter (or import) your days, periods, classes, subjects, teachers and rooms, add your rules, and a tested
constraint solver builds a timetable where no teacher, class or room is ever double-booked. Then view it by
class, teacher or room, drag to adjust with live clash checks, lock cells and re-solve, manage daily
substitutions, and export to PDF, Excel/CSV, calendar (.ics) or an image.

> Screenshot placeholders: `docs/landing.png` · `docs/timetable.png` · `docs/substitutions.png`

## Features
- **Guided setup wizard** (9 steps, autosave) with spreadsheet-like tables: paste from Excel, duplicate rows, bulk edit, inline validation.
- **Import** CSV/XLSX templates with column mapping and a row-by-row error report.
- **Rule builder** (no AI needed): subject only in certain periods, teacher/class unavailable, not after lunch, not first/last period, max per day — hard ("must") or soft ("prefer", weight 1–10).
- **Pre-check** that explains impossible input *before* solving, with one-tap fixes (undoable).
- **Solver** in a Web Worker: progress, cancel (keeps the best so far), time limit 5–120 s, quick / best quality, seed.
- **Views**: by class, teacher, room, master grid, day view; colour by subject or teacher; compact/detailed.
- **Editing**: drag-and-drop (green = valid, amber = allowed with warning, red = blocked with the reason), swap suggestions ranked by score, lock cells or whole rows, "re-solve the rest", undo/redo (Ctrl+Z / Ctrl+Y), named versions with compare.
- **Quality panel**: score breakdown per soft rule, teacher/class stats, lab use.
- **Substitution manager**: free teachers ranked by subject, fairness and load; log, fairness stats, printable sheet, WhatsApp text.
- **Exports**: PDF (print stylesheet, A4 landscape, black-and-white option), Excel/CSV, .ics, PNG, project JSON backup.
- **Optional AI assistant** (free Gemini, Groq fallback): Describe a rule, Explain conflicts, Draft my setup, Summarise.

## Principles
1. **The solver is the source of truth.** Every timetable is re-checked by an independent validator; "✅ Clash-free" appears only when it passes. The AI never builds timetables.
2. **Never pretend.** Impossible input is explained before solving; partial results list what's missing and why.
3. **You stay in control.** Locks and fixed slots are respected; every change can be undone.
4. **Fast.** Solving runs in a Web Worker — the page never freezes.
5. **Private.** School data stays in your browser (IndexedDB). Only text you send to the assistant leaves your device, with teacher names replaced by codes.
6. **Works without AI** and offline after the first load.

## How the solver works (simply)
1. **Pre-check** — counts demand vs. supply: each class's and teacher's periods vs. available slots and limits, lab periods vs. labs, double periods vs. consecutive free slots, subject-per-day limits vs. periods per week. Problems get plain messages and suggested fixes.
2. **Construct** — places lessons one at a time, always picking the *hardest* one next (fewest possible slots: doubles, labs, part-time teachers — "MRV"). After each placement it checks no other lesson is left with nowhere to go ("forward checking"). If a lesson is stuck, it moves the fewest conflicting lessons out of the way and puts them back in the queue (conflict-directed backtracking), with seeded random tie-breaks and restarts.
3. **Improve** — simulated annealing moves and swaps lessons, only ever through moves that keep every hard rule, to lower the soft-rule penalty (spread across the week, heavy subjects in the morning, fewer teacher gaps, balanced days, time preferences, not always last period, your custom rules). The best timetable seen is kept, so it never gets worse.
4. **Validate** — an independent checker re-verifies every hard rule from scratch.

Same seed + same data → same timetable.

## Performance (measured on this project's test machine)
| Case | Size | Result |
|---|---|---|
| Sample "Sunrise Public School" | 12 classes, 23 teachers, Mon–Fri 8 + Sat 4 | solved clash-free in ≈0.8 s (quick mode) |
| Generated typical school | 20 classes, 35 teachers, 6 days × 8 periods | solved clash-free in ≈1.4 s (quick mode) |

"Best quality" mode spends more of the time limit improving the score.

## Setup (Windows, beginner-friendly)
1. Install **Node.js 20 or newer** from <https://nodejs.org> (LTS).
2. Open the project folder in VS Code → **Terminal → New Terminal**.
3. Install: `npm.cmd install`
4. Start: `npm.cmd run dev` → open <http://localhost:3000> (if that port is busy, the terminal shows another, e.g. 3002).

If PowerShell says scripts are disabled, use `npm.cmd` instead of `npm` (as above).

Other commands: `npm.cmd test` (unit tests), `npm.cmd run typecheck`, `npm.cmd run lint`, `npm.cmd run build`.

## Free AI keys (optional)
The app works fully without AI. To enable the assistant:
- **Gemini (primary):** <https://aistudio.google.com/apikey> → *Create API key*.
- **Groq (fallback):** <https://console.groq.com/keys> → *Create API Key*.

Put them in `.env.local` (never commit this file — it is git-ignored):
```
GEMINI_API_KEY=your-gemini-key
GROQ_API_KEY=your-groq-key
MOCK_AI=false
```
Restart `npm.cmd run dev` after editing. Users can also add their **own** Gemini key in ⚙️ Settings (stored only in their browser).

### Environment variables
| Name | Meaning |
|---|---|
| `GEMINI_API_KEY` | Server-side Gemini key (primary). |
| `GROQ_API_KEY` | Server-side Groq key (fallback). |
| `MOCK_AI` | `true` = fake, offline AI answers for development/testing. Ignored in production builds. |

Model IDs and limits live in one file: `src/config/ai.ts`.

**Notes:** AI routes are rate-limited per IP (40 calls/hour). This limit is kept in memory, so on serverless hosting it is *best-effort* (each server instance counts separately). On a Gemini rate limit the app waits up to ~10 s and retries once, then falls back to Groq; it also falls back on server errors, timeouts (>25 s) or invalid replies. Logs contain only the provider, status, error type and retry-after — never keys or school data.

## Deploy to Vercel (free Hobby plan)
1. Push the project to a GitHub repository (`.env.local` is ignored, so keys are not uploaded).
2. On <https://vercel.com> → **Add New → Project** → import the repository (framework: Next.js, defaults are fine).
3. In **Settings → Environment Variables** add `GEMINI_API_KEY` and `GROQ_API_KEY` (leave `MOCK_AI` unset or `false`).
4. Deploy. AI routes set `maxDuration = 60` (allowed on Hobby); requests are small JSON (well under the 4.5 MB limit).

## Project structure
```
src/app            pages (landing, start, project/[id]/setup|timetable|substitutions|import|print) + api/ai
src/components     UI (tables, grids, panels, AI buttons)
src/lib/model      Zod data model, defaults, fixes, rules
src/lib/solver     precheck, context, state, construct, improve, score, validator, explain, edit, worker
src/lib/export     sheets (XLSX/CSV), ics, png, project JSON
src/lib/import     templates, mapping, parsing
src/lib/ai         schemas, providers, retry/fallback runner, prompts, guard, mock
src/config/ai.ts   all AI provider settings
src/data           fictional sample school
tests/             Vitest unit tests
```

All sample data is fictional. Built by Anand Raj.
