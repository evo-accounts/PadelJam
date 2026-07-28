import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useDb } from '../client';
import { qk } from '../query-keys';
import { uniqueChannelTopic } from '../realtime-channel';

export const useGroupRealtime = (groupId: string) => {
  const db = useDb();
  const qc = useQueryClient();
  useEffect(() => {
    const ch = db
      .channel(uniqueChannelTopic('group:' + groupId))
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'group_members',
          filter: 'group_id=eq.' + groupId,
        },
        () => {
          qc.invalidateQueries({ queryKey: qk.groupMembers(groupId) });
          qc.invalidateQueries({ queryKey: qk.group(groupId) });
        },
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'group_seasons',
          filter: 'group_id=eq.' + groupId,
        },
        () => {
          qc.invalidateQueries({ queryKey: qk.groupSeasons(groupId) });
          qc.invalidateQueries({ queryKey: qk.group(groupId) });
        },
      )
      .subscribe();
    return () => {
      db.removeChannel(ch);
    };
  }, [db, qc, groupId]);
};
