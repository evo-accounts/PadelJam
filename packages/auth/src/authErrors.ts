/**
 * What an auth screen may say when something fails — shared by mobile and web.
 *
 * It lived in apps/mobile/lib until web needed it: web's sign-in rendered GoTrue's raw English
 * messages (and internal strings like `no-session`) straight to the user, in every locale. One
 * definition means both apps draw the same line on what an error is allowed to reveal.
 */
export type SafeMessage = { ns: 'auth' | 'common'; key: string };
const SAFE: Array<[RegExp, SafeMessage]> = [
  [/invalid_code|expired_code|token has expired|otp_expired|invalid otp|invalid token/i, { ns: 'auth', key: 'invalidCode' }],
  [/network|fetch failed|timed? ?out/i, { ns: 'auth', key: 'networkError' }],
  [/rate.?limit|for security purposes|only request this after/i, { ns: 'auth', key: 'rateLimited' }],
];
/** Auth screens may name a code problem or a network problem, never whether an account exists. */
export function safeAuthMessage(e: unknown): SafeMessage {
  const msg = e instanceof Error ? e.message : typeof e === 'string' ? e : '';
  for (const [re, m] of SAFE) if (re.test(msg)) return m;
  return { ns: 'common', key: 'somethingWrong' };
}
