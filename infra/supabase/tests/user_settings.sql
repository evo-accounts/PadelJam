-- user_settings: upsert persists; defaults on fresh insert; own-row RLS.
begin;
insert into auth.users (id, instance_id, aud, role, email) values
  ('f3000001-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000000','authenticated','authenticated','us1@x.com'),
  ('f3000002-0000-0000-0000-000000000002','00000000-0000-0000-0000-000000000000','authenticated','authenticated','us2@x.com') on conflict do nothing;
insert into profiles (id, email, phone, full_name) values
  ('f3000001-0000-0000-0000-000000000001','us1@x.com','+351900900001','US One'),
  ('f3000002-0000-0000-0000-000000000002','us2@x.com','+351900900002','US Two') on conflict do nothing;

do $$
declare a constant uuid := 'f3000001-0000-0000-0000-000000000001';
  b constant uuid := 'f3000002-0000-0000-0000-000000000002';
begin
  perform set_config('role','authenticated',true);
  perform set_config('request.jwt.claims', format('{"sub":"%s","role":"authenticated"}', a), true);

  insert into user_settings (user_id) values (a);
  if not exists (select 1 from user_settings where user_id = a
      and notifications_push = true and notifications_whatsapp = false and notifications_email = false) then
    raise exception using errcode='PT001', message='defaults wrong'; end if;

  insert into user_settings (user_id, notifications_push, notifications_email)
    values (a, false, true)
    on conflict (user_id) do update set notifications_push = excluded.notifications_push,
      notifications_email = excluded.notifications_email;
  if not exists (select 1 from user_settings where user_id = a and notifications_push = false and notifications_email = true) then
    raise exception using errcode='PT001', message='upsert override not persisted'; end if;

  -- own-row RLS: user B cannot read A's row, and an update from B must not change it.
  perform set_config('request.jwt.claims', format('{"sub":"%s","role":"authenticated"}', b), true);
  if exists (select 1 from user_settings where user_id = a) then
    raise exception using errcode='PT001', message='other user row visible'; end if;
  update user_settings set notifications_push = true where user_id = a;
  perform set_config('request.jwt.claims', format('{"sub":"%s","role":"authenticated"}', a), true);
  if exists (select 1 from user_settings where user_id = a and notifications_push = true) then
    raise exception using errcode='PT001', message='other user mutated row'; end if;

  raise notice 'OK user_settings';
end $$;
rollback;
