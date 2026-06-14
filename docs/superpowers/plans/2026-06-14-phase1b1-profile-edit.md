# Phase 1B-1 — Edit Profile Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let users edit their own profile (name, bio, avatar, hand, side, preferred time, gender, date of birth), persisted to `profiles`, reached from an Edit button on the own-profile view.

**Architecture:** Migration `0056` adds the four `profiles` columns, creates a public `avatars` storage bucket with own-folder write policies, and re-creates `get_player_profile` to also return `description` + `preferred_time`. A new edit screen prefilled by `useMyProfile()` saves via `useUpdateProfile()` (direct RLS-guarded `profiles` update); avatar uploads on save via the existing storage helpers.

**Tech Stack:** Supabase Postgres + Storage, `@tanstack/react-query`, Expo Router, `expo-image`/`expo-image-picker`, Vitest.

**Spec:** `docs/superpowers/specs/2026-06-14-phase1b1-profile-edit-design.md`. **Branch:** `feat/phase1b-profile-edit` (off `feat/discovery-explore`). **Migration: `0056`** (`0054` reserved by 0B).

## Resolved facts
- `profiles` current columns include `full_name, avatar_url, dominant_hand ('left'|'right'), court_side ('left'|'right'), locale, location_text, location_point`. RLS update policy: `using (id = auth.uid())`; read policy is block-aware (from 0055).
- No `avatars` bucket exists yet (`0026_storage_buckets.sql` only creates community buckets). `avatarUrl()` (`apps/mobile/lib/community-images.ts`, `AVATAR_BUCKET='avatars'`) reads it via `getPublicUrl`.
- Storage policy pattern (0026): `(storage.foldername(name))[1]` is the first path segment.
- `uploadCommunityImage(client, bucket, folderId, uri, mimeType) -> path` is generic (reuse with bucket `'avatars'`, folderId `uid`). `pickAndValidateImage()` returns `{ uri, mimeType, ... } | null`.
- `ChoiceRow` is exported from `@/components/OnboardingStep` (`{ value, onChange, options: {key,label}[] }`).
- `get_player_profile` currently returns (id, full_name, avatar_url, dominant_hand, court_side, location_text, played_matches, best_position, followers_count, following_count, is_following, is_followed_by) — block-aware, `security definer`.
- DB types CLI crashes (AVX) → hand-edit.

## File Structure
```
infra/supabase/migrations/0056_profile_fields.sql   columns + avatars bucket/policies + get_player_profile re-create
infra/supabase/tests/profile_fields.sql             new-field persistence + CHECK + RPC return
packages/db/src/database.types.ts                   (modify: profiles Row/Insert/Update + get_player_profile Returns)
packages/api/src/query-keys.ts                       (modify: + myProfile key)
packages/api/src/profile/queries.ts                  (modify: + useMyProfile)
packages/api/src/profile/mutations.ts                (modify: + useUpdateProfile)
packages/api/src/profile/queries.test.ts             (modify: + myProfile key assertion)
apps/mobile/lib/i18n-mobile.ts                       (modify: + profile edit keys)
apps/mobile/components/profile/ProfileView.tsx       (modify: Edit button + bio + preferred_time)
apps/mobile/app/profile/edit.tsx                     (create: edit form)
```

---

## Task 1: Migration `0056` + SQL test

**Files:** Create `infra/supabase/migrations/0056_profile_fields.sql`; Test `infra/supabase/tests/profile_fields.sql`.

- [ ] **Step 1: Write the migration** `infra/supabase/migrations/0056_profile_fields.sql`:
```sql
-- Phase 1B-1: editable profile fields + avatar storage.
alter table profiles
  add column description    text,
  add column date_of_birth  date,
  add column gender         text check (gender in ('male','female')),
  add column preferred_time text check (preferred_time in ('any','morning','afternoon','night'));

-- Public avatars bucket; each user writes only their own {uid}/ folder (mirrors 0026 pattern).
insert into storage.buckets (id, name, public) values ('avatars','avatars', true)
  on conflict (id) do nothing;
create policy "avatar write: self" on storage.objects for insert to authenticated
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "avatar update: self" on storage.objects for update to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "avatar delete: self" on storage.objects for delete to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

-- Re-create get_player_profile to also return description + preferred_time (block logic unchanged).
create or replace function get_player_profile(p_target uuid)
returns table (
  id uuid, full_name text, avatar_url text, dominant_hand text, court_side text, location_text text,
  description text, preferred_time text,
  played_matches bigint, best_position int, followers_count bigint, following_count bigint,
  is_following boolean, is_followed_by boolean
)
language sql stable security definer set search_path = public as $$
  select
    p.id, p.full_name, p.avatar_url, p.dominant_hand, p.court_side, p.location_text,
    p.description, p.preferred_time,
    (select count(*) from group_event_results r where r.user_id = p.id),
    (select min(r.final_placement) from group_event_results r where r.user_id = p.id),
    (select count(*) from follows f where f.followee_id = p.id),
    (select count(*) from follows f where f.follower_id = p.id),
    exists (select 1 from follows f where f.follower_id = auth.uid() and f.followee_id = p.id),
    exists (select 1 from follows f where f.follower_id = p.id and f.followee_id = auth.uid())
  from profiles p
  where p.id = p_target
    and not exists (
      select 1 from blocks b
      where (b.blocker_id = auth.uid() and b.blocked_id = p_target)
         or (b.blocker_id = p_target and b.blocked_id = auth.uid())
    );
$$;
```

- [ ] **Step 2: Write the failing test** `infra/supabase/tests/profile_fields.sql`:
```sql
-- Phase 1B-1: new profile fields persist, are returned by get_player_profile, and CHECK-guarded.
begin;
insert into auth.users (id, instance_id, aud, role, email) values
  ('f2000001-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000000','authenticated','authenticated','pf1@x.com') on conflict do nothing;
insert into profiles (id, email, phone, full_name) values
  ('f2000001-0000-0000-0000-000000000001','pf1@x.com','+351900800001','Edit Me') on conflict do nothing;

do $$
declare me constant uuid := 'f2000001-0000-0000-0000-000000000001'; rejected boolean := false;
begin
  perform set_config('role','authenticated',true);
  perform set_config('request.jwt.claims', format('{"sub":"%s","role":"authenticated"}', me), true);

  update profiles set description='Bio here', preferred_time='morning', gender='male', date_of_birth=date '1990-05-01'
    where id = me;

  if not exists (select 1 from get_player_profile(me) where description = 'Bio here' and preferred_time = 'morning') then
    raise exception using errcode='PT001', message='new fields not returned by get_player_profile'; end if;

  -- CHECK rejects an invalid preferred_time (nested block = implicit savepoint).
  begin
    update profiles set preferred_time = 'whenever' where id = me;
  exception when check_violation then rejected := true;
  end;
  if not rejected then raise exception using errcode='PT001', message='invalid preferred_time accepted'; end if;

  raise notice 'OK profile_fields';
end $$;
rollback;
```

- [ ] **Step 3: Verify FAIL first.** Create only the test, then:
```bash
export SUPABASE_AUTH_SMS_TWILIO_AUTH_TOKEN=local_test_token
pnpm dlx supabase@latest --workdir infra db reset
docker exec -i supabase_db_padeljam psql -U postgres -d postgres -v ON_ERROR_STOP=1 < infra/supabase/tests/profile_fields.sql
```
Expected: error `column "description" of relation "profiles" does not exist` (or similar).

- [ ] **Step 4: Create the migration, re-reset, verify PASS:**
```bash
export SUPABASE_AUTH_SMS_TWILIO_AUTH_TOKEN=local_test_token
pnpm dlx supabase@latest --workdir infra db reset
docker exec -i supabase_db_padeljam psql -U postgres -d postgres -v ON_ERROR_STOP=1 < infra/supabase/tests/profile_fields.sql
```
Expected: `NOTICE:  OK profile_fields`.

- [ ] **Step 5: Commit:**
```bash
git add infra/supabase/migrations/0056_profile_fields.sql infra/supabase/tests/profile_fields.sql
git commit -m "feat(profile): editable profile fields + avatars bucket + RPC fields"
```

---

## Task 2: Hand-update DB types

**Files:** Modify `packages/db/src/database.types.ts`.

- [ ] **Step 1: Add the four columns** to the `profiles` `Row`, `Insert`, and `Update` objects (find `profiles: {` near line 1492). Add to **Row** (non-optional, nullable):
```ts
          date_of_birth: string | null
          description: string | null
          gender: string | null
          preferred_time: string | null
```
Add the same four keys to **Insert** and **Update** as optional (`date_of_birth?: string | null`, `description?: string | null`, `gender?: string | null`, `preferred_time?: string | null`).

- [ ] **Step 2: Extend `get_player_profile` Returns** (find `get_player_profile:` in the `Functions` block) — add `description: string | null` and `preferred_time: string | null` to the `Returns` object (alongside the existing fields).

- [ ] **Step 3: Verify + commit:**
```bash
pnpm --filter @padel/db typecheck && grep -c "preferred_time" packages/db/src/database.types.ts
git add packages/db/src/database.types.ts
git commit -m "chore(db): profile field types (hand-added)"
```
Expected: clean typecheck; grep ≥ 2 (profiles Row/Insert/Update + RPC each add it → ≥ 5 actually).

---

## Task 3: `useMyProfile` + `useUpdateProfile`

**Files:** Modify `packages/api/src/query-keys.ts`, `packages/api/src/profile/queries.ts`, `packages/api/src/profile/mutations.ts`, `packages/api/src/profile/queries.test.ts`.

- [ ] **Step 1: Add the key.** In `packages/api/src/query-keys.ts` `qk`:
```ts
  myProfile: (id: string) => ['profile', id, 'edit'] as const,
```

- [ ] **Step 2: Extend the key-shape test.** In `packages/api/src/profile/queries.test.ts`, add inside the existing `describe`:
```ts
  it('myProfile key shape', () => {
    expect(qk.myProfile('u1')).toEqual(['profile', 'u1', 'edit']);
  });
```
Run `pnpm --filter @padel/api test -- queries.test.ts` → PASS.

- [ ] **Step 3: Add `useMyProfile`.** Append to `packages/api/src/profile/queries.ts`:
```ts
export const useMyProfile = () => {
  const db = useDb();
  const uid = useSession().session?.user.id;
  return useQuery({
    queryKey: qk.myProfile(uid ?? ''),
    enabled: !!uid,
    queryFn: async () => {
      const { data, error } = await db
        .from('profiles')
        .select('id, full_name, avatar_url, description, date_of_birth, gender, dominant_hand, court_side, preferred_time')
        .eq('id', uid!)
        .single();
      if (error) throw error;
      return data;
    },
  });
};
```

- [ ] **Step 4: Add `useUpdateProfile`.** Append to `packages/api/src/profile/mutations.ts`:
```ts
export type UpdateProfileInput = {
  full_name?: string;
  description?: string | null;
  dominant_hand?: string | null;
  court_side?: string | null;
  gender?: string | null;
  preferred_time?: string | null;
  date_of_birth?: string | null;
  avatar_url?: string | null;
};

export const useUpdateProfile = () => {
  const db = useDb();
  const qc = useQueryClient();
  const uid = useSession().session?.user.id;
  return useMutation({
    mutationFn: async (input: UpdateProfileInput) => {
      const { error } = await db.from('profiles').update(input).eq('id', uid!);
      if (error) throw error;
    },
    onSuccess: () => {
      if (uid) {
        qc.invalidateQueries({ queryKey: qk.profile(uid) });
        qc.invalidateQueries({ queryKey: qk.myProfile(uid) });
      }
    },
  });
};
```

- [ ] **Step 5: Verify + commit:**
```bash
pnpm --filter @padel/api test && pnpm --filter @padel/api typecheck
git add packages/api/src/query-keys.ts packages/api/src/profile/queries.ts packages/api/src/profile/mutations.ts packages/api/src/profile/queries.test.ts
git commit -m "feat(api): useMyProfile + useUpdateProfile"
```
Expected: tests pass, typecheck clean.

---

## Task 4: Profile i18n additions

**Files:** Modify `apps/mobile/lib/i18n-mobile.ts`.

- [ ] **Step 1: Merge keys** into the existing `mobileProfile.en` object (keep existing keys):
```ts
    edit: 'Edit',
    editTitle: 'Edit profile',
    name: 'Name',
    bio: 'Bio',
    avatarHint: 'Tap to change photo',
    handLabel: 'Dominant hand',
    sideLabel: 'Preferred side',
    handLeft: 'Left',
    handRight: 'Right',
    sideLeft: 'Left',
    sideRight: 'Right',
    genderLabel: 'Gender',
    genderMale: 'Male',
    genderFemale: 'Female',
    timeLabel: 'Preferred time',
    timeAny: 'Any',
    timeMorning: 'Morning',
    timeAfternoon: 'Afternoon',
    timeNight: 'Night',
    dobLabel: 'Date of birth',
    dobInvalid: 'Use format YYYY-MM-DD',
    save: 'Save',
```

- [ ] **Step 2: Typecheck + commit:**
```bash
pnpm --filter mobile typecheck
git add apps/mobile/lib/i18n-mobile.ts
git commit -m "feat(mobile): profile edit i18n keys"
```

---

## Task 5: Edit screen + ProfileView updates

**Files:** Create `apps/mobile/app/profile/edit.tsx`; Modify `apps/mobile/components/profile/ProfileView.tsx`.

- [ ] **Step 1: Create the edit screen** `apps/mobile/app/profile/edit.tsx`:
```tsx
import { useMyProfile, useUpdateProfile } from '@padel/api';
import { useSession } from '@padel/auth';
import { useT } from '@padel/i18n';
import { Image } from 'expo-image';
import { Stack, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import { ChoiceRow } from '@/components/OnboardingStep';
import { avatarUrl } from '@/lib/community-images';
import { supabase } from '@/lib/supabase';
import { pickAndValidateImage, uploadCommunityImage } from '@/lib/storage';

const DOB_RE = /^\d{4}-\d{2}-\d{2}$/;

export default function EditProfileScreen() {
  const { t } = useT('profile');
  const router = useRouter();
  const uid = useSession().session?.user.id;
  const my = useMyProfile();
  const update = useUpdateProfile();

  const [fullName, setFullName] = useState('');
  const [bio, setBio] = useState('');
  const [hand, setHand] = useState<string | null>(null);
  const [side, setSide] = useState<string | null>(null);
  const [gender, setGender] = useState<string | null>(null);
  const [time, setTime] = useState<string | null>(null);
  const [dob, setDob] = useState('');
  const [avatarPath, setAvatarPath] = useState<string | null>(null);
  const [picked, setPicked] = useState<{ uri: string; mimeType: string } | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const p = my.data;
    if (!p) return;
    setFullName(p.full_name ?? '');
    setBio(p.description ?? '');
    setHand(p.dominant_hand ?? null);
    setSide(p.court_side ?? null);
    setGender(p.gender ?? null);
    setTime(p.preferred_time ?? null);
    setDob(p.date_of_birth ?? '');
    setAvatarPath(p.avatar_url ?? null);
  }, [my.data]);

  const onPickAvatar = async () => {
    const img = await pickAndValidateImage();
    if (img) setPicked({ uri: img.uri, mimeType: img.mimeType });
  };

  const onSave = async () => {
    if (saving || !uid) return;
    if (dob.trim() && !DOB_RE.test(dob.trim())) {
      setError(t('dobInvalid'));
      return;
    }
    setError(null);
    setSaving(true);
    try {
      let nextAvatar = avatarPath;
      if (picked) {
        nextAvatar = await uploadCommunityImage(supabase, 'avatars', uid, picked.uri, picked.mimeType);
      }
      await update.mutateAsync({
        full_name: fullName.trim() || undefined,
        description: bio.trim() || null,
        dominant_hand: hand,
        court_side: side,
        gender,
        preferred_time: time,
        date_of_birth: dob.trim() || null,
        avatar_url: nextAvatar,
      });
      router.back();
    } finally {
      setSaving(false);
    }
  };

  if (my.isLoading) return <ActivityIndicator color="#0B1F3A" style={{ marginTop: 48 }} />;

  const shownAvatar = picked ? picked.uri : avatarUrl(avatarPath);

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Stack.Screen options={{ title: t('editTitle') }} />
      <Pressable style={styles.avatarWrap} onPress={onPickAvatar} accessibilityRole="button">
        <View style={styles.avatar}>
          {shownAvatar ? <Image source={{ uri: shownAvatar }} style={styles.avatarImg} /> : null}
        </View>
        <Text style={styles.avatarHint}>{t('avatarHint')}</Text>
      </Pressable>

      <Text style={styles.label}>{t('name')}</Text>
      <TextInput style={styles.input} value={fullName} onChangeText={setFullName} autoCapitalize="words" />

      <Text style={styles.label}>{t('bio')}</Text>
      <TextInput style={[styles.input, styles.multiline]} value={bio} onChangeText={setBio} multiline />

      <Text style={styles.label}>{t('handLabel')}</Text>
      <ChoiceRow value={hand} onChange={setHand} options={[{ key: 'left', label: t('handLeft') }, { key: 'right', label: t('handRight') }]} />

      <Text style={styles.label}>{t('sideLabel')}</Text>
      <ChoiceRow value={side} onChange={setSide} options={[{ key: 'left', label: t('sideLeft') }, { key: 'right', label: t('sideRight') }]} />

      <Text style={styles.label}>{t('genderLabel')}</Text>
      <ChoiceRow value={gender} onChange={setGender} options={[{ key: 'male', label: t('genderMale') }, { key: 'female', label: t('genderFemale') }]} />

      <Text style={styles.label}>{t('timeLabel')}</Text>
      <ChoiceRow
        value={time}
        onChange={setTime}
        options={[
          { key: 'any', label: t('timeAny') },
          { key: 'morning', label: t('timeMorning') },
          { key: 'afternoon', label: t('timeAfternoon') },
          { key: 'night', label: t('timeNight') },
        ]}
      />

      <Text style={styles.label}>{t('dobLabel')}</Text>
      <TextInput style={styles.input} value={dob} onChangeText={setDob} placeholder="YYYY-MM-DD" autoCapitalize="none" />

      {error ? <Text style={styles.error}>{error}</Text> : null}

      <Pressable style={[styles.save, saving && styles.saveDisabled]} onPress={onSave} disabled={saving} accessibilityRole="button">
        <Text style={styles.saveText}>{t('save')}</Text>
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F7F9FC' },
  content: { padding: 16, gap: 8, paddingBottom: 48 },
  avatarWrap: { alignItems: 'center', gap: 6, marginBottom: 8 },
  avatar: { width: 96, height: 96, borderRadius: 48, backgroundColor: '#E6F0FF', overflow: 'hidden' },
  avatarImg: { width: 96, height: 96 },
  avatarHint: { color: '#0B7BFF', fontSize: 13, fontWeight: '600' },
  label: { fontSize: 13, fontWeight: '600', color: '#0B1F3A', marginTop: 8 },
  input: { borderWidth: 1, borderColor: '#ccc', borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, fontSize: 16, backgroundColor: '#fff' },
  multiline: { minHeight: 72, textAlignVertical: 'top' },
  error: { color: '#D7263D', fontSize: 13 },
  save: { backgroundColor: '#0B7BFF', borderRadius: 12, paddingVertical: 14, alignItems: 'center', marginTop: 16 },
  saveDisabled: { opacity: 0.6 },
  saveText: { color: '#fff', fontWeight: '700', fontSize: 16 },
});
```

- [ ] **Step 2: Update `ProfileView`** (`apps/mobile/components/profile/ProfileView.tsx`):
  - Add an **Edit** button when `isSelf`. Inside the header, after the `<Text style={styles.name}>` line, add:
    ```tsx
    {isSelf && (
      <Pressable style={styles.editBtn} onPress={() => router.push('/profile/edit')} accessibilityRole="button">
        <Text style={styles.editText}>{t('edit')}</Text>
      </Pressable>
    )}
    ```
  - Show the bio under the name (after the counts block or under name) — add `{p.description ? <Text style={styles.bio}>{p.description}</Text> : null}` right after the name `<Text>`.
  - Add styles: `editBtn: { borderWidth: 1, borderColor: '#0B7BFF', borderRadius: 20, paddingHorizontal: 24, paddingVertical: 8 }`, `editText: { color: '#0B7BFF', fontWeight: '700' }`, `bio: { fontSize: 14, color: '#3A4757', textAlign: 'center', paddingHorizontal: 24 }`.
  - (The `p.description`/`p.preferred_time` fields now exist on the `useProfile` result from Task 2's RPC-type extension. Optionally show preferred time near stats — keep minimal: bio + Edit button satisfy the spec.)

- [ ] **Step 3: Typecheck + commit:**
```bash
pnpm --filter mobile typecheck
git add "apps/mobile/app/profile/edit.tsx" apps/mobile/components/profile/ProfileView.tsx
git commit -m "feat(mobile): edit-profile screen + Edit button & bio on profile"
```
Expected: clean. (If expo-router flags `/profile/edit` as an unknown typed route, the route file exists so it resolves after a Metro typegen — see Task 6 note.)

---

## Task 6: Full verification

**Files:** none.

- [ ] **Step 1: Fresh DB + SQL test:**
```bash
export SUPABASE_AUTH_SMS_TWILIO_AUTH_TOKEN=local_test_token
pnpm dlx supabase@latest --workdir infra db reset
docker exec -i supabase_db_padeljam psql -U postgres -d postgres -v ON_ERROR_STOP=1 < infra/supabase/tests/profile_fields.sql
```
Expected: `NOTICE:  OK profile_fields`.

- [ ] **Step 2: Unit tests + workspace typecheck:**
```bash
pnpm --filter @padel/api test && pnpm -w typecheck
```
Expected: PASS, 0 type errors. **If** the mobile typecheck errors on the `/profile/edit` typed route being unknown, regenerate expo-router types by briefly starting Metro: `cd apps/mobile && CI=1 npx expo start --no-dev` until "Waiting on http://localhost:8081" appears, then stop it, and re-run `pnpm -w typecheck`.

- [ ] **Step 3: Manual smoke (iOS simulator, JS only).**
Sign in → Profile tab → Edit → change name/bio/hand/side/gender/time/dob → Save → values persist and the profile shows the bio. Pick a new avatar → it uploads to the `avatars` bucket and displays. Invalid dob (e.g. `1990/01/01`) shows the inline `dobInvalid` message and blocks save.

- [ ] **Step 4: Finish the branch.**
Announce: "I'm using the finishing-a-development-branch skill to complete this work." Follow superpowers:finishing-a-development-branch; integration targets `feat/discovery-explore` (stacked).

---

## Self-Review notes (addressed)
- **Spec coverage:** columns + avatars bucket + RPC re-create → Task 1; hand types → Task 2; `useMyProfile`/`useUpdateProfile` → Task 3; i18n → Task 4; edit screen + Edit button + bio → Task 5; verification → Task 6.
- **No placeholders:** complete SQL/TS/TSX in every step; dob regex, gender/time option keys, avatar upload-on-save flow all spelled out.
- **Type consistency:** `profiles` columns `description`/`date_of_birth`/`gender`/`preferred_time` named identically across Task 1 (SQL), Task 2 (types), Task 3 (`useMyProfile` select + `UpdateProfileInput`), Task 5 (form state mapping). `qk.myProfile(id)` consistent between Task 3 Step 1, the test, and the hooks. `get_player_profile` Returns gains `description`/`preferred_time` (Task 1 SQL ↔ Task 2 types ↔ Task 5 `p.description` usage).
- **RLS/safety:** edit writes only the caller's row (`.eq('id', uid)` + RLS `id = auth.uid()`); avatar path `{uid}/…` matches the own-folder storage policy.
- **Avatar flow:** upload-on-Save only when a new image was picked (no orphan objects on cancel).
- **Deferred:** settings/password/OTP/notifications/app-prefs/support/delete (1B-2); location (0B); native date picker.
