import { useCallback, useEffect, useState } from 'react';
import {
  BUCKETS,
  BUCKET_DEFS,
  bucketMastery,
  isPhraseCard,
  type BucketProgress,
  type BucketSlug,
} from '@seiscientas/shared';
import { db } from '../../db/dexie';

export interface BucketStats {
  perBucket: Map<string | null, BucketProgress>;
  generalCount: number;
  loading: boolean;
  refresh: () => Promise<void>;
}

export interface OverallMastery {
  mastered: number;
  inProgress: number;
  targetTotal: number;
}

/** Overall totals over the FINAL rendered bucket list — computed by the
 *  caller so the header bar always sums exactly the rows shown beneath it. */
export function overallMastery(
  perBucket: Map<string | null, BucketProgress>,
  activeBuckets: BucketSlug[],
): OverallMastery {
  const overall: OverallMastery = { mastered: 0, inProgress: 0, targetTotal: 0 };
  for (const slug of activeBuckets) {
    overall.targetTotal += BUCKET_DEFS[slug].target;
    const p = perBucket.get(slug);
    if (p) {
      overall.mastered += p.mastered;
      overall.inProgress += p.inProgress;
    }
  }
  return overall;
}

/** Board data: one indexed query over bucketed cards + a count for the
 *  general pseudo-bucket. Refreshed explicitly (after grading/generation),
 *  never per render. */
export function useBucketStats(userId: string): BucketStats {
  const [perBucket, setPerBucket] = useState<Map<string | null, BucketProgress>>(new Map());
  const [generalCount, setGeneralCount] = useState(0);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    // The board counts words. Phrase cards are excluded from both sides of
    // the general subtraction, or a general-bucket sentence would show up as
    // vocabulary the learner never added.
    const bucketed = await db.cards
      .where('bucket')
      .anyOf([...BUCKETS])
      .and((c) => c.user_id === userId && c.deleted_at === null && !isPhraseCard(c))
      .toArray();
    setPerBucket(bucketMastery(bucketed));
    const total = await db.cards
      .filter((c) => c.user_id === userId && c.deleted_at === null && !isPhraseCard(c))
      .count();
    setGeneralCount(total - bucketed.length);
    setLoading(false);
  }, [userId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return { perBucket, generalCount, loading, refresh };
}
