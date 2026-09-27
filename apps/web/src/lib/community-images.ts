import { supabase } from '@/lib/supabase/client';

type CommunityBucket = 'community-thumbnails' | 'community-covers';

export function communityImageUrl(path: string | null | undefined, bucket: CommunityBucket): string | null {
  if (!path) return null;
  return supabase.storage.from(bucket).getPublicUrl(path).data.publicUrl;
}

export async function postImageUrl(path: string | null | undefined): Promise<string | null> {
  if (!path) return null;
  const { data } = await supabase.storage.from('community-post-images').createSignedUrl(path, 3600);
  return data?.signedUrl ?? null;
}

/** Public URL for an event thumbnail (`events.thumbnail_path`), or null when none is set (B13). */
export function eventThumbnailUrl(path: string | null | undefined): string | null {
  if (!path) return null;
  return supabase.storage.from('event-thumbnails').getPublicUrl(path).data.publicUrl;
}
