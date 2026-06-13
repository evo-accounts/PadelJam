-- 0044_events_helpers_rls.sql
-- SECURITY DEFINER helpers (avoid the 0029 RLS-recursion class) + all event RLS policies.
create or replace function is_event_organizer(e uuid, u uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from events where id = e and organizer_id = u);
$$;
create or replace function is_event_participant(e uuid, u uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from event_participants where event_id = e and user_id = u);
$$;
create or replace function is_event_invitee(e uuid, u uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from event_invitations where event_id = e and invitee_id = u);
$$;
create or replace function event_is_visible(e uuid, u uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from events ev where ev.id = e and ev.deleted_at is null and (
      ev.organizer_id = u
      or exists (select 1 from event_participants p where p.event_id = e and p.user_id = u)
      or exists (select 1 from event_invitations i where i.event_id = e and i.invitee_id = u)
      or (ev.is_private = false and ev.group_id is not null
          and exists (select 1 from group_members gm where gm.group_id = ev.group_id and gm.user_id = u))
    )
  );
$$;
create or replace function event_capacity(e uuid) returns int
language sql stable security definer set search_path = public as $$
  select num_courts * 4 + coalesce(case when allow_standby then standby_spots else 0 end, 0)
  from events where id = e;
$$;
create or replace function event_group_community(e uuid) returns uuid
language sql stable security definer set search_path = public as $$
  select g.community_id from events ev join groups g on g.id = ev.group_id where ev.id = e;
$$;

-- events ----------------------------------------------------------------------
drop policy if exists "events: read" on events;
create policy "events: read" on events for select
  using (event_is_visible(id, auth.uid()));
drop policy if exists "events: insert" on events;
create policy "events: insert" on events for insert
  with check (organizer_id = auth.uid()
    and (group_id is null or is_community_admin((select community_id from groups where id = events.group_id))));
drop policy if exists "events: update" on events;
create policy "events: update" on events for update
  using (organizer_id = auth.uid()) with check (organizer_id = auth.uid());
drop policy if exists "events: delete" on events;
create policy "events: delete" on events for delete
  using (organizer_id = auth.uid());

-- event_series ----------------------------------------------------------------
drop policy if exists "event_series: read" on event_series;
create policy "event_series: read" on event_series for select
  using (exists (select 1 from group_members gm where gm.group_id = event_series.group_id and gm.user_id = auth.uid()));
drop policy if exists "event_series: insert" on event_series;
create policy "event_series: insert" on event_series for insert
  with check (organizer_id = auth.uid());
drop policy if exists "event_series: update" on event_series;
create policy "event_series: update" on event_series for update
  using (organizer_id = auth.uid()) with check (organizer_id = auth.uid());
drop policy if exists "event_series: delete" on event_series;
create policy "event_series: delete" on event_series for delete
  using (organizer_id = auth.uid());

-- event_courts ----------------------------------------------------------------
drop policy if exists "event_courts: read" on event_courts;
create policy "event_courts: read" on event_courts for select
  using (event_is_visible(event_id, auth.uid()));
drop policy if exists "event_courts: write" on event_courts;
create policy "event_courts: write" on event_courts for all
  using (is_event_organizer(event_id, auth.uid()))
  with check (is_event_organizer(event_id, auth.uid()));

-- event_participants (reads only; writes are RPC-only) -------------------------
drop policy if exists "event_participants: read" on event_participants;
create policy "event_participants: read" on event_participants for select
  using (event_is_visible(event_id, auth.uid()));

-- event_invitations -----------------------------------------------------------
drop policy if exists "event_invitations: read" on event_invitations;
create policy "event_invitations: read" on event_invitations for select
  using (invitee_id = auth.uid() or is_event_organizer(event_id, auth.uid()));
drop policy if exists "event_invitations: respond" on event_invitations;
create policy "event_invitations: respond" on event_invitations for update
  using (invitee_id = auth.uid()) with check (invitee_id = auth.uid());
drop policy if exists "event_invitations: organizer" on event_invitations;
create policy "event_invitations: organizer" on event_invitations for all
  using (is_event_organizer(event_id, auth.uid()))
  with check (is_event_organizer(event_id, auth.uid()));

-- event_teams -----------------------------------------------------------------
drop policy if exists "event_teams: read" on event_teams;
create policy "event_teams: read" on event_teams for select
  using (event_is_visible(event_id, auth.uid()));
drop policy if exists "event_teams: write" on event_teams;
create policy "event_teams: write" on event_teams for all
  using (is_event_organizer(event_id, auth.uid()))
  with check (is_event_organizer(event_id, auth.uid()));

-- partner_requests (inserts RPC-only) -----------------------------------------
drop policy if exists "partner_requests: read" on partner_requests;
create policy "partner_requests: read" on partner_requests for select
  using (requester_id = auth.uid() or target_id = auth.uid() or is_event_organizer(event_id, auth.uid()));
drop policy if exists "partner_requests: respond" on partner_requests;
create policy "partner_requests: respond" on partner_requests for update
  using (target_id = auth.uid()) with check (target_id = auth.uid());

-- event_rounds (reads only) ---------------------------------------------------
drop policy if exists "event_rounds: read" on event_rounds;
create policy "event_rounds: read" on event_rounds for select
  using (event_is_visible(event_id, auth.uid()));

-- event_matches ---------------------------------------------------------------
drop policy if exists "event_matches: read" on event_matches;
create policy "event_matches: read" on event_matches for select
  using (event_is_visible(event_id, auth.uid()));
drop policy if exists "event_matches: score" on event_matches;
create policy "event_matches: score" on event_matches for update
  using (is_event_organizer(event_id, auth.uid())
    or (exists (select 1 from events e where e.id = event_matches.event_id and e.players_submit_results)
        and exists (select 1 from match_players mp join event_participants p on p.id = mp.participant_id
                    where mp.match_id = event_matches.id and p.user_id = auth.uid())));

-- match_players (reads only) --------------------------------------------------
drop policy if exists "match_players: read" on match_players;
create policy "match_players: read" on match_players for select
  using (exists (select 1 from event_matches m where m.id = match_players.match_id and event_is_visible(m.event_id, auth.uid())));

-- round_rest (reads only) -----------------------------------------------------
drop policy if exists "round_rest: read" on round_rest;
create policy "round_rest: read" on round_rest for select
  using (exists (select 1 from event_rounds r where r.id = round_rest.round_id and event_is_visible(r.event_id, auth.uid())));

-- group_event_results (reads only) --------------------------------------------
drop policy if exists "group_event_results: read" on group_event_results;
create policy "group_event_results: read" on group_event_results for select
  using (exists (select 1 from group_seasons s join groups g on g.id = s.group_id
                 where s.id = group_event_results.group_season_id
                   and (is_group_member(g.id) or (g.is_private = false and is_community_member(g.community_id)))));
