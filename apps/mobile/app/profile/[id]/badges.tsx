/**
 * The full badge catalogue for one player (UX-PROF-01's third stat).
 *
 * Earned first, then the closest to unlocking — `sortBadges` does the ordering, because "what did
 * I get" and "what is nearly mine" are the two questions this screen answers and neither is served
 * by catalogue order.
 *
 * Locked badges show their progress ("12 / 25"). That is the whole reason the RPC returns counters
 * rather than verdicts: a verdict can only say no, while a number can say how far.
 */
import { usePlayerBadgeFacts } from '@padel/api';
import { evaluateBadges, sortBadges, type BadgeFacts } from '@padel/utils';
import { useT } from '@padel/i18n';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { BadgeMedal } from '@/components/profile/BadgeMedal';
import { colors, space } from '../../../theme';
import { EmptyState, Loading, Screen, Text, TopBar } from '../../../components/ui';

export default function BadgesScreen() {
  const { t } = useT('profile');
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const userId = id ?? '';
  const q = usePlayerBadgeFacts(userId);

  const body = () => {
    if (q.isLoading) return <Loading testID="badges-screen-loading" />;
    if (q.isError || !q.data) {
      return (
        <EmptyState
          fill
          tone="error"
          title={t('loadError')}
          action={{ label: t('retry', { ns: 'common' }), onPress: () => void q.refetch() }}
          testID="badges-error"
        />
      );
    }

    const states = sortBadges(evaluateBadges(q.data as BadgeFacts));
    const earned = states.filter((s) => s.unlocked).length;

    return (
      <Screen scroll padded={false} style={styles.content}>
        <Text variant="body" tone="muted">
          {t('badgesEarnedOf', { earned, total: states.length })}
        </Text>
        <View style={styles.grid}>
          {states.map((s) => (
            <BadgeMedal key={s.id} state={s} showProgress testID={`badge-${s.id}`} />
          ))}
        </View>
      </Screen>
    );
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <TopBar variant="nav" title={t('badgesTitle')} onBack={() => router.back()} />
      {body()}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { padding: space[4], gap: space[4] },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: space[4] },
});
