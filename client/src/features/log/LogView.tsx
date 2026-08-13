import { useCallback, useEffect, useState } from 'react';
import type { ConceptSlug, Session, SessionType, TargetHistoryEntry } from '@seiscientas/shared';
import { projectedDate } from '@seiscientas/shared';
import { db } from '../../db/dexie';
import { logSession } from '../../db/repo';
import { useProfile } from '../../shell/ProfileContext';
import { Sheet } from '../../components/Sheet';
import { ProgressMap } from './ProgressMap';
import { SettingsSheet } from './SettingsSheet';
import { DrillView } from '../drill/DrillView';
import { formatDate, localDateKey, nowIso, startOfLocalDayDate } from '../../lib/time';

const READINESS_HOURS = 200;
const FLUENCY_HOURS = 600;
const MAX_BARS = 140;
const BAR_MAX_MINUTES = 60;

const MANUAL_TYPES: Array<{ value: SessionType; label: string }> = [
  { value: 'input', label: 'Listening / watching' },
  { value: 'read', label: 'Reading' },
  { value: 'tutor', label: 'Human tutor' },
  { value: 'talk', label: 'Real conversation' },
  { value: 'grammar', label: 'Grammar study' },
];

export function LogView({ userId }: { userId: string }): JSX.Element {
  const { profile, update } = useProfile();
  const [sessions, setSessions] = useState<Session[]>([]);
  const [drilling, setDrilling] = useState<ConceptSlug | null>(null);
  const [logSheet, setLogSheet] = useState(false);
  const [dateSheet, setDateSheet] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [manualType, setManualType] = useState<SessionType>('input');
  const [manualMinutes, setManualMinutes] = useState('30');
  const [newDate, setNewDate] = useState(profile.target_date ?? '');

  const reload = useCallback(async () => {
    const all = await db.sessions
      .where('at')
      .aboveOrEqual('')
      .and((s) => s.user_id === userId)
      .sortBy('at');
    setSessions(all);
  }, [userId]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const totalMinutes = sessions.reduce((sum, s) => sum + s.minutes, 0);
  const totalHours = totalMinutes / 60;
  const todayStart = startOfLocalDayDate().toISOString();
  const minutesToday = sessions.filter((s) => s.at >= todayStart).reduce((sum, s) => sum + s.minutes, 0);

  // Streak: consecutive days ending today (or yesterday) with any logged time.
  const activeDays = new Set(sessions.map((s) => localDateKey(new Date(s.at))));
  let streak = 0;
  const cursor = new Date();
  if (!activeDays.has(localDateKey(cursor))) cursor.setDate(cursor.getDate() - 1);
  while (activeDays.has(localDateKey(cursor))) {
    streak++;
    cursor.setDate(cursor.getDate() - 1);
  }

  const byType: Partial<Record<SessionType, number>> = {};
  for (const s of sessions) byType[s.type] = (byType[s.type] ?? 0) + s.minutes;

  const projected = projectedDate({
    totalHours,
    targetHours: READINESS_HOURS,
    startedAt: new Date(profile.started_at),
    now: new Date(),
  });

  const slip = cumulativeSlip(profile.target_history);
  const bars = sessions.slice(-MAX_BARS);

  if (drilling) {
    return (
      <DrillView
        userId={userId}
        concept={drilling}
        onClose={() => {
          setDrilling(null);
          void reload();
        }}
      />
    );
  }

  async function saveManual(): Promise<void> {
    const minutes = parseInt(manualMinutes, 10);
    if (!Number.isFinite(minutes) || minutes <= 0) return;
    await logSession({
      userId,
      type: manualType,
      minutes,
      isBonus: false,
      at: nowIso(),
    });
    setLogSheet(false);
    await reload();
  }

  async function moveDate(): Promise<void> {
    if (!newDate || newDate === profile.target_date) {
      setDateSheet(false);
      return;
    }
    const entry: TargetHistoryEntry = {
      from: profile.target_date,
      to: newDate,
      at: nowIso(),
    };
    await update({
      target_date: newDate,
      target_history: [...profile.target_history, entry],
    });
    setDateSheet(false);
  }

  return (
    <div className="stack">
      {/* hours */}
      <div className="panel stack">
        <div className="row">
          <div>
            <p className="hours-display mono">{totalHours.toFixed(1)}</p>
            <p className="eyebrow">hours</p>
          </div>
          <div style={{ textAlign: 'right' }}>
            <p className="mono">{minutesToday} min today</p>
            <p className="muted mono" style={{ fontSize: 13 }}>
              {streak} day streak
            </p>
          </div>
        </div>

        <div className="bars" aria-hidden="true">
          {bars.map((s) => (
            <div
              key={s.id}
              className={`bar ${s.type}`}
              style={{ height: `${Math.min(100, (s.minutes / BAR_MAX_MINUTES) * 100)}%` }}
            />
          ))}
        </div>

        {/* readiness — the prominent horizon */}
        <div>
          <div className="row" style={{ minHeight: 0, padding: 0 }}>
            <span className="eyebrow">readiness — {READINESS_HOURS} h</span>
            <span className="muted mono" style={{ fontSize: 12 }}>
              {profile.target_date ? formatDate(profile.target_date) : 'no date'}
            </span>
          </div>
          <div className="horizon-rule">
            <div className="fill" style={{ width: `${Math.min(100, (totalHours / READINESS_HOURS) * 100)}%` }} />
          </div>
          <p className="muted" style={{ fontSize: 13 }}>
            {projected
              ? `at current pace: ${formatDate(projected)}`
              : 'no pace yet'}
            {slip.moves > 0 && (
              <span className="mono"> · moved {slip.moves === 1 ? 'once' : `${slip.moves} times`} · +{slip.days} days</span>
            )}
          </p>
          <button className="btn quiet" onClick={() => setDateSheet(true)}>
            move date
          </button>
        </div>

        {/* fluency — smaller, undated */}
        <div>
          <span className="eyebrow" style={{ opacity: 0.7 }}>
            fluency — {FLUENCY_HOURS} h
          </span>
          <div className="horizon-rule secondary">
            <div className="fill" style={{ width: `${Math.min(100, (totalHours / FLUENCY_HOURS) * 100)}%` }} />
          </div>
        </div>
      </div>

      <button className="btn block" onClick={() => setLogSheet(true)}>
        Log time outside the app
      </button>

      {/* split by activity */}
      <div className="panel stack" style={{ gap: 4 }}>
        <p className="eyebrow">split</p>
        {(Object.entries(byType) as Array<[SessionType, number]>).map(([type, mins]) => (
          <div className="row" key={type} style={{ minHeight: 32, padding: '2px 0' }}>
            <span className="muted">{type}</span>
            <span className="mono">{(mins / 60).toFixed(1)} h</span>
          </div>
        ))}
        {sessions.length === 0 && <p className="muted">Nothing logged yet.</p>}
      </div>

      {/* progress map: the error ledger pointed forwards */}
      <ProgressMap userId={userId} onDrill={setDrilling} />

      <button className="btn quiet block" onClick={() => setSettingsOpen(true)}>
        settings
      </button>

      {settingsOpen && <SettingsSheet onClose={() => setSettingsOpen(false)} />}

      {logSheet && (
        <Sheet title="Log time" onClose={() => setLogSheet(false)}>
          <div className="stack">
            <div className="choice-list">
              {MANUAL_TYPES.map((t) => (
                <button
                  key={t.value}
                  className={`choice ${manualType === t.value ? 'selected' : ''}`}
                  onClick={() => setManualType(t.value)}
                >
                  {t.label}
                </button>
              ))}
            </div>
            <input
              inputMode="numeric"
              value={manualMinutes}
              onChange={(e) => setManualMinutes(e.target.value.replace(/\D/g, ''))}
              placeholder="Minutes"
              className="mono"
            />
            <button className="btn primary block" onClick={() => void saveManual()}>
              Log it
            </button>
          </div>
        </Sheet>
      )}

      {dateSheet && (
        <Sheet title="Move target date" onClose={() => setDateSheet(false)}>
          <div className="stack">
            <input type="date" value={newDate} onChange={(e) => setNewDate(e.target.value)} />
            <button className="btn primary block" onClick={() => void moveDate()}>
              Move it
            </button>
            {profile.target_kind === 'intended' && (
              <p className="muted" style={{ fontSize: 13 }}>
                Every move is recorded and shown beside the date.
              </p>
            )}
          </div>
        </Sheet>
      )}
    </div>
  );
}

function cumulativeSlip(history: TargetHistoryEntry[]): { moves: number; days: number } {
  let days = 0;
  for (const h of history) {
    if (h.from && h.to) {
      days += Math.round((new Date(h.to).getTime() - new Date(h.from).getTime()) / 86_400_000);
    }
  }
  return { moves: history.length, days: Math.max(0, days) };
}
