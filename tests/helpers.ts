import { defaultRules } from "@/lib/model/defaults";
import type { Lesson, Placement, Project } from "@/lib/model/schema";

/**
 * Tiny hand-made school: Mon+Tue, 4 periods/day, short break after P1, lunch after P2.
 * Classes A, B (30 students, own homerooms). Teachers T1, T2. Rooms RA, RB, LAB (cap 25).
 */
export function tiny(overrides: Partial<Project> = {}): Project {
  const now = "2026-01-01T00:00:00.000Z";
  return {
    id: "p_tiny",
    name: "Tiny",
    type: "School",
    academicYear: "",
    createdAt: now,
    updatedAt: now,
    calendar: {
      days: [
        { day: 0, periods: 4 },
        { day: 1, periods: 4 },
      ],
      periodTimes: [
        { start: "09:00", end: "09:45" },
        { start: "09:45", end: "10:30" },
        { start: "10:45", end: "11:30" },
        { start: "12:15", end: "13:00" },
      ],
      breaks: [
        { id: "b1", label: "Break", afterPeriod: 0, kind: "short", start: "09:45", end: "09:45" },
        { id: "b2", label: "Lunch", afterPeriod: 2, kind: "lunch", start: "11:30", end: "12:15" },
      ],
      fixedEvents: [],
    },
    classes: [
      { id: "A", name: "A", strength: 30, homeroomId: "RA", classTeacherId: null, unavailable: [] },
      { id: "B", name: "B", strength: 30, homeroomId: "RB", classTeacherId: null, unavailable: [] },
    ],
    subjects: [
      { id: "MAT", name: "Maths", code: "MAT", color: "#0072B2", type: "theory", heavy: true, preferredTime: "morning", roomType: null },
      { id: "SCI", name: "Science", code: "SCI", color: "#009E73", type: "lab", heavy: false, preferredTime: "any", roomType: "science_lab" },
      { id: "PE", name: "PE", code: "PE", color: "#E69F00", type: "activity", heavy: false, preferredTime: "afternoon", roomType: null },
    ],
    teachers: [
      { id: "T1", name: "T1", code: "T1", subjectIds: ["MAT", "SCI", "PE"], unavailable: [], maxPerDay: 4, maxPerWeek: 8, maxConsecutive: 4, preferredFree: [] },
      { id: "T2", name: "T2", code: "T2", subjectIds: ["MAT", "SCI", "PE"], unavailable: [], maxPerDay: 4, maxPerWeek: 8, maxConsecutive: 4, preferredFree: [] },
    ],
    rooms: [
      { id: "RA", name: "RA", type: "classroom", capacity: 40 },
      { id: "RB", name: "RB", type: "classroom", capacity: 40 },
      { id: "LAB", name: "LAB", type: "science_lab", capacity: 35 },
    ],
    lessons: [],
    rules: defaultRules(),
    settings: { maxSameSubjectPerDay: 2, allowDoubleAcrossShortBreak: false },
    timetable: null,
    versions: [],
    substitutions: [],
    ...overrides,
  };
}

export const L = (id: string, classIds: string[], subjectId: string, teacherIds: string[], periodsPerWeek: number, extra: Partial<Lesson> = {}): Lesson => ({
  id,
  classIds,
  subjectId,
  teacherIds,
  periodsPerWeek,
  doubles: 0,
  roomType: null,
  groupSize: null,
  blockId: null,
  fixedSlots: [],
  ...extra,
});

export const P = (lessonId: string, unit: number, day: number, period: number, roomId: string | null, length = 1, locked = false): Placement => ({
  lessonId,
  unit,
  day,
  period,
  length,
  roomId,
  locked,
});

export const tt = (placements: Placement[]) => ({ placements, seed: 1, generatedAt: "x", solveMs: 0 });
