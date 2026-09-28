import type { TypedClient } from '@padel/auth';

/**
 * The two onboarding timestamps, stamped by the SERVER.
 *
 * Migration 0120 took `onboarded_at` and `notifications_prompted_at` out of the columns a client may
 * UPDATE; `mark_onboarded()` / `mark_notifications_prompted()` set them to now() (first time only)
 * for the caller's own row instead of trusting a timestamp from the device.
 */
export const markOnboarded = async (db: TypedClient): Promise<{ error: unknown }> => {
  const { error } = await db.rpc('mark_onboarded');
  return { error };
};

export const markNotificationsPrompted = async (db: TypedClient): Promise<{ error: unknown }> => {
  const { error } = await db.rpc('mark_notifications_prompted');
  return { error };
};

/**
 * Stamp the signed-in user's row, retrying once. Resolves `true` when the stamp landed.
 *
 * supabase-js RESOLVES a PostgREST error rather than throwing, so a bare `await` of the write
 * swallowed every failure: the onboarding screens navigated on regardless, and a lost
 * `onboarded_at` sent the user back into onboarding on every launch. This reports it instead, and
 * never throws (a network failure inside supabase-js can), so the caller decides what to show.
 * Without a stored session there is no row to stamp (the RPC keys on auth.uid()), so that reports
 * failure without a network round trip.
 */
export async function stampWithRetry(
  db: TypedClient,
  mark: (db: TypedClient) => Promise<{ error: unknown }>,
): Promise<boolean> {
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const { data } = await db.auth.getSession();
      if (!data.session?.user.id) return false;
      const { error } = await mark(db);
      if (!error) return true;
    } catch {
      /* fall through to the retry */
    }
  }
  return false;
}

/**
 * What an onboarding step does after `stampWithRetry` failed, given how many taps in a row have now
 * failed (this one included). The first failure keeps the user on the step with an error banner —
 * tapping the button again is the Retry. A second one lets them through with a banner saying the
 * step may come back: the stamp only decides whether the step is SHOWN again, so it is never worth
 * holding someone out of the app for.
 */
export const onStampFailure = (consecutiveFailures: number): 'stay' | 'continue' =>
  consecutiveFailures >= 2 ? 'continue' : 'stay';
