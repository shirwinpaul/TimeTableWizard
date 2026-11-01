import { describe, expect, it } from "vitest";
import { affectedPeriods, fairness, rankSubstitutes, weekdayOf, whatsappText } from "@/lib/substitutions";
import { L, P, tiny, tt } from "./helpers";

// 2026-06-01 is a Monday (day 0).
const MON = "2026-06-01";

function school() {
  const p = tiny({ lessons: [L("a", ["A"], "MAT", ["T1"], 2), L("b", ["B"], "PE", ["T2"], 1)] });
  p.teachers.push({ id: "T3", name: "T3", code: "T3", subjectIds: ["MAT"], unavailable: [], maxPerDay: 4, maxPerWeek: 8, maxConsecutive: 4, preferredFree: [] });
  p.teachers.push({ id: "T4", name: "T4", code: "T4", subjectIds: ["PE"], unavailable: [], maxPerDay: 4, maxPerWeek: 8, maxConsecutive: 4, preferredFree: [] });
  p.timetable = tt([P("a", 0, 0, 0, "RA"), P("a", 1, 0, 1, "RA"), P("b", 0, 0, 0, "RB")]);
  return p;
}

describe("substitutions", () => {
  it("maps dates to timetable weekdays", () => {
    expect(weekdayOf(MON)).toBe(0);
    expect(weekdayOf("2026-06-06")).toBe(5);
  });

  it("lists the absent teacher's periods that day (or only chosen periods)", () => {
    const p = school();
    expect(affectedPeriods(p, "T1", MON).map((a) => a.period)).toEqual([0, 1]);
    expect(affectedPeriods(p, "T1", MON, [1]).map((a) => a.period)).toEqual([1]);
    expect(affectedPeriods(p, "T1", "2026-06-02")).toEqual([]);
  });

  it("only offers teachers who are free in that slot", () => {
    const p = school();
    const c = rankSubstitutes(p, MON, 0, "a", { exclude: ["T1"] }).map((x) => x.teacherId);
    expect(c).not.toContain("T1"); // absent
    expect(c).not.toContain("T2"); // teaching B at P1
    expect(c).toEqual(["T3", "T4"]);
  });

  it("ranks subject expertise first, then fewest substitutions this week", () => {
    const p = school();
    expect(rankSubstitutes(p, MON, 1, "a", { exclude: ["T1"] })[0].teacherId).toBe("T3");
    // Give T3 two subs this week: T2 (also a Maths teacher) now wins on fairness…
    p.substitutions.push(
      { id: "s1", date: "2026-06-02", absentTeacherId: "T2", lessonId: "b", period: 0, substituteId: "T3" },
      { id: "s2", date: "2026-06-03", absentTeacherId: "T2", lessonId: "b", period: 0, substituteId: "T3" },
    );
    const ranked = rankSubstitutes(p, MON, 1, "a", { exclude: ["T1"] }).map((x) => x.teacherId);
    expect(ranked.slice(0, 2)).toEqual(["T2", "T3"]);
    expect(ranked.indexOf("T3")).toBeLessThan(ranked.indexOf("T4")); // expertise still beats a non-expert
    // …and between non-experts, fewest substitutions wins.
    p.teachers.find((t) => t.id === "T4")!.subjectIds = [];
    const pe = rankSubstitutes(p, MON, 1, "b", { exclude: ["T2"] }).map((x) => x.teacherId);
    expect(pe.indexOf("T4")).toBeLessThan(pe.indexOf("T3"));
  });

  it("excludes teachers at their daily maximum, unavailable, or already covering that period", () => {
    const p = school();
    p.teachers.find((t) => t.id === "T4")!.maxPerDay = 0 + 1;
    p.substitutions.push({ id: "x", date: MON, absentTeacherId: "T1", lessonId: "a", period: 0, substituteId: "T4" });
    const ids = rankSubstitutes(p, MON, 1, "a", { exclude: ["T1"] }).map((x) => x.teacherId);
    expect(ids).not.toContain("T4");
    p.teachers.find((t) => t.id === "T3")!.unavailable = [1];
    expect(rankSubstitutes(p, MON, 1, "a", { exclude: ["T1"] }).map((x) => x.teacherId)).not.toContain("T3");
  });

  it("counts fairness and writes a WhatsApp summary", () => {
    const p = school();
    p.substitutions.push({ id: "s1", date: MON, absentTeacherId: "T1", lessonId: "a", period: 0, substituteId: "T3" });
    expect(fairness(p, MON).find((f) => f.id === "T3")).toMatchObject({ week: 1, month: 1, total: 1 });
    expect(whatsappText(p, MON)).toBe("*Tiny — Substitutions*\nMonday, 2026-06-01\n\nP1 · A MAT: T3 (for T1)");
  });
});
