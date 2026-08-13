import { useCallback, useEffect, useMemo, useState } from 'react';
import type { ArticleResponse, GlossEntry, TranslateResponse } from '@seiscientas/shared';
import { db, type CachedArticle } from '../../db/dexie';
import { logSession, putCard, recordError } from '../../db/repo';
import { podcastsFor } from './podcasts';
import { apiPost, ApiError } from '../../lib/api';
import { uuid } from '../../lib/id';
import { nowIso } from '../../lib/time';
import { useProfile } from '../../shell/ProfileContext';
import { useSessionTimer } from '../../session/useSessionTimer';
import { speak, stopSpeaking } from '../../speech/synthesis';
import { localeForDialect } from '../../speech/recognition';
import { weakConcepts } from '../drill/weak';

const KEEP_ARTICLES = 2;
const TOPIC_KEY = 'read-topic';
const TOPICS = ['anything', 'sports', 'tech', 'history', 'culture', 'science', 'politics'];

async function fetchArticle(
  profile: { level: string; country: string | null },
  weak: string[],
  topic: string,
): Promise<CachedArticle> {
  const res = await apiPost<ArticleResponse>('/api/ai/article', {
    level: profile.level,
    country: profile.country,
    topic: topic === 'anything' ? undefined : topic,
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

const WORD_RE = /^[a-zA-ZáéíóúüñÁÉÍÓÚÜÑ]{2,}$/;

/** Render the body: glossed words underlined, and EVERY other word tappable
 *  for an on-demand lookup — beginners need the whole text to answer back. */
function GlossedBody({
  body,
  gloss,
  onTap,
  onTapAny,
}: {
  body: string;
  gloss: GlossEntry[];
  onTap: (entry: GlossEntry) => void;
  onTapAny: (word: string) => void;
}): JSX.Element {
  const nodes = useMemo(() => {
    // One regex over all gloss words, longest first so multi-word entries
    // ("hora punta") win over their parts.
    const words = [...gloss].sort((a, b) => b.word.length - a.word.length);
    const escaped = words.map((g) => g.word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
    const parts = escaped.length
      ? body.split(new RegExp(`(${escaped.join('|')})`, 'gi'))
      : [body];

    let key = 0;
    return parts.flatMap((part) => {
      const entry = gloss.find((g) => g.word.toLowerCase() === part.toLowerCase());
      if (entry) {
        return (
          <span key={key++} className="glossed" onClick={() => onTap(entry)}>
            {part}
          </span>
        );
      }
      // Plain text: every word token still gets a tap target.
      return part.split(/([a-zA-ZáéíóúüñÁÉÍÓÚÜÑ]+)/).map((tok) =>
        WORD_RE.test(tok) ? (
          <span key={key++} onClick={() => onTapAny(tok)}>
            {tok}
          </span>
        ) : (
          <span key={key++}>{tok}</span>
        ),
      );
    });
  }, [body, gloss, onTap, onTapAny]);

  return <p className="reading-body">{nodes}</p>;
}

export function ReadView({ userId, onClose }: { userId: string; onClose: () => void }): JSX.Element {
  const { profile, update } = useProfile();
  const [article, setArticle] = useState<CachedArticle | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [glossOpen, setGlossOpen] = useState<GlossEntry | null>(null);
  const [lookingUp, setLookingUp] = useState(false);
  const [mined, setMined] = useState<Set<string>>(new Set());
  const [translating, setTranslating] = useState(false);
  const [attempt, setAttempt] = useState('');
  const [feedback, setFeedback] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [topic, setTopic] = useState(() => localStorage.getItem(TOPIC_KEY) ?? 'anything');
  const [pickingTopic, setPickingTopic] = useState(false);
  const [listening, setListening] = useState(false);
  const [loggedPodcast, setLoggedPodcast] = useState<string | null>(null);

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
        setArticle(
          await fetchArticle(
            profile,
            await weakConcepts(userId, 5),
            localStorage.getItem(TOPIC_KEY) ?? 'anything',
          ),
        );
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
          await fetchArticle(
            profile,
            await weakConcepts(userId, 5),
            localStorage.getItem(TOPIC_KEY) ?? 'anything',
          );
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
      const res = await apiPost<TranslateResponse>('/api/ai/translate', {
        body: article.body,
        attempt: attempt.trim(),
      });
      setFeedback(res.feedback);
      // Comprehension errors feed the ledger like any other error.
      for (const e of res.errors) {
        await recordError({
          userId,
          concept: e.concept,
          wrong: e.wrong,
          right: e.right,
          why: e.why,
        });
      }
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

  async function newStory(picked: string): Promise<void> {
    setPickingTopic(false);
    setTopic(picked);
    localStorage.setItem(TOPIC_KEY, picked);
    if (!navigator.onLine) return;
    stopSpeaking();
    setFeedback(null);
    setTranslating(false);
    if (article && !article.read_at) {
      await db.articles.put({ ...article, read_at: nowIso() });
    }
    setArticle(null);
    setLoading(true);
    setError(null);
    try {
      setArticle(await fetchArticle(profile, await weakConcepts(userId, 5), picked));
    } catch (e) {
      if (e instanceof ApiError && e.code === 'budget_paused')
        setError('AI features paused until tomorrow.');
      else setError('Could not find a story. Retry.');
    } finally {
      setLoading(false);
    }
  }

  async function logPodcast(name: string): Promise<void> {
    await logSession({ userId, type: 'input', minutes: 30, isBonus: false, at: nowIso() });
    setLoggedPodcast(name);
  }

  async function lookupWord(word: string): Promise<void> {
    if (!article) return;
    // Already-glossed words route through their existing entry.
    const known = article.gloss.find((g) => g.word.toLowerCase() === word.toLowerCase());
    if (known) {
      setGlossOpen(known);
      return;
    }
    if (!navigator.onLine) {
      setGlossOpen({ word, meaning: 'Lookup needs a connection.' });
      return;
    }
    setLookingUp(true);
    setGlossOpen({ word, meaning: '…' });
    try {
      const res = await apiPost<{ meaning: string; note: string | null }>('/api/ai/word', {
        word,
        sentence: sentenceFor(article.body, word),
        level: profile.level,
      });
      setGlossOpen({ word, meaning: res.note ? `${res.meaning} — ${res.note}` : res.meaning });
    } catch {
      setGlossOpen({ word, meaning: 'Lookup failed. Tap again to retry.' });
    } finally {
      setLookingUp(false);
    }
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
            <GlossedBody
              body={article.body}
              gloss={article.gloss}
              onTap={setGlossOpen}
              onTapAny={(w) => void lookupWord(w)}
            />

            <div className="reading-controls">
              {!profile.quiet_mode && (
                <button onClick={() => speak(article.body, localeForDialect(profile.dialect))}>
                  read aloud
                </button>
              )}
              <button onClick={() => setTranslating(!translating)}>
                {translating ? 'hide translation practice' : 'translation practice'}
              </button>
              {navigator.onLine && (
                <button onClick={() => setPickingTopic(!pickingTopic)}>
                  new story{topic !== 'anything' ? ` · ${topic}` : ''}
                </button>
              )}
              <button onClick={() => setListening(!listening)}>
                {listening ? 'hide listening' : 'listening'}
              </button>
            </div>

            {pickingTopic && (
              <div className="reading-controls" style={{ marginTop: 0 }}>
                {TOPICS.map((t) => (
                  <button
                    key={t}
                    style={t === topic ? { borderColor: '#b08427', color: '#b08427' } : undefined}
                    onClick={() => void newStory(t)}
                  >
                    {t}
                  </button>
                ))}
              </div>
            )}

            {listening && (
              <div style={{ marginTop: 4 }}>
                <p className="reading-source" style={{ marginBottom: 10 }}>
                  podcasts at your level — listening counts, log it
                </p>
                {podcastsFor(profile.level).map((p) => (
                  <div key={p.name} style={{ marginBottom: 14 }}>
                    <p style={{ fontSize: 15, fontWeight: 600 }}>
                      <a
                        href={p.url}
                        target="_blank"
                        rel="noreferrer"
                        style={{ color: 'inherit' }}
                      >
                        {p.name} ↗
                      </a>
                    </p>
                    <p style={{ fontSize: 13, color: '#5a6676' }}>{p.blurb}</p>
                    <div className="reading-controls" style={{ margin: '6px 0 0' }}>
                      {loggedPodcast === p.name ? (
                        <button disabled>30 min logged</button>
                      ) : (
                        <button onClick={() => void logPodcast(p.name)}>log 30 min</button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}

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
                <button
                  disabled={lookingUp || glossOpen.meaning === '…'}
                  onClick={() => void mine(glossOpen)}
                >
                  Add to deck
                </button>
              )}
              <button onClick={() => setGlossOpen(null)}>Close</button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
