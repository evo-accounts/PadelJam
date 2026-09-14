-- Member-grantable capability toggles only. Admin-only actions (create groups / create events)
-- are NEVER columns here — they are enforced purely by community role.
--
-- REVERSED by 0098_community_roles_permissions.sql (2026-09-14). The Community UX audit
-- (docs/audit/2026-09-14-ux-community.md, UX-COMM-17) makes both of those member-grantable: it
-- specifies five toggles, with create_events on by default and create_groups off. The rule above
-- assumed group and event creation were inherently admin-only; the audit's permission matrix says
-- they are not, and the product owner confirmed the reversal rather than the audit being wrong.
-- 0098 adds the two columns, flips the defaults to the matrix, and enforces both in
-- may_create_group / may_create_event. Left here rather than deleted so the earlier reasoning —
-- and the fact that it was overturned on purpose — is legible from this file.
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
