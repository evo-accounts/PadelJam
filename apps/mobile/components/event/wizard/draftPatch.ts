import type { EventDraft } from './draft';

/**
 * Standalone events (no group) must be private — enforced by the schema. A newly picked group
 * starts public, as it does when the wizard is opened from a group page; re-picking the SAME
 * group keeps whatever Preferences set.
 */
export function applyPatch(d: EventDraft, partial: Partial<EventDraft>): EventDraft {
  let forced: Partial<EventDraft> = {};
  if (partial.groupId === null) {
    forced = { isPrivate: true, series: undefined, groupCommunityId: undefined };
  } else if (partial.groupId !== undefined && partial.groupId !== d.groupId) {
    forced = { isPrivate: false };
  }
  return { ...d, ...partial, ...forced };
}
