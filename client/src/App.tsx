import { useEffect, useState } from 'react';
import type { Profile } from '@seiscientas/shared';
import { useAuth } from './auth/useAuth';
import { SignIn } from './auth/SignIn';
import { Onboarding } from './onboarding/Onboarding';
import { TabShell } from './shell/TabShell';
import { ProfileProvider } from './shell/ProfileContext';
import { getProfile } from './db/repo';
import { initSyncTriggers, runSync } from './sync/engine';

const INSTALL_NOTE_KEY = 'install-note-shown';

function isIosSafariNotInstalled(): boolean {
  const nav = navigator as Navigator & { standalone?: boolean };
  const isIos = /iphone|ipad|ipod/i.test(navigator.userAgent);
  return isIos && nav.standalone !== true;
}

export function App(): JSX.Element {
  const auth = useAuth();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [profileLoading, setProfileLoading] = useState(true);
  const [installNote, setInstallNote] = useState(false);

  useEffect(() => {
    initSyncTriggers();
    // Ask the browser not to evict IndexedDB.
    void navigator.storage?.persist?.();
  }, []);

  useEffect(() => {
    if (!auth.userId) {
      setProfileLoading(false);
      return;
    }
    setProfileLoading(true);
    void (async () => {
      let p = await getProfile(auth.userId!);
      if (!p) {
        // Fresh install on a second device: pull before deciding to onboard.
        await runSync();
        p = await getProfile(auth.userId!);
      }
      setProfile(p);
      setProfileLoading(false);
    })();
  }, [auth.userId]);

  useEffect(() => {
    if (profile?.onboarded && isIosSafariNotInstalled() && !localStorage.getItem(INSTALL_NOTE_KEY)) {
      setInstallNote(true);
    }
  }, [profile]);

  if (auth.loading || profileLoading) {
    return <div className="empty-state">opening</div>;
  }

  if (auth.needsSignIn || !auth.userId) {
    return <SignIn onSignedIn={() => void auth.recheck()} />;
  }

  if (!profile?.onboarded) {
    return (
      <Onboarding
        userId={auth.userId}
        onDone={() => {
          void getProfile(auth.userId!).then(setProfile);
        }}
      />
    );
  }

  return (
    <ProfileProvider userId={auth.userId} initial={profile}>
      {installNote && (
        <div className="panel" style={{ margin: 16 }}>
          <p style={{ fontSize: 14 }}>
            Install this: Share <span aria-hidden="true">⎋</span> → Add to Home Screen. It opens
            like an app and works offline.
          </p>
          <button
            className="btn quiet"
            onClick={() => {
              localStorage.setItem(INSTALL_NOTE_KEY, '1');
              setInstallNote(false);
            }}
          >
            got it
          </button>
        </div>
      )}
      <TabShell userId={auth.userId} />
    </ProfileProvider>
  );
}
