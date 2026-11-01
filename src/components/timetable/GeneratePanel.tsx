"use client";

import { motion, useReducedMotion } from "framer-motion";
import { useEffect, useRef, useState } from "react";
import { useSolver } from "@/hooks/useSolver";
import type { Placement, Project } from "@/lib/model/schema";
import type { SolveResult } from "@/lib/solver";
import { Button, Card } from "../ui";

const CELLS = 48;

/** Solver controls + live progress with an animated grid that fills as lessons are placed. */
export function GeneratePanel({ project, locks, onResult, autoStart }: { project: Project; locks: Placement[]; onResult: (r: SolveResult, cancelled: boolean) => void; autoStart?: boolean }) {
  const { solve, cancel, running, progress, error } = useSolver();
  const [mode, setMode] = useState<"quick" | "best">("quick");
  const [limit, setLimit] = useState(20);
  const [seed, setSeed] = useState(() => (project.timetable?.seed ?? 0) + 1);
  const reduce = useReducedMotion();

  const run = async () => {
    const r = await solve(project, { mode, timeLimitMs: limit * 1000, seed, locks });
    if (r) {
      onResult(r.result, r.cancelled);
      setSeed((s) => s + 1);
    }
  };
  const auto = useRef(false);
  useEffect(() => {
    if (!autoStart || auto.current) return;
    // Mark as started only when the timer fires (React may mount effects twice in dev).
    const t = setTimeout(() => {
      auto.current = true;
      void run();
    }, 0);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoStart]);

  const filled = progress?.phase === "construct" ? Math.round((progress.placed / Math.max(1, progress.total)) * CELLS) : progress ? CELLS : 0;
  const status = !progress
    ? "Starting…"
    : progress.phase === "construct"
      ? `Placing lessons: ${progress.placed} of ${progress.total}`
      : `Improving quality: ${progress.percent}% · best score ${Math.round(progress.bestScore)}`;

  return (
    <Card className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end gap-4">
        <fieldset className="flex flex-col gap-1 text-sm">
          <legend className="mb-1 font-medium">Mode</legend>
          <div className="flex gap-1 rounded-lg bg-surface-2 p-1">
            {(["quick", "best"] as const).map((m) => (
              <button key={m} aria-pressed={mode === m} disabled={running} onClick={() => setMode(m)} className={`rounded-md px-3 py-1 ${mode === m ? "bg-surface font-semibold shadow-sm" : ""}`}>
                {m === "quick" ? "⚡ Quick" : "💎 Best quality"}
              </button>
            ))}
          </div>
        </fieldset>
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium">Time limit: {limit}s</span>
          <input type="range" min={5} max={120} step={5} value={limit} disabled={running} onChange={(e) => setLimit(Number(e.target.value))} />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium">Seed</span>
          <input type="number" className="tabular w-24 rounded border border-line bg-surface px-2 py-1" value={seed} disabled={running} onChange={(e) => setSeed(Math.max(0, Number(e.target.value) || 0))} />
        </label>
        <div className="ml-auto flex gap-2">
          {running ? (
            <Button variant="danger" onClick={cancel}>
              ■ Stop (keep best so far)
            </Button>
          ) : (
            <Button variant="primary" size="lg" onClick={run}>
              🧙 {locks.length ? `Re-solve around ${locks.length} locked` : "Generate"}
            </Button>
          )}
        </div>
      </div>
      {running && (
        <div className="flex flex-col gap-2">
          <div className="grid w-full max-w-md grid-cols-12 gap-1" aria-hidden>
            {Array.from({ length: CELLS }, (_, i) => (
              <motion.span
                key={i}
                className="h-4 rounded-sm"
                animate={{ backgroundColor: i < filled ? "var(--violet)" : "var(--surface-2)", scale: i < filled && !reduce ? [0.6, 1] : 1 }}
                transition={{ duration: reduce ? 0 : 0.25 }}
              />
            ))}
          </div>
          <p className="text-sm" aria-live="polite">
            {status} <span className="tabular text-muted">({Math.round((progress?.elapsedMs ?? 0) / 1000)}s)</span>
          </p>
        </div>
      )}
      {error && (
        <p className="text-sm text-bad" role="alert">
          {error}
        </p>
      )}
      <p className="text-xs text-muted">The same seed gives the same timetable. Try another seed for a different arrangement.</p>
    </Card>
  );
}
