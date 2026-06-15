# Phase 1B-2d-1 — Support (Contact + section) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a contact-support flow (a `support_tickets` table + a form) and a Support section in settings (Contact support, Help center, Share).

**Architecture:** A `support_tickets` table (own-row RLS). `useCreateSupportTicket` in the existing `@padel/api` settings module inserts a ticket. A `/profile/support` screen submits and shows an SLA confirmation; the settings hub gains a Support section.

**Tech Stack:** Supabase Postgres (RLS), `@tanstack/react-query`, Expo Router, RN `Linking`/`Share`, Vitest (SQL test via psql).

**Spec:** `docs/superpowers/specs/2026-06-14-phase1b2d1-support-design.md`. **Branch:** `feat/phase1b2d-support` (off `main`). **Migration `0060`.**

## Resolved facts
- No `support_tickets` table. `settings` module (`packages/api/src/settings/{queries,mutations}.ts`) exists; `mutations.ts` already imports `useMutation`/`useSession`/`useDb`.
- `settings.tsx` has `TERMS_URL`/`PRIVACY_URL` constants + a `legal` section; `Linking` is imported there. `Share` is RN built-in (used in `ProfileView.tsx`).
- DB types CLI crashes (AVX) → hand-edit `database.types.ts`.

## File Structure
```
infra/supabase/migrations/0060_support_tickets.sql   support_tickets table + RLS
infra/supabase/tests/support_tickets.sql             insert/own-row test
packages/db/src/database.types.ts                    (modify: + support_tickets table)
packages/api/src/settings/mutations.ts               (modify: + useCreateSupportTicket)
apps/mobile/lib/i18n-mobile.ts                        (modify: + support keys)
apps/mobile/app/profile/support.tsx                  (create: contact form)
apps/mobile/app/profile/settings.tsx                 (modify: + Support section)
```

---

## Task 1: `support_tickets` migration + SQL test

**Files:** Create `infra/supabase/migrations/0060_support_tickets.sql`; Test `infra/supabase/tests/support_tickets.sql`.

- [ ] **Step 1: Migration** `infra/supabase/migrations/0060_support_tickets.sql`:
```sql
create table support_tickets (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references profiles(id) on delete cascade,
  title       text not null,
  description text not null,
  status      text not null default 'open' check (status in ('open','responded','closed')),
  created_at  timestamptz not null default now()
);
alter table support_tickets enable row level security;
grant select, insert on support_tickets to authenticated;
create policy "support_tickets: select" on support_tickets for select using (user_id = auth.uid());
create policy "support_tickets: insert" on support_tickets for insert with check (user_id = auth.uid());
```

- [ ] **Step 2: Test** `infra/supabase/tests/support_tickets.sql`:
```sql
-- support_tickets: a user creates + reads own; another user can't read it; status defaults open.
begin;
insert into auth.users (id, instance_id, aud, role, email) values
  ('f6000001-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000000','authenticated','authenticated','sup1@x.com'),
  ('f6000002-0000-0000-0000-000000000002','00000000-0000-0000-0000-000000000000','authenticated','authenticated','sup2@x.com') on conflict do nothing;
insert into profiles (id, email, phone, full_name) values
  ('f6000001-0000-0000-0000-000000000001','sup1@x.com','+351900030001','Sup One'),
  ('f6000002-0000-0000-0000-000000000002','sup2@x.com','+351900030002','Sup Two') on conflict do nothing;

do $$
declare a constant uuid := 'f6000001-0000-0000-0000-000000000001';
  b constant uuid := 'f6000002-0000-0000-0000-000000000002';
begin
  perform set_config('role','authenticated',true);
  perform set_config('request.jwt.claims', format('{"sub":"%s","role":"authenticated"}', a), true);

  insert into support_tickets (user_id, title, description) values (a, 'Help', 'Something broke');
  if not exists (select 1 from support_tickets where user_id = a and title = 'Help' and status = 'open') then
    raise exception using errcode='PT001', message='ticket not created with default status'; end if;

  -- user B cannot see A's ticket.
  perform set_config('request.jwt.claims', format('{"sub":"%s","role":"authenticated"}', b), true);
  if exists (select 1 from support_tickets where user_id = a) then
    raise exception using errcode='PT001', message='other user ticket visible'; end if;

  raise notice 'OK support_tickets';
end $$;
rollback;
```

- [ ] **Step 3: Verify FAIL first.** Create only the test, then:
```bash
export SUPABASE_AUTH_SMS_TWILIO_AUTH_TOKEN=local_test_token
pnpm dlx supabase@latest --workdir infra db reset
docker exec -i supabase_db_padeljam psql -U postgres -d postgres -v ON_ERROR_STOP=1 < infra/supabase/tests/support_tickets.sql
```
Expected: `relation "support_tickets" does not exist`.

- [ ] **Step 4: Create migration, re-reset, verify PASS:**
```bash
export SUPABASE_AUTH_SMS_TWILIO_AUTH_TOKEN=local_test_token
pnpm dlx supabase@latest --workdir infra db reset
docker exec -i supabase_db_padeljam psql -U postgres -d postgres -v ON_ERROR_STOP=1 < infra/supabase/tests/support_tickets.sql
```
Expected: `NOTICE:  OK support_tickets`.

- [ ] **Step 5: Commit:**
```bash
git add infra/supabase/migrations/0060_support_tickets.sql infra/supabase/tests/support_tickets.sql
git commit -m "feat(support): support_tickets table + RLS + SQL test"
```

---

## Task 2: Hand-add `support_tickets` DB type

**Files:** Modify `packages/db/src/database.types.ts`.

- [ ] **Step 1: Add the table** to the `Tables` block (alongside others):
```ts
      support_tickets: {
        Row: { id: string; user_id: string; title: string; description: string; status: string; created_at: string }
        Insert: { id?: string; user_id: string; title: string; description: string; status?: string; created_at?: string }
        Update: { id?: string; user_id?: string; title?: string; description?: string; status?: string; created_at?: string }
        Relationships: []
      }
```

- [ ] **Step 2: Verify + commit:**
```bash
pnpm --filter @padel/db typecheck && grep -c "support_tickets:" packages/db/src/database.types.ts
git add packages/db/src/database.types.ts
git commit -m "chore(db): add support_tickets type (hand-added)"
```
Expected: clean typecheck; grep ≥ 1.

---

## Task 3: `useCreateSupportTicket`

**Files:** Modify `packages/api/src/settings/mutations.ts`.

- [ ] **Step 1: Append the hook** to `packages/api/src/settings/mutations.ts`:
```ts
export const useCreateSupportTicket = () => {
  const db = useDb();
  const uid = useSession().session?.user.id;
  return useMutation({
    mutationFn: async (input: { title: string; description: string }) => {
      const { error } = await db.from('support_tickets').insert({
        user_id: uid!,
        title: input.title,
        description: input.description,
      });
      if (error) throw error;
    },
  });
};
```
(`useMutation`/`useSession`/`useDb` are already imported in this file; `useQueryClient` not needed.)

- [ ] **Step 2: Verify + commit:**
```bash
pnpm --filter @padel/api test && pnpm --filter @padel/api typecheck
git add packages/api/src/settings/mutations.ts
git commit -m "feat(api): useCreateSupportTicket"
```
Expected: tests pass (existing), typecheck clean. (Rides the existing `export * from './settings/mutations'` barrel — no index change.)

---

## Task 4: Support i18n keys

**Files:** Modify `apps/mobile/lib/i18n-mobile.ts`.

- [ ] **Step 1: Merge keys** into the existing `mobileProfile.en` object (keep existing):
```ts
    support: 'Support',
    contactSupport: 'Contact support',
    supportTitle: 'Subject',
    supportDescription: 'How can we help?',
    supportSend: 'Send',
    supportSent: "Thanks — we'll get back to you within 5 days.",
    helpCenter: 'Help center',
    shareApp: 'Share the app',
    shareMessage: 'Check out PadelJam — find padel games, groups, and players near you.',
    supportFailed: 'Please add a subject and a message.',
```

- [ ] **Step 2: Typecheck + commit:**
```bash
pnpm --filter mobile typecheck
git add apps/mobile/lib/i18n-mobile.ts
git commit -m "feat(mobile): support i18n keys"
```

---

## Task 5: Support screen + settings Support section

**Files:** Create `apps/mobile/app/profile/support.tsx`; Modify `apps/mobile/app/profile/settings.tsx`.

- [ ] **Step 1: Create the screen** `apps/mobile/app/profile/support.tsx`:
```tsx
import { useCreateSupportTicket } from '@padel/api';
import { useT } from '@padel/i18n';
import { Stack, useRouter } from 'expo-router';
import { useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, TextInput } from 'react-native';

export default function SupportScreen() {
  const { t } = useT('profile');
  const router = useRouter();
  const create = useCreateSupportTicket();
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onSend = async () => {
    if (busy) return;
    if (!title.trim() || !description.trim()) {
      setError(t('supportFailed'));
      return;
    }
    setError(null);
    setBusy(true);
    try {
      await create.mutateAsync({ title: title.trim(), description: description.trim() });
      Alert.alert(t('supportSent'), undefined, [{ text: 'OK', onPress: () => router.back() }]);
    } catch {
      setError(t('supportFailed'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Stack.Screen options={{ title: t('contactSupport') }} />
      <Text style={styles.label}>{t('supportTitle')}</Text>
      <TextInput style={styles.input} value={title} onChangeText={setTitle} />
      <Text style={styles.label}>{t('supportDescription')}</Text>
      <TextInput style={[styles.input, styles.multiline]} value={description} onChangeText={setDescription} multiline />
      {error ? <Text style={styles.error}>{error}</Text> : null}
      <Pressable style={[styles.send, busy && styles.sendDisabled]} onPress={onSend} disabled={busy} accessibilityRole="button">
        <Text style={styles.sendText}>{t('supportSend')}</Text>
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F7F9FC' },
  content: { padding: 16, gap: 8 },
  label: { fontSize: 13, fontWeight: '600', color: '#0B1F3A', marginTop: 8 },
  input: { borderWidth: 1, borderColor: '#ccc', borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, fontSize: 16, backgroundColor: '#fff' },
  multiline: { minHeight: 100, textAlignVertical: 'top' },
  error: { color: '#D7263D', fontSize: 13 },
  send: { backgroundColor: '#0B7BFF', borderRadius: 12, paddingVertical: 14, alignItems: 'center', marginTop: 16 },
  sendDisabled: { opacity: 0.6 },
  sendText: { color: '#fff', fontWeight: '700', fontSize: 16 },
});
```

- [ ] **Step 2: Add the Support section** to `apps/mobile/app/profile/settings.tsx`.
  - At the top with the other URL constants (`TERMS_URL`/`PRIVACY_URL`), add: `const HELP_URL = 'https://padeljam.app/help';`
  - Add `Share` to the `react-native` import (it currently imports `Linking, Pressable, ScrollView, StyleSheet, Text`): `import { Linking, Pressable, ScrollView, Share, StyleSheet, Text } from 'react-native';`
  - Insert a Support section immediately before the `<Text style={styles.section}>{t('legal')}</Text>` line:
```tsx
      <Text style={styles.section}>{t('support')}</Text>
      <Pressable style={styles.row} onPress={() => router.push('/profile/support')} accessibilityRole="button">
        <Text style={styles.rowLabel}>{t('contactSupport')}</Text>
      </Pressable>
      <Pressable style={styles.row} onPress={() => void Linking.openURL(HELP_URL)} accessibilityRole="button">
        <Text style={styles.rowLabel}>{t('helpCenter')}</Text>
      </Pressable>
      <Pressable style={styles.row} onPress={() => void Share.share({ message: t('shareMessage') })} accessibilityRole="button">
        <Text style={styles.rowLabel}>{t('shareApp')}</Text>
      </Pressable>

```

- [ ] **Step 3: Typecheck + commit:**
```bash
pnpm --filter mobile typecheck
git add "apps/mobile/app/profile/support.tsx" apps/mobile/app/profile/settings.tsx
git commit -m "feat(mobile): support screen + settings Support section"
```
Expected: clean (`/profile/support` matches the existing `/profile/${string}` typed-route pattern).

---

## Task 6: Full verification

**Files:** none.

- [ ] **Step 1: Fresh DB + SQL test:**
```bash
export SUPABASE_AUTH_SMS_TWILIO_AUTH_TOKEN=local_test_token
pnpm dlx supabase@latest --workdir infra db reset
docker exec -i supabase_db_padeljam psql -U postgres -d postgres -v ON_ERROR_STOP=1 < infra/supabase/tests/support_tickets.sql
```
Expected: `NOTICE:  OK support_tickets`.

- [ ] **Step 2: Unit tests + workspace typecheck:**
```bash
pnpm --filter @padel/api test && pnpm -w typecheck
```
Expected: PASS, 0 type errors.

- [ ] **Step 3: Manual smoke (iOS simulator, JS only).**
Sign in → Profile → gear → Settings → Support → Contact support → fill subject + message → Send → SLA alert → back; the ticket exists in the DB (`select * from support_tickets order by created_at desc limit 1`). Help center opens the browser; Share opens the share sheet; sending with an empty field shows the inline message.

- [ ] **Step 4: Finish the branch.**
Announce: "I'm using the finishing-a-development-branch skill to complete this work." Follow superpowers:finishing-a-development-branch; integration targets `main`.

---

## Self-Review notes (addressed)
- **Spec coverage:** table + RLS → Task 1; hand type → Task 2; `useCreateSupportTicket` → Task 3; i18n → Task 4; support screen + Support section (Contact/Help/Share) → Task 5; verification → Task 6.
- **No placeholders:** complete SQL/TS/TSX; the `HELP_URL`/`shareMessage` constants spelled out.
- **Type consistency:** `support_tickets` columns identical across Task 1 (SQL), Task 2 (types), Task 3 (insert). `useCreateSupportTicket({ title, description })` matches the Task 5 call site. i18n keys used in Task 5 (`support`, `contactSupport`, `supportTitle`, `supportDescription`, `supportSend`, `supportSent`, `helpCenter`, `shareApp`, `shareMessage`, `supportFailed`) all added in Task 4.
- **Fire-and-forget:** no `qk`/invalidation (no list query); SLA `Alert` on success.
- **Deferred:** app-icon picker (1B-2d-2), Rate-the-app, ticket history.
```
