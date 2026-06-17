import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { useSession } from '@padel/auth';
import { useDb } from '../client';
import { qk } from '../query-keys';

type ProfileEmbed = { id: string; full_name: string | null; avatar_url: string | null } | null;

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

export const useEvent = (id: string) => {
  const db = useDb();
  return useQuery({
    queryKey: qk.event(id),
    queryFn: async () => {
      // .maybeSingle(): a private event the user can't see returns null (RLS
      // filters the row) rather than throwing — the no-access UI relies on this.
      const { data, error } = await db.from('events').select('*').eq('id', id).maybeSingle();
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
        .select('*, profiles(id, full_name, avatar_url)')
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

export const useEventTeams = (id: string) => {
  const db = useDb();
  return useQuery({
    queryKey: qk.eventTeams(id),
    queryFn: async () => {
      const { data, error } = await db
        .from('event_teams')
        .select('*')
        .eq('event_id', id)
        .order('team_number', { ascending: true });
      if (error) throw error;
      return data;
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
      // auth tables in the generated types).
      const { data, error } = await db
        .from('event_matches')
        .select(
          '*, match_players(id, side, participant_id, event_participants(id, user_id, guest_name, profiles(id, full_name, avatar_url)))',
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
  detail: { target_name?: string; guest_name?: string; mode?: string; status?: string } | null;
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
