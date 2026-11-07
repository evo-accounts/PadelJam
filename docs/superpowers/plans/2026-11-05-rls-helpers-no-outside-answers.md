# RLS helpers stop answering outsiders

Task: PAD-160 (finding from the PAD-156 audit). Goal: launch in January 2027.
Status: **approved (CTO, 2026-11-05).** Build on `fix/rls-helpers-no-outside-answers`, which holds this file.

## Problem

Eleven SECURITY DEFINER helpers that RLS policies call can be run directly by anyone with the publishable key:
`auth_tenant_ids`, `can_create_post`, `community_is_public`, `is_community_admin`, `is_community_member`,
`is_group_admin`, `is_group_member`, `may_approve_requests`, `event_is_visible`, `is_event_organizer`,
`group_community_id`.

Three of them leak, to anon and to signed-in strangers alike:

- `is_event_organizer(e, u)` and `event_is_visible(e, u)` answer for any user `u`, private events included.
- `group_community_id(g)` returns a private group's community.

The rest only describe the caller, so anon gets `false`, except that `community_is_public(c)` tells anon whether a
community id is public.

## Why not just revoke from anon

0094, 0098, 0099, 0100 and 0136 each kept these grants on purpose. A policy runs as the calling role, and all 43 policies
using these helpers are `to public`, so anon evaluates them. Anon also holds SELECT on every one of those tables. A bare
revoke turns anon's empty result into `42501 permission denied for function`.

Move the policies to `authenticated` first. For a role with no applicable policy, RLS returns no rows without evaluating
anything.

I read all 43 expressions, and anon gets nothing from any of them today. Each branch needs `auth.uid()`, a helper that is
false without a session, or a subquery on `communities`, which anon can't read. So anon's results don't change. That
includes the public-community preview: every preview branch has `auth.uid() is not null`, and `community_members: read`,
whose public branch doesn't, reads `communities`. The catalog has no view, default, CHECK or invoker function using these
helpers, and no client calls them as RPCs (only `database.types.ts` lists them), so no shipped app is affected.

## Changes

One migration, using the next free number when you build. Other PAD-156 fixes and #320 are adding migrations too.

**1. Move the policies to authenticated.** `alter policy "<name>" on <table> to authenticated;` for every policy in
`public` whose `qual` or `with_check` names one of the eleven. Generate the list from `pg_policies` on your own stack at
the current `main` and write it out literally. It was 43 when I checked, on a stack at 0149. Leave the other policies alone.

**2. Close the arbitrary-user forms.** `create or replace`, keeping the parameter names `e` and `u` and the ACL:

```sql
create or replace function is_event_organizer(e uuid, u uuid) returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select case when u = auth.uid()
    then exists (select 1 from events where id = e and organizer_id = u)
    else false end;
$$;
```

`event_is_visible` is the same shape around its current body (0100). Copy that body from the live function, keeping the
`community_is_public` branch.

**Use `case`, not `u = auth.uid() and ...`.** The second form returns NULL when `auth.uid()` is null, and about 60 callers
are written `if not is_event_organizer(...) then raise`. `not NULL` doesn't raise, so a session-less caller would get past
the organiser check. Both functions must return `false`, never NULL.

**3. Fix the one caller that asks about someone else.** `blast_email_recipients_for(p_blast_id, p_organizer_id)` runs as
service role, where `auth.uid()` is null, so after step 2 `send-blast` would stop sending. Replace its
`is_event_organizer(v_event, p_organizer_id)` with an inline check on `events.organizer_id`, and copy the rest of the body
from the live function (latest in 0143 or later). Keep its grants closed. Every other caller passes `auth.uid()` or a
`v_user` assigned from it (checked with `pg_proc`; recheck at your `main`, in case a new migration added another).

**4. Close `group_community_id`.** It's used by `group_members: read`, `group_departures: read` and the definer body of
`unarchive_group`. Add a caller-only boolean, and rewrite the two policies with it:

```sql
create function is_community_admin_of_group(g uuid) returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select exists (
    select 1 from groups gr
    join community_members cm on cm.community_id = gr.community_id
    where gr.id = g and cm.user_id = auth.uid() and cm.role = 'admin');
$$;
grant execute on function is_community_admin_of_group(uuid) to authenticated;

alter policy "group_members: read" on group_members to authenticated
  using (is_group_member(group_id) or is_community_admin_of_group(group_id));
-- same for "group_departures: read"
```

Then `revoke execute on function group_community_id(uuid) from public, anon, authenticated;`. `unarchive_group` keeps
working because a definer body runs as the owner.

**5. Revoke.** `revoke execute ... from public, anon` on the other ten. Authenticated keeps them; name PUBLIC in the
revoke or anon keeps access through it (0136). The `revoke` needs to name exact signatures, e.g. `is_group_admin(uuid, uuid)`.

**6. Self-check.** A `do $$` block at the end of the migration, as in 0136 and 0141: anon can't execute any of the eleven,
authenticated can't execute `group_community_id`, authenticated can execute the other ten and the new helper, and no
policy on `public` or `anon` names any of them.

**Not changed:** `is_event_participant` and `is_event_invitee` (already closed), `auth_methods_for` (PAD-159), and
anon's table grants (PAD-161 is about the defaults; don't touch them here).

**`Structure Files/CLAUDE.md`:** add one line under the rules: a policy that calls a helper is `to authenticated`, and
helpers don't answer for a user other than the caller. It changes 0142's advice ("grant to anon as well if anon reaches
it"), so say in the migration's header that this supersedes it for RLS helpers. Don't edit 0142.

## Tests

Add to `infra/supabase/tests/`, and run them through `pnpm test:db`:

- **The finding's own steps** (REST, with A, stranger B and anon), against a private standalone event and A's private group:
  - anon gets `permission denied for function` from all eleven (add them to `definer-grants.test.mjs`);
  - B gets `false` for `is_event_organizer` and `event_is_visible` with A's id, and permission denied from
    `group_community_id`;
  - A gets `true` for both with A's own id, and B gets `false` with `u: null`, as a real `false`, not null.
- **Anon reads don't error.** For each table in step 1, an anon `GET /rest/v1/<table>?select=*&limit=1` returns 200 and `[]`.
  This is the regression the earlier migrations were guarding against, so it's the test that matters most.
- **Anon writes unchanged.** Anon's PATCH on `communities` changes no rows, and its INSERT on `community_posts` is refused.
- **The organiser path still works.** An organiser can do one `is_event_organizer`-gated action; a session-less caller
  is refused. `blast-recipients-privacy.test.mjs` must still pass, and `send-blast` must still return recipients as
  service role; add that assertion if the test doesn't already make it.
- **`group_members` stays correct.** A community admin who isn't in a private group still reads that group's members, a
  plain member doesn't, and `unarchive_group` still works.
- **Guard** (a `.sql` test, as in `event_activity.sql`): no policy on `public` or `anon` names one of the eleven, and
  anon can execute none of them. So a later migration that adds a policy without `to authenticated` fails here instead of
  in production.

Change `status-gaps.test.mjs:227-228`: anon now gets permission denied from `is_group_admin`, not `false`. That's the one
existing assertion I know breaks; others may turn up in `pnpm test:db`. Change only the ones that assert anon's answer.

## Hosted

No founder step. It's a migration with no drop, truncate or delete, so the `Supabase migrations` workflow applies it at
merge, and no edge function changes. `alter policy` fails the whole migration if hosted lacks a policy that local has, which
is what we want.

The audit couldn't verify production, so the catalog figures above are local.

## Risks

- **Migrations landing first.** A new `to public` policy calling one of these helpers makes anon's reads on that table
  fail once this merges. The guard test catches it if the other migration is on your branch, so rebase on `main` before
  QA, and regenerate the step 1 list. This is why I check the branch against `main` again before merging.
- **Per-row cost.** `event_is_visible` gets one more `auth.uid()` call per row. It's small, and no extra function layer
  is added.
