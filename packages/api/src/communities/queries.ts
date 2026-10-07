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

/**
 * The communities this user CREATED (`communities.created_by`) and is still an ADMIN of.
 *
 * `created_by` is what `account_plan` keys the Jammer+ a community plan bundles on: one user per
 * community, the creator, deliberately narrowed in migration 0098 from "every admin" so that a role
 * change could not widen a paid entitlement (and since 0138 nobody can rewrite the column over
 * REST). Since 0138 `account_plan` also asks that the creator still be a MEMBER: a founder who left
 * or was removed loses the perk. `created_by` alone is no longer enough here either — every
 * signed-in user reads live `communities` rows, so a departed founder kept getting the row below,
 * and it opened onto an empty Plan section.
 *
 * UX-SET-01 shows the "Community Plans" row only to someone who has at least one, and the row only
 * goes to Manage Community's Plan section, which renders for admins (and `set_community_plan`
 * accepts only admins). So the membership asked for here is an ADMIN one — one step narrower than
 * `account_plan`: a founder demoted to plain member keeps the bundled Jammer+ (Settings still says
 * so on the Jammer+ row) but gets no shortcut to a screen they cannot use.
 *
 * Still NARROWER than the destination's own gate: a promoted admin can change the plan from Manage
 * Community, they just do not get the shortcut from Settings. That asymmetry is deliberate: the row
 * sits under "Subscription", and for a non-creator the subscription is not theirs.
 *
 * Archived communities are excluded: a plan on an archived community is not something to route to.
 */
export const useOwnedCommunities = () => {
  const db = useDb();
  const uid = useSession().session?.user.id;
  return useQuery({
    queryKey: qk.ownedCommunities,
    enabled: !!uid,
    queryFn: async () => {
      // `!inner` drops a community with no matching membership row; the embed resolves under the
      // caller's own RLS, which always shows them their own community_members row.
      const { data, error } = await db
        .from('communities')
        .select('id, name, community_members!inner(user_id, role)')
        .eq('created_by', uid!)
        .eq('community_members.user_id', uid!)
        .eq('community_members.role', 'admin')
        .is('archived_at', null)
        .order('name');
      if (error) throw error;
      return (data ?? []).map(({ id, name }) => ({ id, name }));
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

/**
 * Where the VIEWER stands with a community they are looking at, as one fact.
 *
 * The preview (UX-COMM-04) branches six ways — member, invited, requested, and the three
 * privacy modes for someone with no relationship — and each branch needs a different action.
 * Assembling that from `useCommunities` plus two more reads in the screen would mean three
 * loading states resolving independently and an action button that changes shape twice while
 * they land. One query, one answer.
 *
 * Precedence is member > invited > requested. A pending invitation outranks a pending request
 * because accepting it resolves both at once, and it is the only path into a private community.
 *
 * Every read here is already the viewer's own row under RLS (`cjr: read` and `ci: read` in
 * migration 0024 both key on `auth.uid()`), so this cannot report on anyone else.
 */
/**
 * How many members a community has, for someone who may not be allowed to list them.
 *
 * `community_members: read` (0024) gives an outsider the roster of a PUBLIC community and
 * nothing for the other two modes — and "nothing" arrives as an empty array, not an error, so
 * counting rows client-side reports a confident 0 for a request-to-join community with fifty
 * people in it. Migration 0100 answers the number without disclosing the names.
 *
 * Members and public-community viewers could count the roster they already hold, but then the
 * attribute card would be computed two different ways depending on who is looking, and only one
 * of them would be exercised by any given test.
 */
export const useCommunityMemberCount = (id: string | undefined) => {
  const db = useDb();
  const uid = useSession().session?.user.id;
  return useQuery({
    queryKey: qk.memberCount(id ?? ''),
    enabled: !!id && !!uid,
    queryFn: async () => {
      const { data, error } = await db.rpc('community_member_count', { c: id! });
      if (error) throw error;
      return (data as number | null) ?? 0;
    },
  });
};

export type CommunityStandingState = 'member' | 'invited' | 'requested' | 'none';

export type CommunityStanding = {
  state: CommunityStandingState;
  /** The viewer's own role, only when `state` is 'member'. */
  role: string | null;
  /** The pending invitation and who sent it, only when `state` is 'invited'. */
  invitation: {
    id: string;
    inviter: { id: string; full_name: string | null; avatar_url: string | null } | null;
  } | null;
};

export const useCommunityStanding = (id: string | undefined) => {
  const db = useDb();
  const uid = useSession().session?.user.id;
  return useQuery({
    queryKey: qk.standing(id ?? ''),
    enabled: !!id && !!uid,
    queryFn: async (): Promise<CommunityStanding> => {
      const [membership, request, invitation] = await Promise.all([
        db
          .from('community_members')
          .select('role')
          .eq('community_id', id!)
          .eq('user_id', uid!)
          .maybeSingle(),
        db
          .from('community_join_requests')
          .select('id')
          .eq('community_id', id!)
          .eq('user_id', uid!)
          .eq('status', 'pending')
          .maybeSingle(),
        db
          .from('community_invitations')
          // inviter_id and invitee_id both reach profiles, so the embed is disambiguated by
          // the constraint name — the same idiom as `useGroupInvitations` (migration 0021).
          .select('id, inviter:profiles!community_invitations_inviter_id_fkey(id, full_name, avatar_url)')
          .eq('community_id', id!)
          .eq('invitee_id', uid!)
          .eq('status', 'pending')
          .maybeSingle()
          .returns<{
            id: string;
            inviter: { id: string; full_name: string | null; avatar_url: string | null } | null;
          } | null>(),
      ]);

      if (membership.error) throw membership.error;
      if (request.error) throw request.error;
      if (invitation.error) throw invitation.error;

      if (membership.data) {
        return { state: 'member', role: membership.data.role, invitation: null };
      }
      if (invitation.data) {
        return {
          state: 'invited',
          role: null,
          invitation: { id: invitation.data.id, inviter: invitation.data.inviter },
        };
      }
      if (request.data) return { state: 'requested', role: null, invitation: null };
      return { state: 'none', role: null, invitation: null };
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
