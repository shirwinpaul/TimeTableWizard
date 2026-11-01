"use client";

import Link from "next/link";
import { useState } from "react";
import { useProject } from "@/hooks/useProject";
import { buildIcs } from "@/lib/export/ics";
import { downloadBlob, safeFileName, timetablePng } from "@/lib/export/png";
import { exportProjectJson } from "@/lib/export/projectFile";
import { buildWorkbook, masterAoA, toCsv, viewAoA, workbookBytes } from "@/lib/export/sheets";
import type { ViewKind } from "@/lib/timetable/views";
import { useToast } from "./Toast";
import { Button, Dialog, Field, Input } from "./ui";

/** Export menu for the timetable page: PDF (print), Excel, CSV, ICS, PNG, project JSON. */
export function ExportMenu({ view, entityId, day }: { view: string; entityId: string; day: number }) {
  const { project } = useProject();
  const toast = useToast();
  const [icsOpen, setIcsOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const placements = project.timetable?.placements ?? [];
  const kind: ViewKind = view === "teacher" || view === "room" ? view : "class";
  const single = view === "class" || view === "teacher" || view === "room";
  const entityName = (kind === "class" ? project.classes.find((c) => c.id === entityId)?.name : kind === "teacher" ? project.teachers.find((t) => t.id === entityId)?.name : project.rooms.find((r) => r.id === entityId)?.name) ?? "";
  const base = safeFileName(project.name);

  const run = async (fn: () => Promise<void> | void) => {
    setBusy(true);
    try {
      await fn();
    } catch {
      toast({ tone: "bad", text: "Export failed. Please try again." });
    } finally {
      setBusy(false);
    }
  };
  const printWhat = view === "master" || view === "day" ? "master" : view;
  const printHref = `/project/${project.id}/print?what=${printWhat}&id=${single ? entityId : "all"}${view === "day" ? `&day=${day}` : ""}`;

  return (
    <>
    <details className="relative">
      <summary className="cursor-pointer list-none rounded-lg border border-line bg-surface px-3.5 py-2 text-sm font-medium hover:bg-surface-2">📤 Export ▾</summary>
      <div
        className="absolute right-0 z-30 mt-1 flex w-64 flex-col gap-0.5 rounded-xl border border-line bg-surface p-2 shadow-xl"
        onClick={(e) => {
          // Close the menu once something is chosen.
          if ((e.target as HTMLElement).closest("a,button")) e.currentTarget.closest("details")?.removeAttribute("open");
        }}
      >
        <Link className="rounded px-2 py-1.5 text-sm hover:bg-surface-2" href={printHref} target="_blank">🖨️ PDF / print this view</Link>
        <Link className="rounded px-2 py-1.5 text-sm hover:bg-surface-2" href={`/project/${project.id}/print?what=${kind}&id=all`} target="_blank">🖨️ PDF of every {kind}</Link>
        <button disabled={busy} className="rounded px-2 py-1.5 text-left text-sm hover:bg-surface-2" onClick={() => run(() => downloadBlob(`${base}.xlsx`, new Blob([workbookBytes(buildWorkbook(project, placements))], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" })))}>
          📊 Excel (all views)
        </button>
        <button disabled={busy} className="rounded px-2 py-1.5 text-left text-sm hover:bg-surface-2" onClick={() => run(() => downloadBlob(`${base}-${single ? safeFileName(entityName) : "master"}.csv`, new Blob(["﻿" + toCsv(single ? viewAoA(project, placements, kind, entityId) : masterAoA(project, placements))], { type: "text/csv;charset=utf-8" })))}>
          📄 CSV (this view)
        </button>
        {single && kind !== "room" && (
          <button disabled={busy} className="rounded px-2 py-1.5 text-left text-sm hover:bg-surface-2" onClick={() => setIcsOpen(true)}>
            📅 Calendar (.ics) for {entityName}
          </button>
        )}
        {single && (
          <button disabled={busy} className="rounded px-2 py-1.5 text-left text-sm hover:bg-surface-2" onClick={() => run(async () => downloadBlob(`${base}-${safeFileName(entityName)}.png`, await timetablePng(project, placements, kind, entityId, entityName)))}>
            🖼️ Image (PNG) for WhatsApp
          </button>
        )}
        <button disabled={busy} className="rounded px-2 py-1.5 text-left text-sm hover:bg-surface-2" onClick={() => run(() => downloadBlob(`${base}.timetable.json`, new Blob([exportProjectJson(project)], { type: "application/json" })))}>
          💾 Project file (.json backup)
        </button>
      </div>
    </details>
    <IcsDialog open={icsOpen} onClose={() => setIcsOpen(false)} onExport={(o) => run(() => downloadBlob(`${base}-${safeFileName(entityName)}.ics`, new Blob([buildIcs(project, placements, kind, entityId, o)], { type: "text/calendar;charset=utf-8" })))} />
    </>
  );
}

function IcsDialog({ open, onClose, onExport }: { open: boolean; onClose: () => void; onExport: (o: { startDate: string; endDate: string; timeZone: string }) => void }) {
  const today = new Date().toISOString().slice(0, 10);
  const [start, setStart] = useState(today);
  const [end, setEnd] = useState(() => new Date(Date.now() + 120 * 86400000).toISOString().slice(0, 10));
  const [tz, setTz] = useState(() => {
    try {
      return Intl.DateTimeFormat().resolvedOptions().timeZone || "Asia/Kolkata";
    } catch {
      return "Asia/Kolkata";
    }
  });
  const bad = !start || !end || end < start;
  return (
    <Dialog open={open} onClose={onClose} title="Calendar file (.ics)">
      <div className="flex flex-col gap-3">
        <p className="text-sm text-muted">Creates weekly repeating events you can import into Google Calendar, Outlook or a phone calendar.</p>
        <Field label="First day of term">{(id) => <Input id={id} type="date" value={start} onChange={(e) => setStart(e.target.value)} />}</Field>
        <Field label="Last day of term" error={bad ? "Must be after the first day" : undefined}>{(id) => <Input id={id} type="date" value={end} onChange={(e) => setEnd(e.target.value)} />}</Field>
        <Field label="Time zone" hint="e.g. Asia/Kolkata">{(id) => <Input id={id} value={tz} onChange={(e) => setTz(e.target.value)} />}</Field>
        <div className="flex justify-end">
          <Button variant="primary" disabled={bad} onClick={() => (onExport({ startDate: start, endDate: end, timeZone: tz.trim() || "Asia/Kolkata" }), onClose())}>
            Download .ics
          </Button>
        </div>
      </div>
    </Dialog>
  );
}
