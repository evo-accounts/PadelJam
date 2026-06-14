import type { TypedClient } from '@padel/db';

export type ChangePasswordResult =
  | { ok: true }
  | { ok: false; reason: 'current_password_wrong' | 'update_failed' };

/**
 * Verify the current password (re-auth via signInWithPassword — same user), then set the new
 * one. Returns a discriminated result so the UI can map to copy.
 */
export const changePassword = async (
  c: TypedClient,
  email: string,
  currentPassword: string,
  newPassword: string,
): Promise<ChangePasswordResult> => {
  const { error: verifyErr } = await c.auth.signInWithPassword({ email, password: currentPassword });
  if (verifyErr) return { ok: false, reason: 'current_password_wrong' };
  const { error: updateErr } = await c.auth.updateUser({ password: newPassword });
  if (updateErr) return { ok: false, reason: 'update_failed' };
  return { ok: true };
};
