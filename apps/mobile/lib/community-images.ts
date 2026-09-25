import { supabase } from './supabase';

const COVER_BUCKET = 'community-covers';
const THUMBNAIL_BUCKET = 'community-thumbnails';
const AVATAR_BUCKET = 'avatars';
const POST_IMAGE_BUCKET = 'community-post-images';
const EVENT_THUMBNAIL_BUCKET = 'event-thumbnails';

/**
 * Signed URL (1h) for a private post image, or null when no path is set. The
 * post-images bucket is member-gated, so getPublicUrl would not authorize; a
 * short-lived signed URL is created per render via `<PostImage>`.
 */
export async function postImageUrl(path: string | null | undefined): Promise<string | null> {
  if (!path) return null;
  const { data, error } = await supabase.storage
    .from(POST_IMAGE_BUCKET)
    .createSignedUrl(path, 3600);
  if (error) return null;
  return data?.signedUrl ?? null;
}

/** Public URL for a community cover image, or null when no path is set. */
export function coverUrl(path: string | null | undefined): string | null {
  if (!path) return null;
  return supabase.storage.from(COVER_BUCKET).getPublicUrl(path).data.publicUrl;
}

/** Public URL for a community thumbnail image, or null when no path is set. */
export function thumbnailUrl(path: string | null | undefined): string | null {
  if (!path) return null;
  return supabase.storage.from(THUMBNAIL_BUCKET).getPublicUrl(path).data.publicUrl;
}

/** Public URL for an event thumbnail (`events.thumbnail_path`), or null when none is set. */
export function eventThumbnailUrl(path: string | null | undefined): string | null {
  if (!path) return null;
  return supabase.storage.from(EVENT_THUMBNAIL_BUCKET).getPublicUrl(path).data.publicUrl;
}

/**
 * Resolve a profile avatar. `avatar_url` may already be an absolute URL (e.g. from
 * an OAuth provider) — pass it through; otherwise treat it as a storage path in the
 * avatars bucket and build the public URL.
 */
export function avatarUrl(path: string | null | undefined): string | null {
  if (!path) return null;
  if (/^https?:\/\//.test(path)) return path;
  return supabase.storage.from(AVATAR_BUCKET).getPublicUrl(path).data.publicUrl;
}
