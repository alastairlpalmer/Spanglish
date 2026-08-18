// Cards tab: a vocabulary board of life-area buckets over the SM-2 review
// queue. The mixed due queue stays the primary daily action; buckets are the
// map of territory taken and the door to getting ahead.

import { useEffect, useMemo, useState } from 'react';
import type { BucketSlug } from '@seiscientas/shared';
import { useQueue } from './useQueue';
import { overallMastery, useBucketStats } from './useBucketStats';
import { BucketBoard, activeBucketList } from './BucketBoard';
import { BucketView } from './BucketView';
import { CognateLab } from './CognateLab';
import { INTAKE_WARN_DUE } from './BucketView';
import { ReviewQueue } from './ReviewQueue';
import { unlockSynthesis } from '../../speech/synthesis';
import { generateCards } from './generate';
import { initCheckResolution } from './checks';
import { friendlyApiError } from '../../lib/api';
import { useProfile } from '../../shell/ProfileContext';
import { useSessionTimer } from '../../session/useSessionTimer';

type Mode = { kind: 'board' } | { kind: 'review' } | { kind: 'bucket'; slug: BucketSlug };

// Top-level sections: the vocab machine, the Latin cognate lab, and
// sentence-first phrase review over the same due cards.
type Section = 'vocab' | 'latinos' | 'frases';

export function CardsView({ userId, online }: { userId: string; online: boolean }): JSX.Element {
  const { profile } = useProfile();
  const { queue, recognitionQueue, totalDue, totalDueRecognition, loading, refresh } =
    useQueue(userId);
  const stats = useBucketStats(userId);
  // Extras show when activated OR when they already hold cards; the overall
  // bar is summed over this same final list so header and rows always agree.
  const activeBuckets = useMemo(
    () => activeBucketList(profile.extra_buckets, stats.perBucket),
    [profile.extra_buckets, stats.perBucket],
  );
  const overall = useMemo(
    () => overallMastery(stats.perBucket, activeBuckets),
    [stats.perBucket, activeBuckets],
  );

  // The board is home; the daily review is one tap ("Review N due").
  const [mode, setMode] = useState<Mode>({ kind: 'board' });
  // The section you were in is the section you come back to.
  const [section, setSection] = useState<Section>(() => {
    const s = localStorage.getItem('cards-section');
    return s === 'latinos' || s === 'frases' ? s : 'vocab';
  });
  useEffect(() => {
    localStorage.setItem('cards-section', section);
  }, [section]);
  const [topic, setTopic] = useState('');
  const [generating, setGenerating] = useState(false);
  const [genError, setGenError] = useState<string | null>(null);
  const [intakeWarn, setIntakeWarn] = useState(false);

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

  let vocabContent: JSX.Element;
  if (mode.kind === 'review') {
    vocabContent = (
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
  } else if (mode.kind === 'bucket') {
    vocabContent = (
      <BucketView
        userId={userId}
        slug={mode.slug}
        online={online}
        dueCount={totalDue}
        onBack={() => setMode({ kind: 'board' })}
        onChanged={afterChange}
      />
    );
  } else {
    vocabContent = (
      <div className="stack">
        <BucketBoard
          stats={stats}
          overall={overall}
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
            <button
              className="btn block"
              disabled={generating}
              onClick={() => {
                if (totalDue > INTAKE_WARN_DUE) setIntakeWarn(true);
                else void generateFree();
              }}
            >
              {generating ? 'finding words' : 'Generate 20 cards'}
            </button>
            {intakeWarn && (
              <div className="stack" style={{ gap: 8 }}>
                <p style={{ fontSize: 14 }}>
                  {totalDue} cards are already waiting — new words stack on top of that queue.
                </p>
                <div className="grade-row">
                  <button className="btn" onClick={() => setIntakeWarn(false)}>
                    Clear queue first
                  </button>
                  <button
                    className="btn"
                    style={{ borderColor: 'var(--ochre)' }}
                    onClick={() => {
                      setIntakeWarn(false);
                      void generateFree();
                    }}
                  >
                    Add anyway
                  </button>
                </div>
              </div>
            )}
            {genError && <p className="error-line">{genError}</p>}
          </div>
        )}
      </div>
    );
  }

  // Phrase review: the same due cards, recognition side only, always led by
  // the full sentence. Grading writes to the same scheduler.
  const phraseQueue = recognitionQueue;

  return (
    <div className="stack">
      <div className="segment-row">
        {(
          [
            ['vocab', 'vocabulario'],
            ['latinos', 'latinos'],
            ['frases', 'frases'],
          ] as const
        ).map(([key, label]) => (
          <button
            key={key}
            className={section === key ? 'active' : ''}
            onClick={() => {
              // The chip tap doubles as the iOS TTS unlock — frases auto-speaks
              // its sentences outside any gesture.
              unlockSynthesis();
              setSection(key);
            }}
          >
            {label}
          </button>
        ))}
      </div>

      {/* key remounts the section wrapper so the fade runs on every switch */}
      <div key={section} className="fade-in">
        {section === 'vocab' && <div key={mode.kind} className="fade-in">{vocabContent}</div>}
        {section === 'latinos' && <CognateLab userId={userId} />}
        {section === 'frases' &&
          (phraseQueue.length === 0 ? (
            <p className="muted" style={{ fontSize: 14 }}>
              No phrases due. Sentences come back here when their words do.
            </p>
          ) : (
            <>
              <p className="muted" style={{ fontSize: 13 }}>
                {profile.quiet_mode
                  ? 'Read the full sentence, hold the meaning, then check.'
                  : 'Ear training: hear the sentence first — no text until you reveal.'}
              </p>
              <ReviewQueue
              userId={userId}
              queue={phraseQueue}
              totalDue={totalDueRecognition}
              sentenceFirst
              refresh={afterChange}
              onExhausted={() => undefined}
            />
            </>
          ))}
      </div>
    </div>
  );
}
