import { describe, expect, it } from "vitest";
import { slotOf } from "@/lib/model/schema";
import { precheck } from "@/lib/solver/precheck";
import { L, tiny } from "./helpers";

const find = (p: ReturnType<typeof tiny>, code: string) => precheck(p).problems.find((x) => x.code === code);

describe("pre-check", () => {
  it("passes a feasible input", () => {
    const r = precheck(tiny({ lessons: [L("m", ["A"], "MAT", ["T1"], 2)] }));
    expect(r.ok).toBe(true);
    expect(r.problems).toEqual([]);
  });

  it("reports no lessons", () => {
    expect(precheck(tiny()).problems[0].code).toBe("nothingToSchedule");
  });

  it("detects teacher over-demand vs availability, with fixes", () => {
    const p = tiny({ lessons: [L("m", ["A"], "MAT", ["T1"], 4), L("n", ["B"], "MAT", ["T1"], 4)] });
    p.teachers[0].unavailable = [slotOf(1, 0), slotOf(1, 1), slotOf(1, 2), slotOf(1, 3)];
    p.settings.maxSameSubjectPerDay = 4;
    const prob = find(p, "teacherOverload")!;
    expect(prob.message).toBe("T1 needs 8 periods but is available for only 4.");
    expect(prob.fixes.length).toBeGreaterThanOrEqual(1);
    expect(prob.fixes.some((f) => f.action?.type === "clearTeacherUnavailable")).toBe(true);
  });

  it("detects weekly maximum and daily-capacity problems", () => {
    const p = tiny({ lessons: [L("m", ["A"], "MAT", ["T1"], 4), L("n", ["B"], "MAT", ["T1"], 4)] });
    p.teachers[0].maxPerWeek = 6;
    p.settings.maxSameSubjectPerDay = 4;
    expect(find(p, "teacherWeekMax")?.message).toBe("T1 needs 8 periods but their weekly maximum is 6.");
    p.teachers[0].maxPerWeek = 8;
    p.teachers[0].maxPerDay = 3;
    expect(find(p, "teacherDayCapacity")?.fixes[0].action).toEqual({ type: "setTeacherLimit", teacherId: "T1", field: "maxPerDay", value: 4 });
  });

  it("detects class over-demand", () => {
    const p = tiny({ lessons: [L("m", ["A"], "MAT", ["T1"], 5), L("pe", ["A"], "PE", ["T2"], 4)] });
    p.settings.maxSameSubjectPerDay = 4;
    const prob = find(p, "classOverload")!;
    expect(prob.message).toBe("Class A needs 9 periods but only 8 are available in the week.");
    expect(prob.fixes[0].action).toEqual({ type: "setLessonPeriods", lessonId: "m", value: 4 });
  });

  it("detects lab demand vs supply and missing / too-small labs", () => {
    const p = tiny({ lessons: [L("s", ["A"], "SCI", ["T1"], 4), L("t", ["B"], "SCI", ["T2"], 4)] });
    p.rooms[2].capacity = 20;
    expect(find(p, "noRoom")?.fixes[0].action).toEqual({ type: "addRoom", roomType: "science_lab", capacity: 30 });
    p.rooms[2].capacity = 40;
    const a = tiny({ lessons: [L("s", ["A"], "SCI", ["T1"], 4), L("t", ["B"], "SCI", ["T2"], 4), L("u", ["A"], "SCI", ["T2"], 2)] });
    a.settings.maxSameSubjectPerDay = 4;
    a.classes[0].strength = 30;
    expect(find(a, "roomOverload")?.message).toBe("Lessons need the science lab for 10 periods but 1 science lab(s) give only 8.");
    const none = tiny({ lessons: [L("s", ["A"], "SCI", ["T1"], 1)], rooms: [] });
    expect(find(none, "noRoom")?.message).toContain("needs a science lab, but there isn't one");
  });

  it("detects impossible double periods", () => {
    // Doubles can only start at P2 (P1|P2 crosses the short break; P3|P4 crosses lunch).
    const p = tiny({ lessons: [L("d", ["A"], "MAT", ["T1"], 6, { doubles: 3 })] });
    p.settings.maxSameSubjectPerDay = 4;
    expect(find(p, "doubleImpossible")?.message).toBe("A Maths needs 3 double periods but only 2 fit in the week (2 day(s) have room for one).");
    const q = tiny({ lessons: [L("d", ["A"], "MAT", ["T1"], 2, { doubles: 1 })] });
    q.calendar.breaks.push({ id: "b3", label: "Break", afterPeriod: 1, kind: "short", start: "10:30", end: "10:45" });
    const prob = find(q, "doubleImpossible")!;
    expect(prob.message).toContain("no two consecutive free periods");
    expect(prob.fixes[0].action).toEqual({ type: "allowDoubleAcrossShortBreak" });
  });

  it("detects subject-per-day limit vs weekly periods", () => {
    const p = tiny({ lessons: [L("m", ["A"], "MAT", ["T1"], 5)] });
    const prob = find(p, "subjectDayLimit")!;
    expect(prob.message).toBe("A Maths has 5 periods/week but at most 2 per day over 2 day(s) allows only 4.");
    expect(prob.fixes[0].action).toEqual({ type: "setMaxSameSubjectPerDay", value: 3 });
  });

  it("detects lessons with no allowed time and broken references", () => {
    const p = tiny({ lessons: [L("m", ["A"], "MAT", ["T1"], 1)] });
    p.teachers[0].unavailable = Array.from({ length: 8 }, (_, i) => slotOf(Math.floor(i / 4), i % 4));
    expect(find(p, "noSlot")).toBeTruthy();
    const q = tiny({ lessons: [L("m", ["A"], "MAT", ["GHOST"], 1)] });
    expect(find(q, "missingRef")?.severity).toBe("error");
  });
});
