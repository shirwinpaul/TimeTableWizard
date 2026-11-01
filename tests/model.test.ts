import { describe, expect, it } from "vitest";
import { sampleSchool } from "@/data/sampleSchool";
import { applyFix } from "@/lib/model/fixes";
import { emptyProject } from "@/lib/model/defaults";
import { ProjectSchema, dayOf, periodOf, slotOf } from "@/lib/model/schema";
import { exportProjectJson, importProjectJson } from "@/lib/export/projectFile";
import { precheck } from "@/lib/solver/precheck";

describe("data model", () => {
  it("slot packing round-trips", () => {
    expect(dayOf(slotOf(5, 7))).toBe(5);
    expect(periodOf(slotOf(5, 7))).toBe(7);
  });

  it("empty and sample projects match the schema", () => {
    expect(ProjectSchema.safeParse(emptyProject()).success).toBe(true);
    expect(ProjectSchema.safeParse(sampleSchool()).success).toBe(true);
  });

  it("rejects bad data with a clear path", () => {
    const p = sampleSchool() as unknown as { subjects: { color: string }[] };
    p.subjects[0].color = "blue";
    const r = ProjectSchema.safeParse(p);
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error.issues[0].path.join(".")).toBe("subjects.0.color");
  });

  it("sample school is realistic, fictional and passes the pre-check", () => {
    const s = sampleSchool();
    expect(s.name).toBe("Sunrise Public School");
    expect(s.classes.length).toBe(12);
    expect(s.teachers.length).toBeGreaterThanOrEqual(20);
    expect(s.lessons.some((l) => l.classIds.length > 1 && !l.blockId)).toBe(true); // combined class
    expect(s.lessons.filter((l) => l.blockId).length).toBe(2); // elective block
    expect(precheck(s).problems).toEqual([]);
  });

  it("project JSON export/import round-trips", () => {
    const s = sampleSchool();
    const back = importProjectJson(exportProjectJson(s));
    expect(back.ok && back.project).toEqual(s);
    expect(importProjectJson("{not json").ok).toBe(false);
    expect(importProjectJson('{"project":{"name":1}}').ok).toBe(false);
  });

  it("fix actions change only what they say", () => {
    const s = sampleSchool();
    const t = applyFix(s, { type: "setTeacherLimit", teacherId: "t_anita", field: "maxPerWeek", value: 33 });
    expect(t.teachers[0].maxPerWeek).toBe(33);
    expect(s.teachers[0].maxPerWeek).toBe(30); // original untouched
    const r = applyFix(s, { type: "addRoom", roomType: "science_lab", capacity: 50 });
    expect(r.rooms.length).toBe(s.rooms.length + 1);
    const b = applyFix(s, { type: "setLessonPeriods", lessonId: s.lessons.find((l) => l.blockId)!.id, value: 4 });
    expect(b.lessons.filter((l) => l.blockId).every((l) => l.periodsPerWeek === 4)).toBe(true);
  });
});
