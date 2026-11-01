import type { z } from "zod";
import type { CustomRuleParams } from "@/lib/model/schema";
import type { DescribeRuleOut, DescribeRuleRequest, DraftOut, DraftRequest, ExplainOut, ExplainRequest, SummariseOut, SummariseRequest } from "./schemas";

/**
 * MOCK_AI responses (development only): deterministic, keyword-based, so the
 * whole assistant flow can be tested without using any real quota.
 */

const DAYS = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
const COMMON = new Set(["the", "a", "an", "should", "never", "must", "not", "be", "in", "on", "after", "before", "right", "lunch", "break", "period", "periods", "only", "morning", "afternoon", "last", "first", "for", "all", "classes", "class", "is", "are", "unavailable", "available", "prefer", "avoid", "try", "max", "at", "most", "per", "day", "days", "and", "or", "to", "of", "teach", "teaches", "no", "can't", "cannot", "has", "have", "with", "i", "we", "please", "mr", "mrs", "ms", "miss", "dr", "sir", ...DAYS]);

type DescribeIn = z.infer<typeof DescribeRuleRequest>;

export function mockDescribe(req: DescribeIn): DescribeRuleOut {
  const text = req.text;
  const low = text.toLowerCase();
  const words = text.replace(/\[T:[^\]]+\]/g, " ").split(/[^A-Za-z0-9-]+/).filter(Boolean);
  const subj = req.refs.subjects.find((s) => {
    const [code, ...name] = s.label.split(" ");
    const full = name.join(" ").toLowerCase();
    return words.some((w) => w.toLowerCase() === code.toLowerCase() || (w.length >= 4 && full.startsWith(w.toLowerCase().replace(/s$/, "")))) || low.includes(full);
  });
  const classIds = req.refs.classes.filter((c) => words.some((w) => w.toLowerCase() === c.label.toLowerCase())).map((c) => c.id);
  const teacherCode = text.match(/\[T:([^\]]+)\]/)?.[1];
  const teacher = teacherCode ? req.refs.teachers.find((t) => t.label === teacherCode) : undefined;
  const known = new Set([...req.refs.subjects.flatMap((s) => s.label.toLowerCase().split(" ")), ...req.refs.classes.map((c) => c.label.toLowerCase())]);
  const isKnown = (w: string) => known.has(w.toLowerCase()) || (!!subj && w.length >= 4 && subj.label.toLowerCase().includes(w.toLowerCase().replace(/s$/, "")));
  // Capitalised words we don't recognise are flagged (e.g. a teacher or subject not in the data).
  const unknown = words.filter((w) => /^[A-Z]/.test(w) && !COMMON.has(w.toLowerCase()) && !isKnown(w));
  const days = DAYS.map((d, i) => (low.includes(d) ? i : -1)).filter((i) => i >= 0 && req.refs.days.includes(i));
  const hard = /\b(never|must|cannot|can't|not allowed|unavailable)\b/.test(low);
  const range = low.match(/\bp(?:eriod)?s?\s*(\d+)\s*(?:to|-|–)\s*p?(\d+)/);
  const nums = range ? [Number(range[1]) - 1, Number(range[2]) - 1] : [...low.matchAll(/\bp(?:eriod)?s?\s*(\d+)/g)].map((m) => Number(m[1]) - 1);
  const from = nums.length ? Math.min(...nums) : 0;
  const to = nums.length ? Math.max(...nums) : req.refs.periods - 1;

  let rule: CustomRuleParams | null = null;
  const subjectId = subj?.id ?? null;
  if (/unavailable|not available|absent|off on|busy/.test(low) && (teacher || teacherCode)) {
    if (!teacher) return { rule: null, hard, weight: 5, unknown: [teacherCode!], note: "That teacher code isn't in your list." };
    rule = { kind: "teacherUnavailable", teacherId: teacher.id, days: days.length ? days : [req.refs.days[0]], fromPeriod: from, toPeriod: to };
  } else if (/after lunch/.test(low)) rule = { kind: "notAfterBreak", subjectId, classIds, breakKind: "lunch" };
  else if (/after (the )?break/.test(low)) rule = { kind: "notAfterBreak", subjectId, classIds, breakKind: "short" };
  else if (/last period/.test(low)) rule = { kind: "notLastPeriod", subjectId, classIds };
  else if (/first period/.test(low)) rule = { kind: "notFirstPeriod", subjectId, classIds };
  else if (/(at most|max(imum)?)\s*(\d+)/.test(low)) rule = { kind: "maxPerDay", subjectId, classIds, max: Number(low.match(/(at most|max(?:imum)?)\s*(\d+)/)![2]) };
  else if (/morning/.test(low)) rule = { kind: "subjectPeriods", subjectId, classIds, days, fromPeriod: 0, toPeriod: Math.ceil(req.refs.periods / 2) - 1 };
  else if (nums.length) rule = { kind: "subjectPeriods", subjectId, classIds, days, fromPeriod: from, toPeriod: to };

  if (unknown.length) return { rule: null, hard, weight: 5, unknown: [...new Set(unknown)].slice(0, 10), note: "I couldn't match some names to your data." };
  if (rule && "subjectId" in rule && !rule.subjectId) return { rule: null, hard, weight: 5, unknown: [], note: "Which subject do you mean?" };
  return { rule, hard: rule?.kind === "maxPerDay" ? true : hard, weight: hard ? 8 : 5, unknown: [], note: rule ? "(mock AI)" : "I couldn't understand that rule — try the rule builder." };
}

export function mockExplain(req: z.infer<typeof ExplainRequest>): ExplainOut {
  const parts = req.problems.slice(0, 3).map((p) => {
    const d = Object.entries(p.data).map(([k, v]) => `${k} ${v}`).join(", ");
    return `• ${p.code}${d ? ` (${d})` : ""}`;
  });
  return {
    explanation: `(mock AI) Your timetable can't be built yet because some needs are bigger than the time available:\n${parts.join("\n")}\nThe fixes ranked below are the quickest way forward.`,
    ranked: req.problems.flatMap((p, i) => (p.fixes.length ? [{ problem: i, fix: 0, why: "Solves this problem directly." }] : [])).slice(0, 8),
  };
}

export function mockDraft(req: z.infer<typeof DraftRequest>): DraftOut {
  const low = req.text.toLowerCase();
  const periods = Number(low.match(/(\d+)\s*periods?/)?.[1] ?? 8);
  const range = low.match(/(\d+)(?:st|nd|rd|th)?\s*(?:to|-|–)\s*(\d+)(?:st|nd|rd|th)?/);
  const [a, b] = range ? [Number(range[1]), Number(range[2])] : [6, 10];
  const sections = /three sections/.test(low) ? 3 : /two sections|2 sections/.test(low) ? 2 : Number(low.match(/(\d+)\s*sections?/)?.[1] ?? 1);
  const classes = [];
  for (let g = Math.min(a, b); g <= Math.max(a, b) && classes.length < 80; g++) for (let s = 0; s < Math.min(sections, 6); s++) classes.push({ name: `${g}-${"ABCDEF"[s]}`, strength: 40 });
  return {
    type: /college/.test(low) ? "College" : "School",
    days: [0, 1, 2, 3, 4, ...(/saturday/.test(low) ? [5] : [])].map((day) => ({ day, periods: Math.min(16, Math.max(1, periods)) })),
    classes,
    subjects: [
      { name: "English", code: "ENG", type: "theory", heavy: false, preferredTime: "any" },
      { name: "Mathematics", code: "MAT", type: "theory", heavy: true, preferredTime: "morning" },
      { name: "Science", code: "SCI", type: "theory", heavy: true, preferredTime: "any" },
      { name: "Social Science", code: "SOC", type: "theory", heavy: false, preferredTime: "any" },
      { name: "Tamil", code: "TAM", type: "theory", heavy: false, preferredTime: "any" },
      { name: "Physical Education", code: "PE", type: "activity", heavy: false, preferredTime: "afternoon" },
    ],
  };
}

export function mockSummarise(req: z.infer<typeof SummariseRequest>): SummariseOut {
  const s = req.stats;
  const busiest = [...s.teacherLoads].sort((a, b) => b.week - a.week)[0];
  return {
    summary: `(mock AI) ${s.clashFree ? "The new timetable is clash-free." : "The timetable still has issues to fix."} It covers ${s.classes} classes and ${s.teachers} teachers over ${s.days} days.${busiest ? ` The busiest teacher (${busiest.code}) has ${busiest.week} periods a week.` : ""}${s.roomUse.length ? ` Lab use: ${s.roomUse.map((r) => `${r.type} ${r.percent}%`).join(", ")}.` : ""}`,
  };
}
