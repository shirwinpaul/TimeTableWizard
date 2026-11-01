/// <reference lib="webworker" />
import type { Project } from "@/lib/model/schema";
import { solveSteps, type SolveOptions, type SolveProgress, type SolveResult } from "./index";

/**
 * Web Worker wrapper: runs the solver off the main thread, posts progress about every
 * 100 ms and yields to the event loop so a "cancel" message can arrive. Cancelling makes
 * the solver's clock jump past its deadline, so it stops cleanly with its best result.
 */

export type WorkerRequest = { type: "solve"; project: Project; options: SolveOptions } | { type: "cancel" };
export type WorkerResponse =
  | { type: "progress"; progress: SolveProgress }
  | { type: "result"; result: SolveResult; cancelled: boolean }
  | { type: "error"; message: string };

const ctx = self as unknown as DedicatedWorkerGlobalScope;
let cancelled = false;

ctx.onmessage = async (e: MessageEvent<WorkerRequest>) => {
  const msg = e.data;
  if (msg.type === "cancel") {
    cancelled = true;
    return;
  }
  cancelled = false;
  const started = Date.now();
  try {
    const gen = solveSteps(msg.project, msg.options, () => (cancelled ? Number.MAX_SAFE_INTEGER / 2 : Date.now()));
    let last = Date.now();
    let s = gen.next();
    while (!s.done) {
      if (Date.now() - last > 100) {
        ctx.postMessage({ type: "progress", progress: { ...s.value, elapsedMs: Date.now() - started } } satisfies WorkerResponse);
        await new Promise((r) => setTimeout(r, 0));
        last = Date.now();
      }
      s = gen.next();
    }
    const result = s.value;
    result.solveMs = Date.now() - started;
    if (result.timetable) result.timetable.solveMs = result.solveMs;
    ctx.postMessage({ type: "result", result, cancelled } satisfies WorkerResponse);
  } catch (err) {
    ctx.postMessage({ type: "error", message: err instanceof Error ? err.message : "Solver failed" } satisfies WorkerResponse);
  }
};
