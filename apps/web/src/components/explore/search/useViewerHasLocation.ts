'use client';
import { useQuery } from '@tanstack/react-query';
import { useDb, qk } from '@padel/api';
import { useSession } from '@padel/auth';

/**
 * Whether the viewer's profile has a point (`profiles.location_point`, set by `set_my_location`).
 * Every distance in search is measured from it, and with no point a distance filter would drop
 * every row (D2) — so the Filter sheet disables the distance control and the Distance sort.
 *
 * Keyed under the profile's own key so `useSetMyLocation`'s invalidation refreshes it.
 */
export function useViewerHasLocation(): { hasLocation: boolean; isLoading: boolean } {
  const db = useDb();
  const uid = useSession().session?.user.id;
  const query = useQuery({
    queryKey: [...qk.profile(uid ?? ''), 'has-location'],
    enabled: !!uid,
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await db.from('profiles').select('location_point').eq('id', uid!).maybeSingle();
      if (error) throw error;
      return data?.location_point != null;
    },
  });
  return { hasLocation: query.data ?? false, isLoading: query.isLoading };
}
