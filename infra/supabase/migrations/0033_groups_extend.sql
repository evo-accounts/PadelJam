-- 0033_groups_extend.sql
-- updated_at + trigger (mirrors communities; set_updated_at() defined in 0022).
alter table groups add column updated_at timestamptz not null default now();
create trigger trg_groups_updated_at before update on groups
  for each row execute function set_updated_at();

-- Re-point group_members.user_id auth.users -> profiles (0031 omitted this table); required for
-- PostgREST `group_members(..., profiles(...))` embeds. profiles.id is 1:1 with auth.users.id,
-- so auth.uid() (= profiles.id) keeps every membership check valid. Keep created_at as join time.
alter table group_members
  drop constraint if exists group_members_user_id_fkey,
  add  constraint group_members_user_id_fkey
       foreign key (user_id) references profiles(id) on delete cascade;
