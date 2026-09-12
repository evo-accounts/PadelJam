/**
 * Pure field-level validation for `PostComposer` (UX-GLOB-06). Kept in its own
 * RN-free module so it's unit-testable without pulling in the composer's React
 * Native imports.
 */
export type PostComposerFieldKey = 'body';

/** `postSchema` requires a body or an image; the body is the only `Field` here. */
export function validatePostComposer(values: {
  body: string;
  hasImage: boolean;
}): Partial<Record<PostComposerFieldKey, string>> {
  return values.body.trim() || values.hasImage ? {} : { body: 'post_empty' };
}
