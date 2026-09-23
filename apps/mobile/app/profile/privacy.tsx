/**
 * Privacy (UX-SET-05).
 *
 * Two rows that had no home. Change password sat loose under "Conta", beside the email and the
 * account deletion, and blocked-user management did not exist anywhere in the app at all — you
 * could block someone from their profile and then never see or undo it.
 */
import { useAuthProviders } from '@padel/api';
import { useT } from '@padel/i18n';
import { SymbolView } from 'expo-symbols';
import { useRouter } from 'expo-router';
import { StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { colors, space } from '../../theme';
import { ListRow, Screen, TopBar } from '../../components/ui';

const icon = (ios: string, android: string) => (
  <SymbolView
    name={{ ios, android, web: android } as never}
    size={22}
    tintColor={colors.foreground}
    accessibilityElementsHidden
    importantForAccessibility="no"
  />
);

export default function PrivacyScreen() {
  const { t } = useT('profile');
  const router = useRouter();
  const authProviders = useAuthProviders();

  // The password row names the screen it opens — "Create password" for an account that has never
  // had one. Hidden while the query is in flight rather than guessed, because guessing wrong puts
  // a current-password box in front of someone who cannot fill it.
  const hasPassword = authProviders.data?.has_password ?? true;

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <TopBar variant="nav" title={t('privacyTitle')} onBack={() => router.back()} />
      <Screen scroll padded={false} style={styles.content}>
        {!authProviders.isLoading && (
          <ListRow
            variant="card"
            leading={icon('lock', 'lock')}
            title={hasPassword ? t('changePassword') : t('createPassword')}
            subtitle={t('privacyPasswordDescription')}
            onPress={() => router.push('/profile/change-password')}
            testID="settings-password-row"
          />
        )}
        <ListRow
          variant="card"
          leading={icon('hand.raised', 'block')}
          title={t('blockedTitle')}
          subtitle={t('blockedDescription')}
          onPress={() => router.push('/profile/blocked')}
          testID="privacy-blocked-row"
        />
      </Screen>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { padding: space[4], gap: space[2] },
});
