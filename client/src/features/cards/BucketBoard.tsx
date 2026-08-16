// The vocabulary board: overall mastery bar, one row per bucket, and the
// mixed due-queue review as the primary action. Renders entirely from Dexie
// — the board must work on a train with no signal.

import {
  BUCKET_DEFS,
  CORE_BUCKETS,
  EXTRA_BUCKETS,
  type BucketProgress,
  type BucketSlug,
} from '@seiscientas/shared';
import type { BucketStats } from './useBucketStats';
import { useProfile } from '../../shell/ProfileContext';

function Bar({ progress, target }: { progress: BucketProgress | undefined; target: number }): JSX.Element {
  const mastered = progress?.mastered ?? 0;
  const learning = mastered + (progress?.inProgress ?? 0);
  return (
    <div className="mastery-bar">
      <div className="learning" style={{ width: `${Math.min(100, (learning / target) * 100)}%` }} />
      <div className="mastered" style={{ width: `${Math.min(100, (mastered / target) * 100)}%` }} />
    </div>
  );
}

export function BucketBoard({
  stats,
  dueCount,
  activeBuckets,
  onReview,
  onOpenBucket,
}: {
  stats: BucketStats;
  dueCount: number;
  activeBuckets: BucketSlug[];
  onReview: () => void;
  onOpenBucket: (slug: BucketSlug) => void;
}): JSX.Element {
  const { profile, update } = useProfile();
  const activated = new Set(profile.extra_buckets ?? []);

  async function toggleExtra(slug: BucketSlug): Promise<void> {
    const next = activated.has(slug)
      ? [...activated].filter((s) => s !== slug)
      : [...activated, slug];
    await update({ extra_buckets: next });
  }

  const { overall } = stats;

  return (
    <div className="stack">
      <button className="btn primary block" disabled={dueCount === 0} onClick={onReview}>
        {dueCount > 0 ? `Review ${dueCount} due` : 'Queue clear'}
      </button>

      <div className="panel stack" style={{ gap: 4 }}>
        <div className="row" style={{ padding: 0, minHeight: 0 }}>
          <span className="eyebrow">vocabulary</span>
          <span className="mono" style={{ fontSize: 12 }}>
            {overall.mastered} / {overall.targetTotal}
          </span>
        </div>
        <Bar
          progress={{ mastered: overall.mastered, inProgress: overall.inProgress }}
          target={overall.targetTotal}
        />
        <p className="muted" style={{ fontSize: 12 }}>
          solid = confident both ways · faint = in training
        </p>

        {activeBuckets.map((slug) => {
          const b = BUCKET_DEFS[slug];
          const p = stats.perBucket.get(slug);
          return (
            <button key={slug} className="bucket-row" onClick={() => onOpenBucket(slug)}>
              <div className="row-top">
                <span className="name">{b.label}</span>
                <span className="counts">
                  {p?.mastered ?? 0}
                  {(p?.inProgress ?? 0) > 0 ? ` +${p!.inProgress}` : ''} / {b.target}
                </span>
              </div>
              <Bar progress={p} target={b.target} />
            </button>
          );
        })}

        {stats.generalCount > 0 && (
          <div className="row" style={{ minHeight: 32 }}>
            <span className="muted" style={{ fontSize: 14 }}>
              General (mined + early cards)
            </span>
            <span className="mono" style={{ fontSize: 12 }}>
              {stats.generalCount} cards
            </span>
          </div>
        )}
      </div>

      <div className="panel stack" style={{ gap: 8 }}>
        <p className="eyebrow">interests</p>
        <div className="reading-controls" style={{ margin: 0 }}>
          {EXTRA_BUCKETS.map((slug) => (
            <button
              key={slug}
              className="toggle"
              style={activated.has(slug) ? { borderColor: 'var(--ochre)', color: 'var(--ochre)' } : undefined}
              onClick={() => void toggleExtra(slug)}
            >
              {BUCKET_DEFS[slug].label.toLowerCase()}
            </button>
          ))}
        </div>
        <p className="muted" style={{ fontSize: 12 }}>
          Activate an interest to add its 100 words to the board.
        </p>
      </div>
    </div>
  );
}

export function activeBucketList(extraBuckets: string[] | null, perBucket: Map<string | null, BucketProgress>): BucketSlug[] {
  const active: BucketSlug[] = [...CORE_BUCKETS];
  for (const slug of EXTRA_BUCKETS) {
    // Activated extras show; so does any extra that already has cards
    // (covers deactivation after generation and old-profile nulls).
    if (extraBuckets?.includes(slug) || perBucket.has(slug)) active.push(slug);
  }
  return active;
}
