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

export const useCanReviewCommunity = (communityId: string) => {
  const db = useDb();
  return useQuery({
    queryKey: qk.canReview(communityId),
    queryFn: async () => {
      const { data, error } = await db.rpc('can_review_community', { p_community_id: communityId });
      if (error) throw error;
      return data ?? false;
    },
  });
};

// Callers may not have the id yet (screens that derive it from another query still in
// flight). Without the `enabled` guard a falsy id is sent verbatim as `id=eq.` and
// PostgREST 400s on every such render, so gate the fetch rather than fetching a
// placeholder. Note a disabled query reports `isLoading: false` (v5 derives it as
// `isPending && isFetching`), so callers that spin on `isLoading` will not hang.
export const useCommunity = (id: string | undefined) => {
  const db = useDb();
  return useQuery({
    queryKey: qk.community(id ?? ''),
    enabled: !!id,
    queryFn: async () => {
      const { data, error } = await db.from('communities').select('*').eq('id', id!).single();
      if (error) throw error;
      return data;
    },
  });
};

export const useCommunityMembers = (id: string | undefined) => {
  const db = useDb();
  return useQuery({
    queryKey: qk.members(id ?? ''),
    enabled: !!id,
    queryFn: async () => {
      // profiles is reachable via the user_id FK at the DB level but the generated
      // types key community_members.user_id to auth_providers, so the embed is cast.
      const { data, error } = await db
        .from('community_members')
        .select('user_id, role, profiles(id, full_name, avatar_url)')
        .eq('community_id', id!)
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
      // The embed resolves under the reader's own RLS, and since migration 0099 an ARCHIVED
      // community is readable by its admins alone (UX-COMM-24). A member who was in one when it
      // was archived therefore keeps the membership row but gets `communities: null` back, so
      // those rows are dropped here rather than reaching the switcher as a community with no
      // fields. An admin's archived communities still arrive, which is what the switcher's
      // Archived section is built on.
      return (data ?? [])
        .filter((row) => row.communities != null)
        .map((row) => ({ role: row.role, community: row.communities }));
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
    enabled: !!uid,
    queryFn: async () => {
      // Embeds: aggregate counts for likes/comments + the current user's like row
      // (mine) so the UI can derive likedByMe. The `mine` embed MUST be filtered to the
      // current user — post_likes RLS lets a member read ALL likes, so without this filter
      // `mine` would be everyone's likes and likedByMe would be true for everyone.
      const { data, error } = await db
        .from('community_posts')
        .select(
          '*, author:profiles(id, full_name, avatar_url), likes:post_likes(count), comments:post_comments(count), mine:post_likes!left(user_id)',
        )
        .eq('community_id', id)
        .eq('mine.user_id', uid!)
        .order('created_at', { ascending: false })
        .returns<
          {
            id: string;
            community_id: string;
            author_id: string;
            kind: string;
            result_event_id: string | null;
            body: string | null;
            image_path: string | null;
            created_at: string;
            author: { id: string; full_name: string | null; avatar_url: string | null } | null;
            likes: { count: number }[];
            comments: { count: number }[];
            mine: { user_id: string }[];
          }[]
        >();
      if (error) throw error;
      return data ?? [];
    },
  });
};

export const usePost = (postId: string) => {
  const db = useDb();
  const uid = useSession().session?.user.id;
  return useQuery({
    queryKey: qk.post(postId),
    enabled: !!postId && !!uid,
    queryFn: async () => {
      const { data, error } = await db
        .from('community_posts')
        .select(
          '*, author:profiles(id, full_name, avatar_url), likes:post_likes(count), comments:post_comments(count), mine:post_likes!left(user_id)',
        )
        .eq('id', postId)
        .eq('mine.user_id', uid!)
        .single()
        .returns<{
          id: string;
          community_id: string;
          author_id: string;
          kind: string;
          body: string | null;
          image_path: string | null;
          created_at: string;
          author: { id: string; full_name: string | null; avatar_url: string | null } | null;
          likes: { count: number }[];
          comments: { count: number }[];
          mine: { user_id: string }[];
        }>();
      if (error) throw error;
      return data;
    },
  });
};

export const useComments = (postId: string) => {
  const db = useDb();
  return useQuery({
    queryKey: qk.comments(postId),
    enabled: !!postId,
    queryFn: async () => {
      // post_comments.author_id FKs profiles (migration 0031), so the embed resolves.
      const { data, error } = await db
        .from('post_comments')
        .select('id, post_id, author_id, body, created_at, author:profiles(full_name, avatar_url)')
        .eq('post_id', postId)
        .order('created_at', { ascending: true })
        .returns<
          {
            id: string;
            post_id: string;
            author_id: string;
            body: string;
            created_at: string;
            author: { full_name: string | null; avatar_url: string | null } | null;
          }[]
        >();
      if (error) throw error;
      return data ?? [];
    },
  });
};
