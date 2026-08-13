import { useCallback, useEffect, useState } from 'react';
import { checkAuth, storedUserId } from '../lib/auth';

export interface AuthState {
  loading: boolean;
  /** Non-null once the token is accepted, or when offline with a stored
   *  identity — auth loss must never block the local-first app. */
  userId: string | null;
  needsSignIn: boolean;
  recheck: () => Promise<void>;
}

export function useAuth(): AuthState {
  const [state, setState] = useState<Omit<AuthState, 'recheck'>>({
    loading: true,
    userId: null,
    needsSignIn: false,
  });

  const recheck = useCallback(async () => {
    const result = await checkAuth();
    if (result === 'unauthorized') {
      setState({ loading: false, userId: null, needsSignIn: true });
    } else {
      // 'ok', or 'offline' — offline keeps the stored identity and the app
      // stays usable; sync simply pauses until the server is reachable.
      setState({ loading: false, userId: storedUserId(), needsSignIn: false });
    }
  }, []);

  useEffect(() => {
    void recheck();
  }, [recheck]);

  return { ...state, recheck };
}
