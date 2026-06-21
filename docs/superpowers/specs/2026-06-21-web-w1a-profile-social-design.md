# Web W1a — Profile & Social — Design

**Slice:** Web W1a (first half of WEB roadmap W1). The full W1 goal is profile + social + settings hub; this slice
covers **profile + social graph + avatar upload**. The **settings hub** is W1b (next slice).

## Goal

Mirror the mobile player profile experience on web: view your own profile, edit it (including avatar upload),
view other players, follow/unfollow, browse followers/following, and block/report — all on the existing backend
via shared `@padel/api` hooks (RLS-enforced).

## Routes (under `apps/web/src/app/(app)/app/`, all auth-gated by the W0 middleware)

- **`/app/profile`** — own profile. Replaces the W0 placeholder. Header (avatar, full name, Following/Followers
  counts linking to the lists), an **Edit** button, Preferences (dominant hand / court side / preferred time),
  bio, location.
- **`/app/profile/edit`** — edit form: avatar upload + name, bio, location, dominant hand, court side, preferred
  time → `useUpdateProfile`.
- **`/app/profile/[id]`** — another player: header + **Follow/Unfollow** + kebab menu (**Block**, **Report**).
  When viewing your own id, redirect/link to `/app/profile`.
- **`/app/profile/[id]/followers`** and **`/app/profile/[id]/following`** — searchable lists; each row links to
  the player and shows a follow button. Own lists route via the user's own id.

## Components

- `components/profile/ProfileHeader.tsx` — avatar + name + counts + an action slot (Edit for self; Follow + kebab
  for others). Reused across own/other.
- `components/profile/FollowButton.tsx` — optimistic follow/unfollow (`useFollow`/`useUnfollow`).
- `components/profile/FollowList.tsx` — renders a followers/following list with client-side search.
- `components/profile/ReportDialog.tsx` — shadcn `dialog` with reason `select` + description `textarea` →
  `useReport`. Block via `useBlock` from the kebab `dropdown-menu`.
- Avatar upload util `lib/upload.ts` — `uploadAvatar(file, uid)`: validate type (image/*) + size (≤ ~5MB) →
  `supabase.storage.from('avatars').upload(\`${uid}/${crypto.randomUUID()}.<ext>\`, file, { upsert: true })` →
  return the stored path. The `avatars` bucket is public with RLS requiring the first path segment = `auth.uid()`
  (migration `0056_profile_fields.sql`), so the `${uid}/` prefix is mandatory. Display via
  `supabase.storage.from('avatars').getPublicUrl(path)`.

## Data / reuse

`@padel/api` (web-safe): `useMyProfile`, `useProfile`, `useUpdateProfile`, `useFollow`, `useUnfollow`,
`useFollowers`, `useFollowing`, `useBlock`, `useReport`. shadcn primitives already pulled in W0 (card, avatar,
button, input, textarea, select, dropdown-menu, dialog, skeleton). The Supabase browser client is
`@/lib/supabase/client`.

## i18n

Add a `profile` namespace (en / pt-PT / pt-BR) to `apps/web/src/lib/i18n-web.ts` via a `registerWebProfileCopy`
export, called from `Providers.tsx` alongside the existing registrations. Keys cover headings, field labels,
preferences options, follow/unfollow, block/report, report reasons, and list search.

## Error / edge handling

- Loading → `Skeleton`; empty follow lists → friendly empty state.
- Optimistic follow/unfollow with rollback on error.
- Blocked relationship: a blocked user's profile is hidden (RLS already filters; the page shows a "not available"
  state rather than crashing on null data).
- Avatar upload failure → inline error, keep the existing avatar.

## Deferred (out of this slice)

- Profile **stats / groups / last-results** sections — depend on events + groups data (Web W3/W4); omitted until
  then (do not stub fake data).
- **Message** button (opens chat) — after Web W5.
- The **settings hub** (account fields, notifications, change password, change email, delete account, support) —
  **W1b**.

## Verification

- `pnpm --filter web typecheck` + `pnpm --filter web build`.
- Browser (local Supabase, `pnpm --filter web dev`, headless Chrome via the `run` skill): sign in → `/app/profile`
  renders own data → edit name/bio/preferences saves → avatar upload lands in `avatars/{uid}/…` and shows →
  open another player's `/app/profile/[id]` → follow/unfollow toggles → followers/following lists render + search
  → block/report act. Confirm typecheck/build green.

## Out of scope

Settings hub (W1b); subscription UI (Phase 3 / not part of player-web); message/chat (W5); profile stats that
require events/groups (W3/W4).
