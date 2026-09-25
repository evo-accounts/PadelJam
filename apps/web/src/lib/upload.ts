import { VENUE_IMAGES_BUCKET, venueImagePath } from '@padel/api';
import { supabase } from '@/lib/supabase/client';

const MAX_BYTES = 5 * 1024 * 1024;

/** Upload an avatar to the public `avatars` bucket under the user's own folder (RLS: first path
 *  segment must equal auth.uid()). Returns the stored object path to save as profiles.avatar_url. */
export async function uploadAvatar(file: File, uid: string): Promise<string> {
  if (!file.type.startsWith('image/')) throw new Error('avatar_invalid_type');
  if (file.size > MAX_BYTES) throw new Error('avatar_too_large');
  const ext = file.name.split('.').pop()?.toLowerCase() || 'jpg';
  const path = `${uid}/${crypto.randomUUID()}.${ext}`;
  const { error } = await supabase.storage.from('avatars').upload(path, file, { upsert: true, contentType: file.type });
  if (error) throw error;
  return path;
}

/** Public URL for a stored avatar path (or null). */
export function avatarUrl(path: string | null | undefined): string | null {
  if (!path) return null;
  return supabase.storage.from('avatars').getPublicUrl(path).data.publicUrl;
}

export async function uploadCommunityImage(
  file: File,
  communityId: string,
  bucket: 'community-thumbnails' | 'community-covers' | 'event-thumbnails',
): Promise<string> {
  if (!file.type.startsWith('image/')) throw new Error('image_invalid_type');
  if (file.size > 5 * 1024 * 1024) throw new Error('image_too_large');
  const ext = file.name.split('.').pop()?.toLowerCase() || 'jpg';
  const path = `${communityId}/${crypto.randomUUID()}.${ext}`;
  const { error } = await supabase.storage.from(bucket).upload(path, file, { upsert: true, contentType: file.type });
  if (error) throw error;
  return path;
}

export async function uploadPostImage(file: File, communityId: string): Promise<string> {
  if (!file.type.startsWith('image/')) throw new Error('image_invalid_type');
  if (file.size > 5 * 1024 * 1024) throw new Error('image_too_large');
  const ext = file.name.split('.').pop()?.toLowerCase() || 'jpg';
  const path = `${communityId}/${crypto.randomUUID()}.${ext}`;
  const { error } = await supabase.storage.from('community-post-images').upload(path, file, { upsert: true, contentType: file.type });
  if (error) throw error;
  return path;
}

/** Upload a registry venue image to the public `venue-images` bucket (super admins only, RLS in
 *  migration 0114). Returns the object path to store as venues.image_path. */
export async function uploadVenueImage(file: File): Promise<string> {
  if (!file.type.startsWith('image/')) throw new Error('image_invalid_type');
  if (file.size > 5 * 1024 * 1024) throw new Error('image_too_large');
  const path = venueImagePath(file.name, crypto.randomUUID());
  const { error } = await supabase.storage.from(VENUE_IMAGES_BUCKET).upload(path, file, { upsert: true, contentType: file.type });
  if (error) throw error;
  return path;
}

/** Best-effort removal of a replaced/removed venue image; an orphan object is harmless. */
export async function removeVenueImage(path: string | null | undefined): Promise<void> {
  if (!path) return;
  try {
    await supabase.storage.from(VENUE_IMAGES_BUCKET).remove([path]);
  } catch {
    /* ignore */
  }
}

/** Public URL for a stored venue image path (or null). */
export function venueImageUrl(path: string | null | undefined): string | null {
  if (!path) return null;
  return supabase.storage.from(VENUE_IMAGES_BUCKET).getPublicUrl(path).data.publicUrl;
}
