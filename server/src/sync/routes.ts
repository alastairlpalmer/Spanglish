// Server-side sync: the client pushes dirty rows and pulls by updated_at
// cursor. The server owns the DB connection and stamps user_id on every row —
// the client can never write another user's data. Append-only tables
// (sessions, error_examples) insert with ON CONFLICT DO NOTHING: logged hours
// are never overwritten by a sync race.

import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { db } from '../db.js';
import { requireUser } from '../auth.js';

interface TableConfig {
  columns: string[]; // excluding user_id, which the server stamps
  conflict: string[];
  appendOnly: boolean;
}

const TABLES: Record<string, TableConfig> = {
  profile: {
    columns: [
      'level', 'dialect', 'country', 'started_at', 'target_date', 'target_kind',
      'target_history', 'daily_minutes', 'quiet_mode', 'text_size', 'onboarded',
      'converted_prompt_shown', 'updated_at',
    ],
    conflict: ['user_id'],
    appendOnly: false,
  },
  sessions: {
    columns: ['id', 'type', 'minutes', 'is_bonus', 'at', 'updated_at'],
    conflict: ['id'],
    appendOnly: true,
  },
  cards: {
    columns: [
      'id', 'direction', 'es', 'en', 'word', 'word_en', 'note', 'prompt', 'answer',
      'accepts', 'concept', 'source', 'step', 'due', 'seen', 'deleted_at', 'updated_at',
    ],
    conflict: ['id'],
    appendOnly: false,
  },
  error_concepts: {
    columns: ['concept', 'count', 'clean_runs', 'first_seen', 'last_seen', 'updated_at'],
    conflict: ['user_id', 'concept'],
    appendOnly: false,
  },
  error_examples: {
    columns: ['id', 'concept', 'wrong', 'right_', 'why', 'at', 'updated_at'],
    conflict: ['id'],
    appendOnly: true,
  },
  plans: {
    columns: ['date', 'blocks', 'completed_at', 'bonus_minutes', 'updated_at'],
    conflict: ['user_id', 'date'],
    appendOnly: false,
  },
};

const pushSchema = z.object({
  table: z.string(),
  rows: z.array(z.record(z.unknown())).min(1).max(500),
});

const pullSchema = z.object({
  table: z.string(),
  cursor: z.string().nullable(),
});

const q = (name: string): string => `"${name}"`;

function toPg(column: string, value: unknown): unknown {
  // jsonb columns arrive as objects/arrays and must be stringified explicitly;
  // pg would otherwise serialize a JS array as a Postgres array literal.
  if (column === 'target_history' || column === 'blocks') return JSON.stringify(value ?? null);
  return value ?? null;
}

export function registerSyncRoutes(app: FastifyInstance): void {
  app.post('/api/sync/push', { preHandler: requireUser }, async (req, reply) => {
    const pool = db();
    if (!pool) return reply.code(503).send({ error: 'no_database' });
    const parsed = pushSchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: 'bad_request' });
    const config = TABLES[parsed.data.table];
    if (!config) return reply.code(400).send({ error: 'unknown_table' });

    const cols = ['user_id', ...config.columns];
    const updatable = config.columns.filter((c) => !config.conflict.includes(c));

    for (const row of parsed.data.rows) {
      const values = [req.userId, ...config.columns.map((c) => toPg(c, row[c]))];
      const placeholders = values.map((_, i) => `$${i + 1}`).join(', ');
      const conflictClause = config.appendOnly
        ? 'do nothing'
        : `do update set ${updatable.map((c) => `${q(c)} = excluded.${q(c)}`).join(', ')}`;
      await pool.query(
        `insert into ${q(parsed.data.table)} (${cols.map(q).join(', ')})
         values (${placeholders})
         on conflict (${config.conflict.map(q).join(', ')}) ${conflictClause}`,
        values,
      );
    }
    return { ok: true };
  });

  app.post('/api/sync/pull', { preHandler: requireUser }, async (req, reply) => {
    const pool = db();
    if (!pool) return reply.code(503).send({ error: 'no_database' });
    const parsed = pullSchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: 'bad_request' });
    const config = TABLES[parsed.data.table];
    if (!config) return reply.code(400).send({ error: 'unknown_table' });

    const params: unknown[] = [req.userId];
    let where = 'user_id = $1';
    if (parsed.data.cursor) {
      params.push(parsed.data.cursor);
      where += ' and updated_at > $2';
    }
    const { rows } = await pool.query(
      `select * from ${q(parsed.data.table)} where ${where}
       order by updated_at asc limit 500`,
      params,
    );
    return { rows };
  });
}
