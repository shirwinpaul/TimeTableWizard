import { SOFT_LABELS } from "@/lib/solver/score";
import type { Calendar, Project, Rule, SoftKind } from "./schema";

let counter = 0;
/** Short unique id; deterministic prefix keeps exported files readable. */
export function newId(prefix: string): string {
  counter = (counter + 1) % 1_000_000;
  const rand = Math.random().toString(36).slice(2, 7);
  return `${prefix}_${Date.now().toString(36)}${counter.toString(36)}${rand}`;
}

const DEFAULT_SOFT: [SoftKind, number][] = [
  ["spread", 5],
  ["heavyMorning", 3],
  ["teacherGaps", 3],
  ["balancedLoad", 2],
  ["subjectTimePref", 3],
  ["lastPeriod", 2],
];

export function defaultRules(): Rule[] {
  return DEFAULT_SOFT.map(([kind, weight]) => ({
    id: `soft_${kind}`,
    label: SOFT_LABELS[kind],
    enabled: true,
    hard: false,
    weight,
    soft: kind,
    custom: null,
  }));
}

export function defaultCalendar(): Calendar {
  return {
    days: [0, 1, 2, 3, 4].map((day) => ({ day, periods: 8 })),
    periodTimes: [
      { start: "08:30", end: "09:15" },
      { start: "09:15", end: "10:00" },
      { start: "10:15", end: "11:00" },
      { start: "11:00", end: "11:45" },
      { start: "12:25", end: "13:10" },
      { start: "13:10", end: "13:55" },
      { start: "14:05", end: "14:50" },
      { start: "14:50", end: "15:35" },
    ],
    breaks: [
      { id: "brk_short", label: "Break", afterPeriod: 1, kind: "short", start: "10:00", end: "10:15" },
      { id: "brk_lunch", label: "Lunch", afterPeriod: 3, kind: "lunch", start: "11:45", end: "12:25" },
      { id: "brk_short2", label: "Break", afterPeriod: 5, kind: "short", start: "13:55", end: "14:05" },
    ],
    fixedEvents: [],
  };
}

export function emptyProject(name = "My timetable", type: "School" | "College" = "School"): Project {
  const now = new Date().toISOString();
  return {
    id: newId("prj"),
    name,
    type,
    academicYear: "",
    createdAt: now,
    updatedAt: now,
    calendar: defaultCalendar(),
    classes: [],
    subjects: [],
    teachers: [],
    rooms: [],
    lessons: [],
    rules: defaultRules(),
    settings: { maxSameSubjectPerDay: 2, allowDoubleAcrossShortBreak: false },
    timetable: null,
    versions: [],
    substitutions: [],
  };
}

/** Colour-blind-friendly subject palette (Okabe–Ito based, plus soft extensions). */
export const SUBJECT_PALETTE = [
  "#0072B2", "#E69F00", "#009E73", "#CC79A7", "#56B4E9", "#D55E00", "#F0E442", "#999999",
  "#7B61FF", "#00A3A3", "#B8860B", "#8C564B", "#E377C2", "#17BECF", "#6B8E23", "#A0522D",
];
