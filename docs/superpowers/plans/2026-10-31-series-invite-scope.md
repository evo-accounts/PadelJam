# Recurring series copies only invitable invitees (0147)

Task: PAD-6 (follow-up from PAD-3). Goal: launch in January 2027.
Status: **approved (CTO, 2026-10-31)**. Branch: the PAD-6 execution branch, which already contains
`fix/create-event-invitee-scope` (0146) merged in; the CTO points `fix/series-invite-scope` at its head at review.

## Problem

`_materialize_next` (latest body: 0123, ~line 255) opens the next occurrence of a private series and copies the
previous occurrence's invitations. It only skips declined rows, the organizer and deleted profiles. A player who
left the group, or a blocked pair (either direction), is invited again every week. The `event_invite` trigger
already suppresses the notification for a blocked pair, but the invitation row is still created and shows up in
the invitee's list: a safety issue.

All three entry points go through `_materialize_next`: the cron sweep `materialize_due_occurrences` (actor = series
organizer), `materialize_occurrence` (actor = caller, organizer-guarded) and `send_occurrence_now` (actor = series
organizer). Fixing the one function fixes all three.

## What changes

### 1. Migration `infra/supabase/migrations/0147_series_invite_scope.sql` (Engineer A)

`create or replace function _materialize_next(p_after_event_id uuid, p_actor uuid, p_target timestamptz default null)`,
copied from the **0123** body with only this change (mark new lines `-- NEW (0147)`):

In the private-series branch, the `insert into event_invitations … select … from event_invitations ei where …`
gets, for rows with a non-null `invitee_id`, the same scope `invite_to_event` / `create_event` (0146) enforce:

- profile exists and `deleted_at is null` (already there; keep);
- `not notif_blocked(v_src.organizer_id, ei.invitee_id)` and `not notif_blocked(p_actor, ei.invitee_id)`
  (the inviter is `p_actor`; today it is always the organizer, check both so a future caller can't widen it);
- `exists (select 1 from group_members gm where gm.group_id = v_src.group_id and gm.user_id = ei.invitee_id)`.

These are **filters in the `where` clause, not raises**: one ineligible invitee is skipped, the occurrence is still
opened for everyone else, and the sweep moves on. Rows with a null `invitee_id` (name/email/phone invitees) keep
being copied exactly as today. Nothing else in the body changes.

- Header unchanged: `language plpgsql security definer set search_path = public`.
- End the file with the same `revoke execute on function _materialize_next(uuid, uuid, timestamptz) from public, anon, authenticated;`
  as 0123 (internal; no grant). `definer-grants.test.mjs` must pass untouched.
- File header comment: what, why, "0123 body", one line per NEW rule. Pasteable as-is in the hosted SQL editor
  (no `\` meta-commands; depends on nothing newer than 0146).

### 2. DB test `infra/supabase/tests/series-invite-scope.test.mjs` (Engineer A)

Same harness and helpers as `recurrence-scheduler.test.mjs` (`base`, `series`, `group`, `moveTo`, `slotBefore`,
`sweep`; copy them, do not import from another test). One private series in a group with members `a`…`e`, all
invited at creation, then before the sweep:

1. `a` stays a member, nothing changes → **copied** as pending, gets `event_invite`.
2. `b` leaves the group (`leave_group`) → **not copied**.
3. `c` blocks the organizer (`block_user` as `c`) → **not copied**.
4. The organizer blocks `d` → **not copied**.
5. `e`'s profile is soft-deleted (service role) → **not copied**.
6. The sweep does not fail: the occurrence is opened (2 occurrences), and exactly one invitation exists on it (`a`).
7. Same filter on the organizer path: `materialize_occurrence` from the new occurrence opens a third one with
   only `a` invited (`b`…`e` still excluded).

If a step has a side effect that already removes the old invitation (e.g. `block_user` or `leave_group` deleting
rows), the test must undo it with the service role so the filter itself is what's tested; say so in a comment.

In `recurrence-scheduler.test.mjs`, the private-series case lost its non-member fixture in 0146 (create_event now
refuses outsiders). Restore it as a negative case only if it fits naturally (e.g. `c` joins then leaves before the
sweep and is asserted not copied); otherwise leave that file alone — the new file covers it.

### 3. Clients

No change. The scheduler is server-only and the filter is silent. No strings, no locales.

## Out of scope

Telling the organizer that someone was dropped from the next occurrence; re-scoping name/email/phone invitees;
cleaning up invitations already copied on hosted (the founder can ask for a one-off later if needed).

## Checks before hand-off

`pnpm lint && pnpm typecheck && pnpm tokens:check && pnpm i18n:check && pnpm size:check && pnpm test && pnpm test:functions && pnpm test:db`
on the local stack after `pnpm dlx supabase@2.117.0 --workdir infra db reset`. No hosted access of any kind.

## QA

- `pnpm test:db` green, including the new file, `recurrence-scheduler.test.mjs`, `create-event-invitee-scope.test.mjs`
  and `definer-grants.test.mjs`.
- Read 0147 against 0123's body: the only diff is the `-- NEW (0147)` lines.
- Mobile E2E suites for the founder's runner: none touch the scheduler; QA confirms by grepping `apps/mobile/e2e/`.

## Hosted hand-off (CTO writes it on PAD-6 after review)

Apply 0146 first (PAD-3). Then paste the full `0147_series_invite_scope.sql`, then:

```sql
insert into supabase_migrations.schema_migrations (version, name)
values ('0147', 'series_invite_scope') on conflict do nothing;
```

Verify on the object, not the version table:
`select prosrc like '%group_members gm%' and prosrc like '%notif_blocked%' from pg_proc where proname = '_materialize_next';` → `true`;
`select has_function_privilege('authenticated', 'public._materialize_next(uuid, uuid, timestamptz)', 'execute');` → `false`.
No edge function redeploy, no app release.
