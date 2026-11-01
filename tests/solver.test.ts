import { describe, expect, it } from "vitest";
import { sampleSchool } from "@/data/sampleSchool";
import { slotOf } from "@/lib/model/schema";
import { solve } from "@/lib/solver";
import { buildCtx } from "@/lib/solver/context";
import { construct } from "@/lib/solver/construct";
import { improve } from "@/lib/solver/improve";
import { Rng } from "@/lib/solver/rng";
import { totalScore, weightsOf } from "@/lib/solver/score";
import { State } from "@/lib/solver/state";
import { validate } from "@/lib/solver/validator";
import { bigSchool } from "./bigSchool";
import { L, tiny } from "./helpers";

const run = <T, R>(g: Generator<T, R>): R => {
  let s = g.next();
  while (!s.done) s = g.next();
  return s.value;
};

describe("solver", () => {
  it("solves a small hand-made case with a known (tight) solution", () => {
    // Every slot of both classes is used and T1 teaches all 8 periods.
    const p = tiny({
      lessons: [L("a", ["A"], "MAT", ["T1"], 4), L("b", ["A"], "PE", ["T2"], 4), L("c", ["B"], "MAT", ["T1"], 4), L("d", ["B"], "PE", ["T2"], 4)],
    });
    const r = solve(p, { seed: 3 });
    expect(r.status).toBe("solved");
    expect(r.validation?.ok).toBe(true);
    expect(r.timetable?.placements.length).toBe(16);
  });

  it("places double periods without crossing breaks", () => {
    const p = tiny({ lessons: [L("d", ["A"], "MAT", ["T1"], 4, { doubles: 2 })] });
    const r = solve(p, { seed: 1 });
    expect(r.status).toBe("solved");
    const doubles = r.timetable!.placements.filter((x) => x.length === 2);
    expect(doubles).toHaveLength(2);
    for (const d of doubles) expect(d.period).toBe(1); // only P2–P3 avoids both breaks
  });

  it("reports an impossible input as infeasible before solving", () => {
    const p = tiny({ lessons: [L("m", ["A"], "MAT", ["T1"], 6), L("n", ["B"], "MAT", ["T1"], 6)] });
    p.settings.maxSameSubjectPerDay = 4;
    const r = solve(p);
    expect(r.status).toBe("infeasible");
    expect(r.timetable).toBeNull();
    expect(r.problems.some((x) => x.code === "teacherOverload")).toBe(true);
  });

  it("never shows a partial result as valid, and explains what blocked it", () => {
    const p = tiny({ lessons: [L("m", ["A"], "MAT", ["T1"], 4), L("n", ["B"], "MAT", ["T1"], 4)] });
    p.teachers[0].maxPerWeek = 6;
    p.settings.maxSameSubjectPerDay = 4;
    const r = solve(p, { skipPrecheck: true, timeLimitMs: 5000 });
    expect(r.status).toBe("partial");
    expect(r.validation?.ok).toBe(false);
    expect(r.unplaced.length).toBeGreaterThan(0);
    const reason = r.unplaced[0].reasons.find((x) => x.code === "teacherWeekMax")!;
    expect(reason).toBeTruthy();
    expect(reason.fixes[0].action).toMatchObject({ type: "setTeacherLimit", field: "maxPerWeek" });
  });

  it("places combined classes and elective blocks correctly", () => {
    const p = tiny({
      lessons: [
        L("pe", ["A", "B"], "PE", ["T1"], 2),
        L("e1", ["A", "B"], "MAT", ["T1"], 2, { blockId: "blk", groupSize: 30, roomType: "classroom" }),
        L("e2", ["A", "B"], "SCI", ["T2"], 2, { blockId: "blk", groupSize: 30 }),
      ],
    });
    p.rooms.push({ id: "HALL", name: "Hall", type: "classroom", capacity: 80 });
    const r = solve(p, { seed: 5 });
    expect(r.status).toBe("solved");
    const pl = r.timetable!.placements;
    for (const u of [0, 1]) {
      const a = pl.find((x) => x.lessonId === "e1" && x.unit === u)!;
      const b = pl.find((x) => x.lessonId === "e2" && x.unit === u)!;
      expect([a.day, a.period]).toEqual([b.day, b.period]);
      expect(a.roomId).not.toBe(b.roomId);
    }
    expect(pl.filter((x) => x.lessonId === "pe").every((x) => x.roomId === "HALL")).toBe(true);
  });

  it("honours fixed slots", () => {
    const p = tiny({ lessons: [L("m", ["A"], "MAT", ["T1"], 2, { fixedSlots: [slotOf(1, 3)] })] });
    const r = solve(p, { seed: 9 });
    expect(r.status).toBe("solved");
    expect(r.timetable!.placements.some((x) => x.day === 1 && x.period === 3)).toBe(true);
  });

  it("solves the sample school clash-free within the time limit", () => {
    const r = solve(sampleSchool(), { seed: 2026, timeLimitMs: 20_000 });
    expect(r.status).toBe("solved");
    expect(r.validation?.ok).toBe(true);
    expect(r.validation?.complete).toBe(true);
    expect(r.solveMs).toBeLessThan(20_000);
  });

  it("same seed → same result", () => {
    const a = solve(sampleSchool(), { seed: 11 });
    const b = solve(sampleSchool(), { seed: 11 });
    const key = (r: typeof a) => r.timetable!.placements.map((x) => `${x.lessonId}#${x.unit}@${x.day}.${x.period}:${x.roomId}`).sort().join("|");
    expect(key(a)).toBe(key(b));
    expect(a.score?.total).toBe(b.score?.total);
  });

  it("local search never introduces a hard violation and never gets worse", () => {
    const p = sampleSchool();
    const ctx = buildCtx(p);
    const rng = new Rng(77);
    const built = run(construct(new State(ctx), rng, { maxIterations: 1e6, restartAfter: 5000, deadline: Infinity, now: () => 0 }));
    const w = weightsOf(p);
    const before = totalScore(ctx, built.pos, w);
    const res = run(improve(built, rng, w, { iterations: 4000, deadline: Infinity, now: () => 0 }));
    expect(res.score).toBeLessThanOrEqual(before);
    expect(res.startScore).toBe(before);
    const check = validate(p, { placements: res.state.toPlacements(), seed: 0, generatedAt: "", solveMs: 0 });
    expect(check.violations).toEqual([]);
  });

  it("lock + re-solve keeps locked cells unchanged", () => {
    const p = sampleSchool();
    const first = solve(p, { seed: 4 });
    const locks = first.timetable!.placements.filter((_, i) => i % 9 === 0).map((x) => ({ ...x, locked: true }));
    const second = solve(p, { seed: 99, locks });
    expect(second.status).toBe("solved");
    for (const l of locks) {
      const same = second.timetable!.placements.find((x) => x.lessonId === l.lessonId && x.unit === l.unit)!;
      expect([same.day, same.period, same.locked]).toEqual([l.day, l.period, true]);
    }
  });

  it("solves a typical school (20 classes, 35 teachers, 6×8) in under ~20 s", () => {
    const t = Date.now();
    const r = solve(bigSchool(), { seed: 1, timeLimitMs: 20_000 });
    const ms = Date.now() - t;
    console.log(`big school: ${r.status} in ${ms} ms, score ${r.score?.total}`);
    expect(r.status).toBe("solved");
    expect(ms).toBeLessThan(25_000);
  });
});
