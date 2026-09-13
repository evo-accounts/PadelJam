import { supabase } from '@/lib/supabase';

import type { AuthMethods } from './authMethods';

/**
 * Ask the database which sign-in methods an identifier actually has (migration 0096).
 * Pre-authentication: called with the anon key, before any session exists.
 */
export async function lookupAuthMethods(identifier: string): Promise<AuthMethods | null> {
  const { data, error } = await supabase.rpc('auth_methods_for', { p_identifier: identifier });

  // GOTCHA 1: `returns table (...)` is a SET, so PostgREST sends an ARRAY even though this
  // function always yields exactly one row. `data.has_email` would be undefined — every flag
  // would read as false and the sheet would silently offer nothing.
  const row = Array.isArray(data) ? data[0] : null;

  // GOTCHA 2: null on ANY failure, including 'rate_limited' — never throw and never surface the
  // raw error. The caller renders the empty state, which is the same thing the user sees for an
  // unknown identifier, so a failed lookup cannot become an account-existence oracle either.
  if (error || !row) return null;

  return {
    hasEmail: !!row.has_email,
    hasPhone: !!row.has_phone,
    hasGoogle: !!row.has_google,
    hasApple: !!row.has_apple,
    hasPassword: !!row.has_password,
    emailMasked: row.email_masked ?? null,
    phoneMasked: row.phone_masked ?? null,
  };
}
