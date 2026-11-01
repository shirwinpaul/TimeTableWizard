import { DAY_SHORT, type CustomRuleParams, type Project } from "./schema";

export const RULE_KIND_LABELS: Record<CustomRuleParams["kind"], string> = {
  subjectPeriods: "Subject only in certain periods",
  teacherUnavailable: "Teacher unavailable",
  classUnavailable: "Class unavailable",
  notAfterBreak: "Subject not right after a break / lunch",
  notLastPeriod: "Subject not in the last period",
  notFirstPeriod: "Subject not in the first period",
  maxPerDay: "Max periods of a subject per day",
};

const days = (d: number[]) => (d.length ? d.map((x) => DAY_SHORT[x]).join(", ") : "every day");
const periods = (a: number, b: number) => (a === b ? `period ${a + 1}` : `periods ${Math.min(a, b) + 1}–${Math.max(a, b) + 1}`);

/** Plain-language label for a structured rule. */
export function describeRule(p: Project, r: CustomRuleParams): string {
  const subj = (id: string | null) => (id ? p.subjects.find((s) => s.id === id)?.name ?? "?" : "Any subject");
  const cls = (ids: string[]) => (ids.length ? ids.map((id) => p.classes.find((c) => c.id === id)?.name ?? "?").join(", ") : "all classes");
  switch (r.kind) {
    case "subjectPeriods":
      return `${subj(r.subjectId)} for ${cls(r.classIds)} only in ${periods(r.fromPeriod, r.toPeriod)} (${days(r.days)})`;
    case "teacherUnavailable":
      return `${p.teachers.find((t) => t.id === r.teacherId)?.name ?? "?"} unavailable on ${days(r.days)}, ${periods(r.fromPeriod, r.toPeriod)}`;
    case "classUnavailable":
      return `${cls(r.classIds)} unavailable on ${days(r.days)}, ${periods(r.fromPeriod, r.toPeriod)}`;
    case "notAfterBreak":
      return `${subj(r.subjectId)} for ${cls(r.classIds)} not right after ${r.breakKind === "any" ? "a break" : r.breakKind === "lunch" ? "lunch" : "the short break"}`;
    case "notLastPeriod":
      return `${subj(r.subjectId)} for ${cls(r.classIds)} not in the last period`;
    case "notFirstPeriod":
      return `${subj(r.subjectId)} for ${cls(r.classIds)} not in the first period`;
    case "maxPerDay":
      return `At most ${r.max} ${subj(r.subjectId)} period(s) per day for ${cls(r.classIds)}`;
  }
}

export function defaultParams(kind: CustomRuleParams["kind"], p: Project): CustomRuleParams {
  const subjectId = p.subjects[0]?.id ?? null;
  switch (kind) {
    case "subjectPeriods":
      return { kind, subjectId, classIds: [], days: [], fromPeriod: 0, toPeriod: 3 };
    case "teacherUnavailable":
      return { kind, teacherId: p.teachers[0]?.id ?? "", days: [p.calendar.days[0]?.day ?? 0], fromPeriod: 0, toPeriod: 0 };
    case "classUnavailable":
      return { kind, classIds: [], days: [p.calendar.days[0]?.day ?? 0], fromPeriod: 0, toPeriod: 0 };
    case "notAfterBreak":
      return { kind, subjectId, classIds: [], breakKind: "lunch" };
    case "maxPerDay":
      return { kind, subjectId, classIds: [], max: 1 };
    default:
      return { kind, subjectId, classIds: [] };
  }
}
