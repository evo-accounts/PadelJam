-- profiles.phone becomes nullable so social sign-in users (Apple/Google) can be
-- provisioned without a phone. The UNIQUE constraint stays — Postgres allows multiple
-- NULLs, so social users coexist; OTP users still get uniqueness enforcement at the
-- application layer (complete-account function checks auth.users.phone is present).
-- terms_accepted_at records implicit consent timestamp for social sign-ins.
alter table profiles alter column phone drop not null;
alter table profiles add column if not exists terms_accepted_at timestamptz;
