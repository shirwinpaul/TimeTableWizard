"use client";

import { useMemo, useState } from "react";
import { newId } from "@/lib/model/defaults";
import { DAY_SHORT, type Placement, type Project, type Timetable } from "@/lib/model/schema";
import { swapSuggestions } from "@/lib/solver/edit";
import { Badge, Button, Card, Input } from "../ui";

/** Selected lesson: details, lock/unlock, ranked valid moves & swaps. */
export function SelectionPanel({
  project,
  placements,
  selected,
  onClose,
  onToggleLock,
  onMove,
}: {
  project: Project;
  placements: Placement[];
  selected: { lessonId: string; unit: number };
  onClose: () => void;
  onToggleLock: () => void;
  onMove: (day: number, period: number) => void;
}) {
  const pl = placements.find((p) => p.lessonId === selected.lessonId && p.unit === selected.unit);
  const lesson = project.lessons.find((l) => l.id === selected.lessonId);
  const suggestions = useMemo(() => (pl && !pl.locked ? swapSuggestions(project, placements, selected.lessonId, selected.unit) : []), [project, placements, selected, pl]);
  if (!pl || !lesson) return null;
  const subject = project.subjects.find((s) => s.id === lesson.subjectId);
  return (
    <Card className="flex flex-col gap-3" >
      <div className="flex items-start justify-between gap-2">
        <div>
          <h3 className="font-bold">{subject?.name ?? "Lesson"}</h3>
          <p className="text-sm text-muted">
            {lesson.classIds.map((c) => project.classes.find((x) => x.id === c)?.name).join(" + ")} ·{" "}
            {lesson.teacherIds.map((t) => project.teachers.find((x) => x.id === t)?.name).join(", ")}
          </p>
          <p className="text-sm">
            {DAY_SHORT[pl.day]} P{pl.period + 1}
            {pl.length === 2 ? `–P${pl.period + 2} (double)` : ""} · {project.rooms.find((r) => r.id === pl.roomId)?.name ?? "No room"}
          </p>
        </div>
        <button onClick={onClose} className="rounded p-1 text-muted hover:bg-surface-2" aria-label="Close selection">
          ✕
        </button>
      </div>
      <Button onClick={onToggleLock}>{pl.locked ? "🔓 Unlock" : "🔒 Lock this lesson"}</Button>
      {pl.locked ? (
        <p className="text-xs text-muted">Locked lessons stay put when you re-solve.</p>
      ) : (
        <div className="flex flex-col gap-1">
          <p className="text-sm font-semibold">Valid moves & swaps (best first)</p>
          {suggestions.length === 0 && <p className="text-xs text-muted">No valid moves for this lesson right now.</p>}
          <ul className="flex flex-col gap-1">
            {suggestions.map((s) => (
              <li key={`${s.day}.${s.period}`}>
                <button onClick={() => onMove(s.day, s.period)} className="flex w-full items-center justify-between gap-2 rounded-lg border border-line px-2 py-1 text-left text-sm hover:border-primary">
                  <span>{s.label}</span>
                  <Badge tone={s.delta < 0 ? "ok" : s.delta > 0 ? "warn" : "neutral"}>{s.delta > 0 ? `+${s.delta}` : s.delta === 0 ? "±0" : s.delta}</Badge>
                </button>
              </li>
            ))}
          </ul>
          <p className="text-xs text-muted">Numbers show the change in penalty points (lower is better).</p>
        </div>
      )}
    </Card>
  );
}

/** Named versions: save, restore, compare (highlight changed cells), delete. */
export function VersionsPanel({
  project,
  timetable,
  compareId,
  onSave,
  onRestore,
  onCompare,
  onDelete,
}: {
  project: Project;
  timetable: Timetable;
  compareId: string | null;
  onSave: (v: Project["versions"][number]) => void;
  onRestore: (id: string) => void;
  onCompare: (id: string | null) => void;
  onDelete: (id: string) => void;
}) {
  const [name, setName] = useState("");
  return (
    <Card className="flex flex-col gap-3">
      <h3 className="font-bold">Versions</h3>
      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          onSave({ id: newId("ver"), name: name.trim() || `Version ${project.versions.length + 1}`, savedAt: new Date().toISOString(), timetable: structuredClone(timetable) });
          setName("");
        }}
      >
        <Input aria-label="Version name" placeholder="e.g. Final for term 1" value={name} maxLength={80} onChange={(e) => setName(e.target.value)} />
        <Button type="submit" variant="primary">
          Save
        </Button>
      </form>
      {project.versions.length === 0 ? (
        <p className="text-xs text-muted">Save a version before big changes so you can compare or go back.</p>
      ) : (
        <ul className="flex flex-col gap-1">
          {[...project.versions].reverse().map((v) => (
            <li key={v.id} className={`flex flex-wrap items-center justify-between gap-1 rounded-lg border px-2 py-1 text-sm ${compareId === v.id ? "border-violet bg-violet-soft" : "border-line"}`}>
              <span>
                <span className="font-medium">{v.name}</span> <span className="text-xs text-muted">{new Date(v.savedAt).toLocaleString()}</span>
              </span>
              <span className="flex gap-1">
                <Button size="sm" variant="ghost" onClick={() => onCompare(compareId === v.id ? null : v.id)} aria-pressed={compareId === v.id}>
                  {compareId === v.id ? "Stop compare" : "Compare"}
                </Button>
                <Button size="sm" variant="ghost" onClick={() => onRestore(v.id)}>
                  Restore
                </Button>
                <Button size="sm" variant="ghost" onClick={() => onDelete(v.id)} aria-label={`Delete version ${v.name}`}>
                  🗑️
                </Button>
              </span>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
