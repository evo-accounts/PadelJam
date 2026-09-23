/**
 * The public web destinations the app links out to. Mirrors `apps/mobile/lib/externalUrls.ts`.
 *
 * WHY TWO FILES AND NOT ONE IN `packages/config`: that would be the right home for a constant both
 * apps need identically — but `packages/**` is in the E2E workflow's `pull_request` paths, so
 * putting two URLs there turns every web-only change that touches them into a 40-minute iOS suite
 * on the self-hosted runner. The cost is not worth the deduplication. Each app has ONE copy, which
 * is the part that mattered: before this, the URLs were spelled out in three places within mobile
 * alone.
 *
 * If these ever diverge between apps it is a bug. They are the same documents.
 *
 * `STORE_URL` is deliberately EMPTY — see the mobile file. Web has no "Rate the app" row at all
 * (rating an app is a mobile store action), so it is not re-declared here.
 */
export const TERMS_URL = 'https://padeljam.app/terms';
export const PRIVACY_URL = 'https://padeljam.app/privacy';
export const HELP_URL = 'https://padeljam.app/help';
