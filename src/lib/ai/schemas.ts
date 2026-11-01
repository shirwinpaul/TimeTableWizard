import { z } from "zod";
import { AI_CONFIG } from "@/config/ai";
import { CustomRuleParamsSchema } from "@/lib/model/schema";

/** Zod schemas for every AI request body and every AI response. */

const ref = z.object({ id: z.string().max(64), label: z.string().max(60) });

export const DescribeRuleRequest = z.object({
  /** Teacher names are replaced with [T:CODE] placeholders on the client. */
  text: z.string().trim().min(3).max(AI_CONFIG.maxInputChars),
  refs: z.object({
    subjects: z.array(ref).max(80),
    classes: z.array(ref).max(120),
    teachers: z.array(ref).max(200),
    days: z.array(z.number().int().min(0).max(5)).max(6),
    periods: z.number().int().min(1).max(16),
  }),
});

export const DescribeRuleResponse = z.object({
  rule: CustomRuleParamsSchema.nullable(),
  hard: z.boolean(),
  weight: z.number().int().min(1).max(10),
  /** Words from the text that refer to something not in the lists (never guessed). */
  unknown: z.array(z.string().max(60)).max(10),
  note: z.string().max(300).default(""),
});

export const ExplainRequest = z.object({
  problems: z
    .array(
      z.object({
        code: z.string().max(40),
        data: z.record(z.string(), z.union([z.number(), z.string().max(40)])),
        fixes: z.array(z.object({ type: z.string().max(40), value: z.number().optional() })).max(4),
      }),
    )
    .min(1)
    .max(20),
});

export const ExplainResponse = z.object({
  explanation: z.string().min(1).max(1200),
  ranked: z
    .array(z.object({ problem: z.number().int().min(0), fix: z.number().int().min(0), why: z.string().max(200) }))
    .max(8),
});

export const DraftRequest = z.object({ text: z.string().trim().min(10).max(600) });

export const DraftResponse = z.object({
  type: z.enum(["School", "College"]),
  days: z.array(z.object({ day: z.number().int().min(0).max(5), periods: z.number().int().min(1).max(16) })).min(1).max(6),
  classes: z.array(z.object({ name: z.string().min(1).max(40), strength: z.number().int().min(1).max(500) })).max(80),
  subjects: z
    .array(
      z.object({
        name: z.string().min(1).max(60),
        code: z.string().min(1).max(8),
        type: z.enum(["theory", "lab", "activity"]),
        heavy: z.boolean(),
        preferredTime: z.enum(["morning", "any", "afternoon"]),
      }),
    )
    .max(40),
});

export const SummariseRequest = z.object({
  stats: z.object({
    classes: z.number().int(),
    teachers: z.number().int(),
    days: z.number().int(),
    score: z.number(),
    clashFree: z.boolean(),
    teacherLoads: z.array(z.object({ code: z.string().max(8), week: z.number(), max: z.number(), gaps: z.number() })).max(200),
    roomUse: z.array(z.object({ type: z.string().max(30), percent: z.number() })).max(10),
  }),
});

export const SummariseResponse = z.object({ summary: z.string().min(1).max(1500) });

export type DescribeRuleOut = z.infer<typeof DescribeRuleResponse>;
export type ExplainOut = z.infer<typeof ExplainResponse>;
export type DraftOut = z.infer<typeof DraftResponse>;
export type SummariseOut = z.infer<typeof SummariseResponse>;

/** Client-visible AI error kinds. */
export type AiError = { kind: "rate"; retryAfterSec: number } | { kind: "resting" } | { kind: "invalid"; message: string } | { kind: "limit" };
