// Minting phrase cards from mastered words. The sentence is already on the
// recognition row — no AI call, no new vocabulary, just the sentence the word
// was taught in, promoted to its own deck once the word is solid both ways.

import type { Card, PhraseUnlock } from '@seiscientas/shared';
import { unlockablePhrases } from '@seiscientas/shared';
import { db } from '../../db/dexie';
import { putCards } from '../../db/repo';
import { uuid } from '../../lib/id';
import { nowIso } from '../../lib/time';

/** Mastered words whose sentence has not been unlocked yet. */
export async function pendingPhrases(userId: string): Promise<PhraseUnlock[]> {
  const rows = await db.cards
    .filter((c) => c.user_id === userId && c.deleted_at === null)
    .toArray();
  return unlockablePhrases(rows);
}

/** Mint recognition + production phrase cards for each unlock. Production
 *  trails by a day, the same rhythm the vocabulary deck uses. */
export async function unlockPhrases(userId: string, unlocks: PhraseUnlock[]): Promise<number> {
  const cards: Card[] = [];
  for (const u of unlocks) {
    const base: Omit<Card, 'id' | 'direction' | 'prompt' | 'answer' | 'due'> = {
      user_id: userId,
      bucket: u.bucket,
      es: u.es,
      en: u.en,
      word: u.word,
      word_en: null,
      note: u.note,
      accepts: null,
      concept: null,
      source: 'generated',
      scope: 'phrase',
      step: 0,
      seen: 0,
      deleted_at: null,
      updated_at: nowIso(),
    };
    cards.push({
      ...base,
      id: uuid(),
      direction: 'recognition',
      prompt: null,
      answer: null,
      due: nowIso(),
    });
    cards.push({
      ...base,
      id: uuid(),
      direction: 'production',
      prompt: u.en,
      answer: u.es,
      due: new Date(Date.now() + 86_400_000).toISOString(),
    });
  }
  if (cards.length > 0) await putCards(cards);
  return cards.length;
}
