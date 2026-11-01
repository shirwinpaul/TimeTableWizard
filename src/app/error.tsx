"use client";

import Link from "next/link";
import { EmptyState } from "@/components/ui";

/** Friendly error screen — raw errors are never shown. Your data is safe in this browser. */
export default function ErrorPage({ reset }: { error: Error; reset: () => void }) {
  return (
    <div className="mx-auto max-w-xl p-10">
      <EmptyState
        title="Something went wrong on this screen"
        action={
          <div className="flex gap-3">
            <button onClick={reset} className="rounded-lg bg-primary px-4 py-2 font-semibold text-primary-ink">
              Try again
            </button>
            <Link href="/start" className="rounded-lg border border-line px-4 py-2 font-semibold">
              My timetables
            </Link>
          </div>
        }
      >
        Your saved projects are safe in this browser. Try again, or go back to your timetables.
      </EmptyState>
    </div>
  );
}
