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
      and round(st_y(location_point::geometry)::numeric, 4) = 38.72
      and round(st_x(location_point::geometry)::numeric, 4) = -9.14
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

  -- PAD-163: bounds. Rounding still applies (0149).
  perform set_my_location(38.72239, -9.13931, 'Round');
  if not exists (select 1 from profiles where id = 'e5000001-0000-0000-0000-000000000001'
      and st_y(location_point::geometry)::numeric = 38.72 and st_x(location_point::geometry)::numeric = -9.14)
  then raise exception using errcode='PT001', message='point not stored with 2 decimals'; end if;

  perform set_my_location(38.72, -9.14, repeat('ã', 200));
  if (select char_length(location_text) from profiles where id = 'e5000001-0000-0000-0000-000000000001') <> 200
  then raise exception using errcode='PT001', message='200 chars not accepted'; end if;
  perform set_my_location(38.72, -9.14, null);
  perform set_my_location(90, -180, 'edge');

  perform set_my_location(38.72, -9.14, 'keep');
  declare
    cases text[][] := array[
      array['38.72','-9.14', repeat('ã', 201), 'location_text_too_long'],
      array['91','0','x','invalid_coordinates'], array['-91','0','x','invalid_coordinates'],
      array['0','181','x','invalid_coordinates'], array['0','-181','x','invalid_coordinates'],
      array['NaN','0','x','invalid_coordinates'], array['0','Infinity','x','invalid_coordinates'],
      array['-Infinity','0','x','invalid_coordinates']];
    c text[];
  begin
    foreach c slice 1 in array cases loop
      begin
        perform set_my_location(c[1]::double precision, c[2]::double precision, c[3]);
        raise exception using errcode='PT001', message='should have been refused: '||c[4]||' '||c[1]||','||c[2];
      exception when sqlstate 'P0001' then
        if position(c[4] in sqlerrm) = 0 then
          raise exception using errcode='PT001', message='wrong error '||sqlerrm||' for '||c[4];
        end if;
      end;
    end loop;
  end;
  if not exists (select 1 from profiles where id = 'e5000001-0000-0000-0000-000000000001'
      and location_text = 'keep' and st_y(location_point::geometry)::numeric = 38.72)
  then raise exception using errcode='PT001', message='refused call changed the row'; end if;

  raise notice 'OK set_my_location';
end $$;
rollback;
