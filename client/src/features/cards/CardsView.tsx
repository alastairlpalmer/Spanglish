// Cards tab: a vocabulary board of life-area buckets over the SM-2 review
// queue. The mixed due queue stays the primary daily action; buckets are the
// map of territory taken and the door to getting ahead.

import { useEffect, useMemo, useState } from 'react';
import type { BucketSlug } from '@seiscientas/shared';
import { useQueue } from './useQueue';
import { useBucketStats } from './useBucketStats';
import { BucketBoard, activeBucketList } from './BucketBoard';
import { BucketView } from './BucketView';
import { ReviewQueue } from './ReviewQueue';
import { generateCards } from './generate';
import { initCheckResolution } from './checks';
import { friendlyApiError } from '../../lib/api';
import { useProfile } from '../../shell/ProfileContext';
import { useSessionTimer } from '../../session/useSessionTimer';

type Mode = { kind: 'board' } | { kind: 'review' } | { kind: 'bucket'; slug: BucketSlug };

export function CardsView({ userId, online }: { userId: string; online: boolean }): JSX.Element {
  const { profile } = useProfile();
  const { queue, totalDue, loading, refresh } = useQueue(userId);
  const activeForStats = useMemo(
    () => activeBucketList(profile.extra_buckets, new Map()),
    [profile.extra_buckets],
  );
  const stats = useBucketStats(userId, activeForStats);
  // Recompute active list once stats exist so extras with cards always show.
  const activeBuckets = useMemo(
    () => activeBucketList(profile.extra_buckets, stats.perBucket),
    [profile.extra_buckets, stats.perBucket],
  );

  // The board is home; the daily review is one tap ("Review N due").
  const [mode, setMode] = useState<Mode>({ kind: 'board' });
  const [topic, setTopic] = useState('');
  const [generating, setGenerating] = useState(false);
  const [genError, setGenError] = useState<string | null>(null);

  useSessionTimer(userId, 'cards', profile.daily_minutes);

  useEffect(() => {
    initCheckResolution(userId);
  }, [userId]);

  async function afterChange(): Promise<void> {
    await refresh();
    await stats.refresh();
  }

  async function generateFree(): Promise<void> {
    setGenerating(true);
    setGenError(null);
    try {
      await generateCards({
        userId,
        topic: topic.trim() || undefined,
        level: profile.level,
        dialect: profile.dialect,
      });
      setTopic('');
      await afterChange();
    } catch (e) {
      setGenError(friendlyApiError(e, 'Generation failed. Retry.'));
    } finally {
      setGenerating(false);
    }
  }

  if (loading) return <p className="muted">loading</p>;

  if (mode.kind === 'review') {
    return (
      <div className="stack">
        <div className="row" style={{ minHeight: 0 }}>
          <span className="eyebrow">daily review</span>
          <button className="btn quiet" onClick={() => setMode({ kind: 'board' })}>
            buckets
          </button>
        </div>
        <ReviewQueue
          userId={userId}
          queue={queue}
          totalDue={totalDue}
          refresh={afterChange}
          onExhausted={() => setMode({ kind: 'board' })}
        />
      </div>
    );
  }

  if (mode.kind === 'bucket') {
    return (
      <BucketView
        userId={userId}
        slug={mode.slug}
        online={online}
        dueCount={totalDue}
        onBack={() => setMode({ kind: 'board' })}
        onChanged={afterChange}
      />
    );
  }

  return (
    <div className="stack">
      <BucketBoard
        stats={stats}
        dueCount={totalDue}
        activeBuckets={activeBuckets}
        onReview={() => setMode({ kind: 'review' })}
        onOpenBucket={(slug) => setMode({ kind: 'bucket', slug })}
      />

      {/* Free-topic generation stays for one-off topics outside the buckets. */}
      {online && (
        <div className="panel stack">
          <p className="eyebrow">free topic</p>
          <input
            value={topic}
            onChange={(e) => setTopic(e.target.value)}
            placeholder="Any topic, or leave blank for high-frequency words"
          />
          <button className="btn block" disabled={generating} onClick={() => void generateFree()}>
            {generating ? 'finding words' : 'Generate 20 cards'}
          </button>
          {genError && <p className="error-line">{genError}</p>}
        </div>
      )}
    </div>
  );
}
