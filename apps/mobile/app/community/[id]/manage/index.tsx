/**
 * Community plan.
 *
 * This screen used to be the administration hub: rows into settings, permissions,
 * members, requests and invite, plus archive and leave. UX-COMM-15 moved all of
 * that into the sheet the header's "⚙" opens (`lib/useCommunityMenu.ts`), which
 * leaves the plan — the one piece of administration that is a block of content
 * rather than a way somewhere else.
 *
 * The route keeps its path because `UpgradePrompt` deep-links to
 * `/community/[id]/manage?section=plan` from across the app. That `section` param
 * is now redundant, since there is only one section to scroll to; it is ignored
 * rather than removed so the existing links keep resolving.
 */
import { useCommunityMembers } from '@padel/api';
import { useSession } from '@padel/auth';
import { useT } from '@padel/i18n';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { ScrollView, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { PlanSection } from '../../../../components/community/PlanSection';
import { TopBar } from '../../../../components/ui';
import { colors, space } from '../../../../theme';

type Member = { user_id: string; role: string };

export default function ManagePlanScreen() {
  const { t } = useT('community');
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const uid = useSession().session?.user.id;

  const { data: members } = useCommunityMembers(id);
  const isAdmin = (members as Member[] | undefined)?.find((m) => m.user_id === uid)?.role === 'admin';

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <TopBar title={t('managePlan')} onBack={() => router.back()} backLabel={t('back')} />
      <ScrollView contentContainerStyle={styles.inner}>
        {isAdmin ? <PlanSection communityId={id} /> : null}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  inner: { padding: space[4] },
});
