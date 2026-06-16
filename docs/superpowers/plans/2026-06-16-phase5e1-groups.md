# Phase 5E-1 — Groups Gap-Closing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Your-Groups tabs (GR-12), private-group no-access page (GR-11), ranking period filter (GR-34), and sole-admin-leave "Add admin" resolution (GR-40).

**Architecture:** Migration `0068` adds `my_groups.is_managing` + an `add_group_admins` RPC. `useGroupRanking` gains an optional date cutoff (filter before its in-hook aggregation). The Your-Groups list gets tabs; the group screen gets a no-access branch, a ranking period filter, and an add-admin sheet on the sole-admin-leave error.

**Tech Stack:** Supabase Postgres, `@padel/api` (TanStack Query), React Native, `@padel/i18n`.

**Spec:** `docs/superpowers/specs/2026-06-16-phase5e1-groups-design.md`

**Verification:** `0068` SQL tests; `@padel/api` typecheck; `pnpm -w typecheck`.

**Verified context:**
- `my_groups()` (`0064`) returns `group_id,name,community_id,community_name,member_count` (active groups). `is_group_admin(g,u)` (`0035`) = caller owner/admin of the group's community. `leave_group` raises `sole_admin_must_add_another`.
- `useGroupRanking(seasonId)` (`packages/api/src/groups/queries.ts`) selects `group_event_results` (`user_id, ranking_points, event_id, profiles(...)`) and **aggregates per-user inside the hook** → returns aggregated rows. `MyGroup` type at `queries.ts:105`.
- `useCommunityMembers(id)` returns `{ user_id, role, profiles }[]`. `useGroupMembers(id)` returns the group's members.
- `apps/mobile/app/groups/index.tsx` = the Your-Groups list (`useT('home')`, `useMyGroups`).
- `apps/mobile/app/group/[id]/index.tsx`: `if (isLoading || !group)` → spinner (line ~70); `useGroupRanking(currentSeasonId)` → `ranking`, rendered `<RankingList rows={ranking ?? []} />` (~237); `onLeave` (~96) → `leave.mutateAsync` with `catch (e) { err(e) }`; `KNOWN`/`err` map `sole_admin_must_add_another`.

---

## File Structure
- **Create** `infra/supabase/migrations/0068_groups_gaps.sql` — `my_groups.is_managing` + `add_group_admins`.
- **Create** `infra/supabase/tests/groups_gaps.sql`.
- **Modify** `packages/db/src/database.types.ts` — `my_groups` Returns + `add_group_admins`.
- **Modify** `packages/api/src/groups/queries.ts` — `MyGroup.is_managing`; `useGroupRanking(seasonId, since?)`.
- **Modify** `packages/api/src/groups/mutations.ts` + `query-keys.ts` — `useAddGroupAdmins`.
- **Modify** `apps/mobile/app/groups/index.tsx` — GR-12 tabs.
- **Modify** `apps/mobile/app/group/[id]/index.tsx` — GR-11 + GR-34 + GR-40.
- **Modify** `apps/mobile/lib/i18n-mobile.ts` — `home` tab keys + `group` keys.

---

## Task 1: migration — my_groups.is_managing + add_group_admins

**Files:**
- Create: `infra/supabase/migrations/0068_groups_gaps.sql`
- Create: `infra/supabase/tests/groups_gaps.sql`
- Modify: `packages/db/src/database.types.ts`

- [ ] **Step 1: Migration**

Create `infra/supabase/migrations/0068_groups_gaps.sql`:

```sql
-- 0068_groups_gaps.sql
-- my_groups.is_managing (GR-12 tabs) + add_group_admins (GR-40 sole-admin-leave). (Phase 5E-1)
drop function if exists my_groups();
create function my_groups()
returns table (
  group_id       uuid,
  name           text,
  community_id   uuid,
  community_name text,
  member_count   integer,
  is_managing    boolean
)
language sql stable security definer set search_path = public as $$
  select g.id, g.name, c.id, c.name,
         (select count(*)::int from group_members gm2 where gm2.group_id = g.id),
         is_group_admin(g.id, auth.uid())
  from group_members gm
  join groups g      on g.id = gm.group_id and g.archived_at is null
  join communities c on c.id = g.community_id
  where gm.user_id = auth.uid()
  order by g.name;
$$;
grant execute on function my_groups() to authenticated;

-- Add community admins (of the group's community) to a group, so they can manage it. Caller must be
-- a group admin; only community owner/admins are eligible. (GR-40 sole-admin-leave resolution.)
create or replace function add_group_admins(p_group_id uuid, p_user_ids uuid[]) returns void
language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid(); v_comm uuid;
begin
  if not is_group_admin(p_group_id, v_uid) then raise exception 'forbidden' using errcode = 'P0001'; end if;
  select community_id into v_comm from groups where id = p_group_id;
  insert into group_members (group_id, user_id)
    select p_group_id, u from unnest(p_user_ids) u
    where exists (
      select 1 from community_members cm
      where cm.community_id = v_comm and cm.user_id = u and cm.role in ('owner','admin'))
  on conflict do nothing;
end; $$;
grant execute on function add_group_admins(uuid, uuid[]) to authenticated;
```

- [ ] **Step 2: Types**

In `packages/db/src/database.types.ts`:
- `my_groups` Returns: add `is_managing: boolean` to the row object.
- Add Functions entry:
```ts
      add_group_admins: {
        Args: { p_group_id: string; p_user_ids: string[] }
        Returns: undefined
      }
```

- [ ] **Step 3: SQL test**

Create `infra/supabase/tests/groups_gaps.sql`:

```sql
-- groups_gaps: my_groups.is_managing; add_group_admins (admin adds a community admin; non-admin forbidden).
begin;
insert into auth.users (id, instance_id, aud, role, email) values
  ('fc000001-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000000','authenticated','authenticated','gg1@x.com'),
  ('fc000002-0000-0000-0000-000000000002','00000000-0000-0000-0000-000000000000','authenticated','authenticated','gg2@x.com'),
  ('fc000003-0000-0000-0000-000000000003','00000000-0000-0000-0000-000000000000','authenticated','authenticated','gg3@x.com')
  on conflict do nothing;
insert into profiles (id, email, phone, full_name) values
  ('fc000001-0000-0000-0000-000000000001','gg1@x.com','+351900100001','Admin GG'),
  ('fc000002-0000-0000-0000-000000000002','gg2@x.com','+351900100002','Other Admin GG'),
  ('fc000003-0000-0000-0000-000000000003','gg3@x.com','+351900100003','Plain GG')
  on conflict do nothing;

do $$
declare a constant uuid := 'fc000001-0000-0000-0000-000000000001';  -- owner+group admin+member
  b constant uuid := 'fc000002-0000-0000-0000-000000000002';         -- community admin, NOT in group
  c constant uuid := 'fc000003-0000-0000-0000-000000000003';         -- plain (non-admin)
  v_tenant uuid; v_comm uuid; v_group uuid; v_managing boolean; v_in int;
begin
  insert into tenants (type, name, country) values ('community','GG Tenant','PT') returning id into v_tenant;
  insert into communities (tenant_id, name, type, privacy) values (v_tenant,'GG Community','club','public') returning id into v_comm;
  insert into community_members (community_id, user_id, role) values (v_comm, a, 'owner'), (v_comm, b, 'admin'), (v_comm, c, 'member');
  insert into groups (community_id, name) values (v_comm,'GG Group') returning id into v_group;
  insert into group_members (group_id, user_id) values (v_group, a);

  -- my_groups.is_managing = true for the owner/admin 'a'
  perform set_config('role','authenticated',true);
  perform set_config('request.jwt.claims', format('{"sub":"%s","role":"authenticated"}', a), true);
  select is_managing into v_managing from my_groups() where group_id = v_group;
  if v_managing is not true then raise exception using errcode='PT001', message='is_managing not true for admin'; end if;

  -- add_group_admins: admin 'a' adds community admin 'b' (eligible); 'c' (non-admin) is skipped
  perform add_group_admins(v_group, array[b, c]);
  select count(*) into v_in from group_members where group_id = v_group and user_id = b;
  if v_in <> 1 then raise exception using errcode='PT001', message='community admin b not added'; end if;
  select count(*) into v_in from group_members where group_id = v_group and user_id = c;
  if v_in <> 0 then raise exception using errcode='PT001', message='non-admin c wrongly added'; end if;

  -- non-admin caller -> forbidden
  perform set_config('request.jwt.claims', format('{"sub":"%s","role":"authenticated"}', c), true);
  begin
    perform add_group_admins(v_group, array[c]);
    raise exception using errcode='PT001', message='expected forbidden for non-admin caller';
  exception when others then
    if sqlerrm <> 'forbidden' then raise exception using errcode='PT001', message='wrong err: '||sqlerrm; end if;
  end;

  raise notice 'OK groups_gaps';
end $$;
rollback;
```

- [ ] **Step 4: Run + typecheck**

```bash
export SUPABASE_AUTH_SMS_TWILIO_AUTH_TOKEN=local_test_token
pnpm dlx supabase@latest --workdir infra db reset
docker exec -i supabase_db_padeljam psql -U postgres -d postgres < infra/supabase/tests/groups_gaps.sql
```
Expect `OK groups_gaps`. Then `pnpm --filter @padel/db typecheck` → PASS.

- [ ] **Step 5: Commit**

```bash
git add infra/supabase/migrations/0068_groups_gaps.sql infra/supabase/tests/groups_gaps.sql packages/db/src/database.types.ts
git commit -m "feat(groups): my_groups.is_managing + add_group_admins RPC"
```

---

## Task 2: @padel/api — MyGroup.is_managing, ranking cutoff, useAddGroupAdmins

**Files:**
- Modify: `packages/api/src/groups/queries.ts`
- Modify: `packages/api/src/groups/mutations.ts`
- Modify: `packages/api/src/query-keys.ts`

- [ ] **Step 1: MyGroup.is_managing**

In `packages/api/src/groups/queries.ts`, add `is_managing: boolean;` to the `MyGroup` type. (`useMyGroups`'s `db.rpc('my_groups')` now returns it per the Task 1 types — no other change.)

- [ ] **Step 2: useGroupRanking date cutoff**

Change `useGroupRanking` to accept an optional ISO cutoff and filter results by event date before aggregating:

```ts
export const useGroupRanking = (seasonId: string, since?: string) => {
  const db = useDb();
  return useQuery({
    queryKey: [...qk.groupRanking(seasonId), since ?? 'all'],
    enabled: !!seasonId,
    queryFn: async () => {
      const { data, error } = await db
        .from('group_event_results')
        .select('user_id, ranking_points, event_id, events(starts_at), profiles(id, full_name, avatar_url)')
        .eq('group_season_id', seasonId)
        .returns<
          {
            user_id: string;
            ranking_points: number;
            event_id: string;
            events: { starts_at: string } | null;
            profiles: { id: string; full_name: string | null; avatar_url: string | null } | null;
          }[]
        >();
      if (error) throw error;
      const all = data ?? [];
      const rows = since ? all.filter((r) => r.events?.starts_at != null && r.events.starts_at >= since) : all;
      // ...existing aggregation, iterating `rows` (was `data ?? []`)
```
Keep the rest of the aggregation body, but iterate the filtered `rows` instead of `data ?? []`. (`qk.groupRanking(seasonId)` is unchanged; the `since` is appended to the key array here.)

- [ ] **Step 3: useAddGroupAdmins**

In `packages/api/src/query-keys.ts` — no new key needed (reuses `groupMembers`/`myGroups`). In
`packages/api/src/groups/mutations.ts`, add:

```ts
export const useAddGroupAdmins = (groupId: string) => {
  const db = useDb();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (userIds: string[]) => {
      const { error } = await db.rpc('add_group_admins', { p_group_id: groupId, p_user_ids: userIds });
      if (error) throw new Error(mapPgError(error) ?? 'unknown_error');
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.groupMembers(groupId) });
      qc.invalidateQueries({ queryKey: qk.myGroups });
    },
  });
};
```
(Match the file's existing imports — `useMutation`/`useQueryClient`/`useDb`/`qk`/`mapPgError` are already used by sibling group mutations.)

- [ ] **Step 4: Typecheck + commit**

`pnpm --filter @padel/api typecheck` → PASS.
```bash
git add packages/api/src/groups/queries.ts packages/api/src/groups/mutations.ts packages/api/src/query-keys.ts
git commit -m "feat(api): MyGroup.is_managing + ranking date cutoff + useAddGroupAdmins"
```

---

## Task 3: Your-Groups tabs (GR-12)

**Files:**
- Modify: `apps/mobile/app/groups/index.tsx`
- Modify: `apps/mobile/lib/i18n-mobile.ts`

- [ ] **Step 1: i18n tab keys**

In `apps/mobile/lib/i18n-mobile.ts`, add to the `home` namespace's `en` object:
```ts
    tabAll: 'All',
    tabManaging: 'Managing',
    tabParticipating: 'Participating',
```

- [ ] **Step 2: Add tabs**

In `apps/mobile/app/groups/index.tsx`, add a segmented tab over the existing list, filtering `rows` by `is_managing`:

```tsx
// add: import { useState } from 'react';
  const [tab, setTab] = useState<'all' | 'managing' | 'participating'>('all');
  const all = groups.data ?? [];
  const rows =
    tab === 'managing' ? all.filter((g) => g.is_managing)
    : tab === 'participating' ? all.filter((g) => !g.is_managing)
    : all;
```
Render the tab bar above the list:
```tsx
      <View style={styles.tabs}>
        {(['all', 'managing', 'participating'] as const).map((k) => (
          <Pressable key={k} onPress={() => setTab(k)} style={[styles.tab, tab === k && styles.tabActive]} accessibilityRole="button">
            <Text style={[styles.tabText, tab === k && styles.tabTextActive]}>
              {t(k === 'all' ? 'tabAll' : k === 'managing' ? 'tabManaging' : 'tabParticipating')}
            </Text>
          </Pressable>
        ))}
      </View>
```
Add styles:
```tsx
  tabs: { flexDirection: 'row', backgroundColor: '#fff', borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#E2E8F0' },
  tab: { flex: 1, alignItems: 'center', paddingVertical: 12, borderBottomWidth: 2, borderBottomColor: 'transparent' },
  tabActive: { borderBottomColor: '#0B7BFF' },
  tabText: { fontSize: 14, color: '#6B7685', fontWeight: '600' },
  tabTextActive: { color: '#0B7BFF', fontWeight: '700' },
```
(The existing `rows`/empty/FlashList logic now uses the filtered `rows`; the empty state shows per active tab.)

- [ ] **Step 3: Typecheck + commit**

`pnpm --filter mobile typecheck` → PASS.
```bash
git add apps/mobile/app/groups/index.tsx apps/mobile/lib/i18n-mobile.ts
git commit -m "feat(groups): Your-Groups All/Managing/Participating tabs (GR-12)"
```

---

## Task 4: group screen — no-access (GR-11) + ranking filter (GR-34) + add-admin (GR-40)

**Files:**
- Modify: `apps/mobile/app/group/[id]/index.tsx`
- Modify: `apps/mobile/lib/i18n-mobile.ts`

- [ ] **Step 1: i18n group keys**

In `apps/mobile/lib/i18n-mobile.ts`, add to the `group` namespace's `en` object:
```ts
    noAccessTitle: 'No access',
    noAccessBody: "This group is private. Ask a member for an invite.",
    back: 'Back',
    periodAll: 'All time',
    period3m: '3 months',
    period6m: '6 months',
    period12m: '12 months',
    addAdminTitle: 'Add another admin',
    addAdminBody: "You're the only admin. Add a community admin to the group before leaving.",
    addAdminCta: 'Add to group',
    noEligibleAdmins: 'No community admins available to add. Promote one first.',
```

- [ ] **Step 2: GR-11 no-access split**

In `group/[id]/index.tsx`, replace the combined `if (isLoading || !group)` block (~line 70) with:

```tsx
  if (isLoading) {
    return (
      <SafeAreaView style={[styles.container, styles.center]} edges={['top']}>
        <ActivityIndicator color="#0B1F3A" />
      </SafeAreaView>
    );
  }
  if (!group) {
    return (
      <SafeAreaView style={[styles.container, styles.center]} edges={['top']}>
        <Text style={styles.noAccessTitle}>{t('noAccessTitle')}</Text>
        <Text style={styles.noAccessBody}>{t('noAccessBody')}</Text>
        <Pressable onPress={() => router.back()} accessibilityRole="button" style={styles.noAccessBtn}>
          <Text style={styles.noAccessBtnText}>{t('back')}</Text>
        </Pressable>
      </SafeAreaView>
    );
  }
```
Add styles: `noAccessTitle: { fontSize: 20, fontWeight: '800', color: '#0B1F3A', marginBottom: 8 }`, `noAccessBody: { fontSize: 14, color: '#6B7685', textAlign: 'center', paddingHorizontal: 32 }`, `noAccessBtn: { marginTop: 20, paddingVertical: 12, paddingHorizontal: 24, backgroundColor: '#0B7BFF', borderRadius: 12 }`, `noAccessBtnText: { color: '#fff', fontWeight: '700' }`.

- [ ] **Step 3: GR-34 ranking period filter**

Add a period state + cutoff and pass it to `useGroupRanking`. Near the existing `useGroupRanking(currentSeasonId)` call, change to a cutoff-driven version. Since hooks can't be called conditionally after the early returns, add the state at the top with the other hooks:

```tsx
// with the other useState hooks at the top:
  const [period, setPeriod] = useState<'all' | '3m' | '6m' | '12m'>('all');
  const monthsAgoIso = (n: number) => { const d = new Date(); d.setMonth(d.getMonth() - n); return d.toISOString(); };
  const since = period === '3m' ? monthsAgoIso(3) : period === '6m' ? monthsAgoIso(6) : period === '12m' ? monthsAgoIso(12) : undefined;
```
Change `const { data: ranking } = useGroupRanking(currentSeasonId);` → `useGroupRanking(currentSeasonId, since)`.
Render a period filter row just above `<RankingList rows={ranking ?? []} />`:
```tsx
        <View style={styles.periodRow}>
          {(['all', '3m', '6m', '12m'] as const).map((p) => (
            <Pressable key={p} onPress={() => setPeriod(p)} style={[styles.periodChip, period === p && styles.periodChipOn]} accessibilityRole="button">
              <Text style={[styles.periodChipText, period === p && styles.periodChipTextOn]}>
                {t(p === 'all' ? 'periodAll' : p === '3m' ? 'period3m' : p === '6m' ? 'period6m' : 'period12m')}
              </Text>
            </Pressable>
          ))}
        </View>
```
Add styles: `periodRow: { flexDirection: 'row', gap: 8, marginBottom: 8, flexWrap: 'wrap' }`, `periodChip: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 16, backgroundColor: '#EEF1F5' }`, `periodChipOn: { backgroundColor: '#0B7BFF' }`, `periodChipText: { fontSize: 12, color: '#3A4A5E', fontWeight: '600' }`, `periodChipTextOn: { color: '#fff' }`.

> `Date`/`new Date()` are allowed in app runtime code (only the workflow-script sandbox forbids them) — this is a normal RN screen.

- [ ] **Step 4: GR-40 add-admin on sole-admin-leave**

Add `useAddGroupAdmins` + `useCommunityMembers` + `useGroupMembers` (members already loaded as `members`/`memberRows`). Add state for the sheet + selection:

```tsx
// imports: add useAddGroupAdmins, useCommunityMembers to the @padel/api import
  const [addAdminOpen, setAddAdminOpen] = useState(false);
  const [selectedAdmins, setSelectedAdmins] = useState<string[]>([]);
  const addAdmins = useAddGroupAdmins(id);
  const communityMembers = useCommunityMembers(communityId ?? '');
  const groupMemberIds = new Set(memberRows.map((m) => m.user_id));
  const eligibleAdmins = (communityMembers.data ?? []).filter(
    (m) => (m.role === 'owner' || m.role === 'admin') && !groupMemberIds.has(m.user_id),
  );
```
In `onLeave`'s `catch (e)`, intercept the sole-admin error:
```tsx
          } catch (e) {
            if (e instanceof Error && e.message === 'sole_admin_must_add_another') {
              setSelectedAdmins([]);
              setAddAdminOpen(true);
            } else {
              err(e);
            }
          }
```
(`leave_group`'s error maps through `mapPgError` to the code `sole_admin_must_add_another` — `useLeaveGroup` should throw an `Error` with that message; if it throws the raw Supabase error instead, match on `String(e).includes('sole_admin_must_add_another')`.)

Render the add-admin modal (near the screen's other modals / before the closing tag):
```tsx
      <Modal visible={addAdminOpen} transparent animationType="fade" onRequestClose={() => setAddAdminOpen(false)}>
        <Pressable style={styles.backdrop} onPress={() => setAddAdminOpen(false)}>
          <View style={styles.sheet}>
            <Text style={styles.sheetTitle}>{t('addAdminTitle')}</Text>
            <Text style={styles.sheetBody}>{t('addAdminBody')}</Text>
            {eligibleAdmins.length === 0 ? (
              <Text style={styles.sheetEmpty}>{t('noEligibleAdmins')}</Text>
            ) : (
              eligibleAdmins.map((m) => (
                <Pressable
                  key={m.user_id}
                  style={styles.adminRow}
                  onPress={() =>
                    setSelectedAdmins((s) => (s.includes(m.user_id) ? s.filter((x) => x !== m.user_id) : [...s, m.user_id]))
                  }
                  accessibilityRole="button"
                >
                  <Text style={styles.adminName}>{m.profiles?.full_name ?? '—'}</Text>
                  <Text>{selectedAdmins.includes(m.user_id) ? '✓' : ''}</Text>
                </Pressable>
              ))
            )}
            <Pressable
              style={[styles.addBtn, (selectedAdmins.length === 0 || addAdmins.isPending) && { opacity: 0.5 }]}
              disabled={selectedAdmins.length === 0 || addAdmins.isPending}
              onPress={async () => {
                try {
                  await addAdmins.mutateAsync(selectedAdmins);
                  setAddAdminOpen(false);
                  if (communityId) await leave.mutateAsync({ groupId: id, communityId });
                  router.back();
                } catch (e2) {
                  err(e2);
                }
              }}
              accessibilityRole="button"
            >
              <Text style={styles.addBtnText}>{t('addAdminCta')}</Text>
            </Pressable>
          </View>
        </Pressable>
      </Modal>
```
Add styles: `backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.25)', justifyContent: 'center' }`, `sheet: { backgroundColor: '#fff', borderRadius: 14, margin: 24, padding: 20, gap: 8 }`, `sheetTitle: { fontSize: 16, fontWeight: '800', color: '#0B1F3A' }`, `sheetBody: { fontSize: 13, color: '#3A4A5E' }`, `sheetEmpty: { fontSize: 13, color: '#6B7685', paddingVertical: 8 }`, `adminRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#E2E8F0' }`, `adminName: { fontSize: 15, color: '#0B1F3A' }`, `addBtn: { backgroundColor: '#0B7BFF', borderRadius: 12, paddingVertical: 12, alignItems: 'center', marginTop: 12 }`, `addBtnText: { color: '#fff', fontWeight: '700' }`. Add `Modal` to the react-native import if absent.

- [ ] **Step 5: Typecheck + commit**

`pnpm --filter mobile typecheck` → PASS. (If `useLeaveGroup` throws the raw error, adjust the catch match per the note in Step 4.)
```bash
git add 'apps/mobile/app/group/[id]/index.tsx' apps/mobile/lib/i18n-mobile.ts
git commit -m "feat(groups): no-access page + ranking period filter + sole-admin add-admin (GR-11/34/40)"
```

- [ ] **Step 6: Simulator smoke (deferred)**
Your-Groups tabs filter; a private group opened by a non-member shows no-access; ranking period chips re-window; sole admin tapping Leave gets the add-admin sheet → adding then leaving works.

---

## Verification gate
```bash
export SUPABASE_AUTH_SMS_TWILIO_AUTH_TOKEN=local_test_token
pnpm dlx supabase@latest --workdir infra db reset
docker exec -i supabase_db_padeljam psql -U postgres -d postgres < infra/supabase/tests/groups_gaps.sql   # OK groups_gaps
pnpm --filter @padel/api test
pnpm -w typecheck
```

## Self-Review
**Spec coverage:** GR-12 tabs (my_groups.is_managing → Task 1 + tabs Task 3); GR-11 no-access (Task 4 Step 2); GR-34 ranking period filter (useGroupRanking since → Task 2 Step 2 + chips Task 4 Step 3, today-relative); GR-40 add_group_admins RPC (Task 1) + sole-admin-leave sheet (Task 4 Step 4). Deferred GR-29 + closed-season nuance respected. ✓
**Placeholder scan:** none — full SQL/TS. **Type consistency:** `is_managing` on `my_groups` (Task 1 types) → `MyGroup` (Task 2) → tab filter (Task 3). `useGroupRanking(seasonId, since?)` (Task 2) called with `since` (Task 4 Step 3). `useAddGroupAdmins(id)` (Task 2) used in Task 4. `add_group_admins(p_group_id, p_user_ids)` Args match the RPC + hook. `useCommunityMembers` returns `{user_id, role, profiles}` (verified) for the eligible-admins filter.
**Known note:** the sole-admin error match assumes `useLeaveGroup` throws `Error('sole_admin_must_add_another')` (via `mapPgError`); Step 4/5 note the `String(e).includes(...)` fallback if it throws raw.
