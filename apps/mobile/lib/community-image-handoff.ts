import type { PickedImage } from './storage';

/**
 * Module-level handoff for the picked thumbnail/cover images between the Create
 * screen and the Created screen. Images can only be uploaded after the community
 * exists (the creator becomes owner/admin and storage RLS keys on `{communityId}/`),
 * so the local uris are stashed here and consumed once on the Created screen.
 */
export type PickedCommunityImages = {
  thumbnail: PickedImage | null;
  cover: PickedImage | null;
};

let pending: PickedCommunityImages | null = null;

export function setPendingCommunityImages(images: PickedCommunityImages): void {
  pending = images;
}

/** Returns the pending images and clears the handoff (single consumption). */
export function consumePendingCommunityImages(): PickedCommunityImages {
  const value = pending ?? { thumbnail: null, cover: null };
  pending = null;
  return value;
}
