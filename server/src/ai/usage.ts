// ai_calls logging + in-memory daily tally. The in-memory tally makes the
// budget cap work even without a database; the table makes it durable.

import { db } from '../db.js';
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

  const pool = db();
  if (!pool) return;
  await pool.query(
    `insert into ai_calls (user_id, feature, model, input_tokens, output_tokens, cost_usd)
     values ($1, $2, $3, $4, $5, $6)`,
    [
      opts.userId,
      opts.feature,
      opts.model,
      opts.inputTokens,
      opts.outputTokens,
      costUsd(opts.model, opts.inputTokens, opts.outputTokens),
    ],
  );
}

/** Rehydrate today's tally from the table on boot, so restarts don't reset the cap. */
export async function hydrateTally(): Promise<void> {
  const pool = db();
  if (!pool) return;
  const { rows } = await pool.query(
    `select coalesce(sum(input_tokens + output_tokens), 0) as total
     from ai_calls where at >= $1`,
    [`${todayUtc()}T00:00:00Z`],
  );
  tallyDay = todayUtc();
  tallyTokens = Number(rows[0]?.total ?? 0);
}
