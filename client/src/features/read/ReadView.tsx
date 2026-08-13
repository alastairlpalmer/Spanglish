import { useCallback, useEffect, useMemo, useState } from 'react';
import type { ArticleResponse, GlossEntry } from '@seiscientas/shared';
import { db, type CachedArticle } from '../../db/dexie';
import { putCard } from '../../db/repo';
import { apiPost, ApiError } from '../../lib/api';
import { uuid } from '../../lib/id';
import { nowIso } from '../../lib/time';
import { useProfile } from '../../shell/ProfileContext';
import { useSessionTimer } from '../../session/useSessionTimer';
import { speak, stopSpeaking } from '../../speech/synthesis';
import { localeForDialect } from '../../speech/recognition';
import { weakConcepts } from '../drill/weak';

const KEEP_ARTICLES = 2;

async function fetchArticle(
  profile: { level: string; country: string | null },
  weak: string[],
): Promise<CachedArticle> {
  const res = await apiPost<ArticleResponse>('/api/ai/article', {
    level: profile.level,
    country: profile.country,
    weakConcepts: weak,
  });
  const article: CachedArticle = {
    id: uuid(),
    headline: res.headline,
    body: res.body,
    source: res.source,
    gloss: res.gloss,
    fetched_at: nowIso(),
    read_at: null,
  };
  await db.articles.put(article);
  // Keep only the most recent few — articles are disposable.
  const all = await db.articles.orderBy('fetched_at').reverse().toArray();
  if (all.length > KEEP_ARTICLES + 1) {
    await db.articles.bulkDelete(all.slice(KEEP_ARTICLES + 1).map((a) => a.id));
  }
  return article;
}

/** Sentence containing the word, for mined-card context. */
function sentenceFor(body: string, word: string): string {
  const sentences = body.match(/[^.!?¿¡]+[.!?]*/g) ?? [body];
  const hit = sentences.find((s) => s.toLowerCase().includes(word.toLowerCase()));
  return (hit ?? body).trim();
}

/** Render the body with glossed words wrapped in tappable spans. */
function GlossedBody({
  body,
  gloss,
  onTap,
}: {
  body: string;
  gloss: GlossEntry[];
  onTap: (entry: GlossEntry) => void;
}): JSX.Element {
  const nodes = useMemo(() => {
    // Build one regex over all gloss words, longest first so multi-word
    // entries ("hora punta") win over their parts.
    const words = [...gloss].sort((a, b) => b.word.length - a.word.length);
    const escaped = words.map((g) => g.word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
    if (escaped.length === 0) return [body];
    const re = new RegExp(`(${escaped.join('|')})`, 'gi');
    const parts = body.split(re);
    return parts.map((part, i) => {
      const entry = gloss.find((g) => g.word.toLowerCase() === part.toLowerCase());
      if (entry) {
        return (
          <span key={i} className="glossed" onClick={() => onTap(entry)}>
            {part}
          </span>
        );
      }
      return part;
    });
  }, [body, gloss, onTap]);

  return <p className="reading-body">{nodes}</p>;
}

export function ReadView({ userId, onClose }: { userId: string; onClose: () => void }): JSX.Element {
  const { profile, update } = useProfile();
  const [article, setArticle] = useState<CachedArticle | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [glossOpen, setGlossOpen] = useState<GlossEntry | null>(null);
  const [mined, setMined] = useState<Set<string>>(new Set());
  const [translating, setTranslating] = useState(false);
  const [attempt, setAttempt] = useState('');
  const [feedback, setFeedback] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useSessionTimer(userId, 'read', profile.daily_minutes);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    // Cached unread piece first — the prefetch pipeline fills this.
    const cached = await db.articles.orderBy('fetched_at').reverse().toArray();
    const unread = cached.find((a) => !a.read_at);
    if (unread) {
      setArticle(unread);
      setLoading(false);
    } else if (navigator.onLine) {
      try {
        setArticle(await fetchArticle(profile, await weakConcepts(userId, 5)));
      } catch (e) {
        if (e instanceof ApiError && e.code === 'budget_paused')
          setError('AI features paused until tomorrow.');
        else setError('Could not find a story. Retry.');
      } finally {
        setLoading(false);
      }
    } else {
      const lastRead = cached[0] ?? null;
      if (lastRead) setArticle(lastRead); // offline: re-read the cached piece
      else setError('Offline — no cached story yet.');
      setLoading(false);
    }
  }, [profile]);

  useEffect(() => {
    void load();
    return () => stopSpeaking();
  }, [load]);

  // Prefetch tomorrow's piece once today's is on screen.
  useEffect(() => {
    if (!article || !navigator.onLine) return;
    void (async () => {
      const unreadCount = await db.articles.filter((a) => !a.read_at).count();
      if (unreadCount <= 1) {
        try {
          await fetchArticle(profile, await weakConcepts(userId, 5));
        } catch {
          // prefetch is best-effort
        }
      }
    })();
  }, [article, profile]);

  async function mine(entry: GlossEntry): Promise<void> {
    if (!article || mined.has(entry.word)) return;
    await putCard({
      id: uuid(),
      user_id: userId,
      direction: 'recognition',
      es: sentenceFor(article.body, entry.word),
      en: null,
      word: entry.word,
      word_en: entry.meaning,
      note: `From "${article.headline}" (${article.source})`,
      prompt: null,
      answer: null,
      accepts: null,
      concept: null,
      source: 'mined',
      step: 0,
      due: nowIso(),
      seen: 0,
      deleted_at: null,
      updated_at: nowIso(),
    });
    setMined(new Set([...mined, entry.word]));
    setGlossOpen(null);
  }

  async function checkTranslation(): Promise<void> {
    if (!article || !attempt.trim()) return;
    setBusy(true);
    setFeedback(null);
    try {
      const res = await apiPost<{ feedback: string }>('/api/ai/translate', {
        body: article.body,
        attempt: attempt.trim(),
      });
      setFeedback(res.feedback);
    } catch (e) {
      if (e instanceof ApiError && e.code === 'budget_paused')
        setFeedback('AI features paused until tomorrow.');
      else setFeedback('Check failed. Retry.');
    } finally {
      setBusy(false);
    }
  }

  async function finish(): Promise<void> {
    stopSpeaking();
    if (article && !article.read_at) {
      await db.articles.put({ ...article, read_at: nowIso() });
    }
    onClose();
  }

  const textSize = 19 * (profile.text_size / 100);

  return (
    <div className="reading-room" style={{ ['--reading-size' as never]: `${textSize}px` }}>
      <div className="reading-inner">
        <div className="reading-bar">
          <button onClick={() => void finish()}>← done</button>
          <span>
            <button
              onClick={() => void update({ text_size: Math.max(80, profile.text_size - 10) })}
              aria-label="smaller text"
            >
              A−
            </button>
            <button
              onClick={() => void update({ text_size: Math.min(140, profile.text_size + 10) })}
              aria-label="larger text"
            >
              A+
            </button>
          </span>
        </div>

        {loading && <p className="reading-body">finding a story</p>}
        {error && (
          <div>
            <p className="reading-body">{error}</p>
            <div className="reading-controls">
              <button onClick={() => void load()}>Retry</button>
            </div>
          </div>
        )}

        {article && (
          <>
            <h2 lang="es">{article.headline}</h2>
            <p className="reading-source">{article.source}</p>
            <GlossedBody body={article.body} gloss={article.gloss} onTap={setGlossOpen} />

            <div className="reading-controls">
              {!profile.quiet_mode && (
                <button onClick={() => speak(article.body, localeForDialect(profile.dialect))}>
                  read aloud
                </button>
              )}
              <button onClick={() => setTranslating(!translating)}>
                {translating ? 'hide translation practice' : 'translation practice'}
              </button>
            </div>

            {translating && (
              <div>
                <textarea
                  value={attempt}
                  onChange={(e) => setAttempt(e.target.value)}
                  placeholder="Write the English translation"
                />
                <div className="reading-controls">
                  <button disabled={busy || !attempt.trim()} onClick={() => void checkTranslation()}>
                    {busy ? 'checking' : 'Check it'}
                  </button>
                </div>
                {feedback && <p className="reading-feedback">{feedback}</p>}
              </div>
            )}
          </>
        )}
      </div>

      {glossOpen && (
        <>
          <div className="sheet-backdrop" onClick={() => setGlossOpen(null)} />
          <div className="gloss-sheet" role="dialog">
            <p className="word" lang="es">
              {glossOpen.word}
            </p>
            <p style={{ margin: '8px 0 16px' }}>{glossOpen.meaning}</p>
            <div className="reading-controls" style={{ margin: 0 }}>
              {mined.has(glossOpen.word) ? (
                <button disabled>in the deck</button>
              ) : (
                <button onClick={() => void mine(glossOpen)}>Add to deck</button>
              )}
              <button onClick={() => setGlossOpen(null)}>Close</button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
