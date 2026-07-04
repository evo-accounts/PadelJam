import { useEffect, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useSession } from '@padel/auth';

/**
 * Whether the query cache must be wiped given the previously observed uid and
 * the current one. `undefined` prev = first observation (boot) — never reset,
 * so a cold start with a persisted session doesn't nuke fresh queries.
 */
export function shouldResetCache(
  prevUid: string | null | undefined,
  nextUid: string | null,
): boolean {
  if (prevUid === undefined) return false;
  return prevUid !== nextUid;
}

/**
 * Clears the React Query cache whenever the authenticated user changes
 * (sign-out, or a different user signing in). Query keys are not user-scoped
 * (see query-keys.ts), so without this a shared device leaks the previous
 * user's cached data. Mount once inside both QueryClientProvider and
 * SessionProvider.
 */
export function useAuthCacheReset(): void {
  const { session, loading } = useSession();
  const qc = useQueryClient();
  const lastUid = useRef<string | null | undefined>(undefined);

  useEffect(() => {
    if (loading) return; // session not resolved yet — don't record null as "signed out"
    const uid = session?.user.id ?? null;
    if (shouldResetCache(lastUid.current, uid)) qc.clear();
    lastUid.current = uid;
  }, [session, loading, qc]);
}
