import { useQuery } from '@tanstack/react-query';
import { useSession } from '@padel/auth';
import { useDb } from '../client';
import { qk } from '../query-keys';

export type NotificationSettings = {
  notifications_push: boolean;
  notifications_whatsapp: boolean;
  notifications_email: boolean;
};

const DEFAULTS: NotificationSettings = {
  notifications_push: true,
  notifications_whatsapp: false,
  notifications_email: false,
};

export const useMySettings = () => {
  const db = useDb();
  const uid = useSession().session?.user.id;
  return useQuery({
    queryKey: qk.mySettings(uid ?? ''),
    enabled: !!uid,
    queryFn: async (): Promise<NotificationSettings> => {
      const { data, error } = await db
        .from('user_settings')
        .select('notifications_push, notifications_whatsapp, notifications_email')
        .eq('user_id', uid!)
        .maybeSingle();
      if (error) throw error;
      return data ?? DEFAULTS;
    },
  });
};
