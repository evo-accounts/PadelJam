import { supabase } from './supabase';

const COVER_BUCKET = 'community-covers';
const THUMBNAIL_BUCKET = 'community-thumbnails';
const AVATAR_BUCKET = 'avatars';

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
