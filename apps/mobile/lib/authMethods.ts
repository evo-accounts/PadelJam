/** The sign-in methods the "Try another way" sheet can offer. Pure: no I/O, no navigation. */
export type AuthMethod = 'sms' | 'email' | 'password' | 'google' | 'apple';

/** What the database reported for one identifier (see migration 0096, auth_methods_for). */
export type AuthMethods = {
  hasEmail: boolean;
  hasPhone: boolean;
  hasGoogle: boolean;
  hasApple: boolean;
  hasPassword: boolean;
  emailMasked: string | null;
  phoneMasked: string | null;
};

/** Fixed presentation order. The sheet must not reorder itself between two lookups of the same
 *  account: a list whose rows move is a list users mis-tap. */
const ORDER: AuthMethod[] = ['sms', 'email', 'password', 'google', 'apple'];

const PRESENT: Record<AuthMethod, (m: AuthMethods) => boolean> = {
  sms: (m) => m.hasPhone,
  email: (m) => m.hasEmail,
  password: (m) => m.hasPassword,
  google: (m) => m.hasGoogle,
  apple: (m) => m.hasApple,
};

/**
 * The methods worth offering: present on the account, in a stable order, minus the one the user
 * is already using. Never invent a row — an option the account does not have is a dead end the
 * user only discovers after another failed code, which is the whole point of UX-AUTH-04.
 */
export function availableMethods(m: AuthMethods, inUse: AuthMethod): AuthMethod[] {
  return ORDER.filter((method) => method !== inUse && PRESENT[method](m));
}
