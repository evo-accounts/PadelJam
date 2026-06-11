import * as ImagePicker from 'expo-image-picker';
import type { SupabaseClient } from '@supabase/supabase-js';

const MAX_BYTES = 5 * 1024 * 1024; // 5MB
const ALLOWED_MIME = ['image/jpeg', 'image/png', 'image/webp'] as const;

const EXT_BY_MIME: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};

export type ImageValidation = { ok: true } | { ok: false; error: string };

/**
 * PURE validation core: rejects files over 5MB or with a disallowed mime type.
 * Unit-testable without any RN/Expo runtime.
 */
export function validateImageAsset(asset: {
  fileSize?: number;
  mimeType?: string;
}): ImageValidation {
  if (typeof asset.fileSize === 'number' && asset.fileSize > MAX_BYTES) {
    return { ok: false, error: 'image_too_large' };
  }
  if (!asset.mimeType || !(ALLOWED_MIME as readonly string[]).includes(asset.mimeType)) {
    return { ok: false, error: 'image_type_unsupported' };
  }
  return { ok: true };
}

export type PickedImage = { uri: string; mimeType: string };

/**
 * Launches the system image library, validates the chosen asset and returns it.
 * Returns null when the user cancels. Throws an Error carrying an i18n code when
 * the chosen asset fails validation, so the caller can surface it.
 */
export async function pickAndValidateImage(): Promise<PickedImage | null> {
  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: 'images',
    quality: 0.8,
  });
  if (result.canceled || !result.assets?.[0]) return null;

  const asset = result.assets[0];
  const validation = validateImageAsset({
    fileSize: asset.fileSize,
    mimeType: asset.mimeType,
  });
  if (!validation.ok) throw new Error(validation.error);

  return { uri: asset.uri, mimeType: asset.mimeType! };
}

/**
 * Uploads a local image uri to a Supabase storage bucket under
 * `{communityId}/{uuid}.{ext}` and returns the stored object path. Must run
 * after the community exists (the creator is owner/admin → upload RLS passes).
 */
export async function uploadCommunityImage(
  client: Pick<SupabaseClient, 'storage'>,
  bucket: string,
  communityId: string,
  uri: string,
  mimeType: string,
): Promise<string> {
  const bytes = await (await fetch(uri)).arrayBuffer();
  const ext = EXT_BY_MIME[mimeType] ?? 'jpg';
  // Avoid depending on a `crypto` global (not guaranteed in Hermes); a
  // time-ordered random suffix is collision-safe for per-community object keys.
  const unique = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  const path = `${communityId}/${unique}.${ext}`;

  const { error } = await client.storage
    .from(bucket)
    .upload(path, bytes, { contentType: mimeType, upsert: false });
  if (error) throw error;

  return path;
}
