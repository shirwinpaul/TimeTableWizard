import { dayOf, periodOf } from "@/lib/model/schema";
import type { Ctx } from "./context";
import type { Rng } from "./rng";
import { State } from "./state";

/**
 * Phase A — build a valid (clash-free) timetable.
 *
 * Constraint-satisfaction search over unit placements:
 *  - MRV: always place the unit with the FEWEST currently-feasible slots next
 *    (doubles, labs and part-time teachers naturally go first).
 *  - Forward checking: after a tentative placement, if a neighbouring unplaced unit is
 *    left with no feasible slot, try the next value instead.
 *  - Conflict-directed backtracking: when a unit has no feasible slot at all, we pick
 *    the slot that conflicts with the fewest placed units, un-place those ("eject" them)
 *    and put them back on the queue. A small tabu list stops ping-ponging.
 *  - Randomised (seeded) tie-breaking, and a restart when progress stalls.
 */

export interface ConstructProgress {
  phase: "construct";
  placed: number;
  total: number;
  restarts: number;
  iteration: number;
}

export interface ConstructOptions {
  maxIterations: number;
  /** Iterations without a new best before restarting from scratch. */
  restartAfter: number;
  deadline: number;
  now: () => number;
}

type Snapshot = { pos: Int32Array; rooms: number[][] };

/** Groups that share a teacher, class or possible room with each group. */
export function neighbourGroups(ctx: Ctx): number[][] {
  const by = new Map<string, number[]>();
  const push = (k: string, g: number) => {
    const a = by.get(k);
    if (a) a.push(g);
    else by.set(k, [g]);
  };
  ctx.groups.forEach((grp, g) => {
    for (const t of new Set(grp.teachers)) push(`t${t}`, g);
    for (const c of grp.classes) push(`c${c}`, g);
    for (const li of grp.lessons) {
      const need = ctx.lessonRoom[li];
      if (need.kind === "fixed") push(`r${need.room}`, g);
      if (need.kind === "type") for (const r of need.candidates) push(`r${r}`, g);
    }
  });
  const out: Set<number>[] = ctx.groups.map(() => new Set());
  for (const list of by.values()) for (const a of list) for (const b of list) if (a !== b) out[a].add(b);
  return out.map((s) => [...s]);
}

/**
 * Units that must be removed so `u` can start at `slot`, or null if impossible
 * (static ban, or a locked unit is in the way). With `commit=false` the state is
 * restored before returning.
 */
export function conflictsFor(st: State, u: number, slot: number, rng: Rng, commit: boolean): number[] | null {
  const removed: { v: number; slot: number; rooms: number[] }[] = [];
  const restore = () => {
    for (let i = removed.length - 1; i >= 0; i--) st.place(removed[i].v, removed[i].slot, removed[i].rooms);
  };
  let ok = false;
  for (let k = 0; k < 10; k++) {
    const r = st.check(u, slot);
    if (r.ok) {
      ok = true;
      break;
    }
    if (r.reason.code === "banned") break;
    const free = r.reason.blockers.filter((b) => b !== u && st.pos[b] >= 0 && !st.locked[b]);
    if (!free.length) break;
    const occupancy = r.reason.code === "teacherBusy" || r.reason.code === "classBusy" || r.reason.code === "roomBusy";
    if (occupancy && free.length < r.reason.blockers.filter((b) => b !== u).length) break;
    const victims = occupancy ? free : [rng.pick(free)];
    for (const v of victims) {
      removed.push({ v, slot: st.pos[v], rooms: st.rooms[v].slice() });
      st.remove(v);
    }
  }
  if (!ok || !commit) {
    restore();
    return ok ? removed.map((x) => x.v) : null;
  }
  return removed.map((x) => x.v);
}

export function* construct(base: State, rng: Rng, opts: ConstructOptions): Generator<ConstructProgress, State> {
  const ctx = base.ctx;
  const nU = ctx.units.length;
  const neigh = neighbourGroups(ctx);
  const total = nU;
  let best: Snapshot | null = null;
  let bestUnplaced = Infinity;
  let iteration = 0;
  let restarts = 0;
  let stuckEnds = 0;

  const snapshot = (st: State): Snapshot => ({ pos: st.pos.slice(), rooms: st.rooms.map((r) => r.slice()) });

  while (true) {
    const st = base.clone();
    const unplaced = new Set<number>();
    for (let u = 0; u < nU; u++) if (st.pos[u] < 0) unplaced.add(u);
    const count = new Int32Array(nU);
    const dirty = new Uint8Array(nU).fill(1);
    const tabu = new Map<string, number>();
    const stuck = new Set<number>();
    let localBest = unplaced.size;
    let sinceImprove = 0;

    const markDirty = (u: number) => {
      const g = ctx.units[u].group;
      for (const v of ctx.unitsOfGroup[g]) dirty[v] = 1;
      for (const ng of neigh[g]) for (const v of ctx.unitsOfGroup[ng]) dirty[v] = 1;
    };
    const refresh = (u: number) => {
      if (dirty[u]) {
        count[u] = st.feasibleCount(u, 12);
        dirty[u] = 0;
      }
      return count[u];
    };
    const dayLoad = (u: number, day: number) => {
      let n = 0;
      for (const v of ctx.unitsOfGroup[ctx.units[u].group]) if (v !== u && st.pos[v] >= 0 && dayOf(st.pos[v]) === day) n++;
      return n;
    };

    while (unplaced.size > stuck.size) {
      iteration++;
      if (iteration % 100 === 0) {
        yield { phase: "construct", placed: nU - unplaced.size, total, restarts, iteration };
        if (opts.now() > opts.deadline || iteration > opts.maxIterations) break;
      }

      // MRV with seeded tie-breaking.
      let u = -1;
      let bestKey = Infinity;
      for (const v of unplaced) {
        if (stuck.has(v)) continue;
        const key = refresh(v) * 4 - ctx.units[v].length + rng.next();
        if (key < bestKey) {
          bestKey = key;
          u = v;
        }
      }
      if (u < 0) break;

      if (count[u] > 0) {
        // Value ordering: spread across days, heavy subjects early, then random.
        const grp = ctx.groups[ctx.units[u].group];
        const heavy = grp.lessons.some((li) => ctx.project.subjects[ctx.lessonSubject[li]]?.heavy);
        const values: { s: number; rooms: number[]; key: number }[] = [];
        for (const s of st.domains[u]) {
          const r = st.check(u, s);
          if (!r.ok) continue;
          const d = dayOf(s);
          let key = dayLoad(u, d) * 3 + rng.next();
          if (heavy && periodOf(s) >= Math.ceil(ctx.dayPeriods[d] / 2)) key += 1;
          values.push({ s, rooms: r.rooms, key });
        }
        values.sort((a, b) => a.key - b.key);
        let chosen = values[0];
        let fewestWipes = Infinity;
        for (const val of values.slice(0, 3)) {
          st.place(u, val.s, val.rooms);
          let wipes = 0;
          const g = ctx.units[u].group;
          for (const ng of [g, ...neigh[g]])
            for (const v of ctx.unitsOfGroup[ng]) if (st.pos[v] < 0 && v !== u && !stuck.has(v) && st.feasibleCount(v, 1) === 0) wipes++;
          st.remove(u);
          if (wipes < fewestWipes) {
            fewestWipes = wipes;
            chosen = val;
          }
          if (wipes === 0) break;
        }
        st.place(u, chosen.s, chosen.rooms);
        unplaced.delete(u);
        markDirty(u);
      } else {
        // Dead end: record why (for explanations), then eject the cheapest conflicts.
        st.feasibleCount(u, Infinity, true);
        let pick = -1;
        let pickCost = Infinity;
        for (const s of st.domains[u]) {
          const c = conflictsFor(st, u, s, rng, false);
          if (!c) continue;
          const t = tabu.get(`${u}:${s}`);
          const cost = c.length + (t !== undefined && iteration - t < 30 ? 5 : 0) + rng.next() * 0.9;
          if (cost < pickCost) {
            pickCost = cost;
            pick = s;
          }
        }
        if (pick < 0) {
          stuck.add(u);
          continue;
        }
        const victims = conflictsFor(st, u, pick, rng, true);
        const r = victims ? st.check(u, pick) : null;
        if (!victims || !r || !r.ok) {
          stuck.add(u);
          continue;
        }
        st.place(u, pick, r.rooms);
        tabu.set(`${u}:${pick}`, iteration);
        unplaced.delete(u);
        markDirty(u);
        for (const v of victims) {
          unplaced.add(v);
          stuck.delete(v);
          markDirty(v);
        }
        // An ejected unit may unblock previously stuck ones.
        stuck.clear();
      }

      if (unplaced.size < localBest) {
        localBest = unplaced.size;
        sinceImprove = 0;
      } else sinceImprove++;
      if (unplaced.size < bestUnplaced) {
        bestUnplaced = unplaced.size;
        best = snapshot(st);
      }
      if (sinceImprove > opts.restartAfter) break;
    }

    if (unplaced.size < bestUnplaced || !best) {
      bestUnplaced = unplaced.size;
      best = snapshot(st);
    }
    if (bestUnplaced === 0) break;
    if (opts.now() > opts.deadline || iteration > opts.maxIterations) break;
    // Ended with only "stuck" units (nothing could be ejected): a few fresh random
    // restarts may help, but endless ones won't.
    if (unplaced.size > 0 && unplaced.size === stuck.size && ++stuckEnds >= 3) break;
    restarts++;
  }

  // Rebuild the best state found.
  const out = base.clone();
  if (best) {
    for (let u = 0; u < nU; u++) {
      if (out.pos[u] >= 0 || best.pos[u] < 0) continue;
      out.place(u, best.pos[u], best.rooms[u]);
    }
  }
  return out;
}
