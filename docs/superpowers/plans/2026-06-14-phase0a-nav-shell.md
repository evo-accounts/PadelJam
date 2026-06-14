# Phase 0A — 5-Tab Nav Shell + Events Tab Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stand up the five-tab bottom nav (Home · Events · Explore · Community · Profile) with a real Events list of the viewer's upcoming events, a shared Create-Event FAB, and Home/Profile placeholders.

**Architecture:** A new `my_events(p_filter, p_limit, p_offset)` `SECURITY DEFINER` RPC (mirroring the shipped explore RPCs) returns the viewer's upcoming events (organized or confirmed-going). A thin `useMyEvents` `useInfiniteQuery` hook wraps it. The mobile Events tab renders a paged `FlashList` of the existing `EventCard` with All/Organizing/Going filter chips. Home and Profile are minimal placeholder screens; the FAB is extracted from `explore.tsx` into a shared component.

**Tech Stack:** Supabase Postgres (`sql security definer` RPC), `@tanstack/react-query`, Expo SDK 56 + Expo Router, `@shopify/flash-list`, `expo-symbols`, Vitest, local Supabase via `pnpm dlx supabase@latest --workdir infra`.

**Spec:** `docs/superpowers/specs/2026-06-14-phase0a-nav-shell-design.md`. **Branch:** `feat/phase0a-nav-shell` (stacked on `feat/discovery-explore`). **Next migration:** `0053`.

---

## Resolved facts (read from the schema)
- `events.status ∈ ('scheduled','in_progress','completed','cancelled')`; `events.deleted_at` nullable; `events.organizer_id` not null; `events.starts_at` not null.
- `event_participants.status ∈ ('invited','interested','confirmed','waiting_list')` — **"going" = `'confirmed'`**.
- "Upcoming" = `deleted_at is null AND ((status='scheduled' AND starts_at >= now()) OR status='in_progress')` (live events the viewer is in are surfaced).
- `EventCard` accepts an `events` Row (same as the shipped `explore_events` rail), so `my_events` returns `setof events`.

## File Structure
```
infra/supabase/migrations/0053_my_events.sql      my_events RPC + grant
infra/supabase/tests/my_events.sql                filter/exclusion/paging test
packages/db/src/database.types.ts                 (regenerated)
packages/api/src/query-keys.ts                     (modify: + myEvents key)
packages/api/src/events/queries.ts                (modify: + useMyEvents)
packages/api/src/events/queries.test.ts           (create: qk.myEvents shape) — or extend discovery test
packages/api/src/index.ts                          (verify events/queries already exported)
apps/mobile/components/CreateEventFab.tsx          (create: shared FAB)
apps/mobile/app/(tabs)/explore.tsx                 (modify: use shared FAB)
apps/mobile/lib/i18n-mobile.ts                     (modify: + home/events/profile namespaces)
apps/mobile/app/(tabs)/events.tsx                  (create: Events tab)
apps/mobile/app/(tabs)/index.tsx                   (modify: Home placeholder)
apps/mobile/app/(tabs)/profile.tsx                 (create: Profile stub)
apps/mobile/app/(tabs)/_layout.tsx                 (modify: 5 tabs)
```

---

## Task 1: `my_events` RPC + SQL test

**Files:**
- Create: `infra/supabase/migrations/0053_my_events.sql`
- Test: `infra/supabase/tests/my_events.sql`

- [ ] **Step 1: Write the migration**

Create `infra/supabase/migrations/0053_my_events.sql`:
```sql
-- "My events": the viewer's UPCOMING events — ones they organize, or ones they are a
-- confirmed ('going') participant in. SECURITY DEFINER (no RLS inside the function); it only
-- ever returns events the viewer organizes or already joined, so both are inherently theirs
-- to see (no broader visibility re-derivation needed, unlike the explore discovery RPCs).
-- p_filter: 'all' (default) | 'organizing' | 'going'. Unknown values are treated as 'all'.
-- Same (p_filter, p_limit, p_offset) shape powers the tab's paged infinite list.
create or replace function my_events(
  p_filter text default 'all',
  p_limit  int  default 20,
  p_offset int  default 0
)
returns setof events
language sql stable security definer set search_path = public as $$
  select e.*
  from events e
  cross join lateral (
    select case when p_filter in ('organizing','going') then p_filter else 'all' end as f
  ) nf
  where e.deleted_at is null
    and ((e.status = 'scheduled' and e.starts_at >= now()) or e.status = 'in_progress')
    and (
      (nf.f in ('all','organizing') and e.organizer_id = auth.uid())
      or
      (nf.f in ('all','going') and exists (
        select 1 from event_participants ep
        where ep.event_id = e.id
          and ep.user_id = auth.uid()
          and ep.status = 'confirmed'
      ))
    )
  order by e.starts_at asc
  limit greatest(p_limit, 0) offset greatest(p_offset, 0);
$$;

grant execute on function my_events(text, int, int) to authenticated;
```

- [ ] **Step 2: Write the failing test**

Create `infra/supabase/tests/my_events.sql` (mirrors `infra/supabase/tests/explore_events.sql` fixtures — uses the `create_community_with_personal_tenant` helper and the `basic` subscription upgrade so a test group can be added):
```sql
-- my_events: viewer's upcoming organized/going events; excludes past, cancelled, deleted,
-- not-mine; respects the all/organizing/going filter and paging.
begin;
insert into auth.users (id, instance_id, aud, role, email) values
  ('e4000001-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000000','authenticated','authenticated','me1@x.com'),
  ('e4000002-0000-0000-0000-000000000002','00000000-0000-0000-0000-000000000000','authenticated','authenticated','me2@x.com') on conflict do nothing;
insert into profiles (id, email, phone, full_name) values
  ('e4000001-0000-0000-0000-000000000001','me1@x.com','+351900500001','MeViewer'),
  ('e4000002-0000-0000-0000-000000000002','me2@x.com','+351900500002','MeOther') on conflict do nothing;

do $$
declare cid uuid; gid uuid;
  ev_org uuid; ev_going uuid; ev_past uuid; ev_cancel uuid; ev_other uuid;
begin
  -- Viewer creates a community (personal tenant) + a group.
  perform set_config('role','authenticated',true);
  perform set_config('request.jwt.claims','{"sub":"e4000001-0000-0000-0000-000000000001","role":"authenticated"}',true);
  cid := create_community_with_personal_tenant('MeC','club','PT','public');

  perform set_config('role','postgres',true);
  insert into community_subscriptions (community_id, plan_id)
    values (cid,'basic') on conflict (community_id) do update set plan_id='basic';
  insert into groups (community_id, name, is_private) values (cid,'MeG',false) returning id into gid;

  -- ev_org: viewer organizes, upcoming.
  insert into events (group_id, organizer_id, event_type, specification, scoring_mode, num_courts,
    starts_at, duration_minutes, organizer_role, name)
    values (gid,'e4000001-0000-0000-0000-000000000001','americano','classic','points',2,
            now() + interval '2 days',60,'organizing_only','MeOrg') returning id into ev_org;
  -- ev_going: other organizes, viewer is a confirmed participant, upcoming.
  insert into events (group_id, organizer_id, event_type, specification, scoring_mode, num_courts,
    starts_at, duration_minutes, organizer_role, name)
    values (gid,'e4000002-0000-0000-0000-000000000002','americano','classic','points',2,
            now() + interval '3 days',60,'organizing_only','MeGoing') returning id into ev_going;
  insert into event_participants (event_id, user_id, status)
    values (ev_going,'e4000001-0000-0000-0000-000000000001','confirmed') on conflict do nothing;
  -- ev_past: viewer organizes but starts in the past.
  insert into events (group_id, organizer_id, event_type, specification, scoring_mode, num_courts,
    starts_at, duration_minutes, organizer_role, name)
    values (gid,'e4000001-0000-0000-0000-000000000001','americano','classic','points',2,
            now() - interval '2 days',60,'organizing_only','MePast') returning id into ev_past;
  -- ev_cancel: viewer organizes, upcoming, but cancelled.
  insert into events (group_id, organizer_id, event_type, specification, scoring_mode, num_courts,
    starts_at, duration_minutes, organizer_role, name, status)
    values (gid,'e4000001-0000-0000-0000-000000000001','americano','classic','points',2,
            now() + interval '2 days',60,'organizing_only','MeCancel','cancelled') returning id into ev_cancel;
  -- ev_other: other organizes, viewer not involved.
  insert into events (group_id, organizer_id, event_type, specification, scoring_mode, num_courts,
    starts_at, duration_minutes, organizer_role, name)
    values (gid,'e4000002-0000-0000-0000-000000000002','americano','classic','points',2,
            now() + interval '5 days',60,'organizing_only','MeOther') returning id into ev_other;

  -- Act as the viewer.
  perform set_config('role','authenticated',true);
  perform set_config('request.jwt.claims','{"sub":"e4000001-0000-0000-0000-000000000001","role":"authenticated"}',true);

  -- all: org + going present; past/cancelled/other absent.
  if not exists (select 1 from my_events('all',50,0) where id = ev_org) then
    raise exception using errcode='PT001', message='organized upcoming event missing from all'; end if;
  if not exists (select 1 from my_events('all',50,0) where id = ev_going) then
    raise exception using errcode='PT001', message='going event missing from all'; end if;
  if exists (select 1 from my_events('all',50,0) where id = ev_past) then
    raise exception using errcode='PT001', message='past event surfaced'; end if;
  if exists (select 1 from my_events('all',50,0) where id = ev_cancel) then
    raise exception using errcode='PT001', message='cancelled event surfaced'; end if;
  if exists (select 1 from my_events('all',50,0) where id = ev_other) then
    raise exception using errcode='PT001', message='unrelated event surfaced'; end if;

  -- organizing: org present, going absent.
  if not exists (select 1 from my_events('organizing',50,0) where id = ev_org) then
    raise exception using errcode='PT001', message='organized event missing from organizing'; end if;
  if exists (select 1 from my_events('organizing',50,0) where id = ev_going) then
    raise exception using errcode='PT001', message='going event leaked into organizing'; end if;

  -- going: going present, org absent.
  if not exists (select 1 from my_events('going',50,0) where id = ev_going) then
    raise exception using errcode='PT001', message='going event missing from going'; end if;
  if exists (select 1 from my_events('going',50,0) where id = ev_org) then
    raise exception using errcode='PT001', message='organized event leaked into going'; end if;

  -- paging: limit 1 returns exactly 1; offset 2 skips the first two of the two all-rows.
  if (select count(*) from my_events('all',1,0)) <> 1 then
    raise exception using errcode='PT001', message='limit 1 did not return exactly one row'; end if;
  if (select count(*) from my_events('all',50,2)) <> 0 then
    raise exception using errcode='PT001', message='offset past the result set returned rows'; end if;

  raise notice 'OK my_events';
end $$;
rollback;
```

- [ ] **Step 3: Reset the DB and run the test — verify it FAILS (function missing)**

Run:
```bash
export SUPABASE_AUTH_SMS_TWILIO_AUTH_TOKEN=local_test_token
git stash --include-untracked   # temporarily hide 0053 so the function does not exist yet
pnpm dlx supabase@latest --workdir infra db reset
docker exec -i supabase_db_padeljam psql -U postgres -d postgres -v ON_ERROR_STOP=1 < infra/supabase/tests/my_events.sql
git stash pop
```
Expected: error `function my_events(...) does not exist` (the failing state). *(If `git stash` is awkward in the executor, instead confirm failure by running the test before applying the migration in Step 4.)*

- [ ] **Step 4: Apply the migration and run the test — verify it PASSES**

Run:
```bash
export SUPABASE_AUTH_SMS_TWILIO_AUTH_TOKEN=local_test_token
pnpm dlx supabase@latest --workdir infra db reset
docker exec -i supabase_db_padeljam psql -U postgres -d postgres -v ON_ERROR_STOP=1 < infra/supabase/tests/my_events.sql
```
Expected: `NOTICE: OK my_events`, no errors.

- [ ] **Step 5: Commit**
```bash
git add infra/supabase/migrations/0053_my_events.sql infra/supabase/tests/my_events.sql
git commit -m "feat(events): my_events ranking RPC + SQL test"
```

---

## Task 2: Regenerate DB types

**Files:** Modify: `packages/db/src/database.types.ts`

- [ ] **Step 1: Regenerate (or hand-add if the CLI cannot run)**

Run:
```bash
pnpm dlx supabase@latest --workdir infra gen types typescript --local > packages/db/src/database.types.ts
git diff --stat packages/db/src/database.types.ts
```
Expected: a `my_events` entry added under `Functions`, file otherwise unchanged.

> **Local caveat:** the `supabase gen types` binary currently crashes on this machine (`CPU lacks AVX`) and writes an empty file. If that happens: `git checkout packages/db/src/database.types.ts` to restore, then hand-add the `my_events` function signature to the `Functions` block, mirroring the existing `explore_events` entry (Args `{ p_filter?: string; p_limit?: number; p_offset?: number }`, Returns the `events` Row array). Verify by typecheck in Task 3.

- [ ] **Step 2: Verify the signature landed**
```bash
grep -n "my_events" packages/db/src/database.types.ts
```
Expected: the function name appears with `p_filter` / `p_limit` / `p_offset` args.

- [ ] **Step 3: Commit**
```bash
git add packages/db/src/database.types.ts
git commit -m "chore(db): regenerate types for my_events RPC"
```

---

## Task 3: `useMyEvents` hook + query key

**Files:**
- Modify: `packages/api/src/query-keys.ts`
- Modify: `packages/api/src/events/queries.ts`
- Create: `packages/api/src/events/queries.test.ts`

- [ ] **Step 1: Add the query key**

In `packages/api/src/query-keys.ts`, inside the `qk` object (e.g. after the `communityEvents` key near line 21), add:
```ts
  myEvents: (filter: 'all' | 'organizing' | 'going') => ['my-events', filter] as const,
```

- [ ] **Step 2: Write the failing key-shape test**

Create `packages/api/src/events/queries.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { qk } from '../query-keys';

describe('my events query keys', () => {
  it('encodes the filter in a stable array', () => {
    expect(qk.myEvents('all')).toEqual(['my-events', 'all']);
    expect(qk.myEvents('organizing')).toEqual(['my-events', 'organizing']);
    expect(qk.myEvents('going')).toEqual(['my-events', 'going']);
  });
});
```

- [ ] **Step 3: Run it — verify PASS (key already added in Step 1)**
```bash
pnpm --filter @padel/api test -- queries.test.ts
```
Expected: PASS. *(If Step 1 was skipped it FAILs with "myEvents is not a function" — add the key.)*

- [ ] **Step 4: Add the `useMyEvents` hook**

In `packages/api/src/events/queries.ts`: ensure these imports exist at the top (add what's missing):
```ts
import { useInfiniteQuery } from '@tanstack/react-query';
import { useSession } from '@padel/auth';
```
Then append the hook (the `PAGE_SIZE` / `nextOffset` idiom matches `packages/api/src/discovery/queries.ts`):
```ts
export type MyEventsFilter = 'all' | 'organizing' | 'going';
const MY_EVENTS_PAGE_SIZE = 20;

export const useMyEvents = (filter: MyEventsFilter) => {
  const db = useDb();
  const uid = useSession().session?.user.id;
  return useInfiniteQuery({
    queryKey: qk.myEvents(filter),
    enabled: !!uid,
    initialPageParam: 0,
    queryFn: async ({ pageParam: offset }) => {
      const { data, error } = await db.rpc('my_events', {
        p_filter: filter,
        p_limit: MY_EVENTS_PAGE_SIZE,
        p_offset: offset as number,
      });
      if (error) throw error;
      return data ?? [];
    },
    getNextPageParam: (lastPage: unknown[], allPages: unknown[][]) =>
      lastPage.length < MY_EVENTS_PAGE_SIZE ? undefined : allPages.length * MY_EVENTS_PAGE_SIZE,
  });
};
```

- [ ] **Step 5: Verify export + typecheck**

`packages/api/src/index.ts` already re-exports `events/queries` (confirm `useCommunityEvents` is exported from the package; `useMyEvents` rides the same barrel). Then:
```bash
pnpm --filter @padel/api test && pnpm --filter @padel/api typecheck
```
Expected: tests PASS, typecheck clean.

- [ ] **Step 6: Commit**
```bash
git add packages/api/src/query-keys.ts packages/api/src/events/queries.ts packages/api/src/events/queries.test.ts
git commit -m "feat(api): useMyEvents infinite-query hook + key"
```

---

## Task 4: Shared Create-Event FAB

**Files:**
- Create: `apps/mobile/components/CreateEventFab.tsx`
- Modify: `apps/mobile/app/(tabs)/explore.tsx`

- [ ] **Step 1: Create the shared FAB component**

Create `apps/mobile/components/CreateEventFab.tsx` (lifts the FAB currently inline in `explore.tsx`):
```tsx
import { SymbolView } from 'expo-symbols';
import { useRouter } from 'expo-router';
import { Pressable, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

export function CreateEventFab() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  return (
    <Pressable
      style={[styles.fab, { bottom: insets.bottom + 24 }]}
      onPress={() => router.push('/event/create')}
      accessibilityRole="button"
      accessibilityLabel="Create event">
      <SymbolView name={{ ios: 'plus', android: 'add', web: 'add' }} tintColor="#fff" size={28} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  fab: {
    position: 'absolute',
    right: 20,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#0B7BFF',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 4,
  },
});
```

- [ ] **Step 2: Use it in `explore.tsx`**

In `apps/mobile/app/(tabs)/explore.tsx`: add `import { CreateEventFab } from '@/components/CreateEventFab';`. Replace the inline `<Pressable style={[styles.fab, …]} …>…</Pressable>` block (the FAB comment + Pressable) with `<CreateEventFab />`. Remove the now-unused `fab` entry from the local `StyleSheet`, and drop `SymbolView`/`Pressable`/`useSafeAreaInsets` imports **only if** no longer used elsewhere in the file (insets is still used for `paddingBottom` — keep it; `SymbolView`/`Pressable` are no longer used after removal — remove them).

- [ ] **Step 3: Typecheck the app**
```bash
pnpm --filter mobile typecheck
```
Expected: clean.

- [ ] **Step 4: Commit**
```bash
git add apps/mobile/components/CreateEventFab.tsx apps/mobile/app/\(tabs\)/explore.tsx
git commit -m "refactor(mobile): extract shared CreateEventFab"
```

---

## Task 5: i18n namespaces (home / events / profile)

**Files:** Modify: `apps/mobile/lib/i18n-mobile.ts`

- [ ] **Step 1: Add the copy objects**

In `apps/mobile/lib/i18n-mobile.ts`, after the `mobileDiscovery` block (the `} as const;` at line ~1177), add:
```ts
const mobileHome = {
  en: {
    tab: 'Home',
    placeholder: 'Your home feed is coming soon.',
  },
} as const;

const mobileEvents = {
  en: {
    tab: 'Events',
    filterAll: 'All',
    filterOrganizing: 'Organizing',
    filterGoing: 'Going',
    empty: 'No upcoming events',
    loadError: 'Could not load your events',
  },
} as const;

const mobileProfile = {
  en: {
    tab: 'Profile',
    placeholder: 'Your profile is coming soon.',
  },
} as const;
```

- [ ] **Step 2: Register the namespaces**

In the same file, after the discovery registration line (`instance.addResourceBundle('en', 'discovery', mobileDiscovery.en, true, false);`, line ~1195), add:
```ts
  instance.addResourceBundle('en', 'home', mobileHome.en, true, false);
  instance.addResourceBundle('en', 'events', mobileEvents.en, true, false);
  instance.addResourceBundle('en', 'profile', mobileProfile.en, true, false);
```

- [ ] **Step 3: Typecheck**
```bash
pnpm --filter mobile typecheck
```
Expected: clean.

- [ ] **Step 4: Commit**
```bash
git add apps/mobile/lib/i18n-mobile.ts
git commit -m "feat(mobile): home/events/profile i18n namespaces"
```

---

## Task 6: Events tab screen

**Files:** Create: `apps/mobile/app/(tabs)/events.tsx`

- [ ] **Step 1: Write the screen**

Create `apps/mobile/app/(tabs)/events.tsx` (paged `FlashList` over `useMyEvents`, filter chips, mirrors the states in `app/explore/[type].tsx`):
```tsx
import { useMyEvents, type MyEventsFilter } from '@padel/api';
import { useT } from '@padel/i18n';
import { FlashList } from '@shopify/flash-list';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { CreateEventFab } from '@/components/CreateEventFab';
import { EventCard } from '@/components/event/EventCard';

const FILTERS: MyEventsFilter[] = ['all', 'organizing', 'going'];

export default function EventsScreen() {
  const { t } = useT('events');
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [filter, setFilter] = useState<MyEventsFilter>('all');
  const query = useMyEvents(filter);
  const rows = (query.data?.pages.flat() ?? []) as ReadonlyArray<{ id: string }>;

  const label = { all: t('filterAll'), organizing: t('filterOrganizing'), going: t('filterGoing') };

  return (
    <View style={styles.container}>
      <View style={styles.chips}>
        {FILTERS.map((f) => (
          <Pressable
            key={f}
            onPress={() => setFilter(f)}
            accessibilityRole="button"
            style={[styles.chip, filter === f && styles.chipActive]}>
            <Text style={[styles.chipText, filter === f && styles.chipTextActive]}>{label[f]}</Text>
          </Pressable>
        ))}
      </View>
      {query.isLoading ? (
        <ActivityIndicator color="#0B1F3A" style={styles.state} />
      ) : (
        <FlashList
          data={rows}
          keyExtractor={(item) => item.id}
          contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 96 }}
          ItemSeparatorComponent={() => <View style={{ height: 12 }} />}
          ListEmptyComponent={
            <Text style={styles.empty}>{query.isError ? t('loadError') : t('empty')}</Text>
          }
          ListFooterComponent={
            query.isFetchingNextPage ? <ActivityIndicator color="#0B1F3A" style={styles.state} /> : null
          }
          onEndReachedThreshold={0.5}
          onEndReached={() => {
            if (query.hasNextPage && !query.isFetchingNextPage) void query.fetchNextPage();
          }}
          renderItem={({ item }) => (
            <EventCard event={item as never} onPress={() => router.push(`/event/${item.id}`)} />
          )}
        />
      )}
      <CreateEventFab />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F7F9FC' },
  chips: { flexDirection: 'row', gap: 8, paddingHorizontal: 16, paddingTop: 12, paddingBottom: 4 },
  chip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, backgroundColor: '#E7ECF3' },
  chipActive: { backgroundColor: '#0B1F3A' },
  chipText: { fontSize: 14, fontWeight: '600', color: '#0B1F3A' },
  chipTextActive: { color: '#fff' },
  state: { paddingVertical: 24 },
  empty: { textAlign: 'center', color: '#6B7685', paddingVertical: 24 },
});
```

- [ ] **Step 2: Typecheck**
```bash
pnpm --filter mobile typecheck
```
Expected: clean.

- [ ] **Step 3: Commit**
```bash
git add apps/mobile/app/\(tabs\)/events.tsx
git commit -m "feat(mobile): events tab (my upcoming events + filters)"
```

---

## Task 7: Home placeholder + Profile stub

**Files:**
- Modify: `apps/mobile/app/(tabs)/index.tsx`
- Create: `apps/mobile/app/(tabs)/profile.tsx`

- [ ] **Step 1: Replace the Home placeholder**

Overwrite `apps/mobile/app/(tabs)/index.tsx`:
```tsx
import { useT } from '@padel/i18n';
import { StyleSheet, Text, View } from 'react-native';

import { CreateEventFab } from '@/components/CreateEventFab';

export default function HomeScreen() {
  const { t } = useT('home');
  return (
    <View style={styles.container}>
      <Text style={styles.placeholder}>{t('placeholder')}</Text>
      <CreateEventFab />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F7F9FC', alignItems: 'center', justifyContent: 'center', padding: 24 },
  placeholder: { color: '#6B7685', fontSize: 16, textAlign: 'center' },
});
```

- [ ] **Step 2: Create the Profile stub**

Create `apps/mobile/app/(tabs)/profile.tsx`:
```tsx
import { useT } from '@padel/i18n';
import { StyleSheet, Text, View } from 'react-native';

export default function ProfileScreen() {
  const { t } = useT('profile');
  return (
    <View style={styles.container}>
      <Text style={styles.placeholder}>{t('placeholder')}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F7F9FC', alignItems: 'center', justifyContent: 'center', padding: 24 },
  placeholder: { color: '#6B7685', fontSize: 16, textAlign: 'center' },
});
```

- [ ] **Step 3: Typecheck**
```bash
pnpm --filter mobile typecheck
```
Expected: clean.

- [ ] **Step 4: Commit**
```bash
git add apps/mobile/app/\(tabs\)/index.tsx apps/mobile/app/\(tabs\)/profile.tsx
git commit -m "feat(mobile): home placeholder + profile stub screens"
```

---

## Task 8: Five-tab nav shell

**Files:** Modify: `apps/mobile/app/(tabs)/_layout.tsx`

- [ ] **Step 1: Rewrite the layout**

Overwrite `apps/mobile/app/(tabs)/_layout.tsx` (order Home · Events · Explore · Community · Profile; Home/Events/Profile titles via i18n; remove the template info-modal header):
```tsx
import { useT } from '@padel/i18n';
import { SymbolView } from 'expo-symbols';
import { Tabs } from 'expo-router';

import Colors from '@/constants/Colors';
import { useColorScheme } from '@/components/useColorScheme';
import { useClientOnlyValue } from '@/components/useClientOnlyValue';

export default function TabLayout() {
  const colorScheme = useColorScheme();
  const { t } = useT('community');

  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: Colors[colorScheme].tint,
        headerShown: useClientOnlyValue(false, true),
      }}>
      <Tabs.Screen
        name="index"
        options={{
          title: t('tab', { ns: 'home' }),
          tabBarIcon: ({ color }) => (
            <SymbolView name={{ ios: 'house.fill', android: 'home', web: 'home' }} tintColor={color} size={28} />
          ),
        }}
      />
      <Tabs.Screen
        name="events"
        options={{
          title: t('tab', { ns: 'events' }),
          tabBarIcon: ({ color }) => (
            <SymbolView name={{ ios: 'calendar', android: 'event', web: 'event' }} tintColor={color} size={28} />
          ),
        }}
      />
      <Tabs.Screen
        name="explore"
        options={{
          title: t('tab', { ns: 'discovery' }),
          tabBarIcon: ({ color }) => (
            <SymbolView name={{ ios: 'safari', android: 'explore', web: 'explore' }} tintColor={color} size={28} />
          ),
        }}
      />
      <Tabs.Screen
        name="community"
        options={{
          title: t('tab'),
          headerShown: false,
          tabBarIcon: ({ color }) => (
            <SymbolView name={{ ios: 'person.2.fill', android: 'group', web: 'group' }} tintColor={color} size={28} />
          ),
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: t('tab', { ns: 'profile' }),
          tabBarIcon: ({ color }) => (
            <SymbolView
              name={{ ios: 'person.crop.circle.fill', android: 'account-circle', web: 'account_circle' }}
              tintColor={color}
              size={28}
            />
          ),
        }}
      />
    </Tabs>
  );
}
```

- [ ] **Step 2: Typecheck**
```bash
pnpm --filter mobile typecheck
```
Expected: clean.

- [ ] **Step 3: Commit**
```bash
git add apps/mobile/app/\(tabs\)/_layout.tsx
git commit -m "feat(mobile): five-tab nav shell (home/events/explore/community/profile)"
```

---

## Task 9: Full verification

**Files:** none (verification only)

- [ ] **Step 1: Fresh DB + SQL test**
```bash
export SUPABASE_AUTH_SMS_TWILIO_AUTH_TOKEN=local_test_token
pnpm dlx supabase@latest --workdir infra db reset
docker exec -i supabase_db_padeljam psql -U postgres -d postgres -v ON_ERROR_STOP=1 < infra/supabase/tests/my_events.sql
```
Expected: `NOTICE: OK my_events`.

- [ ] **Step 2: Unit tests + workspace typecheck**
```bash
pnpm --filter @padel/api test && pnpm -w typecheck
```
Expected: PASS, 0 type errors.

- [ ] **Step 3: Manual smoke (iOS simulator)**

Boot the simulator and run the app (`supabase functions serve` must be running for the sign-up `complete-account` edge function — see the Explore smoke notes). Sign in (test phone `+351912345678`, OTP `123456`). Verify:
- Five tabs appear in order **Home · Events · Explore · Community · Profile** with the right icons.
- **Events** tab lists the viewer's upcoming events (seed/create one to populate); All/Organizing/Going chips switch the list; scrolling loads more; tapping a card opens `/event/[id]`.
- The **Create-Event FAB** appears on Home, Events, and Explore and opens `/event/create`.
- **Home** and **Profile** show their placeholder copy.

- [ ] **Step 4: Finish the branch**

Announce: "I'm using the finishing-a-development-branch skill to complete this work." Then follow superpowers:finishing-a-development-branch (verify tests, present merge/PR options). Note PR should target `feat/discovery-explore` (or `main` once that merges), since this branch is stacked.

---

## Self-Review notes (addressed)
- **Spec coverage:** nav shell (HN-01) → Task 8; FAB on Home/Events/Explore (HN-02) → Tasks 4/6/7/8; Events tab + `my_events` (the substantive slice) → Tasks 1–3, 6; Home/Profile placeholders → Task 7; i18n → Task 5. Geo/real-Home/real-Profile explicitly deferred.
- **Type consistency:** RPC name `my_events` and args `p_filter/p_limit/p_offset` are identical across Task 1 (migration), Task 2 (types), Task 3 (hook). `MyEventsFilter` (`'all'|'organizing'|'going'`) is defined in Task 3 and reused in Task 6. `qk.myEvents(filter)` shape matches between Task 3 Step 1 and the test in Step 2.
- **No placeholders:** every code/SQL/command step is complete; the "going" status (`confirmed`) and upcoming predicate are resolved from the schema, not left open.
- **Resolved open items:** `event_participants.status='confirmed'` = going; `in_progress` events are included as "upcoming" so live events the viewer is in still appear.
