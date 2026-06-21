# Web W3b — Create Group + Manage — Design

**Slice:** Web W3b (final W3 sub-slice). Adds group **creation** + the group-admin **manage** area,
completing the web groups feature. Mirrors the mobile group create + manage screens 1:1.

## Goal

A community owner/admin can create a group on web and manage an existing group (settings, members,
seasons, archive/unarchive, invite) — entirely on the existing backend via `@padel/api`.

## Access gating

All `/app/group/[id]/manage/**` routes and the create route are group-admin-only. A group admin is a
community **owner/admin** (`is_group_admin` in the DB). For an existing group, derive it from
`useMyGroups()` (`row.is_managing` for `[id]`). For creation, gate on `useCanCreateGroup(communityId)`.
Non-admin → `router.replace` to the group / community. Server RPCs + RLS enforce regardless.

## Routes

### `/app/community/[id]/group-create`
Create form gated by `useCanCreateGroup(id)` (redirect to `/app/community/[id]` if `false`/no entitlement).
Fields: `name` (`Input`, required, 1–80 chars), `description` (`Textarea`, optional, ≤2000),
`isPrivate` (`Switch`, default off), thumbnail (optional `<input type="file" accept="image/*">` with preview).
Submit:
1. `const newId = await useCreateGroup().mutateAsync({ communityId: id, name, description, isPrivate })`
   (returns the new group id — confirm `create_group` RPC returns the uuid).
2. If a thumbnail file was picked: `const path = await uploadCommunityImage(file, newId, 'community-thumbnails')`
   then `await useUpdateGroup(newId).mutateAsync({ thumbnail_path: path })`. Wrap in try/catch — a failed
   upload is **non-fatal** (group already exists; thumbnail settable later in Settings).
3. `router.replace('/app/group/' + newId)`.

Hooks rule: `useUpdateGroup(id)` takes the id as a hook arg, so the new-group thumbnail update cannot use a
hook bound to `newId`. Mirror the W2b precedent — do the thumbnail update with a direct
`supabase.from('groups').update({ thumbnail_path }).eq('id', newId)` (via the `@padel/db` client) inside the
submit handler, rather than calling `useUpdateGroup(newId)` mid-handler.

### `/app/group/[id]/manage` (hub)
Gated by `is_managing` (else redirect to `/app/group/[id]`). A `Card` with links to **Settings**, **Members**,
**Seasons**; plus an **Archive/Unarchive** toggle button (label from `group.archived_at`;
`useArchiveGroup`/`useUnarchiveGroup.mutate({ groupId: id, communityId })`). Mirrors the W2d community manage hub.
Shows an "archived" notice when `group.archived_at`.

### `/app/group/[id]/manage/settings`
Edit `name` / `description` / `is_private` (`Switch`) + thumbnail re-upload (`<input type="file">` →
`uploadCommunityImage(file, id, 'community-thumbnails')`). Save → `useUpdateGroup(id).mutate(patch)` with
**snake_case** keys (`name, description, is_private, thumbnail_path`). Seed initial values from `useGroup(id)`.
Image re-upload failure → non-fatal inline warning; text fields still save.

### `/app/group/[id]/manage/members`
`useGroupMembers(id)` list (+ `useGroupRealtime(id)` for live updates). A header **Invite members** link →
`/app/group/[id]/manage/invite`. Per-row **Remove** (`useRemoveGroupMember(id).mutate(userId)`) behind an
`AlertDialog`, **hidden for your own row** (compare to session uid). On error, surface known keys inline /
in the dialog: `forbidden`, `sole_admin_must_add_another`, `sole_owner_must_transfer`, `not_a_member`
(fallback `unknown_error`).

### `/app/group/[id]/manage/seasons`
A **current-season** card (`seasonTag` with `current.season_number`, current = the `useGroupSeasons(id)` row
with `ended_at == null`). A **Start new season** button → `useStartNewSeason(id).mutate()` behind an
`AlertDialog` (`startSeasonConfirm` with `{ current, next }`), surfacing `forbidden`/`not_a_member`/
`group_not_found`. Then a **previous seasons** list (`ended_at != null`, labeled `seasonTag`). Archive lives
on the **hub** only (not duplicated here).

### `/app/group/[id]/manage/invite`
List community members **not already in the group**: `useCommunityMembers(communityId)` minus the
`useGroupMembers(id)` user-ids. `communityId` from `useGroup(id).community_id`. Each row: avatar + name +
**Invite** action → `useInviteToGroup(id).mutate(inviteeId)` (disable/mark the row once invited; surface
errors inline). Empty state when everyone's already a member. Mirrors mobile's invite source (community
members, **not** following).

## Entry points
- The **Manage** button already exists on the W3a group detail (gated by `is_managing`) → `/app/group/[id]/manage`.
- The **New group** link on `/app/groups` and the community **Groups** tab on `/app/community/[id]` →
  `/app/community/[id]/group-create`. (W3a left these as placeholders/links; wire them to the real route.)

## Reuse
`@padel/api`: `useCanCreateGroup`, `useCreateGroup`, `useUpdateGroup`, `useGroup`, `useGroupMembers`,
`useGroupSeasons`, `useGroupRealtime`, `useStartNewSeason`, `useArchiveGroup`, `useUnarchiveGroup`,
`useRemoveGroupMember`, `useInviteToGroup`, `useCommunityMembers`. `useDb`/`@padel/db` for the one direct
new-group thumbnail update. `uploadCommunityImage` (community-thumbnails bucket — W2b). Extend the existing
`group` i18n namespace (en/pt-PT/pt-BR) in `lib/i18n-web.ts`. shadcn `Switch`/`Input`/`Textarea`/`AlertDialog`/
`Card`/`Button`/`Avatar`/`Skeleton` — all present.

## Error / edge handling
- Non-admin (or no create entitlement) hitting a gated route → redirect.
- Create: thumbnail upload failure non-fatal (group created); name validation inline.
- Settings: image re-upload failure → inline warning, text still saves.
- Remove member / start season: destructive/confirm behind `AlertDialog`; map known RPC error keys to i18n,
  fallback `unknown_error`.
- Archive when at the per-community group cap on unarchive → surface `groups_per_community`.

## i18n (new `group` keys to add)
`createTitle, createCta, groupName, groupNamePlaceholder, descriptionLabel, privateLabel, privateHint,
manageTitle, settingsRow, membersRow, seasonsRow, save, saving, archive, unarchive, archivedNotice,
inviteMembersCta, removeMemberCta, removeMemberConfirm ({{name}}), currentSeasonLabel, seasonTag ({{number}}),
startSeasonCta, startSeasonConfirm ({{current}},{{next}}), previousSeasons, confirm, cancel, errorTitle,
invitedLabel, noOneToInvite, forbidden, sole_admin_must_add_another, sole_owner_must_transfer, not_a_member,
group_not_found, groups_per_community, unknown_error` (translate pt-PT/pt-BR). Reuse existing W3a keys where
present (`season`, `members`, `manage`, etc.).

## Verification
`pnpm --filter web typecheck` + `build`; browser (local Supabase, as a community owner/admin): community
**Groups** tab → **New group** → create with name + thumbnail → lands on the new group detail with the image;
open **Manage** → Settings edits name/privacy + re-uploads thumbnail → reflected on detail; **Members** → remove
a member (confirm dialog), **Invite** a community member → they appear as a member; **Seasons** → start a new
season → season number increments and the prior season moves to "previous"; **Archive** on the hub → group shows
the archived badge, **Unarchive** reverts. A non-admin visiting `/manage` or `/group-create` is redirected.

## Out of scope
Accept group invitation UI (notification deep-link → W6); `add_group_admins` UI (internal sole-admin-leave
helper, no mobile UI); group events (W4); cross-community group discovery; transfer-group-ownership.
