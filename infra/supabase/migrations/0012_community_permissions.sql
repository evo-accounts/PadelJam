-- Member-grantable capability toggles only. Admin-only actions (create groups / create events)
-- are NEVER columns here — they are enforced purely by community role.
create table community_permissions (
  community_id          uuid primary key references communities(id) on delete cascade,
  invite_members        boolean not null default false,
  approve_join_requests boolean not null default false,
  create_posts          boolean not null default false,
  updated_at            timestamptz not null default now()
);

alter table community_permissions enable row level security;
create policy "community_permissions: read" on community_permissions for select using (
  community_id in (
    select id from communities where tenant_id in (select auth_tenant_ids()) or privacy = 'public'
  )
);
create policy "community_permissions: write" on community_permissions for all
  using (is_community_admin(community_id)) with check (is_community_admin(community_id));
