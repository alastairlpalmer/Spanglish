// The reading room: news and the daily story, rendered inside the Read tab.
// Light serif surface, glossed words underlined, every word tappable.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ArticleResponse, GlossEntry, SerialResponse, TranslateResponse } from '@seiscientas/shared';
import { db, type CachedArticle, type Episode } from '../../db/dexie';
import { logSession, putCard, recordError } from '../../db/repo';
import { podcastsFor } from './podcasts';
import { apiPost, friendlyApiError } from '../../lib/api';
import { uuid } from '../../lib/id';
import { localDateKey, nowIso } from '../../lib/time';
import { splitSentences } from '../../lib/text';
import { useProfile } from '../../shell/ProfileContext';
import { useSessionTimer } from '../../session/useSessionTimer';
import { speak, stopSpeaking } from '../../speech/synthesis';
import { localeForDialect } from '../../speech/recognition';
import { weakConcepts } from '../drill/weak';

const KEEP_ARTICLES = 2;
const TOPIC_KEY = 'read-topic';
const TOPICS = ['anything', 'sports', 'tech', 'history', 'culture', 'science', 'politics'];
const WORD_RE = /^[a-zA-ZáéíóúüñÁÉÍÓÚÜÑ]{2,}$/;
const LETTER = 'a-zA-ZáéíóúüñÁÉÍÓÚÜÑ';
// A piece counts as read only after this long on screen — otherwise flipping
// between segments would burn unread articles and re-trigger paid fetches.
const READ_THRESHOLD_MS = 45_000;

interface Piece {
  kind: 'news' | 'story';
  id: string;
  headline: string;
  body: string;
  sourceLabel: string;
  gloss: GlossEntry[];
}

function articlePiece(a: CachedArticle): Piece {
  return { kind: 'news', id: a.id, headline: a.headline, body: a.body, sourceLabel: a.source, gloss: a.gloss };
}

function episodePiece(e: Episode): Piece {
  return {
    kind: 'story',
    id: e.id,
    headline: e.title,
    body: e.body,
    sourceLabel: `episodio ${e.n}`,
    gloss: e.gloss,
  };
}

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
  const all = await db.articles.orderBy('fetched_at').reverse().toArray();
  if (all.length > KEEP_ARTICLES + 1) {
    await db.articles.bulkDelete(all.slice(KEEP_ARTICLES + 1).map((a) => a.id));
  }
  return article;
}

async function fetchEpisode(profile: { level: string }, weak: string[]): Promise<Episode> {
  const last = (await db.episodes.orderBy('n').reverse().first()) ?? null;
  const res = await apiPost<SerialResponse>('/api/ai/serial', {
    level: profile.level,
    episode: (last?.n ?? 0) + 1,
    // Belt-and-braces truncation: an oversized stored summary must never be
    // able to fail request validation and brick the serial.
    summary: last?.summary?.slice(0, 3900) ?? null,
    weakConcepts: weak,
  });
  const episode: Episode = {
    id: uuid(),
    n: (last?.n ?? 0) + 1,
    date: localDateKey(),
    title: res.title,
    body: res.body,
    summary: res.summary,
    gloss: res.gloss,
    read_at: null,
  };
  await db.episodes.put(episode);
  return episode;
}

/** Sentence containing the word, for mined-card context. */
function sentenceFor(body: string, word: string): string {
  const sentences = splitSentences(body);
  return sentences.find((s) => s.toLowerCase().includes(word.toLowerCase())) ?? body.trim();
}

/** Sentences long enough to dictate. */
function dictationSentences(body: string): string[] {
  return splitSentences(body)
    .filter((s) => s.length >= 20 && s.length <= 120)
    .slice(0, 4);
}

const stripDiacritics = (s: string): string => s.normalize('NFD').replace(/[̀-ͯ]/g, '');
const normWord = (s: string): string =>
  stripDiacritics(s.toLowerCase().replace(/[^a-zA-ZáéíóúüñÁÉÍÓÚÜÑ]/g, ''));

interface DictationResult {
  words: Array<{ word: string; ok: boolean; counted: boolean }>;
}

function gradeDictation(target: string, typed: string): DictationResult {
  const targetWords = target.split(/\s+/).filter(Boolean);
  const typedNorm = typed.split(/\s+/).map(normWord).filter(Boolean);
  // Lenient: a target word counts if it appears anywhere in the attempt —
  // beginners drop articles and reorder; position-exact grading punishes too
  // hard for a listening exercise. Tokens with no letters (numbers, «») are
  // ungradeable and never count against the learner.
  const pool = new Map<string, number>();
  for (const w of typedNorm) pool.set(w, (pool.get(w) ?? 0) + 1);
  return {
    words: targetWords.map((w) => {
      const n = normWord(w);
      if (n.length === 0) return { word: w, ok: true, counted: false };
      const have = pool.get(n) ?? 0;
      if (have > 0) {
        pool.set(n, have - 1);
        return { word: w, ok: true, counted: true };
      }
      return { word: w, ok: false, counted: true };
    }),
  };
}

/** Body renderer: glossed words underlined, every other word tappable.
 *  Memoized on the text alone — handlers ride refs so keystrokes elsewhere
 *  in the view never re-tokenize the article. */
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
  const handlers = useRef({ onTap, onTapAny });
  handlers.current = { onTap, onTapAny };

  const nodes = useMemo(() => {
    const byWord = new Map(gloss.map((g) => [g.word.toLowerCase(), g]));
    const words = [...gloss].sort((a, b) => b.word.length - a.word.length);
    const escaped = words.map((g) => g.word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
    // Word boundaries: without them a gloss word matches inside longer words
    // ("suena" splitting "suenan") and taps land on the wrong form.
    const parts = escaped.length
      ? body.split(new RegExp(`(?<![${LETTER}])(${escaped.join('|')})(?![${LETTER}])`, 'gi'))
      : [body];

    let key = 0;
    return parts.flatMap((part) => {
      const entry = byWord.get(part.toLowerCase());
      if (entry) {
        return (
          <span key={key++} className="glossed" onClick={() => handlers.current.onTap(entry)}>
            {part}
          </span>
        );
      }
      return part.split(new RegExp(`([${LETTER}]+)`)).map((tok) =>
        WORD_RE.test(tok) ? (
          <span key={key++} onClick={() => handlers.current.onTapAny(tok)}>
            {tok}
          </span>
        ) : (
          <span key={key++}>{tok}</span>
        ),
      );
    });
  }, [body, gloss]);

  return <p className="reading-body">{nodes}</p>;
}

export function ReadView({ userId, mode }: { userId: string; mode: 'news' | 'story' }): JSX.Element {
  const { profile, update } = useProfile();
  const [article, setArticle] = useState<CachedArticle | null>(null);
  const [episode, setEpisode] = useState<Episode | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [glossOpen, setGlossOpen] = useState<GlossEntry | null>(null);
  const [mined, setMined] = useState<Set<string>>(new Set());
  const [translating, setTranslating] = useState(false);
  const [attempt, setAttempt] = useState('');
  const [feedback, setFeedback] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [topic, setTopic] = useState(() => localStorage.getItem(TOPIC_KEY) ?? 'anything');
  const [pickingTopic, setPickingTopic] = useState(false);
  const [listening, setListening] = useState(false);
  const [loggedPodcast, setLoggedPodcast] = useState<string | null>(null);
  const [dictation, setDictation] = useState<{
    sentences: string[];
    i: number;
    typed: string;
    result: DictationResult | null;
    correctWords: number;
    totalWords: number;
  } | null>(null);

  useSessionTimer(userId, 'read', profile.daily_minutes);

  const piece: Piece | null =
    mode === 'news' ? (article ? articlePiece(article) : null) : episode ? episodePiece(episode) : null;

  // Only object identities in deps cause spurious reloads — depend on the
  // fields actually used.
  const level = profile.level;
  const country = profile.country;

  const loadNews = useCallback(async () => {
    setLoading(true);
    setError(null);
    const cached = await db.articles.orderBy('fetched_at').reverse().toArray();
    const unread = cached.find((a) => !a.read_at);
    if (unread) {
      setArticle(unread);
      setLoading(false);
    } else if (navigator.onLine) {
      try {
        setArticle(
          await fetchArticle(
            { level, country },
            await weakConcepts(userId, 5),
            localStorage.getItem(TOPIC_KEY) ?? 'anything',
          ),
        );
      } catch (e) {
        setError(friendlyApiError(e, 'Could not find a story. Retry.'));
      } finally {
        setLoading(false);
      }
    } else {
      const lastRead = cached[0] ?? null;
      if (lastRead) setArticle(lastRead);
      else setError('Offline — no cached story yet.');
      setLoading(false);
    }
  }, [level, country, userId]);

  const loadStory = useCallback(async () => {
    setLoading(true);
    setError(null);
    const today = await db.episodes.where('date').equals(localDateKey()).first();
    if (today) {
      setEpisode(today);
      setLoading(false);
      return;
    }
    if (navigator.onLine) {
      try {
        setEpisode(await fetchEpisode({ level }, await weakConcepts(userId, 5)));
      } catch (e) {
        setError(friendlyApiError(e, 'Could not write the next episode. Retry.'));
      } finally {
        setLoading(false);
      }
    } else {
      const last = (await db.episodes.orderBy('n').reverse().first()) ?? null;
      if (last) setEpisode(last);
      else setError('Offline — the story starts when you have a connection.');
      setLoading(false);
    }
  }, [level, userId]);

  const load = useCallback(async () => {
    setDictation(null);
    if (mode === 'news') await loadNews();
    else await loadStory();
  }, [mode, loadNews, loadStory]);

  useEffect(() => {
    void load();
    return () => stopSpeaking();
  }, [load]);

  // A piece is marked read on unmount only after it has actually been on
  // screen a while — segment flips must not burn unread content.
  const displayed = useRef<{ pieceId: string | null; since: number }>({ pieceId: null, since: 0 });
  if (piece && displayed.current.pieceId !== piece.id) {
    displayed.current = { pieceId: piece.id, since: Date.now() };
  }
  const latest = useRef<{ article: CachedArticle | null; episode: Episode | null }>({
    article: null,
    episode: null,
  });
  latest.current = { article, episode };
  useEffect(() => {
    return () => {
      if (Date.now() - displayed.current.since < READ_THRESHOLD_MS) return;
      const { article: a, episode: e } = latest.current;
      if (a && !a.read_at && displayed.current.pieceId === a.id) {
        void db.articles.put({ ...a, read_at: nowIso() });
      }
      if (e && !e.read_at && displayed.current.pieceId === e.id) {
        void db.episodes.put({ ...e, read_at: nowIso() });
      }
    };
  }, []);

  // Prefetch tomorrow's news piece — at most once per mount.
  const prefetched = useRef(false);
  useEffect(() => {
    if (mode !== 'news' || !article || !navigator.onLine || prefetched.current) return;
    prefetched.current = true;
    void (async () => {
      const unreadCount = await db.articles.filter((a) => !a.read_at).count();
      if (unreadCount <= 1) {
        try {
          await fetchArticle(
            { level, country },
            await weakConcepts(userId, 5),
            localStorage.getItem(TOPIC_KEY) ?? 'anything',
          );
        } catch {
          // prefetch is best-effort
        }
      }
    })();
  }, [mode, article, level, country, userId]);

  async function mine(entry: GlossEntry): Promise<void> {
    if (!piece || mined.has(entry.word)) return;
    await putCard({
      id: uuid(),
      user_id: userId,
      direction: 'recognition',
      bucket: null, // mined words are general vocabulary
      es: sentenceFor(piece.body, entry.word),
      en: null,
      word: entry.word,
      word_en: entry.meaning,
      note: `From "${piece.headline}" (${piece.sourceLabel})`,
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

  async function lookupWord(word: string): Promise<void> {
    if (!piece) return;
    const known = piece.gloss.find((g) => g.word.toLowerCase() === word.toLowerCase());
    if (known) {
      setGlossOpen(known);
      return;
    }
    if (!navigator.onLine) {
      setGlossOpen({ word, meaning: 'Lookup needs a connection.' });
      return;
    }
    setGlossOpen({ word, meaning: '…' });
    try {
      const res = await apiPost<{ meaning: string; note: string | null }>('/api/ai/word', {
        word,
        sentence: sentenceFor(piece.body, word),
        level,
      });
      setGlossOpen({ word, meaning: res.note ? `${res.meaning} — ${res.note}` : res.meaning });
    } catch {
      setGlossOpen({ word, meaning: 'Lookup failed. Tap again to retry.' });
    }
  }

  async function checkTranslation(): Promise<void> {
    if (!piece || !attempt.trim()) return;
    setBusy(true);
    setFeedback(null);
    try {
      const res = await apiPost<TranslateResponse>('/api/ai/translate', {
        body: piece.body,
        attempt: attempt.trim().slice(0, 2000),
      });
      setFeedback(res.feedback);
      for (const e of res.errors) {
        await recordError({ userId, concept: e.concept, wrong: e.wrong, right: e.right, why: e.why });
      }
    } catch (e) {
      setFeedback(friendlyApiError(e, 'Check failed. Retry.'));
    } finally {
      setBusy(false);
    }
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
      setArticle(await fetchArticle({ level, country }, await weakConcepts(userId, 5), picked));
    } catch (e) {
      setError(friendlyApiError(e, 'Could not find a story. Retry.'));
    } finally {
      setLoading(false);
    }
  }

  async function logPodcast(name: string): Promise<void> {
    await logSession({ userId, type: 'input', minutes: 30, isBonus: false, at: nowIso() });
    setLoggedPodcast(name);
  }

  // --- dictation ---
  function startDictation(): void {
    if (!piece) return;
    const sentences = dictationSentences(piece.body);
    if (sentences.length === 0) return;
    stopSpeaking();
    setDictation({ sentences, i: 0, typed: '', result: null, correctWords: 0, totalWords: 0 });
    speak(sentences[0]!, localeForDialect(profile.dialect));
  }

  function dictationCheck(): void {
    if (!dictation || dictation.result) return;
    const target = dictation.sentences[dictation.i]!;
    const result = gradeDictation(target, dictation.typed);
    const counted = result.words.filter((w) => w.counted);
    setDictation({
      ...dictation,
      result,
      correctWords: dictation.correctWords + counted.filter((w) => w.ok).length,
      totalWords: dictation.totalWords + counted.length,
    });
  }

  function dictationNext(): void {
    if (!dictation) return;
    const next = dictation.i + 1;
    setDictation({ ...dictation, i: next, typed: '', result: null });
    if (next < dictation.sentences.length) {
      speak(dictation.sentences[next]!, localeForDialect(profile.dialect));
    }
  }

  const textSize = 19 * (profile.text_size / 100);
  const dictationDone = dictation && dictation.i >= dictation.sentences.length;

  return (
    <div className="reading-room reading-room--tab" style={{ ['--reading-size' as never]: `${textSize}px` }}>
      <div className="reading-inner">
        <div className="reading-bar">
          <span />
          <span>
            <button onClick={() => void update({ text_size: Math.max(80, profile.text_size - 10) })} aria-label="smaller text">
              A−
            </button>
            <button onClick={() => void update({ text_size: Math.min(140, profile.text_size + 10) })} aria-label="larger text">
              A+
            </button>
          </span>
        </div>

        {loading && <p className="reading-body">{mode === 'news' ? 'finding a story' : 'writing the next episode'}</p>}
        {error && (
          <div>
            <p className="reading-body">{error}</p>
            <div className="reading-controls">
              <button onClick={() => void load()}>Retry</button>
            </div>
          </div>
        )}

        {piece && !dictation && (
          <>
            <h2 lang="es">{piece.headline}</h2>
            <p className="reading-source">{piece.sourceLabel}</p>
            <GlossedBody
              body={piece.body}
              gloss={piece.gloss}
              onTap={setGlossOpen}
              onTapAny={(w) => void lookupWord(w)}
            />

            <div className="reading-controls">
              {!profile.quiet_mode && (
                <button onClick={() => speak(piece.body, localeForDialect(profile.dialect))}>read aloud</button>
              )}
              {!profile.quiet_mode && <button onClick={startDictation}>dictation</button>}
              <button onClick={() => setTranslating(!translating)}>
                {translating ? 'hide translation practice' : 'translation practice'}
              </button>
              {mode === 'news' && navigator.onLine && (
                <button onClick={() => setPickingTopic(!pickingTopic)}>
                  new story{topic !== 'anything' ? ` · ${topic}` : ''}
                </button>
              )}
              <button onClick={() => setListening(!listening)}>{listening ? 'hide listening' : 'listening'}</button>
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
                      <a href={p.url} target="_blank" rel="noreferrer" style={{ color: 'inherit' }}>
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
                  maxLength={2000}
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

        {dictation && !dictationDone && (
          <div>
            <p className="reading-source">
              dictation · {dictation.i + 1} / {dictation.sentences.length}
            </p>
            <div className="reading-controls">
              <button onClick={() => speak(dictation.sentences[dictation.i]!, localeForDialect(profile.dialect))}>
                play again
              </button>
              <button onClick={() => setDictation(null)}>stop</button>
            </div>
            {!dictation.result ? (
              <div>
                <textarea
                  value={dictation.typed}
                  onChange={(e) => setDictation({ ...dictation, typed: e.target.value })}
                  placeholder="Type what you heard"
                  lang="es"
                  autoCapitalize="off"
                />
                <div className="reading-controls">
                  <button disabled={!dictation.typed.trim()} onClick={dictationCheck}>
                    Check it
                  </button>
                </div>
              </div>
            ) : (
              <div>
                <p className="reading-body" style={{ marginTop: 8 }}>
                  {dictation.result.words.map((w, i) => (
                    <span key={i} style={{ color: w.ok ? '#2c7a54' : '#b0402c' }}>
                      {w.word}{' '}
                    </span>
                  ))}
                </p>
                <div className="reading-controls">
                  <button onClick={dictationNext}>
                    {dictation.i + 1 >= dictation.sentences.length ? 'Finish' : 'Next sentence'}
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {dictation && dictationDone && (
          <div>
            <p className="reading-source">dictation done</p>
            <p className="reading-body">
              {dictation.correctWords} of {dictation.totalWords} words heard right.
            </p>
            <div className="reading-controls">
              <button onClick={() => setDictation(null)}>Back to the text</button>
            </div>
          </div>
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
                <button disabled={glossOpen.meaning === '…'} onClick={() => void mine(glossOpen)}>
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
