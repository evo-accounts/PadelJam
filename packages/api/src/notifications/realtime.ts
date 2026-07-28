import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useSession } from '@padel/auth';
import { useDb } from '../client';
import { qk } from '../query-keys';
import { uniqueChannelTopic } from '../realtime-channel';

export const useNotificationsRealtime = () => {
  const db = useDb();
  const qc = useQueryClient();
  const uid = useSession().session?.user.id;
  useEffect(() => {
    if (!uid) return;
    const invalidate = () => {
      qc.invalidateQueries({ queryKey: qk.notifications });
      qc.invalidateQueries({ queryKey: qk.notificationsUnread });
    };
    const ch = db
      .channel(uniqueChannelTopic('notifications:' + uid))
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'notifications', filter: 'user_id=eq.' + uid },
        invalidate,
      )
      .subscribe();
    return () => {
      db.removeChannel(ch);
    };
  }, [db, qc, uid]);
};
