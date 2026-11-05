# Close other users' read of date of birth, gender and coordinates (PAD-133)

Approved by the CTO, 2026-11-05.

## The problem, as tested

On a local stack with migrations up to 0148, a signed-in user with no relationship to the target read
`date_of_birth`, `gender` and `location_point` with a plain `select` on `profiles`, one row or all rows.
`date_of_birth=eq.…` also works as a filter. `location_point` came back as hex EWKB that decodes to the
exact stored coordinates (38.7223412, -9.1393367). The anon key gets no rows; a block in either
direction hides the row.

RLS filters rows and can't hide a column. The cause is the column grant in 0119, the same shape as the
phone and email fixes in 0115 and 0119. `get_player_profile`, which the app uses for other people's
profiles, doesn't return these fields.

## Why two PRs

Released builds select these columns directly. Revoking first breaks them with 42501:

- `useMyProfile` selects `date_of_birth, gender` (own row).
- `useViewerHasLocation` and the web `ProfileLocationCard` select `location_point` (own row).
- `PARTICIPANT_PROFILE_EMBED` selects `profiles(… gender)` for other people, so **event detail fails**.

The migrations workflow applies a migration when its PR merges, so the order is enforced by when each
PR merges. Checked on the local database: no policy, view or SECURITY INVOKER function reads these
columns, and `profiles` isn't in a realtime publication. Re-check this before the revoke.

## PR 1: additive, merges as soon as it passes

Next free migration number, one or more files. Definer functions follow 0133–0145: `search_path`
pinned, EXECUTE revoked from `public, anon`, granted to `authenticated`.

1. **`get_my_private_profile()`**, no arguments: returns the caller's `date_of_birth`, `gender`,
   `lat`, `lng` (plain doubles, so nobody parses EWKB). Only ever `auth.uid()`'s row; no target parameter.
2. **`event_participant_genders(p_event_id uuid)`**: returns `(user_id, gender)` for confirmed and
   waiting participants, only when the event's specification needs gender (`mixed`) and the caller can
   see the event (`event_is_visible`), and leaving out anyone blocked with the caller
   (`is_blocked_with`). Any other event returns no rows. First confirm from the code that non-mixed
   events never use a participant's gender (`manageRoster.ts` `asSide`, `eventViewerState.ts`
   `genderOf`); if one does, tell the CTO before widening the rule.
3. **Round coordinates in `set_my_location`** to 2 decimal places (about 1 km), server-side, so every
   build gets it. That's enough for explore's distance ranking. In the same migration, round the
   existing `profiles.location_point` values. Don't touch `communities` or `events`: their locations
   are public by design. The `Migration check` may hold the `update`: if it warns, stop and tell the CTO.
4. **Clients move off the columns**, in `packages/api` so web and mobile share it:
   `useMyProfile`, `useViewerHasLocation`, `ProfileLocationCard`, and the roster: drop `gender` from
   `PARTICIPANT_PROFILE_EMBED`, and merge from `event_participant_genders` where `manageRoster.ts` and
   `eventViewerState.ts` read it. Update `queries.test.ts:28`, which asserts the embed contains `gender`.
   Keep the join-rule behaviour the same: the server's own checks (`_mixed_gender_full`) are unchanged.

Tests in `infra/supabase/tests/` (`*.test.mjs`, through PostgREST as a signed-in user, not as postgres):

- A sees their own private fields through the function, and can't reach B's by any argument.
- anon can't execute either function.
- Genders: a mixed event visible to the caller returns them; a non-mixed event, an event the caller
  can't see and a blocked participant don't.
- `set_my_location` with 38.7223412, -9.1393367 stores 38.72, -9.14.
- A backfilled row is rounded.

## PR 2: the revoke, merges only after a build containing PR 1 is live

1. `revoke select (date_of_birth, gender, location_point) on public.profiles from anon, authenticated;`
   with a self-check block like 0119's, and update the "every column but" list in its comments.
2. `infra/supabase/tests/`: B's three columns return 42501 for A, as a select and as a filter, and A's
   own too: nobody reads them directly any more. Also check `update` of A's own DOB and gender still
   works (`useUpdateProfile` doesn't select them back).
3. `grep` for any remaining direct read in `apps/`, `packages/`, `e2e-web/`, `apps/mobile/e2e/` and
   `infra/seed/`.

**Open PR 2, leave it unmerged, and hand it to the CTO.** The CTO merges it once the founder confirms the
build is out (an EAS build is a board gate) and that Account Settings and an event detail work on it.
`scripts/check-remote-schema.mjs` doesn't name these columns, so its check isn't affected.

## Not in this work

Other readable columns of low sensitivity (`locale`, `terms_accepted_at`, `deleted_at`,
`notifications_prompted_at`, `onboarded_at`): the CTO opens a follow-up. `location_text` is public on
profiles by design; if the geocoder's label can be a street address, say so on the task rather than
fixing it here.

## Hosted

Migrations reach hosted only through the workflow. This will be one of the first real migrations
through the PR `Migration check` and the auto-apply job, so read both logs rather than trusting green.
No edge function changes, no founder hand-off for PR 1 unless the check holds it.

## Mobile E2E

Suites that open event detail, the roster for a mixed event, and Account Settings must pass on the
runner for PR 1.
