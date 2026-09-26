import { defaultStart, type StepKey } from '@padel/utils';

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

/**
 * What a step needs in the draft before it first renders. The Date step opens on a start already
 * chosen — the first free slot an hour or more from `nowMs` — and it has to be there on the FIRST
 * render: set from an effect instead, the time tabs mounted with no value and opened on the wrong
 * period. `nowMs` is passed in so the reducer stays pure.
 */
export function onEnterStep(d: EventDraft, key: StepKey, nowMs: number): EventDraft {
  if (key === 'date' && !d.startsAt) return { ...d, startsAt: defaultStart(new Date(nowMs)).toISOString() };
  return d;
}
