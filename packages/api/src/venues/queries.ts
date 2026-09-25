import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { useSession } from '@padel/auth';
import { useDb } from '../client';
import { qk } from '../query-keys';
import type { VenueSearchRow } from '../events/queries';

export const ADMIN_VENUES_PAGE_SIZE = 50;

export type VenueCourt = { id: string; name: string; sort_order: number };
export type VenueDetail = {
  id: string;
  name: string;
  address: string | null;
  image_path: string | null;
  deleted_at: string | null;
};

/**
 * Is the signed-in user a platform super admin (a `platform_admins` row, migration 0114)?
 * `data` is `undefined` while loading and for signed-out visitors — treat only `true` as yes.
 */
export const useIsSuperAdmin = () => {
  const db = useDb();
  const uid = useSession().session?.user.id;
  return useQuery({
    queryKey: qk.isSuperAdmin(uid ?? ''),
    enabled: !!uid,
    queryFn: async () => {
      const { data, error } = await db.rpc('is_super_admin');
      if (error) throw error;
      return data === true;
    },
  });
};

/** The whole registry for the super-admin list: alphabetical, paged, optionally filtered. */
export const useAdminVenues = (query: string) => {
  const db = useDb();
  const term = query.trim();
  return useInfiniteQuery({
    queryKey: qk.adminVenues(term),
    initialPageParam: 0,
    queryFn: async ({ pageParam: offset }): Promise<VenueSearchRow[]> => {
      const { data, error } = await db.rpc('search_venues', {
        p_query: term,
        p_limit: ADMIN_VENUES_PAGE_SIZE,
        p_offset: offset as number,
      });
      if (error) throw error;
      return (data ?? []) as VenueSearchRow[];
    },
    getNextPageParam: (lastPage: unknown[], allPages: unknown[][]) =>
      lastPage.length < ADMIN_VENUES_PAGE_SIZE ? undefined : allPages.length * ADMIN_VENUES_PAGE_SIZE,
  });
};

/** One venue row. Readable by everyone while live; a super admin also reads soft-deleted ones. */
export const useVenue = (venueId: string | null | undefined) => {
  const db = useDb();
  return useQuery({
    queryKey: qk.venue(venueId ?? ''),
    enabled: !!venueId,
    queryFn: async (): Promise<VenueDetail | null> => {
      const { data, error } = await db
        .from('venues')
        .select('id, name, address, image_path, deleted_at')
        .eq('id', venueId!)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });
};

/** A venue's courts in display order (courts are public-read). */
export const useVenueCourts = (venueId: string | null | undefined) => {
  const db = useDb();
  return useQuery({
    queryKey: qk.venueCourts(venueId ?? ''),
    enabled: !!venueId,
    queryFn: async (): Promise<VenueCourt[]> => {
      const { data, error } = await db
        .from('courts')
        .select('id, name, sort_order')
        .eq('venue_id', venueId!)
        .order('sort_order', { ascending: true })
        .order('name', { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
  });
};
