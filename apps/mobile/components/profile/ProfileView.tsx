import { useFollow, useUnfollow, useBlock, useReport, useProfile } from '@padel/api';
import { useT } from '@padel/i18n';
import { Image } from 'expo-image';
import { SymbolView } from 'expo-symbols';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Pressable, Share, StyleSheet, Text, View } from 'react-native';

import { avatarUrl } from '@/lib/community-images';
import { BlockModal, ReportModal } from './BlockReportModals';

export function ProfileView({ userId, isSelf }: { userId: string; isSelf: boolean }) {
  const { t } = useT('profile');
  const router = useRouter();
  const query = useProfile(userId);
  const follow = useFollow();
  const unfollow = useUnfollow();
  const block = useBlock();
  const report = useReport();
  const [blockOpen, setBlockOpen] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  if (query.isLoading) return <ActivityIndicator color="#0B1F3A" style={{ marginTop: 48 }} />;
  const p = query.data;
  if (!p) return <Text style={styles.unavailable}>{t('unavailable')}</Text>;

  const avatar = avatarUrl(p.avatar_url);
  const initials = p.full_name.split(' ').map((s) => s.charAt(0)).slice(0, 2).join('').toUpperCase();

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View style={styles.avatar}>
          {avatar ? <Image source={{ uri: avatar }} style={styles.avatarImg} /> : <Text style={styles.initials}>{initials}</Text>}
        </View>
        <Text style={styles.name}>{p.full_name}</Text>
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
            <Pressable
              style={[styles.followBtn, p.is_following && styles.followingBtn]}
              onPress={() => (p.is_following ? unfollow.mutate(userId) : follow.mutate(userId))}
              accessibilityRole="button">
              <Text style={[styles.followText, p.is_following && styles.followingText]}>
                {p.is_following ? t('following') : t('follow')}
              </Text>
            </Pressable>
            <Pressable style={styles.kebab} onPress={() => setMenuOpen((v) => !v)} accessibilityRole="button" accessibilityLabel="More">
              <SymbolView name={{ ios: 'ellipsis', android: 'more_vert', web: 'more_vert' }} tintColor="#0B1F3A" size={22} />
            </Pressable>
          </View>
        )}
        {menuOpen && !isSelf && (
          <View style={styles.menu}>
            <Pressable style={styles.menuItem} onPress={() => { setMenuOpen(false); void Share.share({ message: p.full_name }); }}>
              <Text style={styles.menuText}>{t('kebabShare')}</Text>
            </Pressable>
            <Pressable style={styles.menuItem} onPress={() => { setMenuOpen(false); setBlockOpen(true); }}>
              <Text style={styles.menuText}>{t('kebabBlock')}</Text>
            </Pressable>
            <Pressable style={styles.menuItem} onPress={() => { setMenuOpen(false); setReportOpen(true); }}>
              <Text style={styles.menuText}>{t('kebabReport')}</Text>
            </Pressable>
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

      <BlockModal
        visible={blockOpen}
        onCancel={() => setBlockOpen(false)}
        onConfirm={() => { setBlockOpen(false); block.mutate(userId, { onSuccess: () => router.back() }); }}
      />
      <ReportModal
        visible={reportOpen}
        onCancel={() => setReportOpen(false)}
        onSubmit={(reason, description) => { setReportOpen(false); report.mutate({ targetId: userId, reason, description }); }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F7F9FC' },
  unavailable: { textAlign: 'center', color: '#6B7685', marginTop: 48, paddingHorizontal: 24 },
  header: { alignItems: 'center', paddingTop: 24, paddingHorizontal: 16, gap: 10 },
  avatar: { width: 96, height: 96, borderRadius: 48, backgroundColor: '#E6F0FF', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  avatarImg: { width: 96, height: 96 },
  initials: { fontSize: 30, fontWeight: '700', color: '#0B7BFF' },
  name: { fontSize: 22, fontWeight: '700', color: '#0B1F3A' },
  counts: { flexDirection: 'row', gap: 32 },
  countNum: { fontSize: 18, fontWeight: '700', color: '#0B1F3A', textAlign: 'center' },
  countLabel: { fontSize: 12, color: '#6B7685', textAlign: 'center' },
  actions: { flexDirection: 'row', gap: 10, alignItems: 'center' },
  followBtn: { backgroundColor: '#0B7BFF', borderRadius: 20, paddingHorizontal: 28, paddingVertical: 10 },
  followingBtn: { backgroundColor: '#E7ECF3' },
  followText: { color: '#fff', fontWeight: '700' },
  followingText: { color: '#0B1F3A' },
  kebab: { padding: 8 },
  menu: { alignSelf: 'stretch', backgroundColor: '#fff', borderRadius: 12, overflow: 'hidden' },
  menuItem: { paddingVertical: 12, paddingHorizontal: 16, borderBottomWidth: StyleSheet.hairlineWidth, borderColor: '#E7ECF3' },
  menuText: { fontSize: 15, color: '#0B1F3A' },
  stats: { flexDirection: 'row', justifyContent: 'space-around', paddingVertical: 24, marginTop: 16 },
  stat: { alignItems: 'center' },
  statNum: { fontSize: 24, fontWeight: '700', color: '#0B1F3A' },
  statLabel: { fontSize: 13, color: '#6B7685', marginTop: 4 },
});
