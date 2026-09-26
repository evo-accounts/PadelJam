import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useDb, mapPgError } from '../client';
import { qk } from '../query-keys';

/** Public bucket for registry venue images (migration 0114). Writes: super admins only. */
export const VENUE_IMAGES_BUCKET = 'venue-images';

/** Object path for a new venue image: flat `{uuid}.{ext}` (a new venue has no id yet). */
export function venueImagePath(fileName: string, uuid: string): string {
  const dot = fileName.lastIndexOf('.');
  const ext = dot > 0 ? fileName.slice(dot + 1).toLowerCase() : '';
  return `${uuid}.${/^[a-z0-9]{1,5}$/.test(ext) ? ext : 'jpg'}`;
}

export type SaveVenueInput = {
  /** null creates a venue. */
  id: string | null;
  name: string;
  address: string | null;
  imagePath: string | null;
  /** Display order; `id: null` adds a court. Courts left out are deleted. */
  courts: { id: string | null; name: string }[];
};

/** Create or edit a venue and its courts atomically (`save_venue`, super admins only). */
export const useSaveVenue = () => {
  const db = useDb();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: SaveVenueInput): Promise<string> => {
      const { data, error } = await db.rpc('save_venue', {
        // The generated Args type is non-null; the function itself accepts null (create).
        p_venue_id: input.id as string,
        p_name: input.name,
        p_address: input.address as string,
        p_image_path: input.imagePath as string,
        p_courts: input.courts.map((c) => ({ id: c.id, name: c.name })),
      });
      if (error) throw new Error(mapPgError(error) ?? 'unknown_error');
      return data as string;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.venues });
    },
  });
};

/** Soft-delete a venue (`deleted_at`): past events keep their location. */
export const useDeleteVenue = () => {
  const db = useDb();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (venueId: string) => {
      const { error } = await db
        .from('venues')
        .update({ deleted_at: new Date().toISOString() })
        .eq('id', venueId);
      if (error) throw new Error(mapPgError(error) ?? 'unknown_error');
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.venues });
    },
  });
};
