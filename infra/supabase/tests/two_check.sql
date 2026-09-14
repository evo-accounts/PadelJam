-- A starter community resolves custom_broadcasts = false; an upgrade to basic flips it true.
begin;
insert into auth.users (id, instance_id, aud, role, email)
  values ('55555555-5555-5555-5555-555555555555','00000000-0000-0000-0000-000000000000','authenticated','authenticated','tc@example.com') on conflict do nothing;
-- profiles row required: create_community_with_personal_tenant sets communities.created_by -> profiles.
insert into profiles (id, email, phone, full_name)
  values ('55555555-5555-5555-5555-555555555555','tc@example.com','+351155555555','TC') on conflict do nothing;
set local role authenticated;
set local request.jwt.claims = '{"sub":"55555555-5555-5555-5555-555555555555","role":"authenticated"}';
select create_community_with_personal_tenant('TwoCheck','friends','PT') as cid \gset
set local role postgres;

do $$
declare cid uuid := (select id from communities where name='TwoCheck' order by created_at desc limit 1);
begin
  if community_has_feature(cid,'custom_broadcasts') then
    raise exception using errcode='PT001', message='EXPECTED starter to lack custom_broadcasts';
  end if;
  raise notice 'OK starter denied custom_broadcasts';
  -- upgrade to basic
  insert into community_subscriptions (community_id, plan_id) values (cid, 'basic');
  if not community_has_feature(cid,'custom_broadcasts') then
    raise exception using errcode='PT001', message='EXPECTED basic to grant custom_broadcasts';
  end if;
  raise notice 'OK basic grants custom_broadcasts';
  -- jammer_plus_included derivation. 0098 narrowed it from the community OWNER (a role that no
  -- longer exists) to communities.created_by, so it follows the CREATOR and does not widen to
  -- every admin.
  if not account_has_feature('55555555-5555-5555-5555-555555555555','advanced_stats') then
    raise exception using errcode='PT001', message='EXPECTED the creator of a basic community to derive jammer_plus advanced_stats';
  end if;
  raise notice 'OK jammer_plus_included derives advanced_stats for the creator';

  -- A second admin of the same community is NOT the creator and must NOT derive it.
  insert into auth.users (id, instance_id, aud, role, email)
    values ('55555555-5555-5555-5555-555555555556','00000000-0000-0000-0000-000000000000','authenticated','authenticated','tc2@example.com')
    on conflict do nothing;
  insert into profiles (id, email, phone, full_name)
    values ('55555555-5555-5555-5555-555555555556','tc2@example.com','+351155555556','TC2') on conflict do nothing;
  insert into community_members (community_id, user_id, role) values (cid, '55555555-5555-5555-5555-555555555556', 'admin');
  if account_has_feature('55555555-5555-5555-5555-555555555556','advanced_stats') then
    raise exception using errcode='PT001', message='a non-creator admin must NOT derive jammer_plus';
  end if;
  raise notice 'OK a second admin does not derive jammer_plus — it narrowed, not widened';
end $$;
rollback;
