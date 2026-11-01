import { describe, expect, it } from "vitest";
import { sampleSchool } from "@/data/sampleSchool";
import { slotOf } from "@/lib/model/schema";
import { solve } from "@/lib/solver";
import { dropTargets, moveLesson, swapSuggestions } from "@/lib/solver/edit";
import { validate } from "@/lib/solver/validator";
import { computeStats, diffCells, gridFor } from "@/lib/timetable/views";
import { L, P, tiny, tt } from "./helpers";

describe("drag validity, moves and swaps", () => {
  const p = tiny({ lessons: [L("a", ["A"], "MAT", ["T1"], 1), L("b", ["B"], "PE", ["T1"], 1), L("c", ["A"], "PE", ["T2"], 1)] });
  const pls = [P("a", 0, 0, 0, "RA"), P("b", 0, 0, 1, "RB"), P("c", 0, 1, 0, "RA")];

  it("marks cells blocked by a busy teacher with the reason", () => {
    const t = dropTargets(p, pls, "a", 0);
    const info = t.get(slotOf(0, 1))!;
    expect(info.ok).toBe(false);
    if (!info.ok) expect(info.reason).toBe("T1 is busy with B PE");
  });

  it("marks free cells valid and blocks unavailable ones", () => {
    const q = structuredClone(p);
    q.teachers[0].unavailable = [slotOf(1, 3)];
    const t = dropTargets(q, pls, "a", 0);
    expect(t.get(slotOf(0, 2))?.ok).toBe(true);
    const u = t.get(slotOf(1, 3))!;
    expect(u.ok).toBe(false);
    if (!u.ok) expect(u.reason).toBe("T1 unavailable");
  });

  it("offers a swap with another lesson of the same class", () => {
    const info = dropTargets(p, pls, "a", 0).get(slotOf(1, 0))!;
    expect(info.ok).toBe(true);
    if (info.ok) expect(info.swapWith).toEqual({ lessonId: "c", unit: 0 });
    const r = moveLesson(p, pls, "a", 0, 1, 0);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.placements.find((x) => x.lessonId === "a")).toMatchObject({ day: 1, period: 0 });
      expect(r.placements.find((x) => x.lessonId === "c")).toMatchObject({ day: 0, period: 0 });
      expect(validate(p, tt(r.placements)).ok).toBe(true);
    }
  });

  it("refuses hard clashes and locked lessons", () => {
    expect(moveLesson(p, pls, "a", 0, 0, 1)).toEqual({ ok: false, reason: "T1 is busy with B PE" });
    const locked = pls.map((x) => (x.lessonId === "a" ? { ...x, locked: true } : x));
    expect(moveLesson(p, locked, "a", 0, 0, 2)).toEqual({ ok: false, reason: "This lesson is locked" });
  });

  it("ranks swap suggestions by score change and they are all valid", () => {
    const s = swapSuggestions(p, pls, "a", 0);
    expect(s.length).toBeGreaterThan(0);
    for (let i = 1; i < s.length; i++) expect(s[i].delta).toBeGreaterThanOrEqual(s[i - 1].delta);
    for (const x of s) {
      const r = moveLesson(p, pls, "a", 0, x.day, x.period);
      expect(r.ok).toBe(true);
      if (r.ok) expect(validate(p, tt(r.placements)).ok).toBe(true);
    }
  });

  it("every 'valid' drop target on the sample school keeps it clash-free", () => {
    const s = sampleSchool();
    const res = solve(s, { seed: 3 });
    const placements = res.timetable!.placements;
    const pick = placements.find((x) => x.length === 1)!;
    const targets = dropTargets(s, placements, pick.lessonId, pick.unit);
    const valid = [...targets.values()].filter((t) => t.ok);
    expect(valid.length).toBeGreaterThan(0);
    for (const t of valid.slice(0, 10)) {
      const r = moveLesson(s, placements, pick.lessonId, pick.unit, t.day, t.period);
      expect(r.ok).toBe(true);
      if (r.ok) expect(validate(s, tt(r.placements)).violations).toEqual([]);
    }
  });
});

describe("views and stats", () => {
  const p = tiny({ lessons: [L("a", ["A"], "MAT", ["T1"], 2, { doubles: 1 }), L("b", ["B"], "PE", ["T1"], 1)] });
  const pls = [P("a", 0, 0, 1, "RA", 2), P("b", 0, 0, 3, "RB")];

  it("builds class and teacher grids, with double continuations", () => {
    const g = gridFor(p, pls, "class", "A");
    expect(g[0][1][0].continuation).toBe(false);
    expect(g[0][2][0].continuation).toBe(true);
    const t = gridFor(p, pls, "teacher", "T1");
    expect(t[0][3][0].classNames).toBe("B");
  });

  it("computes teacher gaps, consecutive and room use", () => {
    const s = computeStats(p, pls);
    const t1 = s.teachers.find((t) => t.id === "T1")!;
    expect(t1.perDay).toEqual([3, 0]);
    expect(t1.gaps).toBe(0);
    expect(t1.maxConsecutive).toBe(2); // lunch after P3 resets the run
    expect(s.classes.find((c) => c.id === "A")!.free).toBe(6);
  });

  it("diffs two timetables cell by cell", () => {
    const moved = [P("a", 0, 1, 1, "RA", 2), P("b", 0, 0, 3, "RB")];
    expect([...diffCells(p, pls, moved)].sort()).toEqual(["A@0.1", "A@0.2", "A@1.1", "A@1.2"]);
  });
});
