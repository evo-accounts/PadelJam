# Phase 1B-1 — Edit Profile — Design

*Padel Jam • 2026-06-14 • Brainstormed design / spec*

## Goal

Let a user edit their own profile: name, bio, avatar (upload), dominant hand, court side,
preferred time, gender, and date of birth. Adds the missing `profiles` columns, an avatar
storage bucket, an edit screen reached from the own-profile view (1A), and surfaces bio +
preferred-time on the profile. Closes the profile-edit slice of `Requirements/profile.md`
(PR-02 preferences/edit, profile section of PR-01).

**Decomposition:** Phase 1B = **1B-1 (edit profile, this)** + **1B-2 (settings hub: password,
email/phone OTP re-verify, notifications, app-prefs, support, legal, log out, delete)**. 1B-1 first.

Branch `feat/phase1b-profile-edit` (off `feat/discovery-explore`, which has 0A + 1A).
**Next migration: `0056`** (`0054` reserved by unmerged 0B).

## Scope decisions (made with the user)

1. **Edit profile first**; settings hub deferred to 1B-2.
2. **Location editing excluded** — geocoded location is 0B's domain; 1B-1 does not touch
   `location_text`/`location_point`.
3. **`date_of_birth` as a `YYYY-MM-DD` text input** (no new date-picker dependency; native picker is a later enhancement).
4. **Editable here:** name, bio, avatar, hand, side, preferred time, gender, dob. **Not here:**
   email/phone (OTP re-verify → 1B-2), password (1B-2).

## Architecture

```
own ProfileView (1A) ── "Edit" button ──> /profile/edit
  /profile/edit (form)
    prefill:  useMyProfile()           db.from('profiles').select('*').eq('id', uid).single()
    avatar:   pickAndValidateImage() -> uploadCommunityImage(supabase,'avatars',uid,uri,mime) -> path
    save:     useUpdateProfile()        db.from('profiles').update({...}).eq('id', uid)
                onSuccess -> invalidate qk.profile(uid) + qk.myProfile(uid) -> router.back()
profile view RPC get_player_profile now also returns description + preferred_time
```

Direct table ops are RLS-safe: the existing `"profiles: update"` policy is `using (id = auth.uid())`,
and select of one's own row passes the (block-aware) read policy.

## Data model — migration `0056_profile_fields.sql`

```sql
alter table profiles
  add column description   text,
  add column date_of_birth date,
  add column gender        text check (gender in ('male','female')),
  add column preferred_time text check (preferred_time in ('any','morning','afternoon','night'));

-- Avatar storage: public bucket (display via getPublicUrl), each user writes only their
-- own {uid}/ folder. Mirrors the 0026 community-bucket policy pattern.
insert into storage.buckets (id, name, public) values ('avatars','avatars', true)
  on conflict (id) do nothing;
create policy "avatar write: self" on storage.objects for insert to authenticated
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "avatar update: self" on storage.objects for update to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "avatar delete: self" on storage.objects for delete to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

-- Re-create get_player_profile to additionally return description + preferred_time
-- (dob/gender stay private — stored, not surfaced). Block-aware logic unchanged.
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
(The grant from 0055 persists across `create or replace`.)

## `@padel/api` (extend the `profile` module)

- `useMyProfile()` (in `profile/queries.ts`) — `useQuery(qk.myProfile(uid))`, `db.from('profiles').select('id, full_name, avatar_url, description, date_of_birth, gender, dominant_hand, court_side, preferred_time').eq('id', uid).single()`, `enabled: !!uid`. Prefills the edit form.
- `useUpdateProfile()` (in `profile/mutations.ts`) — `useMutation` taking the editable fields; `db.from('profiles').update(input).eq('id', uid)`; `onSuccess` invalidates `qk.profile(uid)` and `qk.myProfile(uid)`.
- `qk.myProfile: (id) => ['profile', id, 'edit'] as const`.

## Mobile

- **`apps/mobile/app/profile/edit.tsx`** (new, under the existing profile Stack) — form:
  - Avatar: tappable circle (current avatar via `avatarUrl`), `pickAndValidateImage()` → upload → hold the new path in state.
  - `full_name` + `description` (bio) `TextInput`s.
  - `ChoiceRow` (from `@/components/OnboardingStep`) for dominant hand, court side, gender (male/female), preferred time (any/morning/afternoon/night).
  - `date_of_birth` `TextInput` placeholder `YYYY-MM-DD` with a light regex validation (empty allowed; invalid blocks save with an inline message).
  - Save button → `useUpdateProfile().mutate(...)` (uploading the avatar first if a new one was picked) → `router.back()`. Disabled while saving.
- **`ProfileView` (1A)** — when `isSelf`, render an **Edit** button (→ `router.push('/profile/edit')`); show `description` under the name (if present) and `preferred_time` next to hand/side.
- i18n `profile` namespace additions: `edit`, `editTitle`, `name`, `bio`, `avatarHint`, `genderMale`, `genderFemale`, `timeAny/Morning/Afternoon/Night`, `dobLabel`, `dobInvalid`, `save`, `handLabel`, `sideLabel`, `timeLabel`, `genderLabel`.

## Testing

- **SQL** (`infra/supabase/tests/profile_fields.sql`, PT001): update a profile with the new fields; assert `get_player_profile` returns the set `description` + `preferred_time`; assert `gender`/`preferred_time` CHECK constraints reject an invalid value (e.g. `gender='x'` raises).
- **`@padel/api`**: extend the profile key-shape test with `qk.myProfile`.
- **Type/typecheck**: hand-update `get_player_profile` Returns (+ `description`, `preferred_time`) and add the new `profiles` columns to the `profiles` Row/Insert/Update in `database.types.ts`; `pnpm -w typecheck`.
- **Manual smoke** (JS — avatar upload needs a device/simulator): open own profile → Edit → change name/bio/hand/side/time/gender/dob → save → values persist and show on the profile; pick a new avatar → uploads and displays.

## Explicitly deferred (NOT 1B-1)
- Settings hub, password change, email/phone OTP re-verify, notification toggles, language/app-icon, support tickets, legal, log out, delete account (**1B-2**).
- Location editing (0B domain). dob native date picker. Surfacing dob/gender publicly.

## Conventions followed
Additive migration `0056_profile_fields.sql`; `get_player_profile` re-created keeping `security
definer set search_path = public`; storage policies mirror `0026_storage_buckets.sql`; SQL test
with PT001; hand-update `database.types.ts`; `@padel/api` hooks via `db.from`/`useMutation` with
`qk` keys; reuse `pickAndValidateImage`/`uploadCommunityImage`/`avatarUrl` + `ChoiceRow`; copy via `useT('profile')`.

## Open items for the implementation plan
- Confirm `uploadCommunityImage` works for a non-community first-folder segment (it's generic — first arg is just the bucket, third is the folder id; passing `uid` is fine).
- Confirm `avatarUrl`'s `AVATAR_BUCKET` constant equals `'avatars'` (matches the bucket created here).
- Decide the avatar state flow: upload immediately on pick (simplest; orphan object if the user cancels) vs upload on Save. Recommended: upload on Save, only if a new local image was picked.
