# Phase 1B-2b — Notification Settings Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Persist the user's Push/WhatsApp/Email notification preferences and expose a toggle screen reached from the settings hub.

**Architecture:** A `user_settings` table (own-row RLS) holds three booleans. A new `@padel/api` `settings` module reads them (`useMySettings`, defaulting when the row is absent) and upserts them (`useUpdateSettings`). A `/profile/notifications` screen renders three RN `Switch`es; the settings hub gains a Notifications row.

**Tech Stack:** Supabase Postgres (RLS), `@tanstack/react-query`, Expo Router, RN `Switch`, Vitest.

**Spec:** `docs/superpowers/specs/2026-06-14-phase1b2b-notifications-settings-design.md`. **Branch:** `feat/phase1b2b-notifications` (off `feat/discovery-explore`). **Migration `0057`.**

## Resolved facts
- No `user_settings` table yet. Defaults (PR-14): push on, WhatsApp off, email off.
- RLS own-row pattern: `using/with check (user_id = auth.uid())`.
- `settings.tsx` Preferences section has a Language row (`styles.row`, `styles.rowLabel`); add a Notifications row beside it.
- `@padel/api/src/index.ts` re-exports each module via `export * from './<module>/<file>'`.
- DB types CLI crashes (AVX) → hand-edit `database.types.ts`.
- RN `Switch` is built-in (used in `community/[id]/manage/permissions.tsx`, etc.).

## File Structure
```
infra/supabase/migrations/0057_user_settings.sql   user_settings table + RLS
infra/supabase/tests/user_settings.sql             upsert/defaults/own-row test
packages/db/src/database.types.ts                  (modify: + user_settings table)
packages/api/src/query-keys.ts                      (modify: + mySettings key)
packages/api/src/settings/queries.ts                useMySettings
packages/api/src/settings/mutations.ts              useUpdateSettings
packages/api/src/settings/queries.test.ts           qk.mySettings shape
packages/api/src/index.ts                            (modify: export settings/*)
apps/mobile/lib/i18n-mobile.ts                       (modify: + notification keys)
apps/mobile/app/profile/notifications.tsx           (create: toggles screen)
apps/mobile/app/profile/settings.tsx                (modify: + Notifications row)
```

---

## Task 1: `user_settings` migration + SQL test

**Files:** Create `infra/supabase/migrations/0057_user_settings.sql`; Test `infra/supabase/tests/user_settings.sql`.

- [ ] **Step 1: Migration** `infra/supabase/migrations/0057_user_settings.sql`:
```sql
-- Per-user notification channel preferences (delivery wiring is the Phase 2 notifications system).
create table user_settings (
  user_id uuid primary key references profiles(id) on delete cascade,
  notifications_push     boolean not null default true,
  notifications_whatsapp boolean not null default false,
  notifications_email    boolean not null default false,
  updated_at timestamptz not null default now()
);
alter table user_settings enable row level security;
grant select, insert, update on user_settings to authenticated;
create policy "user_settings: select" on user_settings for select using (user_id = auth.uid());
create policy "user_settings: insert" on user_settings for insert with check (user_id = auth.uid());
create policy "user_settings: update" on user_settings for update
  using (user_id = auth.uid()) with check (user_id = auth.uid());
```

- [ ] **Step 2: Test** `infra/supabase/tests/user_settings.sql` (mirrors the `social_graph.sql` harness):
```sql
-- user_settings: upsert persists; defaults on fresh insert; own-row RLS.
begin;
insert into auth.users (id, instance_id, aud, role, email) values
  ('f3000001-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000000','authenticated','authenticated','us1@x.com'),
  ('f3000002-0000-0000-0000-000000000002','00000000-0000-0000-0000-000000000000','authenticated','authenticated','us2@x.com') on conflict do nothing;
insert into profiles (id, email, phone, full_name) values
  ('f3000001-0000-0000-0000-000000000001','us1@x.com','+351900900001','US One'),
  ('f3000002-0000-0000-0000-000000000002','us2@x.com','+351900900002','US Two') on conflict do nothing;

do $$
declare a constant uuid := 'f3000001-0000-0000-0000-000000000001';
  b constant uuid := 'f3000002-0000-0000-0000-000000000002'; blocked boolean := false;
begin
  perform set_config('role','authenticated',true);
  perform set_config('request.jwt.claims', format('{"sub":"%s","role":"authenticated"}', a), true);

  -- fresh insert with only user_id → PR-14 defaults.
  insert into user_settings (user_id) values (a);
  if not exists (select 1 from user_settings where user_id = a
      and notifications_push = true and notifications_whatsapp = false and notifications_email = false) then
    raise exception using errcode='PT001', message='defaults wrong'; end if;

  -- upsert overrides persist.
  insert into user_settings (user_id, notifications_push, notifications_email)
    values (a, false, true)
    on conflict (user_id) do update set notifications_push = excluded.notifications_push,
      notifications_email = excluded.notifications_email;
  if not exists (select 1 from user_settings where user_id = a and notifications_push = false and notifications_email = true) then
    raise exception using errcode='PT001', message='upsert override not persisted'; end if;

  -- own-row RLS: user B cannot read or write A's row.
  perform set_config('request.jwt.claims', format('{"sub":"%s","role":"authenticated"}', b), true);
  if exists (select 1 from user_settings where user_id = a) then
    raise exception using errcode='PT001', message='other user row visible'; end if;
  begin
    update user_settings set notifications_push = true where user_id = a;
    -- update of an invisible row affects 0 rows (no error); assert it did NOT change.
  exception when others then blocked := true;
  end;
  perform set_config('request.jwt.claims', format('{"sub":"%s","role":"authenticated"}', a), true);
  if exists (select 1 from user_settings where user_id = a and notifications_push = true) then
    raise exception using errcode='PT001', message='other user mutated row'; end if;

  raise notice 'OK user_settings';
end $$;
rollback;
```

- [ ] **Step 3: Verify FAIL first.** Create only the test, then:
```bash
export SUPABASE_AUTH_SMS_TWILIO_AUTH_TOKEN=local_test_token
pnpm dlx supabase@latest --workdir infra db reset
docker exec -i supabase_db_padeljam psql -U postgres -d postgres -v ON_ERROR_STOP=1 < infra/supabase/tests/user_settings.sql
```
Expected: `relation "user_settings" does not exist`.

- [ ] **Step 4: Create migration, re-reset, verify PASS:**
```bash
export SUPABASE_AUTH_SMS_TWILIO_AUTH_TOKEN=local_test_token
pnpm dlx supabase@latest --workdir infra db reset
docker exec -i supabase_db_padeljam psql -U postgres -d postgres -v ON_ERROR_STOP=1 < infra/supabase/tests/user_settings.sql
```
Expected: `NOTICE:  OK user_settings`.

- [ ] **Step 5: Commit:**
```bash
git add infra/supabase/migrations/0057_user_settings.sql infra/supabase/tests/user_settings.sql
git commit -m "feat(settings): user_settings table + RLS + SQL test"
```

---

## Task 2: Hand-add `user_settings` DB type

**Files:** Modify `packages/db/src/database.types.ts`.

- [ ] **Step 1: Add the table** to the `Tables` block (alongside others):
```ts
      user_settings: {
        Row: { user_id: string; notifications_push: boolean; notifications_whatsapp: boolean; notifications_email: boolean; updated_at: string }
        Insert: { user_id: string; notifications_push?: boolean; notifications_whatsapp?: boolean; notifications_email?: boolean; updated_at?: string }
        Update: { user_id?: string; notifications_push?: boolean; notifications_whatsapp?: boolean; notifications_email?: boolean; updated_at?: string }
        Relationships: []
      }
```

- [ ] **Step 2: Verify + commit:**
```bash
pnpm --filter @padel/db typecheck && grep -c "user_settings:" packages/db/src/database.types.ts
git add packages/db/src/database.types.ts
git commit -m "chore(db): add user_settings type (hand-added)"
```
Expected: clean typecheck; grep ≥ 1.

---

## Task 3: `@padel/api` settings module

**Files:** Modify `packages/api/src/query-keys.ts`; Create `packages/api/src/settings/queries.ts`, `packages/api/src/settings/mutations.ts`, `packages/api/src/settings/queries.test.ts`; Modify `packages/api/src/index.ts`.

- [ ] **Step 1: Add the key.** In `packages/api/src/query-keys.ts` `qk`:
```ts
  mySettings: (id: string) => ['user-settings', id] as const,
```

- [ ] **Step 2: Key-shape test.** Create `packages/api/src/settings/queries.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { qk } from '../query-keys';

describe('settings query keys', () => {
  it('mySettings shape', () => {
    expect(qk.mySettings('u1')).toEqual(['user-settings', 'u1']);
  });
});
```
Run `pnpm --filter @padel/api test -- settings` → PASS.

- [ ] **Step 3: Queries.** Create `packages/api/src/settings/queries.ts`:
```ts
import { useQuery } from '@tanstack/react-query';
import { useSession } from '@padel/auth';
import { useDb } from '../client';
import { qk } from '../query-keys';

export type NotificationSettings = {
  notifications_push: boolean;
  notifications_whatsapp: boolean;
  notifications_email: boolean;
};

const DEFAULTS: NotificationSettings = {
  notifications_push: true,
  notifications_whatsapp: false,
  notifications_email: false,
};

export const useMySettings = () => {
  const db = useDb();
  const uid = useSession().session?.user.id;
  return useQuery({
    queryKey: qk.mySettings(uid ?? ''),
    enabled: !!uid,
    queryFn: async (): Promise<NotificationSettings> => {
      const { data, error } = await db
        .from('user_settings')
        .select('notifications_push, notifications_whatsapp, notifications_email')
        .eq('user_id', uid!)
        .maybeSingle();
      if (error) throw error;
      return data ?? DEFAULTS;
    },
  });
};
```

- [ ] **Step 4: Mutations.** Create `packages/api/src/settings/mutations.ts`:
```ts
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useSession } from '@padel/auth';
import { useDb } from '../client';
import { qk } from '../query-keys';
import type { NotificationSettings } from './queries';

export const useUpdateSettings = () => {
  const db = useDb();
  const qc = useQueryClient();
  const uid = useSession().session?.user.id;
  return useMutation({
    mutationFn: async (next: NotificationSettings) => {
      const { error } = await db.from('user_settings').upsert({
        user_id: uid!,
        notifications_push: next.notifications_push,
        notifications_whatsapp: next.notifications_whatsapp,
        notifications_email: next.notifications_email,
        updated_at: new Date().toISOString(),
      });
      if (error) throw error;
    },
    onSuccess: () => {
      if (uid) qc.invalidateQueries({ queryKey: qk.mySettings(uid) });
    },
  });
};
```

- [ ] **Step 5: Export.** In `packages/api/src/index.ts` add:
```ts
export * from './settings/queries';
export * from './settings/mutations';
```

- [ ] **Step 6: Verify + commit:**
```bash
pnpm --filter @padel/api test && pnpm --filter @padel/api typecheck
git add packages/api/src/query-keys.ts packages/api/src/settings packages/api/src/index.ts
git commit -m "feat(api): settings module (useMySettings, useUpdateSettings)"
```
Expected: tests pass, typecheck clean.

---

## Task 4: Notification i18n keys

**Files:** Modify `apps/mobile/lib/i18n-mobile.ts`.

- [ ] **Step 1: Merge keys** into the existing `mobileProfile.en` object (keep existing):
```ts
    notifications: 'Notifications',
    notifPush: 'Push notifications',
    notifWhatsapp: 'WhatsApp',
    notifEmail: 'Email',
```

- [ ] **Step 2: Typecheck + commit:**
```bash
pnpm --filter mobile typecheck
git add apps/mobile/lib/i18n-mobile.ts
git commit -m "feat(mobile): notification settings i18n keys"
```

---

## Task 5: Notifications screen + settings-hub row

**Files:** Create `apps/mobile/app/profile/notifications.tsx`; Modify `apps/mobile/app/profile/settings.tsx`.

- [ ] **Step 1: Create the screen** `apps/mobile/app/profile/notifications.tsx`:
```tsx
import { useMySettings, useUpdateSettings, type NotificationSettings } from '@padel/api';
import { useT } from '@padel/i18n';
import { Stack } from 'expo-router';
import { ActivityIndicator, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';

export default function NotificationsScreen() {
  const { t } = useT('profile');
  const settings = useMySettings();
  const update = useUpdateSettings();

  if (settings.isLoading || !settings.data) {
    return <ActivityIndicator color="#0B1F3A" style={{ marginTop: 48 }} />;
  }

  const value = settings.data;
  const toggle = (key: keyof NotificationSettings) => (next: boolean) =>
    update.mutate({ ...value, [key]: next });

  const ROWS: { key: keyof NotificationSettings; label: string }[] = [
    { key: 'notifications_push', label: t('notifPush') },
    { key: 'notifications_whatsapp', label: t('notifWhatsapp') },
    { key: 'notifications_email', label: t('notifEmail') },
  ];

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Stack.Screen options={{ title: t('notifications') }} />
      {ROWS.map((r) => (
        <View key={r.key} style={styles.row}>
          <Text style={styles.rowLabel}>{r.label}</Text>
          <Switch value={value[r.key]} onValueChange={toggle(r.key)} />
        </View>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F7F9FC' },
  content: { padding: 16, gap: 6 },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#fff', borderRadius: 12, paddingHorizontal: 16, paddingVertical: 14 },
  rowLabel: { fontSize: 15, color: '#0B1F3A', fontWeight: '600' },
});
```

- [ ] **Step 2: Add the Notifications row** to `apps/mobile/app/profile/settings.tsx`. The Preferences section currently has the Language row. Add a Notifications row immediately after the language block (after the `{langOpen && …}` map, before the Legal `<Text style={styles.section}>`). The screen already imports `useRouter` (`router`), `Pressable`, `Text`. Insert:
```tsx
      <Pressable style={styles.row} onPress={() => router.push('/profile/notifications')} accessibilityRole="button">
        <Text style={styles.rowLabel}>{t('notifications')}</Text>
      </Pressable>
```

- [ ] **Step 3: Typecheck + commit:**
```bash
pnpm --filter mobile typecheck
git add "apps/mobile/app/profile/notifications.tsx" apps/mobile/app/profile/settings.tsx
git commit -m "feat(mobile): notifications settings screen + hub row"
```
Expected: clean. (`/profile/notifications` matches the existing `/profile/${string}` typed-route pattern.)

---

## Task 6: Full verification

**Files:** none.

- [ ] **Step 1: Fresh DB + SQL test:**
```bash
export SUPABASE_AUTH_SMS_TWILIO_AUTH_TOKEN=local_test_token
pnpm dlx supabase@latest --workdir infra db reset
docker exec -i supabase_db_padeljam psql -U postgres -d postgres -v ON_ERROR_STOP=1 < infra/supabase/tests/user_settings.sql
```
Expected: `NOTICE:  OK user_settings`.

- [ ] **Step 2: Unit tests + workspace typecheck:**
```bash
pnpm --filter @padel/api test && pnpm -w typecheck
```
Expected: PASS, 0 type errors.

- [ ] **Step 3: Manual smoke (iOS simulator, JS only).**
Sign in → Profile → gear → Settings → Notifications. Toggle each switch; reopen the screen → the values persisted. (Push defaults on, WhatsApp/Email off for a fresh user.)

- [ ] **Step 4: Finish the branch.**
Announce: "I'm using the finishing-a-development-branch skill to complete this work." Follow superpowers:finishing-a-development-branch; integration targets `feat/discovery-explore`.

---

## Self-Review notes (addressed)
- **Spec coverage:** table + RLS → Task 1; hand type → Task 2; `useMySettings`/`useUpdateSettings` + `qk.mySettings` → Task 3; i18n → Task 4; toggles screen + hub row → Task 5; verification → Task 6.
- **No placeholders:** complete SQL/TS/TSX in every step; defaults, RLS policies, and the in-app default merge spelled out.
- **Type consistency:** `NotificationSettings` (3 booleans) defined in `settings/queries.ts` (Task 3) and reused in `mutations.ts` + the screen (Task 5). Column names `notifications_push/_whatsapp/_email` identical across Task 1 (SQL), Task 2 (types), Task 3 (hooks). `qk.mySettings(id)` consistent across Task 3 and the test.
- **No row until first toggle:** `useMySettings` returns `DEFAULTS` when `maybeSingle()` is null; the first `upsert` creates the row.
- **Deferred:** delivery (Phase 2), account security (1B-2c), app-icon/support (1B-2d).
