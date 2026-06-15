-- notifications: RLS (own-row), producer triggers, and partner_request_summary.
begin;
insert into auth.users (id, instance_id, aud, role, email) values
  ('f7000001-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000000','authenticated','authenticated','n1@x.com'),
  ('f7000002-0000-0000-0000-000000000002','00000000-0000-0000-0000-000000000000','authenticated','authenticated','n2@x.com'),
  ('f7000003-0000-0000-0000-000000000003','00000000-0000-0000-0000-000000000000','authenticated','authenticated','n3@x.com')
  on conflict do nothing;
insert into profiles (id, email, phone, full_name) values
  ('f7000001-0000-0000-0000-000000000001','n1@x.com','+351900040001','Alice N'),
  ('f7000002-0000-0000-0000-000000000002','n2@x.com','+351900040002','Bob N'),
  ('f7000003-0000-0000-0000-000000000003','n3@x.com','+351900040003','Carol N')
  on conflict do nothing;

do $$
declare a constant uuid := 'f7000001-0000-0000-0000-000000000001';
  b constant uuid := 'f7000002-0000-0000-0000-000000000002';
begin
  -- Seed a row for Alice via definer bypass (insert as superuser, RLS not yet in role context).
  insert into notifications (user_id, type, actor_id, actor_name) values (a, 'follow', b, 'Bob N');

  -- Act as Bob: must NOT see Alice's notification.
  perform set_config('role','authenticated',true);
  perform set_config('request.jwt.claims', format('{"sub":"%s","role":"authenticated"}', b), true);
  if exists (select 1 from notifications where user_id = a) then
    raise exception using errcode='PT001', message='RLS: other user notification visible'; end if;

  -- Act as Alice: sees her own, can mark read, can delete.
  perform set_config('request.jwt.claims', format('{"sub":"%s","role":"authenticated"}', a), true);
  if not exists (select 1 from notifications where user_id = a and type='follow') then
    raise exception using errcode='PT001', message='RLS: own notification not visible'; end if;
  update notifications set read_at = now() where user_id = a;
  if exists (select 1 from notifications where user_id = a and read_at is null) then
    raise exception using errcode='PT001', message='mark-read failed'; end if;
  delete from notifications where user_id = a;
  if exists (select 1 from notifications where user_id = a) then
    raise exception using errcode='PT001', message='delete-own failed'; end if;

  raise notice 'OK notifications_rls';
end $$;
rollback;
