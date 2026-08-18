// A Spanish diary: short daily entries, typed or spoken, on a scrollable
// timeline. Writing about your own day is the highest-transfer production
// practice there is — the vocabulary is by definition the vocabulary of
// your life. Entries sync like everything else; the optional check sends an
// entry through the review endpoint and feeds the ledger.

import { useCallback, useEffect, useState } from 'react';
import type { DiaryEntry, ReviewResponse, SayResponse } from '@seiscientas/shared';
import { isBeginner, isScaffoldLevel } from '@seiscientas/shared';
import { diaryEntries, saveDiaryEntry, recordReviewErrors } from '../../db/repo';
import { apiPost, friendlyApiError } from '../../lib/api';
import { formatDate } from '../../lib/time';
import { useProfile } from '../../shell/ProfileContext';
import { useOnline } from '../../shell/TabShell';
import { useHoldToTalk } from '../../speech/useHoldToTalk';
import { localeForDialect } from '../../speech/recognition';
import { addWordPair } from '../cards/createCards';
import { STARTER_GROUPS } from './starters';

interface CheckState {
  entryId: string;
  loading: boolean;
  errors: ReviewResponse['errors'];
  message: string | null;
}

export function DiarySection({ userId }: { userId: string }): JSX.Element {
  const { profile } = useProfile();
  const online = useOnline();
  const [entries, setEntries] = useState<DiaryEntry[]>([]);
  const [draft, setDraft] = useState('');
  const [check, setCheck] = useState<CheckState | null>(null);

  // Scaffolding fades with level: open for true beginners, tucked behind a
  // toggle at A2, gone from B1.
  const beginner = isBeginner(profile.level);
  const scaffoldAvailable = isScaffoldLevel(profile.level);
  const [helpOpen, setHelpOpen] = useState(beginner);
  const [english, setEnglish] = useState('');
  const [saying, setSaying] = useState(false);
  const [sayError, setSayError] = useState<string | null>(null);
  // The last cómo-se-dice answer — a word the learner personally needed,
  // offered to the deck. Highest-value vocabulary in the app.
  const [lastSay, setLastSay] = useState<{ es: string; en: string; added: boolean } | null>(null);
  const [addingSay, setAddingSay] = useState(false);

  function append(text: string): void {
    setDraft((d) => {
      if (!d) return text;
      const needsSpace = !d.endsWith(' ');
      return `${d}${needsSpace ? ' ' : ''}${text}`;
    });
  }

  async function sayIt(): Promise<void> {
    const phrase = english.trim();
    if (!phrase || saying) return;
    setSaying(true);
    setSayError(null);
    try {
      const res = await apiPost<SayResponse>('/api/ai/say', {
        english: phrase,
        level: profile.level,
      });
      append(res.spanish);
      setLastSay({ es: res.spanish, en: phrase, added: false });
      setEnglish('');
    } catch (e) {
      setSayError(friendlyApiError(e, 'Could not translate. Retry.'));
    } finally {
      setSaying(false);
    }
  }

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
        message: friendlyApiError(e, 'Check failed. Retry.'),
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

      {/* Beginner scaffolding — open at A0/A1, behind a toggle at A2, gone
          from B1. The training wheels remove themselves. */}
      {scaffoldAvailable && !beginner && (
        <button className="btn quiet" onClick={() => setHelpOpen(!helpOpen)}>
          {helpOpen ? 'hide help' : 'help'}
        </button>
      )}
      {scaffoldAvailable && helpOpen && (
        <div className="stack" style={{ gap: 8 }}>
          {STARTER_GROUPS.map((group) => (
            <div key={group.label}>
              <p className="eyebrow" style={{ marginBottom: 4 }}>
                {group.label}
              </p>
              <div className="starter-group">
                {group.items.map((s) => (
                  <button key={s.es} className="starter-chip" onClick={() => append(s.es)}>
                    <span className="es" lang="es">
                      {s.es}
                    </span>
                    <span className="en">{s.en}</span>
                  </button>
                ))}
              </div>
            </div>
          ))}

          <p className="eyebrow" style={{ marginBottom: 0 }}>
            ¿cómo se dice…?
          </p>
          <form
            className="row"
            style={{ gap: 8, padding: 0 }}
            onSubmit={(e) => {
              e.preventDefault();
              void sayIt();
            }}
          >
            <input
              value={english}
              onChange={(e) => setEnglish(e.target.value)}
              placeholder="Type it in English"
              maxLength={200}
              disabled={saying || !online}
            />
            <button className="btn" type="submit" disabled={saying || !english.trim()}>
              {saying ? '…' : 'Say it'}
            </button>
          </form>
          {sayError && <p className="error-line">{sayError}</p>}
          {lastSay && (
            <div className="row" style={{ minHeight: 32, padding: 0 }}>
              <span style={{ fontSize: 13 }}>
                <span lang="es" style={{ color: 'var(--ochre)' }}>
                  {lastSay.es}
                </span>{' '}
                <span className="muted">— {lastSay.en}</span>
              </span>
              {lastSay.added ? (
                <span className="mono muted" style={{ fontSize: 11 }}>
                  in the deck
                </span>
              ) : (
                <button
                  className="btn quiet"
                  disabled={addingSay}
                  onClick={() => {
                    setAddingSay(true);
                    void addWordPair({
                      userId,
                      es: lastSay.es,
                      en: lastSay.en,
                      note: 'From your diary — a word you needed',
                    })
                      .then(() => setLastSay((s) => (s ? { ...s, added: true } : s)))
                      .finally(() => setAddingSay(false));
                  }}
                >
                  add to deck
                </button>
              )}
            </div>
          )}
        </div>
      )}
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
