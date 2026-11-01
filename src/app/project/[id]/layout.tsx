"use client";

import Link from "next/link";
import { useParams, usePathname } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { ProjectProvider, useProject } from "@/hooks/useProject";
import type { Project } from "@/lib/model/schema";
import { loadProject } from "@/lib/storage";
import { EmptyState, Spinner } from "@/components/ui";

export default function ProjectLayout({ children }: { children: ReactNode }) {
  const { id } = useParams<{ id: string }>();
  const [state, setState] = useState<{ status: "loading" } | { status: "missing" } | { status: "ready"; project: Project }>({ status: "loading" });
  useEffect(() => {
    let alive = true;
    loadProject(id).then(
      (p) => alive && setState(p ? { status: "ready", project: p } : { status: "missing" }),
      () => alive && setState({ status: "missing" }),
    );
    return () => {
      alive = false;
    };
  }, [id]);

  if (state.status === "loading")
    return (
      <div className="p-10">
        <Spinner label="Opening project…" />
      </div>
    );
  if (state.status === "missing")
    return (
      <div className="mx-auto max-w-xl p-10">
        <EmptyState title="Project not found" action={<Link className="font-semibold text-primary underline" href="/start">Go to my timetables</Link>}>
          It may have been deleted, or it was saved in a different browser. Projects are stored only in the browser where you made them.
        </EmptyState>
      </div>
    );
  return (
    <ProjectProvider key={state.project.id} initial={state.project}>
      <ProjectNav />
      {children}
    </ProjectProvider>
  );
}

const TABS = [
  { href: "setup", label: "Setup" },
  { href: "timetable", label: "Timetable" },
  { href: "substitutions", label: "Substitutions" },
  { href: "import", label: "Import / Export" },
];

function ProjectNav() {
  const { project, saveState, undo, redo, canUndo, canRedo } = useProject();
  const path = usePathname();
  return (
    <div className="no-print border-b border-line bg-surface">
      <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-2 px-4 py-2">
        <div className="flex min-w-0 items-center gap-3">
          <h1 className="truncate text-base font-bold">{project.name}</h1>
          <span className="text-xs text-muted" aria-live="polite">
            {saveState === "saving" ? "Saving…" : saveState === "error" ? "⚠️ Not saved" : "✓ Saved"}
          </span>
        </div>
        <nav className="flex flex-wrap items-center gap-1" aria-label="Project">
          {TABS.map((t) => {
            const href = `/project/${project.id}/${t.href}`;
            const active = path?.startsWith(href);
            return (
              <Link key={t.href} href={href} aria-current={active ? "page" : undefined} className={`rounded-lg px-3 py-1.5 text-sm font-medium ${active ? "bg-violet-soft text-violet" : "hover:bg-surface-2"}`}>
                {t.label}
              </Link>
            );
          })}
          <span className="mx-1 h-5 w-px bg-line" aria-hidden />
          <button onClick={undo} disabled={!canUndo} className="rounded p-1.5 text-sm disabled:opacity-40 hover:bg-surface-2" aria-label="Undo (Ctrl+Z)" title="Undo (Ctrl+Z)">
            ↶
          </button>
          <button onClick={redo} disabled={!canRedo} className="rounded p-1.5 text-sm disabled:opacity-40 hover:bg-surface-2" aria-label="Redo (Ctrl+Y)" title="Redo (Ctrl+Y)">
            ↷
          </button>
        </nav>
      </div>
    </div>
  );
}
