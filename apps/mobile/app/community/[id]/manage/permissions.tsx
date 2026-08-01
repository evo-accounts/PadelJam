import { useCommunityPermissions, useUpdatePermissions } from '@padel/api';
import { useT } from '@padel/i18n';
import { useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, StyleSheet, Switch, Text, View } from 'react-native';
import { colors, palette } from '../../../../theme';

type PermKey = 'invite_members' | 'approve_join_requests' | 'create_posts';

export default function ManagePermissionsScreen() {
  const { t } = useT('community');
  const { id } = useLocalSearchParams<{ id: string }>();

  const { data: perms, isLoading } = useCommunityPermissions(id);
  const update = useUpdatePermissions(id);

  const [state, setState] = useState<Record<PermKey, boolean>>({
    invite_members: false,
    approve_join_requests: false,
    create_posts: false,
  });
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    if (perms && !hydrated) {
      setState({
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
      Alert.alert(t('errorTitle'), t(code, { defaultValue: t('unknown_error') }));
    }
  };

  if (isLoading) {
    return (
      <View style={[styles.container, styles.center]}>
        <ActivityIndicator color={colors.foreground} />
      </View>
    );
  }

  const rows: { key: PermKey; label: string; desc: string }[] = [
    { key: 'invite_members', label: t('permInviteLabel'), desc: t('permInviteDesc') },
    {
      key: 'approve_join_requests',
      label: t('permApproveLabel'),
      desc: t('permApproveDesc'),
    },
    { key: 'create_posts', label: t('permCreatePostsLabel'), desc: t('permCreatePostsDesc') },
  ];

  return (
    <View style={styles.container}>
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
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background, padding: 16 },
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
