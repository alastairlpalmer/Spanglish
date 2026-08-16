// The review surface, extracted from CardsView: swipe/production grading,
// the 40ms visual pulse (no Vibration API on iOS Safari), and the set-of-10
// breathing breaks. Works on any card list — the daily due queue or a
// bucket's review-ahead queue.

import { useEffect, useRef, useState } from 'react';
import type { Card } from '@seiscientas/shared';
import { isBeginner, scheduleCard } from '@seiscientas/shared';
import { SwipeCard } from './SwipeCard';
import { ProductionCard } from './ProductionCard';
import { putCard } from '../../db/repo';
import { useProfile } from '../../shell/ProfileContext';

const prefersReducedMotion = (): boolean =>
  window.matchMedia('(prefers-reduced-motion: reduce)').matches;

export function ReviewQueue({
  userId,
  queue,
  refresh,
  onExhausted,
}: {
  userId: string;
  queue: Card[];
  refresh: () => Promise<void>;
  /** Called when the queue empties (label decides what "done" leads to). */
  onExhausted: () => void;
}): JSX.Element {
  const { profile } = useProfile();
  const [pulse, setPulse] = useState(false);
  const [gradedInSet, setGradedInSet] = useState(0);
  const [setBreak, setSetBreak] = useState(false);
  const reducedMotion = useRef(prefersReducedMotion());

  const current = queue[0] ?? null;

  useEffect(() => {
    if (!pulse) return;
    const t = setTimeout(() => setPulse(false), 60);
    return () => clearTimeout(t);
  }, [pulse]);

  useEffect(() => {
    if (!current) onExhausted();
  }, [current, onExhausted]);

  async function grade(g: 'got' | 'miss'): Promise<void> {
    if (!current) return;
    const result = scheduleCard(current, g, new Date());
    await putCard({ ...current, ...result });
    setPulse(true);
    const graded = gradedInSet + 1;
    setGradedInSet(graded);
    if (graded % 10 === 0) setSetBreak(true);
    await refresh();
  }

  if (!current) return <></>;

  if (setBreak) {
    return (
      <div className="stack">
        <div className="panel" style={{ textAlign: 'center' }}>
          <p className="mono">{gradedInSet} reviewed</p>
          <p className="muted" style={{ fontSize: 14 }}>
            {queue.length} still due
          </p>
        </div>
        <button className="btn primary block" onClick={() => setSetBreak(false)}>
          Next 10
        </button>
      </div>
    );
  }

  return (
    <div className={pulse ? 'pulse' : ''}>
      <p className="queue-count mono">{queue.length} due</p>
      <div className="card-stage">
        {current.direction === 'production' ? (
          <ProductionCard
            key={current.id}
            card={current}
            userId={userId}
            quietMode={profile.quiet_mode}
            dialect={profile.dialect}
            onGrade={(g) => void grade(g)}
          />
        ) : (
          <SwipeCard
            key={current.id}
            card={current}
            quietMode={profile.quiet_mode}
            dialect={profile.dialect}
            wordFirst={isBeginner(profile.level)}
            reducedMotion={reducedMotion.current}
            onGrade={(g) => void grade(g)}
          />
        )}
      </div>
      {current.direction === 'recognition' && (
        <div className="grade-row">
          <button className="btn" style={{ borderColor: 'var(--clay)' }} onClick={() => void grade('miss')}>
            Missed it
          </button>
          <button className="btn" style={{ borderColor: 'var(--sage)' }} onClick={() => void grade('got')}>
            Knew it
          </button>
        </div>
      )}
    </div>
  );
}
