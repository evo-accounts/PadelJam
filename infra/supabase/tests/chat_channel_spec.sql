-- chat_channel_spec: group member gets {name, members}; non-member -> forbidden;
-- a non-private group event -> no_chat.
begin;
insert into auth.users (id, instance_id, aud, role, email) values
  ('f1000001-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000000','authenticated','authenticated','cc1@x.com'),
  ('f1000002-0000-0000-0000-000000000002','00000000-0000-0000-0000-000000000000','authenticated','authenticated','cc2@x.com')
  on conflict do nothing;
insert into profiles (id, email, phone, full_name) values
  ('f1000001-0000-0000-0000-000000000001','cc1@x.com','+351900070001','Member CC'),
  ('f1000002-0000-0000-0000-000000000002','cc2@x.com','+351900070002','Outsider CC')
  on conflict do nothing;

do $$
declare a constant uuid := 'f1000001-0000-0000-0000-000000000001';
  b constant uuid := 'f1000002-0000-0000-0000-000000000002';
  v_tenant uuid; v_comm uuid; v_group uuid; v_event uuid;
  v_name text; v_members uuid[];
begin
  insert into tenants (type, name, country) values ('community', 'CC Tenant', 'PT') returning id into v_tenant;
  insert into communities (tenant_id, name, type, privacy) values (v_tenant, 'CC Community', 'club', 'public') returning id into v_comm;
  insert into groups (community_id, name) values (v_comm, 'CC Group') returning id into v_group;
  insert into group_members (group_id, user_id) values (v_group, a);
  -- a non-private group event (no own chat)
  insert into events (organizer_id, group_id, event_type, specification, scoring_mode, scoring_value,
                      manual_location_name, has_location, num_courts, is_private, starts_at,
                      duration_minutes, organizer_role, name, status)
    values (a, v_group, 'americano', 'mixed', 'points', 24, 'Court CC', true, 2, false, now() + interval '1 day',
            90, 'organizing_and_playing', 'CC Event', 'scheduled')
    returning id into v_event;

  -- member 'a' gets the group spec
  perform set_config('role','authenticated',true);
  perform set_config('request.jwt.claims', format('{"sub":"%s","role":"authenticated"}', a), true);
  select name, member_ids into v_name, v_members from chat_channel_spec('group', v_group);
  if v_name <> 'CC Group' or not (a = any(v_members)) then
    raise exception using errcode='PT001', message=format('group spec wrong name=%s members=%s', v_name, v_members); end if;

  -- non-member 'b' -> forbidden
  perform set_config('request.jwt.claims', format('{"sub":"%s","role":"authenticated"}', b), true);
  begin
    perform name from chat_channel_spec('group', v_group);
    raise exception using errcode='PT001', message='expected forbidden for non-member';
  exception when others then
    if sqlerrm <> 'forbidden' then raise exception using errcode='PT001', message='wrong err (group): '||sqlerrm; end if;
  end;

  -- non-private group event -> no_chat (even for the organizer 'a')
  perform set_config('request.jwt.claims', format('{"sub":"%s","role":"authenticated"}', a), true);
  begin
    perform name from chat_channel_spec('event', v_event);
    raise exception using errcode='PT001', message='expected no_chat for non-private group event';
  exception when others then
    if sqlerrm <> 'no_chat' then raise exception using errcode='PT001', message='wrong err (event): '||sqlerrm; end if;
  end;

  raise notice 'OK chat_channel_spec';
end $$;
rollback;
