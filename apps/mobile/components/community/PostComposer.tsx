import { postSchema, useCreatePost } from '@padel/api';
import { useT } from '@padel/i18n';
import { Image } from 'expo-image';
import { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { pickAndValidateImage, uploadCommunityImage, type PickedImage } from '@/lib/storage';
import { supabase } from '@/lib/supabase';

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
}: {
  communityId: string;
  onDone: () => void;
}) {
  const { t } = useT('community');
  const createPost = useCreatePost(communityId);

  const [body, setBody] = useState('');
  const [picked, setPicked] = useState<PickedImage | null>(null);
  const [errorKey, setErrorKey] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const pending = submitting || createPost.isPending;

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
        placeholderTextColor="#8896A8"
        multiline
        editable={!pending}
        textAlignVertical="top"
      />

      {picked ? (
        <View style={styles.previewWrap}>
          <Image source={{ uri: picked.uri }} style={styles.preview} contentFit="cover" />
          <Pressable
            style={styles.removeImage}
            onPress={() => setPicked(null)}
            accessibilityRole="button"
            accessibilityLabel={t('removePhoto')}
            disabled={pending}
          >
            <Text style={styles.removeImageText}>✕</Text>
          </Pressable>
        </View>
      ) : (
        <Pressable
          style={styles.addPhoto}
          onPress={onPickImage}
          accessibilityRole="button"
          disabled={pending}
        >
          <Text style={styles.addPhotoText}>{t('addPhoto')}</Text>
        </Pressable>
      )}

      {errorKey ? <Text style={styles.error}>{t(errorKey)}</Text> : null}

      <Pressable
        style={[styles.cta, pending && styles.ctaDisabled]}
        onPress={onSubmit}
        disabled={pending}
        accessibilityRole="button"
      >
        {pending ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text style={styles.ctaText}>{t('postCta')}</Text>
        )}
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { padding: 20, gap: 16 },
  input: {
    minHeight: 120,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#D7DEE8',
    borderRadius: 12,
    padding: 14,
    fontSize: 16,
    color: '#0B1F3A',
    backgroundColor: '#fff',
  },
  addPhoto: {
    alignSelf: 'flex-start',
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 10,
    backgroundColor: '#EAF1FB',
  },
  addPhotoText: { color: '#0B7BFF', fontSize: 15, fontWeight: '600' },
  previewWrap: { position: 'relative' },
  preview: { width: '100%', height: 200, borderRadius: 12, backgroundColor: '#E6EAF0' },
  removeImage: {
    position: 'absolute',
    top: 8,
    right: 8,
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: 'rgba(0,0,0,0.6)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  removeImageText: { color: '#fff', fontSize: 15, fontWeight: '700' },
  error: { fontSize: 14, color: '#C0392B', fontWeight: '600' },
  cta: { backgroundColor: '#0B7BFF', paddingVertical: 16, borderRadius: 14, alignItems: 'center' },
  ctaDisabled: { backgroundColor: '#A9C7EE' },
  ctaText: { color: '#fff', fontSize: 17, fontWeight: '700' },
});
