# Web W2d — Community Manage Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Owner/admin community management on web — hub, settings, members (roles/removal/transfer), permissions, requests, invite (from following), archive.

**Architecture:** Routes under `(app)/app/community/[id]/manage/`, all gated to owner/admin, reusing the full `@padel/api` community-management surface + the W2b image-upload helper. A **Manage** entry on the detail header for admins.

**Tech Stack:** Next.js App Router (client), `@padel/api`, shadcn/ui, Supabase storage.

**Verified signatures:** `useUpdateCommunity(id).mutate(patch)` snake_case `{name?,description?,location?,type?,privacy?,thumbnail_path?,cover_image_path?,cancellation_rules_enabled?,cancellation_rules_text?}`; `useUpdatePermissions(id).mutate({invite_members?,approve_join_requests?,create_posts?})`; `useCommunityPermissions(id)`→row(maybeSingle); `useCommunityRequests(id)`→`{id,user_id,status,created_at,profiles}[]` (pending); `useAcceptJoinRequest(id)/useDeclineJoinRequest(id).mutate(requestId)`; `useMakeAdmin(id)/useRemoveAdmin(id)/useRemoveMember(id).mutate(userId)`; `useArchiveCommunity(id).mutate(archive:boolean)`; `useTransferOwnership(id).mutate(newOwner:string)`; `useInviteMembers(id).mutate({inviteeIds:string[],groupIds:string[]})`; `useMembersRealtime(id)`; `useCommunityMembers(id)`→`{user_id,role,profiles}[]`; `useFollowing(uid)` infinite query (`data.pages.flat()` → `{id,full_name,avatar_url}`); community row has `archived_at`. Re-confirm in `packages/api/src/communities/*`.

**Admin gate helper (reused by every manage page):** read `useCommunities()`, `const role = (mine.data ?? []).find(r => r.community?.id === id)?.role; const isAdmin = role === 'owner' || role === 'admin'; const isOwner = role === 'owner';` If `mine` loaded and `!isAdmin` → `router.replace('/app/community/${id}')`. Call hooks unconditionally before the redirect.

---

## Task 1: i18n manage keys + Manage entry on the detail header

**Files:** modify `apps/web/src/lib/i18n-web.ts`; modify `apps/web/src/app/(app)/app/community/[id]/page.tsx`.

- [ ] **Step 1:** Extend `webCommunity` (3 locales) with manage keys:
```
manageTitle:'Manage', settings:'Settings', permissions:'Permissions', requests:'Requests', invite:'Invite',
archive:'Archive', unarchive:'Unarchive', transferOwnership:'Transfer ownership', makeAdmin:'Make admin', removeAdmin:'Remove admin', removeMember:'Remove',
save:'Save', saved:'Saved', saveError:'Could not save. Please try again.',
permInvite:'Members can invite', permApprove:'Members can approve requests', permCreatePosts:'Members can create posts',
accept:'Accept', decline:'Decline', noRequests:'No pending requests.', pending:'{{count}} pending',
inviteFollowing:'Invite from the people you follow', inviteCta:'Invite', invited:'Invited', noFollowing:'You are not following anyone yet.',
confirmRemoveTitle:'Remove member?', confirmRemoveBody:'They will be removed from the community.', confirmTransferTitle:'Transfer ownership?', confirmTransferBody:'You will no longer be the owner. This cannot be undone.', confirm:'Confirm', cancel:'Cancel',
descriptionLabel:'Description', name:'Name', archivedNotice:'This community is archived.'
```
(reuse existing typeClub/privacy*/role_* etc.)
- [ ] **Step 2:** In the detail page, the component already computes `mineRow`/role. Add a **Manage** `Button asChild` (→ `/app/community/${id}/manage`) in the header actions, shown when role is `owner`/`admin`. Pass it through `CommunityHeader`'s `cta`/actions or render near the join/leave CTA.
- [ ] **Step 3:** `pnpm --filter web typecheck` → PASS. Commit: `git add apps/web/src/lib/i18n-web.ts "apps/web/src/app/(app)/app/community/[id]/page.tsx" && git commit -m "feat(web): manage i18n + Manage entry on community detail (W2d)"`

---

## Task 2: Manage hub + permissions + requests

**Files:** create `apps/web/src/app/(app)/app/community/[id]/manage/{page,permissions/page,requests/page}.tsx`.

- [ ] **Step 1: hub `/manage/page.tsx`** — client. Apply the admin gate. `const community = useCommunity(id); const requests = useCommunityRequests(id); const archive = useArchiveCommunity(id);` Render a `Card` list linking to `settings`, `members`, `permissions`, `requests` (show `t('pending',{count: requests.data?.length ?? 0})`), `invite`. An **Archive/Unarchive** `Button` (label by `community.data?.archived_at`) → `archive.mutate(!community.data?.archived_at)` (i.e. archive=true when not archived). If archived, show `archivedNotice`.
- [ ] **Step 2: permissions `/manage/permissions/page.tsx`** — admin gate. `const perms = useCommunityPermissions(id); const update = useUpdatePermissions(id);` Three `Switch` rows (`permInvite`/`permApprove`/`permCreatePosts`) seeded from `perms.data?.{invite_members,approve_join_requests,create_posts}`; optimistic local override + `update.mutate({ [key]: next })`, revert on error.
- [ ] **Step 3: requests `/manage/requests/page.tsx`** — admin gate. `const requests = useCommunityRequests(id); const accept = useAcceptJoinRequest(id); const decline = useDeclineJoinRequest(id);` Rows: `Avatar` + `r.profiles?.full_name` + Accept/Decline buttons (`accept.mutate(r.id)` / `decline.mutate(r.id)`). Empty → `noRequests`.
- [ ] **Step 4:** `pnpm --filter web typecheck` → PASS. Commit: `... -m "feat(web): manage hub + permissions + requests (W2d)"`

---

## Task 3: Manage settings

**Files:** create `apps/web/src/app/(app)/app/community/[id]/manage/settings/page.tsx`.

- [ ] **Step 1:** Admin gate. Seed from `useCommunity(id)`: name, description, location, type, privacy, rulesEnabled, rulesText. `Input`/`Textarea`/`Select`s mirroring the W2b create form. Thumbnail + cover: show current via `communityImageUrl`; allow re-pick (File + preview); `Select` type/privacy use the real enum strings.
- [ ] **Step 2: Save** — `const update = useUpdateCommunity(id);`
```ts
let thumbnail_path, cover_image_path;
try {
  if (thumbFile) thumbnail_path = await uploadCommunityImage(thumbFile, id, 'community-thumbnails');
  if (coverFile) cover_image_path = await uploadCommunityImage(coverFile, id, 'community-covers');
} catch { setWarn(true); }
await update.mutateAsync({
  name, description: description || null, location: location || null, type, privacy,
  cancellation_rules_enabled: rulesEnabled, cancellation_rules_text: rulesEnabled ? (rulesText || null) : null,
  ...(thumbnail_path ? { thumbnail_path } : {}), ...(cover_image_path ? { cover_image_path } : {}),
});
// success → t('saved') + router.push(`/app/community/${id}`)
```
- [ ] **Step 3:** `pnpm --filter web typecheck` → PASS. Commit: `... -m "feat(web): manage community settings (W2d)"`

---

## Task 4: Members (roles/remove/transfer) + Invite

**Files:** create `apps/web/src/app/(app)/app/community/[id]/manage/{members/page,invite/page}.tsx`.

- [ ] **Step 1: members `/manage/members/page.tsx`** — admin gate (+ `isOwner`). `useMembersRealtime(id); const members = useCommunityMembers(id); const makeAdmin = useMakeAdmin(id); const removeAdmin = useRemoveAdmin(id); const removeMember = useRemoveMember(id); const transfer = useTransferOwnership(id);` Each row: `Avatar` + name + role badge + a `DropdownMenu`:
  - if `m.role === 'member'` → **Make admin** (`makeAdmin.mutate(m.user_id)`).
  - if `m.role === 'admin'` → **Remove admin** (`removeAdmin.mutate(m.user_id)`).
  - **Remove** (`removeMember.mutate(m.user_id)`) behind an `AlertDialog` (`confirmRemove*`) — hide for the owner row and for yourself.
  - if `isOwner && m.role !== 'owner'` → **Transfer ownership** (`transfer.mutate(m.user_id)`) behind an `AlertDialog` (`confirmTransfer*`).
  Surface RPC errors inline (e.g. last-owner guard).
- [ ] **Step 2: invite `/manage/invite/page.tsx`** — admin gate. `const uid = useSession().session?.user.id; const following = useFollowing(uid); const invite = useInviteMembers(id);` List `following.data?.pages.flat()` rows (avatar + name) each with an **Invite** `Button` → `invite.mutate({ inviteeIds: [person.id], groupIds: [] }, { onSuccess: () => mark invited })`; track invited ids locally to flip the button to `invited`. Empty → `noFollowing`. Load-more if `following.hasNextPage`.
- [ ] **Step 3:** `pnpm --filter web typecheck` + `build` → PASS. Commit: `... -m "feat(web): manage members + invite (W2d)"`

---

## Task 5: End-to-end verification (browser)

No code. `pnpm --filter web dev`; headless Chrome, as an owner of a test community.

- [ ] **Step 1:** typecheck + build → PASS.
- [ ] **Step 2:** Open your community → **Manage** entry visible (admin) → `/manage` hub renders; a non-admin visiting `/manage` is redirected to the community.
- [ ] **Step 3:** Settings → change name + privacy + re-upload a cover → save → detail reflects it.
- [ ] **Step 4:** Permissions → toggle `create_posts` → persists across reload. Requests → (with a pending request) Accept → the user becomes a member.
- [ ] **Step 5:** Members → make a member admin, remove admin, remove a member (confirm dialog). Invite → invite a followed user. (Owner) Transfer ownership → confirm → role changes. Archive → community shows archived; Unarchive restores.

---

## Verification (summary)
Per-task typecheck; build after Task 4; browser smoke (Task 5). Finish via superpowers:finishing-a-development-branch (merge to `main` after review).

## Out of scope
Multi-group invite (W3); group creation (W3); event creation (W4); search-based invite; audit log.
