"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { StepBasics, StepClasses, StepPeriods, StepRooms, StepSubjects, StepTeachers } from "@/components/setup/BasicSteps";
import { StepLessons } from "@/components/setup/StepLessons";
import { StepReview } from "@/components/setup/StepReview";
import { StepRules } from "@/components/setup/StepRules";
import { DescribeRuleButton, ExplainConflictsButton, DraftSetupButton } from "@/components/ai/AiButtons";
import { Button, Spinner } from "@/components/ui";
import { useProject } from "@/hooks/useProject";

const STEPS = ["School & calendar", "Periods & breaks", "Classes", "Subjects", "Teachers", "Rooms", "Lessons", "Rules", "Review & pre-check"];

export default function SetupPage() {
  return (
    <Suspense fallback={<div className="p-8"><Spinner /></div>}>
      <Wizard />
    </Suspense>
  );
}

function Wizard() {
  const params = useSearchParams();
  const router = useRouter();
  const { project } = useProject();
  const step = Math.min(9, Math.max(1, Number(params.get("step")) || 1));
  const go = (s: number) => router.push(`/project/${project.id}/setup?step=${s}`, { scroll: true });

  return (
    <div className="mx-auto max-w-7xl px-4 py-6">
      <nav aria-label="Setup steps" className="mb-6">
        <div className="mb-2 h-2 overflow-hidden rounded-full bg-surface-2" role="progressbar" aria-valuemin={1} aria-valuemax={9} aria-valuenow={step} aria-label="Setup progress">
          <div className="h-full rounded-full bg-gradient-to-r from-primary to-violet transition-all" style={{ width: `${(step / 9) * 100}%` }} />
        </div>
        <ol className="flex flex-wrap gap-1 text-xs">
          {STEPS.map((s, i) => (
            <li key={s}>
              <button onClick={() => go(i + 1)} aria-current={step === i + 1 ? "step" : undefined} className={`rounded-full px-2.5 py-1 ${step === i + 1 ? "bg-primary text-primary-ink" : i + 1 < step ? "bg-violet-soft text-violet" : "text-muted hover:bg-surface-2"}`}>
                {i + 1}. {s}
              </button>
            </li>
          ))}
        </ol>
      </nav>

      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-2xl font-bold">
          Step {step}: {STEPS[step - 1]}
        </h2>
        {step === 1 && <DraftSetupButton />}
      </div>
      <p className="mb-4 text-xs text-muted md:hidden">💡 Editing works best on a larger screen.</p>

      {step === 1 && <StepBasics />}
      {step === 2 && <StepPeriods />}
      {step === 3 && <StepClasses />}
      {step === 4 && <StepSubjects />}
      {step === 5 && <StepTeachers />}
      {step === 6 && <StepRooms />}
      {step === 7 && <StepLessons />}
      {step === 8 && <StepRules aiSlot={(load) => <DescribeRuleButton onRule={load} />} />}
      {step === 9 && <StepReview aiSlot={(problems) => <ExplainConflictsButton problems={problems} />} />}

      <div className="mt-8 flex justify-between border-t border-line pt-4">
        <Button onClick={() => go(step - 1)} disabled={step === 1}>
          ← Back
        </Button>
        {step < 9 && (
          <Button variant="primary" onClick={() => go(step + 1)}>
            Next →
          </Button>
        )}
      </div>
    </div>
  );
}
