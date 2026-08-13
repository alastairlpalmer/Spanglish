// ai_calls logging + in-memory daily tally. The in-memory tally makes the
// budget cap work even without Supabase; the table makes it durable.

import { serviceDb } from '../db.js';
import { costUsd } from './anthropic.js';

let tallyDay = '';
let tallyTokens = 0;

function todayUtc(): string {
  return new Date().toISOString().slice(0, 10);
}

export function tokensUsedToday(): number {
  if (tallyDay !== todayUtc()) return 0;
  return tallyTokens;
}

export async function recordCall(opts: {
  userId: string;
  feature: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
}): Promise<void> {
  const day = todayUtc();
  if (tallyDay !== day) {
    tallyDay = day;
    tallyTokens = 0;
  }
  tallyTokens += opts.inputTokens + opts.outputTokens;

  const db = serviceDb();
  if (!db) return;
  await db.from('ai_calls').insert({
    user_id: opts.userId,
    feature: opts.feature,
    model: opts.model,
    input_tokens: opts.inputTokens,
    output_tokens: opts.outputTokens,
    cost_usd: costUsd(opts.model, opts.inputTokens, opts.outputTokens),
  });
}

/** Rehydrate today's tally from the table on boot, so restarts don't reset the cap. */
export async function hydrateTally(): Promise<void> {
  const db = serviceDb();
  if (!db) return;
  const start = `${todayUtc()}T00:00:00Z`;
  const { data } = await db
    .from('ai_calls')
    .select('input_tokens, output_tokens')
    .gte('at', start);
  if (!data) return;
  tallyDay = todayUtc();
  tallyTokens = data.reduce(
    (s, r) => s + (r.input_tokens ?? 0) + (r.output_tokens ?? 0),
    0,
  );
}
