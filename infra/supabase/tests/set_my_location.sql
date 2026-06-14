-- set_my_location: persists coords+text for the caller; null coords clear the point;
-- only the caller's own row is written.
begin;
insert into auth.users (id, instance_id, aud, role, email) values
  ('e5000001-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000000','authenticated','authenticated','loc1@x.com'),
  ('e5000002-0000-0000-0000-000000000002','00000000-0000-0000-0000-000000000000','authenticated','authenticated','loc2@x.com') on conflict do nothing;
insert into profiles (id, email, phone, full_name) values
  ('e5000001-0000-0000-0000-000000000001','loc1@x.com','+351900600001','LocViewer'),
  ('e5000002-0000-0000-0000-000000000002','loc2@x.com','+351900600002','LocOther') on conflict do nothing;

do $$
begin
  perform set_config('role','authenticated',true);
  perform set_config('request.jwt.claims','{"sub":"e5000001-0000-0000-0000-000000000001","role":"authenticated"}',true);

  perform set_my_location(38.7223, -9.1393, 'Lisbon');
  if not exists (
    select 1 from profiles
    where id = 'e5000001-0000-0000-0000-000000000001'
      and location_text = 'Lisbon'
      and round(st_y(location_point::geometry)::numeric, 4) = 38.7223
      and round(st_x(location_point::geometry)::numeric, 4) = -9.1393
  ) then raise exception using errcode='PT001', message='coords/text not persisted'; end if;

  perform set_my_location(null, null, 'Just text');
  if not exists (
    select 1 from profiles
    where id = 'e5000001-0000-0000-0000-000000000001'
      and location_text = 'Just text' and location_point is null
  ) then raise exception using errcode='PT001', message='null coords did not clear point/set text'; end if;

  if exists (
    select 1 from profiles
    where id = 'e5000002-0000-0000-0000-000000000002'
      and (location_point is not null or location_text is not null)
  ) then raise exception using errcode='PT001', message='wrote another users row'; end if;

  raise notice 'OK set_my_location';
end $$;
rollback;
