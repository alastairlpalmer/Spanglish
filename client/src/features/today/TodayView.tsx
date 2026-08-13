import { useEffect, useState } from 'react';
import type { ConceptSlug } from '@seiscientas/shared';
import { useToday } from './useToday';
import { useProfile } from '../../shell/ProfileContext';
import { Ring } from '../../components/Ring';
import { DrillView } from '../drill/DrillView';
import { weakConcepts } from '../drill/weak';
import { db } from '../../db/dexie';
import type { Tab } from '../../shell/TabBar';
import { formatDate } from '../../lib/time';

interface Digest {
  hours: number;
  prevHours: number;
  errors: number;
  prevErrors: number;
  focus: string | null;
}

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
  const { profile, update: profileUpdate } = useProfile();
  const today = useToday(userId);
  const [keepGoing, setKeepGoing] = useState(false);
  const [drillTarget, setDrillTarget] = useState<ConceptSlug | null>(null);
  const [drilling, setDrilling] = useState(false);

  // The drill block targets the learner's weakest concept — grammar arrives
  // as a scheduled task, never as a menu they have to choose to visit.
  useEffect(() => {
    void weakConcepts(userId, 1).then((w) => setDrillTarget(w[0] ?? null));
  }, [userId, today.minutesToday]);

  // Weekly digest: first open each week, one factual card — hours banked,
  // error direction, this week's focus. Instrument voice, no praise.
  const [digest, setDigest] = useState<Digest | null>(null);
  useEffect(() => {
    if (localStorage.getItem('digest-week') === weekKey()) return;
    const startedDaysAgo = (Date.now() - new Date(profile.started_at).getTime()) / 86_400_000;
    if (startedDaysAgo < 7) return;
    void (async () => {
      const now = Date.now();
      const weekAgo = new Date(now - 7 * 86_400_000).toISOString();
      const twoWeeksAgo = new Date(now - 14 * 86_400_000).toISOString();
      const sessions = await db.sessions
        .where('at')
        .aboveOrEqual(twoWeeksAgo)
        .and((s) => s.user_id === userId)
        .toArray();
      const mins = (from: string, to: string): number =>
        sessions.filter((s) => s.at >= from && s.at < to).reduce((sum, s) => sum + s.minutes, 0);
      const errs = await db.error_examples
        .where('at')
        .aboveOrEqual(twoWeeksAgo)
        .and((e) => e.user_id === userId)
        .toArray();
      const nowIso = new Date(now).toISOString();
      const weak = await weakConcepts(userId, 1);
      setDigest({
        hours: mins(weekAgo, nowIso) / 60,
        prevHours: mins(twoWeeksAgo, weekAgo) / 60,
        errors: errs.filter((e) => e.at >= weekAgo).length,
        prevErrors: errs.filter((e) => e.at < weekAgo).length,
        focus: weak[0] ?? null,
      });
    })();
  }, [userId, profile.started_at]);

  // One conversion prompt, once (spec §10a): an intended date within 30 days
  // with nothing booked. Never asked again, whatever the answer.
  const daysToTarget = profile.target_date
    ? Math.round((new Date(profile.target_date).getTime() - Date.now()) / 86_400_000)
    : null;
  const showConversion =
    profile.target_kind === 'intended' &&
    !profile.converted_prompt_shown &&
    daysToTarget !== null &&
    daysToTarget >= 0 &&
    daysToTarget <= 30;

  if (drilling && drillTarget) {
    return (
      <DrillView
        userId={userId}
        concept={drillTarget}
        onClose={() => {
          setDrilling(false);
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
    if (type === 'cards') onGo('cards');
    else if (type === 'drill') {
      if (drillTarget) setDrilling(true);
      else onGo('cards'); // nothing to drill yet — cards are the best use of the time
    } else if (type === 'talk') onGo('talk');
    else if (type === 'read') onGo('reading');
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
      {digest && (
        <div className="panel stack">
          <p className="eyebrow">last week</p>
          <p style={{ fontSize: 14 }}>
            <span className="mono">{digest.hours.toFixed(1)} h</span> banked
            {digest.prevHours > 0 && (
              <span className="muted"> ({digest.prevHours.toFixed(1)} the week before)</span>
            )}
            . Errors {digest.prevErrors > 0 && digest.errors < digest.prevErrors ? 'down' : ''}
            {digest.prevErrors > 0 && digest.errors > digest.prevErrors ? 'up' : ''}
            {digest.prevErrors > 0 && digest.errors === digest.prevErrors ? 'level' : ''}
            {digest.prevErrors === 0 ? 'logged' : ''}:{' '}
            <span className="mono">
              {digest.errors}
              {digest.prevErrors > 0 ? ` vs ${digest.prevErrors}` : ''}
            </span>
            {digest.focus && (
              <>
                . This week's focus: <span className="mono">{digest.focus}</span>
              </>
            )}
            .
          </p>
          <button
            className="btn quiet"
            onClick={() => {
              localStorage.setItem('digest-week', weekKey());
              setDigest(null);
            }}
          >
            noted
          </button>
        </div>
      )}

      {showConversion && (
        <div className="panel stack">
          <p style={{ fontSize: 14 }}>
            Your intended date is {daysToTarget} days out and nothing is booked. Booked flights or
            a registered exam make the date real.
          </p>
          <div className="row" style={{ gap: 8, padding: 0 }}>
            <button
              className="btn"
              style={{ flex: 1 }}
              onClick={() =>
                void profileUpdate({ target_kind: 'booked', converted_prompt_shown: true })
              }
            >
              It's booked
            </button>
            <button
              className="btn quiet"
              style={{ flex: 1 }}
              onClick={() => void profileUpdate({ converted_prompt_shown: true })}
            >
              Not yet
            </button>
          </div>
        </div>
      )}

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
            >
              <span className="plan-mark">{isDone ? '✓' : '○'}</span>
              <span className="plan-label">
                {block.type === 'drill' && drillTarget ? `Drill: ${drillTarget}` : block.label}
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
