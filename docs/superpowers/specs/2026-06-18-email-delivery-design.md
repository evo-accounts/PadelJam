# Email Delivery (Resend) — Design

*Padel Jam • 2026-06-18 • Brainstormed design / spec*

## Goal

Light up the two already-built features that currently record-but-don't-send, via **Resend** email:
- **"Email me the CSV"** roster export (JM-46) — an organizer emails themselves the attendance/revenue CSV.
- **Blast email channel** — when a blast includes the `email` channel, actually email the opted-in members
  (the blast already records the row + `sent_to_count`; this delivers it).

First track of the external-delivery theme. **Externally-blocked:** real sending needs a `RESEND_API_KEY`
+ a verified sender domain; this ships edge-function code + config + a setup doc, verified as far as the
sandbox allows (missing key → graceful 500 locally). WhatsApp channel and push notifications are deferred.

## Scope decisions (from the brainstorm)

1. **Provider = Resend** (`api.resend.com`), key via `RESEND_API_KEY`, sender via `RESEND_FROM_EMAIL`.
2. **CSV is built server-side** by a SECURITY DEFINER RPC (`event_roster_csv`), not trusting client-supplied
   content — privacy (no member email/mobile, JM-47) is enforced server-side and the RPC is organizer-gated.
3. **Blast delivery is client-invoked** after the recording RPC (`useSendBlast` → `send-blast` edge fn); no
   DB-webhook/queue infra.
4. **Email channel only** in `send-blast` this slice; WhatsApp is skipped (deferred).

## Verified context

- Highest migration is `0075`; this slice uses **`0076`**.
- `send_event_blast` ([0072_event_blasts.sql:47](../../../infra/supabase/migrations/0072_event_blasts.sql#L47))
  records an `event_blasts` row + `sent_to_count` (members opted-in to a selected channel via
  `user_settings`) and **sends nothing**. `useSendBlast`
  ([packages/api/src/events/mutations.ts](../../../packages/api/src/events/mutations.ts)) calls the RPC and
  returns the count.
- The Manage export ([apps/mobile/app/event/[id]/manage.tsx](../../../apps/mobile/app/event/[id]/manage.tsx))
  has Download-CSV only (`buildRosterCsv` from `@padel/utils`, JM-47 columns, excludes email/mobile).
- `user_settings(notifications_email, notifications_whatsapp, notifications_push)`
  ([0057](../../../infra/supabase/migrations/0057_user_settings.sql)); members' emails live on `auth.users.email`.
- Edge functions ([infra/supabase/functions](../../../infra/supabase/functions)): `stream-token`,
  `ensure-channel`, `complete-account`, `delete-account`. Auth pattern: anon client + `Authorization`
  header → `userClient.auth.getUser()`; service-role client (`SUPABASE_SERVICE_ROLE_KEY`) for privileged
  reads; secrets via `Deno.env.get(...)`. `[edge_runtime]` exists in `config.toml` with a commented
  `[edge_runtime.secrets]`. **No existing email/SMTP integration**; Twilio is configured for OTP only.
- Helpers `is_event_organizer(e,u)`, `event_group_community(e)` exist.

## Architecture

### 1. Migration `0076_event_roster_csv.sql`

```sql
-- JM-46/47: organizer-only server-built attendance/revenue CSV (single source of truth for the
-- emailed roster). Mirrors @padel/utils buildRosterCsv columns; member email/mobile are NOT included.
create or replace function event_roster_csv(p_event_id uuid) returns text
language plpgsql stable security definer set search_path = public as $$
declare v_user uuid := auth.uid(); v_ev events%rowtype; v_fee numeric; v_csv text;
begin
  if v_user is null then raise exception 'not authenticated'; end if;
  select * into v_ev from events where id = p_event_id;
  if v_ev.id is null then raise exception 'event_not_found' using errcode='P0001'; end if;
  if not is_event_organizer(p_event_id, v_user) then raise exception 'forbidden' using errcode='P0001'; end if;
  v_fee := case when v_ev.entrance_fee_enabled then coalesce(v_ev.entrance_fee_amount, 0) else 0 end;

  -- CSV-escape helper inline: wrap in quotes + double internal quotes when needed.
  with rows as (
    select
      coalesce(pr.full_name, ep.guest_name, '') as name,
      case when ep.user_id is not null then 'member' else 'manual' end as user_type,
      ep.status, ep.is_standby, ep.joined_at, ep.confirmed_at, ep.has_paid, ep.paid_at
    from event_participants ep
    left join profiles pr on pr.id = ep.user_id
    where ep.event_id = p_event_id
    order by ep.joined_at asc
  ),
  lines as (
    select string_agg(
      _csv_field(name) || ',' || user_type || ',' || status || ',' ||
      lower(is_standby::text) || ',' || coalesce(joined_at::text,'') || ',' ||
      coalesce(confirmed_at::text,'') || ',' || lower(has_paid::text) || ',' ||
      coalesce(paid_at::text,'') || ',' || v_fee::text,
      E'\n') as body
    from rows
  )
  select 'name,user_type,status,is_standby,joined_at,confirmed_at,has_paid,paid_at,fee_amount'
         || coalesce(E'\n' || body, '')
  into v_csv from lines;
  return v_csv;
end; $$;

grant execute on function event_roster_csv(uuid) to authenticated;
```
with a small immutable `_csv_field(text) returns text` helper (quote/escape) created in the same migration
and revoked from public. SQL test `event_roster_csv.sql`: organizer gets a header + one row per
participant (member vs manual, fee column, escaping a comma in a name); non-organizer → `forbidden`.

### 2. Shared Resend helper — `infra/supabase/functions/_shared/email.ts`

```ts
// sendEmail / sendBatchEmails wrappers over the Resend REST API.
// RESEND_API_KEY unset -> throw 'email_not_configured' (caller returns 500).
//   POST https://api.resend.com/emails   { from, to, subject, html, attachments?: [{filename, content/*base64*/}] }
//   POST https://api.resend.com/emails/batch  [ {from,to,subject,html}, ... ]  (<=100)
// from = Deno.env.get('RESEND_FROM_EMAIL'); Authorization: Bearer RESEND_API_KEY.
```
(Deno module imported by both edge functions below; mirrors the `Deno.env.get` + `fetch` pattern.)

### 3. Edge fn `infra/supabase/functions/send-roster-csv/index.ts`

- POST; JWT-auth via anon client + `Authorization` header → `getUser()` (401 if none).
- Body `{ event_id }`.
- Call `userClient.rpc('event_roster_csv', { p_event_id: event_id })` **as the caller** → the RPC enforces
  organizer (`forbidden` → return 403). Get the CSV text.
- Recipient = the caller's own account email: `user.email` (from `getUser()`); if null → 400 `no_email`.
- `sendEmail({ to: user.email, subject: '<event> — attendance & revenue', html: '<short body>',
  attachments: [{ filename: '<slug>-<date>.csv', content: base64(csv) }] })`.
- Return `{ ok: true }` (or `{ error: 'email_not_configured' }` 500 when key missing).

### 4. Edge fn `infra/supabase/functions/send-blast/index.ts`

- POST; JWT-auth → `getUser()`. Body `{ blast_id }`.
- Service-role client: load the `event_blasts` row; verify `is_event_organizer(event_id, user.id)` (call the
  RPC as the user, or check `events.organizer_id` via service role) → else 403.
- If the blast's `channels` does not include `'email'` → return `{ ok: true, sent: 0 }` (nothing to do here).
- Fetch email recipients (service role): `event_participants` (status in invited/interested/confirmed/
  waiting_list, `user_id` not null) ⋈ `user_settings` (`notifications_email = true`) ⋈ `auth.users.email`.
- `sendBatchEmails(recipients.map(r => ({ to: r.email, subject: blast.title, html: render(blast) })))`
  (chunk to ≤100). `render` = title + description (+ image_path as a hosted URL if present).
- Return `{ ok: true, sent: recipients.length }`.

### 5. Config + env

- `config.toml`: uncomment/add `[edge_runtime.secrets]` with `RESEND_API_KEY = "env(RESEND_API_KEY)"` and
  `RESEND_FROM_EMAIL = "env(RESEND_FROM_EMAIL)"`.
- `.env.example`: `RESEND_API_KEY=` and `RESEND_FROM_EMAIL=` (server-side).

### 6. `@padel/api` + Mobile

- **`useSendRosterCsvEmail(eventId)`** (mutations): `fetch(`${SUPABASE_URL}/functions/v1/send-roster-csv`,
  { headers: Bearer access_token, body: { event_id } })`; throws a mapped error on non-OK.
- **`useSendBlast`**: after the RPC records the row and returns the count, if `channels` includes `'email'`,
  call `fetch(.../functions/v1/send-blast, { body: { blast_id } })` — but the RPC currently returns only the
  count, not the blast id. **Change `send_event_blast` to also return the new blast id** (the migration
  `0076` re-creates it to `returns table(blast_id uuid, sent_to_count integer)` or adds a companion; simplest:
  re-create returning the id and have the hook read both). The hook then invokes `send-blast` with that id
  (fire-and-forget; surface a non-fatal error). *(Decision: extend the RPC return in 0076.)*
- **Manage screen export:** replace the single Download action with a small **sheet** offering **Download CSV**
  and **Email me the CSV** (JM-46) — the latter calls `useSendRosterCsvEmail`; on success a confirmation, on
  `email_not_configured` a friendly "email isn't set up yet" message.
- **i18n** (`event` namespace): `exportSheetTitle`, `emailCsvCta`, `csvEmailed` ("Sent to your email."),
  `email_not_configured` ("Email delivery isn't configured yet."), plus a blast-email note if desired.

### 7. Docs — `docs/superpowers/email-delivery-setup.md`

Create a Resend account → verify a sending domain → create an API key → set `RESEND_API_KEY` +
`RESEND_FROM_EMAIL` (local `.env` / cloud function secrets) → `supabase functions serve` to smoke-test →
test: Email-me-the-CSV arrives with the attachment; a blast with the email channel reaches opted-in members.

## Error handling

- `event_roster_csv` raises `forbidden`/`event_not_found` (P0001) → edge fn maps to 403/404.
- `sendEmail` with no key → `email_not_configured` → 500 → UI shows the friendly "not configured" message.
- `send-blast` is best-effort/non-fatal for the organizer: the blast is already recorded; a delivery failure
  surfaces a soft warning, not a blocked send.
- No recipients (none opted-in) → `{ ok: true, sent: 0 }`.

## Testing / verification

- **DB:** `db reset` clean; `event_roster_csv.sql` → `OK event_roster_csv`. (`send_event_blast` return-shape
  change re-tested by the existing `event_blasts.sql` — update it to read the new return.)
- **Types/API:** `pnpm -w typecheck` (13/13); `pnpm --filter @padel/api test`. Edge functions are Deno
  (outside the pnpm TS workspace) — verified by review + a documented local `supabase functions serve` smoke.
- **Manual (post-key, per the doc):** Email-me-the-CSV → email with attachment; blast email channel →
  opted-in members receive it.

## Explicitly deferred

WhatsApp blast channel (Twilio Business sender); push notifications (separate track); a delivery-log/retry
table; HTML email templating beyond a basic body; PT/PT-BR copy.

## Conventions followed

Additive migration `0076`; RPC `security definer set search_path = public` + grant; SQL test `PT001`/`OK`;
edge-fn auth/service-role/`Deno.env.get` pattern (mirrors `complete-account`/`stream-token`); secrets via
`config.toml` env-interpolation; thin `@padel/api` hooks; `useT('event')`; reuse `is_event_organizer`,
`buildRosterCsv` columns (mirrored in SQL), and the existing `complete-account` fetch pattern for invoking
functions from the app.
