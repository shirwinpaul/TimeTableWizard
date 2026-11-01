import { slotOf, type Placement, type Project, type Timetable } from "@/lib/model/schema";
import { buildCtx } from "./context";
import { construct } from "./construct";
import { explainUnplaced, type Unplaced } from "./explain";
import { improve } from "./improve";
import { precheck, type Problem } from "./precheck";
import { Rng } from "./rng";
import { scoreBreakdown, weightsOf, type ScoreBreakdown } from "./score";
import { State, unitOfPlacement } from "./state";
import { validate, type ValidationResult } from "./validator";

/** Solver entry point: pre-check → construct → improve → validate. */

export interface SolveOptions {
  /** Hard time cap (ms). Default 20 s, UI allows 5–120 s. */
  timeLimitMs?: number;
  mode?: "quick" | "best";
  seed?: number;
  /** Placements to keep fixed (locked cells). */
  locks?: Placement[];
  /** Skip the pre-check gate (used by tests of the search itself). */
  skipPrecheck?: boolean;
}

export type SolveProgress =
  | { phase: "construct"; placed: number; total: number; elapsedMs: number }
  | { phase: "improve"; percent: number; bestScore: number; elapsedMs: number };

export interface SolveResult {
  status: "solved" | "partial" | "infeasible";
  timetable: Timetable | null;
  problems: Problem[];
  unplaced: Unplaced[];
  score: ScoreBreakdown | null;
  validation: ValidationResult | null;
  solveMs: number;
  seed: number;
  startScore: number | null;
}

export const clampTimeLimit = (ms: number) => Math.min(120_000, Math.max(5_000, ms));

/** Generator so callers (worker / tests) decide how to drive and when to stop. */
export function* solveSteps(project: Project, opts: SolveOptions = {}, now: () => number = () => Date.now()): Generator<SolveProgress, SolveResult> {
  const t0 = now();
  const seed = opts.seed ?? 1;
  const deadline = t0 + (opts.timeLimitMs ?? 20_000);
  const mode = opts.mode ?? "quick";
  const pre = precheck(project);
  const empty = (status: SolveResult["status"], problems: Problem[]): SolveResult => ({
    status,
    timetable: null,
    problems,
    unplaced: [],
    score: null,
    validation: null,
    solveMs: now() - t0,
    seed,
    startScore: null,
  });
  if (!pre.ok && !opts.skipPrecheck) return empty("infeasible", pre.problems);

  const ctx = buildCtx(project);
  const rng = new Rng(seed);
  const base = new State(ctx);
  const lockProblems: Problem[] = [];

  // Locked cells first, then lessons' fixed slots; both become locked units.
  for (const pl of opts.locks ?? []) {
    const u = unitOfPlacement(ctx, pl);
    if (u === undefined || base.pos[u] >= 0) continue;
    const r = base.check(u, slotOf(pl.day, pl.period));
    if (!r.ok) {
      lockProblems.push({ severity: "warning", code: "noSlot", message: "A locked cell clashes with another locked cell and was released.", fixes: [], data: {} });
      continue;
    }
    base.place(u, slotOf(pl.day, pl.period), r.rooms);
    base.locked[u] = 1;
  }
  ctx.groups.forEach((g, gi) => {
    const fixed = ctx.lessons[g.lessons[0]].fixedSlots;
    for (const s of fixed) {
      const units = ctx.unitsOfGroup[gi];
      if (units.some((u) => base.pos[u] >= 0 && s >= base.pos[u] && s < base.pos[u] + ctx.units[u].length)) continue;
      // Prefer a single period for a fixed slot; fall back to a double starting there.
      const u = [...units].reverse().find((v) => base.pos[v] < 0 && base.check(v, s).ok);
      if (u === undefined) {
        lockProblems.push({ severity: "warning", code: "noSlot", message: `A fixed slot for ${ctx.names.subjects[ctx.lessonSubject[g.lessons[0]]] ?? "a lesson"} can't be used (it clashes).`, fixes: [], data: {} });
        continue;
      }
      const r = base.check(u, s);
      if (r.ok) {
        base.place(u, s, r.rooms);
        base.locked[u] = 1;
      }
    }
  });

  const units = ctx.units.length;
  const quick = mode === "quick";
  const gen = construct(base, rng, {
    maxIterations: units * (quick ? 60 : 150),
    restartAfter: units * 4,
    deadline: quick ? t0 + Math.min(opts.timeLimitMs ?? 20_000, 15_000) : deadline,
    now,
  });
  let step = gen.next();
  while (!step.done) {
    yield { phase: "construct", placed: step.value.placed, total: step.value.total, elapsedMs: now() - t0 };
    step = gen.next();
  }
  let st = step.value;

  let startScore: number | null = null;
  const allPlaced = st.pos.every((s) => s >= 0);
  if (allPlaced) {
    const weights = weightsOf(project);
    const imp = improve(st, rng, weights, { iterations: quick ? 6_000 : 60_000, deadline, now });
    let s2 = imp.next();
    while (!s2.done) {
      yield { phase: "improve", percent: Math.round((s2.value.iteration / s2.value.iterations) * 100), bestScore: s2.value.bestScore, elapsedMs: now() - t0 };
      s2 = imp.next();
    }
    st = s2.value.state;
    startScore = s2.value.startScore;
  }

  const timetable: Timetable = { placements: st.toPlacements(), seed, generatedAt: new Date().toISOString(), solveMs: now() - t0 };
  const validation = validate(project, timetable, { locks: opts.locks });
  const unplaced = explainUnplaced(st);
  return {
    status: validation.ok ? "solved" : "partial",
    timetable,
    problems: [...pre.problems, ...lockProblems],
    unplaced,
    score: scoreBreakdown(project, timetable),
    validation,
    solveMs: timetable.solveMs,
    seed,
    startScore,
  };
}

/** Run to completion synchronously (tests, scripts). */
export function solve(project: Project, opts: SolveOptions = {}): SolveResult {
  const gen = solveSteps(project, opts);
  let s = gen.next();
  while (!s.done) s = gen.next();
  return s.value;
}
