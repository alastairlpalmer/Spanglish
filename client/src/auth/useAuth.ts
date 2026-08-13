import { useEffect, useState } from 'react';
import { LOCAL_MODE, LOCAL_USER_ID, supabase } from '../lib/supabase';

export interface AuthState {
  loading: boolean;
  userId: string | null;
}

export function useAuth(): AuthState {
  const [state, setState] = useState<AuthState>(
    LOCAL_MODE ? { loading: false, userId: LOCAL_USER_ID } : { loading: true, userId: null },
  );

  useEffect(() => {
    if (LOCAL_MODE) return;
    const client = supabase()!;
    void client.auth.getSession().then(({ data }) => {
      setState({ loading: false, userId: data.session?.user.id ?? null });
    });
    const { data: sub } = client.auth.onAuthStateChange((_event, session) => {
      setState({ loading: false, userId: session?.user.id ?? null });
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  return state;
}
