# Web W2a — Communities (list + detail + join) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Browse communities (mine + suggested), view a community (header + About + Members), and join/leave — on the existing backend via `@padel/api`.

**Architecture:** New routes under `apps/web/src/app/(app)/app/community/`, shared community components, a community-image URL helper, and a `community` i18n namespace. Data via shared hooks (RLS-enforced); shadcn from W0.

**Tech Stack:** Next.js App Router (client components), `@padel/api`, shadcn/ui, react-i18next, Supabase storage public URLs.

**Shape-verification rule (every task):** before using data, confirm fields in `packages/api/src/communities/queries.ts` + the relevant migration. Known: `useCommunities()` → `{ role: string, communities: <row> }[]`; `useSuggestedCommunities()` → `<row>[]`; `useCommunity(id)` → full `communities` row (`name, description, location, type, thumbnail_path, cover_image_path, privacy, cancellation_rules_enabled, cancellation_rules_text, is_archived, created_by, created_at`); `useCommunityMembers(id)` → `{ user_id, role, profiles: { id, full_name, avatar_url } }[]`; `useJoinCommunity(id).mutate(ack: boolean)`; `useLeaveCommunity().mutate(communityId)`. **Verify the `privacy` enum string values** (expected `'public' | 'request_to_join' | 'private'`) and `type` values in `infra/supabase/migrations/0004_communities.sql`/`0018_*`; use the real strings.

---

## Task 1: Image helper + `community` i18n namespace

**Files:** create `apps/web/src/lib/community-images.ts`; modify `apps/web/src/lib/i18n-web.ts`, `apps/web/src/components/Providers.tsx`.

- [ ] **Step 1:** `community-images.ts`:
```ts
import { supabase } from '@/lib/supabase/client';

type CommunityBucket = 'community-thumbnails' | 'community-covers';

export function communityImageUrl(path: string | null | undefined, bucket: CommunityBucket): string | null {
  if (!path) return null;
  return supabase.storage.from(bucket).getPublicUrl(path).data.publicUrl;
}
```
- [ ] **Step 2:** Add a `webCommunity` bundle + `registerWebCommunityCopy(instance)` (namespace `'community'`) mirroring the existing `registerWeb*Copy`, and call it in `Providers.tsx` after `registerWebSettingsCopy`. English keys (translate pt-PT/pt-BR):
```
title:'Communities', mine:'Your communities', suggested:'Suggested', create:'Create community',
about:'About', members:'Members', posts:'Posts', events:'Events', groups:'Groups', comingSoon:'Coming soon',
join:'Join', requestToJoin:'Request to join', requested:'Requested', leave:'Leave', inviteOnly:'Invite only',
joined:'Joined', privacyPublic:'Public', privacyRequest:'Request to join', privacyPrivate:'Private',
typeClub:'Club', typeTeam:'Team', typeFriends:'Group of friends', memberCount:'{{count}} members',
location:'Location', admins:'Admins', created:'Created', cancellationRules:'Cancellation & attendance rules',
ackRules:'I agree to the cancellation & attendance rules', role_owner:'Owner', role_admin:'Admin', role_member:'Member',
notAvailable:'This community is not available.', archived:'Archived', emptyMine:"You're not in any communities yet.",
leaveError:'Could not leave. You may be the only owner.'
```
- [ ] **Step 3:** `pnpm --filter web typecheck` → PASS. Commit: `git add apps/web/src/lib/community-images.ts apps/web/src/lib/i18n-web.ts apps/web/src/components/Providers.tsx && git commit -m "feat(web): community image helper + i18n namespace (W2a)"`

---

## Task 2: Community components

**Files:** create `apps/web/src/components/community/{CommunityCard,CommunityHeader,MembersList}.tsx`.

- [ ] **Step 1: `CommunityCard.tsx`** — props `{ community: <row>; role?: string }`. A shadcn `Card` linking to `/app/community/${community.id}`: thumbnail (`communityImageUrl(community.thumbnail_path,'community-thumbnails')`, fallback initials), name, a `Badge` for privacy (`t('privacy'+...)`) and an optional role `Badge`.
- [ ] **Step 2: `MembersList.tsx`** — props `{ members: {user_id, role, profiles:{id,full_name,avatar_url}}[] }`. Rows: `Avatar` (avatarUrl from `@/lib/upload` for `avatar_url` — note that's the `avatars` bucket; profiles.avatar_url is an avatars path) + name (link `/app/profile/${user_id}`) + role `Badge`.
- [ ] **Step 3: `CommunityHeader.tsx`** — props `{ community: <row>; memberCount: number; cta?: ReactNode }`. Cover image (`communityImageUrl(cover_image_path,'community-covers')`) as a banner; thumbnail overlapping; name; pills (type / `memberCount` / privacy) via `Badge`; description; `is_archived` → an "Archived" badge; render `cta` (the join/leave control passed by the page).
- [ ] **Step 4:** `pnpm --filter web typecheck` → PASS. Commit: `... -m "feat(web): community card/header/members components (W2a)"`

---

## Task 3: Communities list `/app/community`

**Files:** modify `apps/web/src/app/(app)/app/community/page.tsx` (replace W0 stub).

- [ ] **Step 1:** Client page. `const mine = useCommunities(); const suggested = useSuggestedCommunities(); const canCreate = useCanCreateCommunity();`. Render: a header with a **Create** `Button asChild` (`<Link href="/app/community/create">`) shown when `canCreate.data` (note the route lands in W2b). Section **Your communities**: `mine.isLoading` → `Skeleton`; empty → `t('emptyMine')`; else map to `<CommunityCard community={row.communities} role={row.role} />` (use the ACTUAL nested key — `row.communities`; guard null). Section **Suggested**: map `suggested.data` to `<CommunityCard community={c} />`. Optionally filter out already-joined from suggested.
- [ ] **Step 2:** `pnpm --filter web typecheck` → PASS. Commit: `... -m "feat(web): communities list page (W2a)"`

---

## Task 4: Community detail `/app/community/[id]` + join/leave

**Files:** create `apps/web/src/app/(app)/app/community/[id]/page.tsx`.

- [ ] **Step 1:** Client page. `const { id } = useParams<{id:string}>(); const c = useCommunity(id); const members = useCommunityMembers(id); const mine = useCommunities();`
  - Loading → `Skeleton`. If `!c.data` → `t('notAvailable')`.
  - Membership: `const mineRow = mine.data?.find(r => r.communities?.id === id); const isMember = !!mineRow; const myRole = mineRow?.role;`
  - **CTA** (compute from `c.data.privacy` + `isMember`):
    - member → `Leave` `Button` → `leave.mutate(id, { onError: () => setErr(t('leaveError')) })` (`const leave = useLeaveCommunity();`).
    - not member + privacy `public` → `Join` button → `join.mutate(ackChecked)` (`const join = useJoinCommunity(id);`).
    - not member + privacy `request_to_join` → `Request to join` button → `join.mutate(ackChecked)`; after success show `requested`.
    - not member + privacy `private` → disabled `inviteOnly`.
    - If `c.data.cancellation_rules_enabled` and not member: a controlled `<input type="checkbox">` + `t('ackRules')`, CTA disabled until checked; pass its value as `ack`.
  - Render `<CommunityHeader community={c.data} memberCount={members.data?.length ?? 0} cta={<CTA/>} />`.
  - **Tabs** (`Tabs`/`TabsList`/`TabsTrigger`/`TabsContent`): About, Members, Posts, Events, Groups.
    - **About**: type / privacy / location / created date / admins (members filtered to role owner|admin → names) / cancellation rules text when enabled.
    - **Members**: `<MembersList members={members.data ?? []} />`.
    - **Posts/Events/Groups**: a centered `t('comingSoon')` placeholder.
- [ ] **Step 2:** `pnpm --filter web typecheck` + `build` → PASS. Commit: `... -m "feat(web): community detail (about/members) + join/leave (W2a)"`

---

## Task 5: End-to-end verification (browser)

No code. `pnpm --filter web dev` against local Supabase; headless Chrome via the `run` skill.

- [ ] **Step 1:** typecheck + build → PASS.
- [ ] **Step 2:** Sign in → `/app/community` lists Your communities (with role badges) + Suggested.
- [ ] **Step 3:** Open a community → header (cover/thumbnail/pills) + About + Members render (RLS); Posts/Events/Groups tabs show "coming soon".
- [ ] **Step 4:** Join a **public** community → CTA flips to Leave; member count/role reflect (after invalidation). For a **request_to_join** community → CTA shows "Requested" after acting. Leave → back to Join (non-owner).

---

## Verification (summary)
Per-task typecheck; build after Task 4; browser smoke (Task 5). Finish via superpowers:finishing-a-development-branch (merge to `main` after review).

## Out of scope
Create (W2b); posts/reviews (W2c); manage (W2d); Events/Groups tabs (W3/W4); QR/share; the managing/participating/archived switcher.
