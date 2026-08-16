import { useCallback, useEffect, useState } from 'react';
import {
  BUCKETS,
  BUCKET_DEFS,
  bucketMastery,
  type BucketProgress,
  type BucketSlug,
} from '@seiscientas/shared';
import { db } from '../../db/dexie';

export interface BucketStats {
  perBucket: Map<string | null, BucketProgress>;
  overall: { mastered: number; inProgress: number; targetTotal: number };
  generalCount: number;
  loading: boolean;
  refresh: () => Promise<void>;
}

/** Board data: one indexed query over bucketed cards + a count for the
 *  general pseudo-bucket. Refreshed explicitly (after grading/generation),
 *  never per render. */
export function useBucketStats(userId: string, activeBuckets: BucketSlug[]): BucketStats {
  const [perBucket, setPerBucket] = useState<Map<string | null, BucketProgress>>(new Map());
  const [generalCount, setGeneralCount] = useState(0);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    const bucketed = await db.cards
      .where('bucket')
      .anyOf([...BUCKETS])
      .and((c) => c.user_id === userId && c.deleted_at === null)
      .toArray();
    setPerBucket(bucketMastery(bucketed));
    const total = await db.cards
      .filter((c) => c.user_id === userId && c.deleted_at === null)
      .count();
    setGeneralCount(total - bucketed.length);
    setLoading(false);
  }, [userId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const overall = { mastered: 0, inProgress: 0, targetTotal: 0 };
  for (const slug of activeBuckets) {
    overall.targetTotal += BUCKET_DEFS[slug].target;
    const p = perBucket.get(slug);
    if (p) {
      overall.mastered += p.mastered;
      overall.inProgress += p.inProgress;
    }
  }

  return { perBucket, overall, generalCount, loading, refresh };
}
