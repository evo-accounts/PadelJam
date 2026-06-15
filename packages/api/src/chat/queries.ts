import { useQuery } from '@tanstack/react-query';
import { useSession } from '@padel/auth';
import { useDb } from '../client';
import { qk } from '../query-keys';

export type StreamTokenResult = { token: string; userId: string };

// Fetches a Stream Chat token for the current user. The supabase client's functions.invoke
// attaches the caller's auth automatically. Keyed by uid so a sign-out → sign-in-as-another-user
// (same JS runtime, cache not cleared) fetches a fresh token rather than reusing the prior user's.
// Tokens are minted without an exp (see stream-token edge fn), so staleTime: Infinity is safe; if
// an exp is ever added server-side, switch to a Stream tokenProvider refresh instead.
export const useStreamToken = () => {
  const db = useDb();
  const uid = useSession().session?.user.id;
  return useQuery({
    queryKey: qk.streamToken(uid ?? ''),
    enabled: !!uid,
    staleTime: Infinity,
    queryFn: async () => {
      const { data, error } = await db.functions.invoke('stream-token');
      if (error) throw error;
      return data as StreamTokenResult;
    },
  });
};
