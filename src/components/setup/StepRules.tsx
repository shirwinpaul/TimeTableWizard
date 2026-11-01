"use client";

import { useState, type ReactNode } from "react";
import { useProject } from "@/hooks/useProject";
import { newId } from "@/lib/model/defaults";
import { RULE_KIND_LABELS, defaultParams, describeRule } from "@/lib/model/rules";
import { DAY_SHORT, type CustomRuleParams, type Project } from "@/lib/model/schema";
import { Badge, Button, Card, Select } from "../ui";

/** Step 8: built-in soft rules (weights) + custom rule builder (no AI needed). */
export function StepRules({ aiSlot }: { aiSlot?: (load: (params: CustomRuleParams, hard: boolean, weight: number) => void) => ReactNode }) {
  const { project, update } = useProject();
  const [draft, setDraft] = useState<{ params: CustomRuleParams; hard: boolean; weight: number } | null>(null);
  const soft = project.rules.filter((r) => r.soft);
  const custom = project.rules.filter((r) => r.custom);

  const save = () => {
    if (!draft) return;
    update((p) =>
      void p.rules.push({ id: newId("rule"), label: describeRule(p, draft.params), enabled: true, hard: draft.hard, weight: draft.weight, soft: null, custom: draft.params }),
    );
    setDraft(null);
  };

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <Card className="flex flex-col gap-3">
        <h3 className="font-bold">Quality preferences (soft rules)</h3>
        <p className="text-sm text-muted">These never block a timetable; higher weight = more important.</p>
        {soft.map((r) => (
          <div key={r.id} className="flex flex-col gap-1 border-t border-line pt-2">
            <label className="flex items-center gap-2 text-sm font-medium">
              <input type="checkbox" checked={r.enabled} onChange={(e) => update((p) => void (p.rules.find((x) => x.id === r.id)!.enabled = e.target.checked))} />
              {r.label}
            </label>
            <label className="flex items-center gap-2 pl-6 text-xs text-muted">
              Weight
              <input type="range" min={1} max={10} value={r.weight} disabled={!r.enabled} aria-label={`Weight for ${r.label}`}
                onChange={(e) => update((p) => void (p.rules.find((x) => x.id === r.id)!.weight = Number(e.target.value)), { history: false })} />
              <span className="tabular w-4">{r.weight}</span>
            </label>
          </div>
        ))}
      </Card>

      <div className="flex flex-col gap-4">
        <Card className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="font-bold">Your rules</h3>
            <div className="flex gap-2">
              {aiSlot?.((params, hard, weight) => setDraft({ params, hard: hard || params.kind === "maxPerDay", weight }))}
              <Button variant="primary" size="sm" onClick={() => setDraft({ params: defaultParams("subjectPeriods", project), hard: false, weight: 5 })}>
                + Add rule
              </Button>
            </div>
          </div>
          {custom.length === 0 && <p className="text-sm text-muted">No custom rules yet. Example: “Maths for all classes only in periods 1–4”.</p>}
          <ul className="flex flex-col gap-2">
            {custom.map((r) => (
              <li key={r.id} className="flex items-start justify-between gap-2 rounded-lg border border-line p-2 text-sm">
                <label className="flex items-start gap-2">
                  <input type="checkbox" className="mt-1" checked={r.enabled} onChange={(e) => update((p) => void (p.rules.find((x) => x.id === r.id)!.enabled = e.target.checked))} />
                  <span>
                    {r.label}{" "}
                    {r.hard ? <Badge tone="bad">Must</Badge> : <Badge tone="primary">Prefer · {r.weight}</Badge>}
                  </span>
                </label>
                <button className="rounded p-1 hover:bg-surface-2" aria-label={`Delete rule ${r.label}`} onClick={() => update((p) => void (p.rules = p.rules.filter((x) => x.id !== r.id)))}>
                  🗑️
                </button>
              </li>
            ))}
          </ul>
        </Card>
        {draft && <RuleForm project={project} draft={draft} setDraft={setDraft} onSave={save} onCancel={() => setDraft(null)} />}
      </div>
    </div>
  );
}

type Draft = { params: CustomRuleParams; hard: boolean; weight: number };

function RuleForm({ project, draft, setDraft, onSave, onCancel }: { project: Project; draft: Draft; setDraft: (d: Draft) => void; onSave: () => void; onCancel: () => void }) {
  const p = draft.params;
  const set = (patch: Partial<CustomRuleParams>) => setDraft({ ...draft, params: { ...p, ...patch } as CustomRuleParams });
  const maxP = Math.max(...project.calendar.days.map((d) => d.periods));
  const periodSel = (key: "fromPeriod" | "toPeriod", label: string) =>
    "fromPeriod" in p && (
      <label className="flex flex-col gap-1 text-sm">
        {label}
        <Select value={p[key]} onChange={(e) => set({ [key]: Number(e.target.value) } as Partial<CustomRuleParams>)}>
          {Array.from({ length: maxP }, (_, i) => (
            <option key={i} value={i}>
              P{i + 1}
            </option>
          ))}
        </Select>
      </label>
    );
  const chips = (label: string, options: { value: string; label: string }[], value: string[], onChange: (v: string[]) => void, emptyLabel: string) => (
    <fieldset className="flex flex-col gap-1 text-sm">
      <legend className="mb-1">{label}</legend>
      <div className="flex flex-wrap gap-1">
        <button className={`rounded-full border px-2 py-0.5 text-xs ${!value.length ? "border-primary bg-violet-soft" : "border-line"}`} onClick={() => onChange([])} aria-pressed={!value.length}>
          {emptyLabel}
        </button>
        {options.map((o) => {
          const on = value.includes(o.value);
          return (
            <button key={o.value} aria-pressed={on} className={`rounded-full border px-2 py-0.5 text-xs ${on ? "border-primary bg-violet-soft" : "border-line"}`} onClick={() => onChange(on ? value.filter((x) => x !== o.value) : [...value, o.value])}>
              {o.label}
            </button>
          );
        })}
      </div>
    </fieldset>
  );
  const dayOpts = project.calendar.days.map((d) => ({ value: String(d.day), label: DAY_SHORT[d.day] }));
  const classOpts = project.classes.map((c) => ({ value: c.id, label: c.name }));

  return (
    <Card className="flex flex-col gap-3 border-primary">
      <h3 className="font-bold">New rule</h3>
      <label className="flex flex-col gap-1 text-sm">
        Rule type
        <Select value={p.kind} onChange={(e) => setDraft({ ...draft, params: defaultParams(e.target.value as CustomRuleParams["kind"], project), hard: e.target.value === "maxPerDay" ? true : draft.hard })}>
          {Object.entries(RULE_KIND_LABELS).map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
        </Select>
      </label>
      {"subjectId" in p && (
        <label className="flex flex-col gap-1 text-sm">
          Subject
          <Select value={p.subjectId ?? ""} onChange={(e) => set({ subjectId: e.target.value || null })}>
            <option value="">Any subject</option>
            {project.subjects.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </Select>
        </label>
      )}
      {p.kind === "teacherUnavailable" && (
        <label className="flex flex-col gap-1 text-sm">
          Teacher
          <Select value={p.teacherId} onChange={(e) => set({ teacherId: e.target.value })}>
            {project.teachers.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </Select>
        </label>
      )}
      {"classIds" in p && chips("Classes", classOpts, p.classIds, (v) => set({ classIds: v }), "All classes")}
      {"days" in p && chips("Days", dayOpts, p.days.map(String), (v) => set({ days: v.map(Number) }), p.kind === "subjectPeriods" ? "Every day" : "Pick days")}
      {"fromPeriod" in p && (
        <div className="grid grid-cols-2 gap-2">
          {periodSel("fromPeriod", "From")}
          {periodSel("toPeriod", "To")}
        </div>
      )}
      {p.kind === "notAfterBreak" && (
        <label className="flex flex-col gap-1 text-sm">
          After
          <Select value={p.breakKind} onChange={(e) => set({ breakKind: e.target.value as "lunch" | "short" | "any" })}>
            <option value="lunch">Lunch</option>
            <option value="short">Short break</option>
            <option value="any">Any break</option>
          </Select>
        </label>
      )}
      {p.kind === "maxPerDay" && (
        <label className="flex flex-col gap-1 text-sm">
          Max per day
          <input type="number" min={1} max={8} className="tabular w-20 rounded border border-line bg-surface px-2 py-1" value={p.max} onChange={(e) => set({ max: Math.max(1, Math.min(8, Number(e.target.value) || 1)) })} />
        </label>
      )}
      <fieldset className="flex flex-wrap items-center gap-4 text-sm">
        <legend className="sr-only">Strength</legend>
        <label className="flex items-center gap-1">
          <input type="radio" checked={draft.hard} onChange={() => setDraft({ ...draft, hard: true })} /> Must (hard)
        </label>
        <label className={`flex items-center gap-1 ${p.kind === "maxPerDay" ? "opacity-50" : ""}`}>
          <input type="radio" disabled={p.kind === "maxPerDay"} checked={!draft.hard} onChange={() => setDraft({ ...draft, hard: false })} /> Prefer (soft)
        </label>
        {!draft.hard && (
          <label className="flex items-center gap-2">
            Weight
            <input type="range" min={1} max={10} value={draft.weight} onChange={(e) => setDraft({ ...draft, weight: Number(e.target.value) })} />
            <span className="tabular">{draft.weight}</span>
          </label>
        )}
      </fieldset>
      <p className="rounded-lg bg-surface-2 p-2 text-sm">
        <span className="text-muted">Preview: </span>
        {describeRule(project, p)}
      </p>
      {p.kind === "teacherUnavailable" && !p.days.length && <p className="text-sm text-bad">Pick at least one day.</p>}
      <div className="flex justify-end gap-2">
        <Button variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
        <Button variant="primary" onClick={onSave} disabled={("days" in p && p.kind !== "subjectPeriods" && !p.days.length) || (p.kind === "teacherUnavailable" && !p.teacherId)}>
          Save rule
        </Button>
      </div>
    </Card>
  );
}
