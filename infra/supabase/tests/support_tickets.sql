-- support_tickets: a user creates + reads own; another user can't read it; status defaults open.
begin;
insert into auth.users (id, instance_id, aud, role, email) values
  ('f6000001-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000000','authenticated','authenticated','sup1@x.com'),
  ('f6000002-0000-0000-0000-000000000002','00000000-0000-0000-0000-000000000000','authenticated','authenticated','sup2@x.com') on conflict do nothing;
insert into profiles (id, email, phone, full_name) values
  ('f6000001-0000-0000-0000-000000000001','sup1@x.com','+351900030001','Sup One'),
  ('f6000002-0000-0000-0000-000000000002','sup2@x.com','+351900030002','Sup Two') on conflict do nothing;

do $$
declare a constant uuid := 'f6000001-0000-0000-0000-000000000001';
  b constant uuid := 'f6000002-0000-0000-0000-000000000002';
begin
  perform set_config('role','authenticated',true);
  perform set_config('request.jwt.claims', format('{"sub":"%s","role":"authenticated"}', a), true);

  insert into support_tickets (user_id, title, description) values (a, 'Help', 'Something broke');
  if not exists (select 1 from support_tickets where user_id = a and title = 'Help' and status = 'open') then
    raise exception using errcode='PT001', message='ticket not created with default status'; end if;

  perform set_config('request.jwt.claims', format('{"sub":"%s","role":"authenticated"}', b), true);
  if exists (select 1 from support_tickets where user_id = a) then
    raise exception using errcode='PT001', message='other user ticket visible'; end if;

  raise notice 'OK support_tickets';
end $$;
rollback;
