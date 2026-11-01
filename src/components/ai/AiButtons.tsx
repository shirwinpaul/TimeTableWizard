"use client";

import { useEffect, useState } from "react";
import { useProject } from "@/hooks/useProject";
import { callAi } from "@/lib/ai/client";
import { redactTeachers, ruleRefs } from "@/lib/ai/guard";
import type { AiError, DescribeRuleOut, DraftOut, ExplainOut, SummariseOut } from "@/lib/ai/schemas";
import { SUBJECT_PALETTE, newId } from "@/lib/model/defaults";
import { applyFix } from "@/lib/model/fixes";
import { describeRule } from "@/lib/model/rules";
import type { CustomRuleParams } from "@/lib/model/schema";
import type { Problem } from "@/lib/solver/precheck";
import { scoreBreakdown } from "@/lib/solver/score";
import { validate } from "@/lib/solver/validator";
import { computeStats } from "@/lib/timetable/views";
import { useToast } from "../Toast";
import { Badge, Button, Dialog, Spinner } from "../ui";

const NOTE = "The assistant can make mistakes — every AI change is shown for you to check before it's applied.";

/** Friendly AI error with a live countdown for per-minute limits. */
function AiErrorView({ error }: { error: AiError }) {
  const [left, setLeft] = useState(error.kind === "rate" ? error.retryAfterSec : 0);
  useEffect(() => {
    if (error.kind !== "rate") return;
    const t = setInterval(() => setLeft((s) => Math.max(0, s - 1)), 1000);
    return () => clearInterval(t);
  }, [error]);
  const text =
    error.kind === "rate"
      ? left > 0
        ? `The assistant is busy. Try again in ${left}s.`
        : "You can try again now."
      : error.kind === "invalid"
        ? error.message
        : "The assistant is resting — you can still add rules with the rule builder.";
  return (
    <p role="status" aria-live="polite" className="rounded-lg bg-warn-soft p-2 text-sm text-warn">
      💤 {text}
    </p>
  );
}

function useAi<T>() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<AiError | null>(null);
  const [data, setData] = useState<T | null>(null);
  const run = async (action: Parameters<typeof callAi>[0], body: unknown) => {
    setBusy(true);
    setError(null);
    setData(null);
    const r = await callAi<T>(action, body);
    setBusy(false);
    if (r.ok) setData(r.data);
    else setError(r.error);
  };
  return { busy, error, data, run, reset: () => (setData(null), setError(null)) };
}

/* ---------- Describe a rule ---------- */
export function DescribeRuleButton({ onRule }: { onRule: (p: CustomRuleParams, hard: boolean, weight: number) => void }) {
  const { project } = useProject();
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const ai = useAi<DescribeRuleOut>();
  const ask = () => ai.run("describe-rule", { text: redactTeachers(text, project), refs: ruleRefs(project) });
  return (
    <>
      <Button size="sm" onClick={() => setOpen(true)}>✨ Describe a rule</Button>
      <Dialog open={open} onClose={() => setOpen(false)} title="Describe a rule">
        <div className="flex flex-col gap-3">
          <label className="flex flex-col gap-1 text-sm">
            In your own words (English or Tamil)
            <textarea className="min-h-20 rounded-lg border border-line bg-surface p-2" maxLength={300} value={text} onChange={(e) => setText(e.target.value)} placeholder="e.g. PE should never be right after lunch" />
            <span className="tabular self-end text-xs text-muted">{text.length}/300</span>
          </label>
          <p className="text-xs text-muted">Teacher names are replaced with their codes before sending. Only this sentence and your subject/class codes are sent.</p>
          <Button variant="primary" disabled={ai.busy || text.trim().length < 3} onClick={ask}>
            {ai.busy ? <Spinner label="Thinking…" /> : "Turn into a rule"}
          </Button>
          {ai.error && <AiErrorView error={ai.error} />}
          {ai.data && (
            <div className="flex flex-col gap-2 rounded-lg border border-line p-3" aria-live="polite">
              {ai.data.unknown.length > 0 && (
                <p className="text-sm text-bad">
                  ⚠️ Not found in your data: <strong>{ai.data.unknown.join(", ")}</strong>. Check the spelling, or add it first — nothing was guessed.
                </p>
              )}
              {ai.data.rule ? (
                <>
                  <p className="text-sm">
                    {describeRule(project, ai.data.rule)} {ai.data.hard ? <Badge tone="bad">Must</Badge> : <Badge tone="primary">Prefer · {ai.data.weight}</Badge>}
                  </p>
                  <Button
                    variant="primary"
                    onClick={() => {
                      onRule(ai.data!.rule!, ai.data!.hard, ai.data!.weight);
                      setOpen(false);
                      ai.reset();
                      setText("");
                    }}
                  >
                    Review in the rule builder
                  </Button>
                </>
              ) : (
                !ai.data.unknown.length && <p className="text-sm text-muted">{ai.data.note || "I couldn't turn that into a rule. Try the rule builder."}</p>
              )}
            </div>
          )}
          <p className="text-xs text-muted">{NOTE}</p>
        </div>
      </Dialog>
    </>
  );
}

/* ---------- Explain these conflicts ---------- */
export function ExplainConflictsButton({ problems }: { problems: Problem[] }) {
  const { project, replace, undo } = useProject();
  const toast = useToast();
  const ai = useAi<ExplainOut>();
  const sent = problems.filter((p) => p.severity === "error").slice(0, 20);
  const ask = () =>
    ai.run("explain", {
      problems: sent.map((p) => ({
        code: p.code,
        data: p.data,
        fixes: p.fixes.slice(0, 4).map((f) => ({ type: f.action?.type ?? "manual", value: f.action && "value" in f.action ? f.action.value : undefined })),
      })),
    });
  return (
    <div className="flex flex-col gap-2 rounded-lg border border-violet bg-violet-soft p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-medium">Want this explained in plain words?</p>
        <Button size="sm" disabled={ai.busy} onClick={ask}>
          {ai.busy ? <Spinner label="Thinking…" /> : "✨ Explain these conflicts"}
        </Button>
      </div>
      {ai.error && <AiErrorView error={ai.error} />}
      {ai.data && (
        <div className="flex flex-col gap-2 text-sm" aria-live="polite">
          <p className="whitespace-pre-line">{ai.data.explanation}</p>
          <ul className="flex flex-col gap-1">
            {ai.data.ranked.map((r, i) => {
              const fix = sent[r.problem]?.fixes[r.fix];
              if (!fix) return null;
              return (
                <li key={i} className="flex flex-wrap items-center gap-2">
                  <span>
                    {i + 1}. {fix.label} <span className="text-muted">— {r.why}</span>
                  </span>
                  {fix.action && (
                    <Button
                      size="sm"
                      onClick={() => {
                        replace(applyFix(project, fix.action!));
                        toast({ tone: "ok", text: `Applied: ${fix.label}`, action: { label: "Undo", run: undo } });
                      }}
                    >
                      Apply
                    </Button>
                  )}
                </li>
              );
            })}
          </ul>
          <p className="text-xs text-muted">{NOTE}</p>
        </div>
      )}
    </div>
  );
}

/* ---------- Draft my setup ---------- */
export function DraftSetupButton() {
  const { project, update, undo } = useProject();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const ai = useAi<DraftOut>();
  const apply = () => {
    const d = ai.data!;
    update((p) => {
      p.type = d.type;
      p.calendar.days = d.days;
      for (const c of d.classes) if (!p.classes.some((x) => x.name.toLowerCase() === c.name.toLowerCase())) p.classes.push({ id: newId("cls"), name: c.name, strength: c.strength, homeroomId: null, classTeacherId: null, unavailable: [] });
      d.subjects.forEach((s, i) => {
        if (!p.subjects.some((x) => x.code.toLowerCase() === s.code.toLowerCase()))
          p.subjects.push({ id: newId("sub"), ...s, code: s.code.toUpperCase().slice(0, 8), color: SUBJECT_PALETTE[(p.subjects.length + i) % SUBJECT_PALETTE.length], roomType: null });
      });
    });
    toast({ tone: "ok", text: "Draft applied — check steps 1–4.", action: { label: "Undo", run: undo } });
    setOpen(false);
    ai.reset();
  };
  return (
    <>
      <Button size="sm" onClick={() => setOpen(true)}>✨ Draft my setup</Button>
      <Dialog open={open} onClose={() => setOpen(false)} title="Draft my setup" wide>
        <div className="flex flex-col gap-3">
          <label className="flex flex-col gap-1 text-sm">
            Describe your school (no personal details needed)
            <textarea className="min-h-24 rounded-lg border border-line bg-surface p-2" maxLength={600} value={text} onChange={(e) => setText(e.target.value)} placeholder="e.g. Classes 6th to 10th, two sections each, 8 periods a day, Monday to Saturday" />
          </label>
          <Button variant="primary" disabled={ai.busy || text.trim().length < 10} onClick={() => ai.run("draft-setup", { text })}>
            {ai.busy ? <Spinner label="Drafting…" /> : "Draft it"}
          </Button>
          {ai.error && <AiErrorView error={ai.error} />}
          {ai.data && (
            <div className="flex flex-col gap-2 rounded-lg border border-line p-3 text-sm" aria-live="polite">
              <p>
                <strong>{ai.data.type}</strong> · {ai.data.days.length} days ({ai.data.days.map((d) => d.periods).join("/")} periods)
              </p>
              <p>
                <strong>{ai.data.classes.length} classes:</strong> {ai.data.classes.map((c) => c.name).join(", ")}
              </p>
              <p>
                <strong>{ai.data.subjects.length} subjects:</strong> {ai.data.subjects.map((s) => `${s.name} (${s.code})`).join(", ")}
              </p>
              <p className="text-xs text-muted">Existing classes and subjects with the same name/code are kept. Working days will be replaced.</p>
              <Button variant="primary" onClick={apply}>
                Add to my project
              </Button>
            </div>
          )}
          <p className="text-xs text-muted">{NOTE} {project.classes.length > 0 && "Your current data stays; only new items are added."}</p>
        </div>
      </Dialog>
    </>
  );
}

/* ---------- Summarise this timetable ---------- */
export function SummariseButton() {
  const { project } = useProject();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const ai = useAi<SummariseOut>();
  const ask = () => {
    const tt = project.timetable;
    if (!tt) return;
    const s = computeStats(project, tt.placements);
    ai.run("summarise", {
      stats: {
        classes: project.classes.length,
        teachers: project.teachers.length,
        days: project.calendar.days.length,
        score: scoreBreakdown(project, tt).total,
        clashFree: validate(project, tt).ok,
        teacherLoads: s.teachers.map((t) => ({ code: project.teachers.find((x) => x.id === t.id)?.code ?? "?", week: t.total, max: t.maxPerWeek, gaps: t.gaps })),
        roomUse: s.rooms.map((r) => ({ type: r.label, percent: Math.round((r.used / Math.max(1, r.capacity)) * 100) })),
      },
    });
  };
  return (
    <>
      <Button onClick={() => (setOpen(true), ask())}>✨ Summarise</Button>
      <Dialog open={open} onClose={() => setOpen(false)} title="Timetable summary">
        <div className="flex flex-col gap-3">
          {ai.busy && <Spinner label="Writing…" />}
          {ai.error && <AiErrorView error={ai.error} />}
          {ai.data && (
            <>
              <p className="whitespace-pre-line text-sm" aria-live="polite">{ai.data.summary}</p>
              <Button
                onClick={() =>
                  navigator.clipboard.writeText(ai.data!.summary).then(
                    () => toast({ tone: "ok", text: "Copied." }),
                    () => toast({ tone: "bad", text: "Couldn't copy." }),
                  )
                }
              >
                📋 Copy
              </Button>
            </>
          )}
          <p className="text-xs text-muted">Built from statistics computed in the app (teacher codes, loads, lab use) — no names are sent. {NOTE}</p>
        </div>
      </Dialog>
    </>
  );
}
