-- Keep profiles.email/phone in sync with auth.users after a verified email/phone change.
-- coalesce avoids nulling profiles' NOT NULL columns on a transient null on auth.users.
create or replace function sync_profile_contact()
returns trigger
language plpgsql security definer set search_path = public as $$
begin
  update profiles
     set email = coalesce(new.email, profiles.email),
         phone = coalesce(new.phone, profiles.phone)
   where profiles.id = new.id;
  return new;
end;
$$;
create trigger sync_profile_contact_aiu
  after update of email, phone on auth.users
  for each row execute function sync_profile_contact();
