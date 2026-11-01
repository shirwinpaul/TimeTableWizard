"use client";

import { useState } from "react";
import { useProject } from "@/hooks/useProject";
import { SUBJECT_PALETTE, newId } from "@/lib/model/defaults";
import { lessonsUsing, removeClass, removeRoom, removeSubject, removeTeacher } from "@/lib/model/edit";
import { DAY_NAMES, MAX_PERIODS, ROOM_TYPE_LABELS, type BreakDef, type FixedEvent, type Room, type SchoolClass, type Subject, type Teacher } from "@/lib/model/schema";
import { AvailabilityGrid } from "../AvailabilityGrid";
import { EditableTable, type Column, type Option } from "../EditableTable";
import { Button, Card, Dialog, Field, Input, Select } from "../ui";

const roomTypeOptions: Option[] = Object.entries(ROOM_TYPE_LABELS).map(([value, label]) => ({ value, label }));
const required = (label: string) => (r: Record<string, unknown>) => (String(r.name ?? "").trim() ? null : `${label} is required`);
const unique = <T extends { id: string }>(key: keyof T, label: string) => (r: T, all: T[]) => {
  const v = String(r[key] ?? "").trim().toLowerCase();
  if (!v) return `${label} is required`;
  return all.some((x) => x.id !== r.id && String(x[key] ?? "").trim().toLowerCase() === v) ? `Duplicate ${label.toLowerCase()}` : null;
};

/* ---------- Step 1: school & calendar ---------- */
export function StepBasics() {
  const { project, update } = useProject();
  const days = new Map(project.calendar.days.map((d) => [d.day, d.periods]));
  const toggleDay = (day: number, on: boolean) =>
    update((p) => {
      p.calendar.days = on ? [...p.calendar.days, { day, periods: Math.max(...p.calendar.days.map((d) => d.periods), 6) }].sort((a, b) => a.day - b.day) : p.calendar.days.filter((d) => d.day !== day);
      if (!p.calendar.days.length) p.calendar.days = [{ day, periods: 8 }];
    });
  return (
    <div className="grid gap-6 md:grid-cols-2">
      <Card className="flex flex-col gap-4">
        <h3 className="font-bold">Your institution</h3>
        <Field label="Name">{(id) => <Input id={id} value={project.name} maxLength={80} onChange={(e) => update((p) => void (p.name = e.target.value || "Untitled"), { history: false })} />}</Field>
        <Field label="Type">
          {(id) => (
            <Select id={id} value={project.type} onChange={(e) => update((p) => void (p.type = e.target.value as "School" | "College"))}>
              <option>School</option>
              <option>College</option>
            </Select>
          )}
        </Field>
        <Field label="Academic year" hint="e.g. 2026-27">
          {(id) => <Input id={id} value={project.academicYear} maxLength={20} onChange={(e) => update((p) => void (p.academicYear = e.target.value), { history: false })} />}
        </Field>
      </Card>
      <Card className="flex flex-col gap-3">
        <h3 className="font-bold">Working days & periods per day</h3>
        <p className="text-sm text-muted">Tick the days you teach. Days can have different numbers of periods (e.g. a Saturday half day).</p>
        {DAY_NAMES.map((name, day) => (
          <div key={day} className="flex items-center justify-between gap-3">
            <label className="flex items-center gap-2 text-sm font-medium">
              <input type="checkbox" className="h-4 w-4" checked={days.has(day)} onChange={(e) => toggleDay(day, e.target.checked)} />
              {name}
            </label>
            {days.has(day) && (
              <label className="flex items-center gap-2 text-sm">
                <span className="text-muted">Periods</span>
                <input
                  type="number"
                  min={1}
                  max={MAX_PERIODS}
                  aria-label={`Periods on ${name}`}
                  className="tabular w-16 rounded border border-line bg-surface px-2 py-1"
                  value={days.get(day)}
                  onChange={(e) =>
                    update((p) => {
                      const d = p.calendar.days.find((x) => x.day === day)!;
                      d.periods = Math.min(MAX_PERIODS, Math.max(1, Number(e.target.value) || 1));
                    })
                  }
                />
              </label>
            )}
          </div>
        ))}
      </Card>
    </div>
  );
}

/* ---------- Step 2: periods, breaks, fixed events ---------- */
export function StepPeriods() {
  const { project, update } = useProject();
  const maxP = Math.max(...project.calendar.days.map((d) => d.periods));
  const times = Array.from({ length: maxP }, (_, i) => project.calendar.periodTimes[i] ?? { start: "", end: "" });
  const setTime = (i: number, k: "start" | "end", v: string) =>
    update((p) => {
      while (p.calendar.periodTimes.length < maxP) p.calendar.periodTimes.push({ start: "00:00", end: "00:00" });
      p.calendar.periodTimes[i][k] = v || "00:00";
    });
  const periodOptions: Option[] = Array.from({ length: maxP }, (_, i) => ({ value: String(i), label: `After P${i + 1}` }));
  const breakCols: Column<BreakDef & { after: string }>[] = [
    { key: "label", label: "Name", type: "text", validate: (r) => (r.label.trim() ? null : "Name is required") },
    { key: "after", label: "When", type: "select", options: periodOptions },
    { key: "kind", label: "Kind", type: "select", options: [{ value: "short", label: "Short break" }, { value: "lunch", label: "Lunch" }] },
    { key: "start", label: "Start", type: "text", placeholder: "10:00" },
    { key: "end", label: "End", type: "text", placeholder: "10:15" },
  ];
  const classOptions: Option[] = project.classes.map((c) => ({ value: c.id, label: c.name }));
  const dayOptions: Option[] = project.calendar.days.map((d) => ({ value: String(d.day), label: DAY_NAMES[d.day] }));
  type EvRow = FixedEvent & { dayS: string; periodS: string };
  const evCols: Column<EvRow>[] = [
    { key: "name", label: "Event", type: "text", validate: (r) => (r.name.trim() ? null : "Name is required") },
    { key: "dayS", label: "Day", type: "select", options: dayOptions },
    { key: "periodS", label: "Period", type: "select", options: Array.from({ length: maxP }, (_, i) => ({ value: String(i), label: `P${i + 1}` })) },
    { key: "classIds", label: "Classes (empty = all)", type: "multi", options: classOptions },
  ];
  return (
    <div className="flex flex-col gap-6">
      <Card className="flex flex-col gap-3">
        <h3 className="font-bold">Period times</h3>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-8">
          {times.map((t, i) => (
            <div key={i} className="rounded-lg border border-line p-2">
              <p className="mb-1 text-xs font-semibold">Period {i + 1}</p>
              <input aria-label={`Period ${i + 1} start`} type="time" className="tabular w-full rounded border border-line bg-surface px-1 text-xs" value={t.start} onChange={(e) => setTime(i, "start", e.target.value)} />
              <input aria-label={`Period ${i + 1} end`} type="time" className="tabular mt-1 w-full rounded border border-line bg-surface px-1 text-xs" value={t.end} onChange={(e) => setTime(i, "end", e.target.value)} />
            </div>
          ))}
        </div>
      </Card>
      <Card className="flex flex-col gap-3">
        <h3 className="font-bold">Breaks & lunch</h3>
        <p className="text-sm text-muted">Breaks aren&apos;t teaching periods. Double periods never cross lunch.</p>
        <EditableTable
          caption="Breaks"
          rows={project.calendar.breaks.map((b) => ({ ...b, after: String(b.afterPeriod) }))}
          columns={breakCols}
          addLabel="Add break"
          makeRow={() => ({ id: newId("brk"), label: "Break", afterPeriod: 0, after: "0", kind: "short" as const, start: "10:00", end: "10:15" })}
          onChange={(rows) =>
            update((p) => {
              p.calendar.breaks = rows.map(({ after, ...b }) => ({ ...b, afterPeriod: Number(after ?? b.afterPeriod) || 0, kind: b.kind ?? "short" }));
            })
          }
        />
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={project.settings.allowDoubleAcrossShortBreak} onChange={(e) => update((p) => void (p.settings.allowDoubleAcrossShortBreak = e.target.checked))} />
          Allow double periods across a short break
        </label>
        <label className="flex items-center gap-2 text-sm">
          Max periods of the same subject per class per day
          <input type="number" min={1} max={8} className="tabular w-16 rounded border border-line bg-surface px-2 py-1" value={project.settings.maxSameSubjectPerDay}
            onChange={(e) => update((p) => void (p.settings.maxSameSubjectPerDay = Math.min(8, Math.max(1, Number(e.target.value) || 1))))} />
        </label>
      </Card>
      <Card className="flex flex-col gap-3">
        <h3 className="font-bold">Fixed events</h3>
        <p className="text-sm text-muted">Assembly, games period, clubs… No lessons are placed in these slots for the chosen classes.</p>
        <EditableTable
          caption="Fixed events"
          rows={project.calendar.fixedEvents.map((e) => ({ ...e, dayS: String(e.day), periodS: String(e.period) }))}
          columns={evCols}
          addLabel="Add event"
          makeRow={() => ({ id: newId("ev"), name: "Assembly", day: project.calendar.days[0].day, period: 0, dayS: String(project.calendar.days[0].day), periodS: "0", classIds: [] })}
          onChange={(rows) =>
            update((p) => {
              p.calendar.fixedEvents = rows.map(({ dayS, periodS, ...e }) => ({ ...e, day: Number(dayS ?? e.day) || 0, period: Number(periodS ?? e.period) || 0 }));
            })
          }
        />
      </Card>
    </div>
  );
}

/* ---------- Step 3: classes ---------- */
export function StepClasses() {
  const { project, update } = useProject();
  const [avail, setAvail] = useState<string | null>(null);
  const cols: Column<SchoolClass>[] = [
    { key: "name", label: "Class / section", type: "text", placeholder: "10-A", validate: unique<SchoolClass>("name", "Name") },
    { key: "strength", label: "Students", type: "number", min: 1, width: "7rem", validate: (r) => (r.strength >= 1 ? null : "At least 1") },
    { key: "homeroomId", label: "Homeroom", type: "select", options: project.rooms.map((r) => ({ value: r.id, label: r.name })) },
    { key: "classTeacherId", label: "Class teacher", type: "select", options: project.teachers.map((t) => ({ value: t.id, label: t.name })) },
  ];
  const current = project.classes.find((c) => c.id === avail);
  return (
    <div className="flex flex-col gap-3">
      <EditableTable
        caption="Classes"
        rows={project.classes}
        columns={cols}
        addLabel="Add class"
        makeRow={() => ({ id: newId("cls"), name: "", strength: 40, homeroomId: null, classTeacherId: null, unavailable: [] })}
        onDelete={(r) => {
          const n = lessonsUsing(project, "class", r.id);
          if (n && !confirm(`${r.name} is used in ${n} lesson(s). Delete it and those lessons?`)) return false;
          update((p) => removeClass(p, r.id));
          return false;
        }}
        onChange={(rows) => update((p) => void (p.classes = rows))}
      />
      {project.classes.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span className="text-muted">Some classes start later or leave early?</span>
          {project.classes.map((c) => (
            <Button key={c.id} size="sm" variant="ghost" onClick={() => setAvail(c.id)}>
              🕒 {c.name || "(unnamed)"} {c.unavailable.length ? `(${c.unavailable.length} off)` : ""}
            </Button>
          ))}
        </div>
      )}
      <Dialog open={!!current} onClose={() => setAvail(null)} title={`When is ${current?.name ?? "this class"} NOT in school?`} wide>
        {current && (
          <AvailabilityGrid calendar={project.calendar} value={current.unavailable} onLabel="Off" onChange={(v) => update((p) => void (p.classes.find((c) => c.id === current.id)!.unavailable = v))} />
        )}
      </Dialog>
    </div>
  );
}

/* ---------- Step 4: subjects ---------- */
export function StepSubjects() {
  const { project, update } = useProject();
  const cols: Column<Subject>[] = [
    { key: "name", label: "Subject", type: "text", validate: unique<Subject>("name", "Name") },
    { key: "code", label: "Code", type: "text", width: "6rem", validate: (r, all) => (!r.code.trim() ? "Required" : r.code.length > 8 ? "Max 8 letters" : unique<Subject>("code", "Code")(r, all)) },
    { key: "color", label: "Colour", type: "color", width: "5rem" },
    { key: "type", label: "Type", type: "select", options: [{ value: "theory", label: "Theory" }, { value: "lab", label: "Lab" }, { value: "activity", label: "Activity" }] },
    { key: "roomType", label: "Needs room", type: "select", options: roomTypeOptions },
    { key: "preferredTime", label: "Preferred time", type: "select", options: [{ value: "any", label: "Any" }, { value: "morning", label: "Morning" }, { value: "afternoon", label: "Afternoon" }] },
    { key: "heavy", label: "Heavy", type: "checkbox", width: "4rem" },
  ];
  return (
    <EditableTable
      caption="Subjects"
      rows={project.subjects}
      columns={cols}
      addLabel="Add subject"
      makeRow={() => ({ id: newId("sub"), name: "", code: "", color: SUBJECT_PALETTE[project.subjects.length % SUBJECT_PALETTE.length], type: "theory" as const, heavy: false, preferredTime: "any" as const, roomType: null })}
      onDelete={(r) => {
        const n = lessonsUsing(project, "subject", r.id);
        if (n && !confirm(`${r.name} is used in ${n} lesson(s). Delete it and those lessons?`)) return false;
        update((p) => removeSubject(p, r.id));
        return false;
      }}
      onChange={(rows) => update((p) => void (p.subjects = rows.map((s) => ({ ...s, type: s.type ?? "theory", preferredTime: s.preferredTime ?? "any", code: s.code.toUpperCase().slice(0, 8) }))))}
    />
  );
}

/* ---------- Step 5: teachers ---------- */
export function StepTeachers() {
  const { project, update } = useProject();
  const [avail, setAvail] = useState<string | null>(null);
  const cols: Column<Teacher>[] = [
    { key: "name", label: "Teacher", type: "text", validate: required("Name") },
    { key: "code", label: "Code", type: "text", width: "5rem", validate: (r, all) => (!r.code.trim() ? "Required" : unique<Teacher>("code", "Code")(r, all)) },
    { key: "subjectIds", label: "Subjects", type: "multi", options: project.subjects.map((s) => ({ value: s.id, label: s.name })) },
    { key: "maxPerDay", label: "Max/day", type: "number", min: 1, width: "5.5rem" },
    { key: "maxPerWeek", label: "Max/week", type: "number", min: 1, width: "5.5rem" },
    { key: "maxConsecutive", label: "Max in a row", type: "number", min: 1, width: "5.5rem" },
  ];
  const current = project.teachers.find((t) => t.id === avail);
  return (
    <div className="flex flex-col gap-3">
      <EditableTable
        caption="Teachers"
        rows={project.teachers}
        columns={cols}
        addLabel="Add teacher"
        makeRow={() => ({ id: newId("tch"), name: "", code: "", subjectIds: [], unavailable: [], maxPerDay: 6, maxPerWeek: 30, maxConsecutive: 4, preferredFree: [] })}
        onDelete={(r) => {
          const n = lessonsUsing(project, "teacher", r.id);
          if (n && !confirm(`${r.name} teaches ${n} lesson(s). Delete the teacher and remove them from those lessons?`)) return false;
          update((p) => removeTeacher(p, r.id));
          return false;
        }}
        onChange={(rows) => update((p) => void (p.teachers = rows.map((t) => ({ ...t, code: t.code.toUpperCase().slice(0, 8), maxPerDay: Math.max(1, t.maxPerDay), maxPerWeek: Math.max(1, t.maxPerWeek), maxConsecutive: Math.max(1, t.maxConsecutive) }))))}
      />
      {project.teachers.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span className="text-muted">Part-time or other duties? Set unavailable & preferred free periods:</span>
          {project.teachers.map((t) => (
            <Button key={t.id} size="sm" variant="ghost" onClick={() => setAvail(t.id)}>
              🕒 {t.code || t.name || "?"} {t.unavailable.length ? `(${t.unavailable.length} off)` : ""}
            </Button>
          ))}
        </div>
      )}
      <Dialog open={!!current} onClose={() => setAvail(null)} title={`${current?.name ?? "Teacher"} — availability`} wide>
        {current && (
          <div className="flex flex-col gap-4">
            <div>
              <p className="mb-2 text-sm font-semibold">Unavailable (hard rule — never scheduled)</p>
              <AvailabilityGrid calendar={project.calendar} value={current.unavailable} onLabel="Busy" onChange={(v) => update((p) => void (p.teachers.find((t) => t.id === current.id)!.unavailable = v))} />
            </div>
            <div>
              <p className="mb-2 text-sm font-semibold">Preferred free periods (soft — avoided when possible)</p>
              <AvailabilityGrid calendar={project.calendar} value={current.preferredFree} onLabel="Prefer free" tone="warn" onChange={(v) => update((p) => void (p.teachers.find((t) => t.id === current.id)!.preferredFree = v))} />
            </div>
          </div>
        )}
      </Dialog>
    </div>
  );
}

/* ---------- Step 6: rooms ---------- */
export function StepRooms() {
  const { project, update } = useProject();
  const cols: Column<Room>[] = [
    { key: "name", label: "Room", type: "text", validate: unique<Room>("name", "Name") },
    { key: "type", label: "Type", type: "select", options: roomTypeOptions },
    { key: "capacity", label: "Capacity", type: "number", min: 1, width: "7rem", validate: (r) => (r.capacity >= 1 ? null : "At least 1") },
  ];
  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm text-muted">
        Add labs, grounds and other special rooms. Classrooms are only needed if you set homerooms (step 3) or for combined classes and elective groups.
      </p>
      <EditableTable
        caption="Rooms"
        rows={project.rooms}
        columns={cols}
        addLabel="Add room"
        makeRow={() => ({ id: newId("room"), name: "", type: "classroom" as const, capacity: 40 })}
        onDelete={(r) => {
          update((p) => removeRoom(p, r.id));
          return false;
        }}
        onChange={(rows) => update((p) => void (p.rooms = rows.map((r) => ({ ...r, type: r.type ?? "classroom" }))))}
      />
    </div>
  );
}
