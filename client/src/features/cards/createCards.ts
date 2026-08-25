// Harvested vocabulary — words the learner personally needed (diary
// cómo-se-dice, Talk gaps) — enters the deck in BOTH directions, because a
// word you reached for is one you must be able to produce.

import type { Card } from '@seiscientas/shared';
import { putCards } from '../../db/repo';
import { uuid } from '../../lib/id';
import { nowIso } from '../../lib/time';

export async function addWordPair(opts: {
  userId: string;
  es: string;
  en: string;
  note: string;
  bucket?: string | null;
}): Promise<void> {
  const base: Omit<Card, 'id' | 'direction' | 'prompt' | 'answer'> = {
    user_id: opts.userId,
    bucket: opts.bucket ?? null,
    es: opts.es,
    en: opts.en,
    word: opts.es,
    word_en: opts.en,
    note: opts.note,
    accepts: null,
    concept: null,
    source: 'mined',
    scope: 'word',
    step: 0,
    due: nowIso(),
    seen: 0,
    deleted_at: null,
    updated_at: nowIso(),
  };
  await putCards([
    { ...base, id: uuid(), direction: 'recognition', prompt: null, answer: null },
    {
      ...base,
      id: uuid(),
      direction: 'production',
      prompt: opts.en,
      answer: opts.es,
      due: new Date(Date.now() + 86_400_000).toISOString(),
    },
  ]);
}
