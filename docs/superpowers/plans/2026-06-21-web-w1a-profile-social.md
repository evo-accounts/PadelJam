# Web W1a — Profile & Social Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Web profile + social graph — own profile, edit (incl. avatar upload), other-user profile, follow/unfollow, followers/following lists, block/report — on the existing backend via `@padel/api`.

**Architecture:** New routes under `apps/web/src/app/(app)/app/profile/`, shared profile components, an avatar-upload util to the public `avatars` bucket, and a `profile` i18n namespace. All data via shared `@padel/api` hooks (RLS-enforced); shadcn primitives already present from W0.

**Tech Stack:** Next.js App Router (client components), `@padel/api` (react-query), `@supabase/supabase-js` storage, shadcn/ui, react-i18next.

**Spec:** [docs/superpowers/specs/2026-06-21-web-w1a-profile-social-design.md](specs/2026-06-21-web-w1a-profile-social-design.md)

**Shape-verification rule (applies to every task):** before using a hook's data, open its source in `packages/api/src/profile/` and use the ACTUAL field names. Key references: `useMyProfile` selects `id, full_name, avatar_url, description, date_of_birth, gender, dominant_hand, court_side, preferred_time, location_text`; `useProfile(id)` returns the `get_player_profile` RPC row (read `infra/supabase/migrations` for that RPC's columns — expect identity + follower/following counts + `is_following`/`is_blocked` flags; use whatever it actually returns); `useFollowers/useFollowing(userId, search)` are `useInfiniteQuery` over `list_followers`/`list_following` (use `data.pages.flat()` + `fetchNextPage`); `UpdateProfileInput = { full_name?, description?, dominant_hand?, court_side?, gender?, preferred_time?, date_of_birth?, avatar_url?, locale? }`.

---

## Task 1: Avatar upload util

**Files:** Create `apps/web/src/lib/upload.ts`.

- [ ] **Step 1:** Create the util:
```ts
import { supabase } from '@/lib/supabase/client';

const MAX_BYTES = 5 * 1024 * 1024;

/** Upload an avatar to the public `avatars` bucket under the user's own folder (RLS: first path
 *  segment must equal auth.uid()). Returns the stored object path to save as profiles.avatar_url. */
export async function uploadAvatar(file: File, uid: string): Promise<string> {
  if (!file.type.startsWith('image/')) throw new Error('avatar_invalid_type');
  if (file.size > MAX_BYTES) throw new Error('avatar_too_large');
  const ext = file.name.split('.').pop()?.toLowerCase() || 'jpg';
  const path = `${uid}/${crypto.randomUUID()}.${ext}`;
  const { error } = await supabase.storage.from('avatars').upload(path, file, { upsert: true, contentType: file.type });
  if (error) throw error;
  return path;
}

/** Public URL for a stored avatar path (or null). */
export function avatarUrl(path: string | null | undefined): string | null {
  if (!path) return null;
  return supabase.storage.from('avatars').getPublicUrl(path).data.publicUrl;
}
```

- [ ] **Step 2:** `pnpm --filter web typecheck` → PASS.
- [ ] **Step 3:** Commit: `git add apps/web/src/lib/upload.ts && git commit -m "feat(web): avatar upload util (avatars bucket) (W1a)"`

---

## Task 2: `profile` i18n namespace

**Files:** Modify `apps/web/src/lib/i18n-web.ts`; Modify `apps/web/src/components/Providers.tsx`.

- [ ] **Step 1:** Following the existing `registerWebAuthCopy`/`registerWebAppCopy` pattern, add a `webProfile` bundle for `'pt-PT' | 'pt-BR' | 'en'` and a `registerWebProfileCopy(instance)` that does `instance.addResourceBundle(locale, 'profile', webProfile[locale], true, false)`. English keys (translate pt-PT/pt-BR equivalently, matching the file's existing tone):
```
title: 'Profile', edit: 'Edit profile', save: 'Save', following: 'Following', followers: 'Followers',
bio: 'Bio', location: 'Location', fullName: 'Full name', preferences: 'Preferences',
dominantHand: 'Dominant hand', courtSide: 'Court side', preferredTime: 'Preferred time',
left: 'Left', right: 'Right', any: 'Any', morning: 'Morning', afternoon: 'Afternoon', night: 'Night',
follow: 'Follow', unfollow: 'Following', avatarHint: 'Tap to change photo', searchPeople: 'Search',
block: 'Block', unblock: 'Unblock', report: 'Report', reportReason: 'Reason', reportDetails: 'Details (optional)',
reportSubmit: 'Submit report', notAvailable: 'This profile is not available.', emptyFollowing: 'No one yet.',
emptyFollowers: 'No followers yet.', saved: 'Saved', saveError: 'Could not save. Please try again.'
```
- [ ] **Step 2:** In `Providers.tsx`, import and call `registerWebProfileCopy(instance)` right after `registerWebAppCopy(instance)`.
- [ ] **Step 3:** `pnpm --filter web typecheck` → PASS.
- [ ] **Step 4:** Commit: `git add apps/web/src/lib/i18n-web.ts apps/web/src/components/Providers.tsx && git commit -m "feat(web): profile i18n namespace (en/pt-PT/pt-BR) (W1a)"`

---

## Task 3: Shared components — ProfileHeader + FollowButton

**Files:** Create `apps/web/src/components/profile/FollowButton.tsx`, `apps/web/src/components/profile/ProfileHeader.tsx`.

- [ ] **Step 1: `FollowButton.tsx`** — optimistic follow toggle:
```tsx
'use client';
import { useFollow, useUnfollow } from '@padel/api';
import { useT } from '@padel/i18n';
import { Button } from '@/components/ui/button';

export function FollowButton({ targetId, isFollowing }: { targetId: string; isFollowing: boolean }) {
  const { t } = useT('profile');
  const follow = useFollow();
  const unfollow = useUnfollow();
  const busy = follow.isPending || unfollow.isPending;
  return (
    <Button
      variant={isFollowing ? 'outline' : 'default'}
      disabled={busy}
      onClick={() => (isFollowing ? unfollow.mutate(targetId) : follow.mutate(targetId))}
    >
      {isFollowing ? t('unfollow') : t('follow')}
    </Button>
  );
}
```
(`useFollow`/`useUnfollow` `mutate` take the `targetId` string — confirmed signatures. Their `onSuccess` invalidates queries, so the profile refetches `is_following`.)

- [ ] **Step 2: `ProfileHeader.tsx`** — avatar + name + follow/follower counts (links) + an `actions` slot:
```tsx
'use client';
import Link from 'next/link';
import { useT } from '@padel/i18n';
import type { ReactNode } from 'react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { avatarUrl } from '@/lib/upload';

export function ProfileHeader({
  id, fullName, avatarPath, followingCount, followersCount, actions,
}: {
  id: string; fullName: string | null; avatarPath: string | null;
  followingCount: number; followersCount: number; actions?: ReactNode;
}) {
  const { t } = useT('profile');
  const initials = (fullName ?? '?').slice(0, 2).toUpperCase();
  return (
    <div className="flex items-start gap-4 p-6">
      <Avatar className="size-20">
        <AvatarImage src={avatarUrl(avatarPath) ?? undefined} />
        <AvatarFallback>{initials}</AvatarFallback>
      </Avatar>
      <div className="flex flex-col gap-1">
        <h1 className="text-xl font-semibold">{fullName ?? '—'}</h1>
        <div className="flex gap-4 text-sm text-muted-foreground">
          <Link href={`/app/profile/${id}/following`}>{followingCount} {t('following')}</Link>
          <Link href={`/app/profile/${id}/followers`}>{followersCount} {t('followers')}</Link>
        </div>
        {actions ? <div className="mt-2 flex gap-2">{actions}</div> : null}
      </div>
    </div>
  );
}
```
(Use the ACTUAL count field names from `useMyProfile`/`get_player_profile` — if counts aren't on `useMyProfile`, derive from `useFollowers`/`useFollowing` lengths or the RPC. Verify before wiring in Tasks 4/6.)

- [ ] **Step 3:** `pnpm --filter web typecheck` → PASS. Commit: `git add apps/web/src/components/profile && git commit -m "feat(web): ProfileHeader + FollowButton components (W1a)"`

---

## Task 4: Own profile page `/app/profile`

**Files:** Modify `apps/web/src/app/(app)/app/profile/page.tsx` (replace the W0 stub).

- [ ] **Step 1:** Build a client page using `useMyProfile` + `useSession` (for the id). Render `ProfileHeader` (with an **Edit** link to `/app/profile/edit`), then Preferences (dominant hand / court side / preferred time), bio (`description`), location (`location_text`). Loading → `Skeleton`. For follower/following counts, use the real source (see Task 3 note); if `useMyProfile` lacks counts, call `useFollowers(uid)`/`useFollowing(uid)` and use their flattened lengths, or the `get_player_profile` RPC via `useProfile(uid)`. Do NOT render stats/groups/last-results (deferred to W3/W4).
- [ ] **Step 2:** `pnpm --filter web typecheck` → PASS. Commit: `... -m "feat(web): own profile page (W1a)"`

---

## Task 5: Edit profile page `/app/profile/edit` (with avatar upload)

**Files:** Create `apps/web/src/app/(app)/app/profile/edit/page.tsx`.

- [ ] **Step 1:** Client page seeded from `useMyProfile`. Controlled fields: full name (`input`), bio (`textarea`, → `description`), location (`input`, → `location_text`), dominant hand + court side (`select`: left/right), preferred time (`select`: any/morning/afternoon/night). Avatar: an `<input type="file" accept="image/*">` (hidden, triggered by clicking the avatar) → on change, hold the `File` + show a local preview (`URL.createObjectURL`). On **Save**: if a file is selected, `const path = await uploadAvatar(file, uid)`; then `useUpdateProfile().mutateAsync({ full_name, description, location_text? ... , dominant_hand, court_side, preferred_time, avatar_url: path ?? undefined })`. NOTE: `UpdateProfileInput` does **not** include `location_text` (it has the other fields) — verify the exact accepted keys in `packages/api/src/profile/mutations.ts`; if `location_text` isn't accepted, omit it from the update (and drop the location field, or extend is out of scope — keep to accepted keys). On success → `useT('profile')` toast/inline "Saved" + `router.push('/app/profile')`; on error → inline `saveError`.
- [ ] **Step 2:** `pnpm --filter web typecheck` + `build` → PASS. Commit: `... -m "feat(web): edit profile with avatar upload (W1a)"`

---

## Task 6: Other-user profile `/app/profile/[id]` + block/report

**Files:** Create `apps/web/src/app/(app)/app/profile/[id]/page.tsx`, `apps/web/src/components/profile/ReportDialog.tsx`.

- [ ] **Step 1: `ReportDialog.tsx`** — shadcn `Dialog` with a reason `Select` (e.g. spam / harassment / inappropriate / other) + a description `Textarea`; submit → `useReport().mutate({ targetId, reason, description })`. Close on success.
- [ ] **Step 2: `[id]/page.tsx`** — client page. Read `id` from `useParams`. If `id === session.user.id` → `router.replace('/app/profile')`. Else `useProfile(id)`: if no data → render `notAvailable` (covers blocked/hidden). Render `ProfileHeader` with `actions`: a `FollowButton` (pass `is_following` from the RPC row) + a `DropdownMenu` (kebab) with **Block** (`useBlock().mutate(id)`) and **Report** (opens `ReportDialog`). Use the RPC's actual flag/field names.
- [ ] **Step 3:** `pnpm --filter web typecheck` → PASS. Commit: `... -m "feat(web): other-user profile + follow + block/report (W1a)"`

---

## Task 7: Followers / Following lists

**Files:** Create `apps/web/src/components/profile/FollowList.tsx`, `apps/web/src/app/(app)/app/profile/[id]/followers/page.tsx`, `apps/web/src/app/(app)/app/profile/[id]/following/page.tsx`.

- [ ] **Step 1: `FollowList.tsx`** — props `{ kind: 'followers' | 'following', userId: string }`. A search `Input` (debounced state) feeding `useFollowers(userId, search)` or `useFollowing(userId, search)`. Render `data.pages.flat()` as rows (avatar + name, linking to `/app/profile/<rowId>`); a "Load more" `Button` calling `fetchNextPage()` when `hasNextPage`. Empty → `emptyFollowers`/`emptyFollowing`. Use the ACTUAL row fields from the `list_followers`/`list_following` RPC (id, full_name, avatar_url — verify).
- [ ] **Step 2:** The two pages read `id` from `useParams` and render `<FollowList kind="followers|following" userId={id} />` inside a titled container.
- [ ] **Step 3:** `pnpm --filter web typecheck` + `build` → PASS. Commit: `... -m "feat(web): followers/following lists with search (W1a)"`

---

## Task 8: End-to-end verification (browser)

No code. `pnpm --filter web dev` against local Supabase; drive via the `run` skill's headless Chrome.

- [ ] **Step 1:** `pnpm --filter web typecheck` && `pnpm --filter web build` → PASS.
- [ ] **Step 2:** Sign in → `/app/profile` shows own name/preferences (RLS data).
- [ ] **Step 3:** `/app/profile/edit` → change bio + preference + upload an avatar → Save → returns to `/app/profile` with updates; confirm the object exists under `avatars/{uid}/` (Supabase Studio or storage API).
- [ ] **Step 4:** Open another player `/app/profile/[id]` → Follow toggles to Following → counts update; open Followers/Following → lists render + search filters; Block hides; Report submits (a `reports` row inserted).

---

## Verification (summary)
Per-task typecheck; build after the page tasks; browser smoke (Task 8). Finish via superpowers:finishing-a-development-branch (merge to `main` after review).

## Out of scope
Settings hub (W1b); message/chat (W5); profile stats/groups/results (W3/W4); subscription (Phase 3).
