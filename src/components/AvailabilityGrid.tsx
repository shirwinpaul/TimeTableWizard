"use client";

import { DAY_SHORT, slotOf, type Calendar } from "@/lib/model/schema";

/** Toggle grid of days × periods. Selected cells are shown with `onLabel` (e.g. "Busy"). */
export function AvailabilityGrid({ calendar, value, onChange, onLabel, tone = "bad" }: { calendar: Calendar; value: number[]; onChange: (v: number[]) => void; onLabel: string; tone?: "bad" | "warn" }) {
  const set = new Set(value);
  const max = Math.max(...calendar.days.map((d) => d.periods));
  const toggle = (s: number) => onChange(set.has(s) ? value.filter((x) => x !== s) : [...value, s]);
  const toggleDay = (day: number, periods: number) => {
    const all = Array.from({ length: periods }, (_, p) => slotOf(day, p));
    const on = all.every((s) => set.has(s));
    onChange(on ? value.filter((s) => !all.includes(s)) : [...new Set([...value, ...all])]);
  };
  const onCls = tone === "bad" ? "bg-bad-soft text-bad border-bad" : "bg-warn-soft text-warn border-warn";
  const days = [...calendar.days].sort((a, b) => a.day - b.day);
  return (
    <div className="overflow-x-auto">
      <table className="border-separate border-spacing-1 text-xs">
        <thead>
          <tr>
            <th />
            {Array.from({ length: max }, (_, p) => (
              <th key={p} className="font-semibold text-muted">
                P{p + 1}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {days.map((d) => (
            <tr key={d.day}>
              <th>
                <button className="rounded px-1 font-semibold hover:bg-surface-2" onClick={() => toggleDay(d.day, d.periods)} title="Toggle whole day">
                  {DAY_SHORT[d.day]}
                </button>
              </th>
              {Array.from({ length: max }, (_, p) => {
                if (p >= d.periods) return <td key={p} />;
                const s = slotOf(d.day, p);
                const on = set.has(s);
                return (
                  <td key={p}>
                    <button
                      onClick={() => toggle(s)}
                      aria-pressed={on}
                      aria-label={`${DAY_SHORT[d.day]} period ${p + 1}: ${on ? onLabel : "free"}`}
                      className={`h-8 w-12 rounded border text-[11px] font-medium ${on ? onCls : "border-line bg-surface hover:bg-surface-2"}`}
                    >
                      {on ? onLabel : ""}
                    </button>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
