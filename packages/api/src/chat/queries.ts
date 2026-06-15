import { useQuery } from '@tanstack/react-query';
import { useSession } from '@padel/auth';
import { useDb } from '../client';
import { qk } from '../query-keys';

export type StreamTokenResult = { token: string; userId: string };

// Fetches a Stream Chat token for the current user. The supabase client's functions.invoke
// attaches the caller's auth automatically. Token is reusable for the session.
export const useStreamToken = () => {
  const db = useDb();
  const uid = useSession().session?.user.id;
  return useQuery({
    queryKey: qk.streamToken,
    enabled: !!uid,
    staleTime: Infinity,
    queryFn: async () => {
      const { data, error } = await db.functions.invoke('stream-token');
      if (error) throw error;
      return data as StreamTokenResult;
    },
  });
};
