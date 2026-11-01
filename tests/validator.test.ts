import { describe, expect, it } from "vitest";
import { slotOf } from "@/lib/model/schema";
import { validate, type ViolationCode } from "@/lib/solver/validator";
import { L, P, tiny, tt } from "./helpers";

const codes = (r: ReturnType<typeof validate>) => r.violations.map((v) => v.code);
const expectOnly = (r: ReturnType<typeof validate>, code: ViolationCode) => {
  expect(codes(r)).toContain(code);
  expect(r.ok).toBe(false);
};

describe("validator", () => {
  const base = () => tiny({ lessons: [L("m1", ["A"], "MAT", ["T1"], 1), L("m2", ["B"], "MAT", ["T2"], 1)] });

  it("accepts a valid timetable", () => {
    const r = validate(base(), tt([P("m1", 0, 0, 0, "RA"), P("m2", 0, 0, 0, "RB")]));
    expect(r.violations).toEqual([]);
    expect(r.ok).toBe(true);
    expect(r.complete).toBe(true);
  });

  it("catches a teacher clash", () => {
    const p = base();
    p.lessons[1].teacherIds = ["T1"];
    expectOnly(validate(p, tt([P("m1", 0, 0, 0, "RA"), P("m2", 0, 0, 0, "RB")])), "teacherClash");
  });

  it("catches a class clash", () => {
    const p = tiny({ lessons: [L("m1", ["A"], "MAT", ["T1"], 1), L("p1", ["A"], "PE", ["T2"], 1)] });
    expectOnly(validate(p, tt([P("m1", 0, 0, 0, "RA"), P("p1", 0, 0, 0, "RA")])), "classClash");
  });

  it("catches a room clash", () => {
    expectOnly(validate(base(), tt([P("m1", 0, 0, 0, "RA"), P("m2", 0, 0, 0, "RA")])), "roomClash");
  });

  it("catches wrong room type and too-small rooms", () => {
    const p = tiny({ lessons: [L("s1", ["A"], "SCI", ["T1"], 1)] });
    expectOnly(validate(p, tt([P("s1", 0, 0, 0, "RA")])), "roomType");
    p.rooms[2].capacity = 20;
    expectOnly(validate(p, tt([P("s1", 0, 0, 0, "LAB")])), "roomCapacity");
    expectOnly(validate(p, tt([P("s1", 0, 0, 0, null)])), "roomMissing");
  });

  it("catches teacher / class unavailability and fixed events", () => {
    const p = base();
    p.teachers[0].unavailable = [slotOf(0, 0)];
    expectOnly(validate(p, tt([P("m1", 0, 0, 0, "RA"), P("m2", 0, 0, 0, "RB")])), "teacherUnavailable");
    const q = base();
    q.classes[0].unavailable = [slotOf(0, 0)];
    expectOnly(validate(q, tt([P("m1", 0, 0, 0, "RA"), P("m2", 0, 0, 0, "RB")])), "classUnavailable");
    const e = base();
    e.calendar.fixedEvents = [{ id: "ev", name: "Assembly", day: 0, period: 0, classIds: [] }];
    expectOnly(validate(e, tt([P("m1", 0, 0, 0, "RA"), P("m2", 0, 0, 1, "RB")])), "fixedEvent");
  });

  it("catches missing periods per week", () => {
    const p = base();
    p.lessons[0].periodsPerWeek = 2;
    const r = validate(p, tt([P("m1", 0, 0, 0, "RA"), P("m2", 0, 0, 0, "RB")]));
    expectOnly(r, "periodsPerWeek");
    expect(r.complete).toBe(false);
  });

  it("catches doubles split by a break (short and lunch) and wrong double counts", () => {
    const p = tiny({ lessons: [L("d1", ["A"], "MAT", ["T1"], 2, { doubles: 1 })] });
    expectOnly(validate(p, tt([P("d1", 0, 0, 0, "RA", 2)])), "doubleSplit"); // across short break
    expectOnly(validate(p, tt([P("d1", 0, 0, 2, "RA", 2)])), "doubleSplit"); // across lunch
    p.settings.allowDoubleAcrossShortBreak = true;
    expect(validate(p, tt([P("d1", 0, 0, 0, "RA", 2)])).ok).toBe(true);
    expect(codes(validate(p, tt([P("d1", 0, 0, 1, "RA", 2)])))).toEqual([]);
    expectOnly(validate(p, tt([P("d1", 0, 0, 1, "RA"), P("d1", 1, 1, 1, "RA")])), "doubleCount");
  });

  it("catches teacher daily, weekly and consecutive limits", () => {
    const p = tiny({ lessons: [L("m1", ["A"], "MAT", ["T1"], 1), L("m2", ["B"], "MAT", ["T1"], 1)] });
    p.teachers[0].maxPerDay = 1;
    expectOnly(validate(p, tt([P("m1", 0, 0, 0, "RA"), P("m2", 0, 0, 1, "RB")])), "teacherDayMax");
    p.teachers[0].maxPerDay = 4;
    p.teachers[0].maxPerWeek = 1;
    expectOnly(validate(p, tt([P("m1", 0, 0, 0, "RA"), P("m2", 0, 1, 1, "RB")])), "teacherWeekMax");

    const c = tiny({ lessons: [L("a", ["A"], "MAT", ["T1"], 2), L("b", ["B"], "PE", ["T1"], 1)] });
    c.teachers[0].maxConsecutive = 2;
    expectOnly(validate(c, tt([P("a", 0, 0, 0, "RA"), P("b", 0, 0, 1, "RB"), P("a", 1, 0, 2, "RA")])), "teacherConsecutive");
    // Lunch (after P3 index 2) resets the run: P2, P3 then P4 is fine.
    expect(codes(validate(c, tt([P("a", 0, 0, 1, "RA"), P("b", 0, 0, 2, "RB"), P("a", 1, 0, 3, "RA")])))).not.toContain("teacherConsecutive");
  });

  it("catches too many periods of a subject per day", () => {
    const p = tiny({ lessons: [L("m1", ["A"], "MAT", ["T1"], 2)] });
    p.settings.maxSameSubjectPerDay = 1;
    expectOnly(validate(p, tt([P("m1", 0, 0, 0, "RA"), P("m1", 1, 0, 1, "RA")])), "subjectDayMax");
  });

  it("catches moved locks and missed fixed slots", () => {
    const p = base();
    const lock = P("m1", 0, 0, 0, "RA", 1, true);
    expectOnly(validate(p, tt([P("m1", 0, 1, 0, "RA"), P("m2", 0, 0, 0, "RB")]), { locks: [lock] }), "lockMoved");
    p.lessons[0].fixedSlots = [slotOf(0, 3)];
    expectOnly(validate(p, tt([P("m1", 0, 0, 0, "RA"), P("m2", 0, 0, 0, "RB")])), "fixedSlotMissed");
  });

  it("catches hard custom rules and out-of-day placements", () => {
    const p = base();
    p.rules.push({ id: "r", label: "No Maths last period", enabled: true, hard: true, weight: 5, soft: null, custom: { kind: "notLastPeriod", subjectId: "MAT", classIds: [] } });
    expectOnly(validate(p, tt([P("m1", 0, 0, 3, "RA"), P("m2", 0, 0, 0, "RB")])), "customHard");
    expectOnly(validate(base(), tt([P("m1", 0, 0, 7, "RA"), P("m2", 0, 0, 0, "RB")])), "outOfDay");
  });

  it("allows combined classes and elective blocks, and catches misaligned blocks", () => {
    const p = tiny({
      lessons: [
        L("pe", ["A", "B"], "PE", ["T1"], 1),
        L("e1", ["A", "B"], "MAT", ["T1"], 1, { blockId: "blk", groupSize: 30, roomType: "classroom" }),
        L("e2", ["A", "B"], "SCI", ["T2"], 1, { blockId: "blk", groupSize: 30 }),
      ],
    });
    p.rooms.push({ id: "HALL", name: "Hall", type: "classroom", capacity: 80 });
    const ok = validate(p, tt([P("pe", 0, 0, 0, "HALL"), P("e1", 0, 0, 1, "RA"), P("e2", 0, 0, 1, "LAB")]));
    expect(ok.violations).toEqual([]);
    expectOnly(validate(p, tt([P("pe", 0, 0, 0, "HALL"), P("e1", 0, 0, 1, "RA"), P("e2", 0, 0, 2, "LAB")])), "blockMisaligned");
    // A combined class needs a room for both classes together.
    expectOnly(validate(p, tt([P("pe", 0, 0, 0, "RA"), P("e1", 0, 0, 1, "RB"), P("e2", 0, 0, 1, "LAB")])), "roomCapacity");
  });
});
