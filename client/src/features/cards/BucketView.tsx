// One bucket: its mastery bar, learn-new-words, review-ahead when the daily
// queue is clear, and the in-progress word list (hardest first).

import { useCallback, useEffect, useState } from 'react';
import {
  BUCKET_DEFS,
  bucketMastery,
  bucketWords,
  type BucketSlug,
  type BucketWord,
  type Card,
} from '@seiscientas/shared';
import { db } from '../../db/dexie';
import { friendlyApiError } from '../../lib/api';
import { useProfile } from '../../shell/ProfileContext';
import { generateCards } from './generate';
import { ReviewQueue } from './ReviewQueue';

const AHEAD_DAYS = 7;

export function BucketView({
  userId,
  slug,
  online,
  dueCount,
  onBack,
  onChanged,
}: {
  userId: string;
  slug: BucketSlug;
  online: boolean;
  /** Size of the main mixed due queue — review-ahead only offers itself once
   *  the day's real work is done. */
  dueCount: number;
  onBack: () => void;
  onChanged: () => Promise<void>;
}): JSX.Element {
  const { profile } = useProfile();
  const [words, setWords] = useState<BucketWord[]>([]);
  const [mastered, setMastered] = useState(0);
  const [generating, setGenerating] = useState(false);
  const [genError, setGenError] = useState<string | null>(null);
  const [ahead, setAhead] = useState<Card[] | null>(null);

  const def = BUCKET_DEFS[slug];

  const refresh = useCallback(async () => {
    const rows = await db.cards
      .where('bucket')
      .equals(slug)
      .and((c) => c.user_id === userId && c.deleted_at === null)
      .toArray();
    setWords(bucketWords(rows, slug));
    setMastered(bucketMastery(rows).get(slug)?.mastered ?? 0);
  }, [slug, userId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  async function learn(): Promise<void> {
    setGenerating(true);
    setGenError(null);
    try {
      await generateCards({ userId, bucket: slug, level: profile.level, dialect: profile.dialect });
      await refresh();
      await onChanged();
    } catch (e) {
      setGenError(friendlyApiError(e, 'Generation failed. Retry.'));
    } finally {
      setGenerating(false);
    }
  }

  const loadAhead = useCallback(async () => {
    const horizon = new Date(Date.now() + AHEAD_DAYS * 86_400_000).toISOString();
    const cards = await db.cards
      .where('bucket')
      .equals(slug)
      .and((c) => c.user_id === userId && c.deleted_at === null && c.due <= horizon)
      .sortBy('due');
    setAhead(cards);
  }, [slug, userId]);

  if (ahead !== null) {
    return (
      <div className="stack">
        <div className="row" style={{ minHeight: 0 }}>
          <span className="eyebrow">get ahead — {def.label.toLowerCase()}</span>
          <button className="btn quiet" onClick={() => setAhead(null)}>
            back
          </button>
        </div>
        {ahead.length === 0 ? (
          <p className="muted">Nothing due in the next {AHEAD_DAYS} days here.</p>
        ) : (
          <ReviewQueue
            userId={userId}
            queue={ahead}
            refresh={loadAhead}
            onExhausted={() => {
              setAhead(null);
              void refresh();
              void onChanged();
            }}
          />
        )}
      </div>
    );
  }

  const inProgress = words.length - mastered;

  return (
    <div className="stack">
      <div className="row" style={{ minHeight: 0 }}>
        <span className="eyebrow">{def.label.toLowerCase()}</span>
        <button className="btn quiet" onClick={onBack}>
          back
        </button>
      </div>

      <div className="panel stack" style={{ gap: 6 }}>
        <div className="row" style={{ padding: 0, minHeight: 0 }}>
          <span className="mono" style={{ fontSize: 22 }}>
            {mastered} / {def.target}
          </span>
          <span className="muted" style={{ fontSize: 12 }}>
            {inProgress} in training
          </span>
        </div>
        <div className="mastery-bar">
          <div
            className="learning"
            style={{ width: `${Math.min(100, (words.length / def.target) * 100)}%` }}
          />
          <div
            className="mastered"
            style={{ width: `${Math.min(100, (mastered / def.target) * 100)}%` }}
          />
        </div>
      </div>

      {online ? (
        <button className="btn primary block" disabled={generating} onClick={() => void learn()}>
          {generating ? 'finding words' : 'Learn 20 new words'}
        </button>
      ) : (
        <p className="muted" style={{ fontSize: 13 }}>
          New words need a connection.
        </p>
      )}
      {genError && <p className="error-line">{genError}</p>}

      {dueCount === 0 && words.length > 0 && (
        <button className="btn block" onClick={() => void loadAhead()}>
          Get ahead — review this bucket early
        </button>
      )}

      {words.length > 0 && (
        <div className="panel stack" style={{ gap: 2 }}>
          <p className="eyebrow">words</p>
          {words.map((w) => (
            <div className="row" key={w.word} style={{ minHeight: 30, padding: '2px 0' }}>
              <span lang="es" style={{ fontSize: 14, color: w.mastered ? 'var(--sage)' : 'var(--paper)' }}>
                {w.word}
              </span>
              <span className="mono muted" style={{ fontSize: 11 }}>
                {w.mastered ? '✓' : `${w.recognitionStep ?? '–'}·${w.productionStep ?? '–'}`}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
