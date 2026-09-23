import { useSession } from '@padel/auth';
import { useT } from '@padel/i18n';
import { SymbolView } from 'expo-symbols';
import { useRouter } from 'expo-router';
import { ScrollView, Text } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ProfileView } from '@/components/profile/ProfileView';
import { colors } from '../../theme';
import { TopBar } from '../../components/ui';

export default function ProfileTab() {
  const { t } = useT('profile');
  const router = useRouter();
  const uid = useSession().session?.user.id;
  if (!uid) return <Text style={{ textAlign: 'center', marginTop: 48, color: colors.mutedForeground }}>—</Text>;
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }} edges={['top']}>
      <TopBar
        variant="top"
        title={t('title')}
        actions={[
          {
            // UX-PROF-06 puts the settings icon in the header. That item is a later PR, but the
            // gear could not simply WAIT there: rebuilding the body for UX-PROF-01 removed the
            // inline one, and Settings is the only route to logging out. Moving it here now is
            // what keeps that route open.
            icon: (
              <SymbolView
                name={{ ios: 'gearshape', android: 'settings', web: 'settings' } as never}
                tintColor={colors.foreground}
                size={22}
              />
            ),
            // Exactly "Settings", and load-bearing: `e2e/driver/flows.ts` logs out by finding this
            // control by label, and `switchUser` puts it on the path of seven suites.
            label: t('settings'),
            onPress: () => router.push('/profile/settings'),
            testID: 'profile-settings',
          },
        ]}
      />
      <ScrollView style={{ flex: 1, backgroundColor: colors.background }}>
        <ProfileView userId={uid} isSelf />
      </ScrollView>
    </SafeAreaView>
  );
}
