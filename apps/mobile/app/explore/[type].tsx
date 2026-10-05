import { useT } from '@padel/i18n';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StyleSheet } from 'react-native';

import { ExploreActionsProvider } from '@/components/explore/ExploreActions';
import { ExploreList, type ExploreKind } from '@/components/explore/ExploreList';
import { colors } from '../../theme';
import { TopBar } from '../../components/ui';

export default function ExploreSeeAllScreen() {
  const { type } = useLocalSearchParams<{ type: string }>();
  const kind = (['players', 'events', 'communities', 'groups'].includes(type ?? '')
    ? type
    : 'communities') as ExploreKind;
  const { t } = useT('discovery');
  const router = useRouter();

  const titleKey = {
    players: 'seeAllTitlePlayers',
    events: 'seeAllTitleEvents',
    communities: 'seeAllTitleCommunities',
    groups: 'seeAllTitleGroups',
  }[kind] as 'seeAllTitlePlayers' | 'seeAllTitleEvents' | 'seeAllTitleCommunities' | 'seeAllTitleGroups';

  return (
    // The provider holds what each card's Follow / Join resolved to (UX-EXPL-03's inline actions).
    <ExploreActionsProvider>
      <SafeAreaView style={styles.container} edges={['top']}>
        <TopBar variant="nav" title={t(titleKey)} onBack={() => router.back()} />
        <ExploreList kind={kind} />
      </SafeAreaView>
    </ExploreActionsProvider>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
});
