-- Post-review fixes to the cap triggers (whole-implementation review).

-- Important #1: groups cap must count only ACTIVE (non-archived) groups, else archiving the general
-- group on a starter (cap=1) permanently blocks creating any replacement group.
create or replace function enforce_group_cap() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_limit int; v_count int;
begin
  perform pg_advisory_xact_lock(hashtextextended('group_cap:' || NEW.community_id::text, 0));
  v_limit := community_limit(NEW.community_id, 'groups_per_community');
  if v_limit is null then return NEW; end if;
  select count(*) into v_count from groups
    where community_id = NEW.community_id and archived_at is null;
  if v_count >= v_limit then
    raise exception 'groups_per_community limit reached (%)', v_limit using errcode = 'P0001';
  end if;
  return NEW;
end; $$;

-- Important #2: also enforce the member cap when a membership is RE-PARENTED into another community
-- via UPDATE (community_id change), not only on INSERT — otherwise the cap is bypassable by moving
-- rows into an already-full community.
create or replace function enforce_member_caps() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_limit int; v_count int;
begin
  perform pg_advisory_xact_lock(hashtextextended('cmember_cap:' || NEW.community_id::text, 0));

  if TG_OP = 'INSERT'
     or (TG_OP = 'UPDATE' and NEW.community_id is distinct from OLD.community_id) then
    v_limit := community_limit(NEW.community_id, 'members_per_community');
    if v_limit is not null then
      select count(*) into v_count from community_members where community_id = NEW.community_id;
      if v_count >= v_limit then
        raise exception 'members_per_community limit reached (%)', v_limit using errcode = 'P0001';
      end if;
    end if;
  end if;

  if NEW.role = 'admin' and (TG_OP = 'INSERT' or OLD.role is distinct from 'admin'
     or NEW.community_id is distinct from OLD.community_id) then
    v_limit := community_limit(NEW.community_id, 'co_organizers');
    if v_limit is not null then
      select count(*) into v_count from community_members
        where community_id = NEW.community_id and role = 'admin';
      if v_count >= v_limit then
        raise exception 'co_organizers limit reached (%)', v_limit using errcode = 'P0001';
      end if;
    end if;
  end if;

  return NEW;
end; $$;
