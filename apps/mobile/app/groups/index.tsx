/**
 * Your Groups (UX-GRP-03): every group the user belongs to, sectioned by community — no tabs.
 *
 *   header    back, "Your Groups", and "+" opening Create Group (replacing "Explore groups", which
 *             duplicated Search) — plus a "Create group" action below it. Both only for someone who
 *             may create a group somewhere (UX-GRP-01).
 *   sections  one per community: its name, smaller than the title, with "Show all" on the right,
 *             then that community's groups as a horizontal row of compact cards — a small
 *             messaging-style thumbnail, the name and the description.
 *   archived  an admin keeps their archived groups here with an "Archived" tag (opening one is
 *             read-only, with "Unarchive group"); a member never sees them.
 *   empty     the standard empty state, its CTA opening Explore on the Groups tab.
 */
import { useCreatableCommunities, useMyGroups, type MyGroup } from '@padel/api';
import { useT } from '@padel/i18n';
import { Image } from 'expo-image';
import { useRouter, type Href } from 'expo-router';
import { useMemo } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { thumbnailUrl } from '@/lib/community-images';
import { useGoBack } from '@/lib/useGoBack';
import { colors, radius, space } from '../../theme';
import { Badge, Button, EmptyState, emptyIcon, Text, TopBar } from '../../components/ui';

type Section = { communityId: string; communityName: string; groups: MyGroup[] };

export default function YourGroupsScreen() {
  const { t } = useT('group');
  const router = useRouter();
  const goBack = useGoBack();
  const groups = useMyGroups({ includeArchived: true });
  const { communities: creatable } = useCreatableCommunities();
  const canCreate = creatable.length > 0;

  const sections = useMemo<Section[]>(() => {
    const by = new Map<string, Section>();
    for (const g of groups.data ?? []) {
      const s = by.get(g.community_id) ?? { communityId: g.community_id, communityName: g.community_name, groups: [] };
      s.groups.push(g);
      by.set(g.community_id, s);
    }
    // Active groups first within a community; archived ones trail.
    for (const s of by.values()) s.groups.sort((a, b) => Number(!!a.archived_at) - Number(!!b.archived_at));
    return [...by.values()];
  }, [groups.data]);

  const create = () => router.push('/groups/create' as Href);

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <TopBar
        title={t('yourGroupsTitle')}
        onBack={goBack}
        backLabel={t('back')}
        actions={canCreate ? [{ icon: '+', label: t('createCta'), onPress: create, testID: 'your-groups-create-icon' }] : []}
      />
      {groups.isLoading ? (
        <ActivityIndicator color={colors.foreground} style={styles.loading} />
      ) : groups.isError ? (
        <EmptyState
          tone="error"
          title={t('loadError')}
          action={{ label: t('retry', { ns: 'common' }), onPress: () => void groups.refetch() }}
          testID="empty-groups"
        />
      ) : (
        <ScrollView contentContainerStyle={styles.content}>
          {canCreate ? (
            <Button label={t('createCta')} variant="outline" fullWidth onPress={create} testID="your-groups-create" />
          ) : null}
          {sections.length === 0 ? (
            <EmptyState
              icon={emptyIcon('person.3')}
              title={t('yourGroupsEmptyTitle')}
              body={t('yourGroupsEmptyBody')}
              action={{ label: t('exploreGroupsCta'), onPress: () => router.push('/explore/groups' as Href) }}
              testID="empty-groups"
            />
          ) : (
            sections.map((s) => (
              <View key={s.communityId} style={styles.section}>
                <View style={styles.sectionHeader}>
                  <Text variant="label" accessibilityRole="header" numberOfLines={1} style={styles.flex}>
                    {s.communityName}
                  </Text>
                  <Pressable
                    onPress={() => router.push(`/community/${s.communityId}` as Href)}
                    accessibilityRole="button"
                    accessibilityLabel={t('showAllIn', { name: s.communityName })}
                    hitSlop={8}
                  >
                    <Text variant="label" tone="primary">
                      {t('showAll')}
                    </Text>
                  </Pressable>
                </View>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.rail}>
                  {s.groups.map((g) => (
                    <GroupMiniCard key={g.group_id} group={g} onPress={() => router.push(`/group/${g.group_id}` as Href)} />
                  ))}
                </ScrollView>
              </View>
            ))
          )}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

/** A compact card: small round thumbnail beside the name and description (messaging-app style). */
function GroupMiniCard({ group, onPress }: { group: MyGroup; onPress: () => void }) {
  const { t } = useT('group');
  const thumb = thumbnailUrl(group.thumbnail_path);
  return (
    <Pressable style={styles.card} onPress={onPress} accessibilityRole="button" testID={`group-card-${group.group_id}`}>
      {thumb ? (
        <Image source={{ uri: thumb }} style={styles.thumb} contentFit="cover" />
      ) : (
        <View style={[styles.thumb, styles.thumbFallback]}>
          <Text variant="label" tone="inverse">
            {(group.name.charAt(0) || '?').toUpperCase()}
          </Text>
        </View>
      )}
      <View style={styles.flex}>
        <Text variant="label" numberOfLines={1}>
          {group.name}
        </Text>
        {group.description ? (
          <Text variant="hint" tone="muted" numberOfLines={2}>
            {group.description}
          </Text>
        ) : null}
        {group.archived_at ? <Badge label={t('archivedTag')} tone="warning" style={styles.tag} /> : null}
      </View>
    </Pressable>
  );
}

const THUMB = 44;

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  loading: { marginTop: space[8] },
  content: { padding: space[4], gap: space[5] },
  section: { gap: space[3] },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', gap: space[3] },
  flex: { flex: 1 },
  rail: { gap: space[3] },
  card: {
    width: 260,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space[3],
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    padding: space[3],
  },
  thumb: { width: THUMB, height: THUMB, borderRadius: radius.full, backgroundColor: colors.muted },
  thumbFallback: { alignItems: 'center', justifyContent: 'center', backgroundColor: colors.primary },
  tag: { marginTop: space[1], alignSelf: 'flex-start' },
});
