/**
 * The group page (UX-GRP-04), and for a community member who has not joined, its public preview
 * (UX-GRP-02: all content visible, "Join Group" fixed at the bottom). An archived group opens
 * read-only, with "Unarchive group" fixed at the bottom for its admins (UX-GRP-03).
 *
 * The header carries the identity (small thumbnail, name, description) and the viewer's menu:
 * "⋯" for members, a settings icon opening Manage Group for admins (useGroupMenu). Below it, one
 * line of overlapping avatars and the player count, with "+ Invite members" at its end.
 */
import {
  useAddGroupAdmins,
  useCanCreateEvent,
  useCanInviteToGroup,
  useCommunity,
  useCommunityMembers,
  useGroup,
  useGroupEvents,
  useGroupMemberList,
  useGroupRanking,
  useGroupSeasons,
  useJoinGroup,
  useLeaveGroup,
  useUnarchiveGroup,
} from '@padel/api';
import { useSession } from '@padel/auth';
import { useT } from '@padel/i18n';
import { Image } from 'expo-image';
import { useLocalSearchParams, useRouter, type Href } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { EventCard } from '@/components/event/EventCard';
import { GroupIdentity } from '@/components/group/GroupIdentity';
import { RankingList, sortRanking, type RankingSort } from '@/components/group/RankingList';
import { avatarUrl, thumbnailUrl } from '@/lib/community-images';
import { lastSeenSeason, markSeasonSeen, seasonToAnnounce } from '@/lib/seasonNotice';
import { useGoBack } from '@/lib/useGoBack';
import { useGroupMenu } from '@/lib/useGroupMenu';
import { colors, radius, space } from '../../../theme';
import {
  AvatarStack,
  Avatar,
  Badge,
  BottomSheet,
  Button,
  EmptyState,
  emptyIcon,
  SheetRow,
  Text,
  TopBar,
  useActionSheet,
  useBanner,
} from '../../../components/ui';

const PREVIEW_ROWS = 10;

export default function GroupHomeScreen() {
  const { t, i18n } = useT('group');
  const router = useRouter();
  const goBack = useGoBack();
  const banner = useBanner();
  const show = useActionSheet();
  const { id } = useLocalSearchParams<{ id: string }>();
  const uid = useSession().session?.user.id;

  const { data: group, isLoading } = useGroup(id);
  const communityId = group?.community_id;
  const { data: community } = useCommunity(communityId);
  const { data: communityMembers } = useCommunityMembers(communityId);
  const { data: people } = useGroupMemberList(id);
  const { data: seasons } = useGroupSeasons(id);
  const { data: events } = useGroupEvents(id);
  const { data: canCreateEvent } = useCanCreateEvent(id);
  const { data: canInvite } = useCanInviteToGroup(id);

  const currentSeason = (seasons ?? []).find((s) => s.ended_at == null);
  const pastSeasons = (seasons ?? []).filter((s) => s.ended_at != null);
  const { data: ranking } = useGroupRanking(currentSeason?.id ?? '');
  const [sort, setSort] = useState<RankingSort>('points');
  // Fixed at mount: "upcoming" is relative to when the page opened (React Compiler purity).
  const [now] = useState(() => Date.now());

  const members = (people ?? []).filter((p) => p.is_member);
  const isMember = members.some((p) => p.user_id === uid);
  const isCommunityAdmin = (communityMembers ?? []).some((m) => m.user_id === uid && m.role === 'admin');
  // is_group_admin, read client-side: community admin, and for a private group also a member.
  const isAdmin = isCommunityAdmin && (!group?.is_private || isMember);
  const isArchived = !!group?.archived_at;

  // "Add another admin" — the way out of the sole-admin leave (UX-GRP-15, decision 1).
  const [addAdminOpen, setAddAdminOpen] = useState(false);
  const [selectedAdmins, setSelectedAdmins] = useState<string[]>([]);
  const addAdmins = useAddGroupAdmins(id);
  const leave = useLeaveGroup();
  const memberIds = new Set(members.map((m) => m.user_id));
  const eligibleAdmins = (communityMembers ?? []).filter((m) => m.role === 'admin' && !memberIds.has(m.user_id));

  const menu = useGroupMenu(
    group
      ? {
          id,
          name: group.name,
          communityId: group.community_id,
          archivedAt: group.archived_at,
          currentSeasonNumber: currentSeason?.season_number ?? null,
          isMember,
        }
      : null,
    isAdmin,
    () => {
      setSelectedAdmins([]);
      setAddAdminOpen(true);
    },
  );

  // UX-GRP-14: a member who was away when the season closed hears about it once, here.
  const [endedNotice, setEndedNotice] = useState<number | null>(null);
  const latestClosed = pastSeasons.reduce<number | null>((n, s) => Math.max(n ?? 0, s.season_number), null);
  useEffect(() => {
    if (!isMember || latestClosed == null) return;
    let live = true;
    void lastSeenSeason(id).then((seen) => {
      if (!live) return;
      const announce = seasonToAnnounce(latestClosed, seen);
      if (announce != null) setEndedNotice(announce);
      else void markSeasonSeen(id, latestClosed);
    });
    return () => {
      live = false;
    };
  }, [id, isMember, latestClosed]);
  const closeNotice = () => {
    if (endedNotice != null) void markSeasonSeen(id, endedNotice);
    setEndedNotice(null);
  };
  const { data: endedRanking } = useGroupRanking(
    endedNotice != null ? (pastSeasons.find((s) => s.season_number === endedNotice)?.id ?? '') : '',
  );

  const join = useJoinGroup();
  const unarchive = useUnarchiveGroup();

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
        <Text variant="body" tone="muted">
          {t('noAccessBody')}
        </Text>
        <Button label={t('back')} variant="outline" onPress={() => router.back()} />
      </SafeAreaView>
    );
  }

  const err = (e: unknown) => {
    const code = e instanceof Error ? e.message : 'unknown_error';
    banner.show(t(code, { defaultValue: t('unknown_error') }));
  };

  const upcoming = (events ?? []).filter(
    (e) => e.status === 'scheduled' && new Date(e.starts_at).getTime() >= now,
  );
  const createEvent = () =>
    router.push(`/event/create?groupId=${id}&communityId=${communityId ?? ''}` as Href);
  const mayCreateEvent = !!canCreateEvent && !isArchived;
  const rankingRows = sortRanking(ranking ?? [], sort).slice(0, PREVIEW_ROWS);
  const lastUpdated = ranking?.[0]?.lastUpdated;
  const fmtDate = (iso: string, opts: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'short', year: 'numeric' }) =>
    new Date(iso).toLocaleDateString(i18n.language, opts);

  const onSort = async () => {
    const key = await show({
      title: t('sortBy'),
      actions: [
        { key: 'points', label: t('sortPoints') },
        { key: 'wins', label: t('sortWins') },
      ],
    });
    if (key === 'points' || key === 'wins') setSort(key);
  };

  const onJoin = async () => {
    if (!communityId) return;
    try {
      await join.mutateAsync({ groupId: id, communityId });
      banner.show(t('joinedToast', { name: group.name }), 'success');
    } catch (e) {
      // Joining a public group is also entering its community; one with rules asks for them on
      // its own join screen, which records the acceptance.
      if (e instanceof Error && e.message === 'rules_acknowledgement_required') {
        router.push(`/community/${communityId}/join` as Href);
        return;
      }
      err(e);
    }
  };

  const onUnarchive = async () => {
    if (!communityId) return;
    try {
      await unarchive.mutateAsync({ groupId: id, communityId });
      banner.show(t('unarchivedToast'), 'success');
    } catch (e) {
      err(e);
    }
  };

  const footer = isArchived ? (
    isAdmin ? (
      <Button label={t('unarchiveCta')} fullWidth loading={unarchive.isPending} onPress={onUnarchive} testID="group-unarchive" />
    ) : null
  ) : !isMember && !group.is_private ? (
    <Button label={t('joinCta')} fullWidth loading={join.isPending} onPress={onJoin} testID="group-join" />
  ) : null;

  const communityThumb = thumbnailUrl(community?.thumbnail_path);

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <TopBar
        onBack={goBack}
        backLabel={t('back')}
        centre={<GroupIdentity name={group.name} description={group.description} thumbnailPath={group.thumbnail_path} />}
        actions={menu ? [menu] : []}
      />

      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.membersLine}>
          <AvatarStack
            people={members.map((m) => ({ id: m.user_id, name: m.full_name, uri: avatarUrl(m.avatar_url) }))}
            countLabel={t('playersCount', { count: members.length })}
            onPress={() => router.push(`/group/${id}/members` as Href)}
            testID="group-members-line"
          />
          {canInvite && !isArchived ? (
            <Pressable
              onPress={() => router.push(`/group/${id}/invite` as Href)}
              accessibilityRole="button"
              hitSlop={8}
            >
              <Text variant="label" tone="primary">
                {t('inviteMembersCta')}
              </Text>
            </Pressable>
          ) : null}
        </View>
        {group.is_private || isArchived ? (
          <View style={styles.tags}>
            {group.is_private ? <Badge label={t('privateGroupLabel')} /> : null}
            {isArchived ? <Badge label={t('archivedTag')} tone="warning" /> : null}
          </View>
        ) : null}

        {/* Events: a rail with "See all"; no permanent "Create event" row (UX-GRP-04). */}
        <View style={styles.section}>
          <SectionTitle
            title={t('eventsTitle')}
            onSeeAll={upcoming.length > 0 ? () => router.push(`/group/${id}/events` as Href) : undefined}
            seeAllLabel={t('seeAll')}
            testID="group-events-see-all"
          />
          {upcoming.length === 0 ? (
            <EmptyState
              icon={emptyIcon('calendar')}
              title={t('groupEventsEmptyTitle')}
              body={t('groupEventsEmptyBody')}
              action={mayCreateEvent ? { label: t('groupEventsEmptyCta'), onPress: createEvent } : undefined}
              testID="empty-group-events"
            />
          ) : (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.rail}>
              {upcoming.map((e) => (
                <EventCard
                  key={e.id}
                  event={e}
                  orientation="vertical"
                  onPress={() => router.push(`/event/${e.id}` as Href)}
                />
              ))}
            </ScrollView>
          )}
        </View>

        {/* Ranking: top 10, W/L, sortable; the period filter lives on the full screen. */}
        <View style={styles.section}>
          <SectionTitle
            title={t('rankingTitle')}
            onSeeAll={rankingRows.length > 0 ? () => router.push(`/group/${id}/ranking` as Href) : undefined}
            seeAllLabel={t('seeAll')}
            testID="group-ranking-see-all"
          />
          {rankingRows.length === 0 ? (
            <EmptyState
              icon={emptyIcon('trophy')}
              title={t('rankingEmptyTitle')}
              body={t('rankingPlaceholder')}
              action={mayCreateEvent ? { label: t('groupEventsEmptyCta'), onPress: createEvent } : undefined}
              testID="empty-group-ranking"
            />
          ) : (
            <>
              <View style={styles.rankingMeta}>
                {lastUpdated ? (
                  <Text variant="hint" tone="muted">
                    {t('lastUpdate', { date: fmtDate(lastUpdated) })}
                  </Text>
                ) : (
                  <View />
                )}
                <Pressable onPress={onSort} accessibilityRole="button" hitSlop={8}>
                  <Text variant="hint" tone="primary">
                    {t('sortedBy', { by: sort === 'wins' ? t('sortWins') : t('sortPoints') })}
                  </Text>
                </Pressable>
              </View>
              <RankingList
                rows={rankingRows}
                variant="preview"
                onPressRow={(userId) => router.push(`/profile/${userId}` as Href)}
              />
            </>
          )}
        </View>

        {/* Past seasons, hidden until there is one (UX-GRP-14). */}
        {pastSeasons.length > 0 ? (
          <View style={styles.section}>
            <SectionTitle title={t('previousSeasonsTitle')} />
            <View style={styles.seasonCards}>
              {pastSeasons.map((s) => (
                <Pressable
                  key={s.id}
                  style={styles.seasonCard}
                  accessibilityRole="button"
                  onPress={() => router.push(`/group/${id}/season/${s.season_number}` as Href)}
                  testID={`group-season-${s.season_number}`}
                >
                  <Text variant="label">{t('seasonTag', { number: s.season_number })}</Text>
                  <Text variant="hint" tone="muted">
                    {t('seasonPeriod', {
                      from: fmtDate(s.started_at, { month: 'short', year: 'numeric' }),
                      to: fmtDate(s.ended_at!, { month: 'short', year: 'numeric' }),
                    })}
                  </Text>
                </Pressable>
              ))}
            </View>
          </View>
        ) : null}

        {/* General info */}
        <View style={styles.section}>
          <SectionTitle title={t('generalInfoTitle')} />
          {community ? (
            <Pressable
              style={styles.communityCard}
              accessibilityRole="button"
              onPress={() => router.push(`/community/${community.id}` as Href)}
            >
              {communityThumb ? (
                <Image source={{ uri: communityThumb }} style={styles.communityThumb} contentFit="cover" />
              ) : (
                <Avatar name={community.name} colourKey={community.id} size="md" decorative />
              )}
              <Text variant="label" style={styles.communityName} numberOfLines={1}>
                {community.name}
              </Text>
              <Text variant="body" tone="subtle">
                ›
              </Text>
            </Pressable>
          ) : null}
          <Text variant="caption" tone="muted" style={styles.created}>
            {t('createdOn', { date: fmtDate(group.created_at, { day: 'numeric', month: 'long', year: 'numeric' }) })}
          </Text>
        </View>
      </ScrollView>

      {footer ? <View style={styles.footer}>{footer}</View> : null}

      <BottomSheet
        visible={endedNotice != null}
        onClose={closeNotice}
        title={t('seasonEndedTitle', { number: endedNotice ?? 0 })}
        testID="season-ended-notice"
      >
        <Text variant="body" tone="muted" style={styles.sheetBody}>
          {t('seasonEndedBody')}
        </Text>
        {(endedRanking ?? []).length > 0 ? (
          <RankingList rows={(endedRanking ?? []).slice(0, 3)} variant="full" />
        ) : null}
        <Button
          label={t('seeFinalStandings')}
          fullWidth
          style={styles.sheetCta}
          onPress={() => {
            const n = endedNotice;
            closeNotice();
            if (n != null) router.push(`/group/${id}/season/${n}` as Href);
          }}
        />
      </BottomSheet>

      <BottomSheet
        visible={addAdminOpen}
        onClose={() => setAddAdminOpen(false)}
        title={t('addAdminTitle')}
        testID="add-admin-sheet"
      >
        <Text variant="body" tone="muted" style={styles.sheetBody}>
          {t('addAdminBody')}
        </Text>
        {eligibleAdmins.length === 0 ? (
          <Text variant="caption" tone="muted" style={styles.sheetBody}>
            {t('noEligibleAdmins')}
          </Text>
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
                  setSelectedAdmins((s) => (s.includes(m.user_id) ? s.filter((x) => x !== m.user_id) : [...s, m.user_id]))
                }
                testID={`add-admin-row-${m.user_id}`}
              />
            );
          })
        )}
        <Button
          label={t('addAdminCta')}
          fullWidth
          style={styles.sheetCta}
          loading={addAdmins.isPending || leave.isPending}
          disabled={selectedAdmins.length === 0}
          onPress={async () => {
            try {
              await addAdmins.mutateAsync(selectedAdmins);
              setAddAdminOpen(false);
              if (communityId) await leave.mutateAsync({ groupId: id, communityId });
              banner.show(t('leftToast', { name: group.name }), 'success');
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

/** A section title with "See all" on the same line (UX-GRP-04). */
function SectionTitle({
  title,
  onSeeAll,
  seeAllLabel,
  testID,
}: {
  title: string;
  onSeeAll?: () => void;
  seeAllLabel?: string;
  testID?: string;
}) {
  return (
    <View style={styles.sectionHeader}>
      <Text variant="sectionTitle" accessibilityRole="header">
        {title}
      </Text>
      {onSeeAll ? (
        <Pressable onPress={onSeeAll} accessibilityRole="button" hitSlop={8} testID={testID}>
          <Text variant="label" tone="primary">
            {seeAllLabel}
          </Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  center: { alignItems: 'center', justifyContent: 'center', gap: space[3] },
  content: { paddingBottom: space[8] },
  membersLine: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: space[4],
    paddingTop: space[3],
  },
  tags: { flexDirection: 'row', gap: space[2], paddingHorizontal: space[4], paddingTop: space[2] },
  section: { paddingHorizontal: space[4], paddingTop: space[6] },
  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: space[3] },
  rail: { gap: space[3] },
  rankingMeta: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: space[2] },
  seasonCards: { gap: space[2] },
  seasonCard: { backgroundColor: colors.card, borderRadius: radius.lg, padding: space[4], gap: space[1] },
  communityCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space[3],
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    padding: space[3],
  },
  communityThumb: { width: 40, height: 40, borderRadius: radius.full },
  communityName: { flex: 1 },
  created: { marginTop: space[3] },
  footer: {
    paddingHorizontal: space[4],
    paddingTop: space[3],
    paddingBottom: space[2],
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
    backgroundColor: colors.background,
  },
  sheetBody: { paddingHorizontal: space[2], marginBottom: space[3] },
  sheetCta: { marginTop: space[3], marginHorizontal: space[2] },
});
