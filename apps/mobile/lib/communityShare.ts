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
import * as Linking from 'expo-linking';
import { Share } from 'react-native';

/**
 * Built by expo-linking rather than spelled out: the app registers the `mobile` scheme
 * (app.json), not `padeljam`, so the hard-coded `padeljam://…` this used to return opened nothing
 * — not from a shared message, not from the community QR code. createURL always uses the scheme
 * the running build actually answers to.
 */
export function communityDeepLink(id: string): string {
  return Linking.createURL(`/community/${id}`);
}

/** Opens the OS share sheet. Resolves whether the user shared or dismissed it. */
export async function shareCommunity(id: string, name: string): Promise<void> {
  await Share.share({ message: `${name} — ${communityDeepLink(id)}` });
}

export async function copyCommunityLink(id: string): Promise<void> {
  await Clipboard.setStringAsync(communityDeepLink(id));
}
