/**
 * Shared field-level validation for the community create and manage/settings
 * forms (UX-GLOB-06). Pure — mirrors the required-ness already enforced by
 * `createCommunitySchema` in `@padel/api`, just surfaced per field so the
 * screen can redden the failing `Field` instead of only showing a banner.
 */
export type CommunityFormFieldKey = 'name' | 'rules';

export function validateCommunityForm(values: {
  name: string;
  rulesEnabled: boolean;
  rulesText: string;
}): Partial<Record<CommunityFormFieldKey, string>> {
  const errors: Partial<Record<CommunityFormFieldKey, string>> = {};
  if (!values.name.trim()) errors.name = 'required';
  if (values.rulesEnabled && !values.rulesText.trim()) errors.rules = 'rules_text_required';
  return errors;
}
