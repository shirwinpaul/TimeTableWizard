import { BYOK_HEADER, BYOK_STORAGE_KEY } from "@/config/ai";
import type { AiError } from "./schemas";

/** Browser → our /api/ai route (the browser never talks to AI providers directly). */
export async function callAi<T>(action: "describe-rule" | "explain" | "draft-setup" | "summarise", body: unknown): Promise<{ ok: true; data: T; provider: string } | { ok: false; error: AiError }> {
  const headers: Record<string, string> = { "content-type": "application/json" };
  try {
    const key = localStorage.getItem(BYOK_STORAGE_KEY);
    if (key) headers[BYOK_HEADER] = key;
  } catch {}
  try {
    const r = await fetch(`/api/ai/${action}`, { method: "POST", headers, body: JSON.stringify(body) });
    const json = await r.json().catch(() => null);
    if (json && typeof json === "object" && "ok" in json) return json;
    return { ok: false, error: { kind: "resting" } };
  } catch {
    return { ok: false, error: { kind: "resting" } };
  }
}
