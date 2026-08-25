import { describe, expect, it } from 'vitest';
import { bucketMastery } from './buckets';
import { cardScope, isPhraseCard, PHRASE_UNLOCK_STEP, unlockablePhrases } from './phrases';
import type { PhraseSourceRow } from './phrases';

const row = (over: Partial<PhraseSourceRow>): PhraseSourceRow => ({
  bucket: 'home',
  word: 'mesa',
  es: 'La mesa está en la cocina.',
  en: 'The table is in the kitchen.',
  note: 'feminine',
  direction: 'recognition',
  step: PHRASE_UNLOCK_STEP,
  scope: 'word',
  deleted_at: null,
  ...over,
});

const pair = (over: Partial<PhraseSourceRow> = {}): PhraseSourceRow[] => [
  row({ direction: 'recognition', ...over }),
  row({ direction: 'production', es: 'mesa', en: 'table', ...over }),
];

describe('cardScope', () => {
  it('reads a missing or null scope as word', () => {
    expect(cardScope({})).toBe('word');
    expect(cardScope({ scope: null })).toBe('word');
    expect(isPhraseCard({ scope: null })).toBe(false);
    expect(isPhraseCard({ scope: 'phrase' })).toBe(true);
  });
});

describe('unlockablePhrases', () => {
  it('offers a mastered word its sentence', () => {
    const out = unlockablePhrases(pair());
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({
      bucket: 'home',
      word: 'mesa',
      es: 'La mesa está en la cocina.',
      en: 'The table is in the kitchen.',
    });
  });

  it('holds back a word mastered in only one direction', () => {
    expect(unlockablePhrases(pair({ direction: 'production', step: 1 }))).toHaveLength(0);
    const oneSided = [
      row({ direction: 'recognition' }),
      row({ direction: 'production', step: PHRASE_UNLOCK_STEP - 1 }),
    ];
    expect(unlockablePhrases(oneSided)).toHaveLength(0);
  });

  it('does not offer a word whose phrase already exists', () => {
    const rows = [...pair(), row({ scope: 'phrase', step: 0 })];
    expect(unlockablePhrases(rows)).toHaveLength(0);
  });

  it('skips one-word "sentences" — a mined word has no phrase to teach', () => {
    const mined = pair({ es: 'mesa', en: 'table' });
    expect(unlockablePhrases(mined)).toHaveLength(0);
  });

  it('skips deleted rows', () => {
    expect(unlockablePhrases(pair({ deleted_at: '2026-01-01T00:00:00Z' }))).toHaveLength(0);
  });

  it('orders the longest-held words first', () => {
    const rows = [
      ...pair({ word: 'silla', step: PHRASE_UNLOCK_STEP }),
      ...pair({ word: 'puerta', step: PHRASE_UNLOCK_STEP + 2 }),
    ];
    expect(unlockablePhrases(rows).map((p) => p.word)).toEqual(['puerta', 'silla']);
  });

  it('reads the sentence off the recognition row, not the word-level production row', () => {
    const out = unlockablePhrases(pair());
    expect(out[0]?.es).toBe('La mesa está en la cocina.');
  });
});

describe('bucketMastery ignores the phrase deck', () => {
  it('does not count a phrase card as word progress', () => {
    const rows = [
      { bucket: 'home', word: 'mesa', direction: 'recognition' as const, step: 4, scope: 'phrase', deleted_at: null },
      { bucket: 'home', word: 'mesa', direction: 'production' as const, step: 4, scope: 'phrase', deleted_at: null },
    ];
    expect(bucketMastery(rows).get('home')).toBeUndefined();
  });

  it('a phrase card cannot complete a half-learnt word', () => {
    const rows = [
      { bucket: 'home', word: 'mesa', direction: 'recognition' as const, step: 4, scope: 'word', deleted_at: null },
      { bucket: 'home', word: 'mesa', direction: 'production' as const, step: 4, scope: 'phrase', deleted_at: null },
    ];
    expect(bucketMastery(rows).get('home')).toEqual({ mastered: 0, inProgress: 1 });
  });
});
