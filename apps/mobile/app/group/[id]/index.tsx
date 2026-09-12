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
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { EventCard } from '@/components/event/EventCard';
import { GroupHeader } from '@/components/group/GroupHeader';
import { RankingList } from '@/components/group/RankingList';
import { avatarUrl } from '@/lib/community-images';
import { colors, palette } from '../../../theme';
import { Button, Chip, ListRow, Text, TopBar } from '../../../components/ui';

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
        <Text variant="sectionTitle">{t('noAccessTitle')}</Text>
        <Text variant="body" tone="muted">{t('noAccessBody')}</Text>
        <Button label={t('back')} variant="outline" onPress={() => router.back()} />
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
      <TopBar
        onBack={() => router.back()}
        backLabel={t('back')}
        actions={[{ icon: '•••', label: t('more'), onPress: onMore }]}
      />

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
            <Text variant="label" tone="muted" style={styles.sectionTitle}>{t('membersTitle')}</Text>
            <Text variant="hint" tone="muted">{t('membersPill', { count: memberRows.length })}</Text>
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
                  <Text variant="hint" tone="inverse">{(name.charAt(0) || '?').toUpperCase()}</Text>
                </View>
              );
            })}
          </View>
        </Pressable>

        <ListRow
          title={t('inviteMembersCta')}
          onPress={() => router.push(`/group/${id}/invite` as Href)}
        />

        {/* Chat */}
        <View style={styles.section}>
          <Button
            label={t('openChat', { ns: 'chat' })}
            fullWidth
            loading={ensureChannel.isPending}
            onPress={openGroupChat}
          />
          {ensureChannel.isError ? (
            <Text variant="hint" tone="destructive" style={styles.chatError}>
              {t('chatUnavailable', { ns: 'chat' })}
            </Text>
          ) : null}
        </View>

        {/* Events */}
        <View style={styles.section}>
          <Text variant="label" tone="muted" style={styles.sectionTitle}>{t('eventsTitle')}</Text>
          <ListRow
            title={t('event:createTitle')}
            onPress={() =>
              router.push(
                `/event/create?groupId=${id}&communityId=${communityId ?? ''}` as Href,
              )
            }
          />
          {eventRows.length === 0 ? (
            <Text variant="caption" tone="muted">{t('event:eventsEmpty')}</Text>
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
          <Text variant="label" tone="muted" style={styles.sectionTitle}>{t('rankingTitle')}</Text>
          <View style={styles.periodRow}>
            {(['all', '3m', '6m', '12m'] as const).map((p) => (
              <Chip
                key={p}
                label={t(
                  p === 'all'
                    ? 'periodAll'
                    : p === '3m'
                      ? 'period3m'
                      : p === '6m'
                        ? 'period6m'
                        : 'period12m',
                )}
                selected={period === p}
                onPress={() => setPeriod(p)}
              />
            ))}
          </View>
          <RankingList rows={ranking ?? []} />
        </View>

        {/* Previous seasons */}
        {previousSeasons.length > 0 ? (
          <View style={styles.section}>
            <Text variant="label" tone="muted" style={styles.sectionTitle}>{t('previousSeasonsTitle')}</Text>
            <View style={styles.card}>
              {previousSeasons.map((s) => (
                <ListRow
                  key={s.id}
                  title={t('seasonTag', { number: s.season_number })}
                  trailing={<Text variant="body" tone="subtle">›</Text>}
                  // TODO(events): navigate to a season detail screen once it exists.
                  onPress={() => {}}
                />
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
            <Text variant="sectionTitle">{t('addAdminTitle')}</Text>
            <Text variant="body" tone="muted">{t('addAdminBody')}</Text>
            {eligibleAdmins.length === 0 ? (
              <Text variant="caption" tone="muted">{t('noEligibleAdmins')}</Text>
            ) : (
              eligibleAdmins.map((m) => (
                <ListRow
                  key={m.user_id}
                  title={m.profiles?.full_name ?? '—'}
                  trailing={selectedAdmins.includes(m.user_id) ? <Text variant="body">✓</Text> : null}
                  selected={selectedAdmins.includes(m.user_id)}
                  onPress={() =>
                    setSelectedAdmins((s) =>
                      s.includes(m.user_id) ? s.filter((x) => x !== m.user_id) : [...s, m.user_id],
                    )
                  }
                />
              ))
            )}
            <Button
              label={t('addAdminCta')}
              fullWidth
              loading={addAdmins.isPending}
              disabled={selectedAdmins.length === 0}
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
            />
          </View>
        </Pressable>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  chatError: { marginTop: 6 },
  container: { flex: 1, backgroundColor: colors.background },
  center: { alignItems: 'center', justifyContent: 'center' },
  back: { fontSize: 32, color: colors.foreground, lineHeight: 32 },
  content: { paddingBottom: 32 },
  section: { paddingHorizontal: 16, paddingTop: 20 },
  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  sectionTitle: { fontSize: 13, fontWeight: '700', color: palette.slate[400], textTransform: 'uppercase' },
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
  eventList: { marginTop: 12, gap: 8 },
  card: { backgroundColor: colors.card, borderRadius: 12, marginTop: 12, overflow: 'hidden' },
  spacer: { height: 8 },
  periodRow: { flexDirection: 'row', gap: 8, marginBottom: 8, marginTop: 12, flexWrap: 'wrap' },
  backdrop: { flex: 1, backgroundColor: colors.overlay, justifyContent: 'center' },
  sheet: { backgroundColor: colors.card, borderRadius: 14, margin: 24, padding: 20, gap: 8 },
});
