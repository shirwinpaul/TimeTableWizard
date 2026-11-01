"use client";

import { DndContext, DragOverlay, KeyboardSensor, PointerSensor, useDraggable, useDroppable, useSensor, useSensors, type DragEndEvent, type DragOverEvent, type DragStartEvent } from "@dnd-kit/core";
import { Fragment, useMemo, useState } from "react";
import { DAY_NAMES, DAY_SHORT, slotOf, type Placement, type Project } from "@/lib/model/schema";
import { dropTargets, type DropInfo } from "@/lib/solver/edit";
import { gridFor, type Entry, type ViewKind } from "@/lib/timetable/views";
import { LessonChip, type ColorBy, type Show } from "./LessonChip";

export interface GridProps {
  project: Project;
  placements: Placement[];
  kind: ViewKind;
  entityId: string;
  colorBy: ColorBy;
  detailed: boolean;
  editable?: boolean;
  allowWarnings?: boolean;
  clashKeys?: Set<string>;
  changedCells?: Set<string>;
  selected?: { lessonId: string; unit: number } | null;
  onSelect?: (s: { lessonId: string; unit: number } | null) => void;
  onMove?: (lessonId: string, unit: number, day: number, period: number) => void;
  onBlocked?: (reason: string) => void;
  bw?: boolean;
}

const keyOf = (pl: Placement) => `${pl.lessonId}#${pl.unit}`;

export function TimetableGrid(props: GridProps) {
  const { project, placements, kind, entityId, editable, allowWarnings, onMove, onBlocked } = props;
  const grid = useMemo(() => gridFor(project, placements, kind, entityId), [project, placements, kind, entityId]);
  const [dragging, setDragging] = useState<Entry | null>(null);
  const [targets, setTargets] = useState<Map<number, DropInfo> | null>(null);
  const [hover, setHover] = useState<DropInfo | null>(null);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }), useSensor(KeyboardSensor));

  const start = (e: DragStartEvent) => {
    const entry = e.active.data.current as Entry;
    setDragging(entry);
    setTargets(dropTargets(project, placements, entry.placement.lessonId, entry.placement.unit));
  };
  const over = (e: DragOverEvent) => {
    const id = e.over?.id as string | undefined;
    if (!id || !targets) return setHover(null);
    const [, d, p] = id.split("-").map(Number);
    setHover(targets.get(slotOf(d, p)) ?? null);
  };
  const end = (e: DragEndEvent) => {
    const entry = dragging;
    const id = e.over?.id as string | undefined;
    setDragging(null);
    setHover(null);
    const t = targets;
    setTargets(null);
    if (!entry || !id || !t) return;
    const [, d, p] = id.split("-").map(Number);
    const info = t.get(slotOf(d, p));
    if (!info) return;
    if (!info.ok) return onBlocked?.(info.reason);
    if (info.delta > 0 && !allowWarnings) return onBlocked?.(`This makes soft rules worse (+${info.delta}). Turn on “Allow with warning” to do it anyway.`);
    onMove?.(entry.placement.lessonId, entry.placement.unit, d, p);
  };

  const body = <GridTable {...props} grid={grid} targets={targets} dragging={dragging} />;
  if (!editable) return body;
  return (
    <DndContext sensors={sensors} onDragStart={start} onDragOver={over} onDragEnd={end} onDragCancel={() => (setDragging(null), setTargets(null), setHover(null))}>
      {body}
      <p aria-live="assertive" className="mt-2 min-h-5 text-sm">
        {dragging && hover && (hover.ok ? (hover.delta > 0 ? `⚠️ Allowed with warning: soft score +${hover.delta}` : `✅ Valid${hover.swapWith ? " (swap)" : ""}${hover.delta < 0 ? ` — improves score by ${-hover.delta}` : ""}`) : `⛔ ${hover.reason}`)}
      </p>
      <DragOverlay>{dragging && <div className="w-24 opacity-90 shadow-xl"><LessonChip e={dragging} colorBy={props.colorBy} detailed={false} show={[]} /></div>}</DragOverlay>
    </DndContext>
  );
}

function GridTable({ project, kind, colorBy, detailed, editable, clashKeys, changedCells, selected, onSelect, bw, grid, targets, dragging }: GridProps & { grid: Entry[][][]; targets: Map<number, DropInfo> | null; dragging: Entry | null }) {
  const days = [...project.calendar.days].sort((a, b) => a.day - b.day);
  const maxP = Math.max(...days.map((d) => d.periods));
  const breaks = new Map(project.calendar.breaks.map((b) => [b.afterPeriod, b]));
  const show: Show[] = (["class", "teacher", "room"] as Show[]).filter((s) => s !== kind);
  // Arrow keys move between cells (disabled mid-drag, where dnd-kit uses them).
  const onKeyDown = (e: React.KeyboardEvent) => {
    if (dragging || !["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(e.key)) return;
    const td = (e.target as HTMLElement).closest<HTMLElement>("[data-cell]");
    if (!td) return;
    const [d, p] = td.dataset.cell!.split(".").map(Number);
    const di = days.findIndex((x) => x.day === d);
    const [nd, np] =
      e.key === "ArrowLeft" ? [di, p - 1] : e.key === "ArrowRight" ? [di, p + 1] : e.key === "ArrowUp" ? [di - 1, p] : [di + 1, p];
    if (!days[nd] || np < 0 || np >= days[nd].periods) return;
    const next = e.currentTarget.querySelector<HTMLElement>(`[data-cell="${days[nd].day}.${np}"]`);
    if (!next) return;
    e.preventDefault();
    (next.querySelector<HTMLElement>('[tabindex="0"], button') ?? next).focus();
  };
  return (
    <div className="overflow-x-auto rounded-xl border border-line bg-surface" onKeyDown={onKeyDown}>
      <table className="w-full border-collapse text-xs">
        <thead>
          <tr className="bg-surface-2">
            <th className="sticky left-0 z-10 w-14 bg-surface-2 px-2 py-2 text-left">Day</th>
            {Array.from({ length: maxP }, (_, p) => (
              <Fragment key={p}>
                <th className="min-w-19.5 px-1 py-1.5 font-semibold">
                  <span className="block">P{p + 1}</span>
                  {project.calendar.periodTimes[p] && (
                    <span className="tabular block text-[10px] font-normal text-muted">
                      {project.calendar.periodTimes[p].start}–{project.calendar.periodTimes[p].end}
                    </span>
                  )}
                </th>
                {breaks.has(p) && p < maxP - 1 && (
                  <th className="w-5 bg-surface-2 px-0 text-[9px] font-normal text-muted" title={breaks.get(p)!.label}>
                    <span className="[writing-mode:vertical-rl]">{breaks.get(p)!.kind === "lunch" ? "Lunch" : "Brk"}</span>
                  </th>
                )}
              </Fragment>
            ))}
          </tr>
        </thead>
        <tbody>
          {days.map((d) => (
            <tr key={d.day} className="border-t border-line">
              <th className="sticky left-0 z-10 bg-surface px-2 py-1 text-left font-semibold" scope="row">
                <abbr title={DAY_NAMES[d.day]} className="no-underline">
                  {DAY_SHORT[d.day]}
                </abbr>
              </th>
              {Array.from({ length: maxP }, (_, p) => (
                <Fragment key={p}>
                  {p < d.periods ? (
                    <Cell
                      day={d.day}
                      period={p}
                      entries={grid[d.day][p]}
                      editable={!!editable}
                      target={targets?.get(slotOf(d.day, p))}
                      dragging={dragging}
                      render={(e) => (
                        <LessonChip
                          e={e}
                          colorBy={colorBy}
                          detailed={detailed}
                          show={show}
                          bw={bw}
                          clash={clashKeys?.has(`${e.placement.lessonId}@${d.day}.${p}`)}
                          changed={changedCells?.has(`${d.day}.${p}`)}
                          selected={!!selected && selected.lessonId === e.placement.lessonId && selected.unit === e.placement.unit}
                        />
                      )}
                      onSelect={onSelect}
                      event={project.calendar.fixedEvents.find((ev) => ev.day === d.day && ev.period === p)?.name}
                    />
                  ) : (
                    <td className="bg-surface-2/60" aria-hidden />
                  )}
                  {breaks.has(p) && p < maxP - 1 && <td className="bg-surface-2" aria-hidden />}
                </Fragment>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Cell({
  day,
  period,
  entries,
  editable,
  target,
  dragging,
  render,
  onSelect,
  event,
}: {
  day: number;
  period: number;
  entries: Entry[];
  editable: boolean;
  target: DropInfo | undefined;
  dragging: Entry | null;
  render: (e: Entry) => React.ReactNode;
  onSelect?: GridProps["onSelect"];
  event?: string;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: `cell-${day}-${period}`, disabled: !editable });
  let glow = "";
  // Outlines sit on top of lesson chips, so occupied cells show their status too.
  if (dragging && target)
    glow = target.ok
      ? target.delta > 0
        ? "bg-warn-soft outline-2 -outline-offset-2 outline-warn"
        : "bg-ok-soft outline-2 -outline-offset-2 outline-ok"
      : "bg-bad-soft/60 [&>div]:opacity-40";
  if (isOver && target && !target.ok) glow = "bg-bad-soft outline-2 -outline-offset-2 outline-bad [&>div]:opacity-40";
  return (
    <td ref={setNodeRef} data-cell={`${day}.${period}`} tabIndex={-1} aria-label={entries.length ? undefined : `Empty period ${period + 1}`} className={`h-12 border-l border-line p-0.5 align-top transition-colors ${glow}`} title={dragging && target && !target.ok ? target.reason : undefined}>
      <div className="flex h-full flex-col gap-0.5">
        {entries.length === 0 && event && <span className="m-auto text-[10px] italic text-muted">{event}</span>}
        {entries.map((e) =>
          editable && !e.continuation && !e.placement.locked ? (
            <Draggable key={keyOf(e.placement) + e.lesson.id} entry={e} onSelect={onSelect}>
              {render(e)}
            </Draggable>
          ) : (
            <button
              key={keyOf(e.placement) + e.lesson.id + (e.continuation ? "c" : "")}
              className="h-full w-full text-left"
              onClick={() => onSelect?.({ lessonId: e.placement.lessonId, unit: e.placement.unit })}
              aria-label={`${e.subject?.name ?? "Lesson"} ${e.classNames}`}
            >
              {render(e)}
            </button>
          ),
        )}
      </div>
    </td>
  );
}

function Draggable({ entry, children, onSelect }: { entry: Entry; children: React.ReactNode; onSelect?: GridProps["onSelect"] }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: `${keyOf(entry.placement)}|${entry.lesson.id}`, data: entry });
  return (
    <div
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      onClick={() => onSelect?.({ lessonId: entry.placement.lessonId, unit: entry.placement.unit })}
      aria-label={`${entry.subject?.name ?? "Lesson"} ${entry.classNames} — drag, or press Space to pick up and arrow keys to move; click to select`}
      className={`h-full cursor-grab touch-none active:cursor-grabbing ${isDragging ? "opacity-30" : ""}`}
    >
      {children}
    </div>
  );
}
