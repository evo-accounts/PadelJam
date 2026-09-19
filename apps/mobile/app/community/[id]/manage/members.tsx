/**
 * Manage Members — the Members tab's roster under a TopBar (UX-COMM-19).
 *
 * The two used to be separate screens that disagreed: this one had the member
 * actions but no search, no invite entry and no requests entry; the tab had all
 * three and no actions. They are one component now, so the requests entry here
 * also picks up UX-COMM-19's non-stranding rule, which is what the plan meant by
 * "the manage screen still has the old condition".
 *
 * Reached from the admin menu (UX-COMM-15). Everyone arriving is an admin in
 * practice, but the list decides what a row offers from the viewer's own role
 * rather than from the route, so a stale deep link cannot hand out actions.
 */
import { useT } from '@padel/i18n';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { MembersList } from '@/components/community/MembersList';
import { TopBar } from '../../../../components/ui';
import { colors } from '../../../../theme';

export default function ManageMembersScreen() {
  const { t } = useT('community');
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <TopBar title={t('manageMembers')} onBack={() => router.back()} backLabel={t('back')} />
      <MembersList communityId={id} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.card },
});
