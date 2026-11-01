import type { z } from "zod";
import { AI_CONFIG } from "@/config/ai";
import type { AiError } from "./schemas";
import type { Provider, ProviderResult } from "./providers";

/**
 * One user action = one logical AI call, with:
 *  - Gemini 429 → wait `retry-after` (≤ ~10 s) and retry once, else go to Groq;
 *  - 5xx / timeout / network → Groq;
 *  - invalid JSON or schema mismatch → retry once with the error appended, then Groq.
 * Logs only provider, status, error type and retry-after — never keys or user data.
 */

export interface RunDeps {
  gemini: Provider | null;
  groq: Provider | null;
  sleep?: (ms: number) => Promise<void>;
  log?: (entry: Record<string, string | number | undefined>) => void;
}

export type RunResult<T> = { ok: true; data: T; provider: "gemini" | "groq" } | { ok: false; error: AiError };

const defaultSleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
const defaultLog = (e: Record<string, string | number | undefined>) => console.info(JSON.stringify({ ai: true, ...e }));

/** Pull the first JSON object out of a model reply (tolerates ```json fences). */
export function extractJson(text: string): unknown {
  const t = text.trim().replace(/^```(?:json)?\s*/i, "").replace(/```$/, "");
  try {
    return JSON.parse(t);
  } catch {
    const a = t.indexOf("{");
    const b = t.lastIndexOf("}");
    if (a >= 0 && b > a) return JSON.parse(t.slice(a, b + 1));
    throw new Error("No JSON object in reply");
  }
}

export async function runAi<S extends z.ZodTypeAny>(system: string, user: string, schema: S, deps: RunDeps): Promise<RunResult<z.infer<S>>> {
  const sleep = deps.sleep ?? defaultSleep;
  const log = deps.log ?? defaultLog;
  let lastRate: number | undefined;
  let sawRateOrQuota = false;

  const attempt = async (name: "gemini" | "groq", provider: Provider): Promise<RunResult<z.infer<S>> | "fallback"> => {
    let prompt = user;
    let rateRetried = false;
    for (let tries = 0; tries < 3; tries++) {
      const r: ProviderResult = await provider({ system, user: prompt });
      if (!r.ok) {
        log({ provider: name, status: r.status, errorType: r.errorType, retryAfterMs: r.retryAfterMs });
        if (r.errorType === "rate" || r.errorType === "quota") sawRateOrQuota = true;
        if (r.errorType === "rate") lastRate = r.retryAfterMs ?? lastRate;
        const wait = r.retryAfterMs ?? 0;
        if (name === "gemini" && r.errorType === "rate" && !rateRetried && wait <= AI_CONFIG.maxRetryAfterMs) {
          rateRetried = true;
          await sleep(wait);
          continue;
        }
        return "fallback";
      }
      let parsed: unknown;
      let problem = "";
      try {
        parsed = extractJson(r.text);
        const v = schema.safeParse(parsed);
        if (v.success) {
          log({ provider: name, status: 200, errorType: "none" });
          return { ok: true, data: v.data, provider: name };
        }
        problem = v.error.issues.slice(0, 3).map((i) => `${i.path.join(".") || "root"}: ${i.message}`).join("; ");
      } catch {
        problem = "reply was not valid JSON";
      }
      log({ provider: name, status: 200, errorType: "invalid_output" });
      if (prompt !== user) return "fallback"; // already retried once with the error
      prompt = `${user}\n\nYour previous reply was invalid (${problem}). Reply again with ONLY valid JSON matching the schema.`;
    }
    return "fallback";
  };

  for (const [name, p] of [
    ["gemini", deps.gemini],
    ["groq", deps.groq],
  ] as const) {
    if (!p) continue;
    const r = await attempt(name, p);
    if (r !== "fallback") return r;
  }
  if (sawRateOrQuota && lastRate !== undefined) return { ok: false, error: { kind: "rate", retryAfterSec: Math.ceil(lastRate / 1000) } };
  return { ok: false, error: { kind: "resting" } };
}
