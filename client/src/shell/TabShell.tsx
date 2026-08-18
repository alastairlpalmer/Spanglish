import { useEffect, useState } from 'react';
import { TabBar, type Tab } from './TabBar';
import { useProfile } from './ProfileContext';
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

export function TabShell({ userId }: { userId: string }): JSX.Element {
  const [tab, setTab] = useState<Tab>('today');
  const { profile, update } = useProfile();
  const online = useOnline();

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
      <TabBar active={tab} onChange={setTab} />
    </div>
  );
}
