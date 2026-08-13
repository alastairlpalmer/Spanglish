// A Spanish diary: short daily entries, typed or spoken, on a scrollable
// timeline. Writing about your own day is the highest-transfer production
// practice there is — the vocabulary is by definition the vocabulary of
// your life. Entries sync like everything else; the optional check sends an
// entry through the review endpoint and feeds the ledger.

import { useCallback, useEffect, useState } from 'react';
import type { DiaryEntry, ReviewResponse } from '@seiscientas/shared';
import { diaryEntries, saveDiaryEntry, recordReviewErrors } from '../../db/repo';
import { apiPost, ApiError } from '../../lib/api';
import { formatDate } from '../../lib/time';
import { useProfile } from '../../shell/ProfileContext';
import { useHoldToTalk } from '../../speech/useHoldToTalk';
import { localeForDialect } from '../../speech/recognition';

interface CheckState {
  entryId: string;
  loading: boolean;
  errors: ReviewResponse['errors'];
  message: string | null;
}

export function DiarySection({ userId }: { userId: string }): JSX.Element {
  const { profile } = useProfile();
  const [entries, setEntries] = useState<DiaryEntry[]>([]);
  const [draft, setDraft] = useState('');
  const [check, setCheck] = useState<CheckState | null>(null);

  const hold = useHoldToTalk(localeForDialect(profile.dialect), (text) => {
    setDraft((d) => (d ? `${d} ${text}` : text));
  });

  const reload = useCallback(async () => {
    setEntries(await diaryEntries(userId));
  }, [userId]);

  useEffect(() => {
    void reload();
  }, [reload]);

  async function save(): Promise<void> {
    const text = draft.trim();
    if (!text) return;
    await saveDiaryEntry({ userId, text });
    setDraft('');
    await reload();
  }

  async function checkEntry(entry: DiaryEntry): Promise<void> {
    setCheck({ entryId: entry.id, loading: true, errors: [], message: null });
    try {
      const res = await apiPost<ReviewResponse>('/api/ai/review', {
        utterances: [entry.text],
        dialect: profile.dialect,
        level: profile.level,
      });
      await recordReviewErrors(userId, res.errors);
      setCheck({
        entryId: entry.id,
        loading: false,
        errors: res.errors,
        message: res.errors.length === 0 ? 'Nothing to correct.' : null,
      });
    } catch (e) {
      setCheck({
        entryId: entry.id,
        loading: false,
        errors: [],
        message:
          e instanceof ApiError && e.code === 'budget_paused'
            ? 'AI features paused until tomorrow.'
            : 'Check failed. Retry.',
      });
    }
  }

  const showVoice = !profile.quiet_mode && hold.available && hold.state !== 'failed';

  return (
    <div className="panel stack">
      <p className="eyebrow">diario</p>

      <textarea
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        placeholder="¿Qué pasó hoy? Dos o tres frases bastan."
        lang="es"
        autoCapitalize="off"
        style={{ minHeight: 90 }}
      />
      {showVoice && (
        <div>
          <p className="interim">{hold.interim || (hold.state === 'holding' ? 'listening' : '')}</p>
          <button
            className={`hold-btn ${hold.state === 'holding' ? 'holding' : ''}`}
            onPointerDown={(e) => {
              e.preventDefault();
              hold.onPressStart();
            }}
            onPointerUp={hold.onPressEnd}
            onPointerCancel={hold.onPressEnd}
            onContextMenu={(e) => e.preventDefault()}
            style={{ minHeight: 48 }}
          >
            {hold.state === 'holding' ? 'release to add' : 'hold to speak your entry'}
          </button>
        </div>
      )}
      <button className="btn primary block" disabled={!draft.trim()} onClick={() => void save()}>
        Save entry
      </button>

      {/* timeline */}
      <div className="stack" style={{ gap: 16 }}>
        {entries.map((e) => (
          <div key={e.id} style={{ borderLeft: '2px solid var(--line)', paddingLeft: 12 }}>
            <p className="eyebrow">{formatDate(e.at)}</p>
            <p lang="es" style={{ fontSize: 15, lineHeight: 1.5 }}>
              {e.text}
            </p>
            <button
              className="btn quiet"
              disabled={check?.entryId === e.id && check.loading}
              onClick={() => void checkEntry(e)}
            >
              {check?.entryId === e.id && check.loading ? 'checking' : 'check it'}
            </button>
            {check?.entryId === e.id && !check.loading && (
              <div className="stack" style={{ gap: 8, marginTop: 4 }}>
                {check.message && <p className="muted">{check.message}</p>}
                {check.errors.map((err, i) => (
                  <div key={i} style={{ fontSize: 14 }}>
                    <p style={{ color: 'var(--clay)' }} lang="es">
                      {err.wrong}
                    </p>
                    <p style={{ color: 'var(--sage)' }} lang="es">
                      {err.right}
                    </p>
                    <p className="muted">{err.why}</p>
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}
        {entries.length === 0 && (
          <p className="muted" style={{ fontSize: 14 }}>
            The first entry is the hardest. Two sentences about today, in Spanish.
          </p>
        )}
      </div>
    </div>
  );
}
