import type { Card, CardsResponse } from '@seiscientas/shared';
import { phaseFor, productionRatio } from '@seiscientas/shared';
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
    count: 20,
    exclude: exclude.slice(-500),
  });

  const base = (c: CardsResponse['cards'][number]): Omit<Card, 'id' | 'direction' | 'prompt' | 'answer'> => ({
    user_id: opts.userId,
    es: c.es,
    en: c.en,
    word: c.word,
    word_en: c.wordEn,
    note: c.note,
    accepts: null,
    concept: null,
    source: 'generated',
    step: 0,
    due: nowIso(),
    seen: 0,
    deleted_at: null,
    updated_at: nowIso(),
  });

  const cards: Card[] = res.cards.map((c) => ({
    ...base(c),
    id: uuid(),
    direction: 'recognition',
    prompt: null,
    answer: null,
  }));

  // Production counterparts for a phase-derived share of the batch: the
  // learner sees the English and must produce the Spanish. Automatic, not a
  // setting (spec §6) — production rises with phase.
  const totalMinutes = (
    await db.sessions.where('at').aboveOrEqual('').and((s) => s.user_id === opts.userId).toArray()
  ).reduce((sum, s) => sum + s.minutes, 0);
  const ratio = productionRatio(phaseFor(totalMinutes / 60));
  const productionCount = Math.round(res.cards.length * ratio);

  for (const c of res.cards.slice(0, productionCount)) {
    cards.push({
      ...base(c),
      id: uuid(),
      direction: 'production',
      prompt: c.en,
      answer: c.es,
      // Production is due a day later than its recognition twin, so the
      // learner meets the word before being asked to produce it.
      due: new Date(Date.now() + 86_400_000).toISOString(),
    });
  }

  await putCards(cards);
  return cards.length;
}
