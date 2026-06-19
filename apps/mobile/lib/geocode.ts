import * as Location from 'expo-location';

/** Resolve an address string to coordinates via the OS geocoder. Null on no-match / denied / error. */
export async function geocodeAddress(query: string): Promise<{ lat: number; lng: number } | null> {
  try {
    const [hit] = await Location.geocodeAsync(query);
    return hit ? { lat: hit.latitude, lng: hit.longitude } : null;
  } catch {
    return null;
  }
}
