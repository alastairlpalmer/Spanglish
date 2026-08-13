// Typed write helpers — the ONLY write path for synced tables. Every write
// stamps updated_at and dirty=1 so the sync engine can find it.

import type {
  Card,
  ErrorExample,
  Plan,
  Profile,
  Session,
  ConceptSlug,
  SessionType,
} from '@seiscientas/shared';
import { db } from './dexie';
import { nowIso } from '../lib/time';
import { uuid } from '../lib/id';
import { requestSync } from '../sync/engine';

export async function saveProfile(profile: Omit<Profile, 'updated_at'>): Promise<void> {
  await db.profile.put({ ...profile, updated_at: nowIso(), dirty: 1 });
  requestSync();
}

export async function patchProfile(
  userId: string,
  patch: Partial<Omit<Profile, 'user_id' | 'updated_at'>>,
): Promise<void> {
  await db.transaction('rw', db.profile, async () => {
    const existing = await db.profile.get(userId);
    if (!existing) return;
    await db.profile.put({ ...existing, ...patch, updated_at: nowIso(), dirty: 1 });
  });
  requestSync();
}

export async function getProfile(userId: string): Promise<Profile | null> {
  return (await db.profile.get(userId)) ?? null;
}

export async function logSession(opts: {
  userId: string;
  type: SessionType;
  minutes: number;
  isBonus: boolean;
  at: string;
  id?: string;
}): Promise<Session> {
  const session: Session = {
    id: opts.id ?? uuid(),
    user_id: opts.userId,
    type: opts.type,
    minutes: opts.minutes,
    is_bonus: opts.isBonus,
    at: opts.at,
    updated_at: nowIso(),
  };
  await db.sessions.put({ ...session, dirty: 1 });
  requestSync();
  return session;
}

export async function putCard(card: Card): Promise<void> {
  await db.cards.put({ ...card, updated_at: nowIso(), dirty: 1 });
  requestSync();
}

export async function putCards(cards: Card[]): Promise<void> {
  const stamped = cards.map((c) => ({ ...c, updated_at: nowIso(), dirty: 1 as const }));
  await db.cards.bulkPut(stamped);
  requestSync();
}

export async function recordError(opts: {
  userId: string;
  concept: ConceptSlug;
  wrong: string | null;
  right: string | null;
  why: string | null;
}): Promise<void> {
  const now = nowIso();
  await db.transaction('rw', db.error_concepts, db.error_examples, async () => {
    const existing = await db.error_concepts.get([opts.userId, opts.concept]);
    await db.error_concepts.put({
      user_id: opts.userId,
      concept: opts.concept,
      count: (existing?.count ?? 0) + 1,
      clean_runs: 0, // an error resets the clean-run counter
      first_seen: existing?.first_seen ?? now,
      last_seen: now,
      updated_at: now,
      dirty: 1,
    });
    await db.error_examples.put({
      id: uuid(),
      user_id: opts.userId,
      concept: opts.concept,
      wrong: opts.wrong,
      right_: opts.right,
      why: opts.why,
      at: now,
      updated_at: now,
      dirty: 1,
    });
    // Keep only the 5 most recent examples per concept.
    const examples = await db.error_examples
      .where('concept')
      .equals(opts.concept)
      .and((e) => e.user_id === opts.userId)
      .sortBy('at');
    if (examples.length > 5) {
      const excess = examples.slice(0, examples.length - 5);
      await db.error_examples.bulkDelete(excess.map((e) => e.id));
    }
  });
  requestSync();
}

/** A perfect 8/8 drill run. Errors reset the counter via recordError. */
export async function recordCleanRun(userId: string, concept: ConceptSlug): Promise<void> {
  const now = nowIso();
  const existing = await db.error_concepts.get([userId, concept]);
  await db.error_concepts.put({
    user_id: userId,
    concept,
    count: existing?.count ?? 0,
    clean_runs: (existing?.clean_runs ?? 0) + 1,
    first_seen: existing?.first_seen ?? null,
    last_seen: existing?.last_seen ?? null,
    updated_at: now,
    dirty: 1,
  });
  requestSync();
}

export async function savePlan(plan: Omit<Plan, 'updated_at'>): Promise<void> {
  await db.plans.put({ ...plan, updated_at: nowIso(), dirty: 1 });
  requestSync();
}

export async function getPlan(userId: string, date: string): Promise<Plan | null> {
  return (await db.plans.get([userId, date])) ?? null;
}

export async function queuePendingCheck(opts: {
  cardId: string;
  prompt: string;
  answer: string;
  attempt: string;
}): Promise<void> {
  await db.pending_checks.put({ id: uuid(), at: nowIso(), ...opts });
}

/** Add an ErrorExample-shaped correction from Talk review. */
export async function recordReviewErrors(
  userId: string,
  errors: Array<{ wrong: string; right: string; why: string; concept: ConceptSlug }>,
): Promise<void> {
  for (const e of errors) {
    await recordError({
      userId,
      concept: e.concept,
      wrong: e.wrong,
      right: e.right,
      why: e.why,
    });
  }
}

export async function sessionsBetween(
  userId: string,
  fromIso: string,
  toIso: string,
): Promise<Session[]> {
  return db.sessions
    .where('at')
    .between(fromIso, toIso, true, true)
    .and((s) => s.user_id === userId)
    .toArray();
}

export async function allSessions(userId: string): Promise<Session[]> {
  return db.sessions.where('at').aboveOrEqual('').and((s) => s.user_id === userId).sortBy('at');
}
