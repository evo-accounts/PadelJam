# Phase 5E-1 — Groups Gap-Closing — Design

*Padel Jam • 2026-06-16 • Brainstormed design / spec*

## Goal

Close four group gaps: **GR-12** Your-Groups All/Managing/Participating tabs, **GR-11** private-group
no-access page, **GR-34** ranking period filter (3/6/12 months), **GR-40** sole-admin-leave "Add admin"
resolution. GR-29 (shareable invite link) is deferred to its own slice.

## Scope decisions (from the 5E brainstorm)
1. **5E-1 = GR-11/12/34/40**; defer GR-29 (per-member invites already exist).
2. **GR-34 today-relative** window only (current-season case); closed-season "relative to season end"
   is a documented follow-up.
3. No archived-group tag in Your-Groups (YAGNI; GR-12 only requires the three tabs).

## Verified context
- `my_groups()` (`0064`) returns `group_id, name, community_id, community_name, member_count` (active
  groups, `archived_at is null`) — no managing/role signal.
- `is_group_admin(g, u)` (`0035`) = the user is `owner`/`admin` in the group's community (admin is
  **community-inherited**, no group-level role). `leave_group` (`0036`) raises `sole_admin_must_add_another`.
- `useGroupRanking(seasonId)` reads `group_event_results` rows directly (not an RPC):
  `select user_id, ranking_points, event_id, profiles(...)` filtered by `group_season_id` — no event date.
- `group/[id]/index.tsx` uses `useGroup` (`maybeSingle` → null when RLS hides a private group); the More
  menu has a Leave action; ranking renders via a `RankingList` component.
- Community admin promotion already exists (`useMakeAdmin`); community members via `useCommunityMembers`.

## Architecture

### Migration `0068_groups_gaps.sql`
- Extend `my_groups()` (`create or replace`, return type changes → drop+recreate): add
  `is_managing boolean` = `is_group_admin(g.id, auth.uid())` to the returned columns. Re-grant.
- `add_group_admins(p_group_id uuid, p_user_ids uuid[]) returns void`
  (`language plpgsql security definer set search_path = public`): if caller not `is_group_admin(p_group_id, auth.uid())`
  → `raise 'forbidden'`. For each id in `p_user_ids` that is a community admin of the group's community
  (`is_community_admin`/`community_members.role in ('owner','admin')`) and not already a member, insert
  into `group_members (group_id, user_id) … on conflict do nothing`. Grant to authenticated.
- SQL tests (`groups_gaps.sql`): `my_groups` returns `is_managing=true` for an admin-owned group and
  `false` for a participate-only group; `add_group_admins` adds a community admin (and a non-admin caller
  is `forbidden`). `PT001`/`OK groups_gaps`.
- Hand-edit `database.types.ts`: `my_groups` Returns gains `is_managing: boolean`; add `add_group_admins`.

### `@padel/api`
- `useMyGroups`: `MyGroup` type gains `is_managing: boolean`.
- `useGroupRanking`: extend the select to embed the event date — `event_id, events(starts_at), …` —
  so the row carries `events: { starts_at } | null`. Adjust the `.returns<…>()` type.
- `useAddGroupAdmins(groupId)`: mutation → `db.rpc('add_group_admins', { p_group_id, p_user_ids })`,
  invalidates `qk.groupMembers(groupId)` + `qk.myGroups`.
- `useGroupAdmins(communityId, groupId)` helper (or compute in-screen): community admins not already
  in the group — reuse `useCommunityMembers(communityId)` filtered to `role in (owner,admin)` minus the
  group's members (`useGroupMembers(groupId)`).

### Mobile
- **GR-12** `apps/mobile/app/groups/index.tsx`: a segmented **All / Managing / Participating** tab over
  `useMyGroups`; filter `Managing = g.is_managing`, `Participating = !g.is_managing`, `All` = no filter.
- **GR-11** `apps/mobile/app/group/[id]/index.tsx`: after loading, if `group == null`, render a no-access
  view (icon/title `noAccessTitle` + body `noAccessBody` + a Back button) instead of the current blank/error.
- **GR-34** group ranking section: a period filter control (`All | 3m | 6m | 12m`) that windows the
  ranking results by `events.starts_at >= cutoff` (cutoff = now − N months; "All" = no cutoff) before the
  `RankingList` aggregates. Implement in whichever component owns the ranking aggregation (the screen or
  `RankingList`); pass the filtered results.
- **GR-40** leave flow (`group/[id]/index.tsx`): catch `leave_group`'s `sole_admin_must_add_another`
  error → open an "Add admin" modal listing community admins not in the group (multi-select) →
  `useAddGroupAdmins` → on success, retry leave (or prompt the user to leave again). If no eligible
  admins exist, show a message to promote a community admin first.
- i18n (`group` namespace): `tabAll`/`tabManaging`/`tabParticipating`, `noAccessTitle`/`noAccessBody`,
  `period*` (all/3m/6m/12m), `addAdminTitle`/`addAdminBody`/`addAdminCta`/`noEligibleAdmins`.

## Error handling
- No-access: the null-group branch is the catch-all for RLS-hidden/deleted/private groups.
- `add_group_admins` `forbidden`/empty selection → inline error in the sheet; leave retry only after a successful add.
- Ranking with no results in the window → the existing empty state.

## Explicitly deferred
- GR-29 shareable invite link + deep-link join; closed-season-relative period; archived-group tag.

## Conventions followed
Additive migration `0068`; `security definer set search_path = public` + grants; SQL test
`set_config`/`PT001`/`OK`; hand-edited `database.types.ts`; thin `@padel/api` hooks + `qk`; `useT('group')`;
reuse `useCommunityMembers`/`useGroupMembers`; segmented-tab pattern from the chat list.
