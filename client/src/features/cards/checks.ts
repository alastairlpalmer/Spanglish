// Semantic checking for production cards, with an offline queue.
//
// Online: /api/ai/check grades the attempt (valid alternative phrasings pass).
// Offline: the answer is captured, the card is graded provisionally correct,
// and the check is queued in pending_checks. On reconnect the queue resolves;
// a disagreement silently resets the card (step 0, due now) and logs the
// error. Blocking the card queue on the network is not acceptable (spec §11).

import type { CheckResponse } from '@seiscientas/shared';
import { coerceConcept } from '@seiscientas/shared';
import { apiPost } from '../../lib/api';
import { db } from '../../db/dexie';
import { putCard, queuePendingCheck, recordError } from '../../db/repo';
import { nowIso } from '../../lib/time';

export type CheckOutcome =
  | { kind: 'checked'; result: CheckResponse }
  | { kind: 'queued' };

export async function checkProduction(opts: {
  userId: string;
  cardId: string;
  prompt: string;
  answer: string;
  attempt: string;
}): Promise<CheckOutcome> {
  if (!navigator.onLine) {
    await queuePendingCheck(opts);
    return { kind: 'queued' };
  }
  try {
    const result = await apiPost<CheckResponse>('/api/ai/check', {
      prompt: opts.prompt,
      answer: opts.answer,
      attempt: opts.attempt,
    });
    if (!result.correct) {
      await recordError({
        userId: opts.userId,
        concept: coerceConcept(result.concept),
        wrong: opts.attempt,
        right: opts.answer,
        why: result.issue,
      });
    }
    return { kind: 'checked', result };
  } catch {
    // Network died mid-flight: same path as offline.
    await queuePendingCheck(opts);
    return { kind: 'queued' };
  }
}

let resolving = false;

/** Drain the offline check queue. Call on reconnect and app start. */
export async function resolvePendingChecks(userId: string): Promise<void> {
  if (resolving || !navigator.onLine) return;
  resolving = true;
  try {
    const pending = await db.pending_checks.orderBy('at').toArray();
    for (const p of pending) {
      let result: CheckResponse;
      try {
        result = await apiPost<CheckResponse>('/api/ai/check', {
          prompt: p.prompt,
          answer: p.answer,
          attempt: p.attempt,
        });
      } catch {
        return; // still unreachable; try again next trigger
      }
      if (!result.correct) {
        // Provisional grade was wrong: silently reschedule the card and log.
        const card = await db.cards.get(p.cardId);
        if (card) {
          await putCard({ ...card, step: 0, due: nowIso() });
        }
        await recordError({
          userId,
          concept: coerceConcept(result.concept),
          wrong: p.attempt,
          right: p.answer,
          why: result.issue,
        });
      }
      await db.pending_checks.delete(p.id);
    }
  } finally {
    resolving = false;
  }
}

export function initCheckResolution(userId: string): void {
  void resolvePendingChecks(userId);
  window.addEventListener('online', () => void resolvePendingChecks(userId));
}
