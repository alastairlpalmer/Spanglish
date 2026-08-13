import { z } from 'zod';
import { CONCEPTS } from './concepts';

export const conceptSchema = z.enum(CONCEPTS);

// ---- /api/ai/cards ----
export const cardsRequestSchema = z.object({
  topic: z.string().max(120).optional(),
  level: z.string(),
  dialect: z.string(),
  exclude: z.array(z.string()).max(500).default([]),
});
export const generatedCardSchema = z.object({
  es: z.string().min(1),
  en: z.string().min(1),
  word: z.string().min(1),
  wordEn: z.string().min(1),
  note: z.string(),
});
export const cardsResponseSchema = z.object({
  cards: z.array(generatedCardSchema).length(8),
});

// ---- /api/ai/check ----
export const checkRequestSchema = z.object({
  prompt: z.string(),
  answer: z.string(),
  attempt: z.string(),
});
export const checkResponseSchema = z.object({
  correct: z.boolean(),
  issue: z.string().nullable(),
  concept: conceptSchema.nullable(),
});

// ---- /api/ai/talk ----
export const talkMessageSchema = z.object({
  role: z.enum(['user', 'assistant']),
  content: z.string(),
});
export const talkRequestSchema = z.object({
  messages: z.array(talkMessageSchema).min(1).max(200),
  scenario: z.string(),
  dialect: z.string(),
  level: z.string(),
  weakConcepts: z.array(z.string()).max(25).default([]),
});
// Streamed as SSE events: {type:'delta',text} | {type:'done'} | {type:'error',message}
export const talkStreamEventSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('delta'), text: z.string() }),
  z.object({ type: z.literal('done') }),
  z.object({ type: z.literal('error'), message: z.string() }),
]);

// ---- /api/ai/review ----
export const reviewRequestSchema = z.object({
  utterances: z.array(z.string()).min(1).max(200),
  dialect: z.string(),
  level: z.string(),
});
export const reviewErrorSchema = z.object({
  wrong: z.string(),
  right: z.string(),
  why: z.string(),
  concept: conceptSchema,
});
export const reviewResponseSchema = z.object({
  errors: z.array(reviewErrorSchema),
  worstHabit: z.string().nullable(),
});

// ---- /api/ai/article ----
export const articleRequestSchema = z.object({
  topic: z.string().max(120).optional(),
  level: z.string(),
  country: z.string().nullable(),
  weakConcepts: z.array(z.string()).max(25).default([]),
});
export const glossEntrySchema = z.object({
  word: z.string().min(1),
  meaning: z.string().min(1),
});
export const articleResponseSchema = z.object({
  headline: z.string().min(1),
  body: z.string().min(50),
  source: z.string().min(1),
  gloss: z.array(glossEntrySchema).min(6).max(20),
});

// ---- /api/ai/translate (Read's translation practice) ----
export const translateRequestSchema = z.object({
  body: z.string().min(1),
  attempt: z.string().min(1).max(2000),
});
export const translateResponseSchema = z.object({
  feedback: z.string().min(1),
  // Comprehension errors, classified into the closed taxonomy so they can
  // feed the ledger (spec §7).
  errors: z
    .array(
      z.object({
        wrong: z.string(),
        right: z.string(),
        why: z.string(),
        concept: conceptSchema,
      }),
    )
    .default([]),
});

// ---- /api/ai/drill (stub for MVP; schema fixed now so step 8 is additive) ----
export const drillRequestSchema = z.object({
  concept: conceptSchema,
  level: z.string(),
  recentErrors: z.array(reviewErrorSchema).max(5).default([]),
});
export const drillCardSchema = z.object({
  prompt: z.string(),
  answer: z.string(),
  accepts: z.array(z.string()),
});
export const drillResponseSchema = z.object({
  cards: z.array(drillCardSchema).length(8),
});

export type ArticleRequest = z.infer<typeof articleRequestSchema>;
export type ArticleResponse = z.infer<typeof articleResponseSchema>;
export type GlossEntry = z.infer<typeof glossEntrySchema>;
export type TranslateRequest = z.infer<typeof translateRequestSchema>;
export type TranslateResponse = z.infer<typeof translateResponseSchema>;
export type CardsRequest = z.infer<typeof cardsRequestSchema>;
export type CardsResponse = z.infer<typeof cardsResponseSchema>;
export type CheckRequest = z.infer<typeof checkRequestSchema>;
export type CheckResponse = z.infer<typeof checkResponseSchema>;
export type TalkRequest = z.infer<typeof talkRequestSchema>;
export type TalkStreamEvent = z.infer<typeof talkStreamEventSchema>;
export type ReviewRequest = z.infer<typeof reviewRequestSchema>;
export type ReviewResponse = z.infer<typeof reviewResponseSchema>;
export type ReviewError = z.infer<typeof reviewErrorSchema>;
export type DrillRequest = z.infer<typeof drillRequestSchema>;
export type DrillResponse = z.infer<typeof drillResponseSchema>;
