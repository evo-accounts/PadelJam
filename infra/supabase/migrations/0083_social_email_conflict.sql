-- B1/§5.6: detect a social sign-in whose email is already owned by a DIFFERENT account.
-- Param-less (uses the caller's own session email) so it can't enumerate other users' emails.
create or replace function social_email_conflict() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1
    from profiles p
    join auth.users u on u.id = p.id
    where u.id <> auth.uid()
      and (select email from auth.users where id = auth.uid()) is not null
      and lower(u.email) = lower((select email from auth.users where id = auth.uid()))
  );
$$;
grant execute on function social_email_conflict() to authenticated;
