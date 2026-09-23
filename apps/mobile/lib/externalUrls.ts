/**
 * The public web destinations the app links out to.
 *
 * These were spelled out in three places: `app/profile/settings.tsx`, `components/auth/TermsLine.tsx`
 * — whose own header comment said adopting a shared pair "is the obvious next step" — and inline in
 * the web settings page. UX-SET-13 adds a fourth screen that needs two of them, which is one copy
 * too many for a string that has to match what the sign-up consent line promises.
 *
 * `STORE_URL` is deliberately EMPTY. "Rate the app" (UX-SET-12) has no destination yet: the app is
 * not on the store and `eas.json` still has an empty `submit.production`, so there is no App Store
 * ID to build a URL from. Callers must treat the empty string as "no destination" and hide the
 * control — a row that opens nothing is worse than a row that is not there. Filling this in is the
 * whole of switching the feature on.
 *
 * Not `expo-web-browser`: UX-SET-13 says these open in the DEVICE's default browser, and
 * `WebBrowser.openBrowserAsync` opens an in-app SFSafariViewController / Custom Tab instead.
 * `Linking.openURL` is what the audit describes and what `settings.tsx` already did.
 */
export const TERMS_URL = 'https://padeljam.app/terms';
export const PRIVACY_URL = 'https://padeljam.app/privacy';
export const HELP_URL = 'https://padeljam.app/help';

/** Empty until the app ships and has an App Store ID. See the note above. */
export const STORE_URL = '';
