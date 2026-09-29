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

Found during implementation (fixed in the PR named):

| # | Bug | Where | PR |
|---|-----|-------|----|
| B16 | The round engine ignored modality: team pairs were split from round 1 and rotated (client Americano, `start_event` round 1, `generate_next_round`); mixed events never enforced man + woman sides; Up & Down never rotated round-1 resters back in and wrote no `round_rest` after round 1 | `round-gen`, 0092/0122 engine | #240 (0126) |
| B17 | Mexicano `generate_next_round` seated `courts*4` and silently dropped the n % 4 leftover players with no `round_rest` row | 0122 predecessor | #236 (0122) |
| B18 | Direct PostgREST writes to `event_invitations` (organizer / respond policies) bypassed every invite rule — revoked, no client writes the table | 0044 policies | #236 (0122) |
| B19 | `organizer_assign_to_team` overwrote a slot's occupant (left confirmed with no team); `organizer_remove_participant` left the teammate confirmed in a half-empty team | 0121/0122 bodies | #245 (0127) |
| B20 | A pending invitation with no roster row could not be withdrawn at all once 0122 revoked direct writes | — | #245 (0127, `organizer_revoke_invitation`) |
| B21 | `event_result_summary` joined team rows to participants (would drop every team row); `fill_group_result_win_loss` recorded 0/0 for team rows | 0075, 0109 | #239 (0125) |
| B22 | A WhatsApp-only blast counted `notifications_whatsapp` opt-ins nobody was ever messaged; an organizer who plays was emailed their own blast | 0076 | #237 (0124) |
| B23 | `updateEventSchema` rejected PostgREST's `+00:00` timestamps, so a full-payload save failed (caught by E2E suite 06) | `packages/api` schemas | #241 |

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
and `in-progress-event.md` (IP-03, IP-19, IP-33) to the decisions; status table + hosted paste list 0121→0127.
**Done** — see the status table and the hosted hand-off.

## Status (2026-09-30) — as shipped

Migrations are 0121–0127: the five planned (0121–0125) plus **0126** (engine pairs, B16) and **0127** (revoke
invitation / switch with invitee / assign-to-team fixes, shipped with M3). Mobile shipped as M1–M5, web as W1–W5.

| Step | What | PR | State |
|------|------|----|-------|
| 0 | Transcription + this plan | #234 | merged |
| 0121 | Manage integrity — direct `events` / `event_series` writes revoked, roster guard + lock, switch/remove event check, guest rules, `mark_all_paid` confirmed only, `finish_event` in progress only, start takes the roster lock, organizer eligible + seated (B1–B7, B9, D8) | #235 | merged |
| 0122 | Manage rules — start blockers/warnings + `start_event_check`, confirm/remove rules + notifications, `paid_amount`, duplicate overrides, scoped invites + `event_invite_candidates`, `event_invitations` writes revoked, guests in team slots, `courts_reserved`, private→public, waitlist on growth, server-side activity (D1–D4, D7, D9, D12–D15; B8, B11–B13, B17, B18) | #236 | merged |
| 0123 | Recurrence occurrences — `event_series_exceptions`, `grid_anchor` + `slot_at`, next occurrences, per-slot edit / cancel / send now, `update_event(p_scope)`, `set_event_recurrence` (D5) | #238 | merged |
| 0124 | Blasts — group-less, `can_customize_event_blast` enforced, `send_to` scopes, WhatsApp `shared`, `saved_blasts` (D6, B10, B22) | #237 | merged |
| 0125 | Team standings — `standings()` team rows, both partners get the pair's placement (D10, D11, B21) | #239 | merged |
| 0126 | Engine pairs — team pairs fixed, mixed M+F sides, Up & Down rest rotation, `event_engine_roster` (B16) | #240 | merged |
| M1 | Mobile event header, dashboard, edit sheets, Donut, Export / Duplicate / Cancel sheets (UX-MEVT-01, 03–09, 19–21, B23) | #241 | merged |
| M2 | Mobile Manage players, Invite, Add manually (UX-MEVT-10–13, 25) | #242 | merged |
| M3 + 0127 | Mobile team management (UX-MEVT-14, 15, 26); **0127** `organizer_revoke_invitation`, `organizer_switch_with_invitee`, assign-to-team `slot_taken` / bound / `event_full`, remove reconciles the team (B19, B20) | #245 | merged |
| M4 | Mobile Payment list, Activity, Send blast (UX-MEVT-16–18, B14) | #247 | open |
| M5 | Mobile start flow, pending actions, next occurrences, edit scope, team leaderboard (UX-MEVT-21–24, 27) | #248 | open |
| W1 | Web event header, dashboard, edit dialogs (UX-MEVT-01, 03–09, 19–21) | #243 | merged |
| W2 | Web Manage players, Invite, Add manually (UX-MEVT-10–13, 25, B15) | #244 | merged |
| W3 | Web team management (UX-MEVT-14, 15, 26) | #246 | merged |
| W4 | Web Payment list, Activity, Send blast (UX-MEVT-16–18) | #249 | merged |
| W5 | Web start flow, pending actions, next occurrences, edit scope, team leaderboard (UX-MEVT-21–24, 27) | #250 | open |
| Final | Requirements amended (`join-manage-event.md` v1.5, `in-progress-event.md` v1.2), this status + hand-off, legacy SQL tests fixed | this PR | open |

The PR sequence above is kept as planned; this table is authoritative for what shipped.

**Decisions taken during implementation** (recorded in the Requirements where they change behaviour):

- *Server (0121–0127)*
  - Payments stay editable after the games (scheduled, in progress, completed); only a cancelled event refuses them.
  - The organizer is always eligible but still follows the 6 h cut-off, capacity, the mixed halves and the
    waiting list. `organizer_mark_confirmed` lost its capacity override (MEVT-25).
  - Start blockers are reported in the order not_enough_players → mixed → teams_incomplete → odd_players;
    `below_capacity` counts against the full capacity including stand-by; `idle_courts` = courts − floor(n / 4).
  - Declined invitations count as "already invited" (skipped by `invite_to_event`, not offered as candidates).
  - Finishing is publishing, so a finish logs `event_finished` and `results_published`.
  - `has_paid` stays a stored column maintained by the payment RPCs and `update_event` (a generated column
    cannot read the event's fee).
  - Recurrence: an explicit `grid_anchor` plus `slot_at` replace 0117's "a week after the latest occurrence";
    the next-occurrences list shows slots *after* the current one; turning Repeat on starts a **new** series,
    off deactivates (never deletes) the old one; a this-and-upcoming date change resets later only-this times;
    an override inside the invite lead is left to the hourly sweep ("Send invitation now" is the immediate path).
  - Blasts: `sent_to_count` means email recipients (`audience_count` is the scope size); the sender is never in
    the audience; community saved blasts are shared by the community's organizers; deleting a saved blast needs
    no customisation (so a downgraded owner can clean up); `list_saved_blasts` raises rather than returns empty.
  - Team standings: the `standings()` contract is extended (7 columns appended), identities only go to viewers
    who can see the event, a split pair still gets a defined result, and completed team events are **not**
    backfilled.
  - Engine: team Americano with more teams than courts packs the full round-robin (more than T − 1 rounds);
    mixed Americano runs M rounds; Up & Down re-entry is the middle court, ceil(courts / 2); full ties break by
    join order, then id; bad pairings reuse `invalid_rounds`.
  - A player placed alone in a team stays `invited` until the team has two players.
- *Apps*
  - Every edit sheet sends the whole event (`update_event` replaces every column); errors show inside the sheet.
  - Manage players' header action is the "+" glyph (44 pt TopBar slot), labelled Invite / Add manually.
  - Nothing is swipe-only on mobile (the tap sheet holds every action); web uses a ⋯ menu instead of swipes,
    Radix dialogs instead of bottom sheets, and HTML5 drag and drop plus an "Assign to team…" menu.
  - The edit scope question is a second step of the same sheet / dialog; an Upcoming occurrence opens a
    read-only preview route (`event/[id]/occurrence?slot=`).
  - WhatsApp: mobile opens `wa.me` with the server's `share_text` (share sheet fallback); web opens the tab
    inside the click so pop-up blockers allow it, with an "Open WhatsApp" link as fallback.
  - The web live page's `TeamSetup` is gone — teams are built in Manage players on both apps.
  - `manageRoster.ts` / `teamBoard.ts` / `paymentList.ts` / `activityLine.ts` are web-local copies of the
    mobile modules (their unit tests live on mobile).

## Hosted hand-off

The account cannot `db push`; the product owner pastes each file into the dashboard SQL editor **in this
order** and records each one in `supabase_migrations.schema_migrations` after it succeeds. Hosted is current
through 0120.

**The one gate: 0126 ships with a new app build.** An older app that starts a Team or Mixed **Americano**
sends a free-rotation schedule, which 0126 refuses (`invalid_rounds`); the new app calls `event_engine_roster`,
which exists only after 0126. So paste 0121–0125 and 0127 first, cut one TestFlight build containing #240 and
**M1–M5 (#241, #242, #245, #247, #248)**, and paste 0126 as soon as that build is live (ideally when no
team or mixed Americano is about to start). Also note that after 0122 the old build's Duplicate button fails
(`starts_at_required` — it sent no start), which is one more reason not to leave a gap.

1. **0121** `0121_manage_integrity.sql` — one transaction, ends with a self-check (raises `0121: …` if a grant,
   policy or function body is wrong). Probe: `select has_table_privilege('authenticated', 'events', 'UPDATE');` → `false`.
2. **0122** `0122_manage_rules.sql` — one transaction, self-check (`log_event_activity` dropped, grants,
   `event_invitations` not client-writable, new columns, activity triggers). Probe:
   `select exists (select 1 from pg_proc where proname = 'start_event_check') as has_0122;`
   **Then redeploy `send-push`** (copy for the new `organizer_confirmed` / `removed_from_event` types; until
   then those pushes read "You have a new notification").
3. **0123** `0123_recurrence_occurrences.sql` — one transaction, self-check (two-argument `update_event` gone,
   grants, `event_series_exceptions` not client-writable, `events_series_slot_uniq` on the nominal slot,
   `trg_events_series_anchor`, grid helpers). `pg_cron` is already on (0117); the hourly
   `materialize-due-occurrences` job is unchanged and now honours exceptions.
4. **0124** `0124_blasts.sql` — **not** wrapped in a transaction and has no self-check: paste the whole file
   and check it finished. Probe:
   `select exists (select 1 from pg_proc where proname = 'can_customize_event_blast') and to_regclass('public.saved_blasts') is not null as has_0124;`
   **Then redeploy `send-blast`** (attempt numbering is per email channel; WhatsApp-only blasts return
   `{ ok, sent: 0 }`). The audit seed (`pnpm seed:audit`) writes `send_to: 'all'` — run it only after 0124.
5. **0125** `0125_team_standings.sql` — one transaction, self-check (grants on `standings`,
   `_event_player_results` not client-callable). Probe (from its header):
   ```sql
   select exists (select 1 from information_schema.routines r
                  join information_schema.parameters p on p.specific_name = r.specific_name
                  where r.routine_name = 'standings' and p.parameter_name = 'team_number') as has_0125;
   ```
   Optional: re-run `set_event_ranking(event, true)` on completed ranked team events to move their group
   results to the pair's placement (no backfill).
6. **0127** `0127_organizer_revoke_invitation.sql` — one transaction, self-check. Independent of 0126 (stacked on
   0121/0122), so it goes before it. Probe:
   `select exists (select 1 from pg_proc where proname = 'organizer_revoke_invitation') as has_0127;`
7. **0126** `0126_engine_pairs.sql` — **only once the build above is live.** One transaction. Probe (from its
   header): `select exists (select 1 from pg_proc where proname = 'event_engine_roster') as has_0126;`

Record each after it succeeds:
```sql
insert into supabase_migrations.schema_migrations (version, name)
values ('0121', 'manage_integrity') on conflict do nothing;  -- repeat per file (0122 manage_rules,
-- 0123 recurrence_occurrences, 0124 blasts, 0125 team_standings, 0126 engine_pairs,
-- 0127 organizer_revoke_invitation)
```
Then run `pnpm schema:check` against hosted as usual.

**Web** follows the same rule: W1–W5 need 0121–0125 and 0127, and since #240 the web live page (and W5's
start flow) calls `event_engine_roster` for a Team / Mixed Americano, so deploy web from main together with the
0126 paste.

## Open items

- **Dark-mode primary button** — `--button-primary-bg` equals `--background`, so a primary button on the page
  background has no visible fill (flagged by several agents; W4 put its sticky footers on `bg-card` as a local
  workaround). A design-system call on top of #232's accepted contrast — **proposal:** give dark mode its own
  primary fill token in the DS, one PR for both apps.
- **Blast emails untested end to end** — the local edge runtime has no email provider (`email_not_configured`),
  so delivery was only seen failing and retrying. **Proposal:** after the `send-blast` redeploy, send one blast
  to a test account on hosted.
- **Custom blast images** — templates have no artwork (`image_path` NULL), there is no bucket for blast images and
  `send-blast` renders none; the apps show a placeholder. Blocked on artwork, like the preset thumbnails.
- **Team drag and drop has no E2E** (idb cannot touch-and-hold then move); the "+" path is covered.
- **Completed ranked team events are not backfilled** by 0125 — re-run `set_event_ranking` per event (step 5).
- **`create_event` invitees are not scoped** like `invite_to_event` (any live user on a group event).
  **Proposal:** apply the same members-only / blocks rule in `create_event` in the next migration.
- **Web has no unit test runner** — its copies of the mobile rule modules are untested on the web side.
- **`pnpm i18n:check` only scans mobile** — web keys were checked with one-off scripts in each W PR.
  **Proposal:** extend the check to `apps/web` so a missing web key fails CI.
- Smaller: web pt-PT uses "tu" while mobile M3's pt-PT copy uses the formal register; Interested rows don't show
  "partner invitation pending"; the web has no geocoder, so a moved event keeps its stored map point; M4 leaves
  dead `activityTeam*` keys; the web locked-blast path (no customisation) was only reviewed, not walked.

## Out of scope / follow-ups

- UX-LIVE-* (live event screens) — next audit document.
- WhatsApp Business API delivery (D6 uses the device share intent).
- `set_community_plan` / `set_account_plan` are self-service (UX-GLOB-10 by design during the MVP); a paid-tier
  gate and not overwriting a Stripe/RevenueCat row with `manual` are needed before billing launches.
