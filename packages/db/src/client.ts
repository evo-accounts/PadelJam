import { createClient as createSupabaseClient, type SupabaseClient } from '@supabase/supabase-js';
import type { Database } from './database.types';

export type TypedClient = SupabaseClient<Database>;

export const createClient = (
  url: string,
  key: string,
  options?: Parameters<typeof createSupabaseClient>[2],
): TypedClient => createSupabaseClient<Database>(url, key, options);
