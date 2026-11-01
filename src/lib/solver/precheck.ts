import type { Fix } from "@/lib/model/fixes";
import { DAY_NAMES, ROOM_TYPE_LABELS, dayOf, slotOf, type Project, type RoomType } from "@/lib/model/schema";
import { buildCtx, staticDomain, unitLengths, type Ctx } from "./context";
import { lessonLabel } from "./validator";

/**
 * Fast feasibility analysis run BEFORE solving. Each problem gets a plain-language
 * message and 1–3 suggested fixes (some are one-tap actions).
 */

export interface Problem {
  severity: "error" | "warning";
  /** Stable code (sent to the AI instead of names). */
  code:
    | "missingRef"
    | "classOverload"
    | "teacherOverload"
    | "teacherWeekMax"
    | "teacherDayCapacity"
    | "noRoom"
    | "roomOverload"
    | "doubleImpossible"
    | "subjectDayLimit"
    | "noSlot"
    | "blockMismatch"
    | "teacherNotQualified"
    | "nothingToSchedule";
  message: string;
  fixes: Fix[];
  /** Numbers behind the message, for AI explanations (no names). */
  data: Record<string, number | string>;
}

export interface PrecheckResult {
  ok: boolean;
  problems: Problem[];
}

/** Slots in the week where a class can have lessons. */
function classFreeSlots(ctx: Ctx, c: number): number {
  const p = ctx.project;
  const cls = p.classes[c];
  const banned = new Set<number>(cls.unavailable);
  for (const e of p.calendar.fixedEvents) if (!e.classIds.length || e.classIds.includes(cls.id)) banned.add(slotOf(e.day, e.period));
  for (const r of p.rules) {
    if (!r.enabled || !r.hard || r.custom?.kind !== "classUnavailable") continue;
    if (r.custom.classIds.length && !r.custom.classIds.includes(cls.id)) continue;
    const [a, b] = [Math.min(r.custom.fromPeriod, r.custom.toPeriod), Math.max(r.custom.fromPeriod, r.custom.toPeriod)];
    for (const d of r.custom.days) for (let q = a; q <= b; q++) banned.add(slotOf(d, q));
  }
  let n = 0;
  for (const d of ctx.workingDays) for (let q = 0; q < ctx.dayPeriods[d]; q++) if (!banned.has(slotOf(d, q))) n++;
  return n;
}

/** Free slots per day for a teacher (unavailability + hard teacher rules removed). */
function teacherFreeByDay(ctx: Ctx, t: number): number[] {
  const p = ctx.project;
  const teacher = p.teachers[t];
  const banned = new Set<number>(teacher.unavailable);
  for (const r of p.rules) {
    if (!r.enabled || !r.hard || r.custom?.kind !== "teacherUnavailable" || r.custom.teacherId !== teacher.id) continue;
    const [a, b] = [Math.min(r.custom.fromPeriod, r.custom.toPeriod), Math.max(r.custom.fromPeriod, r.custom.toPeriod)];
    for (const d of r.custom.days) for (let q = a; q <= b; q++) banned.add(slotOf(d, q));
  }
  return [0, 1, 2, 3, 4, 5].map((d) => {
    let n = 0;
    for (let q = 0; q < ctx.dayPeriods[d]; q++) if (!banned.has(slotOf(d, q))) n++;
    return n;
  });
}

export function precheck(project: Project): PrecheckResult {
  const problems: Problem[] = [];
  const add = (severity: Problem["severity"], code: Problem["code"], message: string, fixes: Fix[], data: Problem["data"] = {}) =>
    problems.push({ severity, code, message, fixes, data });

  if (!project.lessons.length) {
    add("error", "nothingToSchedule", "There are no lessons yet. Add lessons (class + subject + teacher + periods per week) first.", [
      { label: "Open step 7 (Lessons) of the setup wizard" },
    ]);
    return { ok: false, problems };
  }

  // 1. Broken references
  const ids = {
    classes: new Set(project.classes.map((c) => c.id)),
    subjects: new Set(project.subjects.map((s) => s.id)),
    teachers: new Set(project.teachers.map((t) => t.id)),
  };
  let broken = false;
  const unnamed = [
    ...project.classes.filter((x) => !x.name.trim()).map(() => "class"),
    ...project.subjects.filter((x) => !x.name.trim() || !x.code.trim()).map(() => "subject"),
    ...project.teachers.filter((x) => !x.name.trim() || !x.code.trim()).map(() => "teacher"),
    ...project.rooms.filter((x) => !x.name.trim()).map(() => "room"),
  ];
  if (unnamed.length) {
    broken = true;
    add("error", "missingRef", `${unnamed.length} row(s) have no name or code yet (first one: a ${unnamed[0]}).`, [{ label: "Fill in or delete the empty rows in steps 3–6" }], { count: unnamed.length });
  }
  project.lessons.forEach((l, i) => {
    if (!l.classIds.length || !l.subjectId || !l.teacherIds.length) {
      broken = true;
      add("error", "missingRef", `Lesson #${i + 1} is incomplete — it needs a class, a subject and a teacher.`, [{ label: "Complete or delete it in step 7 (Lessons)" }], { lesson: i + 1 });
      return;
    }
    const missing = [
      ...l.classIds.filter((c) => !ids.classes.has(c)).map(() => "class"),
      ...(ids.subjects.has(l.subjectId) ? [] : ["subject"]),
      ...l.teacherIds.filter((t) => !ids.teachers.has(t)).map(() => "teacher"),
    ];
    if (missing.length) {
      broken = true;
      add("error", "missingRef", `Lesson #${i + 1} refers to a ${missing[0]} that no longer exists.`, [
        { label: "Edit or delete this lesson in step 7 (Lessons)" },
      ], { lesson: i + 1 });
    }
  });
  if (broken) return { ok: false, problems };

  const ctx = buildCtx(project);
  const totalSlots = ctx.workingDays.reduce((n, d) => n + ctx.dayPeriods[d], 0);

  // 2. Elective blocks must be consistent
  for (const g of ctx.groups) {
    if (g.lessons.length < 2) continue;
    const first = ctx.lessons[g.lessons[0]];
    const same = g.lessons.every((li) => ctx.lessons[li].periodsPerWeek === first.periodsPerWeek && ctx.lessons[li].doubles === first.doubles);
    if (!same)
      add("error", "blockMismatch", `All lessons in elective block "${g.id}" must have the same periods per week and doubles.`, [
        { label: `Set every lesson in the block to ${first.periodsPerWeek} periods` },
      ]);
    const dup = g.teachers.find((t, i) => g.teachers.indexOf(t) !== i);
    if (dup !== undefined)
      add("error", "blockMismatch", `${ctx.names.teachers[dup]} teaches two groups of the same elective block at the same time.`, [
        { label: "Give one of the groups a different teacher" },
      ]);
  }

  // 3. Class demand vs available slots
  project.classes.forEach((cls, c) => {
    let demand = 0;
    let biggest = -1;
    ctx.groups.forEach((g) => {
      if (!g.classes.includes(c)) return;
      demand += g.units.reduce((a, b) => a + b, 0);
      const li = g.lessons[0];
      if (biggest < 0 || ctx.lessons[li].periodsPerWeek > ctx.lessons[biggest].periodsPerWeek) biggest = li;
    });
    const free = classFreeSlots(ctx, c);
    if (demand > free) {
      const over = demand - free;
      const fixes: Fix[] = [];
      if (biggest >= 0 && ctx.lessons[biggest].periodsPerWeek > over)
        fixes.push({
          label: `Reduce ${lessonLabel(ctx, biggest)} to ${ctx.lessons[biggest].periodsPerWeek - over} periods/week`,
          action: { type: "setLessonPeriods", lessonId: ctx.lessons[biggest].id, value: ctx.lessons[biggest].periodsPerWeek - over },
        });
      fixes.push({ label: "Add more periods to the school day or a Saturday (step 2)" });
      add("error", "classOverload", `Class ${cls.name} needs ${demand} periods but only ${free} are available in the week.`, fixes, { demand, free });
    }
  });

  // 4. Teacher demand vs limits and availability
  project.teachers.forEach((teacher, t) => {
    let demand = 0;
    ctx.lessons.forEach((l, li) => {
      if (!ctx.lessonTeachers[li].includes(t)) return;
      demand += l.periodsPerWeek;
      if (l.subjectId && !teacher.subjectIds.includes(l.subjectId))
        add("warning", "teacherNotQualified", `${teacher.name} is assigned ${lessonLabel(ctx, li)} but that subject isn't in their subject list.`, [
          { label: "Add the subject to the teacher (step 5) or pick another teacher" },
        ]);
    });
    if (!demand) return;
    const freeByDay = teacherFreeByDay(ctx, t);
    const free = freeByDay.reduce((a, b) => a + b, 0);
    const dayCap = ctx.workingDays.reduce((n, d) => n + Math.min(teacher.maxPerDay, freeByDay[d]), 0);
    if (demand > free) {
      const blockedDays = ctx.workingDays.filter((d) => freeByDay[d] < ctx.dayPeriods[d]);
      const fixes: Fix[] = [{ label: `Move ${demand - free} of ${teacher.name}'s periods to another teacher (step 7)` }];
      if (blockedDays.length)
        fixes.push({
          label: `Make ${teacher.name} available on ${DAY_NAMES[blockedDays[0]]}`,
          action: { type: "clearTeacherUnavailable", teacherId: teacher.id, day: blockedDays[0] },
        });
      add("error", "teacherOverload", `${teacher.name} needs ${demand} periods but is available for only ${free}.`, fixes, { demand, free });
    } else if (demand > teacher.maxPerWeek) {
      add("error", "teacherWeekMax", `${teacher.name} needs ${demand} periods but their weekly maximum is ${teacher.maxPerWeek}.`, [
        { label: `Raise ${teacher.name}'s weekly maximum to ${demand}`, action: { type: "setTeacherLimit", teacherId: teacher.id, field: "maxPerWeek", value: demand } },
        { label: `Move ${demand - teacher.maxPerWeek} periods to another teacher (step 7)` },
      ], { demand, max: teacher.maxPerWeek });
    } else if (demand > dayCap) {
      const need = Math.ceil(demand / Math.max(1, ctx.workingDays.filter((d) => freeByDay[d] > 0).length));
      add("error", "teacherDayCapacity", `${teacher.name} needs ${demand} periods, but with at most ${teacher.maxPerDay} per day only ${dayCap} fit in the week.`, [
        { label: `Raise ${teacher.name}'s daily maximum to ${need}`, action: { type: "setTeacherLimit", teacherId: teacher.id, field: "maxPerDay", value: need } },
      ], { demand, capacity: dayCap });
    }
  });

  // 5. Rooms: a big-enough room of each needed type, and enough room-periods
  const typeDemand = new Map<RoomType, number>();
  ctx.lessons.forEach((l, li) => {
    const need = ctx.lessonRoom[li];
    if (need.kind !== "type") return;
    typeDemand.set(need.type, (typeDemand.get(need.type) ?? 0) + l.periodsPerWeek);
    if (!need.candidates.length) {
      const any = project.rooms.filter((r) => r.type === need.type);
      const label = ROOM_TYPE_LABELS[need.type].toLowerCase();
      add("error", "noRoom", any.length
        ? `No ${label} can hold ${lessonLabel(ctx, li)} (${need.minCap} students; largest holds ${Math.max(...any.map((r) => r.capacity))}).`
        : `${lessonLabel(ctx, li)} needs a ${label}, but there isn't one.`, [
        { label: `Add a ${label} for ${need.minCap} students`, action: { type: "addRoom", roomType: need.type, capacity: need.minCap } },
        { label: "Set a smaller group size or a different room type on the lesson (step 7)" },
      ], { students: need.minCap });
    }
  });
  for (const [type, demand] of typeDemand) {
    const rooms = project.rooms.filter((r) => r.type === type);
    const supply = rooms.length * totalSlots;
    if (rooms.length && demand > supply) {
      const label = ROOM_TYPE_LABELS[type].toLowerCase();
      add("error", "roomOverload", `Lessons need the ${label} for ${demand} periods but ${rooms.length} ${label}(s) give only ${supply}.`, [
        { label: `Add another ${label}`, action: { type: "addRoom", roomType: type, capacity: Math.max(...rooms.map((r) => r.capacity)) } },
      ], { demand, supply });
    }
  }

  // 6. Doubles, subject-per-day limits and empty domains — per group
  ctx.groups.forEach((g, gi) => {
    const li = g.lessons[0];
    const l = ctx.lessons[li];
    const label = lessonLabel(ctx, li);
    const units = unitLengths(l);
    const doubles = units.filter((x) => x === 2).length;
    if (l.doubles > Math.floor(l.periodsPerWeek / 2))
      add("warning", "doubleImpossible", `${label} asks for ${l.doubles} doubles but has only ${l.periodsPerWeek} periods; using ${doubles}.`, [
        { label: `Set doubles to ${doubles}`, action: { type: "setLessonDoubles", lessonId: l.id, value: doubles } },
      ]);
    const singleDom = staticDomain(ctx, gi, 1);
    const days = new Set(singleDom.map(dayOf)).size;
    if (!singleDom.length) {
      add("error", "noSlot", `${label} has no allowed time at all (unavailability, fixed events or hard rules block every period).`, [
        { label: "Relax the teacher's or class's unavailable periods, or a hard rule (step 8)" },
      ]);
      return;
    }
    if (doubles) {
      const dDom = staticDomain(ctx, gi, 2);
      const dDays = new Set(dDom.map(dayOf)).size;
      // Max doubles per day = non-overlapping double positions, capped by the subject/day limit.
      const perDayCap = Math.max(1, Math.floor(ctx.lessonDayMax[li] / 2));
      let capacity = 0;
      for (const d of ctx.workingDays) {
        let n = 0;
        let lastEnd = -1;
        for (const s of dDom) if (dayOf(s) === d && s % 16 > lastEnd) {
          n++;
          lastEnd = (s % 16) + 1;
        }
        capacity += Math.min(n, perDayCap);
      }
      if (!dDom.length) {
        const fixes: Fix[] = [{ label: `Remove the double period from ${label}`, action: { type: "setLessonDoubles", lessonId: l.id, value: 0 } }];
        if (!project.settings.allowDoubleAcrossShortBreak)
          fixes.unshift({ label: "Allow double periods across a short break", action: { type: "allowDoubleAcrossShortBreak" } });
        add("error", "doubleImpossible", `${label} needs a double period but there are no two consecutive free periods without a break.`, fixes);
      } else if (doubles > capacity) {
        add("error", "doubleImpossible", `${label} needs ${doubles} double periods but only ${capacity} fit in the week (${dDays} day(s) have room for one).`, [
          { label: `Reduce to ${capacity} doubles`, action: { type: "setLessonDoubles", lessonId: l.id, value: capacity } },
        ], { doubles, capacity });
      }
    }
    const max = ctx.lessonDayMax[li];
    if (l.periodsPerWeek > max * days) {
      const need = Math.ceil(l.periodsPerWeek / days);
      add("error", "subjectDayLimit", `${label} has ${l.periodsPerWeek} periods/week but at most ${max} per day over ${days} day(s) allows only ${max * days}.`, [
        { label: `Allow ${need} periods of the same subject per day`, action: { type: "setMaxSameSubjectPerDay", value: need } },
        { label: `Reduce ${label} to ${max * days} periods/week`, action: { type: "setLessonPeriods", lessonId: l.id, value: max * days } },
      ], { periods: l.periodsPerWeek, max, days });
    }
  });

  return { ok: !problems.some((p) => p.severity === "error"), problems };
}
