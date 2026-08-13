// Service-role Supabase client — used ONLY for ai_calls logging and the daily
// budget query. All user data sync goes client -> Supabase directly under RLS.

import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { env } from './env.js';

let client: SupabaseClient | null = null;

export function serviceDb(): SupabaseClient | null {
  if (!env.hasSupabase) return null;
  if (!client) {
    client = createClient(env.SUPABASE_URL!, env.SUPABASE_SERVICE_ROLE_KEY!, {
      auth: { persistSession: false },
    });
  }
  return client;
}
