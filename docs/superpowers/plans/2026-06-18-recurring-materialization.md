# Recurring Occurrence Materialization (A1) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a series organizer tap the next-occurrence card to materialize the next weekly recurring event into a real `scheduled` event (copying config + previous invitations as pending) and land on its Manage screen.

**Architecture:** One additive migration adds a partial unique idempotency index and a `materialize_occurrence(p_after_event_id)` SECURITY DEFINER RPC that copies the source event's config to a new occurrence at `starts_at + 7 days`, clones its invitations as `pending`, and is idempotent (returns the existing row if the slot is already materialized). A thin `@padel/api` mutation wraps the RPC; the event detail screen makes the organizer's next-occurrence card pressable.

**Tech Stack:** Supabase Postgres (plpgsql RPC, RLS-bypassing SECURITY DEFINER), `@padel/api` (TanStack Query hook), Expo Router / React Native, hand-edited `database.types.ts`.

**Spec:** [docs/superpowers/specs/2026-06-18-recurring-materialization-design.md](specs/2026-06-18-recurring-materialization-design.md)

---

## File Structure

| File | Responsibility |
|---|---|
| `infra/supabase/migrations/0079_materialize_occurrence.sql` | Partial unique index + `materialize_occurrence` RPC + grant |
| `infra/supabase/tests/materialize_occurrence.sql` | SQL test: materialize, idempotent re-call, forbidden, series_inactive |
| `packages/db/src/database.types.ts` | Hand-add `materialize_occurrence` to `Functions` |
| `packages/api/src/client.ts` | Add `series_inactive` to `mapPgError` KNOWN list |
| `packages/api/src/events/mutations.ts` | `useMaterializeOccurrence(eventId)` hook |
| `packages/api/src/index.ts` | Re-export the new hook (if hooks are individually re-exported) |
| `apps/mobile/app/event/[id]/index.tsx` | Compute card slot from event `starts_at`; make card pressable for organizer |
| `apps/mobile/lib/i18n-mobile.ts` | New `event` namespace keys (English-only) |

**Copyable `events` columns** (verified against [0040_events_core.sql:16-55](../../../infra/supabase/migrations/0040_events_core.sql) + [0066_events_geo.sql](../../../infra/supabase/migrations/0066_events_geo.sql)): `group_id, series_id, organizer_id, event_type, specification, scoring_mode, scoring_value, venue_id, manual_location_name, manual_location_address, has_location, num_courts, duration_minutes, allow_standby, standby_spots, is_private, entrance_fee_enabled, entrance_fee_amount, entrance_fee_method, entrance_fee_mba_number, players_submit_results, organizer_role, name, description, thumbnail_path, counts_for_ranking, location_point, location_text`. **Set** `starts_at = source + 7 days`, `status = 'scheduled'`. **Never copy** `id, finished_early, finish_message, published_at, created_at, updated_at, deleted_at` (lifecycle/result columns — left at defaults).

---

## Task 1: Migration `0079` — idempotency index + `materialize_occurrence` RPC

**Files:**
- Create: `infra/supabase/migrations/0079_materialize_occurrence.sql`

- [ ] **Step 1: Write the migration**

```sql
-- A1: materialize the next weekly recurring occurrence into a real scheduled event.
-- Organizer-only; copies the source event's config + invitations (as pending); idempotent.
-- A weekly series is exactly 7 days apart, so the next occurrence = source.starts_at + 7 days.

-- Idempotency guard: one materialized event per (series, slot). Backstops concurrent taps.
create unique index if not exists events_series_slot_uniq
  on events (series_id, starts_at)
  where series_id is not null and deleted_at is null;

create or replace function materialize_occurrence(p_after_event_id uuid) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_user uuid := auth.uid();
  v_src  events%rowtype;
  v_s    event_series%rowtype;
  v_target timestamptz;
  v_existing uuid;
  v_new uuid;
begin
  if v_user is null then raise exception 'not authenticated'; end if;

  select * into v_src from events where id = p_after_event_id and deleted_at is null;
  if v_src.id is null then raise exception 'event_not_found' using errcode='P0001'; end if;
  if v_src.series_id is null then raise exception 'event_not_found' using errcode='P0001'; end if;

  select * into v_s from event_series where id = v_src.series_id;
  if v_s.id is null then raise exception 'event_not_found' using errcode='P0001'; end if;
  if v_s.organizer_id <> v_user then raise exception 'forbidden' using errcode='P0001'; end if;
  if not v_s.is_active or v_s.deleted_at is not null then
    raise exception 'series_inactive' using errcode='P0001';
  end if;

  v_target := v_src.starts_at + interval '7 days';

  -- Idempotent open: if the slot already exists, return it instead of inserting.
  select id into v_existing from events
   where series_id = v_src.series_id and starts_at = v_target and deleted_at is null;
  if v_existing is not null then return v_existing; end if;

  insert into events (
    group_id, series_id, organizer_id, event_type, specification, scoring_mode, scoring_value,
    venue_id, manual_location_name, manual_location_address, has_location, num_courts,
    starts_at, duration_minutes, allow_standby, standby_spots, is_private,
    entrance_fee_enabled, entrance_fee_amount, entrance_fee_method, entrance_fee_mba_number,
    players_submit_results, organizer_role, name, description, thumbnail_path,
    status, counts_for_ranking, location_point, location_text
  )
  select
    group_id, series_id, organizer_id, event_type, specification, scoring_mode, scoring_value,
    venue_id, manual_location_name, manual_location_address, has_location, num_courts,
    v_target, duration_minutes, allow_standby, standby_spots, is_private,
    entrance_fee_enabled, entrance_fee_amount, entrance_fee_method, entrance_fee_mba_number,
    players_submit_results, organizer_role, name, description, thumbnail_path,
    'scheduled', counts_for_ranking, location_point, location_text
  from events where id = p_after_event_id
  returning id into v_new;

  -- Copy invitations only (as fresh pending); confirmed participants are NOT copied.
  insert into event_invitations (event_id, invitee_id, invitee_name, invitee_email, invitee_phone,
                                 status, invited_by, invited_at)
  select v_new, invitee_id, invitee_name, invitee_email, invitee_phone,
         'pending', v_user, now()
  from event_invitations where event_id = p_after_event_id;

  return v_new;
end; $$;

grant execute on function materialize_occurrence(uuid) to authenticated;
```

- [ ] **Step 2: Apply the migration**

Run: `export SUPABASE_AUTH_SMS_TWILIO_AUTH_TOKEN=local_test_token && pnpm dlx supabase@latest --workdir infra db reset`
Expected: completes with no errors; all migrations through `0079` applied.

- [ ] **Step 3: Commit**

```bash
git add infra/supabase/migrations/0079_materialize_occurrence.sql
git commit -m "feat(events): materialize_occurrence RPC + idempotency index (A1)"
```

---

## Task 2: SQL test `materialize_occurrence.sql`

**Files:**
- Create: `infra/supabase/tests/materialize_occurrence.sql`

Mirror the fixture style of [infra/supabase/tests/cancel_event.sql](../../../infra/supabase/tests/cancel_event.sql) (`begin; … rollback;`, seed `auth.users`+`profiles`, `set_config` role/jwt, `errcode='PT001'` sentinel, `raise notice 'OK …'`).

- [ ] **Step 1: Write the failing test**

```sql
-- A1: materialize_occurrence RPC — organizer materializes the next weekly occurrence.
-- Verifies: new scheduled event at +7d with copied config + invitations cloned as pending +
-- zero participants; idempotent re-call returns the same id; forbidden / series_inactive guards.
-- 'PT001' = "expected behaviour did not hold" sentinel.
begin;
insert into auth.users (id, instance_id, aud, role, email) values
  ('a0000001-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000000','authenticated','authenticated','mat-u1@x.com'),
  ('a0000002-0000-0000-0000-000000000002','00000000-0000-0000-0000-000000000000','authenticated','authenticated','mat-u2@x.com'),
  ('a0000003-0000-0000-0000-000000000003','00000000-0000-0000-0000-000000000000','authenticated','authenticated','mat-i1@x.com') on conflict do nothing;
insert into profiles (id, email, phone, full_name) values
  ('a0000001-0000-0000-0000-000000000001','mat-u1@x.com','+351900600001','MatOrganizer'),
  ('a0000002-0000-0000-0000-000000000002','mat-u2@x.com','+351900600002','MatNonOrganizer'),
  ('a0000003-0000-0000-0000-000000000003','mat-i1@x.com','+351900600003','MatInvitee') on conflict do nothing;

do $$
declare
  u1  uuid := 'a0000001-0000-0000-0000-000000000001';
  u2  uuid := 'a0000002-0000-0000-0000-000000000002';
  i1  uuid := 'a0000003-0000-0000-0000-000000000003';
  cid uuid;
  g   uuid;
  s   uuid;
  s2  uuid;
  ev  uuid;   -- recurring source event in series s
  ev_inactive uuid;  -- recurring source in inactive series s2
  std uuid;   -- standalone (non-series) event
  new1 uuid;
  new2 uuid;
  v_start timestamptz;
  v_name text;
  v_courts int;
  v_status text;
  n_part int;
  n_inv int;
  inv_status text;
begin
  -- ---- As U1: create community (owner) ----
  perform set_config('role','authenticated',true);
  perform set_config('request.jwt.claims','{"sub":"a0000001-0000-0000-0000-000000000001","role":"authenticated"}',true);
  cid := create_community_with_personal_tenant('MatC','club','PT','public');

  -- ---- Seed series + events + invitation under role postgres (fixture) ----
  perform set_config('role','postgres',true);
  select id into g from groups where community_id = cid order by created_at limit 1;

  insert into event_series (group_id, organizer_id, day_of_week, start_time, duration_minutes, invite_lead_days)
  values (g, u1, 3, '18:00', 90, 3) returning id into s;

  insert into events (
    group_id, series_id, organizer_id, event_type, specification, scoring_mode,
    num_courts, starts_at, duration_minutes, organizer_role, name, status, is_private
  ) values (
    g, s, u1, 'americano', 'classic', 'points',
    2, now() + interval '2 day', 90, 'organizing_and_playing', 'MatEv', 'scheduled', false
  ) returning id into ev;

  -- one invitation + one confirmed participant on the source (only the invitation should copy)
  insert into event_invitations (event_id, invitee_id, status, invited_by)
    values (ev, i1, 'pending', u1);
  insert into event_participants (event_id, user_id, status) values (ev, i1, 'confirmed');

  -- inactive series + its source event (for series_inactive check)
  insert into event_series (group_id, organizer_id, day_of_week, start_time, duration_minutes, invite_lead_days, is_active)
  values (g, u1, 4, '19:00', 90, 3, false) returning id into s2;
  insert into events (
    group_id, series_id, organizer_id, event_type, specification, scoring_mode,
    num_courts, starts_at, duration_minutes, organizer_role, name, status, is_private
  ) values (
    g, s2, u1, 'americano', 'classic', 'points',
    1, now() + interval '1 day', 90, 'organizing_and_playing', 'MatInactive', 'scheduled', false
  ) returning id into ev_inactive;

  -- standalone (non-series) event for the event_not_found-guard check
  insert into events (
    group_id, organizer_id, event_type, specification, scoring_mode,
    num_courts, starts_at, duration_minutes, organizer_role, name, status, is_private
  ) values (
    g, u1, 'americano', 'classic', 'points',
    1, now() + interval '1 day', 90, 'organizing_and_playing', 'MatStd', 'scheduled', false
  ) returning id into std;

  -- ============================================================
  -- (1) As U1 (organizer): materialize -> new scheduled event at +7d with copied config.
  -- ============================================================
  perform set_config('role','authenticated',true);
  perform set_config('request.jwt.claims','{"sub":"a0000001-0000-0000-0000-000000000001","role":"authenticated"}',true);
  new1 := materialize_occurrence(ev);

  perform set_config('role','postgres',true);
  select starts_at, name, num_courts, status into v_start, v_name, v_courts, v_status
    from events where id = new1;
  if v_start <> (select starts_at + interval '7 days' from events where id = ev) then
    raise exception using errcode='PT001', message='new occurrence starts_at should be source +7 days';
  end if;
  if v_name <> 'MatEv' or v_courts <> 2 or v_status <> 'scheduled' then
    raise exception using errcode='PT001', message='new occurrence should copy name/num_courts and be scheduled';
  end if;

  -- invitation cloned as pending; participants NOT copied
  select count(*) into n_inv from event_invitations where event_id = new1;
  select status into inv_status from event_invitations where event_id = new1 limit 1;
  select count(*) into n_part from event_participants where event_id = new1;
  if n_inv <> 1 or inv_status <> 'pending' then
    raise exception using errcode='PT001', message='expected 1 cloned pending invitation, got '||n_inv||'/'||coalesce(inv_status,'<null>');
  end if;
  if n_part <> 0 then
    raise exception using errcode='PT001', message='new occurrence should have zero participants, got '||n_part;
  end if;
  raise notice 'OK materialize: +7d, config + invitation copied, roster empty';

  -- ============================================================
  -- (2) Idempotent: a second call returns the same id, no duplicate row.
  -- ============================================================
  perform set_config('role','authenticated',true);
  perform set_config('request.jwt.claims','{"sub":"a0000001-0000-0000-0000-000000000001","role":"authenticated"}',true);
  new2 := materialize_occurrence(ev);
  if new2 <> new1 then
    raise exception using errcode='PT001', message='second call should return the same occurrence id';
  end if;
  perform set_config('role','postgres',true);
  if (select count(*) from events where series_id = s and starts_at = (select starts_at + interval '7 days' from events where id = ev) and deleted_at is null) <> 1 then
    raise exception using errcode='PT001', message='idempotent re-call must not create a duplicate occurrence';
  end if;
  raise notice 'OK idempotent: re-call returns same id, single row';

  -- ============================================================
  -- (3) As U2 (non-organizer) -> forbidden.
  -- ============================================================
  perform set_config('role','authenticated',true);
  perform set_config('request.jwt.claims','{"sub":"a0000002-0000-0000-0000-000000000002","role":"authenticated"}',true);
  begin
    perform materialize_occurrence(ev);
    raise exception using errcode='PT001', message='non-organizer should be forbidden';
  exception
    when sqlstate 'PT001' then raise;
    when others then
      if position('forbidden' in sqlerrm) = 0 then
        raise exception using errcode='PT001', message='wrong error for non-organizer: '||sqlerrm;
      end if;
  end;
  raise notice 'OK non-organizer: forbidden';

  -- ============================================================
  -- (4) Inactive series -> series_inactive.
  -- ============================================================
  perform set_config('role','authenticated',true);
  perform set_config('request.jwt.claims','{"sub":"a0000001-0000-0000-0000-000000000001","role":"authenticated"}',true);
  begin
    perform materialize_occurrence(ev_inactive);
    raise exception using errcode='PT001', message='inactive series should raise series_inactive';
  exception
    when sqlstate 'PT001' then raise;
    when others then
      if position('series_inactive' in sqlerrm) = 0 then
        raise exception using errcode='PT001', message='wrong error for inactive series: '||sqlerrm;
      end if;
  end;
  raise notice 'OK inactive series: series_inactive';

  -- ============================================================
  -- (5) Non-series (standalone) event -> event_not_found guard.
  -- ============================================================
  begin
    perform materialize_occurrence(std);
    raise exception using errcode='PT001', message='non-series event should raise event_not_found';
  exception
    when sqlstate 'PT001' then raise;
    when others then
      if position('event_not_found' in sqlerrm) = 0 then
        raise exception using errcode='PT001', message='wrong error for non-series event: '||sqlerrm;
      end if;
  end;
  raise notice 'OK non-series: event_not_found';

  raise notice 'OK materialize_occurrence';
end $$;
rollback;
```

- [ ] **Step 2: Run the test**

Run: `docker exec -i supabase_db_padeljam psql -U postgres -d postgres < infra/supabase/tests/materialize_occurrence.sql`
Expected: prints the `OK …` notices ending in `OK materialize_occurrence`; **no** `PT001` / ERROR.

- [ ] **Step 3: Commit**

```bash
git add infra/supabase/tests/materialize_occurrence.sql
git commit -m "test(events): materialize_occurrence SQL test (A1)"
```

---

## Task 3: `database.types.ts` — add the RPC type

**Files:**
- Modify: `packages/db/src/database.types.ts` (the `Functions` block, alphabetically near `cancel_event` / `match_*`)

- [ ] **Step 1: Add the function type**

Find the `Functions: {` section and add:
```ts
materialize_occurrence: {
  Args: { p_after_event_id: string }
  Returns: string
}
```

- [ ] **Step 2: Typecheck**

Run: `pnpm -w typecheck`
Expected: passes (13/13 projects), no errors.

- [ ] **Step 3: Commit**

```bash
git add packages/db/src/database.types.ts
git commit -m "types(db): add materialize_occurrence RPC (A1)"
```

---

## Task 4: `@padel/api` — `series_inactive` code + `useMaterializeOccurrence` hook

**Files:**
- Modify: `packages/api/src/client.ts` (the `KNOWN` array, [client.ts:6-26](../../../packages/api/src/client.ts))
- Modify: `packages/api/src/events/mutations.ts` (append a new hook; mirror `useCancelEvent` at [mutations.ts:629-644](../../../packages/api/src/events/mutations.ts))
- Modify: `packages/api/src/index.ts` (only if hooks are individually re-exported there)

- [ ] **Step 1: Add `series_inactive` to the KNOWN allow-list**

In `packages/api/src/client.ts`, in the events comment group (the line containing `'recurring_events', 'not_cancellable', …`), add `'series_inactive'`:
```ts
  'recurring_events', 'not_cancellable', 'invalid_scope', 'not_editable', 'standby_below_roster', 'series_inactive',
```
(`forbidden` and `event_not_found` are already present.)

- [ ] **Step 2: Add the hook**

Append to `packages/api/src/events/mutations.ts`:
```ts
export const useMaterializeOccurrence = (eventId: string) => {
  const db = useDb();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const { data, error } = await db.rpc('materialize_occurrence', { p_after_event_id: eventId });
      if (error) throw new Error(mapPgError(error) ?? 'unknown_error');
      return data as string; // new (or existing) occurrence event id
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.event(eventId) });
      qc.invalidateQueries({ queryKey: qk.myEvents('all') });
      qc.invalidateQueries({ queryKey: qk.myEvents('organizing') });
      qc.invalidateQueries({ queryKey: qk.myEvents('going') });
    },
  });
};
```

- [ ] **Step 3: Re-export if needed**

Check `packages/api/src/index.ts`. If event mutation hooks are listed individually (e.g. `export { useCancelEvent } from ...`), add `useMaterializeOccurrence` alongside. If it re-exports `export * from './events/mutations'`, no change needed.

Run: `grep -n "useCancelEvent" packages/api/src/index.ts` — if it returns a line, add the new hook to that same export; otherwise skip.

- [ ] **Step 4: Typecheck + API tests**

Run: `pnpm -w typecheck && pnpm --filter @padel/api test`
Expected: typecheck passes; API test suite passes (20/20).

- [ ] **Step 5: Commit**

```bash
git add packages/api/src/client.ts packages/api/src/events/mutations.ts packages/api/src/index.ts
git commit -m "feat(api): useMaterializeOccurrence + series_inactive code (A1)"
```

---

## Task 5: Mobile — clickable organizer next-occurrence card

**Files:**
- Modify: `apps/mobile/app/event/[id]/index.tsx` (next-occurrence computation [index.tsx:172-176](../../../apps/mobile/app/event/[id]/index.tsx) and card render [index.tsx:543-548](../../../apps/mobile/app/event/[id]/index.tsx))
- Modify: `apps/mobile/lib/i18n-mobile.ts` (the `mobileEvent.en` block)

Context: `isOrganizer = uid != null && uid === event.organizer_id` is already defined at [index.tsx:144](../../../apps/mobile/app/event/[id]/index.tsx). `Pressable` and `router` are already imported in this screen (a `Pressable`-based CTA exists; `router.push(\`/event/${id}/manage\`)` is used at [index.tsx:356](../../../apps/mobile/app/event/[id]/index.tsx)). `useMaterializeOccurrence` comes from `@padel/api`.

- [ ] **Step 1: Compute the card slot from the event's `starts_at` (not `Date.now()`)**

Replace the block at [index.tsx:172-176](../../../apps/mobile/app/event/[id]/index.tsx):
```tsx
  // --- Recurring series (5G-6 + A1): tag + clickable next-occurrence card ---
  const isRecurring = event.series_id != null && series != null && series.is_active;
  const nextOccurrenceIso = isRecurring
    ? nextWeeklyOccurrence(series!.day_of_week, series!.start_time, new Date(event.starts_at).getTime())
    : null;
```

- [ ] **Step 2: Add the materialize hook + handler**

Near the other hooks at the top of the component (after the `series` / `uid` derivations, before the early returns), add:
```tsx
  const materialize = useMaterializeOccurrence(id);
  const onOpenNextOccurrence = async () => {
    try {
      const newId = await materialize.mutateAsync();
      router.push(`/event/${newId}/manage` as Href);
    } catch (e) {
      Alert.alert(t('errorTitle'), t((e as Error).message));
    }
  };
```
(Add the `useMaterializeOccurrence` import to the existing `@padel/api` import line. `Alert` is from `react-native` — add to that import if not already present. `t('errorTitle')` already exists in the `event` namespace; if not, use the literal section title key already used on this screen for error alerts — verify with `grep -n "Alert.alert" apps/mobile/app/event/[id]/index.tsx`.)

- [ ] **Step 3: Make the card pressable for the organizer**

Replace the card render at [index.tsx:543-548](../../../apps/mobile/app/event/[id]/index.tsx):
```tsx
          {nextOccurrenceIso ? (
            isOrganizer ? (
              <Pressable
                style={styles.nextCard}
                onPress={onOpenNextOccurrence}
                disabled={materialize.isPending}
              >
                <Text style={styles.sectionTitle}>{t('nextOccurrenceTitle')}</Text>
                <Text style={styles.body}>{formatWhen(nextOccurrenceIso)}</Text>
                <Text style={styles.bodyMuted}>
                  {materialize.isPending ? t('materializeOccurrenceLoading') : t('materializeOccurrenceHint')}
                </Text>
              </Pressable>
            ) : (
              <View style={styles.nextCard}>
                <Text style={styles.sectionTitle}>{t('nextOccurrenceTitle')}</Text>
                <Text style={styles.body}>{formatWhen(nextOccurrenceIso)}</Text>
              </View>
            )
          ) : null}
```

- [ ] **Step 4: Add the i18n keys (English-only; PT/PT-BR deferred to A5)**

In `apps/mobile/lib/i18n-mobile.ts`, add to the `mobileEvent` English block (near `nextOccurrenceTitle`):
```ts
    materializeOccurrenceHint: 'Tap to set up this occurrence',
    materializeOccurrenceLoading: 'Setting up…',
    series_inactive: 'This recurring series is no longer active.',
```
(`errorTitle` / `event_not_found` / `forbidden` strings already exist in this namespace — confirm with `grep -n "errorTitle\|event_not_found" apps/mobile/lib/i18n-mobile.ts`; add `series_inactive` mapping only.)

- [ ] **Step 5: Typecheck**

Run: `pnpm -w typecheck`
Expected: passes, no errors.

- [ ] **Step 6: App smoke (simulator)**

Reload Metro. As the organizer of a recurring event, open the event detail → tap the **Next occurrence** card → it should navigate to the Manage screen of a new event dated 7 days after the current one, with the previous invitee list showing as pending and an empty confirmed roster. Tap the original card again → opens the same occurrence (no duplicate). View as a non-organizer → the card is read-only (no press).

- [ ] **Step 7: Commit**

```bash
git add apps/mobile/app/event/[id]/index.tsx apps/mobile/lib/i18n-mobile.ts
git commit -m "feat(mobile): clickable organizer next-occurrence card (A1)"
```

---

## Verification (end-to-end)

1. **DB:** `export SUPABASE_AUTH_SMS_TWILIO_AUTH_TOKEN=local_test_token && pnpm dlx supabase@latest --workdir infra db reset` runs clean; `docker exec -i supabase_db_padeljam psql -U postgres -d postgres < infra/supabase/tests/materialize_occurrence.sql` prints `OK materialize_occurrence` with no `PT001`.
2. **Types/API:** `pnpm -w typecheck` (13/13) and `pnpm --filter @padel/api test` (20/20) pass.
3. **App (simulator):** organizer taps the next-occurrence card → lands on Manage of the +7d occurrence; invitations copied as pending, roster empty; re-tap opens the same occurrence (idempotent); non-organizer sees a read-only card.

## Out of scope (this slice)

Rolling-window background materialization; auto-invite at `invite_lead_days` (needs cron); dormancy + discovery exclusion; edit-occurrence "this / this & future" (pairs with A2); PT/PT-BR copy (A5).
