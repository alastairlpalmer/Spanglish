-- Seiscientas schema. Apply with: supabase db push, or paste into the SQL editor.

create table profile (
  user_id        uuid primary key references auth.users,
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

create table sessions (
  id          uuid primary key,
  user_id     uuid not null references auth.users,
  type        text not null check (type in ('cards','read','talk','grammar','input','tutor')),
  minutes     int  not null check (minutes > 0),
  is_bonus    boolean not null default false,
  at          timestamptz not null,
  updated_at  timestamptz not null default now()
);
create index sessions_user_at on sessions (user_id, at desc);
create index sessions_user_updated on sessions (user_id, updated_at);

create table cards (
  id          uuid primary key,
  user_id     uuid not null references auth.users,
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
create index cards_user_due on cards (user_id, due) where deleted_at is null;
create index cards_user_updated on cards (user_id, updated_at);

create table error_concepts (
  user_id     uuid not null references auth.users,
  concept     text not null,
  count       int  not null default 0,
  clean_runs  int  not null default 0,
  first_seen  timestamptz,
  last_seen   timestamptz,
  updated_at  timestamptz not null default now(),
  primary key (user_id, concept)
);

create table error_examples (
  id          uuid primary key,
  user_id     uuid not null references auth.users,
  concept     text not null,
  wrong       text,
  right_      text,
  why         text,
  at          timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index error_examples_user_concept on error_examples (user_id, concept, at desc);

create table plans (
  user_id       uuid not null references auth.users,
  date          date not null,
  blocks        jsonb not null,
  completed_at  timestamptz,
  bonus_minutes int not null default 0,
  updated_at    timestamptz not null default now(),
  primary key (user_id, date)
);

create table ai_calls (
  id            bigserial primary key,
  user_id       uuid not null,
  feature       text not null,
  model         text not null,
  input_tokens  int,
  output_tokens int,
  cost_usd      numeric(10,6),
  at            timestamptz not null default now()
);
create index ai_calls_user_at on ai_calls (user_id, at desc);
