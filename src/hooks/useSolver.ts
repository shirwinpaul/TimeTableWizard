"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Project } from "@/lib/model/schema";
import type { SolveOptions, SolveProgress, SolveResult } from "@/lib/solver";
import type { WorkerRequest, WorkerResponse } from "@/lib/solver/worker";

/** Runs the solver in a Web Worker so the page never freezes. */
export function useSolver() {
  const workerRef = useRef<Worker | null>(null);
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState<SolveProgress | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => () => workerRef.current?.terminate(), []);

  const solve = useCallback((project: Project, options: SolveOptions): Promise<{ result: SolveResult; cancelled: boolean } | null> => {
    workerRef.current?.terminate();
    const w = new Worker(new URL("../lib/solver/worker.ts", import.meta.url), { type: "module" });
    workerRef.current = w;
    setRunning(true);
    setProgress(null);
    setError(null);
    return new Promise((resolve) => {
      const done = (v: { result: SolveResult; cancelled: boolean } | null) => {
        setRunning(false);
        w.terminate();
        if (workerRef.current === w) workerRef.current = null;
        resolve(v);
      };
      w.onmessage = (e: MessageEvent<WorkerResponse>) => {
        const m = e.data;
        if (m.type === "progress") setProgress(m.progress);
        else if (m.type === "result") done({ result: m.result, cancelled: m.cancelled });
        else {
          setError("The solver hit a problem. Please check your data and try again.");
          done(null);
        }
      };
      w.onerror = () => {
        setError("The solver could not start in this browser.");
        done(null);
      };
      w.postMessage({ type: "solve", project, options } satisfies WorkerRequest);
    });
  }, []);

  const cancel = useCallback(() => {
    workerRef.current?.postMessage({ type: "cancel" } satisfies WorkerRequest);
  }, []);

  return { solve, cancel, running, progress, error };
}
