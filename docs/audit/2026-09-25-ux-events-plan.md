# UX Audit — Create & Join Events: implementation plan

## Context

`UX-Audit-Create-Join-Events.docx.pdf` (section 11 of the external audit) — 25 items, **UX-CEVT-01..11** and
**UX-JEVT-01..14**, plus a fixed "Event rules" block. Fifth in the series after Global, Community, Profile &
Settings and Groups. Main is at `5c98ed9`. Cross-references to UX-MEVT-* and UX-LIVE-* point at a later
section (manage / live event) that is not in hand; only the behaviour they are cited for is honoured here.

As before, **the Problems predate earlier merges; trust the Suggestions.** Already false today:

- The wizard already has a ‹ back icon (absent on step 1) and a ✕ close icon (UX-GLOB-01). There is no
  "Fechar" and no "Voltar" button.
- The roster schema already has the pair model (`event_teams`), the `interested` state, `partner_requests`,
  `choose_partner` (confirms both, no acceptance — JM-10) and per-player capacity (a pair claims two spots
  under a lock; interested players hold none). The UI just never calls `choose_partner`.
- The 6 h confirm cut-off, 12 h leave cut-off, organizer override and the unlimited waiting list are enforced.
- `players_submit_results` (UX-LIVE-08) and immutable format/modality (UX-LIVE-20) exist.

`Requirements/create-event.md` and `Requirements/join-manage-event.md` disagree with the audit in places.
The audit wins; both docs are amended in the last PR.

## Decisions (product owner, 2026-09-25 — do not re-litigate)

1. **A partner who stays loses the spot.** When a confirmed player leaves a team event, the partner goes back
   to Invited holding no spot (JM-16, and the audit's own rule that only confirmed pairs hold spots), and
   receives a new `partner_left` notification. The event screen shows the team entry state with Join.
   The audit's "keeping their spot" phrase is overridden.
2. **Chat only; phones stop leaking.** No "Call" action after the leave deadline (UX-JEVT-05) — the sheet
   shows the organizer card with "Chat". Separately, `profiles.phone` stops being readable by every signed-in
   user (today the whole profile row is selectable).
3. **Venues get a super-admin tool.** The curated venue registry (UX-CEVT-06) is managed from a new web
   super-admin area: venues, their courts and images. The `super_admin` role exists only as an enum value in
   0002; it gets a real check (`is_super_admin()`), write policies and an image bucket.
4. **Waiting list first.** Broadcast (audit): when a spot frees, every waiter is notified at once and the
   first to claim it wins; nobody is auto-confirmed. While anyone is waiting, a newcomer's Join puts them at
   the end of the list rather than into the freed spot.

Defaults taken (object at plan review):

5. **Public group events send no invitations** (audit; amends EV-20). Members get an `event_created`
   notification and see **Join**. Invitations exist only for private events. Existing pending invitations on
   public events are deleted by the migration (their holders see Join instead of Accept/Decline).
6. **Interested players stay interested when the event fills** (audit; amends JM-17). Once they pair up and
   the event is full, the pair goes onto the waiting list together and claims two spots.
7. **Guest players** (no account): name, plus gender on mixed events, confirmed for that event only, no
   history, no ranking, not reusable. Added by the organizer in the wizard (UX-CEVT-11, amends Step 10's
   name+email+phone invitation) and **by a player as their partner** (UX-JEVT-10, extends JM-28).
8. **Mixed capacity is split per gender** and enforced server-side: a mixed event with 16 spots takes
   8 men and 8 women; the join/claim/pair RPCs refuse `gender_full`. Profiles with no gender are asked for it
   before joining a mixed event (they cannot be balanced otherwise — `start_event` already refuses them).
9. **Wizard values follow the audit**: progress bar with %, dynamic step count, tap-to-advance on single-choice
   steps; Points 8/11/16/21/24/32/40 + Custom (1–99), default 32; Time slider 1–90, default 10; duration
   60/90/120 + Custom (15–480), default 60. Where the audit is silent, Requirements win: courts 1–20,
   stand-by spots 1–20 default 4.
10. **Recurrence runs on its own.** `invite_lead_days` is stored but nothing uses it; a `pg_cron` job
    materialises the next occurrence `invite_lead_days` before it (the hosted project needs the `pg_cron`
    extension enabled — one dashboard toggle). Recurrence stays group-only and plan-capped.
11. **Add to calendar** uses `expo-calendar`'s native event editor (new native dependency → needs a new build;
    E2E runs a Release build, so no extra cost). Web downloads an `.ics`.
12. **Share** uses the native share sheet with an `expo-linking` URL (the `groupShare` pattern), not the
    custom sheet in Requirements §3.10.
13. **No-access** (UX-JEVT-07) closes with ✕ to Home (amends JM-22's "Try again"). A deleted event and a private
    one are indistinguishable to RLS, so both land here.
14. **Player list's Invited tab** is visible to anyone who can see the event, through a read-only RPC
    (the `event_invitations` read policy stays organizer + invitee).
15. **Preset thumbnails** stay blocked on artwork, as in Groups: CEVT-10 ships the shared picker with
    change/remove, upload only.
16. Full web parity, mobile PR then web PR per area.

## Bugs found while mapping (fixed regardless)

| # | Bug | Where | PR |
|---|-----|-------|----|
| B1 | `choose_partner` never checks the partner: any uuid, a non-invitee of a private event, a blocked user, or someone already paired can be confirmed; duplicate teams possible | 0047:103 | 1 |
| B2 | No 6 h / `scheduled` check on `accept_event_invitation`, `choose_partner`, `request_partner`, `accept_partner_request` | 0081:136, 0047, 0051 | 1 |
| B3 | `accept_partner_request` declines the *requester's* other requests, not the accepter's incoming ones; doesn't check the requester is still interested/unpaired | 0047:180 | 1 |
| B4 | `leave_event` leaves the leaver's sent partner requests pending → a later accept re-confirms someone who left (JM-15) | 0093:61 | 1 |
| B5 | Target can PATCH `partner_requests.status` directly, skipping the RPC side effects; requester cannot withdraw | 0044:106 | 1 |
| B6 | Partner-request candidates are unfiltered group members — blocked users appear as "—" and can be requested | mobile `partner-requests.tsx` | 1, M5 |
| B7 | A group member who joined after a public team event was created cannot enter it at all (`use_team_join` / `forbidden`) | 0047, 0051 | 2 |
| B8 | `join_event` gives a freed spot to a newcomer while people are waiting | 0047:26 | 2 |
| B9 | "Aderir com um parceiro" appears only after join+leave; accepting a team invite silently makes you `interested` and the UI shows "Going" | mobile/web detail CTA | M5, W3 |
| B10 | Leaving leaves your own invitation `accepted`, so the Invited state never comes back | 0093:61 | 2 |
| B11 | Every signed-in user can read every user's phone | profiles policy 0055:49 + table grant 0030 | 5 |
| B12 | A manual invitee with a name only violates `ei_user_or_contact` → `create_event` fails | 0041:32, `InvitePicker` | 3 |
| B13 | `events.thumbnail_path` is uploaded but rendered nowhere | mobile/web `EventCard`, detail | M4, W2 |
| B14 | Wizard from Home/FAB (no `communityId`) lists no groups at all; from a community it lists every group, not those you may create in | `Step1Group.tsx:19` | M1 |
| B15 | `invite_lead_days` stored, never used — recurring events never materialise on their own | 0079/0086 | 7 (0117) |
| B16 | Scoring defaults 24 pts / 15 min break EV-04 (32 / 10) | `Step4Scoring.tsx:28` | M1 |
| B17 | Organizer who only organizes is invisible on the event page (organizer is read from participants) | detail:193 | M4 |
| B18 | Web join countdown is frozen at mount | web `page.tsx:54` | W2 |

## Status (2026-09-27) — as shipped

Migrations are 0111, 0112, 0113, 0114 (0116 folded in), 0115 and 0117. Mobile shipped as M1–M5 (M4 in two
parts), web as W1–W5 (the web split differs from the plan's W1–W4 below).

| Step | What | PR | State |
|------|------|----|-------|
| 0 | Audit transcription + this plan | #206 | merged |
| 0111 | Roster integrity (B1–B6) | #207 | merged |
| 0112 | Join rules — waitlist broadcast, no invites on public events, mixed capacity, waiting pairs, `partner_left`, `my_events` Pending/past, `event_invited_players` (D1, D4–D6, D8, D14; B7, B8, B10) | #213 | merged |
| 0113 | Guests + manual court names; manual email/phone invitee removed (D7, B12) | #215 | merged |
| 0114 | Venue registry + super-admin (`platform_admins`, `is_super_admin()`, `venue-images`, soft delete) — **0116 folded in**; ships with the web super-admin venues screens | #212 | merged |
| 0115 | Phone privacy — column grants on `profiles` exclude `phone` (D2, B11) | #209 | merged |
| 0117 | Recurrence scheduler — hourly `pg_cron` `materialize-due-occurrences`, Lisbon wall-clock anchoring, duplicate is a one-off (D10, B15) | #217 | merged |
| 0118 | Browser-pass fixes — withdrawn partner request removes its unread notification, no duplicate `partner_request`; Join shows the waiting-list state while others wait; team leave copy | #229 | merged |
| M1 | Mobile wizard shell + steps 1–4 (UX-CEVT-01..05, B14, B16) | #208 | merged |
| M2 | Mobile steps 5–8 — location, courts, date (UX-CEVT-06..08) | #218 | merged |
| M3 | Mobile steps 9–10 — preferences, details, invite + guests (UX-CEVT-09..11) | #221 | merged |
| M4a | Mobile event page, ⋯ actions, invited/join/leave (UX-JEVT-01..07 part 1, B13, B17) | #210 | merged |
| M4b | Mobile events tabs, past toggle, player list, waiting-list claim (UX-JEVT-01/04/08 part 2) | #216 | merged |
| M5 | Mobile team events (UX-JEVT-09..14, B6, B9) | #220 | merged |
| W1 | Web wizard shell + steps 1–4 (UX-CEVT-01..05) | #211 | merged |
| W2 | Web event page, ⋯ actions, invited/join/leave (UX-JEVT-01..07 part 1, B18) | #214 | merged |
| W3a | Web events tabs, player list, waiting-list claim | #225 | merged |
| W3b | Web team events | #226 | merged |
| W4 | Web wizard steps 5–8 | #227 | merged |
| W5 | Web wizard steps 9–10 | #228 | merged |
| 8 | Requirements amended (`create-event.md` v1.3, `join-manage-event.md` v1.4) + this status and hand-off | #223 | merged |

**Decisions taken during implementation** (documented in the Requirements):

- Team events hide the wizard's "Add manually" — a guest joins a team event only as a player's partner.
- Web shows the plan's recurring-event cap through the `UpgradePrompt` dialog.
- "You are in" is a dialog on web and a full card screen on mobile.
- An organizer whose partner left sees "Join as a player" (both apps).

The original sequence below is kept as planned; the table above is authoritative for what shipped.

## PR sequence

Migrations are 0111–0115 and 0117 (0116 was folded into 0114). Every PR touching `apps/mobile/**`, `packages/**` or `infra/**` queues the ~37-min
self-hosted E2E and they serialise; web-only PRs skip E2E. Mobile PRs open as drafts until green locally. Each
PR: `check` (all eight) green + `test:db` for migrations + E2E green → squash-merge → next. Hosted migrations
are pasted by the product owner (the account cannot push) — handed over as one batch at the end.

**0 — docs.** This plan + the audit transcription.

**1 — migration 0111 "roster integrity"** (+ `packages/api`, SQL tests): B1–B6.
- `choose_partner`: partner must be eligible (invitee, or member of the public group), not blocked either way,
  not already confirmed/paired/waiting as a pair; 6 h + `scheduled`.
- `_assert_can_confirm(event)` helper (6 h + scheduled) used by every self-join path.
- `accept_partner_request` declines the accepter's other incoming requests for the event (silently) and
  checks the requester is still interested.
- `leave_event` cancels the leaver's sent requests; drop the UPDATE policy on `partner_requests`; new
  `withdraw_partner_request`.
- Partner-candidate RPC `event_partner_candidates(event)` filtered for blocks.

**2 — migration 0112 "join rules"** (+ api): decisions 4, 5, 6, 8; B7, B8, B10.
- `notify_waitlist_spot` notifies every waiter; `claim_waitlist_spot` stays first-come; newcomers queue while
  anyone waits; pairs claim two spots from the list.
- No invitations for public group events (`create_event`, `materialize_occurrence`) + delete existing
  pending ones; `event_created` notification to group members.
- Public team events: any group member may enter the team flow without an invitation.
- Mixed per-gender capacity in join/claim/pair RPCs (`gender_full`, `gender_required`).
- `partner_left` notification from `leave_event`; leaving resets your invitation to pending on private events.
- `my_events(p_filter 'all'|'organizing'|'going'|'pending', p_include_past)`; Going includes waiting/interested.
- `event_invited_players(event)` read-only RPC.

**3 — migration 0113 "guests"** (+ api): decision 7, B12, CEVT-06 court names (#215).
- `create_event` accepts `guests: [{name, gender}]` → confirmed guest participants
  (`guest_gender_required` on mixed, `event_full` / `gender_full` at creation).
- `choose_guest_partner(event, name, gender)`; a guest never outlives the player who brought them.
- `events.manual_court_names text[]`; `create_event` stores it; drop the manual-invitee email/phone path
  (B12). `create_event` / `update_event` refuse a soft-deleted venue (`venue_not_found`).

**4 — migration 0114 "venues + super-admin"** (+ api): CEVT-06/07, decision 3 (#212).
- `venues.image_path`; `search_venues(q)` returns image, address, court count, empty query lists all
  (paged, alphabetical).
- `is_super_admin()` from a `platform_admins` table (seeded by SQL); insert/update/delete policies on
  `venues`/`courts`; `venue-images` bucket; venues are soft-deleted.

**5 — migration 0115 "phone privacy"** (+ api, mobile/web reads): decision 2, B11.
- Column-level grants on `profiles` exclude `phone`; own phone read from the auth user. Every
  `profiles select('*')` in `packages/api` is replaced by an explicit column list first (a revoked column makes
  `*` fail).

**6 — (no migration 0116)**: the super-admin work moved into 0114 above.

**7 — migration 0117 "recurrence scheduler"**: decision 10, B15. `pg_cron` hourly job calling a
`materialize_due_occurrences()` that reuses `materialize_occurrence`. `materialize_occurrence` and
`duplicate_event` also copy `events.manual_court_names` (added by 0113).

**M1 — mobile wizard shell + steps 1–4** (UX-CEVT-01..05, B14, B16). `ProgressBar` primitive (Storybook +
suite 00); dynamic `steps` in `CreateEventContext` (Courts skipped for manual venue, Invite skipped for public
group events); tap-to-advance cards; Group step from `my_groups` filtered by `may_create_event` +
"Event without group" sheet; format chip; expanding scoring cards + Custom sheet + slider. Suite 05 updated.

**M2 — mobile steps 5–8** (UX-CEVT-06..08): venue registry list + manual venue form (courts, court names,
"this event only" banner) + "No location"; courts by venue with checkboxes; date scroller with month labels,
period tabs, duration presets, recurrence card, fixed summary.

**M3 — mobile steps 9–10** (UX-CEVT-09..11): preference cards; thumbnail picker with remove; invite step with
platform search, "+ Add manually" guest sheet, "I will invite later".

**M4 — mobile events list + detail** (UX-JEVT-01..08, B13, B17): Pending tab + past toggle, placeholder
thumbnails, no "Em breve", no search; detail rebuilt (image, identity, players card, badges, Courts/Scoring/Fee
widgets, organizer card, maps location); ⋯ sheet (Share, Add to calendar, Leave) + `expo-calendar`;
invited bottom area with inviter; "You are in" screen; countdown only within 24 h of the cut-off; full /
waiting list / claim / closed states; leave confirmation + after-deadline organizer sheet (Chat); no-access
screen; read-only Player list with tabs and guest tag.

**M5 — mobile team events** (UX-JEVT-09..14, B6, B9): Team Event sheet; I have a partner (+ guest); I need a
partner (invite many / let others invite me); Partner requests grouped by event with accept sheet;
interested banner + Edit response sheet; partner-left state.

**W1–W3 — web parity** for M1–M3, M4, M5 (web wizard gets the same chrome and dynamic steps).
**W4 — web super-admin venues** (list, create/edit venue with courts and image).

**8 — docs.** Amend `Requirements/create-event.md` and `join-manage-event.md` to the decisions above
(EV-04, EV-20, EV-26, Steps 4/6/8/10, JM-01, JM-03, JM-08, JM-17, JM-22, JM-28, §3.10), and hand over the
hosted paste list 0111–0115 + 0117 + `pg_cron` toggle. **Done** — see the status table and the hosted hand-off.

## Hosted hand-off

The account cannot `db push`; the product owner pastes each file into the dashboard SQL editor, in this order,
and records each one in `supabase_migrations.schema_migrations` after it succeeds.

1. **0111** `0111_event_roster_integrity.sql`.
2. **0112** `0112_event_join_rules.sql`. **First** run its pre-paste count (how many pending public-event
   invitations it deletes and converts to `event_created`):
   ```sql
   select count(*) from event_invitations i join events e on e.id = i.event_id
   where i.status = 'pending' and i.invitee_id is not null
     and e.group_id is not null and e.is_private = false and e.status = 'scheduled' and e.deleted_at is null
     and exists (select 1 from group_members gm where gm.group_id = e.group_id and gm.user_id = i.invitee_id);
   ```
3. **0113** `0113_event_guests.sql`.
4. **0114** `0114_venue_registry_super_admin.sql` (0116 is folded in; there is no 0116 file). Then add the
   first platform admin:
   ```sql
   insert into platform_admins (user_id) select id from profiles where email = '<admin email>' on conflict do nothing;
   ```
5. **0115** `0115_profiles_phone_privacy.sql` — **only after a TestFlight build containing #209 is live.**
   Older builds `select` `profiles.phone` (and `select('*')`), which fails once the column is revoked.
6. **0117** `0117_recurrence_scheduler.sql` — **enable `pg_cron` first** (Dashboard → Database → Extensions →
   `pg_cron`). Then verify:
   ```sql
   select jobname, schedule from cron.job where jobname = 'materialize-due-occurrences';
   ```
   If 0117 was pasted before `pg_cron` was on, it only printed a NOTICE: enable the extension and re-run the
   file's final `cron.schedule` block. **After 0117, verify the cron job** with the query above (one row,
   schedule `5 * * * *`); optionally run `select public.materialize_due_occurrences();` once.
7. **0118** `0118_partner_request_notification_withdraw.sql` — after 0117. Redefines `request_partner` and the
   partner-request notification trigger function from 0113; ends with a self-check.

Record each after it succeeds:
```sql
insert into supabase_migrations.schema_migrations (version, name)
values ('0111', 'event_roster_integrity') on conflict do nothing;  -- repeat per file
```

**New native module:** `expo-calendar` (Add to calendar) needs a new EAS build — an OTA update cannot ship
it. Cut the build before (or together with) the 0115 gate above.

## Open items

- **Web browser pass** — #227 and #228 were walked in a browser (the #228 walk found and fixed web event-thumbnail
  uploads being refused by storage RLS — `upsert: true` without a select policy — which had failed silently on main
  and on hosted); #214, #225 and #226 were walked on 2026-09-27 — no blocking bugs; its four findings shipped in #229
  (0118). Not exercisable locally: opening the organizer chat (local Stream token), the native share sheet.
- **`profiles.email` exposure** — 0115 hides `phone` only; `email` is still readable by other signed-in users.
  Follow-up offered to the product owner.
- **Client UPDATE on `phone` / `email`** — the column grants still let a client update those columns on its own
  row directly, outside the auth flows. Follow-up offered to the product owner.

## Out of scope / follow-ups

- Preset thumbnail artwork (product owner).
- UX-MEVT / UX-LIVE sections themselves (organizer manage + live screens) — next audit document.
- Organizer "mark interested confirmed" should require a pair (§4.4b) — belongs to UX-MEVT.
