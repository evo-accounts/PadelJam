import { useCreateGroup, useUpdateGroup } from '@padel/api';
import { useT } from '@padel/i18n';
import { type Href, useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { GroupComposer, type GroupComposerValues } from '@/components/group/GroupComposer';
import { uploadCommunityImage } from '@/lib/storage';
import { supabase } from '@/lib/supabase';
import { colors } from '../../../theme';
import { TopBar, useBanner } from '../../../components/ui';

const KNOWN_ERROR_KEYS = new Set([
  'forbidden',
  'name_required',
  'groups_per_community',
  'group_not_found',
]);

export default function GroupCreateModal() {
  const { t } = useT('group');
  const banner = useBanner();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { id } = useLocalSearchParams<{ id: string }>();

  const create = useCreateGroup();
  const [groupId, setGroupId] = useState<string | null>(null);
  const update = useUpdateGroup(groupId ?? '', id);

  const [submitting, setSubmitting] = useState(false);
  const [dirty, setDirty] = useState(false);

  const onSubmit = (values: GroupComposerValues) => {
    if (submitting) return;
    setSubmitting(true);
    void (async () => {
      try {
        const newId = (await create.mutateAsync({
          communityId: id,
          name: values.name,
          description: values.description,
          isPrivate: values.isPrivate,
        })) as string;
        setGroupId(newId);

        // The group already exists at this point; the thumbnail is optional, so a failed upload
        // must not strand the user on the modal with a "create failed" error. Best-effort it and
        // proceed to the new group (they can set a thumbnail later in Group settings).
        if (values.thumbnail) {
          try {
            const thumbnail_path = await uploadCommunityImage(
              supabase,
              'community-thumbnails',
              newId,
              values.thumbnail.uri,
              values.thumbnail.mimeType,
            );
            await update.mutateAsync({ thumbnail_path });
          } catch {
            // ignore — group created, thumbnail can be added later
          }
        }

        router.replace(`/group/${newId}` as Href);
      } catch (e) {
        const code = e instanceof Error ? e.message : 'unknown_error';
        banner.show(t(KNOWN_ERROR_KEYS.has(code) ? code : 'unknown_error'));
        setSubmitting(false);
      }
    })();
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <TopBar variant="edit" title={t('createTitle')} onClose={() => router.back()} dirty={dirty} />
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          style={styles.flex}
          contentContainerStyle={[styles.inner, { paddingBottom: insets.bottom + 24 }]}
          keyboardShouldPersistTaps="handled"
        >
          <GroupComposer
            mode="create"
            submitting={submitting}
            onSubmit={onSubmit}
            onDirtyChange={setDirty}
          />
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.card },
  flex: { flex: 1 },
  inner: { paddingHorizontal: 24, paddingTop: 16 },
});
