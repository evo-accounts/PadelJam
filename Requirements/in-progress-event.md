# Events Module — In-progress & Completed Event

*Padel Jam — Version 1.1 • May 2026 • Updated with review feedback*

This document defines the In-progress Event sub-flow (the live match hub, score entry, round generation, leaderboard, and the timer) and the Completed Event view, for both the player and the organizer. It is the third and final document of the Events module, building on the Create Event (v1.1) and Join & Manage Event (v1.0) requirements. It specifies the per-event leaderboard; the cross-event group ranking algorithm is a separate document.

**Confirmed design decisions**

- The match hub is the live screen: round tabs, match cards, resting players, and Matches / Leaderboard bottom tabs (plus a Timer tab for time-based events).

- Round count: Americano has a natural count — N − 1 rounds for individual play (Classic/Mixed), or a team round-robin for fixed teams (T − 1 if T is even, T if T is odd). Mexicano and Up & Down have no natural count — they are open-ended and the organizer ends them manually.

- Americano generates all rounds at go-live. Mexicano and Up & Down generate only round 1 automatically; each further round is added by the organizer via an "Add round" button, gated on every match of the current round being scored.

- No event finishes automatically. A floating "Finish Event" button appears on the last round — for Americano once its games are scored, for Mexicano / Up & Down whenever the organizer is on the last created round — and the organizer can also finish from the "…" More menu.

- The event leaderboard is individual for Classic / Mixed events and by pair for Team events; when results feed the group ranking, a Team event’s pair score is copied to each of its two players.

- Editing a previous round’s score never rewrites rounds already generated — only rounds not yet generated are recalculated.

- A player can enter only their own match’s score (when "players can submit own results" is on). The first of a match’s four players to submit locks the score; afterwards only the organizer can change it.

- The organizer can enter or edit any match’s score at any time.

- Leaderboard: for Points scoring, players are ranked by total points scored; for Classic / Time scoring, by win = 3, draw = 1, loss = 0.

- Resting players (when confirmed players exceed court capacity) rotate equally — everyone rests roughly the same number of rounds.

- The timer (time-based events only) is a convenience feature — it does not affect score entry or round generation.

- counts_for_ranking is false for private and standalone events, and whenever the organizer excludes the event (at early finish, or via the post-event toggle).

## Overview

**Where this fits**

An event created via Create Event and populated via Join & Manage reaches its start time. From there it moves through three stages, which this document covers end to end:

|  |  |  |
|----|----|----|
| **Stage** | **What the player sees** | **events.status** |
| About to start | "Happening now" tag. If setup is incomplete: "Almost ready to start — waiting for the organizer". Once ready: a "Live event" entry into the match hub. | scheduled |
| In progress | The match hub — round tabs, matches, leaderboard (and the timer for time-based events). | in_progress |
| Completed | The completed-event view — Leaderboard / Overview / Matches tabs, with the organizer’s final results published. | completed |

**Going live**

- The "Happening now" tag appears when the event’s date and start time arrive.

- The match hub only opens once setup is complete: full regular capacity (num_courts × 4) is confirmed and, for team events, every team is set. Until then, players see "Almost ready to start — waiting for the organizer to finish setup".

- Standby players (extra spots beyond num_courts × 4) do not block go-live — they join the rotation as resting players.

**Two perspectives**

- Player — sees the match hub with their own match first and highlighted. Their match score is editable when "players can submit own results" is on; otherwise it is read-only and only the organizer enters it.

- Organizer — sees every match with editable score fields, can edit any score at any time, and controls finishing and publishing. If the organizer is also playing, their own match appears first, like a player; if only organizing, matches appear in normal order.

**Out of scope**

- The cross-event group ranking algorithm — this doc specifies the per-event leaderboard only.

- Recurring-series materialization rules (covered in the recurring-events companion doc).

- Notification delivery infrastructure.

## Data model — additions & evolutions

This module adds five tables and evolves the events table. Full SQL is in section 11.

|  |  |  |
|----|----|----|
| **Table** | **Change** | **Purpose** |
| events | Evolved — adds counts_for_ranking, finished_early, finish_message, published_at. | Tracks ranking inclusion and the finish / publish state. |
| event_rounds | New. | One row per round. status reflects whether it is generated yet. |
| event_matches | New. | One row per match (game) within a round, with its score. |
| match_players | New. | The four players of a match, split into side A and side B. |
| round_rest | New. | Resting players for a round (equal-rotation output). |
| event_timer | New. | Shared convenience timer for time-based events. |

*The leaderboard is not stored — it is computed from event_matches and match_players (see section 06). It may be implemented as a SQL view or function; round generation for Mexicano reads it server-side.*

## The match hub

**Layout**

- Header: "Happening now" tag, event name, Type · Specification line, scoring summary (e.g. "Reach 32 points", "Classic — sets & games", or "Time based: 10 min").

- Round tabs: Round 1, Round 2, Round 3 … Their presence and state depend on the event type (see section 05).

- YOUR MATCH card — always first and highlighted — with the court label. For the organizer who is not playing, there is no "your match"; matches appear in normal order.

- Other match cards below: MATCH 1, MATCH 2 … each with its court label and the two sides.

- Resting players section — players sitting out the current round.

- Bottom tabs: Matches and Leaderboard. Time-based events add a third tab: Timer.

**Setup-incomplete state**

If the start time has arrived but setup is not complete (regular capacity not filled, or a team event with unset teams), the match hub is not yet available. Players see a bottom-of-screen message: "Almost ready to start — waiting for the organizer to finish setup." The organizer resolves this via the Manage players screens / pending actions (see the Join & Manage doc).

**Per-match card**

- Shows the court, the two sides (2 players each), and a score field per side.

- Player view: only the player’s own match has editable score fields (when "players can submit own results" is on); all other matches are read-only.

- Organizer view: every match has editable score fields.

- A match not yet scored shows empty fields ("00"); once scored it shows the result (e.g. "4 × 28").

## Score entry

### 4.1 The score modal

|  |  |
|----|----|
| **Trigger** | Tapping the score field of an editable match opens the Score modal. |
| **Points scoring** | A numeric grid from 1 to the event total (e.g. 32). The user picks their own score; the opponent’s score is auto-computed as (total − own score). Helper text: "Choosing a score automatically sets the opponent’s score." |
| **Classic / Time scoring** | The score is entered manually — a +/− stepper and a numeric keypad. No auto-computation. |
| **Match not played** | A "Match not played" action sets both sides to 0 for that match and marks it status = not_played. It does not block round generation. |
| **Reset** | A "Reset" link clears the current entry before saving. |
| **Actions** | Save / Cancel. |

### 4.2 Who can enter, and locking

|  |  |
|----|----|
| **Players submit results = ON** | Each of a match’s four players sees their own match with editable fields. The first of the four to submit sets the score and locks the match for the other three. |
| **After a player submits** | The player can no longer change the score — only the organizer can. To correct it, the player contacts the organizer. |
| **Players submit results = OFF** | Players cannot enter any score. The player’s own match is still shown first and highlighted, but its fields are read-only. Only the organizer enters scores. |
| **Organizer** | Can enter or edit any match’s score at any time, including matches of completed rounds. The organizer’s edit fields never lock. |

**Editing a previous round**

- When the organizer edits a score in a round that is already completed, a warning modal is shown: "Editing a result in completed rounds will update rankings and affect future rounds that haven’t been generated yet. Do you want to continue?"

- Rounds that were already generated based on the old (incorrect) result are NOT rewritten — those games may already have been played. Only rounds not yet generated are recalculated. (Relevant for Mexicano and Up & Down; for Americano, editing only updates the leaderboard, since Americano rounds are not results-dependent.)

## Round generation by type

Each event type reveals and generates rounds differently. The round tabs reflect this.

### 5.1 Americano

|  |  |
|----|----|
| **Round count** | Natural and finite. Classic / Mixed (individual play): N − 1 rounds, where N is the number of confirmed players — every player partners every other player once. Team specification (fixed pairs): a round-robin of the T teams — T − 1 rounds if T is even, T rounds (with byes) if T is odd. |
| **Generation** | All rounds are generated at go-live; every round tab is present from the start. |
| **Pairing** | Random, generated to maximise unique partner / opponent combinations across the schedule (a known round-robin / "social" scheduling problem; a precomputed or heuristic schedule is acceptable). |
| **Editing** | Editing a past score only recalculates the leaderboard — rounds are fixed, not results-dependent. |
| **Finishing** | The event never finishes automatically. Once every match of the last round is scored, a floating "Finish Event" button appears (see section 08). |

### 5.2 Mexicano

|  |  |
|----|----|
| **Round count** | Open-ended — no natural count. The organizer ends the event manually (section 08). |
| **Round 1** | Generated automatically when the event goes live — seeded by the group ranking, or random if the group has no ranking history or the event is standalone. |
| **Adding a round** | Only round 1 is auto-generated. The next round tab is an "Add round" button. Tapping it generates the next round — a brief loading state may show while the matches are built, then the new round tab opens. |
| **Score gate** | The "Add round" button requires every match of the current round to be scored (or marked not played). If any score is missing, a modal blocks generation and tells the organizer to enter all scores first. |
| **Pairing** | Players are ranked by the current event leaderboard and paired in groups of four by standing: positions 1 + 4 vs 2 + 3, 5 + 8 vs 6 + 7, 9 + 12 vs 10 + 11, and so on. |
| **Editing** | Editing a past score recalculates only rounds not yet generated (see 4.2). |

### 5.3 Up & Down

|  |  |
|----|----|
| **Round count** | Open-ended — no natural count. The organizer ends the event manually (section 08). |
| **Courts** | Courts are ranked 1 … N. Court 1 is the top (winners’ court); Court N is the bottom (losers’ court). Works for any number of courts, odd or even. |
| **Round 1** | Generated automatically at go-live, seeded the same way as Mexicano round 1 (by group ranking, or random). |
| **Adding a round** | Like Mexicano: only round 1 is auto-generated; each further round is added via the "Add round" button, gated on every match of the current round being scored. |
| **Movement** | When the next round is generated: the two winners of each match move up one court (Court K → K − 1); the two losers move down one court (K → K + 1). Exceptions at the ends: the winners of Court 1 stay on Court 1; the losers of Court N stay on Court N. |
| **Within-court pairing** | Proposed rule: the two players who came up from below play against the two who came down from above. (Refinable.) |

### 5.4 Resting players

|  |  |
|----|----|
| **When** | When the number of confirmed players exceeds court capacity (num_courts × 4) — i.e. standby players are present — some players sit out each round. |
| **Rule** | Equal rotation — the system rotates who rests so that, across the event, everyone rests roughly the same number of rounds. |
| **Display** | Resting players for the current round are listed in the "Resting players" section of the match hub. |
| **Up & Down note** | A resting player re-entering the rotation rejoins at a mid-table court; the precise re-entry court is a refinable detail. |

## Leaderboard

For Classic and Mixed events the leaderboard ranks individual players. For Team events it ranks the fixed pairs — the duo stays together as a single leaderboard entry. It is shown live during the event on the Leaderboard tab and as the final standings on the completed-event view. When a completed event feeds the group ranking, a Team event’s pair score is transferred to each of the two players individually (handled by the group-ranking spec).

**Scoring of the leaderboard**

|  |  |
|----|----|
| **Event scoring mode** | **Leaderboard rule** |
| Points | Each player accumulates the actual points their side scored in every match. Players are ranked by total points. A player with more total points ranks higher even if they have fewer wins — the standard round-robin point-sum system. |
| Classic or Time | Standard match points: win = 3, draw = 1, loss = 0. Players are ranked by total match points. |

**Columns & sorting**

- Columns: Points, Win, Lost — shown per player for Classic / Mixed events, per pair for Team events.

- A "Sort by" control offers Points or Wins as the sort key. The default is the leaderboard rule for the event’s scoring mode.

- "Match not played" matches contribute 0 points / 0 win / 0 loss for the players involved.

## The timer (time-based events)

Time-based events get an extra "Timer" bottom tab. It is a convenience so players do not need a separate timer — it has no effect on score entry or round generation.

- A circular countdown, defaulting to the event’s match duration (e.g. 10 min). Controls: Play, Pause, Reset.

- The duration can be adjusted via an "Edit time" slider (Save / Cancel).

- When the user navigates to another tab while the timer runs, it collapses into a compact bar above the bottom tabs, with a pause control.

- The timer is a single shared instance per event, synced via Supabase Realtime so all participants see the same countdown. Any participant or the organizer can start, pause, or reset it.

## Finishing & publishing the event

Only the organizer finishes an event. There are two ways an event reaches the success screen.

### 8.1 The floating Finish Event button

|  |  |
|----|----|
| **What it is** | A floating "Finish Event" button shown above the bottom navigation. No event ever finishes automatically — finishing is always an explicit action. |
| **Americano** | The button appears once every match of the last round (round N − 1) is scored. |
| **Mexicano / Up & Down** | The button is shown whenever the organizer is on the tab of the last created round (these events have no defined last round). |
| **Result** | Tapping it opens the success screen (8.3). This is the normal finish — the event reached its intended end, so it counts toward the group ranking by default, with no ranking prompt. |

### 8.2 Early finish (organizer)

|  |  |
|----|----|
| **Entry point** | Available at any time from the "…" (More) menu — "Finish Event". This is the path for ending an event before the floating button is available (e.g. an Americano stopped before its last round). |
| **Finish Event modal** | Warns that the event is being finished before all rounds are completed, and — for public group events — asks whether it should still count toward the group ranking: "Include in ranking" / "Exclude from ranking". |
| **On Confirm** | The choice sets counts_for_ranking; the success screen is shown. |
| **Ranking question scope** | The Include / Exclude choice only appears for public group events. Private and standalone events never count toward ranking, so the question is omitted. |

### 8.3 Success screen & publishing

|  |  |
|----|----|
| **Content** | A confirmation ("Event completed!") and an optional free-text "Leave a message for players" field. |
| **Save and publish results** | Sets events.status = completed and published_at; unlocks the completed-event view for all players. |
| **Review** | Returns the organizer to the match hub WITHOUT publishing. After Review, the floating "Finish Event" button stays visible on screen at all times, so the organizer can reopen the success screen and publish whenever they want. |
| **Finish message** | If the organizer leaves a message, it is stored on events.finish_message and displayed on the completed-event view, just below the date / time / location line. |

## Completed event

**Player view**

- A "Completed event" tag. The screen is reorganised into three tabs:

  - Leaderboard — the final standings.

  - Overview — the general event information that was shown before the event started (Type · Group, Courts / Scoring / Fee, organizer, location).

  - Matches — the round-by-round results, browsable by round.

- The organizer’s finish message (if any) appears below the date / time / location line.

- "Share results" opens a modal with three options:

  - Post to the community feed — only when the event belongs to a group inside a community; uses a standard result-post format (the player’s placement, photo, event summary). The feed itself is specified in the Community module.

  - Share to an external app — e.g. an Instagram story.

  - Share a link to the result with another Padel Jam user.

- On first publish, a success screen is shown to the player too — "Event completed! Thanks for your participation" — with Share results / Close.

**Organizer view after finishing**

- The organizer can still open the Manage Event screen, but it is read-only — nothing about the event can be edited any more.

- It surfaces one control: a "Ranking Event" toggle — "If enabled, this event will count toward the group ranking." The organizer can disable it after the fact; disabling requires a confirmation.

- Activity (the event log) and Duplicate remain available.

- Duplicate copies the entire event configuration; only the date and time are reset, defaulting to today’s date and the current time. (This refines the Duplicate behaviour noted in the Join & Manage doc.)

**Ranking inclusion — summary**

counts_for_ranking is the single source of truth for whether a completed event feeds the group ranking. It is false when any of the following holds: the event is private; the event is standalone (no group); the organizer chose "Exclude from ranking" at early finish; or the organizer disabled the post-event "Ranking Event" toggle.

## Functional requirements

Must = MVP. Should = V2. Could = V3. IDs are prefixed IP (In-progress).

|  |  |  |  |
|----|----|----|----|
| **ID** | **Requirement** | **Priority** | **Notes** |
| IP-01 | The "Happening now" tag appears when the event’s date and time arrive. | **Must** |  |
| IP-02 | Before setup is complete, players see "waiting for the organizer to finish setup". | **Must** |  |
| IP-03 | The match hub opens only once full regular capacity is confirmed and, for team events, all teams are set. | **Must** |  |
| IP-04 | The match hub shows round tabs, match cards, and a resting-players section. | **Must** |  |
| IP-05 | The player’s own match appears first and highlighted. | **Must** | Also for an organizer who plays. |
| IP-06 | With "players can submit own results" on, a player can enter only their own match’s score. | **Must** |  |
| IP-07 | The first of a match’s players to submit locks the score; afterwards only the organizer can change it. | **Must** |  |
| IP-08 | With "players can submit own results" off, only the organizer enters scores; the player’s card is read-only. | **Must** |  |
| IP-09 | The organizer can enter or edit any match’s score at any time. | **Must** |  |
| IP-10 | Points scoring: the player picks their score and the opponent’s is auto-computed to the event total. | **Must** |  |
| IP-11 | Classic / Time scoring: scores are entered manually via stepper or keypad. | **Must** |  |
| IP-12 | "Match not played" sets both sides to 0 and does not block round generation. | **Must** |  |
| IP-13 | Americano generates all rounds at go-live: N − 1 individual, or a team round-robin for fixed teams. | **Must** |  |
| IP-14 | Mexicano auto-generates round 1; each further round is added via "Add round", gated on all current-round scores. | **Must** | 1+4 vs 2+3 by standing. |
| IP-15 | Up & Down auto-generates round 1; each further round is added via "Add round" (winners up / losers down). | **Must** |  |
| IP-16 | Mexicano and Up & Down are open-ended; the organizer ends them manually. | **Must** |  |
| IP-17 | Editing a previous round never rewrites generated rounds; only ungenerated rounds recalculate. | **Must** |  |
| IP-18 | Resting players rotate equally when confirmed players exceed court capacity. | **Must** |  |
| IP-19 | The leaderboard ranks by total points (Points) or 3 / 1 / 0 (Classic / Time) — individual for Classic / Mixed, by pair for Team events. | **Must** |  |
| IP-20 | The leaderboard can be sorted by Points or Wins. | **Should** |  |
| IP-21 | Time-based events show a Timer tab; the timer does not affect scoring or rounds. | **Should** | Shared, realtime-synced. |
| IP-22 | The organizer can finish the event early via the More menu. | **Must** |  |
| IP-23 | Early finish of a public group event asks Include / Exclude from ranking. | **Must** |  |
| IP-24 | No event finishes automatically; a floating Finish Event button appears on the last round. | **Must** | Americano: when the last round is fully scored. |
| IP-25 | The success screen lets the organizer leave an optional message, then publish or review. | **Must** |  |
| IP-26 | After "Review", the floating Finish Event button stays visible at all times. | **Should** |  |
| IP-27 | Publishing sets the event to completed and unlocks the completed-event view. | **Must** |  |
| IP-28 | The completed event has Leaderboard / Overview / Matches tabs; pre-event info moves to Overview. | **Must** |  |
| IP-29 | The organizer’s finish message is shown below the date / time / location line. | **Should** |  |
| IP-30 | After finishing, the organizer’s Manage screen is read-only with a Ranking Event toggle. | **Must** |  |
| IP-31 | Disabling the Ranking Event toggle requires a confirmation. | **Must** |  |
| IP-32 | counts_for_ranking is false for private / standalone events and whenever the organizer excludes it. | **Must** |  |
| IP-33 | Duplicate copies all configuration, with date and time defaulting to today. | **Should** | Refines the Join & Manage doc. |
| IP-34 | Players and the organizer see score and round changes in real time. | **Must** | Supabase Realtime. |
| IP-35 | "Share results" opens a modal: post to the community feed, share to an external app, or share a result link. | **Could** | Community feed in the Community module. |

## Database schema

Run after the Create Event and Join & Manage schemas.

**events (evolved — new columns)**

|  |  |  |  |
|----|----|----|----|
| **Column** | **Type** | **Nullable** | **Notes** |
| counts_for_ranking | BOOLEAN | No | default true. Forced false for private / standalone events. |
| finished_early | BOOLEAN | No | default false. true when finished before all rounds completed. |
| finish_message | TEXT | Yes | Optional message from the organizer, shown on the completed view. |
| published_at | TIMESTAMPTZ | Yes | Set when results are published. |

ALTER TABLE events

ADD COLUMN counts_for_ranking BOOLEAN NOT NULL DEFAULT true,

ADD COLUMN finished_early BOOLEAN NOT NULL DEFAULT false,

ADD COLUMN finish_message TEXT,

ADD COLUMN published_at TIMESTAMPTZ;

**event_rounds (new)**

|  |  |  |  |
|----|----|----|----|
| **Column** | **Type** | **Nullable** | **Notes** |
| id | UUID | No | gen_random_uuid() |
| event_id | UUID | No | FK events ON DELETE CASCADE |
| round_number | INTEGER | No | 1-based |
| status | TEXT | No | CHECK IN (pending, active, completed). pending = matches generating; active = playable; completed = all matches scored. |
| generated_at | TIMESTAMPTZ | Yes | When the round was generated |
| created_at | TIMESTAMPTZ | No | default now() |

CREATE TABLE event_rounds (

id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

event_id UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,

round_number INTEGER NOT NULL CHECK (round_number \> 0),

status TEXT NOT NULL DEFAULT 'pending'

CHECK (status IN ('pending','active','completed')),

generated_at TIMESTAMPTZ,

created_at TIMESTAMPTZ DEFAULT now(),

UNIQUE (event_id, round_number)

);

**event_matches (new)**

|  |  |  |  |
|----|----|----|----|
| **Column** | **Type** | **Nullable** | **Notes** |
| id | UUID | No | Primary key |
| event_id | UUID | No | FK events ON DELETE CASCADE |
| round_id | UUID | No | FK event_rounds ON DELETE CASCADE |
| court_id | UUID | Yes | FK courts. NULL for manual-location events. |
| court_number | INTEGER | No | Display + Up & Down ranking (1 = top) |
| match_number | INTEGER | No | Order within the round |
| side_a_score | INTEGER | Yes | NULL until scored |
| side_b_score | INTEGER | Yes | NULL until scored |
| status | TEXT | No | CHECK IN (pending, played, not_played) |
| submitted_by | UUID | Yes | FK profiles — who entered the score |
| submitted_at | TIMESTAMPTZ | Yes |  |
| created_at | TIMESTAMPTZ | No | default now() |

CREATE TABLE event_matches (

id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

event_id UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,

round_id UUID NOT NULL REFERENCES event_rounds(id) ON DELETE CASCADE,

court_id UUID REFERENCES courts(id) ON DELETE SET NULL,

court_number INTEGER NOT NULL,

match_number INTEGER NOT NULL,

side_a_score INTEGER CHECK (side_a_score IS NULL OR side_a_score \>= 0),

side_b_score INTEGER CHECK (side_b_score IS NULL OR side_b_score \>= 0),

status TEXT NOT NULL DEFAULT 'pending'

CHECK (status IN ('pending','played','not_played')),

submitted_by UUID REFERENCES profiles(id),

submitted_at TIMESTAMPTZ,

created_at TIMESTAMPTZ DEFAULT now()

);

**match_players (new)**

CREATE TABLE match_players (

id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

match_id UUID NOT NULL REFERENCES event_matches(id) ON DELETE CASCADE,

participant_id UUID NOT NULL REFERENCES event_participants(id) ON DELETE CASCADE,

side TEXT NOT NULL CHECK (side IN ('a','b')),

UNIQUE (match_id, participant_id)

);

-- Four rows per match: two with side 'a', two with side 'b'.

-- In team events, the two players of a side are an event_teams pair.

**round_rest (new)**

CREATE TABLE round_rest (

id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

round_id UUID NOT NULL REFERENCES event_rounds(id) ON DELETE CASCADE,

participant_id UUID NOT NULL REFERENCES event_participants(id) ON DELETE CASCADE,

UNIQUE (round_id, participant_id)

);

**event_timer (new)**

CREATE TABLE event_timer (

event_id UUID PRIMARY KEY REFERENCES events(id) ON DELETE CASCADE,

duration_seconds INTEGER NOT NULL,

started_at TIMESTAMPTZ,

paused_at TIMESTAMPTZ,

status TEXT NOT NULL DEFAULT 'idle'

CHECK (status IN ('idle','running','paused')),

updated_at TIMESTAMPTZ DEFAULT now()

);

**Leaderboard (computed)**

The leaderboard is derived, not stored. For each player it aggregates, across event_matches joined to match_players: total points scored by the player’s side; wins, draws and losses. Points mode ranks by total points; Classic / Time mode ranks by 3·wins + 1·draws. Implement as a SQL view or a function so Mexicano round generation can read consistent standings server-side.

**Realtime**

ALTER PUBLICATION supabase_realtime ADD TABLE event_rounds;

ALTER PUBLICATION supabase_realtime ADD TABLE event_matches;

ALTER PUBLICATION supabase_realtime ADD TABLE match_players;

ALTER PUBLICATION supabase_realtime ADD TABLE event_timer;

## Row Level Security policies

event_rounds, match_players and round_rest are readable by anyone who can read the parent event and writable only by the organizer (round generation runs as the organizer or via a service-role function). event_matches needs the score-submission rule below.

**event_matches**

ALTER TABLE event_matches ENABLE ROW LEVEL SECURITY;

-- READ: anyone who can read the parent event

CREATE POLICY "matches: read" ON event_matches FOR SELECT

USING (EXISTS (SELECT 1 FROM events e WHERE e.id = event_matches.event_id));

-- UPDATE (score entry): the organizer always; a player only if the event

-- allows self-submission AND they are one of the match's players.

CREATE POLICY "matches: score" ON event_matches FOR UPDATE

USING (

EXISTS (

SELECT 1 FROM events e

WHERE e.id = event_matches.event_id AND e.organizer_id = auth.uid()

)

OR (

EXISTS (

SELECT 1 FROM events e

WHERE e.id = event_matches.event_id AND e.players_submit_results = true

)

AND EXISTS (

SELECT 1 FROM match_players mp

JOIN event_participants p ON p.id = mp.participant_id

WHERE mp.match_id = event_matches.id AND p.user_id = auth.uid()

)

)

);

*The "first submitter locks it" rule and the post-lock organizer-only edit are enforced in the score-submission RPC / application layer, with the policy above as the backstop.*

**event_timer**

ALTER TABLE event_timer ENABLE ROW LEVEL SECURITY;

CREATE POLICY "timer: read" ON event_timer FOR SELECT

USING (EXISTS (SELECT 1 FROM events e WHERE e.id = event_timer.event_id));

-- Any confirmed participant or the organizer may control the timer.

CREATE POLICY "timer: control" ON event_timer FOR ALL

USING (

EXISTS (SELECT 1 FROM events e WHERE e.id = event_timer.event_id AND e.organizer_id = auth.uid())

OR EXISTS (

SELECT 1 FROM event_participants p

WHERE p.event_id = event_timer.event_id AND p.user_id = auth.uid()

AND p.status = 'confirmed'

)

);

## Component & file map

Assumes the default Padel Jam stack — Next.js (App Router) + Supabase + shadcn/ui + Tailwind.

**Hooks & utilities**

src/lib/hooks/useMatchHub.ts Rounds + matches read + Realtime

src/lib/hooks/useScoreEntry.ts Submit / edit a match score (+ lock rule)

src/lib/hooks/useLeaderboard.ts Computed standings

src/lib/hooks/useEventTimer.ts Shared timer state

src/lib/hooks/useFinishEvent.ts Finish early / publish / review

src/lib/round-gen/americano.ts N-1 schedule (individual) + team round-robin

src/lib/round-gen/mexicano.ts Standings-based 1+4 / 2+3 pairing

src/lib/round-gen/upAndDown.ts Winners'/losers' court movement

src/lib/round-gen/resting.ts Equal-rotation resting selection

src/lib/utils/leaderboard.ts Points vs 3/1/0 aggregation

**Screens & components**

src/app/(app)/events/\[id\]/live/page.tsx The match hub

src/components/events/live/MatchHub.tsx Round tabs + match list

src/components/events/live/RoundTabs.tsx Round tabs + "Add round" button

src/components/events/live/MatchCard.tsx Sides, court, score fields

src/components/events/live/ScoreModal.tsx Points grid / stepper+keypad

src/components/events/live/RestingPlayers.tsx

src/components/events/live/LeaderboardTab.tsx + Sort by

src/components/events/live/TimerTab.tsx Countdown + minimized bar

src/components/events/live/WaitingForSetup.tsx

src/components/events/finish/FinishEventModal.tsx Early finish + ranking choice

src/components/events/finish/SuccessScreen.tsx Message + publish / review

src/components/events/finish/FinishButton.tsx Floating Finish Event button

src/components/events/completed/CompletedEvent.tsx Leaderboard / Overview / Matches

src/components/events/completed/ShareResultsModal.tsx Feed / external app / link

src/components/events/completed/RankingToggle.tsx Post-event ranking control

## Claude Code prompts

Run the section 11 schema and section 12 RLS as Supabase migrations first. Then run the two prompts in order.

**Prompt 1 — The match hub & scoring**

**Build the in-progress match hub for Padel Jam.**

1.  Create the round-generation modules in src/lib/round-gen/: americano.ts (all rounds at go-live — N−1 for individual play, a team round-robin for fixed teams), mexicano.ts (round 1 seeded; each further round generated on demand from current standings — 1+4 vs 2+3), upAndDown.ts (courts ranked 1..N; round 1 seeded; each further round generated on demand — winners up, losers down, ends stay), and resting.ts (equal-rotation resting selection). Persist output to event_rounds / event_matches / match_players / round_rest.

2.  Create useMatchHub.ts (rounds + matches read with Supabase Realtime) and useScoreEntry.ts. The score-entry mutation enforces: first of a match’s players to submit locks it (afterwards organizer-only); the organizer can always edit; editing a completed round shows the warning modal and recalculates only not-yet-generated rounds.

3.  Build MatchHub.tsx with RoundTabs.tsx — Americano shows all round tabs upfront; Mexicano and Up & Down show only created rounds plus an "Add round" tab that generates the next round (a blocking modal if any current-round score is missing; a loading state while matches build). The player’s own match (MatchCard.tsx) renders first and highlighted.

4.  Build ScoreModal.tsx: a 1..total numeric grid for Points (auto-compute the opponent’s score), a stepper + numeric keypad for Classic/Time, a "Match not played" action, and Reset. Respect the players_submit_results flag — read-only player cards when off.

5.  Build RestingPlayers.tsx, WaitingForSetup.tsx ("Almost ready to start"), and useLeaderboard.ts + LeaderboardTab.tsx (Points total vs 3/1/0, Sort by Points / Wins).

6.  Build TimerTab.tsx + useEventTimer.ts for time-based events: a shared, realtime-synced countdown with play / pause / reset, an Edit time slider, and a minimized bar on other tabs.

**Prompt 2 — Finishing & the completed event**

**Build the finish & completed-event flow for Padel Jam.**

7.  Create useFinishEvent.ts: expose floating-button visibility (Americano: last round fully scored; Mexicano / Up & Down: on the last created round), plus finishEarly() (from the More menu), publish(), review(). finishEarly sets finished_early and counts_for_ranking from the Include/Exclude choice; publish sets status = completed and published_at.

8.  Build FinishEventModal.tsx (opened from the "…" More menu) — warns about finishing before all rounds, and for public group events asks Include / Exclude from ranking. SuccessScreen.tsx — optional finish message, "Save and publish results" / "Review".

9.  Build the floating Finish Event button — visible per the rules above, and kept persistently visible after the organizer picks "Review"; it reopens the success screen.

10. Build CompletedEvent.tsx — the "Completed event" tag and three tabs: Leaderboard (final standings), Overview (the pre-event general info), Matches (round-by-round results). Show the finish message below the date / time / location line. Add a "Share results" modal: post to the community feed, share to an external app, or copy a result link.

11. Build the post-finish organizer Manage view as read-only, with RankingToggle.tsx — the "Ranking Event" toggle that updates counts_for_ranking; disabling it requires a confirmation dialog.

12. Wire Duplicate to copy the full event configuration with date and time defaulting to today. Write a Playwright spec covering: scoring a full Americano to natural completion, an early finish of a Mexicano, publishing, and the completed-event tabs.
