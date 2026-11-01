import { DAY_SHORT, ROOM_TYPE_LABELS, dayOf, periodOf, slotOf, type Placement, type Project } from "@/lib/model/schema";
import { buildCtx, type Ctx } from "./context";
import { totalScore, weightsOf } from "./score";
import { State, stateFromPlacements, unitOfPlacement, type Reason } from "./state";
import { bannedReason } from "./validator";

/**
 * Manual-editing logic (pure): which cells a lesson can be dropped on and why not,
 * applying a move or swap, and ranked swap suggestions. Hard clashes are always
 * blocked; soft-rule costs are reported as a score delta ("allow with warning").
 */

export type DropInfo =
  | { ok: true; day: number; period: number; swapWith: { lessonId: string; unit: number } | null; delta: number }
  | { ok: false; day: number; period: number; reason: string };

function reasonText(ctx: Ctx, st: State, r: Reason, u: number, slot: number): string {
  const name = (v: number) => {
    const g = ctx.groups[ctx.units[v].group];
    const li = g.lessons[0];
    const cls = ctx.lessonClasses[li].map((c) => ctx.names.classes[c]).join("+");
    return `${cls} ${ctx.project.subjects[ctx.lessonSubject[li]]?.code ?? ""}`.trim();
  };
  switch (r.code) {
    case "teacherBusy":
      return `${ctx.names.teachers[r.ref]} is busy with ${name(r.blockers[0])}`;
    case "classBusy":
      return `${ctx.names.classes[r.ref]} already has ${ctx.project.subjects[ctx.lessonSubject[ctx.groups[ctx.units[r.blockers[0]].group].lessons[0]]]?.name ?? "a lesson"} at that time`;
    case "roomBusy":
      return `The room is booked by ${name(r.blockers[0])}`;
    case "noRoom": {
      const need = ctx.lessonRoom[r.ref];
      return need.kind === "type" ? `No free ${ROOM_TYPE_LABELS[need.type].toLowerCase()}` : "No free room";
    }
    case "teacherDayMax":
      return `${ctx.names.teachers[r.ref]} would exceed ${ctx.project.teachers[r.ref].maxPerDay} periods that day`;
    case "teacherWeekMax":
      return `${ctx.names.teachers[r.ref]} would exceed ${ctx.project.teachers[r.ref].maxPerWeek} periods this week`;
    case "teacherConsecutive":
      return `${ctx.names.teachers[r.ref]} would teach more than ${ctx.project.teachers[r.ref].maxConsecutive} in a row`;
    case "subjectDayMax":
      return `Too many ${ctx.project.subjects[ctx.lessonSubject[r.ref]]?.name ?? "periods"} that day`;
    case "banned": {
      const len = ctx.units[u].length;
      const d = dayOf(slot);
      for (let q = periodOf(slot); q < periodOf(slot) + len; q++) {
        if (q >= ctx.dayPeriods[d]) return "Outside the school day";
        const why = bannedReason(ctx, r.ref, d, q);
        if (why) return why.code === "fixedEvent" ? `${why.who} (fixed event)` : why.code === "customHard" ? `Rule: ${why.who}` : `${why.who} unavailable`;
      }
      return len === 2 ? "A double period can't cross a break here" : "Not allowed here";
    }
  }
}

interface Prepared {
  ctx: Ctx;
  st: State;
  u: number;
  from: number;
  rooms: number[];
  base: number;
}

function prepare(project: Project, placements: Placement[], lessonId: string, unit: number): Prepared | null {
  const ctx = buildCtx(project);
  const { state: st } = stateFromPlacements(ctx, placements, { force: true });
  const u = unitOfPlacement(ctx, { lessonId, unit });
  if (u === undefined || st.pos[u] < 0) return null;
  const base = totalScore(ctx, st.pos, weightsOf(project));
  return { ctx, st, u, from: st.pos[u], rooms: st.rooms[u].slice(), base };
}

/** Try putting u at slot (swapping with a same-class unit there if needed). Leaves state unchanged. */
function tryDrop(pr: Prepared, slot: number, w: ReturnType<typeof weightsOf>): DropInfo {
  const { ctx, st, u, from, rooms } = pr;
  const day = dayOf(slot);
  const period = periodOf(slot);
  st.remove(u);
  try {
    const direct = st.check(u, slot);
    if (direct.ok) {
      st.place(u, slot, direct.rooms);
      const delta = totalScore(ctx, st.pos, w) - pr.base;
      st.remove(u);
      return { ok: true, day, period, swapWith: null, delta: Math.round(delta * 10) / 10 };
    }
    // Swap: the blocker is a single movable unit of the same length belonging to one of u's classes.
    const r = direct.reason;
    if (r.code === "classBusy" && r.blockers.length === 1) {
      const v = r.blockers[0];
      if (!st.locked[v] && ctx.units[v].length === ctx.units[u].length && st.pos[v] === slot) {
        const vFrom = st.pos[v];
        const vRooms = st.rooms[v].slice();
        st.remove(v);
        const ru = st.check(u, slot);
        if (ru.ok) {
          st.place(u, slot, ru.rooms);
          const rv = st.check(v, from);
          if (rv.ok) {
            st.place(v, from, rv.rooms);
            const delta = totalScore(ctx, st.pos, w) - pr.base;
            st.remove(v);
            st.remove(u);
            st.place(v, vFrom, vRooms);
            const vl = ctx.lessons[ctx.groups[ctx.units[v].group].lessons[0]];
            return { ok: true, day, period, swapWith: { lessonId: vl.id, unit: ctx.units[v].k }, delta: Math.round(delta * 10) / 10 };
          }
          st.remove(u);
          st.place(v, vFrom, vRooms);
          return { ok: false, day, period, reason: `Swap blocked: ${reasonText(ctx, st, rv.reason, v, from)}` };
        }
        // The swap partner would fit, but this lesson can't go there for another reason: say that.
        st.place(v, vFrom, vRooms);
        return { ok: false, day, period, reason: reasonText(ctx, st, ru.reason, u, slot) };
      }
    }
    return { ok: false, day, period, reason: reasonText(ctx, st, r, u, slot) };
  } finally {
    if (st.pos[u] >= 0) st.remove(u);
    st.place(u, from, rooms);
  }
}

/** Validity of every cell for dragging (lessonId, unit). */
export function dropTargets(project: Project, placements: Placement[], lessonId: string, unit: number): Map<number, DropInfo> {
  const out = new Map<number, DropInfo>();
  const pr = prepare(project, placements, lessonId, unit);
  if (!pr) return out;
  const w = weightsOf(project);
  for (const d of pr.ctx.workingDays)
    for (let p = 0; p < pr.ctx.dayPeriods[d]; p++) {
      const s = slotOf(d, p);
      if (s === pr.from) continue;
      out.set(s, tryDrop(pr, s, w));
    }
  return out;
}

/** Apply a move (or swap). Returns new placements, or an error reason. */
export function moveLesson(project: Project, placements: Placement[], lessonId: string, unit: number, day: number, period: number): { ok: true; placements: Placement[] } | { ok: false; reason: string } {
  const pr = prepare(project, placements, lessonId, unit);
  if (!pr) return { ok: false, reason: "Lesson not found" };
  if (pr.st.locked[pr.u]) return { ok: false, reason: "This lesson is locked" };
  const info = tryDrop(pr, slotOf(day, period), weightsOf(project));
  if (!info.ok) return { ok: false, reason: info.reason };
  const { st, u, from } = pr;
  st.remove(u);
  if (info.swapWith) {
    const v = unitOfPlacement(pr.ctx, info.swapWith)!;
    const vFrom = st.pos[v];
    st.remove(v);
    st.place(u, vFrom, (st.check(u, vFrom) as { rooms: number[] }).rooms);
    st.place(v, from, (st.check(v, from) as { rooms: number[] }).rooms);
  } else {
    const r = st.check(u, slotOf(day, period));
    if (!r.ok) return { ok: false, reason: "Not allowed" };
    st.place(u, slotOf(day, period), r.rooms);
  }
  return { ok: true, placements: st.toPlacements() };
}

export interface SwapSuggestion {
  day: number;
  period: number;
  label: string;
  swapWith: { lessonId: string; unit: number } | null;
  delta: number;
}

/** Valid moves/swaps for a lesson, best (lowest soft-score change) first. */
export function swapSuggestions(project: Project, placements: Placement[], lessonId: string, unit: number, limit = 8): SwapSuggestion[] {
  const targets = dropTargets(project, placements, lessonId, unit);
  const subj = new Map(project.subjects.map((s) => [s.id, s.code]));
  const les = new Map(project.lessons.map((l) => [l.id, l]));
  return [...targets.values()]
    .filter((t): t is Extract<DropInfo, { ok: true }> => t.ok)
    .sort((a, b) => a.delta - b.delta || a.day - b.day || a.period - b.period)
    .slice(0, limit)
    .map((t) => ({
      day: t.day,
      period: t.period,
      swapWith: t.swapWith,
      delta: t.delta,
      label: t.swapWith ? `Swap with ${subj.get(les.get(t.swapWith.lessonId)?.subjectId ?? "") ?? "lesson"} on ${DAY_SHORT[t.day]} P${t.period + 1}` : `Move to ${DAY_SHORT[t.day]} P${t.period + 1}`,
    }));
}
