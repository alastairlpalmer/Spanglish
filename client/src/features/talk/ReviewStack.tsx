// End-of-conversation corrections as a reviewable stack, one at a time — a
// wall of nineteen mistakes is unreadable; nineteen cards is a debrief.

import { useState } from 'react';
import type { ReviewResponse } from '@seiscientas/shared';
import { addWordPair } from '../cards/createCards';

// Words the learner reached for and didn't have, mined from the conversation.
// Each one is a proven gap — one tap turns it into a card pair.
function MissingWords({
  words,
  userId,
}: {
  words: ReviewResponse['missingWords'];
  userId: string;
}): JSX.Element | null {
  const [added, setAdded] = useState<Set<number>>(new Set());
  if (words.length === 0) return null;
  return (
    <div className="panel stack" style={{ gap: 8 }}>
      <p className="eyebrow">words you were missing</p>
      {words.map((w, i) => (
        <div key={i} className="row" style={{ minHeight: 32, padding: 0 }}>
          <span style={{ fontSize: 14 }}>
            <span lang="es" style={{ color: 'var(--ochre)' }}>
              {w.es}
            </span>{' '}
            <span className="muted">— {w.en}</span>
          </span>
          {added.has(i) ? (
            <span className="mono muted" style={{ fontSize: 11 }}>
              in the deck
            </span>
          ) : (
            <button
              className="btn quiet"
              onClick={() =>
                void addWordPair({
                  userId,
                  es: w.es,
                  en: w.en,
                  note: 'You needed this word in a conversation and did not have it.',
                }).then(() => setAdded((s) => new Set(s).add(i)))
              }
            >
              add to deck
            </button>
          )}
        </div>
      ))}
    </div>
  );
}

export function ReviewStack({
  review,
  userId,
  onClose,
}: {
  review: ReviewResponse;
  userId: string;
  onClose: () => void;
}): JSX.Element {
  const [index, setIndex] = useState(0);
  const total = review.errors.length;

  if (total === 0) {
    return (
      <div className="stack">
        <p>Nothing to correct from this conversation.</p>
        <MissingWords words={review.missingWords} userId={userId} />
        <button className="btn primary block" onClick={onClose}>
          Done
        </button>
      </div>
    );
  }

  const current = review.errors[index];

  if (!current) {
    return (
      <div className="stack">
        {review.worstHabit && (
          <div className="panel">
            <p className="eyebrow">the habit costing you most</p>
            <p>{review.worstHabit}</p>
          </div>
        )}
        <MissingWords words={review.missingWords} userId={userId} />
        <button className="btn primary block" onClick={onClose}>
          Done
        </button>
      </div>
    );
  }

  return (
    <div className="stack">
      <p className="queue-count mono">
        {index + 1} / {total}
      </p>
      <div className="panel stack">
        <p style={{ color: 'var(--clay)' }} lang="es">
          {current.wrong}
        </p>
        <p style={{ color: 'var(--sage)' }} lang="es">
          {current.right}
        </p>
        <p className="muted">{current.why}</p>
        <p className="eyebrow">{current.concept}</p>
      </div>
      <button className="btn primary block" onClick={() => setIndex(index + 1)}>
        Next
      </button>
    </div>
  );
}
