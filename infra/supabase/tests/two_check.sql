-- A starter community resolves custom_broadcasts = false; an upgrade to basic flips it true.
begin;
insert into auth.users (id, instance_id, aud, role, email)
  values ('55555555-5555-5555-5555-555555555555','00000000-0000-0000-0000-000000000000','authenticated','authenticated','tc@example.com') on conflict do nothing;
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
  -- jammer_plus_included derivation: the owner now has account advanced_stats without a personal sub
  if not account_has_feature('55555555-5555-5555-5555-555555555555','advanced_stats') then
    raise exception using errcode='PT001', message='EXPECTED owner of a basic community to derive jammer_plus advanced_stats';
  end if;
  raise notice 'OK jammer_plus_included derives advanced_stats for the owner';
end $$;
rollback;
