"use client";

import { AnimatePresence, motion } from "framer-motion";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { SummariseButton } from "@/components/ai/AiButtons";
import { ExportMenu } from "@/components/ExportMenu";
import { ProblemList } from "@/components/PrecheckPanel";
import { GeneratePanel } from "@/components/timetable/GeneratePanel";
import { MasterGrid } from "@/components/timetable/MasterGrid";
import { QualityPanel } from "@/components/timetable/QualityPanel";
import { SelectionPanel, VersionsPanel } from "@/components/timetable/SidePanels";
import { TimetableGrid } from "@/components/timetable/TimetableGrid";
import type { ColorBy } from "@/components/timetable/LessonChip";
import { useToast } from "@/components/Toast";
import { Button, EmptyState, Select, Spinner } from "@/components/ui";
import { useProject } from "@/hooks/useProject";
import { DAY_NAMES } from "@/lib/model/schema";
import type { SolveResult } from "@/lib/solver";
import { moveLesson } from "@/lib/solver/edit";
import type { Problem } from "@/lib/solver/precheck";
import { scoreBreakdown } from "@/lib/solver/score";
import { validate } from "@/lib/solver/validator";
import { diffCells, entityOptions, type ViewKind } from "@/lib/timetable/views";

type View = ViewKind | "master" | "day";

const wideQuery = "(min-width: 768px)";
const subscribeWide = (cb: () => void) => {
  const m = window.matchMedia(wideQuery);
  m.addEventListener("change", cb);
  return () => m.removeEventListener("change", cb);
};

export default function TimetablePage() {
  return (
    <Suspense fallback={<div className="p-8"><Spinner /></div>}>
      <TimetableView />
    </Suspense>
  );
}

function TimetableView() {
  const { project, update } = useProject();
  const params = useSearchParams();
  const toast = useToast();
  const wide = useSyncExternalStore(subscribeWide, () => window.matchMedia(wideQuery).matches, () => true);
  const [view, setView] = useState<View>("class");
  const [entity, setEntity] = useState<string>(project.classes[0]?.id ?? "");
  const [day, setDay] = useState(project.calendar.days[0]?.day ?? 0);
  const [colorBy, setColorBy] = useState<ColorBy>("subject");
  const [detailed, setDetailed] = useState(false);
  const [allowWarn, setAllowWarn] = useState(false);
  const [selected, setSelected] = useState<{ lessonId: string; unit: number } | null>(null);
  const [compareId, setCompareId] = useState<string | null>(null);
  const [showGen, setShowGen] = useState(params.get("generate") === "1" || !project.timetable);
  const [last, setLast] = useState<SolveResult | null>(null);
  const [reveal, setReveal] = useState(false);

  const tt = project.timetable;
  const placements = useMemo(() => tt?.placements ?? [], [tt]);
  const locks = useMemo(() => placements.filter((p) => p.locked), [placements]);
  const validation = useMemo(() => (tt ? validate(project, tt, { locks }) : null), [project, tt, locks]);
  const score = useMemo(() => (tt ? scoreBreakdown(project, tt) : null), [project, tt]);
  const clashKeys = useMemo(() => {
    const s = new Set<string>();
    for (const v of validation?.violations ?? []) if (v.day !== undefined && v.period !== undefined) for (const id of v.lessonIds) s.add(`${id}@${v.day}.${v.period}`);
    return s;
  }, [validation]);
  const compare = project.versions.find((v) => v.id === compareId);
  const changed = useMemo(() => (compare ? diffCells(project, compare.timetable.placements, placements) : null), [compare, project, placements]);
  const changedForEntity = useMemo(() => {
    if (!changed || view !== "class") return undefined;
    return new Set([...changed].filter((k) => k.startsWith(`${entity}@`)).map((k) => k.split("@")[1]));
  }, [changed, view, entity]);

  useEffect(() => {
    if (!reveal) return;
    const t = setTimeout(() => setReveal(false), 2600);
    return () => clearTimeout(t);
  }, [reveal]);

  const kind: ViewKind = view === "teacher" || view === "room" ? view : "class";
  const options = entityOptions(project, kind);
  const entityId = options.some((o) => o.id === entity) ? entity : options[0]?.id ?? "";

  const onResult = (r: SolveResult, cancelled: boolean) => {
    setLast(r);
    if (r.timetable) {
      update((p) => void (p.timetable = r.timetable));
      setShowGen(false);
    }
    if (r.status === "solved") {
      setReveal(true);
      toast({ tone: "ok", text: `Clash-free timetable ready in ${(r.solveMs / 1000).toFixed(1)}s${cancelled ? " (stopped early — best so far)" : ""}.` });
    } else if (r.status === "partial") toast({ tone: "bad", text: `${r.unplaced.length} lesson(s) couldn't be placed. See the reasons below.` });
    else toast({ tone: "bad", text: "The input is impossible — see the problems below." });
  };

  const move = (lessonId: string, unit: number, d: number, p: number) => {
    const r = moveLesson(project, placements, lessonId, unit, d, p);
    if (!r.ok) return toast({ tone: "bad", text: `⛔ ${r.reason}` });
    update((pr) => void (pr.timetable = { ...pr.timetable!, placements: r.placements }));
    toast({ tone: "ok", text: "Moved. Ctrl+Z to undo." });
  };

  const setLock = (pred: (lessonId: string, unit: number) => boolean, locked: boolean) =>
    update((p) => {
      if (!p.timetable) return;
      // Block lessons share their unit, so lock all lessons of the block together.
      const blockOf = new Map(p.lessons.map((l) => [l.id, l.blockId]));
      const keys = new Set(p.timetable.placements.filter((x) => pred(x.lessonId, x.unit)).map((x) => `${blockOf.get(x.lessonId) ?? x.lessonId}#${x.unit}`));
      for (const x of p.timetable.placements) if (keys.has(`${blockOf.get(x.lessonId) ?? x.lessonId}#${x.unit}`)) x.locked = locked;
    });

  const lockView = (locked: boolean) => {
    const ids = new Set(
      project.lessons
        .filter((l) => (kind === "class" ? l.classIds.includes(entityId) : kind === "teacher" ? l.teacherIds.includes(entityId) : true))
        .map((l) => l.id),
    );
    setLock((lid, u) => ids.has(lid) && (kind !== "room" || placements.some((x) => x.lessonId === lid && x.unit === u && x.roomId === entityId)), locked);
  };

  const unplacedProblems: Problem[] = (last?.unplaced ?? []).map((u) => ({
    severity: "error",
    code: "noSlot",
    message: `${u.label}: ${u.periods} period(s) not placed. ${u.reasons.map((r) => r.message).join(" ")}`,
    fixes: u.reasons.flatMap((r) => r.fixes).slice(0, 3),
    data: {},
  }));

  if (!project.lessons.length)
    return (
      <div className="mx-auto max-w-xl p-10">
        <EmptyState title="No lessons yet" action={<Link className="font-semibold text-primary underline" href={`/project/${project.id}/setup?step=1`}>Open the setup wizard</Link>}>
          Add your classes, subjects, teachers and lessons first.
        </EmptyState>
      </div>
    );

  return (
    <div className="mx-auto flex max-w-7xl flex-col gap-4 px-4 py-6">
      <AnimatePresence>
        {reveal && (
          <motion.div initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }} className="pointer-events-none fixed inset-x-0 top-24 z-40 mx-auto w-fit rounded-2xl bg-ok-soft px-8 py-4 text-2xl font-extrabold text-ok shadow-2xl" role="status">
            ✅ Clash-free!
          </motion.div>
        )}
      </AnimatePresence>

      {(showGen || !tt) && <GeneratePanel project={project} locks={[]} onResult={onResult} autoStart={params.get("generate") === "1" && !tt} />}
      {last?.status === "infeasible" && <ProblemList problems={last.problems} />}

      {tt && validation && (
        <>
          <div className="flex flex-wrap items-center justify-between gap-3" aria-live="polite">
            {validation.ok ? (
              <p className="rounded-lg bg-ok-soft px-3 py-2 font-bold text-ok">✅ Clash-free — every hard rule checked</p>
            ) : (
              <p className="rounded-lg bg-bad-soft px-3 py-2 font-bold text-bad">⚠️ Not valid yet: {validation.violations.length} issue(s) — see below</p>
            )}
            <div className="flex flex-wrap gap-2">
              {wide && (
                <Button onClick={() => setShowGen((x) => !x)}>
                  {showGen ? "Hide generator" : "🧙 Generate again"}
                </Button>
              )}
              {wide && locks.length > 0 && <GenerateInline project={project} locks={locks} onResult={onResult} />}
              <SummariseButton />
              <ExportMenu view={view} entityId={entityId} day={day} />
            </div>
          </div>
          {!validation.ok && (
            <ul className="flex flex-col gap-1 rounded-lg border border-bad bg-surface p-3 text-sm" aria-label="Problems">
              {validation.violations.slice(0, 12).map((v, i) => (
                <li key={i}>⛔ {v.message}</li>
              ))}
              {validation.violations.length > 12 && <li className="text-muted">…and {validation.violations.length - 12} more</li>}
            </ul>
          )}
          {unplacedProblems.length > 0 && !validation.ok && <ProblemList problems={unplacedProblems} />}

          <div className="no-print flex flex-wrap items-center gap-2 rounded-xl border border-line bg-surface p-2">
            <div role="tablist" aria-label="View" className="flex flex-wrap gap-1">
              {(
                [
                  ["class", "By class"],
                  ["teacher", "By teacher"],
                  ["room", "By room"],
                  ["master", "Master"],
                  ["day", "Day"],
                ] as [View, string][]
              ).map(([v, label]) => (
                <button key={v} role="tab" aria-selected={view === v} onClick={() => setView(v)} className={`rounded-lg px-3 py-1.5 text-sm font-medium ${view === v ? "bg-violet-soft text-violet" : "hover:bg-surface-2"}`}>
                  {label}
                </button>
              ))}
            </div>
            {(view === "class" || view === "teacher" || view === "room") && (
              <Select aria-label="Choose" className="!w-auto" value={entityId} onChange={(e) => setEntity(e.target.value)}>
                {options.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.name}
                  </option>
                ))}
              </Select>
            )}
            {view === "day" && (
              <Select aria-label="Day" className="!w-auto" value={day} onChange={(e) => setDay(Number(e.target.value))}>
                {project.calendar.days.map((d) => (
                  <option key={d.day} value={d.day}>
                    {DAY_NAMES[d.day]}
                  </option>
                ))}
              </Select>
            )}
            <Select aria-label="Colour by" className="!w-auto" value={colorBy} onChange={(e) => setColorBy(e.target.value as ColorBy)}>
              <option value="subject">Colour: subject</option>
              <option value="teacher">Colour: teacher</option>
            </Select>
            <label className="flex items-center gap-1 text-sm">
              <input type="checkbox" checked={detailed} onChange={(e) => setDetailed(e.target.checked)} /> Detailed
            </label>
            {wide && view !== "master" && view !== "day" && (
              <>
                <label className="flex items-center gap-1 text-sm" title="Allow moves that only worsen soft rules">
                  <input type="checkbox" checked={allowWarn} onChange={(e) => setAllowWarn(e.target.checked)} /> Allow with warning
                </label>
                <Button size="sm" onClick={() => lockView(true)}>🔒 Lock this {kind}</Button>
                <Button size="sm" variant="ghost" onClick={() => lockView(false)}>Unlock</Button>
              </>
            )}
          </div>
          {!wide && <p className="text-xs text-muted">📱 Read-only on phones — editing works best on a larger screen.</p>}

          <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
            <div className="min-w-0">
              {view === "master" || view === "day" ? (
                <MasterGrid project={project} placements={placements} day={view === "day" ? day : undefined} colorBy={colorBy} detailed={detailed} clashKeys={clashKeys} changedByClass={changed ?? undefined} onSelect={setSelected} />
              ) : (
                <TimetableGrid
                  project={project}
                  placements={placements}
                  kind={kind}
                  entityId={entityId}
                  colorBy={colorBy}
                  detailed={detailed}
                  editable={wide}
                  allowWarnings={allowWarn}
                  clashKeys={clashKeys}
                  changedCells={changedForEntity}
                  selected={selected}
                  onSelect={setSelected}
                  onMove={move}
                  onBlocked={(reason) => toast({ tone: "bad", text: `⛔ ${reason}` })}
                />
              )}
              {changed && <p className="mt-2 text-sm text-violet">{changed.size} cell(s) differ from “{compare?.name}” (dashed outline).</p>}
            </div>
            <aside className="flex flex-col gap-4">
              {selected && wide && (
                <SelectionPanel
                  project={project}
                  placements={placements}
                  selected={selected}
                  onClose={() => setSelected(null)}
                  onToggleLock={() => {
                    const pl = placements.find((x) => x.lessonId === selected.lessonId && x.unit === selected.unit);
                    setLock((l, u) => l === selected.lessonId && u === selected.unit, !pl?.locked);
                  }}
                  onMove={(d, p) => move(selected.lessonId, selected.unit, d, p)}
                />
              )}
              {score && <QualityPanel project={project} placements={placements} score={score} startScore={last?.startScore} />}
              {wide && (
                <VersionsPanel
                  project={project}
                  timetable={tt}
                  compareId={compareId}
                  onSave={(v) => {
                    update((p) => void p.versions.push(v));
                    toast({ tone: "ok", text: `Saved “${v.name}”.` });
                  }}
                  onRestore={(id) => {
                    update((p) => void (p.timetable = structuredClone(p.versions.find((v) => v.id === id)!.timetable)));
                    toast({ tone: "ok", text: "Version restored. Ctrl+Z to undo." });
                  }}
                  onCompare={setCompareId}
                  onDelete={(id) => {
                    update((p) => void (p.versions = p.versions.filter((v) => v.id !== id)));
                    if (compareId === id) setCompareId(null);
                  }}
                />
              )}
            </aside>
          </div>
        </>
      )}
    </div>
  );
}

/** "Re-solve the rest" around locked cells. */
function GenerateInline({ project, locks, onResult }: { project: Parameters<typeof GeneratePanel>[0]["project"]; locks: Parameters<typeof GeneratePanel>[0]["locks"]; onResult: Parameters<typeof GeneratePanel>[0]["onResult"] }) {
  const [open, setOpen] = useState(false);
  if (!open) return <Button variant="primary" onClick={() => setOpen(true)}>♻️ Re-solve the rest ({locks.length} locked)</Button>;
  return (
    <div className="w-full basis-full">
      <GeneratePanel project={project} locks={locks} onResult={(r, c) => (setOpen(false), onResult(r, c))} autoStart />
    </div>
  );
}
