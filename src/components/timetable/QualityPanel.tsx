"use client";

import { useMemo, useState } from "react";
import { DAY_SHORT, type Placement, type Project } from "@/lib/model/schema";
import type { ScoreBreakdown } from "@/lib/solver/score";
import { computeStats } from "@/lib/timetable/views";
import { Card } from "../ui";

/** One horizontal magnitude bar: single hue, value in ink, hover title. */
function Bar({ label, value, max, suffix = "" }: { label: string; value: number; max: number; suffix?: string }) {
  const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0;
  return (
    <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)_3.5rem] items-center gap-2 text-xs" title={`${label}: ${value}${suffix}`}>
      <span className="truncate">{label}</span>
      <span className="h-2.5 rounded-sm bg-surface-2">
        <span className="block h-full rounded-r-[4px] bg-primary" style={{ width: `${pct}%` }} />
      </span>
      <span className="tabular text-right text-muted">
        {value}
        {suffix}
      </span>
    </div>
  );
}

/** Small per-day column chart for a teacher/class load (title = values). */
function DayBars({ perDay, days, cap }: { perDay: number[]; days: number[]; cap: number }) {
  return (
    <span className="inline-flex h-6 items-end gap-0.5" title={perDay.map((n, i) => `${DAY_SHORT[days[i]]} ${n}`).join(" · ")} role="img" aria-label={`Periods per day: ${perDay.map((n, i) => `${DAY_SHORT[days[i]]} ${n}`).join(", ")}`}>
      {perDay.map((n, i) => (
        <span key={i} className="w-1.5 rounded-t-[2px] bg-violet" style={{ height: `${Math.max(2, (n / Math.max(1, cap)) * 24)}px` }} />
      ))}
    </span>
  );
}

export function QualityPanel({ project, placements, score, startScore }: { project: Project; placements: Placement[]; score: ScoreBreakdown; startScore?: number | null }) {
  const stats = useMemo(() => computeStats(project, placements), [project, placements]);
  const [tab, setTab] = useState<"teachers" | "classes">("teachers");
  const maxW = Math.max(1, ...score.items.map((i) => i.weighted));
  const capDay = Math.max(...project.calendar.days.map((d) => d.periods));
  return (
    <div className="flex flex-col gap-4">
      <Card className="flex flex-col gap-3">
        <div className="flex items-baseline justify-between">
          <h3 className="font-bold">Quality score</h3>
          <p className="tabular text-2xl font-extrabold">{score.total}</p>
        </div>
        <p className="text-xs text-muted">
          Penalty points from soft rules — lower is better, 0 is perfect.
          {startScore != null && startScore > score.total && ` Improved from ${Math.round(startScore)} by the optimiser.`}
        </p>
        <div className="flex flex-col gap-1.5">
          {score.items.map((i) => (
            <Bar key={i.ruleId} label={i.label} value={Math.round(i.weighted * 10) / 10} max={maxW} />
          ))}
        </div>
      </Card>

      {stats.rooms.length > 0 && (
        <Card className="flex flex-col gap-2">
          <h3 className="font-bold">Special room use</h3>
          {stats.rooms.map((r) => (
            <Bar key={r.label} label={r.label} value={Math.round((r.used / Math.max(1, r.capacity)) * 100)} max={100} suffix="%" />
          ))}
        </Card>
      )}

      <Card className="flex flex-col gap-2">
        <div role="tablist" aria-label="Statistics" className="flex gap-1">
          {(["teachers", "classes"] as const).map((t) => (
            <button key={t} role="tab" aria-selected={tab === t} onClick={() => setTab(t)} className={`rounded-lg px-3 py-1 text-sm font-medium ${tab === t ? "bg-violet-soft text-violet" : "hover:bg-surface-2"}`}>
              {t === "teachers" ? "Teachers" : "Classes"}
            </button>
          ))}
        </div>
        <div className="max-h-80 overflow-auto">
          <table className="w-full text-xs">
            <thead className="sticky top-0 bg-surface text-left text-muted">
              {tab === "teachers" ? (
                <tr>
                  <th className="py-1">Teacher</th>
                  <th>Per day</th>
                  <th className="text-right">Week</th>
                  <th className="text-right">Gaps</th>
                  <th className="text-right">In a row</th>
                </tr>
              ) : (
                <tr>
                  <th className="py-1">Class</th>
                  <th>Per day</th>
                  <th className="text-right">Week</th>
                  <th className="text-right">Free</th>
                </tr>
              )}
            </thead>
            <tbody className="tabular">
              {tab === "teachers"
                ? stats.teachers.map((t) => (
                    <tr key={t.id} className="border-t border-line">
                      <td className="py-1">{t.name}</td>
                      <td><DayBars perDay={t.perDay} days={stats.days} cap={capDay} /></td>
                      <td className="text-right">
                        {t.total}/{t.maxPerWeek}
                      </td>
                      <td className="text-right">{t.gaps}</td>
                      <td className="text-right">{t.maxConsecutive}</td>
                    </tr>
                  ))
                : stats.classes.map((c) => (
                    <tr key={c.id} className="border-t border-line">
                      <td className="py-1">{c.name}</td>
                      <td><DayBars perDay={c.perDay} days={stats.days} cap={capDay} /></td>
                      <td className="text-right">{c.total}</td>
                      <td className="text-right">{c.free}</td>
                    </tr>
                  ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
