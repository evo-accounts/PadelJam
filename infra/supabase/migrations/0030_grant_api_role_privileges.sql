-- Grant the Supabase API roles (anon/authenticated) base table privileges on the public schema.
-- RLS remains the row-level security layer; these are the table-level GRANTs RLS sits on top of.
-- Needed because Supabase's `auto_expose_new_tables` implicit default flipped to false (cutover
-- 2026-05-30), so tables are no longer auto-exposed to the Data API roles. Without these grants
-- every authenticated query fails with "permission denied for table ...", regardless of RLS.
-- Portable to hosted Supabase (prod) — do not rely on the CLI's auto-expose setting.

grant usage on schema public to anon, authenticated;

grant select, insert, update, delete on all tables in schema public to authenticated;
grant select on all tables in schema public to anon;
grant usage, select on all sequences in schema public to anon, authenticated;
grant execute on all functions in schema public to anon, authenticated;

-- Future tables/functions in this schema inherit the same grants.
alter default privileges in schema public
  grant select, insert, update, delete on tables to authenticated;
alter default privileges in schema public grant select on tables to anon;
alter default privileges in schema public grant usage, select on sequences to anon, authenticated;
alter default privileges in schema public grant execute on functions to anon, authenticated;
