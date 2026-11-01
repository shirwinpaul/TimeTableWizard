import Papa from "papaparse";
import * as XLSX from "xlsx";
import { DAY_SHORT, type Placement, type Project } from "@/lib/model/schema";
import { gridFor, masterGrid, type Entry, type ViewKind } from "@/lib/timetable/views";

/** Excel / CSV export of timetable views (array-of-arrays, then SheetJS / Papa). */

const cellText = (es: Entry[], kind: ViewKind | "master") =>
  es
    .map((e) => {
      const parts = [e.subject?.code ?? "?"];
      if (kind !== "teacher") parts.push(e.teachers.map((t) => t.code).join("+"));
      if (kind !== "class" && kind !== "master") parts.push(e.classNames);
      if (kind !== "room" && kind !== "master" && e.room) parts.push(e.room.name);
      return parts.join(" ");
    })
    .join(" | ");

const sortedDays = (p: Project) => [...p.calendar.days].sort((a, b) => a.day - b.day);

export function viewAoA(p: Project, placements: Placement[], kind: ViewKind, id: string): string[][] {
  const grid = gridFor(p, placements, kind, id);
  const maxP = Math.max(...p.calendar.days.map((d) => d.periods));
  const head = ["Day", ...Array.from({ length: maxP }, (_, i) => (p.calendar.periodTimes[i] ? `P${i + 1} (${p.calendar.periodTimes[i].start}-${p.calendar.periodTimes[i].end})` : `P${i + 1}`))];
  return [head, ...sortedDays(p).map((d) => [DAY_SHORT[d.day], ...Array.from({ length: maxP }, (_, q) => (q < d.periods ? cellText(grid[d.day][q], kind) : ""))])];
}

export function masterAoA(p: Project, placements: Placement[]): string[][] {
  const grids = masterGrid(p, placements);
  const days = sortedDays(p);
  const head = ["Class", ...days.flatMap((d) => Array.from({ length: d.periods }, (_, q) => `${DAY_SHORT[d.day]} P${q + 1}`))];
  return [head, ...p.classes.map((c) => [c.name, ...days.flatMap((d) => Array.from({ length: d.periods }, (_, q) => cellText(grids.get(c.id)![d.day][q], "master")))])];
}

export const toCsv = (aoa: string[][]) => Papa.unparse(aoa);

/** Sheet names: ≤31 chars, no []:*?/\ and unique. */
function sheetName(raw: string, used: Set<string>): string {
  const base = raw.replace(/[[\]:*?/\\]/g, "-").slice(0, 28) || "Sheet";
  let name = base;
  for (let i = 2; used.has(name.toLowerCase()); i++) name = `${base.slice(0, 26)}~${i}`;
  used.add(name.toLowerCase());
  return name;
}

/** Workbook with the master grid plus one sheet per class, teacher and room. */
export function buildWorkbook(p: Project, placements: Placement[]): XLSX.WorkBook {
  const wb = XLSX.utils.book_new();
  const used = new Set<string>();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(masterAoA(p, placements)), sheetName("Master", used));
  for (const c of p.classes) XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(viewAoA(p, placements, "class", c.id)), sheetName(`Class ${c.name}`, used));
  for (const t of p.teachers) XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(viewAoA(p, placements, "teacher", t.id)), sheetName(`Teacher ${t.code}`, used));
  for (const r of p.rooms.filter((r) => placements.some((x) => x.roomId === r.id)))
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(viewAoA(p, placements, "room", r.id)), sheetName(`Room ${r.name}`, used));
  return wb;
}

export const workbookBytes = (wb: XLSX.WorkBook): ArrayBuffer => XLSX.write(wb, { type: "array", bookType: "xlsx" });

/** Template download (CSV or XLSX) for an import entity. */
export function templateFile(rows: string[][], kind: "csv" | "xlsx"): Blob {
  if (kind === "csv") return new Blob(["﻿" + toCsv(rows)], { type: "text/csv;charset=utf-8" });
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rows), "Template");
  return new Blob([workbookBytes(wb)], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
}
