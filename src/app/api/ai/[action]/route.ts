import { NextResponse, type NextRequest } from "next/server";
import type { z } from "zod";
import { BYOK_HEADER } from "@/config/ai";
import { checkRuleRefs, rateLimit } from "@/lib/ai/guard";
import { mockDescribe, mockDraft, mockExplain, mockSummarise } from "@/lib/ai/mock";
import { DESCRIBE_RULE_SYSTEM, DRAFT_SYSTEM, EXPLAIN_SYSTEM, SUMMARISE_SYSTEM, asData } from "@/lib/ai/prompts";
import { geminiProvider, groqProvider } from "@/lib/ai/providers";
import { runAi } from "@/lib/ai/run";
import {
  DescribeRuleRequest,
  DescribeRuleResponse,
  DraftRequest,
  DraftResponse,
  ExplainRequest,
  ExplainResponse,
  SummariseRequest,
  SummariseResponse,
  type AiError,
} from "@/lib/ai/schemas";

/** All AI calls go through here (never from the browser). One request = one AI action. */

export const runtime = "nodejs";
// Vercel Hobby allows up to 60 s; our own timeouts (25 s + fallback) fit inside this.
export const maxDuration = 60;

const MAX_BODY = 50_000;
const isMock = () => process.env.MOCK_AI === "true" && process.env.NODE_ENV !== "production";
const realKey = (k: string | undefined | null) => (k && k.trim() && !k.startsWith("PASTE_") ? k.trim() : null);

const fail = (error: AiError, status = 200) => NextResponse.json({ ok: false, error }, { status });

type Action = {
  req: z.ZodTypeAny;
  res: z.ZodTypeAny;
  system: string;
  user: (body: never) => string;
  mock: (body: never) => unknown;
  post?: (out: never, body: never) => unknown;
};

const ACTIONS: Record<string, Action> = {
  "describe-rule": {
    req: DescribeRuleRequest,
    res: DescribeRuleResponse,
    system: DESCRIBE_RULE_SYSTEM,
    user: (b: z.infer<typeof DescribeRuleRequest>) =>
      `Subjects: ${b.refs.subjects.map((s) => `${s.id}=${s.label}`).join("; ")}\nClasses: ${b.refs.classes.map((c) => `${c.id}=${c.label}`).join("; ")}\nTeachers (codes): ${b.refs.teachers.map((t) => `${t.id}=${t.label}`).join("; ")}\nWorking days: ${b.refs.days.join(",")}; periods per day: ${b.refs.periods}\nRule: ${asData(b.text)}`,
    mock: (b: z.infer<typeof DescribeRuleRequest>) => mockDescribe(b),
    post: (out: z.infer<typeof DescribeRuleResponse>, b: z.infer<typeof DescribeRuleRequest>) => checkRuleRefs(out, b.refs),
  },
  explain: {
    req: ExplainRequest,
    res: ExplainResponse,
    system: EXPLAIN_SYSTEM,
    user: (b: z.infer<typeof ExplainRequest>) => `Problems: ${asData(JSON.stringify(b.problems))}`,
    mock: (b: z.infer<typeof ExplainRequest>) => mockExplain(b),
    post: (out: z.infer<typeof ExplainResponse>, b: z.infer<typeof ExplainRequest>) => ({
      ...out,
      // Keep only rankings that point at a real fix.
      ranked: out.ranked.filter((r) => b.problems[r.problem]?.fixes[r.fix]),
    }),
  },
  "draft-setup": {
    req: DraftRequest,
    res: DraftResponse,
    system: DRAFT_SYSTEM,
    user: (b: z.infer<typeof DraftRequest>) => `Description: ${asData(b.text)}`,
    mock: (b: z.infer<typeof DraftRequest>) => mockDraft(b),
  },
  summarise: {
    req: SummariseRequest,
    res: SummariseResponse,
    system: SUMMARISE_SYSTEM,
    user: (b: z.infer<typeof SummariseRequest>) => `Stats: ${asData(JSON.stringify(b.stats))}`,
    mock: (b: z.infer<typeof SummariseRequest>) => mockSummarise(b),
  },
};

export async function POST(req: NextRequest, ctx: { params: Promise<{ action: string }> }) {
  const { action } = await ctx.params;
  const def = ACTIONS[action];
  if (!def) return fail({ kind: "invalid", message: "Unknown assistant action." }, 404);

  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || req.headers.get("x-real-ip") || "local";
  const limited = rateLimit(ip);
  if (!limited.ok) return fail({ kind: "rate", retryAfterSec: limited.retryAfterSec }, 429);

  const raw = await req.text();
  if (raw.length > MAX_BODY) return fail({ kind: "invalid", message: "Request too large." }, 413);
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    return fail({ kind: "invalid", message: "Bad request." }, 400);
  }
  const parsed = def.req.safeParse(json);
  if (!parsed.success) return fail({ kind: "invalid", message: parsed.error.issues[0]?.message ?? "Bad request." }, 400);
  const body = parsed.data as never;

  if (isMock()) {
    const data = def.mock(body);
    return NextResponse.json({ ok: true, data: def.post ? def.post(data as never, body) : data, provider: "mock" });
  }

  const gemKey = realKey(req.headers.get(BYOK_HEADER)) ?? realKey(process.env.GEMINI_API_KEY);
  const groqKey = realKey(process.env.GROQ_API_KEY);
  if (!gemKey && !groqKey) return fail({ kind: "resting" });

  const result = await runAi(def.system, def.user(body), def.res, {
    gemini: gemKey ? geminiProvider(gemKey) : null,
    groq: groqKey ? groqProvider(groqKey) : null,
  });
  if (!result.ok) return fail(result.error);
  return NextResponse.json({ ok: true, data: def.post ? def.post(result.data as never, body) : result.data, provider: result.provider });
}
