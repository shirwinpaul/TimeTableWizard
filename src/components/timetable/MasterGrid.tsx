"use client";

import { Fragment, useMemo } from "react";
import { DAY_NAMES, DAY_SHORT, type Placement, type Project } from "@/lib/model/schema";
import { masterGrid } from "@/lib/timetable/views";
import { LessonChip, type ColorBy } from "./LessonChip";

/** Master grid (all classes × all slots) or Day view (all classes × one day's periods). Read-only. */
export function MasterGrid({
  project,
  placements,
  day,
  colorBy,
  detailed,
  clashKeys,
  changedByClass,
  onSelect,
  bw,
}: {
  project: Project;
  placements: Placement[];
  /** When set, show only this day (Day view). */
  day?: number;
  colorBy: ColorBy;
  detailed: boolean;
  clashKeys?: Set<string>;
  changedByClass?: Set<string>;
  onSelect?: (s: { lessonId: string; unit: number }) => void;
  bw?: boolean;
}) {
  const grids = useMemo(() => masterGrid(project, placements), [project, placements]);
  const days = [...project.calendar.days].sort((a, b) => a.day - b.day).filter((d) => day === undefined || d.day === day);
  const dayView = day !== undefined;
  return (
    <div className="overflow-x-auto rounded-xl border border-line bg-surface">
      <table className="border-collapse text-[10px]">
        <caption className="sr-only">{dayView ? `Day view: ${DAY_NAMES[day!]}` : "Master timetable"}</caption>
        <thead>
          <tr className="bg-surface-2">
            <th rowSpan={2} className="sticky left-0 z-10 bg-surface-2 px-2 text-left text-xs">
              Class
            </th>
            {days.map((d) => (
              <th key={d.day} colSpan={d.periods} className="border-l border-line px-1 py-1 text-xs">
                {dayView ? DAY_NAMES[d.day] : DAY_SHORT[d.day]}
              </th>
            ))}
          </tr>
          <tr className="bg-surface-2">
            {days.map((d) => (
              <Fragment key={d.day}>
                {Array.from({ length: d.periods }, (_, p) => (
                  <th key={p} className={`px-0.5 font-normal text-muted ${p === 0 ? "border-l border-line" : ""}`}>
                    {p + 1}
                  </th>
                ))}
              </Fragment>
            ))}
          </tr>
        </thead>
        <tbody>
          {project.classes.map((c) => {
            const g = grids.get(c.id)!;
            return (
              <tr key={c.id} className="border-t border-line">
                <th scope="row" className="sticky left-0 z-10 whitespace-nowrap bg-surface px-2 text-left text-xs font-semibold">
                  {c.name}
                </th>
                {days.map((d) => (
                  <Fragment key={d.day}>
                    {Array.from({ length: d.periods }, (_, p) => (
                      <td key={p} className={`p-px ${dayView ? "min-w-20" : "min-w-9"} ${p === 0 ? "border-l border-line" : ""}`}>
                        <div className="flex flex-col gap-px">
                          {g[d.day][p].map((e) => (
                            <button
                              key={e.lesson.id + e.placement.unit}
                              className="w-full text-left"
                              onClick={() => onSelect?.({ lessonId: e.placement.lessonId, unit: e.placement.unit })}
                              aria-label={`${c.name} ${DAY_SHORT[d.day]} P${p + 1}: ${e.subject?.name ?? ""}`}
                            >
                              <LessonChip
                                e={e}
                                colorBy={colorBy}
                                detailed={dayView && detailed}
                                show={dayView ? ["teacher"] : []}
                                bw={bw}
                                clash={clashKeys?.has(`${e.placement.lessonId}@${d.day}.${p}`)}
                                changed={changedByClass?.has(`${c.id}@${d.day}.${p}`)}
                              />
                            </button>
                          ))}
                        </div>
                      </td>
                    ))}
                  </Fragment>
                ))}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
