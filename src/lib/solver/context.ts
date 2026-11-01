import {
  MAX_PERIODS,
  slotOf,
  type CustomRuleParams,
  type Lesson,
  type Project,
  type RoomType,
} from "@/lib/model/schema";

/**
 * A compiled, index-based view of a project that every solver module shares.
 * Built once per solve/validate; pure data, no framework code.
 */

export type RoomNeed =
  | { kind: "none" }
  | { kind: "fixed"; room: number }
  | { kind: "type"; type: RoomType; minCap: number; candidates: number[] };

export interface Group {
  /** Lesson id for a single lesson, or the block id for an elective block. */
  id: string;
  lessons: number[];
  classes: number[];
  /** Every teacher of every lesson (duplicates possible = a data error caught by precheck). */
  teachers: number[];
  /** Unit lengths in order: doubles first, then singles. */
  units: number[];
}

export interface Unit {
  index: number;
  group: number;
  k: number;
  length: number;
}

export interface Ctx {
  project: Project;
  /** Teaching periods per day index 0..5 (0 = not a working day). */
  dayPeriods: number[];
  workingDays: number[];
  /** breakAfter[p] = kind of break after teaching period p, if any. */
  breakAfter: ("short" | "lunch" | null)[];
  lessons: Lesson[];
  lessonIndex: Map<string, number>;
  classIndex: Map<string, number>;
  teacherIndex: Map<string, number>;
  roomIndex: Map<string, number>;
  subjectIndex: Map<string, number>;
  lessonClasses: number[][];
  lessonTeachers: number[][];
  lessonSubject: number[];
  lessonRoom: RoomNeed[];
  /** Hard-banned start slots per lesson (unavailability, fixed events, hard custom rules). */
  lessonBanned: Set<number>[];
  /** Soft custom-rule penalty weight per lesson per occupied slot. */
  lessonSoft: Map<number, number>[];
  /** Max periods of this lesson's subject per class per day. */
  lessonDayMax: number[];
  groups: Group[];
  groupOfLesson: number[];
  units: Unit[];
  unitsOfGroup: number[][];
  /** Labels for messages. */
  names: {
    classes: string[];
    teachers: string[];
    rooms: string[];
    subjects: string[];
  };
}

export const unitLengths = (l: Lesson): number[] => {
  const doubles = Math.min(l.doubles, Math.floor(l.periodsPerWeek / 2));
  const out: number[] = [];
  for (let i = 0; i < doubles; i++) out.push(2);
  for (let i = 0; i < l.periodsPerWeek - doubles * 2; i++) out.push(1);
  return out;
};

export function lessonRoomType(project: Project, l: Lesson): RoomType | null {
  if (l.roomType) return l.roomType;
  const s = project.subjects.find((x) => x.id === l.subjectId);
  return s?.roomType ?? null;
}

export function groupStrength(project: Project, l: Lesson): number {
  if (l.groupSize) return l.groupSize;
  return l.classIds.reduce((n, cid) => n + (project.classes.find((c) => c.id === cid)?.strength ?? 0), 0);
}

/** Slots (day, period) covered by a custom rule's day/period range. */
function ruleSlots(days: number[], from: number, to: number, workingDays: number[]): number[] {
  const out: number[] = [];
  const ds = days.length ? days : workingDays;
  const [a, b] = from <= to ? [from, to] : [to, from];
  for (const d of ds) for (let p = a; p <= b; p++) out.push(slotOf(d, p));
  return out;
}

function ruleTargets(ctx: Ctx, l: number, r: { subjectId: string | null; classIds: string[] }): boolean {
  const lesson = ctx.lessons[l];
  if (r.subjectId && lesson.subjectId !== r.subjectId) return false;
  if (r.classIds.length && !lesson.classIds.some((c) => r.classIds.includes(c))) return false;
  return true;
}

/** Slots a custom rule forbids for lesson l (empty if the rule doesn't target it). */
export function customRuleSlots(ctx: Ctx, l: number, rule: CustomRuleParams): number[] {
  const lesson = ctx.lessons[l];
  const out: number[] = [];
  switch (rule.kind) {
    case "subjectPeriods": {
      if (!ruleTargets(ctx, l, rule)) return [];
      // Allowed only inside [from, to] on the listed days: forbid everything else.
      const allowed = new Set(ruleSlots(rule.days, rule.fromPeriod, rule.toPeriod, ctx.workingDays));
      for (const d of ctx.workingDays)
        for (let p = 0; p < ctx.dayPeriods[d]; p++) if (!allowed.has(slotOf(d, p))) out.push(slotOf(d, p));
      return out;
    }
    case "teacherUnavailable":
      if (!lesson.teacherIds.includes(rule.teacherId)) return [];
      return ruleSlots(rule.days, rule.fromPeriod, rule.toPeriod, ctx.workingDays);
    case "classUnavailable":
      if (rule.classIds.length && !lesson.classIds.some((c) => rule.classIds.includes(c))) return [];
      return ruleSlots(rule.days, rule.fromPeriod, rule.toPeriod, ctx.workingDays);
    case "notAfterBreak": {
      if (!ruleTargets(ctx, l, rule)) return [];
      for (const d of ctx.workingDays)
        for (let p = 1; p < ctx.dayPeriods[d]; p++) {
          const b = ctx.breakAfter[p - 1];
          if (b && (rule.breakKind === "any" || rule.breakKind === b)) out.push(slotOf(d, p));
        }
      return out;
    }
    case "notLastPeriod":
      if (!ruleTargets(ctx, l, rule)) return [];
      return ctx.workingDays.map((d) => slotOf(d, ctx.dayPeriods[d] - 1));
    case "notFirstPeriod":
      if (!ruleTargets(ctx, l, rule)) return [];
      return ctx.workingDays.map((d) => slotOf(d, 0));
    case "maxPerDay":
      return [];
  }
}

export function buildCtx(project: Project): Ctx {
  const dayPeriods = [0, 0, 0, 0, 0, 0];
  for (const d of project.calendar.days) dayPeriods[d.day] = d.periods;
  const workingDays = [0, 1, 2, 3, 4, 5].filter((d) => dayPeriods[d] > 0);
  const breakAfter: ("short" | "lunch" | null)[] = Array(MAX_PERIODS).fill(null);
  for (const b of project.calendar.breaks) {
    // Lunch wins if both are defined after the same period.
    if (breakAfter[b.afterPeriod] !== "lunch") breakAfter[b.afterPeriod] = b.kind;
  }
  const idx = <T extends { id: string }>(arr: T[]) => new Map(arr.map((x, i) => [x.id, i]));
  const classIndex = idx(project.classes);
  const teacherIndex = idx(project.teachers);
  const roomIndex = idx(project.rooms);
  const subjectIndex = idx(project.subjects);
  const lessons = project.lessons;
  const lessonIndex = idx(lessons);

  const ctx: Ctx = {
    project,
    dayPeriods,
    workingDays,
    breakAfter,
    lessons,
    lessonIndex,
    classIndex,
    teacherIndex,
    roomIndex,
    subjectIndex,
    lessonClasses: lessons.map((l) => l.classIds.map((c) => classIndex.get(c) ?? -1).filter((x) => x >= 0)),
    lessonTeachers: lessons.map((l) => l.teacherIds.map((t) => teacherIndex.get(t) ?? -1).filter((x) => x >= 0)),
    lessonSubject: lessons.map((l) => subjectIndex.get(l.subjectId) ?? -1),
    lessonRoom: [],
    lessonBanned: [],
    lessonSoft: [],
    lessonDayMax: [],
    groups: [],
    groupOfLesson: [],
    units: [],
    unitsOfGroup: [],
    names: {
      classes: project.classes.map((c) => c.name),
      teachers: project.teachers.map((t) => t.name),
      rooms: project.rooms.map((r) => r.name),
      subjects: project.subjects.map((s) => s.name),
    },
  };

  // Room needs: explicit/subject room type > homeroom of the (first) class > none.
  ctx.lessonRoom = lessons.map((l) => {
    const type = lessonRoomType(project, l);
    if (!type && l.blockId === null && l.classIds.length === 1) {
      const home = project.classes.find((c) => c.id === l.classIds[0])?.homeroomId;
      if (home && roomIndex.has(home)) return { kind: "fixed", room: roomIndex.get(home)! };
      return { kind: "none" };
    }
    const t: RoomType = type ?? "classroom";
    const minCap = groupStrength(project, l);
    const candidates = project.rooms
      .map((r, i) => ({ r, i }))
      .filter(({ r }) => r.type === t && r.capacity >= minCap)
      .sort((a, b) => a.r.capacity - b.r.capacity)
      .map(({ i }) => i);
    return { kind: "type", type: t, minCap, candidates };
  });

  // Hard bans and soft custom penalties per lesson.
  const fixedEvents = project.calendar.fixedEvents;
  ctx.lessonBanned = lessons.map((l, li) => {
    const banned = new Set<number>();
    for (const t of ctx.lessonTeachers[li]) for (const s of project.teachers[t].unavailable) banned.add(s);
    for (const c of ctx.lessonClasses[li]) for (const s of project.classes[c].unavailable) banned.add(s);
    for (const e of fixedEvents)
      if (!e.classIds.length || e.classIds.some((c) => l.classIds.includes(c))) banned.add(slotOf(e.day, e.period));
    return banned;
  });
  ctx.lessonSoft = lessons.map(() => new Map<number, number>());
  ctx.lessonDayMax = lessons.map(() => project.settings.maxSameSubjectPerDay);
  for (const rule of project.rules) {
    if (!rule.enabled || !rule.custom) continue;
    const r = rule.custom;
    for (let li = 0; li < lessons.length; li++) {
      if (r.kind === "maxPerDay") {
        if (rule.hard && ruleTargets(ctx, li, r)) ctx.lessonDayMax[li] = r.max;
        continue;
      }
      const slots = customRuleSlots(ctx, li, r);
      for (const s of slots) {
        if (rule.hard) ctx.lessonBanned[li].add(s);
        else ctx.lessonSoft[li].set(s, (ctx.lessonSoft[li].get(s) ?? 0) + rule.weight);
      }
    }
  }

  // Groups: elective blocks are one group; every other lesson is its own group.
  const blockGroup = new Map<string, number>();
  lessons.forEach((l, li) => {
    let g: number;
    if (l.blockId && blockGroup.has(l.blockId)) {
      g = blockGroup.get(l.blockId)!;
      const grp = ctx.groups[g];
      grp.lessons.push(li);
      for (const c of ctx.lessonClasses[li]) if (!grp.classes.includes(c)) grp.classes.push(c);
      grp.teachers.push(...ctx.lessonTeachers[li]);
    } else {
      g = ctx.groups.length;
      ctx.groups.push({
        id: l.blockId ?? l.id,
        lessons: [li],
        classes: [...ctx.lessonClasses[li]],
        teachers: [...ctx.lessonTeachers[li]],
        units: unitLengths(l),
      });
      if (l.blockId) blockGroup.set(l.blockId, g);
    }
    ctx.groupOfLesson[li] = g;
  });
  ctx.groups.forEach((g, gi) => {
    ctx.unitsOfGroup[gi] = [];
    g.units.forEach((length, k) => {
      ctx.unitsOfGroup[gi].push(ctx.units.length);
      ctx.units.push({ index: ctx.units.length, group: gi, k, length });
    });
  });
  return ctx;
}

/** Can a unit of `length` start at (day, period) given only the calendar (no occupancy)? */
export function fitsCalendar(ctx: Ctx, day: number, period: number, length: number): boolean {
  if (period + length > ctx.dayPeriods[day]) return false;
  for (let q = period; q < period + length - 1; q++) {
    const b = ctx.breakAfter[q];
    if (b === "lunch") return false;
    if (b === "short" && !ctx.project.settings.allowDoubleAcrossShortBreak) return false;
  }
  return true;
}

/** Start slots allowed for a group's unit of a given length by static rules alone. */
export function staticDomain(ctx: Ctx, g: number, length: number): number[] {
  const out: number[] = [];
  const grp = ctx.groups[g];
  for (const d of ctx.workingDays)
    for (let p = 0; p < ctx.dayPeriods[d]; p++) {
      if (!fitsCalendar(ctx, d, p, length)) continue;
      let ok = true;
      for (let q = p; q < p + length && ok; q++)
        for (const li of grp.lessons) if (ctx.lessonBanned[li].has(slotOf(d, q))) ok = false;
      if (ok) out.push(slotOf(d, p));
    }
  return out;
}

/** Is there a break between teaching period p and p+1 that resets a consecutive run? */
export const resetsRun = (ctx: Ctx, p: number) => ctx.breakAfter[p] === "lunch";
