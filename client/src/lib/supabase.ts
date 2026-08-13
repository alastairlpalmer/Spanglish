import { createClient, type SupabaseClient } from '@supabase/supabase-js';

// Local mode: no Supabase — fixed user id, sync no-ops. Lets the whole app run
// with zero external accounts.
export const LOCAL_MODE =
  import.meta.env.VITE_LOCAL_MODE === '1' ||
  !import.meta.env.VITE_SUPABASE_URL ||
  !import.meta.env.VITE_SUPABASE_ANON_KEY;

export const LOCAL_USER_ID = '00000000-0000-4000-8000-000000000001';

let client: SupabaseClient | null = null;

export function supabase(): SupabaseClient | null {
  if (LOCAL_MODE) return null;
  if (!client) {
    client = createClient(
      import.meta.env.VITE_SUPABASE_URL,
      import.meta.env.VITE_SUPABASE_ANON_KEY,
      // Default storage is localStorage; Safari can evict it, but the session
      // auto-refreshes and auth loss never blocks the app (sync just pauses).
      { auth: { persistSession: true, autoRefreshToken: true } },
    );
  }
  return client;
}

export async function currentAccessToken(): Promise<string> {
  if (LOCAL_MODE) return 'dev';
  const { data } = await supabase()!.auth.getSession();
  return data.session?.access_token ?? '';
}

export async function currentUserId(): Promise<string | null> {
  if (LOCAL_MODE) return LOCAL_USER_ID;
  const { data } = await supabase()!.auth.getSession();
  return data.session?.user.id ?? null;
}
