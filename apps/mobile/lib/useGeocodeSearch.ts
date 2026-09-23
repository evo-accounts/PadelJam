/**
 * Turn typed text into a real place — debounced geocode, then reverse-geocode for the name.
 *
 * Lifted verbatim out of `app/(onboarding)/location.tsx`, which is where it has been working, so
 * that Account Settings (UX-SET-02) can reuse it rather than grow a second geocode path. The
 * audit asks that screen to open "the in-app map picker used in onboarding"; there is no map
 * picker, and `components/community/LocationPickerSheet.tsx` is not one either — its own header
 * says the map area is a static placeholder, it searches seeded VENUES, and it returns free text
 * with no coordinates, which cannot feed `set_my_location(lat, lng, text)`. This can.
 *
 * `geocodeAsync` returns coordinates only, so the name shown back to the user comes from
 * reverse-geocoding the hit. That round trip is what makes the confirmation trustworthy rather
 * than an echo of the typing — and it is why a caller can gate its primary action on `resolved`
 * being non-null and know it means a real place.
 */
import * as Location from 'expo-location';
import { useEffect, useState } from 'react';

export type ResolvedPlace = { lat: number; lng: number; label: string };

/** Exported for the callers that reverse-geocode on their own (e.g. "use current location"). */
export function formatAddress(p: Location.LocationGeocodedAddress | undefined): string {
  if (!p) return '';
  const parts = [p.name, p.city ?? p.subregion, p.region].filter(Boolean) as string[];
  return [...new Set(parts)].join(', ');
}

export function useGeocodeSearch(text: string): {
  resolved: ResolvedPlace | null;
  searching: boolean;
} {
  const [resolved, setResolved] = useState<ResolvedPlace | null>(null);
  const [searching, setSearching] = useState(false);

  useEffect(() => {
    const q = text.trim();
    setResolved(null);
    if (q.length < 3) {
      setSearching(false);
      return;
    }
    setSearching(true);
    let cancelled = false;
    const id = setTimeout(async () => {
      try {
        const hits = await Location.geocodeAsync(q);
        const hit = hits[0];
        if (!hit) return;
        const places = await Location.reverseGeocodeAsync({
          latitude: hit.latitude,
          longitude: hit.longitude,
        });
        if (cancelled) return;
        setResolved({ lat: hit.latitude, lng: hit.longitude, label: formatAddress(places[0]) || q });
      } catch {
        /* leave unresolved; the caller keeps its action disabled */
      } finally {
        if (!cancelled) setSearching(false);
      }
    }, 500);
    return () => {
      cancelled = true;
      clearTimeout(id);
    };
  }, [text]);

  return { resolved, searching };
}
