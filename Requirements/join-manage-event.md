# Events Module — Join & Manage Event

*Padel Jam — Version 1.3 • May 2026 • Updated with send blast and attendance export*

This document defines two perspectives on an already-created event: Join Event (the player perspective — joining, leaving, partnering up, waiting lists) and Manage Event (the organizer perspective — editing the event, managing its roster, sending blasts, and exporting attendance / revenue). It builds directly on the data model established in the Create Event requirements doc (v1.1). Plan-driven behaviour — the organizer’s blast-customisation level — references the Profile & Settings document’s Subscription section. The In-progress Event sub-flows (player and manager views) are specified in a separate companion document.

**Confirmed design decisions**

- Rotation events (Americano / Mexicano / Up and Down) confirm a player in a single Join action. Team events confirm players only as complete pairs.

- Team events add an “interested” state — a player who has joined but has no partner yet. Interested players never hold a confirmed spot.

- Confirmation deadlines are fixed for every event and cannot be changed: a player can confirm up to 6 h before the event and leave up to 12 h before.

- The waiting list has no size limit and is ordered by join order. When a spot frees up, the first person is notified and must confirm manually — there is no auto-confirmation.

- In a team event, when the event fills up, a solo “interested” player is moved to the waiting list.

- event_type and specification are both immutable after creation. Every other event variable can be edited through Manage Event.

- “I have a partner” confirms both players immediately, without the chosen partner’s consent. “I need a partner” sends requests that the recipient must accept.

- Removing or adding a player never changes whether the event counts toward the group ranking — only is_private decides that. Manually-added players are event-scoped — no platform account or profile is created for them.

- Send blast is available only on events that belong to a community. The customisation level follows the community tier (Profile doc 7.6): Starter — send the template as-is on the chosen channels; Basic / Community Pro — fully customise title and description before sending.

- Export attendance & revenue is available on every Manage Event hub, irrespective of plan. The organizer can either Download CSV or Send CSV to their email.

- Duplicate is a quick-edit modal that clones the event’s entire configuration and lets the organizer change Name, Thumbnail, Date, and Time before confirming; every other field is inherited from the original.

## Overview

**Module scope**

Once an event exists, two groups of people interact with it. Any invited or eligible user can join, leave, find a partner, or sit on a waiting list — that is the Join Event flow. The single user who created the event (the organizer) can edit its details, manage who is in it, send blasts to its members, and export attendance / revenue data — that is the Manage Event flow. Both flows operate on the same events row and share one roster.

**The participant lifecycle**

A person’s relationship to an event moves through a small set of states. The Manage Event roster screens are organised around exactly these states (as tabs).

| **State** | **Meaning** | **Applies to** |
|----|----|----|
| Invited | Was invited but has not confirmed yet — stays “invited” until they confirm. There is no separate “declined” state. | All events |
| Interested | Joined a team event but is not yet in a complete pair. Holds no spot. | Team events only |
| Confirmed | Holds a spot. Rotation: joined directly. Team: part of a complete pair. | All events |
| Waiting list | Wants in but no spot is available. Ordered by join order. | All events |

**Event capacity**

- Player capacity = num_courts × 4 + standby_spots (as established in the Create Event doc). Confirmed players fill the regular slots first, then the standby slots.

- Team events: capacity is the same number of player spots, but spots are claimed two at a time (one pair). Number of teams = capacity ÷ 2.

- When every confirmed slot (regular + standby) is taken, further joiners go to the waiting list.

**Event join window**

Separate from the stored events.status (scheduled / in_progress / completed / cancelled), every event has a derived join window based on its start time:

- Open — more than 6 h before the start. New confirmations are accepted.

- Closing soon — a “X hours left to join” countdown is shown as the 6 h cutoff approaches (the countdown targets the cutoff, not the event start).

- Closed — within 6 h of the start. The event shows “Event closed” and accepts no new confirmations.

**Plan-driven behaviour (cross-reference)**

- Send blast customisation level is gated by the community tier (starter / basic / community_pro). See section 4.10 in this doc and section 7.6 in the Profile & Settings doc.

**Out of scope for this document**

- In-progress Event sub-flows — round generation, score submission, live leaderboard (separate doc).

- Ranking calculation algorithm (separate doc).

- The full Follow / social flow — only the follows table is referenced here, to support standalone-event invitations.

- Notification delivery infrastructure — this doc specifies which notifications fire, not how they are delivered.

- The actual subscription rules, pricing, and plan limits — Profile & Settings doc, sections 7.5 and 7.6.

## Data model — additions & evolutions

This module evolves three tables from the Create Event doc and adds five new ones (two of them new in this revision for the Send blast feature). All evolutions are additive (new columns / relaxed nullability) and migrate cleanly. Full SQL is in section 06.

**Summary of changes**

| **Table** | **Change** | **Why** |
|----|----|----|
| event_participants | Evolved — adds status, guest_gender, waiting_list_position, has_paid, paid_at, confirmed_at, invited_by. | Holds the live roster across the interested / confirmed / waiting-list states. |
| event_teams | Evolved — player slots become nullable; adds team_number and is_confirmed. | A team can now be partially filled (one player = unpaired). |
| event_invitations | Unchanged from the Create Event doc. | Tracks invitations as pending or accepted — there is no “declined” state. |
| partner_requests | New. | Player-to-player “be my partner” requests in team events. |
| event_activity | New. | Activity log shown on the Manage Event hub. |
| follows | New (minimal). | Follow graph — default suggestions when inviting to a standalone event. |
| blast_templates | New. | System-provided blast templates exposed in the Templates tab of Send a blast. |
| event_blasts | New. | History of every blast sent on every event — source data for the Your blasts tab and audit / analytics. |

*Note: the evolved event_participants supersedes the definition in the Create Event doc §05. Because every change is an added column or a relaxed constraint, the Create Event doc only needs its schema section synced — no behavioural rework.*

## Join Event — player perspective

### 3.1 Event list & entry points

- The Events page lists events with three tabs: All (every event visible to the user), Organizing (events the user organises), Going (events the user is confirmed in).

- Each event card opens the event detail screen. A floating “+” button opens Create Event.

- Bottom navigation: Home, Events, Explore, Community, Profile.

### 3.2 Event detail — CTA by viewer state

The event detail screen is shared by everyone, but the status banner and primary CTA adapt to the viewer’s relationship to the event.

| **Viewer state** | **Banner** | **Primary CTA** |
|----|----|----|
| Invited to a private event | “\[Name\] invited you!” | Join |
| Group member, public event, not joined | (none) | Join |
| Confirmed | “You’re going!” | More menu (no Join) |
| Interested (team event, no partner) | “You’re interested!” | Edit response |
| On the waiting list | “You’re on the waiting list” | Leave waiting list |
| Event full, not joined | “No more spots available” | Join waiting list |
| Join window closed | “Event closed” | (none) |
| Organizer, not playing | “You’re organizing” | Join as a player |
| Organizer, playing | “You’re organizing and going!” | More menu |

The detail body is the same throughout: hero image, name, date/time, location, players count, Type · Group line, Courts / Scoring / Fee chips, an Organizer section, and a location card. On the organizer’s view, the body also shows the quick-action row: Manage players, Payment list (when the event has an entrance fee), and Send blast (when the event belongs to a community — see 4.10).

### 3.3 Joining a rotation event

<table>
<colgroup>
<col style="width: 27%" />
<col style="width: 72%" />
</colgroup>
<thead>
<tr>
<th colspan="2"><strong>3.3 Join — Americano / Mexicano / Up and Down</strong></th>
</tr>
<tr>
<th><strong>Action</strong></th>
<th>A single tap on Join confirms the player. No partner step.</th>
</tr>
<tr>
<th><strong>Confirmation screen</strong></th>
<th>“You’re in!” screen with event summary and two actions: Add to calendar, Close.</th>
</tr>
<tr>
<th><strong>After joining</strong></th>
<th>The detail screen switches to the “You’re going!” banner; the More menu (Share / Add to calendar / Leave Event) replaces the Join CTA.</th>
</tr>
<tr>
<th><strong>If the event is full</strong></th>
<th>The Join CTA is replaced by “Join waiting list” (see 3.4).</th>
</tr>
<tr>
<th><strong>DB impact</strong></th>
<th>Inserts event_participants (status = confirmed, is_standby set if it lands on a standby slot); sets the matching event_invitations row to accepted.</th>
</tr>
</thead>
<tbody>
</tbody>
</table>

### 3.4 Waiting list

<table>
<colgroup>
<col style="width: 27%" />
<col style="width: 72%" />
</colgroup>
<thead>
<tr>
<th colspan="2"><strong>3.4 Waiting list</strong></th>
</tr>
<tr>
<th><strong>Entry</strong></th>
<th>When the event is full, the detail screen shows “No more spots available” + “Join waiting list”.</th>
</tr>
<tr>
<th><strong>Size</strong></th>
<th>No limit on the number of people on the waiting list.</th>
</tr>
<tr>
<th><strong>Order</strong></th>
<th>Ordered by join order — first to join the waiting list is first to be offered a freed spot.</th>
</tr>
<tr>
<th><strong>When a spot frees</strong></th>
<th>If a confirmed player leaves or is removed, the first person on the waiting list is notified and must confirm manually. No auto-confirmation — they could miss the message and otherwise be silently marked as confirmed.</th>
</tr>
<tr>
<th><strong>Player view</strong></th>
<th>A “You’re on the waiting list” banner with a “Leave waiting list” action.</th>
</tr>
<tr>
<th><strong>DB impact</strong></th>
<th>event_participants with status = waiting_list and waiting_list_position set (sequential per event).</th>
</tr>
</thead>
<tbody>
</tbody>
</table>

### 3.5 Joining a team event

When the event specification is “team”, tapping Join opens a modal: “This is a team event, how would you like to set your team?” — with two paths.

<table>
<colgroup>
<col style="width: 27%" />
<col style="width: 72%" />
</colgroup>
<thead>
<tr>
<th colspan="2"><strong>3.5a “I have a partner”</strong></th>
</tr>
<tr>
<th><strong>Screen</strong></th>
<th>A list of the event’s invitees. The user picks one player.</th>
</tr>
<tr>
<th><strong>Helper text</strong></th>
<th>“Choosing a partner confirms both your spots in the event.”</th>
</tr>
<tr>
<th><strong>On Confirm</strong></th>
<th>Both players are confirmed immediately as a pair — the chosen partner is confirmed without giving consent. (Players typically arrange this off-app, so the picker is assumed to be sure.)</th>
</tr>
<tr>
<th><strong>Result</strong></th>
<th>“You’re going!” screen showing “Your partner: [name]” + Add to calendar.</th>
</tr>
<tr>
<th><strong>DB impact</strong></th>
<th>Two event_participants rows (status = confirmed) and one event_teams row with both player slots filled and is_confirmed = true.</th>
</tr>
</thead>
<tbody>
</tbody>
</table>

<table>
<colgroup>
<col style="width: 27%" />
<col style="width: 72%" />
</colgroup>
<thead>
<tr>
<th colspan="2"><strong>3.5b “I need a partner”</strong></th>
</tr>
<tr>
<th><strong>Screen</strong></th>
<th>A list of players who also chose “I need a partner”. The user can send an Invite to one or more of them.</th>
</tr>
<tr>
<th><strong>Empty state</strong></th>
<th>If no one else has chosen “I need a partner” yet, the list is empty: “No one looking for partner.”</th>
</tr>
<tr>
<th><strong>“Let others invite me”</strong></th>
<th>The user is added to the “I need a partner” pool so other players can invite them, without actively inviting anyone.</th>
</tr>
<tr>
<th><strong>Status</strong></th>
<th>Choosing “I need a partner” marks the user as interested in the event (holds no spot).</th>
</tr>
<tr>
<th><strong>Acceptance</strong></th>
<th>Each sent invite is a partner request the recipient must accept (see 3.6). Only complete pairs become confirmed.</th>
</tr>
<tr>
<th><strong>DB impact</strong></th>
<th>event_participants with status = interested; one partner_requests row per invite sent.</th>
</tr>
</thead>
<tbody>
</tbody>
</table>

### 3.6 Partner requests

<table>
<colgroup>
<col style="width: 27%" />
<col style="width: 72%" />
</colgroup>
<thead>
<tr>
<th colspan="2"><strong>3.6 Receiving &amp; answering partner requests</strong></th>
</tr>
<tr>
<th><strong>Where they appear</strong></th>
<th>Partner requests are highlighted in the Notifications screen and collected in a dedicated “Partner Requests” screen, grouped by event.</th>
</tr>
<tr>
<th><strong>Accept</strong></th>
<th>Both players are confirmed as a pair; the request is removed from the list.</th>
</tr>
<tr>
<th><strong>Decline</strong></th>
<th>The request is removed from the accepter’s list. The requester is NOT notified of the decline.</th>
</tr>
<tr>
<th><strong>Multiple requests</strong></th>
<th>Accepting one request automatically declines the user’s other pending requests. A confirmation modal explains this: “Accepting this request will confirm your participation in the event and automatically decline other requests. Declined users won’t be notified.”</th>
</tr>
<tr>
<th><strong>DB impact</strong></th>
<th>On accept: partner_requests.status = accepted, the others = declined; both event_participants rows set to confirmed; an event_teams row created with is_confirmed = true.</th>
</tr>
</thead>
<tbody>
</tbody>
</table>

### 3.7 Edit response (interested players)

A player who is interested in a team event can revisit their choice via “Edit response”, which reopens the team modal with three options:

- “I found a partner” — pick someone and confirm both players (same as 3.5a).

- “I need a partner” — invite more players, or undo invites already sent.

- “Leave event” — leave the interested list and cancel all partner requests the user has sent.

### 3.8 Leaving an event

<table>
<colgroup>
<col style="width: 27%" />
<col style="width: 72%" />
</colgroup>
<thead>
<tr>
<th colspan="2"><strong>3.8 Leaving</strong></th>
</tr>
<tr>
<th><strong>Entry</strong></th>
<th>More menu → “Leave Event” (rotation) or “Leave Event as a player” (organizer who is also playing). A confirmation modal is shown.</th>
</tr>
<tr>
<th><strong>Team events</strong></th>
<th>If the user is confirmed in a pair and leaves, their partner is automatically returned to the invited state. The pair’s event_teams row is cleared.</th>
</tr>
<tr>
<th><strong>Past the leave deadline</strong></th>
<th>Within 12 h of the start, leaving via the app is no longer possible. Instead of a Leave action, a modal shows the organizer’s contact (Chat / Call) so the player can arrange it directly.</th>
</tr>
<tr>
<th><strong>Effect on capacity</strong></th>
<th>A freed confirmed spot triggers the waiting-list notification flow (see 3.4).</th>
</tr>
<tr>
<th><strong>Effect on ranking</strong></th>
<th>Leaving does not change whether the event counts toward the group ranking.</th>
</tr>
</thead>
<tbody>
</tbody>
</table>

### 3.9 Confirmation deadlines & event closing

<table>
<colgroup>
<col style="width: 27%" />
<col style="width: 72%" />
</colgroup>
<thead>
<tr>
<th colspan="2"><strong>3.9 Fixed deadlines</strong></th>
</tr>
<tr>
<th><strong>Confirm</strong></th>
<th>A player can confirm up to 6 h before the event start.</th>
</tr>
<tr>
<th><strong>Leave</strong></th>
<th>A player can leave up to 12 h before the event start.</th>
</tr>
<tr>
<th><strong>Countdown</strong></th>
<th>As the 6 h join cutoff approaches, the detail screen shows “X hours left to join” — the countdown targets the cutoff, not the event start.</th>
</tr>
<tr>
<th><strong>After the cutoff</strong></th>
<th>The event shows “Event closed” and accepts no new confirmations or waiting-list joins.</th>
</tr>
<tr>
<th><strong>Configurability</strong></th>
<th>These two deadlines are identical for every event and cannot be changed by the organizer.</th>
</tr>
</thead>
<tbody>
</tbody>
</table>

### 3.10 Sharing & access

- More menu → Share opens a sheet: Message, Whatsapp, Instagram, Copy link.

- If a private-event link is opened by a user who is not on the invite list, a no-access page is shown: “Sorry, you don’t have access to this page. This event is private and only invited players can access the info.” with a Try again action.

- Add to calendar — available from the join confirmation screen and the More menu — creates an event in the user’s own calendar (the device calendar, or whichever calendar app they use).

## Manage Event — organizer perspective

### 4.1 Manage Event hub

The organizer opens the Manage Event hub from the event detail. It is the control centre for the event and contains:

- Event name and group, plus quick cards summarising Preferences (e.g. “Private”) and Scoring (e.g. “Reach 32 points”).

- Two live stats: “X/Y confirmed” (confirmed players ÷ capacity) and “X/Y paid” (paid ÷ players owing an entrance fee).

- Team events also show a “X/Y teams set” progress indicator.

- Quick-action entries into the deeper management screens — Manage players, Preferences, Payment list (when the event has an entrance fee), and Send blast (when the event belongs to a community — see 4.10). The same quick actions also appear on the organizer’s event detail view.

- Location summary, date summary, and an Activity entry point (the event’s change log).

- Actions row at the bottom, in order: Share, Add to calendar, Send blast (when the event belongs to a community), Export Attendance & Revenue data (see 4.11), Duplicate, Cancel.

- Recurring events additionally show a “Next occurrences” section listing the scheduled / upcoming instances.

### 4.2 Editing event details

| **Editing rule** | event_type (Americano / Mexicano / Up and Down) and specification (Classic / Mixed / Team) are immutable once the event is created. Every other variable can be edited. Edits are allowed while the event is scheduled; once it is in progress or completed, editing is locked. |
|----|----|

| **Edit screen** | **Edits** | **Notes** |
|----|----|----|
| General Info | Name, description, thumbnail. | Same fields as Create Event step 9. |
| Preferences | Standby players, private, entrance fee, permissions, organizer role. | Private toggle stays locked ON for standalone events. |
| Scoring | Points / Time / Classic and the value. | Mode stays mutually exclusive. |
| Edit Location & Courts | Venue search / manual location / court count. | Same logic as Create Event steps 5—6. |
| Edit Date & Time | Date, time, duration, weekly recurrence. | Custom duration via a numeric keypad. |

Each edit screen opens as its own sheet with Save / Cancel.

<table>
<colgroup>
<col style="width: 27%" />
<col style="width: 72%" />
</colgroup>
<thead>
<tr>
<th colspan="2"><strong>4.2.1 Editing location &amp; courts — switching</strong></th>
</tr>
<tr>
<th><strong>Screen</strong></th>
<th>The “Edit Location &amp; Courts” sheet has a “Search Location” field and an “Add manually” action — the same two paths as Create Event step 5.</th>
</tr>
<tr>
<th><strong>Current location shown</strong></th>
<th>Whatever the event currently uses — a curated venue or a manual location — is shown at the top with an “×” to clear it.</th>
</tr>
<tr>
<th><strong>Switch venue → venue</strong></th>
<th>Clear the current venue and search for another; picking it replaces the venue and reloads its court list.</th>
</tr>
<tr>
<th><strong>Switch manual → venue</strong></th>
<th>Clear the manual location and use “Search Location” to pick a curated venue instead. The manual name and address are dropped; courts then come from the venue.</th>
</tr>
<tr>
<th><strong>Switch venue → manual</strong></th>
<th>Clear the venue and use “Add manually” to enter a location name, address, and court count by hand.</th>
</tr>
<tr>
<th><strong>Courts</strong></th>
<th>Court selection / count follows the chosen path, exactly as in Create Event step 6 — specific courts for a venue, a counter otherwise.</th>
</tr>
<tr>
<th><strong>Constraint</strong></th>
<th>As in Create Event, an event has either a venue_id or a manual location, never both.</th>
</tr>
</thead>
<tbody>
</tbody>
</table>

### 4.3 Manage players — rotation events

<table>
<colgroup>
<col style="width: 27%" />
<col style="width: 72%" />
</colgroup>
<thead>
<tr>
<th colspan="2"><strong>4.3 Roster management — rotation</strong></th>
</tr>
<tr>
<th><strong>Tabs</strong></th>
<th>Confirmed (X/Y) · Invited (n) · Waiting list (n). X/Y on the Confirmed tab is confirmed players ÷ event capacity.</th>
</tr>
<tr>
<th><strong>Confirmed tab</strong></th>
<th>Removing a confirmed player opens a modal with two choices: remove from the confirmed list (player returns to invited) or remove from the event entirely.</th>
</tr>
<tr>
<th><strong>Invited tab</strong></th>
<th>Lists invited-but-not-confirmed players. The organizer can Remove them or Mark as confirmed (with a feedback message).</th>
</tr>
<tr>
<th><strong>Waiting list tab</strong></th>
<th>Lists waiting-list players in confirmation order. The organizer can Remove a player from the event, or Mark as confirmed. When a confirmed player leaves, the first waiting-list player is auto-notified.</th>
</tr>
<tr>
<th><strong>Add manually</strong></th>
<th>Via “+ Add manually”. For Classic and Team events the form asks only for a name; for Mixed events it also asks for gender. The player is created confirmed and is event-scoped only — no platform account.</th>
</tr>
<tr>
<th><strong>Inviting more players</strong></th>
<th>A “+ Add manually” link is always present. A “+ Invite” link is present only when there are still people who could be invited — see 4.3.1.</th>
</tr>
<tr>
<th><strong>Ranking</strong></th>
<th>Removing or adding a player never changes whether the event counts toward the group ranking.</th>
</tr>
</thead>
<tbody>
</tbody>
</table>

<table>
<colgroup>
<col style="width: 27%" />
<col style="width: 72%" />
</colgroup>
<thead>
<tr>
<th colspan="2"><strong>4.3.1 Inviting more players — by event type</strong></th>
</tr>
<tr>
<th><strong>Public group event</strong></th>
<th>Every group member was already invited at creation, so there is no one left to invite — only “+ Add manually” is shown.</th>
</tr>
<tr>
<th><strong>Private group event</strong></th>
<th>“+ Invite” opens a list of the group’s members who have not been invited yet, plus a “+ Add manually” button.</th>
</tr>
<tr>
<th><strong>Private standalone event</strong></th>
<th>“+ Invite” opens a list of the users the organizer follows, plus a “+ Add manually” button. To invite anyone beyond that, the organizer types a username and the search returns matching platform users.</th>
</tr>
<tr>
<th><strong>Add manually</strong></th>
<th>Always available. Creates an event-scoped player — name only for Classic / Team, name + gender for Mixed — with no platform account.</th>
</tr>
</thead>
<tbody>
</tbody>
</table>

### 4.4 Manage players — team events

Team events offer two views of the roster, switchable at the top: Team view and Player view.

<table>
<colgroup>
<col style="width: 27%" />
<col style="width: 72%" />
</colgroup>
<thead>
<tr>
<th colspan="2"><strong>4.4a Team view</strong></th>
</tr>
<tr>
<th><strong>Layout</strong></th>
<th>A block per team (Team 1, Team 2, …), each with two player slots, plus a tray of player cards at the bottom.</th>
</tr>
<tr>
<th><strong>Assigning</strong></th>
<th>The organizer drag-and-drops a player card into a team slot, or taps the slot’s “+” to pick a player.</th>
</tr>
<tr>
<th><strong>One player in a team</strong></th>
<th>The team is incomplete — that player is considered unpaired and stays in the invited state.</th>
</tr>
<tr>
<th><strong>Two players in a team</strong></th>
<th>Both players are confirmed in the event. Recommended: show an alert banner making this consequence explicit.</th>
</tr>
<tr>
<th><strong>Adding an unconfirmed player</strong></th>
<th>A “Confirm player” modal appears: “This player isn’t confirmed for the event. If you add them to a team, they’ll be automatically confirmed. Continue?”</th>
</tr>
<tr>
<th><strong>Switch player</strong></th>
<th>The switch icon opens a list of ALL players (in teams, invited, or waiting list). Switching swaps the two players’ positions: a player swapped in from the invited list joins the team and is confirmed; the displaced player moves to where the new one came from.</th>
</tr>
<tr>
<th><strong>Remove player</strong></th>
<th>A modal asks “Remove from team” (player returns to invited) or “Remove from event”.</th>
</tr>
</thead>
<tbody>
</tbody>
</table>

<table>
<colgroup>
<col style="width: 27%" />
<col style="width: 72%" />
</colgroup>
<thead>
<tr>
<th colspan="2"><strong>4.4b Player view</strong></th>
</tr>
<tr>
<th><strong>Tabs</strong></th>
<th>Confirmed (X/Y) · Interested (n) · Invited (n). Same as a rotation event plus the Interested tab.</th>
</tr>
<tr>
<th><strong>Interested tab</strong></th>
<th>Players who joined but have no partner yet. The organizer can Remove them (they return to invited) or Mark as confirmed.</th>
</tr>
<tr>
<th><strong>Mark as confirmed</strong></th>
<th>Confirming an interested player requires choosing another player to pair with them — a team event has no confirmed solo players.</th>
</tr>
</thead>
<tbody>
</tbody>
</table>

### 4.5 Payment list

Available only when the event has an entrance fee. It is reached as a quick action from both the organizer’s event detail view and the Manage hub.

<table>
<colgroup>
<col style="width: 27%" />
<col style="width: 72%" />
</colgroup>
<thead>
<tr>
<th colspan="2"><strong>4.5 Payment list screen</strong></th>
</tr>
<tr>
<th><strong>Header total</strong></th>
<th>The header shows amount collected over the event total — e.g. “$35 / 200” — with the collected amount as the prominent figure. The event total = the per-player entrance fee × the number of players (the fee set at creation is per player).</th>
</tr>
<tr>
<th><strong>Tabs</strong></th>
<th>All / Paid / Pending — filter the player list by payment state.</th>
</tr>
<tr>
<th><strong>Per-player control</strong></th>
<th>Each confirmed player’s card has a “Mark as paid” button on the right. Tapping it flips the button to “Paid” and adds that player’s fee to the collected total. Tapping again reverts it to “Mark as paid” and subtracts the fee — it behaves as a toggle tag.</th>
</tr>
<tr>
<th><strong>Mark all as paid</strong></th>
<th>Marks every player as paid in one action — for when everyone has paid and the organizer does not want to do it one by one.</th>
</tr>
<tr>
<th><strong>Informational only</strong></th>
<th>No payment is processed inside the app; the list only tracks who has paid (consistent with the Create Event doc).</th>
</tr>
</thead>
<tbody>
</tbody>
</table>

### 4.6 Recurring event management

A recurring event is a weekly series with no end date. Occurrences within a rolling window of roughly the next three months are addressable; each occurrence is a normal event in its own right. Whether occurrences are pre-materialized rows or generated on demand within that window is an implementation detail.

**Invitations & activation**

- Invitations for an occurrence are sent invite_lead_days before that occurrence — the lead time (1 week / 5 days / 3 days) the organizer chose when enabling weekly recurrence at creation.

- An occurrence appears on players’ Events screen, and can be confirmed or have its roster managed, only once its invitations have been sent. Before that it exists but is dormant.

**Organizer**

- The Manage hub shows the recurrence at the bottom; from there the organizer can open any other occurrence within the ~3-month window — including future ones whose invitations have not been sent yet.

- To cancel, the organizer opens one occurrence and taps Cancel. The “Cancel Recurrent Event” modal always asks: “Only this event” or “This and upcoming events”.

- A future occurrence can be cancelled ahead of time (e.g. a holiday week). If a not-yet-invited occurrence is cancelled, its prospective players are still notified — they may be counting on it.

- Editing an occurrence’s details prompts the same “this occurrence / this and all future occurrences” choice as cancelling.

**Player**

- A recurring event shows a small “recurrent” tag on its main event screen.

- The next occurrence appears as a card at the bottom of the event overview. Unlike the organizer’s version it is not clickable — the player only sees the card’s general info.

### 4.7 Pending actions

- On the organizer’s event detail screen, a “You have N pending actions” bottom sheet surfaces the setup tasks still required; it expands into a checklist.

- Triggers: “Set up N teams” appears when a team event has incomplete teams; “Add N players” appears when the confirmed count is below capacity.

- Each pending action links straight to the screen that resolves it.

### 4.8 Organizer as a player

- If the organizer chose “Organizing only” at creation, the detail screen offers “Join as a player”, and the top-right shows only the settings icon.

- If the organizer chose “Organizing and playing”, they are already a confirmed player, and the top-right shows the settings and more icons.

- The organizer can leave as a player via the More menu (“Leave Event as a player”) without cancelling the event.

### 4.9 Duplicate & cancel

<table>
<colgroup>
<col style="width: 27%" />
<col style="width: 72%" />
</colgroup>
<thead>
<tr>
<th colspan="2"><strong>4.9 Duplicate event — modal spec</strong></th>
</tr>
<tr>
<th><strong>Entry</strong></th>
<th>The Duplicate action on the Manage hub.</th>
</tr>
<tr>
<th><strong>Modal title</strong></th>
<th>“Duplicate event”.</th>
</tr>
<tr>
<th><strong>Fields</strong></th>
<th>Name (text input, prefilled with the original name); Thumbnail (a row of 4 default thumbnail tiles plus a “+” tile to add a custom upload — the original thumbnail is selected by default); Date (a horizontal day pill picker showing the next several days, today selected by default); Time (Morning / Afternoon / Evening tab row that swaps a grid of 30-minute time pills below — 7:00 AM through 12:00 PM under Morning, 12:30 PM through 5:00 PM under Afternoon, 5:30 PM through 11:00 PM under Evening; the current rounded slot selected by default).</th>
</tr>
<tr>
<th><strong>Inherited fields</strong></th>
<th>Every field NOT in the modal is copied verbatim from the source event: event_type, specification, group, courts, venue / manual location, scoring, fee, standby, permissions, organizer role, recurring config (if any), and the full invitation list (a duplicate is treated as a brand-new event, so participants and waiting-list entries do NOT carry over — only invitations do).</th>
</tr>
<tr>
<th><strong>Confirm</strong></th>
<th>On Confirm: a new events row is inserted with the chosen name / thumbnail / starts_at / ends_at and the inherited config; the organizer is routed to the new event’s Manage hub.</th>
</tr>
<tr>
<th><strong>Cancel</strong></th>
<th>Dismisses the modal with no write.</th>
</tr>
</thead>
<tbody>
</tbody>
</table>

<table>
<colgroup>
<col style="width: 27%" />
<col style="width: 72%" />
</colgroup>
<thead>
<tr>
<th colspan="2"><strong>4.9b Cancel event</strong></th>
</tr>
<tr>
<th><strong>Entry</strong></th>
<th>The Cancel action on the Manage hub.</th>
</tr>
<tr>
<th><strong>Standard event</strong></th>
<th>A confirmation modal: “Cancel this event?” Confirm / Cancel.</th>
</tr>
<tr>
<th><strong>Recurring event</strong></th>
<th>A “Cancel Recurrent Event” modal asks “Only this event” or “This and upcoming events” (see 4.6).</th>
</tr>
<tr>
<th><strong>Effect</strong></th>
<th>The event’s status flips to cancelled. All confirmed participants are notified.</th>
</tr>
</thead>
<tbody>
</tbody>
</table>

### 4.10 Send blast

<table>
<colgroup>
<col style="width: 27%" />
<col style="width: 72%" />
</colgroup>
<thead>
<tr>
<th colspan="2"><strong>4.10 Send blast — availability &amp; entry points</strong></th>
</tr>
<tr>
<th><strong>Availability</strong></th>
<th>Send blast is available only on events that belong to a community (events with a group_id whose group belongs to a community). On standalone events the Send blast entry point is hidden on both the event detail and the Manage hub.</th>
</tr>
<tr>
<th><strong>Customisation level</strong></th>
<th>The customisation level is gated by the community tier (source of truth: Profile &amp; Settings doc, section 7.6). Starter — the template is sent as-is; the organizer can only choose recipients and channels (no title / description editing). Basic and Community Pro — the organizer can fully customise title and description before sending.</th>
</tr>
<tr>
<th><strong>Entry points</strong></th>
<th>(a) Quick-action button on the organizer’s event detail view, next to Payment list. (b) Bottom action on the Manage Event hub, between Add to calendar and Export Attendance &amp; Revenue data.</th>
</tr>
</thead>
<tbody>
</tbody>
</table>

<table>
<colgroup>
<col style="width: 27%" />
<col style="width: 72%" />
</colgroup>
<thead>
<tr>
<th colspan="2"><strong>4.10a Send a blast screen — Basic / Community Pro</strong></th>
</tr>
<tr>
<th><strong>Title</strong></th>
<th>“Send a blast” with a back arrow.</th>
</tr>
<tr>
<th><strong>Tabs</strong></th>
<th>Two tabs at the top: Templates (default) and Your blasts.</th>
</tr>
<tr>
<th><strong>Templates tab</strong></th>
<th>A 2-column grid of system-provided templates. Each card shows the template image, a short title, and a Select button. Tap Select → opens the Customize your blast modal (4.10c) prefilled with that template’s image, title, and description.</th>
</tr>
<tr>
<th><strong>Your blasts tab</strong></th>
<th>A list of every blast previously sent by this organizer on any event they manage (newest first). Each row shows the blast image, title, the source event, and the date sent. Tap Select on any row → opens the Customize your blast modal prefilled with that blast’s content. Empty state: “You haven’t sent any blasts yet. Pick a template to start.”</th>
</tr>
<tr>
<th><strong>Source data</strong></th>
<th>Templates come from blast_templates (admin-managed). Your blasts come from event_blasts filtered by sender_id = current organizer.</th>
</tr>
</thead>
<tbody>
</tbody>
</table>

<table>
<colgroup>
<col style="width: 27%" />
<col style="width: 72%" />
</colgroup>
<thead>
<tr>
<th colspan="2"><strong>4.10b Send a blast screen — Starter (simplified)</strong></th>
</tr>
<tr>
<th><strong>Title</strong></th>
<th>“Send a blast” with a back arrow.</th>
</tr>
<tr>
<th><strong>No tabs</strong></th>
<th>On the Starter tier the screen has no Templates / Your blasts tabs. A single default template image is shown at the top (the system’s default template for the event’s type / specification) with its title and description rendered as read-only labels.</th>
</tr>
<tr>
<th><strong>Send to</strong></th>
<th>A “Send to” selector preset to All members (the only option in the MVP).</th>
</tr>
<tr>
<th><strong>Channels</strong></th>
<th>Two checkboxes: Email and Whatsapp. At least one must be selected to enable Send.</th>
</tr>
<tr>
<th><strong>Send</strong></th>
<th>A primary Send button at the bottom dispatches the default template on the chosen channels. On success the “Blast sent!” screen (4.10d) is shown.</th>
</tr>
</thead>
<tbody>
</tbody>
</table>

<table>
<colgroup>
<col style="width: 27%" />
<col style="width: 72%" />
</colgroup>
<thead>
<tr>
<th colspan="2"><strong>4.10c Customize your blast modal (Basic / Community Pro)</strong></th>
</tr>
<tr>
<th><strong>Trigger</strong></th>
<th>Tapping Select on a template (4.10a Templates) or on a past blast (4.10a Your blasts).</th>
</tr>
<tr>
<th><strong>Title</strong></th>
<th>“Customize your blast” as a centered title at the top of the modal.</th>
</tr>
<tr>
<th><strong>Image</strong></th>
<th>A large image area at the top showing the selected template’s image. Tap to replace (opens the file picker).</th>
</tr>
<tr>
<th><strong>Title field</strong></th>
<th>Single-line text input prefilled with the template / past-blast title. Required, max 80 chars.</th>
</tr>
<tr>
<th><strong>Description field</strong></th>
<th>Multi-line text area prefilled with the template / past-blast description. Required, max 1000 chars.</th>
</tr>
<tr>
<th><strong>Send to</strong></th>
<th>“Send to” selector preset to All members (the only option in the MVP).</th>
</tr>
<tr>
<th><strong>Channels</strong></th>
<th>Two checkboxes: Email and Whatsapp. At least one must be selected to enable Send.</th>
</tr>
<tr>
<th><strong>Send</strong></th>
<th>A primary Send button at the bottom; Cancel below it. Send dispatches the customised blast on the chosen channels and inserts an event_blasts row.</th>
</tr>
</thead>
<tbody>
</tbody>
</table>

<table>
<colgroup>
<col style="width: 27%" />
<col style="width: 72%" />
</colgroup>
<thead>
<tr>
<th colspan="2"><strong>4.10d Sent confirmation</strong></th>
</tr>
<tr>
<th><strong>Screen</strong></th>
<th>A confirmation screen with a check / image at the top, the heading “Blast sent!” centered, and a single OK button at the bottom.</th>
</tr>
<tr>
<th><strong>On OK</strong></th>
<th>The screen closes and the user is returned to the event’s Manage hub (or the event detail, depending on where Send blast was entered from).</th>
</tr>
<tr>
<th><strong>Recipients</strong></th>
<th>The blast is dispatched to every event_participants of the event (status = invited, interested, confirmed, or waiting_list) whose corresponding profile has the chosen channel enabled in user_settings (notifications_email or notifications_whatsapp — see Profile doc 6.2). Members who have the channel disabled are silently skipped; the organizer is not told which members were skipped.</th>
</tr>
<tr>
<th><strong>Audit</strong></th>
<th>Every send writes an event_blasts row with sender_id, event_id, source_template_id (nullable), title, description, channels (array), sent_to_count, sent_at.</th>
</tr>
</thead>
<tbody>
</tbody>
</table>

### 4.11 Export Attendance & Revenue data

<table>
<colgroup>
<col style="width: 27%" />
<col style="width: 72%" />
</colgroup>
<thead>
<tr>
<th colspan="2"><strong>4.11 Export bottom sheet</strong></th>
</tr>
<tr>
<th><strong>Entry</strong></th>
<th>The Export Attendance &amp; Revenue data action on the Manage Event hub. Available on every event regardless of tier.</th>
</tr>
<tr>
<th><strong>Sheet title</strong></th>
<th>“Export”.</th>
</tr>
<tr>
<th><strong>Options</strong></th>
<th>Two side-by-side selectable cards: Download CSV and Send CSV to my email. Single-select; one of the two must be selected to enable Confirm.</th>
</tr>
<tr>
<th><strong>Confirm</strong></th>
<th>On Confirm: Download CSV → the client builds the CSV from the current event_participants and triggers a native download (filename: “{event-name}-{yyyy-mm-dd}.csv”). Send CSV to my email → an edge function generates the same CSV server-side and emails it to the organizer’s account email; the sheet shows a toast “Sent to {email}” and dismisses.</th>
</tr>
<tr>
<th><strong>Cancel</strong></th>
<th>Dismisses the sheet with no action.</th>
</tr>
<tr>
<th><strong>CSV contents</strong></th>
<th>One header row plus one row per participant. Columns: name (profile.name or guest_name); user_type (member / manual); status (invited / interested / confirmed / waiting_list); is_standby; joined_at; confirmed_at; has_paid; paid_at; fee_amount (the per-player entrance fee or 0 if the event has none).</th>
</tr>
<tr>
<th><strong>Privacy</strong></th>
<th>Email and mobile fields of platform members are NOT included in the export (only the display name). For manually-added players, only the name (and gender for Mixed) is included.</th>
</tr>
</thead>
<tbody>
</tbody>
</table>

## Functional requirements

Must = MVP. Should = V2. Could = V3. IDs are prefixed JM (Join / Manage).

| **ID** | **Requirement** | **Priority** | **Notes** |
|----|----|----|----|
| JM-01 | The events list has All / Organizing / Going tabs. | **Must** |  |
| JM-02 | The event detail banner and CTA adapt to the viewer’s state. | **Must** | See the 3.2 matrix. |
| JM-03 | An invitee to a private event sees “\[name\] invited you” + Join. | **Must** |  |
| JM-04 | Joining a rotation event confirms the player in a single action. | **Must** |  |
| JM-05 | Joining shows a “You’re in!” confirmation with Add to calendar. | **Must** |  |
| JM-06 | When an event is full, players can join the waiting list. | **Must** |  |
| JM-07 | The waiting list has no size limit and is ordered by join order. | **Must** |  |
| JM-08 | When a spot frees, the first waiting-list player is notified and must confirm manually. | **Must** | No auto-confirmation. |
| JM-09 | Joining a team event prompts “I have a partner” / “I need a partner”. | **Must** |  |
| JM-10 | “I have a partner” confirms both players immediately, without the partner’s consent. | **Must** |  |
| JM-11 | “I need a partner” sends partner requests that must be accepted; marks the player interested. | **Must** |  |
| JM-12 | Partner requests appear in Notifications and a dedicated Partner Requests screen. | **Must** |  |
| JM-13 | Accepting a partner request confirms the pair; declining removes it silently. | **Must** | Requester not notified. |
| JM-14 | Accepting one partner request auto-declines the player’s other pending requests. | **Must** | Confirmation modal explains it. |
| JM-15 | Interested players can Edit response: found a partner / need a partner / leave event. | **Must** |  |
| JM-16 | Leaving a confirmed team pair returns the partner to the invited state. | **Must** |  |
| JM-17 | When a team event fills, solo interested players move to the waiting list. | **Must** |  |
| JM-18 | Players confirm up to 6 h before and leave up to 12 h before; deadlines are fixed. | **Must** | Not configurable. |
| JM-19 | Past the leave deadline, the app shows the organizer’s contact instead of a Leave action. | **Must** | Chat / Call. |
| JM-20 | Past the join cutoff the event is closed — no new confirmations. | **Must** |  |
| JM-21 | A “X hours left to join” countdown targets the join cutoff, not the event start. | Should |  |
| JM-22 | Events can be shared; private-event links show a no-access page to non-invitees. | Should |  |
| JM-23 | The organizer reaches a Manage Event hub with summary, stats, edit entry points, and the action row (Share / Add to calendar / Send blast / Export / Duplicate / Cancel). | **Must** |  |
| JM-24 | event_type and specification are immutable; every other variable is editable. | **Must** |  |
| JM-25 | Manage players (rotation) has Confirmed / Invited / Waiting list tabs. | **Must** |  |
| JM-26 | Removing a confirmed player prompts “remove from confirmed list” vs “remove from event”. | **Must** |  |
| JM-27 | The organizer can Mark as confirmed an invited or waiting-list player. | **Must** |  |
| JM-28 | Manually-added players are event-scoped; Mixed events require name + gender, others name only. | **Must** |  |
| JM-29 | Manage players (team) has a Team view and a Player view. | **Must** |  |
| JM-30 | Adding an unconfirmed player to a team auto-confirms them, with a confirm modal. | **Must** |  |
| JM-31 | A team with one player stays unpaired; a team with two players confirms both. | **Must** |  |
| JM-32 | Switch player swaps two players’ positions across teams / invited / waiting lists. | **Must** |  |
| JM-33 | The payment list tracks paid / pending; informational only, no in-app payment. | **Must** |  |
| JM-34 | Recurring events can be cancelled “only this” or “this and upcoming”. | **Must** |  |
| JM-35 | The organizer can Join as a player / Leave as a player without cancelling the event. | **Must** |  |
| JM-36 | Private group events invite only group members; private standalone events can invite any user. | **Must** | Standalone default = followed users. |
| JM-37 | Removing or adding a player never changes whether the event counts toward the ranking. | **Must** | Only is_private decides. |
| JM-38 | The Manage view surfaces pending actions (set up teams, add players). | Should |  |
| JM-39 | Duplicate event opens a modal with Name, Thumbnail, Date, and Time pickers; every other field is inherited from the source event. | Should |  |
| JM-40 | An Activity log records roster and edit changes on the event. | Could |  |
| JM-41 | Send blast is available only on events that belong to a community; the entry points are hidden on standalone events. | **Must** |  |
| JM-42 | Send a blast (Basic / Community Pro) has Templates and Your blasts tabs and opens a Customize modal with editable title, description, send-to, and channels (Email / Whatsapp). | **Must** |  |
| JM-43 | Send a blast (Starter) shows the default template read-only and only lets the organizer pick send-to and channels. | **Must** | See Profile doc 7.6. |
| JM-44 | A blast is dispatched only on channels the recipient has enabled in user_settings; opted-out recipients are silently skipped. | **Must** |  |
| JM-45 | Every send inserts an event_blasts row (sender_id, event_id, source_template_id, title, description, channels, sent_to_count, sent_at). The “Your blasts” tab reads from this table. | **Must** |  |
| JM-46 | Export Attendance & Revenue opens a bottom sheet with Download CSV and Send CSV to my email; one must be picked to enable Confirm. | **Must** |  |
| JM-47 | The exported CSV contains one row per participant with name, user_type, status, is_standby, joined_at, confirmed_at, has_paid, paid_at, fee_amount; member email and mobile are NOT included. | **Must** |  |

## Database schema

Evolved tables are shown in full. Run the ALTERs / CREATEs after the Create Event doc schema.

**event_participants (evolved)**

| **Column** | **Type** | **Nullable** | **Notes** |
|----|----|----|----|
| id | UUID | No | gen_random_uuid() |
| event_id | UUID | No | FK events ON DELETE CASCADE |
| user_id | UUID | Yes | FK profiles. NULL for manually-added players. |
| guest_name | TEXT | Yes | Name of a manually-added player |
| guest_gender | TEXT | Yes | CHECK IN (male, female). Required for manual adds in Mixed events. |
| status | TEXT | No | CHECK IN (interested, confirmed, waiting_list) |
| is_standby | BOOLEAN | No | true when the player occupies a standby slot |
| waiting_list_position | INTEGER | Yes | Set when status = waiting_list |
| has_paid | BOOLEAN | No | default false |
| paid_at | TIMESTAMPTZ | Yes | When marked paid |
| invited_by | UUID | Yes | FK profiles |
| joined_at | TIMESTAMPTZ | No | default now() |
| confirmed_at | TIMESTAMPTZ | Yes | When the player became confirmed |
| created_at | TIMESTAMPTZ | No | default now() |

CREATE TABLE event_participants (

id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

event_id UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,

user_id UUID REFERENCES profiles(id),

guest_name TEXT,

guest_gender TEXT CHECK (guest_gender IS NULL OR guest_gender IN ('male','female')),

status TEXT NOT NULL DEFAULT 'confirmed'

CHECK (status IN ('interested','confirmed','waiting_list')),

is_standby BOOLEAN NOT NULL DEFAULT false,

waiting_list_position INTEGER,

has_paid BOOLEAN NOT NULL DEFAULT false,

paid_at TIMESTAMPTZ,

invited_by UUID REFERENCES profiles(id),

joined_at TIMESTAMPTZ DEFAULT now(),

confirmed_at TIMESTAMPTZ,

created_at TIMESTAMPTZ DEFAULT now(),

CHECK (user_id IS NOT NULL OR guest_name IS NOT NULL),

CHECK (status \<\> 'waiting_list' OR waiting_list_position IS NOT NULL),

UNIQUE (event_id, user_id)

);

**event_teams (evolved)**

Player slots are now nullable so a team can be partially filled; team_number and is_confirmed are added.

CREATE TABLE event_teams (

id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

event_id UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,

team_number INTEGER NOT NULL,

player_a_id UUID REFERENCES event_participants(id) ON DELETE SET NULL,

player_b_id UUID REFERENCES event_participants(id) ON DELETE SET NULL,

team_name TEXT,

is_confirmed BOOLEAN NOT NULL DEFAULT false,

created_at TIMESTAMPTZ DEFAULT now(),

UNIQUE (event_id, team_number),

CHECK (player_a_id IS NULL OR player_a_id \<\> player_b_id)

);

**partner_requests (new)**

CREATE TABLE partner_requests (

id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

event_id UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,

requester_id UUID NOT NULL REFERENCES profiles(id),

target_id UUID NOT NULL REFERENCES profiles(id),

status TEXT NOT NULL DEFAULT 'pending'

CHECK (status IN ('pending','accepted','declined')),

created_at TIMESTAMPTZ DEFAULT now(),

responded_at TIMESTAMPTZ,

CHECK (requester_id \<\> target_id),

UNIQUE (event_id, requester_id, target_id)

);

**event_activity (new)**

CREATE TABLE event_activity (

id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

event_id UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,

actor_id UUID REFERENCES profiles(id),

action TEXT NOT NULL,

detail JSONB,

created_at TIMESTAMPTZ DEFAULT now()

);

**follows (new — minimal)**

Minimal definition to support standalone-event invitations. The full Follow / social flow is specified in a separate document.

CREATE TABLE follows (

id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

follower_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,

followee_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,

created_at TIMESTAMPTZ DEFAULT now(),

CHECK (follower_id \<\> followee_id),

UNIQUE (follower_id, followee_id)

);

**blast_templates (new)**

System-provided blast templates exposed in the Templates tab of Send a blast. Curated by Padel Jam admins; not user-writable.

CREATE TABLE blast_templates (

id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

title TEXT NOT NULL,

description TEXT NOT NULL,

image_path TEXT NOT NULL,

category TEXT, -- optional grouping (e.g. 'reminder','recap')

is_default BOOLEAN NOT NULL DEFAULT false,

is_active BOOLEAN NOT NULL DEFAULT true,

created_at TIMESTAMPTZ DEFAULT now()

);

**event_blasts (new)**

History of every blast sent on every event. Source data for the Your blasts tab and audit / analytics.

CREATE TABLE event_blasts (

id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

event_id UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,

sender_id UUID NOT NULL REFERENCES profiles(id),

source_template_id UUID REFERENCES blast_templates(id),

title TEXT NOT NULL,

description TEXT NOT NULL,

image_path TEXT,

channels TEXT\[\] NOT NULL, -- subset of {'email','whatsapp'}

send_to TEXT NOT NULL DEFAULT 'all_members'

CHECK (send_to IN ('all_members')),

sent_to_count INTEGER NOT NULL,

sent_at TIMESTAMPTZ NOT NULL DEFAULT now()

);

**Realtime**

ALTER PUBLICATION supabase_realtime ADD TABLE event_teams;

ALTER PUBLICATION supabase_realtime ADD TABLE partner_requests;

ALTER PUBLICATION supabase_realtime ADD TABLE event_activity;

-- events, event_participants, event_invitations already in the publication

-- (added in the Create Event doc).

-- blast_templates and event_blasts are not realtime-critical (read on demand).

## Row Level Security policies

Policies are membership / participation based. event_courts, event_invitations, event_teams, event_activity all follow the same pattern: read for anyone who can read the parent event; write for the event organizer. The non-obvious tables are shown below.

**event_participants**

ALTER TABLE event_participants ENABLE ROW LEVEL SECURITY;

-- READ: anyone who can read the parent event

CREATE POLICY "participants: read" ON event_participants FOR SELECT

USING (

EXISTS (SELECT 1 FROM events e WHERE e.id = event_participants.event_id)

);

-- INSERT: the user joining themselves, or the event organizer

CREATE POLICY "participants: insert" ON event_participants FOR INSERT

WITH CHECK (

user_id = auth.uid()

OR EXISTS (

SELECT 1 FROM events e

WHERE e.id = event_participants.event_id AND e.organizer_id = auth.uid()

)

);

-- UPDATE / DELETE: the participant themselves, or the organizer

CREATE POLICY "participants: update" ON event_participants FOR UPDATE

USING (

user_id = auth.uid()

OR EXISTS (

SELECT 1 FROM events e

WHERE e.id = event_participants.event_id AND e.organizer_id = auth.uid()

)

);

CREATE POLICY "participants: delete" ON event_participants FOR DELETE

USING (

user_id = auth.uid()

OR EXISTS (

SELECT 1 FROM events e

WHERE e.id = event_participants.event_id AND e.organizer_id = auth.uid()

)

);

**partner_requests**

ALTER TABLE partner_requests ENABLE ROW LEVEL SECURITY;

-- READ: the requester or the target

CREATE POLICY "partner_requests: read" ON partner_requests FOR SELECT

USING (requester_id = auth.uid() OR target_id = auth.uid());

-- INSERT: only as the requester

CREATE POLICY "partner_requests: insert" ON partner_requests FOR INSERT

WITH CHECK (requester_id = auth.uid());

-- UPDATE: the target answers; the requester may cancel (delete)

CREATE POLICY "partner_requests: respond" ON partner_requests FOR UPDATE

USING (target_id = auth.uid());

CREATE POLICY "partner_requests: cancel" ON partner_requests FOR DELETE

USING (requester_id = auth.uid());

**follows**

ALTER TABLE follows ENABLE ROW LEVEL SECURITY;

CREATE POLICY "follows: read" ON follows FOR SELECT USING (true);

CREATE POLICY "follows: write" ON follows FOR ALL

USING (follower_id = auth.uid());

**blast_templates + event_blasts**

ALTER TABLE blast_templates ENABLE ROW LEVEL SECURITY;

ALTER TABLE event_blasts ENABLE ROW LEVEL SECURITY;

-- blast_templates: read for any authenticated user; writes are service-role only.

CREATE POLICY "blast_templates: read" ON blast_templates FOR SELECT

USING (auth.role() = 'authenticated' AND is_active);

-- event_blasts: the event's organizer reads and inserts their own; participants

-- can also read (so the Your blasts tab works across the organizer's events).

CREATE POLICY "event_blasts: read" ON event_blasts FOR SELECT

USING (

sender_id = auth.uid()

OR EXISTS (

SELECT 1 FROM events e

WHERE e.id = event_blasts.event_id AND e.organizer_id = auth.uid()

)

);

CREATE POLICY "event_blasts: insert" ON event_blasts FOR INSERT

WITH CHECK (

sender_id = auth.uid()

AND EXISTS (

SELECT 1 FROM events e

WHERE e.id = event_blasts.event_id AND e.organizer_id = auth.uid()

)

);

## Component & file map

Assumes the default Padel Jam stack — Next.js (App Router) + Supabase + shadcn/ui + Tailwind + react-hook-form + Zod + @dnd-kit.

**Hooks & utilities**

src/lib/hooks/useEvent.ts Single event read + realtime subscription

src/lib/hooks/useJoinEvent.ts Join / leave / join-or-leave waiting list

src/lib/hooks/useTeamJoin.ts "I have a partner" / "I need a partner"

src/lib/hooks/usePartnerRequests.ts Send / accept / decline partner requests

src/lib/hooks/useManageEvent.ts Edit event detail fields

src/lib/hooks/useManagePlayers.ts Roster: confirm / remove / mark / add manual

src/lib/hooks/useEventTeams.ts Team view: assign / switch / remove

src/lib/hooks/usePaymentList.ts Mark paid / mark all paid

src/lib/hooks/useFollows.ts Followed-users list for invite search

src/lib/hooks/useEventBlasts.ts Templates list, Your blasts, send blast

src/lib/hooks/useEventExport.ts Build CSV + email-CSV edge function

src/lib/utils/event-window.ts Derive open / closing / closed join window

src/lib/validations/manage-event.schema.ts

src/lib/validations/blast.schema.ts

**Join (player)**

src/app/(app)/events/page.tsx Event list — All / Organizing / Going

src/app/(app)/events/\[id\]/page.tsx Event detail

src/components/events/EventCard.tsx

src/components/events/EventDetail.tsx State-aware banner + CTA + quick actions

src/components/events/JoinConfirmation.tsx "You’re in!" screen

src/components/events/WaitingListBanner.tsx

src/components/events/TeamJoinModal.tsx "I have / I need a partner"

src/components/events/ChoosePartnerScreen.tsx

src/components/events/NeedPartnerScreen.tsx

src/components/events/PartnerRequestsScreen.tsx

src/components/events/EditResponseModal.tsx

src/components/events/LeaveEventModal.tsx

src/components/events/PastDeadlineModal.tsx Organizer contact (Chat / Call)

src/components/events/ShareSheet.tsx

src/components/events/NoAccessPage.tsx

**Manage (organizer)**

src/app/(app)/events/\[id\]/manage/page.tsx Manage Event hub

src/components/events/manage/ManageHub.tsx Stats, quick actions, action row

src/components/events/manage/EditGeneralInfo.tsx

src/components/events/manage/EditPreferences.tsx

src/components/events/manage/EditScoring.tsx

src/components/events/manage/EditLocationCourts.tsx

src/components/events/manage/EditDateTime.tsx

src/components/events/manage/ManagePlayers.tsx Tabbed roster (rotation)

src/components/events/manage/ManagePlayersTeam.tsx Team view + Player view

src/components/events/manage/TeamBoard.tsx Drag-drop team blocks

src/components/events/manage/SwitchPlayerScreen.tsx

src/components/events/manage/RemovePlayerModal.tsx

src/components/events/manage/AddManualPlayerModal.tsx

src/components/events/manage/InvitePlayersSheet.tsx

src/components/events/manage/PaymentList.tsx

src/components/events/manage/PendingActionsBanner.tsx

src/components/events/manage/CancelEventModal.tsx

src/components/events/manage/DuplicateEventModal.tsx Name + Thumbnail + Date + Time

src/components/events/manage/ActivityLog.tsx

src/components/events/blast/SendBlastScreen.tsx Tabs host (or simplified Starter)

src/components/events/blast/BlastTemplatesTab.tsx Grid of system templates

src/components/events/blast/YourBlastsTab.tsx History (sender_id = current)

src/components/events/blast/CustomizeBlastModal.tsx Basic / Community Pro flow

src/components/events/blast/StarterBlastScreen.tsx Read-only template + channels

src/components/events/blast/BlastSentScreen.tsx "Blast sent!" confirmation

src/components/events/export/ExportSheet.tsx Download / Email + Confirm

supabase/functions/event-export-email/index.ts Generates CSV and emails it

## Claude Code prompts

Run the section 06 schema and section 07 RLS as Supabase migrations first. Then run the two prompts below in order — complete and test prompt 1 before starting prompt 2.

**Prompt 1 — Join Event (player)**

**Build the Join Event flow for Padel Jam.**

- Create src/lib/utils/event-window.ts: given events.starts_at, derive the join window — open (\> 6 h before), closing (countdown to the 6 h cutoff), closed (\< 6 h before) — and the leave window (allowed until 12 h before). Create src/lib/hooks/useEvent.ts (single event read + Supabase Realtime on events, event_participants, event_teams, partner_requests) and useJoinEvent.ts (join a rotation event, join the waiting list, leave; on leave from a team pair, return the partner to invited).

- Build EventDetail.tsx: render the state-aware banner and CTA per the 3.2 matrix. Body: hero, name, date/time, location, players count, Type · Group, Courts/Scoring/Fee chips, organizer section. On the organizer’s view also render the quick-action row (Manage players / Payment list / Send blast — the last shown only when the event belongs to a community).

- Build the rotation join path: Join → JoinConfirmation.tsx (“You’re in!” + Add to calendar). When the event is full, swap the CTA to “Join waiting list” and render WaitingListBanner.tsx.

- Build the team join path: TeamJoinModal.tsx (“I have a partner” / “I need a partner”); ChoosePartnerScreen.tsx (pick one invitee, confirm both, create the event_teams row); NeedPartnerScreen.tsx (invite players, “Let others invite me”, mark interested). Build PartnerRequestsScreen.tsx + usePartnerRequests.ts: accept (confirm the pair, decline the user’s other pending requests), decline (silent). Add the “Accept partner request” confirmation modal.

- Build EditResponseModal.tsx (found a partner / need a partner / leave event), LeaveEventModal.tsx, and PastDeadlineModal.tsx (organizer Chat / Call when past the 12 h leave deadline). Build ShareSheet.tsx and NoAccessPage.tsx — a private-event link opened by a non-invitee renders the no-access page.

- Write a Playwright spec covering: joining a rotation event flips the detail screen to “You’re going!”; joining a full event lands the user on the waiting list; when a confirmed player leaves, the first waiting-list player is notified and can confirm manually; leaving a confirmed team pair returns the partner to the invited state.

**Prompt 2 — Manage Event (organizer) + send blast + export + duplicate**

**Build the Manage Event flow, send blast, export, and the updated duplicate modal for Padel Jam.**

- Build the Manage Event hub at /events/\[id\]/manage: event summary, Preferences and Scoring quick cards, “X/Y confirmed” and “X/Y paid” stats, “X/Y teams set” for team events, location/date summaries, Activity entry point, and the action row Share / Add to calendar / Send blast (only for events in a community) / Export Attendance & Revenue data / Duplicate / Cancel. Recurring events also show “Next occurrences”.

- Build the edit screens (EditGeneralInfo, EditPreferences, EditScoring, EditLocationCourts, EditDateTime) as sheets with Save / Cancel. Lock event_type and specification — they must not be editable. Lock all editing once the event status is in_progress or completed.

- Build ManagePlayers.tsx for rotation events: Confirmed / Invited / Waiting list tabs. RemovePlayerModal.tsx offers “remove from confirmed list” vs “remove from event”. The Invited and Waiting list tabs allow “Mark as confirmed”. Build AddManualPlayerModal.tsx: name only for Classic/Team events, name + gender for Mixed. The created player is confirmed and event-scoped (event_participants with user_id NULL).

- Build ManagePlayersTeam.tsx with a Team view and a Player view. Team view: TeamBoard.tsx with @dnd-kit drag-drop into team slots; a “Confirm player” modal when adding an unconfirmed player; one player = unpaired/invited, two = both confirmed. Player view: Confirmed / Interested / Invited tabs. Build SwitchPlayerScreen.tsx (swap two players across teams / invited / waiting list) and the team Remove player modal (“remove from team” vs “remove from event”).

- Build InvitePlayersSheet.tsx: for a private group event, invite group members not yet invited; for a private standalone event, search any platform user (default list = followed users via useFollows.ts). Plus “+ Add manually”. Build PaymentList.tsx (All / Paid / Pending + “Mark all as paid”), PendingActionsBanner.tsx (set up teams / add players), CancelEventModal.tsx (recurring → “only this” / “this and upcoming”), and ActivityLog.tsx.

- Build DuplicateEventModal.tsx with the modal in 4.9: Name input (prefilled), Thumbnail (4 default tiles + a custom add tile, the source thumbnail selected by default), Date (horizontal day pill picker, today default), Time (Morning / Afternoon / Evening tab row swapping a 30-minute time-pill grid). Confirm → inserts a new events row copying every other field verbatim (event_type, specification, group, courts, venue / manual location, scoring, fee, standby, permissions, organizer role, recurring config, invitation list); routes the organizer to the new event’s Manage hub.

- Build the Send blast surface. Gate the entry on the event’s community tier (read community_subscriptions for the event’s group’s community — Profile doc 7.6). For Basic / Community Pro: SendBlastScreen.tsx with Templates and Your blasts tabs; BlastTemplatesTab.tsx renders a grid from blast_templates; YourBlastsTab.tsx renders event_blasts WHERE sender_id = auth.uid(). Select on either tab opens CustomizeBlastModal.tsx with editable image, title, description, Send to (preset All members), and Channels (Email / Whatsapp checkboxes, at least one required). For Starter: StarterBlastScreen.tsx renders the default template read-only with Send to and Channels only. Send dispatches the blast through an edge function that fans out to the chosen channels, respecting each recipient’s user_settings.notifications_email / notifications_whatsapp, and inserts an event_blasts row (channels, sent_to_count, sent_at). On success show BlastSentScreen.tsx (“Blast sent!” + OK).

- Build ExportSheet.tsx as a bottom sheet with Download CSV and Send CSV to my email cards plus Confirm / Cancel. Download CSV → build the CSV in the browser from event_participants (columns in 4.11) and trigger a native download (filename: “{event-slug}-{yyyy-mm-dd}.csv”). Send CSV to my email → call supabase/functions/event-export-email/index.ts which builds the same CSV server-side and emails it to the organizer’s account email; show a “Sent to {email}” toast.

- Write a Playwright spec covering: joining and leaving a rotation event, waiting-list promotion, the full team partner flow (both paths + partner requests), the organizer roster actions (confirm, remove, switch, add manual), duplicating an event from the new modal, sending a blast on a Basic-tier community event with both channels selected, sending the Starter-tier blast with template read-only, and exporting via both Download and Email options.

*Padel Jam • Events Module — Join & Manage Event • v1.3 • Updated with send blast and attendance export*
