import Anthropic from '@anthropic-ai/sdk';
import { env } from '../env.js';

export const MODELS = {
  check: 'claude-haiku-4-5-20251001',
  cards: 'claude-sonnet-5',
  talk: 'claude-sonnet-5',
  review: 'claude-sonnet-5',
  drill: 'claude-sonnet-5',
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

/** Strip accidental markdown fences and parse JSON, or throw. */
export function parseJsonLoose(text: string): unknown {
  const trimmed = text.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  return JSON.parse(trimmed);
}
