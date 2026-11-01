import { MAX_PERIODS, dayOf, periodOf, slotOf, type Placement } from "@/lib/model/schema";
import { fitsCalendar, staticDomain, type Ctx } from "./context";

/**
 * Mutable search state: where each unit sits, plus occupancy grids for fast checks.
 * Every hard constraint the validator knows is enforced by `check()`, so any state
 * reached only through `check()` + `place()` is clash-free.
 */

export type ReasonCode =
  | "teacherBusy"
  | "classBusy"
  | "roomBusy"
  | "noRoom"
  | "teacherDayMax"
  | "teacherWeekMax"
  | "teacherConsecutive"
  | "subjectDayMax"
  | "banned";

export interface Reason {
  code: ReasonCode;
  /** Teacher / class / room / lesson index the reason is about (meaning depends on code). */
  ref: number;
  blockers: number[];
}

export type CheckResult = { ok: true; rooms: number[] } | { ok: false; reason: Reason };

const W = 6 * MAX_PERIODS;

const popcount = (x: number) => {
  let n = 0;
  while (x) {
    x &= x - 1;
    n++;
  }
  return n;
};

export class State {
  readonly ctx: Ctx;
  /** Start slot per unit, -1 = unplaced. */
  pos: Int32Array;
  /** Room per (unit, lesson-in-group) — aligned with groups[g].lessons. -1 = none. */
  rooms: number[][];
  locked: Uint8Array;
  teacherOcc: Int32Array;
  classOcc: Int32Array;
  roomOcc: Int32Array;
  teacherMask: Int32Array;
  teacherWeek: Int32Array;
  /** count[(class * nSubjects + subject) * 6 + day] */
  subjDay: Int32Array;
  /** Allowed start slots per unit (static rules only). */
  domains: number[][];
  /** Failed checks per unit, keyed "code:ref" — used to explain conflicts. */
  fails: Map<string, number>[];

  constructor(ctx: Ctx) {
    this.ctx = ctx;
    const nU = ctx.units.length;
    const nT = ctx.project.teachers.length;
    const nC = ctx.project.classes.length;
    const nR = ctx.project.rooms.length;
    const nS = Math.max(1, ctx.project.subjects.length);
    this.pos = new Int32Array(nU).fill(-1);
    this.rooms = ctx.units.map((u) => ctx.groups[u.group].lessons.map(() => -1));
    this.locked = new Uint8Array(nU);
    this.teacherOcc = new Int32Array(nT * W).fill(-1);
    this.classOcc = new Int32Array(nC * W).fill(-1);
    this.roomOcc = new Int32Array(nR * W).fill(-1);
    this.teacherMask = new Int32Array(nT * 6);
    this.teacherWeek = new Int32Array(nT);
    this.subjDay = new Int32Array(nC * nS * 6);
    const domCache = new Map<string, number[]>();
    this.domains = ctx.units.map((u) => {
      const key = `${u.group}:${u.length}`;
      if (!domCache.has(key)) domCache.set(key, staticDomain(ctx, u.group, u.length));
      return domCache.get(key)!;
    });
    this.fails = ctx.units.map(() => new Map());
  }

  clone(): State {
    const s = Object.create(State.prototype) as State;
    Object.assign(s, this);
    s.pos = this.pos.slice();
    s.rooms = this.rooms.map((r) => r.slice());
    s.locked = this.locked.slice();
    s.teacherOcc = this.teacherOcc.slice();
    s.classOcc = this.classOcc.slice();
    s.roomOcc = this.roomOcc.slice();
    s.teacherMask = this.teacherMask.slice();
    s.teacherWeek = this.teacherWeek.slice();
    s.subjDay = this.subjDay.slice();
    return s;
  }

  private sdIndex(c: number, li: number, day: number) {
    return (c * Math.max(1, this.ctx.project.subjects.length) + Math.max(0, this.ctx.lessonSubject[li])) * 6 + day;
  }

  /** Units of teacher t on a day (for ejection when a daily limit blocks). */
  private teacherUnitsOn(t: number, day: number): number[] {
    const out = new Set<number>();
    for (let p = 0; p < MAX_PERIODS; p++) {
      const u = this.teacherOcc[t * W + slotOf(day, p)];
      if (u >= 0) out.add(u);
    }
    return [...out];
  }

  /** Is unit u allowed to start at `slot`? Returns rooms to use, or the first blocking reason. */
  check(u: number, slot: number, record = false): CheckResult {
    const ctx = this.ctx;
    const unit = ctx.units[u];
    const grp = ctx.groups[unit.group];
    const day = dayOf(slot);
    const p0 = periodOf(slot);
    const len = unit.length;
    const fail = (code: ReasonCode, ref: number, blockers: number[] = []): CheckResult => {
      if (record) {
        const k = `${code}:${ref}`;
        this.fails[u].set(k, (this.fails[u].get(k) ?? 0) + 1);
      }
      return { ok: false, reason: { code, ref, blockers } };
    };

    if (!fitsCalendar(ctx, day, p0, len)) return fail("banned", grp.lessons[0]);
    for (const li of grp.lessons) for (let q = p0; q < p0 + len; q++) if (ctx.lessonBanned[li].has(slotOf(day, q))) return fail("banned", li);

    for (const c of grp.classes)
      for (let q = p0; q < p0 + len; q++) {
        const o = this.classOcc[c * W + slotOf(day, q)];
        if (o >= 0 && o !== u) return fail("classBusy", c, [o]);
      }
    for (const t of grp.teachers) {
      for (let q = p0; q < p0 + len; q++) {
        const o = this.teacherOcc[t * W + slotOf(day, q)];
        if (o >= 0 && o !== u) return fail("teacherBusy", t, [o]);
      }
      const teacher = ctx.project.teachers[t];
      let add = 0;
      for (let q = p0; q < p0 + len; q++) add |= 1 << q;
      const mask = this.teacherMask[t * 6 + day];
      const newMask = mask | add;
      const extra = popcount(newMask) - popcount(mask);
      if (popcount(newMask) > teacher.maxPerDay) return fail("teacherDayMax", t, this.teacherUnitsOn(t, day));
      if (this.teacherWeek[t] + extra > teacher.maxPerWeek) {
        const all: number[] = [];
        for (let d = 0; d < 6; d++) all.push(...this.teacherUnitsOn(t, d));
        return fail("teacherWeekMax", t, all);
      }
      // Longest run of consecutive periods (lunch resets the run).
      let run = 0;
      let start = 0;
      for (let p = 0; p < ctx.dayPeriods[day]; p++) {
        if (newMask & (1 << p)) {
          if (run === 0) start = p;
          run++;
          if (run > teacher.maxConsecutive && p >= p0 && start <= p0 + len - 1) {
            const blockers = new Set<number>();
            for (let q = start; q <= p; q++) {
              const o = this.teacherOcc[t * W + slotOf(day, q)];
              if (o >= 0) blockers.add(o);
            }
            return fail("teacherConsecutive", t, [...blockers]);
          }
        } else run = 0;
        if (ctx.breakAfter[p] === "lunch") run = 0;
      }
    }
    // Same subject per class per day
    for (const li of grp.lessons)
      for (const c of ctx.lessonClasses[li]) {
        const n = this.subjDay[this.sdIndex(c, li, day)];
        if (n + len > ctx.lessonDayMax[li]) {
          const blockers = new Set<number>();
          for (let p = 0; p < MAX_PERIODS; p++) {
            const o = this.classOcc[c * W + slotOf(day, p)];
            if (o < 0) continue;
            const og = ctx.groups[ctx.units[o].group];
            if (og.lessons.some((ol) => ctx.lessonSubject[ol] === ctx.lessonSubject[li])) blockers.add(o);
          }
          return fail("subjectDayMax", li, [...blockers]);
        }
      }
    // Rooms: each lesson in the group needs its own room
    const chosen: number[] = [];
    for (const li of grp.lessons) {
      const need = ctx.lessonRoom[li];
      if (need.kind === "none") {
        chosen.push(-1);
        continue;
      }
      const cands = need.kind === "fixed" ? [need.room] : need.candidates;
      let pick = -1;
      const blockers = new Set<number>();
      for (const r of cands) {
        if (chosen.includes(r)) continue;
        let free = true;
        for (let q = p0; q < p0 + len; q++) {
          const o = this.roomOcc[r * W + slotOf(day, q)];
          if (o >= 0 && o !== u) {
            free = false;
            blockers.add(o);
          }
        }
        if (free) {
          pick = r;
          break;
        }
      }
      if (pick < 0) return fail(need.kind === "fixed" ? "roomBusy" : "noRoom", li, [...blockers]);
      chosen.push(pick);
    }
    return { ok: true, rooms: chosen };
  }

  place(u: number, slot: number, rooms: number[]) {
    const ctx = this.ctx;
    const unit = ctx.units[u];
    const grp = ctx.groups[unit.group];
    const day = dayOf(slot);
    const p0 = periodOf(slot);
    this.pos[u] = slot;
    this.rooms[u] = rooms.slice();
    for (let q = p0; q < p0 + unit.length; q++) {
      const s = slotOf(day, q);
      for (const c of grp.classes) this.classOcc[c * W + s] = u;
      for (const t of grp.teachers) this.teacherOcc[t * W + s] = u;
      for (const r of rooms) if (r >= 0) this.roomOcc[r * W + s] = u;
    }
    for (const t of new Set(grp.teachers)) {
      const before = this.teacherMask[t * 6 + day];
      let add = 0;
      for (let q = p0; q < p0 + unit.length; q++) add |= 1 << q;
      this.teacherMask[t * 6 + day] = before | add;
      this.teacherWeek[t] += popcount(before | add) - popcount(before);
    }
    for (const li of grp.lessons) for (const c of ctx.lessonClasses[li]) this.subjDay[this.sdIndex(c, li, day)] += unit.length;
  }

  remove(u: number) {
    const slot = this.pos[u];
    if (slot < 0) return;
    const ctx = this.ctx;
    const unit = ctx.units[u];
    const grp = ctx.groups[unit.group];
    const day = dayOf(slot);
    const p0 = periodOf(slot);
    for (let q = p0; q < p0 + unit.length; q++) {
      const s = slotOf(day, q);
      for (const c of grp.classes) if (this.classOcc[c * W + s] === u) this.classOcc[c * W + s] = -1;
      for (const t of grp.teachers) if (this.teacherOcc[t * W + s] === u) this.teacherOcc[t * W + s] = -1;
      for (const r of this.rooms[u]) if (r >= 0 && this.roomOcc[r * W + s] === u) this.roomOcc[r * W + s] = -1;
    }
    for (const t of new Set(grp.teachers)) {
      const before = this.teacherMask[t * 6 + day];
      let del = 0;
      for (let q = p0; q < p0 + unit.length; q++) del |= 1 << q;
      this.teacherMask[t * 6 + day] = before & ~del;
      this.teacherWeek[t] -= popcount(before) - popcount(before & ~del);
    }
    for (const li of grp.lessons) for (const c of ctx.lessonClasses[li]) this.subjDay[this.sdIndex(c, li, day)] -= unit.length;
    this.pos[u] = -1;
    this.rooms[u] = grp.lessons.map(() => -1);
  }

  /** Number of currently feasible start slots for u (stops counting at `cap`). */
  feasibleCount(u: number, cap = Infinity, record = false): number {
    let n = 0;
    for (const s of this.domains[u]) {
      if (this.check(u, s, record).ok) n++;
      if (n >= cap) break;
    }
    return n;
  }

  /** Placements for the UI / validator (one per lesson per unit). */
  toPlacements(): Placement[] {
    const ctx = this.ctx;
    const out: Placement[] = [];
    ctx.units.forEach((unit, u) => {
      const s = this.pos[u];
      if (s < 0) return;
      const grp = ctx.groups[unit.group];
      grp.lessons.forEach((li, i) => {
        const r = this.rooms[u][i];
        out.push({
          lessonId: ctx.lessons[li].id,
          unit: unit.k,
          day: dayOf(s),
          period: periodOf(s),
          length: unit.length,
          roomId: r >= 0 ? ctx.project.rooms[r].id : null,
          locked: this.locked[u] === 1,
        });
      });
    });
    return out;
  }
}

/** Unit index for a placement (block lessons map to their group's unit). */
export function unitOfPlacement(ctx: Ctx, pl: Pick<Placement, "lessonId" | "unit">): number | undefined {
  const li = ctx.lessonIndex.get(pl.lessonId);
  if (li === undefined) return undefined;
  return ctx.unitsOfGroup[ctx.groupOfLesson[li]][pl.unit];
}

/** Load an existing timetable into a fresh state (invalid placements are skipped). */
export function stateFromPlacements(ctx: Ctx, placements: Placement[], opts: { force?: boolean } = {}): { state: State; skipped: Placement[] } {
  const st = new State(ctx);
  const skipped: Placement[] = [];
  // Locked placements first so they win any conflict.
  const ordered = [...placements].sort((a, b) => Number(b.locked) - Number(a.locked));
  for (const pl of ordered) {
    const u = unitOfPlacement(ctx, pl);
    if (u === undefined || st.pos[u] >= 0) continue;
    const slot = slotOf(pl.day, pl.period);
    const r = st.check(u, slot);
    if (!r.ok && !opts.force) {
      skipped.push(pl);
      continue;
    }
    // Rooms are re-picked by check(); forced (invalid) placements keep no room.
    const rooms = r.ok ? r.rooms : st.rooms[u];
    st.place(u, slot, rooms);
    if (pl.locked) st.locked[u] = 1;
  }
  return { state: st, skipped };
}
