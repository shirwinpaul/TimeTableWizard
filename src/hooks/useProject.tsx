"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { Project } from "@/lib/model/schema";
import { saveProject } from "@/lib/storage";

/**
 * Project state with undo/redo and debounced autosave to IndexedDB.
 * `update` takes a recipe that mutates a structured clone of the current project.
 */

type SaveState = "saved" | "saving" | "error";

interface ProjectApi {
  project: Project;
  update: (recipe: (draft: Project) => void, opts?: { history?: boolean }) => void;
  replace: (p: Project) => void;
  undo: () => void;
  redo: () => void;
  canUndo: boolean;
  canRedo: boolean;
  saveState: SaveState;
}

const Ctx = createContext<ProjectApi | null>(null);
const LIMIT = 60;

export function ProjectProvider({ initial, children }: { initial: Project; children: ReactNode }) {
  const [hist, setHist] = useState<{ past: Project[]; present: Project; future: Project[] }>({ past: [], present: initial, future: [] });
  const [saveState, setSaveState] = useState<SaveState>("saved");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const first = useRef(true);

  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    setSaveState("saving");
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      saveProject(hist.present).then(
        () => setSaveState("saved"),
        () => setSaveState("error"),
      );
    }, 400);
  }, [hist.present]);

  const update = useCallback((recipe: (d: Project) => void, opts: { history?: boolean } = {}) => {
    setHist((h) => {
      const draft = structuredClone(h.present);
      recipe(draft);
      draft.updatedAt = new Date().toISOString();
      if (opts.history === false) return { ...h, present: draft };
      return { past: [...h.past.slice(-LIMIT), h.present], present: draft, future: [] };
    });
  }, []);
  const replace = useCallback((p: Project) => setHist((h) => ({ past: [...h.past.slice(-LIMIT), h.present], present: p, future: [] })), []);
  const undo = useCallback(
    () => setHist((h) => (h.past.length ? { past: h.past.slice(0, -1), present: h.past[h.past.length - 1], future: [h.present, ...h.future] } : h)),
    [],
  );
  const redo = useCallback(
    () => setHist((h) => (h.future.length ? { past: [...h.past, h.present], present: h.future[0], future: h.future.slice(1) } : h)),
    [],
  );

  // Ctrl/Cmd+Z = undo, Ctrl+Y or Ctrl+Shift+Z = redo (not while typing in a field).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT" || t.isContentEditable)) return;
      if (!(e.ctrlKey || e.metaKey)) return;
      const k = e.key.toLowerCase();
      if (k === "z" && !e.shiftKey) {
        e.preventDefault();
        undo();
      } else if (k === "y" || (k === "z" && e.shiftKey)) {
        e.preventDefault();
        redo();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [undo, redo]);

  const api = useMemo<ProjectApi>(
    () => ({ project: hist.present, update, replace, undo, redo, canUndo: hist.past.length > 0, canRedo: hist.future.length > 0, saveState }),
    [hist, update, replace, undo, redo, saveState],
  );
  return <Ctx.Provider value={api}>{children}</Ctx.Provider>;
}

export function useProject(): ProjectApi {
  const v = useContext(Ctx);
  if (!v) throw new Error("useProject must be used inside ProjectProvider");
  return v;
}
