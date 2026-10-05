import { supabase } from '@/lib/supabase/client';

/** A place the `geocode` edge function found: Nominatim's full `display_name` and its point. */
export type GeocodeResult = { label: string; lat: number; lng: number };

/**
 * Looks up an address through the `geocode` edge function (OpenStreetMap Nominatim behind it).
 * Call it on an explicit search only — Nominatim's usage policy forbids search-as-you-type — and
 * show "© OpenStreetMap contributors" next to the results. Throws on any failure.
 */
export async function searchPlaces(q: string, lang: string): Promise<GeocodeResult[]> {
  const { data, error } = await supabase.functions.invoke<{ results?: GeocodeResult[] }>('geocode', {
    body: { q, lang },
  });
  if (error) throw error;
  if (!data || !Array.isArray(data.results)) throw new Error('geocode_bad_response');
  return data.results;
}

/**
 * The label a picked place keeps: the first three comma-separated parts of the long
 * `display_name`. Twin of `shortLabel` in infra/supabase/functions/_shared/geocode.ts (tested there).
 */
export function shortLabel(displayName: string): string {
  return displayName
    .split(',')
    .map((p) => p.trim())
    .filter(Boolean)
    .slice(0, 3)
    .join(', ');
}

/** The query the function accepts: 3–200 characters once whitespace is collapsed. */
export const searchableQuery = (raw: string): string | null => {
  const q = raw.replace(/\s+/g, ' ').trim();
  return q.length >= 3 && q.length <= 200 ? q : null;
};
