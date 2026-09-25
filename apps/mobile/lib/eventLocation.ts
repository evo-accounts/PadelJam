/**
 * Opening an event's place in the native maps app (UX-JEVT-02). The place itself (`eventPlace`,
 * `mapsQuery`) is pure and shared with web from `@padel/utils`.
 */
import { mapsQuery, type EventPlace } from '@padel/utils';
import { Linking, Platform } from 'react-native';

export function mapsUrl(place: EventPlace, os: string = Platform.OS): string {
  const q = encodeURIComponent(mapsQuery(place));
  return os === 'ios' ? `http://maps.apple.com/?q=${q}` : `geo:0,0?q=${q}`;
}

export async function openInMaps(place: EventPlace): Promise<void> {
  await Linking.openURL(mapsUrl(place));
}
