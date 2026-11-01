import { ROOM_TYPE_LABELS, type Lesson, type Placement, type Project, type Room, type Subject, type Teacher } from "@/lib/model/schema";

/** Pure helpers that turn placements into view-ready grids and statistics. */

export type ViewKind = "class" | "teacher" | "room";

export interface Entry {
  placement: Placement;
  lesson: Lesson;
  subject: Subject | undefined;
  teachers: Teacher[];
  classNames: string;
  room: Room | undefined;
  /** True for the 2nd period of a double (rendered as a continuation). */
  continuation: boolean;
}

export interface Lookup {
  lessons: Map<string, Lesson>;
  subjects: Map<string, Subject>;
  teachers: Map<string, Teacher>;
  classes: Map<string, string>;
  rooms: Map<string, Room>;
}

export function lookup(p: Project): Lookup {
  return {
    lessons: new Map(p.lessons.map((l) => [l.id, l])),
    subjects: new Map(p.subjects.map((s) => [s.id, s])),
    teachers: new Map(p.teachers.map((t) => [t.id, t])),
    classes: new Map(p.classes.map((c) => [c.id, c.name])),
    rooms: new Map(p.rooms.map((r) => [r.id, r])),
  };
}

export function entryOf(lk: Lookup, pl: Placement, continuation = false): Entry | null {
  const lesson = lk.lessons.get(pl.lessonId);
  if (!lesson) return null;
  return {
    placement: pl,
    lesson,
    subject: lk.subjects.get(lesson.subjectId),
    teachers: lesson.teacherIds.map((t) => lk.teachers.get(t)).filter((t): t is Teacher => !!t),
    classNames: lesson.classIds.map((c) => lk.classes.get(c) ?? "?").join("+"),
    room: pl.roomId ? lk.rooms.get(pl.roomId) : undefined,
    continuation,
  };
}

const matches = (kind: ViewKind, id: string, lesson: Lesson, pl: Placement) =>
  kind === "class" ? lesson.classIds.includes(id) : kind === "teacher" ? lesson.teacherIds.includes(id) : pl.roomId === id;

/** grid[day][period] = entries for one class / teacher / room. */
export function gridFor(p: Project, placements: Placement[], kind: ViewKind, id: string): Entry[][][] {
  const lk = lookup(p);
  const grid: Entry[][][] = Array.from({ length: 6 }, () => Array.from({ length: 16 }, () => []));
  for (const pl of placements) {
    const lesson = lk.lessons.get(pl.lessonId);
    if (!lesson || !matches(kind, id, lesson, pl)) continue;
    for (let q = 0; q < pl.length; q++) {
      const e = entryOf(lk, pl, q > 0);
      if (e) grid[pl.day][pl.period + q].push(e);
    }
  }
  return grid;
}

/** Master grid: rows = classes, cells per (day, period). */
export function masterGrid(p: Project, placements: Placement[]): Map<string, Entry[][][]> {
  const out = new Map<string, Entry[][][]>();
  for (const c of p.classes) out.set(c.id, gridFor(p, placements, "class", c.id));
  return out;
}

export const entityOptions = (p: Project, kind: ViewKind) =>
  kind === "class" ? p.classes.map((c) => ({ id: c.id, name: c.name })) : kind === "teacher" ? p.teachers.map((t) => ({ id: t.id, name: t.name })) : p.rooms.map((r) => ({ id: r.id, name: r.name }));

/* ---------- Statistics (quality panel) ---------- */

export interface TeacherStat {
  id: string;
  name: string;
  perDay: number[];
  total: number;
  gaps: number;
  maxConsecutive: number;
  maxPerWeek: number;
}

export interface ClassStat {
  id: string;
  name: string;
  perDay: number[];
  total: number;
  free: number;
}

export interface RoomUse {
  label: string;
  used: number;
  capacity: number;
}

export function computeStats(p: Project, placements: Placement[]) {
  const lk = lookup(p);
  const days = p.calendar.days.slice().sort((a, b) => a.day - b.day);
  const totalSlots = days.reduce((n, d) => n + d.periods, 0);
  const lunchAfter = new Set(p.calendar.breaks.filter((b) => b.kind === "lunch").map((b) => b.afterPeriod));

  const tBusy = new Map<string, Set<number>[]>(p.teachers.map((t) => [t.id, Array.from({ length: 6 }, () => new Set<number>())]));
  const cBusy = new Map<string, Set<number>[]>(p.classes.map((c) => [c.id, Array.from({ length: 6 }, () => new Set<number>())]));
  const rBusy = new Map<string, number>();
  for (const pl of placements) {
    const l = lk.lessons.get(pl.lessonId);
    if (!l) continue;
    for (let q = 0; q < pl.length; q++) {
      for (const t of l.teacherIds) tBusy.get(t)?.[pl.day].add(pl.period + q);
      for (const c of l.classIds) cBusy.get(c)?.[pl.day].add(pl.period + q);
    }
    if (pl.roomId) rBusy.set(pl.roomId, (rBusy.get(pl.roomId) ?? 0) + pl.length);
  }

  const teachers: TeacherStat[] = p.teachers.map((t) => {
    const busy = tBusy.get(t.id)!;
    let gaps = 0;
    let maxRun = 0;
    const perDay = days.map((d) => {
      const s = busy[d.day];
      if (s.size) {
        const arr = [...s].sort((a, b) => a - b);
        gaps += arr[arr.length - 1] - arr[0] + 1 - arr.length;
        let run = 0;
        for (let q = 0; q < d.periods; q++) {
          run = s.has(q) ? run + 1 : 0;
          maxRun = Math.max(maxRun, run);
          if (lunchAfter.has(q)) run = 0;
        }
      }
      return s.size;
    });
    return { id: t.id, name: t.name, perDay, total: perDay.reduce((a, b) => a + b, 0), gaps, maxConsecutive: maxRun, maxPerWeek: t.maxPerWeek };
  });

  const classes: ClassStat[] = p.classes.map((c) => {
    const perDay = days.map((d) => cBusy.get(c.id)![d.day].size);
    const total = perDay.reduce((a, b) => a + b, 0);
    return { id: c.id, name: c.name, perDay, total, free: totalSlots - total };
  });

  // Utilisation of special rooms (labs, grounds…) grouped by type.
  const byType = new Map<string, RoomUse>();
  for (const r of p.rooms) {
    if (r.type === "classroom") continue;
    const u = byType.get(r.type) ?? { label: ROOM_TYPE_LABELS[r.type], used: 0, capacity: 0 };
    u.used += rBusy.get(r.id) ?? 0;
    u.capacity += totalSlots;
    byType.set(r.type, u);
  }
  return { teachers, classes, rooms: [...byType.values()], days: days.map((d) => d.day), totalSlots };
}

/** Cells (`classId@day.period`) whose lessons differ between two timetables. */
export function diffCells(p: Project, a: Placement[], b: Placement[]): Set<string> {
  const sig = (pls: Placement[]) => {
    const m = new Map<string, string[]>();
    const lessons = new Map(p.lessons.map((l) => [l.id, l]));
    for (const pl of pls) {
      const l = lessons.get(pl.lessonId);
      if (!l) continue;
      for (const c of l.classIds)
        for (let q = 0; q < pl.length; q++) {
          const k = `${c}@${pl.day}.${pl.period + q}`;
          m.set(k, [...(m.get(k) ?? []), pl.lessonId].sort());
        }
    }
    return m;
  };
  const A = sig(a);
  const B = sig(b);
  const out = new Set<string>();
  for (const k of new Set([...A.keys(), ...B.keys()])) if ((A.get(k) ?? []).join() !== (B.get(k) ?? []).join()) out.add(k);
  return out;
}
