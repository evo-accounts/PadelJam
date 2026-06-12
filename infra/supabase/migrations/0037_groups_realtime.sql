-- 0037_groups_realtime.sql
alter publication supabase_realtime add table group_members;
alter publication supabase_realtime add table group_invitations;
alter publication supabase_realtime add table group_seasons;
