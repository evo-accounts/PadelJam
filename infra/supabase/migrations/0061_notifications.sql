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

-- True when either user has blocked the other (suppress notifications between them).
create or replace function notif_blocked(u1 uuid, u2 uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from blocks
    where (blocker_id = u1 and blocked_id = u2)
       or (blocker_id = u2 and blocked_id = u1));
$$;

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
