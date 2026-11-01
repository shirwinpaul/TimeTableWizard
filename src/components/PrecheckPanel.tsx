"use client";

import type { ReactNode } from "react";
import { useProject } from "@/hooks/useProject";
import { applyFix, type Fix } from "@/lib/model/fixes";
import type { Problem } from "@/lib/solver/precheck";
import { useToast } from "./Toast";
import { Badge, Button } from "./ui";

/** Lists pre-check problems with suggested fixes; one-tap fixes are undoable. */
export function ProblemList({ problems, extra }: { problems: Problem[]; extra?: ReactNode }) {
  const { project, replace, undo } = useProject();
  const toast = useToast();
  const apply = (f: Fix) => {
    if (!f.action) return;
    replace(applyFix(project, f.action));
    toast({ tone: "ok", text: `Applied: ${f.label}`, action: { label: "Undo", run: undo } });
  };
  if (!problems.length) return null;
  return (
    <div className="flex flex-col gap-2" aria-live="polite">
      {extra}
      <ul className="flex flex-col gap-2">
        {problems.map((p, i) => (
          <li key={i} className={`rounded-lg border-l-4 bg-surface p-3 shadow-sm ${p.severity === "error" ? "border-bad" : "border-warn"}`}>
            <div className="flex items-start gap-2">
              <Badge tone={p.severity === "error" ? "bad" : "warn"}>{p.severity === "error" ? "Must fix" : "Check"}</Badge>
              <p className="text-sm">{p.message}</p>
            </div>
            {p.fixes.length > 0 && (
              <ul className="mt-2 flex flex-col gap-1 pl-2">
                {p.fixes.map((f, j) => (
                  <li key={j} className="flex flex-wrap items-center gap-2 text-sm text-muted">
                    <span>💡 {f.label}</span>
                    {f.action && (
                      <Button size="sm" variant="secondary" onClick={() => apply(f)}>
                        Apply
                      </Button>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
