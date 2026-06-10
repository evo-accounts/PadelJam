# Spec 11 — Mobile app

**Goal:** The full Expo member app, reusing every shared package, with native
capabilities (push, camera, image/video upload, location, Apple/Google login & pay).
Built last, when the backend is stable.

**Depends on:** 04, 08 (and benefits from 06, 07, 09 being done).

## Tasks

1. Build out `apps/mobile` screens against the existing packages (no new business logic
   in the app — it consumes `@padel/api`, `@padel/auth`, `@padel/chat`, etc.):
   - `(tabs)`: feed, communities, schedule, profile.
   - `community/[id]`: feed, members, chat.
   - `event/[id]`: detail, booking, scoring.
   - `chat/[id]`: 1:1 + group via `packages/chat`.
   - `player/[id]`: player profile.
   - `payments`: RevenueCat app-feature subscriptions.
2. Native capabilities:
   - Push notifications (Expo) — register tokens (spec 07), handle taps/deep links.
   - Camera + image/video upload to Supabase Storage (`expo-image-picker`).
   - Location (`expo-location`) where relevant (e.g. nearby clubs/courts).
   - Apple/Google login (done in spec 02) and native pay via RevenueCat.
3. Performance (member priority — native feel):
   - Use FlashList (not FlatList) for image-heavy feeds.
   - `expo-image` for caching, skeleton/loading states, optimistic UI on actions.
4. Scoring: the padel scoring UI for an event/match, using the pure score/format logic in
   `packages/utils`. Score updates propagate via Realtime.
5. Offline expectation: no full offline mode (per requirements), but the app must behave
   gracefully on poor connectivity — maintain queued actions and clear error states.
6. Ship readiness: EAS Build + Submit configured; app icons, splash, store metadata;
   verify every native dependency runs on the New Architecture.

## Constraints

- The app holds no business logic that isn't in a package.
- Image-heavy lists use FlashList + `expo-image`; no naive FlatList feeds.
- Graceful degradation on poor connectivity; no false "offline mode" promises.
- All native deps verified against Expo New Architecture before shipping.

## Definition of done

- [ ] A member can do on mobile everything they can on the web `(app)`: feed, communities,
      events, profile, chat.
- [ ] Push notifications arrive and deep-link to the right screen.
- [ ] Camera/photo upload posts an image to the feed.
- [ ] Match scoring works and updates live via Realtime.
- [ ] Image-heavy feeds scroll smoothly (FlashList + cached images).
- [ ] EAS produces installable iOS and Android builds on the New Architecture.
