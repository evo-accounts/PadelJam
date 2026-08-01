import {
  useAddGroupAdmins,
  useCommunity,
  useCommunityMembers,
  useGroup,
  useGroupEvents,
  useGroupMembers,
  useGroupRanking,
  useGroupSeasons,
  useLeaveGroup,
  useEnsureChannel,
} from '@padel/api';
import { useSession } from '@padel/auth';
import { useT } from '@padel/i18n';
import { Image } from 'expo-image';
import { useLocalSearchParams, useRouter, type Href } from 'expo-router';
import { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Modal,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { EventCard } from '@/components/event/EventCard';
import { GroupHeader } from '@/components/group/GroupHeader';
import { RankingList } from '@/components/group/RankingList';
import { avatarUrl } from '@/lib/community-images';
import { colors, palette } from '../../../theme';

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
  const { data: events } = useGroupEvents(id);
  // Undefined until useGroup resolves; the hooks stay disabled until then.
  const communityId = group?.community_id;
  const { data: community } = useCommunity(communityId);
  const { data: communityMembers } = useCommunityMembers(communityId);

  const [period, setPeriod] = useState<'all' | '3m' | '6m' | '12m'>('all');
  const monthsAgoIso = (n: number) => {
    const d = new Date();
    d.setMonth(d.getMonth() - n);
    return d.toISOString();
  };
  const since =
    period === '3m'
      ? monthsAgoIso(3)
      : period === '6m'
        ? monthsAgoIso(6)
        : period === '12m'
          ? monthsAgoIso(12)
          : undefined;

  const currentSeasonId = (seasons ?? []).find((s) => s.ended_at == null)?.id ?? '';
  const { data: ranking } = useGroupRanking(currentSeasonId, since);

  const [addAdminOpen, setAddAdminOpen] = useState(false);
  const [selectedAdmins, setSelectedAdmins] = useState<string[]>([]);
  const addAdmins = useAddGroupAdmins(id);
  const groupMemberIds = new Set((members ?? []).map((m) => m.user_id));
  const eligibleAdmins = (communityMembers ?? []).filter(
    (m) => (m.role === 'owner' || m.role === 'admin') && !groupMemberIds.has(m.user_id),
  );

  const leave = useLeaveGroup();
  const ensureChannel = useEnsureChannel();
  const openGroupChat = async () => {
    if (ensureChannel.isPending) return;
    try {
      const { cid } = await ensureChannel.mutateAsync({ kind: 'group', id });
      router.push(('/chat/' + cid) as never);
    } catch {
      /* surfaced via ensureChannel.isError below */
    }
  };

  if (isLoading) {
    return (
      <SafeAreaView style={[styles.container, styles.center]} edges={['top']}>
        <ActivityIndicator color={colors.foreground} />
      </SafeAreaView>
    );
  }
  if (!group) {
    return (
      <SafeAreaView style={[styles.container, styles.center]} edges={['top']}>
        <Text style={styles.noAccessTitle}>{t('noAccessTitle')}</Text>
        <Text style={styles.noAccessBody}>{t('noAccessBody')}</Text>
        <Pressable onPress={() => router.back()} accessibilityRole="button" style={styles.noAccessBtn}>
          <Text style={styles.noAccessBtnText}>{t('back')}</Text>
        </Pressable>
      </SafeAreaView>
    );
  }

  const memberRows = members ?? [];
  const currentSeason = (seasons ?? []).find((s) => s.ended_at == null);
  const previousSeasons = (seasons ?? []).filter((s) => s.ended_at != null);
  const previewMembers = memberRows.slice(0, 6);
  const eventRows = events ?? [];

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
            if (e instanceof Error && e.message === 'sole_admin_must_add_another') {
              setSelectedAdmins([]);
              setAddAdminOpen(true);
            } else {
              err(e);
            }
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

        {/* Chat */}
        <View style={styles.section}>
          <Pressable
            onPress={openGroupChat}
            disabled={ensureChannel.isPending}
            accessibilityRole="button"
            style={{ paddingVertical: 12, paddingHorizontal: 16, backgroundColor: colors.primary, borderRadius: 12, alignItems: 'center', marginTop: 8 }}
          >
            <Text style={{ color: colors.card, fontWeight: '700', fontSize: 15 }}>{t('openChat', { ns: 'chat' })}</Text>
          </Pressable>
          {ensureChannel.isError ? (
            <Text style={{ color: colors.destructive, fontSize: 13, marginTop: 6 }}>{t('chatUnavailable', { ns: 'chat' })}</Text>
          ) : null}
        </View>

        {/* Events */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{t('eventsTitle')}</Text>
          <Pressable
            style={styles.inviteRow}
            accessibilityRole="button"
            onPress={() =>
              router.push(
                `/event/create?groupId=${id}&communityId=${communityId ?? ''}` as Href,
              )
            }
          >
            <Text style={styles.inviteText}>{t('event:createTitle')}</Text>
          </Pressable>
          {eventRows.length === 0 ? (
            <Text style={styles.placeholder}>{t('event:eventsEmpty')}</Text>
          ) : (
            <View style={styles.eventList}>
              {eventRows.map((e) => (
                <EventCard
                  key={e.id}
                  event={e}
                  onPress={() => router.push(`/event/${e.id}` as Href)}
                />
              ))}
            </View>
          )}
        </View>

        {/* Ranking */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{t('rankingTitle')}</Text>
          <View style={styles.periodRow}>
            {(['all', '3m', '6m', '12m'] as const).map((p) => (
              <Pressable
                key={p}
                onPress={() => setPeriod(p)}
                style={[styles.periodChip, period === p && styles.periodChipOn]}
                accessibilityRole="button"
              >
                <Text style={[styles.periodChipText, period === p && styles.periodChipTextOn]}>
                  {t(
                    p === 'all'
                      ? 'periodAll'
                      : p === '3m'
                        ? 'period3m'
                        : p === '6m'
                          ? 'period6m'
                          : 'period12m',
                  )}
                </Text>
              </Pressable>
            ))}
          </View>
          <RankingList rows={ranking ?? []} />
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

      <Modal
        visible={addAdminOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setAddAdminOpen(false)}
      >
        <Pressable style={styles.backdrop} onPress={() => setAddAdminOpen(false)}>
          <View style={styles.sheet}>
            <Text style={styles.sheetTitle}>{t('addAdminTitle')}</Text>
            <Text style={styles.sheetBody}>{t('addAdminBody')}</Text>
            {eligibleAdmins.length === 0 ? (
              <Text style={styles.sheetEmpty}>{t('noEligibleAdmins')}</Text>
            ) : (
              eligibleAdmins.map((m) => (
                <Pressable
                  key={m.user_id}
                  style={styles.adminRow}
                  onPress={() =>
                    setSelectedAdmins((s) =>
                      s.includes(m.user_id) ? s.filter((x) => x !== m.user_id) : [...s, m.user_id],
                    )
                  }
                  accessibilityRole="button"
                >
                  <Text style={styles.adminName}>{m.profiles?.full_name ?? '—'}</Text>
                  <Text>{selectedAdmins.includes(m.user_id) ? '✓' : ''}</Text>
                </Pressable>
              ))
            )}
            <Pressable
              style={[
                styles.addBtn,
                (selectedAdmins.length === 0 || addAdmins.isPending) && { opacity: 0.5 },
              ]}
              disabled={selectedAdmins.length === 0 || addAdmins.isPending}
              onPress={async () => {
                try {
                  await addAdmins.mutateAsync(selectedAdmins);
                  setAddAdminOpen(false);
                  if (communityId) await leave.mutateAsync({ groupId: id, communityId });
                  router.back();
                } catch (e2) {
                  err(e2);
                }
              }}
              accessibilityRole="button"
            >
              <Text style={styles.addBtnText}>{t('addAdminCta')}</Text>
            </Pressable>
          </View>
        </Pressable>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  center: { alignItems: 'center', justifyContent: 'center' },
  topBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: colors.card,
  },
  back: { fontSize: 32, color: colors.foreground, lineHeight: 32 },
  more: { fontSize: 20, color: colors.foreground, fontWeight: '700' },
  content: { paddingBottom: 32 },
  section: { paddingHorizontal: 16, paddingTop: 20 },
  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  sectionTitle: { fontSize: 13, fontWeight: '700', color: palette.slate[400], textTransform: 'uppercase' },
  sectionCount: { fontSize: 13, color: colors.mutedForeground, fontWeight: '600' },
  avatars: { flexDirection: 'row', marginTop: 12 },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.muted,
    marginRight: -8,
    borderWidth: 2,
    borderColor: colors.border,
  },
  avatarFallback: { alignItems: 'center', justifyContent: 'center', backgroundColor: colors.primary },
  avatarInitial: { color: colors.card, fontSize: 15, fontWeight: '700' },
  inviteRow: { paddingHorizontal: 16, paddingTop: 16 },
  inviteText: { fontSize: 16, fontWeight: '700', color: colors.primary },
  placeholder: { fontSize: 14, color: palette.slate[400], marginTop: 12 },
  eventList: { marginTop: 12, gap: 8 },
  card: { backgroundColor: colors.card, borderRadius: 12, marginTop: 12, overflow: 'hidden' },
  seasonRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  seasonRowText: { fontSize: 16, color: colors.foreground, fontWeight: '500' },
  chevron: { fontSize: 22, color: palette.slate[400] },
  spacer: { height: 8 },
  noAccessTitle: { fontSize: 20, fontWeight: '800', color: colors.foreground, marginBottom: 8 },
  noAccessBody: { fontSize: 14, color: colors.mutedForeground, textAlign: 'center', paddingHorizontal: 32 },
  noAccessBtn: {
    marginTop: 20,
    paddingVertical: 12,
    paddingHorizontal: 24,
    backgroundColor: colors.primary,
    borderRadius: 12,
  },
  noAccessBtnText: { color: colors.card, fontWeight: '700' },
  periodRow: { flexDirection: 'row', gap: 8, marginBottom: 8, marginTop: 12, flexWrap: 'wrap' },
  periodChip: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 16, backgroundColor: colors.accent },
  periodChipOn: { backgroundColor: colors.primary },
  periodChipText: { fontSize: 12, color: colors.mutedForeground, fontWeight: '600' },
  periodChipTextOn: { color: colors.card },
  backdrop: { flex: 1, backgroundColor: colors.overlay, justifyContent: 'center' },
  sheet: { backgroundColor: colors.card, borderRadius: 14, margin: 24, padding: 20, gap: 8 },
  sheetTitle: { fontSize: 16, fontWeight: '800', color: colors.foreground },
  sheetBody: { fontSize: 13, color: colors.mutedForeground },
  sheetEmpty: { fontSize: 13, color: colors.mutedForeground, paddingVertical: 8 },
  adminRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.muted,
  },
  adminName: { fontSize: 15, color: colors.foreground },
  addBtn: {
    backgroundColor: colors.primary,
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
    marginTop: 12,
  },
  addBtnText: { color: colors.card, fontWeight: '700' },
});
