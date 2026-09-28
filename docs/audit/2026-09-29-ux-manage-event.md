# UX Audit — Manage Event (section 12)

Transcription of `UX-Audit-Manage-Event.docx.pdf` (19 pages), received 2026-09-28. Text is the audit's own,
reflowed from the PDF; wording is unchanged. Implementation plan: [2026-09-29-ux-manage-event-plan.md](2026-09-29-ux-manage-event-plan.md).

> 12. Manage Event — managing an event as the organizer.

## UX-MEVT-01

**Location:** Manage Event — Event detail (organizer)

**Problem:** The organizer sees the player detail screen with three extra elements stacked at the bottom: a "Gerir" button, a disabled "Iniciar evento" button and a line stating every spot must be confirmed before starting. Management occupies the most prominent area of the screen and pushes the join action to the very bottom. There is no settings entry point in the header.

**Suggestion:** The body of the screen is the same as the player view (UX-JEVT-02), including the players card, the badges, the widgets and the organizer card. Management lives in the header and in a dedicated screen. Header — two organizer states:

- Organizing — a settings icon in the top-right corner, opening Manage Event (UX-MEVT-03).
- Organizing and going — settings icon plus the " ⋯ " available to players, side by side. The organizer gets both.
- A status line below the header states which one applies: "You are organizing" with a "Join as a player" action next to it, or "You are organizing and going!". Body:
- A "Manage players" row with overlapping avatars and a chevron, opening UX-MEVT-10.
- Below it, a horizontally scrollable chip row: Payment list, Send blast, Preferences.
- The Courts, Scoring and Fee widgets are read-only, exactly as in the player view. Editing happens in Manage Event. Actions:
- Remove the "Gerir" button and the remaining-spots line from the body.
- "Start event" appears here only once the scheduled time has arrived (UX-MEVT-23).
- "Join as player" stays as a secondary action.
- Leaving the event as a player is done through the " ⋯ " menu, not from the body. Header per UX-GLOB-01. Bottom sheet per UX-GLOB-02. Avatars per UX-GLOB-04.

## UX-MEVT-02

**Location:** Manage Event — Organizer eligibility

**Problem:** The organizer is shown the error "Não estás na lista de convidados deste evento" in red on their own event. Creating an event without confirming yourself is being treated as not being invited to it, which is not a real state.

**Suggestion:** Remove the message. The organizer is always eligible to play in the event they created.

- The choice made at creation — "Organizing only" or "Organizing and playing" (UX-CEVT-09) — only determines whether the organizer starts already confirmed.
- "Organizing only" leaves the spot open. It never removes the organizer ability to join later, at any point, through "Join as a player".
- The guest-list restriction never applies to the organizer.

## UX-MEVT-03

**Location:** Manage Event — Dashboard

**Problem:** "Gerir evento" is a single scrolling screen mixing every editable field, a manual player input, the confirmed and invited lists, and the destructive actions. Editing a value means scrolling through the whole event configuration, and the screen reproduces the ten creation steps as an editable form.

**Suggestion:** Manage Event is an overview screen, reached from the settings icon in the header of the event detail (UX-MEVT-01). That is its only entry point. Every card opens a bottom sheet containing only the settings for that piece of information — never a form reproducing the creation steps. Header:

- Back button and title "Manage Event".
- Below it, the event format as a read-only chip. Cards, in order:
- Event name — full-width card with the event name and a chevron, opening General Info (UX-MEVT-04).
- Preferences and Scoring — two half-width cards side by side, each showing its current value as a subtitle and a chevron, opening UX-MEVT-05 and UX-MEVT-06.
- Confirmed and Paid — two half-width cards side by side, each with a donut chart and its ratio. Confirmed opens Manage players (UX-MEVT-10); Paid opens the Payment list (UX-MEVT-16). They are different lists and never merge: one controls who is coming, the other who has paid.
- Location — card with the venue name and the courts in use, opening UX-MEVT-07.
- Date — card with the date and the time range, opening UX-MEVT-08.
- Activity — card with a chevron, opening the Activity screen (UX-MEVT-17). Full screen, not a sheet. Actions below the cards, stacked full-width:
- Share, Add to calendar, Send blast, Export attendance & revenue data, Start event. Footer:
- Duplicate and Cancel, side by side. Conditional:
- The Paid card and the Payment list are hidden when the event has no entrance fee.
- Once the event is completed, the dashboard reduces to the Paid donut, the ranking toggle, Activity and Duplicate (UX-LIVE-19). The Confirmed donut is dropped — with the event over, who came is settled, and the Paid donut already counts against every confirmed player. Header and back button per UX-GLOB-01. Bottom sheet per UX-GLOB-02.

## UX-MEVT-04

**Location:** Manage Event — General Info

**Problem:** Editing the event name, description and image is not available as an isolated action.

**Suggestion:** Bottom sheet titled "General Info", opened from the event name card, with a close ( ✕ ) in the top-right corner.

- Name field.
- Description field, marked optional.
- Thumbnail using the same component as Create Event, Create Group and Create Community — preset images plus a custom upload.
- Primary "Save" and secondary "Cancel". Bottom sheet per UX-GLOB-02. Submission feedback per UX-GLOB-06.

## UX-MEVT-05

**Location:** Manage Event — Preferences

**Problem:** The event preferences cannot be changed after creation.

**Suggestion:** Bottom sheet titled "Preferences", close ( ✕ ) in the top-right corner, with the same blocks and copy as the creation step (UX-CEVT-09):

- Game Details — "Allow stand by players", with its extra-spots counter when enabled.
- Invite Details — "Private event" and "Entrance fee" with its payment method and amount. Payment methods are Cash, At Club and MB WAY, as at creation.
- Permissions — "Players can submit their own results".
- Primary "Save" and secondary "Cancel". Rules:
- Turning "Private event" on does not affect anyone already confirmed. They stay in the event. The restriction applies from the moment it is enabled onwards.
- Changing the entrance fee recalculates the Payment list. Whoever had already paid keeps that amount credited and owes only the difference; the organizer marks them as paid again once it is settled (UX-MEVT-16). Bottom sheet per UX-GLOB-02.

## UX-MEVT-06

**Location:** Manage Event — Scoring

**Problem:** Scoring cannot be changed after creation.

**Suggestion:** Bottom sheet titled "Scoring", close ( ✕ ) in the top-right corner, with the same structure as the creation step (UX-CEVT-05): Points with its preset row and Custom, Time with its slider, and Classic sets. Primary "Save" and secondary "Cancel".

- Changing scoring does not notify the confirmed players. Only date and location changes do (UX-MEVT-07, UX-MEVT-08). Bottom sheet per UX-GLOB-02.

## UX-MEVT-07

**Location:** Manage Event — Edit Location & Courts

**Problem:** Location and courts cannot be changed after creation, and there is no rule protecting the confirmed players when the capacity would shrink.

**Suggestion:** Bottom sheet titled "Edit Location & Courts", close ( ✕ ) in the top-right corner, reusing the three scenarios of the creation step (UX-CEVT-06).

- Search Location — searches the curated venue registry, the same as at creation. It is not a map search and has no geolocation step.
- Add manually — venue name (optional), address, number of courts, and optional court names. The venue is temporary data for this event only and is not added to the registry.
- Primary "Save" and secondary "Cancel". Rules:
- The number of courts cannot be reduced below the capacity already committed to confirmed players. The new location must offer at least the same number of courts.
- When no valid option exists, the organizer path is to cancel the event (UX-MEVT-21), not to shrink it.
- Saving a location change notifies every confirmed player. Bottom sheet per UX-GLOB-02. Search input per UX-GLOB-05. Submission feedback per UX-GLOB-06.

## UX-MEVT-08

**Location:** Manage Event — Edit Date & Time

**Problem:** Date, time and duration cannot be changed after creation, and there is no recurrence control after the event exists.

**Suggestion:** Bottom sheet titled "Edit Date & Time", close ( ✕ ) in the top-right corner, reusing the structure of the creation step (UX-CEVT-08): the horizontal day scroller, the Morning / Afternoon / Evening tabs with their preset times, the 60 / 90 / 120 duration presets plus Custom, and the "Repeat every week" toggle.

- Custom duration opens a numeric input sheet with the numeric keyboard, matching the custom points pattern.
- Primary "Save" and secondary "Cancel". Rules:
- Saving a date or time change notifies every confirmed player.
- On a recurring event, saving first asks the scope — this occurrence only, or this and upcoming occurrences (UX-MEVT-22).
- Turning "Repeat every week" off on an event that is already recurring opens a confirmation sheet before deleting the future occurrences. Bottom sheet per UX-GLOB-02.

## UX-MEVT-09

**Location:** Manage Event — What can be changed

**Problem:** There is no rule stating what may be edited once the event exists and players are committed, so the management screen exposes every field as editable.

**Suggestion:** State the rule at the top of the section and enforce it in the interface. Immutable after creation:

- The event format — Americano, Mexicano, Up & Down.
- The player modality — Classic, Mixed, Team.
- The group the event belongs to, or its absence.
- All three appear as read-only information in Manage Event and are absent from every edit sheet. Editable, with their own constraints:
- Name, description and thumbnail — free.
- Preferences and Scoring — free.
- Location and courts — cannot reduce capacity below the confirmed players.
- Date and time — free; on a recurring event, asks the scope. Notification:
- Date and location changes notify the confirmed players automatically. Every other change is silent, and communicating it is the purpose of Send blast (UX-MEVT-18).

## UX-MEVT-10

**Location:** Manage Event — Manage players

**Problem:** The confirmed and invited lists sit inside the management screen, mixed with the event settings, and the only action available on a player is "Remover". There is no tab structure, no count, and no way to act on an invited player.

**Suggestion:** Manage players is a full screen, reached from the "Manage players" row on the detail screen and from the Confirmed donut in Manage Event. Header:

- Back button and title "Manage players".
- A top-right action that depends on the event (UX-MEVT-13): "+ Add manually" on a public group event, "+ Invite" on a private one. Tabs:
- Confirmed — labelled with the ratio of confirmed players to the total capacity, for example "Confirmed 8/16".
- Invited — labelled with the total of invited players who have not confirmed. Confirmed tab:
- Player rows with photo and name.
- Swiping a row reveals "Remove".
- Removing opens a confirmation sheet asking whether to remove the player from the confirmed list or from the event.
- On a public group event the player has open access, so there is no invited state to fall back to — only removal from the event applies. On a private event both options are offered. Invited tab:
- Player rows with photo and name.
- Swiping a row reveals "Mark as confirmed" and "Remove".
- "Mark as confirmed" moves the player to the Confirmed tab and shows a feedback message. On a team event it first asks which team (UX-MEVT-14).
- "Remove" takes the player out of the event. Ranking rule:
- Removing a player does not invalidate the event for the group ranking. The event still counts; the removed player simply scores nothing in it. This applies to both tabs. Header and back button per UX-GLOB-01. Bottom sheet per UX-GLOB-02. Empty state per UX-GLOB-03. Avatars per UX-GLOB-04.

## UX-MEVT-11

**Location:** Manage Event — Add players manually

**Problem:** Adding a player is a loose "Nome" field with an "Adicionar jogador" button sitting in the middle of the management screen, with no explanation of what that player is and no handling of mixed events.

**Suggestion:** "Add manually" opens a bottom sheet titled "Add manually", reachable from the Manage players header and from inside the Invite screen. Classic and Team events:

- A single Name field. Mixed events:
- Name field plus a gender selector, since the rotation depends on it. Both:
- A note stating the player will be created and confirmed for this event only.
- It should only be used for someone who has no access to the app and will not have it before the event.
- Primary "Save", which adds the player straight to the Confirmed tab. Rules:
- Available in any event, not only group events. It is how someone outside the group takes part, since invitations never reach beyond it (UX-MEVT-13).
- A guest does not invalidate the event ranking. The event counts normally for everyone else.
- The guest appears in the event leaderboard with their real position, exactly like any other player — they played, so they place.
- What they do not receive is group points. When the event feeds a group ranking, the guest is skipped, since there is no account to credit.
- A guest exists for this event only and cannot be reused in another one. Bottom sheet per UX-GLOB-02.

## UX-MEVT-12

**Location:** Manage Event — Waiting list

**Problem:** There is no waiting list in the management screen, so a full event has no overflow handling and the organizer has no view of who is queued.

**Suggestion:** Once the event is full, a Waiting list tab appears in Manage players, between Confirmed and Invited, labelled with its total.

- Players are listed in confirmation order — the first to join the waiting list is the first in the list.
- Player rows with photo and name.
- The only action available to the organizer is "Remove". The organizer cannot mark a waiting-list player as confirmed. Rule:
- When a spot opens because someone left or was removed, every player on the waiting list is notified. The first to confirm takes the spot; the others stay queued. There is no per-player deadline and no automatic promotion, as defined in the event rules block of section 11. Empty state per UX-GLOB-03. Avatars per UX-GLOB-04.

## UX-MEVT-13

**Location:** Manage Event — Invite players

**Problem:** There is no invite path from the management screen, so the organizer cannot bring anyone into the event after creating it.

**Suggestion:** Whether the invite action exists, and what it searches, depends on the event. When the action is available:

- Public group event — no invite action. Every member of the group is invited automatically at creation, so there is nobody left to invite. The header shows "+ Add manually" only.
- Private group event — "+ Invite" is available, listing the members of the group who have not been invited yet.
- Event without a group — always private, and "+ Invite" is the only way anyone enters it. Scope of the search:
- Group event — the search covers the group only. Nobody outside it can be invited, whatever the event privacy.
- Event without a group — the search covers the platform. Results are grouped under headings: My connections first, the people the organizer follows, then everyone else matching the name typed.
- Someone outside the group takes part only as a guest, added manually (UX-MEVT-11). Structure:
- Search input at the top.
- "Add manually" action below it, opening the sheet from UX-MEVT-11.
- Result rows with photo, name and a selection control.
- Primary "Send invite" fixed at the bottom.
- When the search returns nothing, show the standard empty state — icon, title, description — with "Add manually" as its CTA. Header and back button per UX-GLOB-01. Empty state per UX-GLOB-03. Avatars per UX-GLOB-04. Search input per UX-GLOB-05.

## UX-MEVT-14

**Location:** Manage Event — Manage players (team event)

**Problem:** A team event is managed with the same flat player list as any other event, so there is no way to see the pairs, build them, or handle players who joined without a partner.

**Suggestion:** On a team event, Manage players opens with two tabs: Teams and Players. Teams tab — structure:

- A line at the top instructing the organizer to drag and drop or tap to add players to teams.
- Below it, one block per team, labelled Team 1, Team 2, Team 3, each holding two slots side by side.
- A filled slot is a card with the player photo and name, a switch icon and a remove ( ✕ ) in its top-right corner.
- An empty slot is a dashed outline with a "+" in the centre, opening the player selection screen (UX-MEVT-15).
- At the bottom of the tab, an unassigned area holding the confirmed players who are not in a team yet, as a horizontal row of cards with photo and name. Teams tab — building a team:
- A card can be dragged from the unassigned area onto an empty slot.
- The "+" on an empty slot opens the selection screen instead. Both paths produce the same result.
- The same player has two representations: the card with photo and name in the Teams tab, and a compact avatar with a remove ( ✕ ) on the selection screen. Players tab:
- The same tabs as any other event — Confirmed, Waiting list, Invited — plus an Interested tab specific to team events.
- Interested holds every player who wants to play but has no pair yet: those who invited nobody, and those who sent invitations still waiting for an answer.
- Swiping a row exposes "Remove" and "Confirm".
- Removing an interested player sends them back to Invited.
- Confirming opens a sheet asking which team to add them to, listing only the teams with an open slot. Choosing one confirms the player and places them in that slot.
- An interested player can also be placed straight from the Teams tab, by drag and drop or through the "+", which confirms them the same way. Rules:
- Spots are counted per player, as in any other event. A confirmed pair fills two; a player marked as interested fills none.
- Only confirmed pairs hold spots, so a pair that confirms simply takes the next available ones — nothing is taken from an interested player.
- A team event also has a waiting list, filled once every spot is taken.
- A player who confirms without a partner and invites someone stays pending until that person accepts; both are confirmed together. Bottom sheet per UX-GLOB-02. Empty state per UX-GLOB-03. Avatars per UX-GLOB-04.

## UX-MEVT-15

**Location:** Manage Event — Select, switch and remove player (team event)

**Problem:** There is no way to fill a team slot, swap two players between teams, or take a player out of a team.

**Suggestion:** Three flows, all reached from the Teams tab. Select player — from the "+" on an empty slot:

- A sheet titled with the team and its occupancy, for example "Team 2" with "2/2" on the right, and the line "Select players to set the team" below it.
- Search input, an "Add manually" action, then the players already picked shown as compact avatars with a remove ( ✕ ).
- Below that, the list of available players with photo, name and a selection control.
- Selecting a player who is not confirmed opens a "Confirm player" sheet stating that they are not confirmed for the event and that adding them to a team confirms them automatically, with primary "Confirm" and secondary "Cancel".
- Primary "Confirm", secondary "Cancel". Switch player — from the switch icon on a filled slot:
- Sheet titled "Switch player" showing the selected player at the top.
- Below it, the list of players available to switch with: those already in other teams, plus invited and waiting-list players.
- Choosing someone from another team swaps the two positions.
- Choosing someone from the invited list puts them into the team as confirmed, and sends the player who left back to Invited.
- Primary "Confirm", secondary "Cancel". Remove player — from the remove ( ✕ ) on a filled slot:
- Sheet titled "Remove player" asking where to remove them from: "Remove from team" or "Remove from event".
- "Remove from team" sends the player back to Invited, freeing the slot.
- Primary "Confirm", secondary "Cancel". Bottom sheet per UX-GLOB-02. Avatars per UX-GLOB-04. Search input per UX-GLOB-05.

## UX-MEVT-16

**Location:** Manage Event — Payment list

**Problem:** Payment is handled inside the confirmed player list, with a "Não pago" label and a "Marcar todos como pagos" action mixed into the same rows used to manage attendance. Controlling who is coming and controlling who has paid are two different jobs sharing one list.

**Suggestion:** The Payment list is a screen of its own, reached from the Paid donut in Manage Event and from the chip row on the detail screen. Header:

- Back button, title "Payment list", and the number of players on the right. Content:
- A Total card at the top with the amount collected against the amount expected, and a progress bar.
- Filter tabs: All, Paid, Pending.
- Player rows with photo, name and a payment status control on the right, toggled by the organizer.
- A "Mark all as paid" action fixed at the bottom. Rules:
- The screen and the Paid donut are hidden entirely when the event has no entrance fee.
- When the fee changes, the list recalculates. A player who had already paid keeps that amount credited and owes only the difference, and the organizer marks them as paid again once it is settled.
- Guests appear in the list like anyone else — they take a spot, so they owe the fee. Header and back button per UX-GLOB-01. Avatars per UX-GLOB-04.

## UX-MEVT-17

**Location:** Manage Event — Activity Problem: "Registo de atividade" is a row at the bottom of the management screen with no defined destination, and there is no definition of what it records.

**Suggestion:** A full screen, not a sheet, since the volume of entries is high.

- Back button and title "Activity".
- A chronological log, most recent first. Each entry shows who did it, what they did, and when. Players:
- Confirmed attendance, left the event, was removed by the organizer, joined the waiting list, took a spot released from it, was added manually as a guest. Invitations:
- Invitation sent, accepted, declined. On team events: partner invitation sent, accepted, declined. Payments:
- Marked as paid, reverted to unpaid, entrance fee changed. Configuration:
- Name or description edited, preferences changed, scoring changed, location or courts changed, date or time changed, recurrence turned on or off. The event itself:
- Event started, score entered, score edited by the organizer, match marked as not played, event finished, results published, ranking inclusion changed. Header and back button per UX-GLOB-01. Empty state per UX-GLOB-03. Avatars per UX-GLOB-04.

## UX-MEVT-18

**Location:** Manage Event — Send blast

**Problem:** There is no way for the organizer to message the event players. Any change other than date and location happens silently.

**Suggestion:** "Send blast" opens a full screen whose content depends on whether the community premium subscription is active. Without the subscription:

- A single Templates grid of ready-made blasts, each with a preview image and a "Select" action.
- The selected template is pre-set and only lightly editable.
- No "Your blasts" tab, and no option to save what was sent. With the subscription:
- Two tabs: Templates and Your blasts, the latter holding the blasts the organizer has saved, reusable and editable.
- Selecting a template opens "Customize your blast" with full editing: image, Title, Description.
- A "Save blast" checkbox fixed at the bottom of the sheet. When ticked, the blast is stored under Your blasts already filled in, ready to be reused. Both cases:
- Send to — a dropdown scoping the recipients: all members, confirmed only, invited only, or the waiting list.
- Channels — Email and WhatsApp checkboxes.
- Primary "Send".
- On success, a confirmation state with an illustration, "Blast sent!" and an "OK" action. MVP:
- During the MVP the subscription is granted on request, with no payment step, so any organizer who wants the full version can enable it and reach these features immediately (UX-GLOB-10). Header and back button per UX-GLOB-01. Bottom sheet per UX-GLOB-02.

## UX-MEVT-19

**Location:** Manage Event — Export attendance & revenue

**Problem:** "Exportar presenças (CSV)" is a row with no defined behaviour and no delivery options.

**Suggestion:** "Export attendance & revenue data" opens a bottom sheet titled "Export" with two options: Download CSV and Send CSV to my email. Primary "Confirm", secondary "Cancel".

- Available at any time, before or after the event. Organizers often want the data outside the app while the event is still being arranged, so there is no reason to withhold it. Bottom sheet per UX-GLOB-02.

## UX-MEVT-20

**Location:** Manage Event — Duplicate event

**Problem:** "Duplicar evento" is a row with no defined behaviour, so it is unclear what carries over and what can still be changed. Suggestion: Bottom sheet titled "Duplicate event", close ( ✕ ) in the top-right corner, split into what is inherited and what can be set. Summary — read-only, at the top:
- The group the event belongs to, the format, the modality, the scoring, the preferences and the fee.
- A duplicate stays in the same group as the original. None of this can be changed here — an organizer who needs different settings creates a new event instead of duplicating. Editable, below the summary:
- Name field.
- Thumbnail selector.
- Date scroller.
- Time tabs with their preset times.
- Location and courts, since the same event often moves to another court of the same club.
- Primary "Confirm", secondary "Cancel". Rule:
- Players, invitations, waiting list, teams and payment status do not carry over. The new event starts empty. Bottom sheet per UX-GLOB-02.

## UX-MEVT-21

**Location:** Manage Event — Cancel event

**Problem:** "Cancelar evento" is a destructive full-width red button sitting in the middle of the management screen, with no confirmation and no handling of a recurring series.

**Suggestion:** "Cancel" sits in the footer of Manage Event, next to Duplicate, and always opens a confirmation sheet.

- Single event — sheet titled "Cancel Event", explaining that the event will be cancelled and every player notified. Primary "Confirm", secondary "Cancel".
- Recurring event — sheet titled "Cancel Recurrent Event", asking what to cancel with two options: "Only this event" and "This and upcoming events". Primary "Confirm", secondary "Cancel". Payments:
- When players have already paid, the confirmation sheet states that refunds are handled directly between the organizer and the players. The platform does not process refunds; it only makes the organizer aware before confirming. Bottom sheet per UX-GLOB-02.

## UX-MEVT-22

**Location:** Manage Event — Recurring event

**Problem:** A recurring event is managed exactly like a single one. There is no view of the upcoming occurrences, no way to tell which ones have already been sent out, and no way to open or act on one.

**Suggestion:** On a recurring event, Manage Event adds a "Next occurrences" section between the Activity card and the action buttons.

- Each occurrence is a card with the date, the day and time, the location, a status label and a chevron.
- Upcoming — an occurrence already generated by the recurrence but whose invitations have not been sent yet.
- Scheduled — an occurrence whose invitations have already gone out, according to the timing chosen at creation: 1 week, 5 days or 3 days before. Opening an occurrence:
- Tapping a card opens the standard event screen with that occurrence data — name, date, time, location, description and the read-only widgets.
- Nothing tied to participation is shown: no players card, no confirmations, no teams, no matches. The occurrence has not been opened to anyone yet.
- The settings icon is in the header, but it does not open the dashboard. It opens a bottom sheet with three actions: – Edit date & time — opens the sheet from UX-MEVT-08 scoped to this occurrence only, without the "Repeat every week" card, since the occurrence already belongs to a recurring series. Nothing else about the event can be changed from here. – Send invitation now — opens a confirmation sheet stating the invitation will go out ahead of the scheduled timing. Once confirmed, the occurrence moves from Upcoming to Scheduled. – Cancel this occurrence — opens a confirmation sheet making clear that only this occurrence is cancelled and the series continues. Editing scope:
- Saving a change to date, location or preferences from the main event asks whether it applies to this occurrence only or to this and upcoming occurrences — the same pattern as cancelling. Ending the recurrence:
- Turning "Repeat every week" off in UX-MEVT-08 opens a confirmation sheet before the future occurrences are deleted. Header per UX-GLOB-01. Bottom sheet per UX-GLOB-02. Card orientation per UX-GLOB-09.

## UX-MEVT-23

**Location:** Manage Event — Start event Problem: "Iniciar evento" is permanently disabled on the detail screen with the line "Todas as 20 vagas têm de estar confirmadas antes de iniciar". An event that did not fill can never be started, there is no way to start early, and nothing distinguishes a line-up that simply is not full from one that cannot produce a valid rotation.

**Suggestion:** Starting the event has two entry points, depending on the time. Before the scheduled time:

- "Start event" sits with the other actions at the bottom of Manage Event, so the organizer can start ahead of schedule. From the scheduled time onwards:
- "Start event" also appears as the primary action on the event detail screen, so the organizer does not have to open Manage Event to start it. What blocks the start:
- Fewer than 4 confirmed players — there is no match to play.
- An odd number of confirmed players, when "Allow stand by players" is off — pairs cannot be formed. With stand by players enabled the odd number is allowed, since someone always rests.
- A mixed event with an uneven number of men and women, because every pair is one of each (UX-LIVE-20). Playing short is fine; playing unbalanced is not. Four courts hold eight men and eight women: six and six is allowed, six and five is not.
- A team event with an incomplete team — a player without a partner cannot take the court.
- In each case the action opens a blocking alert naming what is wrong and pointing to Manage players, with no option to start anyway. What warns but does not block:
- Fewer confirmed players than the capacity. The sheet states how many spots are still open, with two actions: add more players, which opens Manage players, or start anyway.
- A number of players that leaves a court idle — eight players across three courts uses two and leaves one empty. That is the organizer call, not an error. Bottom sheet per UX-GLOB-02.

## UX-MEVT-24

**Location:** Manage Event — Pending actions

**Problem:** Nothing tells the organizer what is still missing before the event can run. Incomplete teams, missing players or an undefined location are only discovered by opening each screen.

**Suggestion:** A collapsible card pinned to the bottom of the event detail screen, titled with the number of pending actions.
- Collapsed by default, expanding on tap.

- Each pending action is a row with its description and a chevron, opening the screen that resolves it. Situations that generate a pending action:
- Teams not fully set up — opens the Teams tab.
- Spots still open — opens Manage players.
- Payments outstanding — opens the Payment list. Only on events with an entrance fee.
- Location not defined — opens Edit Location & Courts.
- Courts not reserved — opens Edit Location & Courts, for events where the organizer chose "Have not reserved yet" at creation.
- A resolved action disappears from the list on its own, and the card disappears entirely once nothing is pending.
- Visible to the organizer only.

## UX-MEVT-25

**Location:** Manage Event — Manage players (mixed event)

**Problem:** A mixed event requires an equal number of men and women, since every pair is one of each, but Manage players treats every confirmed player the same way. The organizer has no view of the balance and nothing stops the event from filling with an uneven split, which makes the rotation impossible to generate.

**Suggestion:** Spots are counted per player, as in every other event. What a mixed event adds is the split, not a different unit. Confirmed tab:

- Two tabs inside it, Women and Men, each labelled with its own ratio of confirmed players to the spots available on that side — for example "Women 10/12" and "Men 12/12".
- The overall ratio stays in the Confirmed tab label, so the organizer sees the total and the split at once. Capacity rule:
- Every pair is one man and one woman, so half the spots belong to each side. Two courts hold eight players: four men and four women.
- The cap applies to confirmations and to manual additions alike. A side that is full stops accepting players even while the event still has open spots overall.
- A player whose side is full goes to the waiting list, which is also split and drawn from independently: a spot opening on one side only notifies the players queued for that side.
- "Add manually" already asks for gender on a mixed event (UX-MEVT-11), and the guest counts towards their side.
- Extra spots from "Allow stand by players" follow the same rule and are added in pairs, one per side.
- The event can run below capacity, as long as both sides are equal (UX-MEVT-23). Empty state per UX-GLOB-03. Avatars per UX-GLOB-04.

## UX-MEVT-26

**Location:** Manage Event — Capacity display (team event)

**Problem:** A team event shows a plain count of confirmed players with no indication of how those players are paired, so the organizer cannot tell how many teams are complete or where the open slots are.

**Suggestion:** Spots are counted per player, as in every other event. What a team event adds is the pairing, shown alongside the count.

- The Confirmed card in Manage Event shows the confirmed players against the total capacity, with the number of complete teams as a subtitle.
- The Teams tab header states what is still available in plain terms — how many slots are open, and how many of them sit in teams that are already half-formed.
- A confirmed pair fills two spots; a player marked as interested fills none (UX-MEVT-14).
- Team is a modality of its own, so the gender split of UX-MEVT-25 does not apply. A pair may be formed by any two players (UX-LIVE-20). Empty state per UX-GLOB-03.

## UX-MEVT-27

**Location:** Manage Event — Ranking (team event)

**Problem:** A team event is ranked with the same individual standings table as any other event, but the pair stays together for the whole event, so an individual table does not describe what happened in it.

**Suggestion:** Separate the event standings from the group ranking. Event standings:

- The classification table lists teams, not players. Each row shows both players of the pair together and the team result, since the pair plays the entire event as one (UX-LIVE-13). Group ranking:
- When the event counts towards a group ranking, each player receives the points individually. Both players of a pair receive the same score, and it goes into the individual group ranking.
- The pair exists only within the event; it never appears in the group ranking.
- The match cards themselves are identical across every modality. A card always shows two players per side — what changes between classic, mixed and team is the rule that formed the pair, not how it is displayed. Avatars per UX-GLOB-04.
