/**
 * The wizard's step list is not fixed (UX-CEVT-01): the progress bar and the ‹ / Next walk reflect
 * the real path for THIS draft. Shared by both wizards — mobile's `steps.tsx` and web's
 * `event-create` page each map a key onto their own component and validator.
 */
/** The draft fields that decide the path; both apps' drafts satisfy it structurally. */
export type WizardPathFields = {
  hasLocation: boolean;
  venueId?: string | null;
  groupId: string | null;
  isPrivate: boolean;
};

export const STEP_KEYS = [
  'group',
  'format',
  'players',
  'scoring',
  'location',
  'courts',
  'date',
  'preferences',
  'details',
  'invite',
] as const;

export type StepKey = (typeof STEP_KEYS)[number];

/**
 * A place the organizer typed or took from GPS rather than picked from the venue registry.
 * Its courts are not in the registry, so they are set on the Location step itself (the manual
 * venue form grows court names in M2) and the Courts step is skipped.
 */
export function isManualVenue(d: Pick<WizardPathFields, 'hasLocation' | 'venueId'>): boolean {
  return d.hasLocation && !d.venueId;
}

/**
 * A public group event invites nobody (decision 5): the group's members are notified and join
 * themselves. Invitations exist only for private events — and a standalone event is always
 * private, so it always keeps the step.
 */
export function skipsInvite(d: Pick<WizardPathFields, 'groupId' | 'isPrivate'>): boolean {
  return d.groupId != null && !d.isPrivate;
}

export function visibleStepKeys(d: WizardPathFields): StepKey[] {
  return STEP_KEYS.filter((key) => {
    if (key === 'courts') return !isManualVenue(d);
    if (key === 'invite') return !skipsInvite(d);
    return true;
  });
}

/**
 * The step after (or before) `current` on the path `d` implies. A key that is no longer on the
 * path — the draft changed under it — is placed by its position in the full list, so the walk
 * still moves in the right direction instead of jumping to the start.
 */
export function neighbourStep(
  d: WizardPathFields,
  current: StepKey,
  direction: 1 | -1,
): StepKey {
  const visible = visibleStepKeys(d);
  const order = (k: StepKey) => STEP_KEYS.indexOf(k);
  if (direction === 1) {
    return visible.find((k) => order(k) > order(current)) ?? visible[visible.length - 1]!;
  }
  const before = visible.filter((k) => order(k) < order(current));
  return before[before.length - 1] ?? visible[0]!;
}

/** 0..1 — how far through the visible path `current` is: index / count, so step 1 shows 0 %. */
export function stepProgress(d: WizardPathFields, current: StepKey): number {
  const visible = visibleStepKeys(d);
  const i = visible.indexOf(current);
  return visible.length === 0 || i < 0 ? 0 : i / visible.length;
}
