import { postSchema, useCreatePost } from '@padel/api';
import { useT } from '@padel/i18n';
import { Image } from 'expo-image';
import { useEffect, useState } from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';

import { pickAndValidateImage, uploadCommunityImage, type PickedImage } from '@/lib/storage';
import { supabase } from '@/lib/supabase';
import { Button, IconButton } from '../ui';
import { colors, palette } from '../../theme';

const POST_IMAGE_BUCKET = 'community-post-images';
const KNOWN_ERROR_KEYS = new Set([
  'post_empty',
  'image_too_large',
  'image_type_unsupported',
]);

/**
 * Compose a community post: a multiline body + an optional photo. The photo is
 * uploaded to the private post-images bucket before the post row is created.
 */
export function PostComposer({
  communityId,
  onDone,
  onDirtyChange,
}: {
  communityId: string;
  onDone: () => void;
  /** Reports whether the composer has unsaved input, so the caller's TopBar can confirm before closing. */
  onDirtyChange?: (dirty: boolean) => void;
}) {
  const { t } = useT('community');
  const createPost = useCreatePost(communityId);

  const [body, setBody] = useState('');
  const [picked, setPicked] = useState<PickedImage | null>(null);
  const [errorKey, setErrorKey] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const pending = submitting || createPost.isPending;

  useEffect(() => {
    onDirtyChange?.(body.trim().length > 0 || picked != null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [body, picked]);

  const onPickImage = () => {
    setErrorKey(null);
    void (async () => {
      try {
        const result = await pickAndValidateImage();
        if (result) setPicked(result);
      } catch (e) {
        setErrorKey(e instanceof Error ? e.message : 'unknown_error');
      }
    })();
  };

  const onSubmit = () => {
    setErrorKey(null);
    const trimmed = body.trim();
    const parsed = postSchema.safeParse({
      body: trimmed || undefined,
      imagePath: picked ? 'pending' : undefined,
    });
    if (!parsed.success) {
      setErrorKey('post_empty');
      return;
    }
    setSubmitting(true);
    void (async () => {
      try {
        let imagePath: string | undefined;
        if (picked) {
          imagePath = await uploadCommunityImage(
            supabase,
            POST_IMAGE_BUCKET,
            communityId,
            picked.uri,
            picked.mimeType,
          );
        }
        await createPost.mutateAsync({ body: trimmed, imagePath });
        onDone();
      } catch (e) {
        const code = e instanceof Error ? e.message : 'unknown_error';
        setErrorKey(KNOWN_ERROR_KEYS.has(code) ? code : 'unknown_error');
      } finally {
        setSubmitting(false);
      }
    })();
  };

  return (
    <View style={styles.container}>
      <TextInput
        style={styles.input}
        value={body}
        onChangeText={setBody}
        placeholder={t('postPlaceholder')}
        placeholderTextColor={colors.mutedForeground}
        multiline
        editable={!pending}
        textAlignVertical="top"
      />

      {picked ? (
        <View style={styles.previewWrap}>
          <Image source={{ uri: picked.uri }} style={styles.preview} contentFit="cover" />
          <IconButton
            icon="✕"
            accessibilityLabel={t('removePhoto')}
            onPress={() => setPicked(null)}
            disabled={pending}
            filled
            style={styles.removeImage}
          />
        </View>
      ) : (
        <Button
          variant="outline"
          label={t('addPhoto')}
          onPress={onPickImage}
          disabled={pending}
          style={styles.addPhoto}
        />
      )}

      {errorKey ? <Text style={styles.error}>{t(errorKey)}</Text> : null}

      {/* `pending ? <ActivityIndicator/> : <Text/>` — instance fifteen. */}
      <Button fullWidth label={t('postCta')} onPress={onSubmit} loading={pending} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { padding: 20, gap: 16 },
  input: {
    minHeight: 120,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    borderRadius: 12,
    padding: 14,
    fontSize: 16,
    color: colors.foreground,
    backgroundColor: colors.card,
  },
  addPhoto: {
    alignSelf: 'flex-start',
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 10,
    backgroundColor: palette.purple[100],
  },
  previewWrap: { position: 'relative' },
  preview: { width: '100%', height: 200, borderRadius: 12, backgroundColor: colors.muted },
  removeImage: {
    position: 'absolute',
    top: 8,
    right: 8,
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: colors.overlay,
    alignItems: 'center',
    justifyContent: 'center',
  },
  error: { fontSize: 14, color: colors.destructive, fontWeight: '600' },
});
