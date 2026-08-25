import { useEffect, useRef, useState } from 'react';
import type { ReviewResponse, TalkRequest } from '@seiscientas/shared';
import { isBeginner, isPhraseCard } from '@seiscientas/shared';
import { streamTalk } from '../../lib/stream';
import { apiPost, friendlyApiError } from '../../lib/api';
import { useProfile } from '../../shell/ProfileContext';
import { useSessionTimer } from '../../session/useSessionTimer';
import { useAnswerMode } from '../../speech/useAnswerMode';
import { useHoldToTalk } from '../../speech/useHoldToTalk';
import { localeForDialect } from '../../speech/recognition';
import { speak, stopSpeaking, synthesisAvailable } from '../../speech/synthesis';
import { recordReviewErrors } from '../../db/repo';
import { db } from '../../db/dexie';
import { weakConcepts } from '../drill/weak';
import { ReviewStack } from './ReviewStack';

const SCENARIOS = [
  'free conversation',
  'renting a flat',
  'disputing a bill',
  'meeting someone',
  'asking directions',
  'a job interview',
];

const RINGER_NOTE_KEY = 'ringer-note-shown';

interface Message {
  role: 'user' | 'assistant';
  content: string;
}

interface Suggestion {
  es: string;
  en: string;
}

// Beginner replies arrive as: <tutor text>\n@@@\n<es | en> lines. The
// suggestions are interface hints — stripped from history and never spoken.
function splitReply(raw: string): { text: string; suggestions: Suggestion[] } {
  const i = raw.indexOf('@@@');
  if (i === -1) return { text: raw.trim(), suggestions: [] };
  const suggestions = raw
    .slice(i + 3)
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => {
      const [es, en] = l.split('|').map((s) => s.trim());
      return es ? { es, en: en ?? '' } : null;
    })
    .filter((s): s is Suggestion => s !== null)
    .slice(0, 3);
  return { text: raw.slice(0, i).trim(), suggestions };
}

// Conversation state lives only in this component, and the shell unmounts it
// on every tab switch — an accidental tap on the bottom bar must not destroy
// ten minutes of talking. Saved here on unmount, restored on mount, cleared
// when a conversation properly ends.
let savedTalk: { scenario: string; messages: Message[] } | null = null;

export function TalkView({ userId, online }: { userId: string; online: boolean }): JSX.Element {
  const { profile } = useProfile();
  const [scenario, setScenario] = useState<string | null>(() => savedTalk?.scenario ?? null);
  const [messages, setMessages] = useState<Message[]>(() => savedTalk?.messages ?? []);
  const [streamingText, setStreamingText] = useState<string | null>(null);
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [typed, setTyped] = useState('');
  const [review, setReview] = useState<ReviewResponse | null>(null);
  const [reviewing, setReviewing] = useState(false);
  // Five in-training bucket words the tutor is asked to weave in — the
  // bridge from the card deck to real use. Fixed for the conversation.
  const [targetWords, setTargetWords] = useState<string[]>([]);
  // Errors carry their source so retry does the right thing: re-sending the
  // last message is only correct for a failed send, not a failed review.
  const [error, setError] = useState<{ source: 'send' | 'review'; message: string } | null>(null);
  const [ringerNote, setRingerNote] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const logRef = useRef<HTMLDivElement>(null);

  useSessionTimer(userId, 'talk', profile.daily_minutes);

  const locale = localeForDialect(profile.dialect);
  const quiet = profile.quiet_mode;

  const hold = useHoldToTalk(locale, (text) => void send(text));
  const answer = useAnswerMode();

  useEffect(() => {
    logRef.current?.scrollTo({ top: logRef.current.scrollHeight });
  }, [messages, streamingText]);

  useEffect(() => {
    if (!scenario) {
      setTargetWords([]);
      return;
    }
    void db.cards
      .filter(
        (c) =>
          c.user_id === userId &&
          c.deleted_at === null &&
          c.bucket != null &&
          c.direction === 'recognition' &&
          // Phrase cards carry a word the learner already mastered; it is not
          // a shaky target worth pushing into a conversation.
          !isPhraseCard(c) &&
          !!c.word &&
          c.step >= 1 &&
          c.step <= 3,
      )
      .toArray()
      .then((rows) => {
        const seen = new Set<string>();
        const words: string[] = [];
        for (const c of rows) {
          const w = c.word!.trim();
          if (seen.has(w.toLowerCase())) continue;
          seen.add(w.toLowerCase());
          words.push(w);
          if (words.length >= 5) break;
        }
        setTargetWords(words);
      });
  }, [scenario, userId]);

  useEffect(() => () => abortRef.current?.abort(), []);

  // Preserve an in-progress conversation across tab switches; a finished or
  // reviewed one stays cleared.
  const liveRef = useRef<{ scenario: string | null; messages: Message[]; inReview: boolean }>({
    scenario: null,
    messages: [],
    inReview: false,
  });
  liveRef.current = { scenario, messages, inReview: review !== null };
  useEffect(
    () => () => {
      const live = liveRef.current;
      savedTalk =
        live.scenario && live.messages.length > 0 && !live.inReview
          ? { scenario: live.scenario, messages: live.messages }
          : null;
    },
    [],
  );

  async function send(text: string): Promise<void> {
    if (!scenario || streamingText !== null) return;
    setError(null);
    setSuggestions([]);
    const next: Message[] = [...messages, { role: 'user', content: text }];
    setMessages(next);
    setStreamingText('');

    // One-time ringer-switch note, on first voice use.
    if (!quiet && synthesisAvailable() && !localStorage.getItem(RINGER_NOTE_KEY)) {
      setRingerNote(true);
      localStorage.setItem(RINGER_NOTE_KEY, '1');
    }

    // Steer conversation toward contexts that force the learner's weak
    // concepts. Never announced (the tutor prompt forbids mentioning it).
    const weak = await weakConcepts(userId, 5);
    const body: TalkRequest = {
      messages: next,
      scenario,
      dialect: profile.dialect,
      level: profile.level,
      weakConcepts: weak,
      targetWords,
    };

    let acc = '';
    abortRef.current = new AbortController();
    await streamTalk(body, {
      signal: abortRef.current.signal,
      onDelta: (t) => {
        acc += t;
        setStreamingText(acc);
      },
      onDone: () => {
        const { text: replyText, suggestions: sugs } = splitReply(acc);
        setMessages([...next, { role: 'assistant', content: replyText }]);
        setSuggestions(sugs);
        setStreamingText(null);
        if (!quiet) speak(replyText, locale);
      },
      onError: (message) => {
        if (acc) setMessages([...next, { role: 'assistant', content: splitReply(acc).text }]);
        setStreamingText(null);
        setError({ source: 'send', message });
      },
    });
  }

  async function endConversation(): Promise<void> {
    // Kill any in-flight tutor stream first — otherwise its onDone fires
    // later, speaking audio and mutating messages over the review screen.
    abortRef.current?.abort();
    setStreamingText(null);
    stopSpeaking();
    const utterances = messages.filter((m) => m.role === 'user').map((m) => m.content);
    if (utterances.length === 0) {
      reset();
      return;
    }
    setReviewing(true);
    setError(null);
    try {
      const res = await apiPost<ReviewResponse>('/api/ai/review', {
        utterances,
        dialect: profile.dialect,
        level: profile.level,
      });
      await recordReviewErrors(userId, res.errors);
      setReview(res);
    } catch (e) {
      setError({
        source: 'review',
        message: friendlyApiError(e, 'Review failed. The conversation still counted.'),
      });
    } finally {
      setReviewing(false);
    }
  }

  function reset(): void {
    savedTalk = null;
    setScenario(null);
    setMessages([]);
    setReview(null);
    setStreamingText(null);
    setError(null);
    hold.reset();
  }

  if (!online) {
    return (
      <div className="empty-state stack">
        <p>Talk needs a connection — the tutor runs on the server.</p>
        <p className="muted">Cards work offline.</p>
      </div>
    );
  }

  if (review) {
    const saidLower = messages
      .filter((m) => m.role === 'user')
      .map((m) => m.content.toLowerCase())
      .join(' ');
    const targetReport = targetWords.map((w) => ({
      word: w,
      used: saidLower.includes(w.toLowerCase()),
    }));
    return (
      <ReviewStack review={review} userId={userId} targetReport={targetReport} onClose={reset} />
    );
  }

  if (!scenario) {
    return (
      <div className="stack">
        <p className="eyebrow">scenario</p>
        <div className="choice-list">
          {SCENARIOS.map((s) => (
            <button key={s} className="choice" onClick={() => setScenario(s)}>
              {s}
            </button>
          ))}
        </div>
      </div>
    );
  }

  const busy = streamingText !== null;
  const voicePossible = !quiet && hold.available && hold.state !== 'failed';
  const showTyped = !voicePossible || answer.typing;

  return (
    <div className="stack" style={{ height: '100%' }}>
      <div className="row" style={{ minHeight: 0 }}>
        <span className="eyebrow">{scenario}</span>
        <button className="btn quiet" disabled={reviewing} onClick={() => void endConversation()}>
          {reviewing ? 'reviewing' : 'end + review'}
        </button>
      </div>

      <div className="talk-log" ref={logRef} style={{ flex: 1, overflowY: 'auto' }}>
        {messages.length === 0 && !busy && (
          <p className="muted" style={{ textAlign: 'center', padding: '24px 0' }}>
            Say something to start. Spanish only from here.
          </p>
        )}
        {messages.map((m, i) => (
          <div key={i} className={`bubble ${m.role === 'assistant' ? 'tutor' : 'me'}`} lang="es">
            {m.content}
          </div>
        ))}
        {streamingText !== null && (
          <div className="bubble tutor" lang="es">
            {splitReply(streamingText).text || '…'}
          </div>
        )}
      </div>

      {/* Beginner ladder: tappable candidate replies. The wall becomes a door. */}
      {suggestions.length > 0 && isBeginner(profile.level) && !busy && (
        <div className="stack" style={{ gap: 6 }}>
          <p className="eyebrow" style={{ marginBottom: 0 }}>
            you could say
          </p>
          {suggestions.map((s) => (
            <button
              key={s.es}
              className="btn block"
              style={{ textAlign: 'left', minHeight: 44 }}
              onClick={() => void send(s.es)}
            >
              <span lang="es">{s.es}</span>
              {s.en && (
                <span className="muted" style={{ fontSize: 12 }}>
                  {' '}
                  — {s.en}
                </span>
              )}
            </button>
          ))}
        </div>
      )}

      {ringerNote && (
        <p className="muted" style={{ fontSize: 13 }}>
          Audio needs the ringer switch on.
        </p>
      )}
      {error && (
        <p className="error-line">
          {error.message}{' '}
          <button
            className="btn quiet"
            onClick={() => {
              if (error.source === 'review') {
                void endConversation();
                return;
              }
              const last = messages[messages.length - 1];
              if (last?.role === 'user') {
                setMessages(messages.slice(0, -1));
                void send(last.content);
              } else setError(null);
            }}
          >
            retry
          </button>
        </p>
      )}

      {showTyped ? (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (typed.trim() && !busy) {
              void send(typed.trim());
              setTyped('');
            }
          }}
        >
          <div className="row" style={{ gap: 8 }}>
            <input
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              placeholder="Escribe en español"
              lang="es"
              autoCapitalize="off"
            />
            <button className="btn primary" type="submit" disabled={busy || !typed.trim()}>
              Send
            </button>
          </div>
          {!quiet && hold.state === 'failed' && (
            <p className="muted" style={{ fontSize: 12, marginTop: 4 }}>
              Voice input unavailable — typing works.
            </p>
          )}
        </form>
      ) : (
        <div>
          <p className="interim">{hold.interim || (hold.state === 'holding' ? 'listening' : '')}</p>
          <button
            className={`hold-btn ${hold.state === 'holding' ? 'holding' : ''}`}
            disabled={busy}
            onPointerDown={(e) => {
              e.preventDefault();
              hold.onPressStart();
            }}
            onPointerUp={hold.onPressEnd}
            onPointerCancel={hold.onPressEnd}
            onContextMenu={(e) => e.preventDefault()}
          >
            {hold.state === 'holding'
              ? 'release to send'
              : hold.state === 'finalizing'
                ? 'sending'
                : 'hold to talk'}
          </button>
        </div>
      )}

      {voicePossible && (
        <button className="btn quiet block" style={{ marginTop: 8 }} onClick={answer.toggle}>
          {answer.typing ? 'speak instead' : 'type instead'}
        </button>
      )}
    </div>
  );
}
