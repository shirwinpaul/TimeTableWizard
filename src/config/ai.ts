/**
 * ALL AI provider settings live here. Model IDs checked against the official docs
 * (ai.google.dev/gemini-api/docs/models + pricing, console.groq.com/docs/models) on
 * 2026-10-24 — both are on the free tier. Change them here only.
 */
export const AI_CONFIG = {
  gemini: {
    model: "gemini-3.6-flash",
    /** Lowest thinking level this model supports — saves tokens. */
    thinkingLevel: "MINIMAL" as const,
  },
  groq: {
    model: "llama-3.3-70b-versatile",
    baseUrl: "https://api.groq.com/openai/v1/chat/completions",
  },
  maxOutputTokens: 900,
  /** Fall back to Groq when Gemini takes longer than this. */
  timeoutMs: 25_000,
  /** Longest Gemini retry-after we are willing to wait before falling back. */
  maxRetryAfterMs: 10_000,
  /** Per-IP limit on AI routes (best-effort on serverless). */
  rateLimit: { calls: 40, windowMs: 60 * 60 * 1000 },
  maxInputChars: 300,
} as const;

/** localStorage key for the optional Bring-Your-Own Gemini key. */
export const BYOK_STORAGE_KEY = "ttw-gemini-key";
/** Request header carrying the BYOK key (never logged). */
export const BYOK_HEADER = "x-user-gemini-key";
