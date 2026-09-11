# Audit Content: product gaps and the hosted seed

**Date:** 2026-09-11
**Source:** "Padel Jam — Content for Audit" (external document, 5 pages)
**Scope:** four product features the document assumes and the product lacks, plus a re-runnable seed that puts every fixture in the document into the hosted Supabase project (`wispuppglipffcsqowlq`) so an auditor can walk every flow on a real build.

## Problem

The audit document lists the data that has to exist for every screen to be auditable: two login accounts, sixteen supporting users, ten notification types, four chats, five groups, four communities and nine events covering every format, modality, scoring mode and status. Nothing in the repo produces that. The two existing seeds (`infra/seed/seed-demo.mjs`, `infra/seed/seed-e2e.mjs`) are local-only by design, wipe the database first, and cover a different cast.

Mapping the document against the schema also showed that several requested states cannot exist because the product does not implement them. The user decided to build those first, then seed.

## Decisions

| Question | Decision |
|---|---|
| Target environment | Hosted project. The seed is additive, purgeable and refuses to run on hosted without an explicit flag. |
| Missing product features | Build first, then seed. Four features (sections 1 to 4). |
| G5 (join request on a private group) | Not built. `Requirements/groups.md` lines 13 and 108 rule out request-to-join at group level. G5 becomes a private group that invited A1, unanswered. |
| N3 "someone confirmed attendance" | Organizer-side: the organizer is notified when a player becomes confirmed in their event. |
| Sign-in codes on hosted | Phone numbers with fixed test codes registered in the Supabase dashboard. Email sign-in stays a real-mailbox path. |
| Seed implementation | New TypeScript module under `infra/seed/audit/`, one file per domain, `--target local\|hosted`, `--purge`. Not an extension of `seed-e2e.mjs`. |
| Chat seeding | Per-user Stream tokens from the existing `stream-token` edge function and the `stream-chat` SDK. No Stream secret in the seed. |
| Outbound mail | Never. Blasts are inserted as rows, not dispatched; supporting users have email notifications off. |

## Items the document asks for that stay out of scope

These are recorded in the auditor hand-over (section 6) rather than built:

- Gender-aware pairing inside rounds (`Requirements/create-event.md` line 54). Only the start block is built.
- A `level` field and a private-profile flag on profiles. Neither exists. "Position" maps to `court_side`.
- Tie handling in the group ranking. `packages/api/src/groups/queries.ts` ranks by a plain sort, so equal totals show as consecutive ranks. The seed creates the tie; the display is the auditor's finding.
- Fixed codes for email OTP on hosted. GoTrue test codes exist for phone only.
- `num_courts = 0`. The schema requires at least one court. E4's "no courts" means no library courts assigned.

---

## 1. Archive guard (C2)

**Requirement.** `Requirements/communities.md` line 11: the general group "cannot be archived while it is the community's only group". `archive_group` in `infra/supabase/migrations/0036_group_rpcs.sql` line 111 has no such check.

**Migration.** Redefine `archive_group(p_group_id uuid)`:

- After the admin check, if `groups.is_general` is true for the target and no other row in the same community has `archived_at is null`, raise `general_group_only_group` with errcode `P0001`.
- `archive_community` is unchanged. It archives the community and all groups together, which the requirement allows.

**Client.**

- `packages/api/src/client.ts`: add `general_group_only_group` to `KNOWN`.
- Mobile `apps/mobile/app/group/[id]/manage/seasons.tsx`: add the code to `ARCHIVE_ERROR_KEYS` so the existing alert shows it.
- Web `apps/web/src/app/(app)/app/group/[id]/manage/page.tsx`: same mapping in its archive handler.
- One string in `en`, `pt-PT`, `pt-BR` in `apps/mobile/lib/i18n-mobile.ts` and `apps/web/src/lib/i18n-web.ts`: "The general group cannot be archived while it is the only group."

**Verification.** On the local stack: archive the general group of a one-group community and expect the code; add a second group and expect success. `mapPgError` unit test for the new code.

---

## 2. Mixed start block (E5)

**Requirement.** `Requirements/create-event.md` line 54: mixed events pair one man with one woman, which is impossible with unequal counts. `start_event` (`0048_match_engine_rpcs.sql` line 90) checks capacity only.

**Migration.** Redefine `start_event`. When `specification = 'mixed'`, before the `setup_incomplete` check:

- Count confirmed participants by gender: `profiles.gender` for rows with `user_id`, `guest_gender` for guests.
- If any confirmed participant has no gender, raise `mixed_gender_missing`.
- If men and women differ, raise `mixed_unbalanced`.

The mixed check runs first so a 4-men, 3-women event on two courts reports the gender problem rather than the capacity one. The rest of the function is copied verbatim from the current definition in `0048`.

**Client.**

- `packages/api/src/events/queries.ts` line 16: the participant embed adds `gender` so the screen can count.
- `apps/mobile/app/event/[id]/index.tsx`: for the organizer of a scheduled mixed event, compute men, women and unknown from the roster. When unbalanced or unknown, render a banner "Mixed events need equal numbers: N men, M women" above the Start button and disable Start. The two RPC codes are added to `KNOWN` and translated as the fallback path.
- Strings in three locales on mobile. Web has no start screen for mixed today, so only the error mapping is added there.

**Verification.** Local RPC test: 4 men and 3 women on two courts raises `mixed_unbalanced`; 2 and 2 on one court starts; a guest without gender raises `mixed_gender_missing`.

---

## 3. Notifications N3, N4, N7 and waiting-list promotion

**Requirements.** JM-08 (`Requirements/join-manage-event.md` line 1009): when a spot frees, the first waiting-list player is notified and must confirm manually; no auto-confirmation. N3 and N7 are audit-document asks with no requirement text; the user chose the organizer-side reading for N3.

**Existing shape.** `notifications.type` is a text column with a check constraint, last extended in `0080_update_event_location.sql` lines 6 to 8. Emitters insert `(user_id, type, actor_id, event_id, actor_name, entity_name)` and skip blocked pairs through `notif_blocked` (`0061_notifications.sql` line 55). The mobile list translates `t(item.type, {actor, entity})` and shows a Join CTA for the types in `CTA_TYPES` (`apps/mobile/app/notifications/index.tsx` line 19), completing it through `useCompleteNotificationCta` (`packages/api/src/notifications/mutations.ts` line 59). Web mirrors this in `apps/web/src/components/notifications/NotificationItem.tsx`. Push copy lives in `infra/supabase/functions/send-push/index.ts` `render()`.

### 3.1 Schema

One migration:

- Replace the `notifications_type_check` constraint with the current list plus `participant_confirmed`, `waitlist_spot`, `results_published`.
- Trigger `trg_notify_on_participant_confirmed` on `event_participants`, after insert or update of `status`, when the new status is `confirmed` and the old one was not. Inserts `participant_confirmed` for the event's organizer with the player as actor and the event name as entity. Skipped when the player is the organizer, when `user_id` is null (guests are added by the organizer), or when `notif_blocked`. Also skipped when the organizer performed the confirmation themselves (`auth.uid()` equals the organizer), so only player-initiated confirmations notify; service-role writes carry no JWT and still notify, which the seed relies on.
- Helper `notify_waitlist_spot(p_event_id uuid, p_actor uuid)`: finds the participant with `status = 'waiting_list'` and the lowest `waiting_list_position`; inserts `waitlist_spot` for them with `ref_id` = their participant id, unless an unread, not-done `waitlist_spot` already exists for that user and event. Actor and entity as usual.
- `leave_event` and `organizer_remove_participant` (current definitions: `0047` line 50 and `0081_activity_logging.sql` line 226) capture the removed row's status before deletion and call the helper when it was `confirmed`. Bodies otherwise unchanged.
- `finish_event` (`0048` line 394) inserts `results_published` for every confirmed participant with a `user_id`, after the status update, with the organizer as actor. An organizer who played (`organizing_and_playing`) holds a participant row and is included; an organizer who did not play is not. Blocked pairs skipped. This is what lets E1, which A1 organized and played, produce N7 for A1.
- New RPC `claim_waitlist_spot(p_event_id uuid) returns text`:
  - caller must hold a `waiting_list` row, else `not_on_waiting_list`;
  - same join cutoff as `join_event` (`event_closed` inside six hours), and the same team refusal (`use_team_join`), since team events pair through partner requests;
  - under the event roster advisory lock, if confirmed count is below `event_capacity`, set the row to `confirmed`, `is_standby = confirmed_count >= num_courts * 4`, `waiting_list_position = null`, renumber the remaining waiters, and return `confirmed`;
  - otherwise raise `spot_taken`.
  - granted to `authenticated`.

### 3.2 Client

- `packages/api/src/client.ts`: add `not_on_waiting_list`, `spot_taken`.
- `useCompleteNotificationCta`: a `waitlist_spot` branch calling `claim_waitlist_spot` with `n.event_id`, then the same `cta_done` update. On `spot_taken` the row is marked read and done with the trailing text "Spot taken".
- Mobile and web `CTA_TYPES` gain `waitlist_spot`. The CTA label for that type is "Confirm spot" and the done state reads "Confirmed". Existing invitation rows keep "Join" and "Joined".
- Strings for the three types and the two CTA states in three locales on mobile and web:
  - `participant_confirmed`: "{{actor}} confirmed for {{entity}}"
  - `waitlist_spot`: "A spot opened in {{entity}}"
  - `results_published`: "Results for {{entity}} are out"
- `notificationRoute` (`packages/utils/src/notification-route.ts`) is unchanged: all three carry `event_id` and route to the event.
- `send-push` `render()`: cases for the three new types, plus `event_cancelled` and `event_updated`, which fall through to the default today.

### 3.3 Verification

Local RPC script: a confirmed player leaves an event with two waiters, the first waiter gets exactly one `waitlist_spot`; claiming it confirms them and renumbers the second; a second claim on a full event raises `spot_taken`; joining a friend's event notifies the organizer once; finishing an event notifies the players and not the organizer. Unit tests for `mapPgError` and the CTA mutation branch.

---

## 4. Pending actions sheet (E4)

**Requirement.** JM-38 and section 4.7 of `Requirements/join-manage-event.md`: on the organizer's event detail, "You have N pending actions" opens a checklist; each row links to the screen that resolves it. No implementation exists.

**Component.** `apps/mobile/components/event/PendingActionsSheet.tsx`, rendered by `apps/mobile/app/event/[id]/index.tsx` only when the viewer is the organizer and `status = 'scheduled'`. Rows are derived from data the screen already loads. An "Assign courts" row was considered and dropped: nothing after creation writes `event_courts` (`update_event` ignores `court_ids`), so the row could never be cleared.

| Row | Condition | Destination |
|---|---|---|
| Add N players | confirmed count below `num_courts * 4`; N is the difference | manage players |
| Set up N teams | `specification = 'team'` and confirmed teams below `num_courts * 2` | manage teams |
| Set a location | `has_location = false` | edit event, location step |

Collapsed: a card at the bottom of the detail reading "You have N pending actions" with a chevron. Tapping opens a modal sheet built from the same primitives as the notifications menu, listing the rows with `ListRow`. Tapping a row closes the sheet and navigates. When no row applies, nothing renders. Strings in three locales, with plural forms for the counts.

**Verification.** Component test with a scheduled event fixture that yields three rows; manual check on the simulator against the seed's E4.

---

## 5. Audit seed

### 5.1 Layout and invocation

```
infra/seed/audit/
  run.ts          CLI entry: --target local|hosted, --purge, --yes-hosted, --only <domain>
  env.ts          loads .env then .env.audit; validates keys per target
  client.ts       REST helpers (req, rpc, insert, sel, patch), admin user create, sign-in
  cast.ts         every account: ids, names, genders, phones, traits, roles
  avatars.ts      PNG generation and upload to the avatars bucket
  users.ts        auth users, profiles, user_settings, subscriptions, blocks, follows
  communities.ts  C1 to C4 plus decoys, plans, memberships, invitations, requests, posts
  groups.ts       G1 to G5, seasons, archive, invitations
  venues.ts       library venue with courts, decoy venues
  events.ts       E1 to E9, the cancelled and date-changed extras, U4's history
  chat.ts         Stream channels and messages
  notifications.ts  read/unread mix, pruning of seed side effects
  purge.ts        cast-scoped deletion in FK order
  manifest.ts     writes infra/seed/audit/out/manifest.json (git-ignored)
docs/audit/audit-handover.md   generated hand-over for the auditor
```

Run with `node infra/seed/audit/run.ts` (Node 22.18+ strips types natively; the module uses no enums or parameter properties). `package.json` gains `seed:audit`. Root `devDependencies` gain `stream-chat` for the chat module. The Americano schedule is imported from `packages/api/src/round-gen/americano.ts`.

### 5.2 Safety

- `--target local` defaults to `http://127.0.0.1:55321` and behaves like the existing seeds.
- `--target hosted` requires `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_ANON_KEY` and `EXPO_PUBLIC_STREAM_API_KEY`. The URL host must contain the project reference read from `apps/mobile/eas.json`, and `--yes-hosted` must be present. Any mismatch aborts before the first request.
- The seed refuses to start when any cast email already exists unless `--purge` is given. `--only <domains>` bypasses that refusal for incremental development runs (a duplicate then fails loudly at the first admin call).
- `--purge` prints the counts it is about to delete, then deletes only rows reachable from the cast: events organized by cast users (cascades rosters, rounds, matches, timer, blasts, results), their event series, communities owned by cast users (cascades groups, members, posts, invitations, join requests, venues), venues created by cast users, blocks, follows, partner requests, notifications, subscriptions, user settings, push tokens, reports, profiles, tenants owned by cast users, then the auth users through the admin API. It ends by asserting no profile with a cast email remains.
- No outbound mail: `event_blasts` rows are inserted directly; every supporting user has `notifications_email = false`; the seed never calls `send_event_blast` or `send-blast` on hosted. Push is inert because no cast user registers a token.

### 5.3 Cast

Password for every account: `Padel1234#`. Every account has a phone number in the `+3519100xxxxx` range so that fixed codes can be registered in the dashboard. Email is confirmed at creation.

| Id | Account | Notes |
|---|---|---|
| A1 | `user@padeljam.com`, `+351910000100` | Complete profile with avatar, court side, hand, bio, gender male. `subscriptions` row `jammer_plus`, active, provider manual. Blocks U7. Follows 14 of the 16 non-blocked named users; 13 of them follow A1, with different gaps in each direction. Member of C1 (owner), C2, G1, G2, G3, G4; pending request in C4; pending invitation to G5. |
| A2 | `newuser@padeljam.com`, `+351910000101` | Never created by the seed. Purge deletes it if present so the auditor always signs up fresh. |
| U1 ×3 | no avatar | Placeholder rendering. |
| U2 | 52-character name | Layout stress. |
| U3 | single-letter name "Q" | Layout stress. |
| U4 | full history | 20 completed ranked events in C3's group, organized by C3's owner. Not touching A1. |
| U5 | empty | No events, no follows. |
| U6 | filler | Private profiles do not exist; kept as a normal user so the count stays 16. |
| U7 | blocked by A1 | Appears only in Blocked Users. |
| U8 ×8 | fillers | Community owners for C2, C3, C4 and two decoys; organizers of E6, E7, E8 and the two extra events; women to fill mixed events. |
| Crowd ×14 | members only | Fill G1 to about 30 members. No traits, no chats. |

Eight of the sixteen named users are women. The document says sixteen accounts; the crowd is the addition forced by G1's pagination requirement and the one-community-per-owner cap (`0023_create_community_extend.sql`).

Acting users, the ones the auditor logs into for live transitions, are named in the hand-over: E6's organizer and one confirmed E6 player (spot release), one E2 player (score lock), E8's organizer (date change), and E7's partner requester.

### 5.4 Communities and groups

| Id | Owner | Privacy | Groups and state |
|---|---|---|---|
| C1 "Lisboa Padel Jam" | A1 | public | `community_subscriptions` on `community_pro`. General group; G1 public (about 30 members, second community admin who is also a G1 member, hosts E1, E9, E2, E4, E5, E8 and the two extras); G3 private (A1 sole admin, four members, hosts E3); G4 archived. Three pending `community_invitations`. |
| C2 "Padel Porto Social" | U8 | public | Only the general group, which is G2. A1 is a plain member. Hosts E6. G5 is a private group here whose owner invited A1. `create_event` requires community admin, so A1's own events (E4, E5) live in G1, not here. |
| C3 "Cascais Padel Club" | U8 | public | General group plus "Ranking Cascais" with U4's 20 events. A1 is not a member. |
| C4 "Clube Fechado de Sintra" | U8 | request_to_join | A1's join request pending. |
| Decoys "Padel Cascais", "Clube Padel Cascais" | crowd | public | Similar names for S4. One of them sends A1 a community invitation (N8). |

G1 has a crafted ranking tie: E1 and E9 both count, and after finishing, one `group_event_results` row is patched so F4 and F5 hold equal totals.

### 5.5 Events

All created in the future through `create_event` and the roster RPCs, then back-dated with a service-role patch where the document requires a past or live event, following the pattern proven in `seed-e2e.mjs`. Auto-invitations are deleted where a member must arrive without one.

| Id | Setup |
|---|---|
| E1 | Americano, classic, points, public, G1, completed 3 days ago. A1 organizing and playing, 2 courts, 8 players, no fee, library venue with two courts assigned, full Americano schedule from `americanoSchedule`, every match scored, `finish_event` counting, `post_event_result` called (N7 fires from finish). |
| E2 | Mexicano, mixed, time, public, G1, live (started 2 hours ago). A1 organizing and playing. Fee 5 € MB WAY, three of six paid. Recurring series with the next occurrence materialized as a scheduled event (materialized before the back-date, so it sits seven days after the creation time rather than on the series slot). 1 court, standby 2, six confirmed (3 men, 3 women), two on the waiting list. Manual venue. `players_submit_results = true`. Round 1 scored, round 2 generated and pending. Timer started. One `event_blasts` row inserted. |
| E3 | Up and Down, team, classic sets, private, G3, live. A1 organizing only. 1 court, two confirmed teams via `choose_partner`. `has_location = false`, `players_submit_results = false`. |
| E4 | Americano, classic, points, public, G1, scheduled in 5 days. A1 organizing only. Fee on. Zero confirmed, `has_location = false`, no venue. Yields the pending-actions rows "Add 4 players" and "Set a location". |
| E5 | Americano, mixed, points, public, G1, scheduled in 6 days. A1 organizing only, 2 courts, 4 men and 3 women confirmed. Start is blocked by section 2. |
| E6 | Americano, mixed, points, public, G2, scheduled in 4 days. Organizer U8. 1 court, `allow_standby = false`, 2 men and 2 women confirmed. A1's invitation deleted, then A1 joins to land on the waiting list at position 1; U2 at position 2. |
| E7 | Americano, team, points, private, standalone, scheduled in 7 days. Organizer U8, fee on. A1 invited by name (N1), accepted, so `interested` with no partner. Another interested player calls `request_partner` targeting A1 (N10 through the pinned row). |
| E8 | Americano, classic, points, public, G1, scheduled in 8 days. Organizer U8. A1's auto-invitation kept and unanswered (N2). |
| Extra: date-changed | Public G1 event organized by U8 with A1 confirmed, then `update_event` with a new date (N6). `update_event` notifies confirmed players only, so this cannot ride on E8, where A1 must stay invited. |
| E9 | Americano, classic, points, public, G1, completed 10 days ago. A1 organizing only. 1 court, 4 players, three rounds of one match. Round 1 scored, round 2 marked `not_played`, round 3 left pending, `finish_event` counting, so `finished_early = true`. |
| Extra: cancelled | Public G1 event organized by U8 with A1 confirmed, then `cancel_event` (N5). Both extras are created before E7 and E8 so that the newest invitation rows, which the prune keeps, are E7's (N1) and E8's (N2). |
| U4 history | 20 completed Mexicano events in C3's ranking group (server-side round 1, scored and finished counting), back-dated across the last four months. |

Coverage check against the document's table: three formats (E1, E2, E3), three scoring modes (E2 time, E3 classic, points elsewhere), three modalities as organizer (E1, E2, E3), visibility (E3, E7 private), context (E7 standalone), fee (E2, E4, E7), recurrence (E2), status (E4 to E8 scheduled, E2 and E3 live, E1 and E9 completed), fill level (E4 empty, E2 and E6 full, E5 unbalanced), roles (organizing and playing, organizing only, waiting list, interested, invited).

### 5.6 Notifications

Building the fixtures fires the real emitters, so A1 ends up with one or more of each type: N1 from E7's direct invitation, N2 from E8's group invitation, N3 from every player who confirmed in A1's events, N5 from the cancelled extra, N6 from the date-changed extra, N7 from E1 (A1 played it), N8 from G5's group invitation and the decoy community's invitation, N9 from every follower, and `follow_joined_event` from followed users joining events. N10 is the pinned partner-request row from E7, not a notification. N4 is inserted directly with the service role as a `waitlist_spot` row for E6, since the live transition is audited separately.

The seed then prunes A1's list to a readable size: it keeps at most two rows per type, newest first, and deletes the rest. Half of the remaining rows are patched with `read_at` so read and unread mix.

### 5.7 Chat

- Sign in as A1, call `ensure-channel` for G1, G2, G3 (CH1).
- For each group channel, connect as other members with tokens from `stream-token` and send messages. Connect as A1 and mark G2 read, then post more in G1 and G3 so those two carry unread counts (CH2).
- Connect as A1, create a `messaging` channel with U4, exchange three messages (CH3). Create a `messaging` channel with a crowd user and send nothing (CH4).
- On local, the chat module is skipped unless `EXPO_PUBLIC_STREAM_API_KEY` is set and the edge functions are served, and it reports the skip.

### 5.8 Home and Explore

H1 follows from the above. S1: people, groups, communities and events all return results for "Padel". S2: locations spread across Lisboa, Porto, Cascais and Sintra; event types and dates spread. S3: the hand-over names a query with no results. S4: the decoy communities and two users sharing a first name.

### 5.9 Output

`manifest.json` with every id keyed by the document's identifiers. `docs/audit/audit-handover.md` is regenerated from the manifest and a template: accounts with phones and codes, acting users per live transition, fixture ids, the dashboard prerequisites, the local-versus-hosted differences, and the out-of-scope list above.

### 5.10 Verification

The full seed runs on the local stack after `supabase db reset`, twice in a row with `--purge` between runs, and the manifest is compared against a checklist of expected states (counts and statuses read back through REST). The mobile app is then walked through the audit document's sections on the simulator against local. Only after that does the hosted run happen.

---

## 6. Deployment and hand-off

The user's Supabase account cannot link, push migrations or deploy edge functions (see the hosted deploy notes in memory). The plan therefore ends with an explicit hand-off:

1. Migrations from sections 1 to 3 (three files, `0091` onward) pasted into the dashboard SQL editor, each followed by the `schema_migrations` insert.
2. Test phone numbers and codes registered under Authentication, Phone provider, for A1, A2 and the acting users.
3. `send-push` redeployed by someone with owner rights. Until then the new types push with the default copy.
4. `.env.audit` on the machine running the seed, holding the hosted keys. Never committed.
5. The seed run: purge, seed, hand-over regenerated.

## Ordering

Sections 1 to 4 are independent of each other and of the seed's skeleton. The seed's domains that depend on a feature (E5's block, N3, N4, N7, E4's sheet) are written last and verified against the merged features. Each section becomes its own PR from `origin/main`.
