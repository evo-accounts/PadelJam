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
