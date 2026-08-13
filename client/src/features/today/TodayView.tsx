import { useState } from 'react';
import { useToday } from './useToday';
import { useProfile } from '../../shell/ProfileContext';
import { Ring } from '../../components/Ring';
import { ReadView } from '../read/ReadView';
import type { Tab } from '../../shell/TabBar';
import { formatDate } from '../../lib/time';

// The home screen answers "what do I do in the next N minutes" and gives the
// day an end. Done state: ring closes, plan collapses, one line, no confetti.

const WEEKLY_BEHIND_KEY = 'behind-shown-week';

function weekKey(): string {
  const d = new Date();
  const onejan = new Date(d.getFullYear(), 0, 1);
  const week = Math.ceil(((d.getTime() - onejan.getTime()) / 86_400_000 + onejan.getDay() + 1) / 7);
  return `${d.getFullYear()}-${week}`;
}

export function TodayView({ userId, onGo }: { userId: string; onGo: (tab: Tab) => void }): JSX.Element {
  const { profile } = useProfile();
  const today = useToday(userId);
  const [keepGoing, setKeepGoing] = useState(false);
  const [reading, setReading] = useState(false);

  if (reading) {
    return (
      <ReadView
        userId={userId}
        onClose={() => {
          setReading(false);
          void today.refresh();
        }}
      />
    );
  }

  if (!today.plan) return <p className="muted">composing the day</p>;

  const done = today.minutesToday >= profile.daily_minutes;
  const nextIndex = today.completion.findIndex((c) => !c);

  // Falling-behind line appears at most once per week.
  let showBehind = false;
  if (today.behind) {
    const shown = localStorage.getItem(WEEKLY_BEHIND_KEY);
    if (shown !== weekKey()) {
      showBehind = true;
      localStorage.setItem(WEEKLY_BEHIND_KEY, weekKey());
    }
  }

  function goFor(type: string): void {
    if (type === 'cards' || type === 'drill') onGo('cards');
    else if (type === 'talk') onGo('talk');
    else if (type === 'read') setReading(true);
  }

  if (done && !keepGoing) {
    return (
      <div className="stack">
        <div className="panel ring-wrap">
          <Ring minutes={today.minutesToday} target={profile.daily_minutes} />
          <div>
            <p>
              Done. <span className="mono">{Math.min(today.minutesToday, profile.daily_minutes)} min</span> logged.
            </p>
            {today.bonusMinutes > 0 && (
              <p className="muted mono" style={{ fontSize: 13 }}>
                +{today.bonusMinutes} min
              </p>
            )}
          </div>
        </div>
        <button className="btn quiet block" onClick={() => setKeepGoing(true)}>
          keep going
        </button>
      </div>
    );
  }

  return (
    <div className="stack">
      <div className="panel ring-wrap">
        <Ring minutes={today.minutesToday} target={profile.daily_minutes} />
        <div>
          <p className="mono">
            {Math.min(today.minutesToday, profile.daily_minutes)} / {profile.daily_minutes} min
          </p>
          {today.bonusMinutes > 0 && (
            <p className="muted mono" style={{ fontSize: 13 }}>
              +{today.bonusMinutes} min
            </p>
          )}
          <p className="muted mono" style={{ fontSize: 12 }}>
            Day {today.dayNumber}
          </p>
        </div>
      </div>

      {today.reduced && (
        <p className="muted" style={{ fontSize: 14 }}>
          Reduced plan for the first day back.
        </p>
      )}

      <div className="panel stack" style={{ gap: 4 }}>
        {today.plan.blocks.map((block, i) => {
          const isDone = today.completion[i] ?? false;
          const isNext = i === nextIndex;
          return (
            <button
              key={`${block.type}-${i}`}
              className={`plan-block ${isNext ? 'next' : ''} ${isDone ? 'done' : ''}`}
              onClick={() => goFor(block.type)}
              disabled={block.type === 'drill'}
            >
              <span className="plan-mark">{isDone ? '✓' : '○'}</span>
              <span className="plan-label">
                {block.label}
                {block.type === 'drill' && <span className="muted"> — soon</span>}
              </span>
              <span className="plan-minutes">{block.minutes} min</span>
            </button>
          );
        })}
      </div>

      {showBehind && today.behind && (
        <p className="muted" style={{ fontSize: 14 }}>
          At current pace, readiness lands {formatDate(today.behind.projected)}.
          {today.behind.recoverMinutes !== null &&
            ` ${today.behind.recoverMinutes} min/day recovers the date.`}
        </p>
      )}
    </div>
  );
}
