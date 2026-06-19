# Delivery Log + Retry (A4) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Record each blast/push send attempt in a `delivery_log` table, show per-blast delivery status on the blast screen, and let an organizer retry a failed email blast.

**Architecture:** Migration `0082` adds the `delivery_log` table (organizer-read RLS, service-role write) + a `retry_blast` gate RPC. The `send-blast`/`send-push` edge functions append a per-attempt row via a service-role client. `@padel/api` adds a deliveries query + retry mutation; the blast screen renders status badges + a Retry button.

**Tech Stack:** Supabase Postgres (RLS, SECURITY DEFINER RPC), Deno edge functions (service-role writeback), `@padel/api` (TanStack), React Native.

**Spec:** [docs/superpowers/specs/2026-06-19-delivery-log-design.md](specs/2026-06-19-delivery-log-design.md)

**Note:** edge functions (Task 3) are Deno and NOT covered by `pnpm typecheck`; they only run when providers are configured. Their writeback is verified by review, not locally.

---

## File Structure

| File | Responsibility |
|---|---|
| `infra/supabase/migrations/0082_delivery_log.sql` | `delivery_log` table + RLS + `retry_blast` RPC |
| `infra/supabase/tests/delivery_log.sql` | SQL test: RLS, target CHECK, retry_blast gating |
| `packages/db/src/database.types.ts` | `delivery_log` Row/Insert + `retry_blast` |
| `infra/supabase/functions/send-blast/index.ts` | Append an email attempt row (service role) |
| `infra/supabase/functions/send-push/index.ts` | Append a push attempt row (service role) |
| `packages/api/src/query-keys.ts` | `blastDeliveries` key |
| `packages/api/src/events/queries.ts` | `useEventBlastDeliveries` |
| `packages/api/src/events/mutations.ts` | `useRetryBlast` |
| `packages/api/src/client.ts` | `not_retryable` in `mapPgError` KNOWN |
| `apps/mobile/app/event/[id]/blast.tsx` | Status badge + Retry button |
| `apps/mobile/lib/i18n-mobile.ts` | English copy |

---

## Task 1: Migration `0082` + types

**Files:**
- Create: `infra/supabase/migrations/0082_delivery_log.sql`
- Modify: `packages/db/src/database.types.ts`

- [ ] **Step 1: Write the migration**

```sql
-- A4: per-attempt delivery log for outbound blasts (email) + push. Service-role writes (edge functions);
-- organizers read their own blast rows. retry_blast is the organizer-gated retry precondition.
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
  constraint delivery_target check (
    (channel = 'email' and blast_id is not null and notification_id is null) or
    (channel = 'push'  and notification_id is not null and blast_id is null))
);
create index delivery_log_blast_idx on delivery_log (blast_id, attempt desc);

alter table delivery_log enable row level security;
-- Organizer-only read of email/blast rows; push rows have no user read policy (service-role only).
create policy "delivery_log: organizer reads blast rows" on delivery_log for select
  using (blast_id is not null and exists (
    select 1 from event_blasts b
    where b.id = delivery_log.blast_id and is_event_organizer(b.event_id, auth.uid())));

-- retry_blast: gate a retry of a failed email blast. The resend itself reuses the send-blast invocation.
create or replace function retry_blast(p_blast_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare v_user uuid := auth.uid(); v_event uuid; v_channels text[]; v_status text;
begin
  if v_user is null then raise exception 'not authenticated'; end if;
  select event_id, channels into v_event, v_channels from event_blasts where id = p_blast_id;
  if v_event is null then raise exception 'event_not_found' using errcode='P0001'; end if;
  if not is_event_organizer(v_event, v_user) then raise exception 'forbidden' using errcode='P0001'; end if;
  if not ('email' = any(v_channels)) then raise exception 'not_retryable' using errcode='P0001'; end if;
  select status into v_status from delivery_log
    where blast_id = p_blast_id order by attempt desc limit 1;
  if v_status is null or v_status <> 'failed' then
    raise exception 'not_retryable' using errcode='P0001';
  end if;
end; $$;

grant execute on function retry_blast(uuid) to authenticated;
```

- [ ] **Step 2: Apply**

Run: `export SUPABASE_AUTH_SMS_TWILIO_AUTH_TOKEN=local_test_token && pnpm dlx supabase@latest --workdir infra db reset`
Expected: clean through `0082`. (Verify `is_event_organizer(uuid, uuid)` is the correct helper signature — it's used by `event_activity` RLS in 0070; if the arg order differs, match the existing usage.)

- [ ] **Step 3: Add `database.types.ts` types**

In `packages/db/src/database.types.ts`, add a `delivery_log` entry to `Tables` (mirror an existing simple table's Row/Insert/Update shape in this file):
```ts
delivery_log: {
  Row: { id: string; channel: string; blast_id: string | null; notification_id: string | null;
         status: string; attempt: number; sent_count: number; failed_count: number;
         error: string | null; created_at: string }
  Insert: { id?: string; channel: string; blast_id?: string | null; notification_id?: string | null;
            status: string; attempt?: number; sent_count?: number; failed_count?: number;
            error?: string | null; created_at?: string }
  Update: { id?: string; channel?: string; blast_id?: string | null; notification_id?: string | null;
            status?: string; attempt?: number; sent_count?: number; failed_count?: number;
            error?: string | null; created_at?: string }
  Relationships: []
}
```
And add to `Functions`:
```ts
retry_blast: { Args: { p_blast_id: string }; Returns: undefined }
```

- [ ] **Step 4: Typecheck + commit**

Run: `pnpm -w typecheck` → 13/13.
```bash
git add infra/supabase/migrations/0082_delivery_log.sql packages/db/src/database.types.ts
git commit -m "feat(events): delivery_log table + retry_blast RPC + types (A4)"
```

---

## Task 2: SQL test `delivery_log.sql`

**Files:**
- Create: `infra/supabase/tests/delivery_log.sql`

Follow [infra/supabase/tests/activity_logging.sql](../../../infra/supabase/tests/activity_logging.sql) style.

- [ ] **Step 1: Write the test**

```sql
-- A4: delivery_log RLS + target CHECK + retry_blast gating.
-- 'PT001' = "expected behaviour did not hold" sentinel.
begin;
insert into auth.users (id, instance_id, aud, role, email) values
  ('d0000001-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000000','authenticated','authenticated','dl-u1@x.com'),
  ('d0000002-0000-0000-0000-000000000002','00000000-0000-0000-0000-000000000000','authenticated','authenticated','dl-u2@x.com') on conflict do nothing;
insert into profiles (id, email, phone, full_name) values
  ('d0000001-0000-0000-0000-000000000001','dl-u1@x.com','+351900900001','DlOrganizer'),
  ('d0000002-0000-0000-0000-000000000002','dl-u2@x.com','+351900900002','DlOther') on conflict do nothing;

do $$
declare
  u1  uuid := 'd0000001-0000-0000-0000-000000000001';
  u2  uuid := 'd0000002-0000-0000-0000-000000000002';
  cid uuid;
  g   uuid;
  ev  uuid;
  bl  uuid;
  dl  uuid;
  n   int;
begin
  perform set_config('role','authenticated',true);
  perform set_config('request.jwt.claims','{"sub":"d0000001-0000-0000-0000-000000000001","role":"authenticated"}',true);
  cid := create_community_with_personal_tenant('DlC','club','PT','public');

  perform set_config('role','postgres',true);
  select id into g from groups where community_id = cid order by created_at limit 1;
  insert into events (group_id, organizer_id, event_type, specification, scoring_mode, num_courts,
    starts_at, duration_minutes, organizer_role, name, status, is_private)
  values (g, u1, 'americano','classic','points',1, now()+interval '2 day',90,'organizing_only','DlEv','scheduled',false)
  returning id into ev;
  insert into event_blasts (event_id, sender_id, title, description, channels, send_to, sent_to_count)
  values (ev, u1, 'Blast','body', array['email'], 'all_members', 3) returning id into bl;

  -- target CHECK: an email row with no blast_id (no target at all) must be rejected (no FK noise).
  begin
    insert into delivery_log (channel, status) values ('email', 'sent');
    raise exception using errcode='PT001', message='delivery_target CHECK should reject email row without blast_id';
  exception
    when check_violation then null;  -- expected
  end;
  raise notice 'OK target CHECK rejects malformed row';

  -- seed a FAILED email attempt for the blast.
  insert into delivery_log (channel, blast_id, status, attempt, failed_count, error)
    values ('email', bl, 'failed', 1, 3, 'resend_failed:500') returning id into dl;

  -- RLS: organizer u1 can read the row.
  perform set_config('role','authenticated',true);
  perform set_config('request.jwt.claims','{"sub":"d0000001-0000-0000-0000-000000000001","role":"authenticated"}',true);
  select count(*) into n from delivery_log where blast_id = bl;
  if n <> 1 then raise exception using errcode='PT001', message='organizer should read 1 delivery row, got '||n; end if;

  -- RLS: non-organizer u2 cannot read it.
  perform set_config('request.jwt.claims','{"sub":"d0000002-0000-0000-0000-000000000002","role":"authenticated"}',true);
  select count(*) into n from delivery_log where blast_id = bl;
  if n <> 0 then raise exception using errcode='PT001', message='non-organizer must not read delivery rows, got '||n; end if;
  raise notice 'OK RLS: organizer reads, non-organizer blocked';

  -- retry_blast: organizer + latest attempt failed -> succeeds (no error).
  perform set_config('request.jwt.claims','{"sub":"d0000001-0000-0000-0000-000000000001","role":"authenticated"}',true);
  perform retry_blast(bl);
  raise notice 'OK retry_blast allowed when latest attempt failed';

  -- retry_blast: non-organizer -> forbidden.
  perform set_config('request.jwt.claims','{"sub":"d0000002-0000-0000-0000-000000000002","role":"authenticated"}',true);
  begin
    perform retry_blast(bl);
    raise exception using errcode='PT001', message='non-organizer retry should be forbidden';
  exception
    when sqlstate 'PT001' then raise;
    when others then if position('forbidden' in sqlerrm)=0 then
      raise exception using errcode='PT001', message='wrong error for non-organizer retry: '||sqlerrm; end if;
  end;
  raise notice 'OK retry_blast forbidden for non-organizer';

  -- retry_blast: latest attempt 'sent' -> not_retryable.
  perform set_config('role','postgres',true);
  insert into delivery_log (channel, blast_id, status, attempt, sent_count)
    values ('email', bl, 'sent', 2, 3);
  perform set_config('role','authenticated',true);
  perform set_config('request.jwt.claims','{"sub":"d0000001-0000-0000-0000-000000000001","role":"authenticated"}',true);
  begin
    perform retry_blast(bl);
    raise exception using errcode='PT001', message='retry should be not_retryable when latest attempt succeeded';
  exception
    when sqlstate 'PT001' then raise;
    when others then if position('not_retryable' in sqlerrm)=0 then
      raise exception using errcode='PT001', message='wrong error for sent-latest retry: '||sqlerrm; end if;
  end;
  raise notice 'OK retry_blast not_retryable when latest attempt sent';

  raise notice 'OK delivery_log';
end $$;
rollback;
```

- [ ] **Step 2: Run**

Run: `docker exec -i supabase_db_padeljam psql -U postgres -d postgres < infra/supabase/tests/delivery_log.sql`
Expected: `OK …` lines ending in `OK delivery_log`; no `PT001`/`ERROR`. A `PT001` = real bug → STOP & report. Fixture column error → fix fixture only (check `event_blasts` cols in 0072).

- [ ] **Step 3: Commit**

```bash
git add infra/supabase/tests/delivery_log.sql
git commit -m "test(events): delivery_log RLS + retry_blast SQL test (A4)"
```

---

## Task 3: Edge functions — record the attempt (service-role)

**Files:**
- Modify: `infra/supabase/functions/send-blast/index.ts`
- Modify: `infra/supabase/functions/send-push/index.ts`

Both append a `delivery_log` row via a service-role admin client, wrapped in try/catch so logging never breaks the send. (Deno; not in `pnpm typecheck`.)

- [ ] **Step 1: `send-blast` — admin client + logger + calls**

After the existing `const anonKey = ...` line, add the service-role client:
```ts
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const admin = createClient(url, serviceKey);
```
After `body.blast_id` is validated (the `if (!body.blast_id) ...` line), add the logger:
```ts
  async function logEmailDelivery(ok: boolean, sentCount: number, failedCount: number, error: string | null) {
    try {
      const { data } = await admin.from('delivery_log').select('attempt')
        .eq('blast_id', body.blast_id).order('attempt', { ascending: false }).limit(1);
      const attempt = ((data?.[0]?.attempt as number | undefined) ?? 0) + 1;
      await admin.from('delivery_log').insert({
        channel: 'email', blast_id: body.blast_id, attempt,
        status: ok ? 'sent' : 'failed', sent_count: sentCount, failed_count: failedCount, error });
    } catch { /* best-effort */ }
  }
```
Then log at the email terminal paths (do NOT log the `blast_not_found`, no-body, or non-email-channel early returns — those aren't email send attempts):
- The recipient-error return → make it `{ await logEmailDelivery(false, 0, 0, rErr.message); return json({ error: rErr.message }, rErr.message?.includes('forbidden') ? 403 : 400); }`
- The `list.length === 0` return → `{ await logEmailDelivery(true, 0, 0, null); return json({ ok: true, sent: 0 }); }`
- The `catch (e)` (send failure) → before its `return`, add `await logEmailDelivery(false, 0, list.length, e instanceof Error ? e.message : 'send_failed');`
- The final success → before `return json({ ok: true, sent: list.length })`, add `await logEmailDelivery(true, list.length, 0, null);`

- [ ] **Step 2: `send-push` — log after the Expo send**

`send-push` already has `admin`. Replace the push-send loop's terminal handling so each outcome logs (notification_id = `body.notification_id`):
- Add a helper after `const list = ...tokens...` (or inline): on soft-fail inside the loop, before `return json({ ok: false, error: ... }, 200)`, add:
  ```ts
      try { await admin.from('delivery_log').insert({ channel: 'push', notification_id: body.notification_id,
        attempt: 1, status: 'failed', failed_count: messages.length, error: `expo_failed:${res.status}` }); } catch { /* best-effort */ }
  ```
- Before the final `return json({ ok: true, sent: messages.length })`, add:
  ```ts
  try { await admin.from('delivery_log').insert({ channel: 'push', notification_id: body.notification_id,
    attempt: 1, status: 'sent', sent_count: messages.length }); } catch { /* best-effort */ }
  ```
(Do NOT log the `push_off` / `no_tokens` / `notification_not_found` skip paths — no send attempted.)

- [ ] **Step 3: Commit**

(No automated check — Deno functions aren't typechecked; verify by re-reading the diffs for syntax + that the inserts match the `delivery_log` Insert shape.)
```bash
git add infra/supabase/functions/send-blast/index.ts infra/supabase/functions/send-push/index.ts
git commit -m "feat(functions): record delivery_log attempts in send-blast/send-push (A4)"
```

---

## Task 4: `@padel/api` — deliveries query + retry mutation

**Files:**
- Modify: `packages/api/src/query-keys.ts`
- Modify: `packages/api/src/events/queries.ts`
- Modify: `packages/api/src/events/mutations.ts`
- Modify: `packages/api/src/client.ts`

- [ ] **Step 1: Query key**

In `packages/api/src/query-keys.ts`, add after `eventBlasts`:
```ts
  blastDeliveries: (id: string) => ['event', id, 'blast-deliveries'] as const,
```

- [ ] **Step 2: `useEventBlastDeliveries`**

In `packages/api/src/events/queries.ts`, add (returns latest attempt per blast as a record keyed by `blast_id`):
```ts
export interface BlastDelivery {
  status: 'sent' | 'failed';
  attempt: number;
  sent_count: number;
  failed_count: number;
  error: string | null;
}
export const useEventBlastDeliveries = (eventId: string) => {
  const db = useDb();
  return useQuery({
    queryKey: qk.blastDeliveries(eventId),
    queryFn: async () => {
      const { data, error } = await db
        .from('delivery_log')
        .select('blast_id, status, attempt, sent_count, failed_count, error, event_blasts!inner(event_id)')
        .eq('event_blasts.event_id', eventId)
        .order('attempt', { ascending: false });
      if (error) throw error;
      // Rows are attempt-desc; first time we see a blast_id is its latest attempt.
      const latest: Record<string, BlastDelivery> = {};
      for (const r of (data ?? []) as unknown as {
        blast_id: string; status: 'sent' | 'failed'; attempt: number;
        sent_count: number; failed_count: number; error: string | null;
      }[]) {
        if (r.blast_id && !latest[r.blast_id]) {
          latest[r.blast_id] = { status: r.status, attempt: r.attempt,
            sent_count: r.sent_count, failed_count: r.failed_count, error: r.error };
        }
      }
      return latest;
    },
  });
};
```

- [ ] **Step 3: `useRetryBlast`**

In `packages/api/src/events/mutations.ts`, add (mirror `useSendBlast`'s function-invoke pattern):
```ts
export const useRetryBlast = (eventId: string) => {
  const db = useDb();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (blastId: string) => {
      const { error } = await db.rpc('retry_blast', { p_blast_id: blastId });
      if (error) throw new Error(mapPgError(error) ?? 'unknown_error');
      try {
        await db.functions.invoke('send-blast', { body: { blast_id: blastId } });
      } catch { /* delivery is best-effort; the new attempt will be logged by the function */ }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.blastDeliveries(eventId) });
      qc.invalidateQueries({ queryKey: qk.eventBlasts(eventId) });
    },
  });
};
```

- [ ] **Step 4: `mapPgError`**

In `packages/api/src/client.ts`, append `'not_retryable'` to the events line of `KNOWN` (the one with `'series_inactive', 'courts_below_roster'`).

- [ ] **Step 5: Verify + commit**

Run: `pnpm -w typecheck && pnpm --filter @padel/api test` → 13/13 + tests pass.
```bash
git add packages/api/src/query-keys.ts packages/api/src/events/queries.ts packages/api/src/events/mutations.ts packages/api/src/client.ts
git commit -m "feat(api): blast deliveries query + retry mutation (A4)"
```

---

## Task 5: Mobile — status badge + Retry button

**Files:**
- Modify: `apps/mobile/app/event/[id]/blast.tsx`
- Modify: `apps/mobile/lib/i18n-mobile.ts`

- [ ] **Step 1: Wire the hooks**

In `blast.tsx`, add to the `@padel/api` import: `useEventBlastDeliveries`, `useRetryBlast`. After the existing `const sendBlast = useSendBlast(id);`:
```tsx
  const { data: deliveries } = useEventBlastDeliveries(id);
  const retryBlast = useRetryBlast(id);
  const [retrying, setRetrying] = useState<string | null>(null);
```

- [ ] **Step 2: Render badge + Retry inside each past-blast card**

In the past-blasts `.map((b) => ...)` card (after the `<Text style={styles.cardBody}>` line, still inside the `<Pressable>`), add:
```tsx
                {(() => {
                  const d = deliveries?.[b.id];
                  const label = !d ? t('deliveryPending') : d.status === 'sent' ? t('deliveryDelivered') : t('deliveryFailed');
                  return <Text style={styles.cardMeta}>{label}</Text>;
                })()}
                {deliveries?.[b.id]?.status === 'failed' ? (
                  <Pressable
                    style={styles.retryBtn}
                    disabled={retrying === b.id}
                    onPress={() => {
                      setRetrying(b.id);
                      retryBlast.mutateAsync(b.id)
                        .catch((e) => setError(t(e instanceof Error ? e.message : 'unknown_error')))
                        .finally(() => setRetrying(null));
                    }}
                    accessibilityRole="button"
                  >
                    <Text style={styles.retryLabel}>{retrying === b.id ? t('blastSendCta') : t('retryBlastCta')}</Text>
                  </Pressable>
                ) : null}
```
Add styles to the `StyleSheet.create({...})`:
```tsx
  cardMeta: { fontSize: 12, color: '#6B7685', marginTop: 4 },
  retryBtn: { marginTop: 8, alignSelf: 'flex-start', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8, backgroundColor: '#EAF2FF' },
  retryLabel: { color: '#0B7BFF', fontWeight: '700', fontSize: 13 },
```

- [ ] **Step 3: i18n**

In `apps/mobile/lib/i18n-mobile.ts` `event` English block, add:
```ts
    deliveryDelivered: 'Delivered',
    deliveryFailed: 'Delivery failed',
    deliveryPending: 'Pending',
    retryBlastCta: 'Retry',
    not_retryable: "This blast can't be retried.",
```

- [ ] **Step 4: Typecheck + commit**

Run: `pnpm -w typecheck` → 13/13.
```bash
git add apps/mobile/app/event/[id]/blast.tsx apps/mobile/lib/i18n-mobile.ts
git commit -m "feat(mobile): blast delivery status badge + retry (A4)"
```

---

## Verification (end-to-end)

1. **DB:** `db reset` clean through 0082; `delivery_log.sql` → `OK delivery_log`.
2. **Types/API:** `pnpm -w typecheck` (13/13) + `pnpm --filter @padel/api test`.
3. **Edge functions:** reviewed (Deno; provider-gated, not locally runnable) — inserts match the `delivery_log` shape, wrapped best-effort.
4. **App (simulator):** blast screen shows a status badge per past blast (Pending locally with no provider); a blast whose latest attempt is `failed` shows a Retry button that calls `retry_blast` + re-invokes send-blast.

## Out of scope (this slice)

Per-recipient rows; push retry UI / Expo receipts (B5); CSV-email logging; actual Resend/Expo sending (Group C / B5); PT/PT-BR copy (A5).
