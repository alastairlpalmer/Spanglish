import Dexie, { type Table } from 'dexie';
import type {
  Card,
  DiaryEntry,
  ErrorConcept,
  ErrorExample,
  Plan,
  Profile,
  Session,
} from '@seiscientas/shared';

// Every synced row carries dirty: 0|1. Repo helpers are the only write path —
// they stamp updated_at and dirty. `meta` holds pull cursors and local flags.

export type Synced<T> = T & { dirty: 0 | 1 };

export interface MetaRow {
  key: string;
  value: string;
}

export interface PendingCheck {
  id: string;
  cardId: string;
  prompt: string;
  answer: string;
  attempt: string;
  at: string;
}

// Cached news articles — client-side only, never synced (disposable).
export interface CachedArticle {
  id: string;
  headline: string;
  body: string;
  source: string;
  gloss: Array<{ word: string; meaning: string }>;
  fetched_at: string;
  read_at: string | null;
}

// The daily serial — client-side. `summary` carries the running story state
// into the next episode; `n` is the episode number.
export interface Episode {
  id: string;
  n: number;
  date: string; // YYYY-MM-DD local — one episode per day
  title: string;
  body: string;
  summary: string;
  gloss: Array<{ word: string; meaning: string }>;
  read_at: string | null;
}

export class SeisDb extends Dexie {
  profile!: Table<Synced<Profile>, string>;
  sessions!: Table<Synced<Session>, string>;
  cards!: Table<Synced<Card>, string>;
  error_concepts!: Table<Synced<ErrorConcept>, [string, string]>;
  error_examples!: Table<Synced<ErrorExample>, string>;
  plans!: Table<Synced<Plan>, [string, string]>;
  meta!: Table<MetaRow, string>;
  pending_checks!: Table<PendingCheck, string>;
  articles!: Table<CachedArticle, string>;
  episodes!: Table<Episode, string>;
  diary!: Table<Synced<DiaryEntry>, string>;

  constructor() {
    super('seiscientas');
    this.version(1).stores({
      profile: 'user_id, dirty',
      sessions: 'id, at, dirty, updated_at',
      cards: 'id, due, dirty, updated_at, concept',
      error_concepts: '[user_id+concept], dirty, updated_at',
      error_examples: 'id, concept, at, dirty',
      plans: '[user_id+date], date, dirty',
      meta: 'key',
      pending_checks: 'id, at',
    });
    this.version(2).stores({
      articles: 'id, fetched_at',
    });
    this.version(3).stores({
      episodes: 'id, date, n',
      diary: 'id, at, dirty, updated_at',
    });
  }
}

export const db = new SeisDb();

export async function getMeta(key: string): Promise<string | null> {
  const row = await db.meta.get(key);
  return row?.value ?? null;
}

export async function setMeta(key: string, value: string): Promise<void> {
  await db.meta.put({ key, value });
}
