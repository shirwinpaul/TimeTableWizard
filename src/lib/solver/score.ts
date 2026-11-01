import { dayOf, periodOf, slotOf, type Project, type SoftKind, type Timetable } from "@/lib/model/schema";
import { buildCtx, customRuleSlots, type Ctx } from "./context";

/**
 * Soft-constraint scoring. Lower is better; 0 = every preference met.
 * `pos[u]` is the start slot of unit u, or -1 when unplaced.
 */

export type Weights = Partial<Record<SoftKind, number>>;

export const SOFT_LABELS: Record<SoftKind, string> = {
  spread: "Spread each subject evenly across the week",
  heavyMorning: "Heavy subjects in the morning",
  teacherGaps: "Few gaps in teachers' days (and respect preferred free periods)",
  balancedLoad: "Balanced daily load for classes and teachers",
  subjectTimePref: "Subject time preferences (morning / afternoon)",
  lastPeriod: "Avoid the same subject in the last period too often",
};

export function weightsOf(project: Project): Weights {
  const w: Weights = {};
  for (const r of project.rules) if (r.enabled && r.soft) w[r.soft] = r.weight;
  return w;
}

const popcount = (x: number) => {
  let n = 0;
  while (x) {
    x &= x - 1;
    n++;
  }
  return n;
};

/** Morning = first half of that day's teaching periods. */
const isMorning = (ctx: Ctx, day: number, period: number) => period < Math.ceil(ctx.dayPeriods[day] / 2);

export interface Penalties {
  spread: number;
  heavyMorning: number;
  teacherGaps: number;
  balancedLoad: number;
  subjectTimePref: number;
  lastPeriod: number;
  custom: number;
}

/** Raw (unweighted) penalties per built-in kind; custom is already weighted. */
export function penalties(ctx: Ctx, pos: Int32Array): Penalties {
  const P: Penalties = { spread: 0, heavyMorning: 0, teacherGaps: 0, balancedLoad: 0, subjectTimePref: 0, lastPeriod: 0, custom: 0 };
  const nT = ctx.project.teachers.length;
  const nC = ctx.project.classes.length;
  const tMask = new Int32Array(nT * 6);
  const cMask = new Int32Array(nC * 6);
  const nDays = ctx.workingDays.length || 1;
  const lastCount = new Map<number, number>();

  for (let g = 0; g < ctx.groups.length; g++) {
    const grp = ctx.groups[g];
    const units = ctx.unitsOfGroup[g];
    const perDay = [0, 0, 0, 0, 0, 0];
    for (const u of units) {
      const s = pos[u];
      if (s < 0) continue;
      const d = dayOf(s);
      const p0 = periodOf(s);
      const len = ctx.units[u].length;
      perDay[d]++;
      for (let q = p0; q < p0 + len; q++) {
        const bit = 1 << q;
        for (const t of grp.teachers) tMask[t * 6 + d] |= bit;
        for (const c of grp.classes) cMask[c * 6 + d] |= bit;
        const morning = isMorning(ctx, d, q);
        for (const li of grp.lessons) {
          const subj = ctx.project.subjects[ctx.lessonSubject[li]];
          if (subj) {
            if (subj.heavy && !morning) P.heavyMorning++;
            if (subj.preferredTime === "morning" && !morning) P.subjectTimePref++;
            if (subj.preferredTime === "afternoon" && morning) P.subjectTimePref++;
          }
          const soft = ctx.lessonSoft[li].get(slotOf(d, q));
          if (soft) P.custom += soft;
        }
        if (q === ctx.dayPeriods[d] - 1) lastCount.set(g, (lastCount.get(g) ?? 0) + 1);
      }
    }
    const target = Math.ceil(units.length / nDays);
    for (const d of ctx.workingDays) if (perDay[d] > target) P.spread += perDay[d] - target;
  }
  for (const n of lastCount.values()) if (n > 1) P.lastPeriod += n - 1;

  const totalPeriods = ctx.workingDays.reduce((n, d) => n + ctx.dayPeriods[d], 0) || 1;
  const balance = (mask: Int32Array, i: number) => {
    let total = 0;
    for (const d of ctx.workingDays) total += popcount(mask[i * 6 + d]);
    if (!total) return 0;
    let dev = 0;
    for (const d of ctx.workingDays) dev += Math.abs(popcount(mask[i * 6 + d]) - (total * ctx.dayPeriods[d]) / totalPeriods);
    return dev / 2;
  };
  for (let t = 0; t < nT; t++) {
    const pref = ctx.project.teachers[t].preferredFree;
    for (const d of ctx.workingDays) {
      const m = tMask[t * 6 + d];
      if (!m) continue;
      const first = 31 - Math.clz32(m & -m);
      const last = 31 - Math.clz32(m);
      P.teacherGaps += last - first + 1 - popcount(m);
    }
    for (const s of pref) if (tMask[t * 6 + dayOf(s)] & (1 << periodOf(s))) P.teacherGaps++;
    P.balancedLoad += balance(tMask, t);
  }
  for (let c = 0; c < nC; c++) P.balancedLoad += balance(cMask, c);
  P.balancedLoad = Math.round(P.balancedLoad * 10) / 10;
  return P;
}

export function totalScore(ctx: Ctx, pos: Int32Array, w: Weights): number {
  const P = penalties(ctx, pos);
  return (
    (w.spread ?? 0) * P.spread +
    (w.heavyMorning ?? 0) * P.heavyMorning +
    (w.teacherGaps ?? 0) * P.teacherGaps +
    (w.balancedLoad ?? 0) * P.balancedLoad +
    (w.subjectTimePref ?? 0) * P.subjectTimePref +
    (w.lastPeriod ?? 0) * P.lastPeriod +
    P.custom
  );
}

/** Convert placements to unit positions (block lessons share their group's units). */
export function positionsOf(ctx: Ctx, timetable: Timetable | null): Int32Array {
  const pos = new Int32Array(ctx.units.length).fill(-1);
  for (const pl of timetable?.placements ?? []) {
    const li = ctx.lessonIndex.get(pl.lessonId);
    if (li === undefined) continue;
    const u = ctx.unitsOfGroup[ctx.groupOfLesson[li]][pl.unit];
    if (u !== undefined && pos[u] < 0) pos[u] = slotOf(pl.day, pl.period);
  }
  return pos;
}

export interface ScoreItem {
  ruleId: string;
  label: string;
  weight: number;
  penalty: number;
  weighted: number;
}

export interface ScoreBreakdown {
  total: number;
  items: ScoreItem[];
}

/** Human-facing breakdown: one row per enabled soft rule (built-in and custom). */
export function scoreBreakdown(project: Project, timetable: Timetable | null): ScoreBreakdown {
  const ctx = buildCtx(project);
  const pos = positionsOf(ctx, timetable);
  const P = penalties(ctx, pos);
  const items: ScoreItem[] = [];
  for (const r of project.rules) {
    if (!r.enabled) continue;
    if (r.soft) {
      const penalty = P[r.soft];
      items.push({ ruleId: r.id, label: r.label, weight: r.weight, penalty, weighted: penalty * r.weight });
    } else if (r.custom && !r.hard) {
      let count = 0;
      ctx.lessons.forEach((_, li) => {
        const banned = new Set(customRuleSlots(ctx, li, r.custom!));
        if (!banned.size) return;
        for (const u of ctx.unitsOfGroup[ctx.groupOfLesson[li]]) {
          const s = pos[u];
          if (s < 0) continue;
          for (let q = 0; q < ctx.units[u].length; q++) if (banned.has(s + q)) count++;
        }
      });
      items.push({ ruleId: r.id, label: r.label, weight: r.weight, penalty: count, weighted: count * r.weight });
    }
  }
  const total = Math.round(items.reduce((n, i) => n + i.weighted, 0) * 10) / 10;
  return { total, items };
}
