"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useToast } from "@/components/Toast";
import { Badge, Button, Card, EmptyState, Field, Input, Select } from "@/components/ui";
import { useProject } from "@/hooks/useProject";
import { newId } from "@/lib/model/defaults";
import { DAY_NAMES } from "@/lib/model/schema";
import { affectedPeriods, fairness, rankSubstitutes, weekdayOf, whatsappText } from "@/lib/substitutions";

const todayLocal = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

export default function SubstitutionsPage() {
  const { project, update } = useProject();
  const toast = useToast();
  const [date, setDate] = useState(todayLocal);
  const [teacher, setTeacher] = useState(project.teachers[0]?.id ?? "");
  const [whole, setWhole] = useState(true);
  const [periods, setPeriods] = useState<number[]>([]);
  const day = weekdayOf(date);
  const dayCfg = project.calendar.days.find((d) => d.day === day);
  const todays = project.substitutions.filter((s) => s.date === date).sort((a, b) => a.period - b.period);
  const stats = useMemo(() => fairness(project, date), [project, date]);
  const tName = (id: string | null) => project.teachers.find((t) => t.id === id)?.name ?? "—";

  if (!project.timetable)
    return (
      <div className="mx-auto max-w-xl p-10">
        <EmptyState title="Generate a timetable first" action={<Link className="font-semibold text-primary underline" href={`/project/${project.id}/timetable`}>Go to Timetable</Link>}>
          Substitutions use the timetable to find who is free.
        </EmptyState>
      </div>
    );

  const markAbsent = () => {
    const aff = affectedPeriods(project, teacher, date, whole ? undefined : periods);
    if (!aff.length) return toast({ tone: "info", text: `${tName(teacher)} has no lessons in those periods on ${DAY_NAMES[day] ?? "that day"}.` });
    update((p) => {
      for (const a of aff)
        if (!p.substitutions.some((s) => s.date === date && s.absentTeacherId === teacher && s.lessonId === a.lessonId && s.period === a.period))
          p.substitutions.push({ id: newId("sub"), date, absentTeacherId: teacher, lessonId: a.lessonId, period: a.period, substituteId: null });
    });
    toast({ tone: "ok", text: `${aff.length} period(s) need cover. Pick substitutes below.` });
  };

  const assign = (subId: string, substituteId: string | null) => update((p) => void (p.substitutions.find((s) => s.id === subId)!.substituteId = substituteId));

  const autoAssign = () =>
    update((p) => {
      for (const s of p.substitutions.filter((x) => x.date === date && !x.substituteId).sort((a, b) => a.period - b.period)) {
        const best = rankSubstitutes(p, date, s.period, s.lessonId)[0];
        if (best) s.substituteId = best.teacherId;
      }
    });

  const copyText = async () => {
    try {
      await navigator.clipboard.writeText(whatsappText(project, date));
      toast({ tone: "ok", text: "Copied — paste it into WhatsApp." });
    } catch {
      toast({ tone: "bad", text: "Couldn't copy. Select the text in the preview instead." });
    }
  };

  return (
    <div className="mx-auto grid max-w-7xl gap-6 px-4 py-6 lg:grid-cols-[minmax(0,1fr)_340px]">
      <div className="flex flex-col gap-4">
        <Card className="flex flex-col gap-3">
          <h2 className="text-xl font-bold">Mark a teacher absent</h2>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Date" hint={dayCfg ? DAY_NAMES[day] : "Not a school day"}>{(id) => <Input id={id} type="date" value={date} onChange={(e) => setDate(e.target.value || todayLocal())} />}</Field>
            <Field label="Absent teacher">
              {(id) => (
                <Select id={id} value={teacher} onChange={(e) => setTeacher(e.target.value)}>
                  {project.teachers.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
                </Select>
              )}
            </Field>
          </div>
          <fieldset className="flex flex-wrap items-center gap-3 text-sm">
            <legend className="sr-only">Absent for</legend>
            <label className="flex items-center gap-1">
              <input type="radio" checked={whole} onChange={() => setWhole(true)} /> Whole day
            </label>
            <label className="flex items-center gap-1">
              <input type="radio" checked={!whole} onChange={() => setWhole(false)} /> Only some periods:
            </label>
            {!whole &&
              Array.from({ length: dayCfg?.periods ?? 0 }, (_, q) => (
                <label key={q} className="flex items-center gap-0.5">
                  <input type="checkbox" checked={periods.includes(q)} onChange={(e) => setPeriods(e.target.checked ? [...periods, q] : periods.filter((x) => x !== q))} /> P{q + 1}
                </label>
              ))}
          </fieldset>
          <div>
            <Button variant="primary" disabled={!dayCfg || !teacher} onClick={markAbsent}>
              Find cover
            </Button>
          </div>
        </Card>

        <Card className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-xl font-bold">Cover for {date}</h2>
            <div className="flex flex-wrap gap-2">
              {todays.some((s) => !s.substituteId) && <Button onClick={autoAssign}>✨ Auto-assign best</Button>}
              <Link className="rounded-lg border border-line bg-surface px-3.5 py-2 text-sm font-medium hover:bg-surface-2" href={`/project/${project.id}/print?what=subs&date=${date}`} target="_blank">
                🖨️ Print sheet
              </Link>
              <Button onClick={copyText}>📋 Copy for WhatsApp</Button>
            </div>
          </div>
          {todays.length === 0 ? (
            <p className="text-sm text-muted">No absences recorded for this date.</p>
          ) : (
            <ul className="flex flex-col gap-2">
              {todays.map((s) => {
                const lesson = project.lessons.find((l) => l.id === s.lessonId);
                const label = `${lesson?.classIds.map((c) => project.classes.find((x) => x.id === c)?.name).join("+")} ${project.subjects.find((x) => x.id === lesson?.subjectId)?.name ?? ""}`;
                const cands = rankSubstitutes(project, date, s.period, s.lessonId).filter((c) => c.teacherId !== s.substituteId);
                return (
                  <li key={s.id} className={`flex flex-wrap items-center justify-between gap-2 rounded-lg border-l-4 bg-surface-2 p-2 text-sm ${s.substituteId ? "border-ok" : "border-warn"}`}>
                    <span>
                      <strong>P{s.period + 1}</strong> · {label} <span className="text-muted">(for {tName(s.absentTeacherId)})</span>
                    </span>
                    <span className="flex items-center gap-2">
                      <Select aria-label={`Substitute for P${s.period + 1}`} className="!w-56" value={s.substituteId ?? ""} onChange={(e) => assign(s.id, e.target.value || null)}>
                        <option value="">— choose substitute —</option>
                        {s.substituteId && <option value={s.substituteId}>{tName(s.substituteId)} (assigned)</option>}
                        {cands.map((c) => (
                          <option key={c.teacherId} value={c.teacherId}>
                            {c.sameSubject ? "★ " : ""}
                            {c.name} · {c.subsWeek} this week · {c.periodsToday} today
                          </option>
                        ))}
                      </Select>
                      {!cands.length && !s.substituteId && <Badge tone="bad">Nobody free</Badge>}
                      <button className="rounded p-1 hover:bg-surface" aria-label="Remove" onClick={() => update((p) => void (p.substitutions = p.substitutions.filter((x) => x.id !== s.id)))}>
                        🗑️
                      </button>
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
          <p className="text-xs text-muted">★ = teaches the same subject. Ranked by subject, then fewest substitutions this week / month, then fewest periods today.</p>
          {todays.length > 0 && <pre className="whitespace-pre-wrap rounded-lg bg-surface-2 p-3 text-xs">{whatsappText(project, date)}</pre>}
        </Card>
      </div>

      <aside className="flex flex-col gap-4">
        <Card className="flex flex-col gap-2">
          <h3 className="font-bold">Fairness</h3>
          <table className="w-full text-xs">
            <thead className="text-left text-muted">
              <tr>
                <th>Teacher</th>
                <th className="text-right">Week</th>
                <th className="text-right">Month</th>
                <th className="text-right">Total</th>
              </tr>
            </thead>
            <tbody className="tabular">
              {stats.map((s) => (
                <tr key={s.id} className="border-t border-line">
                  <td className="py-1">{s.name}</td>
                  <td className="text-right">{s.week}</td>
                  <td className="text-right">{s.month}</td>
                  <td className="text-right">{s.total}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
        <Card className="flex flex-col gap-2">
          <h3 className="font-bold">Log</h3>
          {project.substitutions.length === 0 ? (
            <p className="text-xs text-muted">Nothing yet.</p>
          ) : (
            <ul className="max-h-72 overflow-auto text-xs">
              {[...project.substitutions].sort((a, b) => b.date.localeCompare(a.date) || a.period - b.period).map((s) => (
                <li key={s.id} className="border-t border-line py-1">
                  <button className="text-left hover:underline" onClick={() => setDate(s.date)}>
                    {s.date} P{s.period + 1}: {tName(s.substituteId)} for {tName(s.absentTeacherId)}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </aside>
    </div>
  );
}
