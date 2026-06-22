# Web W4e — In-progress match — Design

**Slice:** Final W4 sub-slice (5 of 5). The live match engine: start (incl. team setup) → live scoring →
leaderboard → timer → finish + publish. A single surface route `/app/event/[id]/live` owns the whole state
machine; the event-detail CTA links to it.

## Goal

Run an event end-to-end on web: the organizer starts it (assigning teams first for team-spec events), players/
organizer score matches round-by-round, everyone sees the live leaderboard + timer, and the organizer finishes &
publishes the result — all on the existing backend via `@padel/api`.

## Route: `/app/event/[id]/live`
Client page. Loads `useEvent(id)`, `useEventParticipants(id)`, `useEventTeams(id)`, `useEventRounds(id)`,
`useEventMatches(id)`, `useEventStandings(id)`, `useEventTimer(id)`, `useEventRealtime(id)`, `useSession` (uid).
Hooks before early returns; loading → `Skeleton`; `!event.data` → `notAvailable`. Renders by `event.data.status`.

### `scheduled` — pre-start
- **Non-organizer** → a "waiting to start" notice (`waitingToStart`) + a back link to the event.
- **Organizer, individual event** (`specification !== 'team'`) → a readiness summary (confirmed count vs
  `num_courts * 4`) + a **Start** button. `setupComplete` = `confirmedCount >= num_courts * 4` where
  `confirmedCount` = participants with `status === 'confirmed'`. Start → `useStartEvent(id).mutate({ eventType:
  event.event_type, confirmedParticipantIds, numCourts: event.num_courts })` (the hook computes the americano
  schedule client-side and seeds mexicano/up_and_down server-side). `confirmedParticipantIds` = the `id`s of
  confirmed participants. On success the query invalidations flip the page to the `in_progress` view.
- **Organizer, team event** (`specification === 'team'`) → the **team-setup** UI (see below) + a **Start** button
  gated on `confirmedTeamCount >= num_courts * 2` (teams with `is_confirmed`).

### `in_progress` — live (tabs: Matches / Leaderboard / Timer)
- **Matches tab:** a **round selector** (`useEventRounds` rows `{ id, round_number, status, rests }`, ordered by
  `round_number`; default to the latest round; selecting a round filters the matches). The selected round's
  matches (`useEventMatches` filtered by `round_id`) grouped by `court_number`. Each `MatchCard`: **Side A** vs
  **Side B** player names (from `match_players` where `side === 'a'`/`'b'` → `event_participants` → `profiles.full_name`
  ?? `guest_name`), and the score (`side_a_score`–`side_b_score`) or a "tap to score" hint. **Resting** players for
  the round (`round.rests` — a list of participant ids → names). When `canScore`, tapping a match opens the
  **ScoreDialog**: numeric Side A + Side B inputs (≥0) + a **not played** toggle → `useSubmitScore(id).mutate({
  matchId, sideA, sideB, notPlayed })`. An organizer-only **Generate next round** button (`useGenerateNextRound(id)`)
  shown when the latest round's matches are all scored (`status` complete).
- **Leaderboard tab:** `useEventStandings(id)` rows `{ entity_id, is_team, points, wins, draws, losses, rank }`
  resolved to names — `is_team` → `t('teamLabel', { number })` via a team-number lookup (`useEventTeams`), else the
  participant name via a participant lookup (`useEventParticipants`, keyed by participant `id`). A rank / name /
  points table (optionally W-D-L). Empty → `standingsEmpty`.
- **Timer tab:** `useEventTimer(id)` → `{ duration_seconds, started_at, paused_at, status: 'idle'|'running'|'paused' }`.
  Render the remaining/elapsed time (compute from `started_at`/`paused_at`/`duration_seconds`; a 1s `setInterval`
  tick while `running`). Organizer-only controls **Start / Pause / Resume / Reset** → `useSetEventTimer(id).mutate(
  'start'|'pause'|'resume'|'reset')`.
- **Finish** (organizer, persistent action on the live view): a **Finish** button → `FinishDialog`: an optional
  **finish message** `Textarea` (`finishMessageLabel`) + a **ranking include/exclude** toggle (seeded from
  `event.counts_for_ranking`; `useSetEventRanking(id).mutate(enabled)`) + a **finish-early** warning when not all
  matches are scored → `useFinishEvent(id).mutate({ countsOverride: <ranking enabled>, finishMessage })` → status
  `completed`.

### `completed`
The final **leaderboard** (`useEventStandings`, resolved names) + the `event.finish_message` if set + an
organizer **Share results** action (`usePostEventResult(id).mutate(event.community_id ?? group's community)` —
posts the result to the community feed; pass the community id the post hook expects). (W4a already shows a compact
result summary on the detail page; `/live` shows the full standings + share.)

## Permissions
`isOrganizer = uid != null && event.organizer_id === uid`. `isParticipant = participants.some(p => p.user_id === uid)`.
`canScore = isOrganizer || (event.players_submit_results && isParticipant)`. Start / generate-round / finish /
timer-control / team-setup / share are **organizer-only**. Non-scorers see read-only matches + leaderboard. RPCs
enforce server-side regardless.

## Team setup (team-spec events, pre-start)
`useEventTeams(id)` → teams `{ id, team_number, is_confirmed, player_a, player_b }` (players are
`event_participants` with profile). For each team's slots a/b:
- empty slot → pick an **eligible** confirmed participant (confirmed + not already on a team) → `useAssignToTeam(id)
  .mutate({ participantId, teamNumber, slot, targetName })`.
- filled slot → **remove** (`useRemoveFromTeam(id).mutate({ participantId, targetName })`) or **switch** two players
  (`useSwitchPlayers(id).mutate({ participantA, participantB })`).
A `TeamSetup` component renders the team grid + an assignment picker (a `Dialog`/`Select` of eligible players).

## Architecture / isolation
- **Pure helper** `packages/utils/src/match-view.ts` (vitest): `setupComplete({ specification, confirmedCount,
  confirmedTeamCount, numCourts })`, `standingsName(row, participantNameById, teamNumberById, teamLabel)`, and a
  small `roundIsComplete(matchesOfRound)` predicate. Primitives only (no `@padel/api` import).
- Components under `apps/web/src/components/event/live/`: `MatchCard`, `ScoreDialog`, `RoundSelector`,
  `Leaderboard`, `MatchTimer`, `TeamSetup`, `FinishDialog`. The `/live` page owns status routing + active-tab +
  selected-round + dialog state.
- New `event` i18n keys for the live/match/timer/finish/team labels (lifted from the mobile `event` bundle).

## Wire the entry (EventCTA, W4b)
In `apps/web/src/components/event/EventCTA.tsx`:
- The `status !== 'scheduled'` branch's disabled button → a `Link` to `/app/event/${event.id}/live`
  (`viewMatchesCta` when `in_progress`, `viewResultsCta` when `completed`).
- The organizer **scheduled** branch gains a **Start / set up** `Link` to `/app/event/${event.id}/live` (the live
  page hosts the pre-start + start UI). Keep the join/leave-as-player actions as-is.

## Reuse
`@padel/api`: `useEvent`, `useEventParticipants`, `useEventTeams`, `useEventRounds`, `useEventMatches`,
`useEventStandings`, `useEventTimer`, `useEventRealtime`, `useStartEvent`, `useGenerateNextRound`, `useSubmitScore`,
`useFinishEvent`, `useSetEventTimer`, `useSetEventRanking`, `usePostEventResult`, `useAssignToTeam`,
`useRemoveFromTeam`, `useSwitchPlayers`. `avatarUrl` (`@/lib/upload`). shadcn `Tabs`, `Card`, `Dialog` (for the
score/assign modals — **verify `dialog` exists under `@/components/ui/`; if absent, use `alert-dialog` or add the
shadcn dialog**), `Input`, `Switch`, `Textarea`, `Button`, `Badge`, `Avatar`, `Skeleton`, `Select`.

## Error / edge handling
- Non-organizer on a scheduled event → waiting notice; non-scorer in-progress → read-only.
- ScoreDialog validates numeric ≥ 0; submit maps RPC error keys to i18n inline.
- Generate-next-round disabled until the round is scored; finish-early shows a warning.
- Start disabled until `setupComplete` / enough confirmed teams; surface `setup_incomplete` / `round_not_scored` /
  `forbidden` / `unknown_error`.
- Realtime keeps matches/standings/timer fresh after mutations (which also invalidate via `onSuccess`).

## Verification
`pnpm --filter @padel/utils test` (match-view) + `pnpm --filter web typecheck` + `build`; browser (local Supabase,
as organizer): an individual event with ≥`numCourts*4` confirmed → **Start** → live Matches render; score a match
(+ "not played") → Leaderboard updates; **Generate next round**; Timer start/pause/resume/reset; **Finish** (with
message + ranking toggle; finish-early warning when unscored) → `completed` shows final standings; **Share results**
posts to the community feed. A **team** event → assign players to team slots (switch/remove) → Start → score. A
non-organizer sees the waiting notice (scheduled) and read-only matches/leaderboard (in_progress).

## Out of scope
Editing a completed match's score post-finish; spectator animations; event chat (W5); push/notification side effects
(server-driven).
