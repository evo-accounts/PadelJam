# Web W3a — Groups (list + detail + ranking + join) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Your-Groups list, group detail (members, season ranking leaderboard + period filter, seasons), join/leave, and the community Groups tab.

**Architecture:** New `group` i18n namespace + components, routes under `(app)/app/groups` and `(app)/app/group/[id]`, and wiring the existing community detail Groups tab. Data via `@padel/api` group hooks.

**Tech Stack:** Next.js App Router (client), `@padel/api`, shadcn/ui.

**Verified shapes (confirm in `packages/api/src/groups/queries.ts`):** `useMyGroups()` → `{ group_id, name, community_id, community_name, member_count, is_managing }[]`; `useGroup(id)` → full `groups` row (`id, community_id, name, description, thumbnail_path, is_private, is_general, archived_at, created_by, created_at`); `useGroupMembers(id)` → `{ user_id, created_at, profiles: {id, full_name, avatar_url}|null }[]`; `useGroupSeasons(id)` → `group_seasons[]` (`id, group_id, season_number, started_at, ended_at`) ordered season_number desc; `useGroupRanking(seasonId, since?)` → `{ name, avatarUrl, points, events }[]` sorted desc (since = ISO date); `useCommunityGroups(communityId)` → `groups[]`; `useJoinGroup()/useLeaveGroup().mutate({ groupId, communityId })`; `useGroupRealtime(id)`. Confirm the group thumbnail bucket (mobile uses `community-thumbnails`) before wiring images.

---

## Task 1: `group` i18n + components

**Files:** modify `apps/web/src/lib/i18n-web.ts`, `apps/web/src/components/Providers.tsx`; create `apps/web/src/components/group/{GroupCard,GroupHeader,RankingTable,GroupMembersList,SeasonsList}.tsx`.

- [ ] **Step 1:** Add a `webGroup` bundle + `registerWebGroupCopy(instance)` (namespace `'group'`), called in `Providers.tsx` after `registerWebCommunityCopy`. English keys (translate pt):
```
title:'Groups', all:'All', managing:'Managing', participating:'Participating', newGroup:'New group', emptyGroups:'You are not in any groups yet.',
members:'Members', ranking:'Ranking', seasons:'Seasons', events:'Events', comingSoon:'Coming soon', season:'Season {{n}}', previousSeasons:'Previous seasons', currentSeason:'Current season',
join:'Join', leave:'Leave', inviteOnly:'Invite only', manage:'Manage', archived:'Archived',
periodAll:'All time', period3:'Last 3 months', period6:'Last 6 months', period12:'Last 12 months',
rank:'#', points:'Points', eventsPlayed:'Events', emptyRanking:'No ranking yet.', memberCount:'{{count}} members', notAvailable:'This group is not available.'
```
- [ ] **Step 2:** `GroupCard.tsx` — props `{ group: { id|group_id; name; community_name?; member_count?; thumbnail_path?|null; archived_at?|null } }`. shadcn `Card` linking to `/app/group/${id}`: thumbnail (`communityImageUrl(thumbnail_path,'community-thumbnails')`, fallback initials), name, `community_name` subtitle, `memberCount` badge, archived badge if applicable. (The list uses `group_id`+`name`+`community_name`+`member_count`; the community-tab uses the `groups` row `id`/`name`. Accept both via a normalized prop or two small variants — keep typecheck clean.)
- [ ] **Step 3:** `RankingTable.tsx` — props `{ rows: { name: string|null; avatarUrl: string|null; points: number; events: number }[] }`. A table: rank index (1-based), `Avatar`+name, points, events. Empty → `emptyRanking`.
- [ ] **Step 4:** `GroupMembersList.tsx` — props `{ members: {user_id; profiles:{full_name,avatar_url}|null}[] }`. Avatar + name (link `/app/profile/${user_id}`).
- [ ] **Step 5:** `SeasonsList.tsx` — props `{ seasons: {id; season_number; ended_at: string|null}[]; selectedId; onSelect }`. List seasons (current = `ended_at===null` labeled `currentSeason`, others `season {n}`); clicking selects it (for the ranking view).
- [ ] **Step 6:** `pnpm --filter web typecheck` → PASS. Commit: `git add apps/web/src/lib/i18n-web.ts apps/web/src/components/Providers.tsx apps/web/src/components/group && git commit -m "feat(web): group i18n + components (W3a)"`

---

## Task 2: Your-Groups list `/app/groups` + community Groups tab

**Files:** create `apps/web/src/app/(app)/app/groups/page.tsx`; modify `apps/web/src/app/(app)/app/community/[id]/page.tsx`.

- [ ] **Step 1: `/app/groups/page.tsx`** — client. `const mine = useMyGroups();` shadcn `Tabs` (All/Managing/Participating). Filter rows: All = all; Managing = `is_managing`; Participating = `!is_managing`. Map to `<GroupCard group={{ id: r.group_id, name: r.name, community_name: r.community_name, member_count: r.member_count }} />`. Loading → `Skeleton`; empty → `emptyGroups`. (A **New group** link can point to `/app/community` for now or be omitted — create lands in W3b; keep it minimal.)
- [ ] **Step 2: community Groups tab** — in `community/[id]/page.tsx`, add `const groups = useCommunityGroups(id);` (unconditional, with the other hooks). Replace the **Groups** `TabsContent` "coming soon" with: loading → `Skeleton`; empty → a message; else `groups.data.map(g => <GroupCard key={g.id} group={g} />)` (the `groups` row has `id`/`name`/`thumbnail_path`).
- [ ] **Step 3:** `pnpm --filter web typecheck` + `build` → PASS. Commit: `... -m "feat(web): your-groups list + community groups tab (W3a)"`

---

## Task 3: Group detail `/app/group/[id]`

**Files:** create `apps/web/src/app/(app)/app/group/[id]/page.tsx`.

- [ ] **Step 1:** Client page. Hooks (all before any return): `const { id } = useParams(); useGroupRealtime(id); const group = useGroup(id); const members = useGroupMembers(id); const seasons = useGroupSeasons(id); const mine = useMyGroups(); const join = useJoinGroup(); const leave = useLeaveGroup();` plus `const [period, setPeriod] = useState<'all'|'3'|'6'|'12'>('all'); const [selectedSeason, setSelectedSeason] = useState<string | null>(null);`
- [ ] **Step 2:** Derive: `currentSeason = seasons.data?.find(s => s.ended_at === null) ?? seasons.data?.[0];` `seasonId = selectedSeason ?? currentSeason?.id;` `since = period==='all' ? undefined : new Date(Date.now() - Number(period)*30*24*3600*1000).toISOString();` `const ranking = useGroupRanking(seasonId ?? '', since);` `const myRow = mine.data?.find(r => r.group_id === id); const isMember = !!myRow; const isManaging = !!myRow?.is_managing;`
- [ ] **Step 3:** Loading → `Skeleton`; `!group.data` → `notAvailable`. Render `<GroupHeader>` (thumbnail/name/description/member count/`season` badge for `currentSeason?.season_number`/archived) + a **CTA**: member → `Leave` (`leave.mutate({ groupId: id, communityId: group.data.community_id })`); else if `!group.data.is_private` → `Join` (`join.mutate({ groupId: id, communityId: group.data.community_id })`); else `inviteOnly` (disabled). If `isManaging`, a `Manage` link (→ `/app/group/${id}/manage`, W3b).
- [ ] **Step 4:** Tabs/sections: **Ranking** — a period `Select` (All/3/6/12 → `setPeriod`) + `<RankingTable rows={ranking.data ?? []} />`; **Members** — `<GroupMembersList members={members.data ?? []} />`; **Seasons** — `<SeasonsList seasons={seasons.data ?? []} selectedId={seasonId} onSelect={setSelectedSeason} />` (selecting a previous season re-runs the ranking for it); **Events** — `comingSoon`.
- [ ] **Step 5:** `pnpm --filter web typecheck` + `build` → PASS. Commit: `... -m "feat(web): group detail (ranking/members/seasons) + join/leave (W3a)"`

---

## Task 4: End-to-end verification (browser)

No code. `pnpm --filter web dev`; headless Chrome.

- [ ] **Step 1:** typecheck + build → PASS.
- [ ] **Step 2:** `/app/groups` lists your groups; Managing/Participating tabs filter correctly.
- [ ] **Step 3:** Open a group → header + ranking leaderboard renders; change the period filter → rows update; Members + Seasons render; selecting a previous season shows its standings.
- [ ] **Step 4:** Join a public group (as a member of its community) → CTA flips to Leave. Community detail → **Groups** tab lists the community's groups → opening one lands on the group detail.

---

## Verification (summary)
Per-task typecheck; build after Tasks 2 + 3; browser smoke (Task 4). Finish via superpowers:finishing-a-development-branch.

## Out of scope
W3b (create + manage); group events (W4); invite/accept-invitation.
