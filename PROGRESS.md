# Timetable Wizard — Progress

Spec: `TIMETABLEWIZARD_PROJECT_SPEC.md` (the spec calls it `PROJECT_SPEC.md`; same file, kept unchanged).

## Status by phase
- [x] **Phase 1 — Setup**: Next 16.4 (App Router, Turbopack) + TS 5.9 strict, Tailwind 4, Framer Motion, Zod 4, idb-keyval,
  SheetJS 0.20.3 (CDN tarball), Papa Parse, @dnd-kit, @google/genai, Vitest 5. Theme tokens (light/dark), Plus Jakarta Sans + Inter,
  header/footer, landing page with animated grid, start screen, Settings (BYOK) dialog, IndexedDB project storage,
  project store with undo/redo + autosave. `.env.example` / `.env.local` (placeholders only), `.gitignore` covers `.env*.local`.
- [x] **Phase 2 — Data model + sample + validator + scoring**: Zod schema (`src/lib/model/schema.ts`), defaults, fix actions,
  fictional "Sunrise Public School" (12 classes, 23 teachers, combined PE, 11th elective block), validator covering every hard
  violation type, soft scoring + breakdown. Tests: validator (13), scoring (7), model/JSON round-trip/fixes (6).
  Bug found & fixed: `sampleSchool()` shared module-level arrays (now deep-copied).
- [x] **Phase 3 — Solver**: `precheck.ts` (class/teacher/room/double/subject-per-day/no-slot/block checks + fixes),
  `state.ts` (occupancy + `check()` enforcing all hard rules), `construct.ts` (MRV + forward checking + conflict-directed
  backtracking/ejection + tabu + seeded restarts), `improve.ts` (simulated annealing, move/swap, keeps best),
  `explain.ts` (failed-check counts → plain reasons + fixes), `index.ts` (solveSteps generator), `worker.ts`
  (progress, cancel, time limit), `useSolver` hook. Tests: precheck (9), solver (11).
  Performance: sample school ≈0.8 s; generated 20 classes / 35 teachers / 6×8 ≈1.4 s (quick mode).
  Pre-check fix: doubles capacity now counts real non-overlapping double positions per day.
- [x] **Phase 4 — Setup wizard**: 9 steps with progress bar, back/next, autosave (`src/app/project/[id]/setup`).
  `EditableTable` (inline validation, paste from Excel/Sheets, duplicate, delete, bulk edit), availability grids (teacher
  unavailable + preferred free, class off-times), fixed events, breaks, lessons class×subject grid + advanced table
  (doubles, combined classes, elective blocks, group size), rule builder (7 rule types, hard/soft, weight, live preview),
  review + pre-check with one-tap undoable fixes. Cascading deletes (`src/lib/model/edit.ts`).
  Schema relaxed so half-typed rows still save; pre-check reports empty names / incomplete lessons instead.
- [x] **Phase 5 — Views + quality panel**: `src/app/project/[id]/timetable`. Views by class / teacher / room / master / day,
  colour by subject or teacher, compact/detailed, period times + break columns, live validator banner ("✅ Clash-free" only
  when it passes), generate panel (quick/best, 5–120 s, seed, cancel keeps best, animated fill, clash-free reveal),
  quality panel (score breakdown bars, room use %, per-teacher/class tables with per-day mini bars).
- [x] **Phase 6 — Editing**: `src/lib/solver/edit.ts` (drop validity with plain reasons, move/swap, ranked suggestions, soft
  delta = "allow with warning"); @dnd-kit drag with green/amber/red cells + aria-live reason; keyboard alternative via
  selection panel; lock lesson / lock whole class-teacher-room view; "Re-solve the rest" around locks; undo/redo
  (Ctrl+Z / Ctrl+Y); versions save/restore/compare (dashed outline on changed cells). Phones: read-only.
  Tests: edit/views (9).
- [x] **Phase 7 — Import & exports**: CSV/XLSX templates per entity, upload → auto column mapping (aliases) → manual
  mapping → preview with highlighted bad rows → error report by row number → undoable import (same name = update).
  Exports: print/PDF page (`/project/[id]/print`, A4 landscape, header, B&W, every class/teacher/room, master, day,
  substitution sheet), Excel workbook (master + sheet per class/teacher/room), CSV per view, ICS (weekly RRULE, TZID +
  VTIMEZONE, folded CRLF lines), PNG (canvas), project JSON. Tests: import/export (9).
- [x] **Phase 8 — Substitutions**: `src/lib/substitutions.ts` + page. Mark absent (whole day / chosen periods) → affected
  periods → substitutes who are FREE (not teaching, not unavailable, not already covering, under daily max) ranked by
  subject expertise, fewest subs this week, this month, fewest periods today. Auto-assign, log, fairness table, print
  sheet, WhatsApp text (copy). Tests: substitutions (6).
- [x] **Phase 9 — AI layer**: one route `src/app/api/ai/[action]/route.ts` (describe-rule, explain, draft-setup, summarise;
  `maxDuration = 60`), Zod request/response schemas, Gemini (SDK, JSON mode, thinking MINIMAL, 900 max tokens, SDK retries
  off) → Groq fallback (fetch, json_object). 429 → wait retry-after ≤10 s & retry once, else Groq; 5xx/timeout(25 s)/
  network → Groq; invalid JSON/schema → retry once with the error, then Groq. Logs only provider/status/errorType/
  retryAfter. Per-IP limit 40/h (in-memory). BYOK header from Settings. Prompt guard + `<data>` wrapping; teacher names →
  `[T:CODE]` on the client; unknown ids flagged and the rule dropped (never guessed). MOCK_AI dev mode (ignored in
  production). UI: Describe a rule (→ rule builder preview), Explain conflicts (ranked, one-tap Apply + undo), Draft my
  setup (preview → add), Summarise (code-computed stats). Countdown for rate limits, "assistant is resting" otherwise.
  Tests: AI (18).
- [x] **Phase 10 — Polish**: friendly error boundary + 404, arrow-key navigation between grid cells, small-screen header,
  reduced-motion respected, focus rings, aria-live for solver progress / clashes / drag reasons, README (features,
  solver explained, performance, Windows setup, free keys, env vars, Vercel). `.env.local` confirmed git-ignored; no
  real keys in any file. 88 tests passing.
- [x] **Phase 11 — End-to-end check** (real headless Chromium via Playwright, kept outside the project; dev server run with
  `MOCK_AI=true` as a process variable only — `.env.local` never changed). All passed, one feature at a time:
  (a) sample → pre-check → generate → "✅ Clash-free" + score breakdown; (b) impossible input (40 Maths periods) →
  3 plain-language problems + one-tap fixes + mock "Explain"; (c) drag onto invalid cell blocked with reason, valid drag
  moved, 2 cells locked, re-solve kept them; (d) teacher absent → ranked free substitutes → auto-assign → print sheet +
  WhatsApp text; (e) CSV import with error report, XLSX, ICS (40 events), PNG, 14-page A4 PDF; (f) Describe a rule (mock)
  incl. unknown name "Zorro" flagged; (g) dark mode + 360 px phone (read-only, no page overflow). Then restarted normally:
  MOCK_AI=false confirmed (AI answers "resting" with placeholder keys).
  Bugs found & fixed during E2E: auto-generate didn't start under React dev double-mount; drop highlights were hidden
  under lesson chips; misleading "class busy" reason when a swap failed for another reason; Export menu stayed open and
  hid the ICS dialog; AI "Must/Prefer" choice not carried into the rule builder; fixed events missing from PNG.

**All phases complete.** 88 unit tests passing; typecheck, lint and production build clean.

## Decisions
- TypeScript pinned to 5.x (npm "latest" was 7.0, not yet safe with Next's build).
- Slots = `day * 16 + period` (period = index of TEACHING period; breaks sit "after" a period).
- Consecutive-period limit: lunch resets the run, short breaks don't.
- AI models (checked 2026-10-24, free tier): Gemini `gemini-3.6-flash` (thinking MINIMAL), Groq `llama-3.3-70b-versatile`. All in `src/config/ai.ts`.
- Port 3000 was already used by another node process on this PC (not started by us), so the dev server picked 3002.

## Next
Phase 2 tests (model, sample school, validator, scoring).
