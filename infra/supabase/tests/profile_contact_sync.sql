-- Trigger keeps profiles.email/phone in sync with auth.users; null on auth.users doesn't null profiles.
begin;
insert into auth.users (id, instance_id, aud, role, email, phone) values
  ('f4000001-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000000','authenticated','authenticated','old@x.com','+351900010001') on conflict do nothing;
insert into profiles (id, email, phone, full_name) values
  ('f4000001-0000-0000-0000-000000000001','old@x.com','+351900010001','Sync Me') on conflict do nothing;

do $$
declare uid constant uuid := 'f4000001-0000-0000-0000-000000000001';
begin
  update auth.users set email = 'new@x.com' where id = uid;
  if not exists (select 1 from profiles where id = uid and email = 'new@x.com') then
    raise exception using errcode='PT001', message='email not synced'; end if;

  update auth.users set phone = '+351900010099' where id = uid;
  if not exists (select 1 from profiles where id = uid and phone = '+351900010099') then
    raise exception using errcode='PT001', message='phone not synced'; end if;

  update auth.users set phone = null where id = uid;
  if not exists (select 1 from profiles where id = uid and phone = '+351900010099') then
    raise exception using errcode='PT001', message='null on auth.users nulled the profile phone'; end if;

  raise notice 'OK profile_contact_sync';
end $$;
rollback;
