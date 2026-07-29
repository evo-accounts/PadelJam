import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { useSession } from '@padel/auth';
import type { Tables } from '@padel/db';
import { useDb } from '../client';
import { qk } from '../query-keys';

type ProfileEmbed = { id: string; full_name: string | null; avatar_url: string | null } | null;

// event_participants has TWO foreign keys to profiles — user_id and invited_by —
// so PostgREST cannot infer what an unqualified `profiles(...)` embed means and
// answers 300 PGRST201 instead of rows. Every embed of a participant's profile
// must name the FK explicitly, including the nested ones reached through
// event_teams and match_players. Same pattern as the event_invitations and
// partner_requests embeds below, which are qualified for the same reason.
export const PARTICIPANT_PROFILE_EMBED =
  'profiles!event_participants_user_id_fkey(id, full_name, avatar_url)';

export const useGroupEvents = (groupId: string) => {
  const db = useDb();
  return useQuery({
    queryKey: qk.events(groupId),
    queryFn: async () => {
      const { data, error } = await db
        .from('events')
        .select('*')
        .eq('group_id', groupId)
        .is('deleted_at', null)
        .order('starts_at', { ascending: true });
      if (error) throw error;
      return data;
    },
  });
};

export const useCommunityEvents = (communityId: string) => {
  const db = useDb();
  return useQuery({
    queryKey: qk.communityEvents(communityId),
    enabled: !!communityId,
    queryFn: async () => {
      // events.group_id -> groups.community_id; inner join filters to this community.
      const { data, error } = await db
        .from('events')
        .select('*, groups!inner(community_id)')
        .eq('groups.community_id', communityId)
        .is('deleted_at', null)
        .order('starts_at', { ascending: true });
      if (error) throw error;
      return data;
    },
  });
};

export const useCanCreateEvent = (groupId: string) => {
  const db = useDb();
  return useQuery({
    queryKey: qk.canCreateEvent(groupId),
    queryFn: async () => {
      const { data, error } = await db.rpc('can_create_event', { p_group_id: groupId });
      if (error) throw error;
      return data ?? false;
    },
  });
};

export type EventDetail = Tables<'events'> & {
  venue: { name: string; address: string | null } | null;
};

export const useEvent = (id: string) => {
  const db = useDb();
  return useQuery({
    queryKey: qk.event(id),
    queryFn: async () => {
      // .maybeSingle(): a private event the user can't see returns null (RLS
      // filters the row) rather than throwing — the no-access UI relies on this.
      const { data, error } = await db
        .from('events')
        .select('*, venue:venues(name, address)')
        .eq('id', id)
        .maybeSingle()
        .returns<EventDetail>();
      if (error) throw error;
      return data;
    },
  });
};

export const useEventParticipants = (id: string) => {
  const db = useDb();
  return useQuery({
    queryKey: qk.eventParticipants(id),
    queryFn: async () => {
      // profiles is reachable via user_id but the generated types key it to
      // auth tables, so the embed is cast via .returns<>().
      const { data, error } = await db
        .from('event_participants')
        .select(`*, ${PARTICIPANT_PROFILE_EMBED}`)
        .eq('event_id', id)
        .order('joined_at', { ascending: true })
        .returns<
          {
            id: string;
            event_id: string;
            user_id: string | null;
            status: string;
            is_standby: boolean;
            confirmed_at: string | null;
            has_paid: boolean;
            paid_at: string | null;
            joined_at: string;
            waiting_list_position: number | null;
            guest_name: string | null;
            guest_gender: string | null;
            invited_by: string | null;
            profiles: ProfileEmbed;
          }[]
        >();
      if (error) throw error;
      return data;
    },
  });
};

export const useEventInvitations = (id: string) => {
  const db = useDb();
  return useQuery({
    queryKey: qk.eventInvitations(id),
    queryFn: async () => {
      const { data, error } = await db
        .from('event_invitations')
        .select(
          '*, invitee:profiles!event_invitations_invitee_id_fkey(id, full_name, avatar_url)',
        )
        .eq('event_id', id)
        .eq('status', 'pending')
        .returns<
          {
            id: string;
            event_id: string;
            invitee_id: string | null;
            invitee_name: string | null;
            invitee_email: string | null;
            invitee_phone: string | null;
            invited_by: string;
            status: string;
            invited_at: string;
            responded_at: string | null;
            invitee: ProfileEmbed;
          }[]
        >();
      if (error) throw error;
      return data;
    },
  });
};

export interface TeamSlotPlayer {
  id: string;
  user_id: string | null;
  guest_name: string | null;
  status: string;
  profiles: ProfileEmbed;
}
export interface TeamRow {
  id: string;
  team_number: number;
  is_confirmed: boolean;
  player_a: TeamSlotPlayer | null;
  player_b: TeamSlotPlayer | null;
}

export const useEventTeams = (id: string) => {
  const db = useDb();
  return useQuery({
    queryKey: qk.eventTeams(id),
    queryFn: async () => {
      const { data, error } = await db
        .from('event_teams')
        // event_participants has TWO FKs to profiles (user_id, invited_by), so the
        // nested profiles embed MUST name the constraint or PostgREST answers
        // PGRST201 (HTTP 300) and the whole query fails.
        .select(
          'id, team_number, is_confirmed, ' +
            `player_a:event_participants!player_a_id (id, user_id, guest_name, status, ${PARTICIPANT_PROFILE_EMBED}), ` +
            `player_b:event_participants!player_b_id (id, user_id, guest_name, status, ${PARTICIPANT_PROFILE_EMBED})`,
        )
        .eq('event_id', id)
        .order('team_number', { ascending: true })
        .returns<TeamRow[]>();
      if (error) throw error;
      return data ?? [];
    },
  });
};

export const useEventRounds = (id: string) => {
  const db = useDb();
  return useQuery({
    queryKey: qk.eventRounds(id),
    queryFn: async () => {
      const { data, error } = await db
        .from('event_rounds')
        .select('*')
        .eq('event_id', id)
        .order('round_number', { ascending: true });
      if (error) throw error;
      return data;
    },
  });
};

export const useEventMatches = (id: string) => {
  const db = useDb();
  return useQuery({
    queryKey: qk.eventMatches(id),
    queryFn: async () => {
      // match_players embeds its participant; the participant in turn embeds the
      // profile. Both embeds are cast via .returns<>() (profiles is keyed to
      // auth tables in the generated types). The nested profiles embed names the
      // user_id constraint because event_participants has two FKs to profiles
      // (user_id, invited_by) — without the hint PostgREST answers PGRST201.
      const { data, error } = await db
        .from('event_matches')
        .select(
          `*, match_players(id, side, participant_id, event_participants(id, user_id, guest_name, ${PARTICIPANT_PROFILE_EMBED}))`,
        )
        .eq('event_id', id)
        .order('court_number', { ascending: true })
        .returns<
          {
            id: string;
            event_id: string;
            round_id: string;
            court_id: string | null;
            court_number: number;
            match_number: number;
            side_a_score: number | null;
            side_b_score: number | null;
            status: string;
            submitted_at: string | null;
            submitted_by: string | null;
            created_at: string;
            match_players: {
              id: string;
              side: string;
              participant_id: string;
              event_participants: {
                id: string;
                user_id: string | null;
                guest_name: string | null;
                profiles: ProfileEmbed;
              } | null;
            }[];
          }[]
        >();
      if (error) throw error;
      return data;
    },
  });
};

export const useEventStandings = (id: string) => {
  const db = useDb();
  return useQuery({
    queryKey: qk.eventStandings(id),
    queryFn: async () => {
      const { data, error } = await db.rpc('standings', { p_event_id: id });
      if (error) throw error;
      return data ?? [];
    },
  });
};

export const usePartnerRequests = (id: string) => {
  const db = useDb();
  const uid = useSession().session?.user.id;
  return useQuery({
    queryKey: qk.partnerRequests(id),
    enabled: !!uid,
    queryFn: async () => {
      const { data, error } = await db
        .from('partner_requests')
        .select(
          '*, requester:profiles!partner_requests_requester_id_fkey(id, full_name, avatar_url), target:profiles!partner_requests_target_id_fkey(id, full_name, avatar_url)',
        )
        .eq('event_id', id)
        .returns<
          {
            id: string;
            event_id: string;
            requester_id: string;
            target_id: string;
            status: string;
            created_at: string;
            responded_at: string | null;
            requester: ProfileEmbed;
            target: ProfileEmbed;
          }[]
        >();
      if (error) throw error;
      return data;
    },
  });
};

export type MyEventsFilter = 'all' | 'organizing' | 'going';
const MY_EVENTS_PAGE_SIZE = 20;

export const useMyEvents = (filter: MyEventsFilter) => {
  const db = useDb();
  const uid = useSession().session?.user.id;
  return useInfiniteQuery({
    queryKey: qk.myEvents(filter),
    enabled: !!uid,
    initialPageParam: 0,
    queryFn: async ({ pageParam: offset }) => {
      const { data, error } = await db.rpc('my_events', {
        p_filter: filter,
        p_limit: MY_EVENTS_PAGE_SIZE,
        p_offset: offset as number,
      });
      if (error) throw error;
      return data ?? [];
    },
    getNextPageParam: (lastPage: unknown[], allPages: unknown[][]) =>
      lastPage.length < MY_EVENTS_PAGE_SIZE ? undefined : allPages.length * MY_EVENTS_PAGE_SIZE,
  });
};

export const useSearchVenues = (query: string) => {
  const db = useDb();
  return useQuery({
    queryKey: qk.searchVenues(query),
    enabled: query.trim().length > 0,
    queryFn: async () => {
      const { data, error } = await db.rpc('search_venues', { p_query: query.trim() });
      if (error) throw error;
      return data ?? [];
    },
  });
};

export interface ActivityRow {
  id: string;
  action: string;
  detail: { target_name?: string; guest_name?: string; mode?: string; status?: string; changes?: string[] } | null;
  created_at: string;
  profiles: { full_name: string | null; avatar_url: string | null } | null;
}

export const useEventActivity = (eventId: string) => {
  const db = useDb();
  return useQuery({
    queryKey: qk.eventActivity(eventId),
    queryFn: async () => {
      const { data, error } = await db
        .from('event_activity')
        .select('id, action, detail, created_at, profiles:actor_id (full_name, avatar_url)')
        .eq('event_id', eventId)
        .order('created_at', { ascending: false })
        .returns<ActivityRow[]>();
      if (error) throw error;
      return data ?? [];
    },
  });
};

export interface BlastTemplate {
  id: string;
  title: string;
  description: string;
  image_path: string;
  category: string | null;
  is_default: boolean;
}
export interface EventBlast {
  id: string;
  title: string;
  description: string;
  channels: string[];
  sent_to_count: number;
  sent_at: string;
  source_template_id: string | null;
  image_path: string | null;
}

export const useBlastTemplates = () => {
  const db = useDb();
  return useQuery({
    queryKey: qk.blastTemplates,
    queryFn: async () => {
      const { data, error } = await db
        .from('blast_templates')
        .select('id, title, description, image_path, category, is_default')
        .eq('is_active', true)
        .order('is_default', { ascending: false })
        .order('created_at', { ascending: true })
        .returns<BlastTemplate[]>();
      if (error) throw error;
      return data ?? [];
    },
  });
};

export const useEventBlasts = (eventId: string) => {
  const db = useDb();
  return useQuery({
    queryKey: qk.eventBlasts(eventId),
    queryFn: async () => {
      const { data, error } = await db
        .from('event_blasts')
        .select('id, title, description, channels, sent_to_count, sent_at, source_template_id, image_path')
        .eq('event_id', eventId)
        .order('sent_at', { ascending: false })
        .returns<EventBlast[]>();
      if (error) throw error;
      return data ?? [];
    },
  });
};

export const useCanCustomizeBlast = (eventId: string) => {
  const db = useDb();
  return useQuery({
    queryKey: qk.canCustomizeBlast(eventId),
    queryFn: async () => {
      const { data, error } = await db.rpc('can_customize_blast', { p_event_id: eventId });
      if (error) throw error;
      return data ?? false;
    },
  });
};

export interface EventSeriesInfo {
  day_of_week: number;
  start_time: string;
  is_active: boolean;
}

export const useEventSeries = (eventId: string) => {
  const db = useDb();
  return useQuery({
    queryKey: qk.eventSeries(eventId),
    queryFn: async () => {
      const { data, error } = await db
        .from('events')
        .select('series_id, event_series(day_of_week, start_time, is_active)')
        .eq('id', eventId)
        .maybeSingle()
        .returns<{ series_id: string | null; event_series: EventSeriesInfo | null }>();
      if (error) throw error;
      return data?.event_series ?? null;
    },
  });
};

export interface EventTimerRow {
  duration_seconds: number;
  started_at: string | null;
  paused_at: string | null;
  status: 'idle' | 'running' | 'paused';
}
export const useEventTimer = (eventId: string) => {
  const db = useDb();
  return useQuery({
    queryKey: qk.eventTimer(eventId),
    queryFn: async () => {
      const { data, error } = await db
        .from('event_timer')
        .select('duration_seconds, started_at, paused_at, status')
        .eq('event_id', eventId)
        .maybeSingle()
        .returns<EventTimerRow | null>();
      if (error) throw error;
      return data;
    },
  });
};

export interface ResultPlacement { rank: number; name: string; points: number }
export const useEventResultSummary = (eventId: string) => {
  const db = useDb();
  return useQuery({
    queryKey: qk.eventResultSummary(eventId),
    queryFn: async () => {
      const { data, error } = await db.rpc('event_result_summary', { p_event_id: eventId });
      if (error) throw error;
      return (data ?? []) as ResultPlacement[];
    },
  });
};

export interface BlastDelivery {
  status: 'sent' | 'failed';
  attempt: number;
  sent_count: number;
  failed_count: number;
  error: string | null;
}
export const useEventBlastDeliveries = (eventId: string) => {
  const db = useDb();
  return useQuery({
    queryKey: qk.blastDeliveries(eventId),
    queryFn: async () => {
      const { data, error } = await db
        .from('delivery_log')
        .select('blast_id, status, attempt, sent_count, failed_count, error, event_blasts!inner(event_id)')
        .eq('event_blasts.event_id', eventId)
        .order('attempt', { ascending: false });
      if (error) throw error;
      // Rows are attempt-desc; first time we see a blast_id is its latest attempt.
      const latest: Record<string, BlastDelivery> = {};
      for (const r of (data ?? []) as unknown as {
        blast_id: string; status: 'sent' | 'failed'; attempt: number;
        sent_count: number; failed_count: number; error: string | null;
      }[]) {
        if (r.blast_id && !latest[r.blast_id]) {
          latest[r.blast_id] = { status: r.status, attempt: r.attempt,
            sent_count: r.sent_count, failed_count: r.failed_count, error: r.error };
        }
      }
      return latest;
    },
  });
};
