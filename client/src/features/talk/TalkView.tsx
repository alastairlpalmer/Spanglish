import { useEffect, useRef, useState } from 'react';
import type { ReviewResponse, TalkRequest } from '@seiscientas/shared';
import { streamTalk } from '../../lib/stream';
import { apiPost, ApiError } from '../../lib/api';
import { useProfile } from '../../shell/ProfileContext';
import { useSessionTimer } from '../../session/useSessionTimer';
import { useHoldToTalk } from '../../speech/useHoldToTalk';
import { localeForDialect } from '../../speech/recognition';
import { speak, stopSpeaking, synthesisAvailable } from '../../speech/synthesis';
import { recordReviewErrors } from '../../db/repo';
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

export function TalkView({ userId, online }: { userId: string; online: boolean }): JSX.Element {
  const { profile } = useProfile();
  const [scenario, setScenario] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [streamingText, setStreamingText] = useState<string | null>(null);
  const [typed, setTyped] = useState('');
  const [review, setReview] = useState<ReviewResponse | null>(null);
  const [reviewing, setReviewing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ringerNote, setRingerNote] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const logRef = useRef<HTMLDivElement>(null);

  useSessionTimer(userId, 'talk', profile.daily_minutes);

  const locale = localeForDialect(profile.dialect);
  const quiet = profile.quiet_mode;

  const hold = useHoldToTalk(locale, (text) => void send(text));

  useEffect(() => {
    logRef.current?.scrollTo({ top: logRef.current.scrollHeight });
  }, [messages, streamingText]);

  useEffect(() => () => abortRef.current?.abort(), []);

  async function send(text: string): Promise<void> {
    if (!scenario || streamingText !== null) return;
    setError(null);
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
        setMessages([...next, { role: 'assistant', content: acc }]);
        setStreamingText(null);
        if (!quiet) speak(acc, locale);
      },
      onError: (message) => {
        if (acc) setMessages([...next, { role: 'assistant', content: acc }]);
        setStreamingText(null);
        setError(message);
      },
    });
  }

  async function endConversation(): Promise<void> {
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
      if (e instanceof ApiError && e.code === 'budget_paused')
        setError('AI features paused until tomorrow. The conversation still counted.');
      else setError('Review failed. The conversation still counted.');
    } finally {
      setReviewing(false);
    }
  }

  function reset(): void {
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

  if (review) return <ReviewStack review={review} onClose={reset} />;

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
  const showTyped = quiet || !hold.available || hold.state === 'failed';

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
            {streamingText || '…'}
          </div>
        )}
      </div>

      {ringerNote && (
        <p className="muted" style={{ fontSize: 13 }}>
          Audio needs the ringer switch on.
        </p>
      )}
      {error && (
        <p className="error-line">
          {error}{' '}
          <button
            className="btn quiet"
            onClick={() => {
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
    </div>
  );
}
