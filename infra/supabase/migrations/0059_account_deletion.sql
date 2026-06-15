alter table profiles add column deleted_at timestamptz;

-- Soft-delete the caller's own account: anonymize PII, mark deleted, drop the user's
-- memberships/social rows. Owned entities (created_by/organizer_id) are kept and now reference
-- the anonymized "Deleted user" profile. SECURITY DEFINER to scrub/delete across tables; scoped to auth.uid().
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
  delete from event_participants where user_id = uid;

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
