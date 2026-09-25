/**
 * Where an event happens, and opening it in the native maps app (UX-JEVT-02).
 *
 * A registry venue wins over the manual location fields; an event with `has_location = false` has
 * no location at all and the Location card is hidden.
 */
import { Linking, Platform } from 'react-native';

export type EventPlace = { name: string; address: string | null };

export function eventPlace(e: {
  has_location: boolean;
  venue: { name: string; address: string | null } | null;
  manual_location_name: string | null;
  manual_location_address: string | null;
  location_text?: string | null;
}): EventPlace | null {
  if (e.venue) return { name: e.venue.name, address: e.venue.address };
  if (!e.has_location) return null;
  const name = e.manual_location_name ?? e.location_text ?? e.manual_location_address;
  if (!name) return null;
  return { name, address: e.manual_location_address && e.manual_location_address !== name ? e.manual_location_address : null };
}

/** The search string handed to the maps app: name and address together find a club best. */
export function mapsQuery(place: EventPlace): string {
  return [place.name, place.address].filter(Boolean).join(', ');
}

export function mapsUrl(place: EventPlace, os: string = Platform.OS): string {
  const q = encodeURIComponent(mapsQuery(place));
  return os === 'ios' ? `http://maps.apple.com/?q=${q}` : `geo:0,0?q=${q}`;
}

export async function openInMaps(place: EventPlace): Promise<void> {
  await Linking.openURL(mapsUrl(place));
}
