/**
 * "The season has ended" — shown once to each member, the next time they open the group after an
 * admin resets the ranking (UX-GRP-14). What each member has already seen is kept on the device
 * (decision 9 of the Groups audit plan): the notice is a courtesy, so a reinstall showing it once
 * more costs nothing, and it needs no table.
 *
 * Stored per group as the highest CLOSED season number seen. A first visit records the latest
 * closed season silently, so joining a group with history never greets you with old news.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';

const key = (groupId: string) => `group-season-seen:${groupId}`;

export async function lastSeenSeason(groupId: string): Promise<number | null> {
  try {
    const raw = await AsyncStorage.getItem(key(groupId));
    return raw == null ? null : Number(raw);
  } catch {
    return null;
  }
}

export async function markSeasonSeen(groupId: string, seasonNumber: number): Promise<void> {
  try {
    const seen = await lastSeenSeason(groupId);
    if (seen == null || seasonNumber > seen) await AsyncStorage.setItem(key(groupId), String(seasonNumber));
  } catch {
    /* a lost marker only means the notice shows again */
  }
}

export { seasonToAnnounce } from './seasonNoticeRule';
