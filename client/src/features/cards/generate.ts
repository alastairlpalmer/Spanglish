import type { Card, CardsResponse } from '@seiscientas/shared';
import { apiPost } from '../../lib/api';
import { putCards } from '../../db/repo';
import { db } from '../../db/dexie';
import { uuid } from '../../lib/id';
import { nowIso } from '../../lib/time';

export async function generateCards(opts: {
  userId: string;
  topic?: string;
  level: string;
  dialect: string;
}): Promise<number> {
  // Exclude words already in the deck so batches don't repeat.
  const existing = await db.cards
    .where('dirty')
    .anyOf(0, 1)
    .and((c) => c.user_id === opts.userId && c.deleted_at === null)
    .toArray();
  const exclude = existing.map((c) => c.word).filter((w): w is string => Boolean(w));

  const res = await apiPost<CardsResponse>('/api/ai/cards', {
    topic: opts.topic,
    level: opts.level,
    dialect: opts.dialect,
    exclude: exclude.slice(-500),
  });

  const cards: Card[] = res.cards.map((c) => ({
    id: uuid(),
    user_id: opts.userId,
    direction: 'recognition',
    es: c.es,
    en: c.en,
    word: c.word,
    word_en: c.wordEn,
    note: c.note,
    prompt: null,
    answer: null,
    accepts: null,
    concept: null,
    source: 'generated',
    step: 0,
    due: nowIso(),
    seen: 0,
    deleted_at: null,
    updated_at: nowIso(),
  }));
  await putCards(cards);
  return cards.length;
}
