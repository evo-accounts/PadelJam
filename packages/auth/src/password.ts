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

/**
 * Pick the credential to re-authenticate with after account completion: the PRIMARY (already-verified)
 * identifier. Email-started and social sign-ups verify the email; phone-started verifies the phone.
 * Returns null when the chosen identifier isn't present on the user.
 */
export function primaryCredential(args: {
  primaryKind: 'email' | 'phone';
  email: string | null | undefined;
  phone: string | null | undefined;
}): { identifier: string; kind: 'email' | 'phone' } | null {
  if (args.primaryKind === 'email') return args.email ? { identifier: args.email, kind: 'email' } : null;
  return args.phone ? { identifier: args.phone, kind: 'phone' } : null;
}
