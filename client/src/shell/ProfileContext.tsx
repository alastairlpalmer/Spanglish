import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import type { Profile } from '@seiscientas/shared';
import { getProfile, patchProfile } from '../db/repo';

interface ProfileCtx {
  profile: Profile;
  update: (patch: Partial<Omit<Profile, 'user_id' | 'updated_at'>>) => Promise<void>;
  reload: () => Promise<void>;
}

const Ctx = createContext<ProfileCtx | null>(null);

export function useProfile(): ProfileCtx {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useProfile outside provider');
  return ctx;
}

export function ProfileProvider({
  userId,
  initial,
  children,
}: {
  userId: string;
  initial: Profile;
  children: ReactNode;
}): JSX.Element {
  const [profile, setProfile] = useState<Profile>(initial);

  const reload = useCallback(async () => {
    const fresh = await getProfile(userId);
    if (fresh) setProfile(fresh);
  }, [userId]);

  const update = useCallback(
    async (patch: Partial<Omit<Profile, 'user_id' | 'updated_at'>>) => {
      await patchProfile(userId, patch);
      await reload();
    },
    [userId, reload],
  );

  useEffect(() => {
    // Pick up rows pulled by sync while the app was elsewhere.
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') void reload();
    });
  }, [reload]);

  return <Ctx.Provider value={{ profile, update, reload }}>{children}</Ctx.Provider>;
}
