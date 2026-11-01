import * as XLSX from "xlsx";
import { describe, expect, it } from "vitest";
import { sampleSchool } from "@/data/sampleSchool";
import { emptyProject } from "@/lib/model/defaults";
import { solve } from "@/lib/solver";
import { buildIcs, firstWeekday, tzOffset } from "@/lib/export/ics";
import { buildWorkbook, masterAoA, toCsv, viewAoA, workbookBytes } from "@/lib/export/sheets";
import { autoMap, importRows, templateRows } from "@/lib/import/importer";
import { parseCsv } from "@/lib/import/parse";

describe("import", () => {
  it("auto-maps headers by label, key or alias regardless of case and order", () => {
    const m = autoMap("teachers", ["Teacher Name", "CODE", "max/day", "Teaches", "Unrelated"]);
    expect(m).toMatchObject({ name: 0, code: 1, maxPerDay: 2, subjects: 3, maxPerWeek: -1 });
  });

  it("imports a CSV template and reports row errors with row numbers", () => {
    let p = emptyProject();
    const subjects = parseCsv("Name,Code,Type,Heavy\nMathematics,MAT,theory,yes\nArt,ART,painting,no\n,X,theory,no\n");
    const r = importRows(p, "subjects", subjects.slice(1), autoMap("subjects", subjects[0]));
    expect(r.added).toBe(1);
    expect(r.errors).toEqual([
      { row: 3, message: 'Type "painting" should be theory, lab or activity' },
      { row: 4, message: "Name is empty" },
    ]);
    p = r.project;
    expect(p.subjects[0]).toMatchObject({ name: "Mathematics", code: "MAT", heavy: true });

    const t = parseCsv("Name,Code,Subjects\nAsha Kumar,ak,MAT\nBen Roy,BR,\"MAT, XYZ\"");
    const rt = importRows(p, "teachers", t.slice(1), autoMap("teachers", t[0]));
    expect(rt.added).toBe(1);
    expect(rt.errors).toEqual([{ row: 3, message: "Unknown subject(s): XYZ" }]);
    expect(rt.project.teachers[0].code).toBe("AK");
  });

  it("updates existing rows with the same name instead of duplicating", () => {
    const p = sampleSchool();
    const rows = [["Room 6-A", "classroom", "50"]];
    const r = importRows(p, "rooms", rows, { name: 0, type: 1, capacity: 2 });
    expect(r.updated).toBe(1);
    expect(r.project.rooms.find((x) => x.name === "Room 6-A")?.capacity).toBe(50);
    expect(r.project.rooms.length).toBe(p.rooms.length);
  });

  it("requires a column for every required field", () => {
    const r = importRows(emptyProject(), "lessons", [["10-A"]], { classes: 0, subject: -1, teachers: -1, periodsPerWeek: -1 });
    expect(r.errors[0].message).toContain("Choose a column for: Subject, Teacher, Periods per week");
  });

  it("imports lessons that reference classes, subjects and teachers", () => {
    const p = sampleSchool();
    const r = importRows(p, "lessons", [["6-A, 6-B", "PE", "US", "1", "0", "", "", ""], ["6-A", "NOPE", "US", "1"]], autoMap("lessons", templateRows("lessons")[0]));
    expect(r.added).toBe(1);
    expect(r.project.lessons.at(-1)?.classIds).toEqual(["c_6a", "c_6b"]);
    expect(r.errors).toEqual([{ row: 3, message: 'Unknown subject "NOPE"' }]);
  });
});

describe("export", () => {
  const s = sampleSchool();
  const placements = solve(s, { seed: 5 }).timetable!.placements;

  it("CSV of a class view has a header row and one row per day", () => {
    const aoa = viewAoA(s, placements, "class", "c_10a");
    expect(aoa[0][0]).toBe("Day");
    expect(aoa[0][1]).toBe("P1 (08:30-09:15)");
    expect(aoa.length).toBe(1 + 6);
    const csv = toCsv(aoa);
    expect(csv.split("\n")[1].startsWith("Mon,")).toBe(true);
    expect(parseCsv(csv)).toEqual(aoa);
  });

  it("master grid lists every class and the XLSX workbook round-trips", () => {
    const m = masterAoA(s, placements);
    expect(m.length).toBe(1 + s.classes.length);
    const wb = XLSX.read(workbookBytes(buildWorkbook(s, placements)), { type: "array" });
    expect(wb.SheetNames[0]).toBe("Master");
    expect(wb.SheetNames).toContain("Class 10-A");
    expect(wb.SheetNames).toContain("Teacher AR");
    const back = XLSX.utils.sheet_to_json<string[]>(wb.Sheets["Class 10-A"], { header: 1 });
    expect(back[1][0]).toBe("Mon");
  });

  it("ICS has valid structure, weekly rules, time zone and CRLF lines", () => {
    const ics = buildIcs(s, placements, "teacher", "t_anita", { startDate: "2026-06-01", endDate: "2026-10-30", timeZone: "Asia/Kolkata", now: new Date("2026-05-01T00:00:00Z") });
    expect(ics.startsWith("BEGIN:VCALENDAR\r\nVERSION:2.0\r\n")).toBe(true);
    expect(ics.trimEnd().endsWith("END:VCALENDAR")).toBe(true);
    const events = ics.split("BEGIN:VEVENT").length - 1;
    const anitaUnits = placements.filter((p) => s.lessons.find((l) => l.id === p.lessonId)?.teacherIds.includes("t_anita")).length;
    expect(events).toBe(anitaUnits);
    expect(ics).toContain("RRULE:FREQ=WEEKLY;UNTIL=20261030T235959Z");
    expect(ics).toMatch(/DTSTART;TZID=Asia\/Kolkata:202606\d{2}T\d{6}/);
    expect(ics).toContain("TZOFFSETTO:+0530");
    expect(ics.split("\r\n").every((l) => new TextEncoder().encode(l).length <= 75)).toBe(true);
    expect(ics).not.toMatch(/[^\r]\n/);
  });

  it("finds the first weekday of term and the zone offset", () => {
    expect(firstWeekday("2026-06-01", 0)).toBe("2026-06-01"); // a Monday
    expect(firstWeekday("2026-06-01", 5)).toBe("2026-06-06"); // Saturday
    expect(tzOffset("Asia/Kolkata", new Date("2026-06-01T12:00:00Z"))).toBe("+0530");
    expect(tzOffset("Not/AZone", new Date())).toBe("+0000");
  });
});
