// End-of-conversation corrections as a reviewable stack, one at a time — a
// wall of nineteen mistakes is unreadable; nineteen cards is a debrief.

import { useState } from 'react';
import type { ReviewResponse } from '@seiscientas/shared';

export function ReviewStack({
  review,
  onClose,
}: {
  review: ReviewResponse;
  onClose: () => void;
}): JSX.Element {
  const [index, setIndex] = useState(0);
  const total = review.errors.length;

  if (total === 0) {
    return (
      <div className="stack">
        <p>Nothing to correct from this conversation.</p>
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
