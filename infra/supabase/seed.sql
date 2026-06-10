-- Seed runs as superuser (bypasses RLS) — fine for fixtures. Fixed UUIDs for stable references.

-- PT tenant (club) + BR tenant (club)
insert into tenants (id, type, name, country) values
  ('11111111-1111-1111-1111-111111111111', 'club', 'Clube PT', 'PT'),
  ('22222222-2222-2222-2222-222222222222', 'club', 'Clube BR', 'BR');

insert into communities (id, tenant_id, name, type, privacy) values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '11111111-1111-1111-1111-111111111111', 'Lisboa Padel', 'club', 'public'),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', '22222222-2222-2222-2222-222222222222', 'São Paulo Padel', 'club', 'public');

insert into groups (community_id, name, is_general) values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Lisboa Padel', true),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'São Paulo Padel', true);
