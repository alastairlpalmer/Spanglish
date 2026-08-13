import Anthropic from '@anthropic-ai/sdk';
import { env } from '../env.js';

// Cost posture: Haiku 4.5 everywhere — at $1/$5 per MTok it is ~3-5x cheaper
// than Sonnet and more than good enough for short tutoring turns, grading,
// generation, and rewriting RSS headlines (the article no longer needs the
// web-search tool). MODEL_* env vars override per feature without a deploy.
const HAIKU = 'claude-haiku-4-5-20251001';

export const MODELS = {
  check: env.MODEL_CHECK ?? HAIKU,
  cards: env.MODEL_CARDS ?? HAIKU,
  talk: env.MODEL_TALK ?? HAIKU,
  review: env.MODEL_REVIEW ?? HAIKU,
  drill: env.MODEL_DRILL ?? HAIKU,
  translate: env.MODEL_TRANSLATE ?? HAIKU,
  article: env.MODEL_ARTICLE ?? HAIKU,
} as const;

// USD per million tokens. Verify against platform.claude.com pricing docs
// before trusting cost_usd figures — these move.
const PRICES: Record<string, { input: number; output: number }> = {
  'claude-haiku-4-5-20251001': { input: 1, output: 5 },
  'claude-sonnet-5': { input: 2, output: 10 },
};

export function costUsd(model: string, inputTokens: number, outputTokens: number): number {
  const p = PRICES[model];
  if (!p) return 0;
  return (inputTokens * p.input + outputTokens * p.output) / 1_000_000;
}

let client: Anthropic | null = null;

export function anthropic(): Anthropic {
  if (!client) client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });
  return client;
}

/** Extract the concatenated text blocks from a non-streaming response. */
export function responseText(msg: Anthropic.Message): string {
  return msg.content
    .filter((b): b is Anthropic.TextBlock => b.type === 'text')
    .map((b) => b.text)
    .join('');
}

/** The final text block only — with server tools (web search) the model emits
 *  interim narration blocks before the answer; concatenating them breaks
 *  JSON parsing. */
export function lastTextBlock(msg: Anthropic.Message): string {
  const texts = msg.content.filter((b): b is Anthropic.TextBlock => b.type === 'text');
  return texts[texts.length - 1]?.text ?? '';
}

/** Parse JSON out of model text: strip fences, then fall back to the
 *  outermost {...} span so leading/trailing prose can't break it. */
export function parseJsonLoose(text: string): unknown {
  const trimmed = text.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  try {
    return JSON.parse(trimmed);
  } catch {
    const start = trimmed.indexOf('{');
    const end = trimmed.lastIndexOf('}');
    if (start >= 0 && end > start) {
      return JSON.parse(trimmed.slice(start, end + 1));
    }
    throw new Error('no JSON object found');
  }
}
