# Push Notifications (Expo Push) — Design

*Padel Jam • 2026-06-18 • Brainstormed design / spec*

## Goal

Deliver the existing in-app notifications feed as real device push via **Expo Push**: store device tokens,
register them in-app, and fan out a push on every `notifications` INSERT (gated on the recipient's
`notifications_push` setting). Second track of the external-delivery theme.

**Most-blocked track:** end-to-end push needs the native `expo-notifications` module (dev build), a
**physical device** (simulators can't receive remote push), **EAS push credentials** (FCM for Android, APNs
for iOS), and the prod DB→function fan-out URL/secret. This slice ships as a scaffold verified here by
`pnpm -w typecheck` + a token-RPC SQL test + review; runtime is verified later on a device per the setup doc.

## Scope decisions (from the brainstorm)

1. **Full scaffold now** — token table + register RPC + in-app registration + `send-push` edge fn +
   notifications-INSERT fan-out trigger + setup doc.
2. **Expo Push** (keyless send API; EAS manages FCM/APNs).
3. **Fan-out = a single AFTER-INSERT trigger on `notifications`** calling `send-push` via `pg_net`, guarded
   to no-op when the prod URL/secret settings are unset (so local `db reset` stays clean).

## Verified context

- Highest migration is `0076`; this slice uses **`0077`**.
- `notifications` ([0061_notifications.sql:4](../../../infra/supabase/migrations/0061_notifications.sql#L4))
  + 6 producer triggers (`notify_on_follow`/`_event_invite`/`_group_invite`/`_community_invite`/
  `_join_accepted`/`_participant_join`) all insert rows with `user_id, type, actor_id, actor_name,
  entity_name, event_id/group_id/community_id/ref_id`. Types: `follow, event_invite, group_invite,
  community_invite, community_request_accepted, follow_joined_event`.
- `user_settings.notifications_push` (default **true**) ([0057](../../../infra/supabase/migrations/0057_user_settings.sql)).
  **No `push_tokens` table, no `expo-notifications`/`expo-device` deps, no webhook/pg_net wiring.**
- Edge-fn pattern (`complete-account` etc.): `Deno.env.get`, service-role client; secrets via `config.toml`
  `[edge_runtime.secrets]` env-interpolation. App scheme `mobile`, bundle `com.anonymous.mobile`.
- Root `_layout.tsx` `Boot()` resolves the session; `SessionProvider` (`@padel/auth`) subscribes to auth
  state. Sign-out path exists in settings/account.

## Architecture

### 1. Migration `0077_push_tokens.sql`

```sql
create table push_tokens (
  user_id    uuid not null references profiles(id) on delete cascade,
  expo_token text not null,
  platform   text not null check (platform in ('ios','android')),
  updated_at timestamptz not null default now(),
  primary key (user_id, expo_token)
);
alter table push_tokens enable row level security;
create policy "push_tokens: read own"   on push_tokens for select using (user_id = auth.uid());
create policy "push_tokens: delete own" on push_tokens for delete using (user_id = auth.uid());
-- inserts/updates only via register_push_token (SECURITY DEFINER)

create or replace function register_push_token(p_expo_token text, p_platform text) returns void
language plpgsql security definer set search_path = public as $$
declare v_user uuid := auth.uid();
begin
  if v_user is null then raise exception 'not authenticated'; end if;
  if p_platform not in ('ios','android') then raise exception 'invalid_platform' using errcode='P0001'; end if;
  if coalesce(btrim(p_expo_token),'') = '' then raise exception 'invalid_token' using errcode='P0001'; end if;
  insert into push_tokens (user_id, expo_token, platform, updated_at)
  values (v_user, p_expo_token, p_platform, now())
  on conflict (user_id, expo_token) do update set platform = excluded.platform, updated_at = now();
end; $$;
grant execute on function register_push_token(text, text) to authenticated;

-- Fan-out: every notification INSERT pings the send-push edge function (async, fire-and-forget).
-- No-ops locally (settings unset) so db reset + producers stay clean. pg_net is enabled on Supabase.
create or replace function notify_push() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_url text := current_setting('app.send_push_url', true);
        v_secret text := current_setting('app.send_push_secret', true);
begin
  if v_url is null or v_url = '' then return NEW; end if;  -- unconfigured (local) -> no-op
  perform net.http_post(
    url := v_url,
    headers := jsonb_build_object('Content-Type','application/json','x-push-secret', coalesce(v_secret,'')),
    body := jsonb_build_object('notification_id', NEW.id)
  );
  return NEW;
end; $$;
create trigger trg_notify_push after insert on notifications
  for each row execute function notify_push();
```

- `database.types.ts`: hand-add `push_tokens` Row + `register_push_token`.
- **SQL test `push_tokens.sql`**: `register_push_token('ExponentPushToken[x]','ios')` inserts one row;
  re-register same token bumps `updated_at` (still one row); a second token → two rows; `'invalid'` platform
  → `invalid_platform`; reading another user's tokens → 0 rows (RLS); inserting a `notifications` row (with
  `app.send_push_url` unset) does **not** error (trigger no-ops). `PT001`/`OK push_tokens`.

### 2. `@padel/api`

- `qk` (none needed — mutations only).
- `useRegisterPushToken()` → `rpc('register_push_token', { p_expo_token, p_platform })`.
- `useDeletePushToken()` → `db.from('push_tokens').delete().eq('expo_token', token)` (RLS own-row) for
  sign-out / token rotation.

### 3. Edge fn `infra/supabase/functions/send-push/index.ts`

- POST; **auth = shared secret** (`x-push-secret` header === `Deno.env.get('PUSH_WEBHOOK_SECRET')`) — it's
  invoked by the DB trigger, not a user. 401 on mismatch.
- Body `{ notification_id }`. Service-role client reads the notification row.
- Gate: read `user_settings.notifications_push` for `notification.user_id`; if false/absent → `{ ok:true,
  skipped:'push_off' }`.
- Read `push_tokens` for that user; if none → `{ ok:true, skipped:'no_tokens' }`.
- Build the message: `title`/`body` from a type→copy map using `actor_name`/`entity_name`
  (e.g. `follow` → "{actor} followed you", `event_invite` → "{actor} invited you to {entity}", etc. —
  mirrors the in-app `notifications` i18n). `data: { type, event_id, group_id, community_id, ref_id }` for
  deep-linking.
- POST to `https://exp.host/--/api/v2/push/send` with `[{ to, title, body, data }, …]` (chunk ≤100).
  Best-effort: a non-OK Expo response → `{ ok:false }` (logged), never throws back into the producer.
- `PUSH_WEBHOOK_SECRET` is read via `Deno.env.get`; unset → 500 `push_not_configured` (expected pre-setup).
- config: `[edge_runtime.secrets]` add `PUSH_WEBHOOK_SECRET = "env(PUSH_WEBHOOK_SECRET)"`; `.env.example` adds it.

### 4. Mobile registration

- Add deps `expo-notifications` + `expo-device`; add the `expo-notifications` plugin to `app.json`
  (`plugins: [..., "expo-notifications"]`) and ensure `extra.eas.projectId` is referenced (documented if absent).
- **`apps/mobile/lib/push.ts`**:
  - `setNotificationHandler` at module load (foreground display: show alert/sound).
  - `registerForPush()`: if `!Device.isDevice` → return; `getPermissionsAsync` → if not granted,
    `requestPermissionsAsync`; if still not granted → return; `projectId = Constants.expoConfig?.extra?.eas?.projectId`
    (if absent → return + warn); `token = (await getExpoPushTokenAsync({ projectId })).data`; call
    `register_push_token` via the hook/`supabase.rpc`; persist the token locally (AsyncStorage) for sign-out cleanup.
  - `unregisterForPush()`: delete the stored token (RPC/RLS) on sign-out.
- **Wire** `registerForPush()` once after the session is ready (root layout effect or `SessionProvider`
  consumer), guarded by the user's `notifications_push` preference; call `unregisterForPush()` in the
  sign-out handler.
- **i18n** (`settings`/`auth` namespace as fitting): a permission-rationale string if a pre-prompt is shown
  (optional); none strictly required if using the OS prompt directly.

### 5. Docs — `docs/superpowers/push-setup.md`

EAS project + `extra.eas.projectId`; build a dev client (`eas build`/`expo run:ios` won't get remote push on
simulator — use a device or an EAS dev/TestFlight build); `eas credentials` to set the FCM server key
(Android) + APNs key (iOS); set `PUSH_WEBHOOK_SECRET` (function secret) and the DB settings
`ALTER DATABASE postgres SET app.send_push_url = '<send-push function URL>';` +
`… SET app.send_push_secret = '<same secret>';`; test: grant permission on the device → trigger a
notification (e.g. follow) → push arrives.

## Error handling

- `register_push_token` raises `invalid_platform`/`invalid_token` (P0001) → mapped via `mapPgError`.
- Fan-out trigger: `pg_net` is async/fire-and-forget — a failed/missing function never blocks the producer
  transaction; unset settings → no-op.
- `send-push`: bad secret → 401; `push_not_configured` (no `PUSH_WEBHOOK_SECRET`) → 500; push-off /
  no-tokens → 200 skip; Expo non-OK → soft failure.
- Registration: non-device / permission denied / missing projectId → silently return (no crash); the app
  works without push.

## Testing / verification

- **DB:** `db reset` clean; `push_tokens.sql` → `OK push_tokens` (incl. the trigger-no-op-when-unset case).
- **Types/API:** `pnpm -w typecheck` (13/13); `pnpm --filter @padel/api test`.
- **Review-only here:** `send-push` (Deno) + the registration (native, needs a device) — verified by review;
  runtime per the setup doc on a device with EAS credentials.

## Explicitly deferred

Expo push **receipts**/retry handling; richer deep-link routing from a tapped push (beyond passing the ids
in `data`); badge counts; the WhatsApp delivery track; PT/PT-BR push copy.

## Conventions followed

Additive migration `0077`; RPC `security definer set search_path = public` + grant; SQL test `PT001`/`OK`;
hand-edited `database.types.ts`; edge-fn `Deno.env.get` + service-role pattern; secrets via `config.toml`
env-interpolation; thin `@padel/api` hooks; reuse the `notifications` producer model (one decoupled trigger
rather than touching all 6 producers); `expo-secure-store`/`AsyncStorage` already present.
