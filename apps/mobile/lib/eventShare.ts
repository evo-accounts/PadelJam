/**
 * The event link and the native share sheet (UX-JEVT-06, decision 12). Mirrors `groupShare.ts`:
 * the link is built by expo-linking so it carries the scheme the running build answers to.
 * A private event's link lands a non-invitee on the no-access screen (UX-JEVT-07).
 */
import * as Linking from 'expo-linking';
import { Share } from 'react-native';

export function eventDeepLink(id: string): string {
  return Linking.createURL(`/event/${id}`);
}

/** Opens the OS share sheet with the event's name and link. */
export async function shareEvent(id: string, name: string): Promise<void> {
  await Share.share({ message: `${name} — ${eventDeepLink(id)}` });
}
