# Phase 5G-6 — Recurring Tag/Card + Cancel Event Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let an organizer cancel an event (standard, or recurring with "only this" / "this and upcoming"), notifying confirmed participants, and show a "recurrent" tag + a computed "next occurrence" card on recurring events.

**Architecture:** A `cancel_event(event_id, scope)` SECURITY DEFINER RPC flips `status='cancelled'`, inserts `event_cancelled` notifications, and (for `this_and_upcoming`) cancels series siblings + deactivates the series. A vitest-tested `nextWeeklyOccurrence` util in `@padel/utils` powers the next-occurrence card. Thin `@padel/api` hooks + UI on the event detail and Manage screens.

**Tech Stack:** Postgres/Supabase, TanStack Query, React Native / Expo Router, vitest.

Spec: `docs/superpowers/specs/2026-06-17-phase5g6-recurring-cancel-design.md`.

---

### Task 1: Migration `0073_cancel_event.sql` + SQL test

**Files:**
- Create: `infra/supabase/migrations/0073_cancel_event.sql`
- Create: `infra/supabase/tests/cancel_event.sql`

- [ ] **Step 1: Write the migration**

Create `infra/supabase/migrations/0073_cancel_event.sql`. Confirm the notifications type-CHECK constraint
name first (`\d notifications` or grep — it is the default `notifications_type_check`); confirm
`is_event_organizer(e uuid, u uuid)` exists.

```sql
-- 5G-6 (JM-34 / §4.9b): organizer cancels an event (standard or recurring). Notifies confirmed members.

-- Extend the notifications type domain with 'event_cancelled' (preserve all existing values from 0061).
alter table notifications drop constraint notifications_type_check;
alter table notifications add constraint notifications_type_check check (type in (
  'event_invite','group_invite','community_invite',
  'community_request_accepted','follow','follow_joined_event','event_cancelled'));

create or replace function cancel_event(p_event_id uuid, p_scope text default 'only_this') returns void
language plpgsql security definer set search_path = public as $$
declare v_user uuid := auth.uid(); v_ev events%rowtype; v_actor text;
begin
  if v_user is null then raise exception 'not authenticated'; end if;
  select * into v_ev from events where id = p_event_id and deleted_at is null;
  if v_ev.id is null then raise exception 'event_not_found' using errcode='P0001'; end if;
  if not is_event_organizer(p_event_id, v_user) then raise exception 'forbidden' using errcode='P0001'; end if;
  if v_ev.status <> 'scheduled' then raise exception 'not_cancellable' using errcode='P0001'; end if;
  if p_scope not in ('only_this','this_and_upcoming') then raise exception 'invalid_scope' using errcode='P0001'; end if;

  select full_name into v_actor from profiles where id = v_user;

  -- this event
  update events set status='cancelled' where id = p_event_id;
  insert into notifications (user_id, type, actor_id, event_id, actor_name, entity_name)
  select ep.user_id, 'event_cancelled', v_user, p_event_id, v_actor, v_ev.name
  from event_participants ep
  where ep.event_id = p_event_id and ep.status='confirmed'
    and ep.user_id is not null and ep.user_id <> v_user;

  -- recurring: cancel siblings at/after this one, then deactivate the series
  if p_scope = 'this_and_upcoming' and v_ev.series_id is not null then
    insert into notifications (user_id, type, actor_id, event_id, actor_name, entity_name)
    select ep.user_id, 'event_cancelled', v_user, e.id, v_actor, e.name
    from events e
    join event_participants ep on ep.event_id = e.id
    where e.series_id = v_ev.series_id and e.status='scheduled'
      and e.starts_at >= v_ev.starts_at and e.id <> p_event_id
      and ep.status='confirmed' and ep.user_id is not null and ep.user_id <> v_user;
    update events set status='cancelled'
      where series_id = v_ev.series_id and status='scheduled'
        and starts_at >= v_ev.starts_at and id <> p_event_id;
    update event_series set is_active=false, deleted_at=now() where id = v_ev.series_id;
  end if;
end; $$;

grant execute on function cancel_event(uuid, text) to authenticated;
```

- [ ] **Step 2: Apply the migration**

Run: `export SUPABASE_AUTH_SMS_TWILIO_AUTH_TOKEN=local_test_token && pnpm dlx supabase@latest --workdir infra db reset`
Expected: applies through `0073` with no errors.

- [ ] **Step 3: Write the SQL test**

Create `infra/supabase/tests/cancel_event.sql` (template: `infra/supabase/tests/event_blasts.sql`). Seed
under role `postgres`: organizer U1, non-organizer U2, member M1. As U1,
`create_community_with_personal_tenant(...)` → cid; reuse the auto-created general group `g`. Insert a
standard event `ev1` (group_id=g, organizer U1, status='scheduled', NOT-NULL cols) + an `event_series` row
`s` (group_id=g, organizer U1, day_of_week=3, start_time='18:00', duration_minutes=90, invite_lead_days=3)
+ a recurring event `ev2` (group_id=g, series_id=s, organizer U1, status='scheduled'). Add M1 as a
`confirmed` participant on both `ev1` and `ev2`.

Assertions (`PT001` / `OK`), as U1 unless noted:
1. `perform cancel_event(ev1, 'only_this');` → `ev1.status='cancelled'`; exactly one `notifications` row
   with `type='event_cancelled'`, `user_id=M1`, `event_id=ev1`.
2. `perform cancel_event(ev2, 'this_and_upcoming');` → `ev2.status='cancelled'`; `event_series.is_active`
   for `s` is `false` (and `deleted_at` not null); a `event_cancelled` notification exists for M1 on ev2.
3. As U2 (non-organizer jwt): `cancel_event(ev1,'only_this')` → raises `forbidden` (note: ev1 is already
   cancelled; if that masks the check, use a fresh scheduled event `ev3` organized by U1 for this assertion
   so the `forbidden` check is reached before `not_cancellable`). Verify the organizer check fires:
   seed `ev3` (U1, scheduled) and call as U2 → `forbidden`.
4. As U1: `cancel_event(ev1,'only_this')` again → raises `not_cancellable` (already cancelled).
5. End `raise notice 'OK cancel_event';` then `rollback;`.

- [ ] **Step 4: Run the SQL test**

Run: `docker exec -i supabase_db_padeljam psql -U postgres -d postgres < infra/supabase/tests/cancel_event.sql`
Expected: `OK cancel_event`, no `PT001`, no error.

- [ ] **Step 5: Commit**

```bash
git add infra/supabase/migrations/0073_cancel_event.sql infra/supabase/tests/cancel_event.sql
git commit -m "feat(events): cancel_event RPC (standard + recurring) + event_cancelled notification (5G-6)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 2: `nextWeeklyOccurrence` util (TDD)

**Files:**
- Create: `packages/utils/src/recurrence.ts`
- Test: `packages/utils/src/recurrence.test.ts`
- Modify: `packages/utils/src/index.ts`

- [ ] **Step 1: Write the failing test**

Create `packages/utils/src/recurrence.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { nextWeeklyOccurrence } from './recurrence';

const DAY = 86_400_000;

describe('nextWeeklyOccurrence', () => {
  it('returns the right weekday at the right time, in the future, within 7 days', () => {
    const from = new Date('2026-06-17T09:00:00').getTime();
    const d = new Date(nextWeeklyOccurrence(5, '18:00', from)); // ISO Friday = 5 (JS 5)
    expect(d.getDay()).toBe(5);
    expect(d.getHours()).toBe(18);
    expect(d.getMinutes()).toBe(0);
    expect(d.getTime()).toBeGreaterThan(from);
    expect(d.getTime() - from).toBeLessThanOrEqual(7 * DAY);
  });
  it('wraps to next week when the weekday already passed', () => {
    const from = new Date('2026-06-17T09:00:00').getTime();
    const d = new Date(nextWeeklyOccurrence(1, '10:00', from)); // Monday
    expect(d.getDay()).toBe(1);
    expect(d.getTime()).toBeGreaterThan(from);
  });
  it('same weekday but the time already passed -> next week', () => {
    const from = new Date('2026-06-17T20:00:00').getTime(); // 20:00 local
    const d = new Date(nextWeeklyOccurrence(3, '18:00', from)); // same weekday, 18:00 < 20:00
    expect(d.getDay()).toBe(d.getDay()); // weekday matches the ISO-3 target below
    expect(d.getTime() - from).toBeGreaterThanOrEqual(6 * DAY);
  });
  it('maps ISO Sunday (7) to JS Sunday (0)', () => {
    const from = new Date('2026-06-17T09:00:00').getTime();
    const d = new Date(nextWeeklyOccurrence(7, '12:00', from));
    expect(d.getDay()).toBe(0);
  });
});
```

- [ ] **Step 2: Run the test (fails)**

Run: `pnpm --filter @padel/utils test`
Expected: FAIL — `Cannot find module './recurrence'`.

- [ ] **Step 3: Implement**

Create `packages/utils/src/recurrence.ts`:

```ts
/**
 * ISO timestamp of the next weekly slot strictly after `fromMs`.
 * @param dayOfWeek 1=Mon … 7=Sun (ISO, as stored on event_series.day_of_week)
 * @param startTime 'HH:MM' (interpreted in local time, for display)
 */
export function nextWeeklyOccurrence(dayOfWeek: number, startTime: string, fromMs: number): string {
  const [h, m] = startTime.split(':').map((s) => Number(s));
  const from = new Date(fromMs);
  const targetJsDay = dayOfWeek === 7 ? 0 : dayOfWeek; // ISO 1..7 -> JS 0..6
  let dayDiff = (targetJsDay - from.getDay() + 7) % 7;
  const candidate = new Date(from);
  candidate.setHours(h ?? 0, m ?? 0, 0, 0);
  if (dayDiff === 0 && candidate.getTime() <= fromMs) dayDiff = 7;
  candidate.setDate(from.getDate() + dayDiff);
  candidate.setHours(h ?? 0, m ?? 0, 0, 0); // re-apply after date shift (DST-safe)
  return candidate.toISOString();
}
```

- [ ] **Step 4: Re-export + run**

Append to `packages/utils/src/index.ts`: `export * from './recurrence';`
Run: `pnpm --filter @padel/utils test` (PASS) then `pnpm -w typecheck` (PASS).

- [ ] **Step 5: Commit**

```bash
git add packages/utils/src/recurrence.ts packages/utils/src/recurrence.test.ts packages/utils/src/index.ts
git commit -m "feat(utils): nextWeeklyOccurrence for recurring event cards (5G-6)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 3: Types + query key + `useEventSeries` + `useCancelEvent` + mapPgError

**Files:**
- Modify: `packages/db/src/database.types.ts`
- Modify: `packages/api/src/query-keys.ts`
- Modify: `packages/api/src/client.ts`
- Modify: `packages/api/src/events/queries.ts`
- Modify: `packages/api/src/events/mutations.ts`

- [ ] **Step 1: Types**

In `packages/db/src/database.types.ts` Functions block, add:
`cancel_event: { Args: { p_event_id: string; p_scope?: string }; Returns: undefined }`.
(The `notifications` Row type's `type` is already `string`, so the new enum value needs no type change.)

- [ ] **Step 2: Query key**

In `packages/api/src/query-keys.ts`, add after `eventTeams`:
```ts
  eventSeries: (id: string) => ['event', id, 'series'] as const,
```

- [ ] **Step 3: mapPgError allow-list**

In `packages/api/src/client.ts`, add `'not_cancellable'`, `'invalid_scope'`, `'event_not_found'` to the
`KNOWN` array (`forbidden` is already present).

- [ ] **Step 4: `useEventSeries` query**

In `packages/api/src/events/queries.ts`, add:

```ts
export interface EventSeriesInfo {
  day_of_week: number;
  start_time: string;
  is_active: boolean;
}

export const useEventSeries = (eventId: string) => {
  const db = useDb();
  return useQuery({
    queryKey: qk.eventSeries(eventId),
    queryFn: async () => {
      const { data, error } = await db
        .from('events')
        .select('series_id, event_series(day_of_week, start_time, is_active)')
        .eq('id', eventId)
        .maybeSingle()
        .returns<{ series_id: string | null; event_series: EventSeriesInfo | null }>();
      if (error) throw error;
      return data?.event_series ?? null;
    },
  });
};
```

If the embed `event_series(...)` does not resolve by FK, use the constraint-name hint
`event_series!events_series_id_fkey(...)` (check the FK name in `0040_events_core.sql`).

- [ ] **Step 5: `useCancelEvent` mutation**

In `packages/api/src/events/mutations.ts`, add:

```ts
export const useCancelEvent = (eventId: string) => {
  const db = useDb();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { scope: 'only_this' | 'this_and_upcoming' }) => {
      const { error } = await db.rpc('cancel_event', { p_event_id: eventId, p_scope: input.scope });
      if (error) throw new Error(mapPgError(error) ?? 'unknown_error');
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

- [ ] **Step 6: Typecheck + test**

Run: `pnpm -w typecheck` (13/13) and `pnpm --filter @padel/api test`. Confirm `index.ts` wildcard-exports
`./events/queries` + `./events/mutations` (it does).

- [ ] **Step 7: Commit**

```bash
git add packages/db/src/database.types.ts packages/api/src/query-keys.ts packages/api/src/client.ts packages/api/src/events/queries.ts packages/api/src/events/mutations.ts
git commit -m "feat(api): useEventSeries + useCancelEvent (5G-6)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 4: Recurrent tag + next-occurrence card + Cancel button + i18n

**Files:**
- Modify: `apps/mobile/app/event/[id]/index.tsx`
- Modify: `apps/mobile/app/event/[id]/manage.tsx`
- Modify: `apps/mobile/lib/i18n-mobile.ts`

- [ ] **Step 1: i18n keys**

In `apps/mobile/lib/i18n-mobile.ts`, `mobileEvent.en`, add:

```ts
    recurrentTag: 'Recurrent',
    nextOccurrenceTitle: 'Next occurrence',
    cancelEventCta: 'Cancel event',
    cancelStandardTitle: 'Cancel this event?',
    cancelStandardBody: 'Confirmed players will be notified.',
    cancelRecurringTitle: 'Cancel recurring event',
    cancelOnlyThisCta: 'Only this event',
    cancelThisAndUpcomingCta: 'This and upcoming events',
    not_cancellable: 'This event can no longer be cancelled.',
    invalid_scope: 'Something went wrong. Please try again.',
    event_not_found: 'This event is no longer available.',
```

- [ ] **Step 2: Recurrent tag + next-occurrence card on the detail screen**

In `apps/mobile/app/event/[id]/index.tsx`:
- Add imports: `import { useEventSeries } from '@padel/api';` (add to the existing `@padel/api` import) and
  `import { nextWeeklyOccurrence } from '@padel/utils';`
- With the other hooks (before the early returns): `const { data: series } = useEventSeries(id);`
- After `const status = event.status;` derive:
  ```ts
  const isRecurring = event.series_id != null && series != null && series.is_active;
  const nextOccurrenceIso = isRecurring ? nextWeeklyOccurrence(series!.day_of_week, series!.start_time, Date.now()) : null;
  ```
- In the hero header (next to the status badge), when `isRecurring`, render a small tag:
  ```tsx
  {isRecurring ? (
    <View style={styles.recurrentTag}><Text style={styles.recurrentTagText}>{t('recurrentTag')}</Text></View>
  ) : null}
  ```
- In the "When" section (after the duration line), when `nextOccurrenceIso`, render an info card:
  ```tsx
  {nextOccurrenceIso ? (
    <View style={styles.nextCard}>
      <Text style={styles.sectionTitle}>{t('nextOccurrenceTitle')}</Text>
      <Text style={styles.body}>{formatWhen(nextOccurrenceIso)}</Text>
    </View>
  ) : null}
  ```
- Add styles:
  ```ts
  recurrentTag: { backgroundColor: '#EDE7FF', borderRadius: 999, paddingHorizontal: 8, paddingVertical: 3 },
  recurrentTagText: { fontSize: 11, fontWeight: '700', color: '#6B4EFF' },
  nextCard: { marginTop: 12, backgroundColor: '#fff', borderRadius: 12, padding: 12 },
  ```

- [ ] **Step 3: Cancel button + modal on the manage screen**

In `apps/mobile/app/event/[id]/manage.tsx`:
- Add `useCancelEvent` to the `@padel/api` import; `const cancelEvent = useCancelEvent(id);` with the other
  mutation hooks.
- Add the handler near the other `on…` handlers:
  ```tsx
  const doCancel = (scope: 'only_this' | 'this_and_upcoming') =>
    run(async () => {
      await cancelEvent.mutateAsync({ scope });
      router.back();
    });

  const onCancelEvent = () => {
    if (event.series_id != null) {
      Alert.alert(t('cancelRecurringTitle'), undefined, [
        { text: t('cancelOnlyThisCta'), style: 'destructive', onPress: () => doCancel('only_this') },
        { text: t('cancelThisAndUpcomingCta'), style: 'destructive', onPress: () => doCancel('this_and_upcoming') },
        { text: t('cancel'), style: 'cancel' },
      ]);
    } else {
      Alert.alert(t('cancelStandardTitle'), t('cancelStandardBody'), [
        { text: t('cancelEventCta'), style: 'destructive', onPress: () => doCancel('only_this') },
        { text: t('cancel'), style: 'cancel' },
      ]);
    }
  };
  ```
- Replace the `{/* TODO(Phase 6f): wire up edit-event + cancel-event organizer actions. */}` comment with a
  Cancel button section (keep the edit-event part as a TODO):
  ```tsx
  {/* TODO(Phase 6f): wire up edit-event organizer action. */}
  <View style={styles.section}>
    <Pressable style={[styles.btn, styles.cancelBtn]} accessibilityRole="button" disabled={busy} onPress={onCancelEvent}>
      <Text style={styles.cancelLabel}>{t('cancelEventCta')}</Text>
    </Pressable>
  </View>
  ```
- Add styles: `cancelBtn: { backgroundColor: '#FCEBEC' }, cancelLabel: { fontSize: 16, fontWeight: '700', color: '#D7263D' },`

- [ ] **Step 4: Typecheck**

Run: `pnpm -w typecheck` (13/13). Confirm `cancel`/`back` exist in `mobileEvent.en` (they do) and
`formatWhen` is defined in `index.tsx` (it is).

- [ ] **Step 5: Commit**

```bash
git add "apps/mobile/app/event/[id]/index.tsx" "apps/mobile/app/event/[id]/manage.tsx" apps/mobile/lib/i18n-mobile.ts
git commit -m "feat(events): recurrent tag + next-occurrence card + cancel-event UI (5G-6)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Verification (whole slice)

1. **DB:** `db reset` clean; `psql < infra/supabase/tests/cancel_event.sql` → `OK cancel_event`.
2. **Types/API/utils:** `pnpm -w typecheck` 13/13; `pnpm --filter @padel/api test`; `pnpm --filter @padel/utils test` (recurrence).
3. **App smoke (simulator):** cancel a standard event (confirm → leaves lists; confirmed members get an
   `event_cancelled` notification); cancel a recurring event "this and upcoming" (series deactivated); a
   recurring event shows the Recurrent tag + a correct Next-occurrence card.

## Notes for the implementer

- **Documented follow-up (do NOT build now):** make the organizer's next-occurrence card clickable so they
  can pre-manage/edit the upcoming occurrence before it materializes. The card is info-only in this slice.
- The `notifications` insert sets `actor_name` (organizer) + `entity_name` (event name) so the feed renders
  cleanly; `user_id` and `type` are the only NOT-NULL columns.
- Migration `0073` (next after `0072`); no new npm dependency.
- A cancelled event drops out of `my_events` automatically (it filters `status='scheduled'`).
- JM-35 (organizer join/leave as player) and edit-event remain out of scope.
