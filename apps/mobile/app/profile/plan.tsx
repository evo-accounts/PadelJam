import { PLANS_VISIBLE } from '@padel/features';
import { Redirect, useRouter } from 'expo-router';
import { StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { JammerPlusPaywall } from '../../components/profile/JammerPlusPaywall';
import { colors } from '../../theme';

/** Plans are hidden for the free launch: a deep link lands back on Settings. */
export default function PlanRoute() {
  if (!PLANS_VISIBLE) return <Redirect href="/profile/settings" />;
  return <PlanScreen />;
}

function PlanScreen() {
  const router = useRouter();

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <JammerPlusPaywall mode="settings" onBack={() => router.back()} onDone={() => router.back()} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
});
