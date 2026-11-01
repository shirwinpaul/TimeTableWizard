import { defaultCalendar, defaultRules } from "@/lib/model/defaults";
import type { Lesson, Project, Teacher } from "@/lib/model/schema";

/** Generated "typical school" for the performance target: 20 classes, 35 teachers, 6 days × 8 periods. */
export function bigSchool(): Project {
  const cal = defaultCalendar();
  cal.days = [0, 1, 2, 3, 4, 5].map((day) => ({ day, periods: 8 }));
  const classes = Array.from({ length: 20 }, (_, i) => ({
    id: `c${i}`,
    name: `${6 + Math.floor(i / 4)}-${"ABCD"[i % 4]}`,
    strength: 40,
    homeroomId: `h${i}`,
    classTeacherId: null,
    unavailable: [],
  }));
  const subj = (id: string, extra: object = {}) => ({ id, name: id, code: id, color: "#0072B2", type: "theory" as const, heavy: false, preferredTime: "any" as const, roomType: null, ...extra });
  const subjects = [
    subj("MAT", { heavy: true, preferredTime: "morning" }),
    subj("ENG"),
    subj("LAN"),
    subj("SCI", { heavy: true }),
    subj("SOC"),
    subj("CMP", { type: "lab", roomType: "computer_lab" }),
    subj("PE", { type: "activity", roomType: "sports", preferredTime: "afternoon" }),
    subj("ART", { type: "activity" }),
    subj("LIB", { type: "activity" }),
  ];
  // [subject, periods/week, doubles, classes per teacher]
  const plan: [string, number, number, number][] = [
    ["MAT", 7, 0, 4],
    ["ENG", 6, 0, 4],
    ["LAN", 6, 0, 4],
    ["SCI", 6, 0, 4],
    ["SOC", 6, 0, 4],
    ["CMP", 2, 1, 10],
    ["PE", 3, 0, 7],
    ["ART", 2, 0, 10],
    ["LIB", 1, 0, 20],
  ];
  const teachers: Teacher[] = [];
  const lessons: Lesson[] = [];
  for (const [s, ppw, doubles, per] of plan) {
    for (let i = 0; i < 20; i++) {
      if (i % per === 0)
        teachers.push({ id: `t${teachers.length}`, name: `Teacher ${teachers.length + 1}`, code: `T${teachers.length + 1}`, subjectIds: [s], unavailable: [], maxPerDay: 6, maxPerWeek: 30, maxConsecutive: 4, preferredFree: [] });
      lessons.push({ id: `${s}_${i}`, classIds: [`c${i}`], subjectId: s, teacherIds: [teachers[teachers.length - 1].id], periodsPerWeek: ppw, doubles, roomType: null, groupSize: null, blockId: null, fixedSlots: [] });
    }
  }
  while (teachers.length < 35)
    teachers.push({ id: `t${teachers.length}`, name: `Teacher ${teachers.length + 1}`, code: `T${teachers.length + 1}`, subjectIds: ["MAT"], unavailable: [], maxPerDay: 6, maxPerWeek: 30, maxConsecutive: 4, preferredFree: [] });
  const rooms = [
    ...classes.map((c, i) => ({ id: `h${i}`, name: `Room ${c.name}`, type: "classroom" as const, capacity: 45 })),
    { id: "lab1", name: "Computer Lab 1", type: "computer_lab" as const, capacity: 45 },
    { id: "lab2", name: "Computer Lab 2", type: "computer_lab" as const, capacity: 45 },
    { id: "g1", name: "Ground 1", type: "sports" as const, capacity: 100 },
    { id: "g2", name: "Ground 2", type: "sports" as const, capacity: 100 },
  ];
  return {
    id: "big",
    name: "Big",
    type: "School",
    academicYear: "",
    createdAt: "x",
    updatedAt: "x",
    calendar: cal,
    classes,
    subjects,
    teachers,
    rooms,
    lessons,
    rules: defaultRules(),
    settings: { maxSameSubjectPerDay: 2, allowDoubleAcrossShortBreak: false },
    timetable: null,
    versions: [],
    substitutions: [],
  };
}
