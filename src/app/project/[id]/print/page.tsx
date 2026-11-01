"use client";

import { useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { MasterGrid } from "@/components/timetable/MasterGrid";
import { TimetableGrid } from "@/components/timetable/TimetableGrid";
import { Button, EmptyState, Spinner } from "@/components/ui";
import { useProject } from "@/hooks/useProject";
import { DAY_NAMES } from "@/lib/model/schema";
import { entityOptions, type ViewKind } from "@/lib/timetable/views";

/** Print views (PDF via the browser's "Save as PDF"): A4 landscape, header, B&W option. */
export default function PrintPage() {
  return (
    <Suspense fallback={<div className="p-8"><Spinner /></div>}>
      <Print />
    </Suspense>
  );
}

function Print() {
  const { project } = useProject();
  const q = useSearchParams();
  const what = q.get("what") ?? "class";
  const id = q.get("id") ?? "all";
  const day = q.get("day");
  const date = q.get("date") ?? "";
  const [bw, setBw] = useState(q.get("bw") === "1");
  const placements = project.timetable?.placements ?? [];

  const header = (title: string) => (
    <header className="mb-3 flex items-end justify-between border-b-2 border-ink pb-2">
      <div>
        <p className="text-lg font-extrabold">{project.name}</p>
        <p className="text-sm">{title}</p>
      </div>
      <p className="text-xs">{project.academicYear}</p>
    </header>
  );

  let pages: React.ReactNode;
  if (what === "subs") {
    const subs = project.substitutions.filter((s) => s.date === date).sort((a, b) => a.period - b.period);
    const name = (tid: string | null) => project.teachers.find((t) => t.id === tid)?.name ?? "— not assigned —";
    pages = (
      <section className="print-page">
        {header(`Substitution sheet · ${date ? new Date(`${date}T00:00:00`).toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long", year: "numeric" }) : ""}`)}
        {subs.length === 0 ? (
          <p>No substitutions recorded for this date.</p>
        ) : (
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-ink text-left">
                <th className="py-1">Period</th>
                <th>Class</th>
                <th>Subject</th>
                <th>Absent teacher</th>
                <th>Substitute</th>
                <th>Signature</th>
              </tr>
            </thead>
            <tbody>
              {subs.map((s) => {
                const l = project.lessons.find((x) => x.id === s.lessonId);
                return (
                  <tr key={s.id} className="border-b border-line">
                    <td className="py-2">P{s.period + 1} {project.calendar.periodTimes[s.period] ? `(${project.calendar.periodTimes[s.period].start})` : ""}</td>
                    <td>{l?.classIds.map((c) => project.classes.find((x) => x.id === c)?.name).join("+")}</td>
                    <td>{project.subjects.find((x) => x.id === l?.subjectId)?.name}</td>
                    <td>{name(s.absentTeacherId)}</td>
                    <td className="font-semibold">{name(s.substituteId)}</td>
                    <td className="w-32" />
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </section>
    );
  } else if (!project.timetable) {
    return (
      <div className="mx-auto max-w-xl p-10">
        <EmptyState title="Nothing to print yet">Generate a timetable first.</EmptyState>
      </div>
    );
  } else if (what === "master") {
    pages = (
      <section className="print-page">
        {header(day !== null ? `Day view — ${DAY_NAMES[Number(day)]}` : "Master timetable")}
        <MasterGrid project={project} placements={placements} day={day !== null ? Number(day) : undefined} colorBy="subject" detailed={false} bw={bw} />
      </section>
    );
  } else {
    const kind = (["class", "teacher", "room"].includes(what) ? what : "class") as ViewKind;
    const list = entityOptions(project, kind).filter((o) => id === "all" || o.id === id);
    const label = { class: "Class", teacher: "Teacher", room: "Room" }[kind];
    pages = list.map((o) => (
      <section key={o.id} className="print-page mb-8">
        {header(`${label}: ${o.name}`)}
        <TimetableGrid project={project} placements={placements} kind={kind} entityId={o.id} colorBy="subject" detailed bw={bw} />
      </section>
    ));
  }

  return (
    <div className={`mx-auto max-w-[1100px] bg-white px-4 py-6 text-black ${bw ? "print-bw" : ""}`}>
      <div className="no-print mb-6 flex flex-wrap items-center gap-3 rounded-xl border border-line bg-surface p-3 text-ink">
        <Button variant="primary" onClick={() => window.print()}>
          🖨️ Print / Save as PDF
        </Button>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={bw} onChange={(e) => setBw(e.target.checked)} /> Black & white (for photocopying)
        </label>
        <p className="text-xs text-muted">Tip: in the print dialog choose “Save as PDF”, A4, landscape.</p>
      </div>
      {pages}
    </div>
  );
}
