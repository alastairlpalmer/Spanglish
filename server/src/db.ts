// Postgres via node-postgres. The server owns the only DB connection —
// the client syncs through /api/sync/*, never touches the database directly.
// Schema is applied idempotently at boot (single-user app; no migration
// tooling needed).

import pg from 'pg';
import { env } from './env.js';

// Return Postgres DATE columns as plain 'YYYY-MM-DD' strings. The default
// parser produces a JS Date at server-local midnight, which shifts the day
// under JSON serialisation on any non-UTC server and would fork plan rows.
pg.types.setTypeParser(1082, (v: string) => v);

let pool: pg.Pool | null = null;

export function db(): pg.Pool | null {
  if (!env.hasDb) return null;
  if (!pool) {
    // Railway's private network (*.railway.internal) and localhost speak
    // plain TCP; only external/public hosts need TLS (self-signed chain).
    const noSsl =
      env.DATABASE_URL!.includes('localhost') ||
      env.DATABASE_URL!.includes('.railway.internal');
    pool = new pg.Pool({
      connectionString: env.DATABASE_URL,
      ssl: noSsl ? undefined : { rejectUnauthorized: false },
      max: 5,
    });
  }
  return pool;
}

const SCHEMA = `
create table if not exists profile (
  user_id        uuid primary key,
  level          text not null default 'A2',
  dialect        text not null default 'Castilian',
  country        text,
  started_at     timestamptz not null default now(),
  target_date    date,
  target_kind    text check (target_kind in ('booked','intended')),
  target_history jsonb not null default '[]',
  daily_minutes  int  not null default 60,
  quiet_mode     boolean not null default false,
  text_size      int not null default 100,
  onboarded      boolean not null default false,
  converted_prompt_shown boolean not null default false,
  updated_at     timestamptz not null default now()
);

create table if not exists sessions (
  id          uuid primary key,
  user_id     uuid not null,
  type        text not null check (type in ('cards','read','talk','grammar','input','tutor')),
  minutes     int  not null check (minutes > 0),
  is_bonus    boolean not null default false,
  at          timestamptz not null,
  updated_at  timestamptz not null default now()
);
create index if not exists sessions_user_at on sessions (user_id, at desc);
create index if not exists sessions_user_updated on sessions (user_id, updated_at);

create table if not exists cards (
  id          uuid primary key,
  user_id     uuid not null,
  direction   text not null default 'recognition' check (direction in ('recognition','production')),
  es          text, en text, word text, word_en text, note text,
  prompt      text, answer text, accepts text[],
  concept     text,
  source      text not null default 'generated' check (source in ('generated','mined','drill')),
  step        int  not null default 0,
  due         timestamptz not null default now(),
  seen        int  not null default 0,
  deleted_at  timestamptz,
  updated_at  timestamptz not null default now()
);
create index if not exists cards_user_due on cards (user_id, due) where deleted_at is null;
create index if not exists cards_user_updated on cards (user_id, updated_at);

create table if not exists error_concepts (
  user_id     uuid not null,
  concept     text not null,
  count       int  not null default 0,
  clean_runs  int  not null default 0,
  first_seen  timestamptz,
  last_seen   timestamptz,
  updated_at  timestamptz not null default now(),
  primary key (user_id, concept)
);

create table if not exists error_examples (
  id          uuid primary key,
  user_id     uuid not null,
  concept     text not null,
  wrong       text,
  right_      text,
  why         text,
  at          timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists error_examples_user_concept on error_examples (user_id, concept, at desc);

create table if not exists plans (
  user_id       uuid not null,
  date          date not null,
  blocks        jsonb not null,
  completed_at  timestamptz,
  bonus_minutes int not null default 0,
  updated_at    timestamptz not null default now(),
  primary key (user_id, date)
);

create table if not exists diary (
  id          uuid primary key,
  user_id     uuid not null,
  text        text not null,
  at          timestamptz not null,
  updated_at  timestamptz not null default now()
);
create index if not exists diary_user_at on diary (user_id, at desc);
create index if not exists diary_user_updated on diary (user_id, updated_at);

create table if not exists ai_calls (
  id            bigserial primary key,
  user_id       uuid not null,
  feature       text not null,
  model         text not null,
  input_tokens  int,
  output_tokens int,
  cost_usd      numeric(10,6),
  at            timestamptz not null default now()
);
create index if not exists ai_calls_user_at on ai_calls (user_id, at desc);
`;

export async function migrate(): Promise<void> {
  const client = db();
  if (!client) return;
  await client.query(SCHEMA);
}
