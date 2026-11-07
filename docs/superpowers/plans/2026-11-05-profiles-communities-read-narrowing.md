# Narrow what any signed-in user can read: profiles, private communities, the API schema (PAD-164)

Approved by the CTO, 2026-11-05. Found in the outsider audit (PAD-156). Severity: Low.

## Decisions

1. **A private community isn't discoverable.** `docs/audit/2026-09-14-ux-community.md` (UX-COMM) says:
   "Private: not discoverable anywhere. Reachable only through an invitation arriving as a notification."
   So we tighten the policy. The other two modes keep their preview: their row and head count stay
   readable to any signed-in user.
2. **The player directory is id, name and photo.** Inviting by name needs them (`useSearchProfiles`), so
   any signed-in, unblocked user can still read those three, and can still page through them. We accept
   that. Everything else about another person goes through `get_player_profile`, which applies the block rule.
3. **A community's plan is for its members.** The only client caller is the admin Plan section.
4. **The OpenAPI document goes off.** Nothing in the apps reads it.
5. **Accepted, not fixed:** `join_community` and similar answer `community_not_found` differently from a
   refusal, which reveals that a UUID exists. UUIDs can't be guessed and nothing else comes back.

## Order, and why it has three PRs

Two constraints set the order:

- The required `check` job runs `schema:check` against hosted. A PR whose auth path needs a new RPC can't
  go green until that RPC is on hosted, and migrations only apply at merge. So the SQL merges first.
- Released builds select these profile columns and call `community_plan` directly. Revoking early breaks
  them with 42501, and the workflow applies a revoke at merge.

| PR | Contains | Merges |
|---|---|---|
| A | SQL only: community read rule, count, two new functions, OpenAPI off | As soon as it passes |
| B | Clients and `check-remote-schema.mjs` move to the functions | After A is applied to hosted and #320 has merged |
| C | The revokes | **Stays unmerged** until a build containing B is live, like PAD-154's PR 2 |

## PR A: additive SQL

Next free migration number (#320 takes 0149, so rebase if it merges first). Definer functions follow
0133-0145: `search_path` pinned, EXECUTE revoked from `public, anon`, granted to `authenticated`.

1. **`can_read_community(c uuid)`**, definer, returning boolean: true for a signed-in caller when
   - the community isn't archived, and it's non-private, or the caller is a member, or the caller has a
     pending `community_invitations` row for it, or a pending `group_invitations` row for one of its
     groups (`group/[id]/join` reads the community row); or
   - the community is archived and the caller is its admin (0099).

   It's named in a policy, so authenticated keeps EXECUTE (see the 0094 note quoted in 0100). anon doesn't.
2. **`communities: read`** becomes `using (can_read_community(id))`.
   `tenants: read own` (0138) subqueries `communities` under this policy; it already requires membership.
3. **`community_member_count(c)`**: returns null unless `can_read_community(c)` and the community isn't
   archived. `join.tsx` falls back from null safely; run it on the invited and request-to-join previews.
4. **`get_my_community_plan(c uuid)`**: `community_plan(c)` if the caller is a member, otherwise null.
   Don't change `community_plan` itself. Definer functions call it for non-members (join limits and so on).
5. **`get_my_profile_state()`**: no arguments, only ever `auth.uid()`'s row. Returns `description,
   dominant_hand, court_side, level, preferred_time, location_text, locale, onboarded_at,
   terms_accepted_at, notifications_prompted_at, created_at, deleted_at`. Leave
   `get_my_private_profile` (#320) alone. First grep which of these an own-row read really uses, and
   drop any nothing reads.
6. **OpenAPI, in its own migration file:**
   ```sql
   do $$ begin
     alter role authenticator set pgrst.openapi_mode = 'disabled';
   exception when insufficient_privilege then
     raise warning 'openapi_mode not set: needs the founder';
   end $$;
   notify pgrst, 'reload config';
   ```
   The guard is there so a refusal on hosted can't jam the migration queue. Say so on the review task.
   First grep for anything fetching the root path (`rest/v1/` with nothing after it).
7. Regenerate `packages/db/src/database.types.ts`.

Before writing the policy, list what reads `communities` as the invoker, on a local database:
`pg_policies` whose expression names `communities`, and SECURITY INVOKER functions and views that do. If
anything other than `tenants: read own` depends on it, tell the CTO before going on.

Tests in `infra/supabase/tests/` (`*.test.mjs`, through PostgREST as a signed-in user, not as postgres):

- An outsider gets no row for a private community by id, and null for `community_member_count` and
  `get_my_community_plan`.
- A member gets all three. A pending community invitee and a pending group invitee get the row and count,
  and lose them when the invitation is declined or revoked.
- A removed member loses all three.
- Public and request-to-join: an outsider still gets the row and count. Public: the outsider's plan is null.
- An archived community stays admin-only.
- `get_my_profile_state` returns only the caller's row and takes no target. anon can't execute any new
  function, including `can_read_community`.
- anon `GET /rest/v1/` is no longer 200, and a normal table read still works afterwards.

## PR B: clients move

In `packages/api`, so web and mobile share it; mobile-only files go to Engineer B on the same branch.

- `useCommunityPlan` calls `get_my_community_plan`.
- `useMyProfile` reads through `get_my_profile_state`, keeping `id, full_name, avatar_url` from the table.
  It must return the same shape as today.
- Own-row reads move: `apps/web/src/middleware.ts` (`onboarded_at`), `apps/web/src/components/Providers.tsx`
  and `apps/mobile/app/_layout.tsx` (`locale`), `apps/mobile/lib/postAuthRoute.ts`,
  `apps/mobile/app/(auth)/password.tsx` and `otp.tsx`. Keep an unprofiled user's behaviour: a new account
  has no row, so the function returns no rows, as `maybeSingle` did.
- `scripts/check-remote-schema.mjs`: `checkColumns` selects the `OnboardingProfile` columns as anon, which
  fails once PR C lands. Replace it with a `get_my_profile_state` probe, following the `my_auth_providers`
  one (it can't run anonymously, so a refusal counts as present; only PGRST202 fails).
- Update the tests that assert the old reads, including `profile-privacy-writes.test.mjs:65`.

Don't touch the other reads of `id, full_name, avatar_url`: those stay on the table. Any embed still asking
for `gender` is PAD-154's.

## PR C: the revokes, waits for a build

1. ```sql
   revoke select on public.profiles from anon, authenticated;
   grant select (id, full_name, avatar_url) on public.profiles to anon, authenticated;
   revoke execute on function community_plan(uuid) from authenticated;
   ```
   Add a self-check block like 0119's. This also drops `date_of_birth`, `gender` and `location_point`, so
   it depends on PAD-154's PR 2 being ready for the same build. Whichever merges second must still pass.
2. Confirm first that no policy or invoker function needs `community_plan` as `authenticated`, or reads a
   revoked column. `update` of your own row must still work: `useUpdateProfile` doesn't select back, and
   the `profiles: update` policy only uses `id`.
3. Tests: every revoked column returns 42501 for a select and a filter, on someone else's row and your
   own. Writes to your own row still work. `community_plan` is refused for authenticated, and `join_community`
   into a community at its limit still answers `community_full` (so the internal call survives).
4. `grep` for remaining direct reads in `apps/`, `packages/`, `e2e-web/`, `apps/mobile/e2e/` and `infra/seed/`.
5. Update the "every column but" comment and the `grant select (<column>)` guidance for future migrations.

## Hosted

No SQL hand-off: the workflow applies A at merge, and C when it's released. After A, the founder verifies
OpenAPI from their own machine, because agents can't call the hosted project; the CTO sends that task.
`pgrst.openapi_mode` also empties the dashboard's API docs page.
