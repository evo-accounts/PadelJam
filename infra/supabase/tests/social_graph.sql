-- Social graph: follow/unfollow, block (removes edges both ways + hides profile both directions),
-- list exclusions, report, stats, and self-constraints.
begin;
insert into auth.users (id, instance_id, aud, role, email) values
  ('f1000001-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000000','authenticated','authenticated','sg1@x.com'),
  ('f1000002-0000-0000-0000-000000000002','00000000-0000-0000-0000-000000000000','authenticated','authenticated','sg2@x.com') on conflict do nothing;
insert into profiles (id, email, phone, full_name) values
  ('f1000001-0000-0000-0000-000000000001','sg1@x.com','+351900700001','Alice Viewer'),
  ('f1000002-0000-0000-0000-000000000002','sg2@x.com','+351900700002','Bob Target') on conflict do nothing;

do $$
declare cid uuid; gid uuid; seasonid uuid; ev uuid;
  alice constant uuid := 'f1000001-0000-0000-0000-000000000001';
  bob   constant uuid := 'f1000002-0000-0000-0000-000000000002';
begin
  perform set_config('role','authenticated',true);
  perform set_config('request.jwt.claims', format('{"sub":"%s","role":"authenticated"}', bob), true);
  cid := create_community_with_personal_tenant('SGc','club','PT','public');
  perform set_config('role','postgres',true);
  insert into community_subscriptions (community_id, plan_id) values (cid,'basic')
    on conflict (community_id) do update set plan_id='basic';
  insert into groups (community_id, name, is_private) values (cid,'SGg',false) returning id into gid;
  insert into group_seasons (group_id, season_number) values (gid, 1)
    on conflict (group_id, season_number) do update set season_number = group_seasons.season_number returning id into seasonid;
  insert into events (group_id, organizer_id, event_type, specification, scoring_mode, num_courts,
    starts_at, duration_minutes, organizer_role, name, status)
    values (gid, bob,'americano','classic','points',2, now() - interval '1 day',60,'organizing_only','SGev','completed') returning id into ev;
  insert into group_event_results (group_season_id, event_id, user_id, final_placement, ranking_points)
    values (seasonid, ev, bob, 1, 100);

  perform set_config('role','authenticated',true);
  perform set_config('request.jwt.claims', format('{"sub":"%s","role":"authenticated"}', alice), true);

  if not exists (select 1 from get_player_profile(bob) where played_matches = 1 and best_position = 1) then
    raise exception using errcode='PT001', message='stats not computed'; end if;

  insert into follows (follower_id, followee_id) values (alice, bob);
  if not exists (select 1 from get_player_profile(bob) where is_following and followers_count = 1) then
    raise exception using errcode='PT001', message='follow not reflected'; end if;
  if not exists (select 1 from list_following(alice) where id = bob) then
    raise exception using errcode='PT001', message='following list missing target'; end if;
  if not exists (select 1 from list_followers(bob) where id = alice) then
    raise exception using errcode='PT001', message='followers list missing follower'; end if;
  if exists (select 1 from list_following(alice, 'zzzz') where id = bob) then
    raise exception using errcode='PT001', message='search did not filter'; end if;

  delete from follows where follower_id = alice and followee_id = bob;
  if exists (select 1 from get_player_profile(bob) where is_following) then
    raise exception using errcode='PT001', message='unfollow not reflected'; end if;

  insert into follows (follower_id, followee_id) values (alice, bob);
  perform set_config('request.jwt.claims', format('{"sub":"%s","role":"authenticated"}', bob), true);
  insert into follows (follower_id, followee_id) values (bob, alice);
  perform set_config('request.jwt.claims', format('{"sub":"%s","role":"authenticated"}', alice), true);
  perform block_user(bob);
  -- Read as the table owner. Since 0140, "follows: read" hides from alice every edge that touches
  -- bob, so run as alice this check would pass whether or not block_user deleted anything.
  perform set_config('role','postgres',true);
  if exists (select 1 from follows where (follower_id=alice and followee_id=bob) or (follower_id=bob and followee_id=alice)) then
    raise exception using errcode='PT001', message='block did not remove follow edges'; end if;
  perform set_config('role','authenticated',true);
  if exists (select 1 from get_player_profile(bob)) then
    raise exception using errcode='PT001', message='blocked target still visible to blocker'; end if;

  perform set_config('request.jwt.claims', format('{"sub":"%s","role":"authenticated"}', bob), true);
  if exists (select 1 from get_player_profile(alice)) then
    raise exception using errcode='PT001', message='blocker hidden-from check failed'; end if;
  if exists (select 1 from list_following(alice) where id = bob) then
    raise exception using errcode='PT001', message='blocked user leaked into list'; end if;

  perform set_config('request.jwt.claims', format('{"sub":"%s","role":"authenticated"}', alice), true);
  perform unblock_user(bob);
  if not exists (select 1 from get_player_profile(bob)) then
    raise exception using errcode='PT001', message='unblock did not restore visibility'; end if;

  insert into reports (reporter_id, reported_user_id, reason, description) values (alice, bob, 'spam', 'test');
  if not exists (select 1 from reports where reporter_id = alice and reported_user_id = bob and reason = 'spam') then
    raise exception using errcode='PT001', message='report not stored'; end if;

  raise notice 'OK social_graph';
end $$;
rollback;
