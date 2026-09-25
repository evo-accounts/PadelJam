/**
 * Create Group (UX-GRP-01), a task flow with the navbar hidden: ✕ in place of back (confirming
 * before throwing away what was typed — there are no drafts), the shared GroupComposer, and the
 * primary button fixed to the bottom.
 *
 * Reached three ways, all labelled "Create group": the community's Groups tab and Manage Groups
 * pass `communityId` — the group belongs there and there is nothing to choose — and Your Groups,
 * which passes none. From Your Groups the community is ambiguous, so a selector appears when the
 * user may create groups in more than one community (only those are listed); with exactly one it
 * is simply that one.
 *
 * On success the new group opens directly with a temporary banner. Hitting the plan's group limit
 * opens the upgrade prompt: the create action shows on permission alone (decision 6), so this is
 * where the limit is explained.
 */
import {
  useCommunityMembers,
  useCreatableCommunities,
  useCreateGroup,
  useUpdateGroup,
} from '@padel/api';
import { useSession } from '@padel/auth';
import { useT } from '@padel/i18n';
import { useRouter, type Href } from 'expo-router';
import { useRef, useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { UpgradePrompt } from '@/components/community/UpgradePrompt';
import { uploadCommunityImage } from '@/lib/storage';
import { supabase } from '@/lib/supabase';

import { GroupComposer, type GroupComposerValues } from './GroupComposer';
import { colors, radius, space } from '../../theme';
import { BottomSheet, Button, SheetRow, Text, TopBar, useBanner } from '../ui';

export function GroupCreateScreen({ communityId: fixedCommunityId }: { communityId?: string }) {
  const { t } = useT('group');
  const banner = useBanner();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const uid = useSession().session?.user.id;

  const { communities: creatable } = useCreatableCommunities();
  const [picked, setPicked] = useState<string | null>(null);
  const [selectorOpen, setSelectorOpen] = useState(false);
  const communityId = fixedCommunityId ?? picked ?? (creatable.length === 1 ? creatable[0]!.id : null);
  const showSelector = !fixedCommunityId && creatable.length > 1;
  const pickedName = creatable.find((c) => c.id === communityId)?.name;

  const { data: communityMembers } = useCommunityMembers(communityId ?? undefined);
  const canManagePlan = communityMembers?.find((m) => m.user_id === uid)?.role === 'admin';

  const create = useCreateGroup();
  const [groupId, setGroupId] = useState<string | null>(null);
  const update = useUpdateGroup(groupId ?? '', communityId ?? '');
  const submitRef = useRef<(() => void) | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [showUpgrade, setShowUpgrade] = useState(false);

  const onSubmit = (values: GroupComposerValues) => {
    if (submitting) return;
    if (!communityId) {
      banner.show(t('pickCommunityFirst'));
      setSelectorOpen(true);
      return;
    }
    setSubmitting(true);
    void (async () => {
      try {
        const newId = (await create.mutateAsync({
          communityId,
          name: values.name,
          description: values.description,
          isPrivate: values.isPrivate,
        })) as string;
        setGroupId(newId);
        // The group exists now; the thumbnail is optional, so a failed upload must not strand the
        // user here with a "create failed" error. They can set it later in Group settings.
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
            /* group created; thumbnail can be added later */
          }
        }
        router.replace(`/group/${newId}` as Href);
        banner.show(t('createdToast', { name: values.name }), 'success');
      } catch (e) {
        const code = e instanceof Error ? e.message : 'unknown_error';
        setSubmitting(false);
        if (code === 'groups_per_community') return setShowUpgrade(true);
        banner.show(t(code, { defaultValue: t('unknown_error') }));
      }
    })();
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <TopBar variant="edit" title={t('createTitle')} onClose={() => router.back()} dirty={dirty} />
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView style={styles.flex} contentContainerStyle={styles.inner} keyboardShouldPersistTaps="handled">
          {showSelector ? (
            <View style={styles.selector}>
              <Text variant="caption" tone="muted">
                {t('communityLabel')}
              </Text>
              <Pressable
                style={styles.dropdown}
                onPress={() => setSelectorOpen(true)}
                accessibilityRole="button"
                accessibilityLabel={`${t('communityLabel')}: ${pickedName ?? t('pickCommunity')}`}
                testID="group-create-community"
              >
                <Text variant="body" tone={pickedName ? 'default' : 'muted'} style={styles.flex} numberOfLines={1}>
                  {pickedName ?? t('pickCommunity')}
                </Text>
                <Text variant="body" tone="subtle">
                  ▾
                </Text>
              </Pressable>
            </View>
          ) : null}
          <GroupComposer
            mode="create"
            submitting={submitting}
            onSubmit={onSubmit}
            onDirtyChange={setDirty}
            submitRef={submitRef}
          />
        </ScrollView>
        <View style={[styles.footer, { paddingBottom: insets.bottom + space[2] }]}>
          <Button
            label={t('createCta')}
            size="lg"
            fullWidth
            loading={submitting}
            onPress={() => submitRef.current?.()}
            testID="group-create-submit"
          />
        </View>
      </KeyboardAvoidingView>

      <BottomSheet visible={selectorOpen} onClose={() => setSelectorOpen(false)} title={t('communityLabel')} testID="group-create-community-sheet">
        {creatable.map((c) => (
          <SheetRow
            key={c.id}
            label={c.name}
            selected={c.id === communityId}
            onPress={() => {
              setPicked(c.id);
              setSelectorOpen(false);
            }}
            testID={`group-create-community-${c.id}`}
          />
        ))}
      </BottomSheet>

      {communityId ? (
        <UpgradePrompt
          visible={showUpgrade}
          onClose={() => setShowUpgrade(false)}
          communityId={communityId}
          message={t('upgradeGroupsCap', { ns: 'community' })}
          canManage={canManagePlan}
        />
      ) : null}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.card },
  flex: { flex: 1 },
  inner: { paddingHorizontal: space[6], paddingTop: space[4], paddingBottom: space[6] },
  selector: { gap: space[2], marginBottom: space[4] },
  dropdown: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    borderRadius: radius.lg,
    paddingHorizontal: space[4],
    paddingVertical: space[3],
  },
  footer: {
    paddingHorizontal: space[4],
    paddingTop: space[3],
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
    backgroundColor: colors.card,
  },
});
