# Phase 2A — Notifications Feed + Producers Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the in-app notifications system — a `notifications` table fed by DB triggers, a real-time feed screen with read-state + an unread bell badge, and inline Join CTAs that flip to "Joined".

**Architecture:** Postgres `SECURITY DEFINER` triggers on `follows` / `event_invitations` / `group_invitations` / `community_invitations` / `community_join_requests` / `event_participants` insert own-row-RLS-protected rows into `notifications`, capturing denormalized `actor_name`/`entity_name` snapshots. Thin TanStack hooks in `@padel/api/notifications` read/mutate the rows; a realtime subscription keeps the feed + badge live. The mobile feed renders localized sentences from `type` + snapshots; the bell mounts on the Profile tab this phase (Home header in Phase 3).

**Tech Stack:** Supabase Postgres (migrations + RLS + triggers + Realtime), `@padel/api` (TanStack Query), Expo Router + React Native + `@shopify/flash-list`, `@padel/i18n`.

**Spec:** `docs/superpowers/specs/2026-06-15-phase2-notifications-design.md`

**Verification harness (run from repo root):**
```bash
export SUPABASE_AUTH_SMS_TWILIO_AUTH_TOKEN=local_test_token
pnpm dlx supabase@latest --workdir infra db reset
docker exec -i supabase_db_padeljam psql -U postgres -d postgres < infra/supabase/tests/notifications.sql
```
Expect `OK ...` notices; any `PT001` exception fails the test.

---

## File Structure

- **Create** `infra/supabase/migrations/0061_notifications.sql` — table + indexes + RLS + realtime publication + 6 producer triggers + `partner_request_summary()` RPC.
- **Create** `infra/supabase/tests/notifications.sql` — RLS, every trigger (fires / self-suppressed / block-suppressed), and `partner_request_summary`.
- **Modify** `packages/db/src/database.types.ts` — hand-add the `notifications` table + `partner_request_summary` function (CLI gen crashes on this CPU).
- **Create** `packages/api/src/notifications/queries.ts` — `useNotifications`, `useUnreadCount`, `usePartnerRequestSummary`.
- **Create** `packages/api/src/notifications/mutations.ts` — `useMarkRead`, `useMarkAllRead`, `useClearAll`, `useCompleteNotificationCta`.
- **Create** `packages/api/src/notifications/realtime.ts` — `useNotificationsRealtime`.
- **Modify** `packages/api/src/query-keys.ts` — add `notifications`, `notificationsUnread`, `partnerRequestSummary`.
- **Modify** `packages/api/src/index.ts` — re-export the three new files.
- **Modify** `apps/mobile/lib/i18n-mobile.ts` — add the `notifications` namespace + register it.
- **Create** `apps/mobile/app/notifications/index.tsx` — the feed screen.
- **Create** `apps/mobile/components/NotificationBell.tsx` — bell + badge.
- **Modify** `apps/mobile/app/(tabs)/profile.tsx` — mount the bell as the temporary entry point.
- **Modify** the authed layout (`apps/mobile/app/(tabs)/_layout.tsx`) — mount `useNotificationsRealtime()` once.

**ID conventions for tests:** use UUIDs prefixed `f7xxxxxx-...` (the `f6` space is used by `support_tickets.sql`; `f7` avoids collision).

---

## Task 1: notifications table + RLS + realtime + types

**Files:**
- Create: `infra/supabase/migrations/0061_notifications.sql`
- Create: `infra/supabase/tests/notifications.sql`
- Modify: `packages/db/src/database.types.ts`

- [ ] **Step 1: Create the migration with table, indexes, RLS, realtime**

Write `infra/supabase/migrations/0061_notifications.sql`:

```sql
-- 0061_notifications.sql
-- In-app notifications: trigger-fed, own-row RLS, realtime. (Phase 2A)

create table notifications (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references profiles(id) on delete cascade,   -- recipient
  type         text not null check (type in (
                 'event_invite','group_invite','community_invite',
                 'community_request_accepted','follow','follow_joined_event')),
  actor_id     uuid references profiles(id) on delete set null,
  event_id     uuid references events(id)      on delete cascade,
  group_id     uuid references groups(id)      on delete cascade,
  community_id uuid references communities(id) on delete cascade,
  ref_id       uuid,                                                       -- source invite/request row (Join CTA)
  actor_name   text,
  entity_name  text,
  read_at      timestamptz,
  cta_done     boolean not null default false,
  created_at   timestamptz not null default now()
);
create index notifications_user_created_idx on notifications(user_id, created_at desc);
create index notifications_user_unread_idx  on notifications(user_id) where read_at is null;

alter table notifications enable row level security;

-- Own-row only. No INSERT policy for authenticated: rows come only from the
-- SECURITY DEFINER trigger functions below (which bypass RLS).
create policy "notifications: read own" on notifications for select
  using (user_id = auth.uid());
create policy "notifications: update own" on notifications for update
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "notifications: delete own" on notifications for delete
  using (user_id = auth.uid());

alter publication supabase_realtime add table notifications;
```

- [ ] **Step 2: Hand-add the generated types**

In `packages/db/src/database.types.ts`, add to the `Tables` block (mirror an existing entry's Row/Insert/Update shape):

```ts
      notifications: {
        Row: {
          id: string
          user_id: string
          type: string
          actor_id: string | null
          event_id: string | null
          group_id: string | null
          community_id: string | null
          ref_id: string | null
          actor_name: string | null
          entity_name: string | null
          read_at: string | null
          cta_done: boolean
          created_at: string
        }
        Insert: {
          id?: string
          user_id: string
          type: string
          actor_id?: string | null
          event_id?: string | null
          group_id?: string | null
          community_id?: string | null
          ref_id?: string | null
          actor_name?: string | null
          entity_name?: string | null
          read_at?: string | null
          cta_done?: boolean
          created_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          type?: string
          actor_id?: string | null
          event_id?: string | null
          group_id?: string | null
          community_id?: string | null
          ref_id?: string | null
          actor_name?: string | null
          entity_name?: string | null
          read_at?: string | null
          cta_done?: boolean
          created_at?: string
        }
        Relationships: []
      }
```

- [ ] **Step 3: Write the RLS test**

Create `infra/supabase/tests/notifications.sql`. (Triggers/RPC test blocks are appended in Tasks 2 & 3 — this step is just the file header + the RLS block.)

```sql
-- notifications: RLS (own-row), producer triggers, and partner_request_summary.
begin;
insert into auth.users (id, instance_id, aud, role, email) values
  ('f7000001-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000000','authenticated','authenticated','n1@x.com'),
  ('f7000002-0000-0000-0000-000000000002','00000000-0000-0000-0000-000000000000','authenticated','authenticated','n2@x.com'),
  ('f7000003-0000-0000-0000-000000000003','00000000-0000-0000-0000-000000000000','authenticated','authenticated','n3@x.com')
  on conflict do nothing;
insert into profiles (id, email, phone, full_name) values
  ('f7000001-0000-0000-0000-000000000001','n1@x.com','+351900040001','Alice N'),
  ('f7000002-0000-0000-0000-000000000002','n2@x.com','+351900040002','Bob N'),
  ('f7000003-0000-0000-0000-000000000003','n3@x.com','+351900040003','Carol N')
  on conflict do nothing;

do $$
declare a constant uuid := 'f7000001-0000-0000-0000-000000000001';
  b constant uuid := 'f7000002-0000-0000-0000-000000000002';
begin
  -- Seed a row for Alice via definer bypass (insert as superuser, RLS not yet in role context).
  insert into notifications (user_id, type, actor_id, actor_name) values (a, 'follow', b, 'Bob N');

  -- Act as Bob: must NOT see Alice's notification.
  perform set_config('role','authenticated',true);
  perform set_config('request.jwt.claims', format('{"sub":"%s","role":"authenticated"}', b), true);
  if exists (select 1 from notifications where user_id = a) then
    raise exception using errcode='PT001', message='RLS: other user notification visible'; end if;

  -- Act as Alice: sees her own, can mark read, can delete.
  perform set_config('request.jwt.claims', format('{"sub":"%s","role":"authenticated"}', a), true);
  if not exists (select 1 from notifications where user_id = a and type='follow') then
    raise exception using errcode='PT001', message='RLS: own notification not visible'; end if;
  update notifications set read_at = now() where user_id = a;
  if exists (select 1 from notifications where user_id = a and read_at is null) then
    raise exception using errcode='PT001', message='mark-read failed'; end if;
  delete from notifications where user_id = a;
  if exists (select 1 from notifications where user_id = a) then
    raise exception using errcode='PT001', message='delete-own failed'; end if;

  raise notice 'OK notifications_rls';
end $$;
rollback;
```

- [ ] **Step 4: Run the migration + RLS test**

```bash
export SUPABASE_AUTH_SMS_TWILIO_AUTH_TOKEN=local_test_token
pnpm dlx supabase@latest --workdir infra db reset
docker exec -i supabase_db_padeljam psql -U postgres -d postgres < infra/supabase/tests/notifications.sql
```
Expected: `NOTICE: OK notifications_rls`, no `PT001`.

- [ ] **Step 5: Typecheck the db package**

Run: `pnpm --filter @padel/db typecheck`
Expected: PASS (no output errors).

- [ ] **Step 6: Commit**

```bash
git add infra/supabase/migrations/0061_notifications.sql infra/supabase/tests/notifications.sql packages/db/src/database.types.ts
git commit -m "feat(notifications): notifications table + own-row RLS + realtime + types"
```

---

## Task 2: partner_request_summary() RPC

**Files:**
- Modify: `infra/supabase/migrations/0061_notifications.sql` (append)
- Modify: `infra/supabase/tests/notifications.sql` (append a test block before final `rollback` of a new transaction)
- Modify: `packages/db/src/database.types.ts` (Functions block)

- [ ] **Step 1: Append the RPC to the migration**

Append to `infra/supabase/migrations/0061_notifications.sql`:

```sql
-- Pending "partner requests" the caller must act on, across two sources:
--   (a) partner_requests for events the caller organizes, and
--   (b) community_join_requests for communities the caller owns.
create or replace function partner_request_summary() returns integer
language sql stable security definer set search_path = public as $$
  select
    (select count(*) from partner_requests pr
       join events e on e.id = pr.event_id
      where e.organizer_id = auth.uid() and pr.status = 'pending')
  + (select count(*) from community_join_requests jr
      where jr.status = 'pending'
        and exists (select 1 from community_members cm
                     where cm.community_id = jr.community_id
                       and cm.user_id = auth.uid() and cm.role = 'owner'));
$$;
grant execute on function partner_request_summary() to authenticated;
```

- [ ] **Step 2: Add the function type**

In `packages/db/src/database.types.ts`, add to the `Functions` block:

```ts
      partner_request_summary: {
        Args: Record<PropertyKey, never>
        Returns: number
      }
```

- [ ] **Step 3: Append the RPC test**

Append to `infra/supabase/tests/notifications.sql` (a fresh `begin; ... rollback;` block, after the RLS block's `rollback;`):

```sql
-- partner_request_summary: counts pending event partner-requests for events I organize.
begin;
insert into auth.users (id, instance_id, aud, role, email) values
  ('f7000010-0000-0000-0000-000000000010','00000000-0000-0000-0000-000000000000','authenticated','authenticated','pq1@x.com'),
  ('f7000011-0000-0000-0000-000000000011','00000000-0000-0000-0000-000000000000','authenticated','authenticated','pq2@x.com'),
  ('f7000012-0000-0000-0000-000000000012','00000000-0000-0000-0000-000000000000','authenticated','authenticated','pq3@x.com')
  on conflict do nothing;
insert into profiles (id, email, phone, full_name) values
  ('f7000010-0000-0000-0000-000000000010','pq1@x.com','+351900040010','Org PQ'),
  ('f7000011-0000-0000-0000-000000000011','pq2@x.com','+351900040011','Req PQ'),
  ('f7000012-0000-0000-0000-000000000012','pq3@x.com','+351900040012','Tgt PQ')
  on conflict do nothing;

do $$
declare org constant uuid := 'f7000010-0000-0000-0000-000000000010';
  req constant uuid := 'f7000011-0000-0000-0000-000000000011';
  tgt constant uuid := 'f7000012-0000-0000-0000-000000000012';
  v_event uuid;
  v_count int;
begin
  insert into events (organizer_id, event_type, specification, scoring_mode, scoring_value,
                      manual_location_name, has_location, starts_at, duration_minutes,
                      organizer_role, name, status)
    values (org, 'americano', 'mixed', 'points', 24, 'Court A', true, now() + interval '1 day',
            90, 'organizing_and_playing', 'PQ Event', 'published')
    returning id into v_event;
  insert into partner_requests (event_id, requester_id, target_id, status)
    values (v_event, req, tgt, 'pending');

  perform set_config('role','authenticated',true);
  perform set_config('request.jwt.claims', format('{"sub":"%s","role":"authenticated"}', org), true);
  select partner_request_summary() into v_count;
  if v_count <> 1 then
    raise exception using errcode='PT001', message=format('summary expected 1 got %s', v_count); end if;

  -- A non-organizer sees 0.
  perform set_config('request.jwt.claims', format('{"sub":"%s","role":"authenticated"}', req), true);
  select partner_request_summary() into v_count;
  if v_count <> 0 then
    raise exception using errcode='PT001', message=format('non-organizer summary expected 0 got %s', v_count); end if;

  raise notice 'OK partner_request_summary';
end $$;
rollback;
```

> **Note on event columns:** the `events` insert above lists the NOT-NULL columns observed in `0040_events_core.sql` (`organizer_id, event_type, specification, scoring_mode, scoring_value, manual_location_name, has_location, starts_at, duration_minutes, organizer_role, name`). If `db reset` reports a NOT-NULL/CHECK violation, read the failing column from the psql error and add it to the insert — do not guess additional columns away.

- [ ] **Step 4: Run migration + test**

```bash
pnpm dlx supabase@latest --workdir infra db reset
docker exec -i supabase_db_padeljam psql -U postgres -d postgres < infra/supabase/tests/notifications.sql
```
Expected: `OK notifications_rls` and `OK partner_request_summary`.

- [ ] **Step 5: Typecheck db**

Run: `pnpm --filter @padel/db typecheck`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add infra/supabase/migrations/0061_notifications.sql infra/supabase/tests/notifications.sql packages/db/src/database.types.ts
git commit -m "feat(notifications): partner_request_summary RPC + test"
```

---

## Task 3: producer triggers

**Files:**
- Modify: `infra/supabase/migrations/0061_notifications.sql` (append the 6 trigger functions + triggers)
- Modify: `infra/supabase/tests/notifications.sql` (append trigger test blocks)

Each trigger function is `language plpgsql security definer set search_path = public`, runs `after insert`/`after update`, and **must not raise** (it no-ops on missing data so the originating write always succeeds). A shared block-check helper keeps the suppression logic DRY.

- [ ] **Step 1: Append the block-check helper + a shared insert helper**

Append to `infra/supabase/migrations/0061_notifications.sql`:

```sql
-- True when either user has blocked the other (suppress notifications between them).
create or replace function notif_blocked(u1 uuid, u2 uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from blocks
    where (blocker_id = u1 and blocked_id = u2)
       or (blocker_id = u2 and blocked_id = u1));
$$;
```

- [ ] **Step 2: Append the 6 trigger functions + triggers**

Append to `infra/supabase/migrations/0061_notifications.sql`:

```sql
-- 1. follow: notify the followee.
create or replace function notify_on_follow() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_actor text;
begin
  if NEW.follower_id = NEW.followee_id then return NEW; end if;
  if notif_blocked(NEW.follower_id, NEW.followee_id) then return NEW; end if;
  select full_name into v_actor from profiles where id = NEW.follower_id;
  insert into notifications (user_id, type, actor_id, actor_name)
    values (NEW.followee_id, 'follow', NEW.follower_id, v_actor);
  return NEW;
end; $$;
create trigger trg_notify_on_follow after insert on follows
  for each row execute function notify_on_follow();

-- 2. event invitation (covers private-event + group-general-event invites).
create or replace function notify_on_event_invite() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_actor text; v_name text;
begin
  if NEW.invitee_id is null or NEW.status <> 'pending' then return NEW; end if;
  if NEW.invitee_id = NEW.invited_by then return NEW; end if;
  if notif_blocked(NEW.invited_by, NEW.invitee_id) then return NEW; end if;
  select full_name into v_actor from profiles where id = NEW.invited_by;
  select name into v_name from events where id = NEW.event_id;
  insert into notifications (user_id, type, actor_id, event_id, ref_id, actor_name, entity_name)
    values (NEW.invitee_id, 'event_invite', NEW.invited_by, NEW.event_id, NEW.id, v_actor, v_name);
  return NEW;
end; $$;
create trigger trg_notify_on_event_invite after insert on event_invitations
  for each row execute function notify_on_event_invite();

-- 3. group invitation.
create or replace function notify_on_group_invite() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_actor text; v_name text;
begin
  if NEW.invitee_id = NEW.inviter_id then return NEW; end if;
  if notif_blocked(NEW.inviter_id, NEW.invitee_id) then return NEW; end if;
  select full_name into v_actor from profiles where id = NEW.inviter_id;
  select name into v_name from groups where id = NEW.group_id;
  insert into notifications (user_id, type, actor_id, group_id, ref_id, actor_name, entity_name)
    values (NEW.invitee_id, 'group_invite', NEW.inviter_id, NEW.group_id, NEW.id, v_actor, v_name);
  return NEW;
end; $$;
create trigger trg_notify_on_group_invite after insert on group_invitations
  for each row execute function notify_on_group_invite();

-- 4. community invitation.
create or replace function notify_on_community_invite() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_actor text; v_name text;
begin
  if NEW.invitee_id = NEW.inviter_id then return NEW; end if;
  if notif_blocked(NEW.inviter_id, NEW.invitee_id) then return NEW; end if;
  select full_name into v_actor from profiles where id = NEW.inviter_id;
  select name into v_name from communities where id = NEW.community_id;
  insert into notifications (user_id, type, actor_id, community_id, ref_id, actor_name, entity_name)
    values (NEW.invitee_id, 'community_invite', NEW.inviter_id, NEW.community_id, NEW.id, v_actor, v_name);
  return NEW;
end; $$;
create trigger trg_notify_on_community_invite after insert on community_invitations
  for each row execute function notify_on_community_invite();

-- 5. community join request accepted: notify the requester.
create or replace function notify_on_join_accepted() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_name text;
begin
  if NEW.status <> 'accepted' or OLD.status = 'accepted' then return NEW; end if;
  select name into v_name from communities where id = NEW.community_id;
  insert into notifications (user_id, type, community_id, ref_id, entity_name)
    values (NEW.user_id, 'community_request_accepted', NEW.community_id, NEW.id, v_name);
  return NEW;
end; $$;
create trigger trg_notify_on_join_accepted after update on community_join_requests
  for each row execute function notify_on_join_accepted();

-- 6. a followed user joined an event: notify each follower of the joiner.
create or replace function notify_on_participant_join() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_actor text; v_name text;
begin
  if NEW.user_id is null then return NEW; end if;            -- guests have no user_id
  select full_name into v_actor from profiles where id = NEW.user_id;
  select name into v_name from events where id = NEW.event_id;
  insert into notifications (user_id, type, actor_id, event_id, actor_name, entity_name)
    select f.follower_id, 'follow_joined_event', NEW.user_id, NEW.event_id, v_actor, v_name
    from follows f
    where f.followee_id = NEW.user_id
      and f.follower_id <> NEW.user_id
      and not notif_blocked(f.follower_id, NEW.user_id);
  return NEW;
end; $$;
create trigger trg_notify_on_participant_join after insert on event_participants
  for each row execute function notify_on_participant_join();
```

- [ ] **Step 3: Append trigger tests**

Append to `infra/supabase/tests/notifications.sql` (new `begin; ... rollback;` block):

```sql
-- producer triggers: follow fires + self-suppressed + block-suppressed; participant-join fans out.
begin;
insert into auth.users (id, instance_id, aud, role, email) values
  ('f7000020-0000-0000-0000-000000000020','00000000-0000-0000-0000-000000000000','authenticated','authenticated','tg1@x.com'),
  ('f7000021-0000-0000-0000-000000000021','00000000-0000-0000-0000-000000000000','authenticated','authenticated','tg2@x.com'),
  ('f7000022-0000-0000-0000-000000000022','00000000-0000-0000-0000-000000000000','authenticated','authenticated','tg3@x.com')
  on conflict do nothing;
insert into profiles (id, email, phone, full_name) values
  ('f7000020-0000-0000-0000-000000000020','tg1@x.com','+351900040020','Follower One'),
  ('f7000021-0000-0000-0000-000000000021','tg2@x.com','+351900040021','Joiner Two'),
  ('f7000022-0000-0000-0000-000000000022','tg3@x.com','+351900040022','Blocker Three')
  on conflict do nothing;

do $$
declare f1 constant uuid := 'f7000020-0000-0000-0000-000000000020';
  j2 constant uuid := 'f7000021-0000-0000-0000-000000000021';
  b3 constant uuid := 'f7000022-0000-0000-0000-000000000022';
  v_event uuid;
begin
  -- follow fires: f1 follows j2 -> j2 gets a 'follow' notification with actor snapshot.
  insert into follows (follower_id, followee_id) values (f1, j2);
  if not exists (select 1 from notifications
                  where user_id = j2 and type = 'follow' and actor_id = f1 and actor_name = 'Follower One') then
    raise exception using errcode='PT001', message='follow trigger did not fire'; end if;

  -- block-suppressed: b3 blocks j2; b3 follows j2 -> NO notification to j2.
  insert into blocks (blocker_id, blocked_id) values (b3, j2);
  insert into follows (follower_id, followee_id) values (b3, j2);
  if exists (select 1 from notifications where user_id = j2 and actor_id = b3) then
    raise exception using errcode='PT001', message='block did not suppress follow notification'; end if;

  -- participant-join fan-out: j2 joins an event -> follower f1 gets 'follow_joined_event'.
  insert into events (organizer_id, event_type, specification, scoring_mode, scoring_value,
                      manual_location_name, has_location, num_courts, is_private, starts_at,
                      duration_minutes, organizer_role, name, status)
    values (b3, 'americano', 'mixed', 'points', 24, 'Court B', true, 2, true, now() + interval '1 day',
            90, 'organizing_and_playing', 'Join Event', 'scheduled')
    returning id into v_event;
  insert into event_participants (event_id, user_id, status) values (v_event, j2, 'confirmed');
  if not exists (select 1 from notifications
                  where user_id = f1 and type = 'follow_joined_event' and event_id = v_event
                        and entity_name = 'Join Event') then
    raise exception using errcode='PT001', message='participant-join fan-out did not reach follower'; end if;

  raise notice 'OK notifications_triggers';
end $$;
rollback;
```

- [ ] **Step 4: Run migration + all tests**

```bash
pnpm dlx supabase@latest --workdir infra db reset
docker exec -i supabase_db_padeljam psql -U postgres -d postgres < infra/supabase/tests/notifications.sql
```
Expected: `OK notifications_rls`, `OK partner_request_summary`, `OK notifications_triggers`.

- [ ] **Step 5: Commit**

```bash
git add infra/supabase/migrations/0061_notifications.sql infra/supabase/tests/notifications.sql
git commit -m "feat(notifications): 6 producer triggers + tests"
```

---

## Task 4: @padel/api notifications queries

**Files:**
- Create: `packages/api/src/notifications/queries.ts`
- Modify: `packages/api/src/query-keys.ts`
- Modify: `packages/api/src/index.ts`

- [ ] **Step 1: Add query keys**

In `packages/api/src/query-keys.ts`, add inside the `qk` object (after the `explorePlayersList` line):

```ts
  notifications: ['notifications'] as const,
  notificationsUnread: ['notifications', 'unread'] as const,
  partnerRequestSummary: ['notifications', 'partner-summary'] as const,
```

- [ ] **Step 2: Create the queries file**

Create `packages/api/src/notifications/queries.ts`:

```ts
import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { useSession } from '@padel/auth';
import { useDb } from '../client';
import { qk } from '../query-keys';

const PAGE_SIZE = 20;

export type NotificationRow = {
  id: string;
  type: string;
  actor_id: string | null;
  event_id: string | null;
  group_id: string | null;
  community_id: string | null;
  ref_id: string | null;
  actor_name: string | null;
  entity_name: string | null;
  read_at: string | null;
  cta_done: boolean;
  created_at: string;
};

export const useNotifications = () => {
  const db = useDb();
  const uid = useSession().session?.user.id;
  return useInfiniteQuery({
    queryKey: qk.notifications,
    enabled: !!uid,
    initialPageParam: 0,
    queryFn: async ({ pageParam: offset }) => {
      const { data, error } = await db
        .from('notifications')
        .select(
          'id, type, actor_id, event_id, group_id, community_id, ref_id, actor_name, entity_name, read_at, cta_done, created_at',
        )
        .order('created_at', { ascending: false })
        .range(offset as number, (offset as number) + PAGE_SIZE - 1);
      if (error) throw error;
      return (data ?? []) as NotificationRow[];
    },
    getNextPageParam: (lastPage: NotificationRow[], allPages: NotificationRow[][]) =>
      lastPage.length < PAGE_SIZE ? undefined : allPages.length * PAGE_SIZE,
  });
};

export const useUnreadCount = () => {
  const db = useDb();
  const uid = useSession().session?.user.id;
  return useQuery({
    queryKey: qk.notificationsUnread,
    enabled: !!uid,
    queryFn: async () => {
      const { count, error } = await db
        .from('notifications')
        .select('id', { count: 'exact', head: true })
        .is('read_at', null);
      if (error) throw error;
      return count ?? 0;
    },
  });
};

export const usePartnerRequestSummary = () => {
  const db = useDb();
  const uid = useSession().session?.user.id;
  return useQuery({
    queryKey: qk.partnerRequestSummary,
    enabled: !!uid,
    queryFn: async () => {
      const { data, error } = await db.rpc('partner_request_summary');
      if (error) throw error;
      return (data ?? 0) as number;
    },
  });
};
```

- [ ] **Step 3: Re-export**

In `packages/api/src/index.ts`, add after the `settings/mutations` line:

```ts
export * from './notifications/queries';
```

- [ ] **Step 4: Typecheck**

Run: `pnpm --filter @padel/api typecheck`
Expected: PASS. (If the `db.from('notifications')` row select complains, confirm Task 1's types landed.)

- [ ] **Step 5: Commit**

```bash
git add packages/api/src/notifications/queries.ts packages/api/src/query-keys.ts packages/api/src/index.ts
git commit -m "feat(api): notifications queries (list/unread/partner-summary)"
```

---

## Task 5: @padel/api notifications mutations + realtime

**Files:**
- Create: `packages/api/src/notifications/mutations.ts`
- Create: `packages/api/src/notifications/realtime.ts`
- Modify: `packages/api/src/index.ts`

- [ ] **Step 1: Create the mutations file**

Create `packages/api/src/notifications/mutations.ts`. `useCompleteNotificationCta` maps the notification `type` + `ref_id`/entity ids to the existing accept RPC, then sets `cta_done`.

```ts
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useDb } from '../client';
import { qk } from '../query-keys';
import type { NotificationRow } from './queries';

const invalidate = (qc: ReturnType<typeof useQueryClient>) => {
  qc.invalidateQueries({ queryKey: qk.notifications });
  qc.invalidateQueries({ queryKey: qk.notificationsUnread });
};

export const useMarkRead = () => {
  const db = useDb();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await db
        .from('notifications')
        .update({ read_at: new Date().toISOString() })
        .eq('id', id)
        .is('read_at', null);
      if (error) throw error;
    },
    onSuccess: () => invalidate(qc),
  });
};

export const useMarkAllRead = () => {
  const db = useDb();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const { error } = await db
        .from('notifications')
        .update({ read_at: new Date().toISOString() })
        .is('read_at', null);
      if (error) throw error;
    },
    onSuccess: () => invalidate(qc),
  });
};

export const useClearAll = () => {
  const db = useDb();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      // Delete every row the caller owns (RLS scopes this to auth.uid()).
      const { error } = await db
        .from('notifications')
        .delete()
        .not('id', 'is', null);
      if (error) throw error;
    },
    onSuccess: () => invalidate(qc),
  });
};

// Acts on an invitation notification's Join CTA, then flips cta_done.
export const useCompleteNotificationCta = () => {
  const db = useDb();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (n: NotificationRow) => {
      // Arg names match the existing accept hooks exactly: event/group accept by
      // ENTITY id, community accepts by INVITATION id (ref_id).
      if (n.type === 'event_invite' && n.event_id) {
        const { error } = await db.rpc('accept_event_invitation', { p_event_id: n.event_id });
        if (error) throw error;
      } else if (n.type === 'group_invite' && n.group_id) {
        const { error } = await db.rpc('accept_group_invitation', { p_group_id: n.group_id });
        if (error) throw error;
      } else if (n.type === 'community_invite' && n.ref_id) {
        const { error } = await db.rpc('accept_invitation', { p_invitation_id: n.ref_id });
        if (error) throw error;
      } else {
        throw new Error('not_a_cta_notification');
      }
      const { error: upErr } = await db
        .from('notifications')
        .update({ cta_done: true, read_at: new Date().toISOString() })
        .eq('id', n.id);
      if (upErr) throw upErr;
    },
    onSuccess: () => invalidate(qc),
  });
};
```

> **RPC arg names (verified against the existing hooks):** `accept_event_invitation` → `{ p_event_id }`, `accept_group_invitation` → `{ p_group_id }`, `accept_invitation` (community) → `{ p_invitation_id }`. The code above already uses these; do not change them.

- [ ] **Step 2: Create the realtime file**

Create `packages/api/src/notifications/realtime.ts` (mirrors `communities/realtime.ts`):

```ts
import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useSession } from '@padel/auth';
import { useDb } from '../client';
import { qk } from '../query-keys';

export const useNotificationsRealtime = () => {
  const db = useDb();
  const qc = useQueryClient();
  const uid = useSession().session?.user.id;
  useEffect(() => {
    if (!uid) return;
    const invalidate = () => {
      qc.invalidateQueries({ queryKey: qk.notifications });
      qc.invalidateQueries({ queryKey: qk.notificationsUnread });
    };
    const ch = db
      .channel('notifications:' + uid)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'notifications', filter: 'user_id=eq.' + uid },
        invalidate,
      )
      .subscribe();
    return () => {
      db.removeChannel(ch);
    };
  }, [db, qc, uid]);
};
```

- [ ] **Step 3: Re-export**

In `packages/api/src/index.ts`, add after the `notifications/queries` line:

```ts
export * from './notifications/mutations';
export * from './notifications/realtime';
```

- [ ] **Step 4: Typecheck**

Run: `pnpm --filter @padel/api typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/api/src/notifications/mutations.ts packages/api/src/notifications/realtime.ts packages/api/src/index.ts
git commit -m "feat(api): notifications mutations (mark/clear/cta) + realtime hook"
```

---

## Task 6: i18n notifications namespace

**Files:**
- Modify: `apps/mobile/lib/i18n-mobile.ts`

- [ ] **Step 1: Add the namespace**

In `apps/mobile/lib/i18n-mobile.ts`, add a `mobileNotifications` const next to the other `const mobile...` namespace objects (e.g. right after `mobileHome`):

```ts
const mobileNotifications = {
  en: {
    title: 'Notifications',
    partnerRequests: 'Partner Requests',
    pendingCount_one: '{{count}} pending',
    pendingCount_other: '{{count}} pendings',
    markAllRead: 'Mark all as read',
    clearAll: 'Clear all',
    join: 'Join',
    joined: 'Joined',
    empty: 'No notifications yet.',
    loadError: 'Could not load notifications.',
    // Sentence templates by notification type:
    follow: '{{actor}} followed you',
    event_invite: '{{actor}} invited you to {{entity}}',
    group_invite: '{{actor}} invited you to {{entity}}',
    community_invite: '{{actor}} invited you to {{entity}}',
    community_request_accepted: 'Your request to join {{entity}} was accepted',
    follow_joined_event: '{{actor}} joined {{entity}}',
  },
} as const;
```

- [ ] **Step 2: Register it**

In the `registerMobileCopy` function, add after the `home` bundle line:

```ts
  instance.addResourceBundle('en', 'notifications', mobileNotifications.en, true, false);
```

- [ ] **Step 3: Typecheck**

Run: `pnpm --filter mobile typecheck`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add apps/mobile/lib/i18n-mobile.ts
git commit -m "feat(mobile): notifications i18n namespace"
```

---

## Task 7: notifications feed screen

**Files:**
- Create: `apps/mobile/app/notifications/index.tsx`

Behaviour: pinned Partner Requests row (count → `/notifications/partner-requests`, built in Phase 2B — the route may 404 until then, which is acceptable for this slice); chronological `FlashList`; tapping a row marks **that row** read (per-row, so "Mark all as read" stays meaningful) then navigates to the entity; invitation rows show an inline Join button → "Joined"; a settings "…" header button opens a modal with Mark all as read / Clear all (the pinned row is never affected).

- [ ] **Step 1: Create the screen**

Create `apps/mobile/app/notifications/index.tsx`:

```tsx
import {
  useClearAll,
  useCompleteNotificationCta,
  useMarkAllRead,
  useMarkRead,
  useNotifications,
  usePartnerRequestSummary,
  type NotificationRow,
} from '@padel/api';
import { useT } from '@padel/i18n';
import { FlashList } from '@shopify/flash-list';
import { Stack, useRouter } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Modal, Pressable, StyleSheet, Text, View } from 'react-native';

const CTA_TYPES = ['event_invite', 'group_invite', 'community_invite'];

function targetHref(n: NotificationRow): string | null {
  if (n.event_id) return `/event/${n.event_id}`;
  if (n.group_id) return `/group/${n.group_id}`;
  if (n.community_id) return `/community/${n.community_id}`;
  if (n.type === 'follow' && n.actor_id) return `/profile/${n.actor_id}`;
  return null;
}

export default function NotificationsScreen() {
  const { t } = useT('notifications');
  const router = useRouter();
  const list = useNotifications();
  const summary = usePartnerRequestSummary();
  const markRead = useMarkRead();
  const markAllRead = useMarkAllRead();
  const clearAll = useClearAll();
  const completeCta = useCompleteNotificationCta();
  const [menuOpen, setMenuOpen] = useState(false);

  const rows = list.data?.pages.flat() ?? [];
  const pending = summary.data ?? 0;

  const onRowPress = (n: NotificationRow) => {
    if (!n.read_at) markRead.mutate(n.id);
    const href = targetHref(n);
    if (href) router.push(href as never);
  };

  return (
    <View style={styles.container}>
      <Stack.Screen
        options={{
          title: t('title'),
          headerRight: () => (
            <Pressable onPress={() => setMenuOpen(true)} accessibilityRole="button" hitSlop={12}>
              <Text style={styles.menuDots}>•••</Text>
            </Pressable>
          ),
        }}
      />

      <Pressable
        style={styles.pinned}
        onPress={() => router.push('/notifications/partner-requests' as never)}
        accessibilityRole="button"
      >
        <Text style={styles.pinnedLabel}>{t('partnerRequests')}</Text>
        <Text style={styles.pinnedCount}>{t('pendingCount', { count: pending })}</Text>
      </Pressable>

      {list.isLoading ? (
        <ActivityIndicator color="#0B1F3A" style={{ marginTop: 32 }} />
      ) : list.isError ? (
        <Text style={styles.empty}>{t('loadError')}</Text>
      ) : rows.length === 0 ? (
        <Text style={styles.empty}>{t('empty')}</Text>
      ) : (
        <FlashList
          data={rows}
          estimatedItemSize={72}
          keyExtractor={(n) => n.id}
          onEndReached={() => list.hasNextPage && list.fetchNextPage()}
          renderItem={({ item }) => (
            <Pressable
              style={[styles.row, !item.read_at && styles.rowUnread]}
              onPress={() => onRowPress(item)}
              accessibilityRole="button"
            >
              <View style={{ flex: 1 }}>
                <Text style={styles.rowText}>
                  {t(item.type, { actor: item.actor_name ?? '', entity: item.entity_name ?? '' })}
                </Text>
              </View>
              {CTA_TYPES.includes(item.type) ? (
                item.cta_done ? (
                  <Text style={styles.joined}>{t('joined')}</Text>
                ) : (
                  <Pressable
                    style={styles.joinBtn}
                    onPress={() => completeCta.mutate(item)}
                    accessibilityRole="button"
                  >
                    <Text style={styles.joinText}>{t('join')}</Text>
                  </Pressable>
                )
              ) : null}
            </Pressable>
          )}
        />
      )}

      <Modal visible={menuOpen} transparent animationType="fade" onRequestClose={() => setMenuOpen(false)}>
        <Pressable style={styles.backdrop} onPress={() => setMenuOpen(false)}>
          <View style={styles.sheet}>
            <Pressable
              style={styles.sheetRow}
              onPress={() => {
                markAllRead.mutate();
                setMenuOpen(false);
              }}
              accessibilityRole="button"
            >
              <Text style={styles.sheetText}>{t('markAllRead')}</Text>
            </Pressable>
            <Pressable
              style={styles.sheetRow}
              onPress={() => {
                clearAll.mutate();
                setMenuOpen(false);
              }}
              accessibilityRole="button"
            >
              <Text style={[styles.sheetText, { color: '#D7263D' }]}>{t('clearAll')}</Text>
            </Pressable>
          </View>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F7F9FC' },
  menuDots: { fontSize: 18, color: '#0B1F3A', paddingHorizontal: 8, fontWeight: '700' },
  pinned: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    backgroundColor: '#fff', margin: 12, borderRadius: 12, padding: 16,
  },
  pinnedLabel: { fontSize: 15, fontWeight: '700', color: '#0B1F3A' },
  pinnedCount: { fontSize: 14, color: '#0B7BFF', fontWeight: '600' },
  row: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: '#fff', marginHorizontal: 12, marginBottom: 6, borderRadius: 12, padding: 14,
  },
  rowUnread: { backgroundColor: '#EAF2FF' },
  rowText: { fontSize: 14, color: '#0B1F3A' },
  joinBtn: { backgroundColor: '#0B7BFF', borderRadius: 8, paddingHorizontal: 14, paddingVertical: 8 },
  joinText: { color: '#fff', fontWeight: '700', fontSize: 13 },
  joined: { color: '#6B7685', fontWeight: '700', fontSize: 13 },
  empty: { textAlign: 'center', marginTop: 48, color: '#6B7685', fontSize: 15 },
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.25)', justifyContent: 'flex-start', alignItems: 'flex-end' },
  sheet: { backgroundColor: '#fff', borderRadius: 12, margin: 12, marginTop: 48, minWidth: 200, overflow: 'hidden' },
  sheetRow: { paddingHorizontal: 18, paddingVertical: 14, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#E2E8F0' },
  sheetText: { fontSize: 15, color: '#0B1F3A', fontWeight: '600' },
});
```

- [ ] **Step 2: Regenerate typed routes if needed**

The new route `/notifications` (and the push to `/notifications/partner-requests`) must exist in `.expo/types/router.d.ts`. If Step 3's typecheck flags an unknown route, regenerate by briefly starting Metro:

```bash
cd apps/mobile && (npx expo start >/tmp/metro.log 2>&1 &) ; sleep 25 ; pkill -f "expo start" ; cd ../..
```

The `targetHref` push and `/notifications/partner-requests` push are cast through `as never`, so they will not block typecheck even before 2B lands.

- [ ] **Step 3: Typecheck**

Run: `pnpm --filter mobile typecheck`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add apps/mobile/app/notifications/index.tsx 'apps/mobile/.expo' 2>/dev/null; git add apps/mobile/app/notifications/index.tsx
git commit -m "feat(mobile): notifications feed screen (list, read-state, Join CTA, settings menu)"
```

---

## Task 8: bell badge + mount points

**Files:**
- Create: `apps/mobile/components/NotificationBell.tsx`
- Modify: `apps/mobile/app/(tabs)/_layout.tsx` (profile `Tabs.Screen` header + realtime mount)

- [ ] **Step 1: Create the bell component**

Create `apps/mobile/components/NotificationBell.tsx`. Uses `expo-symbols` `SymbolView` (matching the codebase's icon usage) with a red-dot badge.

```tsx
import { useUnreadCount } from '@padel/api';
import { useRouter } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { Pressable, StyleSheet, View } from 'react-native';

export function NotificationBell() {
  const router = useRouter();
  const unread = useUnreadCount();
  const hasUnread = (unread.data ?? 0) > 0;
  return (
    <Pressable
      onPress={() => router.push('/notifications' as never)}
      accessibilityRole="button"
      accessibilityLabel="Notifications"
      hitSlop={12}
      style={styles.wrap}
    >
      <SymbolView
        name={{ ios: 'bell.fill', android: 'notifications', web: 'notifications' }}
        size={24}
        tintColor="#0B1F3A"
      />
      {hasUnread ? <View style={styles.dot} /> : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrap: { padding: 4 },
  dot: {
    position: 'absolute', top: 2, right: 2, width: 10, height: 10,
    borderRadius: 5, backgroundColor: '#D7263D', borderWidth: 1.5, borderColor: '#F7F9FC',
  },
});
```

> **Icon (verified):** the codebase uses `expo-symbols` `SymbolView` with a platform-name object (see `(tabs)/_layout.tsx` tab icons + `CreateEventFab.tsx`). The code above matches that exactly.

- [ ] **Step 2: Mount the bell on the Profile tab header**

The tabs are a `Tabs` navigator with `headerShown` enabled at `screenOptions`. Add `headerRight` to the **profile `Tabs.Screen` options** in `apps/mobile/app/(tabs)/_layout.tsx` (do NOT touch `profile.tsx`; do NOT introduce a `Stack`). Add the import at the top:

```tsx
import { NotificationBell } from '@/components/NotificationBell';
```

Then add `headerRight` to the existing profile screen's `options` (it currently has `title` + `tabBarIcon`):

```tsx
      <Tabs.Screen
        name="profile"
        options={{
          title: t('tab', { ns: 'profile' }),
          headerRight: () => <NotificationBell />,
          tabBarIcon: ({ color }) => (
            <SymbolView
              name={{ ios: 'person.crop.circle.fill', android: 'account_circle', web: 'account_circle' }}
              tintColor={color}
              size={28}
            />
          ),
        }}
      />
```

- [ ] **Step 3: Mount the realtime subscription once**

In `apps/mobile/app/(tabs)/_layout.tsx`, call `useNotificationsRealtime()` inside the layout component body so the badge + feed stay live app-wide. Add the import and the hook call:

```tsx
import { useNotificationsRealtime } from '@padel/api';
// ...inside the TabLayout component, before the return:
useNotificationsRealtime();
```

- [ ] **Step 4: Typecheck**

Run: `pnpm --filter mobile typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/mobile/components/NotificationBell.tsx 'apps/mobile/app/(tabs)/_layout.tsx'
git commit -m "feat(mobile): notification bell + badge on Profile tab + app-wide realtime"
```

- [ ] **Step 6: Simulator smoke (manual, controller-run)**

```bash
export SUPABASE_AUTH_SMS_TWILIO_AUTH_TOKEN=local_test_token
pnpm dlx supabase@latest --workdir infra db reset
# start edge functions + the app, sign in with two accounts:
#  - From account B, follow account A -> A's bell shows a red dot, the feed shows "B followed you" in real time.
#  - From account B, invite account A to an event -> A sees an "invited you to <event>" row with a Join button; tapping flips it to "Joined".
#  - Tap a row -> it marks read and navigates; the "…" menu Mark all as read clears the dot; Clear all empties the list (pinned row stays).
```
Expected: each step behaves as described. Record any deviation as a follow-up.

---

## Verification gate (whole phase)

```bash
export SUPABASE_AUTH_SMS_TWILIO_AUTH_TOKEN=local_test_token
pnpm dlx supabase@latest --workdir infra db reset
docker exec -i supabase_db_padeljam psql -U postgres -d postgres < infra/supabase/tests/notifications.sql   # OK x3
pnpm --filter @padel/api typecheck
pnpm -w typecheck
```

---

## Self-Review

**Spec coverage:**
- HN-16 (pinned Partner Requests + count) → Task 2 (`partner_request_summary`) + Task 7 (pinned row). ✓ (aggregate screen is 2B.)
- HN-17 (invitation Join CTA, all 4 invite types) → Task 3 (triggers 2-4) + Task 5 (`useCompleteNotificationCta`) + Task 7 (Join button). ✓
- HN-18 (flip to Joined) → Task 5 (`cta_done`) + Task 7 (joined state). ✓
- HN-19 (community-request-accepted; event-started) → Task 3 (trigger 5). Event-started **deferred per spec**. ✓
- HN-20 (social: followed-you, followed-user-joined) → Task 3 (triggers 1, 6). ✓
- HN-21 (tap → navigate) → Task 7 (`targetHref`). ✓
- HN-22 (read/unread + bell badge) → Tasks 4/5 (unread count, mark read/all) + Task 8 (bell dot). ✓
- Realtime → Task 5 (`realtime.ts`) + Task 8 (mount). ✓
- Denormalized snapshots + i18n templates → Task 3 (snapshots) + Task 6 (templates) + Task 7 (render). ✓

**Type consistency:** `NotificationRow` defined in Task 4 `queries.ts`, imported by Task 5 `mutations.ts` and Task 7 screen. `cta_done`/`read_at`/`ref_id`/`actor_name`/`entity_name` names match the Task 1 table + Task 1 db types. Query keys `notifications`/`notificationsUnread`/`partnerRequestSummary` defined Task 4, used Tasks 4/5/7. i18n keys (Task 6) match the `t(item.type, …)` render + actions in Task 7. ✓

**Known cross-slice edge:** the pinned row pushes to `/notifications/partner-requests` (built in 2B); cast `as never` so it typechecks now, and it simply 404s until 2B lands — acceptable for an independently-shippable 2A.
