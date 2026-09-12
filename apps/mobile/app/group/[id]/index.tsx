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
import { useLocalSearchParams, useRouter, type Href } from 'expo-router';
import { useState } from 'react';
import {
  ActivityIndicator,
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
import { useGoBack } from '@/lib/useGoBack';
import { colors, palette } from '../../../theme';
import { Avatar, Badge, BottomSheet, Button, Chip, EmptyState, emptyIcon, ListRow, SheetRow, Text, TopBar, useActionSheet, useBanner } from '../../../components/ui';

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
  const goBack = useGoBack();
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
  const show = useActionSheet();
  const banner = useBanner();
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
    banner.show(t(KNOWN_ERROR_KEYS.has(code) ? code : 'unknown_error'));
  };

  const onShare = () => {
    void Share.share({ message: t('shareCta') + ': ' + group.name });
  };

  // The action sheet auto-confirms the destructive 'leave' row before
  // returning its key (see useActionSheet), so this runs the mutation
  // directly rather than asking again.
  const doLeave = async () => {
    if (!communityId) return;
    try {
      await leave.mutateAsync({ groupId: id, communityId });
      router.back();
    } catch (e) {
      if (e instanceof Error && e.message === 'sole_admin_must_add_another') {
        // Safe to open this BottomSheet here: `show()` (called by `onMore`,
        // above) only resolves once the host has actually dismissed its own
        // Modal (see sheetApi.ts), so there is no Modal still animating out.
        setSelectedAdmins([]);
        setAddAdminOpen(true);
      } else {
        err(e);
      }
    }
  };

  const onMore = async () => {
    const key = await show({
      title: t('moreCta'),
      actions: [
        { key: 'share', label: t('shareCta') },
        ...(canManage ? [{ key: 'manage', label: t('manageCta') }] : []),
        { key: 'leave', label: t('leaveGroupCta'), destructive: true, confirm: { title: t('leaveGroupConfirm'), confirmLabel: t('leaveGroupCta') } },
      ],
    });
    if (key === 'share') onShare();
    else if (key === 'manage') router.push(`/group/${id}/manage` as Href);
    else if (key === 'leave') await doLeave();
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <TopBar
        onBack={goBack}
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
            {previewMembers.map((m) => (
              <Avatar
                key={m.user_id}
                uri={avatarUrl(m.profiles?.avatar_url)}
                name={m.profiles?.full_name}
                colourKey={m.user_id}
                size="md"
                style={styles.avatarStack}
              />
            ))}
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
            <EmptyState
              icon={emptyIcon('calendar')}
              title={t('groupEventsEmptyTitle')}
              body={t('groupEventsEmptyBody')}
              action={{
                label: t('groupEventsEmptyCta'),
                onPress: () =>
                  router.push(`/event/create?groupId=${id}&communityId=${communityId ?? ''}` as Href),
              }}
              testID="empty-group-events"
            />
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

      <BottomSheet
        visible={addAdminOpen}
        onClose={() => setAddAdminOpen(false)}
        title={t('addAdminTitle')}
        testID="add-admin-sheet"
      >
        <Text variant="body" tone="muted" style={styles.addAdminBody}>{t('addAdminBody')}</Text>
        {eligibleAdmins.length === 0 ? (
          <Text variant="caption" tone="muted" style={styles.addAdminBody}>{t('noEligibleAdmins')}</Text>
        ) : (
          eligibleAdmins.map((m) => {
            const name = m.profiles?.full_name ?? '—';
            const selected = selectedAdmins.includes(m.user_id);
            return (
              <SheetRow
                key={m.user_id}
                label={name}
                leading={<Avatar name={name} uri={avatarUrl(m.profiles?.avatar_url)} colourKey={m.user_id} size="sm" />}
                selected={selected}
                trailing={selected ? <Badge label="✓" /> : undefined}
                onPress={() =>
                  setSelectedAdmins((s) =>
                    s.includes(m.user_id) ? s.filter((x) => x !== m.user_id) : [...s, m.user_id],
                  )
                }
                testID={`add-admin-row-${m.user_id}`}
              />
            );
          })
        )}
        <Button
          label={t('addAdminCta')}
          fullWidth
          style={styles.addAdminCta}
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
      </BottomSheet>
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
  avatarStack: { marginRight: -8, borderWidth: 2, borderColor: colors.border },
  eventList: { marginTop: 12, gap: 8 },
  card: { backgroundColor: colors.card, borderRadius: 12, marginTop: 12, overflow: 'hidden' },
  spacer: { height: 8 },
  periodRow: { flexDirection: 'row', gap: 8, marginBottom: 8, marginTop: 12, flexWrap: 'wrap' },
  addAdminBody: { paddingHorizontal: 8, marginBottom: 12 },
  addAdminCta: { marginTop: 12, marginHorizontal: 8 },
});
