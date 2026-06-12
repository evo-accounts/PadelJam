-- groups_per_community cap via create_group: basic=3 (general consumes 1). 4th create -> cap error.
-- Archiving a non-general group frees a slot (can_create_group true again + replacement succeeds).
-- community_pro (null limit) -> can_create_group stays true beyond 3.
-- 'PT001' = "expected behaviour did not hold" sentinel; the cap trigger raises P0001.
begin;
insert into auth.users (id, instance_id, aud, role, email) values
  ('e1400001-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000000','authenticated','authenticated','gcapb@x.com'),
  ('e1400002-0000-0000-0000-000000000002','00000000-0000-0000-0000-000000000000','authenticated','authenticated','gcapp@x.com') on conflict do nothing;
insert into profiles (id, email, phone, full_name) values
  ('e1400001-0000-0000-0000-000000000001','gcapb@x.com','+351901400001','GCapBasic'),
  ('e1400002-0000-0000-0000-000000000002','gcapp@x.com','+351901400002','GCapPro') on conflict do nothing;

-- BASIC community (groups_per_community=3): general group already consumes 1 slot.
set local role authenticated;
set local request.jwt.claims = '{"sub":"e1400001-0000-0000-0000-000000000001","role":"authenticated"}';
select create_community_with_personal_tenant('GCapBasicC','club','PT','public') as cid \gset
reset role;
insert into community_subscriptions (community_id, plan_id)
  select id, 'basic' from communities where name='GCapBasicC' order by created_at desc limit 1
  on conflict (community_id) do update set plan_id='basic';

-- Create groups up to the limit: general(1) + G2 + G3 = 3. The 4th must hit the cap.
set local role authenticated;
set local request.jwt.claims = '{"sub":"e1400001-0000-0000-0000-000000000001","role":"authenticated"}';
select create_group(:'cid','CapG2',null,false) as g2 \gset
select create_group(:'cid','CapG3',null,false) as g3 \gset
select set_config('test.cid', :'cid', false);
select set_config('test.g3', :'g3', false);
do $$
declare cid uuid := current_setting('test.cid')::uuid;
begin
  if can_create_group(cid) then
    raise exception using errcode='PT001', message='at limit (3) can_create_group should be false'; end if;
  begin
    perform create_group(cid,'CapG4',null,false);
    raise exception using errcode='PT001', message='4th create_group should hit groups_per_community cap';
  exception when sqlstate 'P0001' then raise notice 'OK groups cap blocked at limit (%)', sqlerrm;
  end;
end $$;
reset role;

-- Archive one non-general group -> a slot frees: can_create_group true + replacement succeeds.
set local role authenticated;
set local request.jwt.claims = '{"sub":"e1400001-0000-0000-0000-000000000001","role":"authenticated"}';
do $$
declare cid uuid := current_setting('test.cid')::uuid;
        g3 uuid := current_setting('test.g3')::uuid;
begin
  perform archive_group(g3);
  if not can_create_group(cid) then
    raise exception using errcode='PT001', message='archiving a group should free a slot (can_create_group true)'; end if;
  perform create_group(cid,'Replacement',null,false);
  raise notice 'OK archived group frees a slot; replacement create_group succeeds';
end $$;
reset role;

-- PRO community (null limit): can_create_group stays true well beyond 3.
set local role authenticated;
set local request.jwt.claims = '{"sub":"e1400002-0000-0000-0000-000000000002","role":"authenticated"}';
select create_community_with_personal_tenant('GCapProC','club','PT','public') as pcid \gset
reset role;
insert into community_subscriptions (community_id, plan_id)
  select id, 'community_pro' from communities where name='GCapProC' order by created_at desc limit 1
  on conflict (community_id) do update set plan_id='community_pro';
select set_config('test.pcid', :'pcid', false);

set local role authenticated;
set local request.jwt.claims = '{"sub":"e1400002-0000-0000-0000-000000000002","role":"authenticated"}';
do $$
declare pcid uuid := current_setting('test.pcid')::uuid;
begin
  -- general + 4 more = 5 groups, all allowed under null limit.
  perform create_group(pcid,'ProG2',null,false);
  perform create_group(pcid,'ProG3',null,false);
  perform create_group(pcid,'ProG4',null,false);
  perform create_group(pcid,'ProG5',null,false);
  if not can_create_group(pcid) then
    raise exception using errcode='PT001', message='community_pro (null limit) should keep can_create_group true'; end if;
  raise notice 'OK community_pro: can_create_group stays true beyond 3';
end $$;
reset role;
rollback;
