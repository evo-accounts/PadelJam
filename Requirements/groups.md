# Groups Module — Create, Join, View & Manage

*Padel Jam — Version 1.2 • May 2026 • Second round of review adjustments*

This document defines the Groups module of Padel Jam: creating a group, joining one, viewing it as a member, and managing it as an admin. A group is the competitive layer of the product — it owns a ranking and is where events live. Groups sit inside communities; the Communities module is specified in a separate, following document.

> **Amended 2026-09-25 by the Groups UX audit** (`docs/audit/2026-09-25-ux-groups.md`, decisions in
> `docs/audit/2026-09-25-ux-groups-plan.md`). Where this document and the audit disagreed, the product owner
> decided; the rows below marked *(amended)* carry the outcome. In short:
>
> - **Leaving keeps you in the history.** A player who leaves stays in the member list, the ranking and past
>   events, greyscale with a "No longer in group" tag. Rejoining in the SAME season restores their points;
>   rejoining in a new season starts at zero. Match records are never lost (GR-15, GR-16, §5.3).
> - **Private groups stay private from community admins** unless they are members — GR-17/GR-35 are kept,
>   against the audit's "admins administer every group". The sole-admin leave guard applies to private
>   groups only, and is checked before the confirmation, never after (GR-36/40).
> - **"Reset ranking"** is the admin-facing name of "Start new season" — the same action: it closes the
>   season and starts the next, nothing is destroyed (GR-20/31). The admin sees a completion screen with
>   the final standings; other members get a one-time "season ended" notice.
> - **The ranking shows Win / Lost** (matches won and lost) on the group page's top-10 preview, and
>   Points / Events played on the full ranking (§5.2, §7).
> - **Your Groups has no tabs**: one section per community (GR-12).
> - **The general group** is named "[Community] Group" and can be renamed, made private and left like any
>   other; whichever group is the community's LAST active one cannot be archived (§6.4). Archiving cancels
>   the group's upcoming events.
> - **Create Group** shows wherever the user may create a group (community admin, or the community's
>   "create groups" permission); the plan's group limit is explained on submit, not by hiding the action
>   (GR-02, GR-38). Its button stays enabled and says what is missing (UX-GLOB-06).
> - **Inviting** reaches anyone — community members, the people you follow, anyone found by name; someone
>   outside the community joins both on accepting. Invitations can be declined.

**Confirmed design decisions**

- A group always lives inside a community — there is no standalone group.

- Roles are community-level. There is no group-specific role. Community owners and admins administer every PUBLIC group automatically; PRIVATE groups are administered only by their creator and any community admins explicitly added to the group as members. group_members is plain membership.

- Private group = invisible to the community, invite-only. Public group = any community member can join. There is no request-to-join at the group level.

- Joining a group also adds the user to its community; inviting someone to a group brings them into the community too (shown via a confirmation).

- Members are invited after the group is created — there is no add-members step during creation.

- Leaving a group removes the player’s ranking standing and game history from the CURRENT season; their results in PREVIOUS seasons are preserved as historical record. A player who rejoins starts from zero in the current season.

- An admin cannot leave a group while they are its only admin: they must add another community admin to the group as a member first (mirrors the sole-owner transfer pattern).

- A group is never deleted — only archived. An archived group accepts no new events and can be unarchived.

- There is no "reset ranking". Instead an admin can "Start new season" — which closes the current season (Season N) and starts the next (Season N+1). The closed season’s ranking and event history are archived under "Previous Seasons" on the group page. No game data is destroyed.

- Only the final PLACEMENT in an event counts toward the group ranking — the event’s scoring mode (points / classic / time) is never carried over.

- The thumbnail picker offers a library of pre-defined images plus an Upload option.

- Member-level permissions — inviting members, creating events — are governed by community-level settings (defined in the Communities doc).

- The ranking model in section 07 is a preliminary, non-final design.

## Overview

**What a group is**

A group is a recurring circle of padel players — e.g. "the Tuesday 8pm crowd". It belongs to one community (a club, a team, or any larger circle — the Communities doc covers the variants), holds a persistent ranking, and is the scope inside which events are created. Players inside a group compete with each other across events; the group ranking accumulates those results.

**Hierarchy & roles**

- Community → Group → Event. A group references exactly one community; an event references at most one group.

- Roles live at the community level only. There is no separate group owner or group admin. Community owners and admins automatically administer every PUBLIC group in their community; PRIVATE groups are administered only by their creator and any community admins who have been explicitly added to the group as members.

- group_members records plain membership, with no role column. "Managing" a group is an authority derived from the user’s community role — gated, for private groups, on also being a member of the group.

- The full role model (owner / admin / member, how admins are appointed) is specified in the Communities doc; this doc references it.

**The four sub-flows**

|  |  |  |
|----|----|----|
| **Sub-flow** | **Who** | **Summary** |
| Create Group | Community owner / admin | Create a group inside a community. Members are invited afterwards. |
| Join Group | Any player | Join a public group directly, or a private group by invitation. |
| View Group | Group member | The group page — members, events, ranking — plus Share and Leave. |
| Manage Group | Community owner / admin | Group settings, manage members, reset ranking, archive. |

**Out of scope**

- The Communities module — creating / managing communities, the role model, community-level permission settings (separate doc).

- The Events module — fully specified in the Create / Join-Manage / In-progress Event docs.

- The final ranking algorithm — section 07 is a preliminary model.

## Data model

Five tables. communities, community_members, profiles and events are referenced as foreign keys and defined in their own documents. Full SQL is in section 09.

|  |  |
|----|----|
| **Table** | **Purpose** |
| groups | The group itself — community, name, privacy, archive state. |
| group_members | Plain membership (group ↔ user). No role column. |
| group_invitations | Pending / accepted invitations to join a group. |
| group_seasons | Successive seasons of a group. The current season has ended_at IS NULL. |
| group_event_results | Per-event final placement and ranking points per player, scoped to a season — the input to the season ranking. |

## Create Group

## Creating a group

|  |  |
|----|----|
| **Who can create** | Only users who own or administer at least one community. The number of groups a user may create is also gated by their subscription tier — defined in the Subscription section of the Profile & Settings doc (per-tier limits TBD). |
| **Entry** | The "New group" button on the "Your Groups" list. |
| **Community** | A dropdown. If the user administers exactly one community, it is preselected and effectively fixed. If they administer several, they choose which community the group belongs to. |
| **Name** | Required, single-line text. |
| **Description** | Optional, short free text (the tagline shown under the group name). |
| **Thumbnail** | Optional. The picker offers a library of pre-defined images plus an Upload option (jpeg / png / webp). |
| **Private Group** | Toggle, default off. Help text: "Only invited players can see the group." See section 04 for the visibility rules. |
| **No members step** | Creation has no add-members step. The creator becomes the first member; everyone else is invited afterwards from the group page (section 05). |
| **On create** | A "\[Group\] created!" toast is shown and the creator lands on the new group’s page. |
| **DB impact** | Inserts a groups row, a group_members row for the creator, and the initial group_seasons row (season_number = 1, started_at = now(), ended_at = NULL). |

## Join Group

How a player joins depends on the group’s privacy. Either way, joining a group also makes the player a member of the group’s community.

### 4.1 Public group

|  |  |
|----|----|
| **Visibility** | Visible to every member of the community. |
| **Joining** | The group details screen shows a "Join Group" button. Any community member can tap it to join directly — no invitation, no approval (there is no request-to-join at the group level). |
| **Result** | A "You joined \[Group\]!" banner; the player is now a group member. |
| **DB impact** | Inserts a group_members row; also inserts a community_members row if the user was not already in the community. |

### 4.2 Private group

|  |  |
|----|----|
| **Visibility** | Invisible to the community at large — including community admins. Only invited players, current members, and the creator can see it. A community admin who has not been invited cannot view or manage the group; to gain access they must be invited like anyone else. |
| **Joining** | Only by invitation. The group details screen shows "\[Name\] invited you!" and a Join button. |
| **No access** | If a private-group link is opened by a user who has not been invited, a no-access page is shown — the same treatment as a private event link. |
| **DB impact** | On join: group_invitations row set to accepted; group_members inserted; community_members inserted if needed. |

### 4.3 Inviting players into a group

- "+ Invite members" is available on the group page only when the community’s permission settings allow members to invite (this permission is defined in the Communities doc). Community owners / admins can always invite — but for a PRIVATE group only when they themselves are members of that group.

- Inviting opens a searchable people list with Share and Copy Link actions.

- When the organizer confirms an invite, a confirmation modal makes the side effect explicit: "Members will be added to this group and \[Community\]." — joining the group means joining the community.

- A private group requires invitations to grow; a public group can also be invited into, but community members can join it on their own regardless.

## View Group — member perspective

### 5.1 Your Groups

- A "Your Groups" list with three tabs: All, Managing (groups the user administers), Participating (groups the user is a plain member of).

- A "New group" button (visible only to community owners / admins) opens Create Group.

- Archived groups appear under Managing with an "archived" tag (see section 06).

### 5.2 The group page

- Header: thumbnail, group name, description tagline, and a row of member thumbnails.

- "+ Invite members" link (subject to 4.3).

- Events section: a preview with a "See all" into the full Events screen (Upcoming / Past tabs).

- Ranking section: a preview with a "See all" into the full Ranking screen (Points · Events played, last-updated date, Share).

- Tapping the member thumbnails opens the Members list — searchable; tapping a member lets the user see that profile or invite people.

- A More menu offers Share (system share sheet / copy link) and Leave Group.

- A "Season N" tag is shown on the group page indicating the current season number.

- A "Previous Seasons" section sits at the bottom of the page — after the community and "Created on" info — listing the group’s closed seasons (see section 07).

### 5.3 Leaving a group

|  |  |
|----|----|
| **Action** | More menu → Leave Group, with a confirmation modal. |
| **Confirmation copy** | *(amended)* "You'll lose access to the group's information. Your match records are kept." |
| **Effect — current season** | The player is removed from group_members; their entry disappears from the current-season ranking. The underlying game data is NOT deleted — events and match records stay intact, so other players’ stats and rankings remain unaffected. |
| **Effect — previous seasons** | The player’s results in PREVIOUS seasons are preserved as historical record. They continue to appear in those seasons’ rankings even after leaving the group. |
| **Rejoining** | A player may rejoin later, but starts from zero in the current season. Their previous-season results remain attributed to them. |
| **Admin leaving** | If the leaving member is the group’s only admin, the leave is blocked: they must first add another community admin to the group as a member, then leave (mirrors 6.5). |
| **Community** | Leaving a group does not by itself remove the user from the community. A user can be a community member without belonging to any group — by leaving all of them. (Small tension with the Communities doc, which says every member belongs to the general group — sync item for that doc.) |

## Manage Group — admin perspective

Available to the community’s owner and admins. For PRIVATE groups, only to the creator and any community admins who have been explicitly added to the group as members. Reached from the group page via the settings icon / More menu, which opens a "Manage Group" sheet: Group Settings, Manage Members, Start new season, plus Share, Leave Group, and Archive Group.

### 6.1 Group Settings

|           |                                                             |
|-----------|-------------------------------------------------------------|
| **Edits** | Name, description, thumbnail, and the Private Group toggle. |
| **Save**  | A standard edit sheet with Save / Cancel.                   |

### 6.2 Manage Members

|  |  |
|----|----|
| **List** | The searchable members list, with an "Invite member" entry. |
| **Member detail** | Tapping a member opens a card with "See profile" and "Remove from group". |
| **Remove** | Removing a member — via the card, or a swipe-left on the row — opens a confirmation modal before it takes effect. |
| **Effect of removal** | Same as the member leaving (see 5.3): the player is removed from group_members; their entry disappears from the CURRENT-season ranking; PREVIOUS-season records remain attributed to them. The underlying game data — events and match records — is never deleted, so other players’ stats and rankings are unaffected. |

### 6.3 Start new season

|  |  |
|----|----|
| **Action** | "Start new season" closes the current season and starts the next one. The full seasons concept is specified in section 07. |
| **Confirmation copy** | "This will close Season \[N\] and start Season \[N+1\]. The current ranking and event history will move to Previous Seasons. Continue?" |
| **What happens** | The current season is closed (its events and ranking are archived under "Previous Seasons" on the group page). A new season begins immediately; events created from now on count toward the new season. |
| **Nothing is destroyed** | No game data is deleted; closed seasons remain browsable from the group page. |
| **DB impact** | Sets the current group_seasons row ended_at = now() and inserts a new group_seasons row with season_number = N+1, started_at = now(), ended_at = NULL. |

### 6.4 Archive Group

|  |  |
|----|----|
| **Why archive** | A group is never fully deleted — it holds historical game data. Archiving is the only way to retire it. |
| **Action** | Confirmation modal: "Archiving group will cancel all the upcoming events. Are you sure you want to archive?" |
| **Effect** | All upcoming events of the group are cancelled; no new events can be created in an archived group. |
| **Where it shows** | The group stays in the user’s "Your Groups → Managing" tab with an "archived" tag. |
| **Unarchive** | Opening an archived group shows an "Unarchive" button; tapping it requires a confirmation. After unarchiving, events can be created again. |
| **DB impact** | Archive sets is_archived = true and archived_at; unarchive clears them. |

### 6.5 Leaving as an owner or sole admin

|  |  |
|----|----|
| **Sole community owner** | Because group authority derives from community ownership, the community’s sole owner cannot simply leave a group. Leave Group → a "Transfer ownership first" modal routes them to the community members screen to assign a new community owner; only then can they leave. |
| **Sole group admin** | If the leaving member is the only admin remaining in the group, the leave is blocked. A message prompts them to add another admin first; tapping "Add admin" opens a list of the community’s admins where they can multi-select one or more to add as members of the group. Once at least one other admin is in the group, they can leave. This matters most for private groups, which would otherwise become unmanageable. |
| **Ownership note** | Community-ownership transfer itself is specified in full by the Communities doc. |

## Seasons & ranking

**Preliminary model**

The scoring system below is an initial design, not the final one. It is recorded here so the rest of the doc has something concrete to reference; expect it to evolve.

**Seasons**

A group’s history is divided into successive seasons. Seasons have no name and no end date; they end only when an admin starts a new one.

- At group creation, Season 1 is created automatically. All events created in the group from that moment on belong to that season and feed its ranking.

- An admin can open Manage Group → "Start new season" to close the current season (Season N) and begin the next (Season N+1). The closed season’s events and ranking are archived under "Previous Seasons" on the group page.

- A "Season N" tag is shown on the main group page indicating the current season number.

- Nothing is destroyed when a new season starts — closed seasons remain browsable.

**Previous Seasons**

- A "Previous Seasons" section sits at the bottom of the group page (after the community and "Created on" info), listing each closed season.

- Tapping a season opens its detail screen, titled "Season N", with two tabs: Event history (cards of every event held that season) and Ranking (the season’s final ranking).

- When a group has only one previous season, the "Previous Seasons" entry can open it directly.

- The same period filter as the current season (see below) is available on a closed season’s ranking. For a closed season the "last 3 / 6 / 12 months" filter is calculated relative to the season’s end date, not from today.

**What counts toward a season ranking**

- Every non-private event in the group counts toward the season it was created in. Private events never feed any ranking.

- Only the final PLACEMENT in the event leaderboard counts toward the group ranking — the event’s scoring mode (points / classic / time) is NEVER carried over. A 1st place is 100 ranking points whether the player ended the event with 45 raw points, 5 wins in classic, or any other internal score.

**Placement points**

Players earn ranking points by their final placement in each event:

|               |            |               |            |
|---------------|------------|---------------|------------|
| **Placement** | **Points** | **Placement** | **Points** |
| 1st           | 100        | 7th           | 30         |
| 2nd           | 75         | 8th           | 25         |
| 3rd           | 60         | 9th           | 20         |
| 4th           | 50         | 10th          | 16         |
| 5th           | 42         | 11th          | 12         |
| 6th           | 36         | 12th          | 8          |

- Players who finish outside the top 12 receive 5 points. This is NOT added on top of placement points — top-12 finishers get their placement points only.

**Ranking calculation**

- Each player’s season score is the simple SUM of all the ranking points they earned in that season’s events. Every event counts — there is no "best N results" system.

- Bad results do not penalise a player; they simply add fewer points.

**Period filter**

On the ranking screen — current season and any closed season — a filter lets the viewer narrow the ranking to a recent window:

- Last 3 months.

- Last 6 months.

- Last year.

- The filter limits the events whose points are summed; it does not filter out players. For the current season, "last X months" is counted from today. For a closed season, "last X months" is counted from the season’s end date.

- The default view is the season total (no filter).

## Functional requirements

Must = MVP. Should = V2. Could = V3. IDs are prefixed GR (Groups).

|  |  |  |  |
|----|----|----|----|
| **ID** | **Requirement** | **Priority** | **Notes** |
| GR-01 | A group always belongs to exactly one community. | **Must** |  |
| GR-02 | Only community owners / admins can create a group. | **Must** |  |
| GR-03 | A creator who administers multiple communities picks one in a dropdown. | **Must** | Auto-selected if only one. |
| GR-04 | Group fields: name (required), description, thumbnail, private toggle. | **Must** |  |
| GR-05 | There is no add-members step at creation; members are invited afterwards. | **Must** |  |
| GR-06 | A private group is invisible to the community and joinable only by invitation. | **Must** |  |
| GR-07 | A public group can be joined directly by any community member. | **Must** |  |
| GR-08 | There is no request-to-join at the group level. | **Must** |  |
| GR-09 | Joining a group also adds the user to the group’s community. | **Must** |  |
| GR-10 | Inviting someone to a group brings them into the community too, shown via a confirmation. | **Must** |  |
| GR-11 | A private-group link opened by a non-invited user shows a no-access page. | **Should** |  |
| GR-12 | *(amended)* Your Groups lists every group the user belongs to, sectioned by community — no tabs. Admins keep archived groups there with an "Archived" tag. | **Must** | UX-GRP-03 |
| GR-13 | The group page shows header, members, an Events section, and a Ranking section. | **Must** |  |
| GR-14 | The "+ Invite members" action depends on the community’s member-invite permission. | **Must** | Permission defined in the Communities doc. |
| GR-15 | *(amended)* Leaving a group keeps the player in the group's history — member list, ranking and past events — greyscale with a "No longer in group" tag. Game data is never deleted. | **Must** | UX-GRP-15, decision 2 |
| GR-16 | *(amended)* A player who rejoins in the same season gets back the points they had; rejoining in a new season starts at zero. | **Must** | UX-GRP-15 |
| GR-17 | Group management is available to community owners / admins — for private groups, only when they are members of the group. | **Must** | No group-specific role. |
| GR-18 | Group Settings edits name, description, thumbnail, and privacy. | **Must** |  |
| GR-19 | Manage Members allows viewing a profile and removing a member (tap or swipe), with confirmation. | **Must** |  |
| GR-20 | *(amended)* "Reset ranking" (= start new season) closes the current season and begins the next; the closed season is archived under Previous Seasons. | **Must** | No data is destroyed. UX-GRP-14 |
| GR-21 | Start new season, Archive, and Unarchive each require a confirmation. | **Must** |  |
| GR-22 | A group is never deleted — only archived; an archived group accepts no new events. | **Must** |  |
| GR-23 | An archived group shows in Managing with an "archived" tag and can be unarchived. | **Should** |  |
| GR-24 | *(obsolete)* There is no owner role since migration 0098; GR-36 covers the case. | — |  |
| GR-25 | The group ranking counts every non-private event in the group, scoped to the season the event was created in. | **Must** |  |
| GR-26 | Event ranking points are awarded by final placement (100 / 75 / 60 / 50 / 42 / 36 / 30 / 25 / 20 / 16 / 12 / 8); players outside the top 12 receive 5 points. | **Must** | Preliminary model. |
| GR-27 | The season ranking is the simple sum of all placement points each player earned that season — no best-N system. | **Must** |  |
| GR-28 | Member permissions (invite, create events) are governed by community-level settings. | **Must** |  |
| GR-29 | Group invitations can be shared via a link / copy link. | **Could** |  |
| GR-30 | At group creation, Season 1 is created automatically. | **Must** |  |
| GR-31 | An admin can "Start new season" to close the current season and begin the next. | **Must** |  |
| GR-32 | A "Season N" tag is shown on the group page indicating the current season. | **Should** |  |
| GR-33 | A "Previous Seasons" section appears at the bottom of the group page; a season opens to a "Season N" detail with Event history and Ranking tabs. | **Should** |  |
| GR-34 | The ranking screen offers a period filter: last 3 / 6 / 12 months — relative to today for the current season, relative to the season end for closed seasons. | **Should** |  |
| GR-35 | Private groups are not visible to community admins unless the admin is a member of the group. | **Must** |  |
| GR-36 | *(amended)* The last community admin inside a PRIVATE group cannot leave it until another community admin is added; this is checked before the confirmation. Public groups never block — community admins manage them without being members. | **Must** | Decision 1 |
| GR-37 | The thumbnail picker offers a library of pre-defined images plus an Upload option. | **Should** |  |
| GR-38 | *(amended)* The number of groups a community may hold is gated by its plan; the create action still shows, and the limit is explained with the upgrade prompt on submit. | **Must** | Decision 6 |
| GR-39 | The event scoring mode (points / classic / time) does NOT affect group-ranking points; only the final placement matters. | **Must** |  |
| GR-40 | When a sole group admin tries to leave, the "Add admin" action opens the community’s admin list for multi-select to add to the group first. | **Should** |  |

## Database schema

communities, community_members, profiles and events are referenced as foreign keys and defined in their own docs.

**groups**

|  |  |  |  |
|----|----|----|----|
| **Column** | **Type** | **Nullable** | **Notes** |
| id | UUID | No | gen_random_uuid() |
| community_id | UUID | No | FK communities ON DELETE CASCADE |
| created_by | UUID | No | FK profiles — recorded for history; not a role |
| name | TEXT | No |  |
| description | TEXT | Yes | Tagline shown under the name |
| thumbnail_path | TEXT | Yes | Supabase Storage path |
| is_private | BOOLEAN | No | default false |
| is_archived | BOOLEAN | No | default false |
| archived_at | TIMESTAMPTZ | Yes | Set when archived |
| created_at | TIMESTAMPTZ | No | default now() |
| updated_at | TIMESTAMPTZ | No | Trigger-updated |

CREATE TABLE groups (

id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

community_id UUID NOT NULL REFERENCES communities(id) ON DELETE CASCADE,

created_by UUID NOT NULL REFERENCES profiles(id),

name TEXT NOT NULL,

description TEXT,

thumbnail_path TEXT,

is_private BOOLEAN NOT NULL DEFAULT false,

is_archived BOOLEAN NOT NULL DEFAULT false,

archived_at TIMESTAMPTZ,

created_at TIMESTAMPTZ DEFAULT now(),

updated_at TIMESTAMPTZ DEFAULT now()

);

**group_members**

CREATE TABLE group_members (

id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

group_id UUID NOT NULL REFERENCES groups(id) ON DELETE CASCADE,

user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,

joined_at TIMESTAMPTZ DEFAULT now(),

UNIQUE (group_id, user_id)

);

-- No role column. Group management authority derives from the user's

-- role in community_members (owner / admin), defined in the Communities doc.

**group_invitations**

CREATE TABLE group_invitations (

id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

group_id UUID NOT NULL REFERENCES groups(id) ON DELETE CASCADE,

inviter_id UUID NOT NULL REFERENCES profiles(id),

invitee_id UUID NOT NULL REFERENCES profiles(id),

status TEXT NOT NULL DEFAULT 'pending'

CHECK (status IN ('pending','accepted')),

created_at TIMESTAMPTZ DEFAULT now(),

responded_at TIMESTAMPTZ,

UNIQUE (group_id, invitee_id)

);

**group_seasons**

CREATE TABLE group_seasons (

id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

group_id UUID NOT NULL REFERENCES groups(id) ON DELETE CASCADE,

season_number INTEGER NOT NULL,

started_at TIMESTAMPTZ NOT NULL DEFAULT now(),

ended_at TIMESTAMPTZ,

created_at TIMESTAMPTZ DEFAULT now(),

UNIQUE (group_id, season_number)

);

-- The current season has ended_at IS NULL. "Start new season" sets the

-- current row's ended_at = now() and inserts a new row with

-- season_number = previous + 1.

**group_event_results (ranking input)**

CREATE TABLE group_event_results (

id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

group_id UUID NOT NULL REFERENCES groups(id) ON DELETE CASCADE,

season_id UUID NOT NULL REFERENCES group_seasons(id) ON DELETE CASCADE,

event_id UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,

user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,

final_placement INTEGER NOT NULL,

ranking_points INTEGER NOT NULL,

recorded_at TIMESTAMPTZ DEFAULT now(),

UNIQUE (event_id, user_id)

);

-- Populated when a non-private group event is published. season_id is

-- the group_seasons row that was current when the event was created.

-- The group ranking SUMS each player's ranking_points within a season,

-- optionally filtered by a recent time window (last 3 / 6 / 12 months).

-- When a player leaves the group, only their CURRENT-season rows are

-- removed; rows tied to closed seasons are preserved. The underlying

-- event data (event_matches, match_players) is never deleted.

**Realtime**

ALTER PUBLICATION supabase_realtime ADD TABLE group_members;

ALTER PUBLICATION supabase_realtime ADD TABLE group_invitations;

## Row Level Security policies

Group visibility and management both depend on the viewer’s relationship to the community. The community-role check (owner / admin) is shown as is_community_admin(community_id) — a helper defined alongside the Communities schema.

**groups**

ALTER TABLE groups ENABLE ROW LEVEL SECURITY;

-- READ: public groups are visible to any community member;

-- private groups only to their own members.

CREATE POLICY "groups: read" ON groups FOR SELECT

USING (

(is_private = false AND EXISTS (

SELECT 1 FROM community_members cm

WHERE cm.community_id = groups.community_id AND cm.user_id = auth.uid()

))

OR EXISTS (

SELECT 1 FROM group_members gm

WHERE gm.group_id = groups.id AND gm.user_id = auth.uid()

)

);

-- INSERT: only a community owner / admin, for their own community.

CREATE POLICY "groups: create" ON groups FOR INSERT

WITH CHECK (is_community_admin(community_id));

-- UPDATE: community admins manage public groups; for private groups,

-- only community admins who are also members of the group.

CREATE POLICY "groups: manage" ON groups FOR UPDATE

USING (

is_community_admin(community_id)

AND (

is_private = false

OR EXISTS (

SELECT 1 FROM group_members gm

WHERE gm.group_id = groups.id AND gm.user_id = auth.uid()

)

)

);

**group_members**

ALTER TABLE group_members ENABLE ROW LEVEL SECURITY;

CREATE POLICY "group_members: read" ON group_members FOR SELECT

USING (EXISTS (SELECT 1 FROM groups g WHERE g.id = group_members.group_id));

-- INSERT: a user joining themselves, or a community admin adding someone.

CREATE POLICY "group_members: join" ON group_members FOR INSERT

WITH CHECK (

user_id = auth.uid()

OR is_community_admin((SELECT community_id FROM groups g WHERE g.id = group_id))

);

-- DELETE: the member leaving, or a community admin removing them.

CREATE POLICY "group_members: leave" ON group_members FOR DELETE

USING (

user_id = auth.uid()

OR is_community_admin((SELECT community_id FROM groups g WHERE g.id = group_id))

);

**group_invitations**

ALTER TABLE group_invitations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "group_invitations: read" ON group_invitations FOR SELECT

USING (invitee_id = auth.uid() OR inviter_id = auth.uid());

-- INSERT: any group member may invite when the community permits it;

-- community admins may always invite. (The member-invite permission

-- flag itself is enforced in the invite RPC / app layer.)

CREATE POLICY "group_invitations: create" ON group_invitations FOR INSERT

WITH CHECK (

inviter_id = auth.uid()

AND EXISTS (

SELECT 1 FROM group_members gm

WHERE gm.group_id = group_invitations.group_id AND gm.user_id = auth.uid()

)

);

CREATE POLICY "group_invitations: respond" ON group_invitations FOR UPDATE

USING (invitee_id = auth.uid());

## Component & file map

Assumes the default Padel Jam stack — Next.js (App Router) + Supabase + shadcn/ui + Tailwind.

src/lib/hooks/useGroups.ts useUserGroups() (All / Managing / Participating)

src/lib/hooks/useGroup.ts Single group read + Realtime

src/lib/hooks/useCreateGroup.ts Create + community dropdown

src/lib/hooks/useGroupMembers.ts List / invite / remove

src/lib/hooks/useManageGroup.ts Settings / archive / reset ranking

src/lib/hooks/useGroupRanking.ts Computed ranking (preliminary)

src/lib/validations/group.schema.ts

src/app/(app)/groups/page.tsx Your Groups list

src/app/(app)/groups/new/page.tsx Create Group

src/app/(app)/groups/\[id\]/page.tsx Group page (View)

src/components/groups/GroupCard.tsx

src/components/groups/GroupHeader.tsx

src/components/groups/MembersList.tsx

src/components/groups/InviteMembersSheet.tsx + invite-to-community confirm

src/components/groups/GroupEventsSection.tsx

src/components/groups/GroupRankingSection.tsx

src/components/groups/JoinGroupButton.tsx Public join / invited join

src/components/groups/NoAccessPage.tsx Private-group link, no access

src/components/groups/LeaveGroupModal.tsx

src/components/groups/manage/ManageGroupSheet.tsx

src/components/groups/manage/GroupSettings.tsx

src/components/groups/manage/ManageMembers.tsx + remove (tap / swipe)

src/components/groups/manage/StartNewSeasonModal.tsx

src/components/groups/manage/ArchiveGroupModal.tsx

src/components/groups/manage/TransferOwnershipPrompt.tsx

src/components/groups/SeasonTag.tsx Current "Season N" badge

src/components/groups/PreviousSeasonsSection.tsx List at the bottom of the group page

src/components/groups/PreviousSeasonScreen.tsx Season N detail (Event history + Ranking tabs)

src/components/groups/RankingPeriodFilter.tsx Last 3 / 6 / 12 months

## Claude Code prompts

Run the section 09 schema and section 10 RLS as Supabase migrations first. Then run the two prompts in order.

**Prompt 1 — Create, Join & View Group**

**Build group creation, joining and viewing for Padel Jam.**

1.  Create src/lib/validations/group.schema.ts (Zod: name required, description / thumbnail optional, is_private boolean, community_id) and the hooks useGroups.ts, useGroup.ts, useCreateGroup.ts, useGroupMembers.ts.

2.  Build Your Groups (/groups): All / Managing / Participating tabs, a GroupCard list, and a "New group" button shown only to users who own or administer a community.

3.  Build Create Group (/groups/new): a community dropdown (preselected and fixed when the user administers only one community), name, description, a thumbnail picker (pre-defined library + Upload), and a Private Group toggle. On submit insert the groups row, a group_members row for the creator, and the initial group_seasons row (Season 1). Show a created toast, route to the group page.

4.  Build the group page (/groups/\[id\]): GroupHeader, member thumbnails, "+ Invite members", GroupEventsSection (Upcoming / Past), GroupRankingSection (See all → ranking screen). A More menu with Share and Leave Group.

5.  Build JoinGroupButton: a public group shows "Join Group" for any community member; a private group shows "\[Name\] invited you!" + Join only to invitees. A private-group link opened by a non-invitee renders NoAccessPage. Joining inserts group_members and, if needed, community_members.

6.  Build InviteMembersSheet (searchable people list, Share / Copy Link) gated on the community’s member-invite permission, with the "added to this group and \[Community\]" confirmation. Build LeaveGroupModal with the "you will lose all match records" copy.

**Prompt 2 — Manage Group & ranking**

**Build group management and the ranking for Padel Jam.**

7.  Build ManageGroupSheet (visible to community owners / admins; for PRIVATE groups, only when they are also members of the group): Group Settings, Manage Members, Start new season, plus Share, Leave Group, Archive Group.

8.  Build GroupSettings (edit name / description / thumbnail / privacy) and ManageMembers (members list; tap a member for "See profile" / "Remove from group"; swipe-left to remove; confirmation modal before removal).

9.  Build StartNewSeasonModal — confirmation reads "This will close Season \[N\] and start Season \[N+1\]…". On confirm, set the current group_seasons row’s ended_at = now() and insert a new group_seasons row (season_number = N+1, ended_at = NULL). Build ArchiveGroupModal — confirm, cancel the group’s upcoming events, set is_archived; archived groups block new events and show an Unarchive button (also confirmed).

10. Build TransferOwnershipPrompt for the sole community owner. Also block Leave Group when the user is the group’s sole admin and prompt them to add another community admin to the group as a member first.

11. Build useGroupRanking.ts + GroupRankingSection + RankingPeriodFilter: compute each player’s ranking from group_event_results as a SIMPLE SUM of placement points, scoped to a season_id. The period filter (last 3 / 6 / 12 months) limits the events included — relative to today for the current season, relative to the season’s ended_at for closed seasons. Treat the scoring model as preliminary and isolate it so it is easy to swap.

12. Populate group_event_results when a non-private group event is published — set season_id to the group’s current season (group_seasons row with ended_at IS NULL). Build SeasonTag, PreviousSeasonsSection, and PreviousSeasonScreen (Event history + Ranking tabs) on the group page. Write a Playwright spec for create → invite → join → leave, the manage actions, and starting a new season.
