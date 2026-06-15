import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { useSession } from '@padel/auth';
import { useDb } from '../client';
import { qk } from '../query-keys';

const PAGE_SIZE = 20;

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
