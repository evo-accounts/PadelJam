-- soft_delete_account: anonymizes the profile, drops the user's memberships/social rows,
-- and KEEPS owned entities (a community the user created).
-- Since 0143/0144 the deletion runs the way the delete-account edge function runs it: as
-- service_role, with no `sub` in the claims, for the id GoTrue verified. No signed-in user may
-- execute it.
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

  -- The delete-account edge function: service_role, claims without a `sub`, the verified id.
  perform set_config('role', 'service_role', true);
  perform set_config('request.jwt.claims', '{"role":"service_role"}', true);
  perform soft_delete_account(uid);

  -- Back to postgres for the assertions: migration 0115 revokes SELECT on profiles.phone from
  -- `authenticated`, so the anonymized phone is only checkable as the owner.
  perform set_config('role', 'postgres', true);
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

-- Deletee has a push token, a notification, a phone on auth.users, and an identity row.
update auth.users set phone = '+351904000002' where id = 'fd000002-0000-0000-0000-000000000002';
insert into auth.identities (provider_id, user_id, identity_data, provider)
values ('fd000002-0000-0000-0000-000000000002', 'fd000002-0000-0000-0000-000000000002',
        '{"sub":"fd000002-0000-0000-0000-000000000002","email":"delme@x.com"}', 'email');
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

-- Run the deletion the way the delete-account edge function does: service_role, claims without a
-- `sub`, the verified id (0143).
set local role service_role;
set local request.jwt.claims = '{"role":"service_role"}';
select soft_delete_account('fd000002-0000-0000-0000-000000000002');
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
  if (select email from auth.users where id = 'fd000002-0000-0000-0000-000000000002')
       not like 'deleted+%' then
    raise exception using errcode='PT001', message='auth email not freed'; end if;
  if (select phone from auth.users where id = 'fd000002-0000-0000-0000-000000000002') is not null then
    raise exception using errcode='PT001', message='auth phone not freed'; end if;
  if exists (select 1 from auth.identities where user_id = 'fd000002-0000-0000-0000-000000000002') then
    raise exception using errcode='PT001', message='auth identities not removed'; end if;
  -- 0122's activity trigger still tells the organizer the player left the upcoming event, even
  -- though the service role carries no `sub`: soft_delete_account(p_user) pins auth.uid() (0143).
  if (select count(*) from event_activity
       where event_id = 'ed000002-0000-0000-0000-000000000002' and action = 'left'
         and actor_id = 'fd000002-0000-0000-0000-000000000002') <> 1 then
    raise exception using errcode='PT001', message='deletion under service_role did not log the player''s "left"'; end if;
  if exists (select 1 from event_activity
              where event_id = 'ed000001-0000-0000-0000-000000000001' and action = 'left') then
    raise exception using errcode='PT001', message='a completed event logged a "left"'; end if;
  if nullif(current_setting('request.jwt.claim.sub', true), '') is not null then
    raise exception using errcode='PT001', message='soft_delete_account left auth.uid() pinned after it returned'; end if;

  raise notice 'OK account_deletion_push_and_participation';
end $$;
rollback;

-- soft_delete_account (0143/0144): only service_role may run it. The blocks the account PLACED go
-- with it, the blocks OTHERS placed on it stay (they are the blocker's), and the auth user is
-- banned in the same transaction, so a deleted account can never keep refreshing its session.
begin;
insert into auth.users (id, instance_id, aud, role, email) values
  ('fe000001-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000000','authenticated','authenticated','blkdel@x.com'),
  ('fe000002-0000-0000-0000-000000000002','00000000-0000-0000-0000-000000000000','authenticated','authenticated','blker@x.com'),
  ('fe000003-0000-0000-0000-000000000003','00000000-0000-0000-0000-000000000000','authenticated','authenticated','blked@x.com') on conflict do nothing;
insert into profiles (id, email, phone, full_name) values
  ('fe000001-0000-0000-0000-000000000001','blkdel@x.com','+351904100001','BlkDeletee'),
  ('fe000002-0000-0000-0000-000000000002','blker@x.com','+351904100002','BlkBlocker'),
  ('fe000003-0000-0000-0000-000000000003','blked@x.com','+351904100003','BlkBlocked') on conflict do nothing;
set local role authenticated;
set local request.jwt.claims = '{"sub":"fe000002-0000-0000-0000-000000000002","role":"authenticated"}';
select block_user('fe000001-0000-0000-0000-000000000001');
set local request.jwt.claims = '{"sub":"fe000001-0000-0000-0000-000000000001","role":"authenticated"}';
select block_user('fe000003-0000-0000-0000-000000000003');
do $$
declare v_target uuid;
begin
  -- Signed in, the deletee can run neither entry point: not for themselves, not for anyone else.
  foreach v_target in array array['fe000001-0000-0000-0000-000000000001','fe000002-0000-0000-0000-000000000002']::uuid[] loop
    begin
      perform soft_delete_account(v_target);
      raise exception using errcode='PT001', message='authenticated ran soft_delete_account(' || v_target || ')';
    exception when insufficient_privilege then null;
    end;
  end loop;
  begin
    perform soft_delete_account();
    raise exception using errcode='PT001', message='authenticated ran soft_delete_account()';
  exception when insufficient_privilege then null;
  end;
  raise notice 'OK authenticated cannot run soft_delete_account';
end $$;
reset role;
set local role service_role;
set local request.jwt.claims = '{"role":"service_role"}';
select soft_delete_account('fe000001-0000-0000-0000-000000000001');
reset role;
do $$
begin
  if not exists (select 1 from blocks where blocker_id = 'fe000002-0000-0000-0000-000000000002'
                                        and blocked_id = 'fe000001-0000-0000-0000-000000000001') then
    raise exception using errcode='PT001', message='deletion removed a block another user placed'; end if;
  if exists (select 1 from blocks where blocker_id = 'fe000001-0000-0000-0000-000000000001') then
    raise exception using errcode='PT001', message='blocks the deleted account placed survive'; end if;
  if coalesce((select banned_until from auth.users where id = 'fe000001-0000-0000-0000-000000000001'), '-infinity')
       < now() + interval '99 years' then
    raise exception using errcode='PT001', message='deleted account was not banned in the same transaction'; end if;
  raise notice 'OK account_deletion_blocks_and_ban';
end $$;
rollback;
