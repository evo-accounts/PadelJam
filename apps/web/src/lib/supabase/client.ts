import { createBrowserClient } from '@supabase/ssr';
import { createPublicEnv } from '@padel/config';
import type { Database } from '@padel/db';

const env = createPublicEnv({
  SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
  SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  APP_ENV: process.env.NEXT_PUBLIC_APP_ENV,
});

export const supabase = createBrowserClient<Database>(env.SUPABASE_URL, env.SUPABASE_ANON_KEY);
