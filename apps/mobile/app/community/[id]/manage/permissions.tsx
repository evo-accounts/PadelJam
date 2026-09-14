import { useCommunityPermissions, useUpdatePermissions } from '@padel/api';
import { useT } from '@padel/i18n';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Switch, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { colors, palette } from '../../../../theme';
import { TopBar, useBanner } from '../../../../components/ui';

/** The five toggles of UX-COMM-17; create_groups and create_events arrived with migration 0098. */
type PermKey =
  | 'create_groups'
  | 'create_events'
  | 'invite_members'
  | 'approve_join_requests'
  | 'create_posts';

export default function ManagePermissionsScreen() {
  const { t } = useT('community');
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();

  const { data: perms, isLoading } = useCommunityPermissions(id);
  const update = useUpdatePermissions(id);
  const banner = useBanner();

  const [state, setState] = useState<Record<PermKey, boolean>>({
    create_groups: false,
    create_events: false,
    invite_members: false,
    approve_join_requests: false,
    create_posts: false,
  });
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    if (perms && !hydrated) {
      setState({
        create_groups: !!perms.create_groups,
        create_events: !!perms.create_events,
        invite_members: !!perms.invite_members,
        approve_join_requests: !!perms.approve_join_requests,
        create_posts: !!perms.create_posts,
      });
      setHydrated(true);
    }
  }, [perms, hydrated]);

  const toggle = async (key: PermKey, value: boolean) => {
    const prev = state[key];
    setState((s) => ({ ...s, [key]: value }));
    try {
      await update.mutateAsync({ [key]: value });
    } catch (e) {
      setState((s) => ({ ...s, [key]: prev }));
      const code = e instanceof Error ? e.message : 'unknown_error';
      banner.show(t(code, { defaultValue: t('unknown_error') }));
    }
  };

  if (isLoading) {
    return (
      <SafeAreaView style={[styles.container, styles.center]} edges={['top']}>
        <ActivityIndicator color={colors.foreground} />
      </SafeAreaView>
    );
  }

  // UX-COMM-17's order. The E2E suite addresses these switches positionally (RN's Switch has no
  // label of its own in the accessibility tree), so changing this order moves the indices in
  // apps/mobile/e2e/suites/11-community-admin.e2e.ts with it.
  const rows: { key: PermKey; label: string; desc: string }[] = [
    { key: 'create_groups', label: t('permCreateGroupsLabel'), desc: t('permCreateGroupsDesc') },
    { key: 'create_events', label: t('permCreateEventsLabel'), desc: t('permCreateEventsDesc') },
    { key: 'invite_members', label: t('permInviteLabel'), desc: t('permInviteDesc') },
    {
      key: 'approve_join_requests',
      label: t('permApproveLabel'),
      desc: t('permApproveDesc'),
    },
    { key: 'create_posts', label: t('permCreatePostsLabel'), desc: t('permCreatePostsDesc') },
  ];

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <TopBar title={t('managePermissions')} onBack={() => router.back()} backLabel={t('back')} />
      <View style={styles.body}>
        <Text style={styles.intro}>{t('permissionsIntro')}</Text>
        <View style={styles.card}>
          {rows.map((r) => (
            <View key={r.key} style={styles.row}>
              <View style={styles.rowText}>
                <Text style={styles.rowLabel}>{r.label}</Text>
                <Text style={styles.rowDesc}>{r.desc}</Text>
              </View>
              <Switch
                value={state[r.key]}
                onValueChange={(v) => toggle(r.key, v)}
                disabled={update.isPending}
              />
            </View>
          ))}
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  body: { padding: 16 },
  center: { alignItems: 'center', justifyContent: 'center' },
  intro: { fontSize: 14, color: colors.mutedForeground, marginBottom: 12, lineHeight: 20 },
  card: { backgroundColor: colors.card, borderRadius: 12, overflow: 'hidden' },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
    gap: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  rowText: { flex: 1 },
  rowLabel: { fontSize: 16, color: colors.foreground, fontWeight: '500' },
  rowDesc: { fontSize: 13, color: palette.slate[400], marginTop: 2 },
});
