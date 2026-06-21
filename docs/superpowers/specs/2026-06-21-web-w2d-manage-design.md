# Web W2d — Community Manage — Design

**Slice:** Web W2d (final W2 sub-slice). Adds the owner/admin **manage** area; completes the web communities area.

## Goal

Owner/admin management of a community on web: settings, members (roles/removal), permissions, join requests,
invite (from following), archive/unarchive, transfer ownership — via `@padel/api`.

## Access gating

All `/app/community/[id]/manage/**` routes are owner/admin-only. Determine role from `useCommunities()`
(`mineRow.role` for `[id]`) — if not `owner`/`admin`, redirect to `/app/community/[id]`. (Server RPCs/RLS enforce
too.) Transfer-ownership actions are **owner-only**.

## Routes (under `apps/web/src/app/(app)/app/community/[id]/manage/`)

- **`/manage`** (hub): a list linking to Settings, Members, Permissions, Requests (showing the pending count from
  `useCommunityRequests`), Invite; an **Archive/Unarchive** toggle (`useArchiveCommunity.mutate(archive)` — label
  from the community's `archived_at`); and an entry to transfer ownership (owner-only, lives on Members).
- **`/manage/settings`**: edit name / description / location / type (`Select`) / privacy (`Select`) + thumbnail &
  cover (re-upload via `uploadCommunityImage(file, id, bucket)`) + cancellation rules (`Switch` + `Textarea`).
  Save → `useUpdateCommunity(id).mutate(patch)` with **snake_case** keys (`name, description, location, type,
  privacy, thumbnail_path, cover_image_path, cancellation_rules_enabled, cancellation_rules_text`). Seed from
  `useCommunity(id)`.
- **`/manage/members`**: member list (`useCommunityMembers(id)` + `useMembersRealtime(id)` for live updates).
  Per-member `DropdownMenu`: **Make admin** / **Remove admin** (`useMakeAdmin`/`useRemoveAdmin.mutate(userId)`),
  **Remove** (`useRemoveMember.mutate(userId)` behind an `AlertDialog`), and — **owner-only**, for non-owner
  members — **Transfer ownership** (`useTransferOwnership.mutate(userId)` behind an `AlertDialog`). Don't show
  destructive actions against yourself / the owner inappropriately (e.g. can't remove the owner).
- **`/manage/permissions`**: three `Switch`es — `invite_members`, `approve_join_requests`, `create_posts` —
  seeded from `useCommunityPermissions(id)`, saved via `useUpdatePermissions(id).mutate({ [key]: value })`
  (optimistic; revert on error).
- **`/manage/requests`**: pending join requests (`useCommunityRequests(id)` → `{id, user_id, status, created_at,
  profiles}[]`). Each row: profile + **Accept** (`useAcceptJoinRequest(id).mutate(requestId)`) / **Decline**
  (`useDeclineJoinRequest(id).mutate(requestId)`).
- **`/manage/invite`**: list the user's following (`useFollowing(myUid)`), each row a checkbox/Invite action →
  `useInviteMembers(id).mutate({ inviteeIds, groupIds: [] })`. (Search-based invite + multi-group invite are
  deferred — no web people-search yet, groups are W3.)

## Entry point

A **Manage** `Button` in the W2a `CommunityHeader` (or detail page header), shown only to owner/admin (pass an
`isAdmin` prop / render the button from the detail page where role is known), linking to `/app/community/[id]/manage`.

## Reuse

`@padel/api`: `useCommunity`, `useCommunities`, `useCommunityMembers`, `useMembersRealtime`,
`useCommunityPermissions`, `useUpdatePermissions`, `useUpdateCommunity`, `useCommunityRequests`,
`useAcceptJoinRequest`, `useDeclineJoinRequest`, `useInviteMembers`, `useArchiveCommunity`,
`useTransferOwnership`, `useMakeAdmin`, `useRemoveAdmin`, `useRemoveMember`, `useFollowing`. `uploadCommunityImage`
(W2b). shadcn `Switch`/`Select`/`Textarea`/`Input`/`AlertDialog`/`DropdownMenu`/`Button`/`Card`/`Avatar` (present).
Extend the `community` i18n namespace (en/pt-PT/pt-BR).

## Error / edge handling

- Non-admin hitting `/manage/**` → redirect to the community.
- Destructive actions (remove member, transfer ownership) behind `AlertDialog` confirmation; surface RPC errors
  inline (e.g. can't remove the sole owner).
- Settings image re-upload failure → non-fatal inline warning; text fields still save.
- Permissions toggle optimistic with revert-on-error.

## Verification

`pnpm --filter web typecheck` + `build`; browser (local Supabase, headless Chrome) as an owner/admin: open a
community → **Manage** → hub renders; Settings edits name/privacy + re-uploads a cover → reflected on the detail;
Members → make/remove admin, remove a member; Permissions → toggle persists; Requests → accept a pending request
(member appears); Invite → invite a followed user; Archive → community shows archived; (owner) Transfer ownership
→ role changes. Non-admin visiting `/manage` is redirected.

## Out of scope

Multi-group invite (`groupIds`, needs groups → W3); group creation (W3); event creation (W4); search-based invite
(later); audit log.
