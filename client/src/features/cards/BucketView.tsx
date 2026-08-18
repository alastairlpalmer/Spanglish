// One bucket: its mastery bar, learn-new-words, review-ahead when the daily
// queue is clear, a listening quiz, and the word list (hardest first) —
// each word opening a detail sheet with test-me-now.

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  BUCKET_DEFS,
  MAX_STEP,
  bucketMastery,
  bucketWords,
  type BucketSlug,
  type BucketWord,
  type Card,
} from '@seiscientas/shared';
import { db } from '../../db/dexie';
import { friendlyApiError } from '../../lib/api';
import { formatDate } from '../../lib/time';
import { useProfile } from '../../shell/ProfileContext';
import { synthesisAvailable, unlockSynthesis } from '../../speech/synthesis';
import { generateCards } from './generate';
import { ListeningQuiz, type QuizWord } from './ListeningQuiz';
import { ReviewQueue } from './ReviewQueue';

const AHEAD_DAYS = 7;
const QUIZ_MIN_WORDS = 4;

const wordKey = (w: string): string => w.trim().toLowerCase();

export function BucketView({
  userId,
  slug,
  online,
  dueCount,
  onBack,
  onChanged,
}: {
  userId: string;
  slug: BucketSlug;
  online: boolean;
  /** Size of the main mixed due queue — review-ahead only offers itself once
   *  the day's real work is done. */
  dueCount: number;
  onBack: () => void;
  onChanged: () => Promise<void>;
}): JSX.Element {
  const { profile } = useProfile();
  const [rows, setRows] = useState<Card[]>([]);
  const [words, setWords] = useState<BucketWord[]>([]);
  const [mastered, setMastered] = useState(0);
  const [generating, setGenerating] = useState(false);
  const [genError, setGenError] = useState<string | null>(null);
  const [ahead, setAhead] = useState<Card[] | null>(null);
  const [quiz, setQuiz] = useState(false);
  const [sheet, setSheet] = useState<string | null>(null); // word key
  const [test, setTest] = useState<Card[] | null>(null);
  const sheetRef = useRef<HTMLDivElement>(null);

  // The sheet renders below a possibly-long word list; without this, tapping
  // a word near the top produces no visible change on a phone screen.
  useEffect(() => {
    if (sheet !== null) sheetRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }, [sheet]);

  const def = BUCKET_DEFS[slug];

  const refresh = useCallback(async () => {
    const all = await db.cards
      .where('bucket')
      .equals(slug)
      .and((c) => c.user_id === userId && c.deleted_at === null)
      .toArray();
    setRows(all);
    setWords(bucketWords(all, slug));
    setMastered(bucketMastery(all).get(slug)?.mastered ?? 0);
  }, [slug, userId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  async function learn(): Promise<void> {
    setGenerating(true);
    setGenError(null);
    try {
      await generateCards({ userId, bucket: slug, level: profile.level, dialect: profile.dialect });
      await refresh();
      await onChanged();
    } catch (e) {
      setGenError(friendlyApiError(e, 'Generation failed. Retry.'));
    } finally {
      setGenerating(false);
    }
  }

  const loadAhead = useCallback(async () => {
    const horizon = new Date(Date.now() + AHEAD_DAYS * 86_400_000).toISOString();
    const cards = await db.cards
      .where('bucket')
      .equals(slug)
      .and((c) => c.user_id === userId && c.deleted_at === null && c.due <= horizon)
      .sortBy('due');
    setAhead(cards);
  }, [slug, userId]);

  if (ahead !== null) {
    return (
      <div className="stack">
        <div className="row" style={{ minHeight: 0 }}>
          <span className="eyebrow">get ahead — {def.label.toLowerCase()}</span>
          <button
            className="btn quiet"
            onClick={() => {
              setAhead(null);
              void refresh();
              void onChanged();
            }}
          >
            back
          </button>
        </div>
        {ahead.length === 0 ? (
          <p className="muted">Nothing due in the next {AHEAD_DAYS} days here.</p>
        ) : (
          <ReviewQueue
            userId={userId}
            queue={ahead}
            // Snapshot + drop the head: re-querying the 7-day horizon would
            // re-admit just-graded cards (steps 1-3 land inside 7 days) and
            // loop them to step 4 with zero real spacing.
            refresh={async () => setAhead((q) => (q && q.length > 0 ? q.slice(1) : q))}
            onExhausted={() => {
              setAhead(null);
              void refresh();
              void onChanged();
            }}
          />
        )}
      </div>
    );
  }

  // Deliberately outside SM-2: it neither reads nor writes schedule state.
  if (quiz) {
    const quizWords: QuizWord[] = [];
    const seen = new Set<string>();
    for (const c of rows) {
      if (c.direction !== 'recognition' || !c.word || !c.word_en) continue;
      const key = wordKey(c.word);
      if (seen.has(key)) continue;
      seen.add(key);
      quizWords.push({ es: c.word, en: c.word_en });
    }
    return (
      <div className="stack">
        <div className="row" style={{ minHeight: 0 }}>
          <span className="eyebrow">by ear — {def.label.toLowerCase()}</span>
          <button className="btn quiet" onClick={() => setQuiz(false)}>
            back
          </button>
        </div>
        <ListeningQuiz words={quizWords} onClose={() => setQuiz(false)} />
      </div>
    );
  }

  // Test-me-now: this word's live cards, both directions, due ignored.
  // ReviewQueue always grades queue[0], so refresh just drops the head.
  if (test !== null) {
    return (
      <div className="stack">
        <div className="row" style={{ minHeight: 0 }}>
          <span className="eyebrow">test — {test[0]?.word ?? ''}</span>
          <button
            className="btn quiet"
            onClick={() => {
              setTest(null);
              void refresh();
              void onChanged();
            }}
          >
            back
          </button>
        </div>
        <ReviewQueue
          userId={userId}
          queue={test}
          refresh={async () => setTest((q) => (q && q.length > 0 ? q.slice(1) : q))}
          onExhausted={() => {
            setTest(null);
            setSheet(null);
            void refresh();
            void onChanged();
          }}
        />
      </div>
    );
  }

  const inProgress = words.length - mastered;
  const sheetCards = sheet === null ? [] : rows.filter((c) => c.word && wordKey(c.word) === sheet);
  const sheetRec = sheetCards.find((c) => c.direction === 'recognition');
  const sheetProd = sheetCards.find((c) => c.direction === 'production');
  const quizReady =
    !profile.quiet_mode &&
    synthesisAvailable() &&
    new Set(rows.filter((c) => c.direction === 'recognition' && c.word && c.word_en).map((c) => wordKey(c.word!)))
      .size >= QUIZ_MIN_WORDS;

  return (
    <div className="stack">
      <div className="row" style={{ minHeight: 0 }}>
        <span className="eyebrow">{def.label.toLowerCase()}</span>
        <button className="btn quiet" onClick={onBack}>
          back
        </button>
      </div>

      <div className="panel stack" style={{ gap: 6 }}>
        <div className="row" style={{ padding: 0, minHeight: 0 }}>
          <span className="mono" style={{ fontSize: 22 }}>
            {mastered} / {def.target}
          </span>
          <span className="muted" style={{ fontSize: 12 }}>
            {inProgress} in training
          </span>
        </div>
        <div className="mastery-bar">
          <div
            className="learning"
            style={{ width: `${Math.min(100, (words.length / def.target) * 100)}%` }}
          />
          <div
            className="mastered"
            style={{ width: `${Math.min(100, (mastered / def.target) * 100)}%` }}
          />
        </div>
      </div>

      {online ? (
        <button className="btn primary block" disabled={generating} onClick={() => void learn()}>
          {generating ? 'finding words' : 'Learn 20 new words'}
        </button>
      ) : (
        <p className="muted" style={{ fontSize: 13 }}>
          New words need a connection.
        </p>
      )}
      {genError && <p className="error-line">{genError}</p>}

      {quizReady && (
        <button
          className="btn block"
          onClick={() => {
            // This tap is the user gesture that unlocks iOS speech synthesis;
            // the quiz's autoplay effect runs outside any gesture.
            unlockSynthesis();
            setQuiz(true);
          }}
        >
          🔊 Quiz by ear
        </button>
      )}

      {dueCount === 0 && words.length > 0 && (
        <button className="btn block" onClick={() => void loadAhead()}>
          Get ahead — review this bucket early
        </button>
      )}

      {words.length > 0 && (
        <div className="panel stack" style={{ gap: 2 }}>
          <p className="eyebrow">words — tap one to inspect it</p>
          {words.map((w) => (
            <button
              className="row"
              key={w.word}
              onClick={() => setSheet(sheet === wordKey(w.word) ? null : wordKey(w.word))}
              style={{
                minHeight: 44,
                padding: '2px 0',
                background: 'none',
                border: 'none',
                width: '100%',
                textAlign: 'left',
                cursor: 'pointer',
              }}
            >
              <span lang="es" style={{ fontSize: 14, color: w.mastered ? 'var(--sage)' : 'var(--paper)' }}>
                {w.word}
              </span>
              <span className="mono muted" style={{ fontSize: 11 }}>
                {w.mastered ? '✓' : `${w.recognitionStep ?? '–'}·${w.productionStep ?? '–'}`}
              </span>
            </button>
          ))}
        </div>
      )}

      {sheet !== null && sheetCards.length > 0 && (
        <div className="panel stack" style={{ gap: 8 }} ref={sheetRef}>
          <div className="row" style={{ minHeight: 0, padding: 0 }}>
            <span lang="es" style={{ fontSize: 18, color: 'var(--ochre)' }}>
              {sheetRec?.word ?? sheetProd?.word}
            </span>
            <button className="btn quiet" onClick={() => setSheet(null)}>
              close
            </button>
          </div>
          <p className="muted" style={{ fontSize: 13 }}>
            {sheetRec?.word_en ?? sheetProd?.word_en}
          </p>
          {sheetRec && (
            <p lang="es" style={{ fontSize: 14, lineHeight: 1.5 }}>
              {sheetRec.es}
            </p>
          )}
          {sheetRec?.note && (
            <p className="muted" style={{ fontSize: 13 }}>
              {sheetRec.note}
            </p>
          )}
          <div className="stack" style={{ gap: 2 }}>
            {[
              { label: 'recognise it', card: sheetRec },
              { label: 'produce it', card: sheetProd },
            ].map(({ label, card }) => (
              <div className="row" key={label} style={{ minHeight: 0, padding: 0 }}>
                <span className="muted" style={{ fontSize: 12 }}>
                  {label}
                </span>
                <span className="mono muted" style={{ fontSize: 12 }}>
                  {card
                    ? `step ${card.step}/${MAX_STEP} · due ${formatDate(card.due)}`
                    : 'no card yet'}
                </span>
              </div>
            ))}
          </div>
          <button className="btn block" onClick={() => setTest(sheetCards)}>
            Test me now
          </button>
        </div>
      )}
    </div>
  );
}
