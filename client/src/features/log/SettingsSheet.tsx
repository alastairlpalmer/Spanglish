// The learner changes their own targets — nothing here is ever changed by
// the app. Daily minutes (spec: set once in onboarding, only the learner
// changes it), level (drives word-first cards + generation difficulty), and
// destination (drives dialect, slang, and news weighting).

import { useState } from 'react';
import type { Level } from '@seiscientas/shared';
import { Sheet } from '../../components/Sheet';
import { useProfile } from '../../shell/ProfileContext';
import { dialectFor } from '../../lib/dialect';

const LEVELS: Array<{ value: Level; label: string }> = [
  { value: 'A0', label: 'None' },
  { value: 'A1', label: 'Beginnings' },
  { value: 'A2', label: 'Basics' },
  { value: 'B1', label: 'Conversational' },
  { value: 'B2', label: 'Comfortable' },
];

export function SettingsSheet({ onClose }: { onClose: () => void }): JSX.Element {
  const { profile, update } = useProfile();
  const [country, setCountry] = useState(profile.country ?? '');

  async function saveCountry(): Promise<void> {
    const trimmed = country.trim();
    if (!trimmed || trimmed === profile.country) return;
    await update({ country: trimmed, dialect: dialectFor(trimmed) });
  }

  return (
    <Sheet title="Settings" onClose={onClose}>
      <div className="stack">
        <p className="eyebrow">minutes a day</p>
        <div className="row" style={{ gap: 8, padding: 0 }}>
          {[30, 60, 90].map((m) => (
            <button
              key={m}
              className={`btn ${profile.daily_minutes === m ? 'primary' : ''}`}
              style={{ flex: 1 }}
              onClick={() => void update({ daily_minutes: m })}
            >
              {m}
            </button>
          ))}
        </div>
        <p className="muted" style={{ fontSize: 12 }}>
          Sixty with real consistency beats ninety with guilt. Takes effect tomorrow.
        </p>

        <p className="eyebrow">level</p>
        <div className="choice-list">
          {LEVELS.map((l) => (
            <button
              key={l.value}
              className={`choice ${profile.level === l.value ? 'selected' : ''}`}
              onClick={() => void update({ level: l.value })}
            >
              {l.label}
              {['A0', 'A1'].includes(l.value) && (
                <span className="sub">word-first cards</span>
              )}
            </button>
          ))}
        </div>

        <p className="eyebrow">destination</p>
        <input
          value={country}
          onChange={(e) => setCountry(e.target.value)}
          onBlur={() => void saveCountry()}
          placeholder="Country or city"
        />
        <p className="muted" style={{ fontSize: 12 }}>
          Dialect: {profile.dialect}
        </p>

        <button className="btn block" onClick={onClose}>
          Done
        </button>
      </div>
    </Sheet>
  );
}
