-- B1/§5.6: social_email_conflict() — true iff a DIFFERENT user owns a profiles row whose email
-- matches the caller's session (auth.users) email. The two auth users have DISTINCT auth emails
-- (auth.users.email is unique); the collision is on profiles.email.
begin;
insert into auth.users (id, instance_id, aud, role, email) values
  ('c1000001-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000000','authenticated','authenticated','owner-a@x.com'),
  ('c1000002-0000-0000-0000-000000000002','00000000-0000-0000-0000-000000000000','authenticated','authenticated','dup@x.com'),
  ('c1000003-0000-0000-0000-000000000003','00000000-0000-0000-0000-000000000000','authenticated','authenticated','solo@x.com') on conflict do nothing;
-- User A owns a profiles row with email dup@x.com (its auth email is owner-a@x.com — distinct).
-- User C is a sole owner of solo@x.com. User B (dup@x.com) is the fresh social caller — NO profiles row.
insert into profiles (id, email, phone, full_name) values
  ('c1000001-0000-0000-0000-000000000001','dup@x.com','+351911000001','OwnerA'),
  ('c1000003-0000-0000-0000-000000000003','solo@x.com','+351911000003','Solo') on conflict do nothing;

do $$
declare r boolean;
begin
  -- As user B (session email dup@x.com): user A's profiles row has email dup@x.com -> conflict true.
  perform set_config('role','authenticated',true);
  perform set_config('request.jwt.claims','{"sub":"c1000002-0000-0000-0000-000000000002","role":"authenticated"}',true);
  select social_email_conflict() into r;
  if not r then raise exception using errcode='PT001', message='expected conflict=true when another user owns a profiles row with the email'; end if;
  raise notice 'OK conflict true when another user owns the email';

  -- As user C (session email solo@x.com): only C''s own profiles row has solo@x.com (p.id = caller) -> false.
  perform set_config('request.jwt.claims','{"sub":"c1000003-0000-0000-0000-000000000003","role":"authenticated"}',true);
  select social_email_conflict() into r;
  if r then raise exception using errcode='PT001', message='expected conflict=false when the only match is the caller''s own profiles row'; end if;
  raise notice 'OK conflict false for the caller''s own email';

  raise notice 'OK social_email_conflict';
end $$;
rollback;
