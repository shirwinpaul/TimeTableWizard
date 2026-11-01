import { DAY_SHORT, slotOf, type Placement, type Project, type Timetable } from "@/lib/model/schema";
import { buildCtx, customRuleSlots, fitsCalendar, unitLengths, type Ctx } from "./context";

/**
 * Independent checker for every HARD constraint. It never trusts the solver: it
 * rebuilds all occupancy from the placements. The UI shows "Clash-free" only when
 * `ok` is true.
 */

export type ViolationCode =
  | "unknownLesson"
  | "duplicateUnit"
  | "outOfDay"
  | "doubleSplit"
  | "teacherClash"
  | "classClash"
  | "roomClash"
  | "roomMissing"
  | "roomType"
  | "roomCapacity"
  | "teacherUnavailable"
  | "classUnavailable"
  | "fixedEvent"
  | "customHard"
  | "periodsPerWeek"
  | "doubleCount"
  | "teacherDayMax"
  | "teacherWeekMax"
  | "teacherConsecutive"
  | "subjectDayMax"
  | "lockMoved"
  | "fixedSlotMissed"
  | "blockMisaligned";

export interface Violation {
  code: ViolationCode;
  message: string;
  lessonIds: string[];
  day?: number;
  period?: number;
}

export interface ValidationResult {
  ok: boolean;
  violations: Violation[];
  /** Every lesson has all its periods placed. */
  complete: boolean;
}

export const slotLabel = (day: number, period: number) => `${DAY_SHORT[day]} P${period + 1}`;

export function lessonLabel(ctx: Ctx, li: number): string {
  const l = ctx.lessons[li];
  const cls = ctx.lessonClasses[li].map((c) => ctx.names.classes[c]).join("+");
  const subj = ctx.lessonSubject[li] >= 0 ? ctx.names.subjects[ctx.lessonSubject[li]] : l.subjectId;
  return `${cls} ${subj}`;
}

/** Why is lesson li not allowed at this slot? (null = allowed) */
export function bannedReason(ctx: Ctx, li: number, day: number, period: number): { code: ViolationCode; who: string } | null {
  const s = slotOf(day, period);
  if (!ctx.lessonBanned[li].has(s)) return null;
  const p = ctx.project;
  for (const t of ctx.lessonTeachers[li]) if (p.teachers[t].unavailable.includes(s)) return { code: "teacherUnavailable", who: ctx.names.teachers[t] };
  for (const c of ctx.lessonClasses[li]) if (p.classes[c].unavailable.includes(s)) return { code: "classUnavailable", who: ctx.names.classes[c] };
  const l = ctx.lessons[li];
  for (const e of p.calendar.fixedEvents)
    if (e.day === day && e.period === period && (!e.classIds.length || e.classIds.some((c) => l.classIds.includes(c))))
      return { code: "fixedEvent", who: e.name };
  for (const r of p.rules)
    if (r.enabled && r.hard && r.custom && customRuleSlots(ctx, li, r.custom).includes(s)) {
      if (r.custom.kind === "teacherUnavailable") return { code: "teacherUnavailable", who: r.label };
      if (r.custom.kind === "classUnavailable") return { code: "classUnavailable", who: r.label };
      return { code: "customHard", who: r.label };
    }
  return { code: "customHard", who: "a rule" };
}

export function validate(project: Project, timetable: Timetable | null, opts: { locks?: Placement[] } = {}): ValidationResult {
  const ctx = buildCtx(project);
  const v: Violation[] = [];
  const placements = timetable?.placements ?? [];
  const push = (code: ViolationCode, message: string, lessonIds: string[], day?: number, period?: number) =>
    v.push({ code, message, lessonIds, day, period });

  const teacherOcc = new Map<string, Set<string>>();
  const classOcc = new Map<string, Set<string>>();
  const roomOcc = new Map<string, Set<string>>();
  const add = (m: Map<string, Set<string>>, key: string, token: string) => {
    let s = m.get(key);
    if (!s) m.set(key, (s = new Set()));
    s.add(token);
  };
  const seen = new Set<string>();
  const placedPeriods = new Map<number, number>();
  const placedDoubles = new Map<number, number>();
  const blockUnitPos = new Map<string, string>();
  // per teacher per day: list of occupied periods; per class+subject per day: tokens
  const teacherDay = new Map<string, Set<number>>();
  const subjDay = new Map<string, { tokens: Set<string>; limit: number; lessons: Set<string> }>();

  for (const pl of placements) {
    const li = ctx.lessonIndex.get(pl.lessonId);
    if (li === undefined) {
      push("unknownLesson", `A placed lesson (${pl.lessonId}) no longer exists.`, [pl.lessonId]);
      continue;
    }
    const lesson = ctx.lessons[li];
    const label = lessonLabel(ctx, li);
    const key = `${pl.lessonId}#${pl.unit}`;
    if (seen.has(key)) push("duplicateUnit", `${label} is placed twice for the same period.`, [pl.lessonId], pl.day, pl.period);
    seen.add(key);

    if (pl.period + pl.length > ctx.dayPeriods[pl.day]) {
      push("outOfDay", `${label} is placed outside the school day (${slotLabel(pl.day, pl.period)}).`, [pl.lessonId], pl.day, pl.period);
      continue;
    }
    if (pl.length === 2 && !fitsCalendar(ctx, pl.day, pl.period, 2))
      push("doubleSplit", `${label}'s double period at ${slotLabel(pl.day, pl.period)} is split by a break.`, [pl.lessonId], pl.day, pl.period);

    placedPeriods.set(li, (placedPeriods.get(li) ?? 0) + pl.length);
    if (pl.length === 2) placedDoubles.set(li, (placedDoubles.get(li) ?? 0) + 1);

    if (lesson.blockId) {
      const bk = `${lesson.blockId}#${pl.unit}`;
      const pos = `${pl.day}:${pl.period}:${pl.length}`;
      const prev = blockUnitPos.get(bk);
      if (prev && prev !== pos)
        push("blockMisaligned", `Elective block lessons (${label}) must run at the same time.`, [pl.lessonId], pl.day, pl.period);
      else blockUnitPos.set(bk, pos);
    }
    const classToken = lesson.blockId ? `B:${lesson.blockId}#${pl.unit}` : key;

    // Room checks
    const need = ctx.lessonRoom[li];
    const ri = pl.roomId ? ctx.roomIndex.get(pl.roomId) : undefined;
    if (need.kind !== "none" && ri === undefined)
      push("roomMissing", `${label} at ${slotLabel(pl.day, pl.period)} has no room.`, [pl.lessonId], pl.day, pl.period);
    if (ri !== undefined) {
      const room = project.rooms[ri];
      if (need.kind === "type" && room.type !== need.type)
        push("roomType", `${label} needs a ${need.type.replace("_", " ")} but is in ${room.name}.`, [pl.lessonId], pl.day, pl.period);
      const minCap = need.kind === "type" ? need.minCap : ctx.lessonClasses[li].reduce((n, c) => n + project.classes[c].strength, 0);
      if (room.capacity < minCap)
        push("roomCapacity", `${room.name} holds ${room.capacity} but ${label} has ${minCap} students.`, [pl.lessonId], pl.day, pl.period);
    }

    for (let q = pl.period; q < pl.period + pl.length; q++) {
      const s = slotOf(pl.day, q);
      const why = bannedReason(ctx, li, pl.day, q);
      if (why) {
        const text =
          why.code === "fixedEvent"
            ? `${label} is placed during "${why.who}" (${slotLabel(pl.day, q)}).`
            : why.code === "customHard"
              ? `${label} at ${slotLabel(pl.day, q)} breaks the rule "${why.who}".`
              : `${label} is placed when ${why.who} is unavailable (${slotLabel(pl.day, q)}).`;
        push(why.code, text, [pl.lessonId], pl.day, q);
      }
      for (const t of ctx.lessonTeachers[li]) {
        add(teacherOcc, `${t}:${s}`, key);
        let td = teacherDay.get(`${t}:${pl.day}`);
        if (!td) teacherDay.set(`${t}:${pl.day}`, (td = new Set()));
        td.add(q);
      }
      for (const c of ctx.lessonClasses[li]) {
        add(classOcc, `${c}:${s}`, classToken);
        const sk = `${c}:${lesson.subjectId}:${pl.day}`;
        let sd = subjDay.get(sk);
        if (!sd) subjDay.set(sk, (sd = { tokens: new Set(), limit: ctx.lessonDayMax[li], lessons: new Set() }));
        sd.tokens.add(`${classToken}@${q}`);
        sd.limit = Math.min(sd.limit, ctx.lessonDayMax[li]);
        sd.lessons.add(pl.lessonId);
      }
      if (ri !== undefined) add(roomOcc, `${ri}:${s}`, key);
    }
  }

  const tokenLessons = (tokens: Set<string>) => [...new Set([...tokens].map((t) => t.split("#")[0].replace(/^B:/, "")))];
  const clash = (m: Map<string, Set<string>>, code: ViolationCode, names: string[], what: string) => {
    for (const [k, tokens] of m) {
      if (tokens.size < 2) continue;
      const [i, s] = k.split(":").map(Number);
      const day = Math.floor(s / 16);
      const period = s % 16;
      push(code, `${names[i]} has ${tokens.size} ${what} at ${slotLabel(day, period)}.`, tokenLessons(tokens), day, period);
    }
  };
  clash(teacherOcc, "teacherClash", ctx.names.teachers, "lessons at once");
  clash(classOcc, "classClash", ctx.names.classes, "lessons at once");
  clash(roomOcc, "roomClash", ctx.names.rooms, "lessons booked");

  // Teacher daily / weekly / consecutive limits
  const week = new Map<number, number>();
  for (const [k, periods] of teacherDay) {
    const [t, day] = k.split(":").map(Number);
    const teacher = project.teachers[t];
    week.set(t, (week.get(t) ?? 0) + periods.size);
    if (periods.size > teacher.maxPerDay)
      push("teacherDayMax", `${teacher.name} teaches ${periods.size} periods on ${DAY_SHORT[day]} (max ${teacher.maxPerDay}).`, [], day);
    let run = 0;
    let best = 0;
    for (let p = 0; p < ctx.dayPeriods[day]; p++) {
      run = periods.has(p) ? run + 1 : 0;
      best = Math.max(best, run);
      if (ctx.breakAfter[p] === "lunch") run = 0;
    }
    if (best > teacher.maxConsecutive)
      push("teacherConsecutive", `${teacher.name} teaches ${best} periods in a row on ${DAY_SHORT[day]} (max ${teacher.maxConsecutive}).`, [], day);
  }
  for (const [t, n] of week) {
    const teacher = project.teachers[t];
    if (n > teacher.maxPerWeek) push("teacherWeekMax", `${teacher.name} teaches ${n} periods this week (max ${teacher.maxPerWeek}).`, []);
  }
  for (const [k, sd] of subjDay) {
    const [c, subjectId, day] = k.split(":");
    if (sd.tokens.size > sd.limit) {
      const subj = project.subjects.find((s) => s.id === subjectId)?.name ?? subjectId;
      push(
        "subjectDayMax",
        `${ctx.names.classes[Number(c)]} has ${sd.tokens.size} ${subj} periods on ${DAY_SHORT[Number(day)]} (max ${sd.limit}).`,
        [...sd.lessons],
        Number(day),
      );
    }
  }

  // Periods per week and double counts
  let complete = true;
  ctx.lessons.forEach((l, li) => {
    const n = placedPeriods.get(li) ?? 0;
    if (n !== l.periodsPerWeek) {
      if (n < l.periodsPerWeek) complete = false;
      push("periodsPerWeek", `${lessonLabel(ctx, li)} has ${n} of ${l.periodsPerWeek} periods placed.`, [l.id]);
    }
    const needDoubles = unitLengths(l).filter((x) => x === 2).length;
    const d = placedDoubles.get(li) ?? 0;
    if (n === l.periodsPerWeek && d !== needDoubles)
      push("doubleCount", `${lessonLabel(ctx, li)} needs ${needDoubles} double period(s) but has ${d}.`, [l.id]);
    for (const fs of l.fixedSlots) {
      const day = Math.floor(fs / 16);
      const period = fs % 16;
      const hit = placements.some((p) => p.lessonId === l.id && p.day === day && period >= p.period && period < p.period + p.length);
      if (!hit) push("fixedSlotMissed", `${lessonLabel(ctx, li)} must be at ${slotLabel(day, period)} (fixed slot).`, [l.id], day, period);
    }
  });

  for (const lock of opts.locks ?? []) {
    const hit = placements.some(
      (p) => p.lessonId === lock.lessonId && p.unit === lock.unit && p.day === lock.day && p.period === lock.period,
    );
    if (!hit) push("lockMoved", `A locked lesson (${lock.lessonId}) was moved from ${slotLabel(lock.day, lock.period)}.`, [lock.lessonId], lock.day, lock.period);
  }

  return { ok: v.length === 0, violations: v, complete };
}
