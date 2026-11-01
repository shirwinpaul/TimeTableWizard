import { AI_CONFIG } from "@/config/ai";
import type { Project } from "@/lib/model/schema";
import type { DescribeRuleOut } from "./schemas";
import type { z } from "zod";
import type { DescribeRuleRequest } from "./schemas";

/* ---------- Per-IP rate limit (in memory: best-effort on serverless) ---------- */
const hits = new Map<string, number[]>();
export function rateLimit(ip: string, now = Date.now()): { ok: true } | { ok: false; retryAfterSec: number } {
  const { calls, windowMs } = AI_CONFIG.rateLimit;
  const list = (hits.get(ip) ?? []).filter((t) => now - t < windowMs);
  if (list.length >= calls) {
    hits.set(ip, list);
    return { ok: false, retryAfterSec: Math.ceil((windowMs - (now - list[0])) / 1000) };
  }
  list.push(now);
  hits.set(ip, list);
  if (hits.size > 5000) hits.clear(); // keep memory bounded
  return { ok: true };
}

/* ---------- "Describe a rule": flag unknown references, never guess ---------- */
export function checkRuleRefs(out: DescribeRuleOut, refs: z.infer<typeof DescribeRuleRequest>["refs"]): DescribeRuleOut {
  const r = out.rule;
  if (!r) return out;
  const has = (list: { id: string }[], id: string) => list.some((x) => x.id === id);
  const bad: string[] = [];
  if ("subjectId" in r && r.subjectId && !has(refs.subjects, r.subjectId)) bad.push(r.subjectId);
  if ("classIds" in r) for (const c of r.classIds) if (!has(refs.classes, c)) bad.push(c);
  if (r.kind === "teacherUnavailable" && !has(refs.teachers, r.teacherId)) bad.push(r.teacherId);
  if ("days" in r && r.days.some((d) => !refs.days.includes(d))) bad.push("a day the school is closed");
  if ("fromPeriod" in r && (r.fromPeriod >= refs.periods || r.toPeriod >= refs.periods)) bad.push(`period ${Math.max(r.fromPeriod, r.toPeriod) + 1}`);
  if (!bad.length) return out;
  return { ...out, rule: null, unknown: [...new Set([...out.unknown, ...bad])].slice(0, 10), note: "Some references didn't match your data, so nothing was guessed." };
}

/* ---------- Privacy: replace teacher names with [T:CODE] before sending (client side) ---------- */
export function redactTeachers(text: string, p: Pick<Project, "teachers">): string {
  let out = text;
  // Longest names first so "Anita Raman" wins over "Anita".
  const parts = p.teachers.flatMap((t) => [t.name, ...t.name.split(/\s+/).filter((w) => w.length >= 3)].map((n) => ({ n, code: t.code })));
  parts.sort((a, b) => b.n.length - a.n.length);
  for (const { n, code } of parts) {
    if (!n.trim()) continue;
    const re = new RegExp(`(?:\\b(?:mr|mrs|ms|miss|dr|sir|madam)\\.?\\s+)?\\b${n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "gi");
    out = out.replace(re, `[T:${code}]`);
  }
  return out;
}

/** Compact id/label lists sent with "Describe a rule" (teachers as codes only). */
export function ruleRefs(p: Project) {
  return {
    subjects: p.subjects.map((s) => ({ id: s.id, label: `${s.code} ${s.name}`.slice(0, 60) })),
    classes: p.classes.map((c) => ({ id: c.id, label: c.name })),
    teachers: p.teachers.map((t) => ({ id: t.id, label: t.code })),
    days: p.calendar.days.map((d) => d.day),
    periods: Math.max(...p.calendar.days.map((d) => d.periods)),
  };
}
