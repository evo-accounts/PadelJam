# Store-readiness gap list

Written 2026-11-05 by Release & Ops for [PAD-121](/PAD/issues/PAD-121). Read-only audit: files in this repo only. No build, no EAS, App Store Connect or Play Console access, no request to the hosted project. Anything that only a console can show is marked **unverified**, with the founder named as the person who can check it.

Target (roadmap): public launch on both stores in **January 2027**. Fallback: TestFlight / Play closed-testing beta.

**Columns.** *Owner*: Eng (engineering, via the CTO), Founder, R&O (me). *Size*: S under a day, M a few days, L a week or more. *Blocks*: **Launch** = blocks a public launch; **Beta** = also blocks the beta fallback; **Both** is stated as `Beta+Launch`.

**Out of scope for this list (gate 5).** Privacy-policy and terms text, and the store privacy labels' wording: only the gap is noted. The Level privacy line and labels are already with the founder ([PAD-65](/PAD/issues/PAD-65)).

## What is in place (evidence)

- `apps/mobile/app.json`: name, slug, version `1.0.0`, bundle id and Android package `app.padeljam`, EAS project id and `owner: evo-studio`, `updates.url`, `runtimeVersion` policy `appVersion`.
- `apps/mobile/eas.json`: `development`, `preview` and `production` profiles, `appVersionSource: remote`, production `autoIncrement`. `submit.production.ios.ascAppId` is set.
- iOS: `usesAppleSignIn`, `ITSAppUsesNonExemptEncryption: false`, location when-in-use string, calendar string.
- Sentry DSN in the preview and production profiles.
- In-app legal screens, `delete-account`, `support` and `blocked` exist under `apps/mobile/app/profile/`. Public `/privacy`, `/terms` and `/help` exist under `apps/web/src/app/(public)/`, and `lib/externalUrls.ts` points at `padeljam.app`.
- Android adaptive icon (foreground, background, monochrome), `blockedPermissions` for the calendar, and fine/coarse location are declared.

---

## iOS

| # | Gap | Evidence | Owner | Size | Blocks |
|---|---|---|---|---|---|
| I1 | **No iOS build has the onboarding redesign.** Onboarding PRs are merged but have never run on a device. The iOS hardware pass is open ([PAD-32](/PAD/issues/PAD-32)). | `docs/company/roadmap.md` item 3 | Founder (device), Eng | M | Beta+Launch |
| I2 | **Level privacy line and label** must be settled before any build that collects Level ships. | [PAD-64](/PAD/issues/PAD-64), [PAD-65](/PAD/issues/PAD-65) | Founder | S | Beta+Launch |
| I3 | **Apple signing and capability state.** Is Sign in with Apple enabled on the App ID, the Services ID and `.p8` key created, and the provider turned on in Supabase? Are distribution certificate and provisioning profile current in EAS? | `docs/handoff/padeljam-remaining-setup.html` step 2 (written 2026-06-19, unclear if done) | Founder | S | Beta+Launch. **Unverified.** Needs Apple Developer and EAS consoles. |
| I4 | **APNs push key** uploaded to EAS and the push fan-out wired (`send-push` deployed, `PUSH_WEBHOOK_SECRET`, `app.send_push_url`, `app.send_push_secret`). | setup guide step 4; `docs/superpowers/push-setup.md` | Founder | S | Launch (beta works without push). **Unverified.** |
| I5 | **Reviewer account is not seeded.** No reviewer fixture exists. The seed workflow targets a scratch DB only. Phone sign-in is hidden for launch (PAD-137, #340), so the reviewer signs in by email, not phone OTP. They need an account that works without reading a mailbox (an email and password account, or a fixed email code). Hosted email codes are untested live: [PAD-272](/PAD/issues/PAD-272), the founder's, is still open. | `grep` of `scripts/`, `infra/`: no reviewer account; `.github/workflows/seed-demo.yml` | Eng (design the account), Founder (hosted seed, gate 2), R&O (review notes) | M | Launch (TestFlight external beta also needs review) |
| I6 | **Permission usage strings.** Location and calendar are set. `expo-image-picker` (photo library) and `expo-media-library` (QrSheet saves a QR image) are not configured as plugins, so their iOS usage strings fall back to library defaults. Apple rejects vague or default strings (5.1.1). | `app.json` plugins; `lib/storage.ts:40`; `components/community/QrSheet.tsx:45` | Eng | S | Launch |
| I7 | **Native Sign in with Apple flow** needs the Supabase Apple provider live. Same as I3. | `lib/appleSignIn.ts` | Founder | S | Launch |
| I8 | **Account deletion** is required by Apple (5.1.1(v)). The screen exists. Not verified end to end on a hosted project or a device. | `app/profile/delete-account.tsx` | Eng, QA | S | Launch |
| I9 | **Store listing** in pt-PT, pt-BR and en: name, subtitle, description, keywords, promo text, support URL, marketing URL, copyright. Not started. | no file in repo | R&O drafts, Founder submits (gate 3) | M | Launch |
| I10 | **Screenshots** in three locales for 6.9-inch and 6.5-inch iPhone (plus iPad, because `supportsTablet: true`). Either capture iPad screens or set `supportsTablet: false`. | `app.json` `ios.supportsTablet` | R&O (shot list), Eng (capture, with the runner), Founder (upload) | M | Launch |
| I11 | **Privacy nutrition label** (data collected: email, phone, name, location, user content, identifiers, usage, diagnostics via Sentry). Wording is gate 5. | n/a | Founder ([PAD-65](/PAD/issues/PAD-65)) | S | Launch |
| I12 | **Age rating questionnaire.** Chat and user content means the user-generated-content answers apply, and Apple expects block, report and moderation. A block list (`profile/blocked.tsx`) and block/report modals (`components/profile/BlockReportModals.tsx`) exist. Not checked: whether reports reach a moderation queue someone reads, whether chat messages and posts (not only profiles) can be reported, and whether a reported user is actioned within the 24 hours Apple expects. | `app/profile/blocked.tsx`; `components/profile/BlockReportModals.tsx` | Eng (confirm moderation path), Founder (questionnaire) | M | Launch |
| I13 | **Export compliance** is declared exempt. | `app.json:22-24` | none | none | Done |
| I14 | **Universal links:** the app uses the custom scheme `mobile` only. Share links (`eventShare`, `communityShare`, `groupShare`) are `mobile://...` and do nothing for people without the app, and in messaging apps they often aren't tappable. No `associatedDomains`, no `apple-app-site-association` on the web app. | `app.json` `scheme: "mobile"`; `lib/eventShare.ts:10`; `apps/web` has no `public/` directory, so no `.well-known` | Eng (web file, entitlement, route), PM (decide scope) | M | Beta. Launch if invites are the growth loop. |
| I15 | **Production build never run in this review.** Run `eas build --profile production --platform ios` and a TestFlight upload. Unknown whether `ascAppId` 6783917190 matches a live record. | `eas.json` | Founder | S | Beta+Launch. **Unverified.** |
| I16 | **App Review notes**: reviewer credentials, how to reach community, group and event features, explanation of location use. | n/a | R&O | S | Launch |
| I17 | **Dynamic app icon** (alternate icons) is an iOS feature. Needs a device check that the alternate icons are in the build and switch correctly. | `app.json` `expo-dynamic-app-icon`; `app/profile/app-preferences.tsx:54` | Eng/Founder (device) | S | Launch. **Unverified.** |

---

## Android

**Headline: nothing Android-specific has ever run.** There is no Android job in CI. `.github/workflows/e2e-mobile.yml` and `apps/mobile/e2e/README.md` are iOS Simulator only (`xcrun simctl` and idb), and `docs/superpowers/push-setup.md` and the setup guide say "build a dev client for Android" without recording that anyone did. Every item below is unverified at runtime unless it says otherwise.

### Gaps

| # | Gap | Evidence | Owner | Size | Blocks |
|---|---|---|---|---|---|
| A1 | **No Android build has ever been confirmed.** Run `eas build --profile development --platform android`, then `preview` and `production`. A failed native build (new architecture is on: `newArchEnabled: true`, `react-native` 0.85.3, `react-native-worklets`, Reanimated 4) shows up here first. | `app.json`; setup guide step 1 | Founder (runs it), Eng (fixes) | M | Beta+Launch. **Unverified.** |
| A2 | **No `google-services.json` / `googleServicesFile`.** `expo-notifications` on Android needs FCM credentials in the build, and `getExpoPushTokenAsync` fails without them. `registerForPush` catches the error and silently does nothing, so the app looks fine and no push ever arrives. | `app.json` (no `googleServicesFile`); `lib/push.ts:30-35` (swallows errors) | Founder (Firebase project, FCM v1 service-account key to EAS), Eng (config) | M | Beta (nice to have), Launch |
| A3 | **No Android submit config and no Play service-account key.** `eas.json` has only `submit.production.ios`. | `eas.json` | Founder | S | Beta+Launch |
| A4 | **Play Console app not created, or unverified.** Play developer account status, app record, package `app.padeljam` claimed, Play App Signing choice. | n/a | Founder | S | Beta+Launch. **Unverified.** |
| A5 | **First upload must be done by hand** in the Play Console (an API submit can't create the first release). Closed testing for new personal developer accounts requires **12 testers for 14 continuous days** before production access. Confirm the account type. If it is a personal account created after 2023-11, this alone pushes a public Android launch out by two weeks or more. | Play policy as I know it; **verify against current Play docs** | Founder | S to start, 14 days elapsed | Launch. **Start first.** |
| A6 | **Android push never tested.** No notification channel is created (`setNotificationChannelAsync` has no hit), so Android 8+ uses a default channel, and the sound and importance can't be tuned. `POST_NOTIFICATIONS` (Android 13+) comes from the `expo-notifications` plugin and the prompt flow is untested. | `grep` in `apps/mobile`: no channel code; `app/(onboarding)/notifications.tsx` | Eng | M | Launch |
| A7 | **Google sign-in on Android** is untested. It uses a browser OAuth flow with a redirect of `Linking.createURL('auth/callback')`. In a store build that is `mobile://auth/callback`, which must be an allowed redirect in Supabase. No Android OAuth client is mentioned anywhere. Email is the other sign-in, and phone is hidden for launch (#340), so real SMS and the Brazil sender are not needed. | `lib/googleSignIn.ts:17`; `docs/superpowers/5i-social-signin-setup.md`; `docs/handoff/sms-production-setup.md` (no longer needed for launch) | Founder (Google Cloud), Eng | M | Launch. Email sign-in alone is a **Beta** minimum (hosted email codes still untested: PAD-272, open). |
| A8 | **Apple sign-in is hidden on Android** by design (`Platform.OS === 'ios'`), which is fine. Android has Google and email. Confirm that matches the Play listing's "login required" notes. | `app/(auth)/sign-in.tsx:68,231` | none | none | OK |
| A9 | **Icons from `expo-symbols`.** 76 `SymbolView` uses, and every one has an `android:` name (Material Symbols), none has a `fallback`. On Android these draw from the Material font. A wrong name shows nothing, and no check validates the Android names. Review every tab and sheet on the device. | `app/(tabs)/_layout.tsx:48`; `grep SymbolView` | Eng (device pass), QA | M | Launch |
| A10 | **Keyboard handling.** About 15 screens use `KeyboardAvoidingView behavior={undefined}` on Android. With `edge-to-edge` (default in current Expo / Android 15) the input can sit behind the keyboard. `BottomSheet` and `ManageSheet` have Android-specific keyboard code. Check every form. | `grep Platform.OS` (list above); `components/ui/BottomSheet.tsx:62,95`; `components/event/manage/ManageSheet.tsx:102` | Eng | M | Launch |
| A11 | **Date picker** takes the Android path (modal dialog) only here. | `components/ui/DateField.tsx:82-97` | Eng, QA | S | Launch |
| A12 | **Dynamic app icon.** `expo-dynamic-app-icon` is a Config Plugin built mainly for iOS, and its Android side uses activity aliases. `getAppIcon`/`setAppIcon` are try/caught, so a fail is silent. An Android launcher can also crash or flicker on an alias switch. Either test on hardware or hide the Android entry. | `app/profile/app-preferences.tsx:18,54`; `app.json` plugin | Eng | S (hide) to M (fix) | Launch. A hide-on-Android switch is the cheap option. |
| A13 | **Adaptive icon colour.** `backgroundColor` is `#E6F4FE` (Expo template default) alongside a `backgroundImage`. Check it against the brand and confirm the foreground fits inside the safe zone. | `app.json:android.adaptiveIcon` | Eng/Designer | S | Launch |
| A14 | **`predictiveBackGestureEnabled: false`** means Android 13+ back behaviour stays legacy. Fine for launch. | `app.json` | none | none | OK |
| A15 | **Permissions.** Declared: fine and coarse location. `expo-image-picker` and `expo-media-library` add their own entries at prebuild (media / storage). Check the merged manifest from a prebuild or the build log for permissions the app does not need (`READ_MEDIA_*`, `WRITE_EXTERNAL_STORAGE`, `RECORD_AUDIO`, `CAMERA`). Each extra one shows in the Play data-safety review. `QrSheet` saves to the library (`MediaLibrary.saveToLibraryAsync`), which on Android 10+ needs no write permission if done through the right API. Test it. | `app.json`; `components/community/QrSheet.tsx:45`; `lib/storage.ts:40` | Eng | S | Launch. **Unverified.** Need a prebuild (not run here). |
| A16 | **Calendar.** `READ/WRITE_CALENDAR` are blocked, and the code opens the Android editor intent with no permission. Test that the intent opens on common devices (Pixel, Samsung) and what happens if no calendar app is installed. | `app.json:blockedPermissions`; `lib/eventCalendar.ts:6-7,41` | Eng/QA | S | Launch |
| A17 | **Maps link** has an Android branch. Check it opens Google Maps or a chooser. | `lib/eventLocation.ts:8` | Eng/QA | S | Launch |
| A18 | **Fonts** are declared separately for Android (family names `Outfit` and `Atelia` with weights). On Android a font-family-plus-weight mismatch silently falls back to Roboto. Check that the token `weight` mapping in `theme/` picks the family variants. | `app.json` expo-font android block | Eng | S | Launch |
| A19 | **Chat (Stream)** is shared code in `packages/chat`, tested on iOS only. Check media, keyboard and push-tap routing on Android. | `packages/chat` | Eng, QA | M | Launch |
| A20 | **Deep links.** Custom scheme only. No `intentFilters` with `autoVerify`, no `/.well-known/assetlinks.json` on the web app, and no Play App Signing SHA-256 fingerprint recorded. Same decision as I14. | `app.json`; `apps/web` (no `public/`) | Eng, PM, Founder (fingerprint from Play Console) | M | Beta. Launch if invites matter. |
| A21 | **Push-tap routing** (notification response → screen) on Android, including a cold start from a notification, is untested. | `docs/superpowers/specs/2026-06-19-push-tap-routing-design.md` | Eng/QA | S | Launch |
| A22 | **Updates (EAS Update).** `runtimeVersion` policy `appVersion` means every native-affecting change needs a version bump on both platforms. Android has never had a build on the `production` channel to receive an update. | `app.json` | R&O (document), Founder | S | Beta |
| A23 | **Android versionCode** is remote-managed (`appVersionSource: remote`), so the first build starts at 1. A Play upload then sets the baseline. Check the number before the first production build so it does not collide with an uploaded one. | `eas.json` | Founder | S | Beta+Launch |
| A24 | **Data safety form** (Play's privacy label). Gate 5. Collects the same data as I11, plus the Sentry diagnostics. | n/a | Founder ([PAD-65](/PAD/issues/PAD-65)) | S | Launch |
| A25 | **Content rating questionnaire (IARC)**, target audience and **UGC policy**: Play requires in-app report and block for user-generated content, and a chat feature raises this. Same moderation-path question as I12. | n/a | Founder, Eng | S–M | Launch |
| A26 | **Account deletion web URL.** Play asks for a URL where a user can request deletion without the app, and the in-app flow must exist (`delete-account.tsx`). The web app has no deletion page. | `apps/web/src/app/(public)/` has `privacy`, `terms`, `help`, `auth`, `onboarding` | Eng (page), Founder (legal text, gate 5) | S | Launch |
| A27 | **Play listing** in pt-PT, pt-BR and en (title 30 chars, short 80, full 4000), feature graphic 1024×500, icon 512, phone screenshots (7-inch and 10-inch tablets are advised). | n/a | R&O drafts, Founder submits (gate 3) | M | Launch |
| A28 | **Reviewer access for Play**: same seeded account as I5, plus login instructions in "App access". | see I5 | Eng, Founder, R&O | M | Launch |
| A29 | **Target API level.** Play requires new apps to target a recent API level. Expo SDK 56 should satisfy this, but confirm in the first build log. | `expo` ~56.0.22 | Eng | S | Beta+Launch. **Unverified.** |
| A30 | **Android E2E.** None. Roadmap says "iOS and Android pass on the release candidate". Without an emulator job the Android pass is manual. A cheap option is a manual checklist per area from the PM, run on one or two physical devices. | `.github/workflows/e2e-mobile.yml` is iOS only | CTO (decide), Eng | L to automate | Neither, if manual |

### What has never been exercised on Android

1. Any build (dev, preview, production), and so any manifest, any native module link, and the new architecture.
2. Sign-in: email OTP (hosted email codes untested: PAD-272, open), Google redirect, session storage via `expo-secure-store`.
3. Push: token registration, delivery, tap routing, channels, `POST_NOTIFICATIONS`.
4. Onboarding, including the new hand, side, level, location and notifications steps.
5. Every `Platform.OS` branch: keyboard, date picker, bottom sheets, maps URL, calendar intent, Apple button.
6. `expo-symbols` Material names, custom fonts and the dynamic icon.
7. Chat, media upload (`expo-image-picker`, 5 MB check), QR save.
8. EAS Update on the `production` channel.

### What can't be known without hardware (or an emulator)

- Whether the app starts at all, and whether the first Android build compiles.
- Edge-to-edge and keyboard overlap, font fallback and Material icon rendering, adaptive icon crop.
- FCM delivery and notification-tap cold start (**emulators can't receive remote push**, per `docs/superpowers/push-setup.md`, so physical devices only).
- Calendar and Maps intents across vendors, and the merged manifest's permission list.
- Performance on a mid-range device (a Pixel-class phone is not a target).

Recommended hardware: one recent Pixel, one mid-range Samsung. Ask the founder what Android devices they have, or whether a testing person can be brought in.

---

## Cross-store gaps

| # | Gap | Owner | Size | Blocks |
|---|---|---|---|---|
| X1 | **Production env check.** `scripts/verify-production-env.mjs` and `schema:check` must pass against the hosted project before submit. Only the founder (or CI) can run these. | Founder | S | Beta+Launch |
| X2 | **Real SMS** (Twilio Messaging Service, BR sender registration, PT alphanumeric sender). Brazil sender registration has an elapsed time of days to weeks. | Founder | M, with long lead time | **Not needed for launch**: phone sign-in is hidden (#340). Needed only if phone returns. |
| X3 | **Support, marketing and privacy URLs** must be live on `padeljam.app`: `/privacy`, `/terms`, `/help` exist in `apps/web` (deploy state **unverified**). | Founder (check domain), Eng | S | Beta+Launch |
| X4 | **Help articles** in three locales (roadmap: "freeze" phase). | Head of Business / PM | M | Launch |
| X5 | **Screenshot shot list.** One list per store, three locales, from the seeded demo data (`pnpm seed:demo`). R&O writes the list, Eng captures on the runner or a device. | R&O, Eng | M | Launch |
| X6 | **Setup guide is dated 2026-06-19.** `docs/handoff/padeljam-remaining-setup.*` says "Everything is merged" and lists steps (Apple, Google, push, Resend, SMTP) whose current state I can't confirm. I did not edit it. Android steps are only "build a dev client". Decide with the founder which steps are done, then refresh it. | R&O, Founder | S | none |
| X7 | **Secrets in `eas.json`.** The Supabase publishable key, Stream API key and Sentry DSN are committed. They are public-by-design client keys, so this is acceptable. Noted so nobody has to wonder. | none | none | OK |

---

## Order: what has to start first for a January launch

Dates are working backwards from submission at ~2026-12-28 and the roadmap's "Build and prepare" window of 11-13 → 12-24.

**Start this week (long lead time, mostly the founder):**

1. **A4 and A5: Play Console account and closed-testing clock.** Confirm account type. If a 12-tester, 14-day closed test is required, it has to begin by about **12-10**, and earlier is safer. Ask the founder to check Play Console now.
2. **X2: Twilio and Brazil sender registration.** Weeks of lead time, but no longer a launch blocker: phone sign-in is hidden (#340), email is the way in.
3. **I3, I4, A2, A3: Apple and Google credentials** (Apple Sign In, APNs, Firebase and FCM, Play service-account key). One sitting of console work for the founder, and the unblocker for every device test.
4. **A1: first Android build** (`development` profile). It tells us in an hour whether Android compiles. Everything in the Android table rests on it.

**11-13 → 11-30:**

5. First Android device pass, using a checklist by area (A6, A7, A9–A12, A15–A19, A21). The CTO decides whether this is manual or an emulator job (A30).
6. I5/A28: design and seed the reviewer account (Eng design, founder runs hosted seed, gate 2).
7. I6, I12/A25, A26: the small code gaps that stores reject for (usage strings, report coverage and moderation path, web deletion page). Each is S or M.
8. Decide the deep-link scope (I14, A20) so the work lands before the freeze or is deferred explicitly.

**12-01 → 12-24:**

9. Listings in three locales for both stores (I9, A27, R&O drafts), screenshot shot list and capture (I10, X5), review notes (I16).
10. Privacy label and data-safety form, after the founder settles [PAD-65](/PAD/issues/PAD-65) (I11, A24).
11. Release candidate pass on both platforms, TestFlight and Play internal track upload.

**~12-28 → 01-08:** freeze, founder submits (gate 3).

### What blocks a public launch, and what only the beta fallback skips

- **Cannot go to beta** until: A1, A3, A4, A23, I1, I2, I3, I15, X1, X3, and an email sign-in that works for testers (hosted email codes haven't been tested live yet: [PAD-272](/PAD/issues/PAD-272), the founder's, still open).
- **Skippable for a TestFlight / Play closed-testing beta, required for public:** A2/A6 push, A7 Google sign-in on Android, I9–I12 and A24–A28 listings and labels, I14/A20 deep links, A26 deletion URL, X4 help articles, and the full device passes.
- **Biggest schedule risk:** A5, because it is elapsed time we can't compress. Then X2. Then the unknown first Android build (A1).

## Open questions for the founder

1. What type of Google Play developer account is it, and when was it created?
2. Which Android phones can you test on?
3. Which of the setup-guide steps 2 to 6 are done (Apple, Google, push, Resend, SMTP)?
4. Is `padeljam.app` live, with `/privacy`, `/terms` and `/help`?
5. Which tablets, if any, do you want to support on iOS (I10)?

No tasks have been opened for these gaps. The list goes to the CTO first.
