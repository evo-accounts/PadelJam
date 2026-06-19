import { supabase } from '@/lib/supabase';

/** After a social session is established, bounce if the email is already owned by a different account (§5.6).
 *  Best-effort: a transient RPC error does not block sign-in. Throws Error('email_conflict') on a real conflict. */
export async function assertNoSocialEmailConflict(): Promise<void> {
  const { data: conflict, error } = await supabase.rpc('social_email_conflict');
  if (error) return;
  if (conflict) {
    await supabase.auth.signOut();
    throw new Error('email_conflict');
  }
}
