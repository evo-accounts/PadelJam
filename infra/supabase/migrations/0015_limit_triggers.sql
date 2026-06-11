-- Members + co-organizer caps on community_members (INSERT: member cap + admin co-org; UPDATE: promotion).
-- SECURITY DEFINER so the COUNT sees ALL rows (not the caller's RLS-visible subset); advisory lock
-- per community so concurrent inserts can't both pass the boundary.
create or replace function enforce_member_caps() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_limit int; v_count int;
begin
  perform pg_advisory_xact_lock(hashtextextended('cmember_cap:' || NEW.community_id::text, 0));

  if TG_OP = 'INSERT' then
    v_limit := community_limit(NEW.community_id, 'members_per_community');
    if v_limit is not null then
      select count(*) into v_count from community_members where community_id = NEW.community_id;
      if v_count >= v_limit then
        raise exception 'members_per_community limit reached (%)', v_limit using errcode = 'P0001';
      end if;
    end if;
  end if;

  if NEW.role = 'admin' and (TG_OP = 'INSERT' or OLD.role is distinct from 'admin') then
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
create trigger trg_member_caps before insert or update on community_members
  for each row execute function enforce_member_caps();

-- Groups cap on groups (general group counts; it always fits since every tier limit >= 1).
create or replace function enforce_group_cap() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_limit int; v_count int;
begin
  perform pg_advisory_xact_lock(hashtextextended('group_cap:' || NEW.community_id::text, 0));
  v_limit := community_limit(NEW.community_id, 'groups_per_community');
  if v_limit is null then return NEW; end if;
  select count(*) into v_count from groups where community_id = NEW.community_id;
  if v_count >= v_limit then
    raise exception 'groups_per_community limit reached (%)', v_limit using errcode = 'P0001';
  end if;
  return NEW;
end; $$;
create trigger trg_group_cap before insert on groups
  for each row execute function enforce_group_cap();
