import { DAY_NAMES, slotOf, type Project, type Substitution } from "@/lib/model/schema";

/**
 * Daily substitutions: which periods an absent teacher leaves uncovered, and which
 * teachers are FREE in each slot, ranked by subject expertise, then fairness
 * (fewest substitutions this week, then this month), then fewest periods that day.
 */

/** Weekday index used by the timetable (0 = Monday … 5 = Saturday, 6 = Sunday). */
export function weekdayOf(date: string): number {
  return (new Date(`${date}T00:00:00Z`).getUTCDay() + 6) % 7;
}

const weekStart = (date: string) => {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - weekdayOf(date));
  return d.toISOString().slice(0, 10);
};
const sameWeek = (a: string, b: string) => weekStart(a) === weekStart(b);
const sameMonth = (a: string, b: string) => a.slice(0, 7) === b.slice(0, 7);

export interface Affected {
  lessonId: string;
  period: number;
  label: string;
  subjectId: string;
}

/** Periods on `date` taught by the teacher (optionally only some periods). */
export function affectedPeriods(p: Project, teacherId: string, date: string, periods?: number[]): Affected[] {
  const day = weekdayOf(date);
  const out: Affected[] = [];
  for (const pl of p.timetable?.placements ?? []) {
    if (pl.day !== day) continue;
    const l = p.lessons.find((x) => x.id === pl.lessonId);
    if (!l || !l.teacherIds.includes(teacherId)) continue;
    for (let q = pl.period; q < pl.period + pl.length; q++) {
      if (periods && !periods.includes(q)) continue;
      const cls = l.classIds.map((c) => p.classes.find((x) => x.id === c)?.name ?? "?").join("+");
      const subj = p.subjects.find((s) => s.id === l.subjectId)?.name ?? "";
      out.push({ lessonId: l.id, period: q, label: `${cls} ${subj}`, subjectId: l.subjectId });
    }
  }
  return out.sort((a, b) => a.period - b.period);
}

export interface Candidate {
  teacherId: string;
  name: string;
  sameSubject: boolean;
  subsWeek: number;
  subsMonth: number;
  periodsToday: number;
}

/** Teachers who can cover (lessonId, period) on date, best first. */
export function rankSubstitutes(p: Project, date: string, period: number, lessonId: string, opts: { exclude?: string[] } = {}): Candidate[] {
  const day = weekdayOf(date);
  const lesson = p.lessons.find((l) => l.id === lessonId);
  const absent = new Set([...(opts.exclude ?? []), ...p.substitutions.filter((s) => s.date === date).map((s) => s.absentTeacherId)]);
  const lessonsById = new Map(p.lessons.map((l) => [l.id, l]));
  // Regular teaching that day, per teacher.
  const busyAt = new Map<string, Set<number>>();
  for (const pl of p.timetable?.placements ?? []) {
    if (pl.day !== day) continue;
    for (const t of lessonsById.get(pl.lessonId)?.teacherIds ?? []) {
      if (!busyAt.has(t)) busyAt.set(t, new Set());
      for (let q = pl.period; q < pl.period + pl.length; q++) busyAt.get(t)!.add(q);
    }
  }
  const subsToday = p.substitutions.filter((s) => s.date === date && s.substituteId);
  return p.teachers
    .filter((t) => {
      if (absent.has(t.id)) return false;
      if (busyAt.get(t.id)?.has(period)) return false;
      if (t.unavailable.includes(slotOf(day, period))) return false;
      if (subsToday.some((s) => s.substituteId === t.id && s.period === period)) return false;
      const load = (busyAt.get(t.id)?.size ?? 0) + subsToday.filter((s) => s.substituteId === t.id).length;
      return load < t.maxPerDay;
    })
    .map((t) => {
      const mine = p.substitutions.filter((s) => s.substituteId === t.id);
      return {
        teacherId: t.id,
        name: t.name,
        sameSubject: !!lesson && t.subjectIds.includes(lesson.subjectId),
        subsWeek: mine.filter((s) => sameWeek(s.date, date)).length,
        subsMonth: mine.filter((s) => sameMonth(s.date, date)).length,
        periodsToday: (busyAt.get(t.id)?.size ?? 0) + subsToday.filter((s) => s.substituteId === t.id).length,
      };
    })
    .sort((a, b) => Number(b.sameSubject) - Number(a.sameSubject) || a.subsWeek - b.subsWeek || a.subsMonth - b.subsMonth || a.periodsToday - b.periodsToday || a.name.localeCompare(b.name));
}

/** Per-teacher substitution counts (fairness). */
export function fairness(p: Project, date: string) {
  return p.teachers
    .map((t) => {
      const mine = p.substitutions.filter((s) => s.substituteId === t.id);
      return { id: t.id, name: t.name, week: mine.filter((s) => sameWeek(s.date, date)).length, month: mine.filter((s) => sameMonth(s.date, date)).length, total: mine.length };
    })
    .sort((a, b) => b.month - a.month || a.name.localeCompare(b.name));
}

/** Short text for WhatsApp / notice boards. */
export function whatsappText(p: Project, date: string, subs: Substitution[] = p.substitutions.filter((s) => s.date === date)): string {
  const name = (id: string | null) => p.teachers.find((t) => t.id === id)?.name ?? "NOT ASSIGNED";
  const pretty = `${DAY_NAMES[weekdayOf(date)] ?? "Sunday"}, ${date}`;
  const lines = [`*${p.name} — Substitutions*`, pretty, ""];
  for (const s of [...subs].sort((a, b) => a.period - b.period)) {
    const l = p.lessons.find((x) => x.id === s.lessonId);
    const cls = l?.classIds.map((c) => p.classes.find((x) => x.id === c)?.name).join("+") ?? "";
    const subj = p.subjects.find((x) => x.id === l?.subjectId)?.code ?? "";
    lines.push(`P${s.period + 1} · ${cls} ${subj}: ${name(s.substituteId)} (for ${name(s.absentTeacherId)})`);
  }
  if (!subs.length) lines.push("No substitutions today.");
  return lines.join("\n");
}
