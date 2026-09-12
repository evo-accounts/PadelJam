import { useT } from '@padel/i18n';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StyleSheet } from 'react-native';

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
    <SafeAreaView style={styles.container} edges={['top']}>
      <TopBar variant="nav" title={t(titleKey)} onBack={() => router.back()} />
      <ExploreList kind={kind} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
});
