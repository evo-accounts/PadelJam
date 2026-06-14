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
    mutationFn: async (next: NotificationSettings) => {
      const { error } = await db.from('user_settings').upsert({
        user_id: uid!,
        notifications_push: next.notifications_push,
        notifications_whatsapp: next.notifications_whatsapp,
        notifications_email: next.notifications_email,
        updated_at: new Date().toISOString(),
      });
      if (error) throw error;
    },
    onSuccess: () => {
      if (uid) qc.invalidateQueries({ queryKey: qk.mySettings(uid) });
    },
  });
};
