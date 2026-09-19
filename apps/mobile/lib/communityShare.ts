/**
 * The community link, and the two ways UX-COMM-14 and UX-COMM-15 offer to pass
 * it on. Both menus carry Share and Copy link, so the link is built in one
 * place rather than formatted twice.
 *
 * `Share.share` from react-native is the native share sheet for TEXT. Note that
 * `app/(tabs)/community/created.tsx` reaches for `expo-sharing`'s `shareAsync`
 * instead, which is built for file URIs; worth unifying when that screen is
 * rewritten in plan PR 11.
 */
import * as Clipboard from 'expo-clipboard';
import { Share } from 'react-native';

export function communityDeepLink(id: string): string {
  return `padeljam://community/${id}`;
}

/** Opens the OS share sheet. Resolves whether the user shared or dismissed it. */
export async function shareCommunity(id: string, name: string): Promise<void> {
  await Share.share({ message: `${name} — ${communityDeepLink(id)}` });
}

export async function copyCommunityLink(id: string): Promise<void> {
  await Clipboard.setStringAsync(communityDeepLink(id));
}
