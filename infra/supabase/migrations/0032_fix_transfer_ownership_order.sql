-- Fix transfer_ownership vs the co-organizer cap trigger: demoting the old owner to 'admin' BEFORE
-- promoting the new owner created a transient 2nd admin, tripping enforce_member_caps when the
-- community was already at its co_organizers limit (e.g. transferring to an existing admin on Basic).
-- Promote the new owner to 'owner' FIRST (role='owner' never trips the co-org cap and frees their
-- admin slot), then demote the old owner to 'admin' — which now fits within the cap.
create or replace function transfer_ownership(p_community_id uuid, p_new_owner uuid) returns void
language plpgsql security definer set search_path = public as $$
declare v_user uuid := auth.uid();
begin
  if not exists (select 1 from community_members where community_id=p_community_id and user_id=v_user and role='owner')
  then raise exception 'forbidden' using errcode='P0001'; end if;
  if not exists (select 1 from community_members where community_id=p_community_id and user_id=p_new_owner)
  then raise exception 'new_owner_not_member' using errcode='P0001'; end if;
  update community_members set role='owner' where community_id=p_community_id and user_id=p_new_owner;
  update community_members set role='admin' where community_id=p_community_id and user_id=v_user;
end; $$;
