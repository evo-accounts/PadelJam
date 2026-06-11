# Events Module — Create Event sub-flow

*Padel Jam — Version 1.2 • May 2026 • Event-creation authority + subscription gating*

This document defines requirements for the Create Event sub-flow within the Events module of Padel Jam. It also establishes the foundational data model shared by all five Events sub-flows (Create, Join, Manage, In-progress player view, In-progress manager view). Subsequent sub-flows will be specified in companion documents that build on this same data model.

**Confirmed design decisions**

- Type → Specification tree: Type defines the rotation algorithm (Americano, Mexicano, Up and Down). Specification (Classic / Mixed / Team) is a pair-composition modifier that applies uniformly to all Types.

- Scoring is exactly one of three mutually exclusive modes: Points (default 32), Time (default 10 min), Classic (set/games).

- Player capacity is derived: num_courts × 4, plus optional standby spots that rotate alongside confirmed players (no separate waiting state).

- Recurring events use a next-instance-only materialization model: only the upcoming occurrence exists as an events row; the next is auto-created after the current completes.

- Venues are admin-curated globally. Manual location entries are stored on the event only and do not create new venues.

- Private events bypass group ranking and require explicit invitations. Events created without a group are always private.

- Entrance fee configuration is informational only — no payment is processed inside the app.

- The organizer chooses "Organizing only" or "Organizing and playing"; the latter pre-fills one of the player slots.

- Event creation authority: group events require the user to be a community admin of the group’s community (owner or admin — same authority that manages the group); standalone events can be created by any user. All event creation is also gated by subscription tier (per-tier limits defined in the Subscription section of the Profile & Settings doc).

## Overview

**Feature summary**

Create Event is the foundational sub-flow of the Events module. Through a 10-step guided wizard, a user defines every parameter of a padel event: where it lives (group or standalone), how the round-robin is structured (Type + Specification), how scoring works, where and when it happens, who can attend, and how the organizer participates. The result is a single events row (plus related rows for courts, invitations, and participants) that becomes the input for the Join Event and In-progress sub-flows.

**Where events live**

- Group-scoped — created inside a group (which belongs to a community). Counts toward the group ranking unless marked private.

- Standalone — created with no group association. Always treated as private. Has its own leaderboard. Never contributes to any community or group ranking.

**Three event types**

|  |  |
|----|----|
| **Type** | **Behavior** |
| Americano | All players rotate randomly. The platform generates the full round schedule up front when the event starts. Suited for casual play where no ranking input is required. |
| Mexicano | Round 1 seeds players by the group ranking (or randomly if the group has no ranking history, or if the event is standalone). Each subsequent round is generated from the current event leaderboard — typically pairing positions 1+4 vs 2+3, 5+8 vs 6+7, etc. Results-driven, generated round by round. |
| Up and Down | Ladder format. Winners advance to play winners; losers drop to play losers. Typically uses 2 courts but supports more. Each subsequent round is generated from the previous round’s results. |

**Three specifications (apply to all types)**

|  |  |
|----|----|
| **Specification** | **Behavior** |
| Classic | Pairs are not fixed — they rotate according to the chosen Type’s logic. |
| Mixed | Pairs are not fixed, but the platform always pairs one man with one woman. Requires gender data on player profiles. |
| Team | Pairs are fixed. Teams can be composed by the organizer, or by the players themselves — players may choose who to play with or invite a partner. The full set of pairing options is specified in the Join Event and Manage Event sub-flows. |

**Ten steps at a glance**

1.  Select group (or continue without a group).

2.  Event type — Americano / Mexicano / Up and Down.

3.  Specification — Classic / Mixed / Team.

4.  Scoring system — Points / Time / Classic.

5.  Location — venue search, manual entry, or skip.

6.  Courts — specific courts (from venue) or just a count.

7.  Date, time, duration, and optional weekly recurrence.

8.  Preferences — standby, privacy, entrance fee, permissions, organizer role.

9.  General info — name, description, thumbnail.

10. Invite players (private events only).

**Out of scope for this document**

- Join Event sub-flow (invitation acceptance, RSVP, waitlist promotion).

- Manage Event sub-flow (editing a created event, cancelling, kicking players).

- In-progress Event sub-flows (round generation algorithm, score submission, real-time leaderboard).

- Ranking calculation algorithm (group and community).

- Group and Community management (specified in companion documents).

## Foundational data model

The schema below covers the Events module’s own tables. Tables referenced as foreign keys (profiles, communities, community_members, groups, group_members) are assumed to exist and are specified in their own documents. Full SQL for each table appears in section 05.

**Entity overview**

|  |  |
|----|----|
| **Entity** | **Purpose** |
| events | Core entity — one row per concrete event instance (one-off or a single occurrence of a recurring series). |
| event_series | Recurrence template for weekly events. Holds the schedule pattern; concrete instances live in events with series_id set. |
| event_courts | Junction — which specific courts (from a venue) the event is using. Empty when the user chose the "just a count" mode. |
| event_invitations | Outbound invitations. Auto-generated for all group members when the event is public; explicitly created for selected players (existing or manually added) when private. |
| event_participants | Confirmed players. Created when an invitation is accepted, or pre-filled at creation time for "Organizing and playing". |
| event_teams | Fixed player pairs. Used only when specification = "team". |
| venues | Admin-curated venue catalog (clubs). Users do not create or edit venues from inside the app. |
| courts | Children of venues. Admin-curated court list per venue. |

## Create Event — step by step

Each step below specifies field-level requirements (Type, Required, Validation, Default, Display, DB impact) and any UX behaviour specific to that step. Cross-cutting wizard rules are at the end of this section.

**Step 1 Select group**

|  |  |
|----|----|
| **Field** | group_id (single selection from the user’s groups) |
| **Type** | Card grid (2 columns mobile). Each card: group thumbnail, group name, community label below. |
| **Required** | No |
| **Who can create** | Group events: only users who are owners or admins of the group’s community (the same authority that manages the group). Standalone events: any user. Both subject to the subscription tier limit (defined in the Subscription section of the Profile & Settings doc — per-tier limits TBD). A user with no eligible group AND no remaining standalone quota does not see the Create Event entry point. |
| **Data source** | Groups where auth.uid() is a community owner / admin of the group’s community — and, for private groups, is also a member of the group. (Groups the user is in but does not administer are not listed.) |
| **Below the grid** | "Continue without group" button opens the "Event without group" modal. |
| **Modal copy** | "This event will not count to any ranking, it will have only its own leaderboard." Buttons: \[Continue\] \[Cancel\]. |
| **Side effect** | If no group is selected, the event is standalone: the Private toggle in step 8 is set ON and disabled — it cannot be changed — and step 10 (Invite Players) becomes mandatory. |
| **DB impact** | events.group_id (UUID, nullable) |

**Step 2 Event type**

|  |  |
|----|----|
| **Field** | event_type |
| **Type** | Single-select list. Full-width tappable rows with chevron. |
| **Options** | Americano, Mexicano, Up and Down |
| **Required** | Yes |
| **Behaviour** | Tapping a row immediately navigates to step 3. |
| **DB impact** | events.event_type TEXT NOT NULL CHECK IN (americano, mexicano, up_and_down) |

**Step 3 Specification**

|  |  |
|----|----|
| **Field** | specification |
| **Type** | Single-select list with chevron. |
| **Options** | Classic, Mixed, Team |
| **Required** | Yes |
| **Header** | Shows the previously selected Type for context (e.g. "Americano — Specification"). |
| **Behaviour** | Tapping a row navigates to step 4. If "Team" is chosen, fixed pairs are composed later — by the organizer and/or by the players themselves (detailed in the Join Event and Manage Event sub-flows). |
| **DB impact** | events.specification TEXT NOT NULL CHECK IN (classic, mixed, team) |

**Step 4 Scoring system**

|  |  |
|----|----|
| **Field** | scoring_mode + scoring_value |
| **Type** | Three panels (Points / Time / Classic) — only one is active at a time. Selecting a panel deactivates the others. |
| **Points panel** | Pill buttons: 0, 8, 16, 24, 32 (default), 40, Custom. Custom opens a numeric input (1–99). |
| **Time panel** | Slider 5–60 minutes, default 10. |
| **Classic panel** | Fixed traditional set/games scoring. No additional configuration here (full rules specified in the In-progress sub-flow doc). |
| **Required** | Yes — one mode must be active. |
| **DB impact** | events.scoring_mode TEXT NOT NULL CHECK IN (points, time, classic). events.scoring_value INTEGER — points when mode=points, minutes when mode=time, NULL when mode=classic. |

**Step 5 Location**

|  |  |
|----|----|
| **Header** | Location |
| **Type** | Search input + result list of admin-curated venues. |
| **Search** | Live ILIKE on venues.name. Result row: venue thumbnail, name, rating. |
| **Pick a venue** | Selecting a venue navigates to step 6 (Courts) with venue context attached. |
| **"Don’t want to add a location"** | Sets events.has_location = false, but still leads to step 6 in count-only mode — the number of courts is always required because it determines player capacity. |
| **No results** | Shows "Location not found" + "Add manually" button. |
| **Add manually screen** | Fields: Location Name (optional, max 80), Address (required, max 200), \# of Courts (counter, 1–20, default 1), Court names (optional dynamic list). On submit: skips step 6 since the court count is already collected here. |
| **Important** | Manual entries do NOT create a row in the venues table. Venues are admin-curated globally; users wanting a club added must contact the platform out-of-band. |
| **DB impact** | events.venue_id (nullable FK), events.manual_location_name TEXT, events.manual_location_address TEXT, events.has_location BOOLEAN NOT NULL, events.num_courts INTEGER. |
| **Constraint** | venue_id and manual_location_name are mutually exclusive (CHECK constraint). |

**Step 6 Courts**

|  |  |
|----|----|
| **Header** | Courts |
| **When shown** | Always reached — the number of courts is mandatory because it determines player capacity. Only the available mode depends on the step 5 path. |
| **Mode A — Select specific courts** | Shown when a curated venue was selected. Checkbox list of all courts at that venue. Warning banner: "This selection doesn’t guarantee a reservation. Bookings must be made directly with the club." Button at bottom: "Didn’t reserve the courts yet" switches to Mode B. |
| **Mode B — Court count only** | Shown when the user picked "Don’t want to add a location" (and reachable from Mode A via "Didn’t reserve…"). Counter for \# of Courts (default 1, range 1–20). No specific court rows stored. |
| **Live player capacity** | Directly below the counter, show the resulting player capacity live as the user adjusts the count — e.g. "2 courts = 8 players". Standby spots (step 8) are added on top of this number. |
| **Skipped only when** | Step 6 is skipped only on the "Add manually" location path, where the \# of courts is already collected in the manual location form. |
| **Required** | Yes — a court count (Mode A selection or Mode B counter) must be set. |
| **DB impact** | Mode A: inserts rows into event_courts; events.num_courts derived from the selected count. Mode B: no event_courts rows; events.num_courts set directly. |

**Step 7 Date & time**

|  |  |
|----|----|
| **Header** | Date |
| **Date** | Single date picker. Must be today or future. |
| **Period** | Morning / Afternoon / Evening segmented control. Filters the time slot grid below. |
| **Time slot** | 30-minute increments within the selected period (e.g. 7:00, 7:30, 8:00…). Single selection. |
| **Duration** | Radio: 60 min, 90 min, 120 min, Custom. Custom opens a numeric input (15–480). |
| **Repeat every week** | Toggle, default OFF. |
| **If recurring ON** | Header gains "Set as a recurrent event". Send invite radio appears: 1 week before, 5 days before, 3 days before (default 5). Bottom shows: "Your event will happen Every \<weekday\> · From \<start\> to \<end\>. Next occurrence: \<date\>". |
| **If recurring OFF** | Bottom shows: "\<DateString\>, \<weekday\> · From \<start\> to \<end\>". |
| **Required** | Yes — all date/time fields are mandatory. |
| **DB impact** | events.starts_at TIMESTAMPTZ. events.duration_minutes INTEGER. If recurring: insert event_series row first; events.series_id references it; series stores day_of_week, start_time, duration_minutes, invite_lead_days. |

**Recurrence behaviour (next-instance-only)**

- When "Repeat every week" is on, an event_series row holds the schedule pattern, and only one events row per series exists at a time — the active / next instance.

- The next instance is materialized automatically once the current one is over, so there is only ever one active event per series at a time. Full materialization, cancellation, and editing rules for recurring events are specified in a dedicated companion document.

**Step 8 Preferences**

|  |  |
|----|----|
| **Header** | Preferences |
| **Game Details — Allow stand-by players** | Toggle, default OFF. When ON: counter for Extra Spots (range 1–20, default 4). Help text: "Let extra players join the rotation. If disabled, they go to the waitlist." Behaviour: standby players rotate alongside confirmed players — they are not held in a separate waiting queue. |
| **Invite Details — Private event** | Toggle, default OFF. Help text: "Only invited players can see the event." When ON: warning banner at the bottom — "Private events do not count toward the group ranking." When group_id IS NULL: this toggle is forced ON and locked. |
| **Invite Details — Entrance fee** | Toggle, default OFF. When ON: shows sub-fields — Payment method (radio: Cash / At Club / MBA), Amount (numeric, required, 2 decimals), MBA Number (text, required when method = MBA). No payment is processed inside the app; the info is displayed to invitees. |
| **Permissions — Players can submit own results** | Toggle, default OFF. When ON: in-progress, each player can submit only their own match results. When OFF: only the organizer can submit results. |
| **I’m…** | Radio, required: "Organizing only" / "Organizing and playing". When "Organizing and playing", the organizer is auto-confirmed as a participant, occupying one player slot. |
| **DB impact** | All preferences map to columns on the events table — see section 05 for column-by-column definitions. |

**Step 9 General info**

|  |  |
|----|----|
| **Header** | General Info |
| **Name** | Single-line text, REQUIRED, max 80, placeholder "Give this event a name". |
| **Description** | Multi-line text, optional, max 500. |
| **Thumbnail** | Optional image upload. Accepted: jpeg / png / webp. Max 4 MB. Storage path: event-thumbnails/{event_id}/{uuid}-{filename}. Displayed 16:9 in event cards; full-width hero in event detail. |
| **Continue behaviour** | If is_private = false → finalize event (insert row, auto-generate invitations for all group members). If is_private = true → navigate to step 10. |
| **DB impact** | events.name TEXT NOT NULL, events.description TEXT, events.thumbnail_path TEXT. |

**Step 10 Invite players (private events only)**

|  |  |
|----|----|
| **Header** | Invite players + "Add manually" link top-right |
| **Body** | Scrollable list of group members (excludes the organizer when organizer_role = "organizing_and_playing"). Each row: avatar, name, checkbox. |
| **Continue** | Sends invitations to all selected members and finalizes the event. |
| **"I’ll invite later"** | Finalizes the event without sending any invitations. The organizer can invite players later via the Manage Event sub-flow. |
| **Add manually modal** | Search input that queries profiles globally. If no results: "Player not found" + "Add manually" button. Manual form: Name (required, max 80), Email (required, valid format), Phone (optional). On submit: inserts an event_invitations row with invitee_id = NULL and the contact info; the person is automatically selected in the main invite list. |
| **Manual players are event-scoped** | A manually-added player exists only within this event — no platform-wide profile or account is created for them. Their data lives solely on this event’s invitation / participant records. |
| **Team specification** | When specification = "team", an additional pair-composition section appears below the invite list. Fixed pairs can be set by the organizer here and/or left for the players to form themselves once invitations are sent (a player may pick a partner or invite one). event_teams rows are inserted as pairs are confirmed. The player-side pairing flow is detailed in the Join Event sub-flow. |
| **DB impact** | Each selected member or manual entry becomes an event_invitations row with status = pending and invited_by = organizer_id. |

**Wizard navigation rules (cross-cutting)**

- Back chevron (top-left) returns to the previous step without losing any data already entered.

- Close × (top-right) prompts a confirmation dialog: "Discard event draft?" with \[Discard\] and \[Keep editing\].

- The draft is held in sessionStorage on the client until the wizard completes — no server-side draft persistence in v1.

- Inline validation errors are shown on the current step; the Continue button stays disabled until the step is valid.

- Step indicator (e.g. "Step 4 of 10") shown at the top of every screen.

## Functional requirements

Must = MVP. Should = V2. Could = V3.

|  |  |  |  |
|----|----|----|----|
| **ID** | **Requirement** | **Priority** | **Notes** |
| EV-01 | User can create an event with or without group association. | **Must** | Group field is optional; gated by modal. |
| EV-02 | Event type is exactly one of Americano / Mexicano / Up and Down. | **Must** |  |
| EV-03 | Specification is exactly one of Classic / Mixed / Team. | **Must** | Same set for every Type. |
| EV-04 | Scoring is exactly one of Points (default 32), Time (default 10 min), Classic. | **Must** | Mutually exclusive. |
| EV-05 | User can pick a venue from the curated list, add a manual location, or skip location entirely. | **Must** |  |
| EV-06 | The number of courts is always collected — via specific court selection or a counter — because it determines player capacity. | **Must** | Step 6 is skipped only on the manual-location path, which collects courts in its own form. |
| EV-07 | Player capacity = num_courts × 4 + standby_spots (computed, not stored). | **Must** | Surface in UI in steps 6, 8, and 10. |
| EV-08 | Date, start time, and duration are required. | **Must** | Future dates only. |
| EV-09 | Recurring events materialize only the next instance; subsequent ones are auto-created after the previous completes. | **Must** | Driven by invite_lead_days. |
| EV-10 | Private events bypass the group ranking and require explicit invitations. | **Must** | Warning shown in step 8. |
| EV-11 | Events without a group are always private — the Private toggle is set ON and disabled. | **Must** | Also enforced by a CHECK constraint. |
| EV-12 | Entrance fee configuration is informational only — no payment is processed in the app. | **Must** |  |
| EV-13 | Organizer chooses "Organizing only" or "Organizing and playing"; the latter pre-fills one player slot. | **Must** |  |
| EV-14 | "Players can submit own results" toggle controls in-progress score input permissions. | **Must** | Used by In-progress sub-flow. |
| EV-15 | Event name is the only required field in General Info; description and thumbnail are optional. | **Must** |  |
| EV-16 | For private events, the Invite Players step is mandatory before finalizing. | **Must** |  |
| EV-17 | User can add a manual invitee (someone not in the group, possibly without an account) via modal. | **Must** | Manual players are event-scoped — no platform profile is created. |
| EV-18 | "I’ll invite later" finalizes a private event without sending any invitations. | **Must** | Organizer can invite later from Manage Event. |
| EV-19 | Manual location entries do NOT create rows in the global venues table. | **Must** | Venues remain admin-curated. |
| EV-20 | For non-private group events, invitations are auto-generated for every group member at finalization. | **Must** |  |
| EV-21 | When specification = "team", fixed pairs can be composed by the organizer and/or by the players themselves. | **Must** | Player-side pairing detailed in the Join Event sub-flow. |
| EV-22 | Back navigation across wizard steps preserves entered data. | **Should** | Draft kept in sessionStorage. |
| EV-23 | Standby spots rotate alongside confirmed spots (not held in a separate waiting state). | **Should** | Behaviour belongs to In-progress sub-flow. |
| EV-24 | Cancelling a recurring instance does not cancel the series. | **Should** |  |
| EV-25 | Mexicano on a standalone event or first instance with no ranking history generates round 1 randomly. | **Should** | Round generation lives in the In-progress sub-flow. |
| EV-26 | Step indicator visible at the top of every wizard screen. | **Should** | e.g. "Step 4 of 10". |
| EV-27 | Thumbnail crop tool before upload. | **Could** |  |
| EV-28 | Event templates — save preferences for re-use. | **Could** |  |
| EV-29 | Suggested teams algorithm for "Team" specification based on group ranking. | **Could** |  |
| EV-30 | Creating a GROUP event requires the user to be a community admin of the group’s community. | **Must** | Same authority that manages the group. |
| EV-31 | Standalone events can be created by any user. | **Must** |  |
| EV-32 | All event creation is gated by subscription tier (Profile & Settings → Subscription). | **Must** | Per-tier limits TBD. |

## Database schema

Tables run in this order — later tables reference earlier ones. Tables referenced as foreign keys (profiles, communities, groups, group_members) are assumed to exist in their respective docs.

**venues**

|  |  |  |  |
|----|----|----|----|
| **Column** | **Type** | **Nullable** | **Notes** |
| id | UUID | No | gen_random_uuid() |
| name | TEXT | No | Max 120 chars |
| address | TEXT | Yes |  |
| rating | NUMERIC(2,1) | Yes | 0.0 – 5.0 |
| community_id | UUID | Yes | FK to communities ON DELETE SET NULL (NULL when venue is platform-global) |
| created_by | UUID | No | FK to profiles (admin) |
| created_at | TIMESTAMPTZ | No | default now() |
| deleted_at | TIMESTAMPTZ | Yes | Soft delete |

CREATE TABLE venues (

id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

name TEXT NOT NULL,

address TEXT,

rating NUMERIC(2,1) CHECK (rating BETWEEN 0 AND 5),

community_id UUID REFERENCES communities(id) ON DELETE SET NULL,

created_by UUID NOT NULL REFERENCES profiles(id),

created_at TIMESTAMPTZ DEFAULT now(),

deleted_at TIMESTAMPTZ

);

**courts**

|            |          |              |                                |
|------------|----------|--------------|--------------------------------|
| **Column** | **Type** | **Nullable** | **Notes**                      |
| id         | UUID     | No           | Primary key                    |
| venue_id   | UUID     | No           | FK to venues ON DELETE CASCADE |
| name       | TEXT     | No           | e.g. "Court 1", "Court A"      |
| sort_order | INTEGER  | No           | Display order within venue     |

CREATE TABLE courts (

id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

venue_id UUID NOT NULL REFERENCES venues(id) ON DELETE CASCADE,

name TEXT NOT NULL,

sort_order INTEGER NOT NULL DEFAULT 0

);

**event_series**

|  |  |  |  |
|----|----|----|----|
| **Column** | **Type** | **Nullable** | **Notes** |
| id | UUID | No | Primary key |
| group_id | UUID | No | FK to groups ON DELETE CASCADE — series only inside groups |
| organizer_id | UUID | No | FK to profiles |
| day_of_week | INTEGER | No | 1=Mon … 7=Sun |
| start_time | TIME | No | 24h |
| duration_minutes | INTEGER | No | \> 0 |
| invite_lead_days | INTEGER | No | CHECK IN (3, 5, 7) |
| is_active | BOOLEAN | No | default true — set false to stop materialization |
| created_at | TIMESTAMPTZ | No | default now() |
| deleted_at | TIMESTAMPTZ | Yes | Soft delete |

CREATE TABLE event_series (

id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

group_id UUID NOT NULL REFERENCES groups(id) ON DELETE CASCADE,

organizer_id UUID NOT NULL REFERENCES profiles(id),

day_of_week INTEGER NOT NULL CHECK (day_of_week BETWEEN 1 AND 7),

start_time TIME NOT NULL,

duration_minutes INTEGER NOT NULL CHECK (duration_minutes \> 0),

invite_lead_days INTEGER NOT NULL CHECK (invite_lead_days IN (3, 5, 7)),

is_active BOOLEAN NOT NULL DEFAULT true,

created_at TIMESTAMPTZ DEFAULT now(),

deleted_at TIMESTAMPTZ

);

**events**

|  |  |  |  |
|----|----|----|----|
| **Column** | **Type** | **Nullable** | **Notes** |
| id | UUID | No | gen_random_uuid() |
| group_id | UUID | Yes | FK to groups ON DELETE SET NULL. NULL for standalone events. |
| series_id | UUID | Yes | FK to event_series. NULL for one-offs. |
| organizer_id | UUID | No | FK to profiles |
| event_type | TEXT | No | CHECK IN (americano, mexicano, up_and_down) |
| specification | TEXT | No | CHECK IN (classic, mixed, team) |
| scoring_mode | TEXT | No | CHECK IN (points, time, classic) |
| scoring_value | INTEGER | Yes | \> 0. NULL when scoring_mode = classic. |
| venue_id | UUID | Yes | FK to venues ON DELETE SET NULL |
| manual_location_name | TEXT | Yes | Used when not using a curated venue |
| manual_location_address | TEXT | Yes |  |
| has_location | BOOLEAN | No | false when user chose "Don’t want to add" |
| num_courts | INTEGER | No | \> 0 |
| starts_at | TIMESTAMPTZ | No |  |
| duration_minutes | INTEGER | No | \> 0 |
| allow_standby | BOOLEAN | No | default false |
| standby_spots | INTEGER | Yes | \>= 0 when allow_standby = true |
| is_private | BOOLEAN | No | default false. Forced TRUE when group_id IS NULL. |
| entrance_fee_enabled | BOOLEAN | No | default false |
| entrance_fee_amount | NUMERIC(10,2) | Yes | \>= 0 |
| entrance_fee_method | TEXT | Yes | CHECK IN (cash, at_club, mba) |
| entrance_fee_mba_number | TEXT | Yes | Required when method = mba |
| players_submit_results | BOOLEAN | No | default false |
| organizer_role | TEXT | No | CHECK IN (organizing_only, organizing_and_playing) |
| name | TEXT | No | Max 80 chars |
| description | TEXT | Yes | Max 500 |
| thumbnail_path | TEXT | Yes | Supabase Storage path |
| status | TEXT | No | default scheduled. CHECK IN (scheduled, in_progress, completed, cancelled) |
| created_at | TIMESTAMPTZ | No | default now() |
| updated_at | TIMESTAMPTZ | No | Trigger-updated |
| deleted_at | TIMESTAMPTZ | Yes | Soft delete |

CREATE TABLE events (

id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

group_id UUID REFERENCES groups(id) ON DELETE SET NULL,

series_id UUID REFERENCES event_series(id) ON DELETE SET NULL,

organizer_id UUID NOT NULL REFERENCES profiles(id),

event_type TEXT NOT NULL CHECK (event_type IN ('americano','mexicano','up_and_down')),

specification TEXT NOT NULL CHECK (specification IN ('classic','mixed','team')),

scoring_mode TEXT NOT NULL CHECK (scoring_mode IN ('points','time','classic')),

scoring_value INTEGER CHECK (scoring_value IS NULL OR scoring_value \> 0),

venue_id UUID REFERENCES venues(id) ON DELETE SET NULL,

manual_location_name TEXT,

manual_location_address TEXT,

has_location BOOLEAN NOT NULL DEFAULT false,

num_courts INTEGER NOT NULL CHECK (num_courts \> 0),

starts_at TIMESTAMPTZ NOT NULL,

duration_minutes INTEGER NOT NULL CHECK (duration_minutes \> 0),

allow_standby BOOLEAN NOT NULL DEFAULT false,

standby_spots INTEGER CHECK (standby_spots IS NULL OR standby_spots \>= 0),

is_private BOOLEAN NOT NULL DEFAULT false,

entrance_fee_enabled BOOLEAN NOT NULL DEFAULT false,

entrance_fee_amount NUMERIC(10,2) CHECK (entrance_fee_amount IS NULL OR entrance_fee_amount \>= 0),

entrance_fee_method TEXT CHECK (entrance_fee_method IS NULL OR entrance_fee_method IN ('cash','at_club','mba')),

entrance_fee_mba_number TEXT,

players_submit_results BOOLEAN NOT NULL DEFAULT false,

organizer_role TEXT NOT NULL CHECK (organizer_role IN ('organizing_only','organizing_and_playing')),

name TEXT NOT NULL,

description TEXT,

thumbnail_path TEXT,

status TEXT NOT NULL DEFAULT 'scheduled' CHECK (status IN ('scheduled','in_progress','completed','cancelled')),

created_at TIMESTAMPTZ DEFAULT now(),

updated_at TIMESTAMPTZ DEFAULT now(),

deleted_at TIMESTAMPTZ,

CHECK (group_id IS NOT NULL OR is_private = true),

CHECK (venue_id IS NULL OR manual_location_name IS NULL),

CHECK (entrance_fee_enabled = false

OR (entrance_fee_amount IS NOT NULL AND entrance_fee_method IS NOT NULL))

);

**event_courts**

CREATE TABLE event_courts (

id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

event_id UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,

court_id UUID NOT NULL REFERENCES courts(id) ON DELETE CASCADE,

UNIQUE (event_id, court_id)

);

**event_invitations**

CREATE TABLE event_invitations (

id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

event_id UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,

invitee_id UUID REFERENCES profiles(id),

invitee_name TEXT,

invitee_email TEXT,

invitee_phone TEXT,

status TEXT NOT NULL DEFAULT 'pending'

CHECK (status IN ('pending','accepted','declined','expired')),

invited_by UUID NOT NULL REFERENCES profiles(id),

invited_at TIMESTAMPTZ DEFAULT now(),

responded_at TIMESTAMPTZ,

CHECK (

invitee_id IS NOT NULL

OR (invitee_name IS NOT NULL

AND (invitee_email IS NOT NULL OR invitee_phone IS NOT NULL))

)

);

**event_participants**

CREATE TABLE event_participants (

id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

event_id UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,

user_id UUID REFERENCES profiles(id),

guest_name TEXT,

is_standby BOOLEAN NOT NULL DEFAULT false,

joined_at TIMESTAMPTZ DEFAULT now(),

CHECK (user_id IS NOT NULL OR guest_name IS NOT NULL),

UNIQUE (event_id, user_id)

);

**event_teams**

CREATE TABLE event_teams (

id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

event_id UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,

player_a_participant_id UUID NOT NULL REFERENCES event_participants(id) ON DELETE CASCADE,

player_b_participant_id UUID NOT NULL REFERENCES event_participants(id) ON DELETE CASCADE,

team_name TEXT,

UNIQUE (event_id, player_a_participant_id, player_b_participant_id),

CHECK (player_a_participant_id \<\> player_b_participant_id)

);

**Realtime**

ALTER PUBLICATION supabase_realtime ADD TABLE events;

ALTER PUBLICATION supabase_realtime ADD TABLE event_participants;

ALTER PUBLICATION supabase_realtime ADD TABLE event_invitations;

## Row Level Security policies

All policies are membership-based — derived from group_members and event_invitations / event_participants. Venues use a read-only public policy; writes are admin-only via the Supabase service role.

**events**

ALTER TABLE events ENABLE ROW LEVEL SECURITY;

-- SELECT: organizer + confirmed participants + invitees + group members of non-private group events

CREATE POLICY "events: read" ON events FOR SELECT

USING (

organizer_id = auth.uid()

OR EXISTS (

SELECT 1 FROM event_participants

WHERE event_id = events.id AND user_id = auth.uid()

)

OR EXISTS (

SELECT 1 FROM event_invitations

WHERE event_id = events.id AND invitee_id = auth.uid()

)

OR (

is_private = false

AND group_id IS NOT NULL

AND EXISTS (

SELECT 1 FROM group_members

WHERE group_id = events.group_id AND user_id = auth.uid()

)

)

);

-- INSERT: organizer must be the auth user. For a group event, the

-- organizer must be a community admin of the group's community (the

-- same authority that manages the group). Standalone events: any user.

-- The subscription-tier limit is enforced in the create-event RPC /

-- app layer (per-tier limits defined in the Profile & Settings doc).

CREATE POLICY "events: create" ON events FOR INSERT

WITH CHECK (

organizer_id = auth.uid()

AND (

group_id IS NULL

OR EXISTS (

SELECT 1 FROM groups g

WHERE g.id = events.group_id

AND is_community_admin(g.community_id)

)

)

);

-- UPDATE / DELETE: organizer only

CREATE POLICY "events: update" ON events FOR UPDATE

USING (organizer_id = auth.uid());

CREATE POLICY "events: delete" ON events FOR DELETE

USING (organizer_id = auth.uid());

**event_series**

ALTER TABLE event_series ENABLE ROW LEVEL SECURITY;

CREATE POLICY "series: read" ON event_series FOR SELECT

USING (

EXISTS (

SELECT 1 FROM group_members

WHERE group_id = event_series.group_id AND user_id = auth.uid()

)

);

CREATE POLICY "series: write" ON event_series FOR ALL

USING (organizer_id = auth.uid());

**event_courts, event_invitations, event_participants, event_teams**

Each of these tables follows the same pattern: read is granted to anyone with read access on the parent event row; write is restricted to the event organizer.

-- Example for event_invitations (apply analogous policies to the others)

ALTER TABLE event_invitations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "invites: read" ON event_invitations FOR SELECT

USING (

invitee_id = auth.uid()

OR EXISTS (

SELECT 1 FROM events

WHERE events.id = event_invitations.event_id

AND events.organizer_id = auth.uid()

)

);

CREATE POLICY "invites: write" ON event_invitations FOR ALL

USING (

EXISTS (

SELECT 1 FROM events

WHERE events.id = event_invitations.event_id

AND events.organizer_id = auth.uid()

)

);

**venues + courts (public read, admin write)**

ALTER TABLE venues ENABLE ROW LEVEL SECURITY;

ALTER TABLE courts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "venues: read" ON venues FOR SELECT USING (deleted_at IS NULL);

CREATE POLICY "courts: read" ON courts FOR SELECT USING (true);

-- Writes performed only via the service role (admin app); no end-user write policy.

## Component & file map

Assumes the default Padel Jam stack — Next.js (App Router) + Supabase + shadcn/ui + Tailwind + react-hook-form + Zod + @dnd-kit.

**Schemas and hooks**

src/lib/validations/event.schema.ts Full wizard schema (Zod discriminated unions on scoring/recurrence)

src/lib/validations/venue.schema.ts Venue search filter

src/lib/hooks/useCreateEvent.ts Multi-step wizard mutation + sessionStorage draft

src/lib/hooks/useVenues.ts useVenueList(search), useVenueCourts(venueId)

src/lib/hooks/useGroups.ts useUserAdminGroups() — groups the user can create events in (community admin authority + private-group membership); useGroupMembers(groupId)

src/lib/hooks/useEventInvitations.ts create / list / cancel

src/lib/utils/event-derivations.ts playerCapacity, isPrivate enforcement, has_location guard

src/lib/utils/recurrence.ts next-instance materialization helpers

src/lib/utils/dates.ts time-slot generation, period filters

**Create Event wizard**

src/app/(app)/events/new/page.tsx Wizard wrapper + state machine

src/components/events/create/CreateEventWizard.tsx Step orchestrator + nav

src/components/events/create/StepIndicator.tsx "Step N of 10"

src/components/events/create/StepGroup.tsx

src/components/events/create/StepType.tsx

src/components/events/create/StepSpecification.tsx

src/components/events/create/StepScoring.tsx

src/components/events/create/StepLocation.tsx

src/components/events/create/StepCourts.tsx

src/components/events/create/StepDate.tsx

src/components/events/create/StepPreferences.tsx

src/components/events/create/StepGeneral.tsx

src/components/events/create/StepInvites.tsx

src/components/events/create/EventWithoutGroupModal.tsx

src/components/events/create/AddManualLocationForm.tsx

src/components/events/create/AddManualInviteeModal.tsx

src/components/events/create/DiscardDraftDialog.tsx

src/components/events/create/TeamPairingPanel.tsx (only when specification = team)

## Claude Code prompt — Create Event

Run schema (section 05) and RLS (section 06) as Supabase migrations first. Then paste the prompt below into Cursor / Claude Code.

**Build the Create Event wizard for Padel Jam.**

11. Create src/lib/validations/event.schema.ts using Zod. Define an EventDraft schema with discriminated unions on scoring_mode and recurrence. Mirror every field defined in section 03 of the requirements doc, with the exact constraints (max lengths, ranges, conditional required-ness when toggles are on).

12. Create src/lib/hooks/useCreateEvent.ts. Use react-hook-form bound to the EventDraft schema. Persist the in-progress draft to sessionStorage on every change. Expose nextStep(), prevStep(), discardDraft(), submit(). The submit function performs in one Supabase RPC transaction: upload thumbnail to Storage if present; insert event_series if recurring; insert events with all fields and return the id; insert event_courts rows when specific courts were chosen; insert event_participants for the organizer when organizer_role = organizing_and_playing; insert event_invitations for selected invitees (private) or for every group_members row (public group event); insert event_teams when specification = team.

13. Build src/components/events/create/CreateEventWizard.tsx as a state machine. 10 steps, URL state via search params (?step=4) for shareable back/forward. Header includes a StepIndicator and a Close (×) button that triggers DiscardDraftDialog. Body renders the current step component. Footer renders a Back chevron and a Continue button bound to the current step’s validity.

14. Build each Step component to spec — StepGroup (card grid from useUserGroups, "Continue without group" → EventWithoutGroupModal); StepType, StepSpecification (single-select chevron rows); StepScoring (tabbed panels, only the active mode submits); StepLocation (search + venue results, "Add manually" pushes a sub-route, "Don’t want to add" skips Courts); StepCourts (only when venue selected; toggle between specific-courts and just-count modes); StepDate (calendar + period chips + time slot grid + duration radio + recurrence toggle with invite-lead chips); StepPreferences (grouped toggles with conditional sub-fields; force Private ON and lock it when group_id is null); StepGeneral (name, description, thumbnail uploader); StepInvites (members list, "Add manually" modal, Continue / "I’ll invite later"). Use shadcn primitives throughout (Dialog, Sheet, Tabs, Toggle, Slider, RadioGroup).

15. Build the modals and sub-routes: EventWithoutGroupModal (AlertDialog with Continue/Cancel), /events/new/location/manual (full screen form with name, address, num_courts counter, optional court names dynamic list via @dnd-kit), AddManualInviteeModal (name, email, phone — adds to draft.manual_invitees and auto-selects), DiscardDraftDialog (Discard / Keep editing).

16. Wire the route /events/new and add a sticky "Create event" CTA on /events. After successful submit, redirect to /events/\[id\] (event detail; specified in the Join Event sub-flow doc).

17. Write a Playwright spec that walks the wizard end-to-end for three scenarios: (a) a public group event, (b) a private group event, (c) a standalone event. Verify the events row and related rows are created correctly using a service-role client to bypass RLS during assertions.
