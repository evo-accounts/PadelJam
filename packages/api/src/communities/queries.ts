import { useQuery } from '@tanstack/react-query';
import { useSession } from '@padel/auth';
import { useDb } from '../client';
import { qk } from '../query-keys';

export const useCanCreateCommunity = () => {
  const db = useDb();
  return useQuery({
    queryKey: qk.canCreate,
    queryFn: async () => {
      const { data, error } = await db.rpc('can_create_community');
      if (error) throw error;
      return data ?? false;
    },
  });
};

export const useCommunity = (id: string) => {
  const db = useDb();
  return useQuery({
    queryKey: qk.community(id),
    queryFn: async () => {
      const { data, error } = await db.from('communities').select('*').eq('id', id).single();
      if (error) throw error;
      return data;
    },
  });
};

export const useCommunityMembers = (id: string) => {
  const db = useDb();
  return useQuery({
    queryKey: qk.members(id),
    queryFn: async () => {
      // profiles is reachable via the user_id FK at the DB level but the generated
      // types key community_members.user_id to auth_providers, so the embed is cast.
      const { data, error } = await db
        .from('community_members')
        .select('user_id, role, profiles(id, full_name, avatar_url)')
        .eq('community_id', id)
        .returns<
          {
            user_id: string;
            role: string;
            profiles: { id: string; full_name: string | null; avatar_url: string | null } | null;
          }[]
        >();
      if (error) throw error;
      return data;
    },
  });
};

export const useCommunityPermissions = (id: string) => {
  const db = useDb();
  return useQuery({
    queryKey: qk.permissions(id),
    queryFn: async () => {
      const { data, error } = await db
        .from('community_permissions')
        .select('*')
        .eq('community_id', id)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });
};

export const useCommunities = () => {
  const db = useDb();
  const uid = useSession().session?.user.id;
  return useQuery({
    queryKey: qk.communities,
    enabled: !!uid,
    queryFn: async () => {
      const { data, error } = await db
        .from('community_members')
        .select('role, communities(*)')
        .eq('user_id', uid!);
      if (error) throw error;
      return (data ?? []).map((row) => ({ role: row.role, community: row.communities }));
    },
  });
};

export const useDefaultCommunity = () => {
  const db = useDb();
  const uid = useSession().session?.user.id;
  return useQuery({
    queryKey: qk.defaultCommunity,
    enabled: !!uid,
    queryFn: async () => {
      const { data, error } = await db
        .from('user_default_community')
        .select('*')
        .eq('user_id', uid!)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });
};

export const useSuggestedCommunities = () => {
  const db = useDb();
  return useQuery({
    queryKey: qk.suggested,
    queryFn: async () => {
      // TODO(discovery): real proximity + friend-signal ranking; stable signature
      const { data, error } = await db
        .from('communities')
        .select('*')
        .is('archived_at', null)
        .eq('privacy', 'public')
        .order('created_at', { ascending: false })
        .limit(10);
      if (error) throw error;
      return data;
    },
  });
};

export const useCommunityReviews = (id: string) => {
  const db = useDb();
  return useQuery({
    queryKey: qk.reviews(id),
    queryFn: async () => {
      // profiles embed cast: community_reviews.user_id types to auth_providers.
      const { data, error } = await db
        .from('community_reviews')
        .select('*, profiles(full_name, avatar_url)')
        .eq('community_id', id)
        .returns<
          {
            id: string;
            community_id: string;
            user_id: string;
            rating: number;
            body: string | null;
            created_at: string;
            updated_at: string;
            profiles: { full_name: string | null; avatar_url: string | null } | null;
          }[]
        >();
      if (error) throw error;
      const reviews = data ?? [];
      const count = reviews.length;
      const average =
        count === 0 ? null : reviews.reduce((sum, r) => sum + r.rating, 0) / count;
      return { reviews, average, count };
    },
  });
};

export const useCommunityRequests = (id: string) => {
  const db = useDb();
  return useQuery({
    queryKey: qk.requests(id),
    queryFn: async () => {
      // profiles embed cast: community_join_requests.user_id types to auth_providers.
      const { data, error } = await db
        .from('community_join_requests')
        .select('*, profiles(full_name, avatar_url)')
        .eq('community_id', id)
        .eq('status', 'pending')
        .returns<
          {
            id: string;
            community_id: string;
            user_id: string;
            status: string;
            created_at: string;
            profiles: { full_name: string | null; avatar_url: string | null } | null;
          }[]
        >();
      if (error) throw error;
      return data;
    },
  });
};

export const useCommunityPosts = (id: string) => {
  const db = useDb();
  const uid = useSession().session?.user.id;
  return useQuery({
    queryKey: qk.posts(id),
    queryFn: async () => {
      // Embeds: aggregate counts for likes/comments + the current user's like row
      // (mine) so the UI can derive likedByMe. The embed shape is cast because the
      // generated types don't express the post_likes!left filtered relationship.
      const { data, error } = await db
        .from('community_posts')
        .select(
          '*, likes:post_likes(count), comments:post_comments(count), mine:post_likes!left(user_id)',
        )
        .eq('community_id', id)
        .order('created_at', { ascending: false })
        .returns<
          {
            id: string;
            community_id: string;
            author_id: string;
            kind: string;
            body: string | null;
            image_path: string | null;
            created_at: string;
            likes: { count: number }[];
            comments: { count: number }[];
            mine: { user_id: string }[];
          }[]
        >();
      if (error) throw error;
      const rows = data ?? [];
      void uid; // mine embed already scoped by RLS-safe select; uid kept for UI parity
      return rows;
    },
  });
};
