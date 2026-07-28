import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useDb } from '../client';
import { qk } from '../query-keys';
import { uniqueChannelTopic } from '../realtime-channel';

export const useCommunityFeedRealtime = (communityId: string) => {
  const db = useDb();
  const qc = useQueryClient();
  useEffect(() => {
    const invalidatePosts = () =>
      qc.invalidateQueries({ queryKey: qk.posts(communityId) });
    const ch = db
      .channel(uniqueChannelTopic('feed:' + communityId))
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'community_posts',
          filter: 'community_id=eq.' + communityId,
        },
        invalidatePosts,
      )
      // post_likes / post_comments filter by post, not community, so invalidate
      // the whole feed on any change.
      .on('postgres_changes', { event: '*', schema: 'public', table: 'post_likes' }, invalidatePosts)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'post_comments' },
        invalidatePosts,
      )
      .subscribe();
    return () => {
      db.removeChannel(ch);
    };
  }, [db, qc, communityId]);
};

export const useMembersRealtime = (communityId: string) => {
  const db = useDb();
  const qc = useQueryClient();
  useEffect(() => {
    const ch = db
      .channel(uniqueChannelTopic('members:' + communityId))
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'community_members',
          filter: 'community_id=eq.' + communityId,
        },
        () => qc.invalidateQueries({ queryKey: qk.members(communityId) }),
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'community_join_requests',
          filter: 'community_id=eq.' + communityId,
        },
        () => qc.invalidateQueries({ queryKey: qk.requests(communityId) }),
      )
      .subscribe();
    return () => {
      db.removeChannel(ch);
    };
  }, [db, qc, communityId]);
};
