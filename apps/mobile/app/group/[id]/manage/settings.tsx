import { useGroup, useUpdateGroup } from '@padel/api';
import { useT } from '@padel/i18n';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useRef, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { GroupComposer, type GroupComposerValues } from '@/components/group/GroupComposer';
import { thumbnailUrl } from '@/lib/community-images';
import { supabase } from '@/lib/supabase';
import { uploadCommunityImage } from '@/lib/storage';
import { colors, space } from '../../../../theme';
import { Button, TopBar, useBanner } from '../../../../components/ui';

/**
 * Group Settings (UX-GRP-11): the Create Group form, presented as a sheet (✕ top-right) with the
 * save button fixed at the bottom. No community selector — a group never moves between
 * communities. Saving closes the sheet with a banner (UX-GLOB-06).
 */
export default function GroupManageSettingsScreen() {
  const { t } = useT('group');
  const banner = useBanner();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { id } = useLocalSearchParams<{ id: string }>();

  const { data: group } = useGroup(id);
  const update = useUpdateGroup(id, group?.community_id ?? '');

  const [dirty, setDirty] = useState(false);
  const submitRef = useRef<(() => void) | null>(null);

  if (!group) {
    return (
      <SafeAreaView style={[styles.container, styles.center]} edges={['top']}>
        <ActivityIndicator color={colors.foreground} />
      </SafeAreaView>
    );
  }

  const onSubmit = (values: GroupComposerValues) => {
    void (async () => {
      try {
        let thumbnailPath = values.removeThumbnail ? null : (group.thumbnail_path ?? null);
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
        banner.show(t('savedToast'), 'success');
      } catch (e) {
        const code = e instanceof Error ? e.message : 'unknown_error';
        banner.show(t(code, { defaultValue: t('unknown_error') }));
      }
    })();
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <TopBar variant="sheet" title={t('editTitle')} onClose={() => router.back()} dirty={dirty} />
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          style={styles.flex}
          contentContainerStyle={styles.inner}
          keyboardShouldPersistTaps="handled"
        >
          <GroupComposer
            mode="edit"
            submitting={update.isPending}
            initial={{
              name: group.name,
              description: group.description,
              isPrivate: group.is_private,
              thumbnailPath: group.thumbnail_path,
              thumbnailUrl: thumbnailUrl(group.thumbnail_path),
            }}
            onSubmit={onSubmit}
            onDirtyChange={setDirty}
            submitRef={submitRef}
          />
        </ScrollView>
        <View style={[styles.footer, { paddingBottom: insets.bottom + space[2] }]}>
          <Button
            label={t('saveCta')}
            size="lg"
            fullWidth
            loading={update.isPending}
            onPress={() => submitRef.current?.()}
            testID="group-settings-save"
          />
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.card },
  center: { alignItems: 'center', justifyContent: 'center' },
  flex: { flex: 1 },
  inner: { paddingHorizontal: space[6], paddingTop: space[4], paddingBottom: space[6] },
  footer: {
    paddingHorizontal: space[4],
    paddingTop: space[3],
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
    backgroundColor: colors.card,
  },
});
