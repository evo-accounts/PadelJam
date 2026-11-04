/**
 * Turn typed text into a real place — debounced geocode, then reverse-geocode for the name.
 *
 * Lifted verbatim out of `app/(onboarding)/location.tsx`, which is where it has been working, so
 * that Account Settings (UX-SET-02) can reuse it rather than grow a second geocode path. The
 * audit asks that screen to open "the in-app map picker used in onboarding"; there is no map
 * picker, and the old community `LocationPickerSheet` (since removed) was not one either — its
 * map area was a static placeholder, it searched seeded VENUES, and it returned free text with no
 * coordinates, which cannot feed `set_my_location(lat, lng, text)`. This can.
 *
 * `geocodeAsync` returns coordinates only, so the name shown back to the user comes from
 * reverse-geocoding the hit. That round trip is what makes the confirmation trustworthy rather
 * than an echo of the typing.
 *
 * THE LOOKUP ALWAYS ENDS. It is a network call, and it used to have no deadline: on a hang,
 * `resolved` never arrived, the caller's action stayed disabled, and nothing on screen said why —
 * a user on a poor connection typed "Lisboa" and was stuck with Skip as the only way out. Now it
 * is raced against `LOOKUP_TIMEOUT_MS`, and a timeout, a throw or a zero-hit answer all resolve to
 * the typed text with NULL coordinates and `approximate: true`, so the caller can say so.
 *
 * That is a supported state, not a degraded guess: `set_my_location` clears the point and keeps
 * the text when handed null coordinates, and everyone who skips the location step already has no
 * point. It is also what this step did originally — the `locationGeocodeFailed` copy ("saved as
 * text") dates from then, and went unused when #78 gated Continue on a resolved place and took
 * the failure path out along with the premature enable.
 *
 * So a caller may still gate its primary action on `resolved` being non-null. What that now means
 * is "the lookup has finished" — a real place, or the typed text flagged `approximate` — rather
 * than "a real place or never".
 */
import * as Location from 'expo-location';
import { useEffect, useState } from 'react';

/** Coordinates are null when the lookup could not place the text; see `approximate`. */
export type ResolvedPlace = {
  lat: number | null;
  lng: number | null;
  label: string;
  /** Card headline (onboarding's result list); falls back to `label`. */
  title?: string;
  /** Card second line: region and country. Absent for the typed-text fallback. */
  subtitle?: string;
};

/** How many places the result list shows. The device geocoder usually answers with one. */
const MAX_PLACES = 3;

/**
 * Long enough for a healthy lookup, which answers in well under a second, and short enough that
 * the 500ms debounce plus this still resolves inside the 10s the onboarding E2E allows for it.
 */
const LOOKUP_TIMEOUT_MS = 4000;

/** Reject after `ms` — and clear the timer when `p` settles first, so nothing is left running. */
function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const id = setTimeout(() => reject(new Error('lookup timed out')), ms);
    p.then(
      (v) => {
        clearTimeout(id);
        resolve(v);
      },
      (e: unknown) => {
        clearTimeout(id);
        reject(e);
      },
    );
  });
}

/** Exported for the callers that reverse-geocode on their own (e.g. "use current location"). */
export function formatAddress(p: Location.LocationGeocodedAddress | undefined): string {
  if (!p) return '';
  const parts = [p.name, p.city ?? p.subregion, p.region].filter(Boolean) as string[];
  return [...new Set(parts)].join(', ');
}

/** Name one hit. A failed reverse geocode throws, so the whole lookup falls back to the typed text, as before. */
async function nameHit(hit: Location.LocationGeocodedLocation, q: string): Promise<ResolvedPlace> {
  const [address] = await Location.reverseGeocodeAsync({ latitude: hit.latitude, longitude: hit.longitude });
  const title = address?.city ?? address?.subregion ?? address?.name ?? undefined;
  const subtitle = [...new Set([address?.region, address?.country].filter(Boolean) as string[])]
    .filter((part) => part !== title)
    .join(', ');
  return {
    lat: hit.latitude,
    lng: hit.longitude,
    label: formatAddress(address) || q,
    title,
    subtitle: subtitle || undefined,
  };
}

/** Geocode, then name up to `MAX_PLACES` hits. Empty when the geocoder knows no such place. */
async function lookup(q: string): Promise<ResolvedPlace[]> {
  const hits = (await Location.geocodeAsync(q)).slice(0, MAX_PLACES);
  const named = await Promise.all(hits.map((hit) => nameHit(hit, q)));
  // Show what the card shows once: "Baixa, Lisboa" and "Alfama, Lisboa" are both a "Lisboa / Portugal" card.
  const key = (p: ResolvedPlace) => (p.title ? `${p.title}|${p.subtitle ?? ''}` : p.label);
  return named.filter((p, i) => named.findIndex((o) => key(o) === key(p)) === i);
}

export function useGeocodeSearch(text: string): {
  /** The first of `places`. Callers that want one answer (Account Settings) read this. */
  resolved: ResolvedPlace | null;
  /** Up to three places, best first; one typed-text entry when `approximate`. */
  places: ResolvedPlace[];
  searching: boolean;
  /** True when `resolved` is the typed text, because the lookup timed out, failed or found nothing. */
  approximate: boolean;
} {
  const [places, setPlaces] = useState<ResolvedPlace[]>([]);
  const [approximate, setApproximate] = useState(false);
  const [searching, setSearching] = useState(false);

  useEffect(() => {
    const q = text.trim();
    setPlaces([]);
    setApproximate(false);
    if (q.length < 3) {
      setSearching(false);
      return;
    }
    setSearching(true);
    let cancelled = false;
    const asTyped = () => {
      setPlaces([{ lat: null, lng: null, label: q }]);
      setApproximate(true);
    };
    const id = setTimeout(async () => {
      try {
        const found = await withTimeout(lookup(q), LOOKUP_TIMEOUT_MS);
        if (cancelled) return;
        if (found.length > 0) setPlaces(found);
        else asTyped();
      } catch {
        if (!cancelled) asTyped();
      } finally {
        if (!cancelled) setSearching(false);
      }
    }, 500);
    return () => {
      cancelled = true;
      clearTimeout(id);
    };
  }, [text]);

  return { resolved: places[0] ?? null, places, searching, approximate };
}
