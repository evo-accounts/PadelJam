import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useSession } from '@padel/auth';
import { useDb } from '../client';
import { qk } from '../query-keys';
import type { NotificationSettings } from './queries';

export const useUpdateSettings = () => {
  const db = useDb();
  const qc = useQueryClient();
  const uid = useSession().session?.user.id;
  return useMutation({
    // Partial upsert: each call writes only the changed column(s), so two quick toggles
    // can't clobber each other (on-conflict updates only the provided columns).
    mutationFn: async (patch: Partial<NotificationSettings>) => {
      const { error } = await db.from('user_settings').upsert({
        user_id: uid!,
        ...patch,
        updated_at: new Date().toISOString(),
      });
      if (error) throw error;
    },
    onSuccess: () => {
      if (uid) qc.invalidateQueries({ queryKey: qk.mySettings(uid) });
    },
  });
};

export const useCreateSupportTicket = () => {
  const db = useDb();
  const uid = useSession().session?.user.id;
  return useMutation({
    mutationFn: async (input: { title: string; description: string }) => {
      const { error } = await db.from('support_tickets').insert({
        user_id: uid!,
        title: input.title,
        description: input.description,
      });
      if (error) throw error;
    },
  });
};
