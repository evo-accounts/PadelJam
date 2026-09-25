/**
 * The group link, and the ways the group sheets pass it on (UX-GRP-06/08/09/10). Mirrors
 * `communityShare.ts`. The link opens `app/group/[id]`, which shows the preview a non-member
 * is allowed to see (UX-GRP-02).
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
export function groupDeepLink(id: string): string {
  return Linking.createURL(`/group/${id}`);
}

/** Opens the OS share sheet with the group's name and link. */
export async function shareGroup(id: string, name: string): Promise<void> {
  await Share.share({ message: `${name} — ${groupDeepLink(id)}` });
}

export async function copyGroupLink(id: string): Promise<void> {
  await Clipboard.setStringAsync(groupDeepLink(id));
}
