"use client";

import { useState } from "react";
import { useProject } from "@/hooks/useProject";
import { newId } from "@/lib/model/defaults";
import { pruneTimetable } from "@/lib/model/edit";
import { ROOM_TYPE_LABELS, type Lesson } from "@/lib/model/schema";
import { EditableTable, type Column } from "../EditableTable";
import { Button, EmptyState } from "../ui";

const isSimple = (l: Lesson) => l.classIds.length === 1 && !l.blockId;

/** Step 7: class × subject grid (periods/week + teacher), plus an advanced table. */
export function StepLessons() {
  const { project, update } = useProject();
  const [advanced, setAdvanced] = useState(false);
  if (!project.classes.length || !project.subjects.length || !project.teachers.length)
    return <EmptyState title="Add classes, subjects and teachers first">Lessons connect a class, a subject and a teacher. Go back to steps 3–5.</EmptyState>;

  const find = (c: string, s: string) => project.lessons.find((l) => isSimple(l) && l.classIds[0] === c && l.subjectId === s);
  const setCell = (classId: string, subjectId: string, patch: { ppw?: number; teacher?: string }) =>
    update((p) => {
      let l = p.lessons.find((x) => isSimple(x) && x.classIds[0] === classId && x.subjectId === subjectId);
      if (!l) {
        if (!patch.ppw) return;
        const qualified = p.teachers.find((t) => t.subjectIds.includes(subjectId)) ?? p.teachers[0];
        l = { id: newId("les"), classIds: [classId], subjectId, teacherIds: [qualified.id], periodsPerWeek: 1, doubles: 0, roomType: null, groupSize: null, blockId: null, fixedSlots: [] };
        p.lessons.push(l);
      }
      if (patch.ppw !== undefined) {
        if (patch.ppw <= 0) {
          p.lessons = p.lessons.filter((x) => x !== l);
          pruneTimetable(p);
          return;
        }
        l.periodsPerWeek = Math.min(40, patch.ppw);
        l.doubles = Math.min(l.doubles, Math.floor(l.periodsPerWeek / 2));
      }
      if (patch.teacher) l.teacherIds = [patch.teacher];
    });

  const totals = project.classes.map((c) => project.lessons.filter((l) => l.classIds.includes(c.id)).reduce((n, l) => n + l.periodsPerWeek, 0));
  const slots = project.calendar.days.reduce((n, d) => n + d.periods, 0);

  const cols: Column<Lesson>[] = [
    { key: "classIds", label: "Class(es)", type: "multi", options: project.classes.map((c) => ({ value: c.id, label: c.name })), validate: (r) => (r.classIds.length ? null : "Pick a class") },
    { key: "subjectId", label: "Subject", type: "select", options: project.subjects.map((s) => ({ value: s.id, label: s.name })), validate: (r) => (r.subjectId ? null : "Pick a subject") },
    { key: "teacherIds", label: "Teacher(s)", type: "multi", options: project.teachers.map((t) => ({ value: t.id, label: t.name })), validate: (r) => (r.teacherIds.length ? null : "Pick a teacher") },
    { key: "periodsPerWeek", label: "Per week", type: "number", min: 1, width: "5rem", validate: (r) => (r.periodsPerWeek >= 1 ? null : "At least 1") },
    { key: "doubles", label: "Doubles", type: "number", min: 0, width: "5rem", validate: (r) => (r.doubles * 2 <= r.periodsPerWeek ? null : "Too many") },
    { key: "roomType", label: "Room type", type: "select", options: Object.entries(ROOM_TYPE_LABELS).map(([value, label]) => ({ value, label })) },
    { key: "groupSize", label: "Group size", type: "number", min: 0, width: "5.5rem" },
    { key: "blockId", label: "Elective block", type: "text", placeholder: "e.g. 11-electives", width: "9rem" },
  ];

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-muted">
        Type periods per week in each cell and choose the teacher. Leave a cell empty if the class doesn&apos;t take that subject.
      </p>
      <div className="overflow-x-auto rounded-xl border border-line bg-surface">
        <table className="border-collapse text-xs">
          <caption className="sr-only">Lessons: periods per week by class and subject</caption>
          <thead className="bg-surface-2">
            <tr>
              <th className="sticky left-0 z-10 bg-surface-2 px-2 py-2 text-left">Class</th>
              {project.subjects.map((s) => (
                <th key={s.id} className="px-1 py-2 font-semibold">
                  <span className="inline-flex items-center gap-1">
                    <span className="h-2.5 w-2.5 rounded-full" style={{ background: s.color }} aria-hidden />
                    {s.code}
                  </span>
                </th>
              ))}
              <th className="px-2 py-2">Total</th>
            </tr>
          </thead>
          <tbody>
            {project.classes.map((c, ci) => (
              <tr key={c.id} className="border-t border-line">
                <th className="sticky left-0 z-10 bg-surface px-2 py-1 text-left font-semibold">{c.name}</th>
                {project.subjects.map((s) => {
                  const l = find(c.id, s.id);
                  const qualified = project.teachers.filter((t) => t.subjectIds.includes(s.id));
                  const others = project.teachers.filter((t) => !t.subjectIds.includes(s.id));
                  return (
                    <td key={s.id} className="px-1 py-1 align-top">
                      <input
                        type="number"
                        min={0}
                        max={40}
                        aria-label={`${c.name} ${s.name} periods per week`}
                        className="tabular w-14 rounded border border-line bg-surface px-1 py-0.5 text-center"
                        value={l?.periodsPerWeek ?? ""}
                        onChange={(e) => setCell(c.id, s.id, { ppw: Number(e.target.value) || 0 })}
                      />
                      {l && (
                        <select
                          aria-label={`${c.name} ${s.name} teacher`}
                          className="mt-0.5 block w-14 rounded border border-line bg-surface text-[10px]"
                          value={l.teacherIds[0]}
                          onChange={(e) => setCell(c.id, s.id, { teacher: e.target.value })}
                        >
                          {qualified.map((t) => (
                            <option key={t.id} value={t.id}>
                              {t.code}
                            </option>
                          ))}
                          {others.length > 0 && (
                            <optgroup label="Other teachers">
                              {others.map((t) => (
                                <option key={t.id} value={t.id}>
                                  {t.code}
                                </option>
                              ))}
                            </optgroup>
                          )}
                        </select>
                      )}
                    </td>
                  );
                })}
                <td className={`tabular px-2 py-1 text-center font-semibold ${totals[ci] > slots ? "text-bad" : ""}`} title={`${slots} periods in the week`}>
                  {totals[ci]}/{slots}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div>
        <Button onClick={() => setAdvanced((x) => !x)} aria-expanded={advanced}>
          {advanced ? "▾" : "▸"} All lessons — doubles, combined classes, elective blocks ({project.lessons.length})
        </Button>
      </div>
      {advanced && (
        <div className="flex flex-col gap-2">
          <ul className="list-disc pl-5 text-sm text-muted">
            <li><strong>Doubles</strong>: how many of the weekly periods are 2-period blocks (e.g. labs).</li>
            <li><strong>Combined class</strong>: choose several classes for one lesson — they are taught together.</li>
            <li><strong>Elective block</strong>: give several lessons the same block name — they run at the same time (e.g. CS and Biology groups). Set a group size for room capacity.</li>
          </ul>
          <EditableTable
            caption="All lessons"
            rows={project.lessons}
            columns={cols}
            addLabel="Add lesson"
            makeRow={() => ({ id: newId("les"), classIds: [], subjectId: "", teacherIds: [], periodsPerWeek: 1, doubles: 0, roomType: null, groupSize: null, blockId: null, fixedSlots: [] })}
            onChange={(rows) =>
              update((p) => {
                p.lessons = rows.map((l) => ({
                  ...l,
                  periodsPerWeek: Math.max(1, l.periodsPerWeek || 1),
                  doubles: Math.max(0, l.doubles || 0),
                  groupSize: l.groupSize ? l.groupSize : null,
                  blockId: l.blockId && String(l.blockId).trim() ? String(l.blockId).trim() : null,
                }));
                pruneTimetable(p);
              })
            }
          />
        </div>
      )}
    </div>
  );
}
