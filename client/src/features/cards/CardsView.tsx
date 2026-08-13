import { useEffect, useRef, useState } from 'react';
import { scheduleCard } from '@seiscientas/shared';
import { useQueue } from './useQueue';
import { generateCards } from './generate';
import { SwipeCard } from './SwipeCard';
import { ProductionCard } from './ProductionCard';
import { initCheckResolution } from './checks';
import { putCard } from '../../db/repo';
import { useProfile } from '../../shell/ProfileContext';
import { useSessionTimer } from '../../session/useSessionTimer';
import { ApiError } from '../../lib/api';

const prefersReducedMotion = (): boolean =>
  window.matchMedia('(prefers-reduced-motion: reduce)').matches;

export function CardsView({ userId, online }: { userId: string; online: boolean }): JSX.Element {
  const { profile } = useProfile();
  const { queue, loading, refresh } = useQueue(userId);
  const [topic, setTopic] = useState('');
  const [generating, setGenerating] = useState(false);
  const [genError, setGenError] = useState<string | null>(null);
  const [pulse, setPulse] = useState(false);
  // Review runs in sets of 10: a natural breath every ten cards, with the
  // remaining count as the honest continue signal.
  const [gradedInSet, setGradedInSet] = useState(0);
  const [setBreak, setSetBreak] = useState(false);
  const reducedMotion = useRef(prefersReducedMotion());

  useSessionTimer(userId, 'cards', profile.daily_minutes);

  useEffect(() => {
    initCheckResolution(userId);
  }, [userId]);

  const current = queue[0] ?? null;

  async function grade(g: 'got' | 'miss'): Promise<void> {
    if (!current) return;
    const result = scheduleCard(current, g, new Date());
    await putCard({ ...current, ...result });
    setPulse(true); // no Vibration API on iOS Safari — 40ms visual pulse instead
    const graded = gradedInSet + 1;
    setGradedInSet(graded);
    if (graded % 10 === 0) setSetBreak(true);
    await refresh();
  }

  useEffect(() => {
    if (!pulse) return;
    const t = setTimeout(() => setPulse(false), 60);
    return () => clearTimeout(t);
  }, [pulse]);

  async function generate(): Promise<void> {
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
      await refresh();
    } catch (e) {
      if (e instanceof ApiError && e.code === 'budget_paused')
        setGenError('AI features paused until tomorrow.');
      else setGenError('Generation failed. Retry.');
    } finally {
      setGenerating(false);
    }
  }

  if (loading) return <p className="muted">loading queue</p>;

  if (setBreak && current) {
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

  if (!current) {
    return (
      <div className="stack">
        <div className="empty-state">
          <p>Queue clear.</p>
        </div>
        {online ? (
          <div className="panel stack">
            <p className="eyebrow">new cards</p>
            <input
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
              placeholder="Topic, or leave blank for high-frequency words"
            />
            <button className="btn primary block" disabled={generating} onClick={() => void generate()}>
              {generating ? 'finding words' : 'Generate 20 cards'}
            </button>
            {genError && <p className="error-line">{genError}</p>}
          </div>
        ) : (
          <p className="muted" style={{ textAlign: 'center' }}>
            Offline — new cards need a connection. The queue itself always works.
          </p>
        )}
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
            wordFirst={['A0', 'A1'].includes(profile.level)}
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
