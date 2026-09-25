# UX Audit — Groups: implementation plan

## Context

`UX-Audit-Groups.docx.pdf` (section 10 of the external audit) — 15 items, **UX-GRP-01..15**. Fourth in the
series after Global, Community and Profile & Settings. Main is at `01c0024`.

As before, **the Problems predate earlier merges; trust the Suggestions.** Already false today: group
creation exists (community Groups tab + Manage Groups, gated on `can_create_group`); Manage Members
removes from the group only (the community-wide "Remover da comunidade" lives on the community Members
screen); the "⋯" is already the app's own sheet, not the native one.

`Requirements/groups.md` (v1.2) disagrees with the audit in several places. The decisions below are the
tie-break; the requirements doc is amended in the last PR.

## Decisions (product owner, 2026-09-25 — do not re-litigate)

1. **Private groups stay private from admins.** A community admin sees/manages a private group only as a
   member (GR-17/GR-35, `is_group_admin` unchanged). The audit's intro sentence is read as "public groups".
   The leave guard stays group-scoped (last community admin *inside a private group*), but is checked
   **before** the confirm sheet, per GRP-15. The audit's "Promote another admin first" copy is adapted:
   "Add another admin first", primary "Add admin" → the existing multi-select sheet.
2. **Leaving keeps you in the history (audit, overrides GR-15/GR-16).** A departed player stays in the
   ranking, members list and past events in greyscale with a "No longer in group" tag. Rejoining in the
   same season restores their points (free: results are keyed by user and never deleted). Rejoining in a
   new season starts at zero (also free). Stored as a `group_departures` table, NOT a soft-delete on
   `group_members` — a `left_at` column would have to be threaded through every membership helper, RLS
   policy and `chat_channel_spec`.
3. **Win / Lost are stored.** `group_event_results` gains `wins`, `losses`; `finish_event` and
   `set_event_ranking` write them; existing rows are backfilled from `standings()`. Preview (GRP-04):
   Points / W / L, top 10. Full ranking (GRP-06): Points / Events played. Both sortable.
4. **Group chat survives as a row.** "Abrir conversa" leaves the page; "Open chat" becomes a row in the
   members' ⋯ sheet and the admins' Manage Group sheet (the channel is created on demand, so removing
   every entry point would silently kill group chat for new groups).

Defaults taken (object at plan review):

5. Full web parity, mobile PR then web PR per area.
6. "Create group" shows on **permission** (`may_create_group`), not on permission+plan cap; hitting the
   cap opens the existing `UpgradePrompt`. Today the cap hides the button, so a Starter community (limit 1,
   the default group counts) never learns why it cannot create a group.
7. The default group can be renamed, made private and left (audit) — amends CM-07 "every member belongs
   to the general group". Its name stays `"<community> group"` → audit casing `"<community> Group"` for
   new communities only; existing names untouched.
8. The Manage Group row is labelled **"Reset ranking"** (audit), its sheet explains that it closes the
   season and starts a new one. `Requirements` GR-20 wording is amended.
9. "Season ended" notice for other members: "seen" is tracked on the device (AsyncStorage / localStorage
   keyed by season id). No migration.
10. Group Settings (GRP-11) opens as a `formSheet` modal with ✕ top-right and a fixed Save — the same
    sheet treatment the audit asks for, without cramming a four-field form into `BottomSheet`.
11. **Preset thumbnails** ship upload-only until the product owner supplies the preset images (blocking
    input for that one row, same pattern as the badge catalogue). Everything else in GRP-01 ships.

## Bugs found while mapping (fixed regardless)

| # | Bug | Where | PR |
|---|-----|-------|----|
| B1 | Any signed-in user can insert themselves into a **private** group directly | policy `group_members: insert self` (0029:32) | 1 |
| B2 | Self-delete of `group_members` bypasses `leave_group`'s sole-admin guard | policy 0038:18-20 | 1 |
| B3 | Default group has **no season** → its finished events never reach any ranking | `create_community_with_personal_tenant` (0099:380) | 1 |
| B4 | `invite_to_group` ignores the community `invite_members` permission; members see "+ Invite" and get `forbidden` | 0036:46-54 | 1 |
| B5 | No decline for group invitations; re-inviting someone who accepted then left is a silent no-op | 0034:19, 0036 | 1 |
| B6 | `archive_group` cancels no events; last-group guard only protects the default group | 0099:463-481 | 2 |
| B7 | `join.tsx` is unreachable; hard-coded "0 members"; `invitedTitle` fills the group name, not the inviter; `ack` never passed → rules gate shows as unknown error | mobile `group/[id]/join.tsx` | 11 |
| B8 | Your Groups "+" is labelled "new group" but opens Explore | mobile `groups/index.tsx:30,56` | 12 |
| B9 | Web profile links to `/app/groups/{id}` (404) | web `ProfileSections.tsx:77` | W1 |
| B10 | Web Leave has no confirmation and every error reads "group not available"; web Archive has no confirmation | web `group/[id]/page.tsx:90`, `manage/page.tsx:55` | W1 |
| B11 | Leave does not invalidate `my_groups` | `packages/api/src/groups/mutations.ts:84` | 1 |

## PR sequence

Migrations are 0107–0109. Every PR touching `apps/mobile/**`, `packages/**` or `infra/**` queues the
~37-min self-hosted E2E and they serialise; web-only PRs skip E2E and run in parallel. Mobile PRs open as
drafts until green locally. Each PR: `check` green + E2E green → squash-merge → next.

**0 — docs.** This plan + the audit transcription as `docs/audit/2026-09-25-ux-groups{,-plan}.md`.

**1 — migration 0107 "group integrity"** (+ `packages/api`): B1–B5, B11.
- Drop `group_members: insert self`; joining only through `join_group` / `accept_group_invitation`.
- Self-delete policy narrowed to admins; new `remove_group_member(group, user)` RPC (admin, not self);
  `useRemoveGroupMember` switches to it.
- `leave_group_preflight(group) returns text` ('ok' | 'sole_admin') for the pre-confirm check.
- Community creation inserts season 1 for the default group; backfill: every group without any season
  gets season 1 `started_at = groups.created_at`, and completed `counts_for_ranking` events in those groups
  get their `group_event_results` written.
- `invite_to_group`: group admin, OR group member when the community's `invite_members` is on. Invitee
  outside the community allowed (already is). Re-invite resets an accepted/declined row to pending.
- `group_invitations.status` gains `declined`; `decline_group_invitation(group)` RPC.
- SQL tests for each.

**2 — migration 0108 "departures + archive"** (+ `packages/api`): decision 2, B6.
- `group_departures(group_id, user_id, left_at)` — upserted by `leave_group` / `remove_group_member`,
  deleted on rejoin/accept. `group_member_list(group)` RPC returns current + departed with `is_member`.
- `archive_group`: cancels every upcoming event of the group through `cancel_event` (so participants are
  notified), deactivates its series; refuses when it is the community's last active group (any group).
- `my_groups` gains `community_id`, `community_name`, `archived` (admins only see archived rows).

**3 — migration 0109 "ranking W/L"** (+ `packages/api`): decision 3.
- `wins`, `losses` on `group_event_results`; written by `finish_event` / `set_event_ranking`; backfill
  from `standings()`. `group_ranking(group, season, since)` RPC moves aggregation server-side and returns
  points, wins, losses, events_played, is_member, plus `last_updated` (max result `created_at`).

**4 — mobile: shared pieces.** `AvatarStack` (UX-GLOB-04 overlapping avatars + count), compact
messaging-style `GroupHeader`, `GreyscaleAvatar`/"No longer in group" tag. Storybook stories.

**5 — mobile GRP-04 + GRP-09 + GRP-10: group page and its two sheets.** Compact header, ⋯ for members /
settings icon for admins, avatars + count + "+ Invite members" on one line (permission-gated), no chat
button, Events row or empty state, Ranking top-10 (W/L) with "Last update" and "See all", no pills until
there is content, past seasons section, General info (community card + created date). ⋯ sheet: Share
(link), Open chat, Leave. Manage Group sheet: Group settings, Manage members, Reset ranking, Open chat,
Share, Leave, Archive (disabled with reason when last active group). `manage/index.tsx` deleted.

**6 — mobile GRP-05 + GRP-06 + past seasons.** Group Events (Upcoming/Past, create at top, per-tab
empty), full Ranking (Points/Events played, sort, greyscale departed, fixed Share), season detail
(final ranking + its events).

**7 — mobile GRP-14: Reset ranking.** Confirm sheet → completion screen (closing message, final
leaderboard, Share); other members see the season-ended notice once. `manage/seasons.tsx` deleted.

**8 — mobile GRP-07 + GRP-12 + GRP-13 + GRP-15.** One members component for both paths: search,
permission-gated "Invite member", departed greyscale; admins tap → member sheet (See profile / Remove
from group, with confirm), swipe → Remove; members tap → profile. Leave: preflight first, then either the
"Add another admin first" sheet or the confirm sheet ("removes access… match records are kept").

**9 — mobile GRP-08: Invite.** ✕ header, Share + Copy link, "or", search; sections Community members /
My connections, anyone else by name search; multi-select; fixed "Invite (n)"; outsiders trigger the
"Invite members to group & community" sheet.

**10 — mobile GRP-01 + GRP-11: Create / Settings.** Fixed footer button disabled until name is filled,
success banner on the new group, community selector sheet when opened from Your Groups with >1 eligible
community, permission-only visibility (decision 6). Settings as a formSheet (decision 10).

**11 — mobile GRP-02: Join / preview.** Public: full content visible, fixed "Join group". Private (via
invitation notification / link): identity-only preview, inviter above Decline / Accept. After joining:
banner. B7.

**12 — mobile GRP-03: Your Groups.** No tabs; sections per community with "Show all" and a horizontal
row of compact cards; "+" and "Create group" when eligible; archived with tag for admins → read-only
view with fixed "Unarchive group" + confirm; empty state → Explore with the Groups tab selected. B8.

**W1..W6 — web parity**, one per mobile area (5, 6, 7, 8, 9, 10–12), each branched after its mobile
counterpart merges, plus B9/B10 in W1.

**13 — docs.** Amend `Requirements/groups.md` (GR-15/16/20/35 wording, W/L, default group) and
`communities.md` CM-07; state-and-next-steps note; hosted hand-off (paste 0107–0109 via the dashboard SQL
editor, one probe statement).

## Blocking inputs

- Preset thumbnail images (decision 11) — only gates the preset row.
- Hosted migration paste of 0107–0109 — the account cannot push; the user pastes.
