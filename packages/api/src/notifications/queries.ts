import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { useSession } from '@padel/auth';
import { useDb } from '../client';
import { qk } from '../query-keys';

const PAGE_SIZE = 20;

/**
 * Every notification type the server emits (notifications_type_check, latest: migration 0112).
 * Renderers translate `type` as an i18n key and must fall back gracefully for a type they do not
 * know — a newer server can emit one before an old app build is updated.
 *   event_created — a public group event was created (members see Join; no invitation, 0112).
 *   partner_left  — your team partner left, you lost the spot and need to set a team again (0112).
 *   partner_request — someone asked you to be their partner in a team event; opens the Partner
 *                     Requests screen (0113).
 */
export const NOTIFICATION_TYPES = [
  'event_invite', 'group_invite', 'community_invite', 'community_request_accepted', 'follow',
  'follow_joined_event', 'event_cancelled', 'event_updated', 'participant_confirmed', 'waitlist_spot',
  'results_published', 'event_created', 'partner_left', 'partner_request',
] as const;
export type NotificationType = (typeof NOTIFICATION_TYPES)[number];

export type NotificationRow = {
  id: string;
  type: string;
  actor_id: string | null;
  event_id: string | null;
  group_id: string | null;
  community_id: string | null;
  ref_id: string | null;
  actor_name: string | null;
  entity_name: string | null;
  read_at: string | null;
  cta_done: boolean;
  created_at: string;
};

export const useNotifications = () => {
  const db = useDb();
  const uid = useSession().session?.user.id;
  return useInfiniteQuery({
    queryKey: qk.notifications,
    enabled: !!uid,
    initialPageParam: 0,
    queryFn: async ({ pageParam: offset }) => {
      const { data, error } = await db
        .from('notifications')
        .select(
          'id, type, actor_id, event_id, group_id, community_id, ref_id, actor_name, entity_name, read_at, cta_done, created_at',
        )
        .order('created_at', { ascending: false })
        .range(offset as number, (offset as number) + PAGE_SIZE - 1);
      if (error) throw error;
      return (data ?? []) as NotificationRow[];
    },
    getNextPageParam: (lastPage: NotificationRow[], allPages: NotificationRow[][]) =>
      lastPage.length < PAGE_SIZE ? undefined : allPages.length * PAGE_SIZE,
  });
};

export const useUnreadCount = () => {
  const db = useDb();
  const uid = useSession().session?.user.id;
  return useQuery({
    queryKey: qk.notificationsUnread,
    enabled: !!uid,
    queryFn: async () => {
      const { count, error } = await db
        .from('notifications')
        .select('id', { count: 'exact', head: true })
        .is('read_at', null);
      if (error) throw error;
      return count ?? 0;
    },
  });
};

export const usePartnerRequestSummary = () => {
  const db = useDb();
  const uid = useSession().session?.user.id;
  return useQuery({
    queryKey: qk.partnerRequestSummary,
    enabled: !!uid,
    queryFn: async () => {
      const { data, error } = await db.rpc('partner_request_summary');
      if (error) throw error;
      return (data ?? 0) as number;
    },
  });
};

export type IncomingPartnerRequest = {
  kind: 'event' | 'community';
  request_id: string;
  entity_id: string;
  entity_name: string;
  requester_id: string;
  requester_name: string | null;
  requester_avatar: string | null;
  created_at: string;
  /** Event rows only (0113); null on community rows. */
  starts_at: string | null;
  venue_name: string | null;
  venue_address: string | null;
  manual_location_name: string | null;
  manual_location_address: string | null;
};

export const useIncomingPartnerRequests = () => {
  const db = useDb();
  const uid = useSession().session?.user.id;
  return useQuery({
    queryKey: qk.incomingPartnerRequests,
    enabled: !!uid,
    queryFn: async () => {
      const { data, error } = await db.rpc('incoming_partner_requests');
      if (error) throw error;
      return (data ?? []) as IncomingPartnerRequest[];
    },
  });
};

/** What the Partner Requests inbox shows under each event name: date, time and place. */
export type PartnerRequestEvent = {
  id: string;
  name: string;
  starts_at: string;
  has_location: boolean;
  manual_location_name: string | null;
  manual_location_address: string | null;
  location_text: string | null;
  venue: { name: string; address: string | null } | null;
};

/**
 * `incoming_partner_requests` (0098) carries only the event's id and name, so the inbox reads the
 * rest from `events` — visible to the target, who is an invitee, a participant or a member of the
 * event's public group. An event RLS hides is simply missing and its heading shows the name alone.
 */
export const usePartnerRequestEvents = (eventIds: readonly string[]) => {
  const db = useDb();
  const uid = useSession().session?.user.id;
  return useQuery({
    queryKey: qk.incomingPartnerRequestEvents(eventIds),
    enabled: !!uid && eventIds.length > 0,
    queryFn: async () => {
      const { data, error } = await db
        .from('events')
        .select(
          'id, name, starts_at, has_location, manual_location_name, manual_location_address, location_text, venue:venues(name, address)',
        )
        .in('id', [...eventIds])
        .returns<PartnerRequestEvent[]>();
      if (error) throw error;
      return data ?? [];
    },
  });
};
