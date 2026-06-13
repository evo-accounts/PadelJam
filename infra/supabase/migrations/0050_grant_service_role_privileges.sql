-- service_role was omitted from 0030's grants. Because auto_expose_new_tables was turned off
-- (2026-05-30), the service key role does NOT inherit table privileges automatically, so every
-- Edge Function that writes via the service key through PostgREST fails with
-- "permission denied for table ...". The complete-account function (server-side profile creation
-- after OTP) hit exactly this on `profiles`, breaking all onboarding. service_role is the trusted
-- backend role (bypasses RLS) and should have full DML on the public schema, mirroring 0030's grants
-- to authenticated.
grant usage on schema public to service_role;
grant select, insert, update, delete on all tables in schema public to service_role;
grant usage, select on all sequences in schema public to service_role;
grant execute on all functions in schema public to service_role;

-- Future tables/sequences/functions inherit the same grants.
alter default privileges in schema public grant select, insert, update, delete on tables to service_role;
alter default privileges in schema public grant usage, select on sequences to service_role;
alter default privileges in schema public grant execute on functions to service_role;
