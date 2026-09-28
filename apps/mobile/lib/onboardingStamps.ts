import type { TypedClient } from '@padel/auth';

/**
 * The two onboarding timestamps, stamped by the SERVER.
 *
 * Migration 0120 took `onboarded_at` and `notifications_prompted_at` out of the columns a client may
 * UPDATE; `mark_onboarded()` / `mark_notifications_prompted()` set them to now() (first time only)
 * for the caller's own row instead of trusting a timestamp from the device.
 *
 * TRANSITIONAL FALLBACK — remove once 0120 is on the hosted database. The hosted rollout ships
 * this build to TestFlight BEFORE 0120 is pasted (older builds still write the columns directly
 * and would break if it went first), so for that window the RPCs do not exist yet. PostgREST
 * answers PGRST202 ("function not found") and we fall back to the direct write, which the
 * pre-0120 grants still allow. After 0120 the RPC exists and the fallback never runs; a direct
 * write would be refused (42501) anyway, so it cannot reopen what 0120 closed.
 */
type Stamp = { rpc: 'mark_onboarded' | 'mark_notifications_prompted'; column: 'onboarded_at' | 'notifications_prompted_at' };

const ONBOARDED: Stamp = { rpc: 'mark_onboarded', column: 'onboarded_at' };
const NOTIFICATIONS_PROMPTED: Stamp = { rpc: 'mark_notifications_prompted', column: 'notifications_prompted_at' };

async function stamp(db: TypedClient, userId: string, { rpc, column }: Stamp): Promise<{ error: unknown }> {
  const { error } = await db.rpc(rpc);
  if (error?.code !== 'PGRST202') return { error };
  const now = new Date().toISOString();
  const patch = column === 'onboarded_at' ? { onboarded_at: now } : { notifications_prompted_at: now };
  const fallback = await db.from('profiles').update(patch).eq('id', userId);
  return { error: fallback.error };
}

export const markOnboarded = (db: TypedClient, userId: string) => stamp(db, userId, ONBOARDED);
export const markNotificationsPrompted = (db: TypedClient, userId: string) => stamp(db, userId, NOTIFICATIONS_PROMPTED);

/**
 * Stamp the signed-in user's row, retrying once. Resolves `true` when the stamp landed.
 *
 * supabase-js RESOLVES a PostgREST error rather than throwing, so a bare `await` of the write
 * swallowed every failure: the onboarding screens navigated on regardless, and a lost
 * `onboarded_at` sent the user back into onboarding on every launch. This reports it instead, and
 * never throws (a network failure inside supabase-js can), so the caller decides what to show.
 * The user id comes from the stored session — no extra network round trip that could fail first.
 */
export async function stampWithRetry(
  db: TypedClient,
  mark: (db: TypedClient, userId: string) => Promise<{ error: unknown }>,
): Promise<boolean> {
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const { data } = await db.auth.getSession();
      const uid = data.session?.user.id;
      if (!uid) return false;
      const { error } = await mark(db, uid);
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
