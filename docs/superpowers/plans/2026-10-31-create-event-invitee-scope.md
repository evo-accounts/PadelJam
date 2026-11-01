# create_event invitees are scoped like invite_to_event (0146)

Task: PAD-3 (parent PAD-2). Goal: launch in January 2027.
Closes the open item in `docs/audit/2026-09-29-ux-manage-event-plan.md` ("`create_event` invitees are not scoped").
Status: **approved (CTO, 2026-10-31)**. Branch: `fix/create-event-invitee-scope`.

## Problem

`invite_to_event` (0122, D12) refuses an invitee who is a deleted or missing profile (`user_not_found`), who
is blocked either way (`blocked`, via `notif_blocked`), or who is not in the event's group (`not_group_member`).
`create_event` (latest body: 0122, "D13") inserts every `invitees[].invitee_id` it is given, so a private group
event can be created with outsiders, blocked players or deleted profiles invited. Hiding them in the picker
(`event_invite_candidates`) is not enforcement.

## What changes

### 1. Migration `infra/supabase/migrations/0146_create_event_invitee_scope.sql` (Engineer A)

`create or replace function create_event(p_payload jsonb)`, copied from the **0122** body with only this change
(mark new lines `-- NEW (0146)` like 0122 does):

- Right after the `invalid_court_names` checks and **before the `event_series` insert** (the first write), when the
  event takes invitations — `not (v_group is not null and v_private = false)` — and `invitees` is an array, loop over
  it and for each `invitee_id`:
  - skip null/empty, and skip `v_user` (the organizer), as `invite_to_event` does;
  - `user_not_found` unless `exists (select 1 from profiles where id = v_uid and deleted_at is null)`;
  - `blocked` if `notif_blocked(v_user, v_uid)`;
  - `not_group_member` if `v_group is not null` and the user has no `group_members` row in `v_group`;
  - all `raise exception '<code>' using errcode='P0001'`, same order as `invite_to_event`.
- The final insert loop skips the organizer and any id already inserted in this call (no unique constraint on
  `event_invitations (event_id, invitee_id)`; `invite_to_event` skips existing rows, so match it).
- A public group event keeps ignoring `invitees` (unchanged; every member is notified). Not validated.
- Header: `security definer set search_path = public` unchanged. End the file with the same
  `revoke execute on function create_event(jsonb) from public, anon, authenticated;`
  `grant execute on function create_event(jsonb) to authenticated;` as 0113/0122 — grants are unchanged.
- File header comment: what and why, 0122 body, one line per NEW rule. Pasteable as-is in the hosted SQL editor
  (no `\` meta-commands, no dependency on anything newer than 0145).

Raising aborts the transaction, so nothing is written either way; validating first just keeps the intent plain.

### 2. DB test `infra/supabase/tests/create-event-invitee-scope.test.mjs` (Engineer A)

Same harness as `manage-rules.test.mjs` (`./lib.mjs`; reuse its `payload` / `group` helper shape). Cases:

1. Private group event, invitee is a group member → succeeds; exactly one pending invitation for them.
2. Private group event, invitee is a community member not in the group → `not_group_member`.
3. Private group event, invitee is a member who blocked the organizer → `blocked` (and the reverse direction).
4. Invitee whose profile is soft-deleted (`deleted_at` set via service role) → `user_not_found`; a random uuid too.
5. For 2–4: no `events` row exists with that payload's unique `name` afterwards (service-role `sel`), and no
   `event_series` row when the payload is recurring (one recurring case is enough).
6. Standalone event: any live non-member → succeeds; blocked → `blocked`; deleted → `user_not_found`.
7. The organizer in their own list and a duplicated id → one invitation per invitee, none for the organizer.
8. Public group event with an outsider in `invitees` → succeeds, no invitations (unchanged behaviour).

`definer-grants.test.mjs` must still pass untouched (grants unchanged).

### 3. Web and mobile Create Event (no code change expected)

Both already do it: `useCreateEvent` (`packages/api/src/events/mutations.ts`) maps through `mapPgError`, whose
`KNOWN` list has `not_group_member`, `user_not_found` and `blocked` (`packages/api/src/client.test.ts` covers
them); `apps/mobile/app/event/create/index.tsx` and `apps/web/src/app/(app)/app/community/[id]/event-create/page.tsx`
show `t(code, { defaultValue: t('unknown_error') })` from the `event` namespace, which has all three keys in
pt-PT, pt-BR and en on both platforms (the Invite screen's copy). Engineer A confirms this by reading, and
adds nothing unless a gap turns up; if one does, fix it in that file and say so in the hand-off. Engineer B is
not needed.

## Out of scope

Create-Event-specific wording ("one of the players you invited…"), naming the refused player, refusing
`invitees` on a public group event with `invites_not_allowed`, `duplicate_event` (it carries no invitations).

## Checks before hand-off

`pnpm lint && pnpm typecheck && pnpm tokens:check && pnpm i18n:check && pnpm size:check && pnpm test && pnpm test:functions && pnpm test:db`
on the local stack after `pnpm dlx supabase@2.117.0 --workdir infra db reset`. No hosted access of any kind.

## QA

- `pnpm test:db` green, including the new file and `manage-rules.test.mjs`.
- On the local stack, mobile and web: create a private group event inviting a non-member (insert the invitation
  payload by picking a member, then remove them from the group before Finish), a blocked player, a deleted profile;
  each shows its translated banner (check all three locales), no event is created. A member invitee still works.
- Mobile E2E suites for the founder's runner: the Create Event suite(s) under `apps/mobile/e2e/` that create an
  event with invitees (QA names them in their pass comment).

## Hosted hand-off (CTO writes it on PAD-3 after review)

Paste the full `0146_create_event_invitee_scope.sql`, then:

```sql
insert into supabase_migrations.schema_migrations (version, name)
values ('0146', 'create_event_invitee_scope') on conflict do nothing;
```

Verify on the object, not the version table:
`select prosrc like '%not_group_member%' from pg_proc where proname = 'create_event';` → `true`, and
`select has_function_privilege('anon', 'public.create_event(jsonb)', 'execute');` → `false`
(`authenticated` → `true`). No edge function redeploy; no app release needed (the copy already shipped).
