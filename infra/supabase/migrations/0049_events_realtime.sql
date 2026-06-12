-- 0049_events_realtime.sql
-- Add event-engine tables to the supabase_realtime publication.
-- One statement per line so a failure on an already-published table is isolated.
alter publication supabase_realtime add table events;
alter publication supabase_realtime add table event_participants;
alter publication supabase_realtime add table event_invitations;
alter publication supabase_realtime add table event_teams;
alter publication supabase_realtime add table partner_requests;
alter publication supabase_realtime add table event_rounds;
alter publication supabase_realtime add table event_matches;
alter publication supabase_realtime add table match_players;
