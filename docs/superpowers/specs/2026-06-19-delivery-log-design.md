# Delivery Log + Retry (A4) — Design

*Padel Jam • 2026-06-19 • Brainstormed design / spec*

## Goal

Record each outbound **send attempt** (event-blast email, push) with its outcome in a `delivery_log` table,
surface per-blast delivery status on the blast screen, and let an organizer **retry** a failed email blast.
Foundation for delivery observability. The actual sending stays provider-gated (Resend / Expo creds are Group C
/ B5), so the writeback code is verified by review + later runtime, not locally.

## Scope decisions (from the brainstorm)

1. **Per-attempt granularity:** one `delivery_log` row per send attempt (per blast / per push) with counts +
   status — not per-recipient (Resend batch / Expo don't expose per-recipient status without reworking the
   helpers).
2. **Coverage:** `send-blast` (email) and `send-push` both write a row. UI surfaces status on the blast screen
   only (push is automatic, no UI). CSV-email is out.
3. **Retry:** a `retry_blast` RPC (organizer-gated precondition) + an organizer **Retry** button on the blast
   screen for failed email blasts. The resend reuses the existing `send-blast` invocation.

### Explicitly deferred

- Per-recipient delivery rows (would require reworking `sendBatchEmails` + capturing Expo per-ticket results).
- Push retry UI / Expo receipt polling (B5).
- Logging the roster-CSV email; actual Resend/Expo sending + receipts (Group C / B5).

## Verified context

- **`event_blasts`** ([0072_event_blasts.sql](../../../infra/supabase/migrations/0072_event_blasts.sql)):
  `id, event_id, sender_id, source_template_id, title, description, image_path, channels text[], send_to,
  sent_to_count, sent_at`. No delivery-status columns.
- **`send_event_blast`** ([0076_email_delivery.sql](../../../infra/supabase/migrations/0076_email_delivery.sql))
  returns `(blast_id uuid, sent_to_count int)`; `blast_email_recipients(p_blast_id)` (organizer-gated) returns
  opted-in emails.
- **`send-blast`** ([infra/supabase/functions/send-blast/index.ts](../../../infra/supabase/functions/send-blast/index.ts)):
  client-invoked via `db.functions.invoke('send-blast',{blast_id})` (fire-and-forget; `useSendBlast` swallows
  errors). Uses the caller's anon-key client; returns `{ok,sent}` / `{error}`. **No DB writeback.** Skips when
  `email` not in channels.
- **`send-push`** ([infra/supabase/functions/send-push/index.ts](../../../infra/supabase/functions/send-push/index.ts)):
  invoked by the `notify_push` trigger via `pg_net`
  ([0077_push_tokens.sql](../../../infra/supabase/migrations/0077_push_tokens.sql)); already builds a
  **service-role** admin client (`SUPABASE_SERVICE_ROLE_KEY`). Soft-fails (returns 200 `{ok:false,error}`).
  **No DB writeback.**
- **Service-role writeback pattern:** `const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)` then
  `admin.from(...).insert(...)` — used in `send-push` and `complete-account`.
- **Blast UI** ([apps/mobile/app/event/[id]/blast.tsx](../../../apps/mobile/app/event/[id]/blast.tsx)): renders
  past blasts from `useEventBlasts(id)` (`id,title,description,channels,sent_to_count,sent_at,…`), newest first.
  No delivery status today. `useSendBlast`/`useEventBlasts` in
  [packages/api/src/events](../../../packages/api/src/events).
- **Conventions:** SECURITY DEFINER RPC + grant; RLS organizer checks via `is_event_organizer`; `mapPgError`
  KNOWN allow-list; hand-edited `database.types.ts`. Highest migration is **`0081`**; this slice uses **`0082`**.

## Architecture

### 1. Migration `0082_delivery_log.sql`

```sql
create table delivery_log (
  id              uuid primary key default gen_random_uuid(),
  channel         text not null check (channel in ('email','push')),
  blast_id        uuid references event_blasts(id) on delete cascade,
  notification_id uuid references notifications(id) on delete cascade,
  status          text not null check (status in ('sent','failed')),
  attempt         integer not null default 1,
  sent_count      integer not null default 0,
  failed_count    integer not null default 0,
  error           text,
  created_at      timestamptz not null default now(),
  -- email rows point at a blast; push rows at a notification (exactly one).
  constraint delivery_target check (
    (channel = 'email' and blast_id is not null and notification_id is null) or
    (channel = 'push'  and notification_id is not null and blast_id is null))
);
create index delivery_log_blast_idx on delivery_log (blast_id, attempt desc);

alter table delivery_log enable row level security;
-- Organizer-only read of email/blast rows; push rows have no user read policy (service-role only).
create policy "delivery_log: organizer reads blast rows" on delivery_log for select
  using (blast_id is not null and exists (
    select 1 from event_blasts b where b.id = delivery_log.blast_id
      and is_event_organizer(b.event_id, auth.uid())));
-- No insert/update/delete policy: only the service role (edge functions) writes.
```

**RPC** `retry_blast(p_blast_id uuid) returns void` (`security definer set search_path = public`):
- `not authenticated` if `auth.uid()` null.
- Load blast → `event_not_found` if missing.
- `is_event_organizer(blast.event_id, auth.uid())` else `forbidden`.
- Require `'email' = any(channels)` else `not_retryable`.
- Require the latest `delivery_log` attempt for this blast (`order by attempt desc limit 1`) is `status='failed'`
  else `not_retryable`. (No prior attempt at all ⇒ also `not_retryable` — the initial send hasn't completed/
  recorded yet.)
- Returns void (the gate). The client then re-invokes `send-blast`, which records the next attempt row.
- `grant execute … to authenticated`.

`database.types.ts`: add the `delivery_log` table Row/Insert/Update types and `retry_blast: { Args:{p_blast_id:string}; Returns: undefined }`.

### 2. Edge functions — record the attempt (service-role write)

- **`send-blast`**: after the email send completes (success or the caught failure), build a service-role admin
  client and INSERT one row:
  ```ts
  const attempt = ((await admin.from('delivery_log').select('attempt')
      .eq('blast_id', blast_id).order('attempt', { ascending: false }).limit(1)).data?.[0]?.attempt ?? 0) + 1;
  await admin.from('delivery_log').insert({
    channel: 'email', blast_id, attempt,
    status: ok ? 'sent' : 'failed', sent_count: ok ? sent : 0,
    failed_count: ok ? 0 : recipientCount, error: ok ? null : errorMessage });
  ```
  Only when `email` is in channels (mirror the existing early-return). The send still returns its `{ok}`/`{error}`
  to the caller as today.
- **`send-push`**: after the Expo send, INSERT one row with the existing admin client:
  `{ channel:'push', notification_id, attempt:1, status: ok?'sent':'failed', sent_count: ok?messages.length:0,
  error: ok?null:errorMessage }`.
- Both wrap the insert in try/catch so a logging failure never breaks the send response.

### 3. `@padel/api`

- `useEventBlastDeliveries(eventId)` — query the latest `delivery_log` row per blast for the event's blasts
  (organizer-gated by RLS). Implementation: select `blast_id, status, attempt, sent_count, failed_count, error,
  created_at` from `delivery_log` where `blast_id` in the event's blasts, ordered `attempt desc`; the hook
  reduces to a `Map<blast_id, latestRow>` (or a small `distinct on (blast_id)` view/RPC). Key
  `qk.blastDeliveries(eventId)`.
- `useRetryBlast(eventId)` — mutation: `await db.rpc('retry_blast',{p_blast_id})` (throws mapped error); then
  `await db.functions.invoke('send-blast',{ body:{ blast_id }})` (fire-and-forget like `useSendBlast`); on
  success invalidate `qk.blastDeliveries(eventId)` (and `qk.eventBlasts`).
- `mapPgError` KNOWN: add `not_retryable`.

### 4. Mobile — `blast.tsx`

- Call `useEventBlastDeliveries(id)`; for each past blast render a status badge from its latest row:
  `sent → Delivered`, `failed → Failed`, none → `Pending` (no attempt recorded yet — e.g. provider
  unconfigured). 
- When the latest email attempt is `failed`, render a **Retry** button → `useRetryBlast(id).mutateAsync(blastId)`;
  show pending state; surface `not_retryable` inline.
- English i18n (`event` namespace; PT/PT-BR → A5): `deliveryDelivered`, `deliveryFailed`, `deliveryPending`,
  `retryBlastCta`, `not_retryable`.

## Error handling

- `retry_blast` raises `forbidden` / `event_not_found` / `not_retryable` (P0001) → `mapPgError` → inline.
- Edge-function writeback is best-effort (try/catch): a `delivery_log` insert failure must not change the send
  outcome returned to the caller.
- The `delivery_target` CHECK guarantees every row is unambiguously email-or-push.

## Testing / verification

- **DB:** `db reset` clean; `infra/supabase/tests/delivery_log.sql` → `OK delivery_log`:
  - Seed a community/event/blast (channels `{email}`) and a `delivery_log` row; the organizer can `select` it,
    a non-organizer cannot (RLS).
  - A malformed row (e.g. `channel='email'` with `notification_id` set / `blast_id` null) is rejected by
    `delivery_target`.
  - `retry_blast`: raises `not_retryable` when the latest attempt is `sent` (or none exists); succeeds (no
    error) when the latest attempt is `failed`; raises `forbidden` for a non-organizer.
  - A push row (`channel='push'`, `notification_id` set) is NOT selectable by a regular authenticated user.
- **Types/API:** `pnpm -w typecheck` (13/13); `pnpm --filter @padel/api test`.
- **App smoke (simulator):** blast screen shows a status badge per blast (Pending locally, since no provider);
  a blast whose latest attempt is `failed` shows Retry. (End-to-end delivered/failed needs Resend — Group C.)

## Conventions followed

Additive migration `0082`; `delivery_log` with RLS organizer-read + service-role-only write; SECURITY DEFINER
`retry_blast` + grant; SQL test `PT001`/`OK`; edge-function service-role writeback (the `send-push` pattern),
best-effort/try-catch; hand-edited `database.types.ts`; thin `@padel/api` hooks + `qk` keys + `mapPgError`;
`useT('event')`; English-only copy (PT/PT-BR → A5). Existing send paths and auth model are unchanged; the
functions only *append* a log row.
