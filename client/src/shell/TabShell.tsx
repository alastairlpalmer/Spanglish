import { useEffect, useState } from 'react';
import { isPhraseCard } from '@seiscientas/shared';
import { TabBar, type Tab } from './TabBar';
import { useProfile } from './ProfileContext';
import { db } from '../db/dexie';
import { TodayView } from '../features/today/TodayView';
import { CardsView } from '../features/cards/CardsView';
import { TalkView } from '../features/talk/TalkView';
import { ReadTab } from '../features/read/ReadTab';
import { LogView } from '../features/log/LogView';

export function useOnline(): boolean {
  const [online, setOnline] = useState(navigator.onLine);
  useEffect(() => {
    const up = (): void => setOnline(true);
    const down = (): void => setOnline(false);
    window.addEventListener('online', up);
    window.addEventListener('offline', down);
    return () => {
      window.removeEventListener('online', up);
      window.removeEventListener('offline', down);
    };
  }, []);
  return online;
}

/** Cards-due badge count — the vocabulary deck only. Phrase cards carry their
 *  own count inside the Cards tab; putting them in the badge would make a
 *  five-minute break look like a half-hour one. Re-checked on every tab change — cheap indexed
 *  count, and tab switches are exactly when the number could have moved. */
function useDueBadge(userId: string, tab: Tab): number {
  const [count, setCount] = useState(0);
  useEffect(() => {
    let live = true;
    void db.cards
      .where('due')
      .belowOrEqual(new Date().toISOString())
      .and((c) => c.user_id === userId && c.deleted_at === null && !isPhraseCard(c))
      .count()
      .then((n) => {
        if (live) setCount(n);
      });
    return () => {
      live = false;
    };
  }, [userId, tab]);
  return count;
}

export function TabShell({ userId }: { userId: string }): JSX.Element {
  const [tab, setTab] = useState<Tab>('today');
  const { profile, update } = useProfile();
  const online = useOnline();
  const dueBadge = useDueBadge(userId, tab);

  return (
    <div className="app-shell">
      {!online && <div className="offline-banner">offline — cards and log still work</div>}
      <main className="app-main">
        <div className="screen-header">
          <h1>
            {tab === 'today' && 'Today'}
            {tab === 'cards' && 'Cards'}
            {tab === 'talk' && 'Talk'}
            {tab === 'reading' && 'Read'}
            {tab === 'log' && 'Log'}
          </h1>
          <button
            className={`toggle ${profile.quiet_mode ? 'on' : ''}`}
            onClick={() => void update({ quiet_mode: !profile.quiet_mode })}
            aria-pressed={profile.quiet_mode}
          >
            {profile.quiet_mode ? 'quiet' : 'voice'}
          </button>
        </div>
        {tab === 'today' && <TodayView userId={userId} onGo={setTab} />}
        {tab === 'cards' && <CardsView userId={userId} online={online} />}
        {tab === 'talk' && <TalkView userId={userId} online={online} />}
        {tab === 'reading' && <ReadTab userId={userId} />}
        {tab === 'log' && <LogView userId={userId} />}
      </main>
      <TabBar active={tab} onChange={setTab} badges={{ cards: tab === 'cards' ? 0 : dueBadge }} />
    </div>
  );
}
