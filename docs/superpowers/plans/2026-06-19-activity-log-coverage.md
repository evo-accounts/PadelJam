# Activity-Log Coverage + Server-Side Move (A3) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Complete the event activity log (edit / invite / accept / decline) and make organizer roster + team logging bypass-proof by moving it into the RPCs; only join/leave stay client-fired.

**Architecture:** Migration `0081` `create or replace`s 12 RPCs, each gaining an inline `insert into event_activity` (the `cancel_event`→notifications pattern), with server-derived actor + target names. `@padel/api` drops the now-duplicate client `logActivity` calls and adds activity-cache invalidation to the gap hooks. The activity screen renders the 4 new action types.

**Tech Stack:** Supabase Postgres (plpgsql SECURITY DEFINER RPCs), `@padel/api` (TanStack hooks), React Native.

**Spec:** [docs/superpowers/specs/2026-06-19-activity-log-coverage-design.md](specs/2026-06-19-activity-log-coverage-design.md)

---

## File Structure

| File | Responsibility |
|---|---|
| `infra/supabase/migrations/0081_activity_logging.sql` | Recreate 12 RPCs with inline `event_activity` inserts |
| `infra/supabase/tests/activity_logging.sql` | SQL test for the new + migrated logging |
| `packages/api/src/events/mutations.ts` | Remove 8 client `logActivity` calls; add activity invalidation to 4 gap hooks |
| `apps/mobile/app/event/[id]/activity.tsx` | Render the 4 new action types (+ changed-groups for edits) |
| `apps/mobile/lib/i18n-mobile.ts` | English copy for the new action types + group words |

**Key fact:** `create or replace function` PRESERVES existing grants/ACLs — no re-`grant` needed. Each recreated function must otherwise be a VERBATIM copy of its current definition (from the source migration named below) plus the specified insert. The actor is always the server-verified `auth.uid()` (`v_user`).

---

## Task 1: Migration `0081` — recreate RPCs with inline logging

**Files:**
- Create: `infra/supabase/migrations/0081_activity_logging.sql`

The migration contains 12 `create or replace function` statements. For the ones marked "verbatim + insert", copy the CURRENT body from the cited source file exactly, then add the shown insert at the shown location. `update_event` is given in full because it gains computed locals.

- [ ] **Step 1: Write the migration**

Start the file:
```sql
-- A3: server-side activity logging. Recreate event RPCs to append event_activity rows inline
-- (bypass-proof), covering edit/invite/accept/decline plus the organizer roster + team actions
-- previously logged client-side. join/leave remain client-fired via log_event_activity.
```

**(a) `update_event`** — full body (this is the 0080 body + a `v_changes` local, the change computation, and the `event_edited` insert):
```sql
create or replace function update_event(p_event_id uuid, p_payload jsonb) returns void
language plpgsql security definer set search_path = public as $$
declare v_user uuid := auth.uid(); v_ev events%rowtype;
        v_allow_standby boolean; v_standby int; v_private boolean; v_standby_have int;
        v_num_courts int; v_confirmed_main int;
        v_date_changed boolean; v_loc_changed boolean; v_changes text[] := '{}';
begin
  if v_user is null then raise exception 'not authenticated'; end if;
  select * into v_ev from events where id = p_event_id and deleted_at is null;
  if v_ev.id is null then raise exception 'event_not_found' using errcode='P0001'; end if;
  if v_ev.organizer_id <> v_user then raise exception 'forbidden' using errcode='P0001'; end if;
  if v_ev.status <> 'scheduled' then raise exception 'not_editable' using errcode='P0001'; end if;
  if coalesce(btrim(p_payload->>'name'),'') = '' then raise exception 'name_required' using errcode='P0001'; end if;

  v_allow_standby := coalesce((p_payload->>'allow_standby')::boolean, false);
  v_standby := nullif(p_payload->>'standby_spots','')::int;
  v_private := case when v_ev.group_id is null then true
                    else coalesce((p_payload->>'is_private')::boolean, false) end;
  v_num_courts := coalesce((p_payload->>'num_courts')::int, v_ev.num_courts);

  select count(*) into v_standby_have from event_participants where event_id=p_event_id and is_standby;
  if v_standby_have > 0 and (not v_allow_standby or coalesce(v_standby,0) < v_standby_have) then
    raise exception 'standby_below_roster' using errcode='P0001';
  end if;

  select count(*) into v_confirmed_main
    from event_participants where event_id=p_event_id and status='confirmed' and not is_standby;
  if v_num_courts * 4 < v_confirmed_main then
    raise exception 'courts_below_roster' using errcode='P0001';
  end if;

  v_date_changed := (p_payload->>'starts_at')::timestamptz is distinct from v_ev.starts_at;
  v_loc_changed :=
       nullif(p_payload->>'venue_id','')::uuid          is distinct from v_ev.venue_id
    or nullif(p_payload->>'manual_location_name','')    is distinct from v_ev.manual_location_name
    or nullif(p_payload->>'manual_location_address','') is distinct from v_ev.manual_location_address;

  -- A3: which groups changed (compared against the old snapshot v_ev), for the activity log.
  if v_date_changed or (p_payload->>'duration_minutes')::int is distinct from v_ev.duration_minutes then
    v_changes := v_changes || 'date'; end if;
  if v_loc_changed then v_changes := v_changes || 'location'; end if;
  if p_payload->>'scoring_mode' is distinct from v_ev.scoring_mode
     or nullif(p_payload->>'scoring_value','')::int is distinct from v_ev.scoring_value then
    v_changes := v_changes || 'scoring'; end if;
  if coalesce((p_payload->>'allow_standby')::boolean,false) is distinct from v_ev.allow_standby
     or nullif(p_payload->>'standby_spots','')::int is distinct from v_ev.standby_spots
     or v_private is distinct from v_ev.is_private
     or coalesce((p_payload->>'entrance_fee_enabled')::boolean,false) is distinct from v_ev.entrance_fee_enabled
     or nullif(p_payload->>'entrance_fee_amount','')::numeric is distinct from v_ev.entrance_fee_amount
     or nullif(p_payload->>'entrance_fee_method','') is distinct from v_ev.entrance_fee_method
     or coalesce((p_payload->>'players_submit_results')::boolean,false) is distinct from v_ev.players_submit_results
     or p_payload->>'organizer_role' is distinct from v_ev.organizer_role then
    v_changes := v_changes || 'preferences'; end if;
  if btrim(p_payload->>'name') is distinct from v_ev.name
     or p_payload->>'description' is distinct from v_ev.description
     or p_payload->>'thumbnail_path' is distinct from v_ev.thumbnail_path then
    v_changes := v_changes || 'details'; end if;

  update events set
    name                    = btrim(p_payload->>'name'),
    description             = p_payload->>'description',
    thumbnail_path          = p_payload->>'thumbnail_path',
    starts_at               = (p_payload->>'starts_at')::timestamptz,
    duration_minutes        = (p_payload->>'duration_minutes')::int,
    scoring_mode            = p_payload->>'scoring_mode',
    scoring_value           = nullif(p_payload->>'scoring_value','')::int,
    allow_standby           = v_allow_standby,
    standby_spots           = case when v_allow_standby then v_standby else null end,
    is_private              = v_private,
    counts_for_ranking      = case when v_private is distinct from v_ev.is_private
                                  then (v_ev.group_id is not null and not v_private)
                                  else v_ev.counts_for_ranking end,
    entrance_fee_enabled    = coalesce((p_payload->>'entrance_fee_enabled')::boolean, false),
    entrance_fee_amount     = nullif(p_payload->>'entrance_fee_amount','')::numeric,
    entrance_fee_method     = nullif(p_payload->>'entrance_fee_method',''),
    entrance_fee_mba_number = p_payload->>'entrance_fee_mba_number',
    players_submit_results  = coalesce((p_payload->>'players_submit_results')::boolean, false),
    organizer_role          = p_payload->>'organizer_role',
    venue_id                = nullif(p_payload->>'venue_id','')::uuid,
    manual_location_name    = nullif(p_payload->>'manual_location_name',''),
    manual_location_address = nullif(p_payload->>'manual_location_address',''),
    has_location            = coalesce((p_payload->>'has_location')::boolean, false),
    num_courts              = v_num_courts,
    location_point          = case
        when p_payload->>'location_lat' is not null and p_payload->>'location_lng' is not null
        then st_setsrid(st_makepoint((p_payload->>'location_lng')::float8,(p_payload->>'location_lat')::float8),4326)::geography
        else v_ev.location_point end,
    location_text           = coalesce(nullif(p_payload->>'location_text',''), v_ev.location_text)
  where id = p_event_id;

  if v_date_changed or v_loc_changed then
    insert into notifications (user_id, type, actor_id, event_id, actor_name, entity_name)
    select ep.user_id, 'event_updated', v_user, p_event_id,
           (select full_name from profiles where id = v_user), btrim(p_payload->>'name')
    from event_participants ep
    where ep.event_id = p_event_id and ep.status='confirmed'
      and ep.user_id is not null and ep.user_id <> v_user;
  end if;

  -- A3: log the edit (only when at least one tracked group changed).
  if array_length(v_changes,1) is not null then
    insert into event_activity (event_id, actor_id, action, detail)
    values (p_event_id, v_user, 'event_edited', jsonb_build_object('changes', to_jsonb(v_changes)));
  end if;
end; $$;
```

**(b) `invite_to_event`** — copy verbatim from [0047_roster_rpcs.sql](../../../infra/supabase/migrations/0047_roster_rpcs.sql) lines 208-221, and inside the `for v_inv ... loop`, immediately AFTER the existing `insert into event_invitations (...) ... on conflict do nothing;`, add:
```sql
      if found then
        insert into event_activity (event_id, actor_id, action, detail)
        values (p_event_id, v_user, 'invited',
          jsonb_build_object('target_name',
            coalesce(v_inv->>'name',
                     (select full_name from profiles where id = nullif(v_inv->>'invitee_id','')::uuid))));
      end if;
```

**(c) `accept_event_invitation`** — copy verbatim from 0047 lines 223-275; immediately AFTER the `perform pg_advisory_xact_lock(...)` line (so it logs on every accept path), add:
```sql
  insert into event_activity (event_id, actor_id, action, detail)
  values (p_event_id, v_user, 'invite_accepted', '{}'::jsonb);
```

**(d) `decline_event_invitation`** — copy verbatim from 0047 lines 277-284; after the existing `update event_invitations set status='declined' ...;`, add:
```sql
  if found then
    insert into event_activity (event_id, actor_id, action, detail)
    values (p_event_id, v_user, 'invite_declined', '{}'::jsonb);
  end if;
```

**(e) `organizer_mark_confirmed`** — copy verbatim from 0047 lines 286-297; after the `update event_participants set status='confirmed' ...;`, add:
```sql
  insert into event_activity (event_id, actor_id, action, detail)
  select v_event, v_user, 'confirmed', jsonb_build_object('target_name', coalesce(p.full_name, ep.guest_name))
  from event_participants ep left join profiles p on p.id = ep.user_id
  where ep.id = p_participant_id;
```

**(f) `organizer_remove_participant`** — copy verbatim from 0047 lines 299-326; add `v_target_name text;` to the DECLARE line; immediately AFTER the existing `select event_id, user_id into v_event, v_target_user from event_participants where id = p_participant_id;`, add (derive the name BEFORE the row is deleted):
```sql
  select coalesce(p.full_name, ep.guest_name) into v_target_name
    from event_participants ep left join profiles p on p.id = ep.user_id where ep.id = p_participant_id;
```
and at the very end of the function (before `end; $$;`), add:
```sql
  insert into event_activity (event_id, actor_id, action, detail)
  values (v_event, v_user, 'removed', jsonb_build_object('target_name', v_target_name, 'mode', p_mode));
```

**(g) `add_manual_participant`** — copy verbatim from 0047 lines 328-341; immediately AFTER the `insert into event_participants (...) returning id into v_pid;` and BEFORE `return v_pid;`, add:
```sql
  insert into event_activity (event_id, actor_id, action, detail)
  values (p_event_id, v_user, 'guest_added', jsonb_build_object('guest_name', btrim(p_name)));
```

**(h) `mark_paid`** — copy verbatim from 0047 lines 343-353; after the `update event_participants set has_paid=p_paid ...;`, add:
```sql
  insert into event_activity (event_id, actor_id, action, detail)
  select v_event, v_user, case when p_paid then 'marked_paid' else 'marked_unpaid' end,
         jsonb_build_object('target_name', coalesce(p.full_name, ep.guest_name))
  from event_participants ep left join profiles p on p.id = ep.user_id where ep.id = p_participant_id;
```

**(i) `mark_all_paid`** — copy verbatim from 0047 lines 355-363; after the `update event_participants set has_paid=true ...;`, add:
```sql
  insert into event_activity (event_id, actor_id, action, detail)
  values (p_event_id, v_user, 'marked_all_paid', '{}'::jsonb);
```

**(j) `organizer_assign_to_team`** — copy verbatim from [0071_organizer_team_rpcs.sql](../../../infra/supabase/migrations/0071_organizer_team_rpcs.sql) lines 42-76; after the final `perform _reconcile_team(v_team_id);`, add:
```sql
  insert into event_activity (event_id, actor_id, action, detail)
  select p_event_id, v_user, 'team_assigned',
         jsonb_build_object('target_name', coalesce(p.full_name, ep.guest_name), 'team_number', p_team_number)
  from event_participants ep left join profiles p on p.id = ep.user_id where ep.id = p_participant_id;
```

**(k) `organizer_remove_from_team`** — copy verbatim from 0071 lines 78-89; after the `update event_participants set status='invited' ...;`, add:
```sql
  insert into event_activity (event_id, actor_id, action, detail)
  select p_event_id, v_user, 'team_removed', jsonb_build_object('target_name', coalesce(p.full_name, ep.guest_name))
  from event_participants ep left join profiles p on p.id = ep.user_id where ep.id = p_participant_id;
```

**(l) `organizer_switch_players`** — copy verbatim from 0071 lines 91-133; at the very end of the function (after the final `update event_participants ... ` and before `end; $$;`), add:
```sql
  insert into event_activity (event_id, actor_id, action, detail)
  values (p_event_id, v_user, 'team_switched', '{}'::jsonb);
```
(The two early `return;` paths — `p_a = p_b` and same-team — correctly skip logging.)

- [ ] **Step 2: Apply the migration**

Run: `export SUPABASE_AUTH_SMS_TWILIO_AUTH_TOKEN=local_test_token && pnpm dlx supabase@latest --workdir infra db reset`
Expected: clean, through `0081`. If a function fails to compile, the verbatim copy diverged — re-read the source migration for that function and reproduce it exactly, keeping only the added insert.

- [ ] **Step 3: Commit**

```bash
git add infra/supabase/migrations/0081_activity_logging.sql
git commit -m "feat(events): server-side activity logging for edit/invite/roster/team (A3)"
```

---

## Task 2: SQL test `activity_logging.sql`

**Files:**
- Create: `infra/supabase/tests/activity_logging.sql`

Follow the fixture style of [infra/supabase/tests/update_event_location.sql](../../../infra/supabase/tests/update_event_location.sql).

- [ ] **Step 1: Write the test**

```sql
-- A3: server-side activity logging. Verifies update_event logs 'event_edited' with the right
-- changed groups; invite_to_event logs one 'invited' per invitee; accept/decline log with the
-- invitee as actor; and a migrated organizer action (mark_confirmed) logs exactly once from the RPC.
-- 'PT001' = "expected behaviour did not hold" sentinel.
begin;
insert into auth.users (id, instance_id, aud, role, email) values
  ('e0000001-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000000','authenticated','authenticated','act-u1@x.com'),
  ('e0000002-0000-0000-0000-000000000002','00000000-0000-0000-0000-000000000000','authenticated','authenticated','act-p1@x.com') on conflict do nothing;
insert into profiles (id, email, phone, full_name) values
  ('e0000001-0000-0000-0000-000000000001','act-u1@x.com','+351900800001','ActOrganizer'),
  ('e0000002-0000-0000-0000-000000000002','act-p1@x.com','+351900800002','ActPlayer') on conflict do nothing;

do $$
declare
  u1  uuid := 'e0000001-0000-0000-0000-000000000001';
  p1  uuid := 'e0000002-0000-0000-0000-000000000002';
  cid uuid;
  g   uuid;
  ev  uuid;
  pid uuid;
  base jsonb;
  v_changes jsonb;
  n int;
  v_actor uuid;
begin
  perform set_config('role','authenticated',true);
  perform set_config('request.jwt.claims','{"sub":"e0000001-0000-0000-0000-000000000001","role":"authenticated"}',true);
  cid := create_community_with_personal_tenant('ActC','club','PT','public');

  perform set_config('role','postgres',true);
  select id into g from groups where community_id = cid order by created_at limit 1;
  insert into events (
    group_id, organizer_id, event_type, specification, scoring_mode, scoring_value,
    num_courts, starts_at, duration_minutes, organizer_role, name, status, is_private
  ) values (
    g, u1, 'americano', 'classic', 'points', 24,
    2, now() + interval '2 day', 90, 'organizing_only', 'ActEv', 'scheduled', false
  ) returning id into ev;

  base := jsonb_build_object(
    'name','ActEv','description','d',
    'starts_at',(now()+interval '2 day')::text,'duration_minutes',90,
    'scoring_mode','points','scoring_value',24,
    'allow_standby',false,'is_private',false,
    'entrance_fee_enabled',false,'players_submit_results',false,'organizer_role','organizing_only',
    'num_courts',2,'has_location',false,
    'manual_location_name',null,'manual_location_address',null,'venue_id',null);

  -- (1) edit: change starts_at (+3 day) and scoring_value -> event_edited with ['date','scoring'].
  perform set_config('role','authenticated',true);
  perform update_event(ev, base || jsonb_build_object('starts_at',(now()+interval '3 day')::text,'scoring_value',32));
  perform set_config('role','postgres',true);
  select detail->'changes' into v_changes from event_activity where event_id=ev and action='event_edited';
  if v_changes is null or not (v_changes ? 'date') or not (v_changes ? 'scoring') then
    raise exception using errcode='PT001', message='event_edited should record date+scoring, got '||coalesce(v_changes::text,'<null>');
  end if;
  raise notice 'OK edit logs event_edited with changed groups';

  -- (2) invite two people -> two 'invited' rows.
  perform set_config('role','authenticated',true);
  perform invite_to_event(ev, jsonb_build_array(
    jsonb_build_object('invitee_id', p1::text),
    jsonb_build_object('name','Guest Invite','email','gi@x.com')));
  perform set_config('role','postgres',true);
  select count(*) into n from event_activity where event_id=ev and action='invited';
  if n <> 2 then
    raise exception using errcode='PT001', message='expected 2 invited rows, got '||n;
  end if;
  raise notice 'OK invite logs one invited per invitee';

  -- (3) p1 accepts -> invite_accepted with actor = p1.
  perform set_config('role','authenticated',true);
  perform set_config('request.jwt.claims','{"sub":"e0000002-0000-0000-0000-000000000002","role":"authenticated"}',true);
  perform accept_event_invitation(ev);
  perform set_config('role','postgres',true);
  select actor_id into v_actor from event_activity where event_id=ev and action='invite_accepted';
  if v_actor is distinct from p1 then
    raise exception using errcode='PT001', message='invite_accepted actor should be the invitee';
  end if;
  raise notice 'OK accept logs invite_accepted (actor=invitee)';

  -- (4) organizer mark_confirmed -> exactly one server-side 'confirmed' row with target_name.
  perform set_config('role','postgres',true);
  select id into pid from event_participants where event_id=ev and user_id=p1;
  perform set_config('role','authenticated',true);
  perform set_config('request.jwt.claims','{"sub":"e0000001-0000-0000-0000-000000000001","role":"authenticated"}',true);
  perform organizer_mark_confirmed(pid);
  perform set_config('role','postgres',true);
  select count(*) into n from event_activity where event_id=ev and action='confirmed';
  if n <> 1 then
    raise exception using errcode='PT001', message='expected exactly one confirmed row from the RPC, got '||n;
  end if;
  if not exists (select 1 from event_activity where event_id=ev and action='confirmed'
                 and detail->>'target_name' = 'ActPlayer') then
    raise exception using errcode='PT001', message='confirmed row should carry server-derived target_name';
  end if;
  raise notice 'OK organizer_mark_confirmed logs server-side once with target_name';

  raise notice 'OK activity_logging';
end $$;
rollback;
```

- [ ] **Step 2: Run the test**

Run: `docker exec -i supabase_db_padeljam psql -U postgres -d postgres < infra/supabase/tests/activity_logging.sql`
Expected: `OK …` notices ending in `OK activity_logging`; no `PT001`/`ERROR`. A `PT001` means a real logging bug — STOP and report. A fixture column error → fix the fixture only (check 0040/0041).

- [ ] **Step 3: Re-run existing roster/team tests for regression**

Run: `ls infra/supabase/tests/ | grep -Ei 'roster|team|organizer|invite'` then run each match with `docker exec -i supabase_db_padeljam psql -U postgres -d postgres < infra/supabase/tests/<file>` and confirm each ends in its `OK …` with no `PT001`. (These exercise the recreated RPCs' behavior — they must still pass.)

- [ ] **Step 4: Commit**

```bash
git add infra/supabase/tests/activity_logging.sql
git commit -m "test(events): server-side activity logging SQL test (A3)"
```

---

## Task 3: `@padel/api` — drop duplicate client logging, add invalidation

**Files:**
- Modify: `packages/api/src/events/mutations.ts`

Context: the recreated RPCs now log server-side, so the client `logActivity(...)` calls in these 8 hooks would DOUBLE-log — remove them. Keep the `logActivity` helper + its use in `useJoinEvent`/`useLeaveEvent`. The roster/team hooks already invalidate `qk.eventActivity`; the 4 gap hooks do not — add it.

- [ ] **Step 1: Remove the duplicate `logActivity` calls**

Delete the single `await logActivity(db, eventId, ...)` line from each of these hooks (and only that line; keep everything else including `return data;` where present):
- `useMarkConfirmed` (the `'confirmed'` log)
- `useRemoveParticipant` (`'removed'`)
- `useAddManualParticipant` (`'guest_added'`)
- `useMarkPaid` (`'marked_paid'/'marked_unpaid'`)
- `useMarkAllPaid` (`'marked_all_paid'`)
- `useAssignToTeam` (`'team_assigned'`)
- `useRemoveFromTeam` (`'team_removed'`)
- `useSwitchPlayers` (`'team_switched'`)

Do NOT touch `useJoinEvent`/`useLeaveEvent` (keep their `logActivity`). Leave the `logActivity` helper definition intact.

- [ ] **Step 2: Add activity-cache invalidation to the 4 gap hooks**

Add `qc.invalidateQueries({ queryKey: qk.eventActivity(<eventId>) });` to the `onSuccess` of:
- `useUpdateEvent` → use `eventId`
- `useInviteToEvent` → use `eventId`
- `useAcceptEventInvitation` → use `input.eventId`
- `useDeclineEventInvitation` → use `eventId`

(Each of these hooks already has a `qc`/`useQueryClient()` in scope — verify; `useUpdateEvent` and the invitation hooks shown around lines 58-76 and 232-280 do.)

- [ ] **Step 3: Verify**

Run: `pnpm -w typecheck && pnpm --filter @padel/api test`
Expected: typecheck 13/13; tests pass. If removing a `logActivity` call leaves an unused variable (e.g. an `input.targetName` field now unreferenced), that's fine — the field stays in the input type (the screens still pass it); do not change call signatures. If `logActivity` itself becomes flagged unused, it is NOT (join/leave still use it).

- [ ] **Step 4: Commit**

```bash
git add packages/api/src/events/mutations.ts
git commit -m "feat(api): drop client activity logging for server-logged actions; invalidate activity (A3)"
```

---

## Task 4: Activity screen — render the new action types

**Files:**
- Modify: `apps/mobile/app/event/[id]/activity.tsx`
- Modify: `apps/mobile/lib/i18n-mobile.ts` (`event` English block)

- [ ] **Step 1: Extend the action→key map + edit rendering**

In `apps/mobile/app/event/[id]/activity.tsx`, in `lineFor`, add to the `key` map:
```tsx
    event_edited: 'activityEventEdited',
    invited: 'activityInvited',
    invite_accepted: 'activityInviteAccepted',
    invite_declined: 'activityInviteDeclined',
```
Then, for `event_edited`, append the changed groups in parentheses. After the `key` map and before the final `return`, add:
```tsx
  if (row.action === 'event_edited') {
    const changes = Array.isArray((row.detail as { changes?: unknown })?.changes)
      ? ((row.detail as { changes: string[] }).changes)
      : [];
    const words = changes.map((c) => t(`activityGroup_${c}` as never)).join(', ');
    const base = t('activityEventEdited', { actor });
    return words ? `${base} (${words})` : base;
  }
```
(Keep the existing final `return t(key[row.action] ?? 'activityJoined', { actor, target });`. `row.detail` typing: if the `ActivityRow.detail` interface doesn't allow `changes`, widen it in queries.ts — add `changes?: string[]` to the `detail` shape in `ActivityRow` in `packages/api/src/events/queries.ts`.)

- [ ] **Step 2: Add i18n keys**

In `apps/mobile/lib/i18n-mobile.ts`, add to the `event` English block (near the other `activity*` keys):
```ts
    activityEventEdited: '{{actor}} edited the event',
    activityInvited: '{{actor}} invited {{target}}',
    activityInviteAccepted: '{{actor}} accepted their invitation',
    activityInviteDeclined: '{{actor}} declined their invitation',
    activityGroup_date: 'date',
    activityGroup_location: 'location',
    activityGroup_scoring: 'scoring',
    activityGroup_preferences: 'preferences',
    activityGroup_details: 'details',
```

- [ ] **Step 3: Typecheck**

Run: `pnpm -w typecheck`
Expected: passes (13/13). If `ActivityRow.detail` needed widening (Step 1), make that edit in `packages/api/src/events/queries.ts` and add it to the commit.

- [ ] **Step 4: Commit**

```bash
git add apps/mobile/app/event/[id]/activity.tsx apps/mobile/lib/i18n-mobile.ts packages/api/src/events/queries.ts
git commit -m "feat(mobile): render edit/invite activity log entries (A3)"
```

---

## Verification (end-to-end)

1. **DB:** `db reset` clean through 0081; `activity_logging.sql` → `OK activity_logging`; existing roster/team tests still `OK`.
2. **Types/API:** `pnpm -w typecheck` (13/13) and `pnpm --filter @padel/api test` pass.
3. **App (simulator):** as organizer, edit an event / invite someone / confirm a player → each appears once in the Activity log with correct copy (edit shows the changed groups); an invitee accepting/declining shows in the organizer's log; no duplicate entries for organizer/team actions.

## Out of scope (this slice)

PT/PT-BR copy (A5); per-field-group edit rows; changing `log_event_activity` or the join/leave client path.
