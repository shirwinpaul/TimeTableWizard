import { MAX_PERIODS, slotOf } from "@/lib/model/schema";
import type { Rng } from "./rng";
import { totalScore, type Weights } from "./score";
import type { State } from "./state";

/**
 * Phase B — improve quality with simulated annealing.
 *
 * Moves (each re-checked with State.check, so hard constraints are never broken):
 *  - move: put one unit in another allowed slot;
 *  - swap: exchange the slots of two same-length units of the same class.
 * Worse moves are sometimes accepted early on (temperature) to escape local minima.
 * The best state ever seen is restored at the end, so the result is never worse
 * than the starting timetable.
 */

export interface ImproveProgress {
  phase: "improve";
  iteration: number;
  iterations: number;
  score: number;
  bestScore: number;
}

export interface ImproveOptions {
  iterations: number;
  deadline: number;
  now: () => number;
}

export function* improve(st: State, rng: Rng, weights: Weights, opts: ImproveOptions): Generator<ImproveProgress, { state: State; startScore: number; score: number }> {
  const ctx = st.ctx;
  const W = 6 * MAX_PERIODS;
  const movable: number[] = [];
  for (let u = 0; u < ctx.units.length; u++) if (st.pos[u] >= 0 && !st.locked[u]) movable.push(u);
  const startScore = totalScore(ctx, st.pos, weights);
  let cur = startScore;
  let best = cur;
  let bestPos = st.pos.slice();
  let bestRooms = st.rooms.map((r) => r.slice());
  if (!movable.length || cur === 0) return { state: st, startScore, score: cur };

  const T0 = Math.max(1, cur * 0.01);
  const accept = (delta: number, T: number) => delta <= 0 || rng.next() < Math.exp(-delta / T);

  for (let i = 0; i < opts.iterations; i++) {
    if (i % 500 === 0) {
      yield { phase: "improve", iteration: i, iterations: opts.iterations, score: cur, bestScore: best };
      if (opts.now() > opts.deadline) break;
    }
    const T = T0 * Math.pow(0.002, i / opts.iterations);
    const u = movable[rng.int(movable.length)];
    const oldS = st.pos[u];
    const oldR = st.rooms[u].slice();

    if (rng.next() < 0.6) {
      const s = rng.pick(st.domains[u]);
      if (s === oldS) continue;
      st.remove(u);
      const r = st.check(u, s);
      if (!r.ok) {
        st.place(u, oldS, oldR);
        continue;
      }
      st.place(u, s, r.rooms);
      const next = totalScore(ctx, st.pos, weights);
      if (accept(next - cur, T)) cur = next;
      else {
        st.remove(u);
        st.place(u, oldS, oldR);
      }
    } else {
      // Swap with another unit of one of u's classes.
      const grp = ctx.groups[ctx.units[u].group];
      if (!grp.classes.length) continue;
      const c = rng.pick(grp.classes);
      const d = rng.pick(ctx.workingDays);
      const p = rng.int(ctx.dayPeriods[d]);
      const v = st.classOcc[c * W + slotOf(d, p)];
      if (v < 0 || v === u || st.locked[v] || ctx.units[v].length !== ctx.units[u].length) continue;
      const vS = st.pos[v];
      const vR = st.rooms[v].slice();
      if (vS === oldS) continue;
      st.remove(u);
      st.remove(v);
      const ru = st.check(u, vS);
      if (!ru.ok) {
        st.place(u, oldS, oldR);
        st.place(v, vS, vR);
        continue;
      }
      st.place(u, vS, ru.rooms);
      const rv = st.check(v, oldS);
      if (!rv.ok) {
        st.remove(u);
        st.place(u, oldS, oldR);
        st.place(v, vS, vR);
        continue;
      }
      st.place(v, oldS, rv.rooms);
      const next = totalScore(ctx, st.pos, weights);
      if (accept(next - cur, T)) cur = next;
      else {
        st.remove(u);
        st.remove(v);
        st.place(u, oldS, oldR);
        st.place(v, vS, vR);
      }
    }
    if (cur < best) {
      best = cur;
      bestPos = st.pos.slice();
      bestRooms = st.rooms.map((r) => r.slice());
      if (best === 0) break;
    }
  }

  // Restore the best state: un-place all movable units, then re-place from the snapshot.
  for (const u of movable) st.remove(u);
  for (const u of movable) if (bestPos[u] >= 0) st.place(u, bestPos[u], bestRooms[u]);
  return { state: st, startScore, score: best };
}
