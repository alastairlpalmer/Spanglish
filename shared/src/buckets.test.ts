import { describe, it, expect } from 'vitest';
import {
  BUCKETS,
  BUCKET_DEFS,
  CORE_BUCKETS,
  EXTRA_BUCKETS,
  MASTERY_STEP,
  bucketMastery,
  bucketWords,
  isBucketSlug,
  type BucketCardRow,
} from './buckets';

const row = (over: Partial<BucketCardRow>): BucketCardRow => ({
  bucket: 'home',
  word: 'estufa',
  direction: 'recognition',
  step: 0,
  deleted_at: null,
  ...over,
});

describe('bucket taxonomy', () => {
  it('has 12 core + 4 extra unique slugs, all defined', () => {
    expect(CORE_BUCKETS.length).toBe(12);
    expect(EXTRA_BUCKETS.length).toBe(4);
    expect(new Set(BUCKETS).size).toBe(16);
    for (const slug of BUCKETS) {
      expect(BUCKET_DEFS[slug].slug).toBe(slug);
      expect(BUCKET_DEFS[slug].target).toBeGreaterThan(0);
      expect(BUCKET_DEFS[slug].hint.length).toBeGreaterThan(10);
    }
    expect(isBucketSlug('home')).toBe(true);
    expect(isBucketSlug('invented')).toBe(false);
    expect(isBucketSlug(null)).toBe(false);
  });
});

describe('bucketMastery', () => {
  it('masters a word only when both directions reach the mastery step', () => {
    const rows = [
      row({ direction: 'recognition', step: MASTERY_STEP }),
      row({ direction: 'production', step: MASTERY_STEP }),
    ];
    expect(bucketMastery(rows).get('home')).toEqual({ mastered: 1, inProgress: 0 });
  });

  it('one direction alone is in progress, even at max step', () => {
    const rows = [row({ direction: 'recognition', step: 6 })];
    expect(bucketMastery(rows).get('home')).toEqual({ mastered: 0, inProgress: 1 });
  });

  it('unbalanced directions are in progress', () => {
    const rows = [
      row({ direction: 'recognition', step: 6 }),
      row({ direction: 'production', step: 3 }),
    ];
    expect(bucketMastery(rows).get('home')).toEqual({ mastered: 0, inProgress: 1 });
  });

  it('ignores deleted twins', () => {
    const rows = [
      row({ direction: 'recognition', step: 5 }),
      row({ direction: 'production', step: 5, deleted_at: '2026-08-01T00:00:00Z' }),
    ];
    expect(bucketMastery(rows).get('home')).toEqual({ mastered: 0, inProgress: 1 });
  });

  it('groups null and undefined buckets together as the general bucket', () => {
    const rows = [
      row({ bucket: null, direction: 'recognition', step: 5 }),
      row({ bucket: undefined, direction: 'production', step: 5 }),
    ];
    expect(bucketMastery(rows).get(null)).toEqual({ mastered: 1, inProgress: 0 });
  });

  it('normalises word keys when pairing directions', () => {
    const rows = [
      row({ word: ' Estufa ', direction: 'recognition', step: 4 }),
      row({ word: 'estufa', direction: 'production', step: 4 }),
    ];
    expect(bucketMastery(rows).get('home')).toEqual({ mastered: 1, inProgress: 0 });
  });

  it('counts the same word independently in two buckets', () => {
    const rows = [
      row({ bucket: 'home', direction: 'recognition', step: 4 }),
      row({ bucket: 'home', direction: 'production', step: 4 }),
      row({ bucket: 'food-drink', direction: 'recognition', step: 1 }),
    ];
    const m = bucketMastery(rows);
    expect(m.get('home')).toEqual({ mastered: 1, inProgress: 0 });
    expect(m.get('food-drink')).toEqual({ mastered: 0, inProgress: 1 });
  });

  it('returns an empty map for no rows', () => {
    expect(bucketMastery([]).size).toBe(0);
  });
});

describe('bucketWords', () => {
  it('lists words hardest-first with per-direction steps', () => {
    const rows = [
      row({ word: 'mesa', direction: 'recognition', step: 4 }),
      row({ word: 'mesa', direction: 'production', step: 4 }),
      row({ word: 'silla', direction: 'recognition', step: 1 }),
      row({ word: 'cocina', direction: 'recognition', step: 2 }),
      row({ word: 'cocina', direction: 'production', step: 3 }),
    ];
    const words = bucketWords(rows, 'home');
    expect(words.map((w) => w.word)).toEqual(['silla', 'cocina', 'mesa']);
    expect(words[0]).toEqual({
      word: 'silla',
      mastered: false,
      recognitionStep: 1,
      productionStep: null,
    });
    expect(words[2]!.mastered).toBe(true);
  });

  it('excludes other buckets and deleted rows', () => {
    const rows = [
      row({ word: 'gol', bucket: 'sports' }),
      row({ word: 'borrada', deleted_at: '2026-08-01T00:00:00Z' }),
      row({ word: 'mesa' }),
    ];
    expect(bucketWords(rows, 'home').map((w) => w.word)).toEqual(['mesa']);
  });
});
