-- Phase 1B-1: new profile fields persist, are returned by get_player_profile, and CHECK-guarded.
begin;
insert into auth.users (id, instance_id, aud, role, email) values
  ('f2000001-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000000','authenticated','authenticated','pf1@x.com') on conflict do nothing;
insert into profiles (id, email, phone, full_name) values
  ('f2000001-0000-0000-0000-000000000001','pf1@x.com','+351900800001','Edit Me') on conflict do nothing;

do $$
declare me constant uuid := 'f2000001-0000-0000-0000-000000000001'; rejected boolean := false;
begin
  perform set_config('role','authenticated',true);
  perform set_config('request.jwt.claims', format('{"sub":"%s","role":"authenticated"}', me), true);

  update profiles set description='Bio here', preferred_time='morning', gender='male', date_of_birth=date '1990-05-01'
    where id = me;

  if not exists (select 1 from get_player_profile(me) where description = 'Bio here' and preferred_time = 'morning') then
    raise exception using errcode='PT001', message='new fields not returned by get_player_profile'; end if;

  begin
    update profiles set preferred_time = 'whenever' where id = me;
  exception when check_violation then rejected := true;
  end;
  if not rejected then raise exception using errcode='PT001', message='invalid preferred_time accepted'; end if;

  raise notice 'OK profile_fields';
end $$;
rollback;
