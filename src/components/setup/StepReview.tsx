"use client";

import Link from "next/link";
import { useMemo, type ReactNode } from "react";
import { useProject } from "@/hooks/useProject";
import { precheck, type Problem } from "@/lib/solver/precheck";
import { ProblemList } from "../PrecheckPanel";
import { Card } from "../ui";

/** Step 9: summary + pre-check, then Generate. */
export function StepReview({ aiSlot }: { aiSlot?: (problems: Problem[]) => ReactNode }) {
  const { project } = useProject();
  const result = useMemo(() => precheck(project), [project]);
  const periods = project.lessons.reduce((n, l) => n + l.periodsPerWeek, 0);
  const stats = [
    ["Days", project.calendar.days.length],
    ["Classes", project.classes.length],
    ["Subjects", project.subjects.length],
    ["Teachers", project.teachers.length],
    ["Rooms", project.rooms.length],
    ["Lessons", project.lessons.length],
    ["Periods to place", periods],
    ["Rules", project.rules.filter((r) => r.enabled).length],
  ] as const;
  const errors = result.problems.filter((p) => p.severity === "error").length;
  return (
    <div className="flex flex-col gap-5">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {stats.map(([k, v]) => (
          <Card key={k} className="!p-3">
            <p className="text-xs text-muted">{k}</p>
            <p className="tabular text-2xl font-bold">{v}</p>
          </Card>
        ))}
      </div>
      <div aria-live="polite">
        {result.ok ? (
          <p className="rounded-lg bg-ok-soft p-3 font-semibold text-ok">✅ Pre-check passed{result.problems.length ? " (with a few things to check below)" : ""} — ready to generate.</p>
        ) : (
          <p className="rounded-lg bg-bad-soft p-3 font-semibold text-bad">
            ⚠️ {errors} problem{errors > 1 ? "s" : ""} make this timetable impossible. Fix them first — the suggestions below can help.
          </p>
        )}
      </div>
      <ProblemList problems={result.problems} extra={!result.ok && aiSlot ? aiSlot(result.problems) : undefined} />
      <div className="flex justify-end">
        {result.ok ? (
          <Link href={`/project/${project.id}/timetable?generate=1`} className="rounded-lg bg-primary px-6 py-3 font-semibold text-primary-ink shadow hover:bg-primary-hover">
            🧙 Generate timetable
          </Link>
        ) : (
          <span className="rounded-lg bg-surface-2 px-6 py-3 font-semibold text-muted" aria-disabled>
            🧙 Generate timetable
          </span>
        )}
      </div>
    </div>
  );
}
