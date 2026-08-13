// Weak concepts, derived from the ledger: open concepts ranked by error
// count. Feeds Talk steering, article gloss weighting, and the Today drill
// block's target.

import { conceptState, phaseFor, type ConceptSlug } from '@seiscientas/shared';
import { db } from '../../db/dexie';
import { totalMinutes } from '../../db/repo';

export async function weakConcepts(userId: string, limit = 5): Promise<ConceptSlug[]> {
  const rows = await db.error_concepts
    .where('[user_id+concept]')
    .between([userId, ''], [userId, '￿'])
    .toArray();
  const phase = phaseFor((await totalMinutes(userId)) / 60);
  const now = new Date();

  return rows
    .filter((r) => r.concept !== 'other')
    .filter((r) => {
      const state = conceptState(r.concept, phase, r, now);
      return state === 'open' || state === 'drilling';
    })
    .sort((a, b) => b.count - a.count)
    .slice(0, limit)
    .map((r) => r.concept);
}
