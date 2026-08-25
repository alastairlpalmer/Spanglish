import type { BucketSlug, Card, CardsResponse } from '@seiscientas/shared';
import { phaseFor, productionRatio } from '@seiscientas/shared';
import { apiPost } from '../../lib/api';
import { putCards, totalMinutes } from '../../db/repo';
import { db } from '../../db/dexie';
import { uuid } from '../../lib/id';
import { nowIso } from '../../lib/time';

export async function generateCards(opts: {
  userId: string;
  topic?: string;
  bucket?: BucketSlug;
  level: string;
  dialect: string;
}): Promise<number> {
  // Exclude words already in the deck so batches don't repeat. Ordered
  // bucket-first: the 500-word cap must never evict the words that matter
  // most for this batch (intra-bucket dedup always survives; cross-bucket
  // degrades gracefully at scale).
  const existing = await db.cards
    .where('dirty')
    .anyOf(0, 1)
    .and((c) => c.user_id === opts.userId && c.deleted_at === null)
    .toArray();
  const bucketWords: string[] = [];
  const otherWords: string[] = [];
  for (const c of existing) {
    if (!c.word) continue;
    if (opts.bucket && (c.bucket ?? null) === opts.bucket) bucketWords.push(c.word);
    else otherWords.push(c.word);
  }
  const exclude = [...new Set([...bucketWords, ...otherWords])].slice(0, 500);

  const res = await apiPost<CardsResponse>('/api/ai/cards', {
    topic: opts.topic,
    bucket: opts.bucket,
    level: opts.level,
    dialect: opts.dialect,
    count: 20,
    exclude,
  });

  const base = (
    c: CardsResponse['cards'][number],
  ): Omit<Card, 'id' | 'direction' | 'prompt' | 'answer'> => ({
    user_id: opts.userId,
    bucket: opts.bucket ?? null,
    es: c.es,
    en: c.en,
    word: c.word,
    word_en: c.wordEn,
    note: c.note,
    accepts: null,
    concept: null,
    source: 'generated',
    scope: 'word',
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

  // Bucket mastery requires BOTH directions, so bucketed generation creates a
  // production twin for every word. Free/topic generation keeps the
  // phase-derived ratio (production rises as the learner advances).
  let productionSource = res.cards;
  if (!opts.bucket) {
    const ratio = productionRatio(phaseFor((await totalMinutes(opts.userId)) / 60));
    productionSource = res.cards.slice(0, Math.round(res.cards.length * ratio));
  }

  for (const c of productionSource) {
    cards.push({
      ...base(c),
      id: uuid(),
      direction: 'production',
      // The WORD, not the sentence. Producing the whole sentence is phrase
      // work — a different exercise, on its own deck, unlocked once the word
      // is mastered. Mixing it in here is what turned a five-minute vocabulary
      // break into three slow translations.
      prompt: c.wordEn,
      answer: c.word,
      // Production comes due a day after its recognition twin, so the learner
      // meets the word before being asked to produce it.
      due: new Date(Date.now() + 86_400_000).toISOString(),
    });
  }

  await putCards(cards);
  return cards.length;
}
