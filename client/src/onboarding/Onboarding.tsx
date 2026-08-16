import { useMemo, useState } from 'react';
import type { Level, TargetKind } from '@seiscientas/shared';
import { saveProfile } from '../db/repo';
import { nowIso, formatDate } from '../lib/time';
import { dialectFor } from '../lib/dialect';

// Three decisions plus minutes, one screen each, ~30 seconds. No account here —
// auth already happened (or local mode skips it).

const LEVELS: Array<{ value: Level; label: string; sub: string }> = [
  { value: 'A0', label: 'None', sub: 'A few words at most' },
  { value: 'A1', label: 'Beginnings', sub: 'Set phrases; can order a coffee' },
  { value: 'A2', label: 'Basics', sub: 'Simple sentences about familiar things' },
  { value: 'B1', label: 'Conversational', sub: 'Can hold a slow conversation with errors' },
  { value: 'B2', label: 'Comfortable', sub: 'Most conversations work; detail is hard' },
];

const MINUTE_CHOICES = [30, 60, 90];

export function Onboarding({ userId, onDone }: { userId: string; onDone: () => void }): JSX.Element {
  const [step, setStep] = useState(0);
  const [country, setCountry] = useState('');
  const [level, setLevel] = useState<Level | null>(null);
  const [targetDate, setTargetDate] = useState('');
  const [targetKind, setTargetKind] = useState<TargetKind | null>(null);
  const [minutes, setMinutes] = useState(60);

  // Live projection: hours accumulated by the target date at N min/day.
  const projection = useMemo(() => {
    if (!targetDate) return null;
    const days = Math.max(0, Math.round((new Date(targetDate).getTime() - Date.now()) / 86_400_000));
    const hours = Math.round((days * minutes) / 60);
    let outcome: string;
    if (hours >= 180) outcome = 'about B1 — conversation works, errors constant. The right state to arrive in.';
    else if (hours >= 120) outcome = 'strong A2 — routine exchanges work; conversation will still strain.';
    else outcome = 'A2 at best — immersion weeks will be exhausting rather than transformative.';
    return { days, hours, outcome };
  }, [targetDate, minutes]);

  async function finish(): Promise<void> {
    await saveProfile({
      user_id: userId,
      level: level ?? 'A2',
      dialect: dialectFor(country),
      country: country || null,
      started_at: nowIso(),
      target_date: targetDate || null,
      target_kind: targetKind,
      target_history: [],
      daily_minutes: minutes,
      quiet_mode: false,
      text_size: 100,
      onboarded: true,
      converted_prompt_shown: false,
      extra_buckets: null,
    });
    onDone();
  }

  return (
    <div className="app-main">
      {step === 0 && (
        <div className="onboard-step">
          <div>
            <p className="eyebrow">1 of 4</p>
            <h1>Where are you going?</h1>
            <p className="muted">Drives dialect, slang, and news weighting.</p>
          </div>
          <input
            value={country}
            onChange={(e) => setCountry(e.target.value)}
            placeholder="Country or city"
            autoFocus
          />
          <button className="btn primary block" disabled={!country.trim()} onClick={() => setStep(1)}>
            Next
          </button>
        </div>
      )}

      {step === 1 && (
        <div className="onboard-step">
          <div>
            <p className="eyebrow">2 of 4</p>
            <h1>How much Spanish do you have?</h1>
          </div>
          <div className="choice-list">
            {LEVELS.map((l) => (
              <button
                key={l.value}
                className={`choice ${level === l.value ? 'selected' : ''}`}
                onClick={() => setLevel(l.value)}
              >
                {l.label}
                <span className="sub">{l.sub}</span>
              </button>
            ))}
          </div>
          <button className="btn primary block" disabled={!level} onClick={() => setStep(2)}>
            Next
          </button>
        </div>
      )}

      {step === 2 && (
        <div className="onboard-step">
          <div>
            <p className="eyebrow">3 of 4</p>
            <h1>When is the trip?</h1>
            <p className="muted">Everything about pacing hangs off this date.</p>
          </div>
          <input type="date" value={targetDate} onChange={(e) => setTargetDate(e.target.value)} />
          <div className="choice-list">
            <button
              className={`choice ${targetKind === 'booked' ? 'selected' : ''}`}
              onClick={() => setTargetKind('booked')}
            >
              Booked
              <span className="sub">Flights paid or exam registered</span>
            </button>
            <button
              className={`choice ${targetKind === 'intended' ? 'selected' : ''}`}
              onClick={() => setTargetKind('intended')}
            >
              Intended
              <span className="sub">A date you set yourself</span>
            </button>
          </div>
          {targetKind === 'intended' && (
            <p className="muted" style={{ fontSize: 13 }}>
              Booked flights or a registered exam make the date real.
            </p>
          )}
          <button
            className="btn primary block"
            disabled={!targetDate || !targetKind}
            onClick={() => setStep(3)}
          >
            Next
          </button>
        </div>
      )}

      {step === 3 && (
        <div className="onboard-step">
          <div>
            <p className="eyebrow">4 of 4</p>
            <h1>Minutes a day</h1>
            <p className="muted">Sixty with real consistency beats ninety with guilt.</p>
          </div>
          <div className="choice-list">
            {MINUTE_CHOICES.map((m) => (
              <button
                key={m}
                className={`choice ${minutes === m ? 'selected' : ''}`}
                onClick={() => setMinutes(m)}
              >
                {m} minutes{m === 60 ? ' — recommended' : ''}
              </button>
            ))}
          </div>
          {projection && (
            <p className="muted">
              {projection.days} days to {formatDate(targetDate)} at {minutes} min/day ≈{' '}
              <span className="mono">{projection.hours} hours</span> — {projection.outcome}
            </p>
          )}
          <button className="btn primary block" onClick={() => void finish()}>
            Start
          </button>
        </div>
      )}
    </div>
  );
}
