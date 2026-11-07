-- PAD-160 / migration 0159 guard: no policy on `public` or `anon` may call an RLS helper, and anon
-- may not execute one. A later migration that adds a `to public` policy calling a helper would turn
-- anon's empty read on that table into 42501 in production; this fails first.
-- Run: psql -v ON_ERROR_STOP=1 -f infra/supabase/tests/rls_helpers_closed.sql  (not run by test:db)
do $$
declare
  helper text := '\m(auth_tenant_ids|can_create_post|community_is_public|is_community_admin|is_community_member|is_group_admin|is_group_member|may_approve_requests|event_is_visible|is_event_organizer|group_community_id|is_community_admin_of_group|can_read_community)\M';
  r record;
  fn text;
begin
  for r in select tablename, policyname from pg_policies
           where schemaname = 'public' and (roles && array['public', 'anon']::name[])
             and coalesce(qual, '') || coalesce(with_check, '') ~ helper loop
    raise exception using errcode = 'PT001',
      message = format('policy %I on %I calls an RLS helper but is not "to authenticated"', r.policyname, r.tablename);
  end loop;
  foreach fn in array array['auth_tenant_ids()', 'can_create_post(uuid)', 'community_is_public(uuid)',
    'is_community_admin(uuid)', 'is_community_member(uuid)', 'is_group_admin(uuid, uuid)', 'is_group_member(uuid)',
    'may_approve_requests(uuid)', 'event_is_visible(uuid, uuid)', 'is_event_organizer(uuid, uuid)',
    'group_community_id(uuid)', 'is_community_admin_of_group(uuid)', 'can_read_community(uuid)'] loop
    if has_function_privilege('anon', 'public.' || fn, 'execute') then
      raise exception using errcode = 'PT001', message = format('anon can execute %s', fn);
    end if;
  end loop;
end $$;
