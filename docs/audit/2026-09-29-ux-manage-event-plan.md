# UX Audit — Manage Event: implementation plan

## Context

`UX-Audit-Manage-Event.docx.pdf` (section 12 of the external audit) — 27 items, **UX-MEVT-01..27**,
transcribed in [2026-09-29-ux-manage-event.md](2026-09-29-ux-manage-event.md). Sixth in the series after Global,
Community, Profile & Settings, Groups and Create & Join Events. Main is at `25aa75e3`. Cross-references to
UX-LIVE-* point at the live-event section, which is not in hand; only the behaviour they are cited for is honoured.

As before, **the Problems predate earlier merges; trust the Suggestions.** Already true today:

- `update_event` never changes format, modality or group; it refuses `courts_below_roster` and
  `standby_below_roster`; only a date or location change notifies confirmed players (`event_updated`); every
  edit is logged (`event_edited`).
- Organizer roster RPCs exist: `organizer_remove_participant` (to invited / from event),
  `organizer_mark_confirmed`, `add_manual_participant` (guest), `mark_paid`, `mark_all_paid`, and the team
  RPCs `organizer_assign_to_team`, `organizer_remove_from_team`, `organizer_switch_players`.
- Activity log (`event_activity`), blasts (`blast_templates`, `event_blasts`, `send_event_blast`, `send-blast`),
  CSV (`event_roster_csv`, `send-roster-csv`), `duplicate_event`, `cancel_event(only_this|this_and_upcoming)`,
  `invite_to_event` (no UI calls it), mixed per-gender caps, waiting-list broadcast.
- Mobile has a pending-actions sheet and a team builder in Manage; web has neither on the detail/manage pages
  (web's team builder sits on the live page).

What is missing is mostly structure: a settings entry point, the dashboard, one sheet per setting, and dedicated
Manage players / Invite / Payment list screens — plus the rule changes below. `Requirements/join-manage-event.md`
and `in-progress-event.md` disagree with the audit in places. The audit wins; both are amended in the last PR.

## Decisions (product owner, 2026-09-29 — do not re-litigate)

1. **Start event follows the audit** (amends IP-03). `start_event` blocks only on: fewer than 4 confirmed
   players; an odd count with stand-by off; a mixed event with men ≠ women; a team event with an incomplete
   team. Below capacity and an idle court are **warnings** (sheet: "Add more players" / "Start anyway"). The
   organizer can start any time from Manage Event; the detail screen shows "Start event" as the primary action
   only from the scheduled time.
2. **The organizer cannot confirm a waiting-list player** (amends JM-27). The Waiting list tab has Remove only;
   `organizer_mark_confirmed` refuses `waiting_list`.
3. **Public group events: removal is "from the event" only** — no "back to invited" option. Private events
   offer both.
4. **Duplicate follows the audit** (amends JM-39, IP-33). Inherited read-only: group, format, modality, scoring,
   preferences, fee. Editable: name, thumbnail, date, time, **location and courts**. **Nothing carries over** —
   no players, invitations, waiting list, teams or payment status.
5. **Next occurrences**: Manage Event on a recurring event lists the **next 4** occurrences, computed from the
   series. Upcoming = not materialised yet; Scheduled = materialised (invitations out). A per-date exception row
   stores an edited date/time or a cancellation of a not-yet-materialised occurrence; "Send invitation now"
   materialises it early. (Amends §4.6's "only the next occurrence exists".)
6. **Blasts**: "premium" is the community `custom_broadcasts` feature (Basic and above). A group-less event uses
   the organizer's **account** plan (Jammer+ = full). Blasts become available on group-less events. Send to:
   all / confirmed / invited / waiting list (amends "All members only"). **WhatsApp opens the organizer's
   WhatsApp with the text prefilled** (share intent / `wa.me`); no WhatsApp Business API.
7. **Guests in team slots**: Manage's team "Select player" sheet offers "Add manually"; a guest placed in a slot
   is confirmed in that team (reverses the events audit's "team events hide Add manually" — that stays true for
   the wizard only).

Defaults taken (presented at plan review, not objected to):

8. **Organizer is always eligible** (MEVT-02): `join_event` and the team flow skip the private/guest-list check
   for the organizer; `_materialize_next` and `duplicate_event` seat an `organizing_and_playing` organizer;
   switching `organizer_role` in edit is removed — the role is set at creation, then Join/Leave as a player.
9. **Fee credit** (MEVT-05/16): `event_participants.paid_amount numeric(10,2)`. "Paid" = `paid_amount >= fee`.
   Raising the fee turns earlier payers Pending for the difference; Mark as paid tops them up to the fee.
10. **Guests and group points** (MEVT-11): guests keep their real placement in the event leaderboard; group
    results skip them, and account holders keep their real placement (today's behaviour).
11. **Team standings** (MEVT-27): the event leaderboard of a team event lists teams; each player of a pair gets
    the pair's placement points in the group ranking.
12. **"My connections"** (MEVT-13) = mutual follows. Invite search on a group-less event: connections, then
    people I follow, then everyone else; on a group event, group members not yet invited/participating only.
13. **"Courts not reserved"** is persisted (`events.courts_reserved boolean`, false when the wizard's "Have not
    reserved yet" is chosen) and drives a pending action; saving Location & Courts with courts picked sets it.
14. **Private → public** on a group event deletes pending invitations and sends `event_created` to the group;
    group-less events are always private (toggle hidden).
15. **Activity log is written server-side** for every action in MEVT-17; `log_event_activity` (client-called,
    forgeable) is dropped.
16. **Export** is available on every status, including completed. **Completed** dashboard reduces to Paid,
    ranking toggle, Activity, Duplicate (IP-30/31 already say this).
17. Full web parity, mobile PR then web PR per area. Web uses its dialog/sheet primitives where mobile uses
    bottom sheets; web edit gets rebuilt on the wizard step components (as mobile edit already is).

## Bugs found while mapping (fixed regardless)

| # | Bug | Where | PR |
|---|-----|-------|----|
| B1 | Organizers can UPDATE/DELETE `events` directly (RLS + table grant never revoked) — changes modality, group, status, `counts_for_ranking`, `deleted_at`, skipping every guard; same for `event_series` (skips the recurring cap) | 0044:46-49,60-64; 0040:71 | 0121 |
| B2 | `organizer_remove_participant`, `add_manual_participant`, the three team RPCs have no event-status check — mid-event removal cascades `match_players` and corrupts standings | 0112:790, 0081:261-367 | 0121 |
| B3 | `organizer_switch_players` accepts participants from another event | 0081:367 | 0121 |
| B4 | `add_manual_participant` ignores capacity, gender halves, lock, name length | 0081:261 | 0121 |
| B5 | `mark_all_paid` marks waiting / interested / invited rows too | 0081:302 | 0121 |
| B6 | `finish_event` has no status check — a scheduled or cancelled event can publish results | 0093:192 | 0121 |
| B7 | `start_event` takes `event:` not the roster lock — a join can race the start | 0092:5 | 0121 |
| B8 | `duplicate_event` defaults `starts_at` to `now()` (already past the join cut-off); copies declined invitations | 0117:275 | 0122 |
| B9 | `_materialize_next` / `duplicate_event` never seat an organizer who plays; on a private occurrence the organizer then cannot join (`not_invited`) | 0117:95, 0112:298 | 0121 |
| B10 | `send_event_blast` never checks `custom_broadcasts` — any tier sends custom text | 0076:61 | 0124 |
| B11 | `joined` / `left` activity rows are client-written and forgeable; cancel/start/finish/claims never logged | 0071:142 | 0122 |
| B12 | Removed players are not notified; `organizer_mark_confirmed` doesn't notify, set stand-by, or renumber the waiting list; confirming an invitee without a participant row is impossible | 0112:790, 0081:208 | 0122 |
| B13 | Growing courts doesn't offer the new spots to the waiting list | 0113:268 | 0122 |
| B14 | Mobile activity screen: hard-coded English relative times, no organizer guard | `app/event/[id]/activity.tsx:44` | M4 |
| B15 | Web manual guest always shows gender incl. "other"; web blast button shown on group-less events (server refuses) | `AddManualForm.tsx`, manage page | W2 |

## PR sequence

Migrations are serial (0121 →). Every PR touching `apps/mobile/**`, `packages/**` or `infra/**` queues the
~37-min self-hosted E2E; web-only PRs skip it. After each migration PR merges, apply it to the local stack under
`pnpm e2e:hold` before the next E2E run (E2E never applies branch migrations). Merge gate: `check` green,
`db-tests` for migrations, E2E green → squash-merge. Hosted migrations are handed over as one paste batch.

**0 — docs.** Transcription + this plan.

**0121 — manage integrity** (B1–B7, B9, D8): revoke UPDATE/DELETE on `events`, `event_series` from
`authenticated` (all app writes go through RPCs); status + roster-lock guards on every organizer roster RPC;
switch_players event check; `add_manual_participant` capacity/gender/lock/name; `mark_all_paid` confirmed only;
`finish_event` requires `in_progress`; `start_event` takes the roster lock; organizer eligibility in `join_event`
and the team flow; seat the playing organizer on materialise/duplicate.

**0122 — manage rules** (D1–D4, D7, D9, D12–D15, B8, B11–B13):
- `start_event` new blocking rules + `start_event_check(event)` returning blockers and warnings for the UI.
- `organizer_mark_confirmed` refuses waiting-list, confirms an invitee (creates the row, accepts the
  invitation), sets stand-by past capacity, renumbers, notifies (`organizer_confirmed`); removal notifies
  (`removed_from_event`) and refuses `to_invited` on public group events.
- `paid_amount`, fee-change recalculation, `mark_paid` tops up.
- `duplicate_event(p_event_id, p_overrides)` accepts name, thumbnail, starts_at (required), location/courts;
  copies no invitations.
- `invite_to_event` scoped (group members only / platform) + `event_invite_candidates(event, q)` with
  connections / following / others sections; blocks excluded.
- `organizer_add_guest_to_team(event, team, slot, name, gender)`.
- `events.courts_reserved`; private→public conversion; growing courts calls `notify_waitlist_spot`.
- Server-side activity for every MEVT-17 entry; drop `log_event_activity`.

**0123 — recurrence occurrences** (D5, MEVT-08/21/22): `event_series_exceptions(series_id, slot_date,
starts_at_override, cancelled)`; `event_next_occurrences(event, n)`; `update_occurrence_slot`,
`cancel_occurrence_slot`, `send_occurrence_now`; `update_event(..., p_scope 'only_this'|'this_and_upcoming')`
updating the series weekday/time and the template for future occurrences; `set_event_recurrence(event, on)`
(off deletes future unmaterialised slots; on respects the plan cap).

**0124 — blasts** (D6, B10): `send_to` all / confirmed / invited (incl. pending invitees) / waiting_list;
group-less events allowed, gated by the organizer's account plan; `custom_broadcasts` enforced server-side;
`saved_blasts` table + RPCs for "Your blasts"; WhatsApp entries recorded as `shared` (sent from the device).

**0125 — team standings** (D11, MEVT-27): `standings()` returns team rows for team events; group results give
both players the pair's placement.

**M1 — mobile detail header + Manage Event dashboard + edit sheets** (MEVT-01..09, 19–21): settings icon, ⋯
for an organizer who plays, status line with Join as a player, Manage players row, chip row; Donut primitive
(Storybook + suite 00); dashboard cards; General Info / Preferences / Scoring / Location & Courts / Date & Time
sheets reusing wizard steps; Export, Duplicate, Cancel sheets; old `edit.tsx` removed.

**M2 — mobile Manage players + Invite + Add manually** (MEVT-10..13, 25): Confirmed / Waiting list / Invited
tabs with swipe actions, remove sheet, mixed Women/Men sub-tabs, Invite screen with sections, Add manually sheet.

**M3 — mobile team management** (MEVT-14, 15, 26): Teams / Players tabs, slots, drag-and-drop + "+",
unassigned row, Interested tab, Select / Switch / Remove player sheets, capacity copy.

**M4 — mobile Payment list, Activity, Send blast** (MEVT-16..18, B14).

**M5 — mobile start flow, pending actions, next occurrences, team standings** (MEVT-22..24, 27).

**W1–W5 — web parity** for M1–M5 (B15 in W2).

**Final — docs.** Amend `Requirements/join-manage-event.md` (JM-23..27, JM-33, JM-34, JM-39, JM-41..45, §4.6)
and `in-progress-event.md` (IP-03, IP-19, IP-33) to the decisions; status table + hosted paste list 0121→0125.

## Status

| Step | What | PR | State |
|------|------|----|-------|
| 0 | Transcription + plan | — | open |

## Out of scope / follow-ups

- UX-LIVE-* (live event screens) — next audit document.
- WhatsApp Business API delivery (D6 uses the device share intent).
- `set_community_plan` / `set_account_plan` are self-service (UX-GLOB-10 by design during the MVP); a paid-tier
  gate and not overwriting a Stripe/RevenueCat row with `manual` are needed before billing launches.
