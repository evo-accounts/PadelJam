/**
 * The Community tab IS a community (UX-COMM-08).
 *
 * It used to list communities and push into one, which made the member view a
 * pushed screen with a back button. The audit is explicit that being inside a
 * community is "a navbar destination, not a sheet", so the tab hosts the five
 * Material Top Tabs directly and there is no back affordance anywhere here.
 *
 * WHICH community it shows is the user's default (`useDefaultCommunity`), which
 * the switcher sets — so switching is a change of context, not a navigation.
 * Falling back to the first active membership matters for a user who has never
 * chosen: without it the tab would be blank for someone who plainly belongs
 * somewhere.
 *
 * The header carries the identity ONLY as a thumbnail and name. No cover, no
 * centred thumbnail, no attribute widgets — that block moved to About, which is
 * why `CommunityHero` is deleted rather than adapted.
 */
import {
  useCommunities,
  useCommunityMembers,
  useDefaultCommunity,
  useSetDefaultCommunity,
  useSuggestedCommunities,
} from '@padel/api';
import { useSession } from '@padel/auth';
import { useT } from '@padel/i18n';
import { useRouter } from 'expo-router';
import { TopTabs } from 'expo-router/js-top-tabs';
import { useMemo, useState } from 'react';
import { Pressable, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { CommunityIdProvider } from '@/components/community/CommunityIdContext';
import {
  CommunitySwitcherSheet,
  type Membership,
} from '@/components/community/CommunitySwitcherSheet';
import { EmptyState } from '@/components/community/EmptyState';
import type { SuggestedCommunity } from '@/components/community/SuggestedCommunityCard';
import { thumbnailUrl } from '@/lib/community-images';
import { colors, palette, space } from '../../../../theme';
import { Avatar, Loading, Text, TopBar } from '../../../../components/ui';

export default function CommunityTabLayout() {
  const { t } = useT('community');
  const router = useRouter();
  const uid = useSession().session?.user.id;

  const communitiesQuery = useCommunities();
  const defaultQuery = useDefaultCommunity();
  const suggestedQuery = useSuggestedCommunities();
  const setDefault = useSetDefaultCommunity();
  const [switcherOpen, setSwitcherOpen] = useState(false);

  const memberships: Membership[] = useMemo(
    () =>
      (communitiesQuery.data ?? [])
        .filter((r): r is { role: string; community: NonNullable<typeof r.community> } => r.community != null)
        .map((r) => ({ role: r.role, community: r.community })),
    [communitiesQuery.data],
  );

  const active = useMemo(() => {
    const live = memberships.filter((m) => !m.community.archived_at);
    const chosen = live.find((m) => m.community.id === defaultQuery.data?.community_id);
    return chosen ?? live[0] ?? null;
  }, [memberships, defaultQuery.data?.community_id]);

  const { data: members } = useCommunityMembers(active?.community.id);
  const isAdmin = members?.find((m) => m.user_id === uid)?.role === 'admin';

  const goCreate = () => router.push('/(tabs)/community/create');

  if (communitiesQuery.isLoading) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <TopBar variant="top" title={t('title')} />
        <Loading />
      </SafeAreaView>
    );
  }

  // UX-COMM-07: belonging to no ACTIVE community is the empty state, and create
  // lives in the header rather than as a row in the body.
  if (!active) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <TopBar
          variant="top"
          title={t('title')}
          actions={[{ icon: '+', label: t('newCommunity'), onPress: goCreate }]}
        />
        <EmptyState
          suggested={(suggestedQuery.data ?? []) as SuggestedCommunity[]}
          canCreate
          onPressSuggested={(id) => router.push(`/community/${id}/join`)}
          onCreate={goCreate}
        />
      </SafeAreaView>
    );
  }

  const community = active.community;

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <TopBar
        variant="top"
        centre={
          <Pressable
            style={styles.identity}
            onPress={() => setSwitcherOpen(true)}
            accessibilityRole="button"
            accessibilityLabel={t('switcherOpen', { name: community.name })}
            testID="community-switcher-trigger"
          >
            <Avatar
              uri={thumbnailUrl(community.thumbnail_path)}
              name={community.name}
              colourKey={community.id}
              size="sm"
              decorative
            />
            <Text variant="sectionTitle" numberOfLines={1} style={styles.name}>
              {community.name}
            </Text>
            <Text variant="caption" tone="muted">
              ⌄
            </Text>
          </Pressable>
        }
        actions={
          isAdmin
            ? [
                {
                  icon: '⚙',
                  label: t('manageTitle'),
                  onPress: () => router.push(`/community/${community.id}/manage`),
                },
              ]
            : // A member's "⋯" opens the overflow sheet of UX-COMM-14, which a
              // later pull request builds. Until it has something to open there
              // is no control here — better than one that goes nowhere.
              []
        }
      />

      <CommunityIdProvider id={community.id}>
        <TopTabs
          screenOptions={{
            tabBarScrollEnabled: true,
            tabBarActiveTintColor: colors.primary,
            tabBarInactiveTintColor: palette.slate[400],
            tabBarIndicatorStyle: { backgroundColor: colors.primary },
            tabBarLabelStyle: { fontSize: 13, fontWeight: '700', textTransform: 'none' },
            tabBarItemStyle: { width: 'auto', paddingHorizontal: 16 },
          }}
        >
          <TopTabs.Screen name="posts" options={{ title: t('tabPosts') }} />
          <TopTabs.Screen name="events" options={{ title: t('tabEvents') }} />
          <TopTabs.Screen name="groups" options={{ title: t('tabGroups') }} />
          <TopTabs.Screen name="members" options={{ title: t('tabMembers') }} />
          <TopTabs.Screen name="about" options={{ title: t('tabAbout') }} />
        </TopTabs>
      </CommunityIdProvider>

      <CommunitySwitcherSheet
        visible={switcherOpen}
        onClose={() => setSwitcherOpen(false)}
        memberships={memberships}
        activeId={community.id}
        onSelect={(id) => {
          setSwitcherOpen(false);
          if (id !== community.id) void setDefault.mutateAsync(id).catch(() => {});
        }}
        onNewCommunity={() => {
          setSwitcherOpen(false);
          goCreate();
        }}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.card },
  identity: { flexDirection: 'row', alignItems: 'center', gap: space[2] },
  name: { flexShrink: 1 },
});
