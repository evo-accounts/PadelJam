import { supabase } from '@/lib/supabase/client';

type CommunityBucket = 'community-thumbnails' | 'community-covers';

export function communityImageUrl(path: string | null | undefined, bucket: CommunityBucket): string | null {
  if (!path) return null;
  return supabase.storage.from(bucket).getPublicUrl(path).data.publicUrl;
}
