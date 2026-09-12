/**
 * Pure field-level validation for `GroupComposer` (UX-GLOB-06). Kept in its own
 * RN-free module so it's unit-testable without pulling in the composer's React
 * Native imports.
 */
export type GroupComposerFieldKey = 'name';

/** Name is the only field both the create and update group schemas require. */
export function validateGroupComposer(values: { name: string }): Partial<Record<GroupComposerFieldKey, string>> {
  return values.name.trim() ? {} : { name: 'name_required' };
}
