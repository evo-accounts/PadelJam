# Phase 5I — Google Social Sign-in Setup & Verify

This guide turns the scaffolded (disabled) Google OAuth provider into a working
"Continue with Google" flow. The committed config keeps
`[auth.external.google].enabled = false` so local `supabase start` works without
credentials — enabling it is a credentials-time step you do here.

> Apple sign-in is a **deferred follow-up** (needs an Apple Developer account +
> `expo-apple-authentication` + `signInWithIdToken`, plus the App-Store rule that
> Apple sign-in must be offered when any other social sign-in is). Not part of 5I.

---

## 1. Create a Google Cloud OAuth **web** client

1. Go to the [Google Cloud Console](https://console.cloud.google.com/) and select
   (or create) a project.
2. Configure the **OAuth consent screen** (User type: External; add app name,
   support email, and the test users you'll sign in with while it's unverified).
3. **APIs & Services → Credentials → Create Credentials → OAuth client ID.**
4. Application type: **Web application** (Supabase web-OAuth uses a web client even
   for the mobile app — the handshake runs through the Supabase callback, not a
   native iOS/Android client).
5. Name it (e.g. "PadelJam Supabase Auth").
6. Leave it open for the next step (you'll add the redirect URI), then **Create** —
   copy the **Client ID** and **Client secret**.

## 2. Add the Supabase auth callback as an authorized redirect URI

In the same web OAuth client, under **Authorized redirect URIs**, add:

```
<SUPABASE_URL>/auth/v1/callback
```

- Hosted project: `https://<project-ref>.supabase.co/auth/v1/callback`
- Local: `http://127.0.0.1:55321/auth/v1/callback` (the `[api].port` in
  `infra/supabase/config.toml`)

Save the client.

## 3. Set env, enable the provider, confirm the mobile redirect

1. Set the credentials in your environment (see `.env.example`):

   ```bash
   SUPABASE_AUTH_EXTERNAL_GOOGLE_CLIENT_ID=<your-client-id>
   SUPABASE_AUTH_EXTERNAL_GOOGLE_CLIENT_SECRET=<your-client-secret>
   ```

   For a hosted project set the same values in the Supabase Dashboard
   (Authentication → Providers → Google) or via the management API/config.

2. In `infra/supabase/config.toml`, flip the provider on:

   ```toml
   [auth.external.google]
   enabled = true
   client_id = "env(SUPABASE_AUTH_EXTERNAL_GOOGLE_CLIENT_ID)"
   secret = "env(SUPABASE_AUTH_EXTERNAL_GOOGLE_CLIENT_SECRET)"
   ```

   (`client_id` may be set inline or via the env var — both work.)

3. Confirm the mobile redirect is allow-listed in the `[auth]` section
   (already scaffolded):

   ```toml
   additional_redirect_urls = ["https://127.0.0.1:3000", "mobile://auth/callback"]
   ```

4. Restart local Supabase so the new config takes effect:

   ```bash
   export SUPABASE_AUTH_SMS_TWILIO_AUTH_TOKEN=local_test_token
   pnpm dlx supabase@latest --workdir infra stop
   pnpm dlx supabase@latest --workdir infra start
   ```

## 4. Build a dev build (the native browser flow needs one)

The Google flow uses `expo-web-browser` + `expo-linking` and the custom
`mobile://` scheme, so it cannot run in Expo Go — build a dev client:

```bash
cd apps/mobile
npx expo run:ios      # or: npx expo run:android
```

## 5. Test the new-user vs existing-user flow

1. Launch the app and open the **Sign in** screen.
2. Tap **Continue with Google** → the system browser opens the Google consent
   screen.
3. Approve → the browser returns to the app via `mobile://auth/callback`; the
   `?code=` is exchanged for a session.
4. **New user** (Google email not yet in `auth.users`): lands on **Create
   account** with **email + name pre-filled and disabled**; complete with
   **phone + password** (still required) and accept terms → **Home**.
5. **Existing-email user** (email already has a completed profile): lands directly
   on **Home**.
6. (Bug-fix coverage) An OTP user interrupted before completing account creation
   — i.e. a session with no `profiles` row — also lands on **Create account**.

Also exercise the **"Try another way"** sheet on the OTP screen — it offers the
same **Continue with Google** option and routes identically.

---

### Troubleshooting

- **`redirect_uri_mismatch`** — the URI in step 2 must match `<SUPABASE_URL>/auth/v1/callback`
  exactly (scheme, host, port, no trailing slash).
- **Returns to browser but app doesn't catch the redirect** — confirm
  `mobile://auth/callback` is in `additional_redirect_urls` and that the app's URL
  scheme (`mobile`) is registered in `app.json`.
- **`supabase start` fails after enabling** — the client_id/secret env vars must be
  set in the shell (or `.env`) Supabase reads; with `enabled = false` no credential
  is required.
