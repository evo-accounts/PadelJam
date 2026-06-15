import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useDb } from '../client';
import { qk } from '../query-keys';
import type { NotificationRow } from './queries';

const invalidate = (qc: ReturnType<typeof useQueryClient>) => {
  qc.invalidateQueries({ queryKey: qk.notifications });
  qc.invalidateQueries({ queryKey: qk.notificationsUnread });
};

export const useMarkRead = () => {
  const db = useDb();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await db
        .from('notifications')
        .update({ read_at: new Date().toISOString() })
        .eq('id', id)
        .is('read_at', null);
      if (error) throw error;
    },
    onSuccess: () => invalidate(qc),
  });
};

export const useMarkAllRead = () => {
  const db = useDb();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const { error } = await db
        .from('notifications')
        .update({ read_at: new Date().toISOString() })
        .is('read_at', null);
      if (error) throw error;
    },
    onSuccess: () => invalidate(qc),
  });
};

export const useClearAll = () => {
  const db = useDb();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      // Delete every row the caller owns (RLS scopes this to auth.uid()).
      const { error } = await db
        .from('notifications')
        .delete()
        .not('id', 'is', null);
      if (error) throw error;
    },
    onSuccess: () => invalidate(qc),
  });
};

// Acts on an invitation notification's Join CTA, then flips cta_done.
export const useCompleteNotificationCta = () => {
  const db = useDb();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (n: NotificationRow) => {
      // Arg names match the existing accept hooks exactly: event/group accept by
      // ENTITY id, community accepts by INVITATION id (ref_id).
      if (n.type === 'event_invite' && n.event_id) {
        const { error } = await db.rpc('accept_event_invitation', { p_event_id: n.event_id });
        if (error) throw error;
      } else if (n.type === 'group_invite' && n.group_id) {
        const { error } = await db.rpc('accept_group_invitation', { p_group_id: n.group_id });
        if (error) throw error;
      } else if (n.type === 'community_invite' && n.ref_id) {
        const { error } = await db.rpc('accept_invitation', { p_invitation_id: n.ref_id });
        if (error) throw error;
      } else {
        throw new Error('not_a_cta_notification');
      }
      const { error: upErr } = await db
        .from('notifications')
        .update({ cta_done: true, read_at: new Date().toISOString() })
        .eq('id', n.id);
      if (upErr) throw upErr;
    },
    onSuccess: () => invalidate(qc),
  });
};
