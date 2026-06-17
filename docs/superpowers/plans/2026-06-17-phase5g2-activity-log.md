# Phase 5G-2 — Event Activity Log Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Record roster-core changes on an event (joined/left/confirmed/removed/guest-added/marked-paid) and show them on a dedicated, organizer-only Activity log screen reached from the Manage hub.

**Architecture:** A new `event_activity` table (organizer-only read RLS) is written only through a `log_event_activity` SECURITY DEFINER RPC that authorizes organizer-vs-self actions and stamps `actor_id = auth.uid()`. The existing roster RPCs are untouched; instead each wrapping `@padel/api` mutation fires the log RPC best-effort after its action succeeds. A new mobile screen lists the entries.

**Tech Stack:** Postgres/Supabase (migration, RPC, RLS), TanStack Query (`@padel/api`), React Native / Expo Router, i18next.

Spec: `docs/superpowers/specs/2026-06-17-phase5g2-activity-log-design.md`.

---

### Task 1: Migration `0070_event_activity.sql` + SQL test

**Files:**
- Create: `infra/supabase/migrations/0070_event_activity.sql`
- Create: `infra/supabase/tests/event_activity.sql`

- [ ] **Step 1: Write the migration**

Create `infra/supabase/migrations/0070_event_activity.sql`:

```sql
-- JM-40: per-event activity log of roster-core changes. Organizer-only read; writes only via the
-- SECURITY DEFINER log_event_activity RPC (which authorizes organizer-vs-self actions).
create table event_activity (
  id         uuid primary key default gen_random_uuid(),
  event_id   uuid not null references events(id) on delete cascade,
  actor_id   uuid references profiles(id),
  action     text not null,
  detail     jsonb not null default '{}',
  created_at timestamptz not null default now()
);
create index event_activity_event_idx on event_activity(event_id, created_at desc);

alter table event_activity enable row level security;

create policy "activity: read" on event_activity for select
  using (is_event_organizer(event_id, auth.uid()));
-- No insert/update/delete policy: writes go only through log_event_activity (SECURITY DEFINER).

create or replace function log_event_activity(
  p_event_id uuid, p_action text, p_detail jsonb default '{}'
) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_user uuid := auth.uid();
  v_organizer_actions text[] := array[
    'confirmed','removed','guest_added','marked_paid','marked_unpaid','marked_all_paid'];
  v_self_actions text[] := array['joined','left'];
begin
  if v_user is null then raise exception 'not authenticated'; end if;
  if not (p_action = any(v_organizer_actions) or p_action = any(v_self_actions)) then
    raise exception 'invalid_action' using errcode = 'P0001';
  end if;
  if p_action = any(v_organizer_actions) then
    if not is_event_organizer(p_event_id, v_user) then
      raise exception 'forbidden' using errcode = 'P0001';
    end if;
  else
    if not event_is_visible(p_event_id, v_user) then
      raise exception 'forbidden' using errcode = 'P0001';
    end if;
  end if;
  insert into event_activity (event_id, actor_id, action, detail)
  values (p_event_id, v_user, p_action, coalesce(p_detail, '{}'::jsonb));
end; $$;

grant execute on function log_event_activity to authenticated;
```

Before finalizing, confirm the exact signatures of `is_event_organizer` and `event_is_visible` by reading
`infra/supabase/migrations/0044_events_helpers_rls.sql` (both are `(event_id uuid, user uuid)` and used
throughout `0047_roster_rpcs.sql`). Adjust the calls only if the real signatures differ.

- [ ] **Step 2: Apply the migration**

Run: `export SUPABASE_AUTH_SMS_TWILIO_AUTH_TOKEN=local_test_token && pnpm dlx supabase@latest --workdir infra db reset`
Expected: applies through `0070_event_activity.sql` with no errors.

- [ ] **Step 3: Write the SQL test**

Create `infra/supabase/tests/event_activity.sql`. Follow the auth-switching + `PT001` pattern from
`infra/supabase/tests/community_review_gate.sql`. Structure (fill the event's NOT-NULL columns from
`infra/supabase/migrations/0040_events_core.sql`, seeding the event + participants under
`set_config('role','postgres')` exactly as `community_review_gate.sql` does):

1. Seed two `auth.users` + `profiles`: `U1` (organizer) `f0000001-…01`, `U2` (participant) `f0000002-…02`.
2. As `postgres`: insert an `events` row `ev` (`organizer_id = U1`, `status='scheduled'`, all NOT-NULL
   columns) and an `event_participants` row for `U2` (`status='confirmed'`).
3. Assertions (`raise exception using errcode='PT001'` on failure; `raise notice 'OK …'` per check):
   - As `U1`: `perform log_event_activity(ev, 'confirmed', '{"target_name":"U2"}'::jsonb);` then assert
     `select count(*) from event_activity where event_id = ev` = 1.
   - As `U2`: `log_event_activity(ev, 'removed', '{}'::jsonb)` must raise `forbidden` (use the nested
     `begin … exception when sqlstate 'PT001' then raise; when others then if position('forbidden' in
     sqlerrm)=0 then raise PT001 …` pattern).
   - As `U2`: `perform log_event_activity(ev, 'joined', '{}'::jsonb);` succeeds (participant is visible).
   - As `U1`: `log_event_activity(ev, 'bogus', '{}'::jsonb)` must raise `invalid_action`.
   - Read visibility: as `U2`, `select count(*) from event_activity where event_id = ev` = 0 (RLS
     organizer-only); as `U1`, = 2 (the `confirmed` + `joined` rows).
4. End: `raise notice 'OK event_activity';` then `rollback;`.

- [ ] **Step 4: Run the SQL test**

Run: `docker exec -i supabase_db_padeljam psql -U postgres -d postgres < infra/supabase/tests/event_activity.sql`
Expected: prints `OK event_activity`, no `PT001`, no error.

- [ ] **Step 5: Commit**

```bash
git add infra/supabase/migrations/0070_event_activity.sql infra/supabase/tests/event_activity.sql
git commit -m "feat(events): event_activity table + log_event_activity RPC (5G-2)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 2: Types + query key + `useEventActivity`

**Files:**
- Modify: `packages/db/src/database.types.ts`
- Modify: `packages/api/src/query-keys.ts`
- Modify: `packages/api/src/events/queries.ts`

- [ ] **Step 1: Hand-add types**

In `packages/db/src/database.types.ts`:
- Add the `event_activity` table type to the `Tables` block (mirror the shape of an existing simple table
  like `event_courts`/`community_reviews`): `Row { id: string; event_id: string; actor_id: string | null;
  action: string; detail: Json; created_at: string }`, matching `Insert`/`Update`, and Relationships for
  `event_id → events` and `actor_id → profiles`.
- Add to the `Functions` block (alphabetical placement, mirror an existing void RPC):
  ```ts
  log_event_activity: {
    Args: { p_event_id: string; p_action: string; p_detail?: Json }
    Returns: undefined
  }
  ```

- [ ] **Step 2: Add the query key**

In `packages/api/src/query-keys.ts`, after `eventInvitations`:

```ts
  eventActivity: (id: string) => ['event', id, 'activity'] as const,
```

- [ ] **Step 3: Add the query hook**

In `packages/api/src/events/queries.ts`, add (mirror the embed style of `useEventParticipants`):

```ts
export interface ActivityRow {
  id: string;
  action: string;
  detail: { target_name?: string; guest_name?: string; mode?: string; status?: string } | null;
  created_at: string;
  profiles: { full_name: string | null; avatar_url: string | null } | null;
}

export const useEventActivity = (eventId: string) => {
  const db = useDb();
  return useQuery({
    queryKey: qk.eventActivity(eventId),
    queryFn: async () => {
      const { data, error } = await db
        .from('event_activity')
        .select('id, action, detail, created_at, profiles:actor_id (full_name, avatar_url)')
        .eq('event_id', eventId)
        .order('created_at', { ascending: false })
        .returns<ActivityRow[]>();
      if (error) throw error;
      return data ?? [];
    },
  });
};
```

(Confirm `useDb`, `useQuery`, and `qk` are already imported in `queries.ts`; they are used by the other
hooks there.)

- [ ] **Step 4: Verify export**

Confirm `packages/api/src/index.ts` re-exports `./events/queries` (wildcard). If so, `useEventActivity`
and `ActivityRow` are exported automatically — no change. Report which.

- [ ] **Step 5: Typecheck**

Run: `pnpm -w typecheck`
Expected: PASS (13 packages).

- [ ] **Step 6: Commit**

```bash
git add packages/db/src/database.types.ts packages/api/src/query-keys.ts packages/api/src/events/queries.ts
git commit -m "feat(api): useEventActivity query + event_activity types (5G-2)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 3: Best-effort logging in roster mutations

**Files:**
- Modify: `packages/api/src/events/mutations.ts`

- [ ] **Step 1: Add a shared best-effort log helper**

Near the top of `packages/api/src/events/mutations.ts` (after the `Json` type at line 8), add the
helper below. `useDb` is already imported at line 2 — do **not** add another import; the helper just
references its return type for typing.

```ts
/** Fire-and-forget activity log. A logging failure must never fail the user's action. */
async function logActivity(
  db: ReturnType<typeof useDb>,
  eventId: string,
  action: string,
  detail: Record<string, unknown> = {},
) {
  try {
    await db.rpc('log_event_activity', {
      p_event_id: eventId,
      p_action: action,
      p_detail: detail as Json,
    });
  } catch {
    /* best-effort */
  }
}
```

- [ ] **Step 2: `useJoinEvent` — capture status + log `joined`**

Replace the `useJoinEvent` `mutationFn` body (lines 67-70) so it captures `data` and logs:

```ts
    mutationFn: async (input: { eventId: string; groupId: string | null }) => {
      const { data, error } = await db.rpc('join_event', { p_event_id: input.eventId });
      if (error) throw new Error(mapPgError(error) ?? 'unknown_error');
      await logActivity(db, input.eventId, 'joined', { status: data });
    },
```

And add `qc.invalidateQueries({ queryKey: qk.eventActivity(input.eventId) });` to its `onSuccess`.

- [ ] **Step 3: `useLeaveEvent` — log `left`**

In `useLeaveEvent` `mutationFn`, after the error check add:

```ts
      await logActivity(db, input.eventId, 'left');
```

And add `qc.invalidateQueries({ queryKey: qk.eventActivity(input.eventId) });` to its `onSuccess`.

- [ ] **Step 4: `useMarkConfirmed` — accept `targetName`, log `confirmed`**

Replace `useMarkConfirmed` so the mutate input becomes an object and it logs:

```ts
export const useMarkConfirmed = (eventId: string) => {
  const db = useDb();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { participantId: string; targetName?: string }) => {
      const { error } = await db.rpc('organizer_mark_confirmed', {
        p_participant_id: input.participantId,
      });
      if (error) throw new Error(mapPgError(error) ?? 'unknown_error');
      await logActivity(db, eventId, 'confirmed', { target_name: input.targetName });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.eventParticipants(eventId) });
      qc.invalidateQueries({ queryKey: qk.eventActivity(eventId) });
    },
  });
};
```

(Call-site change handled in Task 4: pass `{ participantId, targetName }`.)

- [ ] **Step 5: `useRemoveParticipant` — accept `targetName`, log `removed`**

Add `targetName?: string` to its input type and, after the error check:

```ts
      await logActivity(db, eventId, 'removed', { target_name: input.targetName, mode: input.mode });
```

Add `qc.invalidateQueries({ queryKey: qk.eventActivity(eventId) });` to `onSuccess`.

- [ ] **Step 6: `useAddManualParticipant` — log `guest_added`**

After the error check (before `return data;`):

```ts
      await logActivity(db, eventId, 'guest_added', { guest_name: input.name });
```

Add `qc.invalidateQueries({ queryKey: qk.eventActivity(eventId) });` to `onSuccess`.

- [ ] **Step 7: `useMarkPaid` — accept `targetName`, log `marked_paid`/`marked_unpaid`**

Change its input to `{ participantId: string; paid: boolean; targetName?: string }` and after the error check:

```ts
      await logActivity(db, eventId, input.paid ? 'marked_paid' : 'marked_unpaid', {
        target_name: input.targetName,
      });
```

Add `qc.invalidateQueries({ queryKey: qk.eventActivity(eventId) });` to `onSuccess`.

- [ ] **Step 8: `useMarkAllPaid` — log `marked_all_paid`**

After the error check:

```ts
      await logActivity(db, eventId, 'marked_all_paid');
```

Add `qc.invalidateQueries({ queryKey: qk.eventActivity(eventId) });` to `onSuccess`.

- [ ] **Step 9: Typecheck**

Run: `pnpm -w typecheck`
Expected: PASS. Note: the input-shape changes to `useMarkConfirmed`/`useMarkPaid` will surface type
errors at the manage-screen call sites — those are fixed in Task 4, so a transient mobile typecheck
error here is expected and resolved by Task 4. Run `pnpm --filter @padel/api typecheck` to confirm the
**api package** itself is clean now.

- [ ] **Step 10: Commit**

```bash
git add packages/api/src/events/mutations.ts
git commit -m "feat(api): best-effort activity logging in roster mutations (5G-2)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 4: Activity screen + manage entry + call-site updates + i18n

**Files:**
- Create: `apps/mobile/app/event/[id]/activity.tsx`
- Modify: `apps/mobile/app/event/[id]/manage.tsx`
- Modify: `apps/mobile/lib/i18n-mobile.ts`

- [ ] **Step 1: Add i18n keys**

In `apps/mobile/lib/i18n-mobile.ts`, inside the `mobileEvent.en` block (near the roster keys), add:

```ts
    activityTitle: 'Activity log',
    activityLogCta: 'Activity log',
    activityEmpty: 'No activity yet.',
    activityJoined: '{{actor}} joined',
    activityLeft: '{{actor}} left',
    activityConfirmed: '{{actor}} confirmed {{target}}',
    activityRemoved: '{{actor}} removed {{target}}',
    activityGuestAdded: '{{actor}} added {{target}}',
    activityMarkedPaid: '{{actor}} marked {{target}} as paid',
    activityMarkedUnpaid: '{{actor}} marked {{target}} as unpaid',
    activityMarkedAllPaid: '{{actor}} marked everyone as paid',
```

- [ ] **Step 2: Create the activity screen**

Create `apps/mobile/app/event/[id]/activity.tsx`:

```tsx
import { useEventActivity, type ActivityRow } from '@padel/api';
import { useT } from '@padel/i18n';
import { FlashList } from '@shopify/flash-list';
import { useLocalSearchParams } from 'expo-router';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

/** Map an activity row to a localized one-line sentence. */
function lineFor(t: (k: string, o?: Record<string, unknown>) => string, row: ActivityRow): string {
  const actor = row.profiles?.full_name ?? 'Someone';
  const target = row.detail?.target_name ?? row.detail?.guest_name ?? '—';
  const key: Record<string, string> = {
    joined: 'activityJoined',
    left: 'activityLeft',
    confirmed: 'activityConfirmed',
    removed: 'activityRemoved',
    guest_added: 'activityGuestAdded',
    marked_paid: 'activityMarkedPaid',
    marked_unpaid: 'activityMarkedUnpaid',
    marked_all_paid: 'activityMarkedAllPaid',
  };
  return t(key[row.action] ?? 'activityJoined', { actor, target });
}

/** Relative timestamp like "3h ago" / "2d ago" / "just now". */
function ago(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diffMs / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

export default function EventActivityScreen() {
  const { t } = useT('event');
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data: rows, isLoading } = useEventActivity(id);

  if (isLoading) {
    return (
      <SafeAreaView style={[styles.container, styles.center]} edges={['top']}>
        <ActivityIndicator color="#0B1F3A" />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <Text style={styles.title}>{t('activityTitle')}</Text>
      {(rows ?? []).length === 0 ? (
        <Text style={styles.empty}>{t('activityEmpty')}</Text>
      ) : (
        <FlashList
          data={rows ?? []}
          keyExtractor={(r) => r.id}
          contentContainerStyle={styles.list}
          renderItem={({ item }) => {
            const actor = item.profiles?.full_name ?? '?';
            return (
              <View style={styles.row}>
                <View style={styles.avatar}>
                  <Text style={styles.avatarInitial}>{(actor.charAt(0) || '?').toUpperCase()}</Text>
                </View>
                <View style={styles.rowBody}>
                  <Text style={styles.line}>{lineFor(t, item)}</Text>
                  <Text style={styles.time}>{ago(item.created_at)}</Text>
                </View>
              </View>
            );
          }}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F4F6FA' },
  center: { alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: 22, fontWeight: '700', color: '#0B1F3A', padding: 16 },
  empty: { textAlign: 'center', marginTop: 48, color: '#6B7685', fontSize: 15 },
  list: { paddingHorizontal: 16, paddingBottom: 32 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10 },
  avatar: {
    width: 36, height: 36, borderRadius: 18, backgroundColor: '#0B1F3A',
    alignItems: 'center', justifyContent: 'center',
  },
  avatarInitial: { color: '#fff', fontSize: 14, fontWeight: '700' },
  rowBody: { flex: 1 },
  line: { fontSize: 15, color: '#0B1F3A', fontWeight: '500' },
  time: { fontSize: 13, color: '#6B7685', marginTop: 2 },
});
```

- [ ] **Step 3: Add the manage-screen entry row + update call sites**

In `apps/mobile/app/event/[id]/manage.tsx`:
- Add a Pressable "Activity log" row near the Duplicate-Event CTA:
  ```tsx
  <Pressable
    style={styles.secondary}
    accessibilityRole="button"
    onPress={() => router.push(`/event/${id}/activity` as never)}
  >
    <Text style={styles.secondaryText}>{t('activityLogCta')}</Text>
  </Pressable>
  ```
  (Match the existing button styling on this screen — reuse the Duplicate CTA's style names; if they
  differ, mirror them. `router` and `id` are already in scope.)
- Update the mutation call sites for the changed signatures:
  - `useMarkConfirmed` call: pass `{ participantId: p.id, targetName: p.profiles?.full_name ?? p.guest_name ?? undefined }` instead of the bare `p.id`.
  - `useMarkPaid` call: pass `{ participantId: p.id, paid: <newPaid>, targetName: p.profiles?.full_name ?? p.guest_name ?? undefined }`.
  - `useRemoveParticipant` call: add `targetName: <removed participant's name>` to the existing
    `{ participantId, mode }` object.
  Read the current call sites first; the participant row object in scope exposes `profiles.full_name`
  and `guest_name`.

- [ ] **Step 4: Register the route (if the event stack needs it)**

Check `apps/mobile/app/event/_layout.tsx` and `apps/mobile/app/event/[id]/` routing. The existing
`manage`/`live` screens under `[id]/` are auto-registered by Expo Router's file routing (no explicit
`Stack.Screen` needed unless the layout enumerates screens). If the layout enumerates screens
explicitly, add `activity` the same way `manage` is declared; otherwise no change. Report which.

- [ ] **Step 5: Typecheck**

Run: `pnpm -w typecheck`
Expected: PASS (13 packages) — including the manage-screen call sites updated in Step 3.

- [ ] **Step 6: Commit**

```bash
git add "apps/mobile/app/event/[id]/activity.tsx" "apps/mobile/app/event/[id]/manage.tsx" apps/mobile/lib/i18n-mobile.ts
git commit -m "feat(events): activity log screen + manage entry (5G-2)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Verification (whole slice)

1. **DB:** `db reset` clean; `psql < infra/supabase/tests/event_activity.sql` prints `OK event_activity`.
2. **Types/API:** `pnpm -w typecheck` 13/13; `pnpm --filter @padel/api test` passes.
3. **App smoke (simulator, optional):** as organizer, on the manage screen confirm a player / add a guest /
   mark paid, open Activity log, see entries with correct actor + target text and relative time; as a
   non-organizer the log is empty (RLS) and there is no manage affordance.

## Notes for the implementer

- **Best-effort logging:** the `logActivity` helper must swallow errors — never let a log failure throw
  into a roster action. Keep each `logActivity(...)` call after the existing `if (error) throw …` line.
- **`join_event` returns text** (`'confirmed'`/`'waiting_list'`) — capture `data` (Step 2).
- **Server is the source of truth** for authorization (the SQL test covers it); the client logging is
  display-only convenience.
- **No `@padel/utils` work** and **no new dependency**; migration number is `0070` (next after `0069`).
