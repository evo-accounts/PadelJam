# Web W3a — Groups (list + detail + ranking + join) — Design

**Slice:** Web W3a (first of two W3 sub-slices). Browse groups + group detail (members, ranking, seasons) +
join/leave + wire the community Groups tab. W3b = create + manage.

## Goal

Players browse their groups and any group's detail — including the **season ranking leaderboard** — and
join/leave, on the existing backend via `@padel/api`.

## Routes (auth-gated)

- **`/app/groups`** — Your Groups. Tabs **All / Managing / Participating** filtering `useMyGroups()` rows
  (`{ group_id, name, community_id, community_name, member_count, is_managing }`) — Managing = `is_managing`,
  Participating = `!is_managing`. A `GroupCard` per row (name, community_name, member_count) → `/app/group/[id]`.
  A **New group** entry (link to W3b's create; render behind nothing for now — it 404s until W3b, so keep it a
  modest link or omit until W3b — include as a disabled/"coming soon" or link). Empty → friendly state.
- **`/app/group/[id]`** — detail:
  - **Header** (`GroupHeader`): thumbnail (`communityImageUrl(group.thumbnail_path,'community-thumbnails')` — group
    thumbnails reuse that bucket per the mobile convention; verify the bucket), name, description, member count,
    a **Season N** badge (the current season from `useGroupSeasons`), an archived badge when `archived_at`.
  - **Ranking** (headline): `useGroupRanking(currentSeasonId, since)` → aggregated rows
    `{ name, avatarUrl, points, events }` (already sorted desc). Render a `RankingTable`: rank #, avatar+name,
    points, events count. A **period filter** (`Select`/buttons: All / Last 3 / 6 / 12 months) computes
    `since = new Date(now - Nmonths).toISOString()` (All → undefined).
  - **Members** (`useGroupMembers(id)` → `{user_id, profiles}[]`) and **Seasons** (`useGroupSeasons` — current
    first; list previous seasons; selecting a previous season re-runs `useGroupRanking(prevSeasonId)` to show its
    final standings).
  - **Events** section → "coming soon" (W4).
  - **CTA** (`useJoinGroup`/`useLeaveGroup`, both `.mutate({ groupId, communityId })`): member → **Leave**;
    not-member + public group + you're a member of the parent community → **Join**; private group + not member →
    "Invite only". A **Manage** link for group admins (→ W3b) — gate via `useMyGroups` `is_managing` for this group.
  - `useGroupRealtime(id)` for live member/ranking updates.
- **Community detail Groups tab** (`/app/community/[id]`): replace the "coming soon" with `useCommunityGroups(id)`
  → list groups → `/app/group/[id]`.

## Current-season selection

From `useGroupSeasons(id)` (ordered `season_number` desc): current = the row with `ended_at == null` (fallback:
the first/highest). Its `id` feeds `useGroupRanking`. Show "Season {season_number}".

## Components

`GroupCard`, `GroupHeader`, `RankingTable` (+ period filter), `GroupMembersList`, `SeasonsList`. Under
`apps/web/src/components/group/`. New `group` i18n namespace (en/pt-PT/pt-BR).

## Reuse

`@padel/api`: `useMyGroups`, `useGroup`, `useGroupMembers`, `useGroupSeasons`, `useGroupRanking`,
`useCommunityGroups`, `useJoinGroup`, `useLeaveGroup`, `useGroupRealtime`. `communityImageUrl` (thumbnails),
`avatarUrl`. shadcn `Tabs`/`Card`/`Avatar`/`Button`/`Badge`/`Select`/`Skeleton`/`Separator`.

## Error / edge handling

- Loading → `Skeleton`; private group a non-member can't see → RLS null → "not available".
- Group with no current season / empty ranking → friendly empty state.
- Join only enabled for public groups when you're a community member; otherwise Join hidden / "Invite only".
- Leave error (e.g. sole admin) surfaced inline.

## Deferred (W3b / later)

Create group; manage (settings/members admin + add-admins/remove/start-new-season/archive/unarchive); invite +
accept-invitation. Group **Events** tab → W4. (`useMyGroups` `New group` create flow lands in W3b.)

## Verification

`pnpm --filter web typecheck` + `build`; browser: `/app/groups` lists my groups by tab (Managing/Participating
split correct); open a group → header + ranking leaderboard renders, the period filter changes the rows; members
+ seasons render; join a public group (as a community member) → CTA flips to Leave; the community **Groups tab**
lists the community's groups linking to detail.

## Out of scope

W3b (create + manage); group events (W4); cross-community group discovery.
