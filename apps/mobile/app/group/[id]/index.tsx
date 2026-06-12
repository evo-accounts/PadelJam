import {
  useCommunity,
  useCommunityMembers,
  useGroup,
  useGroupMembers,
  useGroupSeasons,
  useLeaveGroup,
} from '@padel/api';
import { useSession } from '@padel/auth';
import { useT } from '@padel/i18n';
import { Image } from 'expo-image';
import { useLocalSearchParams, useRouter, type Href } from 'expo-router';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { GroupHeader } from '@/components/group/GroupHeader';
import { RankingList } from '@/components/group/RankingList';
import { avatarUrl } from '@/lib/community-images';

const KNOWN_ERROR_KEYS = new Set([
  'forbidden',
  'not_a_member',
  'sole_owner_must_transfer',
  'sole_admin_must_add_another',
  'group_not_found',
]);

export default function GroupHomeScreen() {
  const { t } = useT('group');
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const uid = useSession().session?.user.id;

  const { data: group, isLoading } = useGroup(id);
  const { data: members } = useGroupMembers(id);
  const { data: seasons } = useGroupSeasons(id);
  const communityId = group?.community_id;
  const { data: community } = useCommunity(communityId ?? '');
  const { data: communityMembers } = useCommunityMembers(communityId ?? '');

  const leave = useLeaveGroup();

  if (isLoading || !group) {
    return (
      <SafeAreaView style={[styles.container, styles.center]} edges={['top']}>
        <ActivityIndicator color="#0B1F3A" />
      </SafeAreaView>
    );
  }

  const memberRows = members ?? [];
  const currentSeason = (seasons ?? []).find((s) => s.ended_at == null);
  const previousSeasons = (seasons ?? []).filter((s) => s.ended_at != null);
  const previewMembers = memberRows.slice(0, 6);

  const myCommunityRole = (communityMembers ?? []).find((m) => m.user_id === uid)?.role;
  const canManage = myCommunityRole === 'owner' || myCommunityRole === 'admin';

  const err = (e: unknown) => {
    const code = e instanceof Error ? e.message : 'unknown_error';
    Alert.alert(t('errorTitle'), t(KNOWN_ERROR_KEYS.has(code) ? code : 'unknown_error'));
  };

  const onShare = () => {
    void Share.share({ message: t('shareCta') + ': ' + group.name });
  };

  const onLeave = () => {
    if (!communityId) return;
    Alert.alert(t('leaveGroupConfirm'), '', [
      { text: t('cancel'), style: 'cancel' },
      {
        text: t('leaveGroupCta'),
        style: 'destructive',
        onPress: async () => {
          try {
            await leave.mutateAsync({ groupId: id, communityId });
            router.back();
          } catch (e) {
            err(e);
          }
        },
      },
    ]);
  };

  const onMore = () => {
    const options: { text: string; style?: 'cancel' | 'destructive'; onPress?: () => void }[] = [
      { text: t('shareCta'), onPress: onShare },
    ];
    if (canManage) {
      options.push({
        text: t('manageCta'),
        onPress: () => router.push(`/group/${id}/manage` as Href),
      });
    }
    options.push({ text: t('leaveGroupCta'), style: 'destructive', onPress: onLeave });
    options.push({ text: t('cancel'), style: 'cancel' });
    Alert.alert(t('moreCta'), '', options);
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.topBar}>
        <Pressable onPress={() => router.back()} accessibilityRole="button" hitSlop={12}>
          <Text style={styles.back}>‹</Text>
        </Pressable>
        <Pressable onPress={onMore} accessibilityRole="button" hitSlop={12}>
          <Text style={styles.more}>•••</Text>
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        <GroupHeader
          name={group.name}
          description={group.description}
          thumbnailPath={group.thumbnail_path}
          memberCount={memberRows.length}
          seasonNumber={currentSeason?.season_number ?? null}
          isPrivate={group.is_private}
        />

        {/* Members preview */}
        <Pressable
          style={styles.section}
          accessibilityRole="button"
          onPress={() => router.push(`/group/${id}/members` as Href)}
        >
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>{t('membersTitle')}</Text>
            <Text style={styles.sectionCount}>{t('membersPill', { count: memberRows.length })}</Text>
          </View>
          <View style={styles.avatars}>
            {previewMembers.map((m) => {
              const name = m.profiles?.full_name ?? '—';
              const url = avatarUrl(m.profiles?.avatar_url);
              return url ? (
                <Image
                  key={m.user_id}
                  source={{ uri: url }}
                  style={styles.avatar}
                  contentFit="cover"
                  transition={120}
                />
              ) : (
                <View key={m.user_id} style={[styles.avatar, styles.avatarFallback]}>
                  <Text style={styles.avatarInitial}>{(name.charAt(0) || '?').toUpperCase()}</Text>
                </View>
              );
            })}
          </View>
        </Pressable>

        <Pressable
          style={styles.inviteRow}
          accessibilityRole="button"
          onPress={() => router.push(`/group/${id}/invite` as Href)}
        >
          <Text style={styles.inviteText}>{t('inviteMembersCta')}</Text>
        </Pressable>

        {/* Events */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{t('eventsTitle')}</Text>
          <Text style={styles.placeholder}>{t('eventsPlaceholder')}</Text>
        </View>

        {/* Ranking */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{t('rankingTitle')}</Text>
          <RankingList rows={[]} />
        </View>

        {/* Previous seasons */}
        {previousSeasons.length > 0 ? (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>{t('previousSeasonsTitle')}</Text>
            <View style={styles.card}>
              {previousSeasons.map((s) => (
                <Pressable
                  key={s.id}
                  style={styles.seasonRow}
                  accessibilityRole="button"
                  // TODO(events): navigate to a season detail screen once it exists.
                  onPress={() => {}}
                >
                  <Text style={styles.seasonRowText}>
                    {t('seasonTag', { number: s.season_number })}
                  </Text>
                  <Text style={styles.chevron}>›</Text>
                </Pressable>
              ))}
            </View>
          </View>
        ) : null}

        {community ? <View style={styles.spacer} /> : null}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F4F6FA' },
  center: { alignItems: 'center', justifyContent: 'center' },
  topBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: '#fff',
  },
  back: { fontSize: 32, color: '#0B1F3A', lineHeight: 32 },
  more: { fontSize: 20, color: '#0B1F3A', fontWeight: '700' },
  content: { paddingBottom: 32 },
  section: { paddingHorizontal: 16, paddingTop: 20 },
  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  sectionTitle: { fontSize: 13, fontWeight: '700', color: '#8A95A5', textTransform: 'uppercase' },
  sectionCount: { fontSize: 13, color: '#3A4A60', fontWeight: '600' },
  avatars: { flexDirection: 'row', marginTop: 12 },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#E6EAF0',
    marginRight: -8,
    borderWidth: 2,
    borderColor: '#F4F6FA',
  },
  avatarFallback: { alignItems: 'center', justifyContent: 'center', backgroundColor: '#0B1F3A' },
  avatarInitial: { color: '#fff', fontSize: 15, fontWeight: '700' },
  inviteRow: { paddingHorizontal: 16, paddingTop: 16 },
  inviteText: { fontSize: 16, fontWeight: '700', color: '#0B7BFF' },
  placeholder: { fontSize: 14, color: '#8A95A5', marginTop: 12 },
  card: { backgroundColor: '#fff', borderRadius: 12, marginTop: 12, overflow: 'hidden' },
  seasonRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#E6EAF0',
  },
  seasonRowText: { fontSize: 16, color: '#0B1F3A', fontWeight: '500' },
  chevron: { fontSize: 22, color: '#C2CAD6' },
  spacer: { height: 8 },
});
