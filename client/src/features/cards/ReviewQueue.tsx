// The review surface, extracted from CardsView: swipe/production grading,
// the 40ms visual pulse (no Vibration API on iOS Safari), and the set-of-10
// breathing breaks. Works on any card list — the daily due queue or a
// bucket's review-ahead queue.
//
// Every grade shows its consequence ("next: in 3 days" / "back in 8 min") and
// can be undone for a few seconds — one mis-swipe must not silently reset a
// 16-day card. Crossing into mastery (both directions at MASTERY_STEP) gets
// its own moment: it is the payoff of the whole bucket system.

import { useEffect, useRef, useState } from 'react';
import type { Card } from '@seiscientas/shared';
import { MASTERY_STEP, isPhraseCard, scheduleCard } from '@seiscientas/shared';
import { SwipeCard } from './SwipeCard';
import { ProductionCard } from './ProductionCard';
import { putCard } from '../../db/repo';
import { db } from '../../db/dexie';
import { useProfile } from '../../shell/ProfileContext';

const NOTICE_MS = 4000;

const prefersReducedMotion = (): boolean =>
  window.matchMedia('(prefers-reduced-motion: reduce)').matches;

interface Notice {
  text: string;
  kind: 'got' | 'miss' | 'mastery';
  /** Pre-grade snapshot; undo writes it straight back. */
  prev: Card;
}

function scheduleText(dueIso: string): string {
  // Calendar days, not 24h buckets: a card due at tomorrow's midnight is
  // "tomorrow" even when that is nine hours away.
  const due = new Date(dueIso);
  const now = new Date();
  const days = Math.round(
    (new Date(due.getFullYear(), due.getMonth(), due.getDate()).getTime() -
      new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()) /
      86_400_000,
  );
  if (days <= 0) return '✓ next: later today';
  if (days === 1) return '✓ next: tomorrow';
  return `✓ next: in ${days} days`;
}

/** Did this grade just complete the pair? Only runs on the rare step-4
 *  crossing, so the unindexed scan is fine. */
async function crossedMastery(card: Card, newStep: number): Promise<boolean> {
  if (newStep < MASTERY_STEP || card.step >= MASTERY_STEP || !card.word) return false;
  const key = card.word.trim().toLowerCase();
  const other = card.direction === 'recognition' ? 'production' : 'recognition';
  const twin = await db.cards
    .filter(
      (c) =>
        c.user_id === card.user_id &&
        c.deleted_at === null &&
        c.direction === other &&
        // Same deck: a phrase card shares its word with the vocabulary card it
        // came from, and without this the sentence would re-announce a mastery
        // the word earned weeks earlier.
        isPhraseCard(c) === isPhraseCard(card) &&
        (c.bucket ?? null) === (card.bucket ?? null) &&
        !!c.word &&
        c.word.trim().toLowerCase() === key &&
        c.step >= MASTERY_STEP,
    )
    .first();
  return twin !== undefined;
}

export function ReviewQueue({
  userId,
  queue,
  totalDue,
  refresh,
  onRestore,
  onExhausted,
}: {
  userId: string;
  queue: Card[];
  /** Full backlog behind the capped window; shown as "N of M due" when it
   *  exceeds the window so the count visibly shrinks with every grade. */
  totalDue?: number;
  refresh: () => Promise<void>;
  /** Snapshot queues (test-me-now, get-ahead) drop the head on refresh, so
   *  undo needs the parent to put the restored card back. Re-query queues
   *  can omit this — refresh() re-admits the restored card by its due. */
  onRestore?: (card: Card) => void;
  /** Called when the queue empties (label decides what "done" leads to). */
  onExhausted: () => void;
}): JSX.Element {
  const { profile } = useProfile();
  const [pulse, setPulse] = useState(false);
  const [gradedInSet, setGradedInSet] = useState(0);
  const [setBreak, setSetBreak] = useState(false);
  const [notice, setNotice] = useState<Notice | null>(null);
  const reducedMotion = useRef(prefersReducedMotion());

  const current = queue[0] ?? null;
  const backlog = Math.max(totalDue ?? queue.length, queue.length);
  const dueLabel = backlog > queue.length ? `${queue.length} of ${backlog} due` : `${queue.length} due`;

  useEffect(() => {
    if (!pulse) return;
    const t = setTimeout(() => setPulse(false), 60);
    return () => clearTimeout(t);
  }, [pulse]);

  useEffect(() => {
    if (!notice) return;
    const t = setTimeout(() => setNotice(null), NOTICE_MS);
    return () => clearTimeout(t);
  }, [notice]);

  useEffect(() => {
    if (!current) onExhausted();
  }, [current, onExhausted]);

  async function grade(g: 'got' | 'miss'): Promise<void> {
    if (!current) return;
    const prev = { ...current };
    const result = scheduleCard(current, g, new Date());
    await putCard({ ...current, ...result });
    setPulse(true);

    if (g === 'miss') {
      setNotice({ text: '✗ back in 8 min', kind: 'miss', prev });
    } else if (await crossedMastery(prev, result.step)) {
      setNotice({
        text: isPhraseCard(prev)
          ? '★ sentence held both ways'
          : `★ ${prev.word} — confident both ways`,
        kind: 'mastery',
        prev,
      });
    } else {
      setNotice({ text: scheduleText(result.due), kind: 'got', prev });
    }

    const graded = gradedInSet + 1;
    setGradedInSet(graded);
    if (graded % 10 === 0) setSetBreak(true);
    await refresh();
  }

  async function undoLast(): Promise<void> {
    if (!notice) return;
    await putCard(notice.prev);
    setNotice(null);
    setGradedInSet((g) => Math.max(0, g - 1));
    setSetBreak(false);
    if (onRestore) onRestore(notice.prev);
    else await refresh();
  }

  const noticeBar = notice && (
    <div className="grade-notice">
      <span
        style={{
          color:
            notice.kind === 'miss'
              ? 'var(--clay)'
              : notice.kind === 'mastery'
                ? 'var(--ochre)'
                : 'var(--sage)',
        }}
      >
        {notice.text}
      </span>
      <button className="btn quiet" onClick={() => void undoLast()}>
        undo
      </button>
    </div>
  );

  if (!current) return <></>;

  if (setBreak) {
    return (
      <div className="stack">
        {noticeBar}
        <div className="panel" style={{ textAlign: 'center' }}>
          <p className="mono">{gradedInSet} reviewed</p>
          <p className="muted" style={{ fontSize: 14 }}>
            {backlog} still due
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
      <p className="queue-count mono">{dueLabel}</p>
      {noticeBar}
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
            // Presentation follows the card's deck, not the learner's level.
            // A word card is always the bare word — at every level, because
            // that is the exercise. Sentence exposure is the phrase deck's job.
            wordFirst={!isPhraseCard(current)}
            listenFirst={isPhraseCard(current) && !profile.quiet_mode}
            leech={current.seen >= 6 && current.step <= 1}
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
