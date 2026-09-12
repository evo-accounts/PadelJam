import {
  useArchiveGroup,
  useGroup,
  useGroupSeasons,
  useStartNewSeason,
  useUnarchiveGroup,
} from '@padel/api';
import { useT } from '@padel/i18n';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { UpgradePrompt } from '@/components/community/UpgradePrompt';
import { colors, palette } from '../../../../theme';
import { TopBar, useBanner, useConfirm } from '../../../../components/ui';

const START_ERROR_KEYS = new Set(['forbidden', 'not_a_member', 'group_not_found']);
const ARCHIVE_ERROR_KEYS = new Set(['forbidden', 'groups_per_community', 'group_not_found', 'general_group_only_group']);

export default function GroupManageSeasonsScreen() {
  const { t } = useT('group');
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();

  const { data: group } = useGroup(id);
  const { data: seasons } = useGroupSeasons(id);

  const startSeason = useStartNewSeason(id);
  const archive = useArchiveGroup();
  const unarchive = useUnarchiveGroup();
  const confirm = useConfirm();
  const banner = useBanner();
  const [showUpgrade, setShowUpgrade] = useState(false);

  if (!group) {
    return (
      <SafeAreaView style={[styles.container, styles.center]} edges={['top']}>
        <ActivityIndicator color={colors.foreground} />
      </SafeAreaView>
    );
  }

  const current = (seasons ?? []).find((s) => s.ended_at == null);
  const previous = (seasons ?? []).filter((s) => s.ended_at != null);
  const isArchived = !!group.archived_at;
  const communityId = group.community_id;

  const onStartSeason = async () => {
    const currentNumber = current?.season_number ?? 0;
    const ok = await confirm({
      title: t('startSeasonCta'),
      body: t('startSeasonConfirm', { current: currentNumber, next: currentNumber + 1 }),
      confirmLabel: t('confirm'),
      cancelLabel: t('cancel'),
    });
    if (!ok) return;
    try {
      await startSeason.mutateAsync();
    } catch (e) {
      const code = e instanceof Error ? e.message : 'unknown_error';
      banner.show(t(START_ERROR_KEYS.has(code) ? code : 'unknown_error'));
    }
  };

  const onToggleArchive = async () => {
    if (isArchived) {
      try {
        await unarchive.mutateAsync({ groupId: id, communityId });
      } catch (e) {
        const code = e instanceof Error ? e.message : 'unknown_error';
        if (code === 'groups_per_community') {
          // is_group_admin already requires a community owner/admin, so whoever can
          // reach this screen can act on the community's plan — see UpgradePrompt.
          setShowUpgrade(true);
          return;
        }
        banner.show(t(ARCHIVE_ERROR_KEYS.has(code) ? code : 'unknown_error'));
      }
      return;
    }
    const ok = await confirm({
      title: t('archiveCta'),
      body: t('archiveConfirm'),
      confirmLabel: t('archiveCta'),
      cancelLabel: t('cancel'),
      destructive: true,
    });
    if (!ok) return;
    try {
      await archive.mutateAsync({ groupId: id, communityId });
      router.back();
    } catch (e) {
      const code = e instanceof Error ? e.message : 'unknown_error';
      banner.show(t(ARCHIVE_ERROR_KEYS.has(code) ? code : 'unknown_error'));
    }
  };

  const archivePending = archive.isPending || unarchive.isPending;

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <TopBar title={t('seasonsTitle')} onBack={() => router.back()} backLabel={t('back')} />
      <ScrollView contentContainerStyle={styles.inner}>
        <Text style={styles.sectionTitle}>{t('currentSeasonLabel')}</Text>
        <View style={styles.card}>
          <View style={styles.row}>
            <Text style={styles.rowLabel}>
              {current ? t('seasonTag', { number: current.season_number }) : '—'}
            </Text>
          </View>
        </View>

        <Pressable
          style={[styles.button, startSeason.isPending && styles.buttonDisabled]}
          onPress={onStartSeason}
          disabled={startSeason.isPending}
          accessibilityRole="button"
        >
          {startSeason.isPending ? (
            <ActivityIndicator color={colors.card} />
          ) : (
            <Text style={styles.buttonText}>{t('startSeasonCta')}</Text>
          )}
        </Pressable>

        {previous.length > 0 ? (
          <>
            <Text style={[styles.sectionTitle, styles.sectionSpacing]}>
              {t('previousSeasonsTitle')}
            </Text>
            <View style={styles.card}>
              {previous.map((s) => (
                <View key={s.id} style={styles.row}>
                  <Text style={styles.rowLabel}>{t('seasonTag', { number: s.season_number })}</Text>
                </View>
              ))}
            </View>
          </>
        ) : null}

        <Pressable
          style={[styles.archiveButton, archivePending && styles.buttonDisabled]}
          onPress={onToggleArchive}
          disabled={archivePending}
          accessibilityRole="button"
        >
          {archivePending ? (
            <ActivityIndicator color={colors.destructive} />
          ) : (
            <Text style={styles.archiveText}>{isArchived ? t('unarchiveCta') : t('archiveCta')}</Text>
          )}
        </Pressable>
      </ScrollView>
      <UpgradePrompt
        visible={showUpgrade}
        onClose={() => setShowUpgrade(false)}
        communityId={communityId}
        message={t('upgradeGroupsCap', { ns: 'community' })}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  center: { alignItems: 'center', justifyContent: 'center' },
  inner: { padding: 16 },
  sectionTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: palette.slate[400],
    textTransform: 'uppercase',
    marginBottom: 8,
    marginLeft: 4,
  },
  sectionSpacing: { marginTop: 20 },
  card: { backgroundColor: colors.card, borderRadius: 12, overflow: 'hidden' },
  row: {
    paddingHorizontal: 16,
    paddingVertical: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  rowLabel: { fontSize: 16, color: colors.foreground, fontWeight: '500' },
  button: {
    backgroundColor: colors.primary,
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
    marginTop: 16,
  },
  buttonDisabled: { opacity: 0.6 },
  buttonText: { color: colors.card, fontSize: 16, fontWeight: '600' },
  archiveButton: {
    marginTop: 32,
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.destructive,
  },
  archiveText: { color: colors.destructive, fontSize: 16, fontWeight: '600' },
});
