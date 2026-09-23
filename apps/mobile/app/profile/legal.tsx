/**
 * Legal (UX-SET-13).
 *
 * Terms and the Privacy Policy were two loose rows at the bottom of Settings. They are the same
 * kind of thing — documents hosted on the website, opened outside the app — so they get a screen
 * that says so, with a line under each explaining what it is before the user leaves for it.
 *
 * `Linking.openURL`, NOT `expo-web-browser`. The audit says these open in "the device's default
 * browser"; `WebBrowser.openBrowserAsync` opens an in-app SFSafariViewController / Custom Tab,
 * which is a different thing and keeps the user inside the app. The distinction matters for a
 * legal document: it should be visibly the website's, addressable and shareable, not a modal the
 * app painted.
 *
 * The URLs come from `lib/externalUrls` rather than being spelled out again — this screen would
 * have been the fourth copy, and they have to match what the sign-up consent line promises.
 */
import { useT } from '@padel/i18n';
import { SymbolView } from 'expo-symbols';
import { useRouter } from 'expo-router';
import { Linking, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { PRIVACY_URL, TERMS_URL } from '@/lib/externalUrls';
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

export default function LegalScreen() {
  const { t } = useT('profile');
  const router = useRouter();

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <TopBar variant="nav" title={t('legal')} onBack={() => router.back()} />
      <Screen scroll padded={false} style={styles.content}>
        <ListRow
          variant="card"
          leading={icon('doc.text', 'description')}
          title={t('terms')}
          subtitle={t('termsDescription')}
          onPress={() => void Linking.openURL(TERMS_URL)}
          testID="legal-terms-row"
        />
        <ListRow
          variant="card"
          leading={icon('lock.shield', 'privacy_tip')}
          title={t('privacy')}
          subtitle={t('privacyPolicyDescription')}
          onPress={() => void Linking.openURL(PRIVACY_URL)}
          testID="legal-privacy-row"
        />
      </Screen>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { padding: space[4], gap: space[2] },
});
