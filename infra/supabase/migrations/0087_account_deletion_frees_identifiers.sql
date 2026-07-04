-- Account deletion must FREE the auth-level identifiers (on-device finding, 2026-07-04):
-- soft_delete_account anonymizes profiles, but auth.users kept the real email/phone and
-- auth.identities rows — so a deleted account's identifiers stayed "already registered"
-- forever, blocking their owner from ever signing up again (surfaced as an opaque 400
-- from complete-account). SECURITY DEFINER (owner postgres) can write the auth schema;
-- the user is banned immediately after deletion, so GoTrue never serves these rows again.
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

  -- Free the auth-level identifiers so the real owner can register again.
  update auth.users
     set email = 'deleted+' || uid::text || '@deleted.invalid',
         phone = null,
         raw_user_meta_data = '{}'::jsonb
   where id = uid;
  delete from auth.identities where user_id = uid;
end;
$$;

grant execute on function soft_delete_account() to authenticated;

-- Backfill: accounts deleted before this migration still hold their real identifiers
-- on auth.users/auth.identities. Scrub them the same way.
update auth.users u
   set email = 'deleted+' || u.id::text || '@deleted.invalid',
       phone = null,
       raw_user_meta_data = '{}'::jsonb
  from public.profiles p
 where p.id = u.id
   and p.deleted_at is not null
   and (u.email is distinct from 'deleted+' || u.id::text || '@deleted.invalid'
        or u.phone is not null);

delete from auth.identities i
 using public.profiles p
 where p.id = i.user_id
   and p.deleted_at is not null;
