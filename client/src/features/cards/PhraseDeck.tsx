// The phrase deck. Sentences you have earned: a word's sentence only enters
// this deck once the word itself is mastered in both directions, so nothing
// here is a wall of unknown vocabulary. Separate from the vocabulary deck on
// purpose — vocabulary is a five-minute break, phrases are a longer sitting.

import { useCallback, useEffect, useState } from 'react';
import type { Card, PhraseUnlock } from '@seiscientas/shared';
import { PHRASE_UNLOCK_STEP } from '@seiscientas/shared';
import { ReviewQueue } from './ReviewQueue';
import { pendingPhrases, unlockPhrases } from './createPhrases';
import { useProfile } from '../../shell/ProfileContext';

// Sentence work is slow. A whole batch at once is how the phrase deck would
// become the thing that blocks the vocabulary deck all over again.
const UNLOCK_BATCH = 5;

export function PhraseDeck({
  userId,
  queue,
  totalDue,
  refresh,
}: {
  userId: string;
  queue: Card[];
  totalDue: number;
  refresh: () => Promise<void>;
}): JSX.Element {
  const { profile } = useProfile();
  const [pending, setPending] = useState<PhraseUnlock[]>([]);
  const [unlocking, setUnlocking] = useState(false);

  const loadPending = useCallback(async () => {
    setPending(await pendingPhrases(userId));
  }, [userId]);

  useEffect(() => {
    void loadPending();
  }, [loadPending]);

  async function unlock(): Promise<void> {
    setUnlocking(true);
    try {
      await unlockPhrases(userId, pending.slice(0, UNLOCK_BATCH));
      await loadPending();
      await refresh();
    } finally {
      setUnlocking(false);
    }
  }

  const unlockPanel = pending.length > 0 && (
    <div className="panel stack">
      <p className="eyebrow">ready to unlock</p>
      <p style={{ fontSize: 14 }}>
        {pending.length} mastered {pending.length === 1 ? 'word has' : 'words have'} a sentence
        waiting. Adding {Math.min(UNLOCK_BATCH, pending.length)}.
      </p>
      <p className="note" lang="es">
        {pending
          .slice(0, UNLOCK_BATCH)
          .map((p) => p.word)
          .join(' · ')}
      </p>
      <button className="btn block" disabled={unlocking} onClick={() => void unlock()}>
        {unlocking ? 'unlocking' : `Unlock ${Math.min(UNLOCK_BATCH, pending.length)} phrases`}
      </button>
    </div>
  );

  if (queue.length === 0) {
    return (
      <div className="stack">
        {unlockPanel}
        <p className="muted" style={{ fontSize: 14 }}>
          {pending.length > 0
            ? 'No phrases due right now.'
            : `No phrases yet. A word's sentence unlocks here once the word itself is confident both ways (step ${PHRASE_UNLOCK_STEP}) — keep the vocabulary deck moving and these arrive on their own.`}
        </p>
      </div>
    );
  }

  return (
    <div className="stack">
      <p className="muted" style={{ fontSize: 13 }}>
        {profile.quiet_mode
          ? 'Read the full sentence, hold the meaning, then check.'
          : 'Ear training: hear the sentence first — no text until you reveal.'}
      </p>
      <ReviewQueue
        userId={userId}
        queue={queue}
        totalDue={totalDue}
        refresh={refresh}
        onExhausted={() => undefined}
      />
      {unlockPanel}
    </div>
  );
}
