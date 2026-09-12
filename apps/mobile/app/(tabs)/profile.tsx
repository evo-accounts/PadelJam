import { useSession } from '@padel/auth';
import { useT } from '@padel/i18n';
import { ScrollView, Text } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ProfileView } from '@/components/profile/ProfileView';
import { colors } from '../../theme';
import { TopBar } from '../../components/ui';

export default function ProfileTab() {
  const { t } = useT('profile');
  const uid = useSession().session?.user.id;
  if (!uid) return <Text style={{ textAlign: 'center', marginTop: 48, color: colors.mutedForeground }}>—</Text>;
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }} edges={['top']}>
      <TopBar variant="top" title={t('title')} />
      <ScrollView style={{ flex: 1, backgroundColor: colors.background }}>
        <ProfileView userId={uid} isSelf />
      </ScrollView>
    </SafeAreaView>
  );
}
