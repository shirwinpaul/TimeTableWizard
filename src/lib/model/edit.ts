import type { Project } from "./schema";

/** Cascading edits that keep references consistent. All mutate the given draft. */

export function lessonsUsing(p: Project, kind: "class" | "subject" | "teacher", id: string): number {
  return p.lessons.filter((l) => (kind === "class" ? l.classIds.includes(id) : kind === "subject" ? l.subjectId === id : l.teacherIds.includes(id))).length;
}

export function removeClass(p: Project, id: string) {
  p.classes = p.classes.filter((c) => c.id !== id);
  for (const l of p.lessons) l.classIds = l.classIds.filter((c) => c !== id);
  p.lessons = p.lessons.filter((l) => l.classIds.length > 0);
  for (const e of p.calendar.fixedEvents) e.classIds = e.classIds.filter((c) => c !== id);
  pruneTimetable(p);
}

export function removeSubject(p: Project, id: string) {
  p.subjects = p.subjects.filter((s) => s.id !== id);
  p.lessons = p.lessons.filter((l) => l.subjectId !== id);
  for (const t of p.teachers) t.subjectIds = t.subjectIds.filter((s) => s !== id);
  pruneTimetable(p);
}

export function removeTeacher(p: Project, id: string) {
  p.teachers = p.teachers.filter((t) => t.id !== id);
  for (const l of p.lessons) l.teacherIds = l.teacherIds.filter((t) => t !== id);
  p.lessons = p.lessons.filter((l) => l.teacherIds.length > 0);
  for (const c of p.classes) if (c.classTeacherId === id) c.classTeacherId = null;
  pruneTimetable(p);
}

export function removeRoom(p: Project, id: string) {
  p.rooms = p.rooms.filter((r) => r.id !== id);
  for (const c of p.classes) if (c.homeroomId === id) c.homeroomId = null;
  if (p.timetable) for (const pl of p.timetable.placements) if (pl.roomId === id) pl.roomId = null;
}

/** Drop placements of lessons that no longer exist. */
export function pruneTimetable(p: Project) {
  if (!p.timetable) return;
  const ids = new Set(p.lessons.map((l) => l.id));
  p.timetable.placements = p.timetable.placements.filter((pl) => ids.has(pl.lessonId));
}
