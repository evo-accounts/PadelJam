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

// Password sign-in with an email or phone identifier (the one entered on the identifier screen).
export const signInWithPassword = (
  c: TypedClient,
  identifier: string,
  kind: 'email' | 'phone',
  password: string,
) =>
  c.auth.signInWithPassword(
    kind === 'phone' ? { phone: identifier, password } : { email: identifier, password },
  );

// Set a new password for the currently-authenticated user (used after a recovery OTP login).
export const setPassword = (c: TypedClient, password: string) => c.auth.updateUser({ password });
