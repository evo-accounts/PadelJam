# Social Sign-In: Skip "Complete Your Account" Step

**Date:** 2026-06-29
**Scope:** Apple + Google sign-in on iOS (mobile app)

## Problem

Apple and Google sign-in users are routed to `/(auth)/create-account` ("Complete your account") because `resolvePostAuthRoute` returns that route when no `profiles` row exists. The create-account step was designed to collect a phone number, password, and terms acceptance — data that social providers don't supply and that doesn't apply to their auth model (no password needed; session is already durable from the provider token). The result is unnecessary friction for social users.

## Decisions

| Question | Decision |
|---|---|
| Phone in profiles | Make nullable (drop NOT NULL, keep UNIQUE) |
| Scope of skip | Apple + Google (all social providers) |
| Terms consent | Implicit at sign-in ("By continuing…" disclosure line) |
| Profile creation | Dedicated edge function `provision-social-profile`, called client-side after sign-in succeeds |
| create-account screen | Unchanged — remains the fallback for OTP users and the safety-net for provision failures |

## Architecture

### Data Model Migration (`0084`)

```sql
alter table profiles alter column phone drop not null;
alter table profiles add column terms_accepted_at timestamptz;
```

- `phone` stays `UNIQUE` — Postgres allows multiple NULLs, so social users with no phone coexist without colliding. OTP users still require phone (enforced by the `complete-account` function, not the DB constraint).
- `terms_accepted_at` is nullable: NULL means OTP user whose terms acceptance is captured differently (terms checkbox in create-account still implied).
- The existing `sync_profile_contact` trigger (migration 0058) already uses `COALESCE`, so a later phone update from a social user syncs cleanly without change.
- No other migrations required: phone reads in event/roster RPCs (0041, 0047, 0051, 0067, 0079) tolerate NULL — they show a blank contact field.

### Edge Function: `provision-social-profile`

New Supabase Edge Function. Called by the mobile client immediately after a social sign-in succeeds, before routing.

**Auth:** Caller's Bearer JWT (user must be authenticated). Reads the caller's identity from `auth.users` server-side via the service role — client cannot inject an identity into the globally-readable `profiles` table.

**Provider guard:** Rejects with `403` if `app_metadata.provider` is not `apple` or `google`. Prevents OTP users from bypassing the `complete-account` flow.

**Request body:** `{ full_name?: string }` — optional. Apple passes the credential name (only available on first sign-in); Google omits it.

**Name fallback chain:**
1. `full_name` from request body (Apple credential name)
2. `user_metadata.full_name` or `user_metadata.name` (Google metadata, Apple subsequent sign-ins)
3. Capitalized email local-part (e.g. `joao.pereira@gmail.com` → `Joao Pereira`)
4. `"Jammer"` (absolute last resort)

**Upsert logic:**
```ts
admin.from('profiles').upsert(
  { id, email, phone: null, full_name, terms_accepted_at: now() },
  { onConflict: 'id', ignoreDuplicates: true }
)
```

`ignoreDuplicates: true` makes this fully idempotent — subsequent calls from a returning user (profile already exists) are a no-op. Returning users' `full_name` and `terms_accepted_at` are not overwritten.

**Responses:**
- `200 { ok: true }` — profile created or already exists
- `400` — missing/bad email on auth.users
- `403` — caller is not a social provider user
- `401` — invalid JWT

### Client Changes

**`lib/appleSignIn.ts`** (`runAppleSignIn`, iOS path):
1. After `signInWithAppleIdToken` succeeds, call `provision-social-profile` with the credential's `fullName` (from `AppleAuthentication.signInAsync`).
2. Remove the existing loose `supabase.auth.updateUser({ data: { full_name: full } })` call — the edge function is now the authoritative write.
3. Existing error handling for `ERR_REQUEST_CANCELED`, `oauth_failed`, `email_conflict` unchanged.

**`lib/googleSignIn.ts`** (`runGoogleSignIn`):
1. After `exchangeCodeForSession` succeeds, call `provision-social-profile` with no body (function reads metadata).
2. Existing error handling unchanged.

**Shared `lib/provisionSocialProfile.ts`** (new):
- Thin wrapper around the `fetch` call to `provision-social-profile`.
- Throws `Error('provision_failed')` on non-200 (caller converts to `oauth_failed` in the sign-in error boundary).

### Routing — No Logic Change

`resolvePostAuthRoute` in `lib/postAuthRoute.ts` is **unchanged**:
- `!profile → /(auth)/create-account` — for OTP users this remains correct.
- `profile.onboarded_at → /(tabs)` — returning social users land on tabs.
- `profile, not onboarded → onboarding steps` — first-time social users land on `/(onboarding)/location`.

Because `provision-social-profile` runs before routing, a social user always has a profile row by the time `resolvePostAuthRoute` runs. The `create-account` gate simply doesn't fire.

**Safety net:** If provisioning fails (network error), a social user reaches `Boot`/`resolvePostAuthRoute` with a session but no profile and will land on `create-account`. To prevent a dead-end (create-account demands phone + password for social users), `resolvePostAuthRoute` will detect a social session with no profile and re-attempt provision before falling back to `create-account`. Idempotency makes the retry free.

Concretely — modify `resolvePostAuthRoute`:
```ts
if (!profile) {
  if (isSocialSession(session)) {
    await provisionSocialProfile(session); // retry
    // re-fetch profile; if still fails, fall through to create-account
    const { data: retried } = await supabase.from('profiles').select(...).maybeSingle();
    if (retried) { /* continue to onboarding routing */ }
  }
  return '/(auth)/create-account';
}
```

### Terms Consent (Implicit)

Add a single disclosure line below the Apple and Google buttons on:
- `app/(auth)/sign-in.tsx`
- `app/(auth)/welcome.tsx`

Text (new i18n key `auth.socialTermsDisclosure`):
> "By continuing, you agree to our [Terms of Service] and [Privacy Policy]."

Links use the existing `TERMS_URL`/`PRIVACY_URL` constants. Tapping the Apple or Google button = acceptance, stamped in `profiles.terms_accepted_at` by the edge function.

### `create-account.tsx` — Unchanged

The screen remains as-is for OTP users. Its `isSocial` detection and the dead-end risk are addressed by the safety-net re-try in `resolvePostAuthRoute`; a social user who hits it can still proceed (they just also fill phone/password, same as today's fallback). No risk of regressions to the OTP flow.

## File Inventory

| File | Change |
|---|---|
| `infra/supabase/migrations/0084_social_profile_optional.sql` | New — drop NOT NULL on phone, add terms_accepted_at |
| `infra/supabase/functions/provision-social-profile/index.ts` | New edge function |
| `apps/mobile/lib/provisionSocialProfile.ts` | New thin client wrapper |
| `apps/mobile/lib/appleSignIn.ts` | Call provision, remove loose updateUser name write |
| `apps/mobile/lib/googleSignIn.ts` | Call provision after exchangeCodeForSession |
| `apps/mobile/lib/postAuthRoute.ts` | Add social safety-net re-try for no-profile case |
| `apps/mobile/app/(auth)/sign-in.tsx` | Add implicit terms disclosure line |
| `apps/mobile/app/(auth)/welcome.tsx` | Add implicit terms disclosure line |
| `packages/i18n/` | Add `auth.socialTermsDisclosure` key (all locales) |

## Testing

| Scenario | Expected |
|---|---|
| Apple sign-in, first time | Profile created, terms_accepted_at stamped, routes to onboarding |
| Apple sign-in, returning user | Provision is no-op, routes to tabs |
| Apple without name (subsequent sign-ins) | Name from metadata or fallback chain |
| Google sign-in, first time | Profile created from metadata, routes to onboarding |
| OTP sign-in | Unchanged — routes to create-account |
| Provision fails (network) | Safety-net in resolvePostAuthRoute retries; on second failure, falls through to create-account (social user can still complete) |
| Non-social user calls provision-social-profile | 403 rejected |
| Double provision call | Idempotent — second call is a no-op |
| Social user with phone added later | sync_profile_contact trigger updates profiles.phone cleanly |
| Existing OTP user — phone still required | complete-account function enforces it; DB no longer does |

## Out of Scope

- Android Apple sign-in (web-OAuth path, needs Apple Services ID + secret key configured separately — different setup)
- Phone collection UI for social users (deferred — can be added to profile settings later)
- Retroactive terms capture for existing users (no existing users on prod yet)
