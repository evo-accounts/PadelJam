-- B1/§5.6: detect a social sign-in whose email is already owned by a DIFFERENT account.
-- Matches the caller's social/session email (auth.users.email) against OTHER users' profiles.email.
-- (auth.users.email is unique, so two auth users can't share it; the §5.6 conflict is "the returned
--  email already matches an existing profiles row" owned by someone else.) Param-less -> no enumeration.
create or replace function social_email_conflict() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1
    from profiles p
    where p.id <> auth.uid()
      and lower(p.email) = lower((select email from auth.users where id = auth.uid()))
  );
$$;
grant execute on function social_email_conflict() to authenticated;
