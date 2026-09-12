import {
  useCanCreateCommunity,
  useCommunities,
  useDefaultCommunity,
  useSetDefaultCommunity,
  useSuggestedCommunities,
} from '@padel/api';
import { useT } from '@padel/i18n';
import { useRouter } from 'expo-router';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import {
  CommunitySwitcher,
  type CommunityRow,
  type Membership,
} from '@/components/community/CommunitySwitcher';
import { EmptyState } from '@/components/community/EmptyState';
import type { SuggestedCommunity } from '@/components/community/SuggestedCommunityCard';
import { colors } from '../../../theme';
import { TopBar, useBanner } from '../../../components/ui';

export default function CommunityHomeScreen() {
  const { t } = useT('community');
  const router = useRouter();

  const communitiesQuery = useCommunities();
  const canCreateQuery = useCanCreateCommunity();
  const suggestedQuery = useSuggestedCommunities();
  const defaultQuery = useDefaultCommunity();
  const setDefault = useSetDefaultCommunity();
  const banner = useBanner();

  const canCreate = canCreateQuery.data !== false;

  const goCreate = () => router.push('/(tabs)/community/create');
  // Task 17 built the community page + join modal. `/community/[id]/posts` is the
  // first tab (the bare `/community/[id]` group route resolves at runtime but is
  // not in the typed-route table); `/community/[id]/join` is now fully typed.
  const goCommunity = (id: string) => router.push(`/community/${id}/posts`);
  const goJoin = (id: string) => router.push(`/community/${id}/join`);

  const onSetDefault = (community: CommunityRow) => {
    void (async () => {
      try {
        await setDefault.mutateAsync(community.id);
        banner.show(t('defaultSetToast', { name: community.name }), 'success');
      } catch {
        banner.show(t('unknown_error'));
      }
    })();
  };

  if (communitiesQuery.isLoading) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <TopBar variant="top" title={t('title')} />
        <View style={styles.center}>
          <ActivityIndicator color={colors.foreground} />
        </View>
      </SafeAreaView>
    );
  }

  const rows = communitiesQuery.data ?? [];
  const memberships: Membership[] = rows
    .filter((r): r is { role: string; community: CommunityRow } => r.community != null)
    .map((r) => ({ role: r.role, community: r.community }));

  const content =
    memberships.length === 0 ? (
      <EmptyState
        suggested={(suggestedQuery.data ?? []) as SuggestedCommunity[]}
        canCreate={canCreate}
        onPressSuggested={goJoin}
        onCreate={goCreate}
      />
    ) : (
      <CommunitySwitcher
        memberships={memberships}
        defaultCommunityId={defaultQuery.data?.community_id ?? null}
        canCreate={canCreate}
        onOpen={goCommunity}
        onSetDefault={onSetDefault}
        onNewCommunity={goCreate}
      />
    );

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <TopBar variant="top" title={t('title')} />
      {content}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.card },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
});
