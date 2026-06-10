create or replace function auth_tenant_ids()
returns setof uuid
language sql stable security definer set search_path = public as $$
  select tenant_id from tenant_memberships where user_id = auth.uid();
$$;

create or replace function is_community_admin(c uuid)
returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from community_members
    where community_id = c and user_id = auth.uid() and role in ('owner','admin')
  );
$$;
