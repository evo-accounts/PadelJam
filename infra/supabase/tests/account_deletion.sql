-- soft_delete_account: anonymizes the profile, drops the user's memberships/social rows,
-- and KEEPS owned entities (a community the user created).
begin;
insert into auth.users (id, instance_id, aud, role, email) values
  ('f5000001-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000000','authenticated','authenticated','del1@x.com'),
  ('f5000002-0000-0000-0000-000000000002','00000000-0000-0000-0000-000000000000','authenticated','authenticated','del2@x.com') on conflict do nothing;
insert into profiles (id, email, phone, full_name) values
  ('f5000001-0000-0000-0000-000000000001','del1@x.com','+351900020001','Del One'),
  ('f5000002-0000-0000-0000-000000000002','del2@x.com','+351900020002','Del Two') on conflict do nothing;

do $$
declare uid constant uuid := 'f5000001-0000-0000-0000-000000000001'; cid uuid;
begin
  perform set_config('role','authenticated',true);
  perform set_config('request.jwt.claims', format('{"sub":"%s","role":"authenticated"}', uid), true);

  cid := create_community_with_personal_tenant('DelC','club','PT','public');
  insert into follows (follower_id, followee_id) values (uid, 'f5000002-0000-0000-0000-000000000002');
  insert into user_settings (user_id) values (uid);

  perform soft_delete_account();

  if not exists (select 1 from profiles where id = uid
      and full_name = 'Deleted user' and deleted_at is not null
      and email = 'deleted+' || uid::text || '@deleted.invalid'
      and phone = 'deleted-' || uid::text) then
    raise exception using errcode='PT001', message='profile not anonymized'; end if;
  if exists (select 1 from follows where follower_id = uid or followee_id = uid) then
    raise exception using errcode='PT001', message='follows not removed'; end if;
  if exists (select 1 from user_settings where user_id = uid) then
    raise exception using errcode='PT001', message='settings not removed'; end if;
  if exists (select 1 from community_members where user_id = uid) then
    raise exception using errcode='PT001', message='membership not removed'; end if;
  if not exists (select 1 from communities where id = cid) then
    raise exception using errcode='PT001', message='owned community was removed'; end if;

  raise notice 'OK account_deletion';
end $$;
rollback;

-- soft_delete_account: push tokens + notifications are purged; participation in a
-- completed event survives (anonymized), participation in a scheduled event is removed.
begin;
insert into auth.users (id, instance_id, aud, role, email) values
  ('fd000001-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000000','authenticated','authenticated','delown@x.com'),
  ('fd000002-0000-0000-0000-000000000002','00000000-0000-0000-0000-000000000000','authenticated','authenticated','delme@x.com') on conflict do nothing;
insert into profiles (id, email, phone, full_name) values
  ('fd000001-0000-0000-0000-000000000001','delown@x.com','+351904000001','DelOwner'),
  ('fd000002-0000-0000-0000-000000000002','delme@x.com','+351904000002','DelMe') on conflict do nothing;

-- Deletee has a push token and a notification.
set local role authenticated;
set local request.jwt.claims = '{"sub":"fd000002-0000-0000-0000-000000000002","role":"authenticated"}';
select register_push_token('ExponentPushToken[deltest]', 'ios');
reset role;
insert into notifications (user_id, type) values ('fd000002-0000-0000-0000-000000000002','follow');

-- One completed and one scheduled private event owned by the other user; deletee confirmed in both.
insert into events (id, organizer_id, event_type, specification, scoring_mode, num_courts,
                    starts_at, duration_minutes, organizer_role, is_private, name, status)
values
  ('ed000001-0000-0000-0000-000000000001','fd000001-0000-0000-0000-000000000001','americano','classic','classic',1,
   now() - interval '7 days', 90, 'organizing_and_playing', true, 'DelDone', 'completed'),
  ('ed000002-0000-0000-0000-000000000002','fd000001-0000-0000-0000-000000000001','americano','classic','classic',1,
   now() + interval '7 days', 90, 'organizing_and_playing', true, 'DelNext', 'scheduled');
insert into event_participants (event_id, user_id, status) values
  ('ed000001-0000-0000-0000-000000000001','fd000002-0000-0000-0000-000000000002','confirmed'),
  ('ed000002-0000-0000-0000-000000000002','fd000002-0000-0000-0000-000000000002','confirmed');

-- Run the deletion as the deletee.
set local role authenticated;
set local request.jwt.claims = '{"sub":"fd000002-0000-0000-0000-000000000002","role":"authenticated"}';
select soft_delete_account();
reset role;

do $$
begin
  if exists (select 1 from push_tokens where user_id = 'fd000002-0000-0000-0000-000000000002') then
    raise exception using errcode='PT001', message='push tokens not purged'; end if;
  if exists (select 1 from notifications where user_id = 'fd000002-0000-0000-0000-000000000002') then
    raise exception using errcode='PT001', message='notifications not purged'; end if;
  if not exists (select 1 from event_participants
                  where event_id = 'ed000001-0000-0000-0000-000000000001'
                    and user_id = 'fd000002-0000-0000-0000-000000000002') then
    raise exception using errcode='PT001', message='completed-event participation must survive'; end if;
  if exists (select 1 from event_participants
              where event_id = 'ed000002-0000-0000-0000-000000000002'
                and user_id = 'fd000002-0000-0000-0000-000000000002') then
    raise exception using errcode='PT001', message='scheduled-event participation must be removed'; end if;
  if (select full_name from profiles where id = 'fd000002-0000-0000-0000-000000000002') <> 'Deleted user' then
    raise exception using errcode='PT001', message='profile not anonymized'; end if;

  raise notice 'OK account_deletion_push_and_participation';
end $$;
rollback;
