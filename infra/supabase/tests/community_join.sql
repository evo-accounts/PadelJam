-- Join flows: public instant-join (+general group), rules-ack gate, request_to_join, private invite,
-- and the members_per_community cap (starter=10) hit on the 11th join.
begin;
-- Fixtures as postgres (auth.users + profiles must pre-exist; community_members.user_id FK -> profiles).
insert into auth.users (id, instance_id, aud, role)
  select ('a0000000-0000-0000-0000-0000000000'||lpad(g::text,2,'0'))::uuid,
         '00000000-0000-0000-0000-000000000000','authenticated','authenticated'
  from generate_series(1,9) g;                      -- 9 fillers
insert into profiles (id, email, phone, full_name)
  select ('a0000000-0000-0000-0000-0000000000'||lpad(g::text,2,'0'))::uuid,
         'fill'||g||'@x.com', '+35190090'||lpad(g::text,4,'0'), 'Fill'||g
  from generate_series(1,9) g;
insert into auth.users (id, instance_id, aud, role) values
  ('a1000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000000','authenticated','authenticated'),
  ('a1000000-0000-0000-0000-000000000002','00000000-0000-0000-0000-000000000000','authenticated','authenticated'),
  ('a1000000-0000-0000-0000-000000000003','00000000-0000-0000-0000-000000000000','authenticated','authenticated') on conflict do nothing;
insert into profiles (id, email, phone, full_name) values
  ('a1000000-0000-0000-0000-000000000001','jown@x.com','+351900910001','JOwner'),
  ('a1000000-0000-0000-0000-000000000002','j11@x.com','+351900910002','Eleventh'),
  ('a1000000-0000-0000-0000-000000000003','jpub@x.com','+351900910003','PubJoiner') on conflict do nothing;

-- Owner creates a starter community.
set local role authenticated;
set local request.jwt.claims = '{"sub":"a1000000-0000-0000-0000-000000000001","role":"authenticated"}';
select create_community_with_personal_tenant('JoinCap','club','PT','public') as cid \gset
reset role;

-- Fill to 10 members (owner is #1; add 9). Trigger fires on each; the 10th (count 9->10) is OK.
insert into community_members (community_id, user_id, role)
  select :'cid', ('a0000000-0000-0000-0000-0000000000'||lpad(g::text,2,'0'))::uuid, 'member'
  from generate_series(1,9) g;

-- 11th join must hit the member cap.
set local role authenticated;
set local request.jwt.claims = '{"sub":"a1000000-0000-0000-0000-000000000002","role":"authenticated"}';
do $$ begin
  begin
    perform join_community((select id from communities where name='JoinCap' order by created_at desc limit 1), false);
    raise exception using errcode='PT001', message='11th join should hit members cap';
  exception when sqlstate 'P0001' then raise notice 'OK members cap: 11th join blocked (%)', sqlerrm;
  end;
end $$;
reset role;

-- Public instant join on a fresh community adds member + general group.
set local role authenticated;
set local request.jwt.claims = '{"sub":"a1000000-0000-0000-0000-000000000003","role":"authenticated"}';
select create_community_with_personal_tenant('PubJoin','club','PT','public') as pid \gset
reset role;
set local role authenticated;
set local request.jwt.claims = '{"sub":"a0000000-0000-0000-0000-000000000001","role":"authenticated"}';
do $$ declare pid uuid := (select id from communities where name='PubJoin' order by created_at desc limit 1); r text;
begin
  r := join_community(pid, false);
  if r <> 'joined' then raise exception using errcode='PT001', message='public join should return joined'; end if;
  if not exists (select 1 from group_members gm join groups g on g.id=gm.group_id
                 where g.community_id=pid and g.is_general and gm.user_id='a0000000-0000-0000-0000-000000000001')
  then raise exception using errcode='PT001', message='public join did not add to general group'; end if;
  raise notice 'OK public join -> joined + general group';
end $$;
reset role;

-- Rules-enabled community: join without ack must be rejected; request_to_join + private variants.
-- Owned-cap is 1 per user, so each of the 3 communities needs a DISTINCT owner (use fillers 04/05/06).
set local role authenticated;
set local request.jwt.claims = '{"sub":"a0000000-0000-0000-0000-000000000004","role":"authenticated"}';
select create_community_with_personal_tenant('RulesC','club','PT','public',null,null,null,null,true,'Be nice') as rid \gset
set local request.jwt.claims = '{"sub":"a0000000-0000-0000-0000-000000000005","role":"authenticated"}';
select create_community_with_personal_tenant('ReqC','club','PT','request_to_join') as qid \gset
set local request.jwt.claims = '{"sub":"a0000000-0000-0000-0000-000000000006","role":"authenticated"}';
select create_community_with_personal_tenant('PrivC2','club','PT','private') as vid \gset
reset role;
set local role authenticated;
set local request.jwt.claims = '{"sub":"a0000000-0000-0000-0000-000000000003","role":"authenticated"}';
do $$
declare rid uuid := (select id from communities where name='RulesC' order by created_at desc limit 1);
        qid uuid := (select id from communities where name='ReqC'  order by created_at desc limit 1);
        vid uuid := (select id from communities where name='PrivC2' order by created_at desc limit 1);
        r text;
begin
  begin perform join_community(rid, false);
    raise exception using errcode='PT001', message='rules join without ack should fail';
  exception when sqlstate 'P0001' then raise notice 'OK rules: join without ack blocked (%)', sqlerrm; end;

  r := join_community(qid, false);
  if r <> 'requested' then raise exception using errcode='PT001', message='request_to_join should return requested'; end if;
  if not exists (select 1 from community_join_requests where community_id=qid and user_id=auth.uid() and status='pending')
  then raise exception using errcode='PT001', message='no pending request created'; end if;
  raise notice 'OK request_to_join -> requested + pending row';

  begin perform join_community(vid, false);
    raise exception using errcode='PT001', message='private join without invite should fail';
  exception when sqlstate 'P0001' then raise notice 'OK private: join without invite blocked (%)', sqlerrm; end;
end $$;
reset role;
rollback;
