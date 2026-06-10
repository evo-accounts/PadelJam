create table profiles (
  id             uuid primary key references auth.users(id) on delete cascade,
  email          text not null unique,
  phone          text not null unique,
  full_name      text not null,
  avatar_url     text,
  locale         text not null default 'pt-PT' check (locale in ('pt-PT','pt-BR','en')),
  location_text  text,
  location_point geography(point),
  dominant_hand  text check (dominant_hand in ('left','right')),
  court_side     text check (court_side in ('left','right')),
  onboarded_at   timestamptz,
  created_at     timestamptz not null default now()
);

alter table profiles enable row level security;

-- profiles are global identity (documented exception to tenant-scoping)
create policy "profiles: read"   on profiles for select using (auth.role() = 'authenticated');
create policy "profiles: insert" on profiles for insert with check (id = auth.uid());
create policy "profiles: update" on profiles for update using (id = auth.uid());

-- "Try another way" support: which providers are linked to the current user
create view auth_providers
with (security_invoker = true) as
select
  u.id as user_id,
  (u.email is not null) as has_email,
  (u.phone is not null) as has_phone,
  exists (select 1 from auth.identities i where i.user_id = u.id and i.provider = 'google') as has_google,
  exists (select 1 from auth.identities i where i.user_id = u.id and i.provider = 'apple')  as has_apple,
  (u.encrypted_password is not null and u.encrypted_password <> '') as has_password
from auth.users u
where u.id = auth.uid();
