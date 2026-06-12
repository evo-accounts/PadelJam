import { useGroup, useUpdateGroup } from '@padel/api';
import { useT } from '@padel/i18n';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { GroupComposer, type GroupComposerValues } from '@/components/group/GroupComposer';
import { thumbnailUrl } from '@/lib/community-images';
import { supabase } from '@/lib/supabase';
import { uploadCommunityImage } from '@/lib/storage';

const KNOWN_ERROR_KEYS = new Set(['forbidden', 'name_required', 'group_not_found']);

export default function GroupManageSettingsScreen() {
  const { t } = useT('group');
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { id } = useLocalSearchParams<{ id: string }>();

  const { data: group } = useGroup(id);
  const update = useUpdateGroup(id, group?.community_id ?? '');

  const [error, setError] = useState<string | null>(null);

  if (!group) {
    return (
      <View style={[styles.container, styles.center]}>
        <ActivityIndicator color="#0B1F3A" />
      </View>
    );
  }

  const onSubmit = (values: GroupComposerValues) => {
    setError(null);
    void (async () => {
      try {
        let thumbnailPath = group.thumbnail_path ?? null;
        if (values.thumbnail) {
          thumbnailPath = await uploadCommunityImage(
            supabase,
            'community-thumbnails',
            id,
            values.thumbnail.uri,
            values.thumbnail.mimeType,
          );
        }
        await update.mutateAsync({
          name: values.name,
          description: values.description ?? null,
          is_private: values.isPrivate,
          thumbnail_path: thumbnailPath,
        });
        router.back();
      } catch (e) {
        const code = e instanceof Error ? e.message : 'unknown_error';
        setError(t(KNOWN_ERROR_KEYS.has(code) ? code : 'unknown_error'));
      }
    })();
  };

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={[styles.inner, { paddingBottom: insets.bottom + 24 }]}
      keyboardShouldPersistTaps="handled"
    >
      <GroupComposer
        mode="edit"
        submitting={update.isPending}
        error={error}
        initial={{
          name: group.name,
          description: group.description,
          isPrivate: group.is_private,
          thumbnailPath: group.thumbnail_path,
          thumbnailUrl: thumbnailUrl(group.thumbnail_path),
        }}
        onSubmit={onSubmit}
      />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  center: { alignItems: 'center', justifyContent: 'center' },
  inner: { paddingHorizontal: 24, paddingTop: 16 },
});
