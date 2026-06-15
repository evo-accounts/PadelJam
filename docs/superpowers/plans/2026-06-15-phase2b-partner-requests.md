# Phase 2B — Partner Requests Aggregate Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the aggregate Partner Requests screen + its data RPC — the destination of the pinned "Partner Requests" row shipped in Phase 2A.

**Architecture:** A `SECURITY DEFINER` RPC `incoming_partner_requests()` unions pending `partner_requests` for events the caller organizes with pending `community_join_requests` for communities the caller owns, embedding requester profile + entity name. A thin `@padel/api` query exposes it; one `useRespondToRequest` mutation routes accept/decline to the existing per-type RPCs and invalidates the aggregate + the Phase 2A pinned-count query. A mobile screen lists both kinds with inline accept/decline.

**Tech Stack:** Supabase Postgres (RPC + SQL test), `@padel/api` (TanStack Query), Expo Router + React Native + `@shopify/flash-list`, `@padel/i18n`.

**Spec:** `docs/superpowers/specs/2026-06-15-phase2-notifications-design.md` (Phase 2B section).

**Verification harness (run from repo root):**
```bash
export SUPABASE_AUTH_SMS_TWILIO_AUTH_TOKEN=local_test_token
pnpm dlx supabase@latest --workdir infra db reset
docker exec -i supabase_db_padeljam psql -U postgres -d postgres < infra/supabase/tests/partner_request_queue.sql
```
Expect `OK incoming_partner_requests`; any `PT001` exception fails the test. The local Supabase stack is already running (container `supabase_db_padeljam`).

---

## Context the implementer needs

Verified facts (already in the codebase from earlier phases):
- **Accept/decline RPCs** (all take `{ p_request_id: uuid }`, all `SECURITY DEFINER`, all already granted to `authenticated`):
  - events: `accept_partner_request`, `decline_partner_request`
  - community: `accept_join_request`, `decline_join_request`
- **`partner_requests`** (`0041_events_roster.sql`): `id, event_id, requester_id, target_id, status('pending'|'accepted'|'declined'), created_at`.
- **`community_join_requests`** (`0021_community_social_tables.sql`): `id, community_id, user_id, status('pending'|'accepted'|'declined'), created_at`.
- **`events.organizer_id`** marks the organizer; **`community_members.role = 'owner'`** marks the community owner.
- **`events.name`**, **`communities.name`**, **`profiles.full_name`**, **`profiles.avatar_url`** all exist.
- Phase 2A already created the `@padel/api/notifications` module (`queries.ts`, `mutations.ts`, `realtime.ts`), the `qk.partnerRequestSummary` key + `usePartnerRequestSummary` hook, and a feed screen whose pinned row already pushes to `/notifications/partner-requests` (the screen this plan builds). The `notifications` i18n namespace exists in `apps/mobile/lib/i18n-mobile.ts`.
- Migration numbering: Phase 2A used `0061`. **This plan uses `0062`.**
- SQL test ID convention: use UUIDs prefixed `f8...` (Phase 2A used `f7`).

---

## File Structure

- **Create** `infra/supabase/migrations/0062_partner_request_queue.sql` — the `incoming_partner_requests()` RPC.
- **Create** `infra/supabase/tests/partner_request_queue.sql` — RPC correctness + ownership scoping.
- **Modify** `packages/db/src/database.types.ts` — hand-add the `incoming_partner_requests` function type.
- **Modify** `packages/api/src/notifications/queries.ts` — add `IncomingPartnerRequest` type + `useIncomingPartnerRequests`.
- **Modify** `packages/api/src/notifications/mutations.ts` — add `useRespondToRequest`.
- **Modify** `packages/api/src/query-keys.ts` — add `incomingPartnerRequests`.
- **Modify** `apps/mobile/lib/i18n-mobile.ts` — add a few keys to the existing `notifications` namespace.
- **Create** `apps/mobile/app/notifications/partner-requests.tsx` — the aggregate screen.

---

## Task 1: incoming_partner_requests() RPC

**Files:**
- Create: `infra/supabase/migrations/0062_partner_request_queue.sql`
- Create: `infra/supabase/tests/partner_request_queue.sql`
- Modify: `packages/db/src/database.types.ts`

- [ ] **Step 1: Create the migration**

Write `infra/supabase/migrations/0062_partner_request_queue.sql`:

```sql
-- 0062_partner_request_queue.sql
-- Aggregate "incoming partner requests" for the pinned Notifications row: pending
-- event partner_requests for events I organize + pending community join requests for
-- communities I own. (Phase 2B)
create or replace function incoming_partner_requests()
returns table (
  kind             text,
  request_id       uuid,
  entity_id        uuid,
  entity_name      text,
  requester_id     uuid,
  requester_name   text,
  requester_avatar text,
  created_at       timestamptz
)
language sql stable security definer set search_path = public as $$
  select 'event'::text, pr.id, e.id, e.name, p.id, p.full_name, p.avatar_url, pr.created_at
  from partner_requests pr
  join events e   on e.id = pr.event_id
  join profiles p on p.id = pr.requester_id
  where e.organizer_id = auth.uid() and pr.status = 'pending'
  union all
  select 'community'::text, jr.id, c.id, c.name, p.id, p.full_name, p.avatar_url, jr.created_at
  from community_join_requests jr
  join communities c on c.id = jr.community_id
  join profiles p    on p.id = jr.user_id
  where jr.status = 'pending'
    and exists (select 1 from community_members cm
                 where cm.community_id = jr.community_id
                   and cm.user_id = auth.uid() and cm.role = 'owner')
  order by created_at desc;
$$;
grant execute on function incoming_partner_requests() to authenticated;
```

- [ ] **Step 2: Hand-add the function type**

In `packages/db/src/database.types.ts`, add to the `Functions` block (alphabetical placement near `incoming...`/`is_...` is fine):

```ts
      incoming_partner_requests: {
        Args: Record<PropertyKey, never>
        Returns: {
          kind: string
          request_id: string
          entity_id: string
          entity_name: string
          requester_id: string
          requester_name: string | null
          requester_avatar: string | null
          created_at: string
        }[]
      }
```

- [ ] **Step 3: Write the SQL test**

Create `infra/supabase/tests/partner_request_queue.sql`:

```sql
-- incoming_partner_requests: organizer sees the event request; a non-organizer sees nothing.
begin;
insert into auth.users (id, instance_id, aud, role, email) values
  ('f8000001-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000000','authenticated','authenticated','pq1@x.com'),
  ('f8000002-0000-0000-0000-000000000002','00000000-0000-0000-0000-000000000000','authenticated','authenticated','pq2@x.com'),
  ('f8000003-0000-0000-0000-000000000003','00000000-0000-0000-0000-000000000000','authenticated','authenticated','pq3@x.com')
  on conflict do nothing;
insert into profiles (id, email, phone, full_name) values
  ('f8000001-0000-0000-0000-000000000001','pq1@x.com','+351900050001','Org Q'),
  ('f8000002-0000-0000-0000-000000000002','pq2@x.com','+351900050002','Req Q'),
  ('f8000003-0000-0000-0000-000000000003','pq3@x.com','+351900050003','Tgt Q')
  on conflict do nothing;

do $$
declare org constant uuid := 'f8000001-0000-0000-0000-000000000001';
  req constant uuid := 'f8000002-0000-0000-0000-000000000002';
  tgt constant uuid := 'f8000003-0000-0000-0000-000000000003';
  v_event uuid;
  v_count int;
  v_kind text;
  v_requester text;
begin
  insert into events (organizer_id, event_type, specification, scoring_mode, scoring_value,
                      manual_location_name, has_location, num_courts, is_private, starts_at,
                      duration_minutes, organizer_role, name, status)
    values (org, 'americano', 'mixed', 'points', 24, 'Court Q', true, 2, true, now() + interval '1 day',
            90, 'organizing_and_playing', 'Queue Event', 'scheduled')
    returning id into v_event;
  insert into partner_requests (event_id, requester_id, target_id, status)
    values (v_event, req, tgt, 'pending');

  -- Organizer sees exactly one row, kind=event, requester name embedded.
  perform set_config('role','authenticated',true);
  perform set_config('request.jwt.claims', format('{"sub":"%s","role":"authenticated"}', org), true);
  select count(*) into v_count from incoming_partner_requests();
  if v_count <> 1 then
    raise exception using errcode='PT001', message=format('organizer expected 1 row got %s', v_count); end if;
  select kind, requester_name into v_kind, v_requester from incoming_partner_requests();
  if v_kind <> 'event' or v_requester <> 'Req Q' then
    raise exception using errcode='PT001', message=format('row mismatch kind=%s requester=%s', v_kind, v_requester); end if;

  -- A non-organizer (the requester) sees nothing.
  perform set_config('request.jwt.claims', format('{"sub":"%s","role":"authenticated"}', req), true);
  select count(*) into v_count from incoming_partner_requests();
  if v_count <> 0 then
    raise exception using errcode='PT001', message=format('non-organizer expected 0 got %s', v_count); end if;

  raise notice 'OK incoming_partner_requests';
end $$;
rollback;
```

> **Event-column note:** the `events` INSERT lists the NOT-NULL/constrained columns verified against `0040_events_core.sql` (incl. `num_courts > 0`, the `events_standalone_private` CHECK satisfied by `is_private = true`, and a valid `status` of `'scheduled'`). If `db reset`/the test reports a constraint violation, read the failing column from the psql error and add a valid value — do not remove required columns.

- [ ] **Step 4: Run the migration + test**

```bash
export SUPABASE_AUTH_SMS_TWILIO_AUTH_TOKEN=local_test_token
pnpm dlx supabase@latest --workdir infra db reset
docker exec -i supabase_db_padeljam psql -U postgres -d postgres < infra/supabase/tests/partner_request_queue.sql
```
Expected: `NOTICE: OK incoming_partner_requests`, no `PT001`.

- [ ] **Step 5: Typecheck db**

Run: `pnpm --filter @padel/db typecheck`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add infra/supabase/migrations/0062_partner_request_queue.sql infra/supabase/tests/partner_request_queue.sql packages/db/src/database.types.ts
git commit -m "feat(notifications): incoming_partner_requests aggregate RPC + test"
```

---

## Task 2: @padel/api query + respond mutation

**Files:**
- Modify: `packages/api/src/query-keys.ts`
- Modify: `packages/api/src/notifications/queries.ts`
- Modify: `packages/api/src/notifications/mutations.ts`

- [ ] **Step 1: Add the query key**

In `packages/api/src/query-keys.ts`, add inside `qk` next to the other notification keys (after `partnerRequestSummary`):

```ts
  incomingPartnerRequests: ['notifications', 'partner-requests', 'incoming'] as const,
```

- [ ] **Step 2: Add the query hook**

Append to `packages/api/src/notifications/queries.ts`:

```ts
export type IncomingPartnerRequest = {
  kind: 'event' | 'community';
  request_id: string;
  entity_id: string;
  entity_name: string;
  requester_id: string;
  requester_name: string | null;
  requester_avatar: string | null;
  created_at: string;
};

export const useIncomingPartnerRequests = () => {
  const db = useDb();
  const uid = useSession().session?.user.id;
  return useQuery({
    queryKey: qk.incomingPartnerRequests,
    enabled: !!uid,
    queryFn: async () => {
      const { data, error } = await db.rpc('incoming_partner_requests');
      if (error) throw error;
      return (data ?? []) as IncomingPartnerRequest[];
    },
  });
};
```

> `useQuery` is already imported in this file (Phase 2A). Do not add a duplicate import.

- [ ] **Step 3: Add the respond mutation**

Append to `packages/api/src/notifications/mutations.ts`:

```ts
// Accept/decline an aggregate partner/join request, routing to the per-type RPC.
// Invalidates the aggregate list + the Phase 2A pinned-count + the feed.
export const useRespondToRequest = () => {
  const db = useDb();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      kind: 'event' | 'community';
      requestId: string;
      action: 'accept' | 'decline';
    }) => {
      const rpc =
        input.kind === 'event'
          ? input.action === 'accept'
            ? 'accept_partner_request'
            : 'decline_partner_request'
          : input.action === 'accept'
            ? 'accept_join_request'
            : 'decline_join_request';
      const { error } = await db.rpc(rpc, { p_request_id: input.requestId });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.incomingPartnerRequests });
      qc.invalidateQueries({ queryKey: qk.partnerRequestSummary });
      qc.invalidateQueries({ queryKey: qk.notifications });
    },
  });
};
```

> `useMutation`, `useQueryClient`, `useDb`, and `qk` are already imported at the top of `mutations.ts` (Phase 2A). Do not duplicate imports.

- [ ] **Step 4: Typecheck**

Run: `pnpm --filter @padel/api typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/api/src/query-keys.ts packages/api/src/notifications/queries.ts packages/api/src/notifications/mutations.ts
git commit -m "feat(api): incoming partner requests query + respond mutation"
```

---

## Task 3: aggregate Partner Requests screen + i18n

**Files:**
- Modify: `apps/mobile/lib/i18n-mobile.ts`
- Create: `apps/mobile/app/notifications/partner-requests.tsx`

- [ ] **Step 1: Add i18n keys**

In `apps/mobile/lib/i18n-mobile.ts`, add these keys inside the existing `mobileNotifications.en` object (after `loadError`):

```ts
    accept: 'Accept',
    decline: 'Decline',
    requestsEmpty: 'No pending requests.',
    requestsError: 'Could not load requests.',
    partnerRequestLabel: 'Partner request · {{entity}}',
    joinRequestLabel: 'wants to join {{entity}}',
```

- [ ] **Step 2: Create the screen**

Create `apps/mobile/app/notifications/partner-requests.tsx`:

```tsx
import {
  useIncomingPartnerRequests,
  useRespondToRequest,
  type IncomingPartnerRequest,
} from '@padel/api';
import { useT } from '@padel/i18n';
import { FlashList } from '@shopify/flash-list';
import { Image } from 'expo-image';
import { Stack } from 'expo-router';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

export default function PartnerRequestsScreen() {
  const { t } = useT('notifications');
  const list = useIncomingPartnerRequests();
  const respond = useRespondToRequest();
  const rows = list.data ?? [];

  const act = (item: IncomingPartnerRequest, action: 'accept' | 'decline') =>
    respond.mutate({ kind: item.kind, requestId: item.request_id, action });

  return (
    <View style={styles.container}>
      <Stack.Screen options={{ title: t('partnerRequests') }} />
      {list.isLoading ? (
        <ActivityIndicator color="#0B1F3A" style={{ marginTop: 32 }} />
      ) : list.isError ? (
        <Text style={styles.empty}>{t('requestsError')}</Text>
      ) : rows.length === 0 ? (
        <Text style={styles.empty}>{t('requestsEmpty')}</Text>
      ) : (
        <FlashList
          data={rows}
          keyExtractor={(r) => r.request_id}
          renderItem={({ item }) => (
            <View style={styles.row}>
              <Image
                source={item.requester_avatar ? { uri: item.requester_avatar } : undefined}
                style={styles.avatar}
                contentFit="cover"
              />
              <View style={{ flex: 1 }}>
                <Text style={styles.name}>{item.requester_name ?? '—'}</Text>
                <Text style={styles.context}>
                  {item.kind === 'community'
                    ? t('joinRequestLabel', { entity: item.entity_name })
                    : t('partnerRequestLabel', { entity: item.entity_name })}
                </Text>
              </View>
              <Pressable
                style={styles.decline}
                onPress={() => act(item, 'decline')}
                disabled={respond.isPending}
                accessibilityRole="button"
              >
                <Text style={styles.declineText}>{t('decline')}</Text>
              </Pressable>
              <Pressable
                style={styles.accept}
                onPress={() => act(item, 'accept')}
                disabled={respond.isPending}
                accessibilityRole="button"
              >
                <Text style={styles.acceptText}>{t('accept')}</Text>
              </Pressable>
            </View>
          )}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F7F9FC' },
  row: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: '#fff', marginHorizontal: 12, marginTop: 8, borderRadius: 12, padding: 12,
  },
  avatar: { width: 44, height: 44, borderRadius: 22, backgroundColor: '#E2E8F0' },
  name: { fontSize: 15, fontWeight: '700', color: '#0B1F3A' },
  context: { fontSize: 13, color: '#6B7685', marginTop: 2 },
  decline: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8, backgroundColor: '#EEF1F5' },
  declineText: { color: '#0B1F3A', fontWeight: '600', fontSize: 13 },
  accept: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 8, backgroundColor: '#0B7BFF' },
  acceptText: { color: '#fff', fontWeight: '700', fontSize: 13 },
  empty: { textAlign: 'center', marginTop: 48, color: '#6B7685', fontSize: 15 },
});
```

- [ ] **Step 3: Typed routes**

The route `/notifications/partner-requests` is new. Run Step 4's typecheck; if it errors on an unknown route (the Phase 2A feed screen pushes to it via `as never`, so this is unlikely), regenerate by briefly starting Metro:

```bash
cd apps/mobile && (npx expo start >/tmp/metro.log 2>&1 &) ; sleep 25 ; pkill -f "expo start" ; cd ../..
```

- [ ] **Step 4: Typecheck**

Run: `pnpm --filter mobile typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add 'apps/mobile/app/notifications/partner-requests.tsx' apps/mobile/lib/i18n-mobile.ts
git commit -m "feat(mobile): aggregate Partner Requests screen + i18n"
```

---

## Verification gate (whole phase)

```bash
export SUPABASE_AUTH_SMS_TWILIO_AUTH_TOKEN=local_test_token
pnpm dlx supabase@latest --workdir infra db reset
docker exec -i supabase_db_padeljam psql -U postgres -d postgres < infra/supabase/tests/partner_request_queue.sql   # OK incoming_partner_requests
pnpm --filter @padel/api typecheck
pnpm -w typecheck
```

**Manual smoke (controller-run, optional):** from a second account, request to join a community you own (or create a partner request on an event you organize); open Notifications → tap the pinned Partner Requests row → the request appears with the requester's name + context; Accept decrements the pinned count and removes the row.

---

## Self-Review

**Spec coverage (Phase 2B section):**
- Aggregate list RPC unioning event partner_requests (events I organize) + community join_requests (communities I own), with requester profile + entity name → Task 1 (`incoming_partner_requests`). ✓
- SQL tests → Task 1 (organizer sees 1 / non-organizer sees 0, kind + requester embedded). ✓
- `useIncomingPartnerRequests` (distinct name from the per-event `usePartnerRequests`) → Task 2. ✓
- Accept/decline reuse existing RPCs → Task 2 `useRespondToRequest` routes to `accept_partner_request`/`decline_partner_request`/`accept_join_request`/`decline_join_request`. ✓
- Screen grouped by requester with inline accept/decline; community rows surface the target community name ("wants to join …") → Task 3 (`joinRequestLabel`). ✓
- Wire the pinned row navigation → already done in Phase 2A (the feed pushes to `/notifications/partner-requests`); this plan creates that route. ✓
- Phase 2A reviewer's follow-up (invalidate `qk.partnerRequestSummary` so the pinned count refreshes after accept/decline) → Task 2 `useRespondToRequest.onSuccess`. ✓

**Placeholder scan:** none — every step has complete SQL/TS.

**Type consistency:** `IncomingPartnerRequest` (Task 2) field names match the RPC `returns table` columns (Task 1) and the screen's usage (Task 3): `kind`/`request_id`/`entity_id`/`entity_name`/`requester_id`/`requester_name`/`requester_avatar`/`created_at`. `useRespondToRequest` input `{ kind, requestId, action }` matches the screen's `respond.mutate({ kind, requestId, action })`. Query key `incomingPartnerRequests` defined Task 2, used in both Task 2 hooks. The four accept/decline RPC names + `p_request_id` arg match the verified signatures. ✓

**Note:** the screen uses requester-grouped rows (each request as its own row) rather than a literal grouped-by-section layout; the spec says "grouped by kind" loosely — a single chronological list (RPC already `order by created_at desc`) with per-row kind context satisfies the intent and is simpler. Community vs event is distinguished by the context line, not section headers.
