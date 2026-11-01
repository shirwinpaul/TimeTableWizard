import { ApiError, GoogleGenAI, ThinkingLevel } from "@google/genai";
import { AI_CONFIG } from "@/config/ai";

/** Provider adapters. They never log keys or user text. */

export interface ProviderRequest {
  system: string;
  user: string;
}

export type ProviderResult =
  | { ok: true; text: string }
  | { ok: false; status: number; errorType: "rate" | "quota" | "server" | "timeout" | "auth" | "network" | "bad_request"; retryAfterMs?: number };

export type Provider = (req: ProviderRequest) => Promise<ProviderResult>;

/** Seconds from a Gemini 429 body ("retryDelay": "12s") or a Retry-After header. */
export function parseRetryAfter(text: string | null | undefined): number | undefined {
  if (!text) return undefined;
  const m = text.match(/retryDelay\\?"?\s*:\s*\\?"?(\d+(?:\.\d+)?)s/) ?? text.match(/^\s*(\d+(?:\.\d+)?)\s*$/);
  return m ? Math.round(Number(m[1]) * 1000) : undefined;
}

const classify = (status: number, body: string): ProviderResult & { ok: false } => {
  if (status === 429) {
    // A per-day quota cannot be fixed by waiting a few seconds.
    const daily = /per.?day|PerDay|daily/i.test(body);
    return { ok: false, status, errorType: daily ? "quota" : "rate", retryAfterMs: parseRetryAfter(body) };
  }
  if (status === 401 || status === 403) return { ok: false, status, errorType: "auth" };
  if (status >= 500) return { ok: false, status, errorType: "server" };
  return { ok: false, status, errorType: "bad_request" };
};

export function geminiProvider(apiKey: string): Provider {
  const ai = new GoogleGenAI({ apiKey, httpOptions: { retryOptions: { attempts: 1 } } });
  return async ({ system, user }) => {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), AI_CONFIG.timeoutMs);
    try {
      const res = await ai.models.generateContent({
        model: AI_CONFIG.gemini.model,
        contents: user,
        config: {
          systemInstruction: system,
          responseMimeType: "application/json",
          maxOutputTokens: AI_CONFIG.maxOutputTokens,
          temperature: 0.2,
          thinkingConfig: { thinkingLevel: ThinkingLevel[AI_CONFIG.gemini.thinkingLevel] },
          abortSignal: ctrl.signal,
        },
      });
      return { ok: true, text: res.text ?? "" };
    } catch (e) {
      if (ctrl.signal.aborted) return { ok: false, status: 0, errorType: "timeout" };
      if (e instanceof ApiError) return classify(e.status, e.message);
      return { ok: false, status: 0, errorType: "network" };
    } finally {
      clearTimeout(timer);
    }
  };
}

export function groqProvider(apiKey: string, fetchImpl: typeof fetch = fetch): Provider {
  return async ({ system, user }) => {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), AI_CONFIG.timeoutMs);
    try {
      const r = await fetchImpl(AI_CONFIG.groq.baseUrl, {
        method: "POST",
        signal: ctrl.signal,
        headers: { "content-type": "application/json", authorization: `Bearer ${apiKey}` },
        body: JSON.stringify({
          model: AI_CONFIG.groq.model,
          temperature: 0.2,
          max_tokens: AI_CONFIG.maxOutputTokens,
          response_format: { type: "json_object" },
          messages: [
            { role: "system", content: system },
            { role: "user", content: user },
          ],
        }),
      });
      if (!r.ok) {
        const body = await r.text().catch(() => "");
        const res = classify(r.status, body);
        const ra = parseRetryAfter(r.headers.get("retry-after"));
        return ra ? { ...res, retryAfterMs: ra } : res;
      }
      const json = (await r.json()) as { choices?: { message?: { content?: string } }[] };
      return { ok: true, text: json.choices?.[0]?.message?.content ?? "" };
    } catch {
      return { ok: false, status: 0, errorType: ctrl.signal.aborted ? "timeout" : "network" };
    } finally {
      clearTimeout(timer);
    }
  };
}
