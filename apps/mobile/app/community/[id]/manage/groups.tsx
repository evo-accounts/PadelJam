/**
 * Manage Groups (UX-COMM-18). Admin only, and **the only screen in the app where
 * archived groups are visible** — every other list filters them out, which is why
 * `useArchivedCommunityGroups` exists rather than a flag on the live query.
 *
 * Three ways to archive, on purpose:
 *   - swipe a card, which is what the audit asks for;
 *   - the row's "⋯", because a swipe-only action is unreachable for anyone using
 *     VoiceOver and unaddressable by the E2E driver, which taps coordinates;
 *   - the assistive-tech action `SwipeRow` registers.
 * Tapping the card itself still opens the group. A group has no administration
 * of its own, so this screen is where its lifecycle lives.
 */
import {
  useArchiveGroup,
  useArchivedCommunityGroups,
  useCanCreateGroup,
  useCommunityGroups,
  useUnarchiveGroup,
} from '@padel/api';
import { useT } from '@padel/i18n';
import { FlashList } from '@shopify/flash-list';
import { type Href, useLocalSearchParams, useRouter } from 'expo-router';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { GroupCard } from '@/components/group/GroupCard';
import { colors, palette, space } from '../../../../theme';
import {
  Button,
  EmptyState,
  SwipeRow,
  Text,
  TopBar,
  emptyIcon,
  listEmptyContent,
  useActionSheet,
  useBanner,
} from '../../../../components/ui';

type Group = { id: string; name: string; archived_at?: string | null } & Record<string, unknown>;

type Row =
  | { kind: 'header'; key: string; label: string }
  | { kind: 'group'; key: string; group: Group; archived: boolean };

export default function ManageGroupsScreen() {
  const { t } = useT('community');
  const { t: tg } = useT('group');
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();

  const { data: live, isLoading, isError, refetch } = useCommunityGroups(id);
  const { data: archived } = useArchivedCommunityGroups(id);
  const { data: canCreate } = useCanCreateGroup(id);
  const archive = useArchiveGroup();
  const unarchive = useUnarchiveGroup();
  const show = useActionSheet();
  const banner = useBanner();

  const err = (e: unknown) => {
    const code = e instanceof Error ? e.message : 'unknown_error';
    banner.show(t(code, { defaultValue: t('unknown_error') }));
  };

  const onArchive = async (group: Group) => {
    try {
      await archive.mutateAsync({ groupId: group.id, communityId: id });
      banner.show(t('groupArchived', { name: group.name }), 'success');
    } catch (e) {
      err(e);
    }
  };

  const onUnarchive = async (group: Group) => {
    try {
      await unarchive.mutateAsync({ groupId: group.id, communityId: id });
      banner.show(t('groupUnarchived', { name: group.name }), 'success');
    } catch (e) {
      err(e);
    }
  };

  /** The "⋯" route to the same action the swipe reveals. */
  const openActions = async (group: Group, isArchived: boolean) => {
    const key = await show({
      title: group.name,
      actions: isArchived
        ? [{ key: 'unarchive', label: t('unarchiveGroup') }]
        : [
            {
              key: 'archive',
              label: t('archiveGroup'),
              destructive: true,
              confirm: {
                title: t('archiveGroupConfirmTitle'),
                body: t('archiveGroupConfirmBody', { name: group.name }),
                confirmLabel: t('archiveGroup'),
              },
            },
          ],
    });
    if (key === 'archive') await onArchive(group);
    else if (key === 'unarchive') await onUnarchive(group);
  };

  if (isLoading) {
    return (
      <SafeAreaView style={[styles.container, styles.center]} edges={['top']}>
        <ActivityIndicator color={colors.foreground} />
      </SafeAreaView>
    );
  }

  const liveRows = ((live ?? []) as Group[]).map<Row>((g) => ({
    kind: 'group',
    key: g.id,
    group: g,
    archived: false,
  }));
  const archivedGroups = (archived ?? []) as Group[];
  const rows: Row[] = [
    ...liveRows,
    ...(archivedGroups.length > 0
      ? [
          { kind: 'header', key: 'archived-header', label: t('archivedGroups') } as Row,
          ...archivedGroups.map<Row>((g) => ({
            kind: 'group',
            key: g.id,
            group: g,
            archived: true,
          })),
        ]
      : []),
  ];

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <TopBar title={t('manageGroups')} onBack={() => router.back()} backLabel={t('back')} />
      <FlashList
        data={rows}
        keyExtractor={(r) => r.key}
        contentContainerStyle={[styles.listContent, listEmptyContent]}
        ListHeaderComponent={
          canCreate ? (
            <View style={styles.header}>
              <Button
                label={tg('newGroupCta')}
                fullWidth
                onPress={() => router.push(`/community/${id}/group-create` as Href)}
                testID="manage-create-group"
              />
            </View>
          ) : null
        }
        ItemSeparatorComponent={() => <View style={styles.separator} />}
        ListEmptyComponent={
          isError ? (
            <EmptyState
              fill
              tone="error"
              title={t('loadError', { ns: 'common' })}
              action={{ label: t('retry', { ns: 'common' }), onPress: () => refetch() }}
              testID="empty-manage-groups"
            />
          ) : (
            <EmptyState
              fill
              icon={emptyIcon('person.3')}
              title={t('noGroups')}
              testID="empty-manage-groups"
            />
          )
        }
        renderItem={({ item }) => {
          if (item.kind === 'header') {
            return (
              <Text variant="label" tone="muted" style={styles.sectionLabel}>
                {item.label}
              </Text>
            );
          }
          const { group, archived: isArchived } = item;
          return (
            <SwipeRow
              actionLabel={isArchived ? t('unarchiveGroup') : t('archiveGroup')}
              destructive={!isArchived}
              onAction={() => void (isArchived ? onUnarchive(group) : onArchive(group))}
              testID={`group-swipe-${isArchived ? 'unarchive' : 'archive'}-${group.id}`}
            >
              <View style={styles.rowWrap}>
                <View style={styles.rowFill}>
                  <GroupCard
                    group={group as never}
                    onPress={() => router.push(`/group/${group.id}` as Href)}
                  />
                </View>
                <Pressable
                  onPress={() => void openActions(group, isArchived)}
                  accessibilityRole="button"
                  accessibilityLabel={t('groupActions', { name: group.name })}
                  testID={`group-actions-${group.id}`}
                >
                  <Text style={styles.dots}>⋯</Text>
                </Pressable>
              </View>
            </SwipeRow>
          );
        }}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.card },
  center: { alignItems: 'center', justifyContent: 'center', padding: 32 },
  header: { paddingBottom: space[3] },
  listContent: { paddingHorizontal: space[4], paddingTop: space[3] },
  separator: { height: space[3] },
  sectionLabel: { paddingTop: space[5], paddingBottom: space[2] },
  rowWrap: { flexDirection: 'row', alignItems: 'center' },
  rowFill: { flex: 1 },
  dots: { fontSize: 24, color: palette.slate[400], paddingHorizontal: space[3] },
});
