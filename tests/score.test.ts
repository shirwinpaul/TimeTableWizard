import { describe, expect, it } from "vitest";
import { buildCtx } from "@/lib/solver/context";
import { penalties, positionsOf, scoreBreakdown } from "@/lib/solver/score";
import { L, P, tiny, tt } from "./helpers";

const pen = (p: ReturnType<typeof tiny>, placements: ReturnType<typeof P>[]) => {
  const ctx = buildCtx(p);
  return penalties(ctx, positionsOf(ctx, tt(placements)));
};

describe("soft-constraint scoring", () => {
  it("spread: two Maths on one day costs 1, split across days costs 0", () => {
    const p = tiny({ lessons: [L("m", ["A"], "MAT", ["T1"], 2)] });
    expect(pen(p, [P("m", 0, 0, 0, "RA"), P("m", 1, 0, 1, "RA")]).spread).toBe(1);
    expect(pen(p, [P("m", 0, 0, 0, "RA"), P("m", 1, 1, 0, "RA")]).spread).toBe(0);
  });

  it("heavy subjects and time preferences: Maths in the afternoon is penalised", () => {
    const p = tiny({ lessons: [L("m", ["A"], "MAT", ["T1"], 1), L("pe", ["B"], "PE", ["T2"], 1)] });
    const morning = pen(p, [P("m", 0, 0, 0, "RA"), P("pe", 0, 0, 3, "RB")]);
    expect(morning.heavyMorning).toBe(0);
    expect(morning.subjectTimePref).toBe(0);
    const bad = pen(p, [P("m", 0, 0, 3, "RA"), P("pe", 0, 0, 0, "RB")]);
    expect(bad.heavyMorning).toBe(1);
    expect(bad.subjectTimePref).toBe(2); // Maths wants morning, PE wants afternoon
  });

  it("teacher gaps and preferred free periods", () => {
    const p = tiny({ lessons: [L("m", ["A"], "MAT", ["T1"], 2)] });
    expect(pen(p, [P("m", 0, 0, 0, "RA"), P("m", 1, 0, 3, "RA")]).teacherGaps).toBe(2);
    expect(pen(p, [P("m", 0, 0, 0, "RA"), P("m", 1, 0, 1, "RA")]).teacherGaps).toBe(0);
    p.teachers[0].preferredFree = [0];
    expect(pen(p, [P("m", 0, 0, 0, "RA"), P("m", 1, 0, 1, "RA")]).teacherGaps).toBe(1);
  });

  it("last period: the same subject last more than once costs extra", () => {
    const p = tiny({ lessons: [L("m", ["A"], "MAT", ["T1"], 2)] });
    expect(pen(p, [P("m", 0, 0, 3, "RA"), P("m", 1, 1, 3, "RA")]).lastPeriod).toBe(1);
    expect(pen(p, [P("m", 0, 0, 3, "RA"), P("m", 1, 1, 0, "RA")]).lastPeriod).toBe(0);
  });

  it("balanced load: all on one day is worse than spread out", () => {
    const p = tiny({ lessons: [L("m", ["A"], "MAT", ["T1"], 2)] });
    const lumped = pen(p, [P("m", 0, 0, 0, "RA"), P("m", 1, 0, 1, "RA")]).balancedLoad;
    const even = pen(p, [P("m", 0, 0, 0, "RA"), P("m", 1, 1, 0, "RA")]).balancedLoad;
    expect(lumped).toBeGreaterThan(even);
    expect(even).toBe(0);
  });

  it("custom soft rules are weighted and itemised in the breakdown", () => {
    const p = tiny({ lessons: [L("pe", ["A"], "PE", ["T1"], 1)] });
    p.rules = [{ id: "r1", label: "PE not after lunch", enabled: true, hard: false, weight: 7, soft: null, custom: { kind: "notAfterBreak", subjectId: "PE", classIds: [], breakKind: "lunch" } }];
    const b = scoreBreakdown(p, tt([P("pe", 0, 0, 3, "RA")]));
    expect(b.items).toEqual([{ ruleId: "r1", label: "PE not after lunch", weight: 7, penalty: 1, weighted: 7 }]);
    expect(b.total).toBe(7);
    expect(scoreBreakdown(p, tt([P("pe", 0, 0, 2, "RA")])).total).toBe(0);
  });

  it("breakdown totals equal the sum of weighted rule penalties", () => {
    const p = tiny({ lessons: [L("m", ["A"], "MAT", ["T1"], 2)] });
    const b = scoreBreakdown(p, tt([P("m", 0, 0, 2, "RA"), P("m", 1, 0, 3, "RA")]));
    expect(b.total).toBeCloseTo(b.items.reduce((n, i) => n + i.weighted, 0));
    expect(b.items.find((i) => i.ruleId === "soft_spread")?.penalty).toBe(1);
  });
});
