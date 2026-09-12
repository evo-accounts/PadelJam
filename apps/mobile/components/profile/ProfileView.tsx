import { useFollow, useUnfollow, useBlock, useReport, useProfile } from '@padel/api';
import { useT } from '@padel/i18n';
import { SymbolView } from 'expo-symbols';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Pressable, Share, StyleSheet, Text, View } from 'react-native';

import { avatarUrl } from '@/lib/community-images';
import { ReportSheet } from './BlockReportModals';
import { colors } from '../../theme';
import { Avatar, Button, IconButton, useActionSheet } from '../../components/ui';

export function ProfileView({ userId, isSelf }: { userId: string; isSelf: boolean }) {
  const { t } = useT('profile');
  const router = useRouter();
  const query = useProfile(userId);
  const follow = useFollow();
  const unfollow = useUnfollow();
  const block = useBlock();
  const report = useReport();
  const show = useActionSheet();
  const [reportOpen, setReportOpen] = useState(false);

  if (query.isLoading) return <ActivityIndicator color={colors.foreground} style={{ marginTop: 48 }} />;
  const p = query.data;
  if (!p) return <Text style={styles.unavailable}>{t('unavailable')}</Text>;

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Avatar uri={avatarUrl(p.avatar_url)} name={p.full_name} colourKey={userId} size="xl" />
        <Text style={styles.name}>{p.full_name}</Text>
        {p.description ? <Text style={styles.bio}>{p.description}</Text> : null}
        {isSelf && (
          <View style={styles.selfActions}>
            <Button
              label={t('edit')}
              variant="outline"
              size="sm"
              onPress={() => router.push('/profile/edit')}
            />
            <IconButton
              icon={<SymbolView name={{ ios: 'gearshape', android: 'settings', web: 'settings' }} tintColor={colors.foreground} size={22} />}
              accessibilityLabel={t('settings')}
              onPress={() => router.push('/profile/settings')}
            />
          </View>
        )}
        <View style={styles.counts}>
          <Pressable onPress={() => router.push(`/profile/${userId}/followers`)} accessibilityRole="button">
            <Text style={styles.countNum}>{p.followers_count}</Text>
            <Text style={styles.countLabel}>{t('followersCount')}</Text>
          </Pressable>
          <Pressable onPress={() => router.push(`/profile/${userId}/following`)} accessibilityRole="button">
            <Text style={styles.countNum}>{p.following_count}</Text>
            <Text style={styles.countLabel}>{t('followingCount')}</Text>
          </Pressable>
        </View>
        {!isSelf && (
          <View style={styles.actions}>
            <Button
              label={p.is_following ? t('following') : t('follow')}
              variant={p.is_following ? 'outline' : 'primary'}
              onPress={() => (p.is_following ? unfollow.mutate(userId) : follow.mutate(userId))}
            />
            <IconButton
              icon={<SymbolView name={{ ios: 'ellipsis', android: 'more_vert', web: 'more_vert' }} tintColor={colors.foreground} size={22} />}
              accessibilityLabel={t('more')}
              onPress={async () => {
                const key = await show({
                  actions: [
                    { key: 'share', label: t('kebabShare') },
                    {
                      key: 'block',
                      label: t('kebabBlock'),
                      destructive: true,
                      confirm: { title: t('blockConfirmTitle'), body: t('blockConfirmBody'), confirmLabel: t('blockConfirm') },
                    },
                    { key: 'report', label: t('kebabReport') },
                  ],
                });
                if (key === 'share') void Share.share({ message: p.full_name });
                if (key === 'block') block.mutate(userId, { onSuccess: () => router.back() });
                // Safe: `show()` resolves only after the host has dismissed its Modal, so ReportSheet never races it.
                if (key === 'report') setReportOpen(true);
              }}
            />
          </View>
        )}
      </View>

      <View style={styles.stats}>
        <View style={styles.stat}>
          <Text style={styles.statNum}>{p.played_matches}</Text>
          <Text style={styles.statLabel}>{t('playedMatches')}</Text>
        </View>
        <View style={styles.stat}>
          <Text style={styles.statNum}>{p.best_position ?? '—'}</Text>
          <Text style={styles.statLabel}>{t('bestPosition')}</Text>
        </View>
      </View>

      <ReportSheet
        visible={reportOpen}
        onCancel={() => setReportOpen(false)}
        onSubmit={(reason, description) => { setReportOpen(false); report.mutate({ targetId: userId, reason, description }); }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  unavailable: { textAlign: 'center', color: colors.mutedForeground, marginTop: 48, paddingHorizontal: 24 },
  header: { alignItems: 'center', paddingTop: 24, paddingHorizontal: 16, gap: 10 },
  name: { fontSize: 22, fontWeight: '700', color: colors.foreground },
  bio: { fontSize: 14, color: colors.mutedForeground, textAlign: 'center', paddingHorizontal: 24 },
  selfActions: { flexDirection: 'row', gap: 10, alignItems: 'center' },
  gear: { padding: 8 },
  counts: { flexDirection: 'row', gap: 32 },
  countNum: { fontSize: 18, fontWeight: '700', color: colors.foreground, textAlign: 'center' },
  countLabel: { fontSize: 12, color: colors.mutedForeground, textAlign: 'center' },
  actions: { flexDirection: 'row', gap: 10, alignItems: 'center' },
  kebab: { padding: 8 },
  stats: { flexDirection: 'row', justifyContent: 'space-around', paddingVertical: 24, marginTop: 16 },
  stat: { alignItems: 'center' },
  statNum: { fontSize: 24, fontWeight: '700', color: colors.foreground },
  statLabel: { fontSize: 13, color: colors.mutedForeground, marginTop: 4 },
});
