# Push Notifications — runtime setup

The push slice is scaffold-complete in code (DB table + RPC + trigger, the `send-push` edge function, and the
in-app registration). Runtime delivery needs one-time setup that **cannot** be done locally: an EAS project id,
a dev build on a **physical device** (simulators/emulators can't receive remote push), EAS push credentials
(FCM for Android, APNs for iOS), and the production fan-out URL + shared secret wired into the database.

This document is the runbook for that setup.

## Prerequisites

- An Expo account and the EAS CLI: `npm i -g eas-cli` then `eas login`.
- A physical iOS and/or Android device for testing.
- Access to the production (or staging) Supabase project + its dashboard.

## 1. Initialise EAS (sets `extra.eas.projectId`)

From `apps/mobile`:

```bash
eas init
```

This creates the project on EAS and writes `extra.eas.projectId` into `apps/mobile/app.json`. The registration
code (`apps/mobile/lib/push.ts`) **no-ops** until this id exists, so the app builds and runs fine before this
step — it just won't register a push token.

Commit the resulting `app.json` change.

## 2. Build a dev client on a device

Remote push requires a real device, not a simulator/emulator. Build and install a development client:

```bash
# iOS (requires an Apple Developer account)
eas build --profile development --platform ios

# Android
eas build --profile development --platform android
```

Install the resulting build on the physical device and run the dev server (`pnpm --filter mobile start`,
or `npx expo start --dev-client` from `apps/mobile`).

## 3. Upload push credentials

```bash
eas credentials
```

- **Android:** provide the FCM server key / service account so Expo can deliver to FCM.
- **iOS:** upload (or let EAS manage) the APNs key.

Without these, Expo Push accepts the request but can't deliver to the device.

## 4. Set the function secret + the DB fan-out settings

The DB trigger (`notify_push`) `pg_net`-posts to the `send-push` edge function **only** when
`app.send_push_url` is set, authenticating with `app.send_push_secret` in the `x-push-secret` header. The edge
function checks that header against its own `PUSH_WEBHOOK_SECRET`. **These two values must match.**

1. Deploy the function (it's invoked server-to-server by the DB trigger, so JWT verification is off —
   `config.toml` sets `[functions.send-push] verify_jwt = false`; the `--no-verify-jwt` flag is the CLI equivalent):

   ```bash
   pnpm dlx supabase@latest --workdir infra functions deploy send-push --no-verify-jwt
   ```

2. Set the function secret (the edge-function side). Pick a strong random value and reuse it below:

   ```bash
   pnpm dlx supabase@latest --workdir infra secrets set PUSH_WEBHOOK_SECRET='<strong-random-value>'
   ```

   (Locally this comes from `.env` via `config.toml`'s `[edge_runtime.secrets]` env-interpolation — never commit it.)

3. Set the database settings (the trigger side) so the trigger knows where to post and with what secret. Run
   against the project database (SQL editor or `psql`):

   ```sql
   ALTER DATABASE postgres SET app.send_push_url = '<send-push function URL>';
   ALTER DATABASE postgres SET app.send_push_secret = '<same value as PUSH_WEBHOOK_SECRET>';
   ```

   The `<send-push function URL>` is the deployed function endpoint, e.g.
   `https://<project-ref>.functions.supabase.co/send-push`.

   New connections pick up the changed settings; existing pooled connections may need to reconnect.

## 5. Test on a device

1. Open the app on the physical device and grant the notification permission when prompted (registration runs
   after sign-in).
2. Confirm a row appears in `push_tokens` for your user.
3. Trigger a notification — e.g. have someone follow your account (or any action that inserts into
   `notifications` for you). This fires `trg_notify_push` → `send-push` → Expo Push.
4. A push notification should arrive on the device. If it doesn't:
   - Check `user_settings.notifications_push` is `true` for the recipient.
   - Check the function logs (`supabase functions logs send-push`) for `expo_failed:*`, `no_tokens`, or
     `push_off`.
   - Verify `app.send_push_url` / `app.send_push_secret` are set and the secret matches `PUSH_WEBHOOK_SECRET`.
   - Verify EAS push credentials are uploaded for the platform.

## Notes

- Keep the trigger a **no-op locally**: `app.send_push_url` is unset on local/`db reset`, so `notify_push`
  returns early and never calls `net.http_post`.
- Never commit `PUSH_WEBHOOK_SECRET` or `app.send_push_secret`.
- `send-push` is invoked by the DB trigger with the shared `x-push-secret`, not a user JWT — it uses the
  service-role key to read the notification, the recipient's `notifications_push` setting, and their tokens.
