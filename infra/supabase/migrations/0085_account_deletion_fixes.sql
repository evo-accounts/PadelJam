-- Account-deletion fixes (review 2026-07-04):
--  1. purge push_tokens + notifications (both postdate 0059 and were never added here)
--  2. keep participation in in_progress/completed events so finished matches,
--     standings and group results are not corrupted for other players — the
--     anonymized "Deleted user" profile renders in their place. Participation in
--     scheduled/cancelled events is still removed (frees roster spots).
create or replace function soft_delete_account()
returns void
language plpgsql volatile security definer set search_path = public as $$
declare uid uuid := auth.uid();
begin
  if uid is null then return; end if;

  delete from follows  where follower_id = uid or followee_id = uid;
  delete from blocks   where blocker_id = uid or blocked_id = uid;
  delete from reports  where reporter_id = uid;
  delete from user_settings     where user_id = uid;
  delete from community_members where user_id = uid;
  delete from group_members     where user_id = uid;
  delete from push_tokens       where user_id = uid;
  delete from notifications     where user_id = uid;

  -- Only upcoming/cancelled events: completed & in-progress history is preserved.
  delete from event_participants ep
   using events e
   where ep.user_id = uid
     and e.id = ep.event_id
     and e.status in ('scheduled','cancelled');

  update profiles
     set full_name = 'Deleted user',
         email = 'deleted+' || uid::text || '@deleted.invalid',
         phone = 'deleted-' || uid::text,
         avatar_url = null,
         description = null,
         location_text = null,
         location_point = null,
         dominant_hand = null,
         court_side = null,
         preferred_time = null,
         gender = null,
         date_of_birth = null,
         deleted_at = now()
   where id = uid;
end;
$$;

grant execute on function soft_delete_account() to authenticated;
